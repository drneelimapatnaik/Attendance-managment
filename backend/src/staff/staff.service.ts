/**
 * Staff management: the roster, invitations, role changes and removals.
 *
 * This is where roles-as-data becomes usable: every staff member points at a row in
 * the institute's own `roles` table, and an invitation names one. Inviting reuses
 * the activation machinery the auth module already owns — a single-use link token
 * emailed to the new member, redeemed at `POST /auth/portal/activate`, which sets
 * their password and signs them in.
 *
 * Rules enforced here (all server-side):
 *   * the owner cannot be demoted, deactivated or deleted;
 *   * a non-owner cannot change their own role, nor assign a role that grants more
 *     than they hold themselves (RolesService.assertCanAssignRole);
 *   * the institute must keep at least one active administrator;
 *   * somebody who still teaches a live batch, or who has attendance and receipts
 *     on file, cannot be deleted — deactivate them instead, so history survives.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BatchStatus, OneTimeCodeChannel, OneTimeCodePurpose, Prisma, PrincipalType, StaffStatus } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { BadRequestError, ConflictError, ErrorCodes, ForbiddenError, NotFoundError } from '@/common/errors/app.error';
import { TENANT_PRISMA, type TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { MAIL_SENDER, type MailSender } from '@/auth/notifications/mail-sender';
import { OtpService } from '@/auth/otp.service';
import type { StaffPrincipal } from '@/auth/principal';
import { RolesService } from '@/roles/roles.service';
import { fromISODate, todayIn } from '@/domain/date';
import { InviteStaffDto, StaffQueryDto, UpdateStaffDto } from './dto/staff-requests.dto';
import { StaffDto, StaffInviteResultDto, StaffPageDto } from './dto/staff.dto';
import { STAFF_SELECT, toStaffDto, type StaffRow } from './staff.mapper';

const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly context: TenantContextService,
    private readonly roles: RolesService,
    private readonly otp: OtpService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  // ------------------------------------------------------------------ reads

  /** One page of the roster, newest-joined last so the list reads like a team list. */
  async list(query: StaffQueryDto): Promise<StaffPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.buildWhere(query);

    const [total, rows] = await Promise.all([
      this.db.staff.count({ where }),
      this.db.staff.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: STAFF_SELECT,
      }),
    ]);

    return { items: rows.map(toStaffDto), total, page, pageSize };
  }

  async findOne(id: string): Promise<StaffDto> {
    return toStaffDto(await this.requireStaff(id));
  }

  // ------------------------------------------------------------ invitations

  /**
   * Creates an `Invited` staff member with no password and emails them a
   * single-use activation link. They become `Active` when they redeem it at
   * `POST /auth/portal/activate`, which is also where they choose their password —
   * so no temporary password is ever generated, stored or sent.
   */
  async invite(principal: StaffPrincipal, dto: InviteStaffDto): Promise<StaffInviteResultDto> {
    const tenantId = this.context.requireTenantId();
    const role = await this.roles.requireRole(dto.roleId);
    await this.roles.assertCanAssignRole(principal, role);

    await this.assertEmailFree(dto.email);
    const subjectIds = await this.checkedSubjectIds(dto.subjectIds);
    const tenant = await this.requireTenant(tenantId);

    const staff = await this.db.staff.create({
      data: {
        // Required by Prisma's create type; the tenant extension cross-checks it.
        tenantId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone ?? '',
        roleId: role.id,
        title: dto.title ?? '',
        status: StaffStatus.Invited,
        joinedOn: fromISODate(todayIn(tenant.timezone)),
        // Nested rows carry their own tenantId: the extension rewrites the top
        // level only (see src/prisma/tenant-scope.ts).
        subjects: { create: subjectIds.map((subjectId) => ({ tenantId, subjectId })) },
      },
      select: STAFF_SELECT,
    });

    const invitation = await this.sendInvitation(tenantId, tenant.name, staff);
    return { staff: toStaffDto(staff), ...invitation };
  }

  /** Issues a fresh link (which invalidates the previous one) and emails it again. */
  async resendInvite(id: string): Promise<StaffInviteResultDto> {
    const staff = await this.requireStaff(id);
    if (staff.status !== StaffStatus.Invited) {
      throw new ConflictError(
        `${staff.name} has already activated their account. Send them a password-reset link instead.`,
        ErrorCodes.STAFF_ALREADY_ACTIVE,
      );
    }
    const tenantId = this.context.requireTenantId();
    const tenant = await this.requireTenant(tenantId);
    const invitation = await this.sendInvitation(tenantId, tenant.name, staff);
    return { staff: toStaffDto(staff), ...invitation };
  }

  // ----------------------------------------------------------------- writes

  async update(principal: StaffPrincipal, id: string, dto: UpdateStaffDto): Promise<StaffDto> {
    const staff = await this.requireStaff(id);
    const data: Prisma.StaffUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.title !== undefined) data.title = dto.title;

    if (dto.email !== undefined && dto.email.toLowerCase() !== staff.email.toLowerCase()) {
      await this.assertEmailFree(dto.email, staff.id);
      data.email = dto.email;
    }

    if (dto.roleId !== undefined && dto.roleId !== staff.roleId) {
      // The owner is always effectively an administrator; moving them to a lesser
      // role would be a silent lie, so it is refused outright.
      if (staff.isOwner) {
        throw new ForbiddenError(
          `${staff.name} set this institute up and always has full access. Their role cannot be changed.`,
          ErrorCodes.OWNER_PROTECTED,
        );
      }
      if (!principal.isOwner && staff.id === principal.id) {
        throw new ForbiddenError(
          'You cannot change your own role. Ask another administrator, or the account that set this institute up.',
          ErrorCodes.PRIVILEGE_ESCALATION,
        );
      }
      const role = await this.roles.requireRole(dto.roleId);
      await this.roles.assertCanAssignRole(principal, role);
      await this.roles.assertAdminRemains({ staff: { id: staff.id, roleId: role.id } });
      // Prisma's update input takes the relation, not the scalar FK.
      data.role = { connect: { id: role.id } };
    }

    if (dto.status !== undefined && dto.status !== staff.status) {
      if (staff.isOwner) {
        throw new ForbiddenError(`${staff.name} set this institute up and cannot be deactivated.`, ErrorCodes.OWNER_PROTECTED);
      }
      if (dto.status === StaffStatus.Active && staff.status === StaffStatus.Invited) {
        throw new BadRequestError(
          `${staff.name} has not accepted their invitation yet, so they have no password. Resend the invitation instead.`,
          ErrorCodes.ACCOUNT_NOT_ACTIVATED,
        );
      }
      if (dto.status === StaffStatus.Invited && staff.status !== StaffStatus.Invited) {
        throw new BadRequestError('An activated account cannot be set back to Invited.', ErrorCodes.VALIDATION_FAILED);
      }
      if (dto.status !== StaffStatus.Active) {
        await this.roles.assertAdminRemains({ staff: { id: staff.id, status: dto.status } });
      }
      data.status = dto.status;
    }

    if (Object.keys(data).length > 0) await this.db.staff.update({ where: { id: staff.id }, data });

    if (dto.subjectIds !== undefined) {
      const subjectIds = await this.checkedSubjectIds(dto.subjectIds);
      const tenantId = this.context.requireTenantId();
      // Replace the set: the join table has no other columns, so rewriting it is
      // simpler and cheaper than diffing it.
      await this.db.staffSubject.deleteMany({ where: { staffId: staff.id } });
      if (subjectIds.length > 0) {
        await this.db.staffSubject.createMany({ data: subjectIds.map((subjectId) => ({ tenantId, staffId: staff.id, subjectId })) });
      }
    }

    return toStaffDto(await this.requireStaff(staff.id));
  }

  /**
   * Removes a staff member outright. Refused whenever their rows are load-bearing —
   * the alternative (`status: "Inactive"`) ends their access while keeping the
   * attendance registers and receipts that name them.
   */
  async remove(principal: StaffPrincipal, id: string): Promise<{ deleted: true }> {
    const staff = await this.requireStaff(id);

    if (staff.isOwner) {
      throw new ForbiddenError(
        `${staff.name} set this institute up and cannot be removed. Transfer ownership first.`,
        ErrorCodes.OWNER_PROTECTED,
      );
    }
    if (staff.id === principal.id) {
      throw new ConflictError('You cannot remove your own account. Ask another administrator.', ErrorCodes.STAFF_SELF_DELETE);
    }

    const batches = await this.db.batch.findMany({
      where: { facultyId: staff.id },
      select: { id: true, code: true, status: true },
    });
    const live = batches.filter((batch) => batch.status === BatchStatus.Active || batch.status === BatchStatus.Upcoming);
    if (live.length > 0) {
      throw new ConflictError(
        `${staff.name} still teaches ${live.length === 1 ? 'batch' : 'batches'} ${live.map((b) => b.code).join(', ')}. Assign another faculty member first.`,
        ErrorCodes.STAFF_TEACHES_ACTIVE_BATCH,
        { batches: live.map((batch) => ({ id: batch.id, code: batch.code })) },
      );
    }

    // Everything below is an onDelete: Restrict relation — the database would refuse
    // the delete anyway, so say why instead of surfacing a foreign-key error.
    const [sessions, payments] = await Promise.all([
      this.db.attendanceSession.count({ where: { OR: [{ facultyId: staff.id }, { markedById: staff.id }] } }),
      this.db.payment.count({ where: { collectedById: staff.id } }),
    ]);
    if (sessions > 0 || payments > 0 || batches.length > 0) {
      throw new ConflictError(
        `${staff.name} has attendance registers, receipts or archived batches on file, which must be kept. Set their status to Inactive instead.`,
        ErrorCodes.STAFF_HAS_HISTORY,
        { sessions, payments, batches: batches.length },
      );
    }

    await this.roles.assertAdminRemains({ removedStaffId: staff.id });
    await this.db.staff.delete({ where: { id: staff.id } });
    return { deleted: true };
  }

  // -------------------------------------------------------------- internals

  private buildWhere(query: StaffQueryDto): Prisma.StaffWhereInput {
    const where: Prisma.StaffWhereInput = {};
    if (query.roleId) where.roleId = query.roleId;
    // Filtering by slug goes through the relation, so the caller never needs to
    // resolve `faculty` to an id first.
    if (query.roleKey) where.role = { key: query.roleKey };
    if (query.status) where.status = query.status;
    if (query.search) {
      const contains = query.search;
      where.OR = [
        { name: { contains, mode: 'insensitive' } },
        { email: { contains, mode: 'insensitive' } },
        { phone: { contains, mode: 'insensitive' } },
        { title: { contains, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /** Tenant-scoped: another institute's staff id is simply "not found". */
  private async requireStaff(id: string): Promise<StaffRow> {
    const row = await this.db.staff.findFirst({ where: { id }, select: STAFF_SELECT });
    if (!row) throw new NotFoundError('No such staff member.');
    return row;
  }

  private async assertEmailFree(email: string, exceptStaffId?: string): Promise<void> {
    const clash = await this.db.staff.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ...(exceptStaffId ? { NOT: { id: exceptStaffId } } : {}) },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new ConflictError(`${clash.name} already uses ${email}.`, ErrorCodes.STAFF_EMAIL_TAKEN, { email });
    }
  }

  /** De-duplicates and checks that every subject belongs to this institute. */
  private async checkedSubjectIds(subjectIds: string[] | undefined): Promise<string[]> {
    const wanted = [...new Set(subjectIds ?? [])];
    if (wanted.length === 0) return [];
    const found = await this.db.subject.findMany({ where: { id: { in: wanted } }, select: { id: true } });
    if (found.length !== wanted.length) {
      const missing = wanted.filter((id) => !found.some((subject) => subject.id === id));
      throw new BadRequestError('One or more of those subjects do not exist.', ErrorCodes.VALIDATION_FAILED, { missing });
    }
    return wanted;
  }

  /** The tenant's name and timezone — Tenant is a global table, so it is not scoped. */
  private async requireTenant(tenantId: string): Promise<{ name: string; timezone: string }> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId }, select: { name: true, timezone: true } });
    if (!tenant) throw new NotFoundError('No such institute.');
    return tenant;
  }

  /**
   * Mints the activation token and emails it. Returns the expiry, plus the link
   * itself outside production so the flow can be finished without a mail server —
   * the same convenience `/auth/password/forgot` offers.
   */
  private async sendInvitation(
    tenantId: string,
    instituteName: string,
    staff: Pick<StaffRow, 'id' | 'name' | 'email'>,
  ): Promise<{ invitationExpiresAt: string; devActivationUrl?: string }> {
    const issued = await this.otp.issueLinkToken({
      tenantId,
      purpose: OneTimeCodePurpose.portal_activation,
      channel: OneTimeCodeChannel.email,
      destination: staff.email,
      destinationKey: staff.email.toLowerCase(),
      principalType: PrincipalType.staff,
      staffId: staff.id,
      ttlMinutes: this.config.otp.activationTokenTtlHours * 60,
    });

    const url = `${this.config.webAppUrl}/activate?token=${encodeURIComponent(issued.token)}`;
    await this.mail.send({
      to: staff.email,
      purpose: 'staff-invitation',
      subject: `You have been added to ${instituteName} on EduTrack`,
      text: [
        `Hello ${staff.name},`,
        '',
        `${instituteName} has created an EduTrack account for you. Use the link below to choose a password and sign in.`,
        url,
        '',
        `The link can be used once and expires in ${Math.round(this.config.otp.activationTokenTtlHours / 24)} days.`,
      ].join('\n'),
    });
    this.logger.log({ staffId: staff.id }, 'Staff invitation sent');

    return {
      invitationExpiresAt: issued.expiresAt.toISOString(),
      ...(this.config.isProduction ? {} : { devActivationUrl: url }),
    };
  }
}
