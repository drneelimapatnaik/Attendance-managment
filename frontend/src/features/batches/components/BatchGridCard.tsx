/**
 * Grid-view card: the shared BatchSummaryCard (seats, schedule, faculty,
 * room) plus a strip with subject, status, 30-day attendance and syllabus
 * progress.
 */
import { ProgressBar } from '@/components/ui';
import { AttendancePctBadge } from '@/components/domain';
import { useSettings } from '@/hooks/useTenant';
import { formatDate } from '@/lib/date';
import { formatPercent } from '@/lib/format';
import { BatchSummaryCard } from './BatchSummaryCard';
import { BatchStatusBadge } from './BatchStatusBadge';
import type { BatchRow } from '../useBatches';

export function BatchGridCard({ row }: { row: BatchRow }) {
  const threshold = useSettings().attendance.lowAttendanceThreshold;
  const { batch, subject, m } = row;
  return (
    <article className="card flex flex-col gap-space-xs p-space-xs" aria-label={`${batch.name} · ${batch.title}`}>
      <div className="flex items-center justify-between gap-space-xs px-space-xs pt-space-2xs">
        <span className="truncate font-label-sm text-label-sm uppercase tracking-wider text-secondary">{subject?.name ?? 'Subject'}</span>
        {batch.status !== 'Active' ? (
          <span className="flex items-center gap-space-2xs">
            {batch.status === 'Upcoming' && (
              <span className="hidden font-body-sm text-body-sm text-secondary sm:inline">Starts {formatDate(batch.startDate)}</span>
            )}
            <BatchStatusBadge status={batch.status} />
          </span>
        ) : null}
      </div>
      <BatchSummaryCard batch={batch} />
      <div className="grid grid-cols-2 gap-space-sm px-space-xs pb-space-xs pt-space-2xs">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Attendance · 30d</span>
          <span>
            <AttendancePctBadge ratio={m.attendance} threshold={threshold} />
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Syllabus</span>
            <span className="font-label-md text-label-md text-on-surface tnum">{formatPercent(m.coverage.ratio)}</span>
          </span>
          <ProgressBar value={m.coverage.ratio} label={`${batch.name} syllabus covered`} />
          <span className="truncate font-body-sm text-body-sm text-secondary tnum">
            {m.coverage.completed}/{m.coverage.total} topics
          </span>
        </div>
      </div>
    </article>
  );
}
