/**
 * "Dues" tab: every student in the campus with an outstanding balance, with
 * pending vs overdue money, how long it has been overdue and quick actions
 * (Collect → Record Payment, Remind → SMS/WhatsApp). Row → fee ledger.
 */
import { useNavigate } from 'react-router-dom';
import { Button, DataTable, EmptyState, IconButton, SegmentedControl, SelectField, type Column } from '@/components/ui';
import { BatchTags, FeeStatusBadge, PersonCell } from '@/components/domain';
import { useCan, useMoney } from '@/hooks/useTenant';
import { useUiStore } from '@/store/uiStore';
import { formatDate } from '@/lib/date';
import { useFeeReminder } from '@/features/students/components/StudentQuickActions';
import type { DueFilter, DueRow, FeeFilters, SetFeeFilter } from '../useFees';
import { useFeeBatchOptions } from '../useFees';
import { DebouncedSearch } from '@/components/ui';

interface Props {
  rows: DueRow[];
  filters: FeeFilters;
  setFilter: SetFeeFilter;
  onReset: () => void;
  isFiltered: boolean;
}

export function DuesTab({ rows, filters, setFilter, onReset, isFiltered }: Props) {
  const navigate = useNavigate();
  const can = useCan();
  const money = useMoney();
  const openModal = useUiStore((s) => s.openModal);
  const remind = useFeeReminder();
  const batchOptions = useFeeBatchOptions();

  const actions = ({ student, fee }: DueRow) => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <IconButton
        icon="sms"
        label={`Send fee reminder to ${student.guardian.name}`}
        size="sm"
        tone="primary"
        onClick={() => remind(student, fee, fee.status === 'Overdue')}
      />
      {can('fees.collect') && (
        <Button size="sm" variant="tonal" icon="payments" onClick={() => openModal({ type: 'record-payment', studentId: student.id })}>
          Collect
        </Button>
      )}
    </div>
  );

  const columns: Column<DueRow>[] = [
    {
      key: 'student',
      header: 'Student',
      sortValue: (r) => r.student.name,
      headerClassName: 'min-w-[200px]',
      cell: ({ student: s }) => (
        <PersonCell name={s.name} subtitle={`${s.id} · ${s.grade}`} photoUrl={s.photoUrl} dimmed={s.status !== 'Active'} size="sm" />
      ),
    },
    {
      key: 'batches',
      header: 'Batches',
      hideBelow: 'xl',
      className: 'whitespace-nowrap',
      cell: ({ student: s }) => <BatchTags batchIds={s.batchIds} withSubject={false} />,
    },
    {
      key: 'pending',
      header: 'Pending',
      align: 'right',
      sortValue: (r) => r.fee.pending,
      className: 'whitespace-nowrap tnum',
      cell: ({ fee }) => (fee.pending ? money.format(fee.pending) : <span className="text-secondary">—</span>),
    },
    {
      key: 'overdue',
      header: 'Overdue',
      align: 'right',
      sortValue: (r) => r.fee.overdue,
      className: 'whitespace-nowrap tnum',
      cell: ({ fee }) =>
        fee.overdue ? (
          <span className="font-semibold text-error">{money.format(fee.overdue)}</span>
        ) : (
          <span className="text-secondary">—</span>
        ),
    },
    {
      key: 'days',
      header: 'Max overdue',
      align: 'right',
      sortValue: (r) => r.maxDaysOverdue,
      className: 'whitespace-nowrap tnum',
      cell: ({ maxDaysOverdue: d }) => (d ? `${d} day${d === 1 ? '' : 's'}` : <span className="text-secondary">—</span>),
    },
    {
      key: 'last',
      header: 'Last payment',
      hideBelow: 'lg',
      className: 'whitespace-nowrap',
      sortValue: (r) => r.fee.lastPaymentOn ?? '',
      cell: ({ fee }) => <span className="font-body-md text-body-md text-on-surface">{formatDate(fee.lastPaymentOn)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => (r.fee.status === 'Overdue' ? 0 : 1),
      cell: ({ fee }) => <FeeStatusBadge status={fee.status} />,
    },
    { key: 'actions', header: 'Actions', align: 'right', className: 'whitespace-nowrap', cell: actions },
  ];

  const mobileCard = (row: DueRow) => {
    const { student: s, fee, maxDaysOverdue } = row;
    return (
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-start justify-between gap-space-xs">
          <PersonCell name={s.name} subtitle={`${s.id} · ${s.grade}`} photoUrl={s.photoUrl} size="sm" />
          <FeeStatusBadge status={fee.status} amount={fee.outstanding} />
        </div>
        <div className="flex flex-wrap gap-x-space-md gap-y-1 font-body-sm text-body-sm text-secondary">
          {fee.overdue > 0 && (
            <span>
              Overdue <strong className="text-error tnum">{money.format(fee.overdue)}</strong> · {maxDaysOverdue}d
            </span>
          )}
          {fee.pending > 0 && (
            <span>
              Pending <strong className="text-on-surface tnum">{money.format(fee.pending)}</strong>
            </span>
          )}
          <span>Last paid {formatDate(fee.lastPaymentOn)}</span>
        </div>
        <div className="flex items-center justify-between gap-space-xs">
          <BatchTags batchIds={s.batchIds} withSubject={false} />
          {actions(row)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-space-md">
      <div className="card flex flex-col gap-space-sm p-space-md lg:flex-row lg:items-center">
        <DebouncedSearch
          value={filters.q}
          onCommit={(v) => setFilter('q', v)}
          placeholder="Search by student, ID or parent mobile…"
          className="flex-1"
        />
        <div className="flex flex-col gap-space-sm sm:flex-row sm:items-center">
          <SegmentedControl<DueFilter | 'all'>
            ariaLabel="Filter by due status"
            value={filters.due || 'all'}
            onChange={(v) => setFilter('due', v === 'all' ? '' : v)}
            segments={[
              { value: 'all', label: 'All' },
              { value: 'Overdue', label: 'Overdue', icon: 'error' },
              { value: 'Pending', label: 'Pending', icon: 'schedule' },
            ]}
            className="grid grid-cols-3 sm:inline-flex"
          />
          <div className="flex items-center gap-space-xs">
            <SelectField
              aria-label="Filter by batch"
              value={filters.batch}
              onChange={(e) => setFilter('batch', e.target.value)}
              options={[{ value: '', label: 'Batch: All Batches' }, ...batchOptions]}
              containerClassName="flex-1 sm:w-60 sm:flex-none"
            />
            <IconButton
              icon="filter_alt_off"
              label="Reset filters"
              disabled={!isFiltered}
              onClick={onReset}
              className="bg-surface-container"
            />
          </div>
        </div>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.student.id}
        onRowClick={(r) => navigate(`/students/${r.student.id}?tab=fees`)}
        rowClassName={(r) => (r.fee.status === 'Overdue' ? 'bg-error-container/20' : undefined)}
        mobileCard={mobileCard}
        entityLabel="students with dues"
        initialSort={{ key: 'overdue', dir: 'desc' }}
        caption="Students with outstanding fees"
        empty={
          <EmptyState
            icon={isFiltered ? 'person_search' : 'task_alt'}
            title={isFiltered ? 'No dues match these filters' : 'All dues cleared'}
            description={
              isFiltered ? 'Try a different search or reset the filters.' : 'Every student in this campus is paid up. Nice work!'
            }
            action={
              isFiltered ? (
                <Button variant="tonal" icon="filter_alt_off" onClick={onReset}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
