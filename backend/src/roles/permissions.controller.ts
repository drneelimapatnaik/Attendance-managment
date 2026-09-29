/**
 * The capability catalogue (mounted at /api/v1/permissions).
 *
 * One read-only endpoint so the permission picker on the role screen can be
 * rendered from the server's list instead of a hardcoded copy: the institute
 * chooses which of these a role holds, and the set of capabilities itself is the
 * product's, not theirs. Any staff session may read it.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ALL_PERMISSIONS,
  PERMISSION_AREA_LABELS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_LABELS,
  permissionArea,
  type Permission,
} from '@/common/authz/permissions';
import { PermissionCatalogueDto, PermissionGroupDto } from './dto/role-responses.dto';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  @Get()
  @ApiOperation({
    summary: 'The capability catalogue',
    description: 'Every permission a role may hold, with human labels and descriptions, grouped by area and in a stable order.',
  })
  @ApiResponse({ status: 200, type: PermissionCatalogueDto })
  catalogue(): PermissionCatalogueDto {
    return { groups: groupedPermissions(), all: [...ALL_PERMISSIONS] };
  }
}

/**
 * Groups the flat catalogue by the part of the key before the dot, preserving
 * catalogue order both between groups and inside them — the picker's reading order
 * is part of the contract, so it must not depend on object key iteration.
 */
export function groupedPermissions(): PermissionGroupDto[] {
  const groups: PermissionGroupDto[] = [];
  const byArea = new Map<string, PermissionGroupDto>();

  for (const key of ALL_PERMISSIONS) {
    const area = permissionArea(key);
    let group = byArea.get(area);
    if (!group) {
      group = { area, label: PERMISSION_AREA_LABELS[area] ?? area, permissions: [] };
      byArea.set(area, group);
      groups.push(group);
    }
    group.permissions.push({
      key: key as Permission,
      label: PERMISSION_LABELS[key],
      description: PERMISSION_DESCRIPTIONS[key],
    });
  }

  return groups;
}
