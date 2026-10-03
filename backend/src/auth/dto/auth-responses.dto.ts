/**
 * Response shapes for the auth routes.
 *
 * `user` deliberately matches the client's `Staff` type (frontend/src/types/domain.ts)
 * field for field, and `token` is a copy of `accessToken` so the existing
 * `services/auth.ts` works unchanged. Dates are `YYYY-MM-DD`, instants are full ISO.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Permission } from '@/common/authz/permissions';
import { StaffDto } from '@/staff/dto/staff.dto';
import type { PrincipalKind } from '../principal';

/** The institute the session belongs to. */
export class InstituteSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'APEX' }) code!: string;
  @ApiProperty({ example: 'Apex Academy' }) name!: string;
}

/**
 * The role a staff session is signed in as. A trimmed `Role` object: enough for
 * the client to show "signed in as Accountant" without calling `GET /roles`.
 */
export class SessionRoleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'accountant' }) key!: string;
  @ApiProperty({ example: 'Accountant' }) name!: string;
  @ApiProperty({ isArray: true, description: "The role's own permissions (an owner's extra reach is in `permissions`)." })
  permissions!: Permission[];
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
  @ApiProperty({ description: 'A StaffDto for staff, a PortalUserDto for student/parent logins.' })
  user!: StaffDto | PortalUserDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Staff only — what this account may do, read from its role row (owners hold everything).',
  })
  permissions?: Permission[];
}

/** GET /auth/me — the session the bearer token represents. */
export class MeDto {
  @ApiProperty({ enum: ['staff', 'student', 'parent'] }) principal!: PrincipalKind;
  @ApiProperty({ type: InstituteSummaryDto }) institute!: InstituteSummaryDto;
  @ApiProperty() user!: StaffDto | PortalUserDto;
  @ApiPropertyOptional({ type: [String] }) permissions?: Permission[];
  @ApiPropertyOptional({ type: SessionRoleDto, description: 'Staff only — the role this session holds.' })
  role?: SessionRoleDto;
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
