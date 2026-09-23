/**
 * Month calendar of a student's attendance (Monday-first). Each class day is
 * tinted by its mark and shows the lettered chip(s) — a student in two
 * batches can have two classes on one day. Future days the student is
 * timetabled for get a dashed outline. Rendered as a real <table> so screen
 * readers get the week/day structure; each day carries a text description.
 */
import { useMemo } from 'react';
import { WEEKDAYS, type Batch, type ISODate } from '@/types/domain';
import { Card, IconButton } from '@/components/ui';
import { MARK_LABELS, attendanceRate } from '@/domain/attendance';
import { addDays, addMonths, formatDate, parseISODate, today, weekdayOf } from '@/lib/date';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { MARK_ORDER, MARK_TINT, MarkChip, MarkLegend } from './MarkChip';
import { countMarks, type SessionRow } from './useStudentProfile';

interface AttendanceCalendarProps {
  month: string; // YYYY-MM
  minMonth: string;
  maxMonth: string;
  onMonthChange: (month: string) => void;
  rows: SessionRow[];
  batches: Batch[];
  studentActive: boolean;
  countLate: boolean;
}

/** Weeks of the month as rows of 7 dates (null = padding outside the month). */
function buildWeeks(month: string): (ISODate | null)[][] {
  const first = `${month}-01`;
  const lead = (parseISODate(first).getDay() + 6) % 7; // Sunday=0 → Monday-first offset
  const cells: (ISODate | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

const monthTitle = (month: string) => parseISODate(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export function AttendanceCalendar({
  month,
  minMonth,
  maxMonth,
  onMonthChange,
  rows,
  batches,
  studentActive,
  countLate,
}: AttendanceCalendarProps) {
  const t = today();
  const weeks = useMemo(() => buildWeeks(month), [month]);
  const monthRows = useMemo(() => rows.filter((r) => r.session.date.startsWith(month)), [rows, month]);
  const byDate = useMemo(() => {
    const map = new Map<ISODate, SessionRow[]>();
    // rows arrive newest first; reverse so same-day classes read in time order
    for (const r of [...monthRows].reverse()) map.set(r.session.date, [...(map.get(r.session.date) ?? []), r]);
    return map;
  }, [monthRows]);
  const counts = useMemo(() => countMarks(monthRows), [monthRows]);

  const isScheduled = (date: ISODate) =>
    studentActive && date >= t && batches.some((b) => b.status === 'Active' && b.startDate <= date && b.days.includes(weekdayOf(date)));

  const prev = addMonths(`${month}-01`, -1).slice(0, 7);
  const next = addMonths(`${month}-01`, 1).slice(0, 7);

  return (
    <Card className="flex flex-col gap-space-md p-space-sm sm:p-space-md">
      <div className="flex flex-wrap items-center justify-between gap-space-xs">
        <div className="min-w-0">
          <h2 className="font-title-lg text-title-lg font-bold text-on-surface" aria-live="polite">
            {monthTitle(month)}
          </h2>
          <p className="font-body-sm text-body-sm text-secondary">
            {monthRows.length
              ? `${formatPercent(attendanceRate(counts, countLate))} attendance · ${MARK_ORDER.map((m) => `${counts[m]} ${m}`).join(' · ')}`
              : 'No classes recorded this month'}
          </p>
        </div>
        <div className="flex items-center gap-space-2xs">
          <IconButton icon="chevron_left" label="Previous month" disabled={prev < minMonth} onClick={() => onMonthChange(prev)} />
          <IconButton icon="chevron_right" label="Next month" disabled={next > maxMonth} onClick={() => onMonthChange(next)} />
        </div>
      </div>

      <table className="w-full table-fixed border-separate border-spacing-0">
        <caption className="sr-only">Attendance calendar for {monthTitle(month)}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th
                key={d}
                scope="col"
                abbr={d}
                className="pb-1 text-center font-label-sm text-label-sm uppercase tracking-wider text-secondary"
              >
                <span className="sm:hidden">{d[0]}</span>
                <span className="hidden sm:inline">{d}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((date, di) => {
                if (!date) return <td key={`pad-${di}`} className="p-0.5 sm:p-1" />;
                const marks = byDate.get(date) ?? [];
                const scheduled = !marks.length && isScheduled(date);
                const description = marks.length
                  ? marks.map((m) => `${MARK_LABELS[m.mark]}${m.batch ? ` in ${m.batch.name}` : ''}`).join(', ')
                  : scheduled
                    ? 'Class scheduled'
                    : 'No class';
                return (
                  <td key={date} className="p-0.5 align-top sm:p-1">
                    <div
                      title={`${formatDate(date)} · ${description}`}
                      className={cn(
                        'flex h-12 flex-col justify-between rounded-lg p-1 sm:h-16 sm:p-1.5',
                        marks.length === 1 && MARK_TINT[marks[0].mark],
                        marks.length > 1 && 'bg-surface-container-low',
                        scheduled && 'border border-dashed border-outline',
                        date === t && 'ring-2 ring-primary',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'font-label-sm text-label-sm tnum',
                          date === t ? 'text-primary' : marks.length ? 'text-on-surface' : 'text-secondary',
                          date > t && !scheduled && 'opacity-60',
                        )}
                      >
                        {Number(date.slice(8))}
                      </span>
                      <span className="sr-only">
                        {formatDate(date)}: {description}
                      </span>
                      {marks.length > 0 && (
                        <span className="flex justify-end gap-0.5">
                          {marks.map((m) => (
                            <MarkChip key={m.session.id} mark={m.mark} size="xs" decorative />
                          ))}
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-2xs">
        <MarkLegend />
        <span className="inline-flex items-center gap-space-2xs font-label-sm text-label-sm text-secondary">
          <span className="h-4 w-4 rounded border border-dashed border-outline sm:h-5 sm:w-5" aria-hidden />
          Scheduled
        </span>
        <span className="inline-flex items-center gap-space-2xs font-label-sm text-label-sm text-secondary">
          <span className="h-4 w-4 rounded ring-2 ring-inset ring-primary sm:h-5 sm:w-5" aria-hidden />
          Today
        </span>
      </div>
    </Card>
  );
}
