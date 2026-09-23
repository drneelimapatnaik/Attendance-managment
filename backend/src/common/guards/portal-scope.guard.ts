/**
 * Portal scope guard — keeps students and parents inside their own records.
 *
 * A route annotated `@PortalStudentScope('studentId')` names where the student id
 * is found (route param, query string or body). For a student or parent principal
 * the id must be one of the students linked to their login, so a parent can read
 * their two children and nobody else's. Staff principals pass through: their
 * access was already decided by @Permissions.
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PORTAL_SCOPE_KEY } from '@/common/decorators/auth.decorators';
import { BadRequestError, ErrorCodes, ForbiddenError, UnauthorizedError } from '@/common/errors/app.error';
import { isPortal, isStaff, type Principal } from '@/auth/principal';

@Injectable()
export class PortalScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const param = this.reflector.getAllAndOverride<string | undefined>(PORTAL_SCOPE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!param) return true;

    const request = ctx.switchToHttp().getRequest<Request & { user?: Principal }>();
    const principal = request.user;
    if (!principal) throw new UnauthorizedError();
    if (isStaff(principal)) return true;
    if (!isPortal(principal)) throw new ForbiddenError();

    const studentId = readStudentId(request, param);
    if (!studentId) {
      // A portal principal without a target student would otherwise fall through
      // to a handler that lists everything — refuse instead.
      throw new BadRequestError(`This request must name a student (${param}).`, ErrorCodes.PORTAL_SCOPE_DENIED);
    }

    assertPortalCanAccessStudent(principal, studentId);
    return true;
  }
}

/** Looks for the student id in params → query → body, in that order. */
function readStudentId(request: Request, param: string): string | undefined {
  const params = request.params as Record<string, unknown> | undefined;
  const query = request.query as Record<string, unknown> | undefined;
  const body = request.body as Record<string, unknown> | undefined;
  const candidate = params?.[param] ?? query?.[param] ?? body?.[param];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

/**
 * Reusable check for services that resolve the student themselves (for example a
 * report endpoint that takes a batch and then fans out to students).
 */
export function assertPortalCanAccessStudent(principal: Principal, studentId: string): void {
  if (isStaff(principal)) return;
  if (!isPortal(principal) || !principal.studentIds.includes(studentId)) {
    throw new ForbiddenError('You can only view your own records.', ErrorCodes.PORTAL_SCOPE_DENIED);
  }
}
