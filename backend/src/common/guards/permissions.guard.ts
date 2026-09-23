/**
 * Permission guard — the server-side half of the role matrix.
 *
 * A route annotated `@Permissions('fees.collect')` requires a *staff* principal
 * whose role grants every listed permission. Student and parent logins never pass:
 * their access is decided by PortalScopeGuard instead.
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '@/common/decorators/auth.decorators';
import { can, Permission } from '@/common/authz/permissions';
import { ErrorCodes, ForbiddenError, UnauthorizedError } from '@/common/errors/app.error';
import { isStaff, type Principal } from '@/auth/principal';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
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

    const missing = required.filter((permission) => !can(principal.role, permission));
    if (missing.length > 0) {
      throw new ForbiddenError('Your role does not allow this action.', ErrorCodes.PERMISSION_DENIED, { required, missing });
    }

    return true;
  }
}
