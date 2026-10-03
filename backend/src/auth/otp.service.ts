/**
 * One-time secrets: parent login codes and single-use email links.
 *
 * Two shapes, one table (`one_time_codes`):
 *
 *   numeric code — 6 digits, sent by SMS. Low entropy, so it is defended by a
 *                  5-minute expiry, a 5-attempt cap and per-phone/IP throttling.
 *                  Stored as an argon2 hash and looked up by destination.
 *   link token   — 32 random bytes in an activation or password-reset URL. High
 *                  entropy, so a SHA-256 hash is enough and the token itself is
 *                  the lookup key (no user id in the URL to enumerate).
 *
 * Nothing here ever returns a code to a caller except the generator, and nothing
 * logs one.
 */
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { OneTimeCode, OneTimeCodeChannel, OneTimeCodePurpose, PrincipalType } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { BadRequestError, ErrorCodes, UnauthorizedError } from '@/common/errors/app.error';
import { TENANT_PRISMA, type TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { PasswordService } from './password.service';

export interface IssueCodeInput {
  tenantId: string;
  purpose: OneTimeCodePurpose;
  channel: OneTimeCodeChannel;
  /** The phone number or email address as stored (used for delivery). */
  destination: string;
  /** Normalised lookup key: phone digits or lower-cased email. */
  destinationKey: string;
  principalType: PrincipalType;
  staffId?: string | null;
  portalAccountId?: string | null;
}

export interface IssuedCode {
  code: string;
  expiresAt: Date;
  id: string;
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
  id: string;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly passwords: PasswordService,
    private readonly context: TenantContextService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
  ) {}

  /**
   * Issues a numeric code. Any earlier unconsumed code for the same
   * destination/purpose is invalidated first, so only the newest SMS works.
   */
  async issueNumericCode(input: IssueCodeInput): Promise<IssuedCode> {
    const code = generateNumericCode(this.config.otp.length);
    const codeHash = await this.passwords.hash(code);
    const expiresAt = new Date(Date.now() + this.config.otp.ttlMinutes * 60_000);

    const row = await this.context.runWithTenant(input.tenantId, undefined, async () => {
      await this.db.oneTimeCode.updateMany({
        where: { purpose: input.purpose, destinationKey: input.destinationKey, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return this.db.oneTimeCode.create({
        data: {
          // The extension would inject this too; passing it explicitly satisfies
          // Prisma's create types and makes the extension a cross-check.
          tenantId: input.tenantId,
          purpose: input.purpose,
          channel: input.channel,
          destination: input.destination,
          destinationKey: input.destinationKey,
          codeHash,
          principalType: input.principalType,
          staffId: input.staffId ?? null,
          portalAccountId: input.portalAccountId ?? null,
          maxAttempts: this.config.otp.maxAttempts,
          expiresAt,
        },
        select: { id: true },
      });
    });

    return { code, expiresAt, id: row.id };
  }

  /**
   * Checks a numeric code and consumes it on success.
   * Failure modes are distinct on purpose — "expired" and "too many attempts" are
   * things the user needs to be told, and they reveal nothing about who exists
   * (the caller only reaches here for a destination it already named).
   */
  async verifyNumericCode(tenantId: string, purpose: OneTimeCodePurpose, destinationKey: string, code: string): Promise<OneTimeCode> {
    return this.context.runWithTenant(tenantId, undefined, async () => {
      const row = await this.db.oneTimeCode.findFirst({
        where: { purpose, destinationKey, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!row) {
        throw new BadRequestError('Request a new code and try again.', ErrorCodes.OTP_NOT_REQUESTED);
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        await this.db.oneTimeCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
        throw new BadRequestError('That code has expired. Request a new one.', ErrorCodes.OTP_EXPIRED);
      }

      if (row.attempts >= row.maxAttempts) {
        await this.db.oneTimeCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
        throw new BadRequestError('Too many incorrect attempts. Request a new code.', ErrorCodes.OTP_ATTEMPTS_EXCEEDED);
      }

      const matches = await this.passwords.verify(row.codeHash, code.trim());
      if (!matches) {
        const attempts = row.attempts + 1;
        // The last allowed attempt also burns the code, so an attacker cannot
        // keep a live code alive by stopping one short of the cap.
        await this.db.oneTimeCode.update({
          where: { id: row.id },
          data: { attempts, ...(attempts >= row.maxAttempts ? { consumedAt: new Date() } : {}) },
        });
        if (attempts >= row.maxAttempts) {
          throw new BadRequestError('Too many incorrect attempts. Request a new code.', ErrorCodes.OTP_ATTEMPTS_EXCEEDED);
        }
        throw new BadRequestError('That code is not correct.', ErrorCodes.OTP_INVALID);
      }

      return this.db.oneTimeCode.update({ where: { id: row.id }, data: { consumedAt: new Date(), attempts: row.attempts + 1 } });
    });
  }

  /** Issues a single-use link token (activation or password reset). */
  async issueLinkToken(input: IssueCodeInput & { ttlMinutes: number }): Promise<IssuedToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000);

    const row = await this.context.runWithTenant(input.tenantId, undefined, async () => {
      // Only the newest link for a purpose stays valid.
      await this.db.oneTimeCode.updateMany({
        where: { purpose: input.purpose, destinationKey: input.destinationKey, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return this.db.oneTimeCode.create({
        data: {
          tenantId: input.tenantId,
          purpose: input.purpose,
          channel: input.channel,
          destination: input.destination,
          destinationKey: input.destinationKey,
          codeHash: hashLinkToken(token),
          principalType: input.principalType,
          staffId: input.staffId ?? null,
          portalAccountId: input.portalAccountId ?? null,
          maxAttempts: 1,
          expiresAt,
        },
        select: { id: true },
      });
    });

    return { token, expiresAt, id: row.id };
  }

  /**
   * Validates a link token *without* consuming it. The lookup is unscoped because
   * the token is the only thing the caller has — the row it finds names the tenant
   * everything else then runs in.
   *
   * Finding and consuming are separate so a rejected password (too weak) does not
   * burn the user's one invitation link. Callers validate everything first, then
   * call `markLinkTokenConsumed`.
   */
  async findLinkToken(purpose: OneTimeCodePurpose, token: string): Promise<OneTimeCode> {
    if (typeof token !== 'string' || token.length < 16) throw invalidLink();

    const row = await this.context.runAsSystem(() => this.db.oneTimeCode.findFirst({ where: { purpose, codeHash: hashLinkToken(token) } }));
    if (!row) throw invalidLink();
    if (row.consumedAt) throw invalidLink();
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('That link has expired. Request a new one.', ErrorCodes.TOKEN_EXPIRED);
    }
    return row;
  }

  /** Marks a link token used, so it cannot be replayed. */
  async markLinkTokenConsumed(row: Pick<OneTimeCode, 'id' | 'tenantId'>): Promise<void> {
    await this.context.runWithTenant(row.tenantId, undefined, () =>
      this.db.oneTimeCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
    );
  }

  /** Convenience for callers with nothing left to validate. */
  async consumeLinkToken(purpose: OneTimeCodePurpose, token: string): Promise<OneTimeCode> {
    const row = await this.findLinkToken(purpose, token);
    await this.markLinkTokenConsumed(row);
    return row;
  }

  /** Housekeeping: drop codes that expired more than a day ago. */
  async purgeExpired(tenantId: string): Promise<number> {
    const cutoff = new Date(Date.now() - 86_400_000);
    const result = await this.context.runWithTenant(tenantId, undefined, () =>
      this.db.oneTimeCode.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    );
    return result.count;
  }
}

/** Cryptographically uniform N-digit code, leading zeros kept. */
export function generateNumericCode(length: number): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, '0');
}

/** Link tokens are high-entropy already: a fast hash is enough and keeps lookup O(1). */
export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function invalidLink(): UnauthorizedError {
  return new UnauthorizedError('That link is no longer valid. Request a new one.', ErrorCodes.INVALID_TOKEN);
}
