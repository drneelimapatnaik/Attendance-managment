/**
 * A tiny in-memory stand-in for the handful of Prisma operations the role and staff
 * services use, so their rules can be unit-tested without a database.
 *
 * It is deliberately small: it understands the query shapes those two services
 * actually write (equality, `equals` with `mode: 'insensitive'`, `in`, `contains`,
 * `NOT`, `OR`, a one-level relation filter, `orderBy`, `skip`/`take`) and nothing
 * else. Anything cleverer belongs in the end-to-end suite, which runs against real
 * PostgreSQL.
 *
 * It lives under test/ so it is never part of a production build
 * (tsconfig.build.json excludes the directory).
 */

export type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Does `row` satisfy this `where` clause? */
export function matchesWhere(row: Row, where: Where | undefined): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'NOT') return !matchesWhere(row, condition as Where);
    if (key === 'OR') return (condition as Where[]).some((clause) => matchesWhere(row, clause));
    if (key === 'AND') return (condition as Where[]).every((clause) => matchesWhere(row, clause));

    const actual = row[key];
    if (condition === null) return actual === null || actual === undefined;

    if (isObject(condition)) {
      if ('equals' in condition) {
        const expected = condition.equals;
        if (condition.mode === 'insensitive' && typeof actual === 'string' && typeof expected === 'string') {
          return actual.toLowerCase() === expected.toLowerCase();
        }
        return actual === expected;
      }
      if ('contains' in condition) {
        const needle = String(condition.contains);
        if (typeof actual !== 'string') return false;
        return condition.mode === 'insensitive' ? actual.toLowerCase().includes(needle.toLowerCase()) : actual.includes(needle);
      }
      if ('in' in condition) return (condition.in as unknown[]).includes(actual);
      // A relation filter such as `{ role: { key: 'faculty' } }`: the row must have
      // been hydrated with that relation (see FakeTable's `hydrate` option).
      if (isObject(actual)) return matchesWhere(actual, condition);
      return false;
    }

    return actual === condition;
  });
}

export interface FakeTableOptions<T extends Row> {
  /** Fills in ids and defaults for `create`. */
  build?: (data: Row, sequence: number) => T;
  /** Adds joined relations and computed counts before matching and returning. */
  hydrate?: (row: T) => Row;
}

/** One table. `rows` is public so a test can assert on the stored state. */
export class FakeTable<T extends Row> {
  constructor(
    public rows: T[] = [],
    private readonly options: FakeTableOptions<T> = {},
  ) {}

  private sequence = 0;

  private view(row: T): Row {
    return this.options.hydrate ? this.options.hydrate(row) : row;
  }

  findFirst = async ({ where }: { where?: Where; select?: unknown } = {}): Promise<Row | null> => {
    const row = this.rows.map((candidate) => this.view(candidate)).find((candidate) => matchesWhere(candidate, where));
    return row ?? null;
  };

  findUnique = async (args: { where?: Where } = {}): Promise<Row | null> => this.findFirst(args);

  findMany = async ({
    where,
    orderBy,
    skip,
    take,
  }: { where?: Where; orderBy?: Row | Row[]; skip?: number; take?: number; select?: unknown } = {}): Promise<Row[]> => {
    let rows = this.rows.map((row) => this.view(row)).filter((row) => matchesWhere(row, where));
    if (orderBy) rows = sortRows(rows, Array.isArray(orderBy) ? orderBy : [orderBy]);
    if (skip) rows = rows.slice(skip);
    if (take !== undefined) rows = rows.slice(0, take);
    return rows;
  };

  count = async ({ where }: { where?: Where } = {}): Promise<number> =>
    this.rows.map((row) => this.view(row)).filter((row) => matchesWhere(row, where)).length;

  create = async ({ data }: { data: Row; select?: unknown }): Promise<Row> => {
    const row = this.options.build
      ? this.options.build(data, ++this.sequence)
      : ({ id: `row-${this.sequence + 1}`, ...data } as unknown as T);
    if (!this.options.build) this.sequence += 1;
    this.rows.push(row);
    return this.view(row);
  };

  createMany = async ({ data }: { data: Row[] }): Promise<{ count: number }> => {
    for (const entry of data) await this.create({ data: entry });
    return { count: data.length };
  };

  update = async ({ where, data }: { where: Where; data: Row; select?: unknown }): Promise<Row> => {
    const row = this.rows.find((candidate) => matchesWhere(this.view(candidate), where));
    if (!row) throw new Error(`fake ${JSON.stringify(where)}: no such row`);
    Object.assign(row, unwrapUpdate(data));
    return this.view(row);
  };

  updateMany = async ({ where, data }: { where?: Where; data: Row }): Promise<{ count: number }> => {
    const matches = this.rows.filter((row) => matchesWhere(this.view(row), where));
    matches.forEach((row) => Object.assign(row, unwrapUpdate(data)));
    return { count: matches.length };
  };

  delete = async ({ where }: { where: Where }): Promise<Row> => {
    const index = this.rows.findIndex((row) => matchesWhere(this.view(row), where));
    if (index < 0) throw new Error(`fake ${JSON.stringify(where)}: no such row`);
    const [row] = this.rows.splice(index, 1);
    return this.view(row);
  };

  deleteMany = async ({ where }: { where?: Where } = {}): Promise<{ count: number }> => {
    const keep = this.rows.filter((row) => !matchesWhere(this.view(row), where));
    const removed = this.rows.length - keep.length;
    this.rows = keep;
    return { count: removed };
  };
}

/**
 * Prisma's update input expresses a foreign key as `{ role: { connect: { id } } }`.
 * The fake stores plain columns, so unwrap those back to the scalar.
 */
function unwrapUpdate(data: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(data)) {
    if (isObject(value) && isObject(value.connect) && typeof value.connect.id === 'string') {
      out[`${key}Id`] = value.connect.id;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function sortRows(rows: Row[], orderBy: Row[]): Row[] {
  return [...rows].sort((left, right) => {
    for (const clause of orderBy) {
      for (const [key, direction] of Object.entries(clause)) {
        const a = left[key];
        const b = right[key];
        if (a === b) continue;
        const ascending = a === null || a === undefined ? -1 : b === null || b === undefined ? 1 : a < b ? -1 : 1;
        return direction === 'desc' ? -ascending : ascending;
      }
    }
    return 0;
  });
}
