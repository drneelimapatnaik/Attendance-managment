/**
 * Profile › Fees: billed / paid / outstanding summary (from the tenant fee
 * index), the invoice ledger with a per-invoice "Pay" action for roles that
 * collect fees, and the payment history with receipt numbers.
 */
import { useMemo } from 'react';
import type { Payment, Student } from '@/types/domain';
import type { InvoiceView, StudentFeeSummary } from '@/domain/fees';
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, ProgressBar, type Column } from '@/components/ui';
import { FeeStatusBadge } from '@/components/domain';
import { useCan, useLookups, useMoney } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useUiStore } from '@/store/uiStore';
import { discountedFee } from '@/domain/fees';
import { formatDate, formatPeriod } from '@/lib/date';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useFeeReminder } from '../components/StudentQuickActions';

interface FeesTabProps {
  student: Student;
  fee: StudentFeeSummary;
}

export function FeesTab({ student, fee }: FeesTabProps) {
  const can = useCan();
  const money = useMoney();
  const remind = useFeeReminder();
  const openModal = useUiStore((s) => s.openModal);
  const { batch: batchMap, staff } = useLookups();
  const payments = useDataStore((s) => s.payments);
  const canCollect = can('fees.collect');

  const history = useMemo(
    () =>
      payments
        .filter((p) => p.studentId === student.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.receiptNo.localeCompare(a.receiptNo)),
    [payments, student.id],
  );
  const invoiceById = useMemo(() => new Map(fee.invoices.map((v) => [v.invoice.id, v.invoice])), [fee.invoices]);
  const monthlyTuition = student.batchIds.reduce((sum, id) => {
    const b = batchMap.get(id);
    return b && b.status === 'Active' ? sum + discountedFee(b.monthlyFee, student.concessionPct) : sum;
  }, 0);
  const pay = (invoiceId: string) => openModal({ type: 'record-payment', studentId: student.id, invoiceId });

  const invoiceStatus = (v: InvoiceView) =>
    v.invoice.waived ? (
      <Badge tone="neutral" icon="block">
        Waived
      </Badge>
    ) : (
      <FeeStatusBadge status={v.status} />
    );

  const invoiceColumns: Column<InvoiceView>[] = [
    {
      key: 'period',
      header: 'Period',
      sortValue: (v) => v.invoice.period,
      className: 'whitespace-nowrap',
      cell: ({ invoice }) => (
        <>
          <span className="block font-label-lg text-label-lg text-on-surface">{formatPeriod(invoice.period)}</span>
          <span className="block font-body-sm text-body-sm text-secondary tnum">{invoice.id}</span>
        </>
      ),
    },
    {
      key: 'batch',
      header: 'Batch',
      hideBelow: 'lg',
      cell: ({ invoice }) => {
        const b = batchMap.get(invoice.batchId);
        return (
          <>
            <span className="block font-label-lg text-label-lg text-on-surface">{b?.name ?? '—'}</span>
            <span className="block max-w-[14rem] truncate font-body-sm text-body-sm text-secondary">{b?.title}</span>
          </>
        );
      },
    },
    {
      key: 'due',
      header: 'Due',
      sortValue: (v) => v.invoice.dueDate,
      className: 'whitespace-nowrap',
      cell: (v) => (
        <>
          <span className="block font-body-md text-body-md text-on-surface tnum">{formatDate(v.invoice.dueDate)}</span>
          {v.daysOverdue > 0 && (
            <span className="block font-body-sm text-body-sm text-error">{pluralize(v.daysOverdue, 'day')} overdue</span>
          )}
        </>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (v) => v.invoice.amount,
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface tnum',
      cell: ({ invoice }) => money.format(invoice.amount),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      hideBelow: 'xl',
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface-variant tnum',
      cell: (v) => money.format(v.paid),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      sortValue: (v) => v.balance,
      cell: (v) => (
        <span className={cn('whitespace-nowrap font-label-lg text-label-lg tnum', v.balance > 0 ? 'text-on-surface' : 'text-secondary')}>
          {money.format(v.balance)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', className: 'whitespace-nowrap', cell: invoiceStatus },
    ...(canCollect
      ? [
          {
            key: 'action',
            header: <span className="sr-only">Actions</span>,
            align: 'right' as const,
            cell: (v: InvoiceView) =>
              v.balance > 0 ? (
                <Button size="sm" variant={v.status === 'Overdue' ? 'primary' : 'tonal'} icon="payments" onClick={() => pay(v.invoice.id)}>
                  Pay
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  const invoiceCard = (v: InvoiceView) => {
    const b = batchMap.get(v.invoice.batchId);
    return (
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-start justify-between gap-space-xs">
          <div className="min-w-0">
            <p className="font-label-lg text-label-lg text-on-surface">
              {formatPeriod(v.invoice.period)} · {b?.name ?? 'Batch'}
            </p>
            <p className="font-body-sm text-body-sm text-secondary tnum">
              Due {formatDate(v.invoice.dueDate)}
              {v.daysOverdue > 0 && <span className="text-error"> · {pluralize(v.daysOverdue, 'day')} overdue</span>}
            </p>
          </div>
          {invoiceStatus(v)}
        </div>
        <div className="flex items-end justify-between gap-space-xs">
          <p className="font-body-sm text-body-sm text-secondary tnum">
            {money.format(v.invoice.amount)} billed · {money.format(v.paid)} paid
            <span className="block font-label-lg text-label-lg text-on-surface">Balance {money.format(v.balance)}</span>
          </p>
          {canCollect && v.balance > 0 && (
            <Button size="sm" variant={v.status === 'Overdue' ? 'primary' : 'tonal'} icon="payments" onClick={() => pay(v.invoice.id)}>
              Pay
            </Button>
          )}
        </div>
      </div>
    );
  };

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'receipt',
      header: 'Receipt',
      sortValue: (p) => p.receiptNo,
      className: 'whitespace-nowrap font-label-lg text-label-lg text-primary tnum',
      cell: (p) => p.receiptNo,
    },
    {
      key: 'date',
      header: 'Date',
      sortValue: (p) => p.date,
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface tnum',
      cell: (p) => formatDate(p.date),
    },
    {
      key: 'for',
      header: 'For',
      hideBelow: 'lg',
      cell: (p) => {
        const inv = invoiceById.get(p.invoiceId);
        return (
          <span className="font-body-md text-body-md text-on-surface-variant">
            {inv ? `${formatPeriod(inv.period)} · ${batchMap.get(inv.batchId)?.name ?? 'Batch'}` : '—'}
          </span>
        );
      },
    },
    {
      key: 'method',
      header: 'Method',
      sortValue: (p) => p.method,
      cell: (p) => (
        <>
          <span className="block font-body-md text-body-md text-on-surface">{p.method}</span>
          {p.reference && <span className="block font-body-sm text-body-sm text-secondary tnum">{p.reference}</span>}
        </>
      ),
    },
    {
      key: 'by',
      header: 'Collected by',
      hideBelow: 'xl',
      cell: (p) => <span className="font-body-md text-body-md text-on-surface-variant">{staff.get(p.collectedBy)?.name ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (p) => p.amount,
      className: 'whitespace-nowrap font-label-lg text-label-lg text-on-surface tnum',
      cell: (p) => money.format(p.amount),
    },
  ];

  const paymentCard = (p: Payment) => {
    const inv = invoiceById.get(p.invoiceId);
    return (
      <div className="flex items-start justify-between gap-space-xs">
        <div className="min-w-0">
          <p className="font-label-lg text-label-lg text-primary tnum">{p.receiptNo}</p>
          <p className="font-body-sm text-body-sm text-secondary">
            {formatDate(p.date)} · {p.method}
            {inv && <> · {formatPeriod(inv.period)}</>}
          </p>
        </div>
        <span className="font-title-md text-title-md text-on-surface tnum">{money.format(p.amount)}</span>
      </div>
    );
  };

  const paidRatio = fee.totalBilled ? fee.totalPaid / fee.totalBilled : 0;

  return (
    <div className="flex flex-col gap-space-lg">
      <Card className="flex flex-col gap-space-md">
        <CardHeader
          title="Fee summary"
          icon="account_balance_wallet"
          subtitle={
            <>
              {money.format(monthlyTuition)}/month after {student.concessionPct}% concession
              {fee.lastPaymentOn && <> · last payment {formatDate(fee.lastPaymentOn)}</>}
            </>
          }
          actions={<FeeStatusBadge status={fee.status} amount={fee.outstanding} />}
        />
        <dl className="grid grid-cols-1 gap-space-sm sm:grid-cols-3">
          {[
            { label: 'Total billed', value: fee.totalBilled, cls: 'text-on-surface' },
            { label: 'Paid', value: fee.totalPaid, cls: 'text-on-surface' },
            { label: 'Outstanding', value: fee.outstanding, cls: fee.overdue > 0 ? 'text-error' : 'text-on-surface' },
          ].map((f) => (
            <div key={f.label} className="flex items-baseline justify-between rounded-lg bg-surface-container-low p-space-sm sm:block">
              <dt className="font-label-md text-label-md text-secondary">{f.label}</dt>
              <dd className={cn('font-headline-sm text-headline-sm tnum', f.cls)}>{money.format(f.value)}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-space-2xs">
          <ProgressBar value={paidRatio} tone={fee.overdue > 0 ? 'warning' : 'primary'} label="Share of billed fees collected" />
          <p className="font-body-sm text-body-sm text-secondary">
            {Math.round(paidRatio * 100)}% of billed fees collected
            {fee.overdue > 0 && <span className="text-error"> · {money.format(fee.overdue)} past the grace period</span>}
          </p>
        </div>
        {fee.outstanding > 0 && (
          <div className="flex flex-col gap-space-xs sm:flex-row sm:justify-end">
            <Button variant="tonal" icon="sms" onClick={() => remind(student, fee, fee.status === 'Overdue')}>
              {fee.status === 'Overdue' ? 'Send fee notice' : 'Send reminder'}
            </Button>
          </div>
        )}
      </Card>

      <section className="flex flex-col gap-space-sm" aria-labelledby="invoices-heading">
        <div className="flex items-baseline justify-between gap-space-sm">
          <h2 id="invoices-heading" className="font-title-lg text-title-lg font-bold text-on-surface">
            Invoices
          </h2>
          <span className="font-body-sm text-body-sm text-secondary">{pluralize(fee.invoices.length, 'invoice')}</span>
        </div>
        <DataTable
          rows={fee.invoices}
          columns={invoiceColumns}
          rowKey={(v) => v.invoice.id}
          mobileCard={invoiceCard}
          entityLabel="invoices"
          initialSort={{ key: 'period', dir: 'desc' }}
          rowClassName={(v) => (v.status === 'Overdue' ? 'bg-error-container/20' : undefined)}
          caption={`Invoices for ${student.name}`}
          empty={
            <EmptyState
              icon="receipt_long"
              title="No invoices yet"
              description={
                student.batchIds.length
                  ? 'Monthly invoices appear here once issued.'
                  : 'Invoices are issued once the student joins a batch.'
              }
            />
          }
        />
      </section>

      <section className="flex flex-col gap-space-sm" aria-labelledby="payments-heading">
        <div className="flex items-baseline justify-between gap-space-sm">
          <h2 id="payments-heading" className="font-title-lg text-title-lg font-bold text-on-surface">
            Payment history
          </h2>
          <span className="font-body-sm text-body-sm text-secondary">{pluralize(history.length, 'payment')}</span>
        </div>
        <DataTable
          rows={history}
          columns={paymentColumns}
          rowKey={(p) => p.id}
          mobileCard={paymentCard}
          entityLabel="payments"
          initialSort={{ key: 'date', dir: 'desc' }}
          caption={`Payments from ${student.name}`}
          empty={<EmptyState icon="payments" title="No payments recorded" description="Receipts appear here as fees are collected." />}
        />
      </section>
    </div>
  );
}
