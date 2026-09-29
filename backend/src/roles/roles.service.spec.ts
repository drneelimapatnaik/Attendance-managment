/**
 * Role management rules.
 *
 * Every institute defines its own roles, so almost everything here is about the
 * guard rails around that freedom: the two built-in roles stay usable, the
 * institute never loses its last administrator, a role in use cannot vanish under
 * its people, and nobody hands themselves more authority than they have.
 *
 * The database is the small in-memory fake in test/fakes — the rules, not Prisma,
 * are what these tests are about.
 */
import { StaffStatus } from '@prisma/client';
import { PermissionResolverService } from '@/common/authz/permission-resolver.service';
import { ALL_PERMISSIONS } from '@/common/authz/permissions';
import { buildInstitute, ROLE_IDS, STAFF_IDS, type FakeInstitute } from '../../test/fakes/institute';
import { RolesService } from './roles.service';

describe('RolesService', () => {
  let institute: FakeInstitute;
  let roles: RolesService;

  beforeEach(() => {
    institute = buildInstitute();
    roles = new RolesService(institute.context, new PermissionResolverService(institute.context, institute.db), institute.db);
  });

  /** Most calls are made by the second administrator, not the owner. */
  const asAdmin = () => institute.principal(STAFF_IDS.admin);
  const asOwner = () => institute.principal(STAFF_IDS.owner);
  const asAccountant = () => institute.principal(STAFF_IDS.accounts);
  const asTeacher = () => institute.principal(STAFF_IDS.teacher);

  /**
   * Rearranges the institute so exactly one *active* person can administer it, and
   * does it through a role the institute defined rather than the built-in `admin`
   * role — otherwise ROLE_SYSTEM_PROTECTED would refuse the change first and the
   * last-admin rule would never be reached.
   */
  const leaveOneAdmin = (): void => {
    const custom = institute.roles.rows.find((role) => role.id === ROLE_IDS.accountant)!;
    custom.permissions = ['dashboard.view', 'faculty.manage', 'settings.manage'];
    institute.staff.rows.find((member) => member.id === STAFF_IDS.admin)!.roleId = ROLE_IDS.accountant;
    institute.staff.rows.find((member) => member.id === STAFF_IDS.accounts)!.roleId = ROLE_IDS.faculty;
    // An inactive owner does not count towards the invariant.
    institute.staff.rows.find((member) => member.id === STAFF_IDS.owner)!.status = StaffStatus.Inactive;
  };

  const reactivateOwner = (): void => {
    institute.staff.rows.find((member) => member.id === STAFF_IDS.owner)!.status = StaffStatus.Active;
  };

  // ------------------------------------------------------------------ reads

  describe('list', () => {
    it('returns system roles first, with the number of people holding each', async () => {
      const list = await institute.withTenant(() => roles.list());
      expect(list.map((role) => role.key)).toEqual(['admin', 'faculty', 'accountant']);
      expect(list.map((role) => role.staffCount)).toEqual([2, 1, 1]);
      expect(list[0]).toMatchObject({ isSystem: true, name: 'Administrator' });
      expect(list[2]).toMatchObject({ isSystem: false, name: 'Accountant' });
    });

    it('recreates a missing built-in role, so the four role kinds always exist', async () => {
      institute.roles.rows = institute.roles.rows.filter((role) => role.key !== 'faculty');
      const list = await institute.withTenant(() => roles.list());
      expect(list.map((role) => role.key)).toContain('faculty');
      expect(list.find((role) => role.key === 'faculty')).toMatchObject({ isSystem: true, isDefault: true });
    });

    it('leaves a renamed built-in role alone', async () => {
      await institute.withTenant(() => roles.update(asOwner(), ROLE_IDS.admin, { name: 'Principal' }));
      await institute.withTenant(() => roles.ensureSystemRoles());
      const list = await institute.withTenant(() => roles.list());
      expect(list.find((role) => role.key === 'admin')?.name).toBe('Principal');
      expect(list.filter((role) => role.key === 'admin')).toHaveLength(1);
    });
  });

  // ----------------------------------------------------------------- create

  describe('create', () => {
    it('creates an institute-defined role and derives its key from the name', async () => {
      const role = await institute.withTenant(() =>
        roles.create(asAdmin(), { name: 'Front Desk', permissions: ['dashboard.view', 'students.manage'] }),
      );
      expect(role).toMatchObject({ key: 'front_desk', name: 'Front Desk', isSystem: false, isDefault: false });
      expect(role.permissions).toEqual(['dashboard.view', 'students.manage']);
    });

    it('rejects a capability that is not in the catalogue', async () => {
      await expect(
        institute.withTenant(() => roles.create(asAdmin(), { name: 'Wizard', permissions: ['dashboard.view', 'fees.refund'] })),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED', details: { unknown: ['fees.refund'] } } });
    });

    it('refuses the product’s own slugs', async () => {
      for (const key of ['admin', 'faculty', 'student', 'parent', 'owner']) {
        await expect(
          institute.withTenant(() => roles.create(asAdmin(), { name: `Custom ${key}`, key, permissions: ['dashboard.view'] })),
        ).rejects.toMatchObject({ response: { code: 'ROLE_KEY_RESERVED' } });
      }
    });

    it('refuses a name another role already uses, whatever its case', async () => {
      await expect(
        institute.withTenant(() => roles.create(asAdmin(), { name: 'accountant', permissions: ['dashboard.view'] })),
      ).rejects.toMatchObject({ response: { code: 'ROLE_NAME_TAKEN' } });
    });

    it('asks for an explicit key when the name yields none', async () => {
      await expect(
        institute.withTenant(() => roles.create(asAdmin(), { name: '!!!', permissions: ['dashboard.view'] })),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    });

    it('moves the default flag rather than having two defaults', async () => {
      await institute.withTenant(() => roles.create(asAdmin(), { name: 'Counsellor', permissions: ['dashboard.view'], isDefault: true }));
      const list = await institute.withTenant(() => roles.list());
      expect(list.filter((role) => role.isDefault).map((role) => role.key)).toEqual(['counsellor']);
    });

    describe('privilege escalation', () => {
      it('refuses a non-owner granting a capability they do not hold', async () => {
        // The accountant holds neither settings.manage nor faculty.manage.
        await expect(
          institute.withTenant(() => roles.create(asAccountant(), { name: 'Super', permissions: ['settings.manage'] })),
        ).rejects.toMatchObject({ response: { code: 'PRIVILEGE_ESCALATION', details: { escalated: ['settings.manage'] } } });
      });

      it('allows a non-owner to grant exactly what they hold', async () => {
        const role = await institute.withTenant(() =>
          roles.create(asAccountant(), { name: 'Cashier', permissions: ['dashboard.view', 'fees.collect'] }),
        );
        expect(role.permissions).toEqual(['dashboard.view', 'fees.collect']);
      });

      it('lets the owner grant anything', async () => {
        const role = await institute.withTenant(() => roles.create(asOwner(), { name: 'Deputy', permissions: [...ALL_PERMISSIONS] }));
        expect(role.permissions).toHaveLength(ALL_PERMISSIONS.length);
      });
    });
  });

  // ----------------------------------------------------------------- update

  describe('update', () => {
    it('renames a role, including a built-in one', async () => {
      const role = await institute.withTenant(() => roles.update(asAdmin(), ROLE_IDS.faculty, { name: 'Teaching Staff' }));
      expect(role).toMatchObject({ key: 'faculty', name: 'Teaching Staff', isSystem: true });
    });

    it('refuses a rename that clashes with another role', async () => {
      await expect(institute.withTenant(() => roles.update(asAdmin(), ROLE_IDS.faculty, { name: 'Accountant' }))).rejects.toMatchObject({
        response: { code: 'ROLE_NAME_TAKEN' },
      });
    });

    it('never lets the Administrator role lose staff or settings management', async () => {
      await expect(
        institute.withTenant(() => roles.update(asOwner(), ROLE_IDS.admin, { permissions: ['dashboard.view', 'faculty.manage'] })),
      ).rejects.toMatchObject({ response: { code: 'ROLE_SYSTEM_PROTECTED', details: { stripped: ['settings.manage'] } } });
    });

    it('does let the Administrator role drop capabilities that are not load-bearing', async () => {
      const role = await institute.withTenant(() =>
        roles.update(asOwner(), ROLE_IDS.admin, { permissions: ['dashboard.view', 'faculty.manage', 'settings.manage'] }),
      );
      expect(role.permissions).toEqual(['dashboard.view', 'faculty.manage', 'settings.manage']);
    });

    it('stops a non-owner editing the role they are standing on', async () => {
      await expect(
        institute.withTenant(() => roles.update(asAccountant(), ROLE_IDS.accountant, { description: 'More power' })),
      ).rejects.toMatchObject({ response: { code: 'PRIVILEGE_ESCALATION' } });
    });

    it('lets the owner edit their own role', async () => {
      const role = await institute.withTenant(() => roles.update(asOwner(), ROLE_IDS.admin, { description: 'Everything.' }));
      expect(role.description).toBe('Everything.');
    });

    it('refuses to add a capability the editor does not hold', async () => {
      await expect(
        institute.withTenant(() => roles.update(asAccountant(), ROLE_IDS.faculty, { permissions: ['dashboard.view', 'settings.manage'] })),
      ).rejects.toMatchObject({ response: { code: 'PRIVILEGE_ESCALATION', details: { escalated: ['settings.manage'] } } });
    });

    it('does not treat leaving an existing capability in place as granting it', async () => {
      // The faculty role already has attendance.mark, which the accountant lacks;
      // renaming it must not be mistaken for handing it out.
      const role = await institute.withTenant(() => roles.update(asAccountant(), ROLE_IDS.faculty, { name: 'Teachers' }));
      expect(role.name).toBe('Teachers');
    });

    describe('the last administrator', () => {
      it('refuses a permission change that would remove the last one', async () => {
        leaveOneAdmin();
        await expect(
          institute.withTenant(() => roles.update(asTeacher(), ROLE_IDS.accountant, { permissions: ['dashboard.view'] })),
        ).rejects.toMatchObject({ response: { code: 'ROLE_LAST_ADMIN' } });
      });

      it('allows the same change while an active owner is still there', async () => {
        leaveOneAdmin();
        reactivateOwner();
        await expect(
          institute.withTenant(() => roles.update(asTeacher(), ROLE_IDS.accountant, { permissions: ['dashboard.view'] })),
        ).resolves.toMatchObject({ permissions: ['dashboard.view'] });
      });
    });
  });

  // ----------------------------------------------------------------- delete

  describe('remove', () => {
    it('deletes a role nobody holds', async () => {
      const spare = await institute.withTenant(() => roles.create(asAdmin(), { name: 'Counsellor', permissions: ['dashboard.view'] }));
      await expect(institute.withTenant(() => roles.remove(asAdmin(), spare.id))).resolves.toEqual({ deleted: true, reassigned: 0 });
      expect(institute.roles.rows.some((role) => role.id === spare.id)).toBe(false);
    });

    it('never deletes a built-in role', async () => {
      for (const id of [ROLE_IDS.admin, ROLE_IDS.faculty]) {
        await expect(institute.withTenant(() => roles.remove(asOwner(), id))).rejects.toMatchObject({
          response: { code: 'ROLE_SYSTEM_PROTECTED' },
        });
      }
    });

    it('refuses a role that is still assigned, and says how many people hold it', async () => {
      await expect(institute.withTenant(() => roles.remove(asAdmin(), ROLE_IDS.accountant))).rejects.toMatchObject({
        response: { code: 'ROLE_IN_USE', details: { staffCount: 1 } },
      });
      expect(institute.roles.rows.some((role) => role.id === ROLE_IDS.accountant)).toBe(true);
    });

    it('moves the holders and deletes it when a reassignment target is given', async () => {
      const result = await institute.withTenant(() => roles.remove(asAdmin(), ROLE_IDS.accountant, ROLE_IDS.faculty));
      expect(result).toEqual({ deleted: true, reassigned: 1 });
      expect(institute.roles.rows.some((role) => role.id === ROLE_IDS.accountant)).toBe(false);
      expect(institute.staff.rows.find((member) => member.id === STAFF_IDS.accounts)?.roleId).toBe(ROLE_IDS.faculty);
    });

    it('refuses to reassign a role to itself', async () => {
      await expect(institute.withTenant(() => roles.remove(asAdmin(), ROLE_IDS.accountant, ROLE_IDS.accountant))).rejects.toMatchObject({
        response: { code: 'VALIDATION_FAILED' },
      });
    });

    it('treats another institute’s reassignment target as not found', async () => {
      await expect(
        institute.withTenant(() => roles.remove(asAdmin(), ROLE_IDS.accountant, '99999999-9999-4999-8999-999999999999')),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    });

    it('stops a non-owner deleting the role they are standing on', async () => {
      await expect(institute.withTenant(() => roles.remove(asAccountant(), ROLE_IDS.accountant))).rejects.toMatchObject({
        response: { code: 'PRIVILEGE_ESCALATION' },
      });
    });

    it('refuses a reassignment that would leave nobody in charge', async () => {
      leaveOneAdmin();
      await expect(institute.withTenant(() => roles.remove(asTeacher(), ROLE_IDS.accountant, ROLE_IDS.faculty))).rejects.toMatchObject({
        response: { code: 'ROLE_LAST_ADMIN' },
      });
      // Nothing was moved and nothing was deleted.
      expect(institute.roles.rows.some((role) => role.id === ROLE_IDS.accountant)).toBe(true);
      expect(institute.staff.rows.find((member) => member.id === STAFF_IDS.admin)?.roleId).toBe(ROLE_IDS.accountant);
    });

    it('allows the same reassignment once somebody else is in charge', async () => {
      leaveOneAdmin();
      reactivateOwner();
      await expect(institute.withTenant(() => roles.remove(asTeacher(), ROLE_IDS.accountant, ROLE_IDS.faculty))).resolves.toEqual({
        deleted: true,
        reassigned: 1,
      });
    });
  });

  // ------------------------------------------------------- role assignment

  describe('assertCanAssignRole', () => {
    it('lets an administrator assign anything they hold', async () => {
      const role = await institute.withTenant(() => roles.requireRole(ROLE_IDS.accountant));
      await expect(institute.withTenant(() => roles.assertCanAssignRole(asAdmin(), role))).resolves.toBeUndefined();
    });

    it('stops a non-owner handing out a role stronger than their own', async () => {
      const role = await institute.withTenant(() => roles.requireRole(ROLE_IDS.admin));
      await expect(institute.withTenant(() => roles.assertCanAssignRole(asAccountant(), role))).rejects.toMatchObject({
        response: { code: 'PRIVILEGE_ESCALATION' },
      });
    });

    it('lets the owner hand out anything', async () => {
      const role = await institute.withTenant(() => roles.requireRole(ROLE_IDS.admin));
      await expect(institute.withTenant(() => roles.assertCanAssignRole(asOwner(), role))).resolves.toBeUndefined();
    });
  });
});
