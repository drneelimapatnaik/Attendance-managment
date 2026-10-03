/**
 * Role management — the institute's own staff roles.
 *
 * Every institute starts with two system roles (Administrator and Faculty) and may
 * create as many of its own as it likes from the fixed capability catalogue. The
 * rules this service enforces, all server-side because the UI cannot be trusted
 * with any of them:
 *
 *   1. system roles (`admin`, `faculty`) cannot be deleted or re-keyed, and may be
 *      renamed only to a name no other role is using;
 *   2. the `admin` role can never lose `faculty.manage` or `settings.manage` —
 *      that would lock the institute out of its own role and settings screens;
 *   3. a role that is still assigned cannot be deleted: the caller is told how many
 *      people hold it and must pass `?reassignTo=<roleId>`;
 *   4. the institute must always keep at least one *active* administrator;
 *   5. nobody raises their own authority — a non-owner may not grant a capability
 *      they do not hold, and may not edit or delete the role they are standing on.
 *
 * The owner (Staff.isOwner) is exempt from rule 5 and holds every capability
 * implicitly; they are the account that set the institute up.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionResolverService } from '@/common/authz/permission-resolver.service';
import { sanitizePermissions, unknownPermissions, type Permission } from '@/common/authz/permissions';
import {
  countActiveAdminsAfter,
  escalatedPermissions,
  ROLE_KEY_PATTERN,
  slugifyRoleKey,
  type PendingChange,
  type RolePermissionSnapshot,
  type StaffRoleSnapshot,
} from '@/common/authz/role-rules';
import { ADMIN_REQUIRED_PERMISSIONS, RESERVED_ROLE_KEYS, SYSTEM_ROLES } from '@/common/authz/system-roles';
import { BadRequestError, ConflictError, ErrorCodes, ForbiddenError, NotFoundError } from '@/common/errors/app.error';
import { TENANT_PRISMA, type TenantPrisma } from '@/prisma/prisma.service';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import type { StaffPrincipal } from '@/auth/principal';
import { CreateRoleDto, UpdateRoleDto } from './dto/role-requests.dto';
import { RoleDto } from './dto/role-responses.dto';

/** The columns every mapper below needs. */
const ROLE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  permissions: true,
  isSystem: true,
  isDefault: true,
} as const;

export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  isDefault: boolean;
};

@Injectable()
export class RolesService {
  constructor(
    private readonly context: TenantContextService,
    private readonly resolver: PermissionResolverService,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
  ) {}

  // -------------------------------------------------------------- bootstrap

  /**
   * Makes sure the two built-in roles exist for the current tenant. Idempotent and
   * non-destructive: an institute that renamed "Administrator" to "Principal" keeps
   * its name, because an existing row is left exactly as it is.
   *
   * Called when a tenant is provisioned (see prisma/seed.ts) and again on every
   * `GET /roles`, so "the four role kinds always exist" holds however the tenant
   * row was created.
   */
  async ensureSystemRoles(): Promise<void> {
    const tenantId = this.context.requireTenantId();
    for (const definition of SYSTEM_ROLES) {
      const existing = await this.db.role.findFirst({ where: { key: definition.key }, select: { id: true } });
      if (existing) continue;
      await this.db.role.create({
        data: {
          // The extension injects this too; passing it makes it a cross-check.
          tenantId,
          key: definition.key,
          name: await this.freeName(definition.name),
          description: definition.description,
          permissions: [...definition.permissions],
          isSystem: true,
          isDefault: definition.isDefault,
        },
      });
    }
  }

  // ------------------------------------------------------------------ reads

  /** Every role of the institute, system roles first, with staff counts. */
  async list(): Promise<RoleDto[]> {
    await this.ensureSystemRoles();
    const rows = await this.db.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: { ...ROLE_SELECT, _count: { select: { staff: true } } },
    });
    return rows.map((row) => ({ ...toRoleDto(row), staffCount: row._count.staff }));
  }

  async findOne(id: string): Promise<RoleDto> {
    return toRoleDto(await this.requireRole(id));
  }

  // ----------------------------------------------------------------- writes

  async create(principal: StaffPrincipal, dto: CreateRoleDto): Promise<RoleDto> {
    const tenantId = this.context.requireTenantId();
    const permissions = await this.checkedPermissions(principal, dto.permissions, []);

    const key = dto.key ?? slugifyRoleKey(dto.name);
    if (!ROLE_KEY_PATTERN.test(key)) {
      throw new BadRequestError(
        `"${dto.name}" does not make a usable role key. Send an explicit \`key\` of lower case letters, digits and underscores.`,
        ErrorCodes.VALIDATION_FAILED,
      );
    }
    // The product owns these slugs: `admin`/`faculty` are the built-in staff roles
    // and `student`/`parent` are portal logins, not staff roles.
    if (RESERVED_ROLE_KEYS.includes(key)) {
      throw new ConflictError(`"${key}" is a built-in role key. Choose another key for your own role.`, ErrorCodes.ROLE_KEY_RESERVED);
    }
    // Name first: it is what the user typed, so a clash there is the more useful
    // message when a duplicate name also yields a duplicate derived key.
    await this.assertNameFree(dto.name);
    await this.assertKeyFree(key);

    const row = await this.db.role.create({
      data: {
        tenantId,
        key,
        name: dto.name,
        description: dto.description ?? '',
        permissions,
        // Only the two built-in roles are ever system roles; an institute's own
        // role is always deletable.
        isSystem: false,
        isDefault: false,
      },
      select: ROLE_SELECT,
    });

    if (dto.isDefault) await this.makeDefault(row.id);
    return toRoleDto({ ...row, isDefault: dto.isDefault === true });
  }

  async update(principal: StaffPrincipal, id: string, dto: UpdateRoleDto): Promise<RoleDto> {
    const role = await this.requireRole(id);
    this.assertNotOwnRole(principal, role.id, 'edit');

    const data: Prisma.RoleUpdateInput = {};

    if (dto.name !== undefined && dto.name !== role.name) {
      // A system role may be renamed — the label is the institute's — but not into
      // a collision with another role.
      await this.assertNameFree(dto.name, role.id);
      data.name = dto.name;
    }
    if (dto.description !== undefined) data.description = dto.description;

    if (dto.permissions !== undefined) {
      const permissions = await this.checkedPermissions(principal, dto.permissions, sanitizePermissions(role.permissions));
      if (role.isSystem && role.key === 'admin') {
        const stripped = ADMIN_REQUIRED_PERMISSIONS.filter((required) => !permissions.includes(required));
        if (stripped.length > 0) {
          throw new ConflictError(
            'The Administrator role must keep "Manage staff & roles" and "Institute settings" — otherwise nobody could ever change them again.',
            ErrorCodes.ROLE_SYSTEM_PROTECTED,
            { required: ADMIN_REQUIRED_PERMISSIONS, stripped },
          );
        }
      }
      await this.assertAdminRemains({ role: { id: role.id, permissions } });
      data.permissions = permissions;
    }

    const row = await this.db.role.update({ where: { id: role.id }, data, select: ROLE_SELECT });
    if (dto.isDefault === true && !row.isDefault) await this.makeDefault(row.id);
    if (dto.isDefault === false && row.isDefault) {
      await this.db.role.update({ where: { id: row.id }, data: { isDefault: false } });
    }
    return toRoleDto({ ...row, isDefault: dto.isDefault ?? row.isDefault });
  }

  /**
   * Deletes a role. A role nobody holds goes straight away; a role that is still
   * assigned needs `reassignTo`, and the staff are moved first so no row is ever
   * left pointing at a role that no longer exists (the FK is Restrict, so the
   * database would refuse anyway).
   */
  async remove(principal: StaffPrincipal, id: string, reassignTo?: string): Promise<{ deleted: true; reassigned: number }> {
    const role = await this.requireRole(id);
    this.assertNotOwnRole(principal, role.id, 'delete');

    if (role.isSystem) {
      throw new ConflictError(
        `"${role.name}" is one of EduTrack's built-in roles and cannot be deleted. Rename it or change what it may do instead.`,
        ErrorCodes.ROLE_SYSTEM_PROTECTED,
      );
    }

    const staffCount = await this.db.staff.count({ where: { roleId: role.id } });
    if (staffCount > 0 && !reassignTo) {
      throw new ConflictError(
        `${staffCount} ${staffCount === 1 ? 'person holds' : 'people hold'} this role. Pass ?reassignTo=<roleId> to move them to another role first.`,
        ErrorCodes.ROLE_IN_USE,
        { staffCount, roleId: role.id },
      );
    }

    let reassigned = 0;
    if (staffCount > 0 && reassignTo) {
      if (reassignTo === role.id) {
        throw new BadRequestError('Choose a different role to move these staff members to.', ErrorCodes.VALIDATION_FAILED);
      }
      // 404s when the target belongs to another institute: the read is tenant-scoped.
      const target = await this.requireRole(reassignTo);
      await this.assertAdminRemains({ removedRoleId: role.id, reassign: { fromRoleId: role.id, toRoleId: target.id } });

      const moved = await this.db.staff.updateMany({ where: { roleId: role.id }, data: { roleId: target.id } });
      reassigned = moved.count;
    } else {
      await this.assertAdminRemains({ removedRoleId: role.id });
    }

    await this.db.role.delete({ where: { id: role.id } });
    return { deleted: true, reassigned };
  }

  // --------------------------------------------- shared with the staff module

  /** Tenant-scoped lookup: another institute's role id is simply "not found". */
  async requireRole(id: string): Promise<RoleRow> {
    const row = await this.db.role.findFirst({ where: { id }, select: ROLE_SELECT });
    if (!row) throw new NotFoundError('No such role.');
    return row;
  }

  /**
   * The other half of "nobody raises their own authority": handing someone a role
   * is handing them its capabilities, so a non-owner may only assign a role whose
   * capabilities they already hold themselves.
   */
  async assertCanAssignRole(principal: StaffPrincipal, role: Pick<RoleRow, 'id' | 'name' | 'permissions'>): Promise<void> {
    const actor = await this.resolver.resolve(principal);
    if (actor.isOwner) return;
    const escalated = escalatedPermissions(sanitizePermissions(role.permissions), actor.permissions);
    if (escalated.length === 0) return;
    throw new ForbiddenError(
      `You cannot assign "${role.name}": it grants permissions you do not hold yourself.`,
      ErrorCodes.PRIVILEGE_ESCALATION,
      { roleId: role.id, escalated },
    );
  }

  // -------------------------------------------------------------- internals

  /**
   * Validates a requested capability set and refuses privilege escalation.
   * `alreadyGranted` is the role's current set, so leaving an existing capability
   * untouched is never treated as granting it.
   */
  private async checkedPermissions(
    principal: StaffPrincipal,
    requested: readonly string[],
    alreadyGranted: readonly Permission[],
  ): Promise<Permission[]> {
    const unknown = unknownPermissions(requested);
    if (unknown.length > 0) {
      throw new BadRequestError(
        `Unknown permission${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Use the keys from GET /permissions.`,
        ErrorCodes.VALIDATION_FAILED,
        { unknown },
      );
    }
    const permissions = sanitizePermissions(requested);

    const actor = await this.resolver.resolve(principal);
    if (actor.isOwner) return permissions;

    const escalated = escalatedPermissions(permissions, actor.permissions, alreadyGranted);
    if (escalated.length > 0) {
      throw new ForbiddenError('You cannot give a role a permission you do not hold yourself.', ErrorCodes.PRIVILEGE_ESCALATION, {
        escalated,
      });
    }
    return permissions;
  }

  /** Nobody edits the role they are standing on — except the owner. */
  private assertNotOwnRole(principal: StaffPrincipal, roleId: string, action: 'edit' | 'delete'): void {
    if (principal.isOwner || principal.roleId !== roleId) return;
    throw new ForbiddenError(
      `You cannot ${action} your own role. Ask another administrator, or the account that set this institute up.`,
      ErrorCodes.PRIVILEGE_ESCALATION,
      { roleId },
    );
  }

  private async assertKeyFree(key: string): Promise<void> {
    const clash = await this.db.role.findFirst({ where: { key }, select: { id: true, name: true } });
    if (clash) {
      throw new ConflictError(`The role key "${key}" is already used by "${clash.name}".`, ErrorCodes.ROLE_KEY_TAKEN, { key });
    }
  }

  private async assertNameFree(name: string, exceptRoleId?: string): Promise<void> {
    const clash = await this.db.role.findFirst({
      // Case-insensitive: "Accountant" and "accountant" are the same label to a human.
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptRoleId ? { NOT: { id: exceptRoleId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictError(`Another role is already called "${name}".`, ErrorCodes.ROLE_NAME_TAKEN, { name });
  }

  /** Exactly one role may be the invite form's default. */
  private async makeDefault(roleId: string): Promise<void> {
    await this.db.role.updateMany({ where: { isDefault: true, NOT: { id: roleId } }, data: { isDefault: false } });
    await this.db.role.update({ where: { id: roleId }, data: { isDefault: true } });
  }

  /** A name that is free, for bootstrap only: "Faculty" → "Faculty (built-in)". */
  private async freeName(name: string): Promise<string> {
    const clash = await this.db.role.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
    return clash ? `${name} (built-in)` : name;
  }

  /**
   * The institute must keep somebody who can manage staff and settings. The check
   * builds the post-change roster in memory (see role-rules.ts) rather than trying
   * to express it as a query — a tenant has tens of staff, and a readable rule
   * beats a clever one here.
   */
  async assertAdminRemains(change: PendingChange): Promise<void> {
    const { staff, roles } = await this.snapshot();
    if (countActiveAdminsAfter(staff, roles, change) > 0) return;
    throw new ConflictError(
      'This would leave the institute with no active administrator. Give someone else full access first.',
      ErrorCodes.ROLE_LAST_ADMIN,
    );
  }

  /** The two small tables the admin invariant is computed from. */
  private async snapshot(): Promise<{ staff: StaffRoleSnapshot[]; roles: RolePermissionSnapshot[] }> {
    const [staff, roles] = await Promise.all([
      this.db.staff.findMany({ select: { id: true, roleId: true, isOwner: true, status: true } }),
      this.db.role.findMany({ select: { id: true, permissions: true } }),
    ]);
    return {
      staff,
      roles: roles.map((role) => ({ id: role.id, permissions: sanitizePermissions(role.permissions) })),
    };
  }
}

/** Row → the client's `Role` object. `permissions` is sanitised on the way out. */
export function toRoleDto(row: RoleRow): RoleDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    permissions: sanitizePermissions(row.permissions),
    isSystem: row.isSystem,
    isDefault: row.isDefault,
  };
}
