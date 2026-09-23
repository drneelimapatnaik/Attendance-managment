/**
 * Batch detail › Attendance: per-session attendance % trend (range in the
 * URL as ?range=30|90|all), mark composition for the range, and the list of
 * sessions (latest first) with P/L/A/E counts and topics taught. Each
 * session opens in Class Attendance (/attendance?batch=&date=).
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AttendanceMark, AttendanceSession, Batch } from '@/types/domain';
import { Badge, ButtonLink, Card, CardHeader, DataTable, EmptyState, Icon, SegmentedControl, type Column } from '@/components/ui';
import { AttendancePctBadge, MARK_STYLE } from '@/components/domain';
import { LineChart, STATUS_COLORS, StackedBar } from '@/components/charts';
import { useCan, useLookups, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { attendanceRate, countRecords, emptyCounts, MARK_LABELS, type MarkCounts } from '@/domain/attendance';
import { addDays, formatDate, formatDayMonth, formatTimeRange, today, weekdayOf } from '@/lib/date';
import { formatPercent, pluralize } from '@/lib/format';

type Range = '30' | '90' | 'all';

interface SessionRow {
  session: AttendanceSession;
  counts: MarkCounts;
  rate: number;
  topics: string[];
}

const MARKS: AttendanceMark[] = ['P', 'L', 'A', 'E'];

/**
 * Axis floor for the % trend: the highest of 60/40/20/0 that still leaves
 * headroom below both the lowest session and the target line, so day-to-day
 * swings stay readable. (Each floor gives clean 10/20/25-step ticks to 100.)
 */
function axisFloor(values: number[], target: number): number {
  const low = Math.min(target, ...values) - 5;
  return [60, 40, 20, 0].find((f) => f <= low) ?? 0;
}

export function BatchAttendanceTab({ batch }: { batch: Batch }) {
  const can = useCan();
  const settings = useSettings();
  const { topic } = useLookups();
  const allSessions = useDataStore((s) => s.sessions);
  const [params, setParams] = useSearchParams();
  const range: Range = (['30', '90', 'all'] as const).find((r) => r === params.get('range')) ?? '90';
  const { lowAttendanceThreshold: threshold, countLateAsPresent } = settings.attendance;

  const setRange = (r: Range) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (r === '90') next.delete('range');
        else next.set('range', r);
        return next;
      },
      { replace: true },
    );

  const rows = useMemo<SessionRow[]>(() => {
    const from = range === 'all' ? '' : addDays(today(), -(Number(range) - 1));
    return allSessions
      .filter((s) => s.batchId === batch.id && s.date >= from)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((session) => {
        const counts = countRecords(session.records);
        return {
          session,
          counts,
          rate: attendanceRate(counts, countLateAsPresent),
          topics: session.topicIds.map((id) => topic.get(id)?.name).filter((n): n is string => !!n),
        };
      });
  }, [allSessions, batch.id, range, countLateAsPresent, topic]);

  const totals = useMemo(() => {
    const t = emptyCounts();
    for (const r of rows) for (const m of MARKS) t[m] += r.counts[m];
    t.total = t.P + t.L + t.A + t.E;
    return t;
  }, [rows]);
  const overall = attendanceRate(totals, countLateAsPresent);
  const below = rows.filter((r) => Number.isFinite(r.rate) && r.rate * 100 < threshold).length;

  const openHref = (s: AttendanceSession) => `/attendance?batch=${batch.id}&date=${s.date}`;

  const markCounts = (c: MarkCounts) => (
    <span className="inline-flex flex-wrap gap-1">
      {MARKS.map((m) => (
        <Badge key={m} tone={MARK_STYLE[m].tone} className="tnum">
          <span aria-hidden>{m}</span>
          <span className="sr-only">{MARK_LABELS[m]}</span> {c[m]}
        </Badge>
      ))}
    </span>
  );

  const columns: Column<SessionRow>[] = [
    {
      key: 'date',
      header: 'Session',
      sortValue: (r) => r.session.date,
      className: 'whitespace-nowrap',
      cell: ({ session: s }) => (
        <>
          <span className="flex items-center gap-1 font-label-lg text-label-lg text-on-surface">
            {formatDate(s.date)}
            {s.pendingSync && <Icon name="cloud_upload" size={14} className="text-secondary" label="Waiting to sync" />}
          </span>
          <span className="block font-body-sm text-body-sm text-secondary tnum">
            {weekdayOf(s.date)} · {formatTimeRange(s.startTime, s.endTime)}
          </span>
        </>
      ),
    },
    {
      key: 'topics',
      header: 'Topics taught',
      headerClassName: 'min-w-[180px]',
      cell: ({ topics }) =>
        topics.length ? (
          <span className="font-body-md text-body-md text-on-surface">{topics.join(', ')}</span>
        ) : (
          <span className="font-body-sm text-body-sm text-secondary">Not recorded</span>
        ),
    },
    {
      key: 'marks',
      header: 'P · L · A · E',
      hideBelow: 'lg',
      cell: ({ counts }) => markCounts(counts),
    },
    {
      key: 'rate',
      header: 'Attendance',
      align: 'center',
      sortValue: (r) => (Number.isFinite(r.rate) ? r.rate : -1),
      cell: ({ rate }) => <AttendancePctBadge ratio={rate} threshold={threshold} />,
    },
    ...(can('attendance.mark')
      ? [
          {
            key: 'open',
            header: <span className="sr-only">Open</span>,
            align: 'right' as const,
            cell: ({ session: s }: SessionRow) => (
              <ButtonLink to={openHref(s)} variant="ghost" size="sm" trailingIcon="open_in_new" onClick={(e) => e.stopPropagation()}>
                Open
              </ButtonLink>
            ),
          },
        ]
      : []),
  ];

  const mobileCard = ({ session: s, counts, rate, topics }: SessionRow) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <div className="min-w-0">
          <p className="font-label-lg text-label-lg text-on-surface">
            {formatDate(s.date)} <span className="font-body-sm text-body-sm text-secondary">· {weekdayOf(s.date)}</span>
          </p>
          <p className="truncate font-body-sm text-body-sm text-secondary">{topics.length ? topics.join(', ') : 'Topics not recorded'}</p>
        </div>
        <AttendancePctBadge ratio={rate} threshold={threshold} />
      </div>
      <div className="flex items-center justify-between gap-space-xs">
        {markCounts(counts)}
        {can('attendance.mark') && (
          <ButtonLink to={openHref(s)} variant="ghost" size="sm" trailingIcon="open_in_new">
            Open
          </ButtonLink>
        )}
      </div>
    </div>
  );

  if (batch.status === 'Upcoming' && !rows.length) {
    return (
      <Card>
        <EmptyState
          icon="event_upcoming"
          title="No sessions yet"
          description={`${batch.name} starts on ${formatDate(batch.startDate)}. Attendance trends appear after the first class.`}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid gap-space-md xl:grid-cols-12">
        <Card className="flex flex-col gap-space-md xl:col-span-8">
          <CardHeader
            title="Attendance per session"
            icon="show_chart"
            subtitle={`Share of students present${countLateAsPresent ? ' (late counts as present)' : ''} · excused leave excluded`}
            actions={
              <SegmentedControl<Range>
                ariaLabel="Date range"
                size="sm"
                value={range}
                onChange={setRange}
                segments={[
                  { value: '30', label: '30d', ariaLabel: 'Last 30 days' },
                  { value: '90', label: '90d', ariaLabel: 'Last 90 days' },
                  { value: 'all', label: 'All', ariaLabel: 'All sessions' },
                ]}
              />
            }
          />
          {rows.length ? (
            <LineChart
              labels={rows.map((r) => formatDayMonth(r.session.date))}
              series={[{ id: 'rate', label: 'Attendance', values: rows.map((r) => (Number.isFinite(r.rate) ? r.rate * 100 : null)) }]}
              yMax={100}
              yMin={axisFloor(
                rows.filter((r) => Number.isFinite(r.rate)).map((r) => r.rate * 100),
                threshold,
              )}
              formatValue={(v) => `${Math.round(v)}%`}
              tooltipTitle={(i) => `${formatDate(rows[i].session.date)} · ${weekdayOf(rows[i].session.date)}`}
              reference={{ value: threshold, label: `Target ${threshold}%` }}
              ariaLabel={`${batch.name} attendance per session`}
            />
          ) : (
            <EmptyState compact icon="event_busy" title="No sessions in this range" description="Pick a longer range to see the trend." />
          )}
        </Card>

        <Card className="flex flex-col gap-space-md xl:col-span-4">
          <CardHeader title="Range summary" icon="donut_small" />
          <div className="grid grid-cols-2 gap-space-sm">
            <div>
              <p className="font-label-md text-label-md text-secondary">Average</p>
              <p className="font-headline-md text-headline-md text-on-surface tnum">{formatPercent(overall)}</p>
            </div>
            <div>
              <p className="font-label-md text-label-md text-secondary">Sessions</p>
              <p className="font-headline-md text-headline-md text-on-surface tnum">{rows.length}</p>
            </div>
          </div>
          <StackedBar
            ariaLabel="Attendance marks in this range"
            segments={[
              { label: 'Present', value: totals.P, color: STATUS_COLORS.present },
              { label: 'Late', value: totals.L, color: STATUS_COLORS.late },
              { label: 'Absent', value: totals.A, color: STATUS_COLORS.absent },
              { label: 'Excused', value: totals.E, color: STATUS_COLORS.excused },
            ]}
          />
          {rows.length > 0 && (
            <p className="flex items-start gap-space-2xs font-body-sm text-body-sm text-secondary">
              <Icon name={below ? 'warning' : 'check_circle'} size={16} className={below ? 'text-error' : 'text-success'} />
              {below
                ? `${pluralize(below, 'session')} fell below the ${threshold}% target.`
                : `Every session met the ${threshold}% target.`}
            </p>
          )}
        </Card>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.session.id}
        mobileCard={mobileCard}
        entityLabel="sessions"
        initialSort={{ key: 'date', dir: 'desc' }}
        caption={`${batch.name} sessions`}
        empty={
          <EmptyState
            compact
            icon="event_busy"
            title="No sessions recorded"
            description="Sessions appear here once attendance is marked for this batch."
            action={
              can('attendance.mark') && batch.status === 'Active' ? (
                <ButtonLink to={`/attendance?batch=${batch.id}`} icon="how_to_reg">
                  Mark attendance
                </ButtonLink>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
