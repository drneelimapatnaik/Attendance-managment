/**
 * Assessments register for the current filter: one row per test with its
 * turnout, average, pass rate and top score. Row → assessment detail dialog.
 */
import { Badge, Button, DataTable, EmptyState, ProgressBar, Tag, type Column } from '@/components/ui';
import { PASS_MARK } from '@/domain/academics';
import { formatDate } from '@/lib/date';
import { useCan } from '@/hooks/useTenant';
import { useUiStore } from '@/store/uiStore';
import { pct } from '../gradeBands';
import { TYPE_ICON, type AssessmentRow } from '../usePerformance';

interface Props {
  rows: AssessmentRow[];
  onOpen: (assessmentId: string) => void;
  isFiltered: boolean;
  onReset: () => void;
  batchId?: string;
}

export function AssessmentsTable({ rows, onOpen, isFiltered, onReset, batchId }: Props) {
  const can = useCan();
  const openModal = useUiStore((s) => s.openModal);

  const columns: Column<AssessmentRow>[] = [
    {
      key: 'title',
      header: 'Assessment',
      sortValue: (r) => r.assessment.title,
      headerClassName: 'min-w-[200px]',
      cell: ({ assessment: a }) => (
        <>
          <span className="block font-label-lg text-label-lg text-on-surface">{a.title}</span>
          <span className="font-body-sm text-body-sm text-secondary">
            {a.topicIds.length ? `${a.topicIds.length} topic${a.topicIds.length === 1 ? '' : 's'} covered` : 'No topics tagged'}
          </span>
        </>
      ),
    },
    {
      key: 'batch',
      header: 'Batch',
      sortValue: (r) => r.batch?.code ?? '',
      cell: ({ batch }) => (batch ? <Tag title={batch.title}>{batch.name}</Tag> : '—'),
    },
    {
      key: 'type',
      header: 'Type',
      hideBelow: 'xl',
      sortValue: (r) => r.assessment.type,
      cell: ({ assessment: a }) => (
        <Badge tone="surface" icon={TYPE_ICON[a.type]}>
          {a.type}
        </Badge>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (r) => r.assessment.date,
      className: 'whitespace-nowrap',
      cell: ({ assessment: a }) => formatDate(a.date),
    },
    {
      key: 'max',
      header: 'Max',
      align: 'right',
      hideBelow: '2xl',
      sortValue: (r) => r.assessment.maxMarks,
      className: 'tnum',
      cell: ({ assessment: a }) => a.maxMarks,
    },
    {
      key: 'appeared',
      header: 'Appeared',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.stats.appeared,
      className: 'whitespace-nowrap tnum',
      cell: ({ stats }) => (
        <>
          <span className="block text-on-surface">
            {stats.appeared}/{stats.appeared + stats.absent}
          </span>
          {stats.absent > 0 && <span className="font-body-sm text-body-sm text-secondary">{stats.absent} absent</span>}
        </>
      ),
    },
    {
      key: 'average',
      header: 'Average',
      sortValue: (r) => (Number.isFinite(r.stats.average) ? r.stats.average : -1),
      className: 'whitespace-nowrap',
      cell: ({ stats }) => (
        <div className="flex w-24 flex-col gap-1">
          <span className="font-label-lg text-label-lg text-on-surface tnum">{pct(stats.average)}</span>
          <ProgressBar value={stats.average} tone="auto" thresholds={{ danger: PASS_MARK, warning: 0.6 }} size="xs" label="Average score" />
        </div>
      ),
    },
    {
      key: 'pass',
      header: 'Pass rate',
      align: 'right',
      sortValue: (r) => (Number.isFinite(r.stats.passRate) ? r.stats.passRate : -1),
      className: 'tnum',
      // Flag tests that half the class failed.
      cell: ({ stats }) => <span className={stats.passRate < 0.5 ? 'font-semibold text-error' : undefined}>{pct(stats.passRate)}</span>,
    },
    {
      key: 'highest',
      header: 'Highest',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (r) => r.stats.highest / r.assessment.maxMarks,
      className: 'whitespace-nowrap tnum',
      cell: ({ stats, assessment: a }) => (stats.appeared ? `${stats.highest}/${a.maxMarks}` : '—'),
    },
  ];

  const mobileCard = ({ assessment: a, batch, stats }: AssessmentRow) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <div className="min-w-0">
          <p className="font-label-lg text-label-lg text-on-surface">{a.title}</p>
          <p className="font-body-sm text-body-sm text-secondary">
            {formatDate(a.date)} · {a.type} · max {a.maxMarks}
          </p>
        </div>
        {batch && <Tag className="shrink-0">{batch.name}</Tag>}
      </div>
      <div className="grid grid-cols-3 gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-space-xs">
        {[
          { label: 'Average', value: pct(stats.average) },
          { label: 'Pass rate', value: pct(stats.passRate) },
          { label: 'Appeared', value: `${stats.appeared}/${stats.appeared + stats.absent}` },
        ].map((x) => (
          <div key={x.label}>
            <span className="block font-label-sm text-label-sm uppercase tracking-wider text-secondary">{x.label}</span>
            <span className="font-label-lg text-label-lg text-on-surface tnum">{x.value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.assessment.id}
      onRowClick={(r) => onOpen(r.assessment.id)}
      rowClassName={(r) => (r.stats.average < PASS_MARK ? 'bg-error-container/20' : undefined)}
      mobileCard={mobileCard}
      entityLabel="assessments"
      initialSort={{ key: 'date', dir: 'desc' }}
      caption="Assessments"
      empty={
        <EmptyState
          icon="assignment"
          title={isFiltered ? 'No assessments match these filters' : 'No assessments recorded yet'}
          description={isFiltered ? 'Try another batch, type or date range.' : 'Record a test to start tracking performance.'}
          action={
            isFiltered ? (
              <Button variant="tonal" icon="filter_alt_off" onClick={onReset}>
                Reset filters
              </Button>
            ) : can('performance.manage') ? (
              <Button icon="add" onClick={() => openModal({ type: 'assessment-form', batchId })}>
                Record assessment
              </Button>
            ) : undefined
          }
        />
      }
    />
  );
}
