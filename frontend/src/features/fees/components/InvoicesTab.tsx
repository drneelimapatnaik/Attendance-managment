/**
 * "Invoices" tab: the full invoice register with period / status / batch
 * filters, a totals strip for the current filter, collect and waive /
 * reinstate actions (fees.collect, confirmed, undoable).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ConfirmDialog, DataTable, EmptyState, IconButton, SelectField, Tag, type Column } from '@/components/ui';
import { PersonCell } from '@/components/domain';
import { useCan, useMoney } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast, useUiStore } from '@/store/uiStore';
import { formatDate, formatPeriod } from '@/lib/date';
import type { FeeFilters, InvoiceRow, InvoiceStatusFilter, SetFeeFilter } from '../useFees';
import { useFeeBatchOptions } from '../useFees';
import { DebouncedSearch } from '@/components/ui';
import { InvoiceStatusBadge } from './FeeBadges';

interface Props {
  rows: InvoiceRow[];
  periods: string[];
  filters: FeeFilters;
  setFilter: SetFeeFilter;
  onReset: () => void;
  isFiltered: boolean;
}

const STATUS_OPTIONS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: '', label: 'Status: All' },
  { value: 'Unpaid', label: 'Unpaid (pending + overdue)' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Paid', label: 'Paid' },
  { value: 'Waived', label: 'Waived' },
];

export function InvoicesTab({ rows, periods, filters, setFilter, onReset, isFiltered }: Props) {
  const navigate = useNavigate();
  const can = useCan();
  const money = useMoney();
  const toast = useToast();
  const openModal = useUiStore((s) => s.openModal);
  const waiveInvoice = useDataStore((s) => s.waiveInvoice);
  const batchOptions = useFeeBatchOptions();
  const [waiveTarget, setWaiveTarget] = useState<InvoiceRow | null>(null);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, { view }) => ({
          billed: t.billed + (view.invoice.waived ? 0 : view.invoice.amount),
          paid: t.paid + view.paid,
          balance: t.balance + view.balance,
        }),
        { billed: 0, paid: 0, balance: 0 },
      ),
    [rows],
  );

  const confirmWaive = () => {
    if (!waiveTarget) return;
    const inv = waiveTarget.view.invoice;
    const next = !inv.waived;
    waiveInvoice(inv.id, next);
    setWaiveTarget(null);
    toast({
      title: next ? `Invoice ${inv.id} waived` : `Invoice ${inv.id} reinstated`,
      description: next
        ? `${money.format(waiveTarget.view.balance)} written off for ${waiveTarget.student?.name ?? 'the student'}.`
        : 'The balance is due again.',
      action: { label: 'Undo', onClick: () => waiveInvoice(inv.id, !next) },
    });
  };

  const actions = (row: InvoiceRow) => {
    const { view, student } = row;
    if (!can('fees.collect')) return null;
    return (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {view.balance > 0 && (
          <IconButton
            icon="payments"
            label="Collect payment"
            size="sm"
            tone="primary"
            onClick={() => openModal({ type: 'record-payment', studentId: student?.id, invoiceId: view.invoice.id })}
          />
        )}
        {view.invoice.waived ? (
          <IconButton icon="undo" label="Reinstate invoice" size="sm" onClick={() => setWaiveTarget(row)} />
        ) : (
          view.balance > 0 && (
            <IconButton icon="money_off" label="Waive invoice" size="sm" tone="danger" onClick={() => setWaiveTarget(row)} />
          )
        )}
      </div>
    );
  };

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'id',
      header: 'Invoice',
      sortValue: (r) => r.view.invoice.id,
      className: 'whitespace-nowrap',
      cell: ({ view }) => (
        <>
          <span className="block font-label-md text-label-md font-semibold text-on-surface tnum">{view.invoice.id}</span>
          <span className="font-body-sm text-body-sm text-secondary">{formatPeriod(view.invoice.period)}</span>
        </>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      sortValue: (r) => r.student?.name ?? '',
      headerClassName: 'min-w-[180px]',
      cell: ({ student, view }) => (
        <PersonCell name={student?.name ?? view.invoice.studentId} subtitle={student?.id} photoUrl={student?.photoUrl} size="sm" />
      ),
    },
    {
      key: 'batch',
      header: 'Batch',
      hideBelow: 'lg',
      sortValue: (r) => r.batch?.code ?? '',
      cell: ({ batch }) => (batch ? <Tag title={batch.title}>{batch.name}</Tag> : '—'),
    },
    {
      key: 'issued',
      header: 'Issued',
      hideBelow: '2xl',
      sortValue: (r) => r.view.invoice.issuedOn,
      className: 'whitespace-nowrap',
      cell: ({ view }) => formatDate(view.invoice.issuedOn),
    },
    {
      key: 'due',
      header: 'Due',
      hideBelow: 'xl',
      sortValue: (r) => r.view.invoice.dueDate,
      className: 'whitespace-nowrap',
      cell: ({ view }) => formatDate(view.invoice.dueDate),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (r) => r.view.invoice.amount,
      className: 'whitespace-nowrap tnum',
      cell: ({ view }) => (
        <span className={view.invoice.waived ? 'text-secondary line-through' : undefined}>{money.format(view.invoice.amount)}</span>
      ),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      hideBelow: 'xl',
      sortValue: (r) => r.view.paid,
      className: 'whitespace-nowrap tnum',
      cell: ({ view }) => money.format(view.paid),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      sortValue: (r) => r.view.balance,
      className: 'whitespace-nowrap tnum',
      cell: ({ view }) =>
        view.balance ? (
          <span className={view.status === 'Overdue' ? 'font-semibold text-error' : 'font-semibold text-on-surface'}>
            {money.format(view.balance)}
          </span>
        ) : (
          <span className="text-secondary">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => (r.view.invoice.waived ? 'Waived' : r.view.status),
      cell: ({ view }) => <InvoiceStatusBadge view={view} />,
    },
    { key: 'actions', header: '', align: 'right', className: 'whitespace-nowrap', cell: actions },
  ];

  const mobileCard = (row: InvoiceRow) => {
    const { view, student, batch } = row;
    return (
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-start justify-between gap-space-xs">
          <div className="min-w-0">
            <p className="truncate font-label-lg text-label-lg text-on-surface">{student?.name ?? view.invoice.studentId}</p>
            <p className="font-body-sm text-body-sm text-secondary tnum">
              {view.invoice.id} · {formatPeriod(view.invoice.period)}
              {batch && ` · ${batch.name}`}
            </p>
          </div>
          <InvoiceStatusBadge view={view} />
        </div>
        <div className="flex items-end justify-between gap-space-xs">
          <p className="font-body-sm text-body-sm text-secondary">
            Due {formatDate(view.invoice.dueDate)} · {money.format(view.paid)} of {money.format(view.invoice.amount)} paid
            {view.balance > 0 && (
              <strong className={view.status === 'Overdue' ? 'block text-error tnum' : 'block text-on-surface tnum'}>
                Balance {money.format(view.balance)}
              </strong>
            )}
          </p>
          {actions(row)}
        </div>
      </div>
    );
  };

  const waiving = waiveTarget && !waiveTarget.view.invoice.waived;

  return (
    <div className="flex flex-col gap-space-md">
      <div className="card flex flex-col gap-space-sm p-space-md xl:flex-row xl:items-center">
        <DebouncedSearch
          value={filters.q}
          onCommit={(v) => setFilter('q', v)}
          placeholder="Search by invoice no., student or ID…"
          className="flex-1"
        />
        <div className="flex items-center gap-space-xs">
          <div className="grid flex-1 grid-cols-1 gap-space-xs sm:grid-cols-3 xl:w-[40rem] xl:flex-none">
            <SelectField
              aria-label="Filter by billing month"
              value={filters.period}
              onChange={(e) => setFilter('period', e.target.value)}
              options={[{ value: '', label: 'Month: All' }, ...periods.map((p) => ({ value: p, label: formatPeriod(p) }))]}
            />
            <SelectField
              aria-label="Filter by status"
              value={filters.status}
              onChange={(e) => setFilter('status', e.target.value as InvoiceStatusFilter)}
              options={STATUS_OPTIONS}
            />
            <SelectField
              aria-label="Filter by batch"
              value={filters.batch}
              onChange={(e) => setFilter('batch', e.target.value)}
              options={[{ value: '', label: 'Batch: All Batches' }, ...batchOptions]}
            />
          </div>
          <IconButton
            icon="filter_alt_off"
            label="Reset filters"
            disabled={!isFiltered}
            onClick={onReset}
            className="hidden shrink-0 bg-surface-container sm:inline-flex"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-space-lg gap-y-1 px-space-2xs font-body-md text-body-md text-secondary">
        <span>
          <strong className="text-on-surface tnum">{rows.length}</strong> invoices
        </span>
        <span>
          Billed <strong className="text-on-surface tnum">{money.format(totals.billed)}</strong>
        </span>
        <span>
          Collected <strong className="text-on-surface tnum">{money.format(totals.paid)}</strong>
        </span>
        <span>
          Balance <strong className={totals.balance ? 'text-error tnum' : 'text-on-surface tnum'}>{money.format(totals.balance)}</strong>
        </span>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.view.invoice.id}
        onRowClick={(r) => r.student && navigate(`/students/${r.student.id}?tab=fees`)}
        rowClassName={(r) => (r.view.status === 'Overdue' && !r.view.invoice.waived ? 'bg-error-container/20' : undefined)}
        mobileCard={mobileCard}
        entityLabel="invoices"
        initialSort={{ key: 'id', dir: 'desc' }}
        caption="Fee invoices"
        empty={
          <EmptyState
            icon="receipt_long"
            title={isFiltered ? 'No invoices match these filters' : 'No invoices yet'}
            description={isFiltered ? 'Try another month, status or batch.' : 'Use “Issue Invoices” to bill this month’s tuition.'}
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

      <ConfirmDialog
        open={!!waiveTarget}
        onClose={() => setWaiveTarget(null)}
        onConfirm={confirmWaive}
        tone={waiving ? 'danger' : 'primary'}
        title={waiving ? 'Waive this invoice?' : 'Reinstate this invoice?'}
        confirmLabel={waiving ? 'Waive invoice' : 'Reinstate'}
        message={
          waiveTarget &&
          (waiving ? (
            <>
              The remaining <strong className="text-on-surface">{money.format(waiveTarget.view.balance)}</strong> on{' '}
              <strong className="text-on-surface">{waiveTarget.view.invoice.id}</strong> ({formatPeriod(waiveTarget.view.invoice.period)})
              for {waiveTarget.student?.name} will be written off and no longer counted as due. You can reinstate it later.
            </>
          ) : (
            <>
              <strong className="text-on-surface">{waiveTarget.view.invoice.id}</strong> will count towards {waiveTarget.student?.name}
              &rsquo;s dues again.
            </>
          ))
        }
      />
    </div>
  );
}
