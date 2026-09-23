/**
 * Role-based access control — the server-side copy of the matrix.
 *
 * This file mirrors frontend/src/config/permissions.ts exactly. The UI hides what
 * a role cannot do; this is what actually enforces it. When the two disagree, this
 * file wins — and permissions.spec.ts asserts the matrix has not drifted.
 */
import { Role } from '@prisma/client';

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

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.owner]: ALL,
  [Role.admin]: ALL.filter((p) => p !== 'settings.manage'),
  [Role.faculty]: [
    'dashboard.view',
    'attendance.mark',
    'attendance.reports',
    'students.view',
    'batches.view',
    'topics.manage',
    'performance.view',
    'performance.manage',
  ],
  [Role.accountant]: ['dashboard.view', 'students.view', 'batches.view', 'fees.view', 'fees.collect', 'attendance.reports'],
  [Role.front_desk]: ['dashboard.view', 'students.view', 'students.manage', 'batches.view', 'fees.view', 'attendance.mark'],
};

export const ROLE_LABELS: Record<Role, string> = {
  [Role.owner]: 'Owner',
  [Role.admin]: 'Administrator',
  [Role.faculty]: 'Faculty',
  [Role.accountant]: 'Accountant',
  [Role.front_desk]: 'Front Desk',
};

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

/** Does this role grant the permission? */
export function can(role: Role | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

/** Every permission a role has — returned by GET /auth/me so the client can hide UI. */
export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
