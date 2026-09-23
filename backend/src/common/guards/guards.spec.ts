/**
 * Guard behaviour: what a role may do (PermissionsGuard) and what a student or
 * parent login may see (PortalScopeGuard). Both are pure decision logic, so the
 * ExecutionContext is faked rather than booting Nest.
 */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '@/common/errors/app.error';
import type { Permission } from '@/common/authz/permissions';
import type { PortalPrincipal, Principal, StaffPrincipal } from '@/auth/principal';
import { PermissionsGuard } from './permissions.guard';
import { assertPortalCanAccessStudent, PortalScopeGuard } from './portal-scope.guard';

const TENANT = 'tenant-a';

const staff = (role: Role): StaffPrincipal => ({
  kind: 'staff',
  id: 'staff-1',
  tenantId: TENANT,
  instituteCode: 'APEX',
  name: 'Test Staff',
  role,
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
  const guardFor = (required: Permission[] | undefined) => new PermissionsGuard(reflectorReturning(required));

  it('allows routes that declare no permissions', () => {
    expect(guardFor(undefined).canActivate(contextFor({}))).toBe(true);
    expect(guardFor([]).canActivate(contextFor({}))).toBe(true);
  });

  it('rejects an unauthenticated request', () => {
    expect(() => guardFor(['fees.collect']).canActivate(contextFor({}))).toThrow(UnauthorizedError);
  });

  it('lets an accountant collect fees', () => {
    expect(guardFor(['fees.collect']).canActivate(contextFor({ user: staff(Role.accountant) }))).toBe(true);
  });

  it('stops faculty collecting fees', () => {
    expect(() => guardFor(['fees.collect']).canActivate(contextFor({ user: staff(Role.faculty) }))).toThrow(ForbiddenError);
  });

  it('requires every listed permission, not just one', () => {
    // Front desk may mark attendance but may not manage batches.
    expect(() => guardFor(['attendance.mark', 'batches.manage']).canActivate(contextFor({ user: staff(Role.front_desk) }))).toThrow(
      ForbiddenError,
    );
  });

  it('reports which permissions were missing', () => {
    try {
      guardFor(['fees.collect', 'settings.manage']).canActivate(contextFor({ user: staff(Role.faculty) }));
      fail('expected the guard to throw');
    } catch (error) {
      expect((error as ForbiddenError).getResponse()).toMatchObject({
        code: 'PERMISSION_DENIED',
        details: { missing: ['fees.collect', 'settings.manage'] },
      });
    }
  });

  it('never lets a portal login through a staff permission', () => {
    expect(() => guardFor(['students.view']).canActivate(contextFor({ user: portal('parent', ['stu-1']) }))).toThrow(ForbiddenError);
  });

  it('lets the owner do everything', () => {
    const owner = contextFor({ user: staff(Role.owner) });
    expect(guardFor(['settings.manage', 'faculty.manage', 'fees.collect']).canActivate(owner)).toBe(true);
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
    const ctx = contextFor({ user: staff(Role.admin), params: { studentId: 'stu-9' } });
    expect(guardFor('studentId').canActivate(ctx)).toBe(true);
  });

  it('exposes the same check for services that resolve students themselves', () => {
    const parent: Principal = portal('parent', ['stu-1']);
    expect(() => assertPortalCanAccessStudent(parent, 'stu-1')).not.toThrow();
    expect(() => assertPortalCanAccessStudent(parent, 'stu-2')).toThrow(ForbiddenError);
    expect(() => assertPortalCanAccessStudent(staff(Role.faculty), 'stu-2')).not.toThrow();
  });
});
