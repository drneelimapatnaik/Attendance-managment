/**
 * Route metadata decorators for authentication and authorisation.
 *
 *   @Public()                         — skip the JWT guard (login, health, docs)
 *   @Permissions('fees.collect')      — staff must hold every listed permission
 *   @PortalStudentScope('studentId')  — a student/parent may only touch their own students
 *   @CurrentUser()                    — inject the resolved principal into a handler
 */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from '@/common/authz/permissions';
import type { Principal } from '@/auth/principal';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';
export const PORTAL_SCOPE_KEY = 'auth:portalScope';

/** Marks a route as reachable without a bearer token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Requires a staff principal holding all of the listed permissions
 * (see src/common/authz/permissions.ts). Portal logins never pass this guard.
 */
export const Permissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Restricts a student/parent principal to their own linked students. `param` is
 * where the student id is found — a route parameter, query string entry or body
 * field, checked in that order. Staff principals are unaffected (their access is
 * decided by @Permissions).
 */
export const PortalStudentScope = (param = 'studentId') => SetMetadata(PORTAL_SCOPE_KEY, param);

/** Injects the authenticated principal (or one of its fields) into a handler. */
export const CurrentUser = createParamDecorator((field: keyof Principal | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: Principal }>();
  const principal = request.user;
  return field && principal ? principal[field] : principal;
});
