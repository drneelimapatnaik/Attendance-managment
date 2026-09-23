/**
 * Syllabus coverage helpers shared by Topic Coverage and the batch detail
 * Syllabus tab — pure functions, no React:
 *  - a batch's syllabus grouped by chapter, with coverage + sessions taught
 *  - pace: expected completion by today vs what has actually been completed
 */
import type { AttendanceSession, Batch, CoverageStatus, ID, InstituteSettings, ISODate, Topic, TopicCoverage } from '@/types/domain';
import { syllabusFor, type CoverageProgress } from '@/domain/academics';
import { addMonths, diffDays, today } from '@/lib/date';

/** The teaching year is planned as 10 months from the academic-year start. */
export const TEACHING_MONTHS = 10;

export interface ChapterGroup<T> {
  chapter: string;
  items: T[];
}

/** Group already-ordered items by chapter, keeping chapters in first-seen order. */
export function groupByChapter<T>(items: T[], topicOf: (item: T) => Topic): ChapterGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = topicOf(item).chapter;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups].map(([chapter, list]) => ({ chapter, items: list }));
}

export interface TopicCoverageRow {
  topic: Topic;
  status: CoverageStatus;
  hoursSpent: number;
  startedOn?: ISODate;
  completedOn?: ISODate;
  sessions: number; // sessions of this batch whose topicIds include the topic
}

export function batchSyllabus(
  batch: Batch,
  topics: Topic[],
  coverage: TopicCoverage[],
  sessions: AttendanceSession[],
): ChapterGroup<TopicCoverageRow>[] {
  const byTopic = new Map<ID, TopicCoverage>();
  for (const c of coverage) if (c.batchId === batch.id) byTopic.set(c.topicId, c);
  const taught = new Map<ID, number>();
  for (const s of sessions) {
    if (s.batchId !== batch.id) continue;
    for (const t of s.topicIds) taught.set(t, (taught.get(t) ?? 0) + 1);
  }
  const rows = syllabusFor(batch, topics).map<TopicCoverageRow>((topic) => {
    const c = byTopic.get(topic.id);
    return {
      topic,
      status: c?.status ?? 'Not Started',
      hoursSpent: c?.hoursSpent ?? 0,
      startedOn: c?.startedOn,
      completedOn: c?.completedOn,
      sessions: taught.get(topic.id) ?? 0,
    };
  });
  return groupByChapter(rows, (r) => r.topic);
}

export interface Pace {
  state: 'not-started' | 'on-track' | 'behind';
  expectedRatio: number; // share of the syllabus that should be done by `on`
  expectedTopics: number;
  behindBy: number; // topics (0 when on track or ahead)
}

/**
 * Expected completion = elapsed share of the teaching year. The window runs
 * from the later of the academic-year start and the batch's own start date
 * (late-starting batches aren't penalised) to academic-year start + 10 months.
 */
export function paceFor(
  batch: Pick<Batch, 'startDate'>,
  progress: Pick<CoverageProgress, 'total' | 'completed'>,
  settings: Pick<InstituteSettings, 'academicYearStart'>,
  on: ISODate = today(),
): Pace {
  const end = addMonths(settings.academicYearStart, TEACHING_MONTHS);
  const start = batch.startDate > settings.academicYearStart ? batch.startDate : settings.academicYearStart;
  if (on < start) return { state: 'not-started', expectedRatio: 0, expectedTopics: 0, behindBy: 0 };
  const span = Math.max(1, diffDays(start, end));
  const expectedRatio = Math.min(1, Math.max(0, diffDays(start, on) / span));
  const expectedTopics = Math.floor(expectedRatio * progress.total);
  const behindBy = Math.max(0, expectedTopics - progress.completed);
  return { state: behindBy > 0 ? 'behind' : 'on-track', expectedRatio, expectedTopics, behindBy };
}
