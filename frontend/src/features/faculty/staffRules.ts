/**
 * Staff presentation + guard rails shared by the Faculty page and the staff
 * form. The guards keep an institute from locking itself out (no removing,
 * deactivating or demoting the last active owner, no changing your own
 * access, only owners manage owners). The backend must enforce the same rules.
 */
import type { Batch, Role, Staff } from '@/types/domain';
import type { BadgeTone } from '@/components/ui';
import { pluralize } from '@/lib/format';

export const ROLES: Role[] = ['owner', 'admin', 'faculty', 'accountant', 'front_desk'];

export const ROLE_META: Record<Role, { icon: string; tone: BadgeTone }> = {
  owner: { icon: 'shield_person', tone: 'primary' },
  admin: { icon: 'admin_panel_settings', tone: 'info' },
  faculty: { icon: 'school', tone: 'surface' },
  accountant: { icon: 'account_balance', tone: 'secondary' },
  front_desk: { icon: 'support_agent', tone: 'neutral' },
};

export const isActiveOwner = (s: Staff) => s.role === 'owner' && s.status === 'Active';

/** The only active owner — removing, deactivating or demoting them would leave nobody able to manage the institute. */
export function isLastOwner(target: Staff, staff: Staff[]): boolean {
  return isActiveOwner(target) && staff.filter(isActiveOwner).length === 1;
}

/** Why `actor` may not change `target`'s access (status/role), or null when allowed. */
export function accessLockReason(target: Staff, actor: Staff | undefined, staff: Staff[]): string | null {
  if (actor?.id === target.id) return "You can't change your own access.";
  if (isLastOwner(target, staff)) return 'Every institute needs at least one active owner.';
  if (target.role === 'owner' && actor?.role !== 'owner') return 'Only an owner can change another owner.';
  return null;
}

/** Non-archived batches a staff member teaches (their timetable depends on them). */
export const batchesTaughtBy = (staffId: string, batches: Batch[]) =>
  batches.filter((b) => b.facultyId === staffId && b.status !== 'Archived');

/** Why `target` cannot be removed, or null. Batches must be reassigned first so none is left without a teacher. */
export function removeBlockReason(target: Staff, actor: Staff | undefined, staff: Staff[], batches: Batch[]): string | null {
  const locked = accessLockReason(target, actor, staff);
  if (locked) return locked;
  const teaching = batchesTaughtBy(target.id, batches).length;
  return teaching ? `Reassign their ${pluralize(teaching, 'batch', 'batches')} first.` : null;
}
