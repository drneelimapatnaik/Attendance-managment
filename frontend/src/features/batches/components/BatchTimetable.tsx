/**
 * Weekly timetable of batches.
 *
 * md+ : Mon–Sun grid; each batch is a block placed by weekday and start time,
 *       height = duration. Overlapping classes sit side by side (see
 *       packBlocks). Blocks are neutral — one brand accent, no per-subject
 *       colours — and show code, time and room.
 * < md: a day selector (defaults to today) + that day's classes as a list.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Batch, Weekday } from '@/types/domain';
import { WEEKDAYS } from '@/types/domain';
import { EmptyState, Icon, SegmentedControl } from '@/components/ui';
import { useLookups } from '@/hooks/useTenant';
import { formatTime, formatTimeRange, minutesOf, nowTime, today, weekdayOf } from '@/lib/date';
import { cn } from '@/lib/cn';
import { packBlocks } from '../schedule';
import { BatchStatusBadge } from './BatchStatusBadge';

const HOUR_PX = 60; // vertical scale of the desktop grid

/** 9 → "9 AM", 13 → "1 PM" */
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;

interface BatchTimetableProps {
  batches: Batch[];
}

export function BatchTimetable({ batches }: BatchTimetableProps) {
  const todayDay = weekdayOf(today());
  const [day, setDay] = useState<Weekday>(todayDay);

  // Visible hour range: from the earliest start to the latest end (min 6 h).
  const { fromHour, toHour } = useMemo(() => {
    if (!batches.length) return { fromHour: 9, toHour: 18 };
    const from = Math.floor(Math.min(...batches.map((b) => minutesOf(b.startTime))) / 60);
    const to = Math.ceil(Math.max(...batches.map((b) => minutesOf(b.endTime))) / 60);
    return { fromHour: from, toHour: Math.max(to, from + 6) };
  }, [batches]);

  const byDay = useMemo(() => {
    const map = new Map<Weekday, Batch[]>(WEEKDAYS.map((d) => [d, []]));
    for (const b of batches) for (const d of b.days) map.get(d)?.push(b);
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [batches]);

  return (
    <>
      <div className="card hidden overflow-hidden md:block">
        <WeekGrid byDay={byDay} fromHour={fromHour} toHour={toHour} todayDay={todayDay} />
      </div>
      <div className="flex flex-col gap-space-sm md:hidden">
        <div className="card p-space-xs">
          <SegmentedControl<Weekday>
            ariaLabel="Day of week"
            size="sm"
            value={day}
            onChange={setDay}
            className="flex w-full [&>button]:flex-1"
            segments={WEEKDAYS.map((d) => ({
              value: d,
              label: (
                <span className="flex flex-col items-center leading-none">
                  {d}
                  {/* Dot marks days that have classes */}
                  <span className={cn('mt-0.5 h-1 w-1 rounded-full', byDay.get(d)?.length ? 'bg-primary' : 'bg-transparent')} />
                </span>
              ),
              ariaLabel: `${d}${d === todayDay ? ' (today)' : ''}, ${byDay.get(d)?.length ?? 0} classes`,
            }))}
          />
        </div>
        <DayList batches={byDay.get(day) ?? []} day={day} isToday={day === todayDay} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------ Desktop grid */

function WeekGrid({
  byDay,
  fromHour,
  toHour,
  todayDay,
}: {
  byDay: Map<Weekday, Batch[]>;
  fromHour: number;
  toHour: number;
  todayDay: Weekday;
}) {
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);
  const height = (toHour - fromHour) * HOUR_PX;
  const y = (t: string) => ((minutesOf(t) - fromHour * 60) / 60) * HOUR_PX;
  const now = nowTime();
  const nowY = y(now);
  const showNow = nowY >= 0 && nowY <= height;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] pb-space-sm">
        {/* Header row */}
        <div className="border-b border-surface-container-low bg-surface-container-low" />
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className={cn(
              'flex items-center justify-center gap-1 border-b border-l border-surface-container-low bg-surface-container-low py-space-xs font-label-sm text-label-sm uppercase tracking-wider',
              d === todayDay ? 'text-primary' : 'text-on-surface-variant',
            )}
          >
            {d}
            {d === todayDay && (
              <span className="rounded-full bg-primary px-1.5 py-px font-label-sm text-label-sm normal-case tracking-normal text-on-primary">
                Today
              </span>
            )}
            <span className="font-body-sm text-body-sm normal-case text-secondary tnum">· {byDay.get(d)?.length ?? 0}</span>
          </div>
        ))}

        {/* Hour gutter */}
        <div className="relative" style={{ height }}>
          {hours.map((h) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 font-body-sm text-body-sm text-secondary tnum first:translate-y-0"
              style={{ top: (h - fromHour) * HOUR_PX }}
            >
              {hourLabel(h)}
            </span>
          ))}
        </div>

        {/* Day columns */}
        {WEEKDAYS.map((d) => {
          const placed = packBlocks(
            byDay.get(d) ?? [],
            (b) => minutesOf(b.startTime),
            (b) => minutesOf(b.endTime),
          );
          return (
            <div
              key={d}
              className={cn('relative border-l border-surface-container-low', d === todayDay && 'bg-primary-fixed/20')}
              style={{ height }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-surface-container-low"
                  style={{ top: (h - fromHour) * HOUR_PX }}
                  aria-hidden
                />
              ))}
              {d === todayDay && showNow && (
                <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: nowY }} aria-hidden>
                  <span className="-ml-1 h-2 w-2 rounded-full bg-primary" />
                  <span className="h-0.5 flex-1 bg-primary" />
                </div>
              )}
              {placed.map(({ item: b, lane, lanes }) => {
                const top = y(b.startTime);
                const h = Math.max(28, y(b.endTime) - top);
                return (
                  <Link
                    key={b.id}
                    to={`/batches/${b.id}`}
                    title={`${b.name} · ${b.title}\n${formatTimeRange(b.startTime, b.endTime)} · ${b.room}`}
                    className={cn(
                      'absolute flex flex-col overflow-hidden rounded-md border-l-[3px] border-primary bg-surface-container-high px-1.5 py-1 text-left transition-colors hover:bg-surface-container-highest focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                      b.status === 'Upcoming' && 'border-dashed',
                      b.status === 'Archived' && 'opacity-60',
                    )}
                    style={{
                      top: top + 1,
                      height: h - 2,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                  >
                    <span className="truncate font-label-md text-label-md text-on-surface">{b.code}</span>
                    {/* 3+ side-by-side blocks are too narrow for more than the code; the tooltip has the rest. */}
                    {lanes < 3 && (
                      <>
                        <span className="truncate font-body-sm text-body-sm text-on-surface-variant tnum">
                          {formatTime(b.startTime)}
                          {lanes === 1 && ` – ${formatTime(b.endTime)}`}
                        </span>
                        <span className="truncate font-body-sm text-body-sm text-secondary">{b.room}</span>
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Phone list */

function DayList({ batches, day, isToday }: { batches: Batch[]; day: Weekday; isToday: boolean }) {
  const { staff } = useLookups();
  if (!batches.length) {
    return (
      <div className="card">
        <EmptyState compact icon="event_available" title={`No classes on ${day}`} description="Pick another day to see its timetable." />
      </div>
    );
  }
  return (
    <ul className="card divide-y divide-surface-container-low" aria-label={`Classes on ${day}${isToday ? ' (today)' : ''}`}>
      {batches.map((b) => (
        <li key={b.id}>
          <Link to={`/batches/${b.id}`} className="flex items-stretch gap-space-sm p-space-md active:bg-surface-container-low">
            <div className="flex w-20 shrink-0 flex-col whitespace-nowrap border-r-[3px] border-primary pr-space-xs">
              <span className="font-label-md text-label-md text-on-surface tnum">{formatTime(b.startTime)}</span>
              <span className="font-body-sm text-body-sm text-secondary tnum">{formatTime(b.endTime)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-space-xs">
                <span className="font-title-md text-title-md text-on-surface">{b.name}</span>
                {b.status !== 'Active' && <BatchStatusBadge status={b.status} />}
              </div>
              <p className="truncate font-body-sm text-body-sm text-secondary">{b.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-space-sm gap-y-0.5 font-body-sm text-body-sm text-on-surface-variant">
                <span className="inline-flex items-center gap-1">
                  <Icon name="meeting_room" size={14} className="text-primary" />
                  {b.room}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icon name="school" size={14} className="text-primary" />
                  {staff.get(b.facultyId)?.name ?? 'Unassigned'}
                </span>
              </p>
            </div>
            <Icon name="chevron_right" className="self-center text-secondary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
