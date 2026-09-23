/**
 * Performance Analytics (/reports/performance).
 *
 * URL filters (batch, type, date range) drive everything: KPI tiles, the
 * score trend (one batch, or up to three compared), the grade distribution,
 * and two views — the assessments register (row → detail dialog) and
 * per-student averages joined with 30-day attendance.
 */
import { useState } from 'react';
import type { ID } from '@/types/domain';
import { Sparkline } from '@/components/charts';
import { Button, PageHeader, ProgressBar, StatCard, Tabs } from '@/components/ui';
import { useCan, useLookups, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle, useIsMobile } from '@/hooks/ui';
import { useUiStore } from '@/store/uiStore';
import { PASS_MARK } from '@/domain/academics';
import { AssessmentDetailModal } from './AssessmentDetailModal';
import { AssessmentsTable } from './components/AssessmentsTable';
import { GradeDistributionCard } from './components/GradeDistributionCard';
import { PerformanceFilters } from './components/PerformanceFilters';
import { ScoreTrendCard } from './components/ScoreTrendCard';
import { StudentPerformance } from './components/StudentPerformance';
import { exportAssessments, exportStudentPerformance } from './exportPerformance';
import { AT_RISK_BELOW, pct } from './gradeBands';
import { usePerformanceData, usePerformanceFilters, useStudentSearch, type PerfTab } from './usePerformance';

export default function PerformancePage() {
  useDocumentTitle('Performance Analytics');
  const can = useCan();
  const settings = useSettings();
  const lookups = useLookups();
  const openModal = useUiStore((s) => s.openModal);
  const { filters, setFilter, reset, isFiltered } = usePerformanceFilters();
  const { rows, students, kpis, gradeCounts, batchOptions } = usePerformanceData(filters);
  const visibleStudents = useStudentSearch(students, filters.q);
  const [detailId, setDetailId] = useState<ID | null>(null);
  const isMobile = useIsMobile();

  const batchesInView = new Set(rows.map((r) => r.assessment.batchId)).size;
  const exportRows = filters.tab === 'assessments' ? rows : visibleStudents;
  const exportCurrent = () => {
    if (filters.tab === 'assessments') exportAssessments(rows, settings.name);
    else exportStudentPerformance(visibleStudents, lookups.batch, settings.name);
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Analytics & Reports"
        title="Performance Analytics"
        meta={`${kpis.held} assessments in view`}
        actions={
          <>
            <Button variant="tonal" icon="download" onClick={exportCurrent} disabled={!exportRows.length}>
              Export CSV
            </Button>
            {can('performance.manage') && (
              <Button icon="add_task" onClick={() => openModal({ type: 'assessment-form', batchId: filters.batch || undefined })}>
                Record Assessment
              </Button>
            )}
          </>
        }
      />

      <PerformanceFilters filters={filters} setFilter={setFilter} batchOptions={batchOptions} onReset={reset} isFiltered={isFiltered} />

      <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2 md:gap-space-md xl:grid-cols-4">
        <StatCard
          label="Average score"
          icon="percent"
          value={pct(kpis.average)}
          hint={`${kpis.scripts} scripts graded · monthly trend`}
          trend={kpis.monthlyAverage.length > 1 && <Sparkline values={kpis.monthlyAverage} min={0} max={1} height={28} />}
        />
        <StatCard
          label="Pass rate"
          icon="task_alt"
          value={pct(kpis.passRate)}
          hint={`Scripts scoring ${PASS_MARK * 100}% or more`}
          trend={
            Number.isFinite(kpis.passRate) && (
              <ProgressBar value={kpis.passRate} tone="auto" thresholds={{ danger: 0.6, warning: 0.8 }} label="Pass rate" />
            )
          }
        />
        <StatCard
          label="Assessments held"
          icon="assignment"
          value={kpis.held}
          hint={batchesInView ? `Across ${batchesInView} batch${batchesInView === 1 ? '' : 'es'}` : 'None in this view'}
        />
        <StatCard
          label="Students at risk"
          icon="flag"
          value={<span className={kpis.atRisk ? 'text-error' : undefined}>{kpis.atRisk}</span>}
          hint={`Average below ${AT_RISK_BELOW * 100}% · ${kpis.belowPass} below the ${PASS_MARK * 100}% pass mark`}
        />
      </div>

      <div className="grid grid-cols-1 gap-space-md xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ScoreTrendCard rows={rows} batchOptions={batchOptions} filters={filters} setFilter={setFilter} />
        </div>
        <GradeDistributionCard counts={gradeCounts} />
      </div>

      <Tabs<PerfTab>
        value={filters.tab}
        onChange={(tab) => setFilter('tab', tab)}
        ariaLabel="Performance views"
        // Icons are dropped on phones so both tabs fit without scrolling.
        items={[
          { value: 'assessments', label: 'Assessments', icon: isMobile ? undefined : 'assignment', count: rows.length },
          { value: 'students', label: 'Students', icon: isMobile ? undefined : 'school', count: students.length },
        ]}
      />

      {filters.tab === 'assessments' ? (
        <AssessmentsTable rows={rows} onOpen={setDetailId} isFiltered={isFiltered} onReset={reset} batchId={filters.batch || undefined} />
      ) : (
        <StudentPerformance rows={students} visible={visibleStudents} filters={filters} setFilter={setFilter} />
      )}

      <AssessmentDetailModal assessmentId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
