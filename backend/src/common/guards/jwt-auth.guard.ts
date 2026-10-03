/**
 * Global authentication guard.
 *
 * Every route needs a valid bearer token unless it is marked `@Public()`. On
 * success it does the two things the rest of the request depends on:
 *
 *   1. cross-checks the `X-Tenant` header against the token's tenant claim, so a
 *      stolen token cannot be pointed at another institute;
 *   2. writes the tenant and principal into the AsyncLocalStorage context, which
 *      is what makes the Prisma tenant scoping work.
 */
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '@/common/decorators/auth.decorators';
import { AppError, ErrorCodes, ForbiddenError, UnauthorizedError } from '@/common/errors/app.error';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { JWT_STRATEGY } from '@/auth/strategies/jwt.strategy';
import type { Principal } from '@/auth/principal';

@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY) {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: TenantContextService,
  ) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    // Throws (via handleRequest) when the token is missing, expired or forged.
    await super.canActivate(ctx);

    const request = ctx.switchToHttp().getRequest<Request & { user?: Principal }>();
    const principal = request.user;
    if (!principal) throw new UnauthorizedError();

    // The header is a client convenience; the claim is the truth. If they disagree
    // the client is confused (or malicious) — refuse rather than pick one.
    const headerCode = this.context.instituteCode;
    if (headerCode && headerCode !== principal.instituteCode) {
      throw new ForbiddenError('This session belongs to a different institute.', ErrorCodes.TENANT_MISMATCH);
    }

    this.context.setTenant(principal.tenantId, principal.instituteCode);
    this.context.setPrincipal(principal);
    return true;
  }

  /**
   * Normalises passport's failures into our error shape, and never reveals why a
   * token was rejected beyond expired vs invalid.
   */
  handleRequest<TUser = Principal>(err: unknown, user: TUser, info: unknown): TUser {
    if (err instanceof AppError) throw err;
    if (user) return user;

    const name = (info as Error | undefined)?.name;
    if (name === 'TokenExpiredError') throw new UnauthorizedError('Your session has expired. Sign in again.', ErrorCodes.TOKEN_EXPIRED);
    throw new UnauthorizedError('Authentication required.', ErrorCodes.UNAUTHORIZED);
  }
}
