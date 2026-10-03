/**
 * Tenant isolation is the security property this whole service rests on, so it is
 * tested as a pure function: no database, no Nest, just "what arguments would this
 * query really run with?".
 */
import { CrossTenantAccessError, MissingTenantContextError } from '@/common/errors/app.error';
import { applyTenantScope, TENANT_OWNED_MODELS } from './tenant-scope';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

/** Shorthand: run the rewriter for a tenant-owned model inside tenant A. */
const scope = (operation: string, args?: Record<string, unknown>) =>
  applyTenantScope({ model: 'Student', operation, args, tenantId: TENANT_A, isSystem: false, isTenantOwned: true });

/** The same, but with nothing in the tenant context. */
const scopeWithoutTenant = (operation: string, args?: Record<string, unknown>) =>
  applyTenantScope({ model: 'Student', operation, args, tenantId: undefined, isSystem: false, isTenantOwned: true });

describe('applyTenantScope', () => {
  describe('read operations', () => {
    it.each(['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'])('injects the tenant into %s', (operation) => {
      expect(scope(operation, { where: { status: 'Active' } })).toEqual({ where: { status: 'Active', tenantId: TENANT_A } });
    });

    it('injects the tenant into findUnique alongside the unique field', () => {
      // Prisma 5 allows extra filters in findUnique as long as a unique field is present.
      expect(scope('findUnique', { where: { id: 'stu-1' } })).toEqual({ where: { id: 'stu-1', tenantId: TENANT_A } });
    });

    it('adds a where clause when the caller passed none', () => {
      expect(scope('findMany')).toEqual({ where: { tenantId: TENANT_A } });
    });

    it('leaves other arguments untouched', () => {
      const args = { where: { grade: 'Grade 10' }, orderBy: { name: 'asc' }, take: 20, select: { id: true } };
      expect(scope('findMany', args)).toEqual({ ...args, where: { grade: 'Grade 10', tenantId: TENANT_A } });
    });
  });

  describe('write operations', () => {
    it('stamps create data with the tenant', () => {
      expect(scope('create', { data: { name: 'Aarav' } })).toEqual({ data: { name: 'Aarav', tenantId: TENANT_A } });
    });

    it('stamps every row of createMany', () => {
      expect(scope('createMany', { data: [{ name: 'A' }, { name: 'B' }] })).toEqual({
        data: [
          { name: 'A', tenantId: TENANT_A },
          { name: 'B', tenantId: TENANT_A },
        ],
      });
    });

    it('scopes update, delete and deleteMany by tenant', () => {
      expect(scope('update', { where: { id: 'stu-1' }, data: { name: 'X' } })).toEqual({
        where: { id: 'stu-1', tenantId: TENANT_A },
        data: { name: 'X' },
      });
      expect(scope('delete', { where: { id: 'stu-1' } })).toEqual({ where: { id: 'stu-1', tenantId: TENANT_A } });
      expect(scope('deleteMany', { where: { status: 'Inactive' } })).toEqual({ where: { status: 'Inactive', tenantId: TENANT_A } });
    });

    it('scopes both halves of an upsert', () => {
      expect(scope('upsert', { where: { id: 'stu-1' }, create: { name: 'A' }, update: { name: 'B' } })).toEqual({
        where: { id: 'stu-1', tenantId: TENANT_A },
        create: { name: 'A', tenantId: TENANT_A },
        update: { name: 'B' },
      });
    });
  });

  describe('cross-tenant access', () => {
    it('refuses to read another tenant rows', () => {
      expect(() => scope('findMany', { where: { tenantId: TENANT_B } })).toThrow(CrossTenantAccessError);
    });

    it('refuses a nested equals filter naming another tenant', () => {
      expect(() => scope('findFirst', { where: { tenantId: { equals: TENANT_B } } })).toThrow(CrossTenantAccessError);
    });

    it('refuses to write a row into another tenant', () => {
      expect(() => scope('create', { data: { name: 'Mallory', tenantId: TENANT_B } })).toThrow(CrossTenantAccessError);
    });

    it('refuses a createMany where one row targets another tenant', () => {
      expect(() => scope('createMany', { data: [{ name: 'A' }, { name: 'B', tenantId: TENANT_B }] })).toThrow(CrossTenantAccessError);
    });

    it('refuses to update a row belonging to another tenant', () => {
      expect(() => scope('update', { where: { id: 'x', tenantId: TENANT_B }, data: {} })).toThrow(CrossTenantAccessError);
    });

    it('accepts the caller repeating the active tenant', () => {
      expect(scope('findMany', { where: { tenantId: TENANT_A } })).toEqual({ where: { tenantId: TENANT_A } });
    });
  });

  describe('missing context', () => {
    it('refuses to run any query on a tenant-owned model without a tenant', () => {
      expect(() => scopeWithoutTenant('findMany', {})).toThrow(MissingTenantContextError);
      expect(() => scopeWithoutTenant('findUnique', { where: { id: 'stu-1' } })).toThrow(MissingTenantContextError);
      expect(() => scopeWithoutTenant('create', { data: {} })).toThrow(MissingTenantContextError);
      expect(() => scopeWithoutTenant('deleteMany', {})).toThrow(MissingTenantContextError);
    });

    it('allows global models through', () => {
      const args = applyTenantScope({
        model: 'Tenant',
        operation: 'findUnique',
        args: { where: { instituteCode: 'APEX' } },
        tenantId: undefined,
        isSystem: false,
        isTenantOwned: false,
      });
      expect(args).toEqual({ where: { instituteCode: 'APEX' } });
    });

    it('allows trusted system work through untouched', () => {
      const args = applyTenantScope({
        model: 'Student',
        operation: 'findMany',
        args: { where: { status: 'Active' } },
        tenantId: undefined,
        isSystem: true,
        isTenantOwned: true,
      });
      expect(args).toEqual({ where: { status: 'Active' } });
    });
  });

  describe('model detection', () => {
    it('treats every model with a tenantId column as tenant-owned', () => {
      // A sample across the domain; the set itself comes from the Prisma DMMF.
      for (const model of ['Student', 'Batch', 'AttendanceRecord', 'FeeInvoice', 'PortalAccount', 'RefreshToken', 'OneTimeCode']) {
        expect(TENANT_OWNED_MODELS.has(model)).toBe(true);
      }
    });

    it('does not scope the Tenant table itself', () => {
      expect(TENANT_OWNED_MODELS.has('Tenant')).toBe(false);
    });
  });
});
