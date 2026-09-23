/**
 * Fee rules. The first three blocks are the server-side port of
 * frontend/src/domain/fees.test.ts, expectation for expectation — if the two ever
 * disagree, the UI and the invoice would tell a student different things.
 */
import {
  billingDateFor,
  buildFeeIndex,
  discountedFee,
  dueDateFor,
  invoiceStatus,
  nextPeriods,
  viewInvoice,
  type InvoiceLike,
  type PaymentLike,
} from './fees';

const inv = (over: Partial<InvoiceLike> = {}): InvoiceLike => ({
  id: 'INV-1',
  studentId: 'STU-1',
  period: '2026-09',
  amount: 2500,
  issuedOn: '2026-09-01',
  dueDate: '2026-09-08',
  ...over,
});

const pay = (over: Partial<PaymentLike> = {}): PaymentLike => ({
  invoiceId: 'INV-1',
  studentId: 'STU-1',
  amount: 2500,
  date: '2026-09-05',
  ...over,
});

describe('invoiceStatus', () => {
  it('is Paid when fully paid or waived', () => {
    expect(invoiceStatus(inv(), 2500, '2026-10-30', 3)).toBe('Paid');
    expect(invoiceStatus(inv({ waived: true }), 0, '2026-10-30', 3)).toBe('Paid');
  });

  it('stays Pending through the grace period, then turns Overdue', () => {
    expect(invoiceStatus(inv(), 0, '2026-09-08', 3)).toBe('Pending'); // due date itself
    expect(invoiceStatus(inv(), 0, '2026-09-11', 3)).toBe('Pending'); // last day of grace
    expect(invoiceStatus(inv(), 0, '2026-09-12', 3)).toBe('Overdue');
  });

  it('treats an overpayment as Paid', () => {
    expect(invoiceStatus(inv(), 3000, '2026-10-30', 3)).toBe('Paid');
  });

  it('treats partial payment as still owing', () => {
    const view = viewInvoice(inv(), 1000, '2026-09-20', 3);
    expect(view.status).toBe('Overdue');
    expect(view.balance).toBe(1500);
    expect(view.daysOverdue).toBe(9);
  });

  it('reports no balance on a waived invoice, whatever was paid', () => {
    expect(viewInvoice(inv({ waived: true }), 0, '2026-12-01', 3)).toMatchObject({ balance: 0, daysOverdue: 0, status: 'Paid' });
  });
});

describe('buildFeeIndex', () => {
  it('summarises outstanding, overdue and status per student', () => {
    const invoices = [
      inv({ id: 'A', dueDate: '2026-08-08' }),
      inv({ id: 'B', dueDate: '2026-09-20' }),
      inv({ id: 'C', studentId: 'STU-2' }),
    ];
    const payments = [pay({ invoiceId: 'C', studentId: 'STU-2' })];
    const index = buildFeeIndex(invoices, payments, '2026-09-22', 3);

    const first = index.get('STU-1')!;
    expect(first.status).toBe('Overdue');
    expect(first.overdue).toBe(2500);
    expect(first.pending).toBe(2500);
    expect(first.outstanding).toBe(5000);
    expect(first.totalBilled).toBe(5000);

    const second = index.get('STU-2')!;
    expect(second.status).toBe('Paid');
    expect(second.outstanding).toBe(0);
    expect(second.lastPaymentOn).toBe('2026-09-05');
  });

  it('adds partial payments across several receipts', () => {
    const index = buildFeeIndex([inv()], [pay({ amount: 1000 }), pay({ amount: 1500, date: '2026-09-07' })], '2026-09-30', 3);
    const summary = index.get('STU-1')!;
    expect(summary.status).toBe('Paid');
    expect(summary.totalPaid).toBe(2500);
    expect(summary.lastPaymentOn).toBe('2026-09-07');
  });

  it('lists a student invoices newest first', () => {
    const index = buildFeeIndex(
      [inv({ id: 'old', issuedOn: '2026-07-01' }), inv({ id: 'new', issuedOn: '2026-09-01' })],
      [],
      '2026-09-05',
      3,
    );
    expect(index.get('STU-1')!.invoices.map((view) => view.invoice.id)).toEqual(['new', 'old']);
  });

  it('excludes waived invoices from the billed total', () => {
    const index = buildFeeIndex([inv(), inv({ id: 'W', waived: true })], [], '2026-09-05', 3);
    expect(index.get('STU-1')!.totalBilled).toBe(2500);
  });

  it('returns nothing for a student with no invoices', () => {
    expect(buildFeeIndex([], [], '2026-09-05', 3).get('STU-9')).toBeUndefined();
  });
});

describe('billing helpers', () => {
  it('bills on the joining anniversary, capped at the 28th so February works', () => {
    expect(billingDateFor('2026-01-31', '2026-02', { billingMode: 'joining-date', billingDay: 5 })).toBe('2026-02-28');
    expect(billingDateFor('2026-01-12', '2026-03', { billingMode: 'joining-date', billingDay: 5 })).toBe('2026-03-12');
  });

  it('bills on the fixed day when configured', () => {
    expect(billingDateFor('2026-01-31', '2026-02', { billingMode: 'fixed-day', billingDay: 5 })).toBe('2026-02-05');
  });

  it('derives the due date from the institute grace settings', () => {
    expect(dueDateFor('2026-09-01', 7)).toBe('2026-09-08');
    expect(dueDateFor('2026-08-28', 7)).toBe('2026-09-04'); // crosses the month boundary
  });

  it('applies concessions and rounds to the nearest 10', () => {
    expect(discountedFee(2500, 15)).toBe(2130);
    expect(discountedFee(2500, 0)).toBe(2500);
    expect(discountedFee(1800, 25)).toBe(1350);
  });

  it('walks forward through billing periods, including across a year end', () => {
    expect(nextPeriods('2026-11', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});
