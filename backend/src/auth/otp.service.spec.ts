/**
 * One-time codes: expiry, the attempt cap, single use, and the fact that an older
 * code stops working as soon as a new one is sent.
 *
 * The Prisma client is replaced by a tiny in-memory table — tenant scoping has its
 * own tests (prisma/tenant-scope.spec.ts), so what matters here is the logic.
 */
import { OneTimeCodeChannel, OneTimeCodePurpose, PrincipalType, type OneTimeCode } from '@prisma/client';
import { AppConfig } from '@/config/app-config';
import { NodeEnv, LogLevel } from '@/config/env.validation';
import { BadRequestError, UnauthorizedError } from '@/common/errors/app.error';
import type { TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { OtpService, generateNumericCode, hashLinkToken } from './otp.service';
import { PasswordService } from './password.service';

const TENANT = 'tenant-a';
const PHONE_KEY = '9876543210';

/** Minimal stand-in for `prisma.oneTimeCode` covering exactly what OtpService uses. */
class FakeOneTimeCodeTable {
  rows: OneTimeCode[] = [];
  private sequence = 0;

  create = async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
    const row = {
      id: `otc-${++this.sequence}`,
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      createdAt: new Date(Date.now() + this.sequence), // keeps ordering stable
      staffId: null,
      portalAccountId: null,
      ...data,
    } as unknown as OneTimeCode;
    this.rows.push(row);
    return select ? ({ id: row.id } as unknown as OneTimeCode) : row;
  };

  findFirst = async ({ where }: { where: Record<string, unknown>; orderBy?: unknown }) => {
    const matches = this.rows.filter((row) => this.matches(row, where));
    // The service asks for the newest; mirror that.
    return matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  };

  update = async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error(`No row ${where.id}`);
    Object.assign(row, data);
    return row;
  };

  updateMany = async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const matches = this.rows.filter((row) => this.matches(row, where));
    matches.forEach((row) => Object.assign(row, data));
    return { count: matches.length };
  };

  deleteMany = async () => ({ count: 0 });

  private matches(row: OneTimeCode, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
      const actual = (row as unknown as Record<string, unknown>)[key];
      if (value === null) return actual === null || actual === undefined;
      return actual === value;
    });
  }
}

const config = {
  env: NodeEnv.Test,
  isProduction: false,
  isTest: true,
  port: 3000,
  appUrl: 'http://localhost:3000',
  webAppUrl: 'http://localhost:5173',
  logLevel: LogLevel.Error,
  corsOrigins: [],
  databaseUrl: 'postgresql://unused',
  swaggerEnabled: false,
  jwt: { accessSecret: 'x'.repeat(32), refreshSecret: 'y'.repeat(32), accessTtl: '15m', refreshTtlDays: 30, issuer: 'i', audience: 'a' },
  otp: { ttlMinutes: 5, maxAttempts: 5, length: 6, resetTokenTtlMinutes: 60, activationTokenTtlHours: 168 },
  throttle: { ttlSeconds: 60, limit: 100 },
  seed: { tenantCode: 'APEX', staffPassword: 'x', studentPassword: 'y', parentPassword: 'z' },
} satisfies AppConfig;

describe('OtpService', () => {
  let table: FakeOneTimeCodeTable;
  let service: OtpService;

  const issue = () =>
    service.issueNumericCode({
      tenantId: TENANT,
      purpose: OneTimeCodePurpose.parent_login,
      channel: OneTimeCodeChannel.sms,
      destination: '+91 98765 43210',
      destinationKey: PHONE_KEY,
      principalType: PrincipalType.parent,
      portalAccountId: 'portal-1',
    });

  const verify = (code: string) => service.verifyNumericCode(TENANT, OneTimeCodePurpose.parent_login, PHONE_KEY, code);

  beforeEach(() => {
    table = new FakeOneTimeCodeTable();
    const db = { oneTimeCode: table } as unknown as TenantPrisma;
    service = new OtpService(new PasswordService(), new TenantContextService(), config, db);
  });

  describe('numeric codes', () => {
    it('issues a 6-digit code and stores only its hash', async () => {
      const issued = await issue();
      expect(issued.code).toMatch(/^\d{6}$/);
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0].codeHash).not.toContain(issued.code);
      expect(table.rows[0].codeHash.startsWith('$argon2id$')).toBe(true);
    });

    it('accepts the right code once, then refuses to replay it', async () => {
      const issued = await issue();
      await expect(verify(issued.code)).resolves.toMatchObject({ consumedAt: expect.any(Date) });
      await expect(verify(issued.code)).rejects.toMatchObject({ response: { code: 'OTP_NOT_REQUESTED' } });
    });

    it('rejects a wrong code and counts the attempt', async () => {
      await issue();
      await expect(verify('000000')).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
      expect(table.rows[0].attempts).toBe(1);
    });

    it('locks the code after the configured number of attempts', async () => {
      const issued = await issue();
      for (let attempt = 1; attempt < config.otp.maxAttempts; attempt++) {
        await expect(verify('000000')).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
      }
      // The last allowed attempt reports the lock-out and burns the code…
      await expect(verify('000000')).rejects.toMatchObject({ response: { code: 'OTP_ATTEMPTS_EXCEEDED' } });
      // …so even the correct code no longer works.
      await expect(verify(issued.code)).rejects.toMatchObject({ response: { code: 'OTP_NOT_REQUESTED' } });
    });

    it('rejects an expired code', async () => {
      const issued = await issue();
      table.rows[0].expiresAt = new Date(Date.now() - 1_000);
      await expect(verify(issued.code)).rejects.toMatchObject({ response: { code: 'OTP_EXPIRED' } });
      expect(table.rows[0].consumedAt).not.toBeNull();
    });

    it('expires codes after the configured TTL', async () => {
      const issued = await issue();
      const ttlMs = issued.expiresAt.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(4.5 * 60_000);
      expect(ttlMs).toBeLessThanOrEqual(5 * 60_000);
    });

    it('invalidates the previous code when a new one is sent', async () => {
      const first = await issue();
      await issue();
      expect(table.rows[0].consumedAt).not.toBeNull();
      await expect(verify(first.code)).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
    });

    it('tells the caller when no code was ever requested', async () => {
      await expect(verify('123456')).rejects.toBeInstanceOf(BadRequestError);
      await expect(verify('123456')).rejects.toMatchObject({ response: { code: 'OTP_NOT_REQUESTED' } });
    });
  });

  describe('link tokens', () => {
    const issueLink = () =>
      service.issueLinkToken({
        tenantId: TENANT,
        purpose: OneTimeCodePurpose.password_reset,
        channel: OneTimeCodeChannel.email,
        destination: 'parent@example.com',
        destinationKey: 'parent@example.com',
        principalType: PrincipalType.parent,
        portalAccountId: 'portal-1',
        ttlMinutes: 60,
      });

    it('stores a SHA-256 hash, never the token', async () => {
      const issued = await issueLink();
      expect(issued.token.length).toBeGreaterThan(32);
      expect(table.rows[0].codeHash).toEqual(hashLinkToken(issued.token));
      expect(table.rows[0].codeHash).not.toContain(issued.token);
    });

    it('finds a token without consuming it, so a rejected password keeps the link alive', async () => {
      const issued = await issueLink();
      await service.findLinkToken(OneTimeCodePurpose.password_reset, issued.token);
      expect(table.rows[0].consumedAt).toBeNull();
      await expect(service.findLinkToken(OneTimeCodePurpose.password_reset, issued.token)).resolves.toBeTruthy();
    });

    it('consumes a token exactly once', async () => {
      const issued = await issueLink();
      await service.consumeLinkToken(OneTimeCodePurpose.password_reset, issued.token);
      await expect(service.consumeLinkToken(OneTimeCodePurpose.password_reset, issued.token)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects an expired token with its own code', async () => {
      const issued = await issueLink();
      table.rows[0].expiresAt = new Date(Date.now() - 1_000);
      await expect(service.consumeLinkToken(OneTimeCodePurpose.password_reset, issued.token)).rejects.toMatchObject({
        response: { code: 'TOKEN_EXPIRED' },
      });
    });

    it('rejects a token issued for a different purpose', async () => {
      const issued = await issueLink();
      await expect(service.consumeLinkToken(OneTimeCodePurpose.portal_activation, issued.token)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects obvious rubbish without touching the database', async () => {
      await expect(service.consumeLinkToken(OneTimeCodePurpose.password_reset, 'short')).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });
});

describe('generateNumericCode', () => {
  it('always returns the requested number of digits, leading zeros included', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateNumericCode(6)).toMatch(/^\d{6}$/);
    }
  });

  it('is not obviously biased (200 draws produce many distinct values)', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateNumericCode(6)));
    expect(seen.size).toBeGreaterThan(150);
  });
});
