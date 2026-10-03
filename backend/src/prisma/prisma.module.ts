/**
 * Database access module (global).
 *
 * Provides the raw `PrismaService` and the tenant-scoped `TENANT_PRISMA` client.
 * Global so feature modules can inject either without importing anything.
 */
import { Global, Module } from '@nestjs/common';
import { TenancyModule } from '@/tenancy/tenancy.module';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { createTenantScopedClient, PrismaService, TENANT_PRISMA } from './prisma.service';

@Global()
@Module({
  imports: [TenancyModule],
  providers: [
    PrismaService,
    {
      provide: TENANT_PRISMA,
      inject: [PrismaService, TenantContextService],
      useFactory: createTenantScopedClient,
    },
  ],
  exports: [PrismaService, TENANT_PRISMA],
})
export class PrismaModule {}
