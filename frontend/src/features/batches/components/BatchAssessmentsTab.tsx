/**
 * Batch detail › Assessments: average-score trend plus the list of tests
 * (date, type, max marks, turnout, average %, pass rate, highest). Users with
 * `performance.manage` can record a new assessment or edit one via the
 * global assessment form.
 */
import { useMemo } from 'react';
import type { Assessment, Batch } from '@/types/domain';
import { Badge, Button, ButtonLink, Card, CardHeader, DataTable, EmptyState, IconButton, ProgressBar, type Column } from '@/components/ui';
import { LineChart } from '@/components/charts';
import { useCan } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useUiStore } from '@/store/uiStore';
import { assessmentStats, PASS_MARK, type AssessmentStats } from '@/domain/academics';
import { formatDate, formatDayMonth } from '@/lib/date';
import { formatPercent } from '@/lib/format';

interface Row {
  assessment: Assessment;
  stats: AssessmentStats;
}

export function BatchAssessmentsTab({ batch }: { batch: Batch }) {
  const can = useCan();
  const openModal = useUiStore((s) => s.openModal);
  const assessments = useDataStore((s) => s.assessments);
  const canRecord = can('performance.manage');

  const rows = useMemo<Row[]>(
    () =>
      assessments
        .filter((a) => a.batchId === batch.id)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((assessment) => ({ assessment, stats: assessmentStats(assessment) })),
    [assessments, batch.id],
  );
  const scored = rows.filter((r) => Number.isFinite(r.stats.average));

  const record = () => openModal({ type: 'assessment-form', batchId: batch.id });
  const edit = (a: Assessment) => openModal({ type: 'assessment-form', batchId: batch.id, assessmentId: a.id });

  const columns: Column<Row>[] = [
    {
      key: 'title',
      header: 'Assessment',
      sortValue: (r) => r.assessment.title,
      headerClassName: 'min-w-[200px]',
      cell: ({ assessment: a }) => (
        <>
          <span className="block font-label-lg text-label-lg text-on-surface">{a.title}</span>
          <Badge tone="surface" className="mt-0.5">
            {a.type}
          </Badge>
        </>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (r) => r.assessment.date,
      className: 'whitespace-nowrap',
      cell: ({ assessment: a }) => <span className="font-body-md text-body-md text-on-surface-variant">{formatDate(a.date)}</span>,
    },
    {
      key: 'max',
      header: 'Max',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.assessment.maxMarks,
      className: 'tnum',
      cell: ({ assessment: a }) => <span className="font-body-md text-body-md text-on-surface">{a.maxMarks}</span>,
    },
    {
      key: 'appeared',
      header: 'Appeared',
      align: 'right',
      hideBelow: 'xl',
      className: 'whitespace-nowrap tnum',
      cell: ({ stats }) => (
        <span className="font-body-md text-body-md text-on-surface">
          {stats.appeared}
          <span className="text-secondary">/{stats.appeared + stats.absent}</span>
        </span>
      ),
    },
    {
      key: 'average',
      header: 'Average',
      sortValue: (r) => (Number.isFinite(r.stats.average) ? r.stats.average : -1),
      headerClassName: 'min-w-[120px]',
      cell: ({ assessment: a, stats }) => (
        <div className="flex flex-col gap-1">
          <span className="font-label-md text-label-md text-on-surface tnum">{formatPercent(stats.average)}</span>
          <ProgressBar value={stats.average} label={`${a.title} average`} />
        </div>
      ),
    },
    {
      key: 'pass',
      header: 'Pass rate',
      align: 'right',
      sortValue: (r) => (Number.isFinite(r.stats.passRate) ? r.stats.passRate : -1),
      className: 'tnum',
      cell: ({ stats }) => <span className="font-body-md text-body-md text-on-surface">{formatPercent(stats.passRate)}</span>,
    },
    {
      key: 'high',
      header: 'Highest',
      align: 'right',
      hideBelow: 'lg',
      className: 'whitespace-nowrap tnum',
      cell: ({ assessment: a, stats }) => (
        <span className="font-body-md text-body-md text-on-surface">
          {stats.appeared ? stats.highest : '—'}
          <span className="text-secondary">/{a.maxMarks}</span>
        </span>
      ),
    },
    ...(canRecord
      ? [
          {
            key: 'edit',
            header: <span className="sr-only">Edit</span>,
            align: 'right' as const,
            cell: ({ assessment: a }: Row) => <IconButton icon="edit" label={`Edit ${a.title}`} size="sm" onClick={() => edit(a)} />,
          },
        ]
      : []),
  ];

  const mobileCard = ({ assessment: a, stats }: Row) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <div className="min-w-0">
          <p className="font-label-lg text-label-lg text-on-surface">{a.title}</p>
          <p className="font-body-sm text-body-sm text-secondary">
            {a.type} · {formatDate(a.date)} · max {a.maxMarks}
          </p>
        </div>
        {canRecord && <IconButton icon="edit" label={`Edit ${a.title}`} size="sm" onClick={() => edit(a)} />}
      </div>
      <div className="flex items-center gap-space-sm">
        <span className="shrink-0 font-label-md text-label-md text-on-surface tnum">Avg {formatPercent(stats.average)}</span>
        <ProgressBar value={stats.average} label={`${a.title} average`} className="flex-1" />
        <span className="shrink-0 font-body-sm text-body-sm text-secondary tnum">Pass {formatPercent(stats.passRate)}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-space-md">
      <Card className="flex flex-col gap-space-md">
        <CardHeader
          title="Average score trend"
          icon="insights"
          subtitle={`Class average per assessment · pass mark ${formatPercent(PASS_MARK)}`}
          actions={
            <>
              {can('performance.view') && (
                <ButtonLink to={`/reports/performance?batch=${batch.id}`} variant="ghost" size="sm" className="hidden sm:inline-flex">
                  Performance report
                </ButtonLink>
              )}
              {canRecord && batch.status !== 'Archived' && (
                <Button size="sm" icon="add" onClick={record}>
                  Record assessment
                </Button>
              )}
            </>
          }
        />
        {scored.length >= 2 ? (
          <LineChart
            labels={scored.map((r) => formatDayMonth(r.assessment.date))}
            series={[{ id: 'avg', label: 'Class average', values: scored.map((r) => r.stats.average * 100) }]}
            yMax={100}
            formatValue={(v) => `${Math.round(v)}%`}
            tooltipTitle={(i) => scored[i].assessment.title}
            reference={{ value: PASS_MARK * 100, label: 'Pass mark' }}
            ariaLabel={`${batch.name} average score per assessment`}
            height={200}
          />
        ) : (
          <p className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-secondary">
            The trend appears once two or more assessments have scores.
          </p>
        )}
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.assessment.id}
        mobileCard={mobileCard}
        entityLabel="assessments"
        initialSort={{ key: 'date', dir: 'desc' }}
        caption={`${batch.name} assessments`}
        empty={
          <EmptyState
            icon="quiz"
            title="No assessments yet"
            description="Record a quiz, unit test or mock exam to track how this batch is doing."
            action={
              canRecord && batch.status !== 'Archived' ? (
                <Button icon="add" onClick={record}>
                  Record assessment
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
