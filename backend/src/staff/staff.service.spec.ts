/**
 * Staff management rules: inviting, changing a role, and the protections that stop
 * an institute locking itself out or losing its history.
 *
 * The database is the in-memory fake in test/fakes; the invitation machinery
 * (OtpService, MailSender) is stubbed so the test can assert *that* a single-use
 * link was minted and emailed, without hashing or sending anything.
 */
import { BatchStatus, StaffStatus } from '@prisma/client';
import { PermissionResolverService } from '@/common/authz/permission-resolver.service';
import type { AppConfig } from '@/config/app-config';
import type { MailMessage, MailSender } from '@/auth/notifications/mail-sender';
import type { OtpService } from '@/auth/otp.service';
import { RolesService } from '@/roles/roles.service';
import { buildInstitute, ROLE_IDS, STAFF_IDS, TENANT_ID, type FakeInstitute } from '../../test/fakes/institute';
import { StaffService } from './staff.service';

/** Only the fields StaffService reads. */
const config = {
  isProduction: false,
  webAppUrl: 'http://localhost:5173',
  otp: { activationTokenTtlHours: 168 },
} as unknown as AppConfig;

describe('StaffService', () => {
  let institute: FakeInstitute;
  let staff: StaffService;
  let sent: MailMessage[];
  let issued: { staffId?: string | null; ttlMinutes: number }[];

  beforeEach(() => {
    institute = buildInstitute();
    sent = [];
    issued = [];

    const resolver = new PermissionResolverService(institute.context, institute.db);
    const roles = new RolesService(institute.context, resolver, institute.db);

    const otp = {
      issueLinkToken: async (input: { staffId?: string | null; ttlMinutes: number }) => {
        issued.push(input);
        return { token: 'fake-activation-token', expiresAt: new Date('2026-10-06T10:15:00.000Z'), id: 'code-1' };
      },
    } as unknown as OtpService;

    const mail: MailSender = { send: async (message) => void sent.push(message) };

    staff = new StaffService(institute.context, roles, otp, config, institute.db, mail);
  });

  const asAdmin = () => institute.principal(STAFF_IDS.admin);
  const asOwner = () => institute.principal(STAFF_IDS.owner);
  const asAccountant = () => institute.principal(STAFF_IDS.accounts);
  const asTeacher = () => institute.principal(STAFF_IDS.teacher);

  // ------------------------------------------------------------------ reads

  describe('list', () => {
    it('returns the roster with each member’s role id, slug and label', async () => {
      const page = await institute.withTenant(() => staff.list({}));
      expect(page).toMatchObject({ total: 4, page: 1, pageSize: 25 });
      expect(page.items.map((member) => member.name)).toEqual(['Dr. Neelima Patnaik', 'Ms. Kavya Nair', 'Ms. Pooja Menon', 'Prof. K. Sen']);
      const owner = page.items.find((member) => member.isOwner);
      expect(owner).toMatchObject({ roleId: ROLE_IDS.admin, roleKey: 'admin', roleName: 'Administrator' });
    });

    it('filters by role id, by role slug and by status', async () => {
      await expect(institute.withTenant(() => staff.list({ roleId: ROLE_IDS.admin }))).resolves.toMatchObject({ total: 2 });
      await expect(institute.withTenant(() => staff.list({ roleKey: 'accountant' }))).resolves.toMatchObject({ total: 1 });
      await expect(institute.withTenant(() => staff.list({ status: StaffStatus.Invited }))).resolves.toMatchObject({ total: 0 });
    });

    it('searches name, email, phone and title case-insensitively', async () => {
      const page = await institute.withTenant(() => staff.list({ search: 'KAVYA' }));
      expect(page.items.map((member) => member.email)).toEqual(['accounts@apex.in']);
    });

    it('paginates', async () => {
      const page = await institute.withTenant(() => staff.list({ page: 2, pageSize: 3 }));
      expect(page).toMatchObject({ total: 4, page: 2, pageSize: 3 });
      expect(page.items).toHaveLength(1);
    });
  });

  // ----------------------------------------------------------------- invite

  describe('invite', () => {
    it('creates an Invited member with no password and emails a single-use link', async () => {
      const result = await institute.withTenant(() =>
        staff.invite(asAdmin(), { name: 'Mr. Rohit Verma', email: 'frontdesk@apex.in', roleId: ROLE_IDS.faculty, title: 'Coordinator' }),
      );

      expect(result.staff).toMatchObject({ status: StaffStatus.Invited, roleId: ROLE_IDS.faculty, roleKey: 'faculty', isOwner: false });
      expect(institute.staff.rows.find((row) => row.email === 'frontdesk@apex.in')?.passwordHash).toBeNull();

      // A 7-day activation token, addressed to the new member.
      expect(issued).toEqual([expect.objectContaining({ staffId: result.staff.id, ttlMinutes: 168 * 60 })]);
      expect(sent[0]).toMatchObject({ to: 'frontdesk@apex.in', purpose: 'staff-invitation' });
      expect(sent[0].text).toContain('http://localhost:5173/activate?token=fake-activation-token');
      // Outside production the link comes back too, so the flow can be finished locally.
      expect(result.devActivationUrl).toContain('fake-activation-token');
      expect(result.invitationExpiresAt).toBe('2026-10-06T10:15:00.000Z');
    });

    it('records the subjects they teach', async () => {
      const subjectIds = institute.subjects.rows.map((subject) => String(subject.id));
      const result = await institute.withTenant(() =>
        staff.invite(asAdmin(), { name: 'New Teacher', email: 'new@apex.in', roleId: ROLE_IDS.faculty, subjectIds }),
      );
      expect(result.staff.subjectIds).toEqual(subjectIds);
      expect(institute.staffSubjects.rows.every((link) => link.tenantId === TENANT_ID)).toBe(true);
    });

    it('rejects an unknown subject', async () => {
      await expect(
        institute.withTenant(() =>
          staff.invite(asAdmin(), {
            name: 'New Teacher',
            email: 'new@apex.in',
            roleId: ROLE_IDS.faculty,
            subjectIds: ['99999999-9999-4999-8999-999999999999'],
          }),
        ),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    });

    it('refuses an email somebody already uses', async () => {
      await expect(
        institute.withTenant(() => staff.invite(asAdmin(), { name: 'Clash', email: 'KSEN@apex.in', roleId: ROLE_IDS.faculty })),
      ).rejects.toMatchObject({ response: { code: 'STAFF_EMAIL_TAKEN' } });
    });

    it('treats an unknown role as not found', async () => {
      await expect(
        institute.withTenant(() =>
          staff.invite(asAdmin(), { name: 'Nobody', email: 'nobody@apex.in', roleId: '99999999-9999-4999-8999-999999999999' }),
        ),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    });

    it('stops a non-owner inviting somebody into a stronger role', async () => {
      await expect(
        institute.withTenant(() => staff.invite(asAccountant(), { name: 'Deputy', email: 'deputy@apex.in', roleId: ROLE_IDS.admin })),
      ).rejects.toMatchObject({ response: { code: 'PRIVILEGE_ESCALATION' } });
    });
  });

  describe('resendInvite', () => {
    it('issues a fresh link for somebody still invited', async () => {
      const invited = await institute.withTenant(() =>
        staff.invite(asAdmin(), { name: 'Pending', email: 'pending@apex.in', roleId: ROLE_IDS.faculty }),
      );
      const again = await institute.withTenant(() => staff.resendInvite(invited.staff.id));
      expect(again.staff.id).toBe(invited.staff.id);
      expect(sent).toHaveLength(2);
    });

    it('refuses somebody who has already set a password', async () => {
      await expect(institute.withTenant(() => staff.resendInvite(STAFF_IDS.teacher))).rejects.toMatchObject({
        response: { code: 'STAFF_ALREADY_ACTIVE' },
      });
    });
  });

  // ----------------------------------------------------------------- update

  describe('update', () => {
    it('changes a role', async () => {
      const updated = await institute.withTenant(() => staff.update(asAdmin(), STAFF_IDS.teacher, { roleId: ROLE_IDS.accountant }));
      expect(updated).toMatchObject({ roleId: ROLE_IDS.accountant, roleKey: 'accountant', roleName: 'Accountant' });
    });

    it('replaces the subject list', async () => {
      const subjectIds = [String(institute.subjects.rows[0].id)];
      const updated = await institute.withTenant(() => staff.update(asAdmin(), STAFF_IDS.teacher, { subjectIds }));
      expect(updated.subjectIds).toEqual(subjectIds);
      const emptied = await institute.withTenant(() => staff.update(asAdmin(), STAFF_IDS.teacher, { subjectIds: [] }));
      expect(emptied.subjectIds).toEqual([]);
    });

    it('refuses an email somebody else uses', async () => {
      await expect(
        institute.withTenant(() => staff.update(asAdmin(), STAFF_IDS.teacher, { email: 'accounts@apex.in' })),
      ).rejects.toMatchObject({ response: { code: 'STAFF_EMAIL_TAKEN' } });
    });

    it('stops a non-owner changing their own role', async () => {
      await expect(
        institute.withTenant(() => staff.update(asAccountant(), STAFF_IDS.accounts, { roleId: ROLE_IDS.admin })),
      ).rejects.toMatchObject({ response: { code: 'PRIVILEGE_ESCALATION' } });
    });

    it('lets a non-owner change their own name and title', async () => {
      const updated = await institute.withTenant(() => staff.update(asAccountant(), STAFF_IDS.accounts, { title: 'Senior Accountant' }));
      expect(updated.title).toBe('Senior Accountant');
    });

    it('protects the owner from demotion and deactivation', async () => {
      await expect(
        institute.withTenant(() => staff.update(asOwner(), STAFF_IDS.owner, { roleId: ROLE_IDS.faculty })),
      ).rejects.toMatchObject({ response: { code: 'OWNER_PROTECTED' } });
      await expect(
        institute.withTenant(() => staff.update(asOwner(), STAFF_IDS.owner, { status: StaffStatus.Inactive })),
      ).rejects.toMatchObject({ response: { code: 'OWNER_PROTECTED' } });
    });

    it('will not activate somebody who has not accepted their invitation', async () => {
      const invited = await institute.withTenant(() =>
        staff.invite(asAdmin(), { name: 'Pending', email: 'pending@apex.in', roleId: ROLE_IDS.faculty }),
      );
      await expect(
        institute.withTenant(() => staff.update(asAdmin(), invited.staff.id, { status: StaffStatus.Active })),
      ).rejects.toMatchObject({ response: { code: 'ACCOUNT_NOT_ACTIVATED' } });
    });

    describe('the last administrator', () => {
      /**
       * Leaves exactly one *active* administrator. An active owner always counts, so
       * the owner is deactivated directly in the fake (the API itself refuses that —
       * see "protects the owner"), and the calls are made by the teacher, who is not
       * standing on the role being changed.
       */
      const leaveOneAdmin = () => {
        institute.staff.rows.find((member) => member.id === STAFF_IDS.owner)!.status = StaffStatus.Inactive;
      };

      it('refuses to move them to a lesser role', async () => {
        leaveOneAdmin();
        await expect(
          institute.withTenant(() => staff.update(asTeacher(), STAFF_IDS.admin, { roleId: ROLE_IDS.faculty })),
        ).rejects.toMatchObject({ response: { code: 'ROLE_LAST_ADMIN' } });
      });

      it('refuses to deactivate them', async () => {
        leaveOneAdmin();
        await expect(
          institute.withTenant(() => staff.update(asTeacher(), STAFF_IDS.admin, { status: StaffStatus.Inactive })),
        ).rejects.toMatchObject({ response: { code: 'ROLE_LAST_ADMIN' } });
      });

      it('allows it once somebody else can administer the institute', async () => {
        leaveOneAdmin();
        await institute.withTenant(() => staff.update(asAdmin(), STAFF_IDS.teacher, { roleId: ROLE_IDS.admin }));
        await expect(
          institute.withTenant(() => staff.update(asTeacher(), STAFF_IDS.admin, { status: StaffStatus.Inactive })),
        ).resolves.toMatchObject({ status: StaffStatus.Inactive });
      });
    });
  });

  // ----------------------------------------------------------------- delete

  describe('remove', () => {
    it('removes somebody with no history', async () => {
      await expect(institute.withTenant(() => staff.remove(asAdmin(), STAFF_IDS.teacher))).resolves.toEqual({ deleted: true });
      expect(institute.staff.rows.some((member) => member.id === STAFF_IDS.teacher)).toBe(false);
    });

    it('protects the owner', async () => {
      await expect(institute.withTenant(() => staff.remove(asAdmin(), STAFF_IDS.owner))).rejects.toMatchObject({
        response: { code: 'OWNER_PROTECTED' },
      });
    });

    it('will not let you remove yourself', async () => {
      await expect(institute.withTenant(() => staff.remove(asAdmin(), STAFF_IDS.admin))).rejects.toMatchObject({
        response: { code: 'STAFF_SELF_DELETE' },
      });
    });

    it('refuses while they still teach a live batch, and names the batches', async () => {
      institute.batches.rows.push({
        id: 'batch-1',
        tenantId: TENANT_ID,
        code: 'M2',
        facultyId: STAFF_IDS.teacher,
        status: BatchStatus.Active,
      });
      await expect(institute.withTenant(() => staff.remove(asAdmin(), STAFF_IDS.teacher))).rejects.toMatchObject({
        response: { code: 'STAFF_TEACHES_ACTIVE_BATCH', details: { batches: [{ code: 'M2' }] } },
      });
    });

    it('refuses while attendance registers or receipts name them', async () => {
      institute.sessions.rows.push({ id: 'session-1', tenantId: TENANT_ID, facultyId: STAFF_IDS.teacher, markedById: STAFF_IDS.teacher });
      await expect(institute.withTenant(() => staff.remove(asAdmin(), STAFF_IDS.teacher))).rejects.toMatchObject({
        response: { code: 'STAFF_HAS_HISTORY' },
      });
    });

    it('refuses to remove the last active administrator', async () => {
      // The owner is inactive, so only the second administrator is left.
      institute.staff.rows.find((member) => member.id === STAFF_IDS.owner)!.status = StaffStatus.Inactive;
      await expect(institute.withTenant(() => staff.remove(asTeacher(), STAFF_IDS.admin))).rejects.toMatchObject({
        response: { code: 'ROLE_LAST_ADMIN' },
      });
    });
  });
});
