/**
 * End-to-end smoke test: health, staff sign-in, refresh rotation and tenant
 * isolation, against a real database through the real HTTP pipeline (validation
 * pipe, guards, exception filter, versioned routes).
 *
 * It creates and removes its own throwaway tenants, so it neither depends on nor
 * disturbs the demo seed. When no database is reachable the whole suite reports as
 * skipped — see e2e-global-setup.ts.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role, StaffStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { configureApp } from '@/main';

const databaseAvailable = process.env.E2E_DATABASE_AVAILABLE === 'true';
const describeWithDb = databaseAvailable ? describe : describe.skip;

const PASSWORD = 'E2e@Password#26';
const suffix = Date.now().toString(36).toUpperCase().slice(-5);
const TENANT_A = `E2EA${suffix}`;
const TENANT_B = `E2EB${suffix}`;

describeWithDb('EduTrack API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let api: string;

  /** Creates a minimal but valid tenant with one owner account. */
  async function createTenant(code: string, email: string): Promise<void> {
    const passwordHash = await argon2.hash(PASSWORD);
    await prisma.tenant.create({
      data: {
        instituteCode: code,
        name: `${code} Academy`,
        academicYear: '2026-27',
        academicYearStart: new Date('2026-06-01'),
        contactEmail: email,
        contactPhone: '+91 80 0000 0000',
        address: 'Test address',
        settings: { create: { licenseValidUntil: new Date('2027-05-31') } },
        staff: {
          create: {
            name: 'E2E Owner',
            email,
            phone: '+91 90000 00000',
            role: Role.owner,
            title: 'Director',
            status: StaffStatus.Active,
            joinedOn: new Date('2026-06-01'),
            passwordHash,
          },
        },
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get<AppConfig>(APP_CONFIG));
    await app.init();

    api = '/api/v1';
    prisma = new PrismaClient();
    await createTenant(TENANT_A, `owner.a.${suffix}@e2e.test`.toLowerCase());
    await createTenant(TENANT_B, `owner.b.${suffix}@e2e.test`.toLowerCase());
  }, 60_000);

  afterAll(async () => {
    // Deleting the tenant cascades to every row this test created.
    await prisma?.tenant.deleteMany({ where: { instituteCode: { in: [TENANT_A, TENANT_B] } } });
    await prisma?.$disconnect();
    await app?.close();
  }, 30_000);

  describe('GET /health', () => {
    it('reports the process and the database as up', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.info.database.status).toBe('up');
    });

    it('needs no authentication and no tenant header', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200);
    });
  });

  describe('POST /auth/staff/login', () => {
    it('signs in and returns a session the web client understands', async () => {
      const response = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .set('X-Tenant', TENANT_A)
        .send({ instituteCode: TENANT_A, email: `owner.a.${suffix}@e2e.test`, password: PASSWORD })
        .expect(200);

      expect(response.body).toMatchObject({
        tokenType: 'Bearer',
        expiresIn: 900,
        principal: 'staff',
        institute: { code: TENANT_A },
        user: { role: 'owner', status: 'Active' },
      });
      // `token` mirrors `accessToken` for frontend/src/services/auth.ts.
      expect(response.body.token).toBe(response.body.accessToken);
      expect(response.body.permissions).toHaveLength(14);
      // Dates go over the wire in the client's format.
      expect(response.body.user.joinedOn).toBe('2026-06-01');
      // Nothing secret is ever serialised.
      expect(JSON.stringify(response.body)).not.toContain('argon2');
    });

    it('rejects a wrong password with the generic error shape', async () => {
      const response = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_A, email: `owner.a.${suffix}@e2e.test`, password: 'not-the-password' })
        .expect(401);

      expect(response.body).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
      expect(response.body.requestId).toEqual(expect.any(String));
    });

    it('gives the same answer for an account that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_A, email: `nobody.${suffix}@e2e.test`, password: 'not-the-password' })
        .expect(401);

      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects unknown properties in the body', async () => {
      await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_A, email: `owner.a.${suffix}@e2e.test`, password: PASSWORD, role: 'owner' })
        .expect(400);
    });
  });

  describe('tenant isolation', () => {
    it('will not sign a staff member in through another institute code', async () => {
      const response = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_B, email: `owner.a.${suffix}@e2e.test`, password: PASSWORD })
        .expect(401);

      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects a token whose tenant disagrees with the X-Tenant header', async () => {
      const login = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_A, email: `owner.a.${suffix}@e2e.test`, password: PASSWORD })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`${api}/auth/me`)
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .set('X-Tenant', TENANT_B)
        .expect(403);

      expect(response.body.code).toBe('TENANT_MISMATCH');
    });
  });

  describe('session lifecycle', () => {
    let session: { accessToken: string; refreshToken: string };

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_A, email: `owner.a.${suffix}@e2e.test`, password: PASSWORD })
        .expect(200);
      session = response.body;
    });

    it('needs a bearer token for /auth/me', async () => {
      const response = await request(app.getHttpServer()).get(`${api}/auth/me`).expect(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('returns the principal and its permissions', async () => {
      const response = await request(app.getHttpServer())
        .get(`${api}/auth/me`)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('X-Tenant', TENANT_A)
        .expect(200);

      expect(response.body).toMatchObject({ principal: 'staff', institute: { code: TENANT_A } });
      expect(response.body.permissions).toContain('settings.manage');
    });

    it('rotates the refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post(`${api}/auth/refresh`)
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      expect(response.body.refreshToken).not.toBe(session.refreshToken);
      expect(response.body.accessToken).toEqual(expect.any(String));

      // The rotated token is dead, and reusing it ends the whole session family.
      const reuse = await request(app.getHttpServer()).post(`${api}/auth/refresh`).send({ refreshToken: session.refreshToken }).expect(401);
      expect(reuse.body.code).toBe('REFRESH_TOKEN_REUSED');

      const replacement = await request(app.getHttpServer())
        .post(`${api}/auth/refresh`)
        .send({ refreshToken: response.body.refreshToken })
        .expect(401);
      expect(replacement.body.code).toBe('REFRESH_TOKEN_REUSED');
    });

    it('logs out idempotently', async () => {
      const login = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_A, email: `owner.a.${suffix}@e2e.test`, password: PASSWORD })
        .expect(200);

      await request(app.getHttpServer()).post(`${api}/auth/logout`).send({ refreshToken: login.body.refreshToken }).expect(204);
      await request(app.getHttpServer()).post(`${api}/auth/logout`).send({ refreshToken: login.body.refreshToken }).expect(204);
      await request(app.getHttpServer()).post(`${api}/auth/refresh`).send({ refreshToken: login.body.refreshToken }).expect(401);
    });
  });

  describe('password recovery', () => {
    it('always accepts the request, whoever the identifier belongs to', async () => {
      const known = await request(app.getHttpServer())
        .post(`${api}/auth/password/forgot`)
        .send({ instituteCode: TENANT_A, identifier: `owner.a.${suffix}@e2e.test` })
        .expect(202);

      const unknown = await request(app.getHttpServer())
        .post(`${api}/auth/password/forgot`)
        .send({ instituteCode: TENANT_A, identifier: `ghost.${suffix}@e2e.test` })
        .expect(202);

      expect(known.body.accepted).toBe(true);
      expect(unknown.body.message).toBe(known.body.message);
    });
  });
});

if (!databaseAvailable) {
  // Jest fails a file with no tests at all; make the skip visible instead.
  describe('EduTrack API (e2e)', () => {
    it.skip('is skipped because no database is reachable', () => undefined);
  });
}
