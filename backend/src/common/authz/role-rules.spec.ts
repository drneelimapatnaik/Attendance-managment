/**
 * The rules that make roles-as-data safe: the institute always keeps an
 * administrator, nobody hands out more than they hold, and a human label becomes a
 * usable slug. Pure functions, so no database and no Nest here.
 */
import { StaffStatus } from '@prisma/client';
import { ALL_PERMISSIONS } from './permissions';
import {
  countActiveAdmins,
  countActiveAdminsAfter,
  escalatedPermissions,
  isAdminPermissionSet,
  ROLE_KEY_PATTERN,
  slugifyRoleKey,
  type RolePermissionSnapshot,
  type StaffRoleSnapshot,
} from './role-rules';
import { FACULTY_PERMISSIONS, SYSTEM_ROLES } from './system-roles';

const ROLES: RolePermissionSnapshot[] = [
  { id: 'role-admin', permissions: [...ALL_PERMISSIONS] },
  { id: 'role-faculty', permissions: [...FACULTY_PERMISSIONS] },
  { id: 'role-accounts', permissions: ['dashboard.view', 'fees.view', 'fees.collect'] },
];

const member = (id: string, roleId: string, overrides: Partial<StaffRoleSnapshot> = {}): StaffRoleSnapshot => ({
  id,
  roleId,
  isOwner: false,
  status: StaffStatus.Active,
  ...overrides,
});

describe('the built-in roles', () => {
  it('are exactly admin and faculty', () => {
    expect(SYSTEM_ROLES.map((role) => role.key)).toEqual(['admin', 'faculty']);
  });

  it('give the Administrator every capability and the Faculty role the teaching subset', () => {
    const [admin, faculty] = SYSTEM_ROLES;
    expect(admin.permissions).toHaveLength(ALL_PERMISSIONS.length);
    expect([...faculty.permissions]).toEqual([
      'dashboard.view',
      'attendance.mark',
      'attendance.reports',
      'students.view',
      'batches.view',
      'topics.manage',
      'performance.view',
      'performance.manage',
    ]);
    // Faculty is the pre-selected role on the invite form.
    expect(faculty.isDefault).toBe(true);
  });
});

describe('isAdminPermissionSet', () => {
  it('needs both markers: managing staff and managing the institute', () => {
    expect(isAdminPermissionSet([...ALL_PERMISSIONS])).toBe(true);
    expect(isAdminPermissionSet(['faculty.manage', 'settings.manage'])).toBe(true);
    expect(isAdminPermissionSet(['faculty.manage'])).toBe(false);
    expect(isAdminPermissionSet(['settings.manage'])).toBe(false);
    expect(isAdminPermissionSet([...FACULTY_PERMISSIONS])).toBe(false);
  });

  it('does not care what the role is called or whether it is built in', () => {
    // An institute's own "Branch Head" with full rights counts as an administrator.
    expect(isAdminPermissionSet(['dashboard.view', 'faculty.manage', 'settings.manage'])).toBe(true);
  });
});

describe('countActiveAdmins', () => {
  it('counts active holders of an admin role', () => {
    const staff = [member('s1', 'role-admin'), member('s2', 'role-faculty'), member('s3', 'role-accounts')];
    expect(countActiveAdmins(staff, ROLES)).toBe(1);
  });

  it('always counts an active owner, whatever their role row holds', () => {
    const staff = [member('owner', 'role-faculty', { isOwner: true })];
    expect(countActiveAdmins(staff, ROLES)).toBe(1);
  });

  it('ignores inactive and invited people', () => {
    const staff = [
      member('s1', 'role-admin', { status: StaffStatus.Inactive }),
      member('s2', 'role-admin', { status: StaffStatus.Invited }),
    ];
    expect(countActiveAdmins(staff, ROLES)).toBe(0);
  });
});

describe('countActiveAdminsAfter', () => {
  const staff = [member('admin-1', 'role-admin'), member('teacher', 'role-faculty'), member('accounts', 'role-accounts')];

  it('sees the institute lose its last admin when the admin role is stripped', () => {
    expect(countActiveAdminsAfter(staff, ROLES, { role: { id: 'role-admin', permissions: ['dashboard.view'] } })).toBe(0);
  });

  it('is happy when another role still confers administration', () => {
    const withSecondAdmin = [...staff, member('branch-head', 'role-accounts')];
    const roles = ROLES.map((role) =>
      role.id === 'role-accounts'
        ? { ...role, permissions: [...role.permissions, 'faculty.manage' as const, 'settings.manage' as const] }
        : role,
    );
    expect(countActiveAdminsAfter(withSecondAdmin, roles, { role: { id: 'role-admin', permissions: ['dashboard.view'] } })).toBe(2);
  });

  it('follows a reassignment when a role is deleted', () => {
    expect(
      countActiveAdminsAfter(staff, ROLES, {
        removedRoleId: 'role-accounts',
        reassign: { fromRoleId: 'role-accounts', toRoleId: 'role-admin' },
      }),
    ).toBe(2);
  });

  it('sees a deactivation and a deletion', () => {
    expect(countActiveAdminsAfter(staff, ROLES, { staff: { id: 'admin-1', status: StaffStatus.Inactive } })).toBe(0);
    expect(countActiveAdminsAfter(staff, ROLES, { removedStaffId: 'admin-1' })).toBe(0);
  });

  it('sees a role change in both directions', () => {
    expect(countActiveAdminsAfter(staff, ROLES, { staff: { id: 'admin-1', roleId: 'role-faculty' } })).toBe(0);
    expect(countActiveAdminsAfter(staff, ROLES, { staff: { id: 'teacher', roleId: 'role-admin' } })).toBe(2);
  });

  it('leaves the original snapshots untouched', () => {
    countActiveAdminsAfter(staff, ROLES, { removedStaffId: 'admin-1', role: { id: 'role-admin', permissions: [] } });
    expect(staff).toHaveLength(3);
    expect(ROLES[0].permissions).toHaveLength(ALL_PERMISSIONS.length);
  });
});

describe('escalatedPermissions', () => {
  const actor = ['dashboard.view', 'fees.view', 'fees.collect'] as const;

  it('names the capabilities the actor does not hold', () => {
    expect(escalatedPermissions(['fees.collect', 'settings.manage'], [...actor])).toEqual(['settings.manage']);
  });

  it('allows anything the actor holds', () => {
    expect(escalatedPermissions([...actor], [...actor])).toEqual([]);
  });

  it('ignores capabilities the role already had — editing a name is not granting', () => {
    expect(escalatedPermissions(['settings.manage'], [...actor], ['settings.manage'])).toEqual([]);
  });
});

describe('slugifyRoleKey', () => {
  it('turns a label into a stable slug', () => {
    expect(slugifyRoleKey('Front Desk')).toBe('front_desk');
    expect(slugifyRoleKey('Branch Head (North)')).toBe('branch_head_north');
    expect(slugifyRoleKey('  Counsellor  ')).toBe('counsellor');
  });

  it('drops accents rather than mangling them', () => {
    expect(slugifyRoleKey('Coördinator')).toBe('coordinator');
  });

  it('produces keys the pattern accepts, and nothing usable from nonsense', () => {
    expect(ROLE_KEY_PATTERN.test(slugifyRoleKey('Exam Controller'))).toBe(true);
    // A name with no letters cannot make a key; the API asks for an explicit one.
    expect(slugifyRoleKey('!!!')).toBe('');
    expect(ROLE_KEY_PATTERN.test('')).toBe(false);
    expect(ROLE_KEY_PATTERN.test('1st_desk')).toBe(false);
  });
});
