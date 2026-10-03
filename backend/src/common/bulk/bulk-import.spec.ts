/**
 * The bulk-import helper is pure, so these tests are the specification: one bad
 * row must never cost a good one, duplicates inside a file are caught before the
 * database sees them, and the report comes back in upload order.
 */
import { buildOutcome, chunk, uniqueKey, validateRows, type RowVerdict } from './bulk-import';

interface Row {
  code?: string;
  name?: string;
}

const validate = (row: Row): RowVerdict<{ code: string; name: string }> => {
  if (!row.code) return { ok: false, message: 'Roll number is required.', field: 'studentCode' };
  if (!row.name) return { ok: false, message: 'Name is required.', field: 'name' };
  return { ok: true, value: { code: row.code, name: row.name } };
};

describe('validateRows', () => {
  it('keeps the good rows and reports the bad ones by row number', () => {
    const output = validateRows({
      rows: [{ code: 'A1', name: 'Aarav' }, { code: 'A2' }, { name: 'Kiran' }, { code: 'A4', name: 'Meera' }],
      validate,
      refOf: (row) => row.code,
    });

    expect(output.valid.map((entry) => entry.value.code)).toEqual(['A1', 'A4']);
    expect(output.valid.map((entry) => entry.index)).toEqual([0, 3]);
    expect(output.problems).toEqual([
      { row: 2, status: 'failed', ref: 'A2', message: 'Name is required.', field: 'name' },
      { row: 3, status: 'failed', ref: undefined, message: 'Roll number is required.', field: 'studentCode' },
    ]);
  });

  it('catches a duplicate inside the file, naming the row that claimed it first', () => {
    const output = validateRows({
      rows: [
        { code: 'A1', name: 'Aarav' },
        { code: 'a1', name: 'Another Aarav' },
      ],
      validate,
      uniqueBy: (value) => [uniqueKey('studentCode', value.code)],
      refOf: (row) => row.code,
    });

    expect(output.valid).toHaveLength(1);
    expect(output.problems[0].row).toBe(2);
    expect(output.problems[0].message).toContain('row 1 already uses');
  });

  it('treats a validator that throws as that row failing, not the import', () => {
    const output = validateRows<Row, Row>({
      rows: [{ code: 'A1' }, { code: 'boom' }],
      validate: (row) => {
        if (row.code === 'boom') throw new Error('unexpected shape');
        return { ok: true, value: row };
      },
    });

    expect(output.valid).toHaveLength(1);
    expect(output.problems[0]).toMatchObject({ row: 2, status: 'failed' });
    expect(output.problems[0].message).toContain('unexpected shape');
  });

  it('lets a validator mark a row as skipped rather than failed', () => {
    const output = validateRows<Row, Row>({
      rows: [{ code: 'A1' }],
      validate: () => ({ ok: false, message: 'Already admitted.', status: 'skipped' }),
    });
    expect(output.problems[0].status).toBe('skipped');
  });

  it('accepts an empty upload', () => {
    expect(validateRows({ rows: [], validate })).toEqual({ valid: [], problems: [] });
  });
});

describe('chunk', () => {
  it('splits into fixed-size batches with a short last one', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunk([], 500)).toEqual([]);
  });

  it('refuses a nonsensical size rather than looping forever', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('buildOutcome', () => {
  it('interleaves created rows and problems back into upload order', () => {
    const outcome = buildOutcome(
      4,
      [{ row: 2, status: 'failed', message: 'Name is required.' }],
      [
        { index: 0, id: 'id-1', ref: 'A1' },
        { index: 2, id: 'id-3', ref: 'A3' },
        { index: 3, id: 'id-4', ref: 'A4' },
      ],
    );

    expect(outcome.results.map((result) => result.row)).toEqual([1, 2, 3, 4]);
    expect(outcome.summary).toEqual({ total: 4, created: 3, skipped: 0, failed: 1 });
  });
});
