/**
 * Fee rules — pure functions, no React, no store. The backend should apply
 * the same rules; keeping them here makes them unit-testable and reusable.
 *
 *   Paid     → payments cover the invoice (or it was waived)
 *   Pending  → unpaid, and today ≤ due date + grace period
 *   Overdue  → unpaid, and today  > due date + grace period
 */
import type { FeeInvoice, FeeStatus, ID, ISODate, InstituteSettings, Payment, Student } from '@/types/domain';
import { addDays, addMonths, diffDays } from '@/lib/date';

export interface InvoiceView {
  invoice: FeeInvoice;
  paid: number;
  balance: number;
  status: FeeStatus;
  daysOverdue: number;
}

export interface StudentFeeSummary {
  status: FeeStatus;
  outstanding: number; // pending + overdue balance
  overdue: number;
  pending: number;
  totalBilled: number;
  totalPaid: number;
  lastPaymentOn?: ISODate;
  invoices: InvoiceView[];
}

/** Sum payments per invoice once, so large lists stay O(n). */
export function paidByInvoice(payments: Payment[]): Map<ID, number> {
  const map = new Map<ID, number>();
  for (const p of payments) map.set(p.invoiceId, (map.get(p.invoiceId) ?? 0) + p.amount);
  return map;
}

export function invoiceStatus(invoice: FeeInvoice, paid: number, today: ISODate, graceDays: number): FeeStatus {
  if (invoice.waived || paid >= invoice.amount) return 'Paid';
  return today > addDays(invoice.dueDate, graceDays) ? 'Overdue' : 'Pending';
}

export function viewInvoice(invoice: FeeInvoice, paid: number, today: ISODate, graceDays: number): InvoiceView {
  const status = invoiceStatus(invoice, paid, today, graceDays);
  const balance = invoice.waived ? 0 : Math.max(0, invoice.amount - paid);
  const daysOverdue = status === 'Overdue' ? diffDays(addDays(invoice.dueDate, graceDays), today) : 0;
  return { invoice, paid, balance, status, daysOverdue };
}

const EMPTY_SUMMARY: StudentFeeSummary = {
  status: 'Paid',
  outstanding: 0,
  overdue: 0,
  pending: 0,
  totalBilled: 0,
  totalPaid: 0,
  invoices: [],
};

/**
 * Per-student fee summaries for the whole tenant in one pass.
 * Use via `useFeeIndex()` so it is memoised against store changes.
 */
export function buildFeeIndex(invoices: FeeInvoice[], payments: Payment[], today: ISODate, graceDays: number): Map<ID, StudentFeeSummary> {
  const paid = paidByInvoice(payments);
  const lastPayment = new Map<ID, ISODate>();
  for (const p of payments) {
    const prev = lastPayment.get(p.studentId);
    if (!prev || p.date > prev) lastPayment.set(p.studentId, p.date);
  }

  const index = new Map<ID, StudentFeeSummary>();
  for (const inv of invoices) {
    const view = viewInvoice(inv, paid.get(inv.id) ?? 0, today, graceDays);
    let s = index.get(inv.studentId);
    if (!s) {
      s = { ...EMPTY_SUMMARY, invoices: [], lastPaymentOn: lastPayment.get(inv.studentId) };
      index.set(inv.studentId, s);
    }
    s.invoices.push(view);
    s.totalBilled += inv.waived ? 0 : inv.amount;
    s.totalPaid += view.paid;
    if (view.status === 'Overdue') s.overdue += view.balance;
    if (view.status === 'Pending') s.pending += view.balance;
  }
  for (const s of index.values()) {
    s.outstanding = s.overdue + s.pending;
    s.status = s.overdue > 0 ? 'Overdue' : s.pending > 0 ? 'Pending' : 'Paid';
    s.invoices.sort((a, b) => b.invoice.issuedOn.localeCompare(a.invoice.issuedOn));
  }
  return index;
}

export function feeSummaryFor(index: Map<ID, StudentFeeSummary>, studentId: ID): StudentFeeSummary {
  return index.get(studentId) ?? EMPTY_SUMMARY;
}

/** Monthly collection totals (for charts): period → collected amount. */
export function collectionsByMonth(payments: Payment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    const period = p.date.slice(0, 7);
    map.set(period, (map.get(period) ?? 0) + p.amount);
  }
  return map;
}

/** Billed totals by the invoice's billing month. */
export function billedByMonth(invoices: FeeInvoice[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.waived) continue;
    map.set(inv.period, (map.get(inv.period) ?? 0) + inv.amount);
  }
  return map;
}

/** Invoice amount after the student's concession, rounded to the nearest 10. */
export function discountedFee(monthlyFee: number, concessionPct: number): number {
  return Math.round((monthlyFee * (1 - concessionPct / 100)) / 10) * 10;
}

/**
 * Issue date for a student's invoice in `period` under the tenant's billing mode.
 * joining-date: anniversary of the joining day (capped at 28 so February works).
 */
export function billingDateFor(student: Student, period: string, settings: InstituteSettings): ISODate {
  const day = settings.fees.billingMode === 'fixed-day' ? settings.fees.billingDay : Math.min(28, Number(student.joiningDate.slice(8, 10)));
  return `${period}-${String(day).padStart(2, '0')}`;
}

/** The next `count` billing periods starting from `from` ("YYYY-MM"). */
export function nextPeriods(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(`${from}-01`, i).slice(0, 7));
}
