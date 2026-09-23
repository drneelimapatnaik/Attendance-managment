/**
 * Student & parent app — Fees (parents only; the router keeps students out and
 * `useCanSeeFees()` is the second lock, because a student must never see money).
 *
 * What a parent needs, in this order: what is owed right now, how to pay it,
 * the invoices behind that number, and the receipts for what has already been
 * paid. "Pay now" does NOT fake a payment — online payment arrives with the
 * backend, so the button explains that and hands over the office's details.
 */
import { useMemo, useState } from 'react';
import type { Payment } from '@/types/domain';
import type { InvoiceView } from '@/domain/fees';
import { Badge, Button, Card, CardHeader, EmptyState, Icon, Modal, ProgressBar, buttonClasses } from '@/components/ui';
import { FeeStatusBadge } from '@/components/domain';
import { ReceiptModal } from '@/features/fees/ReceiptModal';
import { useCanSeeFees, usePortalAccount, usePortalData } from '@/hooks/usePortal';
import { useLookups, useMoney, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { diffDays, formatDate, formatPeriod, today } from '@/lib/date';
import { pluralize, telHref } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PortalHeading, PortalNoStudent, PortalNotices } from './components/PortalPageChrome';

/** "1st", "2nd", "3rd", "10th" — used when the institute bills on a fixed day. */
function ordinal(day: number): string {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] || 'th'}`;
}

/**
 * Payments made together are one receipt document: a single payment split
 * across invoices is stored as one row per invoice, each with its own receipt
 * number. Group by day + method + reference so "View receipt" opens them all.
 */
interface ReceiptGroup {
  key: string;
  payments: Payment[];
  total: number;
}

export default function PortalFeesPage() {
  useDocumentTitle('Fees');
  const account = usePortalAccount();
  const isParent = useCanSeeFees();
  const { student, invoices, payments, fees } = usePortalData();
  const { batch: batchMap } = useLookups();
  const money = useMoney();
  const settings = useSettings();
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<Payment[]>([]);

  const receipts = useMemo<ReceiptGroup[]>(() => {
    const groups = new Map<string, Payment[]>();
    for (const p of payments) {
      const key = `${p.date}|${p.method}|${p.reference ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()]
      .map(([key, list]) => ({ key, payments: list, total: list.reduce((s, p) => s + p.amount, 0) }))
      .sort((a, b) => b.payments[0].date.localeCompare(a.payments[0].date));
  }, [payments]);

  /** The unpaid invoice due soonest — what "pay by" should talk about. */
  const nextDue = useMemo(() => {
    const open = (fees?.invoices ?? []).filter((v) => v.balance > 0);
    return open.sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate))[0];
  }, [fees]);

  if (!isParent) {
    return (
      <div className="card">
        <EmptyState
          icon="lock"
          title="Fees are shown on the parent login"
          description="Ask a parent to sign in with their registered mobile number to see invoices and receipts."
        />
      </div>
    );
  }
  if (!student || !fees) return <PortalNoStudent />;

  const campus = settings.campuses.find((c) => c.id === student.campusId);
  const paidRatio = fees.totalBilled ? fees.totalPaid / fees.totalBilled : 0;
  const daysToDue = nextDue ? diffDays(today(), nextDue.invoice.dueDate) : null;

  const dueLine = !nextDue
    ? 'Nothing to pay right now — thank you.'
    : nextDue.status === 'Overdue'
      ? `${pluralize(nextDue.daysOverdue, 'day')} past the grace period. Please settle it soon.`
      : daysToDue != null && daysToDue < 0
        ? `Due on ${formatDate(nextDue.invoice.dueDate)} — still within the ${settings.fees.gracePeriodDays}-day grace period.`
        : daysToDue === 0
          ? 'Due today.'
          : `Due on ${formatDate(nextDue.invoice.dueDate)}, in ${pluralize(daysToDue ?? 0, 'day')}.`;

  const invoiceRow = (v: InvoiceView) => {
    const batch = batchMap.get(v.invoice.batchId);
    return (
      <li key={v.invoice.id} className="card flex flex-col gap-space-xs p-space-md">
        <div className="flex items-start justify-between gap-space-sm">
          <div className="min-w-0">
            <p className="font-title-md text-title-md text-on-surface">{formatPeriod(v.invoice.period)}</p>
            <p className="font-body-sm text-body-sm text-secondary">
              {batch?.name ?? 'Tuition'}
              {batch?.title && ` · ${batch.title}`}
            </p>
          </div>
          {v.invoice.waived ? (
            <Badge tone="neutral" icon="block">
              Waived
            </Badge>
          ) : (
            <FeeStatusBadge status={v.status} />
          )}
        </div>
        <dl className="flex flex-wrap items-baseline gap-x-space-md gap-y-1 font-body-sm text-body-sm text-secondary">
          <div className="flex items-baseline gap-1">
            <dt>Amount</dt>
            <dd className="font-label-lg text-label-lg text-on-surface tnum">{money.format(v.invoice.amount)}</dd>
          </div>
          <div className="flex items-baseline gap-1">
            <dt>Paid</dt>
            <dd className="font-label-lg text-label-lg text-on-surface tnum">{money.format(v.paid)}</dd>
          </div>
          <div className="flex items-baseline gap-1">
            <dt>Still to pay</dt>
            <dd className={cn('font-label-lg text-label-lg tnum', v.balance > 0 ? 'text-on-surface' : 'text-secondary')}>
              {money.format(v.balance)}
            </dd>
          </div>
        </dl>
        <p className="font-body-sm text-body-sm text-secondary">
          Due {formatDate(v.invoice.dueDate)}
          {v.daysOverdue > 0 && <span className="text-error"> · {pluralize(v.daysOverdue, 'day')} overdue</span>}
        </p>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <PortalHeading title="Fees" subtitle={`Tuition fees for ${student.name}.`} />
      <PortalNotices account={account} student={student} />

      <Card className="flex flex-col gap-space-md">
        <CardHeader title="To pay" icon="account_balance_wallet" actions={<FeeStatusBadge status={fees.status} />} />
        <div>
          <p className={cn('font-headline-lg text-headline-lg-mobile tnum md:text-headline-lg', fees.overdue > 0 && 'text-error')}>
            {money.format(fees.outstanding)}
          </p>
          <p className="mt-0.5 font-body-md text-body-md text-secondary">{dueLine}</p>
        </div>
        <div className="flex flex-col gap-space-2xs">
          <ProgressBar value={paidRatio} tone={fees.overdue > 0 ? 'warning' : 'primary'} label="Share of this year's fees paid" />
          <p className="font-body-sm text-body-sm text-secondary tnum">
            {money.format(fees.totalPaid)} paid of {money.format(fees.totalBilled)} billed
            {fees.lastPaymentOn && ` · last payment ${formatDate(fees.lastPaymentOn)}`}
          </p>
        </div>
        {/* Nothing owed? The button still explains how paying works, but stops shouting. */}
        <Button
          size="lg"
          variant={fees.outstanding > 0 ? 'primary' : 'secondary'}
          icon="payments"
          fullWidth
          onClick={() => setPayOpen(true)}
        >
          {fees.outstanding > 0 ? 'Pay now' : 'How to pay'}
        </Button>
      </Card>

      <Card className="flex flex-col gap-space-sm">
        <CardHeader title="How fees work here" icon="help" />
        <ul className="flex flex-col gap-space-xs font-body-md text-body-md text-on-surface-variant">
          <li className="flex items-start gap-space-xs">
            <Icon name="event" size={18} className="mt-0.5 text-primary" />
            <span>
              A bill is raised{' '}
              {settings.fees.billingMode === 'fixed-day'
                ? `on the ${ordinal(settings.fees.billingDay)} of every month`
                : 'every month on the date your child joined'}
              , and you have {pluralize(settings.fees.dueInDays, 'day')} to pay it.
            </span>
          </li>
          <li className="flex items-start gap-space-xs">
            <Icon name="schedule" size={18} className="mt-0.5 text-primary" />
            <span>
              After the due date there are {pluralize(settings.fees.gracePeriodDays, 'day')} of grace. Only after that is a bill marked
              overdue.
            </span>
          </li>
          {settings.fees.lateFee > 0 && (
            <li className="flex items-start gap-space-xs">
              <Icon name="info" size={18} className="mt-0.5 text-primary" />
              <span>A late fee of {money.format(settings.fees.lateFee)} may be added once a bill is overdue.</span>
            </li>
          )}
          <li className="flex items-start gap-space-xs">
            <Icon name="call" size={18} className="mt-0.5 text-primary" />
            <span>
              Something looks wrong? Call the office on{' '}
              <a href={telHref(settings.contactPhone)} className="font-semibold text-primary hover:underline">
                {settings.contactPhone}
              </a>{' '}
              and they will check it for you.
            </span>
          </li>
        </ul>
      </Card>

      <section className="flex flex-col gap-space-sm" aria-labelledby="invoices-heading">
        <div className="flex items-baseline justify-between gap-space-sm">
          <h2 id="invoices-heading" className="font-title-lg text-title-lg text-on-surface">
            Bills
          </h2>
          <span className="font-body-sm text-body-sm text-secondary">{pluralize(fees.invoices.length, 'bill')}</span>
        </div>
        {fees.invoices.length ? (
          <ul className="flex flex-col gap-space-sm">{fees.invoices.map(invoiceRow)}</ul>
        ) : (
          <div className="card">
            <EmptyState
              icon="receipt_long"
              title="No bills yet"
              description={
                student.batchIds.length
                  ? 'Monthly bills appear here as soon as they are raised.'
                  : 'Bills start once your child is enrolled in a batch.'
              }
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-space-sm" aria-labelledby="payments-heading">
        <div className="flex items-baseline justify-between gap-space-sm">
          <h2 id="payments-heading" className="font-title-lg text-title-lg text-on-surface">
            Payments made
          </h2>
          <span className="font-body-sm text-body-sm text-secondary">{pluralize(receipts.length, 'receipt')}</span>
        </div>
        {receipts.length ? (
          <ul className="flex flex-col gap-space-sm">
            {receipts.map((g) => {
              const first = g.payments[0];
              // Name the months a receipt covers, so a parent recognises it without opening it.
              const periods = g.payments.map((p) => invoices.find((i) => i.id === p.invoiceId)?.period).filter((p): p is string => !!p);
              const forPeriods = [...new Set(periods)].map(formatPeriod);
              return (
                <li key={g.key} className="card flex items-center justify-between gap-space-sm p-space-md">
                  <div className="min-w-0 flex-1">
                    <p className="font-title-md text-title-md text-on-surface tnum">{money.format(g.total)}</p>
                    <p className="font-body-sm text-body-sm text-secondary">
                      {formatDate(first.date)} · {first.method}
                      {forPeriods.length > 0 && ` · ${forPeriods.join(', ')}`}
                    </p>
                    <p className="font-body-sm text-body-sm text-secondary tnum">Receipt {g.payments.map((p) => p.receiptNo).join(', ')}</p>
                  </div>
                  <Button variant="secondary" icon="receipt_long" onClick={() => setReceipt(g.payments)}>
                    View receipt
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="card">
            <EmptyState icon="payments" title="No payments yet" description="Every receipt you are given appears here." />
          </div>
        )}
      </section>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        size="md"
        title="Paying the fees"
        description="Online payment is not switched on yet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              Close
            </Button>
            <a href={telHref(settings.contactPhone)} className={buttonClasses({ variant: 'primary' })}>
              <Icon name="call" size={18} />
              Call the office
            </a>
          </>
        }
      >
        <div className="flex flex-col gap-space-md">
          <div className="rounded-xl bg-surface-container-low p-space-md">
            <p className="font-label-md text-label-md text-secondary">
              {fees.outstanding > 0 ? 'Amount outstanding' : 'Nothing outstanding right now'}
            </p>
            <p className="font-headline-sm text-headline-sm text-on-surface tnum">{money.format(fees.outstanding)}</p>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {settings.name} has not switched on card and UPI payments in the app yet. Until then, please pay at the office — cash, UPI,
            card, bank transfer and cheque are all accepted — and the receipt will appear here the same day.
          </p>
          <div className="flex flex-col gap-space-xs rounded-xl border border-outline-variant/60 p-space-md">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Where to pay</p>
            <p className="font-title-md text-title-md text-on-surface">{campus?.name ?? settings.name}</p>
            <p className="font-body-md text-body-md text-on-surface-variant">{campus?.address ?? settings.address}</p>
            <p className="flex flex-wrap items-center gap-x-space-md gap-y-1 font-body-md text-body-md">
              <a href={telHref(settings.contactPhone)} className="flex items-center gap-1 text-primary hover:underline">
                <Icon name="call" size={16} />
                {settings.contactPhone}
              </a>
              <a href={`mailto:${settings.contactEmail}`} className="flex items-center gap-1 text-primary hover:underline">
                <Icon name="mail" size={16} />
                {settings.contactEmail}
              </a>
            </p>
          </div>
        </div>
      </Modal>

      <ReceiptModal open={receipt.length > 0} onClose={() => setReceipt([])} payments={receipt} />
    </div>
  );
}
