/**
 * Batch detail summary tiles: schedule, faculty, seats, monthly fee,
 * 30-day attendance and syllabus progress (with the current topic).
 * Phones: schedule + faculty full width, the four numbers in a 2×2 grid.
 */
import type { ReactNode } from 'react';
import type { Batch, Staff } from '@/types/domain';
import { Avatar, Icon, ProgressBar } from '@/components/ui';
import { useMoney, useSettings } from '@/hooks/useTenant';
import { formatTimeRange } from '@/lib/date';
import { formatPercent, pluralize, telHref } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ATTENDANCE_WINDOW_DAYS, type BatchMetrics } from '../batchMetrics';
import { formatDays, weeklyHours } from '../schedule';

interface TileProps {
  icon: string;
  label: string;
  children: ReactNode;
  className?: string;
}

function Tile({ icon, label, children, className }: TileProps) {
  return (
    <div className={cn('card flex min-w-0 flex-col gap-space-2xs p-space-md', className)}>
      <div className="flex items-center justify-between gap-space-xs">
        <span className="font-label-md text-label-md text-secondary">{label}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary">
          <Icon name={icon} size={18} />
        </span>
      </div>
      {children}
    </div>
  );
}

const VALUE = 'font-headline-sm text-headline-sm text-on-surface';
const META = 'font-body-sm text-body-sm text-secondary';

export function BatchOverviewTiles({ batch, faculty, metrics }: { batch: Batch; faculty?: Staff; metrics: BatchMetrics }) {
  const money = useMoney();
  const threshold = useSettings().attendance.lowAttendanceThreshold;
  const seatsLeft = Math.max(0, batch.capacity - metrics.enrolled);
  const attPct = Math.round(metrics.attendance * 100);
  const lowAttendance = Number.isFinite(metrics.attendance) && attPct < threshold;
  const { coverage } = metrics;

  return (
    <section aria-label="Batch summary" className="grid grid-cols-2 gap-space-sm md:gap-space-md lg:grid-cols-3 2xl:grid-cols-6">
      <Tile icon="calendar_month" label="Schedule" className="col-span-2 sm:col-span-1">
        <span className={VALUE}>{formatDays(batch.days) || 'No days set'}</span>
        <span className="font-body-md text-body-md text-on-surface-variant tnum">{formatTimeRange(batch.startTime, batch.endTime)}</span>
        <span className={cn(META, 'flex items-center gap-1')}>
          <Icon name="meeting_room" size={14} />
          {batch.room} · {weeklyHours(batch)} h/week
        </span>
      </Tile>

      <Tile icon="school" label="Faculty" className="col-span-2 sm:col-span-1">
        {faculty ? (
          <>
            <div className="flex min-w-0 items-center gap-space-xs">
              <Avatar name={faculty.name} src={faculty.avatarUrl} size="sm" />
              <span className="truncate font-title-md text-title-md text-on-surface">{faculty.name}</span>
            </div>
            <span className={cn(META, 'truncate')}>{faculty.title}</span>
            <a
              href={telHref(faculty.phone)}
              className="flex w-fit items-center gap-1 font-body-sm text-body-sm text-primary hover:underline"
            >
              <Icon name="call" size={14} />
              {faculty.phone}
            </a>
          </>
        ) : (
          <span className={cn(VALUE, 'text-secondary')}>Unassigned</span>
        )}
      </Tile>

      <Tile icon="event_seat" label="Seats">
        <span className={cn(VALUE, 'tnum')}>
          {metrics.enrolled}
          <span className="font-title-md text-title-md text-secondary"> / {batch.capacity}</span>
        </span>
        <ProgressBar value={metrics.ratio} label="Seats filled" className="my-1" />
        {metrics.isFull ? (
          <span className="flex items-center gap-1 font-label-md text-label-md text-on-warning-container">
            <Icon name="warning" size={14} />
            {metrics.enrolled > batch.capacity ? `Over capacity by ${metrics.enrolled - batch.capacity}` : 'Batch is full'}
          </span>
        ) : (
          <span className={META}>{pluralize(seatsLeft, 'seat')} left</span>
        )}
      </Tile>

      <Tile icon="payments" label="Monthly fee">
        <span className={cn(VALUE, 'tnum')}>{money.format(batch.monthlyFee)}</span>
        <span className={META}>per student, before concessions</span>
        <span className={cn(META, 'tnum')}>≈ {money.format(batch.monthlyFee * metrics.enrolled)} billed / month</span>
      </Tile>

      <Tile icon="how_to_reg" label={`Attendance · ${ATTENDANCE_WINDOW_DAYS} days`}>
        <span className={cn(VALUE, 'tnum')}>{formatPercent(metrics.attendance)}</span>
        {lowAttendance ? (
          <span className="flex items-center gap-1 font-label-md text-label-md text-error">
            <Icon name="trending_down" size={14} />
            Below the {threshold}% target
          </span>
        ) : (
          <span className={META}>Target {threshold}%</span>
        )}
        <span className={cn(META, 'tnum')}>{pluralize(metrics.sessionsInWindow, 'session')} held</span>
      </Tile>

      <Tile icon="menu_book" label="Syllabus">
        <span className={cn(VALUE, 'tnum')}>{formatPercent(coverage.ratio)}</span>
        <ProgressBar value={coverage.ratio} label="Syllabus completed" className="my-1" />
        <span className={cn(META, 'tnum')}>
          {coverage.completed} of {pluralize(coverage.total, 'topic')}
        </span>
        {coverage.current && (
          <span className={cn(META, 'truncate')} title={coverage.current.name}>
            Now: <strong className="font-semibold text-on-surface">{coverage.current.name}</strong>
          </span>
        )}
      </Tile>
    </section>
  );
}
