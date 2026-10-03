/**
 * Resolves what the signed-in staff member may actually do, from the database.
 *
 * Roles are institute data, so the access token cannot carry the answer: an admin
 * who edits the Accountant role expects the change to bite immediately, not in
 * fifteen minutes when the access token expires. Every permission check therefore
 * reads the staff member's role row — once per request, cached in the
 * AsyncLocalStorage tenant context, so a handler that checks three permissions
 * still costs one query.
 *
 * Two rules are applied here rather than in the guard, because both `GET /auth/me`
 * and `PermissionsGuard` must agree on them:
 *   * an owner holds the whole catalogue, whatever their role row says;
 *   * a role's stored array is sanitised on the way out, so a key that was removed
 *     from the product cannot linger in an old row and grant anything.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ErrorCodes, ForbiddenError, UnauthorizedError } from '@/common/errors/app.error';
import { TENANT_PRISMA, type TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { StaffStatus } from '@prisma/client';
import { isStaff, type Principal, type StaffPrincipal } from '@/auth/principal';
import { effectivePermissions, type Permission } from './permissions';
import type { ResolvedStaffAccess } from './staff-access';

@Injectable()
export class PermissionResolverService {
  constructor(
    private readonly context: TenantContextService,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
  ) {}

  /**
   * Reads the staff member's effective authority. Throws when the account has
   * disappeared or been deactivated since the token was issued — a short-lived
   * token should not outlive the account it names.
   */
  async resolve(principal: StaffPrincipal): Promise<ResolvedStaffAccess> {
    const cached = this.context.store?.staffAccess;
    if (cached && cached.staffId === principal.id) return cached;

    const row = await this.db.staff.findFirst({
      where: { id: principal.id },
      select: {
        id: true,
        isOwner: true,
        status: true,
        roleId: true,
        role: { select: { key: true, name: true, permissions: true } },
      },
    });
    if (!row) throw new UnauthorizedError('This account no longer exists.', ErrorCodes.UNAUTHORIZED);
    if (row.status !== StaffStatus.Active) {
      throw new ForbiddenError('This account has been deactivated. Ask your institute administrator.', ErrorCodes.ACCOUNT_INACTIVE);
    }

    const access: ResolvedStaffAccess = {
      staffId: row.id,
      isOwner: row.isOwner,
      status: row.status,
      roleId: row.roleId,
      roleKey: row.role.key,
      roleName: row.role.name,
      permissions: effectivePermissions(row.isOwner, row.role.permissions),
    };

    // One read per request: the guard, the handler and /auth/me share this.
    const store = this.context.store;
    if (store) store.staffAccess = access;
    return access;
  }

  /** The capability list only — what `GET /auth/me` returns to the client. */
  async permissionsFor(principal: Principal): Promise<readonly Permission[]> {
    // Students and parents are not staff: their access is decided by
    // PortalScopeGuard, and they never hold a staff capability.
    if (!isStaff(principal)) return [];
    return (await this.resolve(principal)).permissions;
  }
}
