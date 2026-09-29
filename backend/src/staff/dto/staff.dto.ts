/**
 * The client's `Staff` object.
 *
 * It matches frontend/src/types/domain.ts field for field. The one change roles-as-
 * data brings is that `role` is no longer an enum string: a staff member carries
 * `roleId`, and the role itself is a `Role` object fetched from `GET /roles`.
 * `roleKey` and `roleName` are included so a list can be rendered without a second
 * lookup — `roleKey` is the stable slug (`admin`, `faculty`, `accountant`),
 * `roleName` the institute's own label.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { StaffStatus } from '@prisma/client';

export class StaffDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() phone!: string;

  @ApiProperty({ format: 'uuid', description: 'The role this staff member holds — see GET /roles.' })
  roleId!: string;

  @ApiProperty({ example: 'faculty', description: 'Stable slug of the role, for convenience.' })
  roleKey!: string;

  @ApiProperty({ example: 'Faculty', description: "The institute's label for the role, for convenience." })
  roleName!: string;

  @ApiProperty({ description: 'The account that set the institute up: holds every permission and cannot be removed or demoted.' })
  isOwner!: boolean;

  @ApiProperty() title!: string;
  @ApiProperty({ type: [String] }) subjectIds!: string[];
  @ApiProperty({ enum: ['Active', 'Inactive', 'Invited'] }) status!: StaffStatus;
  @ApiProperty({ example: '2019-04-01' }) joinedOn!: string;
  @ApiPropertyOptional() avatarUrl?: string;
  @ApiPropertyOptional({ example: '2026-09-23T09:15:00.000Z' }) lastActiveAt?: string;
}

/** GET /staff — one page of the roster. */
export class StaffPageDto {
  @ApiProperty({ type: [StaffDto] }) items!: StaffDto[];
  @ApiProperty({ example: 9, description: 'Matching rows, ignoring pagination.' }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 25 }) pageSize!: number;
}

/** POST /staff and POST /staff/:id/resend-invite. */
export class StaffInviteResultDto {
  @ApiProperty({ type: StaffDto }) staff!: StaffDto;

  @ApiProperty({ example: '2026-10-06T10:15:00.000Z', description: 'When the invitation link stops working.' })
  invitationExpiresAt!: string;

  @ApiPropertyOptional({
    description: 'Development only: the activation link, so the flow can be finished without a mail server.',
  })
  devActivationUrl?: string;
}
