/**
 * End-to-end smoke test: health, staff sign-in, refresh rotation, tenant isolation,
 * role management and the staff invitation loop — against a real database through
 * the real HTTP pipeline (validation pipe, guards, exception filter, versioned
 * routes).
 *
 * It creates and removes its own throwaway tenants, so it neither depends on nor
 * disturbs the demo seed. When no database is reachable the whole suite reports as
 * skipped — see e2e-global-setup.ts.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken, type ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient, StaffStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { ALL_PERMISSIONS } from '@/common/authz/permissions';
import { SYSTEM_ROLES } from '@/common/authz/system-roles';
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

  /**
   * Creates a minimal but valid tenant: the two system roles every institute is
   * bootstrapped with, plus the owner account that set it up.
   */
  async function createTenant(code: string, email: string): Promise<void> {
    const passwordHash = await argon2.hash(PASSWORD);
    const tenant = await prisma.tenant.create({
      data: {
        instituteCode: code,
        name: `${code} Academy`,
        academicYear: '2026-27',
        academicYearStart: new Date('2026-06-01'),
        contactEmail: email,
        contactPhone: '+91 80 0000 0000',
        address: 'Test address',
        settings: { create: { licenseValidUntil: new Date('2027-05-31') } },
        roles: {
          create: SYSTEM_ROLES.map((role) => ({
            key: role.key,
            name: role.name,
            description: role.description,
            permissions: [...role.permissions],
            isSystem: true,
            isDefault: role.isDefault,
          })),
        },
      },
      include: { roles: true },
    });

    const adminRole = tenant.roles.find((role) => role.key === 'admin')!;
    await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        name: 'E2E Owner',
        email,
        phone: '+91 90000 00000',
        roleId: adminRole.id,
        isOwner: true,
        title: 'Director',
        status: StaffStatus.Active,
        joinedOn: new Date('2026-06-01'),
        passwordHash,
      },
    });
  }

  /**
   * Signs the owner in and returns the bearer token, remembering it: sign-in is
   * rate limited to 10/minute, and the suite needs a token in a dozen places.
   */
  const tokenCache = new Map<string, string>();
  async function ownerToken(code = TENANT_A): Promise<string> {
    const cached = tokenCache.get(code);
    if (cached) return cached;
    const response = await request(app.getHttpServer())
      .post(`${api}/auth/staff/login`)
      .set('X-Tenant', code)
      .send({ instituteCode: code, email: ownerEmail(code), password: PASSWORD })
      .expect(200);
    tokenCache.set(code, response.body.accessToken as string);
    return response.body.accessToken as string;
  }

  const ownerEmail = (code: string) => `owner.${code === TENANT_A ? 'a' : 'b'}.${suffix}@e2e.test`.toLowerCase();

  beforeAll(async () => {
    // Rate limiting is not what this suite tests, and the sign-in budget (10/min per
    // IP) is far below the number of sessions it legitimately needs. Replacing the
    // throttler's *storage* neutralises it without touching the guard chain, so every
    // other guard still runs exactly as in production.
    const permissiveStorage: ThrottlerStorage = {
      increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getStorageToken())
      .useValue(permissiveStorage)
      .compile();
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
        // Roles are data now: the staff object names one, it does not inline an enum.
        user: { roleKey: 'admin', roleName: 'Administrator', isOwner: true, status: 'Active' },
      });
      expect(response.body.user.roleId).toEqual(expect.any(String));
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

  describe('GET /permissions', () => {
    it('returns the whole capability catalogue, grouped for the picker', async () => {
      const token = await ownerToken();
      const response = await request(app.getHttpServer())
        .get(`${api}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant', TENANT_A)
        .expect(200);

      expect(response.body.all).toEqual([...ALL_PERMISSIONS]);
      expect(response.body.groups[0]).toMatchObject({
        area: 'dashboard',
        label: 'Dashboard',
        permissions: [{ key: 'dashboard.view', label: 'View dashboard', description: expect.any(String) }],
      });
      // Every capability appears exactly once across the groups.
      const grouped = response.body.groups.flatMap((group: { permissions: { key: string }[] }) => group.permissions.map((p) => p.key));
      expect(grouped.sort()).toEqual([...ALL_PERMISSIONS].sort());
    });

    it('needs a session', async () => {
      await request(app.getHttpServer()).get(`${api}/permissions`).expect(401);
    });
  });

  describe('roles', () => {
    let token: string;

    beforeAll(async () => {
      token = await ownerToken();
    });

    const authed = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
      request(app.getHttpServer())[method](`${api}${path}`).set('Authorization', `Bearer ${token}`).set('X-Tenant', TENANT_A);

    it('starts with exactly the two built-in roles, with staff counts', async () => {
      const response = await authed('get', '/roles').expect(200);
      expect(response.body.map((role: { key: string }) => role.key)).toEqual(['admin', 'faculty']);
      expect(response.body[0]).toMatchObject({ key: 'admin', name: 'Administrator', isSystem: true, staffCount: 1 });
      expect(response.body[1]).toMatchObject({ key: 'faculty', isSystem: true, isDefault: true, staffCount: 0 });
      expect(response.body[0].permissions).toHaveLength(ALL_PERMISSIONS.length);
    });

    it('creates an institute-defined role, then edits and deletes it', async () => {
      const created = await authed('post', '/roles')
        .send({ name: 'Front Desk', description: 'Admissions desk.', permissions: ['dashboard.view', 'students.manage'] })
        .expect(201);
      expect(created.body).toMatchObject({ key: 'front_desk', name: 'Front Desk', isSystem: false });

      const renamed = await authed('patch', `/roles/${created.body.id}`)
        .send({ name: 'Reception', permissions: ['dashboard.view'] })
        .expect(200);
      expect(renamed.body).toMatchObject({ name: 'Reception', permissions: ['dashboard.view'] });

      await authed('delete', `/roles/${created.body.id}`).expect(200).expect({ deleted: true, reassigned: 0 });
      await authed('get', `/roles/${created.body.id}`).expect(404);
    });

    it('rejects a capability that is not in the catalogue', async () => {
      const response = await authed('post', '/roles')
        .send({ name: 'Wizard', permissions: ['fees.refund'] })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { unknown: ['fees.refund'] } });
    });

    it('refuses the product’s own role keys and a duplicate name', async () => {
      await authed('post', '/roles')
        .send({ name: 'My Admins', key: 'admin', permissions: ['dashboard.view'] })
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('ROLE_KEY_RESERVED'));

      // A name that *derives* a reserved key is caught as a reserved key…
      await authed('post', '/roles')
        .send({ name: 'faculty', permissions: ['dashboard.view'] })
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('ROLE_KEY_RESERVED'));

      // …and a name that clashes with an existing role is reported as the name clash,
      // which is what the person actually typed.
      await authed('post', '/roles')
        .send({ name: 'administrator', permissions: ['dashboard.view'] })
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('ROLE_NAME_TAKEN'));
    });

    it('never deletes a built-in role, and never strips the Administrator role', async () => {
      const roles = await authed('get', '/roles').expect(200);
      const admin = roles.body.find((role: { key: string }) => role.key === 'admin');

      await authed('delete', `/roles/${admin.id}`)
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('ROLE_SYSTEM_PROTECTED'));

      await authed('patch', `/roles/${admin.id}`)
        .send({ permissions: ['dashboard.view'] })
        .expect(409)
        .expect((res) => expect(res.body.code).toBe('ROLE_SYSTEM_PROTECTED'));

      // Renaming it is fine: the label belongs to the institute.
      await authed('patch', `/roles/${admin.id}`).send({ name: 'Principal' }).expect(200);
      await authed('patch', `/roles/${admin.id}`).send({ name: 'Administrator' }).expect(200);
    });

    it('cannot see another institute’s roles', async () => {
      const others = await prisma.role.findMany({ where: { tenant: { instituteCode: TENANT_B } }, select: { id: true } });
      await authed('get', `/roles/${others[0].id}`).expect(404);
    });
  });

  describe('staff', () => {
    let token: string;
    let facultyRoleId: string;
    let adminRoleId: string;

    beforeAll(async () => {
      token = await ownerToken();
      const roles = await request(app.getHttpServer())
        .get(`${api}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant', TENANT_A)
        .expect(200);
      facultyRoleId = roles.body.find((role: { key: string }) => role.key === 'faculty').id;
      adminRoleId = roles.body.find((role: { key: string }) => role.key === 'admin').id;
    });

    const authed = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
      request(app.getHttpServer())[method](`${api}${path}`).set('Authorization', `Bearer ${token}`).set('X-Tenant', TENANT_A);

    it('invites a staff member, who then activates and signs in', async () => {
      // Lower-cased because the DTO normalises it, and the stored value is what comes back.
      const email = `invited.${suffix}@e2e.test`.toLowerCase();
      const invite = await authed('post', '/staff')
        .send({ name: 'E2E Invitee', email, phone: '+91 90000 11111', roleId: facultyRoleId, title: 'Faculty · Physics' })
        .expect(201);

      expect(invite.body.staff).toMatchObject({ status: 'Invited', roleId: facultyRoleId, roleKey: 'faculty', isOwner: false });
      expect(invite.body.devActivationUrl).toEqual(expect.any(String));

      // Signing in before activating fails with the generic credential error: an
      // invited member has no password at all, and the API does not confirm that the
      // address exists.
      const tooEarly = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_A, email, password: PASSWORD })
        .expect(401);
      expect(tooEarly.body.code).toBe('INVALID_CREDENTIALS');

      // The invitation link is the activation token.
      const token1 = new URL(invite.body.devActivationUrl).searchParams.get('token') as string;
      const activated = await request(app.getHttpServer())
        .post(`${api}/auth/portal/activate`)
        .send({ token: token1, password: 'E2eInvitee#2026' })
        .expect(200);
      expect(activated.body).toMatchObject({ principal: 'staff', user: { status: 'Active', roleKey: 'faculty' } });
      // The permission list is the faculty role's, read from the database.
      expect(activated.body.permissions).toEqual([...SYSTEM_ROLES[1].permissions]);

      // And the password now works.
      const signedIn = await request(app.getHttpServer())
        .post(`${api}/auth/staff/login`)
        .send({ instituteCode: TENANT_A, email, password: 'E2eInvitee#2026' })
        .expect(200);
      expect(signedIn.body.user.email).toBe(email);

      // A faculty session may read the roster but not change the team.
      const facultyToken = signedIn.body.accessToken;
      await request(app.getHttpServer())
        .get(`${api}/staff`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .set('X-Tenant', TENANT_A)
        .expect(200);
      const denied = await request(app.getHttpServer())
        .post(`${api}/staff`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .set('X-Tenant', TENANT_A)
        .send({ name: 'Sneaky', email: `sneaky.${suffix}@e2e.test`, roleId: adminRoleId })
        .expect(403);
      expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: { missing: ['faculty.manage'] } });

      // The permission check follows the role row: give Faculty faculty.manage and
      // the same token is allowed through, with no new sign-in.
      await authed('patch', `/roles/${facultyRoleId}`)
        .send({ permissions: [...SYSTEM_ROLES[1].permissions, 'faculty.manage'] })
        .expect(200);
      await request(app.getHttpServer())
        .get(`${api}/staff`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .set('X-Tenant', TENANT_A)
        .expect(200);
      const nowAllowed = await request(app.getHttpServer())
        .post(`${api}/staff`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .set('X-Tenant', TENANT_A)
        .send({ name: 'Second Invitee', email: `second.${suffix}@e2e.test`, roleId: facultyRoleId })
        .expect(201);
      expect(nowAllowed.body.staff.roleKey).toBe('faculty');

      // But they still cannot hand out more than they hold.
      const escalation = await request(app.getHttpServer())
        .post(`${api}/staff`)
        .set('Authorization', `Bearer ${facultyToken}`)
        .set('X-Tenant', TENANT_A)
        .send({ name: 'Deputy', email: `deputy.${suffix}@e2e.test`, roleId: adminRoleId })
        .expect(403);
      expect(escalation.body.code).toBe('PRIVILEGE_ESCALATION');

      // Put the Faculty role back for the rest of the suite.
      await authed('patch', `/roles/${facultyRoleId}`)
        .send({ permissions: [...SYSTEM_ROLES[1].permissions] })
        .expect(200);
    });

    it('filters and paginates the roster', async () => {
      const byRole = await authed('get', '/staff?roleKey=faculty&pageSize=1').expect(200);
      expect(byRole.body).toMatchObject({ page: 1, pageSize: 1 });
      expect(byRole.body.items).toHaveLength(1);
      expect(byRole.body.total).toBeGreaterThanOrEqual(1);

      const search = await authed('get', '/staff?search=E2E%20Owner').expect(200);
      expect(search.body.items.map((member: { isOwner: boolean }) => member.isOwner)).toEqual([true]);
    });

    it('protects the owner from demotion, deactivation and deletion', async () => {
      const owner = (await authed('get', '/staff?search=E2E%20Owner').expect(200)).body.items[0];

      await authed('patch', `/staff/${owner.id}`)
        .send({ roleId: facultyRoleId })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('OWNER_PROTECTED'));

      await authed('patch', `/staff/${owner.id}`)
        .send({ status: 'Inactive' })
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('OWNER_PROTECTED'));

      await authed('delete', `/staff/${owner.id}`)
        .expect(403)
        .expect((res) => expect(res.body.code).toBe('OWNER_PROTECTED'));
    });

    it('will not delete a role its people still hold, until they are reassigned', async () => {
      const role = (
        await authed('post', '/roles')
          .send({ name: 'Counsellor', permissions: ['dashboard.view', 'students.view'] })
          .expect(201)
      ).body;
      const member = (
        await authed('post', '/staff')
          .send({ name: 'E2E Counsellor', email: `counsellor.${suffix}@e2e.test`, roleId: role.id })
          .expect(201)
      ).body.staff;

      const refused = await authed('delete', `/roles/${role.id}`).expect(409);
      expect(refused.body).toMatchObject({ code: 'ROLE_IN_USE', details: { staffCount: 1 } });

      const deleted = await authed('delete', `/roles/${role.id}?reassignTo=${facultyRoleId}`).expect(200);
      expect(deleted.body).toEqual({ deleted: true, reassigned: 1 });

      const moved = await authed('get', `/staff/${member.id}`).expect(200);
      expect(moved.body.roleId).toBe(facultyRoleId);

      await authed('delete', `/staff/${member.id}`).expect(200);
    });

    it('will not leave the institute without an active administrator', async () => {
      // In TENANT_A the owner is the only administrator and is protected outright,
      // so the invariant is exercised in TENANT_B with the owner flag cleared — the
      // shape an institute has if its founding account was never marked as owner.
      await prisma.staff.updateMany({ where: { tenant: { instituteCode: TENANT_B } }, data: { isOwner: false } });
      try {
        const bToken = await ownerToken(TENANT_B);
        const roster = await request(app.getHttpServer())
          .get(`${api}/staff`)
          .set('Authorization', `Bearer ${bToken}`)
          .set('X-Tenant', TENANT_B)
          .expect(200);
        const onlyAdmin = roster.body.items[0];
        expect(onlyAdmin).toMatchObject({ roleKey: 'admin', isOwner: false, status: 'Active' });

        const refused = await request(app.getHttpServer())
          .patch(`${api}/staff/${onlyAdmin.id}`)
          .set('Authorization', `Bearer ${bToken}`)
          .set('X-Tenant', TENANT_B)
          .send({ status: 'Inactive' })
          .expect(409);
        expect(refused.body.code).toBe('ROLE_LAST_ADMIN');

        // Editing your own role is refused before the invariant is even reached.
        const bRoles = await request(app.getHttpServer())
          .get(`${api}/roles`)
          .set('Authorization', `Bearer ${bToken}`)
          .set('X-Tenant', TENANT_B)
          .expect(200);
        const bFaculty = bRoles.body.find((role: { key: string }) => role.key === 'faculty');
        const selfDemotion = await request(app.getHttpServer())
          .patch(`${api}/staff/${onlyAdmin.id}`)
          .set('Authorization', `Bearer ${bToken}`)
          .set('X-Tenant', TENANT_B)
          .send({ roleId: bFaculty.id })
          .expect(403);
        expect(selfDemotion.body.code).toBe('PRIVILEGE_ESCALATION');
      } finally {
        await prisma.staff.updateMany({ where: { tenant: { instituteCode: TENANT_B } }, data: { isOwner: true } });
      }
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
