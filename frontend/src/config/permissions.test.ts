/**
 * The capability catalogue is the contract between the UI, the store guards and
 * (later) the backend: every permission appears exactly once, in one area, with
 * a plain-language label, and the built-in roles stay within it.
 */
import { describe, expect, it } from 'vitest';
import type { Permission } from '@/types/domain';
import {
  ADMIN_LOCKED_PERMISSIONS,
  ALL_PERMISSIONS,
  PERMISSION_AREA,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  SYSTEM_ROLE_DEFS,
  SYSTEM_ROLE_IDS,
  can,
  createSystemRoles,
  lockedPermissions,
  permissionAreas,
  permissionSummary,
  withRequired,
} from './permissions';

/** Every capability the product ships, spelled out so a rename can't slip through. */
const EXPECTED: Permission[] = [
  'dashboard.view',
  'attendance.mark',
  'attendance.reports',
  'students.view',
  'students.manage',
  'batches.view',
  'batches.manage',
  'topics.manage',
  'fees.view',
  'fees.collect',
  'performance.view',
  'performance.manage',
  'faculty.manage',
  'settings.manage',
];

describe('capability catalogue', () => {
  it('covers every permission exactly once', () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual([...EXPECTED].sort());
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('gives every permission a label, a description and one area', () => {
    for (const p of ALL_PERMISSIONS) {
      expect(PERMISSION_LABELS[p]?.length).toBeGreaterThan(3);
      expect(PERMISSION_AREA[p]).toBeTruthy();
    }
    const areas = PERMISSION_GROUPS.map((g) => g.area);
    expect(new Set(areas).size).toBe(areas.length);
    expect(PERMISSION_GROUPS.every((g) => g.permissions.length > 0)).toBe(true);
  });

  it('closes a selection over the permissions it implies', () => {
    expect(withRequired(['fees.collect'])).toEqual(['fees.view', 'fees.collect']);
    expect(withRequired(['students.manage'])).toEqual(['students.view', 'students.manage']);
    expect(withRequired(['topics.manage'])).toEqual(['batches.view', 'topics.manage']);
    // Idempotent, de-duplicated and in catalogue order.
    expect(withRequired(['fees.collect', 'fees.view', 'fees.collect'])).toEqual(['fees.view', 'fees.collect']);
  });
});

describe('built-in roles', () => {
  it('gives Administrator everything and Faculty a teaching set', () => {
    const [admin, faculty] = createSystemRoles();
    expect(admin.id).toBe(SYSTEM_ROLE_IDS.admin);
    expect(admin.isSystem).toBe(true);
    expect([...admin.permissions].sort()).toEqual([...EXPECTED].sort());
    expect(faculty.key).toBe('faculty');
    expect(faculty.permissions).toEqual([
      'dashboard.view',
      'attendance.mark',
      'attendance.reports',
      'students.view',
      'batches.view',
      'topics.manage',
      'performance.view',
      'performance.manage',
    ]);
    // Faculty must not be able to manage staff, roles or settings.
    expect(can(faculty, 'faculty.manage')).toBe(false);
    expect(can(faculty, 'settings.manage')).toBe(false);
    expect(can(faculty, 'fees.collect')).toBe(false);
  });

  it('only locks permissions on Administrator', () => {
    const [admin, faculty] = createSystemRoles();
    expect(lockedPermissions(admin)?.permissions).toEqual(ADMIN_LOCKED_PERMISSIONS);
    expect(lockedPermissions(faculty)).toBeNull();
    expect(lockedPermissions({ key: 'front-desk', isSystem: false })).toBeNull();
  });

  it('defines exactly the two built-in staff roles', () => {
    expect(SYSTEM_ROLE_DEFS.map((d) => d.key)).toEqual(['admin', 'faculty']);
  });
});

describe('can() and summaries', () => {
  it('accepts a role or a bare permission list', () => {
    const [, faculty] = createSystemRoles();
    expect(can(faculty, 'attendance.mark')).toBe(true);
    expect(can(['fees.view'], 'fees.view')).toBe(true);
    expect(can(['fees.view'], 'fees.collect')).toBe(false);
    expect(can(undefined, 'dashboard.view')).toBe(false);
  });

  it('summarises a selection in plain language and by area', () => {
    expect(permissionSummary(['fees.collect'])).toEqual(['View fees & dues', 'Collect fees & issue receipts']);
    expect(permissionAreas(['fees.view', 'students.view'])).toEqual(['Students', 'Fees']);
  });
});
