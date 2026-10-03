/**
 * Pure rules about roles, kept out of the service so they can be unit-tested
 * without a database.
 *
 * Two of them carry real weight:
 *
 *   countActiveAdmins  — the institute must never end up with nobody who can
 *                        manage staff and settings. Every mutation that could
 *                        reduce that number (editing a role's permissions,
 *                        reassigning staff, deactivating or deleting someone)
 *                        builds the *post-change* roster in memory and counts it.
 *   escalation checks  — a non-owner may not hand out a capability they do not
 *                        themselves hold, and may not edit the role they are
 *                        standing on.
 */
import { StaffStatus } from '@prisma/client';
import { type Permission } from './permissions';
import { ADMIN_MARKER_PERMISSIONS } from './system-roles';

/** Just enough of a role to reason about privilege. */
export interface RolePermissionSnapshot {
  id: string;
  permissions: readonly Permission[];
}

/** Just enough of a staff row to reason about the admin invariant. */
export interface StaffRoleSnapshot {
  id: string;
  roleId: string;
  isOwner: boolean;
  status: StaffStatus;
}

/**
 * Does this permission set make its holder an administrator? Both markers are
 * required: `faculty.manage` alone cannot fix broken settings, and
 * `settings.manage` alone cannot invite a replacement admin.
 */
export function isAdminPermissionSet(permissions: readonly Permission[]): boolean {
  return ADMIN_MARKER_PERMISSIONS.every((marker) => permissions.includes(marker));
}

/**
 * How many people could still administer the institute after a change.
 *
 * An active owner always counts (owners hold every permission implicitly, whatever
 * their role row says). Everyone else counts when their status is Active and their
 * role holds both marker capabilities.
 */
export function countActiveAdmins(staff: readonly StaffRoleSnapshot[], roles: readonly RolePermissionSnapshot[]): number {
  const adminRoleIds = new Set(roles.filter((role) => isAdminPermissionSet(role.permissions)).map((role) => role.id));
  return staff.filter((member) => member.status === StaffStatus.Active && (member.isOwner || adminRoleIds.has(member.roleId))).length;
}

/** A pending change to the roster, expressed as edits to the two snapshots. */
export interface PendingChange {
  /** Role whose permission set is being replaced. */
  role?: { id: string; permissions: readonly Permission[] };
  /** Role being deleted (its staff must be moved first, via `reassign`). */
  removedRoleId?: string;
  /** Move every member of `fromRoleId` to `toRoleId`. */
  reassign?: { fromRoleId: string; toRoleId: string };
  /** One staff member's new role and/or status. */
  staff?: { id: string; roleId?: string; status?: StaffStatus };
  /** Staff member being deleted. */
  removedStaffId?: string;
}

/**
 * Applies a pending change to the in-memory roster and counts the administrators
 * that would be left. Cheap: a tenant has tens of staff and a handful of roles,
 * so reading both tables is a far simpler correctness story than a clever query.
 */
export function countActiveAdminsAfter(
  staff: readonly StaffRoleSnapshot[],
  roles: readonly RolePermissionSnapshot[],
  change: PendingChange,
): number {
  let nextRoles = roles.map((role) =>
    change.role && role.id === change.role.id ? { ...role, permissions: change.role.permissions } : role,
  );
  if (change.removedRoleId) nextRoles = nextRoles.filter((role) => role.id !== change.removedRoleId);

  let nextStaff = staff.map((member) => {
    let next = member;
    if (change.reassign && next.roleId === change.reassign.fromRoleId) next = { ...next, roleId: change.reassign.toRoleId };
    if (change.staff && next.id === change.staff.id) {
      next = { ...next, roleId: change.staff.roleId ?? next.roleId, status: change.staff.status ?? next.status };
    }
    return next;
  });
  if (change.removedStaffId) nextStaff = nextStaff.filter((member) => member.id !== change.removedStaffId);

  return countActiveAdmins(nextStaff, nextRoles);
}

/**
 * The capabilities in `granted` that the actor does not hold — what a non-owner is
 * refused when they try to hand out more than they have. `alreadyGranted` is the
 * role's current set: leaving an existing capability in place is not an escalation,
 * so only genuinely *new* ones are checked (otherwise an accountant could not
 * rename the Administrator role).
 */
export function escalatedPermissions(
  granted: readonly Permission[],
  actorPermissions: readonly Permission[],
  alreadyGranted: readonly Permission[] = [],
): Permission[] {
  return granted.filter((permission) => !actorPermissions.includes(permission) && !alreadyGranted.includes(permission));
}

/**
 * Institute label → a stable slug for `Role.key`: lower case, words joined with
 * `_`, accents and punctuation dropped. "Front Desk" → `front_desk`,
 * "Branch Head (North)" → `branch_head_north`.
 */
export function slugifyRoleKey(value: string): string {
  const slug = value
    // NFKD splits an accented letter into letter + combining mark, and the property
    // escape then drops the marks — so "Coördinator" becomes "coordinator" rather
    // than losing the letter. Written as a property escape rather than a character
    // range so the rule survives any re-encoding of this file.
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '');
  return slug;
}

/** Role keys must be slug-shaped so they stay safe in URLs, configs and code. */
export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
