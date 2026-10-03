/**
 * Bulk admissions: `POST /students/import`.
 *
 * This is the only students endpoint that exists today. The roster, profiles and
 * edit flows belong to another wave — what is here is the path an institute needs
 * on day one, when they arrive with a spreadsheet of up to 5,000 students, plus the
 * reusable batching and validation helper every later import will share
 * (`src/common/bulk/bulk-import.ts`).
 *
 * How one request is processed:
 *
 *   1. **Shape** — class-validator on the DTO. Malformed JSON is a 400 before this
 *      service is reached.
 *   2. **Reference data, once** — campuses and batch codes are read in two queries
 *      for the whole upload, not per row. 5,000 rows must not be 10,000 round trips.
 *   3. **Existing keys, once** — the roll numbers and card numbers already in the
 *      database are fetched with a single `IN` query over just the uploaded values,
 *      so a clash is reported against its row instead of aborting the transaction.
 *   4. **Per-row validation, pure** — dates, campus, batches, and duplicates
 *      *within* the file.
 *   5. **Write** — `createMany` in chunks of ~500, all inside one `$transaction`.
 *      Either every valid row is admitted or none is: a half-finished admission
 *      import is worse than a failed one, because nobody can tell which half landed.
 *
 * Tenant scoping is untouched: every query goes through TENANT_PRISMA, so the
 * institute comes from the verified token and the Prisma extension stamps it onto
 * every inserted row. The import cannot write into another institute even if this
 * file tried to.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Gender, GuardianRelation, PortalAccess, StudentStatus } from '@prisma/client';
import { buildOutcome, chunk, DEFAULT_BATCH_SIZE, uniqueKey, validateRows, type RowResult, type RowVerdict } from '@/common/bulk/bulk-import';
import { BadRequestError, ErrorCodes } from '@/common/errors/app.error';
import { normalizePhone } from '@/common/phone';
import { fromISODate, isISODate, todayIn } from '@/domain/date';
import { TENANT_PRISMA, type TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import type { ImportStudentRowDto, ImportStudentsDto } from './dto/import-students.dto';
import type { StudentImportResultDto } from './dto/import-result.dto';

/** A row that passed validation, in the exact shape `createMany` wants. */
interface PreparedStudent {
  tenantId: string;
  campusId: string;
  studentCode: string;
  cardNo: string;
  name: string;
  gender: Gender;
  dob: Date;
  grade: string;
  section: string;
  school: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  guardianName: string;
  guardianRelation: GuardianRelation;
  guardianPhone: string;
  guardianPhoneKey: string;
  guardianEmail: string | null;
  joiningDate: Date;
  status: StudentStatus;
  concessionPct: number;
  portalAccess: PortalAccess;
}

/** Enrolments to write after the students, once their ids are known. */
interface PreparedEnrolment {
  studentCode: string;
  batchIds: string[];
  enrolledOn: Date;
}

@Injectable()
export class StudentsImportService {
  private readonly logger = new Logger(StudentsImportService.name);

  constructor(
    private readonly context: TenantContextService,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
  ) {}

  async import(dto: ImportStudentsDto): Promise<StudentImportResultDto> {
    const startedAt = Date.now();
    const tenantId = this.context.requireTenantId();
    const rows = dto.rows;
    const batchSize = dto.batchSize ?? DEFAULT_BATCH_SIZE;

    // --- 2. reference data, in two queries for the whole file -------------
    const campuses = await this.db.campus.findMany({ select: { id: true, name: true } });
    if (campuses.length === 0) {
      throw new BadRequestError(
        'This institute has no campus yet. Add one on the settings screen before importing students.',
        ErrorCodes.VALIDATION_FAILED,
      );
    }
    const campusByName = new Map(campuses.map((campus) => [campus.name.toLowerCase(), campus.id]));
    const defaultCampusId = campuses.length === 1 ? campuses[0].id : undefined;

    const wantedBatchCodes = [...new Set(rows.flatMap((row) => row.batchCodes ?? []).map((code) => code.trim()).filter(Boolean))];
    const batches =
      wantedBatchCodes.length > 0 ? await this.db.batch.findMany({ where: { code: { in: wantedBatchCodes } }, select: { id: true, code: true } }) : [];
    const batchByCode = new Map(batches.map((batch) => [batch.code.toLowerCase(), batch.id]));

    // --- 3. keys already taken, in one query over the uploaded values -----
    const codes = rows.map((row) => row.studentCode.trim()).filter(Boolean);
    const cards = rows.map((row) => row.cardNo.trim()).filter(Boolean);
    const existing = await this.db.student.findMany({
      where: { OR: [{ studentCode: { in: codes } }, { cardNo: { in: cards } }] },
      select: { studentCode: true, cardNo: true },
    });
    const takenCodes = new Set(existing.map((student) => student.studentCode.toLowerCase()));
    const takenCards = new Set(existing.map((student) => student.cardNo.toLowerCase()));

    const today = fromISODate(todayIn((await this.tenantTimezone()) ?? 'UTC'));

    // --- 4. per-row validation, pure -------------------------------------
    const enrolmentsByCode = new Map<string, PreparedEnrolment>();
    const { valid, problems } = validateRows<ImportStudentRowDto, PreparedStudent>({
      rows,
      refOf: (row) => row.studentCode,
      uniqueBy: (student) => [uniqueKey('studentCode', student.studentCode), uniqueKey('cardNo', student.cardNo)],
      validate: (row): RowVerdict<PreparedStudent> => {
        if (takenCodes.has(row.studentCode.trim().toLowerCase())) {
          return { ok: false, field: 'studentCode', message: `Roll number ${row.studentCode} already belongs to another student.` };
        }
        if (takenCards.has(row.cardNo.trim().toLowerCase())) {
          return { ok: false, field: 'cardNo', message: `Card number ${row.cardNo} is already in use.` };
        }
        if (!isISODate(row.dob)) return { ok: false, field: 'dob', message: `"${row.dob}" is not a real date.` };
        if (!isISODate(row.joiningDate)) return { ok: false, field: 'joiningDate', message: `"${row.joiningDate}" is not a real date.` };
        if (row.dob >= row.joiningDate) {
          return { ok: false, field: 'dob', message: 'Date of birth must be before the joining date.' };
        }

        const campusId = row.campusName ? campusByName.get(row.campusName.toLowerCase()) : defaultCampusId;
        if (!campusId) {
          return {
            ok: false,
            field: 'campusName',
            message: row.campusName
              ? `No campus called "${row.campusName}". Known campuses: ${campuses.map((campus) => campus.name).join(', ')}.`
              : `This institute has ${campuses.length} campuses, so every row must name one.`,
          };
        }

        const phoneKey = normalizePhone(row.guardianPhone);
        if (phoneKey.length < 10) {
          return { ok: false, field: 'guardianPhone', message: 'The guardian mobile number needs at least 10 digits — the parent signs in with it.' };
        }

        const batchIds: string[] = [];
        for (const code of row.batchCodes ?? []) {
          const batchId = batchByCode.get(code.trim().toLowerCase());
          // An unknown batch fails the row rather than being dropped: silently not
          // enrolling a student is the kind of error nobody notices until fees are wrong.
          if (!batchId) return { ok: false, field: 'batchCodes', message: `No batch with the code "${code}".` };
          batchIds.push(batchId);
        }

        const prepared: PreparedStudent = {
          tenantId,
          campusId,
          studentCode: row.studentCode.trim(),
          cardNo: row.cardNo.trim(),
          name: row.name.trim(),
          gender: row.gender as Gender,
          dob: fromISODate(row.dob),
          grade: row.grade.trim(),
          section: row.section?.trim() ?? '',
          school: row.school?.trim() || null,
          phone: row.phone?.trim() || null,
          email: row.email?.trim() || null,
          address: row.address?.trim() || null,
          guardianName: row.guardianName.trim(),
          guardianRelation: (row.guardianRelation ?? 'Father') as GuardianRelation,
          guardianPhone: row.guardianPhone.trim(),
          guardianPhoneKey: phoneKey,
          guardianEmail: row.guardianEmail?.trim() || null,
          joiningDate: fromISODate(row.joiningDate),
          status: StudentStatus.Active,
          concessionPct: row.concessionPct ?? 0,
          // An imported student has no app login until the institute invites them.
          portalAccess: PortalAccess.NotInvited,
        };

        if (batchIds.length > 0) {
          // Enrolments are keyed by roll number, which is unique per institute and
          // is the only handle we have before the students are inserted.
          enrolmentsByCode.set(prepared.studentCode, {
            studentCode: prepared.studentCode,
            batchIds,
            enrolledOn: prepared.joiningDate > today ? prepared.joiningDate : today,
          });
        }
        return { ok: true, value: prepared };
      },
    });

    if (dto.dryRun) {
      const outcome = buildOutcome(rows.length, problems, valid.map((entry) => ({ index: entry.index, ref: entry.value.studentCode, id: '' })));
      // A dry run reports what *would* be created, so the "created" rows carry no id.
      return {
        summary: outcome.summary,
        results: outcome.results.map((result) => (result.status === 'created' ? { ...result, id: undefined, message: 'Would be admitted.' } : result)),
        dryRun: true,
        batches: chunk(valid, batchSize).length,
        durationMs: Date.now() - startedAt,
      };
    }

    // --- 5. write, batched, in one transaction ---------------------------
    const created: { index: number; id: string; ref?: string }[] = [];
    const writeProblems: RowResult[] = [];
    let batchCount = 0;

    if (valid.length > 0) {
      await this.db.$transaction(
        async (tx) => {
          for (const group of chunk(valid, batchSize)) {
            batchCount += 1;
            // `skipDuplicates` is deliberately off: a duplicate here would mean the
            // pre-checks missed something, and we want the transaction to fail loudly
            // rather than silently admit fewer students than the report claims.
            await tx.student.createMany({ data: group.map((entry) => entry.value) });
          }

          // Read back the ids in one query — `createMany` does not return rows.
          const inserted = await tx.student.findMany({
            where: { studentCode: { in: valid.map((entry) => entry.value.studentCode) } },
            select: { id: true, studentCode: true },
          });
          const idByCode = new Map(inserted.map((student) => [student.studentCode, student.id]));

          for (const entry of valid) {
            const id = idByCode.get(entry.value.studentCode);
            if (id) created.push({ index: entry.index, id, ref: entry.value.studentCode });
            else writeProblems.push({ row: entry.index + 1, status: 'failed', ref: entry.value.studentCode, message: 'Inserted but could not be read back.' });
          }

          // Enrolments, in the same transaction and the same batches.
          const enrolments = [...enrolmentsByCode.values()].flatMap((enrolment) => {
            const studentId = idByCode.get(enrolment.studentCode);
            if (!studentId) return [];
            return enrolment.batchIds.map((batchId) => ({ tenantId, studentId, batchId, enrolledOn: enrolment.enrolledOn }));
          });
          for (const group of chunk(enrolments, batchSize)) {
            await tx.studentBatch.createMany({ data: group, skipDuplicates: true });
          }
        },
        // 5,000 rows in batches of 500 is ten statements; the default 5s timeout is
        // not enough for a full-size admissions file on a modest database.
        { timeout: 120_000, maxWait: 10_000 },
      );
    }

    const outcome = buildOutcome(rows.length, [...problems, ...writeProblems], created);
    this.logger.log(`Imported ${outcome.summary.created}/${rows.length} students in ${batchCount} batches (${Date.now() - startedAt} ms)`);

    return { summary: outcome.summary, results: outcome.results, dryRun: false, batches: batchCount, durationMs: Date.now() - startedAt };
  }

  /** The institute's timezone, so "enrolled today" means today where they are. */
  private async tenantTimezone(): Promise<string | undefined> {
    const tenant = await this.db.tenant.findUnique({
      where: { id: this.context.requireTenantId() },
      select: { timezone: true },
    });
    return tenant?.timezone;
  }
}
