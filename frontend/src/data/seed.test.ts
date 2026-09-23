/**
 * Demo tenant integrity: the seed must be internally consistent (no dangling
 * references, capacity respected) and reproduce the design mock-up rows.
 */
import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from './seed';
import { buildFeeIndex } from '@/domain/fees';
import { occupancy } from '@/domain/academics';

const NOW = new Date(2026, 8, 22, 10, 30); // Tue 22 Sep 2026, 10:30
const data = createDemoSnapshot(NOW);

describe('demo seed', () => {
  it('is deterministic', () => {
    expect(createDemoSnapshot(NOW).students.map((s) => s.id)).toEqual(data.students.map((s) => s.id));
  });

  it('has no dangling references', () => {
    const batchIds = new Set(data.batches.map((b) => b.id));
    const studentIds = new Set(data.students.map((s) => s.id));
    const invoiceIds = new Set(data.invoices.map((i) => i.id));
    expect(data.students.every((s) => s.batchIds.every((id) => batchIds.has(id)))).toBe(true);
    expect(data.sessions.every((s) => batchIds.has(s.batchId) && Object.keys(s.records).every((id) => studentIds.has(id)))).toBe(true);
    expect(data.payments.every((p) => invoiceIds.has(p.invoiceId) && studentIds.has(p.studentId))).toBe(true);
    expect(new Set(data.invoices.map((i) => i.id)).size).toBe(data.invoices.length);
  });

  it('never overfills a batch', () => {
    for (const b of data.batches) expect(occupancy(b, data.students).enrolled).toBeLessThanOrEqual(b.capacity);
  });

  it('reproduces the fee states from the design mock-up', () => {
    const fees = buildFeeIndex(data.invoices, data.payments, '2026-09-22', data.settings.fees.gracePeriodDays);
    expect(fees.get('STU-1042')?.status).toBe('Paid');
    expect(fees.get('STU-1048')?.status).toBe('Pending');
    expect(fees.get('STU-1055')?.status).toBe('Overdue');
    expect(fees.get('STU-1055')?.overdue).toBe(5000);
    expect(data.students.find((s) => s.id === 'STU-1055')?.status).toBe('On Leave');
  });
});
