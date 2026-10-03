/**
 * Prisma connections.
 *
 * Two clients are exported on purpose:
 *
 *   PrismaService  — the raw client. Use it only for genuinely global tables
 *                    (Tenant lookup by institute code) and for health checks.
 *   TENANT_PRISMA  — the same connection wrapped in the tenant-scope extension.
 *                    Every domain module injects this one; it cannot read or
 *                    write another tenant's rows.
 *
 * Both share a single connection pool: `$extends` returns a view over the same
 * underlying client, it does not open a second pool.
 */
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '@/config/app-config';
import { TenantContextService } from '@/tenancy/tenant-context.service';
import { tenantScopeExtension } from './tenant-scope';

/** DI token for the tenant-scoped client. */
export const TENANT_PRISMA = 'TENANT_PRISMA';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      datasources: { db: { url: config.databaseUrl } },
      // Query logging stays off in every environment: those lines would contain
      // password hashes, refresh-token hashes and OTP rows.
      log: ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Factory for the tenant-scoped client (registered in PrismaModule). */
export function createTenantScopedClient(prisma: PrismaService, tenants: TenantContextService) {
  return prisma.$extends(tenantScopeExtension(tenants));
}

/** The type domain services inject: a PrismaClient that always filters by tenant. */
export type TenantPrisma = ReturnType<typeof createTenantScopedClient>;
