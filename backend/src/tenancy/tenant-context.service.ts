/**
 * Ambient tenant context.
 *
 * Multi-tenancy must not depend on every caller remembering to pass a tenant id
 * down the stack. Instead each request runs inside an AsyncLocalStorage store that
 * carries the resolved tenant (and the authenticated principal); the Prisma
 * extension in src/prisma/tenant-scope.ts reads it on every query.
 *
 * Who fills it in:
 *   1. TenantContextMiddleware — opens the store, resolves the `X-Tenant`
 *      institute code for unauthenticated routes (login, OTP request).
 *   2. JwtAuthGuard — overwrites the tenant with the one in the verified token
 *      claim and rejects a request whose header disagrees with its token.
 *   3. AuthService — for login, runs the rest of the work inside
 *      `runWithTenant()` once the institute code has been resolved.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { MissingTenantContextError } from '@/common/errors/app.error';
import type { ResolvedStaffAccess } from '@/common/authz/staff-access';
import type { Principal } from '@/auth/principal';

export interface TenantContextStore {
  /** Correlates every log line of one request. */
  requestId: string;
  tenantId?: string;
  instituteCode?: string;
  principal?: Principal;
  /**
   * Per-request cache of the signed-in staff member's role and capabilities,
   * filled by PermissionResolverService. Permissions come from the database (roles
   * are institute data), so this is what stops a handler that checks three
   * permissions running three queries.
   */
  staffAccess?: ResolvedStaffAccess;
  /**
   * Trusted, cross-tenant work (seeding, tenant lookup by code, health checks).
   * The Prisma extension skips tenant scoping while this is true, so it must
   * never be set from user input.
   */
  system?: boolean;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();

  /**
   * Runs `fn` inside a fresh store — used by the middleware, which calls `next()`
   * synchronously so the whole request chain inherits the store.
   */
  run<T>(store: TenantContextStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  /**
   * Runs `fn` with the given tenant, inheriting the rest of the current store.
   *
   * The callback is *awaited inside* the store rather than returned from it. That
   * matters because Prisma promises are lazy: `() => prisma.staff.findFirst(…)`
   * only builds a query object, and the query is not sent until something awaits
   * it. Awaiting here keeps that inside the scope — returning the unawaited
   * promise would run the query with no tenant in context.
   */
  async runWithTenant<T>(tenantId: string, instituteCode: string | undefined, fn: () => T | Promise<T>): Promise<T> {
    const current = this.storage.getStore();
    return this.storage.run({ ...(current ?? { requestId: 'internal' }), tenantId, instituteCode, system: false }, async () => await fn());
  }

  /**
   * Runs `fn` without tenant scoping — for genuinely global work such as looking
   * a tenant up by its institute code, resolving a refresh token, or the seed
   * script. Never call this with a value that came from a request body.
   */
  async runAsSystem<T>(fn: () => T | Promise<T>): Promise<T> {
    const current = this.storage.getStore();
    return this.storage.run({ ...(current ?? { requestId: 'internal' }), system: true }, async () => await fn());
  }

  get store(): TenantContextStore | undefined {
    return this.storage.getStore();
  }

  get tenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  get instituteCode(): string | undefined {
    return this.storage.getStore()?.instituteCode;
  }

  get principal(): Principal | undefined {
    return this.storage.getStore()?.principal;
  }

  get isSystem(): boolean {
    return this.storage.getStore()?.system === true;
  }

  get requestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  /** Throws rather than silently running a query across every tenant. */
  requireTenantId(): string {
    const tenantId = this.tenantId;
    if (!tenantId) throw new MissingTenantContextError('unknown', 'requireTenantId');
    return tenantId;
  }

  /** Called by the JWT guard once the token's tenant claim has been verified. */
  setTenant(tenantId: string, instituteCode: string): void {
    const store = this.storage.getStore();
    if (!store) return;
    store.tenantId = tenantId;
    store.instituteCode = instituteCode;
  }

  setPrincipal(principal: Principal): void {
    const store = this.storage.getStore();
    if (store) store.principal = principal;
  }
}
