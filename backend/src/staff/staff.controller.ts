/**
 * Staff endpoints (mounted at /api/v1/staff).
 *
 * Reads need only a staff session — batch and attendance screens list colleagues.
 * Everything that changes the team needs `faculty.manage`, and then the rules in
 * StaffService apply: the owner is protected, nobody may hand out more authority
 * than they hold, and the institute must keep an active administrator.
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Permissions } from '@/common/decorators/auth.decorators';
import type { Principal } from '@/auth/principal';
import { requireStaff } from '@/roles/roles.controller';
import { InviteStaffDto, StaffQueryDto, UpdateStaffDto } from './dto/staff-requests.dto';
import { StaffDto, StaffInviteResultDto, StaffPageDto } from './dto/staff.dto';
import { StaffService } from './staff.service';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @ApiOperation({
    summary: 'The staff roster',
    description: 'Filter by `roleId` or `roleKey`, by `status`, and by a `search` over name, email, phone and title. Paginated.',
  })
  @ApiResponse({ status: 200, type: StaffPageDto })
  list(@Query() query: StaffQueryDto): Promise<StaffPageDto> {
    return this.staff.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One staff member' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: StaffDto })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<StaffDto> {
    return this.staff.findOne(id);
  }

  @Post()
  @Permissions('faculty.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Invite a staff member',
    description:
      'Creates an `Invited` member with no password and emails a single-use activation link, redeemed at POST /auth/portal/activate.',
  })
  @ApiResponse({ status: 201, type: StaffInviteResultDto })
  @ApiResponse({ status: 403, description: 'PRIVILEGE_ESCALATION — the role grants more than you hold.' })
  @ApiResponse({ status: 409, description: 'STAFF_EMAIL_TAKEN' })
  invite(@CurrentUser() principal: Principal, @Body() dto: InviteStaffDto): Promise<StaffInviteResultDto> {
    return this.staff.invite(requireStaff(principal), dto);
  }

  @Patch(':id')
  @Permissions('faculty.manage')
  @ApiOperation({
    summary: 'Edit a staff member, including their role',
    description: 'A non-owner cannot change their own role. The owner can be neither demoted nor deactivated.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: StaffDto })
  @ApiResponse({ status: 403, description: 'OWNER_PROTECTED | PRIVILEGE_ESCALATION' })
  @ApiResponse({ status: 409, description: 'STAFF_EMAIL_TAKEN | ROLE_LAST_ADMIN' })
  update(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto): Promise<StaffDto> {
    return this.staff.update(requireStaff(principal), id, dto);
  }

  @Post(':id/resend-invite')
  @Permissions('faculty.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send the invitation again', description: 'Issues a new link; the previous one stops working.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: StaffInviteResultDto })
  @ApiResponse({ status: 409, description: 'STAFF_ALREADY_ACTIVE — they have already set a password.' })
  resendInvite(@Param('id', ParseUUIDPipe) id: string): Promise<StaffInviteResultDto> {
    return this.staff.resendInvite(id);
  }

  @Delete(':id')
  @Permissions('faculty.manage')
  @ApiOperation({
    summary: 'Remove a staff member',
    description: 'Refused for the owner, for yourself, for anyone who still teaches a live batch, and for anyone with history on file.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: '{ "deleted": true }' })
  @ApiResponse({ status: 403, description: 'OWNER_PROTECTED' })
  @ApiResponse({ status: 409, description: 'STAFF_SELF_DELETE | STAFF_TEACHES_ACTIVE_BATCH | STAFF_HAS_HISTORY | ROLE_LAST_ADMIN' })
  remove(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string): Promise<{ deleted: true }> {
    return this.staff.remove(requireStaff(principal), id);
  }
}
