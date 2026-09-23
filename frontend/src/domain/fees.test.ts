/** Fee rules: invoice status boundaries, per-student summaries, billing dates. */
import { describe, expect, it } from 'vitest';
import type { FeeInvoice, InstituteSettings, Payment, Student } from '@/types/domain';
import { billingDateFor, buildFeeIndex, discountedFee, invoiceStatus, viewInvoice } from './fees';

const inv = (over: Partial<FeeInvoice> = {}): FeeInvoice => ({
  id: 'INV-1',
  studentId: 'STU-1',
  batchId: 'bat-1',
  period: '2026-09',
  description: 'Tuition',
  amount: 2500,
  issuedOn: '2026-09-01',
  dueDate: '2026-09-08',
  ...over,
});

const pay = (over: Partial<Payment> = {}): Payment => ({
  id: 'pay-1',
  receiptNo: 'R-1',
  invoiceId: 'INV-1',
  studentId: 'STU-1',
  amount: 2500,
  date: '2026-09-05',
  method: 'UPI',
  collectedBy: 'st-1',
  ...over,
});

describe('invoiceStatus', () => {
  it('is Paid when fully paid or waived', () => {
    expect(invoiceStatus(inv(), 2500, '2026-10-30', 3)).toBe('Paid');
    expect(invoiceStatus(inv({ waived: true }), 0, '2026-10-30', 3)).toBe('Paid');
  });

  it('stays Pending through the grace period, then turns Overdue', () => {
    expect(invoiceStatus(inv(), 0, '2026-09-08', 3)).toBe('Pending'); // due date
    expect(invoiceStatus(inv(), 0, '2026-09-11', 3)).toBe('Pending'); // last grace day
    expect(invoiceStatus(inv(), 0, '2026-09-12', 3)).toBe('Overdue');
  });

  it('treats partial payment as still owing', () => {
    const v = viewInvoice(inv(), 1000, '2026-09-20', 3);
    expect(v.status).toBe('Overdue');
    expect(v.balance).toBe(1500);
    expect(v.daysOverdue).toBe(9);
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

    const s1 = index.get('STU-1')!;
    expect(s1.status).toBe('Overdue');
    expect(s1.overdue).toBe(2500);
    expect(s1.pending).toBe(2500);
    expect(s1.outstanding).toBe(5000);

    const s2 = index.get('STU-2')!;
    expect(s2.status).toBe('Paid');
    expect(s2.outstanding).toBe(0);
    expect(s2.lastPaymentOn).toBe('2026-09-05');
  });
});

describe('billing helpers', () => {
  const settings = { fees: { billingMode: 'joining-date', billingDay: 5 } } as InstituteSettings;
  const student = { joiningDate: '2026-01-31' } as Student;

  it('bills on the joining anniversary, capped at the 28th', () => {
    expect(billingDateFor(student, '2026-02', settings)).toBe('2026-02-28');
  });

  it('bills on the fixed day when configured', () => {
    const fixed = { fees: { ...settings.fees, billingMode: 'fixed-day' } } as InstituteSettings;
    expect(billingDateFor(student, '2026-02', fixed)).toBe('2026-02-05');
  });

  it('applies concessions and rounds to the nearest 10', () => {
    expect(discountedFee(2500, 15)).toBe(2130);
    expect(discountedFee(2500, 0)).toBe(2500);
  });
});
