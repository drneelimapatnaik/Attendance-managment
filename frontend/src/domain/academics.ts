/**
 * Batches, syllabus coverage and assessment maths — pure functions.
 */
import type { Assessment, Batch, ID, Student, Topic, TopicCoverage } from '@/types/domain';

/* ---------------------------------------------------------------- Batches */

/** Students currently occupying a seat (Inactive students free their seat). */
export function enrolledIn(batch: Batch, students: Student[]): Student[] {
  return students.filter((s) => s.batchIds.includes(batch.id) && s.status !== 'Inactive');
}

export function occupancy(batch: Batch, students: Student[]): { enrolled: number; ratio: number; isFull: boolean } {
  const enrolled = enrolledIn(batch, students).length;
  return { enrolled, ratio: batch.capacity ? enrolled / batch.capacity : 0, isFull: enrolled >= batch.capacity };
}

/* ---------------------------------------------------------------- Syllabus */

export function syllabusFor(batch: Pick<Batch, 'subjectId' | 'grade'>, topics: Topic[]): Topic[] {
  return topics.filter((t) => t.subjectId === batch.subjectId && t.grade === batch.grade).sort((a, b) => a.order - b.order);
}

export interface CoverageProgress {
  total: number;
  completed: number;
  inProgress: number;
  ratio: number; // completed / total
  current?: Topic; // the topic in progress (or next up)
}

export function coverageProgress(batch: Batch, topics: Topic[], coverage: TopicCoverage[]): CoverageProgress {
  const syllabus = syllabusFor(batch, topics);
  const byTopic = new Map(coverage.filter((c) => c.batchId === batch.id).map((c) => [c.topicId, c]));
  let completed = 0;
  let inProgress = 0;
  let current: Topic | undefined;
  for (const t of syllabus) {
    const st = byTopic.get(t.id)?.status ?? 'Not Started';
    if (st === 'Completed') completed++;
    else if (st === 'In Progress') {
      inProgress++;
      current ??= t;
    }
  }
  current ??= syllabus.find((t) => (byTopic.get(t.id)?.status ?? 'Not Started') === 'Not Started');
  return { total: syllabus.length, completed, inProgress, ratio: syllabus.length ? completed / syllabus.length : 0, current };
}

/* -------------------------------------------------------------- Assessments */

export interface AssessmentStats {
  appeared: number;
  absent: number;
  average: number; // ratio 0–1 of maxMarks
  highest: number; // raw marks
  lowest: number;
  passRate: number; // share scoring ≥ passMark
}

export const PASS_MARK = 0.4;

export function assessmentStats(a: Assessment): AssessmentStats {
  const vals = Object.values(a.scores).filter((v): v is number => v != null);
  const absent = Object.values(a.scores).length - vals.length;
  if (!vals.length) return { appeared: 0, absent, average: NaN, highest: 0, lowest: 0, passRate: NaN };
  const sum = vals.reduce((x, y) => x + y, 0);
  return {
    appeared: vals.length,
    absent,
    average: sum / vals.length / a.maxMarks,
    highest: Math.max(...vals),
    lowest: Math.min(...vals),
    passRate: vals.filter((v) => v / a.maxMarks >= PASS_MARK).length / vals.length,
  };
}

/** Average score ratio for one student across assessments (ignores absences). */
export function studentAverage(studentId: ID, assessments: Assessment[]): number {
  let sum = 0;
  let n = 0;
  for (const a of assessments) {
    const v = a.scores[studentId];
    if (v != null) {
      sum += v / a.maxMarks;
      n++;
    }
  }
  return n ? sum / n : NaN;
}

/** Per-student average score ratio across all given assessments, in one pass. */
export function buildScoreIndex(assessments: Assessment[]): Map<ID, { sum: number; n: number; avg: number }> {
  const index = new Map<ID, { sum: number; n: number; avg: number }>();
  for (const a of assessments) {
    for (const [sid, v] of Object.entries(a.scores)) {
      if (v == null) continue;
      const e = index.get(sid) ?? { sum: 0, n: 0, avg: 0 };
      e.sum += v / a.maxMarks;
      e.n++;
      e.avg = e.sum / e.n;
      index.set(sid, e);
    }
  }
  return index;
}

export type GradeBand = 'A+' | 'A' | 'B' | 'C' | 'D' | 'E';

export function gradeBand(ratio: number): GradeBand {
  if (ratio >= 0.9) return 'A+';
  if (ratio >= 0.75) return 'A';
  if (ratio >= 0.6) return 'B';
  if (ratio >= 0.5) return 'C';
  if (ratio >= PASS_MARK) return 'D';
  return 'E';
}
