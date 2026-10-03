/**
 * Pagination, in the two shapes this product needs.
 *
 * Every list endpoint must page and filter **in the database** — never fetch a
 * tenant's rows and slice them in Node. At the 5,000-student target a single
 * institute holds ~4 million attendance records, so one forgotten `findMany()`
 * without `take` is an outage, not a slow page.
 *
 * Offset pagination (`page`/`pageSize`) is right for a screen with page numbers
 * over a bounded list: the staff roster, the roles table, a batch's roster. Its
 * cost is that Postgres must walk and discard `OFFSET` rows, so page 400 of a
 * 4-million-row table reads 10,000 rows to return 25.
 *
 * Keyset pagination (`cursor`) is right for anything unbounded — attendance
 * history, the invoice ledger, a payments day book, the student roster of a large
 * institute. It asks for "the next 50 rows after this one" and, given an index on
 * the sort key, reads exactly 50 whatever page you are on:
 *
 *   ORDER BY name, id            index students(tenantId, name, id)
 *   WHERE (name, id) > ($1, $2)  ← the cursor
 *   LIMIT 50
 *
 * The tie-break column matters: sorting by a non-unique column alone can skip or
 * repeat rows between pages, so every keyset order here ends in `id`.
 *
 * Cursors are opaque on the wire (base64url of a small JSON tuple) because they
 * are an implementation detail — a client that parses one will break when the sort
 * changes. They carry no tenant id and no authority: the tenant still comes from
 * the token, and the Prisma extension still injects it.
 */
import { BadRequestError, ErrorCodes } from '@/common/errors/app.error';

/** Hard ceiling on any page, offset or keyset. Protects the server from a client. */
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 25;

// ------------------------------------------------------------ offset paging

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  /** Total pages, at least 1 so "page 1 of 1" reads correctly for an empty list. */
  pageCount: number;
  hasNext: boolean;
}

export interface Page<T> extends PageMeta {
  items: T[];
}

/** `{ skip, take }` for Prisma, with the page size clamped. */
export function offsetOf(request: PageRequest): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, Math.trunc(request.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(request.pageSize ?? DEFAULT_PAGE_SIZE)));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/** Wraps rows and a count from the database into the wire envelope. */
export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { items, total, page, pageSize, pageCount, hasNext: page < pageCount };
}

// ------------------------------------------------------------ keyset paging

/**
 * The position of the last row of a page, as `[sortValue, id]`. The sort value is
 * whatever the order-by column holds — a string for a name, an ISO date for a
 * calendar column, a number for a counter.
 */
export type CursorKey = readonly [string | number, string];

export interface CursorRequest {
  cursor?: string;
  limit?: number;
}

export interface CursorPage<T> {
  items: T[];
  /** Pass back as `cursor` for the next page. Absent on the last page. */
  nextCursor?: string;
  hasNext: boolean;
  limit: number;
}

/** Encodes a cursor. Opaque on purpose: clients pass it back, they do not read it. */
export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor, rejecting anything that is not the shape we wrote. A malformed
 * cursor is a 400, never a silent "start from the beginning" — that would make a
 * paging bug look like duplicated data.
 */
export function decodeCursor(cursor: string): CursorKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestError('That page cursor is not valid. Start from the first page.', ErrorCodes.VALIDATION_FAILED);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    !(typeof parsed[0] === 'string' || typeof parsed[0] === 'number') ||
    typeof parsed[1] !== 'string'
  ) {
    throw new BadRequestError('That page cursor is not valid. Start from the first page.', ErrorCodes.VALIDATION_FAILED);
  }
  return [parsed[0], parsed[1]] as CursorKey;
}

/** The row limit for a keyset page, clamped like an offset page size. */
export function limitOf(request: CursorRequest): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(request.limit ?? DEFAULT_PAGE_SIZE)));
}

/**
 * The Prisma `where` fragment for "strictly after this cursor" in ascending order
 * on `(sortField, id)`:
 *
 *   sortField > value  OR  (sortField = value AND id > lastId)
 *
 * Returns `undefined` for the first page so the caller can spread it
 * unconditionally. `sortField` is the model's field name and is chosen by the
 * server, never taken from the request.
 */
export function afterCursor(
  sortField: string,
  cursor: string | undefined,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  const [value, id] = decodeCursor(cursor);
  return {
    OR: [{ [sortField]: { gt: value } }, { AND: [{ [sortField]: value }, { id: { gt: id } }] }],
  };
}

/**
 * Turns `limit + 1` rows into a page: the extra row is what proves there is a next
 * page without a second `count(*)` over millions of rows.
 *
 * `keyOf` extracts `[sortValue, id]` from the last row that is actually returned.
 */
export function toCursorPage<T>(rows: readonly T[], limit: number, keyOf: (row: T) => CursorKey): CursorPage<T> {
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : [...rows];
  const last = items.at(-1);
  return {
    items,
    hasNext,
    limit,
    ...(hasNext && last ? { nextCursor: encodeCursor(keyOf(last)) } : {}),
  };
}
