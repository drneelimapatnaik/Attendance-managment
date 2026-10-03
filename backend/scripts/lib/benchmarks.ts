/**
 * The queries behind the real screens, as SQL, with the fixtures they need.
 *
 * Each entry is one thing a user does: open the dashboard, open a batch's
 * attendance for a month, open a student, open the fee dues list, look at
 * collections, run a yearly report. They are written as raw SQL rather than through
 * Prisma so that `EXPLAIN ANALYZE` reports on exactly the statement that was timed
 * — with Prisma in the way you measure the client as much as the database, and you
 * cannot explain the statement you did not see.
 *
 * Where a query has a fast form and an obvious slow form (the fee dues list), both
 * are here: the point of the benchmark is to show *why* the shipped shape is the
 * shipped shape, not only that it is fast.
 *
 * Every statement filters by `tenantId` even though a client database holds exactly
 * one tenant. That is not redundancy for its own sake — it is the shape the
 * application's queries have (the Prisma extension injects it), so the benchmark
 * has to use the same indexes the application will.
 */
import type { PrismaClient } from '@prisma/client';

export interface Fixtures {
  tenantId: string;
  /** The most recent date that has sessions — "today" for the roll-call query. */
  today: string;
  /** A batch with a full history. */
  batchId: string;
  batchCode: string;
  /** A student with a full history. */
  studentId: string;
  /** First day of a month with attendance, and the day after that month. */
  monthStart: string;
  monthEnd: string;
  /** An academic year: 1 June to 31 May. */
  yearStart: string;
  yearEnd: string;
  /** Twelve months back from `today`. */
  yearAgo: string;
  /** A student name to page from, for the keyset roster query. */
  cursorName: string;
  cursorId: string;
  /** How deep the offset comparison goes. */
  deepOffset: number;
}

export interface Benchmark {
  /** Short id used in the results table. */
  key: string;
  /** The screen this query is behind. */
  screen: string;
  /** What it does, in one line. */
  what: string;
  sql: string;
  params: (fixtures: Fixtures) => unknown[];
  /** Rows the query is expected to return, for the report. */
  note?: string;
}

/** Reads the fixtures out of the seeded database. */
export async function readFixtures(db: PrismaClient, tenantId: string): Promise<Fixtures> {
  const [dates] = await db.$queryRawUnsafe<{ today: Date; earliest: Date }[]>(
    `SELECT max(date) AS today, min(date) AS earliest FROM attendance_sessions WHERE "tenantId" = $1::uuid`,
    tenantId,
  );
  const today = iso(dates.today);

  // The batch with the most attendance records: the worst realistic case for the
  // "a month of attendance" and "yearly report" screens.
  const [batch] = await db.$queryRawUnsafe<{ id: string; code: string }[]>(
    `SELECT b.id, b.code
     FROM batches b JOIN attendance_sessions s ON s."batchId" = b.id
     WHERE b."tenantId" = $1::uuid
     GROUP BY b.id, b.code ORDER BY count(*) DESC LIMIT 1`,
    tenantId,
  );

  // The student with the longest history, for the same reason.
  const [student] = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "studentId" AS id FROM attendance_records WHERE "tenantId" = $1::uuid
     GROUP BY "studentId" ORDER BY count(*) DESC LIMIT 1`,
    tenantId,
  );

  // A cursor half way down the roster, so the keyset and offset queries are
  // compared at the same depth.
  const [half] = await db.$queryRawUnsafe<{ name: string; id: string; total: bigint }[]>(
    `WITH ordered AS (
       SELECT name, id, row_number() OVER (ORDER BY name, id) AS n, count(*) OVER () AS total
       FROM students WHERE "tenantId" = $1::uuid
     )
     SELECT name, id, total FROM ordered WHERE n = greatest(1, (SELECT total FROM ordered LIMIT 1) / 2)`,
    tenantId,
  );

  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = addMonths(monthStart, 1);
  // The academic year containing `today`, June to June.
  const yearStartYear = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) >= 6 ? 0 : 1);
  return {
    tenantId,
    today,
    batchId: batch.id,
    batchCode: batch.code,
    studentId: student.id,
    monthStart,
    monthEnd,
    yearStart: `${yearStartYear}-06-01`,
    yearEnd: `${yearStartYear + 1}-06-01`,
    yearAgo: addMonths(`${today.slice(0, 7)}-01`, -11),
    cursorName: half?.name ?? '',
    cursorId: half?.id ?? '00000000-0000-4000-8000-000000000000',
    deepOffset: Math.max(0, Math.floor(Number(half?.total ?? 0) / 2)),
  };
}

export const BENCHMARKS: readonly Benchmark[] = [
  {
    key: 'rollcall',
    screen: 'Dashboard / Attendance → today',
    what: "Every batch that meets today, with today's roll call if it has been taken",
    sql: `
      SELECT b.id, b.code, b.title, b."startTime", b."endTime", s.id AS session_id,
             count(r.id) AS marked,
             count(r.id) FILTER (WHERE r.mark IN ('P', 'L')) AS present
      FROM batches b
      LEFT JOIN attendance_sessions s
        ON s."tenantId" = b."tenantId" AND s."batchId" = b.id AND s.date = $2::date
      LEFT JOIN attendance_records r ON r."sessionId" = s.id
      WHERE b."tenantId" = $1::uuid
        AND b.status = 'Active'
        AND (to_char($2::date, 'Dy')::"Weekday") = ANY (b.days)
      GROUP BY b.id, b.code, b.title, b."startTime", b."endTime", s.id
      ORDER BY b."startTime", b.code
    `,
    params: (f) => [f.tenantId, f.today],
    note: 'One row per batch meeting today',
  },
  {
    key: 'batch-month',
    screen: 'Attendance → batch, month view',
    what: 'A whole month of marks for one batch (the attendance grid)',
    sql: `
      SELECT s.id, s.date, r."studentId", r.mark, r."lateByMinutes"
      FROM attendance_sessions s
      JOIN attendance_records r ON r."sessionId" = s.id
      WHERE s."tenantId" = $1::uuid AND s."batchId" = $2::uuid
        AND s.date >= $3::date AND s.date < $4::date
      ORDER BY s.date, r."studentId"
    `,
    params: (f) => [f.tenantId, f.batchId, f.monthStart, f.monthEnd],
    note: 'Sessions × enrolled students for one month',
  },
  {
    key: 'student-history',
    screen: 'Student profile → attendance',
    what: "One student's attendance, newest first, one keyset page of 50",
    sql: `
      SELECT s.date, s."batchId", r.id, r.mark
      FROM attendance_records r
      JOIN attendance_sessions s ON s.id = r."sessionId"
      WHERE r."tenantId" = $1::uuid AND r."studentId" = $2::uuid
      ORDER BY s.date DESC, r.id DESC
      LIMIT 51
    `,
    params: (f) => [f.tenantId, f.studentId],
    note: '50 rows + 1 to detect a next page',
  },
  {
    key: 'student-percent',
    screen: 'Student profile → attendance %',
    what: "The P/L/A/E counts behind one student's attendance percentage",
    sql: `
      SELECT mark, count(*) AS marks
      FROM attendance_records
      WHERE "tenantId" = $1::uuid AND "studentId" = $2::uuid
      GROUP BY mark
    `,
    params: (f) => [f.tenantId, f.studentId],
    note: 'Index-only aggregate over one student',
  },
  {
    key: 'fee-dues',
    screen: 'Fees → dues list',
    what: 'The first page of unpaid invoices, oldest due first',
    sql: `
      SELECT i.id, i."invoiceNo", i."studentId", st.name, i.period, i.amount, i."dueDate", pay.paid
      FROM fee_invoices i
      JOIN students st ON st.id = i."studentId"
      LEFT JOIN LATERAL (
        SELECT coalesce(sum(p.amount), 0) AS paid FROM payments p WHERE p."invoiceId" = i.id
      ) pay ON true
      WHERE i."tenantId" = $1::uuid AND i.waived = false AND pay.paid < i.amount
      ORDER BY i."dueDate", i.id
      LIMIT 50
    `,
    params: (f) => [f.tenantId],
    note: 'Walks the dueDate index and stops at 50 unpaid',
  },
  {
    key: 'fee-dues-naive',
    screen: 'Fees → dues list (the shape NOT to ship)',
    what: 'Same list, but aggregating every payment in the institute first',
    sql: `
      SELECT i.id, i."invoiceNo", st.name, i.amount, i."dueDate", coalesce(p.paid, 0) AS paid
      FROM fee_invoices i
      JOIN students st ON st.id = i."studentId"
      LEFT JOIN (
        SELECT "invoiceId", sum(amount) AS paid FROM payments WHERE "tenantId" = $1::uuid GROUP BY "invoiceId"
      ) p ON p."invoiceId" = i.id
      WHERE i."tenantId" = $1::uuid AND i.waived = false AND coalesce(p.paid, 0) < i.amount
      ORDER BY i."dueDate", i.id
      LIMIT 50
    `,
    params: (f) => [f.tenantId],
    note: 'Kept as a comparison, not as a shipped query',
  },
  {
    key: 'collections',
    screen: 'Fees → collections chart',
    what: 'Collected amount per month for the last twelve months',
    sql: `
      SELECT to_char(date, 'YYYY-MM') AS period, sum(amount) AS collected, count(*) AS receipts
      FROM payments
      WHERE "tenantId" = $1::uuid AND date >= $2::date AND date <= $3::date
      GROUP BY 1
      ORDER BY 1
    `,
    params: (f) => [f.tenantId, f.yearAgo, f.today],
    note: '12 rows out of ~250k payments',
  },
  {
    key: 'year-report',
    screen: 'Reports → attendance by batch, academic year',
    what: 'Attendance percentage per batch across a whole academic year',
    sql: `
      SELECT b.code,
             count(*) AS marks,
             count(*) FILTER (WHERE r.mark IN ('P', 'L')) AS present,
             round(100.0 * count(*) FILTER (WHERE r.mark IN ('P', 'L')) / nullif(count(*), 0), 1) AS pct
      FROM attendance_records r
      JOIN attendance_sessions s ON s.id = r."sessionId"
      JOIN batches b ON b.id = s."batchId"
      WHERE r."tenantId" = $1::uuid AND s.date >= $2::date AND s.date < $3::date
      GROUP BY b.code
      ORDER BY pct
    `,
    params: (f) => [f.tenantId, f.yearStart, f.yearEnd],
    note: 'Aggregates a year of attendance (~800k rows)',
  },
  {
    key: 'roster-keyset',
    screen: 'Students → roster, page 100 (keyset)',
    what: 'The next 50 students after a cursor half way down the roster',
    sql: `
      SELECT id, "studentCode", name, grade, status
      FROM students
      WHERE "tenantId" = $1::uuid
        AND (name > $2 OR (name = $2 AND id > $3::uuid))
      ORDER BY name, id
      LIMIT 51
    `,
    params: (f) => [f.tenantId, f.cursorName, f.cursorId],
    note: 'Constant cost at any depth',
  },
  {
    key: 'roster-offset',
    screen: 'Students → roster, same depth (OFFSET)',
    what: 'The same 50 students reached with OFFSET, for comparison',
    sql: `
      SELECT id, "studentCode", name, grade, status
      FROM students
      WHERE "tenantId" = $1::uuid
      ORDER BY name, id
      OFFSET $2
      LIMIT 50
    `,
    params: (f) => [f.tenantId, f.deepOffset],
    note: 'Reads and discards every earlier row',
  },
  {
    key: 'low-attendance',
    screen: 'Attendance → low attendance list',
    what: 'Students below the 75% threshold this academic year',
    sql: `
      SELECT st."studentCode", st.name,
             count(*) AS marks,
             round(100.0 * count(*) FILTER (WHERE r.mark IN ('P', 'L')) / count(*), 1) AS pct
      FROM attendance_records r
      JOIN attendance_sessions s ON s.id = r."sessionId"
      JOIN students st ON st.id = r."studentId"
      WHERE r."tenantId" = $1::uuid AND s.date >= $2::date AND s.date < $3::date
      GROUP BY st.id, st."studentCode", st.name
      HAVING count(*) FILTER (WHERE r.mark IN ('P', 'L')) * 100 < 75 * count(*)
      ORDER BY pct
      LIMIT 100
    `,
    params: (f) => [f.tenantId, f.yearStart, f.yearEnd],
    note: 'The heaviest screen in the product',
  },
];

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
