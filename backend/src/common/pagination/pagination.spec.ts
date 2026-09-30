/**
 * Pagination is pure arithmetic and string handling, so it is tested without a
 * database. The properties that matter: page sizes are always clamped, a keyset
 * page never skips or repeats a row, and a malformed cursor is a 400 rather than a
 * silent jump back to page one.
 */
import { BadRequestError } from '@/common/errors/app.error';
import {
  afterCursor,
  decodeCursor,
  encodeCursor,
  limitOf,
  MAX_PAGE_SIZE,
  offsetOf,
  toCursorPage,
  toPage,
  type CursorKey,
} from './pagination';

describe('offset pagination', () => {
  it('defaults to the first page of 25', () => {
    expect(offsetOf({})).toEqual({ skip: 0, take: 25, page: 1, pageSize: 25 });
  });

  it('turns a page number into a skip', () => {
    expect(offsetOf({ page: 4, pageSize: 50 })).toEqual({ skip: 150, take: 50, page: 4, pageSize: 50 });
  });

  it('clamps a page size a client asked to blow up', () => {
    expect(offsetOf({ pageSize: 100_000 }).take).toBe(MAX_PAGE_SIZE);
    expect(offsetOf({ pageSize: 0 }).take).toBe(1);
    expect(offsetOf({ page: -3 }).page).toBe(1);
  });

  it('reports a page count of 1 for an empty list', () => {
    expect(toPage([], 0, 1, 25)).toEqual({ items: [], total: 0, page: 1, pageSize: 25, pageCount: 1, hasNext: false });
  });

  it('knows when there is a next page', () => {
    expect(toPage([1, 2], 60, 1, 25).hasNext).toBe(true);
    expect(toPage([1, 2], 60, 3, 25).hasNext).toBe(false);
  });
});

describe('cursors', () => {
  it('round-trips a key', () => {
    const key: CursorKey = ['Aarav Patel', '11111111-1111-4111-8111-111111111111'];
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it('round-trips a numeric sort value', () => {
    expect(decodeCursor(encodeCursor([20260929, 'stu-1']))).toEqual([20260929, 'stu-1']);
  });

  it('is url-safe, so it survives a query string untouched', () => {
    const encoded = encodeCursor(['Zoë / Ünal+Kumar', 'id-1']);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)[0]).toBe('Zoë / Ünal+Kumar');
  });

  it.each(['not-base64!!', '', encodeCursorRaw('"just a string"'), encodeCursorRaw('[1]'), encodeCursorRaw('["a","b","c"]')])(
    'rejects the malformed cursor %p',
    (cursor) => {
      expect(() => decodeCursor(cursor)).toThrow(BadRequestError);
    },
  );
});

describe('afterCursor', () => {
  it('is undefined on the first page, so it can be spread unconditionally', () => {
    expect(afterCursor('name', undefined)).toBeUndefined();
  });

  it('builds the (sort, id) tuple comparison Postgres can range-scan', () => {
    const where = afterCursor('name', encodeCursor(['Kiran', 'stu-9']));
    expect(where).toEqual({
      OR: [{ name: { gt: 'Kiran' } }, { AND: [{ name: 'Kiran' }, { id: { gt: 'stu-9' } }] }],
    });
  });
});

describe('toCursorPage', () => {
  interface Row {
    id: string;
    name: string;
  }
  const keyOf = (row: Row): CursorKey => [row.name, row.id];
  const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: `id-${i}`, name: `name-${i}` }));

  it('uses the extra row as the "is there more" signal and does not return it', () => {
    const page = toCursorPage(rows(4), 3, keyOf);
    expect(page.items).toHaveLength(3);
    expect(page.hasNext).toBe(true);
    expect(page.nextCursor).toBe(encodeCursor(['name-2', 'id-2']));
  });

  it('has no cursor on the last page', () => {
    const page = toCursorPage(rows(2), 3, keyOf);
    expect(page.items).toHaveLength(2);
    expect(page.hasNext).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });

  it('handles an empty result', () => {
    expect(toCursorPage([], 25, keyOf)).toEqual({ items: [], hasNext: false, limit: 25 });
  });

  it('walks a whole list exactly once, in order, with no gaps or repeats', () => {
    // The property that makes keyset paging correct. The array below stands in for
    // the index: `rowsAfter` is what `WHERE (name, id) > (…) ORDER BY name, id
    // LIMIT n+1` returns, and the loop is a client following `nextCursor`.
    const all = rows(23).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const rowsAfter = (cursor: string | undefined, take: number): Row[] => {
      if (!cursor) return all.slice(0, take);
      const [name, id] = decodeCursor(cursor);
      return all.filter((row) => row.name > name || (row.name === name && row.id > id)).slice(0, take);
    };

    const seen: string[] = [];
    let cursor: string | undefined;
    // The guard bounds the loop so a paging bug fails the test instead of hanging.
    for (let guard = 0; guard < 20; guard += 1) {
      const page = toCursorPage(rowsAfter(cursor, 6), 5, keyOf);
      seen.push(...page.items.map((row) => row.id));
      if (!page.hasNext) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(all.map((row) => row.id));
    expect(new Set(seen).size).toBe(all.length);
  });
});

describe('limitOf', () => {
  it('clamps like a page size', () => {
    expect(limitOf({})).toBe(25);
    expect(limitOf({ limit: 500 })).toBe(MAX_PAGE_SIZE);
    expect(limitOf({ limit: 0 })).toBe(1);
  });
});

/** Encodes arbitrary JSON text the way a hostile client might. */
function encodeCursorRaw(json: string): string {
  return Buffer.from(json, 'utf8').toString('base64url');
}
