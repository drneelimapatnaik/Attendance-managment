/**
 * Bootstrapping a freshly migrated client database into a usable institute.
 *
 * What a new client gets, and nothing more (docs/HOSTING.md › Provisioning):
 *
 *   1. the tenant row: institute code, name, contact details, academic year;
 *   2. default InstituteSettings (attendance thresholds, billing rules, licence);
 *   3. one campus, so students and batches have somewhere to live — the institute
 *      renames it on their settings screen;
 *   4. the two built-in staff roles, Administrator and Faculty, and only those:
 *      every other role is theirs to create;
 *   5. the owner's staff record, `Invited`, with **no password**, plus a
 *      single-use activation link they redeem at POST /auth/portal/activate.
 *
 * No demo data. `client:create --demo` runs prisma/seed.ts separately for a
 * sales demo, and this function then attaches the real owner on top.
 *
 * We never generate, transmit or store a password for a client: the activation
 * link is the only credential that leaves this process, and it is single-use and
 * time-limited. The token row written here is byte-for-byte the row
 * `OtpService.issueLinkToken` writes, so the normal activation endpoint accepts it.
 *
 * Every write goes through a plain `PrismaClient` bound to the client's own
 * database. There is no tenant context and no scoping extension here because
 * there is nothing to scope: this database has exactly one tenant, which is the
 * whole point of the hosting model. The API process is what uses the scoped
 * client, and it keeps doing so.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  BillingMode,
  BrandTheme,
  LicenseTier,
  OneTimeCodeChannel,
  OneTimeCodePurpose,
  PrincipalType,
  StaffStatus,
  Weekday,
  type PrismaClient,
} from '@prisma/client';
import { SYSTEM_ROLES } from '../../src/common/authz/system-roles';
import { fromISODate, todayIn } from '../../src/domain/date';
import { CliError } from './cli';

/** Activation links last a week by default — long enough for a handover email. */
const DEFAULT_ACTIVATION_HOURS = 168;

export interface BootstrapInput {
  code: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  /** Institute timezone; drives "today" everywhere in the product. */
  timezone?: string;
  /** Name of the first campus. The institute may rename it. */
  campusName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  /** Overrides the default activation-link lifetime. */
  activationTtlHours?: number;
}

export interface BootstrapResult {
  tenantId: string;
  instituteCode: string;
  name: string;
  academicYear: string;
  campusName: string;
  roles: { key: string; name: string }[];
  owner: { id: string; name: string; email: string; isOwner: boolean };
  activation: { token: string; expiresAt: Date };
  /** True when an owner already existed (demo seed) and this account is an admin instead. */
  ownerWasTaken: boolean;
}

/** June start, the Indian academic convention the product is built around. */
function academicYearFor(today: string): { start: string; label: string } {
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) >= 6 ? 0 : 1);
  const start = `${year}-06-01`;
  return { start, label: `${year}-${String((year + 1) % 100).padStart(2, '0')}` };
}

/**
 * Creates (or completes) the institute. Safe to run twice: an existing tenant with
 * the same code is reused and only the missing pieces are added, which is what
 * makes `--demo` and a retried `client:create` both work.
 */
export async function bootstrapInstitute(db: PrismaClient, input: BootstrapInput): Promise<BootstrapResult> {
  const code = input.code.trim().toUpperCase();
  const timezone = input.timezone ?? 'Asia/Kolkata';
  const today = todayIn(timezone);
  const { start, label } = academicYearFor(today);
  const campusName = input.campusName ?? 'Main Campus';
  const ownerEmail = input.ownerEmail.trim().toLowerCase();

  if (!ownerEmail.includes('@')) throw new CliError(`"${input.ownerEmail}" is not an email address.`);

  // --- 1 & 2: the tenant and its settings --------------------------------
  const existing = await db.tenant.findUnique({ where: { instituteCode: code }, select: { id: true } });
  const tenant = existing
    ? await db.tenant.update({
        where: { id: existing.id },
        // A retry (or a --demo seed) should end up with the operator's real name
        // and contact details, not the demo's.
        data: { name: input.name, contactEmail: input.contactEmail ?? ownerEmail, ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}) },
        select: { id: true, instituteCode: true, name: true, academicYear: true },
      })
    : await db.tenant.create({
        data: {
          instituteCode: code,
          name: input.name,
          tagline: '',
          brandTheme: BrandTheme.royal,
          academicYear: label,
          academicYearStart: fromISODate(start),
          contactEmail: input.contactEmail ?? ownerEmail,
          contactPhone: input.contactPhone ?? '',
          address: input.address ?? '',
          timezone,
          workingDays: [Weekday.Mon, Weekday.Tue, Weekday.Wed, Weekday.Thu, Weekday.Fri, Weekday.Sat],
          settings: {
            create: {
              // Product defaults. Everything here is on the institute's settings
              // screen; none of it is a per-client decision we make for them.
              lateAfterMinutes: 10,
              lowAttendanceThreshold: 75,
              countLateAsPresent: true,
              notifyParentOnAbsence: true,
              billingMode: BillingMode.JoiningDate,
              billingDay: 5,
              dueInDays: 7,
              gracePeriodDays: 3,
              lateFee: 0,
              receiptPrefix: 'RCPT',
              notifySms: true,
              notifyWhatsapp: true,
              notifyEmail: true,
              notifyPush: true,
              licenseTier: LicenseTier.Starter,
              // A year from the academic year's start; renewals move it.
              licenseValidUntil: fromISODate(`${Number(start.slice(0, 4)) + 1}-05-31`),
              maxStudents: 5000,
            },
          },
        },
        select: { id: true, instituteCode: true, name: true, academicYear: true },
      });

  // Settings can be missing if a previous run died between the two writes.
  const settings = await db.instituteSettings.findUnique({ where: { tenantId: tenant.id }, select: { id: true } });
  if (!settings) {
    await db.instituteSettings.create({
      data: { tenantId: tenant.id, licenseValidUntil: fromISODate(`${Number(start.slice(0, 4)) + 1}-05-31`), maxStudents: 5000 },
    });
  }

  // --- 3: one campus -----------------------------------------------------
  const campusCount = await db.campus.count({ where: { tenantId: tenant.id } });
  if (campusCount === 0) {
    await db.campus.create({ data: { tenantId: tenant.id, name: campusName, address: input.address ?? '' } });
  }

  // --- 4: the built-in roles, and only those -----------------------------
  const roles: { key: string; name: string }[] = [];
  for (const definition of SYSTEM_ROLES) {
    const found = await db.role.findFirst({ where: { tenantId: tenant.id, key: definition.key }, select: { id: true, key: true, name: true } });
    if (found) {
      roles.push({ key: found.key, name: found.name });
      continue;
    }
    const created = await db.role.create({
      data: {
        tenantId: tenant.id,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        permissions: [...definition.permissions],
        isSystem: true,
        isDefault: definition.isDefault,
      },
      select: { key: true, name: true },
    });
    roles.push(created);
  }

  const adminRole = await db.role.findFirst({ where: { tenantId: tenant.id, key: 'admin' }, select: { id: true } });
  if (!adminRole) throw new CliError('The Administrator role was not created — refusing to continue without it.');

  // --- 5: the owner ------------------------------------------------------
  // With --demo the seed has already made its own owner; a second `isOwner` row
  // would make two accounts un-deletable, so the operator's account becomes a
  // plain Administrator instead and the summary says so.
  const otherOwner = await db.staff.findFirst({ where: { tenantId: tenant.id, isOwner: true }, select: { id: true, email: true } });
  const ownerWasTaken = Boolean(otherOwner && otherOwner.email.toLowerCase() !== ownerEmail);

  const existingStaff = await db.staff.findFirst({ where: { tenantId: tenant.id, email: ownerEmail }, select: { id: true, name: true, email: true, isOwner: true } });
  const owner =
    existingStaff ??
    (await db.staff.create({
      data: {
        tenantId: tenant.id,
        name: input.ownerName,
        email: ownerEmail,
        phone: input.contactPhone ?? '',
        roleId: adminRole.id,
        isOwner: !ownerWasTaken,
        title: 'Owner',
        // Invited, and passwordHash stays null: they choose their own password
        // when they redeem the activation link. We never hold it.
        status: StaffStatus.Invited,
        joinedOn: fromISODate(today),
      },
      select: { id: true, name: true, email: true, isOwner: true },
    }));

  const activation = await issueActivationToken(db, tenant.id, owner, input.activationTtlHours ?? DEFAULT_ACTIVATION_HOURS);

  return {
    tenantId: tenant.id,
    instituteCode: tenant.instituteCode,
    name: tenant.name,
    academicYear: tenant.academicYear,
    campusName: campusCount === 0 ? campusName : (await db.campus.findFirst({ where: { tenantId: tenant.id }, select: { name: true } }))?.name ?? campusName,
    roles,
    owner,
    activation,
    ownerWasTaken,
  };
}

/**
 * Writes the same `one_time_codes` row `OtpService.issueLinkToken` writes: the raw
 * token is returned once and only its SHA-256 hash is stored, so the link in the
 * handover email is the only copy that exists.
 */
async function issueActivationToken(
  db: PrismaClient,
  tenantId: string,
  staff: { id: string; email: string },
  ttlHours: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);

  // Only the newest link stays valid, matching the endpoint's behaviour.
  await db.oneTimeCode.updateMany({
    where: { tenantId, purpose: OneTimeCodePurpose.portal_activation, destinationKey: staff.email.toLowerCase(), consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await db.oneTimeCode.create({
    data: {
      tenantId,
      purpose: OneTimeCodePurpose.portal_activation,
      channel: OneTimeCodeChannel.email,
      destination: staff.email,
      destinationKey: staff.email.toLowerCase(),
      codeHash: createHash('sha256').update(token).digest('hex'),
      principalType: PrincipalType.staff,
      staffId: staff.id,
      maxAttempts: 1,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/** The link an operator pastes into the handover email. */
export function activationUrl(webAppUrl: string, token: string): string {
  return `${webAppUrl.replace(/\/$/, '')}/activate?token=${encodeURIComponent(token)}`;
}
