/**
 * Guard behaviour: what a role may do (PermissionsGuard) and what a student or
 * parent login may see (PortalScopeGuard).
 *
 * PermissionsGuard no longer consults a matrix in code — roles are institute data,
 * so it asks PermissionResolverService, which reads the staff member's role row.
 * The resolver is faked here with an in-memory "database" of roles and staff, which
 * is exactly the thing being tested: change the role row, and the same request is
 * allowed or refused without the token changing.
 */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffStatus } from '@prisma/client';
import { PermissionResolverService } from '@/common/authz/permission-resolver.service';
import { effectivePermissions, type Permission } from '@/common/authz/permissions';
import { ForbiddenError, UnauthorizedError } from '@/common/errors/app.error';
import type { TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import type { PortalPrincipal, Principal, StaffPrincipal } from '@/auth/principal';
import { PermissionsGuard } from './permissions.guard';
import { assertPortalCanAccessStudent, PortalScopeGuard } from './portal-scope.guard';

const TENANT = 'tenant-a';

/** One institute's roles, as rows rather than as a matrix in code. */
const ROLE_ROWS: Record<string, { key: string; name: string; permissions: Permission[] }> = {
  'role-admin': {
    key: 'admin',
    name: 'Administrator',
    permissions: [
      'dashboard.view',
      'attendance.mark',
      'attendance.reports',
      'students.view',
      'students.manage',
      'batches.view',
      'batches.manage',
      'topics.manage',
      'fees.view',
      'fees.collect',
      'performance.view',
      'performance.manage',
      'faculty.manage',
      'settings.manage',
    ],
  },
  'role-faculty': {
    key: 'faculty',
    name: 'Faculty',
    permissions: ['dashboard.view', 'attendance.mark', 'attendance.reports', 'students.view', 'batches.view', 'topics.manage'],
  },
  // An institute-defined role: nothing in the code knows this key exists.
  'role-accounts': { key: 'accountant', name: 'Accountant', permissions: ['dashboard.view', 'students.view', 'fees.view', 'fees.collect'] },
  'role-desk': {
    key: 'front_desk',
    name: 'Front Desk',
    permissions: ['dashboard.view', 'students.view', 'students.manage', 'attendance.mark'],
  },
};

interface FakeStaffRow {
  id: string;
  isOwner: boolean;
  status: StaffStatus;
  roleId: string;
}

const STAFF_ROWS: FakeStaffRow[] = [
  { id: 'staff-admin', isOwner: false, status: StaffStatus.Active, roleId: 'role-admin' },
  { id: 'staff-faculty', isOwner: false, status: StaffStatus.Active, roleId: 'role-faculty' },
  { id: 'staff-accounts', isOwner: false, status: StaffStatus.Active, roleId: 'role-accounts' },
  { id: 'staff-desk', isOwner: false, status: StaffStatus.Active, roleId: 'role-desk' },
  { id: 'staff-owner', isOwner: true, status: StaffStatus.Active, roleId: 'role-faculty' },
  { id: 'staff-gone', isOwner: false, status: StaffStatus.Inactive, roleId: 'role-admin' },
];

/** A stand-in for `prisma.staff.findFirst` with the role joined in. */
function fakeDb(rows: FakeStaffRow[] = STAFF_ROWS): TenantPrisma {
  return {
    staff: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) return null;
        const role = ROLE_ROWS[row.roleId];
        return { ...row, role: { key: role.key, name: role.name, permissions: [...role.permissions] } };
      },
    },
  } as unknown as TenantPrisma;
}

const staff = (id: string, roleId: string, isOwner = false): StaffPrincipal => ({
  kind: 'staff',
  id,
  tenantId: TENANT,
  instituteCode: 'APEX',
  name: 'Test Staff',
  roleId,
  roleKey: ROLE_ROWS[roleId]?.key ?? 'unknown',
  isOwner,
  email: 'staff@apex.in',
});

const portal = (kind: 'student' | 'parent', studentIds: string[]): PortalPrincipal => ({
  kind,
  id: 'portal-1',
  tenantId: TENANT,
  instituteCode: 'APEX',
  name: 'Test Portal',
  studentIds,
});

/** Minimal ExecutionContext: a request plus the handler/class the reflector reads. */
function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () =>
      function handler() {
        return undefined;
      },
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/** A Reflector that always answers with one fixed metadata value. */
function reflectorReturning<T>(value: T): Reflector {
  return { getAllAndOverride: () => value } as unknown as Reflector;
}

describe('PermissionsGuard', () => {
  const guardFor = (required: Permission[] | undefined, db: TenantPrisma = fakeDb()) =>
    new PermissionsGuard(reflectorReturning(required), new PermissionResolverService(new TenantContextService(), db));

  it('allows routes that declare no permissions', async () => {
    await expect(guardFor(undefined).canActivate(contextFor({}))).resolves.toBe(true);
    await expect(guardFor([]).canActivate(contextFor({}))).resolves.toBe(true);
  });

  it('rejects an unauthenticated request', async () => {
    await expect(guardFor(['fees.collect']).canActivate(contextFor({}))).rejects.toThrow(UnauthorizedError);
  });

  it('lets an accountant collect fees, because that institute’s role says so', async () => {
    await expect(guardFor(['fees.collect']).canActivate(contextFor({ user: staff('staff-accounts', 'role-accounts') }))).resolves.toBe(
      true,
    );
  });

  it('stops faculty collecting fees', async () => {
    await expect(guardFor(['fees.collect']).canActivate(contextFor({ user: staff('staff-faculty', 'role-faculty') }))).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('requires every listed permission, not just one', async () => {
    // Front desk may mark attendance but may not manage batches.
    await expect(
      guardFor(['attendance.mark', 'batches.manage']).canActivate(contextFor({ user: staff('staff-desk', 'role-desk') })),
    ).rejects.toThrow(ForbiddenError);
  });

  it('reports which permissions were missing', async () => {
    try {
      await guardFor(['fees.collect', 'settings.manage']).canActivate(contextFor({ user: staff('staff-faculty', 'role-faculty') }));
      fail('expected the guard to throw');
    } catch (error) {
      expect((error as ForbiddenError).getResponse()).toMatchObject({
        code: 'PERMISSION_DENIED',
        details: { missing: ['fees.collect', 'settings.manage'] },
      });
    }
  });

  it('never lets a portal login through a staff permission', async () => {
    await expect(guardFor(['students.view']).canActivate(contextFor({ user: portal('parent', ['stu-1']) }))).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('lets the owner do everything, whatever role row they hold', async () => {
    // The owner's role here is Faculty, which grants none of these.
    const owner = contextFor({ user: staff('staff-owner', 'role-faculty', true) });
    await expect(guardFor(['settings.manage', 'faculty.manage', 'fees.collect']).canActivate(owner)).resolves.toBe(true);
  });

  it('follows an edit to the role row without the token changing', async () => {
    const principal = staff('staff-accounts', 'role-accounts');
    const permissive = fakeDb();
    await expect(guardFor(['fees.collect'], permissive).canActivate(contextFor({ user: principal }))).resolves.toBe(true);

    // The institute takes fee collection away from its Accountant role.
    const original = [...ROLE_ROWS['role-accounts'].permissions];
    ROLE_ROWS['role-accounts'].permissions = ['dashboard.view', 'fees.view'];
    try {
      await expect(guardFor(['fees.collect'], fakeDb()).canActivate(contextFor({ user: principal }))).rejects.toThrow(ForbiddenError);
    } finally {
      ROLE_ROWS['role-accounts'].permissions = original;
    }
  });

  it('refuses an account that has been deactivated since the token was issued', async () => {
    await expect(guardFor(['settings.manage']).canActivate(contextFor({ user: staff('staff-gone', 'role-admin') }))).rejects.toMatchObject({
      response: { code: 'ACCOUNT_INACTIVE' },
    });
  });

  it('refuses an account that has been deleted since the token was issued', async () => {
    await expect(guardFor(['dashboard.view']).canActivate(contextFor({ user: staff('staff-ghost', 'role-admin') }))).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it('reads the role once per request, however many permissions are checked', async () => {
    const db = fakeDb();
    const spy = jest.spyOn(db.staff, 'findFirst');
    const context = new TenantContextService();
    const resolver = new PermissionResolverService(context, db);
    const principal = staff('staff-admin', 'role-admin');

    // The cache lives in the per-request AsyncLocalStorage store.
    await context.run({ requestId: 'test' }, async () => {
      await new PermissionsGuard(reflectorReturning(['fees.view']), resolver).canActivate(contextFor({ user: principal }));
      await new PermissionsGuard(reflectorReturning(['settings.manage']), resolver).canActivate(contextFor({ user: principal }));
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('PermissionResolverService', () => {
  it('reports the role’s own capability list', async () => {
    const resolver = new PermissionResolverService(new TenantContextService(), fakeDb());
    const access = await resolver.resolve(staff('staff-accounts', 'role-accounts'));
    expect(access).toMatchObject({ roleKey: 'accountant', roleName: 'Accountant', isOwner: false });
    expect(access.permissions).toEqual(effectivePermissions(false, ROLE_ROWS['role-accounts'].permissions));
  });

  it('gives a portal login no staff capabilities at all', async () => {
    const resolver = new PermissionResolverService(new TenantContextService(), fakeDb());
    await expect(resolver.permissionsFor(portal('student', ['stu-1']))).resolves.toEqual([]);
  });
});

describe('PortalScopeGuard', () => {
  const guardFor = (param: string | undefined) => new PortalScopeGuard(reflectorReturning(param));

  it('ignores routes without portal scoping', () => {
    expect(guardFor(undefined).canActivate(contextFor({ user: portal('student', ['stu-1']) }))).toBe(true);
  });

  it('lets a student read their own record', () => {
    const ctx = contextFor({ user: portal('student', ['stu-1']), params: { studentId: 'stu-1' } });
    expect(guardFor('studentId').canActivate(ctx)).toBe(true);
  });

  it('stops a student reading someone else', () => {
    const ctx = contextFor({ user: portal('student', ['stu-1']), params: { studentId: 'stu-9' } });
    expect(() => guardFor('studentId').canActivate(ctx)).toThrow(ForbiddenError);
  });

  it('lets a parent read either of their children but no one else', () => {
    const parent = portal('parent', ['stu-1', 'stu-2']);
    expect(guardFor('studentId').canActivate(contextFor({ user: parent, params: { studentId: 'stu-1' } }))).toBe(true);
    expect(guardFor('studentId').canActivate(contextFor({ user: parent, params: { studentId: 'stu-2' } }))).toBe(true);
    expect(() => guardFor('studentId').canActivate(contextFor({ user: parent, params: { studentId: 'stu-3' } }))).toThrow(ForbiddenError);
  });

  it('reads the student id from the query string and body too', () => {
    const parent = portal('parent', ['stu-1']);
    expect(guardFor('studentId').canActivate(contextFor({ user: parent, query: { studentId: 'stu-1' } }))).toBe(true);
    expect(guardFor('studentId').canActivate(contextFor({ user: parent, body: { studentId: 'stu-1' } }))).toBe(true);
  });

  it('refuses a scoped route that names no student', () => {
    expect(() => guardFor('studentId').canActivate(contextFor({ user: portal('parent', ['stu-1']) }))).toThrow(/must name a student/);
  });

  it('does not restrict staff', () => {
    const ctx = contextFor({ user: staff('staff-admin', 'role-admin'), params: { studentId: 'stu-9' } });
    expect(guardFor('studentId').canActivate(ctx)).toBe(true);
  });

  it('exposes the same check for services that resolve students themselves', () => {
    const parent: Principal = portal('parent', ['stu-1']);
    expect(() => assertPortalCanAccessStudent(parent, 'stu-1')).not.toThrow();
    expect(() => assertPortalCanAccessStudent(parent, 'stu-2')).toThrow(ForbiddenError);
    expect(() => assertPortalCanAccessStudent(staff('staff-faculty', 'role-faculty'), 'stu-2')).not.toThrow();
  });
});
