/**
 * Fee Management data + URL filters.
 *
 * The whole view lives in the URL so it survives refresh and can be shared:
 *   ?tab=dues|invoices|payments
 *   &q= &batch= &due=            (Dues)
 *   &q= &batch= &period= &status= (Invoices)
 *   &q= &method= &from= &to=     (Payments)
 *   &receipt=RCPT-000123[,…]     (open receipt, any tab)
 * Switching tabs clears the previous tab's filters so each view starts clean.
 *
 * A tenant has ≈1,300 invoices and ≈1,200 payments, so every derivation is
 * memoised and filtering runs over pre-joined rows.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Batch, FeeInvoice, FeeStatus, ID, Payment, PaymentMethod, Staff, Student } from '@/types/domain';
import { useFeeIndex, useLookups, useScopedData, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { billedByMonth, collectionsByMonth, feeSummaryFor, nextPeriods, type InvoiceView, type StudentFeeSummary } from '@/domain/fees';
import { addMonths, today } from '@/lib/date';
import { matchesQuery } from '@/lib/format';

/* ------------------------------------------------------------ Filters */

export type FeeTab = 'dues' | 'invoices' | 'payments';
const FEE_TABS: FeeTab[] = ['dues', 'invoices', 'payments'];

export type DueFilter = '' | 'Overdue' | 'Pending';
export type InvoiceStatusFilter = '' | FeeStatus | 'Unpaid' | 'Waived';

export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque'];

export interface FeeFilters {
  tab: FeeTab;
  q: string;
  batch: string;
  due: DueFilter;
  period: string;
  status: InvoiceStatusFilter;
  method: PaymentMethod | '';
  from: string;
  to: string;
}

const DEFAULTS: FeeFilters = { tab: 'dues', q: '', batch: '', due: '', period: '', status: '', method: '', from: '', to: '' };
const FILTER_KEYS = (Object.keys(DEFAULTS) as (keyof FeeFilters)[]).filter((k) => k !== 'tab');

export type SetFeeFilter = <K extends keyof FeeFilters>(key: K, value: FeeFilters[K]) => void;

export function useFeeFilters() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as FeeTab | null;
  const filters: FeeFilters = {
    tab: tabParam && FEE_TABS.includes(tabParam) ? tabParam : DEFAULTS.tab,
    q: params.get('q') ?? DEFAULTS.q,
    batch: params.get('batch') ?? DEFAULTS.batch,
    due: (params.get('due') as DueFilter | null) ?? DEFAULTS.due,
    period: params.get('period') ?? DEFAULTS.period,
    status: (params.get('status') as InvoiceStatusFilter | null) ?? DEFAULTS.status,
    method: (params.get('method') as PaymentMethod | null) ?? DEFAULTS.method,
    from: params.get('from') ?? DEFAULTS.from,
    to: params.get('to') ?? DEFAULTS.to,
  };
  const receipts = (params.get('receipt') ?? '').split(',').filter(Boolean);

  const update = (mutate: (next: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: true },
    );

  const setFilter: SetFeeFilter = (key, value) =>
    update((next) => {
      if (value === DEFAULTS[key]) next.delete(key);
      else next.set(key, String(value));
    });

  const setTab = (tab: FeeTab) =>
    setParams(
      () => {
        const next = new URLSearchParams();
        if (tab !== DEFAULTS.tab) next.set('tab', tab);
        return next;
      },
      { replace: true },
    );

  const reset = () => update((next) => FILTER_KEYS.forEach((k) => next.delete(k)));
  const isFiltered = FILTER_KEYS.some((k) => filters[k] !== DEFAULTS[k]);
  const openReceipt = (receiptNos: string[]) => update((next) => next.set('receipt', receiptNos.join(',')));
  const closeReceipt = () => update((next) => next.delete('receipt'));

  return { filters, setFilter, setTab, reset, isFiltered, receipts, openReceipt, closeReceipt };
}

/* ------------------------------------------------------------ Shared lookups */

/** Every invoice's derived state (paid, balance, status), keyed by invoice id. */
export function useInvoiceViews(): Map<ID, InvoiceView> {
  const feeIndex = useFeeIndex();
  return useMemo(() => {
    const map = new Map<ID, InvoiceView>();
    for (const summary of feeIndex.values()) for (const v of summary.invoices) map.set(v.invoice.id, v);
    return map;
  }, [feeIndex]);
}

/** Batches that can appear in fee filters (anything billed, so archived batches with dues still show). */
export function useFeeBatchOptions() {
  const { batches } = useScopedData();
  return useMemo(
    () => [...batches].sort((a, b) => a.code.localeCompare(b.code)).map((b) => ({ value: b.id, label: `${b.name} (${b.title})` })),
    [batches],
  );
}

const phoneMatch = (q: string, phone: string) => {
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3 && phone.replace(/\D/g, '').includes(digits);
};

/* ------------------------------------------------------------ Dues */

export interface DueRow {
  student: Student;
  fee: StudentFeeSummary;
  unpaid: InvoiceView[];
  maxDaysOverdue: number;
}

export function useDueRows(filters: FeeFilters) {
  const { students } = useScopedData();
  const feeIndex = useFeeIndex();

  // Everyone who owes money — including inactive students, whose dues are still collectable.
  const all = useMemo<DueRow[]>(
    () =>
      students.flatMap((student) => {
        const fee = feeSummaryFor(feeIndex, student.id);
        if (fee.outstanding <= 0) return [];
        const unpaid = fee.invoices.filter((v) => v.balance > 0);
        return [{ student, fee, unpaid, maxDaysOverdue: Math.max(0, ...unpaid.map((v) => v.daysOverdue)) }];
      }),
    [students, feeIndex],
  );

  const { q, due, batch } = filters;
  const rows = useMemo(
    () =>
      all.filter(({ student: s, fee, unpaid }) => {
        if (due === 'Overdue' && fee.overdue <= 0) return false;
        // "Pending" = not yet overdue, so the two filters split the list cleanly.
        if (due === 'Pending' && (fee.pending <= 0 || fee.overdue > 0)) return false;
        if (batch && !unpaid.some((v) => v.invoice.batchId === batch)) return false;
        return !q || matchesQuery(q, s.name, s.id, s.guardian.name) || phoneMatch(q, s.guardian.phone);
      }),
    [all, q, due, batch],
  );

  return { all, rows };
}

/* ------------------------------------------------------------ Invoices */

export interface InvoiceRow {
  view: InvoiceView;
  student?: Student;
  batch?: Batch;
}

export function useInvoiceRows(filters: FeeFilters) {
  const { invoices } = useScopedData();
  const views = useInvoiceViews();
  const lookups = useLookups();

  const all = useMemo<InvoiceRow[]>(
    () =>
      invoices.flatMap((inv) => {
        const view = views.get(inv.id);
        return view ? [{ view, student: lookups.student.get(inv.studentId), batch: lookups.batch.get(inv.batchId) }] : [];
      }),
    [invoices, views, lookups],
  );

  const periods = useMemo(() => [...new Set(invoices.map((i) => i.period))].sort().reverse(), [invoices]);

  const { q, period, status, batch } = filters;
  const rows = useMemo(
    () =>
      all.filter(({ view, student }) => {
        const inv = view.invoice;
        if (period && inv.period !== period) return false;
        if (batch && inv.batchId !== batch) return false;
        if (status === 'Waived' && !inv.waived) return false;
        if (status === 'Unpaid' && view.balance <= 0) return false;
        if (status === 'Paid' && (view.status !== 'Paid' || inv.waived)) return false;
        if ((status === 'Pending' || status === 'Overdue') && view.status !== status) return false;
        return !q || matchesQuery(q, inv.id, student?.name, student?.id);
      }),
    [all, q, period, status, batch],
  );

  return { all, rows, periods };
}

/* ------------------------------------------------------------ Payments */

export interface PaymentRow {
  payment: Payment;
  student?: Student;
  invoice?: FeeInvoice;
  collector?: Staff;
}

/** Join payments with their student, invoice and collecting staff member. */
export function useJoinedPayments(payments: Payment[]): PaymentRow[] {
  const invoices = useDataStore((s) => s.invoices);
  const lookups = useLookups();
  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);
  return useMemo(
    () =>
      payments.map((payment) => ({
        payment,
        student: lookups.student.get(payment.studentId),
        invoice: invoiceById.get(payment.invoiceId),
        collector: lookups.staff.get(payment.collectedBy),
      })),
    [payments, invoiceById, lookups],
  );
}

export function usePaymentRows(filters: FeeFilters) {
  const { payments } = useScopedData();
  const all = useJoinedPayments(payments);
  const { q, method, from, to } = filters;
  const rows = useMemo(
    () =>
      all.filter(({ payment: p, student }) => {
        if (method && p.method !== method) return false;
        if (from && p.date < from) return false;
        if (to && p.date > to) return false;
        return !q || matchesQuery(q, p.receiptNo, p.invoiceId, p.reference, student?.name, student?.id);
      }),
    [all, q, method, from, to],
  );
  return { all, rows };
}

/* ------------------------------------------------------------ Overview (KPIs + charts) */

export interface MonthlyCollection {
  period: string;
  collected: number;
  billed: number;
  receipts: number;
}

/** Whole months from `from` to `to` ("YYYY-MM"), never negative. */
const monthsBetween = (from: string, to: string) =>
  Math.max(0, (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)));

export function useFeeOverview() {
  const { students, invoices, payments } = useScopedData();
  const feeIndex = useFeeIndex();
  const views = useInvoiceViews();
  const ayStart = useSettings().academicYearStart;

  return useMemo(() => {
    const now = today();
    const month = now.slice(0, 7);
    const prevMonth = addMonths(`${month}-01`, -1).slice(0, 7);
    const dayOfMonth = now.slice(8, 10);

    // Cash collected this month vs the same days of last month (a fair month-to-date comparison).
    let collected = 0;
    let receipts = 0;
    let prevToDate = 0;
    let prevTotal = 0;
    const receiptsByMonth = new Map<string, number>();
    for (const p of payments) {
      const m = p.date.slice(0, 7);
      receiptsByMonth.set(m, (receiptsByMonth.get(m) ?? 0) + 1);
      if (m === month) {
        collected += p.amount;
        receipts++;
      } else if (m === prevMonth) {
        prevTotal += p.amount;
        if (p.date.slice(8, 10) <= dayOfMonth) prevToDate += p.amount;
      }
    }

    // Outstanding dues and the Paid / Pending / Overdue split of current students.
    let pending = 0;
    let overdue = 0;
    let pendingInvoices = 0;
    let pendingStudents = 0;
    let overdueStudents = 0;
    const statusCounts: Record<FeeStatus, number> = { Paid: 0, Pending: 0, Overdue: 0 };
    for (const s of students) {
      const fee = feeSummaryFor(feeIndex, s.id);
      pending += fee.pending;
      overdue += fee.overdue;
      if (fee.pending > 0) pendingStudents++;
      if (fee.overdue > 0) overdueStudents++;
      for (const v of fee.invoices) if (v.status === 'Pending' && v.balance > 0) pendingInvoices++;
      if (s.status !== 'Inactive') statusCounts[fee.status]++;
    }

    // Current billing month's collection rate + overdue balance per batch.
    let billedThisPeriod = 0;
    let collectedThisPeriod = 0;
    const overdueByBatch = new Map<ID, number>();
    for (const inv of invoices) {
      const v = views.get(inv.id);
      if (!v) continue;
      if (inv.period === month && !inv.waived) {
        billedThisPeriod += inv.amount;
        collectedThisPeriod += Math.min(v.paid, inv.amount);
      }
      if (v.status === 'Overdue') overdueByBatch.set(inv.batchId, (overdueByBatch.get(inv.batchId) ?? 0) + v.balance);
    }

    // Academic-year months up to now (max 12) for the collections chart.
    const start = ayStart.slice(0, 7) <= month ? ayStart.slice(0, 7) : month;
    const collectedBy = collectionsByMonth(payments);
    const billedBy = billedByMonth(invoices);
    const monthly: MonthlyCollection[] = nextPeriods(start, Math.min(12, monthsBetween(start, month) + 1)).map((period) => ({
      period,
      collected: collectedBy.get(period) ?? 0,
      billed: billedBy.get(period) ?? 0,
      receipts: receiptsByMonth.get(period) ?? 0,
    }));

    return {
      month,
      prevMonth,
      collected,
      receipts,
      prevToDate,
      prevTotal,
      pending,
      pendingInvoices,
      pendingStudents,
      overdue,
      overdueStudents,
      billedThisPeriod,
      collectedThisPeriod,
      collectionRate: billedThisPeriod ? collectedThisPeriod / billedThisPeriod : NaN,
      statusCounts,
      overdueByBatch,
      monthly,
    };
  }, [students, invoices, payments, feeIndex, views, ayStart]);
}
