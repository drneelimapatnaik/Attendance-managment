/**
 * Compact batch card from the roster design's "Active Batches Overview":
 * name + grade chip, title, enrolled / capacity with a meter, schedule,
 * faculty, room and a "Manage Batch" link. Reused on the dashboard.
 */
import { Link } from 'react-router-dom';
import type { Batch } from '@/types/domain';
import { Icon, ProgressBar } from '@/components/ui';
import { useLookups, useScopedData } from '@/hooks/useTenant';
import { occupancy } from '@/domain/academics';
import { formatTimeRange } from '@/lib/date';

export function BatchSummaryCard({ batch }: { batch: Batch }) {
  const { students } = useScopedData();
  const { staff } = useLookups();
  const { enrolled, ratio, isFull } = occupancy(batch, students);
  return (
    <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container-low p-space-sm transition-all hover:bg-surface-container">
      <div className="flex items-start justify-between gap-space-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-title-md text-title-md font-bold text-on-surface">{batch.name}</span>
            <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-label-sm text-label-sm font-semibold text-primary">
              {batch.grade}
            </span>
          </div>
          <span className="block truncate font-body-sm text-body-sm text-secondary">{batch.title}</span>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-headline-sm text-headline-sm font-bold text-on-surface tnum">{enrolled}</span>
          <span className="-mt-1 block font-body-sm text-body-sm text-secondary tnum">
            / {batch.capacity} {isFull ? 'Full' : 'Enrolled'}
          </span>
        </div>
      </div>
      <ProgressBar value={ratio} label={`${batch.name} occupancy`} />
      <div className="grid grid-cols-2 gap-y-1 pt-1 font-body-sm text-body-sm text-secondary">
        <div className="flex items-center gap-1.5">
          <Icon name="calendar_month" size={16} className="text-primary" />
          <span>{batch.days.join(', ')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="schedule" size={16} className="text-primary" />
          <span className="tnum">{formatTimeRange(batch.startTime, batch.endTime)}</span>
        </div>
        <div className="col-span-2 flex items-center gap-1.5">
          <Icon name="school" size={16} className="text-primary" />
          <span>
            Faculty: <strong className="text-on-surface">{staff.get(batch.facultyId)?.name ?? 'Unassigned'}</strong>
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2">
        <span className="font-label-sm text-label-sm text-secondary">Room: {batch.room}</span>
        <Link
          to={`/batches/${batch.id}`}
          className="flex items-center gap-0.5 font-label-md text-label-md font-semibold text-primary hover:text-primary-container"
        >
          Manage Batch
          <Icon name="arrow_forward" size={16} />
        </Link>
      </div>
    </div>
  );
}
