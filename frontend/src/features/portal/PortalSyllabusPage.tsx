/**
 * Student & parent app — Syllabus.
 *
 * Per batch: how much of the course is done, what is being taught right now,
 * and the full chapter-by-chapter topic list with the date each finished topic
 * was covered. The batch in view lives in the URL (`?batch=<id>`).
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CoverageStatus, ID, Topic } from '@/types/domain';
import { Badge, Card, EmptyState, Icon, PageHeader, ProgressBar, Tabs } from '@/components/ui';
import { CoverageBadge } from '@/components/domain';
import { useDocumentTitle } from '@/hooks/ui';
import { coverageProgress, syllabusFor } from '@/domain/academics';
import { formatDate } from '@/lib/date';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { usePortalScreen } from './usePortalDerived';
import { PortalArchivedNotice, PortalNoBatches, PortalNoStudent } from './components/PortalEmptyStates';

/** Topics of one chapter, in syllabus order, with the state of each. */
interface ChapterGroup {
  chapter: string;
  topics: { topic: Topic; status: CoverageStatus; completedOn?: string; startedOn?: string }[];
  completed: number;
}

export default function PortalSyllabusPage() {
  useDocumentTitle('Syllabus');
  const { student, batches, coverage, topics, voice, subjectOf, facultyOf } = usePortalScreen();
  const [params, setParams] = useSearchParams();

  const batchParam = params.get('batch');
  const active = batches.find((b) => b.id === batchParam) ?? batches[0];

  const selectBatch = (id: ID) => {
    const p = new URLSearchParams(params);
    p.set('batch', id);
    setParams(p, { replace: true });
  };

  const progress = useMemo(() => (active ? coverageProgress(active, topics, coverage) : undefined), [active, topics, coverage]);

  // Group the batch's syllabus by chapter, keeping the taught order intact.
  const chapters = useMemo<ChapterGroup[]>(() => {
    if (!active) return [];
    const byTopic = new Map(coverage.filter((c) => c.batchId === active.id).map((c) => [c.topicId, c]));
    const groups: ChapterGroup[] = [];
    for (const topic of syllabusFor(active, topics)) {
      const record = byTopic.get(topic.id);
      const status = record?.status ?? 'Not Started';
      let group = groups.find((g) => g.chapter === topic.chapter);
      if (!group) groups.push((group = { chapter: topic.chapter, topics: [], completed: 0 }));
      group.topics.push({ topic, status, completedOn: record?.completedOn, startedOn: record?.startedOn });
      if (status === 'Completed') group.completed++;
    }
    return groups;
  }, [active, coverage, topics]);

  if (!student) return <PortalNoStudent />;

  return (
    <div className="flex flex-col gap-space-md">
      <PageHeader
        eyebrow="Syllabus"
        title={voice.isParent ? `${voice.first}'s syllabus` : 'Your syllabus'}
        description="What has been taught so far, and what is still to come."
      />

      {student.status === 'Inactive' && <PortalArchivedNotice possessive={voice.possessive} />}

      {batches.length === 0 || !active || !progress ? (
        <PortalNoBatches subject={voice.subject} is={voice.is} />
      ) : (
        <>
          {/* A selector only makes sense with more than one batch. */}
          {batches.length > 1 && (
            <Tabs
              ariaLabel="Choose a subject"
              value={active.id}
              onChange={selectBatch}
              items={batches.map((b) => ({ value: b.id, label: subjectOf(b), icon: 'menu_book' }))}
            />
          )}

          {/* Progress ----------------------------------------------------- */}
          <Card className="flex flex-col gap-space-sm">
            <div className="flex items-start justify-between gap-space-sm">
              <div className="min-w-0">
                <h2 className="truncate font-title-lg text-title-lg font-bold text-on-surface">{subjectOf(active)}</h2>
                <p className="font-body-sm text-body-sm text-secondary">
                  {active.name} · {active.title} · {facultyOf(active.facultyId)}
                </p>
              </div>
              <Badge tone="primary">{formatPercent(progress.ratio)}</Badge>
            </div>

            <ProgressBar value={progress.ratio} size="md" label={`${subjectOf(active)} syllabus covered`} />
            <p className="font-body-md text-body-md text-secondary tnum">
              {progress.completed} of {progress.total} topics finished
              {progress.inProgress > 0 && ` · ${progress.inProgress} in progress`}
            </p>

            {progress.current ? (
              <div className="flex items-start gap-space-sm rounded-xl bg-primary-fixed p-space-sm text-on-primary-fixed">
                <Icon name="play_circle" className="mt-0.5" />
                <div className="min-w-0">
                  <p className="font-label-md text-label-md uppercase tracking-wider opacity-80">Currently studying</p>
                  <p className="font-title-md text-title-md">{progress.current.name}</p>
                  <p className="font-body-sm text-body-sm opacity-90">{progress.current.chapter}</p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-space-xs rounded-xl bg-success-container px-space-sm py-space-xs font-body-md text-body-md text-on-success-container">
                <Icon name="task_alt" size={18} />
                The whole syllabus for this batch is done.
              </p>
            )}
          </Card>

          {/* Chapters ----------------------------------------------------- */}
          {chapters.length === 0 ? (
            <Card>
              <EmptyState
                compact
                icon="menu_book"
                title="No topics listed yet"
                description="The institute has not published the topic list for this batch."
              />
            </Card>
          ) : (
            chapters.map((group) => (
              <Card key={group.chapter} className="flex flex-col gap-space-sm">
                <div className="flex items-baseline justify-between gap-space-xs">
                  <h3 className="min-w-0 font-title-md text-title-md text-on-surface">{group.chapter}</h3>
                  <span className="shrink-0 font-label-md text-label-md text-secondary tnum">
                    {group.completed}/{group.topics.length} done
                  </span>
                </div>
                <ul className="flex flex-col">
                  {group.topics.map(({ topic, status, completedOn, startedOn }) => (
                    <li
                      key={topic.id}
                      className="flex min-h-[56px] items-center gap-space-sm border-b border-outline-variant/30 py-space-xs last:border-0"
                    >
                      <Icon
                        name={status === 'Completed' ? 'check_circle' : status === 'In Progress' ? 'pending' : 'radio_button_unchecked'}
                        className={cn(
                          'shrink-0',
                          status === 'Completed' ? 'text-success' : status === 'In Progress' ? 'text-primary' : 'text-secondary',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('font-body-lg text-body-lg', status === 'Not Started' ? 'text-secondary' : 'text-on-surface')}>
                          {topic.name}
                        </p>
                        <p className="font-body-sm text-body-sm text-secondary">
                          {status === 'Completed' && completedOn
                            ? `Taught up to ${formatDate(completedOn)}`
                            : status === 'In Progress'
                              ? startedOn
                                ? `Started ${formatDate(startedOn)}`
                                : 'Being taught now'
                              : 'Still to come'}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <CoverageBadge status={status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}
