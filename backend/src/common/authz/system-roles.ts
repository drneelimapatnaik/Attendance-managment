/**
 * The two built-in staff roles, and the rules that protect them.
 *
 * EduTrack ships exactly four role kinds: `admin` and `faculty` (staff) plus
 * `student` and `parent` (portal logins — PortalAccount, not this table). Every
 * institute therefore starts with these two `roles` rows, and everything else on
 * their staff page is theirs to create.
 *
 * `admin` is the role the product cannot function without, so two of its
 * capabilities are load-bearing: `faculty.manage` (otherwise nobody can ever edit
 * roles again) and `settings.manage` (otherwise nobody can edit the institute).
 * The API refuses to strip either — see ADMIN_REQUIRED_PERMISSIONS.
 */
import { ALL_PERMISSIONS, type Permission } from './permissions';

/** The stable slugs of the built-in staff roles. */
export const SYSTEM_ROLE_KEYS = ['admin', 'faculty'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

/**
 * Slugs an institute may not use for a role of their own: the two system keys
 * plus the two portal kinds, which are logins rather than staff roles and would
 * be thoroughly confusing as a staff role's key.
 */
export const RESERVED_ROLE_KEYS: readonly string[] = [...SYSTEM_ROLE_KEYS, 'student', 'parent', 'owner'];

/** What `faculty` may do: teach, and record what happened in the classroom. */
export const FACULTY_PERMISSIONS: readonly Permission[] = [
  'dashboard.view',
  'attendance.mark',
  'attendance.reports',
  'students.view',
  'batches.view',
  'topics.manage',
  'performance.view',
  'performance.manage',
];

/**
 * Capabilities the `admin` role can never lose. Editing them away would lock the
 * institute out of its own role and settings screens.
 */
export const ADMIN_REQUIRED_PERMISSIONS: readonly Permission[] = ['faculty.manage', 'settings.manage'];

/**
 * A role that holds both of these is treated as an administrator for the
 * "always keep at least one active admin" invariant — whatever it is called and
 * whether or not it is a system role. That way an institute that builds its own
 * "Branch Head" role with full rights still satisfies the rule, and renaming
 * Administrator to "Principal" changes nothing.
 */
export const ADMIN_MARKER_PERMISSIONS: readonly Permission[] = ADMIN_REQUIRED_PERMISSIONS;

export interface SystemRoleDefinition {
  key: SystemRoleKey;
  /** The label a fresh institute sees; they may rename it. */
  name: string;
  description: string;
  permissions: readonly Permission[];
  /** Pre-selected in the invite form. Faculty, because most staff teach. */
  isDefault: boolean;
}

/** Exactly what every new tenant is bootstrapped with. */
export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Full access to every part of EduTrack, including institute settings and staff.',
    permissions: ALL_PERMISSIONS,
    isDefault: false,
  },
  {
    key: 'faculty',
    name: 'Faculty',
    description: 'Teaches batches: marks attendance, updates topic coverage and records assessments.',
    permissions: FACULTY_PERMISSIONS,
    isDefault: true,
  },
];

/** Is this one of the two built-in staff role keys? */
export function isSystemRoleKey(key: string): key is SystemRoleKey {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(key);
}
