/**
 * Role endpoints (mounted at /api/v1/roles).
 *
 * Reads need only a staff session — every screen shows role names, so a faculty
 * member listing their colleagues must be able to resolve them. Writes need
 * `faculty.manage`, and are then subject to the rules in RolesService: system
 * roles are protected, a role in use needs a reassignment target, the institute
 * must keep an active administrator, and nobody may raise their own authority.
 */
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Permissions } from '@/common/decorators/auth.decorators';
import { ErrorCodes, ForbiddenError } from '@/common/errors/app.error';
import { isStaff, type Principal, type StaffPrincipal } from '@/auth/principal';
import { CreateRoleDto, UpdateRoleDto } from './dto/role-requests.dto';
import { RoleDto } from './dto/role-responses.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiOperation({
    summary: 'Every role of this institute',
    description:
      'System roles first, then the institute’s own, each with `staffCount`. Any staff session may read this; the two built-in roles are created on the fly if they are somehow missing.',
  })
  @ApiResponse({ status: 200, type: [RoleDto] })
  list(): Promise<RoleDto[]> {
    return this.roles.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One role' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: RoleDto })
  @ApiResponse({ status: 404, description: 'NOT_FOUND — no such role in this institute.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<RoleDto> {
    return this.roles.findOne(id);
  }

  @Post()
  @Permissions('faculty.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a role',
    description: 'The key is derived from the name when omitted. Permissions must be keys from GET /permissions.',
  })
  @ApiResponse({ status: 201, type: RoleDto })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED — unknown permission key, or a name that yields no usable key.' })
  @ApiResponse({ status: 403, description: 'PRIVILEGE_ESCALATION — you granted a permission you do not hold.' })
  @ApiResponse({ status: 409, description: 'ROLE_KEY_TAKEN | ROLE_NAME_TAKEN | ROLE_KEY_RESERVED' })
  create(@CurrentUser() principal: Principal, @Body() dto: CreateRoleDto): Promise<RoleDto> {
    return this.roles.create(requireStaff(principal), dto);
  }

  @Patch(':id')
  @Permissions('faculty.manage')
  @ApiOperation({
    summary: 'Rename a role or change what it may do',
    description:
      'A system role may be renamed but not re-keyed, and the Administrator role may never lose "Manage staff & roles" or "Institute settings".',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: RoleDto })
  @ApiResponse({ status: 403, description: 'PRIVILEGE_ESCALATION — your own role, or a permission you do not hold.' })
  @ApiResponse({ status: 409, description: 'ROLE_NAME_TAKEN | ROLE_SYSTEM_PROTECTED | ROLE_LAST_ADMIN' })
  update(@CurrentUser() principal: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto): Promise<RoleDto> {
    return this.roles.update(requireStaff(principal), id, dto);
  }

  @Delete(':id')
  @Permissions('faculty.manage')
  @ApiOperation({
    summary: 'Delete a role',
    description:
      'Refused for a system role. A role that is still assigned returns 409 ROLE_IN_USE with `details.staffCount`; repeat the call with `?reassignTo=<roleId>` to move those staff and delete it.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiQuery({ name: 'reassignTo', required: false, type: String, description: 'Role (uuid) to move the current holders to.' })
  @ApiResponse({ status: 200, description: '{ "deleted": true, "reassigned": 3 }' })
  @ApiResponse({ status: 409, description: 'ROLE_SYSTEM_PROTECTED | ROLE_IN_USE | ROLE_LAST_ADMIN' })
  remove(
    @CurrentUser() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reassignTo', new ParseUUIDPipe({ optional: true })) reassignTo?: string,
  ): Promise<{ deleted: true; reassigned: number }> {
    return this.roles.remove(requireStaff(principal), id, reassignTo);
  }
}

/**
 * Narrows the principal for handlers that need staff identity. The guards already
 * guarantee this for permission-protected routes; the check keeps the type honest
 * (and would catch a route that lost its @Permissions decorator).
 */
export function requireStaff(principal: Principal): StaffPrincipal {
  if (!isStaff(principal)) {
    throw new ForbiddenError('This area is only available to institute staff.', ErrorCodes.PERMISSION_DENIED);
  }
  return principal;
}
