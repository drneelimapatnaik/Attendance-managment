/**
 * "Payments" tab: the receipts ledger (newest first) with date-range and
 * method filters, a total for the current filter, and a printable receipt
 * per row.
 */
import { useMemo } from 'react';
import { Button, DataTable, EmptyState, IconButton, SelectField, TextField, type Column } from '@/components/ui';
import { PersonCell } from '@/components/domain';
import { useMoney } from '@/hooks/useTenant';
import { formatDate, formatPeriod, today } from '@/lib/date';
import type { PaymentMethod } from '@/types/domain';
import { PAYMENT_METHODS, type FeeFilters, type PaymentRow, type SetFeeFilter } from '../useFees';
import { DebouncedSearch } from '@/components/ui';
import { MethodBadge } from './FeeBadges';

interface Props {
  rows: PaymentRow[];
  filters: FeeFilters;
  setFilter: SetFeeFilter;
  onReset: () => void;
  isFiltered: boolean;
  onOpenReceipt: (receiptNo: string) => void;
}

export function PaymentsTab({ rows, filters, setFilter, onReset, isFiltered, onOpenReceipt }: Props) {
  const money = useMoney();
  const total = useMemo(() => rows.reduce((s, r) => s + r.payment.amount, 0), [rows]);
  const rangeError = filters.from && filters.to && filters.from > filters.to ? '“From” is after “To”.' : undefined;

  const receiptButton = ({ payment }: PaymentRow) => (
    <Button
      size="sm"
      variant="ghost"
      icon="receipt"
      onClick={(e) => {
        e.stopPropagation();
        onOpenReceipt(payment.receiptNo);
      }}
    >
      Receipt
    </Button>
  );

  const columns: Column<PaymentRow>[] = [
    {
      key: 'receipt',
      header: 'Receipt no.',
      sortValue: (r) => r.payment.receiptNo,
      className: 'whitespace-nowrap',
      cell: ({ payment }) => <span className="font-label-md text-label-md font-semibold text-primary tnum">{payment.receiptNo}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      // Tie-break same-day receipts by number so the newest stays on top.
      sortValue: (r) => `${r.payment.date}|${r.payment.receiptNo}`,
      className: 'whitespace-nowrap',
      cell: ({ payment }) => formatDate(payment.date),
    },
    {
      key: 'student',
      header: 'Student',
      sortValue: (r) => r.student?.name ?? '',
      headerClassName: 'min-w-[180px]',
      cell: ({ student, payment }) => (
        <PersonCell name={student?.name ?? payment.studentId} subtitle={student?.id} photoUrl={student?.photoUrl} size="sm" />
      ),
    },
    {
      key: 'invoice',
      header: 'Invoice',
      hideBelow: 'xl',
      className: 'whitespace-nowrap',
      cell: ({ payment, invoice }) => (
        <>
          <span className="block font-body-md text-body-md text-on-surface tnum">{payment.invoiceId}</span>
          {invoice && <span className="font-body-sm text-body-sm text-secondary">{formatPeriod(invoice.period)}</span>}
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (r) => r.payment.amount,
      className: 'whitespace-nowrap font-semibold text-on-surface tnum',
      cell: ({ payment }) => money.format(payment.amount),
    },
    {
      key: 'method',
      header: 'Method',
      sortValue: (r) => r.payment.method,
      cell: ({ payment }) => <MethodBadge method={payment.method} />,
    },
    {
      key: 'reference',
      header: 'Reference',
      hideBelow: '2xl',
      className: 'whitespace-nowrap',
      cell: ({ payment }) => <span className="font-body-md text-body-md text-on-surface-variant tnum">{payment.reference || '—'}</span>,
    },
    {
      key: 'collector',
      header: 'Collected by',
      hideBelow: 'lg',
      sortValue: (r) => r.collector?.name ?? '',
      className: 'whitespace-nowrap',
      cell: ({ collector }) => collector?.name ?? '—',
    },
    { key: 'actions', header: '', align: 'right', cell: receiptButton },
  ];

  const mobileCard = (row: PaymentRow) => {
    const { payment, student, collector } = row;
    return (
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-start justify-between gap-space-xs">
          <div className="min-w-0">
            <p className="truncate font-label-lg text-label-lg text-on-surface">{student?.name ?? payment.studentId}</p>
            <p className="font-body-sm text-body-sm text-secondary tnum">
              {payment.receiptNo} · {formatDate(payment.date)}
            </p>
          </div>
          <span className="shrink-0 font-title-md text-title-md text-on-surface tnum">{money.format(payment.amount)}</span>
        </div>
        <div className="flex items-center justify-between gap-space-xs">
          <div className="flex min-w-0 flex-wrap items-center gap-space-xs">
            <MethodBadge method={payment.method} />
            {collector && <span className="truncate font-body-sm text-body-sm text-secondary">by {collector.name}</span>}
          </div>
          {receiptButton(row)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-space-md">
      <div className="card flex flex-col gap-space-sm p-space-md xl:flex-row xl:items-end">
        <DebouncedSearch
          value={filters.q}
          onCommit={(v) => setFilter('q', v)}
          placeholder="Search by receipt, student, invoice or reference…"
          className="flex-1"
        />
        <div className="flex items-end gap-space-xs">
          <div className="grid flex-1 grid-cols-2 gap-space-xs sm:grid-cols-3 xl:w-[36rem] xl:flex-none">
            <SelectField
              label="Method"
              value={filters.method}
              onChange={(e) => setFilter('method', e.target.value as PaymentMethod | '')}
              options={[{ value: '', label: 'All methods' }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: m }))]}
              containerClassName="col-span-2 sm:col-span-1"
            />
            <TextField
              type="date"
              label="From"
              max={filters.to || today()}
              value={filters.from}
              onChange={(e) => setFilter('from', e.target.value)}
              error={rangeError}
            />
            <TextField
              type="date"
              label="To"
              min={filters.from || undefined}
              max={today()}
              value={filters.to}
              onChange={(e) => setFilter('to', e.target.value)}
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
          <strong className="text-on-surface tnum">{rows.length}</strong> receipts
        </span>
        <span>
          Total <strong className="text-on-surface tnum">{money.format(total)}</strong>
        </span>
        {(filters.from || filters.to) && (
          <span>
            {filters.from ? formatDate(filters.from) : 'Start'} – {filters.to ? formatDate(filters.to) : 'today'}
          </span>
        )}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.payment.id}
        onRowClick={(r) => onOpenReceipt(r.payment.receiptNo)}
        mobileCard={mobileCard}
        entityLabel="receipts"
        initialSort={{ key: 'date', dir: 'desc' }}
        caption="Payments received"
        empty={
          <EmptyState
            icon="payments"
            title={isFiltered ? 'No payments match these filters' : 'No payments yet'}
            description={
              isFiltered ? 'Try a wider date range or another method.' : 'Payments you record will appear here with their receipts.'
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
