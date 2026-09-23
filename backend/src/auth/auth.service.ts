/**
 * Authentication flows for the three kinds of principal.
 *
 *   staff   — institute code + email + password
 *   student — institute code + student ID + password
 *   parent  — institute code + mobile, then either an SMS code or a password
 *
 * Rules that apply to all of them:
 *   * The institute code is resolved first; everything after runs inside that
 *     tenant's scope, so a query can never reach another institute's rows.
 *   * Failures are indistinguishable: wrong password, unknown account and unknown
 *     student ID all return the same 401 with code INVALID_CREDENTIALS, and the
 *     password check runs even when there is no account so the timing matches.
 *   * "Not activated" and "account disabled" are only reported *after* the
 *     credential itself checked out, so they cannot be used to enumerate accounts.
 *   * Sign-in issues a 15-minute access token and a rotating 30-day refresh token.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  OneTimeCodeChannel,
  OneTimeCodePurpose,
  PortalAccountStatus,
  PortalAuthMethod,
  PortalRole,
  PrincipalType,
  Role,
  StaffStatus,
} from '@prisma/client';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { permissionsFor } from '@/common/authz/permissions';
import { BadRequestError, ErrorCodes, ForbiddenError, UnauthorizedError } from '@/common/errors/app.error';
import { maskPhone, normalizePhone } from '@/common/phone';
import { dateToWire, instantToWire } from '@/common/serialization/wire';
import { TENANT_PRISMA, type TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { TenantsService, type ResolvedTenant } from '@/tenancy/tenants.service';
import {
  ActivateAccountDto,
  ForgotPasswordDto,
  LogoutDto,
  ParentLoginDto,
  ParentOtpRequestDto,
  ParentOtpVerifyDto,
  RefreshTokenDto,
  ResetPasswordDto,
  StaffLoginDto,
  StudentLoginDto,
} from './dto/auth-requests.dto';
import { AcceptedDto, AuthSessionDto, MeDto, OtpRequestedDto, PortalUserDto, StaffUserDto } from './dto/auth-responses.dto';
import { MAIL_SENDER, type MailSender } from './notifications/mail-sender';
import { SMS_SENDER, type SmsSender } from './notifications/sms-sender';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { isStaff, type PortalPrincipal, type Principal, type StaffPrincipal } from './principal';
import { SessionMeta, TokensService } from './tokens.service';

/** Selects the fields needed to build a StaffUserDto. */
const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  title: true,
  status: true,
  joinedOn: true,
  avatarUrl: true,
  lastActiveAt: true,
  passwordHash: true,
  subjects: { select: { subjectId: true } },
} as const;

/** Selects the fields needed to build a PortalUserDto. */
const PORTAL_SELECT = {
  id: true,
  role: true,
  name: true,
  loginId: true,
  phone: true,
  phoneKey: true,
  email: true,
  emailVerified: true,
  authMethod: true,
  status: true,
  passwordHash: true,
  lastLoginAt: true,
  notifyAttendance: true,
  notifyFees: true,
  notifyResults: true,
  students: {
    select: { student: { select: { id: true, studentCode: true, name: true, grade: true, photoUrl: true } } },
  },
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly tenants: TenantsService,
    private readonly context: TenantContextService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly otp: OtpService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
  ) {}

  // ------------------------------------------------------------------ staff

  async staffLogin(dto: StaffLoginDto, meta: SessionMeta): Promise<AuthSessionDto> {
    const tenant = await this.tenants.requireByCode(dto.instituteCode);

    const staff = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.staff.findFirst({ where: { email: { equals: dto.email, mode: 'insensitive' } }, select: STAFF_SELECT }),
    );

    // Runs the argon2 verification either way, so "no such email" and "wrong
    // password" take the same time and return the same error.
    const ok = await this.passwords.verify(staff?.passwordHash, dto.password);
    if (!staff || !ok) throw invalidCredentials();

    if (staff.status === StaffStatus.Invited) {
      throw new UnauthorizedError(
        'This account has not been activated yet. Use the link in your invitation email.',
        ErrorCodes.ACCOUNT_NOT_ACTIVATED,
      );
    }
    if (staff.status !== StaffStatus.Active) {
      throw new ForbiddenError('This account has been deactivated. Ask your institute administrator.', ErrorCodes.ACCOUNT_INACTIVE);
    }

    await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.staff.update({ where: { id: staff.id }, data: { lastActiveAt: new Date() } }),
    );

    const principal: StaffPrincipal = {
      kind: 'staff',
      id: staff.id,
      tenantId: tenant.id,
      instituteCode: tenant.instituteCode,
      name: staff.name,
      role: staff.role,
      email: staff.email,
    };

    return this.sessionFor(principal, tenant, toStaffDto(staff), meta);
  }

  // ---------------------------------------------------------------- student

  async studentLogin(dto: StudentLoginDto, meta: SessionMeta): Promise<AuthSessionDto> {
    const tenant = await this.tenants.requireByCode(dto.instituteCode);

    const account = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.portalAccount.findFirst({
        where: { role: PortalRole.student, loginId: { equals: dto.studentId, mode: 'insensitive' } },
        select: PORTAL_SELECT,
      }),
    );

    const ok = await this.passwords.verify(account?.passwordHash, dto.password);
    if (!account || !ok) throw invalidCredentials();

    return this.portalSession(account, tenant, meta);
  }

  // ----------------------------------------------------------------- parent

  /**
   * Sends a 6-digit code. The response is identical whether or not the number is
   * registered — the only difference is that nothing is sent. In development the
   * code comes back in the response so the demo works without an SMS gateway.
   */
  async requestParentOtp(dto: ParentOtpRequestDto): Promise<OtpRequestedDto> {
    const tenant = await this.tenants.requireByCode(dto.instituteCode);
    const phoneKey = normalizePhone(dto.phone);

    const response: OtpRequestedDto = {
      sent: true,
      expiresInSeconds: this.config.otp.ttlMinutes * 60,
      sentTo: maskPhone(dto.phone),
    };

    const account = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.portalAccount.findFirst({
        where: { role: PortalRole.parent, phoneKey, status: { in: [PortalAccountStatus.Active, PortalAccountStatus.Invited] } },
        select: { id: true, phone: true, status: true },
      }),
    );

    if (!account) {
      // Deliberately silent: an attacker learns nothing about which parents exist.
      this.logger.debug({ phone: maskPhone(dto.phone), tenant: tenant.instituteCode }, 'OTP requested for an unknown number');
      return response;
    }

    const issued = await this.otp.issueNumericCode({
      tenantId: tenant.id,
      purpose: OneTimeCodePurpose.parent_login,
      channel: OneTimeCodeChannel.sms,
      destination: account.phone ?? dto.phone,
      destinationKey: phoneKey,
      principalType: PrincipalType.parent,
      portalAccountId: account.id,
    });

    await this.sms.send({
      to: account.phone ?? dto.phone,
      purpose: 'parent-otp',
      body: `${issued.code} is your ${tenant.name} sign-in code. It expires in ${this.config.otp.ttlMinutes} minutes. Do not share it.`,
    });

    if (!this.config.isProduction) response.devCode = issued.code;
    return response;
  }

  async verifyParentOtp(dto: ParentOtpVerifyDto, meta: SessionMeta): Promise<AuthSessionDto> {
    const tenant = await this.tenants.requireByCode(dto.instituteCode);
    const phoneKey = normalizePhone(dto.phone);

    // Throws with a specific code for expired / too many attempts / wrong code.
    await this.otp.verifyNumericCode(tenant.id, OneTimeCodePurpose.parent_login, phoneKey, dto.code);

    const account = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.portalAccount.findFirst({ where: { role: PortalRole.parent, phoneKey }, select: PORTAL_SELECT }),
    );
    if (!account) throw invalidCredentials();

    // Verifying a code is proof of possession of the number, so an invited parent
    // becomes active here.
    if (account.status === PortalAccountStatus.Invited) {
      await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
        this.db.portalAccount.update({
          where: { id: account.id },
          data: { status: PortalAccountStatus.Active, activatedOn: new Date() },
        }),
      );
      account.status = PortalAccountStatus.Active;
    }

    return this.portalSession(account, tenant, meta);
  }

  async parentLogin(dto: ParentLoginDto, meta: SessionMeta): Promise<AuthSessionDto> {
    const tenant = await this.tenants.requireByCode(dto.instituteCode);
    const phoneKey = normalizePhone(dto.phone);

    const account = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.portalAccount.findFirst({ where: { role: PortalRole.parent, phoneKey }, select: PORTAL_SELECT }),
    );

    const ok = await this.passwords.verify(account?.passwordHash, dto.password);
    if (!account || !ok) throw invalidCredentials();

    return this.portalSession(account, tenant, meta);
  }

  // ------------------------------------------------------------- activation

  /**
   * Turns an invitation into a usable login. Works for portal accounts and for
   * staff invitations, because both are issued as `portal_activation` tokens.
   */
  async activate(dto: ActivateAccountDto, meta: SessionMeta): Promise<AuthSessionDto> {
    // Validated but not consumed yet: a password that fails the policy below must
    // not burn the user's single invitation link.
    const code = await this.otp.findLinkToken(OneTimeCodePurpose.portal_activation, dto.token);
    const tenant = await this.requireTenantById(code.tenantId);

    if (code.staffId) {
      this.passwords.assertStrong(dto.password, [code.destination]);
      const passwordHash = await this.passwords.hash(dto.password);
      await this.otp.markLinkTokenConsumed(code);
      const staff = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
        this.db.staff.update({
          where: { id: code.staffId as string },
          data: { passwordHash, status: StaffStatus.Active, lastActiveAt: new Date() },
          select: STAFF_SELECT,
        }),
      );
      const principal: StaffPrincipal = {
        kind: 'staff',
        id: staff.id,
        tenantId: tenant.id,
        instituteCode: tenant.instituteCode,
        name: staff.name,
        role: staff.role,
        email: staff.email,
      };
      return this.sessionFor(principal, tenant, toStaffDto(staff), meta);
    }

    if (!code.portalAccountId) throw new UnauthorizedError('That link is no longer valid.', ErrorCodes.INVALID_TOKEN);

    const existing = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.portalAccount.findFirst({ where: { id: code.portalAccountId as string }, select: PORTAL_SELECT }),
    );
    if (!existing) throw new UnauthorizedError('That link is no longer valid.', ErrorCodes.INVALID_TOKEN);

    // A parent account must end up with an email so it can recover its password.
    const email = dto.email ?? existing.email ?? undefined;
    if (existing.role === PortalRole.parent && !email) {
      throw new BadRequestError('Parents must provide an email address for account recovery.', ErrorCodes.VALIDATION_FAILED);
    }

    this.passwords.assertStrong(dto.password, [existing.loginId, email ?? '', existing.phone ?? '']);
    const passwordHash = await this.passwords.hash(dto.password);
    await this.otp.markLinkTokenConsumed(code);

    const account = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.portalAccount.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          authMethod: PortalAuthMethod.password,
          status: PortalAccountStatus.Active,
          activatedOn: new Date(),
          email,
          // The invitation went to this address, so activating through it proves it.
          emailVerified: email ? email === code.destination || existing.emailVerified : existing.emailVerified,
        },
        select: PORTAL_SELECT,
      }),
    );

    return this.portalSession(account, tenant, meta);
  }

  // --------------------------------------------------------------- recovery

  /**
   * Always returns 202 with the same body, whatever the identifier was: a caller
   * cannot use this endpoint to find out which accounts exist.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<AcceptedDto> {
    const response: AcceptedDto = {
      accepted: true,
      message: 'If that account exists, we have sent a recovery link to the email on file.',
    };

    const tenant = await this.tenants.findByCode(dto.instituteCode);
    if (!tenant || !tenant.active) return response;

    const target = await this.findRecoveryTarget(tenant, dto.identifier);
    if (!target) {
      this.logger.debug({ tenant: tenant.instituteCode }, 'Password recovery requested for an unknown identifier');
      return response;
    }
    if (!target.email) {
      // Nothing to send to — e.g. a student account with no email on file.
      this.logger.debug({ tenant: tenant.instituteCode }, 'Password recovery requested for an account without an email');
      return response;
    }

    const issued = await this.otp.issueLinkToken({
      tenantId: tenant.id,
      purpose: OneTimeCodePurpose.password_reset,
      channel: OneTimeCodeChannel.email,
      destination: target.email,
      destinationKey: target.email.toLowerCase(),
      principalType: target.principalType,
      staffId: target.staffId,
      portalAccountId: target.portalAccountId,
      ttlMinutes: this.config.otp.resetTokenTtlMinutes,
    });

    const url = `${this.config.webAppUrl}/reset-password?token=${encodeURIComponent(issued.token)}`;
    await this.mail.send({
      to: target.email,
      purpose: 'password-reset',
      subject: `Reset your ${tenant.name} password`,
      text: [
        `Hello ${target.name},`,
        '',
        `Use the link below to choose a new password. It expires in ${this.config.otp.resetTokenTtlMinutes} minutes and can be used once.`,
        url,
        '',
        'If you did not ask for this, you can ignore this email — your password has not changed.',
      ].join('\n'),
    });

    // Development convenience only: production never echoes the link.
    if (!this.config.isProduction) response.devResetUrl = url;
    return response;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: true }> {
    // Same rule as activation: check the new password before spending the link.
    const code = await this.otp.findLinkToken(OneTimeCodePurpose.password_reset, dto.token);
    const tenant = await this.requireTenantById(code.tenantId);

    if (code.staffId) {
      this.passwords.assertStrong(dto.password, [code.destination]);
      const passwordHash = await this.passwords.hash(dto.password);
      await this.otp.markLinkTokenConsumed(code);
      await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
        this.db.staff.update({ where: { id: code.staffId as string }, data: { passwordHash } }),
      );
      // A password change ends every existing session.
      await this.tokens.revokeAllForPrincipal(tenant.id, 'staff', code.staffId);
      return { ok: true };
    }

    if (!code.portalAccountId) throw new UnauthorizedError('That link is no longer valid.', ErrorCodes.INVALID_TOKEN);

    this.passwords.assertStrong(dto.password, [code.destination]);
    const passwordHash = await this.passwords.hash(dto.password);
    await this.otp.markLinkTokenConsumed(code);
    await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.portalAccount.update({
        where: { id: code.portalAccountId as string },
        data: {
          passwordHash,
          authMethod: PortalAuthMethod.password,
          // Resetting through an emailed link also proves the address works.
          emailVerified: true,
          status: PortalAccountStatus.Active,
        },
      }),
    );
    await this.tokens.revokeAllForPrincipal(tenant.id, 'portal', code.portalAccountId);
    return { ok: true };
  }

  // ------------------------------------------------------- session lifecycle

  /** Rotates the refresh token and re-reads the principal, so role changes apply. */
  async refresh(dto: RefreshTokenDto, meta: SessionMeta): Promise<AuthSessionDto> {
    const row = await this.tokens.consumeRefreshToken(dto.refreshToken);
    const tenant = await this.requireTenantById(row.tenantId);

    if (row.principalType === PrincipalType.staff && row.staffId) {
      const staff = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
        this.db.staff.findFirst({ where: { id: row.staffId as string }, select: STAFF_SELECT }),
      );
      if (!staff || staff.status !== StaffStatus.Active) {
        throw new UnauthorizedError('This account is no longer active.', ErrorCodes.ACCOUNT_INACTIVE);
      }
      const principal: StaffPrincipal = {
        kind: 'staff',
        id: staff.id,
        tenantId: tenant.id,
        instituteCode: tenant.instituteCode,
        name: staff.name,
        role: staff.role,
        email: staff.email,
      };
      const session = await this.sessionFor(principal, tenant, toStaffDto(staff), meta);
      await this.linkRotation(row.id, session.refreshToken, tenant.id);
      return session;
    }

    if (!row.portalAccountId) throw new UnauthorizedError('Your session is no longer valid.', ErrorCodes.INVALID_TOKEN);

    const account = await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
      this.db.portalAccount.findFirst({ where: { id: row.portalAccountId as string }, select: PORTAL_SELECT }),
    );
    if (!account || account.status !== PortalAccountStatus.Active) {
      throw new UnauthorizedError('This account is no longer active.', ErrorCodes.ACCOUNT_INACTIVE);
    }

    const session = await this.portalSession(account, tenant, meta, { touchLastLogin: false });
    await this.linkRotation(row.id, session.refreshToken, tenant.id);
    return session;
  }

  /** Ends one session. Idempotent and always 204, so it is safe to call blindly. */
  async logout(dto: LogoutDto): Promise<void> {
    if (dto.refreshToken) await this.tokens.revoke(dto.refreshToken);
  }

  /** GET /auth/me — rebuilt from the database, not from the token. */
  async me(principal: Principal): Promise<MeDto> {
    const tenant = await this.requireTenantById(principal.tenantId);

    if (isStaff(principal)) {
      const staff = await this.db.staff.findFirst({ where: { id: principal.id }, select: STAFF_SELECT });
      if (!staff) throw new UnauthorizedError();
      return {
        principal: 'staff',
        institute: instituteSummary(tenant),
        user: toStaffDto(staff),
        permissions: permissionsFor(staff.role),
      };
    }

    const account = await this.db.portalAccount.findFirst({ where: { id: principal.id }, select: PORTAL_SELECT });
    if (!account) throw new UnauthorizedError();
    return { principal: account.role, institute: instituteSummary(tenant), user: toPortalDto(account) };
  }

  // ------------------------------------------------------------- internals

  /** Shared tail of every sign-in: issue tokens and shape the response. */
  private async sessionFor(
    principal: Principal,
    tenant: ResolvedTenant,
    user: StaffUserDto | PortalUserDto,
    meta: SessionMeta,
  ): Promise<AuthSessionDto> {
    const tokens = await this.tokens.issueSession(principal, meta);
    return {
      token: tokens.accessToken,
      ...tokens,
      principal: principal.kind,
      institute: instituteSummary(tenant),
      user,
      ...(isStaff(principal) ? { permissions: permissionsFor(principal.role) } : {}),
    };
  }

  /** Checks a portal account may sign in, then issues its session. */
  private async portalSession(
    account: PortalAccountWithStudents,
    tenant: ResolvedTenant,
    meta: SessionMeta,
    options: { touchLastLogin?: boolean } = {},
  ): Promise<AuthSessionDto> {
    if (account.status === PortalAccountStatus.Invited) {
      throw new UnauthorizedError(
        'This account has not been activated yet. Use the link in your invitation.',
        ErrorCodes.ACCOUNT_NOT_ACTIVATED,
      );
    }
    if (account.status !== PortalAccountStatus.Active) {
      throw new ForbiddenError('This account has been disabled. Contact the institute.', ErrorCodes.ACCOUNT_INACTIVE);
    }

    if (options.touchLastLogin !== false) {
      await this.context.runWithTenant(tenant.id, tenant.instituteCode, () =>
        this.db.portalAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } }),
      );
    }

    const principal: PortalPrincipal = {
      kind: account.role === PortalRole.parent ? 'parent' : 'student',
      id: account.id,
      tenantId: tenant.id,
      instituteCode: tenant.instituteCode,
      name: account.name,
      studentIds: account.students.map((link) => link.student.id),
    };

    return this.sessionFor(principal, tenant, toPortalDto(account), meta);
  }

  /** Marks the presented refresh token as rotated into the one just issued. */
  private async linkRotation(oldTokenId: string, newRawToken: string, tenantId: string): Promise<void> {
    const newId = newRawToken.split('.')[0];
    await this.tokens.markRotated(oldTokenId, newId, tenantId);
  }

  /** Finds whoever a "forgot password" identifier refers to. */
  private async findRecoveryTarget(tenant: ResolvedTenant, identifier: string): Promise<RecoveryTarget | null> {
    const value = identifier.trim();
    const isEmail = value.includes('@');
    const phoneKey = normalizePhone(value);

    return this.context.runWithTenant(tenant.id, tenant.instituteCode, async () => {
      if (isEmail) {
        const staff = await this.db.staff.findFirst({
          where: { email: { equals: value, mode: 'insensitive' } },
          select: { id: true, name: true, email: true },
        });
        if (staff) {
          return { principalType: PrincipalType.staff, staffId: staff.id, portalAccountId: null, email: staff.email, name: staff.name };
        }

        const byEmail = await this.db.portalAccount.findFirst({
          where: { email: { equals: value, mode: 'insensitive' } },
          select: { id: true, name: true, email: true, role: true },
        });
        if (byEmail) return portalTarget(byEmail);
        return null;
      }

      // A 10-digit key is a parent's mobile; anything else is a student ID.
      if (/^\d{10}$/.test(phoneKey)) {
        const parent = await this.db.portalAccount.findFirst({
          where: { role: PortalRole.parent, phoneKey },
          select: { id: true, name: true, email: true, role: true },
        });
        if (parent) return portalTarget(parent);
      }

      const student = await this.db.portalAccount.findFirst({
        where: { role: PortalRole.student, loginId: { equals: value, mode: 'insensitive' } },
        select: { id: true, name: true, email: true, role: true },
      });
      return student ? portalTarget(student) : null;
    });
  }

  /** Tenant lookup by id, for flows that start from a token rather than a code. */
  private async requireTenantById(tenantId: string): Promise<ResolvedTenant> {
    const tenant = await this.context.runAsSystem(() =>
      this.db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, instituteCode: true, name: true, active: true } }),
    );
    if (!tenant) throw new UnauthorizedError();
    if (!tenant.active) throw new ForbiddenError('This institute is not active.', ErrorCodes.TENANT_SUSPENDED);
    return tenant;
  }
}

// ----------------------------------------------------------------- mappers

interface RecoveryTarget {
  principalType: PrincipalType;
  staffId: string | null;
  portalAccountId: string | null;
  email: string | null;
  name: string;
}

function portalTarget(account: { id: string; name: string; email: string | null; role: PortalRole }): RecoveryTarget {
  return {
    principalType: account.role === PortalRole.parent ? PrincipalType.parent : PrincipalType.student,
    staffId: null,
    portalAccountId: account.id,
    email: account.email,
    name: account.name,
  };
}

type StaffRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  title: string;
  status: StaffStatus;
  joinedOn: Date;
  avatarUrl: string | null;
  lastActiveAt: Date | null;
  subjects: { subjectId: string }[];
};

type PortalAccountWithStudents = {
  id: string;
  role: PortalRole;
  name: string;
  loginId: string;
  phone: string | null;
  phoneKey: string | null;
  email: string | null;
  emailVerified: boolean;
  authMethod: PortalAuthMethod;
  status: PortalAccountStatus;
  passwordHash?: string | null;
  lastLoginAt: Date | null;
  notifyAttendance: boolean;
  notifyFees: boolean;
  notifyResults: boolean;
  students: { student: { id: string; studentCode: string; name: string; grade: string; photoUrl: string | null } }[];
};

/** Row → the client's `Staff` shape. The password hash never leaves this file. */
export function toStaffDto(staff: StaffRow): StaffUserDto {
  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    phone: staff.phone,
    role: staff.role,
    title: staff.title,
    subjectIds: staff.subjects.map((s) => s.subjectId),
    status: staff.status,
    joinedOn: dateToWire(staff.joinedOn) as string,
    avatarUrl: staff.avatarUrl ?? undefined,
    lastActiveAt: instantToWire(staff.lastActiveAt),
  };
}

/** Row → the client's `PortalAccount` shape, minus every secret. */
export function toPortalDto(account: PortalAccountWithStudents): PortalUserDto {
  return {
    id: account.id,
    role: account.role === PortalRole.parent ? 'parent' : 'student',
    name: account.name,
    loginId: account.loginId,
    phone: account.phone ?? undefined,
    email: account.email ?? undefined,
    emailVerified: account.emailVerified,
    authMethod: account.authMethod,
    status: account.status,
    studentIds: account.students.map((link) => link.student.id),
    students: account.students.map((link) => ({
      id: link.student.id,
      studentCode: link.student.studentCode,
      name: link.student.name,
      grade: link.student.grade,
      photoUrl: link.student.photoUrl ?? undefined,
    })),
    notify: { attendance: account.notifyAttendance, fees: account.notifyFees, results: account.notifyResults },
    lastLoginAt: instantToWire(account.lastLoginAt),
  };
}

function instituteSummary(tenant: ResolvedTenant) {
  return { id: tenant.id, code: tenant.instituteCode, name: tenant.name };
}

/** One message for every credential failure — no enumeration, no hints. */
function invalidCredentials(): UnauthorizedError {
  return new UnauthorizedError('Those sign-in details are not correct.', ErrorCodes.INVALID_CREDENTIALS);
}
