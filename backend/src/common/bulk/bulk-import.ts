/**
 * The shared shape of every bulk import in EduTrack (admissions today; bulk
 * attendance and fee uploads next).
 *
 * An institute joining EduTrack arrives with a spreadsheet of 5,000 students, and
 * a front desk uploads a hundred new admissions in July. Three rules follow from
 * that, and they are what this module enforces:
 *
 *   1. **Per-row results, not one verdict.** Row 412 having an empty guardian
 *      phone must not reject the other 4,999 rows. Every row comes back with its
 *      own outcome, keyed by its position in the upload, so the UI can show "4,987
 *      admitted, 13 need attention" with the reasons next to the rows.
 *
 *   2. **Validate everything before writing anything.** Validation is pure and
 *      happens first, in memory: it needs no database, catches duplicates *within*
 *      the file (two rows claiming the same roll number), and means the write phase
 *      is not interleaved with round trips.
 *
 *   3. **Write in batches, inside a transaction.** One `createMany` of 5,000 rows
 *      is a single huge statement; 5,000 `create` calls are 5,000 round trips.
 *      Chunks of ~500 are the middle ground, and running them in one transaction
 *      makes the import all-or-nothing: a partial import is far worse than a failed
 *      one, because nobody can tell which half landed.
 *
 * Nothing here knows what a student is. `validateRows` and `chunk` are generic and
 * the caller supplies the row validator and the insert, so the next import reuses
 * this file rather than copying it.
 */

/** How many rows go into one `createMany`. Tuned in scripts/loadtest-seed.ts. */
export const DEFAULT_BATCH_SIZE = 500;

/** The worst case we will accept in one request, so a body cannot exhaust memory. */
export const MAX_IMPORT_ROWS = 5000;

export type RowStatus = 'created' | 'skipped' | 'failed';

export interface RowResult {
  /** 1-based position in the uploaded file, so it matches what the operator sees. */
  row: number;
  status: RowStatus;
  /** Set for `created`: the id of the row that now exists. */
  id?: string;
  /** A human-readable identifier from the row (roll number), to name it in the UI. */
  ref?: string;
  /** Why it was skipped or failed. Safe to show a user. */
  message?: string;
  /** Which field is at fault, when it is one field. */
  field?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
}

export interface ImportOutcome {
  summary: ImportSummary;
  results: RowResult[];
}

/** What a row validator returns: either a value ready to insert, or a problem. */
export type RowVerdict<T> = { ok: true; value: T } | { ok: false; message: string; field?: string; status?: RowStatus };

export interface ValidateOptions<TInput, TValid> {
  rows: readonly TInput[];
  /** Pure per-row check. Must not touch the database. */
  validate: (row: TInput, index: number) => RowVerdict<TValid>;
  /**
   * The value that must be unique across the upload (a roll number, a card
   * number). Duplicates inside one file are the most common spreadsheet error and
   * the database's unique constraint would abort the whole transaction, so they
   * are caught here instead.
   */
  uniqueBy?: (value: TValid) => readonly string[];
  /** A short human reference for the row, used in the result. */
  refOf?: (row: TInput) => string | undefined;
}

export interface ValidationOutput<TValid> {
  /** Rows that passed, with the index they came from, in upload order. */
  valid: { index: number; value: TValid }[];
  /** Results for rows that did not pass; merged with the write results later. */
  problems: RowResult[];
}

/**
 * Runs the validator over every row and separates the usable from the broken.
 * Never throws: a validator that throws would lose the other rows' verdicts, so
 * an unexpected error is reported as that row's failure.
 */
export function validateRows<TInput, TValid>(options: ValidateOptions<TInput, TValid>): ValidationOutput<TValid> {
  const valid: { index: number; value: TValid }[] = [];
  const problems: RowResult[] = [];
  // key → the 1-based row number that claimed it first.
  const claimed = new Map<string, number>();

  options.rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const ref = options.refOf?.(row);

    let verdict: RowVerdict<TValid>;
    try {
      verdict = options.validate(row, index);
    } catch (error) {
      problems.push({ row: rowNumber, status: 'failed', ref, message: `Could not read this row: ${(error as Error).message}` });
      return;
    }

    if (!verdict.ok) {
      problems.push({ row: rowNumber, status: verdict.status ?? 'failed', ref, message: verdict.message, field: verdict.field });
      return;
    }

    const keys = options.uniqueBy?.(verdict.value) ?? [];
    const clash = keys.find((key) => claimed.has(key));
    if (clash !== undefined) {
      problems.push({
        row: rowNumber,
        status: 'failed',
        ref,
        message: `Duplicated in this file: row ${claimed.get(clash)} already uses "${clash.split(':').slice(1).join(':')}".`,
      });
      return;
    }
    for (const key of keys) claimed.set(key, rowNumber);

    valid.push({ index, value: verdict.value });
  });

  return { valid, problems };
}

/** Splits an array into fixed-size chunks, the last one short. */
export function chunk<T>(items: readonly T[], size: number = DEFAULT_BATCH_SIZE): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Merges the per-row problems with the created rows into one ordered report.
 * `createdIds` is indexed the same way as `valid` from `validateRows`.
 */
export function buildOutcome(
  total: number,
  problems: readonly RowResult[],
  created: readonly { index: number; id: string; ref?: string }[],
): ImportOutcome {
  const results: RowResult[] = [
    ...problems,
    ...created.map((row) => ({ row: row.index + 1, status: 'created' as const, id: row.id, ref: row.ref })),
  ].sort((a, b) => a.row - b.row);

  return {
    summary: {
      total,
      created: results.filter((result) => result.status === 'created').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
    },
    results,
  };
}

/** Prefixes a uniqueness key with its field, so two fields cannot collide. */
export function uniqueKey(field: string, value: string): string {
  return `${field}:${value.trim().toLowerCase()}`;
}
