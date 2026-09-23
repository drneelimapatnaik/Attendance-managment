/**
 * Tenant lookup module. Separate from TenancyModule so that PrismaModule (which
 * needs the tenant *context*) never has to depend on the database layer twice.
 */
import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';

@Module({
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
