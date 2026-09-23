/**
 * Batches & Classes (/batches).
 *
 * KPI strip (campus-wide) → filter bar (URL state) → one of three views:
 *  - Grid:      BatchSummaryCard per batch + attendance / syllabus strip
 *  - List:      sortable DataTable (stacked cards on phones)
 *  - Timetable: Mon–Sun grid on tablet/desktop, per-day list on phones
 */
import { Link, useNavigate } from 'react-router-dom';
import { Button, DataTable, EmptyState, PageHeader, ProgressBar, StatCard, type Column } from '@/components/ui';
import { AttendancePctBadge } from '@/components/domain';
import { useCan, useMoney, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { useUiStore } from '@/store/uiStore';
import { formatTimeRange } from '@/lib/date';
import { formatPercent, pluralize } from '@/lib/format';
import { BatchFiltersBar } from './components/BatchFiltersBar';
import { BatchGridCard } from './components/BatchGridCard';
import { BatchStatusBadge } from './components/BatchStatusBadge';
import { BatchTimetable } from './components/BatchTimetable';
import { exportBatches } from './exportBatches';
import { formatDays } from './schedule';
import { useBatchFilters, useBatchRows, type BatchRow } from './useBatches';

export default function BatchesPage() {
  useDocumentTitle('Batches & Classes');
  const navigate = useNavigate();
  const can = useCan();
  const money = useMoney();
  const settings = useSettings();
  const threshold = settings.attendance.lowAttendanceThreshold;
  const openModal = useUiStore((s) => s.openModal);

  const { filters, setFilter, reset, isFiltered, view, setView } = useBatchFilters();
  const { rows, all, summary } = useBatchRows(filters);

  const columns: Column<BatchRow>[] = [
    {
      key: 'batch',
      header: 'Batch',
      sortValue: (r) => r.batch.code,
      headerClassName: 'min-w-[200px]',
      cell: ({ batch: b }) => (
        <>
          <Link
            to={`/batches/${b.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-label-lg text-label-lg text-primary hover:underline"
          >
            {b.name}
          </Link>
          <span className="block font-body-sm text-body-sm text-secondary">{b.title}</span>
        </>
      ),
    },
    {
      key: 'subject',
      header: 'Subject · Grade',
      sortValue: (r) => `${r.subject?.name ?? ''} ${r.batch.grade}`,
      className: 'whitespace-nowrap',
      cell: ({ batch: b, subject }) => (
        <>
          <span className="block font-body-md text-body-md text-on-surface">{subject?.name ?? '—'}</span>
          <span className="block font-body-sm text-body-sm text-secondary">{b.grade}</span>
        </>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule',
      sortValue: (r) => r.batch.startTime,
      className: 'whitespace-nowrap',
      cell: ({ batch: b }) => (
        <>
          <span className="block font-body-md text-body-md text-on-surface">{formatDays(b.days)}</span>
          <span className="block font-body-sm text-body-sm text-secondary tnum">{formatTimeRange(b.startTime, b.endTime)}</span>
        </>
      ),
    },
    {
      key: 'faculty',
      header: 'Faculty',
      hideBelow: 'xl',
      sortValue: (r) => r.faculty?.name ?? '',
      className: 'whitespace-nowrap',
      cell: ({ faculty }) => <span className="font-body-md text-body-md text-on-surface">{faculty?.name ?? 'Unassigned'}</span>,
    },
    {
      key: 'room',
      header: 'Room',
      hideBelow: '2xl',
      sortValue: (r) => r.batch.room,
      className: 'whitespace-nowrap',
      cell: ({ batch: b }) => <span className="font-body-md text-body-md text-on-surface-variant">{b.room}</span>,
    },
    {
      key: 'seats',
      header: 'Seats',
      sortValue: (r) => r.m.ratio,
      headerClassName: 'min-w-[120px]',
      cell: ({ batch: b, m }) => (
        <div className="flex flex-col gap-1">
          <span className="font-label-md text-label-md text-on-surface tnum">
            {m.enrolled}/{b.capacity}
            {m.isFull && <span className="ml-1 text-error">· Full</span>}
          </span>
          <ProgressBar value={m.ratio} label={`${b.name} seats filled`} />
        </div>
      ),
    },
    {
      key: 'fee',
      header: 'Monthly Fee',
      hideBelow: '2xl',
      align: 'right',
      sortValue: (r) => r.batch.monthlyFee,
      className: 'whitespace-nowrap tnum',
      cell: ({ batch: b }) => <span className="font-body-md text-body-md text-on-surface">{money.format(b.monthlyFee)}</span>,
    },
    {
      key: 'attendance',
      header: 'Attend. 30d',
      align: 'center',
      sortValue: (r) => (Number.isFinite(r.m.attendance) ? r.m.attendance : -1),
      cell: ({ m }) => <AttendancePctBadge ratio={m.attendance} threshold={threshold} />,
    },
    {
      key: 'syllabus',
      header: 'Syllabus',
      hideBelow: 'xl',
      sortValue: (r) => r.m.coverage.ratio,
      headerClassName: 'min-w-[110px]',
      cell: ({ batch: b, m }) => (
        <div className="flex flex-col gap-1">
          <span className="font-label-md text-label-md text-on-surface tnum">{formatPercent(m.coverage.ratio)}</span>
          <ProgressBar value={m.coverage.ratio} label={`${b.name} syllabus covered`} />
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      sortValue: (r) => r.batch.status,
      cell: ({ batch: b }) => <BatchStatusBadge status={b.status} />,
    },
  ];

  const mobileCard = ({ batch: b, subject, faculty, m }: BatchRow) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <div className="min-w-0">
          <p className="font-title-md text-title-md text-on-surface">{b.name}</p>
          <p className="truncate font-body-sm text-body-sm text-secondary">
            {b.title} · {subject?.name} · {b.grade}
          </p>
        </div>
        <BatchStatusBadge status={b.status} />
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant tnum">
        {formatDays(b.days)} · {formatTimeRange(b.startTime, b.endTime)} · {b.room}
        <span className="block text-secondary">{faculty?.name ?? 'Unassigned'}</span>
      </p>
      <div className="flex items-center gap-space-sm">
        <span className="shrink-0 font-label-md text-label-md text-on-surface tnum">
          {m.enrolled}/{b.capacity} seats
        </span>
        <ProgressBar value={m.ratio} label={`${b.name} seats filled`} className="flex-1" />
      </div>
      <div className="flex items-center justify-between gap-space-xs">
        <span className="flex items-center gap-space-xs font-body-sm text-body-sm text-secondary">
          Attendance <AttendancePctBadge ratio={m.attendance} threshold={threshold} />
        </span>
        <span className="font-body-sm text-body-sm text-secondary tnum">
          Syllabus <strong className="text-on-surface">{formatPercent(m.coverage.ratio)}</strong> · {money.format(b.monthlyFee)}/mo
        </span>
      </div>
    </div>
  );

  // Three empty cases: filters exclude everything, only non-active batches
  // exist (default "Active" filter), or the campus has no batches at all.
  const onlyInactive = !isFiltered && all.length > 0;
  const empty = (
    <EmptyState
      icon={isFiltered ? 'search_off' : 'class'}
      title={isFiltered ? 'No batches match these filters' : onlyInactive ? 'No active batches' : 'No batches yet'}
      description={
        isFiltered
          ? 'Try a different search, status or subject — or reset the filters.'
          : onlyInactive
            ? `This campus has ${pluralize(summary.upcoming, 'upcoming batch', 'upcoming batches')} and ${summary.archived} archived.`
            : 'Create your first batch to start enrolling students and marking attendance.'
      }
      action={
        isFiltered ? (
          <Button variant="tonal" icon="filter_alt_off" onClick={reset}>
            Reset filters
          </Button>
        ) : onlyInactive ? (
          <Button variant="tonal" icon="visibility" onClick={() => setFilter('status', 'all')}>
            Show all batches
          </Button>
        ) : can('batches.manage') ? (
          <Button icon="domain_add" onClick={() => openModal({ type: 'batch-form' })}>
            Create batch
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Academic"
        title="Batches & Classes"
        meta={`${summary.active} active · ${formatPercent(summary.fill)} seats filled`}
        actions={
          <>
            <Button
              variant="tonal"
              icon="download"
              disabled={!rows.length}
              onClick={() => exportBatches(rows, settings.campuses, settings.name)}
            >
              Export CSV
            </Button>
            {can('batches.manage') && (
              <Button icon="domain_add" className="px-space-md" onClick={() => openModal({ type: 'batch-form' })}>
                + Create New Batch
              </Button>
            )}
          </>
        }
      />

      <section aria-label="Batch summary" className="grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-4">
        <StatCard
          label="Active batches"
          icon="class"
          value={<span className="tnum">{summary.active}</span>}
          hint={`${summary.upcoming} upcoming · ${summary.archived} archived`}
        />
        <StatCard
          label="Seats filled"
          icon="event_seat"
          value={<span className="tnum">{formatPercent(summary.fill)}</span>}
          hint={
            <span className="tnum">
              {summary.enrolled}/{summary.capacity} seats{summary.full ? ` · ${pluralize(summary.full, 'batch', 'batches')} full` : ''}
            </span>
          }
          trend={<ProgressBar value={summary.fill} label="Seats filled across active batches" />}
        />
        <StatCard
          label="Attendance · 30 days"
          icon="how_to_reg"
          value={<span className="tnum">{formatPercent(summary.attendance)}</span>}
          hint={`Avg of active batches · target ${threshold}%`}
          to={can('attendance.reports') ? '/reports/attendance' : undefined}
        />
        <StatCard
          label="Syllabus covered"
          icon="menu_book"
          value={<span className="tnum">{formatPercent(summary.coverage)}</span>}
          hint="Average topic completion"
          trend={<ProgressBar value={summary.coverage} label="Average syllabus covered" />}
          to={can('topics.manage') ? '/topics' : undefined}
        />
      </section>

      <BatchFiltersBar
        filters={filters}
        setFilter={setFilter}
        onReset={reset}
        isFiltered={isFiltered}
        view={view}
        onViewChange={setView}
        resultCount={rows.length}
      />

      {view === 'list' ? (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.batch.id}
          onRowClick={(r) => navigate(`/batches/${r.batch.id}`)}
          rowClassName={(r) => (r.batch.status === 'Archived' ? 'opacity-70' : undefined)}
          mobileCard={mobileCard}
          entityLabel="batches"
          initialSort={{ key: 'batch', dir: 'asc' }}
          caption="Batches"
          empty={empty}
        />
      ) : rows.length === 0 ? (
        <div className="card">{empty}</div>
      ) : view === 'timetable' ? (
        <BatchTimetable batches={rows.map((r) => r.batch)} />
      ) : (
        <div className="grid gap-space-md sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((r) => (
            <BatchGridCard key={r.batch.id} row={r} />
          ))}
        </div>
      )}

      {all.length > 0 && view !== 'timetable' && filters.status === 'Active' && summary.upcoming > 0 && !isFiltered && (
        <button
          type="button"
          onClick={() => setFilter('status', 'Upcoming')}
          className="self-start font-label-md text-label-md text-primary hover:underline"
        >
          Show {pluralize(summary.upcoming, 'upcoming batch', 'upcoming batches')} →
        </button>
      )}
    </div>
  );
}
