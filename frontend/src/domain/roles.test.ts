/**
 * The guard rails an institute edits its own roles behind. These are the rules
 * store/dataStore.ts applies to addRole / updateRole / deleteRole and that the
 * backend must mirror: built-in roles are protected, the last administrator
 * can't vanish, nobody grants more than they hold, and a role in use only goes
 * with a reassignment.
 */
import { describe, expect, it } from 'vitest';
import type { Batch, Permission, Role, Staff } from '@/types/domain';
import { createSystemRoles, SYSTEM_ROLE_IDS } from '@/config/permissions';
import {
  activeAdministrators,
  canTeach,
  checkAddRole,
  checkDeleteRole,
  checkUpdateRole,
  isAdministrator,
  isClassTeacher,
  isRoleFailure,
  permissionsOf,
  roleAssignmentBlockReason,
  roleKeyFrom,
  staffCountForRole,
  type RoleGuardContext,
} from './roles';

/* ------------------------------------------------------------- Fixtures */

const ACCOUNTANT: Role = {
  id: 'rol-accountant',
  key: 'accountant',
  name: 'Accountant',
  description: 'Collects fees.',
  permissions: ['dashboard.view', 'fees.view', 'fees.collect'],
  isSystem: false,
};

const OFFICE_MANAGER: Role = {
  id: 'rol-office',
  key: 'office-manager',
  name: 'Office Manager',
  permissions: ['dashboard.view', 'students.view', 'students.manage', 'faculty.manage'],
  isSystem: false,
};

const roles = (): Role[] => [...createSystemRoles(), { ...ACCOUNTANT }];

const member = (over: Partial<Staff> & Pick<Staff, 'id' | 'roleId'>): Staff => ({
  name: `Staff ${over.id}`,
  email: `${over.id}@apex.in`,
  phone: '+91 90000 00000',
  isOwner: false,
  title: 'Staff',
  subjectIds: [],
  status: 'Active',
  joinedOn: '2024-01-01',
  ...over,
});

const OWNER = member({ id: 'st-owner', roleId: SYSTEM_ROLE_IDS.admin, isOwner: true });
const ADMIN = member({ id: 'st-admin', roleId: SYSTEM_ROLE_IDS.admin });
const TEACHER = member({ id: 'st-teacher', roleId: SYSTEM_ROLE_IDS.faculty });
const ACCOUNTS = member({ id: 'st-accounts', roleId: ACCOUNTANT.id });

const ctx = (over: Partial<RoleGuardContext> = {}): RoleGuardContext => ({
  roles: roles(),
  staff: [OWNER, ADMIN, TEACHER, ACCOUNTS],
  actor: OWNER,
  ...over,
});

const draft = (over: Partial<{ name: string; permissions: Permission[] }> = {}) => ({
  name: 'Counsellor',
  description: 'Talks to parents.',
  permissions: ['dashboard.view', 'students.view'] as Permission[],
  ...over,
});

/* ------------------------------------------------------------ Resolution */

describe('permission resolution', () => {
  it('gives the owner everything, whatever their role says', () => {
    const owner = { ...OWNER, roleId: ACCOUNTANT.id };
    expect(permissionsOf(owner, roles())).toContain('settings.manage');
    expect(permissionsOf(ACCOUNTS, roles())).toEqual(['dashboard.view', 'fees.view', 'fees.collect']);
    expect(permissionsOf(undefined, roles())).toEqual([]);
    // A role deleted out from under someone leaves them with nothing.
    expect(permissionsOf(member({ id: 'x', roleId: 'rol-gone' }), roles())).toEqual([]);
  });

  it('counts administrators as the owner plus anyone who can manage staff & roles', () => {
    const all = roles();
    expect(isAdministrator(OWNER, all)).toBe(true);
    expect(isAdministrator(ADMIN, all)).toBe(true);
    expect(isAdministrator(TEACHER, all)).toBe(false);
    expect(activeAdministrators([OWNER, ADMIN, TEACHER], all).map((s) => s.id)).toEqual([OWNER.id, ADMIN.id]);
    expect(activeAdministrators([{ ...ADMIN, status: 'Inactive' }, TEACHER], all)).toEqual([]);
  });

  it('knows who may teach and who counts as a class teacher', () => {
    const all = roles();
    const batch = { id: 'bat-1', facultyId: 'st-visiting', status: 'Active' } as Batch;
    expect(canTeach(TEACHER, all)).toBe(true);
    expect(canTeach(ACCOUNTS, all)).toBe(false);
    expect(canTeach(OWNER, all)).toBe(true);
    expect(isClassTeacher(TEACHER, all, [])).toBe(true);
    expect(isClassTeacher(ADMIN, all, [batch])).toBe(false); // runs the timetable, not a class teacher
    const visiting = member({ id: 'st-visiting', roleId: ACCOUNTANT.id });
    expect(isClassTeacher(visiting, all, [batch])).toBe(true); // custom role holding a live batch
  });

  it('slugs role names into unique keys', () => {
    expect(roleKeyFrom('Front Desk', [])).toBe('front-desk');
    expect(roleKeyFrom('Front Desk!', [{ ...ACCOUNTANT, key: 'front-desk' }])).toBe('front-desk-2');
    expect(roleKeyFrom('***', [])).toBe('role');
  });
});

/* ---------------------------------------------------------------- Create */

describe('checkAddRole', () => {
  it('accepts a well-formed role', () => {
    expect(checkAddRole(draft(), ctx())).toBeNull();
  });

  it('needs a name, a unique name and at least one permission', () => {
    expect(checkAddRole(draft({ name: ' ' }), ctx())?.code).toBe('name-required');
    expect(checkAddRole(draft({ name: 'accountant' }), ctx())?.code).toBe('name-taken');
    expect(checkAddRole(draft({ permissions: [] }), ctx())?.code).toBe('no-permissions');
  });

  it('refuses to hand out permissions the actor does not hold', () => {
    const office = { ...OFFICE_MANAGER };
    const manager = member({ id: 'st-office', roleId: office.id });
    const context = ctx({ roles: [...roles(), office], staff: [OWNER, manager], actor: manager });
    const refusal = checkAddRole(draft({ permissions: ['fees.collect'] }), context);
    expect(refusal?.code).toBe('escalation');
    expect(refusal?.reason).toContain('Collect fees');
    // …but may grant what they do hold.
    expect(checkAddRole(draft({ permissions: ['students.manage'] }), context)).toBeNull();
    // The owner is never restricted.
    expect(checkAddRole(draft({ permissions: ['settings.manage'] }), ctx())).toBeNull();
  });

  it('refuses anyone who cannot manage staff & roles', () => {
    expect(checkAddRole(draft(), ctx({ actor: TEACHER }))?.code).toBe('not-allowed');
  });
});

/* ---------------------------------------------------------------- Update */

describe('checkUpdateRole', () => {
  it('lets a built-in role be renamed, but not into a clash', () => {
    expect(checkUpdateRole(SYSTEM_ROLE_IDS.admin, { name: 'Principal' }, ctx())).toBeNull();
    expect(checkUpdateRole(SYSTEM_ROLE_IDS.admin, { name: 'Faculty' }, ctx())?.code).toBe('name-taken');
    expect(checkUpdateRole(SYSTEM_ROLE_IDS.admin, { name: 'faculty  ' }, ctx())?.code).toBe('name-taken');
  });

  it('keeps Administrator able to manage staff, roles and settings', () => {
    const stripped = checkUpdateRole(SYSTEM_ROLE_IDS.admin, { permissions: ['dashboard.view', 'students.view'] }, ctx());
    expect(stripped?.code).toBe('locked-permissions');
    expect(stripped?.reason).toContain('Manage staff & roles');
    // Trimming a permission that is not locked is fine.
    expect(
      checkUpdateRole(SYSTEM_ROLE_IDS.admin, { permissions: ['dashboard.view', 'faculty.manage', 'settings.manage'] }, ctx()),
    ).toBeNull();
  });

  it('refuses an empty permission set', () => {
    expect(checkUpdateRole(ACCOUNTANT.id, { permissions: [] }, ctx())?.code).toBe('no-permissions');
  });

  it('stops anyone but the owner editing the role they are signed in with', () => {
    const office = { ...OFFICE_MANAGER };
    const manager = member({ id: 'st-office', roleId: office.id });
    const context = ctx({ roles: [...roles(), office], staff: [OWNER, manager], actor: manager });
    expect(checkUpdateRole(office.id, { name: 'Super Manager' }, context)?.code).toBe('own-role');
    // The owner may edit the role they hold.
    expect(checkUpdateRole(SYSTEM_ROLE_IDS.admin, { name: 'Principal' }, ctx({ actor: OWNER }))).toBeNull();
  });

  it('refuses permissions the actor does not hold themselves', () => {
    const office = { ...OFFICE_MANAGER };
    const manager = member({ id: 'st-office', roleId: office.id });
    const context = ctx({ roles: [...roles(), office], staff: [OWNER, manager, ACCOUNTS], actor: manager });
    const refusal = checkUpdateRole(ACCOUNTANT.id, { permissions: ['dashboard.view', 'settings.manage'] }, context);
    expect(refusal?.code).toBe('escalation');
  });

  it('keeps at least one active administrator when dropping "manage staff & roles"', () => {
    const office = { ...OFFICE_MANAGER };
    const manager = member({ id: 'st-office', roleId: office.id });
    // No owner in this institute: the Office Manager role is the only way in.
    const context: RoleGuardContext = { roles: [...roles(), office], staff: [manager, TEACHER], actor: undefined };
    const refusal = checkUpdateRole(office.id, { permissions: ['dashboard.view', 'students.view'] }, context);
    expect(refusal?.code).toBe('last-admin');
    // With an owner around, the same edit is allowed.
    const withOwner: RoleGuardContext = { ...context, staff: [OWNER, manager, TEACHER] };
    expect(checkUpdateRole(office.id, { permissions: ['dashboard.view', 'students.view'] }, withOwner)).toBeNull();
  });

  it('reports an unknown role', () => {
    expect(checkUpdateRole('rol-gone', { name: 'X' }, ctx())?.code).toBe('not-found');
  });
});

/* ---------------------------------------------------------------- Delete */

describe('checkDeleteRole', () => {
  it('never deletes a built-in role', () => {
    const result = checkDeleteRole(SYSTEM_ROLE_IDS.faculty, undefined, ctx());
    expect(isRoleFailure(result) && result.code).toBe('system-role');
  });

  it('requires a reassignment target while anyone holds the role', () => {
    const inUse = checkDeleteRole(ACCOUNTANT.id, undefined, ctx());
    expect(isRoleFailure(inUse) && inUse.code).toBe('role-in-use');
    expect(isRoleFailure(inUse) && inUse.reason).toContain('1 staff member');

    const nowhere = checkDeleteRole(ACCOUNTANT.id, 'rol-gone', ctx());
    expect(isRoleFailure(nowhere) && nowhere.code).toBe('bad-reassignment');
    expect(isRoleFailure(checkDeleteRole(ACCOUNTANT.id, ACCOUNTANT.id, ctx()))).toBe(true);
  });

  it('describes the move when the target is valid', () => {
    const plan = checkDeleteRole(ACCOUNTANT.id, SYSTEM_ROLE_IDS.faculty, ctx());
    expect(isRoleFailure(plan)).toBe(false);
    if (isRoleFailure(plan)) return;
    expect(plan.role.id).toBe(ACCOUNTANT.id);
    expect(plan.affected.map((s) => s.id)).toEqual([ACCOUNTS.id]);
    expect(plan.reassignTo?.id).toBe(SYSTEM_ROLE_IDS.faculty);
    expect(staffCountForRole(ACCOUNTANT.id, ctx().staff)).toBe(1);
  });

  it('deletes an unused role without a target', () => {
    const unused = checkDeleteRole(ACCOUNTANT.id, undefined, ctx({ staff: [OWNER, TEACHER] }));
    expect(isRoleFailure(unused)).toBe(false);
  });

  it('refuses when the move would leave nobody able to manage staff & roles', () => {
    const office = { ...OFFICE_MANAGER };
    const manager = member({ id: 'st-office', roleId: office.id });
    const context: RoleGuardContext = { roles: [...roles(), office], staff: [manager, TEACHER], actor: manager };
    // The only administrator holds this role — moving them to Faculty locks everyone out.
    const result = checkDeleteRole(office.id, SYSTEM_ROLE_IDS.faculty, { ...context, actor: undefined });
    expect(isRoleFailure(result) && result.code).toBe('last-admin');
  });

  it('stops anyone but the owner deleting the role they are signed in with', () => {
    const context = ctx({ actor: ACCOUNTS, staff: [OWNER, ACCOUNTS] });
    // (An accountant can't manage roles at all, so check the manage gate too.)
    expect(isRoleFailure(checkDeleteRole(ACCOUNTANT.id, undefined, context))).toBe(true);
    const office = { ...OFFICE_MANAGER };
    const manager = member({ id: 'st-office', roleId: office.id });
    const own = checkDeleteRole(office.id, SYSTEM_ROLE_IDS.faculty, {
      roles: [...roles(), office],
      staff: [OWNER, manager],
      actor: manager,
    });
    expect(isRoleFailure(own) && own.code).toBe('own-role');
  });
});

/* --------------------------------------------------------- Staff → role */

describe('roleAssignmentBlockReason', () => {
  it('allows a normal assignment', () => {
    expect(roleAssignmentBlockReason(TEACHER, ACCOUNTANT.id, ctx())).toBeNull();
  });

  it('refuses a role carrying more than the actor holds', () => {
    const office = { ...OFFICE_MANAGER };
    const manager = member({ id: 'st-office', roleId: office.id });
    const context = ctx({ roles: [...roles(), office], staff: [OWNER, manager, TEACHER], actor: manager });
    expect(roleAssignmentBlockReason(TEACHER, SYSTEM_ROLE_IDS.admin, context)).toContain('permissions you don’t hold');
  });

  it('keeps the last administrator administrating', () => {
    const context = ctx({ staff: [ADMIN, TEACHER], actor: ADMIN });
    expect(roleAssignmentBlockReason(ADMIN, SYSTEM_ROLE_IDS.faculty, context)).toContain('manage staff & roles');
  });

  it('reports an unknown role', () => {
    expect(roleAssignmentBlockReason(TEACHER, 'rol-gone', ctx())).toContain('Pick a role');
  });
});
