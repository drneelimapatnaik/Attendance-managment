/**
 * Permission guard — enforces a route's `@Permissions(...)` list against the
 * caller's role *as it is stored right now*.
 *
 * There is no role → permission matrix in this codebase any more: each institute
 * defines its own roles, so the answer lives in the `roles` table and is read per
 * request (PermissionResolverService caches it in the tenant context). Student and
 * parent logins never pass: their access is decided by PortalScopeGuard instead.
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '@/common/decorators/auth.decorators';
import { PermissionResolverService } from '@/common/authz/permission-resolver.service';
import { missingPermissions, type Permission } from '@/common/authz/permissions';
import { ErrorCodes, ForbiddenError, UnauthorizedError } from '@/common/errors/app.error';
import { isStaff, type Principal } from '@/auth/principal';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: PermissionResolverService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Handler metadata wins over controller metadata, so a controller can set a
    // baseline and one route can tighten it.
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest<Request & { user?: Principal }>();
    const principal = request.user;
    if (!principal) throw new UnauthorizedError();

    if (!isStaff(principal)) {
      throw new ForbiddenError('This area is only available to institute staff.', ErrorCodes.PERMISSION_DENIED);
    }

    // Throws for an account that has been deleted or deactivated since the access
    // token was issued, so a 15-minute token cannot outlive its account.
    const access = await this.resolver.resolve(principal);

    const missing = missingPermissions(access.permissions, required);
    if (missing.length > 0) {
      throw new ForbiddenError('Your role does not allow this action.', ErrorCodes.PERMISSION_DENIED, { required, missing });
    }

    return true;
  }
}
