/**
 * Role-based access control.
 *
 * Each institute (tenant) assigns staff one role; a role grants a fixed set of
 * permissions. The UI hides what a role cannot do, but the backend must enforce
 * the same matrix — never rely on the client for security.
 */
import type { Permission, Role } from '@/types/domain';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  faculty: 'Faculty',
  accountant: 'Accountant',
  front_desk: 'Front Desk',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access, including billing, branding and staff management.',
  admin: 'Runs day-to-day operations: students, batches, fees and reports.',
  faculty: 'Marks attendance, updates topic coverage and records test scores for their batches.',
  accountant: 'Collects fees, issues receipts and views financial reports.',
  front_desk: 'Handles admissions and enquiries; views rosters and fee status.',
};

const ALL: Permission[] = [
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

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== 'settings.manage'),
  faculty: [
    'dashboard.view',
    'attendance.mark',
    'attendance.reports',
    'students.view',
    'batches.view',
    'topics.manage',
    'performance.view',
    'performance.manage',
  ],
  accountant: ['dashboard.view', 'students.view', 'batches.view', 'fees.view', 'fees.collect', 'attendance.reports'],
  front_desk: ['dashboard.view', 'students.view', 'students.manage', 'batches.view', 'fees.view', 'attendance.mark'],
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

export function can(role: Role | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}
