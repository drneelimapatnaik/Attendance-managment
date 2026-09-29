/**
 * Response shapes for the role and permission endpoints.
 *
 * `RoleDto` is the client's `Role` object — `{ id, key, name, description,
 * permissions, isSystem }` — plus two fields the management screen needs:
 * `isDefault` (which role the invite form pre-selects) and `staffCount` (how many
 * people hold it, so the UI can warn before a delete).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PERMISSIONS, type Permission } from '@/common/authz/permissions';

export class RoleDto {
  @ApiProperty() id!: string;

  @ApiProperty({ example: 'accountant', description: 'Stable slug. `admin` and `faculty` are the built-in staff roles.' })
  key!: string;

  @ApiProperty({ example: 'Accountant', description: "The institute's own label." }) name!: string;

  @ApiProperty({ example: 'Handles fees and receipts.' }) description!: string;

  @ApiProperty({ isArray: true, enum: PERMISSIONS }) permissions!: Permission[];

  @ApiProperty({ description: 'True for the built-in admin and faculty roles: they cannot be deleted.' })
  isSystem!: boolean;

  @ApiProperty({ description: 'Pre-selected in the staff-invite form.' }) isDefault!: boolean;

  @ApiPropertyOptional({ description: 'How many staff members hold this role. Present on GET /roles.' })
  staffCount?: number;
}

/** One capability in the picker. */
export class PermissionOptionDto {
  @ApiProperty({ example: 'fees.collect' }) key!: Permission;
  @ApiProperty({ example: 'Collect fees & issue receipts' }) label!: string;
  @ApiProperty({ example: 'Record a payment and issue a receipt.' }) description!: string;
}

/** Capabilities grouped by the area they belong to, in catalogue order. */
export class PermissionGroupDto {
  @ApiProperty({ example: 'fees', description: 'The part of the key before the dot.' }) area!: string;
  @ApiProperty({ example: 'Fees' }) label!: string;
  @ApiProperty({ type: [PermissionOptionDto] }) permissions!: PermissionOptionDto[];
}

/** GET /permissions — the whole catalogue, so the UI hardcodes nothing. */
export class PermissionCatalogueDto {
  @ApiProperty({ type: [PermissionGroupDto] }) groups!: PermissionGroupDto[];

  @ApiProperty({ isArray: true, enum: PERMISSIONS, description: 'Every key, flat, in catalogue order.' })
  all!: Permission[];
}
