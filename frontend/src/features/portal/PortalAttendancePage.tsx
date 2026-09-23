/**
 * Student & parent app — Attendance.
 *
 * Answers the three questions a family actually asks: how am I doing overall,
 * which subject is slipping, and what happened on that particular day. The
 * month shown by the calendar lives in the URL (`?month=YYYY-MM`) so a link
 * to a month can be shared or bookmarked.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WEEKDAYS, type ISODate } from '@/types/domain';
import { Badge, Button, Card, CardHeader, EmptyState, Icon, IconButton, PageHeader, ProgressBar } from '@/components/ui';
import { AttendancePctBadge } from '@/components/domain';
import { useDocumentTitle } from '@/hooks/ui';
import { MARK_LABELS, attendanceRate } from '@/domain/attendance';
import { addDays, addMonths, formatDate, formatDayMonth, parseISODate, today, weekdayOf } from '@/lib/date';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { attendedOf, countRows, countedOf, usePortalScreen, type PortalClassRow } from './usePortalDerived';
import { MARK_ORDER, MARK_TINT, MarkChip, MarkLegend } from '@/components/domain';
import { PortalAttendanceStatus } from './components/PortalAttendanceStatus';
import { PortalArchivedNotice, PortalNoBatches, PortalNoStudent } from './components/PortalEmptyStates';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Weeks of a month as rows of 7 dates (null pads the days outside it). */
function buildWeeks(month: string): (ISODate | null)[][] {
  const first = `${month}-01`;
  const lead = (parseISODate(first).getDay() + 6) % 7; // Sunday = 0 → Monday-first offset
  const cells: (ISODate | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

const monthTitle = (month: string) => parseISODate(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export default function PortalAttendancePage() {
  useDocumentTitle('Attendance');
  const { student, batches, rows, topicById, voice, threshold, countLate, settings, subjectOf } = usePortalScreen();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<ISODate | null>(null);
  const [showAll, setShowAll] = useState(false);

  const t = today();
  const thisMonth = t.slice(0, 7);
  const monthParam = params.get('month');
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : thisMonth;

  const setMonth = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('month', next);
    setParams(p, { replace: true });
    setSelected(null);
  };

  /* Headline numbers ------------------------------------------------------ */
  const monthCounts = useMemo(() => countRows(rows.filter((r) => r.session.date.startsWith(thisMonth))), [rows, thisMonth]);
  const yearCounts = useMemo(
    () => countRows(rows.filter((r) => r.session.date >= settings.academicYearStart)),
    [rows, settings.academicYearStart],
  );
  const monthRate = attendanceRate(monthCounts, countLate);
  const yearRate = attendanceRate(yearCounts, countLate);

  /* Per batch ------------------------------------------------------------- */
  const perBatch = useMemo(
    () =>
      batches
        .map((batch) => {
          const counts = countRows(rows.filter((r) => r.session.batchId === batch.id));
          return { batch, counts, rate: attendanceRate(counts, countLate) };
        })
        .sort((a, b) => (Number.isFinite(a.rate) ? a.rate : 2) - (Number.isFinite(b.rate) ? b.rate : 2)),
    [batches, rows, countLate],
  );

  /* Calendar -------------------------------------------------------------- */
  const weeks = useMemo(() => buildWeeks(month), [month]);
  const byDate = useMemo(() => {
    const map = new Map<ISODate, PortalClassRow[]>();
    // `rows` is newest first; reverse so classes on one day read in time order.
    for (const r of [...rows].reverse()) {
      if (!r.session.date.startsWith(month)) continue;
      map.set(r.session.date, [...(map.get(r.session.date) ?? []), r]);
    }
    return map;
  }, [rows, month]);
  const calendarCounts = useMemo(() => countRows([...byDate.values()].flat()), [byDate]);

  // The calendar never runs past the current month, nor before the first class.
  const firstRecorded = rows.length ? rows[rows.length - 1].session.date.slice(0, 7) : thisMonth;
  const minMonth = firstRecorded < settings.academicYearStart.slice(0, 7) ? firstRecorded : settings.academicYearStart.slice(0, 7);
  const prevMonth = addMonths(`${month}-01`, -1).slice(0, 7);
  const nextMonth = addMonths(`${month}-01`, 1).slice(0, 7);

  /** A future date the student is timetabled for gets a dashed outline. */
  const isScheduled = (date: ISODate) =>
    student?.status !== 'Inactive' &&
    date >= t &&
    batches.some((b) => b.status === 'Active' && b.startDate <= date && b.days.includes(weekdayOf(date)));

  const selectedRows = selected ? (byDate.get(selected) ?? []) : [];

  /* Recent classes -------------------------------------------------------- */
  const visibleRows = showAll ? rows.slice(0, 60) : rows.slice(0, 12);

  if (!student) return <PortalNoStudent />;

  return (
    <div className="flex flex-col gap-space-md">
      <PageHeader eyebrow="Attendance" title={voice.isParent ? `${voice.first}'s attendance` : 'Your attendance'} />

      {student.status === 'Inactive' && <PortalArchivedNotice possessive={voice.possessive} />}

      {batches.length === 0 ? (
        <PortalNoBatches subject={voice.subject} is={voice.is} />
      ) : (
        <>
          {/* Headline ----------------------------------------------------- */}
          <Card className="flex flex-col gap-space-md">
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
              <SummaryBlock
                label={`This month · ${monthTitle(thisMonth)}`}
                rate={monthRate}
                counts={monthCounts}
                threshold={threshold}
                countLate={countLate}
              />
              <SummaryBlock
                label={`This academic year · ${settings.academicYear}`}
                rate={yearRate}
                counts={yearCounts}
                threshold={threshold}
                countLate={countLate}
              />
            </div>

            <ul className="grid grid-cols-2 gap-space-xs sm:grid-cols-4">
              {MARK_ORDER.map((m) => (
                <li key={m} className="flex items-center gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-space-xs">
                  <MarkChip mark={m} size="sm" decorative />
                  <span className="min-w-0">
                    <span className="block font-title-md text-title-md text-on-surface tnum">{yearCounts[m]}</span>
                    <span className="block font-body-sm text-body-sm text-secondary">{MARK_LABELS[m]}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="flex items-start gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-space-xs font-body-md text-body-md text-on-surface-variant">
              <Icon name="info" size={18} className="mt-0.5 text-primary" />
              <span>
                Approved leave (marked <strong>Excused</strong>) is left out of the sum, so it never pulls the percentage down.{' '}
                {countLate ? 'Arriving late still counts as attending.' : 'Arriving late does not count as attending.'} The institute asks
                for at least {threshold}%.
              </span>
            </p>
          </Card>

          {/* Per batch ---------------------------------------------------- */}
          <Card className="flex flex-col gap-space-sm">
            <CardHeader icon="school" title="By subject" subtitle="Across the whole year" />
            <ul className="flex flex-col gap-space-md">
              {perBatch.map(({ batch, counts, rate }) => {
                const low = Number.isFinite(rate) && rate * 100 < threshold;
                return (
                  <li key={batch.id} className="flex flex-col gap-space-2xs">
                    <div className="flex items-baseline justify-between gap-space-xs">
                      <span className="min-w-0 truncate font-title-md text-title-md text-on-surface">{subjectOf(batch)}</span>
                      <AttendancePctBadge ratio={rate} threshold={threshold} />
                    </div>
                    <ProgressBar
                      value={Number.isFinite(rate) ? rate : 0}
                      tone={Number.isFinite(rate) ? 'auto' : 'primary'}
                      thresholds={{ danger: threshold / 100, warning: (threshold + 10) / 100 }}
                      label={`${subjectOf(batch)} attendance`}
                    />
                    <p className="font-body-sm text-body-sm text-secondary">
                      {batch.name} · {attendedOf(counts, countLate)} of {countedOf(counts)} classes attended
                      {counts.E > 0 && ` · ${counts.E} excused`}
                    </p>
                    {low && (
                      <p className="flex items-center gap-space-2xs font-label-md text-label-md text-error">
                        <Icon name="warning" size={16} />
                        Below the {threshold}% the institute asks for
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Calendar ----------------------------------------------------- */}
          <Card className="flex flex-col gap-space-md p-space-sm sm:p-space-md">
            <div className="flex items-center justify-between gap-space-xs">
              <div className="min-w-0 flex-1">
                <h2 className="font-title-lg text-title-lg font-bold text-on-surface" aria-live="polite">
                  {monthTitle(month)}
                </h2>
                <p className="font-body-sm text-body-sm text-secondary">
                  {calendarCounts.total
                    ? `${formatPercent(attendanceRate(calendarCounts, countLate))} attendance · ${MARK_ORDER.filter(
                        (m) => calendarCounts[m] > 0,
                      )
                        .map((m) => `${calendarCounts[m]} ${MARK_LABELS[m].toLowerCase()}`)
                        .join(' · ')}`
                    : 'No classes recorded this month'}
                </p>
              </div>
              <div className="flex items-center gap-space-2xs">
                <IconButton
                  icon="chevron_left"
                  label="Previous month"
                  disabled={prevMonth < minMonth}
                  onClick={() => setMonth(prevMonth)}
                />
                <IconButton icon="chevron_right" label="Next month" disabled={nextMonth > thisMonth} onClick={() => setMonth(nextMonth)} />
              </div>
            </div>

            <table className="w-full table-fixed border-separate border-spacing-0">
              <caption className="sr-only">Attendance calendar for {monthTitle(month)}. Choose a day to see its classes.</caption>
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
                      if (!date) return <td key={`pad-${di}`} className="p-0.5" />;
                      const marks = byDate.get(date) ?? [];
                      const scheduled = !marks.length && isScheduled(date);
                      const description = marks.length
                        ? marks.map((m) => `${MARK_LABELS[m.mark]}${m.batch ? ` in ${subjectOf(m.batch)}` : ''}`).join(', ')
                        : scheduled
                          ? 'Class scheduled'
                          : 'No class';
                      return (
                        <td key={date} className="p-0.5 align-top">
                          <button
                            type="button"
                            onClick={() => setSelected(selected === date ? null : date)}
                            aria-pressed={selected === date}
                            className={cn(
                              'flex h-12 w-full flex-col justify-between rounded-lg p-1 text-left transition-shadow sm:h-16 sm:p-1.5',
                              marks.length === 1 && MARK_TINT[marks[0].mark],
                              marks.length > 1 && 'bg-surface-container-low',
                              scheduled && 'border border-dashed border-outline',
                              date === t && 'ring-2 ring-primary',
                              selected === date && 'ring-2 ring-inset ring-on-surface',
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
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-2xs">
              <MarkLegend label="What the letters mean" />
              <span className="inline-flex items-center gap-space-2xs font-label-sm text-label-sm text-secondary">
                <span className="h-4 w-4 rounded border border-dashed border-outline" aria-hidden />
                Class coming up
              </span>
              <span className="inline-flex items-center gap-space-2xs font-label-sm text-label-sm text-secondary">
                <span className="h-4 w-4 rounded ring-2 ring-inset ring-primary" aria-hidden />
                Today
              </span>
            </div>

            {/* Tapping a day opens its detail right under the grid. */}
            {selected && (
              <div className="rounded-xl bg-surface-container-low p-space-sm" aria-live="polite">
                <div className="flex items-start justify-between gap-space-xs">
                  <p className="font-title-md text-title-md text-on-surface">{formatDate(selected)}</p>
                  <IconButton icon="close" label="Close day details" size="sm" onClick={() => setSelected(null)} />
                </div>
                {selectedRows.length === 0 ? (
                  <p className="mt-1 font-body-md text-body-md text-secondary">
                    {isScheduled(selected) ? 'A class is scheduled — attendance has not been marked yet.' : 'No class on this day.'}
                  </p>
                ) : (
                  <ul className="mt-space-xs flex flex-col gap-space-xs">
                    {selectedRows.map((r) => (
                      <li key={r.session.id} className="flex items-start gap-space-sm">
                        <MarkChip mark={r.mark} size="sm" />
                        <div className="min-w-0">
                          <p className="font-body-lg text-body-lg text-on-surface">
                            {r.batch ? subjectOf(r.batch) : 'Class'} · {MARK_LABELS[r.mark]}
                          </p>
                          <p className="font-body-sm text-body-sm text-secondary">
                            {r.batch ? `${r.batch.name} · ` : ''}
                            {r.session.topicIds
                              .map((id) => topicById.get(id)?.name)
                              .filter(Boolean)
                              .join(', ') || 'Topic not recorded'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          {/* Recent classes ----------------------------------------------- */}
          <Card className="flex flex-col gap-space-sm">
            <CardHeader icon="history" title="Recent classes" subtitle="Newest first" />
            {rows.length === 0 ? (
              <EmptyState
                compact
                icon="event_available"
                title="No classes recorded yet"
                description="Attendance shows up here as soon as the first class is marked."
              />
            ) : (
              <>
                <ul className="flex flex-col">
                  {visibleRows.map((r) => (
                    <li
                      key={r.session.id}
                      className="flex min-h-[56px] items-center gap-space-sm border-b border-outline-variant/30 py-space-xs last:border-0"
                    >
                      <MarkChip mark={r.mark} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-body-lg text-body-lg text-on-surface">{r.batch ? subjectOf(r.batch) : 'Class'}</p>
                        <p className="truncate font-body-sm text-body-sm text-secondary">
                          {r.session.topicIds
                            .map((id) => topicById.get(id)?.name)
                            .filter(Boolean)
                            .join(', ') || 'Topic not recorded'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-label-md text-label-md text-on-surface tnum">{formatDayMonth(r.session.date)}</p>
                        <Badge tone="surface">{MARK_LABELS[r.mark]}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
                {rows.length > 12 && (
                  <Button variant="secondary" fullWidth onClick={() => setShowAll((v) => !v)}>
                    {showAll ? 'Show fewer' : `Show more (${Math.min(rows.length, 60) - 12} more)`}
                  </Button>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** One headline percentage with its attended/total line. */
function SummaryBlock({
  label,
  rate,
  counts,
  threshold,
  countLate,
}: {
  label: string;
  rate: number;
  counts: ReturnType<typeof countRows>;
  threshold: number;
  countLate: boolean;
}) {
  return (
    <div className="flex flex-col gap-space-2xs">
      <p className="font-label-md text-label-md text-secondary">{label}</p>
      <div className="flex items-baseline gap-space-xs">
        <span className="font-headline-lg text-headline-lg-mobile text-on-surface tnum md:text-headline-lg">{formatPercent(rate)}</span>
        <PortalAttendanceStatus ratio={rate} threshold={threshold} />
      </div>
      <ProgressBar
        value={Number.isFinite(rate) ? rate : 0}
        // Nothing to measure yet → neutral track, not an alarming empty red bar.
        tone={Number.isFinite(rate) ? 'auto' : 'primary'}
        thresholds={{ danger: threshold / 100, warning: (threshold + 10) / 100 }}
        label={label}
      />
      <p className="font-body-sm text-body-sm text-secondary">
        {countedOf(counts) === 0
          ? 'No classes counted yet'
          : `${attendedOf(counts, countLate)} of ${countedOf(counts)} classes attended${counts.E ? ` · ${counts.E} on approved leave` : ''}`}
      </p>
    </div>
  );
}
