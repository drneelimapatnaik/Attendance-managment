/**
 * Attendance Reports (/reports/attendance).
 *
 * Filters (URL): date-range preset or custom from–to, grade, batch.
 * KPIs: overall attendance % (vs the previous period of equal length),
 * sessions held, students below threshold, late arrivals %.
 * Charts: daily attendance % with the threshold line; attendance by batch.
 * Tabs: "Student summary" (sortable table + CSV) and "Register" (students ×
 * session dates grid for one batch).
 */
import { useSearchParams } from 'react-router-dom';
import { Button, Card, CardHeader, EmptyState, PageHeader, StatCard, Tabs } from '@/components/ui';
import { BarList } from '@/components/charts';
import { useLookups, useScopedData, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { formatPercent, pluralize } from '@/lib/format';
import { pointsDelta } from './attendanceStats';
import { REPORT_MIN_SESSIONS, useAttendanceReport, useReportFilters, type ReportTab } from './useAttendanceReport';
import { AttendanceRegister } from './components/AttendanceRegister';
import { AttendanceTrendChart } from './components/AttendanceTrendChart';
import { ReportFiltersBar } from './components/ReportFiltersBar';
import { StudentSummaryTable, exportStudentSummary } from './components/StudentSummaryTable';

export default function AttendanceReportsPage() {
  useDocumentTitle('Attendance Reports');
  const settings = useSettings();
  const lookups = useLookups();
  const { batches } = useScopedData();
  const [params] = useSearchParams();
  const api = useReportFilters();
  const { filters } = api;
  const report = useAttendanceReport(filters);
  const threshold = settings.attendance.lowAttendanceThreshold;
  const fileStem = `attendance-${filters.window.from}-to-${filters.window.to}`;
  const period = api.windowDays === 1 ? 'vs previous day' : `vs prev. ${api.windowDays} days`;
  const selectedBatch = filters.batch ? lookups.batch.get(filters.batch) : undefined;
  const rateDelta = pointsDelta(report.rate, report.prevRate);
  const lateDelta = pointsDelta(report.lateShare, report.prevLateShare);
  // The register's batch picker ignores the batch filter (it *sets* it) but respects grade.
  const registerOptions = batches
    .filter((b) => b.status !== 'Upcoming' && (!filters.grade || b.grade === filters.grade))
    .sort((a, b) => a.code.localeCompare(b.code));

  // Batch bars drill into that batch, keeping the rest of the view.
  const batchHref = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('batch', id);
    return `?${next.toString()}`;
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Analytics & Reports"
        title="Attendance Reports"
        meta={api.windowLabel}
        actions={
          <Button
            variant="tonal"
            icon="download"
            disabled={!report.students.length}
            onClick={() => exportStudentSummary(report.students, fileStem, (id) => lookups.batch.get(id)?.name ?? id)}
          >
            Export CSV
          </Button>
        }
      />

      <ReportFiltersBar api={api} />

      <div className="grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-4">
        <StatCard
          label="Overall attendance"
          icon="how_to_reg"
          value={<span className="tnum">{formatPercent(report.rate, 1)}</span>}
          hint={period}
          delta={rateDelta}
        />
        <StatCard
          label="Sessions held"
          icon="event_available"
          value={<span className="tnum">{report.sessions.length}</span>}
          hint={`${pluralize(report.batches.length, 'batch', 'batches')} · ${pluralize(report.daily.length, 'class day')}`}
        />
        <StatCard
          label="Below threshold"
          icon="trending_down"
          value={<span className="tnum">{report.below.length}</span>}
          hint={`Students under ${threshold}% (min. ${REPORT_MIN_SESSIONS} sessions)`}
        />
        <StatCard
          label="Late arrivals"
          icon="schedule"
          value={<span className="tnum">{formatPercent(report.lateShare, 1)}</span>}
          hint={`${report.counts.L} late of ${report.counts.P + report.counts.L} attended`}
          delta={lateDelta && { ...lateDelta, goodWhen: 'down' }}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <Card className="min-w-0 xl:col-span-8">
          <CardHeader title="Daily attendance" icon="show_chart" subtitle={`${api.windowLabel} · class days only`} />
          <div className="mt-space-md">
            {report.daily.length ? (
              <AttendanceTrendChart
                points={report.daily}
                threshold={threshold}
                height={260}
                ariaLabel="Daily attendance percentage for the selected period"
              />
            ) : (
              <EmptyState compact icon="show_chart" title="No sessions in this period" description="Try a wider date range." />
            )}
          </div>
        </Card>
        <Card className="min-w-0 xl:col-span-4">
          <CardHeader title="By batch" icon="leaderboard" subtitle={selectedBatch ? 'Filtered to one batch' : 'Highest first'} />
          {report.batches.length ? (
            <BarList
              className="mt-space-md"
              threshold={threshold / 100}
              thresholdLabel={`Below ${threshold}%`}
              items={report.batches.map((b) => ({
                id: b.batch.id,
                label: b.batch.name,
                sublabel: `${b.sessions} sessions`,
                value: b.rate,
                to: batchHref(b.batch.id),
              }))}
            />
          ) : (
            <EmptyState compact icon="leaderboard" title="No batches in scope" />
          )}
        </Card>
      </div>

      <Tabs<ReportTab>
        value={filters.tab}
        onChange={api.setTab}
        ariaLabel="Report views"
        items={[
          { value: 'summary', label: 'Student summary', icon: 'groups', count: report.students.length },
          { value: 'register', label: 'Register', icon: 'table_chart' },
        ]}
      />

      {filters.tab === 'summary' ? (
        <StudentSummaryTable
          rows={report.students}
          threshold={threshold}
          belowOnly={filters.below}
          onBelowOnly={api.setBelow}
          fileStem={fileStem}
          isFiltered={api.isFiltered}
          onReset={api.reset}
        />
      ) : (
        <AttendanceRegister
          batch={selectedBatch}
          sessions={report.sessions}
          windowTo={filters.window.to}
          batchOptions={registerOptions}
          onPickBatch={api.setBatch}
          fileStem={fileStem}
        />
      )}
    </div>
  );
}
