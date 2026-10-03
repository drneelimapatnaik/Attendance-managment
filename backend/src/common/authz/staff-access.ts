/**
 * What the server knows about a signed-in staff member's authority, once it has
 * been read from the database.
 *
 * It lives in its own file because two layers need the type and neither should
 * depend on the other: PermissionResolverService produces it, and the per-request
 * tenant context caches it (src/tenancy/tenant-context.service.ts).
 */
import type { StaffStatus } from '@prisma/client';
import type { Permission } from './permissions';

export interface ResolvedStaffAccess {
  staffId: string;
  /** Owners hold every capability implicitly, whatever their role row says. */
  isOwner: boolean;
  status: StaffStatus;
  roleId: string;
  /** Stable slug, e.g. `admin`. Code may branch on this; never on the name. */
  roleKey: string;
  /** The institute's label for the role, e.g. "Principal". */
  roleName: string;
  /** The effective capability set: the role's, or the whole catalogue for an owner. */
  permissions: readonly Permission[];
}
