/**
 * Request bodies and query strings for the staff endpoints.
 *
 * Shape only: the rules (who may assign which role, the last-admin invariant, the
 * owner's protection) live in StaffService, because they need the database and the
 * caller's own authority.
 */
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StaffStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class InviteStaffDto {
  @ApiProperty({ example: 'Ms. Kavya Nair' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Enter the staff member’s name.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'accounts@apexacademy.in', description: 'The invitation is sent here, and it is their sign-in id.' })
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(160)
  email!: string;

  @ApiPropertyOptional({ example: '+91 98457 88990' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[\d+\-\s()]{8,20}$/, { message: 'Enter a valid mobile number.' })
  phone?: string;

  @ApiProperty({ format: 'uuid', description: 'A role from GET /roles.' })
  @IsUUID('4', { message: 'Choose a role.' })
  roleId!: string;

  @ApiPropertyOptional({ example: 'Accounts Executive', description: 'Free-text job title shown on the staff card.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Subjects this person teaches.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  subjectIds?: string[];
}

/** PATCH /staff/:id — changes only what it names, including the role. */
export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[\d+\-\s()]{8,20}$/, { message: 'Enter a valid mobile number.' })
  phone?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', description: 'Replaces the current list.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  subjectIds?: string[];

  @ApiPropertyOptional({ enum: StaffStatus, description: 'Active or Inactive. An invited member becomes Active by accepting the invite.' })
  @IsOptional()
  @IsEnum(StaffStatus, { message: 'Status must be Active, Inactive or Invited.' })
  status?: StaffStatus;
}

/** GET /staff — filtering and pagination. */
export class StaffQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only staff holding this role.' })
  @IsOptional()
  @IsUUID('4')
  roleId?: string;

  @ApiPropertyOptional({ example: 'faculty', description: 'Same filter by the role’s stable slug.' })
  @IsOptional()
  @Transform(lower)
  @IsString()
  @MaxLength(40)
  roleKey?: string;

  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @ApiPropertyOptional({ description: 'Case-insensitive match on name, email, phone or title.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  // Query strings are text; the global pipe does not convert implicitly.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 25, default: 25, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
