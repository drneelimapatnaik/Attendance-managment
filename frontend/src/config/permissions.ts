/**
 * The capability catalogue — the fixed list of things a staff role can be
 * allowed to do, in plain language, grouped by area for the permission picker.
 *
 * The catalogue is the product's; the *roles* are the institute's. Every
 * deployment ships with two built-in roles (Administrator, Faculty) and the
 * institute creates any others it needs ("Accountant", "Branch Head") with the
 * permissions it picks here. Role records live in the store (`roles`), staff
 * point at one via `Staff.roleId`, and the owner implicitly holds everything.
 *
 * The UI hides what a role cannot do; the backend must enforce the same
 * catalogue and the same guard rails (see src/domain/roles.ts).
 */
import type { ID, Permission, Role, SystemRoleKey } from '@/types/domain';

/* ----------------------------------------------------------- The catalogue */

export interface PermissionMeta {
  key: Permission;
  /** Plain-language label for the picker, e.g. "Collect fees & issue receipts". */
  label: string;
  /** One line of help shown under the label. */
  description: string;
}

export interface PermissionGroup {
  /** Area shown as the group heading in the picker. */
  area: string;
  icon: string; // Material Symbols name
  permissions: PermissionMeta[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    area: 'Attendance',
    icon: 'fact_check',
    permissions: [
      { key: 'attendance.mark', label: 'Mark class attendance', description: 'Run roll call and edit a class that was already marked.' },
      {
        key: 'attendance.reports',
        label: 'View attendance reports',
        description: 'Batch and student attendance trends, defaulters and exports.',
      },
    ],
  },
  {
    area: 'Students',
    icon: 'groups',
    permissions: [
      { key: 'students.view', label: 'View the student roster', description: 'Student list, profiles, guardians and contact details.' },
      {
        key: 'students.manage',
        label: 'Admit & edit students',
        description: 'Add admissions, change enrolments and invite the parent app.',
      },
    ],
  },
  {
    area: 'Batches',
    icon: 'class',
    permissions: [
      { key: 'batches.view', label: 'View batches & timetable', description: 'Class schedule, rooms, capacity and assigned teachers.' },
      { key: 'batches.manage', label: 'Create & edit batches', description: 'Schedule classes, set fees and assign a teacher.' },
      { key: 'topics.manage', label: 'Update syllabus coverage', description: 'Mark topics started or completed and edit the syllabus.' },
    ],
  },
  {
    area: 'Fees',
    icon: 'payments',
    permissions: [
      { key: 'fees.view', label: 'View fees & dues', description: 'Invoices, payment history and outstanding balances.' },
      { key: 'fees.collect', label: 'Collect fees & issue receipts', description: 'Record payments, print receipts and waive invoices.' },
    ],
  },
  {
    area: 'Reports',
    icon: 'monitoring',
    permissions: [
      { key: 'dashboard.view', label: 'See the dashboard', description: "Today's classes, attendance and collection summary." },
      { key: 'performance.view', label: 'View test performance', description: 'Assessment results, toppers and subject analysis.' },
      { key: 'performance.manage', label: 'Record test & exam scores', description: 'Create assessments and enter or edit marks.' },
    ],
  },
  {
    area: 'Staff',
    icon: 'badge',
    permissions: [
      {
        key: 'faculty.manage',
        label: 'Manage staff & roles',
        description: 'Invite staff, set who can do what and see teaching workload.',
      },
    ],
  },
  {
    area: 'Settings',
    icon: 'corporate_fare',
    permissions: [
      {
        key: 'settings.manage',
        label: 'Change institute settings',
        description: 'Branding, campuses, attendance and fee rules, notifications.',
      },
    ],
  },
];

/** Every permission, in catalogue order. */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

const META = new Map<Permission, PermissionMeta>(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p])));

export const PERMISSION_LABELS = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, META.get(p)!.label])) as Record<Permission, string>;

export const PERMISSION_DESCRIPTIONS = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, META.get(p)!.description])) as Record<
  Permission,
  string
>;

/** The area a permission belongs to ("Fees"), for summaries and grouping. */
export const PERMISSION_AREA = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, g.area]))) as Record<
  Permission,
  string
>;

export const permissionLabel = (p: Permission): string => META.get(p)?.label ?? p;

/**
 * Permissions that make no sense on their own: managing something implies
 * being able to see it. The picker and the store both close this over a
 * selection so a role can never be saved in an incoherent state.
 */
export const PERMISSION_REQUIRES: Partial<Record<Permission, Permission>> = {
  'students.manage': 'students.view',
  'batches.manage': 'batches.view',
  'topics.manage': 'batches.view',
  'fees.collect': 'fees.view',
  'performance.manage': 'performance.view',
};

/** A selection plus everything it implies, in catalogue order and without duplicates. */
export function withRequired(permissions: Permission[]): Permission[] {
  const set = new Set(permissions);
  for (const p of permissions) {
    const needs = PERMISSION_REQUIRES[p];
    if (needs) set.add(needs);
  }
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/* ------------------------------------------------------------ Built-in roles */

/** Stable ids for the built-ins so seeds, onboarding and tests can refer to them. */
export const SYSTEM_ROLE_IDS: Record<SystemRoleKey, ID> = { admin: 'rol-admin', faculty: 'rol-faculty' };

/**
 * Permissions the Administrator role can never lose: without them nobody could
 * hand out roles or reach institute settings again.
 */
export const ADMIN_LOCKED_PERMISSIONS: Permission[] = ['faculty.manage', 'settings.manage'];

interface SystemRoleDef {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: Permission[];
}

export const SYSTEM_ROLE_DEFS: SystemRoleDef[] = [
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Runs the institute: students, batches, fees, reports, staff and settings.',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'faculty',
    name: 'Faculty',
    description: 'Teaches batches: marks attendance, keeps the syllabus up to date and records test scores.',
    permissions: [
      'dashboard.view',
      'attendance.mark',
      'attendance.reports',
      'students.view',
      'batches.view',
      'topics.manage',
      'performance.view',
      'performance.manage',
    ],
  },
];

/** Fresh copies of the two built-in roles — used by the demo seed and by onboarding. */
export function createSystemRoles(): Role[] {
  return SYSTEM_ROLE_DEFS.map((d) => ({
    id: SYSTEM_ROLE_IDS[d.key],
    key: d.key,
    name: d.name,
    description: d.description,
    permissions: [...d.permissions],
    isSystem: true,
  }));
}

/**
 * Permissions that are locked (always on) for a role, with the reason to show
 * in the picker. Only the Administrator role has any.
 */
export function lockedPermissions(role: Pick<Role, 'key' | 'isSystem'> | undefined): { permissions: Permission[]; reason: string } | null {
  if (!role?.isSystem || role.key !== 'admin') return null;
  return {
    permissions: ADMIN_LOCKED_PERMISSIONS,
    reason: 'Someone must always be able to manage staff, roles and institute settings.',
  };
}

/* --------------------------------------------------------------- Checking */

/** Does this role (or bare permission list) include `permission`? */
export function can(roleOrPermissions: Role | Permission[] | undefined | null, permission: Permission): boolean {
  if (!roleOrPermissions) return false;
  const list = Array.isArray(roleOrPermissions) ? roleOrPermissions : roleOrPermissions.permissions;
  return list.includes(permission);
}

/**
 * Plain-language "this role will be able to…" lines for a selection, in
 * catalogue order. Used by the role form's live summary.
 */
export function permissionSummary(permissions: Permission[]): string[] {
  return withRequired(permissions).map((p) => permissionLabel(p));
}

/** Areas a role touches ("Fees", "Students") — the compact summary in the roles list. */
export function permissionAreas(permissions: Permission[]): string[] {
  return PERMISSION_GROUPS.filter((g) => g.permissions.some((p) => permissions.includes(p.key))).map((g) => g.area);
}
