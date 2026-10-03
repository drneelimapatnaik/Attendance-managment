/**
 * Application errors.
 *
 * Every error the API returns carries a stable machine-readable `code` on top of
 * the HTTP status, so the client can branch on behaviour ("OTP expired") without
 * parsing human text. The wire shape is always:
 *
 *   { statusCode: number, message: string, code: string, details?: unknown }
 *
 * Auth errors deliberately share one vague message ("Invalid credentials") so an
 * attacker cannot use the API to discover which accounts exist.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

/** Stable error codes. Add, never rename — clients may switch on these. */
export const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',

  // tenancy
  TENANT_REQUIRED: 'TENANT_REQUIRED',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  TENANT_CONTEXT_MISSING: 'TENANT_CONTEXT_MISSING',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',

  // auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  ACCOUNT_NOT_ACTIVATED: 'ACCOUNT_NOT_ACTIVATED',
  PASSWORD_NOT_SET: 'PASSWORD_NOT_SET',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  OTP_NOT_REQUESTED: 'OTP_NOT_REQUESTED',

  // authorization
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PORTAL_SCOPE_DENIED: 'PORTAL_SCOPE_DENIED',
  /// Someone tried to hand out more authority than they hold, or to edit their own role.
  PRIVILEGE_ESCALATION: 'PRIVILEGE_ESCALATION',

  // roles
  ROLE_KEY_TAKEN: 'ROLE_KEY_TAKEN',
  ROLE_NAME_TAKEN: 'ROLE_NAME_TAKEN',
  /// `admin`, `faculty`, `student`, `parent` and `owner` are the product's own slugs.
  ROLE_KEY_RESERVED: 'ROLE_KEY_RESERVED',
  /// A built-in role cannot be deleted, re-keyed, or stripped of what it needs.
  ROLE_SYSTEM_PROTECTED: 'ROLE_SYSTEM_PROTECTED',
  /// Still assigned to staff: `details.staffCount` says how many, `?reassignTo=` fixes it.
  ROLE_IN_USE: 'ROLE_IN_USE',
  /// The change would leave the institute with nobody who can manage staff and settings.
  ROLE_LAST_ADMIN: 'ROLE_LAST_ADMIN',

  // staff
  /// The owner cannot be deleted, demoted or deactivated.
  OWNER_PROTECTED: 'OWNER_PROTECTED',
  STAFF_EMAIL_TAKEN: 'STAFF_EMAIL_TAKEN',
  /// Still the assigned faculty of a live batch — reassign the batch first.
  STAFF_TEACHES_ACTIVE_BATCH: 'STAFF_TEACHES_ACTIVE_BATCH',
  /// Has attendance or receipts on file, which must be kept: deactivate instead.
  STAFF_HAS_HISTORY: 'STAFF_HAS_HISTORY',
  STAFF_SELF_DELETE: 'STAFF_SELF_DELETE',
  STAFF_ALREADY_ACTIVE: 'STAFF_ALREADY_ACTIVE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Base class for every error we raise on purpose. */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ statusCode: status, message, code, details }, status);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCodes.VALIDATION_FAILED, details?: unknown) {
    super(code, message, HttpStatus.BAD_REQUEST, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.', code: ErrorCode = ErrorCodes.UNAUTHORIZED) {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource.', code: ErrorCode = ErrorCodes.FORBIDDEN, details?: unknown) {
    super(code, message, HttpStatus.FORBIDDEN, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.', code: ErrorCode = ErrorCodes.NOT_FOUND) {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCodes.CONFLICT, details?: unknown) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

/**
 * A query reached the database without a tenant in context, or with a tenant that
 * does not match the caller's. Both are bugs or attacks, never normal traffic —
 * they are raised by the Prisma extension before the query is sent.
 */
export class MissingTenantContextError extends Error {
  readonly code = ErrorCodes.TENANT_CONTEXT_MISSING;

  constructor(model: string, operation: string) {
    super(`Refusing to run ${model}.${operation}: no tenant in context. Wrap the call in TenantContextService.runWithTenant().`);
    this.name = 'MissingTenantContextError';
  }
}

export class CrossTenantAccessError extends Error {
  readonly code = ErrorCodes.TENANT_MISMATCH;

  constructor(model: string, operation: string, expected: string, received: string) {
    super(`Refusing to run ${model}.${operation}: tenant ${received} does not match the active tenant ${expected}.`);
    this.name = 'CrossTenantAccessError';
  }
}
