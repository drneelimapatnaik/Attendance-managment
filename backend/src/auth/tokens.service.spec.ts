/**
 * Refresh-token lifecycle: the stored value is a hash, rotation revokes the old
 * row, reuse of a rotated token kills the whole session family, and expiry is
 * enforced independently of the JWT.
 */
import { JwtService } from '@nestjs/jwt';
import { PrincipalType, type RefreshToken } from '@prisma/client';
import { AppConfig } from '@/config/app-config';
import { LogLevel, NodeEnv } from '@/config/env.validation';
import type { TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { PasswordService } from './password.service';
import type { PortalPrincipal, StaffPrincipal } from './principal';
import { parseDurationSeconds, splitRefreshToken, TokensService } from './tokens.service';

const TENANT = 'tenant-a';

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
  jwt: {
    accessSecret: 'access-secret-that-is-long-enough-for-tests',
    refreshSecret: 'refresh-secret-that-is-long-enough-for-test',
    accessTtl: '15m',
    refreshTtlDays: 30,
    issuer: 'edutrack-api',
    audience: 'edutrack-app',
  },
  otp: { ttlMinutes: 5, maxAttempts: 5, length: 6, resetTokenTtlMinutes: 60, activationTokenTtlHours: 168 },
  throttle: { ttlSeconds: 60, limit: 100 },
  seed: { tenantCode: 'APEX', staffPassword: 'x', studentPassword: 'y', parentPassword: 'z' },
} satisfies AppConfig;

const staff: StaffPrincipal = {
  kind: 'staff',
  id: '33333333-3333-4333-8333-333333333333',
  tenantId: TENANT,
  instituteCode: 'APEX',
  name: 'Dr. Neelima Patnaik',
  roleId: '66666666-6666-4666-8666-666666666666',
  roleKey: 'admin',
  isOwner: true,
  email: 'neelima@apexacademy.in',
};

const parent: PortalPrincipal = {
  kind: 'parent',
  id: '44444444-4444-4444-8444-444444444444',
  tenantId: TENANT,
  instituteCode: 'APEX',
  name: 'Vikram Patel',
  studentIds: ['stu-1', 'stu-2'],
};

/** Minimal stand-in for `prisma.refreshToken`. */
class FakeRefreshTokenTable {
  rows: RefreshToken[] = [];
  private sequence = 0;

  create = async ({ data }: { data: Record<string, unknown>; select?: unknown }) => {
    // Ids must look like UUIDs: the service refuses anything else before querying.
    const id = `55555555-5555-4555-8555-${String(++this.sequence).padStart(12, '0')}`;
    const row = { id, issuedAt: new Date(), revokedAt: null, replacedById: null, ...data } as unknown as RefreshToken;
    this.rows.push(row);
    return row;
  };

  findUnique = async ({ where }: { where: { id: string } }) => this.rows.find((row) => row.id === where.id) ?? null;

  update = async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = this.rows.find((r) => r.id === where.id);
    if (!row) throw new Error('not found');
    Object.assign(row, data);
    return row;
  };

  updateMany = async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const matches = this.rows.filter((row) =>
      Object.entries(where).every(([key, value]) => {
        const actual = (row as unknown as Record<string, unknown>)[key];
        return value === null ? actual === null || actual === undefined : actual === value;
      }),
    );
    matches.forEach((row) => Object.assign(row, data));
    return { count: matches.length };
  };
}

describe('TokensService', () => {
  let table: FakeRefreshTokenTable;
  let tokens: TokensService;
  const jwt = new JwtService({});

  beforeEach(() => {
    table = new FakeRefreshTokenTable();
    const db = { refreshToken: table } as unknown as TenantPrisma;
    tokens = new TokensService(jwt, new PasswordService(), new TenantContextService(), config, db);
  });

  describe('access tokens', () => {
    it('carries the principal, tenant and the role id — not a permission list', async () => {
      const token = await tokens.signAccessToken(staff);
      const claims = jwt.verify<Record<string, unknown>>(token, {
        secret: config.jwt.accessSecret,
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      });
      expect(claims).toMatchObject({
        sub: staff.id,
        typ: 'staff',
        tid: TENANT,
        tcode: 'APEX',
        rid: staff.roleId,
        rkey: 'admin',
        own: true,
      });
      expect(claims.sids).toBeUndefined();
      // Capabilities are resolved from the database per request, never frozen here.
      expect(claims.permissions).toBeUndefined();
    });

    it('carries the linked students for a portal login, and no role', async () => {
      const token = await tokens.signAccessToken(parent);
      const claims = jwt.verify<Record<string, unknown>>(token, {
        secret: config.jwt.accessSecret,
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      });
      expect(claims).toMatchObject({ typ: 'parent', sids: ['stu-1', 'stu-2'] });
      expect(claims.rid).toBeUndefined();
    });

    it('expires in 15 minutes', async () => {
      const token = await tokens.signAccessToken(staff);
      const claims = jwt.decode(token) as { iat: number; exp: number };
      expect(claims.exp - claims.iat).toBe(900);
      expect(tokens.accessTtlSeconds()).toBe(900);
    });
  });

  describe('refresh tokens', () => {
    it('stores a hash, not the token', async () => {
      const issued = await tokens.issueRefreshToken(staff);
      const [id, secret] = splitRefreshToken(issued.value);
      expect(id).toEqual(table.rows[0].id);
      expect(table.rows[0].tokenHash).not.toContain(secret);
      expect(table.rows[0].tokenHash.startsWith('$argon2id$')).toBe(true);
    });

    it('records which principal it belongs to', async () => {
      await tokens.issueRefreshToken(staff);
      await tokens.issueRefreshToken(parent);
      expect(table.rows[0]).toMatchObject({ principalType: PrincipalType.staff, staffId: staff.id, portalAccountId: null });
      expect(table.rows[1]).toMatchObject({ principalType: PrincipalType.parent, portalAccountId: parent.id, staffId: null });
    });

    it('expires 30 days out', async () => {
      const issued = await tokens.issueRefreshToken(staff);
      const days = (issued.expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
    });

    it('accepts a valid token', async () => {
      const issued = await tokens.issueRefreshToken(staff);
      await expect(tokens.consumeRefreshToken(issued.value)).resolves.toMatchObject({ id: issued.id });
    });

    it('rejects a token whose secret has been tampered with', async () => {
      const issued = await tokens.issueRefreshToken(staff);
      const [id] = splitRefreshToken(issued.value);
      await expect(tokens.consumeRefreshToken(`${id}.not-the-secret`)).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
    });

    it('rejects malformed values without hitting the database', async () => {
      const spy = jest.spyOn(table, 'findUnique');
      for (const value of ['', 'nodot', 'garbage.value', '.secret', 'id.']) {
        await expect(tokens.consumeRefreshToken(value)).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
      }
      expect(spy).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      const issued = await tokens.issueRefreshToken(staff);
      table.rows[0].expiresAt = new Date(Date.now() - 1_000);
      await expect(tokens.consumeRefreshToken(issued.value)).rejects.toMatchObject({ response: { code: 'TOKEN_EXPIRED' } });
    });

    it('treats reuse of a rotated token as a leak and revokes every session', async () => {
      const first = await tokens.issueRefreshToken(staff);
      const second = await tokens.issueRefreshToken(staff);
      await tokens.markRotated(first.id, second.id, TENANT);

      await expect(tokens.consumeRefreshToken(first.value)).rejects.toMatchObject({ response: { code: 'REFRESH_TOKEN_REUSED' } });
      // The replacement is revoked too: the whole family is gone.
      expect(table.rows.every((row) => row.revokedAt !== null)).toBe(true);
      await expect(tokens.consumeRefreshToken(second.value)).rejects.toMatchObject({ response: { code: 'REFRESH_TOKEN_REUSED' } });
    });

    it('links a rotated token to its replacement', async () => {
      const first = await tokens.issueRefreshToken(staff);
      const second = await tokens.issueRefreshToken(staff);
      await tokens.markRotated(first.id, second.id, TENANT);
      expect(table.rows[0]).toMatchObject({ replacedById: second.id, revokedAt: expect.any(Date) });
    });

    it('revokes one session on logout and ignores unknown tokens', async () => {
      const issued = await tokens.issueRefreshToken(staff);
      await tokens.revoke(issued.value);
      expect(table.rows[0].revokedAt).not.toBeNull();
      await expect(tokens.revoke('garbage.value')).resolves.toBeUndefined();
    });

    it('revokes every session of one principal after a password change', async () => {
      await tokens.issueRefreshToken(staff);
      await tokens.issueRefreshToken(staff);
      await tokens.issueRefreshToken(parent);

      await tokens.revokeAllForPrincipal(TENANT, 'staff', staff.id);
      expect(table.rows.filter((row) => row.staffId === staff.id).every((row) => row.revokedAt !== null)).toBe(true);
      // The parent's session is untouched.
      expect(table.rows.find((row) => row.portalAccountId === parent.id)?.revokedAt).toBeNull();
    });
  });
});

describe('parseDurationSeconds', () => {
  it('understands the durations we configure', () => {
    expect(parseDurationSeconds('15m')).toBe(900);
    expect(parseDurationSeconds('900s')).toBe(900);
    expect(parseDurationSeconds('2h')).toBe(7_200);
    expect(parseDurationSeconds('1d')).toBe(86_400);
    expect(parseDurationSeconds('900')).toBe(900);
  });

  it('falls back to 15 minutes for nonsense', () => {
    expect(parseDurationSeconds('soon')).toBe(900);
  });
});
