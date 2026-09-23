/**
 * Token issuing, rotation and revocation.
 *
 * Access token : a short-lived (15 min) JWT carrying the principal and tenant. It
 *                is never stored — its expiry is its revocation.
 * Refresh token: 30 days, one row per session in `refresh_tokens`. The value
 *                handed to the client is "<row id>.<secret>"; only an argon2 hash
 *                of the secret is stored, so a leaked database cannot be replayed.
 *
 * Every refresh *rotates*: the presented token is revoked and linked to its
 * replacement. Presenting an already-rotated token therefore means the value
 * leaked, so the whole session family is revoked and the caller must sign in again.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { PrincipalType, type RefreshToken } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { ErrorCodes, UnauthorizedError } from '@/common/errors/app.error';
import { TENANT_PRISMA, type TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { AccessTokenPayload, isStaff, type Principal } from './principal';
import { PasswordService } from './password.service';

/** What the client receives after any successful sign-in. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  /** Refresh-token expiry as a full ISO 8601 instant. */
  refreshExpiresAt: string;
}

/** Who asked, for the session list and for forensics after a leak. */
export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly context: TenantContextService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
  ) {}

  /** Signs an access token and issues a fresh refresh token for the principal. */
  async issueSession(principal: Principal, meta: SessionMeta = {}): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(principal);
    const refresh = await this.issueRefreshToken(principal, meta);
    return {
      accessToken,
      refreshToken: refresh.value,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds(),
      refreshExpiresAt: refresh.expiresAt.toISOString(),
    };
  }

  async signAccessToken(principal: Principal): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: principal.id,
      typ: principal.kind,
      tid: principal.tenantId,
      tcode: principal.instituteCode,
      name: principal.name,
      ...(isStaff(principal) ? { role: principal.role, email: principal.email } : { sids: principal.studentIds }),
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessTtl,
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
    });
  }

  /** Creates a session row and returns the single value the client must keep. */
  async issueRefreshToken(principal: Principal, meta: SessionMeta = {}): Promise<{ value: string; expiresAt: Date; id: string }> {
    const secret = randomBytes(32).toString('base64url');
    const tokenHash = await this.passwords.hash(secret);
    const expiresAt = new Date(Date.now() + this.config.jwt.refreshTtlDays * 86_400_000);

    const row = await this.context.runWithTenant(principal.tenantId, principal.instituteCode, () =>
      this.db.refreshToken.create({
        data: {
          // Passed explicitly because Prisma's create type requires it; the tenant
          // extension verifies it matches the active tenant.
          tenantId: principal.tenantId,
          principalType: principalTypeOf(principal),
          staffId: isStaff(principal) ? principal.id : null,
          portalAccountId: isStaff(principal) ? null : principal.id,
          tokenHash,
          expiresAt,
          userAgent: meta.userAgent?.slice(0, 255),
          ip: meta.ip?.slice(0, 64),
        },
        select: { id: true },
      }),
    );

    return { value: `${row.id}.${secret}`, expiresAt, id: row.id };
  }

  /**
   * Validates a presented refresh token and marks it used. Returns the row so the
   * caller can rebuild the principal from the database (a role change or a
   * disabled account must take effect at the next refresh, not 30 days later).
   */
  async consumeRefreshToken(raw: string): Promise<RefreshToken> {
    const [id, secret] = splitRefreshToken(raw);
    if (!id || !secret) throw invalidRefresh();

    // The token is all we have — there is no tenant in context yet, so this one
    // lookup is deliberately unscoped. Everything after it runs inside the
    // tenant the row names.
    const row = await this.context.runAsSystem(() => this.db.refreshToken.findUnique({ where: { id } }));
    if (!row) throw invalidRefresh();

    const matches = await this.passwords.verify(row.tokenHash, secret);
    if (!matches) throw invalidRefresh();

    if (row.revokedAt) {
      // Reuse of a rotated token: assume the value leaked and end every session
      // for this principal.
      this.logger.warn(
        { refreshTokenId: row.id, principalType: row.principalType },
        'Refresh token reuse detected — revoking all sessions',
      );
      await this.revokeAllFor(row);
      throw new UnauthorizedError('Your session has ended. Please sign in again.', ErrorCodes.REFRESH_TOKEN_REUSED);
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('Your session has expired. Please sign in again.', ErrorCodes.TOKEN_EXPIRED);
    }

    return row;
  }

  /** Marks the old row rotated and points it at its replacement. */
  async markRotated(oldId: string, replacementId: string, tenantId: string): Promise<void> {
    await this.context.runWithTenant(tenantId, undefined, () =>
      this.db.refreshToken.update({ where: { id: oldId }, data: { revokedAt: new Date(), replacedById: replacementId } }),
    );
  }

  /** Ends one session. Silently succeeds for unknown or already-revoked tokens. */
  async revoke(raw: string): Promise<void> {
    const [id, secret] = splitRefreshToken(raw);
    if (!id || !secret) return;

    const row = await this.context.runAsSystem(() => this.db.refreshToken.findUnique({ where: { id } }));
    if (!row || row.revokedAt) return;
    if (!(await this.passwords.verify(row.tokenHash, secret))) return;

    await this.context.runWithTenant(row.tenantId, undefined, () =>
      this.db.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } }),
    );
  }

  /** Ends every session of the principal that owns `row` (password reset, reuse detection). */
  async revokeAllFor(row: Pick<RefreshToken, 'tenantId' | 'staffId' | 'portalAccountId'>): Promise<void> {
    await this.context.runWithTenant(row.tenantId, undefined, () =>
      this.db.refreshToken.updateMany({
        where: {
          revokedAt: null,
          ...(row.staffId ? { staffId: row.staffId } : { portalAccountId: row.portalAccountId }),
        },
        data: { revokedAt: new Date() },
      }),
    );
  }

  /** Ends every session of one staff member or portal account (after a password change). */
  async revokeAllForPrincipal(tenantId: string, kind: 'staff' | 'portal', id: string): Promise<void> {
    await this.context.runWithTenant(tenantId, undefined, () =>
      this.db.refreshToken.updateMany({
        where: { revokedAt: null, ...(kind === 'staff' ? { staffId: id } : { portalAccountId: id }) },
        data: { revokedAt: new Date() },
      }),
    );
  }

  /** Access-token lifetime in seconds, for the `expiresIn` field. */
  accessTtlSeconds(): number {
    return parseDurationSeconds(this.config.jwt.accessTtl);
  }
}

function principalTypeOf(principal: Principal): PrincipalType {
  if (principal.kind === 'staff') return PrincipalType.staff;
  return principal.kind === 'student' ? PrincipalType.student : PrincipalType.parent;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "<uuid>.<secret>" → [id, secret]; returns empty strings for anything malformed.
 * The id half is checked against the UUID shape here rather than in the database:
 * a `where: { id: 'garbage' }` on a uuid column is a 500, and a malformed token
 * must be an ordinary 401.
 */
export function splitRefreshToken(raw: string): [string, string] {
  if (typeof raw !== 'string') return ['', ''];
  const separator = raw.indexOf('.');
  if (separator <= 0 || separator === raw.length - 1) return ['', ''];
  const id = raw.slice(0, separator);
  if (!UUID_PATTERN.test(id)) return ['', ''];
  return [id, raw.slice(separator + 1)];
}

/** Every refresh failure looks identical from outside. */
function invalidRefresh(): UnauthorizedError {
  return new UnauthorizedError('Your session is no longer valid. Please sign in again.', ErrorCodes.INVALID_TOKEN);
}

/** '15m' | '900s' | '2h' | '1d' → seconds. */
export function parseDurationSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  switch (match[2]) {
    case 'd':
      return value * 86_400;
    case 'h':
      return value * 3_600;
    case 'm':
      return value * 60;
    default:
      return value;
  }
}
