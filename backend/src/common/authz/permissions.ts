/**
 * The capability catalogue — the fixed list of things a staff role may be allowed
 * to do.
 *
 * This list is the product, so it lives in code and mirrors
 * frontend/src/config/permissions.ts. What is *not* in code any more is which role
 * holds which capability: roles are rows in the `roles` table, created and edited
 * by each institute (see src/roles). An institute chooses from this catalogue; it
 * never invents a capability, and `sanitizePermissions` is what enforces that at
 * the edge.
 *
 * Every key is `<area>.<action>`; the area drives the grouping the permission
 * picker renders (GET /api/v1/permissions).
 */

export const PERMISSIONS = [
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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Every capability, in catalogue order. What the Administrator role holds. */
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard.view': 'View dashboard',
  'attendance.mark': 'Mark attendance',
  'attendance.reports': 'View attendance reports',
  'students.view': 'View students',
  'students.manage': 'Add / edit students',
  'batches.view': 'View batches',
  'batches.manage': 'Create / edit batches',
  'topics.manage': 'Update topic coverage',
  'fees.view': 'View fees',
  'fees.collect': 'Collect fees & issue receipts',
  'performance.view': 'View performance',
  'performance.manage': 'Record assessments',
  'faculty.manage': 'Manage staff & roles',
  'settings.manage': 'Institute settings & branding',
};

/** One sentence per capability, shown under the label in the permission picker. */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'dashboard.view': 'See the home dashboard: today’s classes, collections and alerts.',
  'attendance.mark': 'Take the roll call for a batch and correct a mark afterwards.',
  'attendance.reports': 'Read attendance history, percentages and low-attendance lists.',
  'students.view': 'Open the student roster and individual student profiles.',
  'students.manage': 'Admit a student, edit their details, and change enrolments.',
  'batches.view': 'See the batch list, timetable and rosters.',
  'batches.manage': 'Create batches, change their schedule, fee and assigned faculty.',
  'topics.manage': 'Record which syllabus topics a batch has covered.',
  'fees.view': 'Read invoices, dues and collection reports.',
  'fees.collect': 'Record a payment and issue a receipt.',
  'performance.view': 'Read assessment results and performance trends.',
  'performance.manage': 'Create assessments and enter marks.',
  'faculty.manage': 'Invite staff, change what they may do, and define roles.',
  'settings.manage': 'Change institute settings, branding, billing rules and licence.',
};

/** Area (the part before the dot) → the heading the picker shows for it. */
export const PERMISSION_AREA_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  attendance: 'Attendance',
  students: 'Students',
  batches: 'Batches',
  topics: 'Syllabus',
  fees: 'Fees',
  performance: 'Performance',
  faculty: 'Staff & roles',
  settings: 'Institute settings',
};

/** The area part of a permission key, e.g. `fees.collect` → `fees`. */
export function permissionArea(permission: Permission): string {
  return permission.slice(0, permission.indexOf('.'));
}

/** Type guard: is this arbitrary string one of the catalogue's keys? */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Keeps only real catalogue keys, de-duplicated and in catalogue order, so a
 * role's stored `permissions` array is always canonical however it was written.
 * Anything unrecognised is dropped — callers that must *reject* unknown keys
 * compare the input length with the result (see RolesService).
 */
export function sanitizePermissions(values: readonly string[]): Permission[] {
  const wanted = new Set(values);
  return PERMISSIONS.filter((permission) => wanted.has(permission));
}

/** The keys in `values` that are not in the catalogue — for a helpful 400. */
export function unknownPermissions(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => !isPermission(value)))];
}

/**
 * The capabilities a staff member effectively holds: their role's, or the whole
 * catalogue when they are the institute's owner. One function so the login
 * response, `GET /auth/me` and the guard can never disagree about the owner rule.
 */
export function effectivePermissions(isOwner: boolean, rolePermissions: readonly string[]): Permission[] {
  return isOwner ? [...ALL_PERMISSIONS] : sanitizePermissions(rolePermissions);
}

/** Does this permission set include every one of `required`? */
export function holdsAll(held: readonly Permission[], required: readonly Permission[]): boolean {
  return required.every((permission) => held.includes(permission));
}

/** The members of `required` that `held` is missing — reported in 403 details. */
export function missingPermissions(held: readonly Permission[], required: readonly Permission[]): Permission[] {
  return required.filter((permission) => !held.includes(permission));
}
