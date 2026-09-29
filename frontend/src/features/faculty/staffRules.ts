/**
 * Staff presentation + guard rails shared by the Faculty page and the staff
 * form. The guards keep an institute from locking itself out: nobody changes
 * their own access, only the owner manages the owner, the last active
 * administrator can't be demoted or deactivated, and nobody hands out
 * permissions they don't hold. The rules themselves live in
 * src/domain/roles.ts (pure, tested); the backend must enforce the same ones.
 */
import type { Batch, Role, Staff } from '@/types/domain';
import type { BadgeTone } from '@/components/ui';
import { activeAdministrators, isAdministrator } from '@/domain/roles';
import { pluralize } from '@/lib/format';

/** Icon + badge tone for a role. Built-ins are recognisable; custom roles share one look. */
export function roleMeta(role: Role | undefined): { icon: string; tone: BadgeTone } {
  if (!role) return { icon: 'help', tone: 'neutral' };
  if (role.isSystem && role.key === 'admin') return { icon: 'admin_panel_settings', tone: 'info' };
  if (role.isSystem && role.key === 'faculty') return { icon: 'school', tone: 'surface' };
  return { icon: 'badge', tone: 'secondary' };
}

export const OWNER_META = { icon: 'shield_person', tone: 'primary' as BadgeTone };

/**
 * The only active staff member who can manage staff & roles — deactivating,
 * removing or re-roling them would leave nobody able to run the institute.
 */
export function isLastAdmin(target: Staff, staff: Staff[], roles: Role[]): boolean {
  if (!isAdministrator(target, roles)) return false;
  const admins = activeAdministrators(staff, roles);
  return admins.length === 1 && admins[0].id === target.id;
}

/** Why `actor` may not change `target`'s access (role/status), or null when allowed. */
export function accessLockReason(target: Staff, actor: Staff | undefined, staff: Staff[], roles: Role[]): string | null {
  if (actor?.id === target.id) return "You can't change your own access.";
  if (isLastAdmin(target, staff, roles)) return 'Every institute needs one active staff member who can manage staff & roles.';
  if (target.isOwner && !actor?.isOwner) return 'Only the owner can change the owner’s access.';
  return null;
}

/** Non-archived batches a staff member teaches (their timetable depends on them). */
export const batchesTaughtBy = (staffId: string, batches: Batch[]) =>
  batches.filter((b) => b.facultyId === staffId && b.status !== 'Archived');

/** Why `target` cannot be removed, or null. Batches must be reassigned first so none is left without a teacher. */
export function removeBlockReason(target: Staff, actor: Staff | undefined, staff: Staff[], roles: Role[], batches: Batch[]): string | null {
  const locked = accessLockReason(target, actor, staff, roles);
  if (locked) return locked;
  const teaching = batchesTaughtBy(target.id, batches).length;
  return teaching ? `Reassign their ${pluralize(teaching, 'batch', 'batches')} first.` : null;
}
