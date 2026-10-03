/**
 * A fake institute: the tables the role and staff services touch, wired together
 * with the joins they rely on, so their rules can be tested without a database.
 *
 * The starting state is a plausible small institute — the two built-in roles, one
 * role the institute defined for itself, an owner, a second administrator, a
 * teacher and an accountant — because most of the rules under test are about what
 * happens when that shape is disturbed (the last admin leaves, a role in use is
 * deleted, someone tries to promote themselves).
 */
import { StaffStatus } from '@prisma/client';
import { ALL_PERMISSIONS } from '@/common/authz/permissions';
import { FACULTY_PERMISSIONS } from '@/common/authz/system-roles';
import type { TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import type { StaffPrincipal } from '@/auth/principal';
import { FakeTable, type Row } from './prisma-tables';

export const TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const INSTITUTE_CODE = 'APEX';

/** Stable ids, so tests can name things without looking them up. */
export const ROLE_IDS = {
  admin: 'aaaaaaaa-0000-4000-8000-000000000001',
  faculty: 'aaaaaaaa-0000-4000-8000-000000000002',
  accountant: 'aaaaaaaa-0000-4000-8000-000000000003',
} as const;

export const STAFF_IDS = {
  owner: 'bbbbbbbb-0000-4000-8000-000000000001',
  admin: 'bbbbbbbb-0000-4000-8000-000000000002',
  teacher: 'bbbbbbbb-0000-4000-8000-000000000003',
  accounts: 'bbbbbbbb-0000-4000-8000-000000000004',
} as const;

export interface FakeInstitute {
  db: TenantPrisma;
  context: TenantContextService;
  roles: FakeTable<Row>;
  staff: FakeTable<Row>;
  staffSubjects: FakeTable<Row>;
  subjects: FakeTable<Row>;
  batches: FakeTable<Row>;
  sessions: FakeTable<Row>;
  payments: FakeTable<Row>;
  /** One campus by default, which is what lets a student import omit `campusName`. */
  campuses: FakeTable<Row>;
  students: FakeTable<Row>;
  studentBatches: FakeTable<Row>;
  /** Runs `fn` with this institute as the ambient tenant, as a request would. */
  withTenant<T>(fn: () => Promise<T>): Promise<T>;
  /** A signed-in staff member, for the `principal` argument of every service call. */
  principal(staffId: string): StaffPrincipal;
}

export function buildInstitute(): FakeInstitute {
  // Declared first: both the staff table's create hook and its hydrate hook use it.
  const staffSubjects: FakeTable<Row> = new FakeTable<Row>([]);

  // Explicitly typed because the two tables' hydrate hooks reference each other.
  const roles: FakeTable<Row> = new FakeTable<Row>(
    [
      {
        id: ROLE_IDS.admin,
        tenantId: TENANT_ID,
        key: 'admin',
        name: 'Administrator',
        description: 'Full access.',
        permissions: [...ALL_PERMISSIONS],
        isSystem: true,
        isDefault: false,
      },
      {
        id: ROLE_IDS.faculty,
        tenantId: TENANT_ID,
        key: 'faculty',
        name: 'Faculty',
        description: 'Teaches batches.',
        permissions: [...FACULTY_PERMISSIONS],
        isSystem: true,
        isDefault: true,
      },
      {
        // The institute's own role: nothing in the code knows this key exists.
        id: ROLE_IDS.accountant,
        tenantId: TENANT_ID,
        key: 'accountant',
        name: 'Accountant',
        description: 'Handles fees.',
        permissions: ['dashboard.view', 'students.view', 'batches.view', 'fees.view', 'fees.collect'],
        isSystem: false,
        isDefault: false,
      },
    ],
    {
      build: (data, sequence) => ({
        id: `cccccccc-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        description: '',
        isSystem: false,
        isDefault: false,
        ...data,
      }),
      // GET /roles asks for `_count.staff`, so the join has to be modelled.
      hydrate: (role: Row): Row => ({ ...role, _count: { staff: staff.rows.filter((member) => member.roleId === role.id).length } }),
    },
  );

  const staff: FakeTable<Row> = new FakeTable<Row>(
    [
      staffRow(STAFF_IDS.owner, 'Dr. Neelima Patnaik', 'neelima@apex.in', ROLE_IDS.admin, { isOwner: true }),
      staffRow(STAFF_IDS.admin, 'Ms. Pooja Menon', 'pooja@apex.in', ROLE_IDS.admin),
      staffRow(STAFF_IDS.teacher, 'Prof. K. Sen', 'ksen@apex.in', ROLE_IDS.faculty),
      staffRow(STAFF_IDS.accounts, 'Ms. Kavya Nair', 'accounts@apex.in', ROLE_IDS.accountant),
    ],
    {
      build: (data, sequence) => {
        const id = `dddddddd-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
        // Prisma writes the join table through `subjects: { create: [...] }`; the
        // fake stores those rows separately, as the database does.
        const nested = data.subjects as { create?: Row[] } | undefined;
        for (const link of nested?.create ?? []) staffSubjects.rows.push({ ...link, staffId: id });
        const { subjects: _ignored, ...columns } = data;
        return {
          ...staffRow('', String(data.name ?? ''), String(data.email ?? ''), String(data.roleId ?? '')),
          // A newly invited member has no password until they activate.
          passwordHash: null,
          ...columns,
          id,
        };
      },
      // Both the permission resolver and the `roleKey` filter read through this join.
      hydrate: (member: Row): Row => {
        const role: Row | undefined = roles.rows.find((candidate: Row) => candidate.id === member.roleId);
        return {
          ...member,
          role: role ? { key: role.key, name: role.name, permissions: role.permissions } : null,
          subjects: staffSubjects.rows.filter((link) => link.staffId === member.id).map((link) => ({ subjectId: link.subjectId })),
        };
      },
    },
  );

  const subjects = new FakeTable<Row>([
    { id: 'eeeeeeee-0000-4000-8000-000000000001', tenantId: TENANT_ID, name: 'Physics', code: 'PHY' },
    { id: 'eeeeeeee-0000-4000-8000-000000000002', tenantId: TENANT_ID, name: 'Mathematics', code: 'MAT' },
  ]);
  const batches = new FakeTable<Row>([]);
  const sessions = new FakeTable<Row>([]);
  const payments = new FakeTable<Row>([]);
  const tenants = new FakeTable<Row>([{ id: TENANT_ID, name: 'Apex Academy', timezone: 'Asia/Kolkata', instituteCode: INSTITUTE_CODE }]);

  // One campus, as a freshly provisioned institute has (see scripts/lib/bootstrap-institute.ts).
  const campuses = new FakeTable<Row>([{ id: 'ffffffff-0000-4000-8000-000000000001', tenantId: TENANT_ID, name: 'Main Campus', address: '' }]);
  const students = new FakeTable<Row>([], {
    build: (data, sequence) => ({ ...data, id: `99999999-0000-4000-8000-${String(sequence).padStart(12, '0')}` }),
  });
  const studentBatches = new FakeTable<Row>([]);

  // Annotated, not inferred: `$transaction` below refers to `db` itself.
  const db: TenantPrisma = {
    role: roles,
    staff,
    staffSubject: staffSubjects,
    subject: subjects,
    batch: batches,
    attendanceSession: sessions,
    payment: payments,
    tenant: tenants,
    campus: campuses,
    student: students,
    studentBatch: studentBatches,
    /**
     * The fake has no transactions: it hands the same tables to the callback. That
     * is enough for the rules under test (batching, per-row results); whether the
     * transaction really is atomic is a property of PostgreSQL and is covered by
     * the end-to-end suite.
     */
    $transaction: async <T>(fn: (tx: TenantPrisma) => Promise<T>): Promise<T> => fn(db),
  } as unknown as TenantPrisma;

  const context = new TenantContextService();

  return {
    db,
    context,
    roles,
    staff,
    staffSubjects,
    subjects,
    batches,
    sessions,
    payments,
    campuses,
    students,
    studentBatches,
    withTenant: (fn) => context.runWithTenant(TENANT_ID, INSTITUTE_CODE, fn),
    principal: (staffId) => {
      const row = staff.rows.find((member: Row) => member.id === staffId);
      if (!row) throw new Error(`No fake staff member ${staffId}`);
      const role = roles.rows.find((candidate: Row) => candidate.id === row.roleId);
      return {
        kind: 'staff',
        id: String(row.id),
        tenantId: TENANT_ID,
        instituteCode: INSTITUTE_CODE,
        name: String(row.name),
        roleId: String(row.roleId),
        roleKey: String(role?.key ?? ''),
        isOwner: row.isOwner === true,
        email: String(row.email),
      };
    },
  };
}

function staffRow(id: string, name: string, email: string, roleId: string, overrides: Row = {}): Row {
  return {
    id,
    tenantId: TENANT_ID,
    name,
    email,
    phone: '',
    roleId,
    isOwner: false,
    title: '',
    status: StaffStatus.Active,
    joinedOn: new Date('2024-06-01'),
    avatarUrl: null,
    lastActiveAt: null,
    passwordHash: 'hash',
    ...overrides,
  };
}
