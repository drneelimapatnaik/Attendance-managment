/**
 * First-run rules: the empty-institute builder really is empty, and the
 * "is this institute set up?" question answers correctly for a fresh client,
 * a half-finished setup and the demo tenant.
 */
import { describe, expect, it } from 'vitest';
import { createDemoSnapshot, createEmptySnapshot } from '@/data/seed';
import { SYSTEM_ROLE_IDS } from '@/config/permissions';
import type { DataSnapshot } from '@/types/domain';
import {
  LAST_FORM_STEP,
  REQUIRED_STEPS,
  SETUP_STEPS,
  isFirstRun,
  isSetupComplete,
  isSetupStepId,
  isStepDone,
  missingRequiredSteps,
  resumeStep,
  setupProgress,
  stepAt,
  stepIndex,
  type SetupData,
} from './setupStatus';

const NOW = new Date(2026, 8, 22, 10, 30); // Tue 22 Sep 2026, 10:30
const empty = createEmptySnapshot({ now: NOW, instituteCode: 'brightkids', timezone: 'Asia/Kolkata' });

const slice = (s: DataSnapshot): SetupData => ({
  settings: s.settings,
  subjects: s.subjects,
  staff: s.staff,
  batches: s.batches,
  students: s.students,
});

describe('createEmptySnapshot', () => {
  it('contains no records of any kind', () => {
    const { roles: _roles, staff: _staff, settings: _settings, ...rest } = empty;
    for (const [key, value] of Object.entries(rest)) {
      expect(value, `${key} should be empty`).toEqual([]);
    }
  });

  it('has exactly the two built-in roles and nothing custom', () => {
    expect(empty.roles).toHaveLength(2);
    expect(empty.roles.map((r) => r.key)).toEqual(['admin', 'faculty']);
    expect(empty.roles.every((r) => r.isSystem)).toBe(true);
  });

  it('has exactly one staff member: the owner, on the Administrator role', () => {
    expect(empty.staff).toHaveLength(1);
    const [owner] = empty.staff;
    expect(owner.isOwner).toBe(true);
    expect(owner.roleId).toBe(SYSTEM_ROLE_IDS.admin);
    expect(owner.status).toBe('Active');
    expect(owner.subjectIds).toEqual([]);
    expect(empty.roles.some((r) => r.id === owner.roleId)).toBe(true);
  });

  it('takes the institute code from provisioning and leaves the rest blank', () => {
    expect(empty.settings.instituteCode).toBe('BRIGHTKIDS');
    expect(empty.settings.tenantId).toBe('tnt-brightkids');
    expect(empty.settings.name).toBe('');
    expect(empty.settings.campuses).toEqual([]);
    expect(empty.settings.contactPhone).toBe('');
    expect(empty.settings.logoUrl).toBeUndefined();
  });

  it('still has working defaults, so nothing can break before setup', () => {
    const { attendance, fees, academicYear, currency, brandTheme } = empty.settings;
    expect(attendance.lowAttendanceThreshold).toBeGreaterThan(0);
    expect(fees.receiptPrefix).toBe('RCPT');
    expect(fees.dueInDays).toBeGreaterThan(0);
    expect(academicYear).toBe('2026-27');
    expect(currency.code).toBe('INR');
    expect(brandTheme).toBe('royal');
  });

  it('seeds the owner from what provisioning knows', () => {
    const seeded = createEmptySnapshot({ now: NOW, owner: { name: 'Meera Rao', email: 'meera@brightkids.in' } });
    expect(seeded.staff[0].name).toBe('Meera Rao');
    expect(seeded.staff[0].email).toBe('meera@brightkids.in');
    // The owner's email is the institute's first point of contact.
    expect(seeded.settings.contactEmail).toBe('meera@brightkids.in');
  });
});

describe('isSetupComplete', () => {
  it('is false for a freshly provisioned institute', () => {
    expect(empty.settings.setupCompletedAt).toBeUndefined();
    expect(isSetupComplete(empty.settings)).toBe(false);
  });

  it('is false for a missing or blank flag, and for missing settings', () => {
    expect(isSetupComplete(undefined)).toBe(false);
    expect(isSetupComplete(null)).toBe(false);
    expect(isSetupComplete({})).toBe(false);
    expect(isSetupComplete({ setupCompletedAt: '' })).toBe(false);
    expect(isSetupComplete({ setupCompletedAt: '   ' })).toBe(false);
  });

  it('is true once the wizard has been finished', () => {
    expect(isSetupComplete({ setupCompletedAt: '2026-09-22T10:30:00.000Z' })).toBe(true);
  });

  it('is true for the demo tenant, which must never show the wizard', () => {
    expect(isSetupComplete(createDemoSnapshot(NOW).settings)).toBe(true);
  });

  it('stays false while the institute is filled in but not finished', () => {
    const half = slice(empty);
    half.settings = { ...half.settings, name: 'Bright Kids', contactEmail: 'office@brightkids.in' };
    half.settings = { ...half.settings, campuses: [{ id: 'cmp-1', name: 'Main Campus', address: '12 Park Road, Pune 411001' }] };
    expect(isSetupComplete(half.settings)).toBe(false);
  });
});

describe('isFirstRun', () => {
  it('is true for an empty institute and false once there is teaching data', () => {
    expect(isFirstRun(empty)).toBe(true);
    expect(isFirstRun(createDemoSnapshot(NOW))).toBe(false);
    expect(isFirstRun({ batches: [], students: [{}] as never[] })).toBe(false);
  });
});

describe('step progress', () => {
  it('reports nothing done on a fresh institute', () => {
    const data = slice(empty);
    expect(SETUP_STEPS.filter((s) => isStepDone(s.id, data))).toEqual([]);
    expect(setupProgress(data)).toBe(0);
    expect(missingRequiredSteps(data)).toEqual(REQUIRED_STEPS);
    expect(resumeStep(data)).toBe('institute');
  });

  it('resumes at the next required step, then at the next empty optional one', () => {
    const data = slice(empty);
    data.settings = { ...data.settings, name: 'Bright Kids', contactEmail: 'office@brightkids.in' };
    expect(isStepDone('institute', data)).toBe(true);
    // Branding is optional, so campuses (required) is what setup still needs.
    expect(resumeStep(data)).toBe('campuses');

    data.settings = { ...data.settings, campuses: [{ id: 'cmp-1', name: 'Main Campus', address: '12 Park Road, Pune 411001' }] };
    expect(missingRequiredSteps(data)).toEqual([]);
    expect(resumeStep(data)).toBe('branding');
  });

  it('counts a finished institute as fully done and resumes on the closing screen', () => {
    const demo = slice(createDemoSnapshot(NOW));
    expect(setupProgress(demo)).toBeGreaterThan(0.8);
    expect(resumeStep(demo)).toBe('done');
    expect(isStepDone('team', demo)).toBe(true);
    expect(isStepDone('academics', demo)).toBe(true);
    expect(isStepDone('rules', demo)).toBe(true);
  });

  it('does not count the owner alone as a team', () => {
    expect(isStepDone('team', slice(empty))).toBe(false);
  });
});

describe('step order', () => {
  it('starts at the institute and ends with the closing screen', () => {
    expect(SETUP_STEPS[0].id).toBe('institute');
    expect(SETUP_STEPS[SETUP_STEPS.length - 1].id).toBe('done');
    expect(SETUP_STEPS[SETUP_STEPS.length - 2].id).toBe(LAST_FORM_STEP);
  });

  it('only the institute and its campuses are required', () => {
    expect(REQUIRED_STEPS).toEqual(['institute', 'campuses']);
  });

  it('clamps navigation to the ends and validates ids from the URL', () => {
    expect(stepAt(-5)).toBe('institute');
    expect(stepAt(99)).toBe('done');
    expect(stepIndex('campuses')).toBe(2);
    expect(isSetupStepId('rules')).toBe(true);
    expect(isSetupStepId('nonsense')).toBe(false);
    expect(isSetupStepId(null)).toBe(false);
  });
});
