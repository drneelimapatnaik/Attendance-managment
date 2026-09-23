/**
 * Response shapes for the auth routes.
 *
 * `user` deliberately matches the client's `Staff` type (frontend/src/types/domain.ts)
 * field for field, and `token` is a copy of `accessToken` so the existing
 * `services/auth.ts` works unchanged. Dates are `YYYY-MM-DD`, instants are full ISO.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Role, StaffStatus } from '@prisma/client';
import type { Permission } from '@/common/authz/permissions';
import type { PrincipalKind } from '../principal';

/** The institute the session belongs to. */
export class InstituteSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'APEX' }) code!: string;
  @ApiProperty({ example: 'Apex Academy' }) name!: string;
}

/** Mirrors the client's `Staff` interface. */
export class StaffUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ enum: ['owner', 'admin', 'faculty', 'accountant', 'front_desk'] }) role!: Role;
  @ApiProperty() title!: string;
  @ApiProperty({ type: [String] }) subjectIds!: string[];
  @ApiProperty({ enum: ['Active', 'Inactive', 'Invited'] }) status!: StaffStatus;
  @ApiProperty({ example: '2019-04-01' }) joinedOn!: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiPropertyOptional({ example: '2026-09-23T09:15:00.000Z' }) lastActiveAt?: string;
}

/** One of the students a portal login may read. */
export class PortalStudentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'STU-1042' }) studentCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'Grade 10' }) grade!: string;
  @ApiPropertyOptional() photoUrl?: string;
}

/** Mirrors the client's `PortalAccount`, minus everything secret. */
export class PortalUserDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['student', 'parent'] }) role!: 'student' | 'parent';
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'STU-1042' }) loginId!: string;
  @ApiPropertyOptional() phone?: string;
  @ApiPropertyOptional() email?: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ enum: ['otp', 'password'] }) authMethod!: 'otp' | 'password';
  @ApiProperty({ enum: ['Invited', 'Active', 'Disabled'] }) status!: string;
  @ApiProperty({ type: [String] }) studentIds!: string[];
  @ApiProperty({ type: [PortalStudentDto] }) students!: PortalStudentDto[];
  @ApiProperty() notify!: { attendance: boolean; fees: boolean; results: boolean };
  @ApiPropertyOptional() lastLoginAt?: string;
}

/** What every successful sign-in returns. */
export class AuthSessionDto {
  @ApiProperty({ description: 'Alias of accessToken, for the existing web client.' })
  token!: string;

  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: 'Bearer';
  @ApiProperty({ example: 900, description: 'Access-token lifetime in seconds.' }) expiresIn!: number;
  @ApiProperty({ example: '2026-10-23T09:15:00.000Z' }) refreshExpiresAt!: string;
  @ApiProperty({ enum: ['staff', 'student', 'parent'] }) principal!: PrincipalKind;
  @ApiProperty({ type: InstituteSummaryDto }) institute!: InstituteSummaryDto;
  @ApiProperty({ description: 'A StaffUserDto for staff, a PortalUserDto for student/parent logins.' })
  user!: StaffUserDto | PortalUserDto;

  @ApiPropertyOptional({ type: [String], description: 'Staff only — what this role may do.' })
  permissions?: Permission[];
}

/** GET /auth/me — the session the bearer token represents. */
export class MeDto {
  @ApiProperty({ enum: ['staff', 'student', 'parent'] }) principal!: PrincipalKind;
  @ApiProperty({ type: InstituteSummaryDto }) institute!: InstituteSummaryDto;
  @ApiProperty() user!: StaffUserDto | PortalUserDto;
  @ApiPropertyOptional({ type: [String] }) permissions?: Permission[];
}

/** POST /auth/parent/otp/request */
export class OtpRequestedDto {
  @ApiProperty({ description: 'Always true — the API never reveals whether the number is registered.' })
  sent!: boolean;

  @ApiProperty({ example: 300 }) expiresInSeconds!: number;

  @ApiPropertyOptional({ example: '••••• 43210' }) sentTo?: string;

  @ApiPropertyOptional({ description: 'Development only: the code, so the demo works without an SMS gateway.' })
  devCode?: string;
}

/** POST /auth/password/forgot — always 202, whatever the identifier was. */
export class AcceptedDto {
  @ApiProperty({ example: true }) accepted!: boolean;

  @ApiProperty({ example: 'If that account exists, we have sent a recovery link.' }) message!: string;

  @ApiPropertyOptional({ description: 'Development only: the reset link, so the demo works without a mail server.' })
  devResetUrl?: string;
}
