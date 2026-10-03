/**
 * Tenant isolation, enforced in the data layer.
 *
 * The rule: a query against a tenant-owned table may only ever see one tenant's
 * rows, and that tenant comes from the ambient context (JWT claim → AsyncLocalStorage),
 * never from the caller's arguments. A forgotten `where: { tenantId }` must be
 * impossible, not merely discouraged, so this Prisma client extension rewrites
 * every operation before it reaches the database:
 *
 *   findMany / findFirst / count / …  → `where.tenantId` injected
 *   create / createMany               → `data.tenantId` injected
 *   update / delete / upsert          → `where.tenantId` injected
 *
 * and it throws rather than running the query when
 *   * there is no tenant in context (MissingTenantContextError), or
 *   * the caller passed a different tenantId than the active one (CrossTenantAccessError).
 *
 * Which models are tenant-owned is read from the Prisma DMMF (any model with a
 * `tenantId` field), so adding a table to schema.prisma protects it automatically.
 *
 * Known limits, deliberate:
 *   * Raw queries ($queryRaw / $executeRaw) bypass extensions — scope them by hand.
 *   * Nested writes (`create: { batches: { create: … } }`) are not rewritten; the
 *     child rows' own `tenantId` is required by the schema, so they fail loudly
 *     rather than leaking. Create children with explicit tenant-scoped calls.
 */
import { Prisma } from '@prisma/client';
import { CrossTenantAccessError, MissingTenantContextError } from '@/common/errors/app.error';
import type { TenantContextService } from '@/tenancy/tenant-context.service';

/** Operations that filter rows through `args.where`. */
const WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

/** Operations that insert rows through `args.data`. */
const CREATE_OPERATIONS: ReadonlySet<string> = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

/**
 * Every model in schema.prisma that owns a `tenantId` column, derived from the
 * generated DMMF so the list can never drift from the schema.
 */
export const TENANT_OWNED_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models.filter((model) => model.fields.some((field) => field.name === 'tenantId')).map((model) => model.name),
);

export interface TenantScopeInput {
  model: string;
  operation: string;
  /** The caller's arguments; may be undefined for e.g. `findMany()`. */
  args: Record<string, unknown> | undefined;
  tenantId: string | undefined;
  /** True for trusted cross-tenant work (seeding, tenant lookup). */
  isSystem: boolean;
  /** Overridable for unit tests; defaults to the DMMF-derived set. */
  isTenantOwned?: boolean;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Merges the active tenant into `target[key]`, rejecting a caller-supplied
 * tenantId that points somewhere else.
 */
function mergeTenant(
  target: Record<string, unknown>,
  key: 'where' | 'data' | 'create',
  tenantId: string,
  model: string,
  operation: string,
): void {
  const existing = target[key];

  // createMany takes an array of rows: stamp each one.
  if (Array.isArray(existing)) {
    target[key] = existing.map((row) => {
      if (!isPlainObject(row)) return row;
      assertSameTenant(row.tenantId, tenantId, model, operation);
      return { ...row, tenantId };
    });
    return;
  }

  const base = isPlainObject(existing) ? existing : {};
  assertSameTenant(base.tenantId, tenantId, model, operation);
  target[key] = { ...base, tenantId };
}

function assertSameTenant(candidate: unknown, tenantId: string, model: string, operation: string): void {
  if (candidate === undefined || candidate === null) return;
  // `where: { tenantId: { equals: 'x' } }` and friends are rejected too: the only
  // acceptable form is the exact active tenant.
  const value = isPlainObject(candidate) && typeof candidate.equals === 'string' ? candidate.equals : candidate;
  if (value !== tenantId) throw new CrossTenantAccessError(model, operation, tenantId, String(value));
}

/**
 * Pure argument rewriter — the whole isolation rule in one testable function.
 * Returns the arguments that should actually be sent to the database.
 */
export function applyTenantScope({ model, operation, args, tenantId, isSystem, isTenantOwned }: TenantScopeInput): Record<string, unknown> {
  const scoped = isTenantOwned ?? TENANT_OWNED_MODELS.has(model);
  const next: Record<string, unknown> = { ...(args ?? {}) };

  // Global tables (Tenant itself) and trusted system work pass through untouched.
  if (!scoped || isSystem) return next;

  if (!tenantId) throw new MissingTenantContextError(model, operation);

  if (WHERE_OPERATIONS.has(operation)) mergeTenant(next, 'where', tenantId, model, operation);

  if (CREATE_OPERATIONS.has(operation)) {
    // `upsert` inserts through `create`; everything else through `data`.
    if (operation === 'upsert') mergeTenant(next, 'create', tenantId, model, operation);
    else mergeTenant(next, 'data', tenantId, model, operation);
  }

  return next;
}

/**
 * The Prisma client extension itself. Kept as a thin wrapper around
 * `applyTenantScope` so the rule can be unit-tested without a database.
 */
export function tenantScopeExtension(context: Pick<TenantContextService, 'tenantId' | 'isSystem'>) {
  return Prisma.defineExtension({
    name: 'edutrack-tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const scopedArgs = applyTenantScope({
            model,
            operation,
            args: args as Record<string, unknown> | undefined,
            tenantId: context.tenantId,
            isSystem: context.isSystem,
          });
          return query(scopedArgs as typeof args);
        },
      },
    },
  });
}
