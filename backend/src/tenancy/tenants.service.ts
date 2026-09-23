/**
 * Tenant lookup by institute code.
 *
 * `Tenant` is the one table that is *not* tenant-owned, so it is read through the
 * raw Prisma client inside a system context. Results are cached briefly: the code
 * is resolved on every sign-in and OTP request, and it changes approximately never.
 */
import { Injectable } from '@nestjs/common';
import { ErrorCodes, ForbiddenError, NotFoundError } from '@/common/errors/app.error';
import { PrismaService } from '@/prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

export interface ResolvedTenant {
  id: string;
  instituteCode: string;
  name: string;
  active: boolean;
}

/** Cache entries live this long. Short enough that suspending a tenant takes effect fast. */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class TenantsService {
  private readonly cache = new Map<string, { value: ResolvedTenant; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  /** Returns the tenant for an institute code, or null when there is none. */
  async findByCode(instituteCode: string): Promise<ResolvedTenant | null> {
    const code = instituteCode.trim().toUpperCase();
    if (!code) return null;

    const cached = this.cache.get(code);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    // Tenant rows are global; the extension would otherwise demand a tenant id.
    const tenant = await this.context.runAsSystem(() =>
      this.prisma.tenant.findUnique({
        where: { instituteCode: code },
        select: { id: true, instituteCode: true, name: true, active: true },
      }),
    );
    if (!tenant) return null;

    this.cache.set(code, { value: tenant, expiresAt: Date.now() + CACHE_TTL_MS });
    return tenant;
  }

  /**
   * Like `findByCode` but throws the right error for an API caller.
   * Used by every unauthenticated auth route.
   */
  async requireByCode(instituteCode: string): Promise<ResolvedTenant> {
    const tenant = await this.findByCode(instituteCode);
    if (!tenant) throw new NotFoundError('No institute found with that code.', ErrorCodes.TENANT_NOT_FOUND);
    if (!tenant.active) throw new ForbiddenError('This institute is not active. Contact EduTrack support.', ErrorCodes.TENANT_SUSPENDED);
    return tenant;
  }

  /** Clears the cache (used after tenant settings change, and in tests). */
  invalidate(instituteCode?: string): void {
    if (instituteCode) this.cache.delete(instituteCode.trim().toUpperCase());
    else this.cache.clear();
  }
}
