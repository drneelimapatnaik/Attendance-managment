/**
 * Faculty › Workload: totals, a ranked bar list of weekly teaching hours and
 * a per-teacher table (batches, hours, classes in the last 30 days, on-time
 * attendance marking and average batch attendance). Cards on phones.
 */
import { Link } from 'react-router-dom';
import { Card, CardHeader, DataTable, EmptyState, ProgressBar, StatCard, Tag, type Column } from '@/components/ui';
import { AttendancePctBadge, PersonCell } from '@/components/domain';
import { BarList } from '@/components/charts';
import { useSettings } from '@/hooks/useTenant';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { WORKLOAD_WINDOW_DAYS, useWorkload, type WorkloadRow } from '../useWorkload';

/** 4.5 → "4.5 h", 6 → "6 h" */
const hours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`;

// Marking on the day of class keeps parent absence alerts timely.
const COMPLIANCE_TARGET = 0.9;

function Compliance({ row }: { row: WorkloadRow }) {
  if (!row.held) return <span className="font-body-sm text-body-sm text-secondary">No classes</span>;
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <span className="flex items-baseline justify-between gap-space-xs">
        <span className={cn('font-label-lg text-label-lg tnum', row.compliance < COMPLIANCE_TARGET ? 'text-error' : 'text-on-surface')}>
          {formatPercent(row.compliance)}
        </span>
        <span className="font-body-sm text-body-sm text-secondary tnum">
          {row.onTime}/{row.held}
        </span>
      </span>
      <ProgressBar
        value={row.compliance}
        tone="auto"
        thresholds={{ danger: 0.75, warning: COMPLIANCE_TARGET }}
        size="xs"
        label={`Attendance marked on time for ${row.staff.name}`}
      />
    </div>
  );
}

function BatchCodes({ row }: { row: WorkloadRow }) {
  if (!row.batches.length) return <span className="font-body-sm text-body-sm text-secondary">No batches</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {row.batches.map((b) => (
        <Link key={b.id} to={`/batches/${b.id}`} onClick={(e) => e.stopPropagation()}>
          <Tag title={b.title} className="hover:bg-surface-container-highest">
            {b.code}
          </Tag>
        </Link>
      ))}
    </div>
  );
}

export function WorkloadPanel() {
  const { rows, totals } = useWorkload();
  const threshold = useSettings().attendance.lowAttendanceThreshold;
  const maxHours = Math.max(1, ...rows.map((r) => r.weeklyHours));

  const columns: Column<WorkloadRow>[] = [
    {
      key: 'name',
      header: 'Faculty',
      sortValue: (r) => r.staff.name,
      headerClassName: 'min-w-[200px]',
      cell: ({ staff: s }) => <PersonCell name={s.name} subtitle={s.title} photoUrl={s.avatarUrl} dimmed={s.status !== 'Active'} />,
    },
    {
      key: 'batches',
      header: 'Batches',
      headerClassName: 'min-w-[150px]',
      sortValue: (r) => r.batches.length,
      cell: (r) => <BatchCodes row={r} />,
    },
    {
      key: 'hours',
      header: 'Weekly hours',
      align: 'right',
      sortValue: (r) => r.weeklyHours,
      className: 'whitespace-nowrap font-label-lg text-label-lg text-on-surface tnum',
      cell: (r) => hours(r.weeklyHours),
    },
    {
      key: 'held',
      header: `Classes (${WORKLOAD_WINDOW_DAYS}d)`,
      align: 'right',
      sortValue: (r) => r.held,
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface tnum',
      cell: (r) => r.held,
    },
    {
      key: 'compliance',
      header: 'Marked on time',
      sortValue: (r) => (Number.isFinite(r.compliance) ? r.compliance : -1),
      cell: (r) => <Compliance row={r} />,
    },
    {
      key: 'attendance',
      header: 'Avg attendance',
      align: 'center',
      sortValue: (r) => (Number.isFinite(r.avgAttendance) ? r.avgAttendance : -1),
      cell: (r) => <AttendancePctBadge ratio={r.avgAttendance} threshold={threshold} />,
    },
  ];

  const mobileCard = (r: WorkloadRow) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <PersonCell name={r.staff.name} subtitle={r.staff.title} photoUrl={r.staff.avatarUrl} dimmed={r.staff.status !== 'Active'} />
        <AttendancePctBadge ratio={r.avgAttendance} threshold={threshold} />
      </div>
      <BatchCodes row={r} />
      <div className="grid grid-cols-2 gap-space-sm">
        <div>
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Weekly hours</p>
          <p className="font-title-md text-title-md text-on-surface tnum">{hours(r.weeklyHours)}</p>
          <p className="font-body-sm text-body-sm text-secondary">{r.held} classes in 30 days</p>
        </div>
        <div>
          <p className="mb-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Marked on time</p>
          <Compliance row={r} />
        </div>
      </div>
    </div>
  );

  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState
          icon="school"
          title="No teaching staff yet"
          description="Invite faculty and assign them to batches to see their workload."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-4">
        <StatCard label="Teaching staff" icon="school" value={totals.teachers} hint="with at least one active batch" />
        <StatCard label="Weekly teaching hours" icon="schedule" value={hours(totals.weeklyHours)} hint="across all active batches" />
        <StatCard
          label={`Classes held · ${WORKLOAD_WINDOW_DAYS} days`}
          icon="event_available"
          value={totals.held}
          hint="roll calls taken"
        />
        <StatCard
          label="Marked on the day"
          icon="task_alt"
          value={formatPercent(totals.compliance)}
          hint={`Target ${Math.round(COMPLIANCE_TARGET * 100)}% — keeps absence alerts timely`}
        />
      </div>

      <div className="grid gap-space-lg xl:grid-cols-3">
        <Card className="flex flex-col gap-space-md xl:col-span-1 xl:self-start">
          <CardHeader title="Weekly teaching hours" icon="bar_chart" subtitle="Timetabled hours per teacher" />
          <BarList
            max={maxHours}
            items={rows.map((r) => ({
              id: r.staff.id,
              label: r.staff.name,
              sublabel: `${r.batches.length} batch${r.batches.length === 1 ? '' : 'es'}`,
              value: r.weeklyHours,
              display: hours(r.weeklyHours),
            }))}
          />
        </Card>
        <div className="min-w-0 xl:col-span-2">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.staff.id}
            mobileCard={mobileCard}
            entityLabel="teachers"
            pageSize={25}
            caption="Teaching workload per faculty member"
          />
        </div>
      </div>
    </div>
  );
}
