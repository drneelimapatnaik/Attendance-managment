/**
 * Request bodies for the role endpoints.
 *
 * The global ValidationPipe runs with `whitelist` + `forbidNonWhitelisted`, so an
 * undeclared property is a 400 rather than a silent no-op. Shape is checked here;
 * the *rules* (unknown capability, reserved key, privilege escalation, the
 * last-admin invariant) are enforced in RolesService, because they need the
 * database and the caller's own authority.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PERMISSIONS } from '@/common/authz/permissions';
import { ROLE_KEY_PATTERN } from '@/common/authz/role-rules';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const lowerTrim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class CreateRoleDto {
  @ApiProperty({ example: 'Accountant', description: 'The label the institute uses for this role.' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Give the role a name of at least 2 characters.' })
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({
    example: 'accountant',
    description: 'Stable slug. Derived from the name when omitted. Lower case letters, digits and underscores.',
  })
  @IsOptional()
  @Transform(lowerTrim)
  @IsString()
  @MaxLength(40)
  @Matches(ROLE_KEY_PATTERN, { message: 'A role key is lower case and may contain letters, digits and underscores only.' })
  key?: string;

  @ApiPropertyOptional({ example: 'Handles fees and receipts.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(280)
  description?: string;

  @ApiProperty({
    isArray: true,
    enum: PERMISSIONS,
    example: ['dashboard.view', 'fees.view', 'fees.collect'],
    description: 'Capability keys from GET /permissions. Unknown keys are rejected.',
  })
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({ description: 'Pre-select this role in the staff-invite form. At most one role per institute.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** Every field is optional: PATCH changes only what it names. */
export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Principal' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Give the role a name of at least 2 characters.' })
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(280)
  description?: string;

  @ApiPropertyOptional({ isArray: true, enum: PERMISSIONS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
