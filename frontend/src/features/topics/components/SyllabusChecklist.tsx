/**
 * A batch's syllabus grouped by chapter, one row per topic: name, planned vs
 * spent hours, sessions taught, started/completed dates, CoverageBadge and —
 * for users with `topics.manage` — a Not Started / In Progress / Completed
 * control that writes through `setCoverage`.
 *
 * Used by Topic Coverage (Batch progress) and the batch detail Syllabus tab.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { Batch, CoverageStatus } from '@/types/domain';
import { ButtonLink, EmptyState, Icon, ProgressBar, SegmentedControl, type Segment } from '@/components/ui';
import { CoverageBadge } from '@/components/domain';
import { useLookups } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { formatDayMonth } from '@/lib/date';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { batchSyllabus, type TopicCoverageRow } from '../coverage';

interface SyllabusChecklistProps {
  batch: Batch;
  canManage: boolean;
  highlightTopicId?: string;
}

const STATUS_SEGMENTS: Segment<CoverageStatus>[] = (['Not Started', 'In Progress', 'Completed'] as const).map((value) => ({
  value,
  label: <span className="whitespace-nowrap">{value}</span>,
}));

/** Hours with at most one decimal: 4.5 → "4.5", 6 → "6". */
const hrs = (n: number) => `${Math.round(n * 10) / 10}h`;

export function SyllabusChecklist({ batch, canManage, highlightTopicId }: SyllabusChecklistProps) {
  const topics = useDataStore((s) => s.topics);
  const coverage = useDataStore((s) => s.coverage);
  const sessions = useDataStore((s) => s.sessions);
  const setCoverage = useDataStore((s) => s.setCoverage);
  const { subject } = useLookups();

  const chapters = useMemo(() => batchSyllabus(batch, topics, coverage, sessions), [batch, topics, coverage, sessions]);

  if (!chapters.length) {
    const sub = subject.get(batch.subjectId);
    return (
      <EmptyState
        compact
        icon="menu_book"
        title={`No syllabus for ${sub?.name ?? 'this subject'} · ${batch.grade} yet`}
        description="Add chapters and topics in the Syllabus master to start tracking coverage."
        action={
          canManage ? (
            <ButtonLink
              to={`/topics?view=master&subject=${batch.subjectId}&grade=${encodeURIComponent(batch.grade)}`}
              variant="tonal"
              icon="edit_note"
            >
              Open Syllabus master
            </ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-space-md">
      {chapters.map(({ chapter, items }) => {
        const done = items.filter((r) => r.status === 'Completed').length;
        const planned = items.reduce((s, r) => s + r.topic.plannedHours, 0);
        return (
          <section key={chapter} className="overflow-hidden rounded-xl border border-outline-variant/40" aria-label={chapter}>
            <header className="flex items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-sm">
              <div className="min-w-0">
                <h3 className="truncate font-title-md text-title-md text-on-surface">{chapter}</h3>
                <p className="font-body-sm text-body-sm text-secondary tnum">
                  {done}/{pluralize(items.length, 'topic')} completed · {hrs(planned)} planned
                </p>
              </div>
              <div className="w-20 shrink-0 sm:w-28">
                <ProgressBar value={items.length ? done / items.length : 0} label={`${chapter} completed`} />
              </div>
            </header>
            <ul className="divide-y divide-surface-container-low">
              {items.map((row) => (
                <TopicRow
                  key={row.topic.id}
                  row={row}
                  canManage={canManage}
                  highlighted={row.topic.id === highlightTopicId}
                  onChange={(status) => status !== row.status && setCoverage(batch.id, row.topic.id, status)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TopicRow({
  row,
  canManage,
  highlighted,
  onChange,
}: {
  row: TopicCoverageRow;
  canManage: boolean;
  highlighted: boolean;
  onChange: (status: CoverageStatus) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  const { topic, status } = row;
  const over = row.hoursSpent > topic.plannedHours;
  return (
    <li
      ref={ref}
      className={cn(
        'flex flex-col gap-space-xs px-space-md py-space-sm lg:flex-row lg:items-center lg:justify-between lg:gap-space-md',
        highlighted && 'bg-primary-fixed/40 ring-2 ring-inset ring-primary',
      )}
    >
      <div className="flex min-w-0 items-start gap-space-sm">
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-label-md text-label-md tnum',
            status === 'Completed' ? 'bg-success-container text-on-success-container' : 'bg-surface-container text-on-surface-variant',
          )}
          aria-hidden
        >
          {status === 'Completed' ? <Icon name="check" size={16} /> : topic.order}
        </span>
        <div className="min-w-0">
          <p className="font-label-lg text-label-lg text-on-surface">{topic.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-space-sm gap-y-0.5 font-body-sm text-body-sm text-secondary tnum">
            <span className="inline-flex items-center gap-1">
              <Icon name="schedule" size={14} />
              {hrs(row.hoursSpent)} of {hrs(topic.plannedHours)}
              {over && <span className="text-on-warning-container">(+{hrs(row.hoursSpent - topic.plannedHours)} over plan)</span>}
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon name="co_present" size={14} />
              {pluralize(row.sessions, 'session')}
            </span>
            {row.startedOn && <span>Started {formatDayMonth(row.startedOn)}</span>}
            {row.completedOn && <span>Completed {formatDayMonth(row.completedOn)}</span>}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-space-xs sm:pl-10 lg:pl-0">
        {/* With the control shown, the badge is redundant on narrow rows. */}
        <span className={cn(canManage && 'hidden sm:inline-flex')}>
          <CoverageBadge status={status} />
        </span>
        {canManage && (
          <SegmentedControl<CoverageStatus>
            ariaLabel={`Coverage status for ${topic.name}`}
            size="sm"
            value={status}
            onChange={onChange}
            segments={STATUS_SEGMENTS}
            className="w-full sm:w-auto [&>button]:flex-1"
          />
        )}
      </div>
    </li>
  );
}
