/**
 * Bulk admissions, against the in-memory institute fake.
 *
 * What is worth testing here is the import's contract rather than SQL: a bad row
 * costs only itself, duplicates are caught both inside the file and against the
 * database, unknown batches and campuses fail loudly rather than silently, the
 * write is chunked, and `dryRun` writes nothing.
 */
import { StudentsImportService } from './students-import.service';
import { buildInstitute, TENANT_ID, type FakeInstitute } from '../../test/fakes/institute';
import type { ImportStudentRowDto } from './dto/import-students.dto';

/** A valid row; each test overrides only the field it is about. */
const row = (overrides: Partial<ImportStudentRowDto> = {}): ImportStudentRowDto => ({
  studentCode: 'STU-1001',
  cardNo: '9001',
  name: 'Aarav Patel',
  gender: 'Male',
  dob: '2009-05-14',
  grade: 'Grade 10',
  guardianName: 'Vikram Patel',
  guardianPhone: '+91 98765 43210',
  joiningDate: '2026-06-01',
  ...overrides,
});

/** `n` valid rows with distinct roll and card numbers. */
const manyRows = (count: number): ImportStudentRowDto[] =>
  Array.from({ length: count }, (_, i) => row({ studentCode: `STU-${2000 + i}`, cardNo: `C${2000 + i}`, name: `Student ${i}` }));

describe('StudentsImportService', () => {
  let institute: FakeInstitute;
  let service: StudentsImportService;

  beforeEach(() => {
    institute = buildInstitute();
    service = new StudentsImportService(institute.context, institute.db);
  });

  const run = (dto: Parameters<StudentsImportService['import']>[0]) => institute.withTenant(() => service.import(dto));

  describe('the happy path', () => {
    it('admits every valid row and stamps them with the tenant', async () => {
      const result = await run({ rows: manyRows(3) });

      expect(result.summary).toEqual({ total: 3, created: 3, skipped: 0, failed: 0 });
      expect(result.results.map((entry) => entry.status)).toEqual(['created', 'created', 'created']);
      expect(institute.students.rows).toHaveLength(3);
      expect(institute.students.rows.every((student) => student.tenantId === TENANT_ID)).toBe(true);
    });

    it('defaults the campus when the institute has only one', async () => {
      await run({ rows: [row()] });
      expect(institute.students.rows[0].campusId).toBe(institute.campuses.rows[0].id);
    });

    it('normalises the guardian number to the 10-digit key the parent signs in with', async () => {
      await run({ rows: [row({ guardianPhone: '+91 (98765) 43210' })] });
      expect(institute.students.rows[0].guardianPhoneKey).toBe('9876543210');
    });

    it('defaults status, portal access and concession the way an admission should', async () => {
      await run({ rows: [row()] });
      // `NotInvited` is the Prisma member name; the wire form is 'Not Invited'
      // (src/common/serialization/wire.ts) and is applied by the response mapper.
      expect(institute.students.rows[0]).toMatchObject({ status: 'Active', portalAccess: 'NotInvited', concessionPct: 0, section: '' });
    });

    it('writes in batches of the requested size', async () => {
      const result = await run({ rows: manyRows(250), batchSize: 100 });
      expect(result.batches).toBe(3);
      expect(result.summary.created).toBe(250);
    });
  });

  describe('per-row failures', () => {
    it('fails only the bad row and admits the rest', async () => {
      const rows = [row({ studentCode: 'STU-1' }), row({ studentCode: 'STU-2', dob: '2026-02-30' }), row({ studentCode: 'STU-3', cardNo: '9003' })];
      rows[0].cardNo = '9001';
      rows[1].cardNo = '9002';

      const result = await run({ rows });

      expect(result.summary).toEqual({ total: 3, created: 2, skipped: 0, failed: 1 });
      expect(result.results[1]).toMatchObject({ row: 2, status: 'failed', field: 'dob' });
      expect(institute.students.rows).toHaveLength(2);
    });

    it('reports results in upload order whatever happened to each row', async () => {
      const result = await run({
        rows: [row({ studentCode: 'A', cardNo: '1', joiningDate: '2001-01-01' }), row({ studentCode: 'B', cardNo: '2' })],
      });
      // Row 1 is rejected (born after joining), row 2 is admitted.
      expect(result.results.map((entry) => entry.row)).toEqual([1, 2]);
      expect(result.results.map((entry) => entry.status)).toEqual(['failed', 'created']);
    });

    it('rejects a roll number already used inside the same file, naming the earlier row', async () => {
      const result = await run({ rows: [row({ studentCode: 'STU-9', cardNo: '1' }), row({ studentCode: 'stu-9', cardNo: '2' })] });

      expect(result.summary).toMatchObject({ created: 1, failed: 1 });
      expect(result.results[1].message).toContain('row 1 already uses');
    });

    it('rejects a roll number already in the database', async () => {
      await run({ rows: [row({ studentCode: 'STU-7', cardNo: '7' })] });
      const again = await run({ rows: [row({ studentCode: 'STU-7', cardNo: '8' })] });

      expect(again.summary).toMatchObject({ created: 0, failed: 1 });
      expect(again.results[0]).toMatchObject({ field: 'studentCode' });
      expect(again.results[0].message).toContain('already belongs to another student');
    });

    it('rejects a card number already in the database', async () => {
      await run({ rows: [row({ studentCode: 'STU-7', cardNo: '77' })] });
      const again = await run({ rows: [row({ studentCode: 'STU-8', cardNo: '77' })] });
      expect(again.results[0]).toMatchObject({ field: 'cardNo', status: 'failed' });
    });

    it('rejects a guardian number too short to sign in with', async () => {
      const result = await run({ rows: [row({ guardianPhone: '12345' })] });
      expect(result.results[0]).toMatchObject({ field: 'guardianPhone', status: 'failed' });
    });

    it('fails a row naming an unknown batch rather than quietly not enrolling', async () => {
      const result = await run({ rows: [row({ batchCodes: ['NOPE-1'] })] });
      expect(result.results[0]).toMatchObject({ field: 'batchCodes', status: 'failed' });
      expect(result.results[0].message).toContain('NOPE-1');
      expect(institute.students.rows).toHaveLength(0);
    });

    it('fails a row naming an unknown campus, listing the ones that exist', async () => {
      const result = await run({ rows: [row({ campusName: 'Moon Base' })] });
      expect(result.results[0]).toMatchObject({ field: 'campusName', status: 'failed' });
      expect(result.results[0].message).toContain('Main Campus');
    });
  });

  describe('enrolments', () => {
    it('enrols into every named batch, in the same write', async () => {
      institute.batches.rows.push(
        { id: 'batch-1', tenantId: TENANT_ID, code: 'PHY-11A' },
        { id: 'batch-2', tenantId: TENANT_ID, code: 'MAT-11B' },
      );

      const result = await run({ rows: [row({ batchCodes: ['PHY-11A', 'MAT-11B'] })] });

      expect(result.summary.created).toBe(1);
      expect(institute.studentBatches.rows).toHaveLength(2);
      expect(institute.studentBatches.rows.map((link) => link.batchId).sort()).toEqual(['batch-1', 'batch-2']);
      expect(institute.studentBatches.rows.every((link) => link.tenantId === TENANT_ID)).toBe(true);
    });
  });

  describe('dryRun', () => {
    it('reports what would happen and writes nothing', async () => {
      const result = await run({ rows: [...manyRows(2), row({ studentCode: 'BAD', cardNo: 'BAD', dob: 'nonsense-date' })], dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.summary).toEqual({ total: 3, created: 2, skipped: 0, failed: 1 });
      expect(result.results[0]).toMatchObject({ status: 'created', message: 'Would be admitted.', id: undefined });
      expect(institute.students.rows).toHaveLength(0);
      expect(institute.studentBatches.rows).toHaveLength(0);
    });
  });

  describe('when the institute is not ready', () => {
    it('refuses the whole import when there is no campus to admit into', async () => {
      institute.campuses.rows = [];
      await expect(run({ rows: [row()] })).rejects.toThrow(/no campus/i);
    });

    it('requires an explicit campus per row once there is more than one', async () => {
      institute.campuses.rows.push({ id: 'campus-2', tenantId: TENANT_ID, name: 'North Branch', address: '' });

      const result = await run({ rows: [row(), row({ studentCode: 'STU-2', cardNo: '2', campusName: 'North Branch' })] });

      expect(result.results[0]).toMatchObject({ status: 'failed', field: 'campusName' });
      expect(result.results[1].status).toBe('created');
      expect(institute.students.rows[0].campusId).toBe('campus-2');
    });
  });
});
