/**
 * Profile › Attendance: mark tallies and attendance % per batch (flagged
 * below the tenant's threshold), a month calendar (?month=YYYY-MM keeps the
 * viewed month shareable) and every class session in a sortable table.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Student } from '@/types/domain';
import { Card, CardHeader, DataTable, EmptyState, type Column } from '@/components/ui';
import { AttendanceBadge } from '@/components/domain';
import { BarList, type BarListItem } from '@/components/charts';
import { useLookups, useSettings } from '@/hooks/useTenant';
import { MARK_LABELS, attendanceRate } from '@/domain/attendance';
import { formatDate, formatTimeRange, today, weekdayOf } from '@/lib/date';
import { formatPercent, pluralize } from '@/lib/format';
import { AttendanceCalendar } from './AttendanceCalendar';
import { MARK_ORDER, MarkChip } from '@/components/domain';
import { attendedOf, countMarks, countedOf, type SessionRow, type StudentProfile } from './useStudentProfile';

interface AttendanceTabProps {
  student: Student;
  profile: StudentProfile;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function AttendanceTab({ student, profile }: AttendanceTabProps) {
  const [params, setParams] = useSearchParams();
  const { topic } = useLookups();
  const { lowAttendanceThreshold: threshold, countLateAsPresent: countLate } = useSettings().attendance;
  const { sessionRows, attendance, batches } = profile;

  // Calendar bounds: from the student's first class (or joining month) up to this month.
  const maxMonth = today().slice(0, 7);
  const oldest = sessionRows[sessionRows.length - 1]?.session.date.slice(0, 7);
  const joined = student.joiningDate.slice(0, 7);
  const minMonth = [oldest ?? joined, joined, maxMonth].sort()[0];
  const requested = params.get('month');
  const month = requested && MONTH_RE.test(requested) && requested >= minMonth && requested <= maxMonth ? requested : maxMonth;
  const setMonth = (m: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (m === maxMonth) next.delete('month');
        else next.set('month', m);
        return next;
      },
      { replace: true },
    );

  const perBatch = useMemo<BarListItem[]>(() => {
    const groups = new Map<string, SessionRow[]>();
    for (const r of sessionRows) groups.set(r.session.batchId, [...(groups.get(r.session.batchId) ?? []), r]);
    return [...groups.entries()]
      .map(([batchId, rows]) => {
        const c = countMarks(rows);
        const rate = attendanceRate(c, countLate);
        const batch = rows[0].batch;
        return {
          id: batchId,
          label: batch?.name ?? 'Former batch',
          sublabel: batch?.title,
          value: rate,
          display: `${formatPercent(rate)} · ${attendedOf(c, countLate)}/${countedOf(c)}`,
          to: batch ? `/batches/${batchId}` : undefined,
        };
      })
      .sort((a, b) => (Number.isFinite(b.value) ? b.value : -1) - (Number.isFinite(a.value) ? a.value : -1));
  }, [sessionRows, countLate]);

  const columns: Column<SessionRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortValue: (r) => `${r.session.date} ${r.session.startTime}`,
      className: 'whitespace-nowrap',
      cell: ({ session }) => (
        <>
          <span className="block font-label-lg text-label-lg text-on-surface tnum">{formatDate(session.date)}</span>
          <span className="block font-body-sm text-body-sm text-secondary">{weekdayOf(session.date)}</span>
        </>
      ),
    },
    {
      key: 'batch',
      header: 'Batch',
      sortValue: (r) => r.batch?.name ?? '',
      headerClassName: 'min-w-[180px]',
      cell: ({ batch }) => (
        <>
          <span className="block font-label-lg text-label-lg text-on-surface">{batch?.name ?? 'Former batch'}</span>
          <span className="block font-body-sm text-body-sm text-secondary">{batch?.title}</span>
        </>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      hideBelow: 'xl',
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface-variant tnum',
      cell: ({ session }) => formatTimeRange(session.startTime, session.endTime),
    },
    {
      key: 'topics',
      header: 'Topics covered',
      headerClassName: 'min-w-[200px]',
      cell: ({ session }) => <TopicList names={session.topicIds.map((id) => topic.get(id)?.name).filter((n): n is string => !!n)} />,
    },
    {
      key: 'mark',
      header: 'Mark',
      align: 'center',
      sortValue: (r) => MARK_ORDER.indexOf(r.mark),
      cell: ({ mark }) => <AttendanceBadge mark={mark} />,
    },
  ];

  const mobileCard = ({ session, batch, mark }: SessionRow) => (
    <div className="flex flex-col gap-space-2xs">
      <div className="flex items-start justify-between gap-space-xs">
        <div className="min-w-0">
          <p className="font-label-lg text-label-lg text-on-surface">
            {formatDate(session.date)} · {weekdayOf(session.date)}
          </p>
          <p className="truncate font-body-sm text-body-sm text-secondary">
            {batch?.name ?? 'Former batch'} · {formatTimeRange(session.startTime, session.endTime)}
          </p>
        </div>
        <AttendanceBadge mark={mark} />
      </div>
      <TopicList names={session.topicIds.map((id) => topic.get(id)?.name).filter((n): n is string => !!n)} />
    </div>
  );

  if (!sessionRows.length) {
    return (
      <div className="card">
        <EmptyState
          icon="event_busy"
          title="No attendance recorded yet"
          description={
            batches.length
              ? 'Marks appear here after the first roll call for their batches.'
              : 'Assign a batch to this student to start tracking attendance.'
          }
        />
      </div>
    );
  }

  const { overall } = attendance;

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid gap-space-lg xl:grid-cols-5">
        <Card className="flex min-w-0 flex-col gap-space-md xl:col-span-2 xl:self-start">
          <CardHeader
            title="Attendance by batch"
            icon="bar_chart"
            subtitle={`Overall ${formatPercent(attendance.rate)} · flagged below ${threshold}%`}
          />
          <ul className="grid grid-cols-4 gap-space-xs" aria-label="Classes by mark">
            {MARK_ORDER.map((m) => (
              <li key={m} className="flex flex-col items-center gap-1 rounded-lg bg-surface-container-low px-1 py-space-xs text-center">
                <MarkChip mark={m} size="sm" decorative />
                <span className="font-title-md text-title-md text-on-surface tnum">{overall[m]}</span>
                <span className="font-label-sm text-label-sm text-secondary">{MARK_LABELS[m]}</span>
              </li>
            ))}
          </ul>
          <BarList items={perBatch} threshold={threshold / 100} thresholdLabel={`Below the ${threshold}% attendance threshold`} />
          <p className="font-body-sm text-body-sm text-secondary">
            Excused leave is left out of the percentage
            {countLate ? '; late arrivals count as present.' : '; late arrivals count as absent.'}
          </p>
        </Card>
        <div className="min-w-0 xl:col-span-3">
          <AttendanceCalendar
            month={month}
            minMonth={minMonth}
            maxMonth={maxMonth}
            onMonthChange={setMonth}
            rows={sessionRows}
            batches={batches}
            studentActive={student.status !== 'Inactive'}
            countLate={countLate}
          />
        </div>
      </div>

      <section className="flex flex-col gap-space-sm" aria-labelledby="sessions-heading">
        <div className="flex items-baseline justify-between gap-space-sm">
          <h2 id="sessions-heading" className="font-title-lg text-title-lg font-bold text-on-surface">
            Class sessions
          </h2>
          <span className="font-body-sm text-body-sm text-secondary">{pluralize(sessionRows.length, 'class', 'classes')}</span>
        </div>
        <DataTable
          rows={sessionRows}
          columns={columns}
          rowKey={(r) => r.session.id}
          mobileCard={mobileCard}
          entityLabel="classes"
          initialSort={{ key: 'date', dir: 'desc' }}
          caption={`Class sessions for ${student.name}`}
        />
      </section>
    </div>
  );
}

function TopicList({ names }: { names: string[] }) {
  if (!names.length) return <span className="font-body-sm text-body-sm text-secondary">No topics logged</span>;
  return <span className="line-clamp-2 font-body-md text-body-md text-on-surface-variant">{names.join(', ')}</span>;
}
