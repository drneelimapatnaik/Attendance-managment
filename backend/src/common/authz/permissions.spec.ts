/**
 * The capability catalogue is the product's fixed list — institutes choose from it,
 * they never extend it. These expectations are written out longhand (rather than
 * derived) so that adding, renaming or reordering a capability fails the build and
 * forces the same change in frontend/src/config/permissions.ts.
 */
import {
  ALL_PERMISSIONS,
  effectivePermissions,
  holdsAll,
  isPermission,
  missingPermissions,
  PERMISSION_AREA_LABELS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_LABELS,
  PERMISSIONS,
  permissionArea,
  sanitizePermissions,
  unknownPermissions,
} from './permissions';

describe('the capability catalogue', () => {
  it('is the 14 permissions the client defines, in this order', () => {
    expect([...PERMISSIONS]).toEqual([
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
    ]);
    expect(ALL_PERMISSIONS).toHaveLength(14);
  });

  it('gives every capability a label, a description and a known area', () => {
    for (const permission of PERMISSIONS) {
      expect(PERMISSION_LABELS[permission]).toEqual(expect.any(String));
      expect(PERMISSION_DESCRIPTIONS[permission]).toEqual(expect.any(String));
      expect(PERMISSION_AREA_LABELS[permissionArea(permission)]).toEqual(expect.any(String));
    }
  });

  it('recognises its own keys and nothing else', () => {
    expect(isPermission('fees.collect')).toBe(true);
    expect(isPermission('fees.refund')).toBe(false);
    expect(isPermission(42)).toBe(false);
  });
});

describe('sanitizePermissions', () => {
  it('keeps only catalogue keys, de-duplicated and in catalogue order', () => {
    expect(sanitizePermissions(['fees.collect', 'dashboard.view', 'fees.collect', 'wat'])).toEqual(['dashboard.view', 'fees.collect']);
  });

  it('turns an institute’s stored array into a canonical one', () => {
    // Exactly what protects the guard from a key that was removed from the product
    // but still lingers in an old role row.
    expect(sanitizePermissions([])).toEqual([]);
    expect(sanitizePermissions(['settings.manage'])).toEqual(['settings.manage']);
  });

  it('names what it dropped, so the API can return a helpful 400', () => {
    expect(unknownPermissions(['fees.collect', 'fees.refund', 'admin.everything', 'fees.refund'])).toEqual([
      'fees.refund',
      'admin.everything',
    ]);
  });
});

describe('effectivePermissions', () => {
  it('gives the owner the whole catalogue, whatever their role row says', () => {
    expect(effectivePermissions(true, [])).toEqual([...ALL_PERMISSIONS]);
    expect(effectivePermissions(true, ['dashboard.view'])).toHaveLength(14);
  });

  it('gives everyone else exactly what their role holds', () => {
    expect(effectivePermissions(false, ['dashboard.view', 'fees.view'])).toEqual(['dashboard.view', 'fees.view']);
  });

  it('returns a fresh array, so a caller cannot mutate the catalogue', () => {
    const list = effectivePermissions(true, []);
    list.push('dashboard.view');
    expect(ALL_PERMISSIONS).toHaveLength(14);
  });
});

describe('holdsAll / missingPermissions', () => {
  const accountant = sanitizePermissions(['dashboard.view', 'fees.view', 'fees.collect']);

  it('requires every listed permission, not just one', () => {
    expect(holdsAll(accountant, ['fees.view'])).toBe(true);
    expect(holdsAll(accountant, ['fees.view', 'settings.manage'])).toBe(false);
  });

  it('reports which ones were missing', () => {
    expect(missingPermissions(accountant, ['fees.collect', 'settings.manage', 'faculty.manage'])).toEqual([
      'settings.manage',
      'faculty.manage',
    ]);
  });
});
