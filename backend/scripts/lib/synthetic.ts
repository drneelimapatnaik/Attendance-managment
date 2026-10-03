/**
 * The synthetic full-size institute used by the load test.
 *
 * The target is 5,000 students over five academic years, which is ~4 million
 * attendance records plus 300k invoices, 250k payments and 100k assessment scores
 * (docs/HOSTING.md › Scale target). Generating that through Prisma one `createMany`
 * at a time takes tens of minutes and tells you nothing about the database; so the
 * small reference data (campuses, subjects, staff, batches) is written with Prisma,
 * and the large tables are generated **inside Postgres** with `INSERT … SELECT`
 * over `generate_series`. Nothing crosses the wire but the statement, and a
 * full-size institute lands in a couple of minutes.
 *
 * Two consequences worth being explicit about:
 *
 *   * These statements are raw SQL, so the Prisma tenant-scope extension does not
 *     see them. Every statement below names `tenantId` explicitly and this code
 *     only ever runs against a throwaway scratch database it created itself — the
 *     load test refuses to touch a registered client (see loadtest-seed.ts).
 *   * The data is *shaped* like real data, not random: sessions fall on each
 *     batch's actual weekdays, attendance is ~88% present with absence clustered
 *     on a minority of students, and 15% of invoices are left unpaid so the dues
 *     list has something to find. Uniformly random data makes every query look
 *     fast because every filter selects the same fraction of rows.
 */
import type { PrismaClient } from '@prisma/client';

export interface SyntheticPlan {
  students: number;
  years: number;
  /** Batches are sized to the student count: ~25 students each, 2 batches per student. */
  batches: number;
  faculty: number;
  campuses: number;
  /** First and last calendar date covered, inclusive. */
  from: string;
  to: string;
}

export interface SyntheticCounts {
  campuses: number;
  subjects: number;
  topics: number;
  staff: number;
  batches: number;
  students: number;
  enrolments: number;
  sessions: number;
  attendanceRecords: number;
  invoices: number;
  payments: number;
  assessments: number;
  scores: number;
}

/** How many rows one `INSERT … SELECT` writes before the next one starts. */
const SQL_CHUNK_MONTHS = 6;

/**
 * Derives the fleet shape from the two numbers an operator gives:
 * `--students 5000 --years 5`.
 */
export function planFor(students: number, years: number): SyntheticPlan {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), 1)).toISOString().slice(0, 10);
  return {
    students,
    years,
    // ~25 students per batch, each student in 2 batches.
    batches: Math.max(4, Math.round((students * 2) / 25)),
    // One faculty member per 5 batches, plus an admin and the owner.
    faculty: Math.max(2, Math.round(students / 250)),
    campuses: students > 1500 ? 3 : 1,
    from,
    to,
  };
}

/** Progress callback so the CLI can print a line per phase. */
export type Progress = (phase: string, rows: number, ms: number) => void;

/**
 * Fills an already-migrated, already-bootstrapped scratch database.
 * `tenantId` is the tenant the bootstrap created.
 */
export async function generateSynthetic(db: PrismaClient, tenantId: string, plan: SyntheticPlan, onProgress: Progress): Promise<SyntheticCounts> {
  const timed = async <T>(phase: string, fn: () => Promise<T>, rowsOf: (result: T) => number): Promise<T> => {
    const startedAt = Date.now();
    const result = await fn();
    onProgress(phase, rowsOf(result), Date.now() - startedAt);
    return result;
  };

  // ---------------------------------------------------------------- 1. reference
  const campusIds = await timed(
    'campuses',
    async () => {
      const existing = await db.campus.findMany({ where: { tenantId }, select: { id: true } });
      const ids = existing.map((campus) => campus.id);
      for (let i = ids.length; i < plan.campuses; i += 1) {
        const campus = await db.campus.create({ data: { tenantId, name: `Campus ${i + 1}`, address: `${i + 1} Load Test Road` }, select: { id: true } });
        ids.push(campus.id);
      }
      return ids;
    },
    (ids) => ids.length,
  );

  const subjectIds = await timed(
    'subjects & topics',
    async () => {
      const subjects = ['Physics', 'Mathematics', 'Chemistry', 'Biology', 'English'];
      const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
      const ids: string[] = [];
      for (const [index, name] of subjects.entries()) {
        const subject = await db.subject.create({
          data: { tenantId, name, code: `S${index + 1}`, shortName: name.slice(0, 4), grades },
          select: { id: true },
        });
        ids.push(subject.id);
        // 12 topics per subject per grade: a realistic syllabus depth, and enough
        // rows that the topic-coverage screen is not trivially small.
        await db.topic.createMany({
          data: grades.flatMap((grade, gradeIndex) =>
            Array.from({ length: 12 }, (_, order) => ({
              tenantId,
              subjectId: subject.id,
              grade,
              chapter: `Unit ${Math.floor(order / 4) + 1}`,
              name: `${name} topic ${order + 1}`,
              // `order` is unique per (subject, grade), which the schema enforces.
              order: gradeIndex * 100 + order + 1,
              plannedHours: 8 + (order % 5),
            })),
          ),
        });
      }
      return ids;
    },
    (ids) => ids.length,
  );

  const facultyIds = await timed(
    'faculty',
    async () => {
      const role = await db.role.findFirst({ where: { tenantId, key: 'faculty' }, select: { id: true } });
      if (!role) throw new Error('The faculty role is missing — bootstrap the institute first.');
      const ids: string[] = [];
      for (let i = 0; i < plan.faculty; i += 1) {
        const member = await db.staff.create({
          data: {
            tenantId,
            name: `Faculty ${i + 1}`,
            email: `faculty${i + 1}@loadtest.invalid`,
            phone: `90000${String(i).padStart(5, '0')}`,
            roleId: role.id,
            title: 'Teacher',
            status: 'Active',
            joinedOn: new Date(plan.from),
          },
          select: { id: true },
        });
        ids.push(member.id);
      }
      return ids;
    },
    (ids) => ids.length,
  );

  const batchCount = await timed(
    'batches',
    async () => {
      const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
      // Three weekday patterns, so a "month of attendance for a batch" query has to
      // deal with batches that meet 2, 3 or 6 days a week.
      const dayPatterns: ('Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat')[][] = [
        ['Mon', 'Wed', 'Fri'],
        ['Tue', 'Thu', 'Sat'],
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      ];
      const rows = Array.from({ length: plan.batches }, (_, i) => ({
        tenantId,
        campusId: campusIds[i % campusIds.length],
        code: `B${String(i + 1).padStart(4, '0')}`,
        name: `Batch B${i + 1}`,
        title: `${grades[i % grades.length]} · Batch ${i + 1}`,
        subjectId: subjectIds[i % subjectIds.length],
        grade: grades[i % grades.length],
        capacity: 30,
        days: dayPatterns[i % dayPatterns.length],
        startTime: `${String(8 + (i % 10)).padStart(2, '0')}:00`,
        endTime: `${String(9 + (i % 10)).padStart(2, '0')}:30`,
        facultyId: facultyIds[i % facultyIds.length],
        room: `R${(i % 20) + 1}`,
        monthlyFee: 1500 + (i % 8) * 250,
        startDate: new Date(plan.from),
        status: 'Active' as const,
      }));
      const result = await db.batch.createMany({ data: rows });
      return result.count;
    },
    (count) => count,
  );

  // ------------------------------------------------------------------ 2. students
  // From here on everything is set-based SQL: 5,000 students, 10,000 enrolments,
  // ~150k sessions and ~4M attendance records are not worth 4 million round trips.
  const studentCount = await timed(
    'students',
    () =>
      exec(
        db,
        `
        INSERT INTO students (
          id, "tenantId", "campusId", "studentCode", "cardNo", name, gender, dob, grade, section,
          school, phone, email, address, "guardianName", "guardianRelation", "guardianPhone",
          "guardianPhoneKey", "guardianEmail", "joiningDate", status, "concessionPct", "portalAccess",
          "createdAt", "updatedAt"
        )
        SELECT
          gen_random_uuid(),
          $1::uuid,
          c.id,
          'STU-' || lpad(s::text, 6, '0'),
          'CARD-' || lpad(s::text, 6, '0'),
          'Student ' || s,
          (ARRAY['Male','Female','Other']::"Gender"[])[1 + (s % 3)],
          (DATE '2008-01-01' + ((s * 7) % 1460))::date,
          (ARRAY['Grade 9','Grade 10','Grade 11','Grade 12'])[1 + (s % 4)],
          (ARRAY['A','B','C',''])[1 + (s % 4)],
          NULL, NULL, NULL, NULL,
          'Guardian ' || s,
          (ARRAY['Father','Mother','Guardian']::"GuardianRelation"[])[1 + (s % 3)],
          '+91 9' || lpad(s::text, 9, '0'),
          -- The 10-digit key a parent signs in with.
          lpad((9000000000 + s)::text, 10, '0'),
          NULL,
          -- Admissions spread across the whole period, so five years of history is
          -- not five years for every student.
          ($2::date + ((s * 13) % $4::int))::date,
          -- ~92% active, the rest inactive or on leave, as a real roster looks.
          (CASE WHEN s % 25 = 0 THEN 'Inactive' WHEN s % 37 = 0 THEN 'On Leave' ELSE 'Active' END)::"StudentStatus",
          (CASE WHEN s % 11 = 0 THEN 10 WHEN s % 23 = 0 THEN 25 ELSE 0 END),
          'Not Invited'::"PortalAccess",
          now(), now()
        FROM generate_series(1, $3::int) AS s
        -- Round-robin the campuses without a correlated subquery.
        JOIN (SELECT id, row_number() OVER (ORDER BY name) - 1 AS n, count(*) OVER () AS total FROM campuses WHERE "tenantId" = $1::uuid) c
          ON c.n = s % c.total
        `,
        [tenantId, plan.from, plan.students, daysBetween(plan.from, plan.to)],
      ),
    (count) => count,
  );

  const enrolmentCount = await timed(
    'enrolments',
    () =>
      exec(
        db,
        `
        INSERT INTO student_batches ("tenantId", "studentId", "batchId", "enrolledOn")
        SELECT $1::uuid, st.id, b.id, st."joiningDate"
        FROM (SELECT id, "joiningDate", row_number() OVER (ORDER BY "studentCode") - 1 AS n FROM students WHERE "tenantId" = $1::uuid) st
        -- Two batches per student, offset so batches fill evenly (~25 students each).
        JOIN (SELECT id, row_number() OVER (ORDER BY code) - 1 AS n, count(*) OVER () AS total FROM batches WHERE "tenantId" = $1::uuid) b
          ON b.n IN (st.n % b.total, (st.n + 1 + (st.n / b.total)::int) % b.total)
        ON CONFLICT DO NOTHING
        `,
        [tenantId],
      ),
    (count) => count,
  );

  // ---------------------------------------------------------------- 3. attendance
  // One session per batch per scheduled weekday. Generated in six-month slices so a
  // single statement never builds a multi-million-row intermediate result.
  let sessionCount = 0;
  await timed(
    'attendance sessions',
    async () => {
      for (const [from, to] of monthSlices(plan.from, plan.to, SQL_CHUNK_MONTHS)) {
        sessionCount += await exec(
          db,
          `
          INSERT INTO attendance_sessions (
            id, "tenantId", "batchId", date, "startTime", "endTime", "facultyId",
            notes, "markedAt", "markedById", "createdAt", "updatedAt"
          )
          SELECT gen_random_uuid(), $1::uuid, b.id, d::date, b."startTime", b."endTime", b."facultyId",
                 NULL, d::timestamptz + interval '18 hours', b."facultyId", now(), now()
          FROM batches b
          CROSS JOIN generate_series($2::date, $3::date, interval '1 day') AS d
          WHERE b."tenantId" = $1::uuid
            -- Only on the batch's own weekdays.
            AND (to_char(d, 'Dy')::text)::"Weekday" = ANY (b.days)
          ON CONFLICT DO NOTHING
          `,
          [tenantId, from, to],
        );
      }
      return sessionCount;
    },
    () => sessionCount,
  );

  let recordCount = 0;
  await timed(
    'attendance records',
    async () => {
      for (const [from, to] of monthSlices(plan.from, plan.to, SQL_CHUNK_MONTHS)) {
        recordCount += await exec(
          db,
          `
          INSERT INTO attendance_records (id, "tenantId", "sessionId", "studentId", mark, "lateByMinutes")
          SELECT gen_random_uuid(), $1::uuid, ses.id, sb."studentId",
                 -- ~88% present, ~5% late, ~5% absent, ~2% excused, with absence
                 -- concentrated on every 13th student so "low attendance" lists are
                 -- not empty and are not everybody either.
                 (CASE
                    WHEN (hashtext(ses.id::text || sb."studentId"::text) % 100 + 100) % 100 < 5 THEN 'L'
                    WHEN (hashtext(ses.id::text || sb."studentId"::text) % 100 + 100) % 100 < 10
                      THEN (CASE WHEN hashtext(sb."studentId"::text) % 13 = 0 THEN 'A' ELSE 'P' END)
                    WHEN (hashtext(ses.id::text || sb."studentId"::text) % 100 + 100) % 100 < 12 THEN 'E'
                    WHEN hashtext(sb."studentId"::text) % 13 = 0
                      AND (hashtext(ses.id::text || sb."studentId"::text) % 100 + 100) % 100 < 35 THEN 'A'
                    ELSE 'P'
                  END)::"AttendanceMark",
                 NULL
          FROM attendance_sessions ses
          JOIN student_batches sb ON sb."batchId" = ses."batchId"
          JOIN students st ON st.id = sb."studentId"
          WHERE ses."tenantId" = $1::uuid
            AND ses.date BETWEEN $2::date AND $3::date
            -- A student has no attendance before they joined.
            AND ses.date >= st."joiningDate"
          ON CONFLICT DO NOTHING
          `,
          [tenantId, from, to],
        );
      }
      return recordCount;
    },
    () => recordCount,
  );

  // --------------------------------------------------------------------- 4. fees
  // One invoice per student per month from their joining month, against their
  // first batch: the real billing run, at the real volume.
  const invoiceCount = await timed(
    'invoices',
    () =>
      exec(
        db,
        `
        INSERT INTO fee_invoices (
          id, "tenantId", "invoiceNo", "studentId", "batchId", period, description,
          amount, "issuedOn", "dueDate", waived, "createdAt", "updatedAt"
        )
        SELECT gen_random_uuid(), $1::uuid,
               'INV-' || to_char(m, 'YYMM') || '-' || lpad(row_number() OVER (PARTITION BY m ORDER BY st.id)::text, 6, '0'),
               st.id, fb."batchId", to_char(m, 'YYYY-MM'),
               'Monthly tuition ' || to_char(m, 'Mon YYYY'),
               round(fb.fee * (1 - st."concessionPct" / 100), 2),
               (date_trunc('month', m) + interval '4 days')::date,
               (date_trunc('month', m) + interval '11 days')::date,
               false, now(), now()
        FROM students st
        JOIN LATERAL (
          SELECT sb."batchId", b."monthlyFee" AS fee
          FROM student_batches sb JOIN batches b ON b.id = sb."batchId"
          WHERE sb."studentId" = st.id ORDER BY b.code LIMIT 1
        ) fb ON true
        CROSS JOIN generate_series(date_trunc('month', $2::date), date_trunc('month', $3::date), interval '1 month') AS m
        WHERE st."tenantId" = $1::uuid
          AND m >= date_trunc('month', st."joiningDate")
        ON CONFLICT DO NOTHING
        `,
        [tenantId, plan.from, plan.to],
      ),
    (count) => count,
  );

  // ~85% of invoices are paid, and recent months are less settled than old ones —
  // which is what makes the dues list interesting rather than empty.
  const paymentCount = await timed(
    'payments',
    () =>
      exec(
        db,
        `
        INSERT INTO payments (
          id, "tenantId", "receiptNo", "invoiceId", "studentId", amount, date, method,
          reference, "collectedById", "createdAt"
        )
        SELECT gen_random_uuid(), $1::uuid,
               'RCPT-' || lpad(row_number() OVER (ORDER BY i."dueDate", i.id)::text, 8, '0'),
               i.id, i."studentId", i.amount,
               -- Paid a few days either side of the due date.
               (i."dueDate" + ((hashtext(i.id::text) % 9 + 9) % 9) - 2)::date,
               (ARRAY['Cash','UPI','Card','Bank Transfer','Cheque']::"PaymentMethod"[])[1 + ((hashtext(i.id::text) % 5 + 5) % 5)],
               NULL,
               (SELECT id FROM staff WHERE "tenantId" = $1::uuid ORDER BY "createdAt" LIMIT 1),
               now()
        FROM fee_invoices i
        WHERE i."tenantId" = $1::uuid
          -- Older invoices almost always paid; the last two months often not.
          AND CASE
                WHEN i."dueDate" > (CURRENT_DATE - 60) THEN (hashtext(i.id::text) % 100 + 100) % 100 < 45
                ELSE (hashtext(i.id::text) % 100 + 100) % 100 < 94
              END
        `,
        [tenantId],
      ),
    (count) => count,
  );

  // -------------------------------------------------------------- 5. assessments
  const assessmentCount = await timed(
    'assessments',
    () =>
      exec(
        db,
        `
        INSERT INTO assessments (id, "tenantId", "batchId", title, type, date, "maxMarks", "createdAt", "updatedAt")
        SELECT gen_random_uuid(), $1::uuid, b.id,
               'Assessment ' || to_char(q, 'Mon YYYY'),
               (ARRAY['Unit Test','Quiz','Mock Exam','Assignment']::"AssessmentType"[])[1 + ((extract(month from q)::int / 3) % 4)],
               (q + interval '20 days')::date,
               (ARRAY[25, 50, 100])[1 + ((hashtext(b.id::text) % 3 + 3) % 3)],
               now(), now()
        FROM batches b
        -- One assessment per batch per quarter.
        CROSS JOIN generate_series(date_trunc('quarter', $2::date), date_trunc('quarter', $3::date), interval '3 months') AS q
        WHERE b."tenantId" = $1::uuid
        `,
        [tenantId, plan.from, plan.to],
      ),
    (count) => count,
  );

  const scoreCount = await timed(
    'assessment scores',
    () =>
      exec(
        db,
        `
        INSERT INTO assessment_scores (id, "tenantId", "assessmentId", "studentId", marks)
        SELECT gen_random_uuid(), $1::uuid, a.id, sb."studentId",
               -- 4% absent (null marks); the rest clustered around 60–95%.
               CASE WHEN (hashtext(a.id::text || sb."studentId"::text) % 25 + 25) % 25 = 0 THEN NULL
                    ELSE (a."maxMarks" * (55 + (hashtext(a.id::text || sb."studentId"::text) % 40 + 40) % 40) / 100)::int
               END
        FROM assessments a
        JOIN student_batches sb ON sb."batchId" = a."batchId"
        JOIN students st ON st.id = sb."studentId"
        WHERE a."tenantId" = $1::uuid AND a.date >= st."joiningDate"
        ON CONFLICT DO NOTHING
        `,
        [tenantId],
      ),
    (count) => count,
  );

  // `ANALYZE` is not optional: without fresh statistics the planner will sequential
  // scan a 4-million-row table it has an index for, and the benchmark would measure
  // the wrong thing.
  await timed('ANALYZE', async () => db.$executeRawUnsafe('ANALYZE'), () => 0);

  const topics = await db.topic.count({ where: { tenantId } });
  const staff = await db.staff.count({ where: { tenantId } });
  return {
    campuses: campusIds.length,
    subjects: subjectIds.length,
    topics,
    staff,
    batches: batchCount,
    students: studentCount,
    enrolments: enrolmentCount,
    sessions: sessionCount,
    attendanceRecords: recordCount,
    invoices: invoiceCount,
    payments: paymentCount,
    assessments: assessmentCount,
    scores: scoreCount,
  };
}

/** Runs one parameterised statement and returns the number of rows it affected. */
function exec(db: PrismaClient, sql: string, params: readonly unknown[]): Promise<number> {
  return db.$executeRawUnsafe(sql, ...params);
}

/** Inclusive whole days between two ISO dates. */
function daysBetween(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

/** `[from, to]` pairs covering the range in slices of `months`. */
function monthSlices(from: string, to: string, months: number): [string, string][] {
  const slices: [string, string][] = [];
  const end = new Date(`${to}T00:00:00Z`);
  let cursor = new Date(`${from}T00:00:00Z`);
  while (cursor < end) {
    const next = new Date(cursor);
    next.setUTCMonth(next.getUTCMonth() + months);
    const sliceEnd = next < end ? new Date(next.getTime() - 86_400_000) : end;
    slices.push([cursor.toISOString().slice(0, 10), sliceEnd.toISOString().slice(0, 10)]);
    cursor = next;
  }
  return slices;
}
