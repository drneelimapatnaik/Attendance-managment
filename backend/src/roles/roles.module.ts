/**
 * Role management module: /api/v1/roles and the /api/v1/permissions catalogue.
 *
 * RolesService is exported because the staff module needs it (an invite names a
 * role, and a role change has to respect the same rules).
 */
import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController, PermissionsController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
