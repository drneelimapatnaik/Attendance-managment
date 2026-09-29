/**
 * Role rules — pure functions, no React and no store.
 *
 * Resolving what a staff member may do, and the guard rails that keep an
 * institute from locking itself out while it edits its own roles:
 *
 *  - built-in roles can't be deleted, and no two roles may share a name
 *  - the Administrator role keeps `faculty.manage` + `settings.manage`
 *  - a role still in use can only be deleted with a reassignment target
 *  - at least one active staff member must be able to manage staff & roles
 *  - nobody may grant a permission they don't hold themselves (owner excepted)
 *  - nobody may edit or delete the role they are signed in with (owner excepted)
 *
 * `store/dataStore.ts` calls these before every write and returns the reason to
 * the UI; the backend must apply exactly the same checks.
 */
import type { Batch, ID, Permission, Role, Staff } from '@/types/domain';
import { ALL_PERMISSIONS, lockedPermissions, permissionLabel, withRequired } from '@/config/permissions';

/* ------------------------------------------------------------- Resolution */

export const findRole = (roles: Role[], id: ID | undefined): Role | undefined => roles.find((r) => r.id === id);

/** What a staff member may do. The owner implicitly holds every permission. */
export function permissionsOf(member: Staff | undefined, roles: Role[]): Permission[] {
  if (!member) return [];
  if (member.isOwner) return ALL_PERMISSIONS;
  return findRole(roles, member.roleId)?.permissions ?? [];
}

export function staffCan(member: Staff | undefined, roles: Role[], permission: Permission): boolean {
  return permissionsOf(member, roles).includes(permission);
}

/** How many staff members hold a role (every status — an invited member still occupies it). */
export const staffCountForRole = (roleId: ID, staff: Staff[]): number => staff.filter((s) => s.roleId === roleId).length;

/**
 * Someone who can put the institute back together: the owner, or anyone whose
 * role can manage staff & roles. The institute must always have one active.
 */
export const isAdministrator = (member: Staff, roles: Role[]): boolean => member.isOwner || staffCan(member, roles, 'faculty.manage');

export const activeAdministrators = (staff: Staff[], roles: Role[]): Staff[] =>
  staff.filter((s) => s.status === 'Active' && isAdministrator(s, roles));

/**
 * Can be picked as a batch's teacher: the owner, or a role that keeps syllabus
 * coverage. Office roles (front desk, accounts) are left out of the picker.
 */
export const canTeach = (member: Staff, roles: Role[]): boolean => member.isOwner || staffCan(member, roles, 'topics.manage');

/**
 * A class teacher, for screens that show "my classes" first: the built-in
 * Faculty role, or anyone who is assigned a live batch without running the
 * timetable themselves (a custom teaching role).
 */
export function isClassTeacher(member: Staff | undefined, roles: Role[], batches: Batch[]): boolean {
  if (!member) return false;
  if (findRole(roles, member.roleId)?.key === 'faculty') return true;
  if (member.isOwner || staffCan(member, roles, 'batches.manage')) return false;
  return batches.some((b) => b.facultyId === member.id && b.status !== 'Archived');
}

/* ------------------------------------------------------------------- Keys */

/** "Front Desk" → "front-desk". Suffixed when the slug is taken so keys stay unique. */
export function roleKeyFrom(name: string, roles: Role[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'role';
  const taken = new Set(roles.map((r) => r.key));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/* ----------------------------------------------------------------- Guards */

/** Why a write was refused. `ok: false` results carry a message for the UI. */
export type RoleRefusal =
  | 'name-required'
  | 'name-taken'
  | 'no-permissions'
  | 'not-allowed'
  | 'own-role'
  | 'system-role'
  | 'locked-permissions'
  | 'escalation'
  | 'role-in-use'
  | 'bad-reassignment'
  | 'last-admin'
  | 'not-found';

export interface RoleFailure {
  ok: false;
  code: RoleRefusal;
  /** Sentence shown to the user. */
  reason: string;
}

export interface RoleGuardContext {
  roles: Role[];
  staff: Staff[];
  /** The signed-in staff member, when known. */
  actor?: Staff;
}

export interface RoleDraft {
  name: string;
  description?: string;
  permissions: Permission[];
}

const fail = (code: RoleRefusal, reason: string): RoleFailure => ({ ok: false, code, reason });

const NAME_MAX = 40;

const list = (permissions: Permission[]): string => permissions.map(permissionLabel).join(', ');

/** Name must be present, short enough and unique (case-insensitive) across roles. */
function checkName(name: string, ctx: RoleGuardContext, exceptId?: ID): RoleFailure | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return fail('name-required', 'Give the role a name, e.g. “Front Desk”.');
  if (trimmed.length > NAME_MAX) return fail('name-required', `Keep the name under ${NAME_MAX} characters.`);
  const clash = ctx.roles.find((r) => r.id !== exceptId && r.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (clash) return fail('name-taken', `A role called “${clash.name}” already exists.`);
  return null;
}

/** Only the owner may hand out permissions they don't hold themselves. */
function checkEscalation(added: Permission[], ctx: RoleGuardContext): RoleFailure | null {
  const actor = ctx.actor;
  if (!actor || actor.isOwner) return null;
  const mine = permissionsOf(actor, ctx.roles);
  const missing = added.filter((p) => !mine.includes(p));
  if (missing.length) return fail('escalation', `You can only grant permissions you hold yourself. Not yours to give: ${list(missing)}.`);
  return null;
}

/** Everyone who may manage staff & roles must not all disappear. */
function checkAdminsRemain(staff: Staff[], roles: Role[]): RoleFailure | null {
  if (activeAdministrators(staff, roles).length) return null;
  return fail('last-admin', 'At least one active staff member must be able to manage staff & roles.');
}

function requireManager(ctx: RoleGuardContext): RoleFailure | null {
  if (!ctx.actor) return null; // no session (seed/import): the backend still checks
  if (isAdministrator(ctx.actor, ctx.roles)) return null;
  return fail('not-allowed', 'You don’t have permission to manage roles.');
}

export function checkAddRole(draft: RoleDraft, ctx: RoleGuardContext): RoleFailure | null {
  return (
    requireManager(ctx) ??
    checkName(draft.name, ctx) ??
    (draft.permissions.length ? null : fail('no-permissions', 'Pick at least one thing this role can do.')) ??
    checkEscalation(withRequired(draft.permissions), ctx)
  );
}

export function checkUpdateRole(id: ID, patch: Partial<RoleDraft>, ctx: RoleGuardContext): RoleFailure | null {
  const role = findRole(ctx.roles, id);
  if (!role) return fail('not-found', 'That role no longer exists.');
  const blocked = requireManager(ctx);
  if (blocked) return blocked;

  // Nobody edits the role they are signed in with — that is how people lock
  // themselves out. The owner is exempt (they can always get back in).
  if (ctx.actor && !ctx.actor.isOwner && ctx.actor.roleId === id)
    return fail('own-role', 'You can’t change your own role. Ask the owner or another administrator.');

  if (patch.name !== undefined) {
    const named = checkName(patch.name, ctx, id);
    if (named) return named;
  }

  if (patch.permissions !== undefined) {
    const next = withRequired(patch.permissions);
    if (!next.length) return fail('no-permissions', 'Pick at least one thing this role can do.');

    const locked = lockedPermissions(role);
    const stripped = locked?.permissions.filter((p) => !next.includes(p)) ?? [];
    if (locked && stripped.length) return fail('locked-permissions', `${role.name} must keep ${list(stripped)}. ${locked.reason}`);

    const escalation = checkEscalation(
      next.filter((p) => !role.permissions.includes(p)),
      ctx,
    );
    if (escalation) return escalation;

    // Dropping "manage staff & roles" from a role may remove the last administrator.
    if (role.permissions.includes('faculty.manage') && !next.includes('faculty.manage')) {
      const after = ctx.roles.map((r) => (r.id === id ? { ...r, permissions: next } : r));
      const admins = checkAdminsRemain(ctx.staff, after);
      if (admins) return admins;
    }
  }

  return null;
}

export interface DeletePlan {
  role: Role;
  /** Staff who must move before the role can go. */
  affected: Staff[];
  reassignTo?: Role;
}

/**
 * Validates a delete and describes what it will do. `reassignToId` is required
 * while anyone still holds the role.
 */
export function checkDeleteRole(id: ID, reassignToId: ID | undefined, ctx: RoleGuardContext): RoleFailure | DeletePlan {
  const role = findRole(ctx.roles, id);
  if (!role) return fail('not-found', 'That role no longer exists.');
  const blocked = requireManager(ctx);
  if (blocked) return blocked;
  if (role.isSystem) return fail('system-role', `${role.name} is a built-in role and can’t be deleted. You can rename it instead.`);
  if (ctx.actor && !ctx.actor.isOwner && ctx.actor.roleId === id)
    return fail('own-role', 'You can’t delete the role you are signed in with.');

  const affected = ctx.staff.filter((s) => s.roleId === id);
  let target: Role | undefined;
  if (affected.length) {
    if (!reassignToId)
      return fail(
        'role-in-use',
        `${affected.length} staff member${affected.length === 1 ? '' : 's'} still use ${role.name}. Choose the role to move them to.`,
      );
    target = findRole(ctx.roles, reassignToId);
    if (!target || target.id === id) return fail('bad-reassignment', 'Choose an existing role to move these staff members to.');
  }

  const after = ctx.staff.map((s) => (s.roleId === id && target ? { ...s, roleId: target.id } : s));
  const admins = checkAdminsRemain(
    after,
    ctx.roles.filter((r) => r.id !== id),
  );
  if (admins) return admins;

  return { role, affected, reassignTo: target };
}

export const isRoleFailure = (r: RoleFailure | DeletePlan): r is RoleFailure => 'ok' in r && r.ok === false;

/* ------------------------------------------------- Assigning staff a role */

/**
 * Why `actor` may not put `target` on `roleId` — an admin must not hand out
 * powers they lack themselves, and the last administrator must keep theirs.
 */
export function roleAssignmentBlockReason(target: Staff | undefined, roleId: ID, ctx: RoleGuardContext): string | null {
  const role = findRole(ctx.roles, roleId);
  if (!role) return 'Pick a role for this staff member.';
  const actor = ctx.actor;
  if (actor && !actor.isOwner) {
    const mine = permissionsOf(actor, ctx.roles);
    const missing = role.permissions.filter((p) => !mine.includes(p));
    if (missing.length) return `${role.name} includes permissions you don’t hold yourself (${list(missing)}).`;
  }
  if (target) {
    const after = ctx.staff.map((s) => (s.id === target.id ? { ...s, roleId } : s));
    if (!activeAdministrators(after, ctx.roles).length)
      return 'Every institute needs one active staff member who can manage staff & roles.';
  }
  return null;
}
