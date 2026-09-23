/**
 * The role matrix must stay identical to frontend/src/config/permissions.ts.
 * These expectations are written out longhand (rather than derived) so that a
 * change on either side fails the build instead of silently drifting.
 */
import { Role } from '@prisma/client';
import { can, PERMISSIONS, permissionsFor, ROLE_PERMISSIONS } from './permissions';

describe('role permissions', () => {
  it('knows the 14 permissions the client defines', () => {
    expect([...PERMISSIONS]).toEqual([
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
    ]);
  });

  it('gives the owner everything', () => {
    expect(ROLE_PERMISSIONS[Role.owner]).toHaveLength(PERMISSIONS.length);
  });

  it('gives the admin everything except institute settings', () => {
    expect(can(Role.admin, 'settings.manage')).toBe(false);
    expect(can(Role.admin, 'faculty.manage')).toBe(true);
    expect(ROLE_PERMISSIONS[Role.admin]).toHaveLength(PERMISSIONS.length - 1);
  });

  it('limits faculty to teaching', () => {
    expect([...ROLE_PERMISSIONS[Role.faculty]]).toEqual([
      'dashboard.view',
      'attendance.mark',
      'attendance.reports',
      'students.view',
      'batches.view',
      'topics.manage',
      'performance.view',
      'performance.manage',
    ]);
    expect(can(Role.faculty, 'fees.collect')).toBe(false);
    expect(can(Role.faculty, 'students.manage')).toBe(false);
  });

  it('limits the accountant to money', () => {
    expect([...ROLE_PERMISSIONS[Role.accountant]]).toEqual([
      'dashboard.view',
      'students.view',
      'batches.view',
      'fees.view',
      'fees.collect',
      'attendance.reports',
    ]);
    expect(can(Role.accountant, 'attendance.mark')).toBe(false);
  });

  it('limits the front desk to admissions and rosters', () => {
    expect([...ROLE_PERMISSIONS[Role.front_desk]]).toEqual([
      'dashboard.view',
      'students.view',
      'students.manage',
      'batches.view',
      'fees.view',
      'attendance.mark',
    ]);
    expect(can(Role.front_desk, 'fees.collect')).toBe(false);
  });

  it('treats an unknown role as having nothing', () => {
    expect(can(undefined, 'dashboard.view')).toBe(false);
  });

  it('returns a copy from permissionsFor, so callers cannot mutate the matrix', () => {
    const list = permissionsFor(Role.faculty);
    list.push('settings.manage');
    expect(can(Role.faculty, 'settings.manage')).toBe(false);
  });
});
