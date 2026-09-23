/**
 * "Students" view of Performance: top performers and students needing
 * attention (low scores or low 30-day attendance), then a searchable table of
 * every student's average, grade band, recent-score trend and attendance.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarList, Sparkline } from '@/components/charts';
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, type Column } from '@/components/ui';
import { AttendancePctBadge, BatchTags, PersonCell } from '@/components/domain';
import { useSettings } from '@/hooks/useTenant';
import { DebouncedSearch } from '@/components/ui';
import { AT_RISK_BELOW, GradeBadge, pct } from '../gradeBands';
import { type PerfFilters, type SetPerfFilter, type StudentPerfRow } from '../usePerformance';

interface Props {
  rows: StudentPerfRow[]; // everyone in view (drives the highlight cards)
  visible: StudentPerfRow[]; // after the search box (drives the table)
  filters: PerfFilters;
  setFilter: SetPerfFilter;
}

const profileLink = (id: string) => `/students/${id}?tab=performance`;

export function StudentPerformance({ rows, visible, filters, setFilter }: Props) {
  const navigate = useNavigate();
  const threshold = useSettings().attendance.lowAttendanceThreshold;

  const { top, attention } = useMemo(
    () => ({
      // Top performers need at least two results so one lucky quiz doesn't top the list.
      top: rows
        .filter((r) => r.taken >= 2)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5),
      attention: rows
        .filter((r) => r.needsAttention)
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 5),
    }),
    [rows],
  );
  const attLabel = (r: StudentPerfRow) => (Number.isFinite(r.attendance) ? `Att. ${pct(r.attendance)}` : 'No recent classes');

  const columns: Column<StudentPerfRow>[] = [
    {
      key: 'student',
      header: 'Student',
      sortValue: (r) => r.student.name,
      headerClassName: 'min-w-[200px]',
      cell: ({ student: s }) => <PersonCell name={s.name} subtitle={`${s.id} · ${s.grade}`} photoUrl={s.photoUrl} size="sm" />,
    },
    {
      key: 'batches',
      header: 'Batches',
      hideBelow: 'xl',
      className: 'whitespace-nowrap',
      cell: ({ student: s }) => <BatchTags batchIds={s.batchIds} withSubject={false} />,
    },
    {
      key: 'taken',
      header: 'Tests',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.taken,
      className: 'tnum',
      cell: (r) => r.taken,
    },
    {
      key: 'avg',
      header: 'Average',
      align: 'right',
      sortValue: (r) => r.avg,
      className: 'font-semibold text-on-surface tnum',
      cell: (r) => <span className={r.avg < AT_RISK_BELOW ? 'text-error' : undefined}>{pct(r.avg)}</span>,
    },
    { key: 'band', header: 'Grade', align: 'center', sortValue: (r) => r.avg, cell: (r) => <GradeBadge ratio={r.avg} /> },
    {
      key: 'trend',
      header: 'Last 5',
      hideBelow: 'lg',
      cell: (r) => (
        <div className="w-24" title={r.recent.map(pct).join(' → ')}>
          <Sparkline values={r.recent} min={0} max={1} height={28} />
        </div>
      ),
    },
    {
      key: 'att',
      header: 'Attendance 30d',
      align: 'center',
      sortValue: (r) => (Number.isFinite(r.attendance) ? r.attendance : -1),
      cell: (r) => <AttendancePctBadge ratio={r.attendance} threshold={threshold} />,
    },
    {
      key: 'flag',
      header: '',
      hideBelow: 'xl',
      cell: (r) =>
        r.needsAttention ? (
          <Badge tone="danger" icon="flag">
            Needs attention
          </Badge>
        ) : null,
    },
  ];

  const mobileCard = (r: StudentPerfRow) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <PersonCell name={r.student.name} subtitle={`${r.student.id} · ${r.taken} tests`} photoUrl={r.student.photoUrl} size="sm" />
        <div className="flex shrink-0 items-center gap-space-xs">
          <span className="font-title-md text-title-md text-on-surface tnum">{pct(r.avg)}</span>
          <GradeBadge ratio={r.avg} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-space-sm">
        <div className="flex flex-wrap items-center gap-space-xs">
          <AttendancePctBadge ratio={r.attendance} threshold={threshold} />
          {r.needsAttention && (
            <Badge tone="danger" icon="flag">
              Needs attention
            </Badge>
          )}
        </div>
        <div className="w-20 shrink-0">
          <Sparkline values={r.recent} min={0} max={1} height={24} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid gap-space-md md:grid-cols-2">
        <Card className="flex flex-col gap-space-md">
          <CardHeader title="Top performers" icon="emoji_events" subtitle="Highest averages (2+ assessments)" />
          {top.length ? (
            <BarList
              items={top.map((r) => ({
                id: r.student.id,
                label: r.student.name,
                sublabel: attLabel(r),
                value: r.avg,
                display: pct(r.avg),
                to: profileLink(r.student.id),
              }))}
            />
          ) : (
            <EmptyState compact icon="emoji_events" title="No results yet" />
          )}
        </Card>
        <Card className="flex flex-col gap-space-md">
          <CardHeader
            title="Needs attention"
            icon="flag"
            subtitle={`Average below ${AT_RISK_BELOW * 100}% or attendance below ${threshold}%`}
          />
          {attention.length ? (
            <BarList
              threshold={AT_RISK_BELOW}
              thresholdLabel={`Average below ${AT_RISK_BELOW * 100}%`}
              items={attention.map((r) => ({
                id: r.student.id,
                label: r.student.name,
                sublabel: attLabel(r),
                value: r.avg,
                display: pct(r.avg),
                to: profileLink(r.student.id),
              }))}
            />
          ) : (
            <EmptyState
              compact
              icon="sentiment_satisfied"
              title="Everyone is on track"
              description="No low scores or attendance in this view."
            />
          )}
        </Card>
      </div>

      <div className="card p-space-md">
        <DebouncedSearch value={filters.q} onCommit={(v) => setFilter('q', v)} placeholder="Search students by name or ID…" />
      </div>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.student.id}
        onRowClick={(r) => navigate(profileLink(r.student.id))}
        rowClassName={(r) => (r.needsAttention ? 'bg-error-container/20' : undefined)}
        mobileCard={mobileCard}
        entityLabel="students"
        initialSort={{ key: 'avg', dir: 'desc' }}
        caption="Student performance"
        empty={
          <EmptyState
            icon="person_search"
            title={filters.q ? 'No students match this search' : 'No scores in this view'}
            description={filters.q ? 'Try another name or ID.' : 'Students appear here once they have assessment results.'}
            action={
              filters.q ? (
                <Button variant="tonal" icon="close" onClick={() => setFilter('q', '')}>
                  Clear search
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
