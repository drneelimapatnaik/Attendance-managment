/**
 * "Today's schedule": every class on today's timetable (campus-scoped) with
 * time, batch, faculty, room, a live status chip and the next action —
 * Mark (opens the roll call) or View. Faculty see their own classes first.
 */
import type { ReactNode } from 'react';
import { ButtonLink, Card, CardHeader, EmptyState, Tag } from '@/components/ui';
import { useCan, useCurrentUser, useLookups } from '@/hooks/useTenant';
import { countRecords } from '@/domain/attendance';
import { formatTime, minutesOf, nowTime } from '@/lib/date';
import { classStatus, type ClassEntry } from '@/features/attendance/classSchedule';
import { ClassStatusBadge } from '@/features/attendance/components/ClassStatusBadge';
import { cn } from '@/lib/cn';

interface TodayScheduleProps {
  entries: ClassEntry[];
  today: string;
  className?: string;
}

export function TodaySchedule({ entries, today, className }: TodayScheduleProps) {
  const can = useCan();
  const user = useCurrentUser();
  const { staff } = useLookups();
  const now = minutesOf(nowTime());
  const isFaculty = user?.role === 'faculty';
  const mine = (e: ClassEntry) => e.batch.facultyId === user?.id;
  // Stable sort keeps start-time order within "mine" and "others".
  const ordered = isFaculty ? [...entries].sort((a, b) => Number(mine(b)) - Number(mine(a))) : entries;
  const marked = entries.filter((e) => e.session).length;

  const action = (e: ClassEntry, status: ReturnType<typeof classStatus>): ReactNode => {
    const href = `/attendance?batch=${e.batch.id}&date=${today}`;
    if (can('attendance.mark')) {
      return status === 'marked' ? (
        <ButtonLink to={href} size="sm" variant="ghost" icon="visibility">
          View
        </ButtonLink>
      ) : (
        <ButtonLink to={href} size="sm" variant={status === 'upcoming' ? 'tonal' : 'primary'} icon="checklist">
          Mark
        </ButtonLink>
      );
    }
    return (
      <ButtonLink to={`/batches/${e.batch.id}`} size="sm" variant="ghost" icon="visibility">
        View
      </ButtonLink>
    );
  };

  return (
    <Card padded={false} className={cn('flex flex-col', className)}>
      <div className="p-space-md pb-space-sm">
        <CardHeader
          title="Today's schedule"
          icon="event_note"
          subtitle={entries.length ? `${entries.length} classes · ${marked} marked` : undefined}
          actions={
            can('attendance.mark') && entries.length ? (
              <ButtonLink to="/attendance" size="sm" variant="tonal" trailingIcon="arrow_forward">
                Roll call
              </ButtonLink>
            ) : undefined
          }
        />
      </div>
      {entries.length === 0 ? (
        <EmptyState compact icon="event_busy" title="No classes today" description="Nothing on the timetable for this campus today." />
      ) : (
        <ul className="divide-y divide-surface-container-low">
          {ordered.map((e) => {
            const status = classStatus(e, today, now);
            const c = e.session && countRecords(e.session.records);
            return (
              <li
                key={e.batch.id}
                className={cn(
                  'flex flex-col gap-space-xs px-space-md py-space-sm sm:flex-row sm:items-center sm:gap-space-md',
                  status === 'live' && 'bg-tertiary-fixed/30',
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-space-sm">
                  <div className="w-[4.5rem] shrink-0 tnum">
                    <p className="font-label-lg text-label-lg text-on-surface">{formatTime(e.batch.startTime)}</p>
                    <p className="font-body-sm text-body-sm text-secondary">{formatTime(e.batch.endTime)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-space-2xs">
                      <span className="shrink-0 font-title-md text-title-md text-on-surface">{e.batch.name}</span>
                      <span className="truncate font-body-sm text-body-sm text-secondary">{e.batch.title}</span>
                      {isFaculty && mine(e) && <Tag className="px-1.5 font-label-sm text-label-sm">Yours</Tag>}
                      {e.extra && <Tag className="px-1.5 font-label-sm text-label-sm">Extra</Tag>}
                    </p>
                    <p className="truncate font-body-sm text-body-sm text-secondary">
                      {staff.get(e.batch.facultyId)?.name ?? 'Unassigned'} · {e.batch.room}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-space-sm pl-[5.25rem] sm:justify-end sm:pl-0">
                  <div className="flex flex-col items-start gap-0.5 sm:items-end">
                    <ClassStatusBadge status={status} />
                    {c && (
                      <span className="font-label-md text-label-md text-on-surface-variant tnum">
                        {c.P} P · {c.L} L · {c.A} A
                      </span>
                    )}
                  </div>
                  {action(e, status)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
