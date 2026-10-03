/**
 * Fee rules — the server-side port of frontend/src/domain/fees.ts.
 *
 *   Paid     → payments cover the invoice (or it was waived)
 *   Pending  → unpaid, and today ≤ due date + grace period
 *   Overdue  → unpaid, and today  > due date + grace period
 *
 * The client computes the same values for instant feedback; the server is what
 * decides. Keeping the functions pure (plain numbers and ISO strings in, values
 * out) means they are unit-tested without a database and reused by reports,
 * invoicing jobs and the parent portal alike.
 *
 * Money is handled in the institute currency's major unit (rupees), matching the
 * frontend. Convert Prisma `Decimal` columns with `toMoney()` at the edge.
 */
import { addDays, addMonths, diffDays, ISODate } from './date';

export type FeeStatus = 'Paid' | 'Pending' | 'Overdue';

/** The minimum an invoice must look like for these rules to apply. */
export interface InvoiceLike {
  id: string;
  studentId: string;
  amount: number;
  issuedOn: ISODate;
  dueDate: ISODate;
  period: string;
  waived?: boolean;
}

export interface PaymentLike {
  invoiceId: string;
  studentId: string;
  amount: number;
  date: ISODate;
}

export interface InvoiceView<T extends InvoiceLike = InvoiceLike> {
  invoice: T;
  paid: number;
  balance: number;
  status: FeeStatus;
  daysOverdue: number;
}

export interface StudentFeeSummary<T extends InvoiceLike = InvoiceLike> {
  status: FeeStatus;
  /** pending + overdue balance */
  outstanding: number;
  overdue: number;
  pending: number;
  totalBilled: number;
  totalPaid: number;
  lastPaymentOn?: ISODate;
  invoices: InvoiceView<T>[];
}

/** Sum payments per invoice once, so large lists stay O(n). */
export function paidByInvoice(payments: readonly PaymentLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) map.set(p.invoiceId, (map.get(p.invoiceId) ?? 0) + p.amount);
  return map;
}

/**
 * The one rule everything else builds on. `graceDays` comes from the institute's
 * settings (InstituteSettings.fees.gracePeriodDays).
 */
export function invoiceStatus(invoice: InvoiceLike, paid: number, today: ISODate, graceDays: number): FeeStatus {
  if (invoice.waived || paid >= invoice.amount) return 'Paid';
  return today > addDays(invoice.dueDate, graceDays) ? 'Overdue' : 'Pending';
}

export function viewInvoice<T extends InvoiceLike>(invoice: T, paid: number, today: ISODate, graceDays: number): InvoiceView<T> {
  const status = invoiceStatus(invoice, paid, today, graceDays);
  const balance = invoice.waived ? 0 : Math.max(0, invoice.amount - paid);
  // Overdue is counted from the end of the grace period, not the due date.
  const daysOverdue = status === 'Overdue' ? diffDays(addDays(invoice.dueDate, graceDays), today) : 0;
  return { invoice, paid, balance, status, daysOverdue };
}

/** Per-student fee summaries for a whole tenant in one pass. */
export function buildFeeIndex<T extends InvoiceLike>(
  invoices: readonly T[],
  payments: readonly PaymentLike[],
  today: ISODate,
  graceDays: number,
): Map<string, StudentFeeSummary<T>> {
  const paid = paidByInvoice(payments);

  const lastPayment = new Map<string, ISODate>();
  for (const p of payments) {
    const prev = lastPayment.get(p.studentId);
    if (!prev || p.date > prev) lastPayment.set(p.studentId, p.date);
  }

  const index = new Map<string, StudentFeeSummary<T>>();
  for (const invoice of invoices) {
    const view = viewInvoice(invoice, paid.get(invoice.id) ?? 0, today, graceDays);
    let summary = index.get(invoice.studentId);
    if (!summary) {
      summary = {
        status: 'Paid',
        outstanding: 0,
        overdue: 0,
        pending: 0,
        totalBilled: 0,
        totalPaid: 0,
        lastPaymentOn: lastPayment.get(invoice.studentId),
        invoices: [],
      };
      index.set(invoice.studentId, summary);
    }
    summary.invoices.push(view);
    summary.totalBilled += invoice.waived ? 0 : invoice.amount;
    summary.totalPaid += view.paid;
    if (view.status === 'Overdue') summary.overdue += view.balance;
    if (view.status === 'Pending') summary.pending += view.balance;
  }

  for (const summary of index.values()) {
    summary.outstanding = summary.overdue + summary.pending;
    // One overdue invoice makes the whole student overdue — that is what the
    // roster badge shows.
    summary.status = summary.overdue > 0 ? 'Overdue' : summary.pending > 0 ? 'Pending' : 'Paid';
    summary.invoices.sort((a, b) => b.invoice.issuedOn.localeCompare(a.invoice.issuedOn));
  }
  return index;
}

/** Invoice amount after the student's concession, rounded to the nearest 10. */
export function discountedFee(monthlyFee: number, concessionPct: number): number {
  return Math.round((monthlyFee * (1 - concessionPct / 100)) / 10) * 10;
}

export interface BillingRules {
  billingMode: 'joining-date' | 'fixed-day';
  billingDay: number;
  dueInDays: number;
  gracePeriodDays: number;
}

/**
 * Issue date for a student's invoice in `period` ("YYYY-MM").
 * joining-date: the anniversary of their joining day, capped at 28 so February works.
 * fixed-day:    the institute's billing day, for everyone.
 */
export function billingDateFor(joiningDate: ISODate, period: string, rules: Pick<BillingRules, 'billingMode' | 'billingDay'>): ISODate {
  const day = rules.billingMode === 'fixed-day' ? Math.min(28, rules.billingDay) : Math.min(28, Number(joiningDate.slice(8, 10)));
  return `${period}-${String(day).padStart(2, '0')}`;
}

/** Due date for an invoice issued on `issuedOn`. */
export function dueDateFor(issuedOn: ISODate, dueInDays: number): ISODate {
  return addDays(issuedOn, dueInDays);
}

/** The next `count` billing periods starting at `from` ("YYYY-MM"). */
export function nextPeriods(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(`${from}-01`, i).slice(0, 7));
}

/** Monthly collection totals (for charts): period → collected amount. */
export function collectionsByMonth(payments: readonly PaymentLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    const period = p.date.slice(0, 7);
    map.set(period, (map.get(period) ?? 0) + p.amount);
  }
  return map;
}

/** Billed totals by the invoice's billing month. */
export function billedByMonth(invoices: readonly InvoiceLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.waived) continue;
    map.set(invoice.period, (map.get(invoice.period) ?? 0) + invoice.amount);
  }
  return map;
}
