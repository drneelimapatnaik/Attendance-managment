/**
 * Tenant-aware hooks — the main way screens read data.
 *
 *  useSettings()      institute settings
 *  useCurrentUser()   signed-in staff member
 *  useMyRole()        their role record (institute-defined; see config/permissions.ts)
 *  useCan()           permission checker for the current role (owners hold everything)
 *  useScopedData()    data filtered to the campus picked in the top bar
 *  useFeeIndex()      per-student fee summaries (memoised)
 *  useMoney()         currency formatter bound to the tenant's currency
 *
 * Selectors return stable references (whole arrays from the store), and the
 * derived work is memoised, so screens re-render only when data changes.
 */
import { useCallback, useMemo } from 'react';
import { useDataStore } from '@/store/dataStore';
import { useSessionStore } from '@/store/sessionStore';
import { useUiStore } from '@/store/uiStore';
import { buildFeeIndex, type StudentFeeSummary } from '@/domain/fees';
import { findRole, isClassTeacher, permissionsOf } from '@/domain/roles';
import { formatCurrency } from '@/lib/format';
import { today } from '@/lib/date';
import type { ID, Permission, Role } from '@/types/domain';

export const ALL_CAMPUSES = 'all';

/** The campus currently in view (falls back to the first campus). */
export function useActiveCampusId(): string {
  const chosen = useUiStore((s) => s.campusId);
  const campuses = useDataStore((s) => s.settings.campuses);
  if (chosen === ALL_CAMPUSES || campuses.some((c) => c.id === chosen)) return chosen;
  return campuses[0]?.id ?? ALL_CAMPUSES;
}

export function useSettings() {
  return useDataStore((s) => s.settings);
}

export function useCurrentUser() {
  const userId = useSessionStore((s) => s.userId);
  const staff = useDataStore((s) => s.staff);
  return useMemo(() => staff.find((s) => s.id === userId), [staff, userId]);
}

/** Every role the institute has defined (built-ins first, as stored). */
export function useRoles(): Role[] {
  return useDataStore((s) => s.roles);
}

/** The signed-in staff member's role record (undefined for the owner if their role was deleted). */
export function useMyRole(): Role | undefined {
  const user = useCurrentUser();
  const roles = useRoles();
  return useMemo(() => findRole(roles, user?.roleId), [roles, user?.roleId]);
}

/** Resolved permissions of the signed-in staff member; owners implicitly hold everything. */
export function useMyPermissions(): Permission[] {
  const user = useCurrentUser();
  const roles = useRoles();
  return useMemo(() => permissionsOf(user, roles), [user, roles]);
}

export function useCan() {
  const permissions = useMyPermissions();
  return useCallback((p: Permission) => permissions.includes(p), [permissions]);
}

/**
 * True when the signed-in user teaches classes, so screens can put "my classes"
 * first (the built-in Faculty role, or a custom teaching role holding batches).
 */
export function useIsClassTeacher(): boolean {
  const user = useCurrentUser();
  const roles = useRoles();
  const batches = useDataStore((s) => s.batches);
  return useMemo(() => isClassTeacher(user, roles, batches), [user, roles, batches]);
}

/** Lookup maps for rendering names from IDs without repeated `.find`. */
export function useLookups() {
  const batches = useDataStore((s) => s.batches);
  const students = useDataStore((s) => s.students);
  const staff = useDataStore((s) => s.staff);
  const subjects = useDataStore((s) => s.subjects);
  const topics = useDataStore((s) => s.topics);
  const roles = useDataStore((s) => s.roles);
  return useMemo(
    () => ({
      batch: new Map(batches.map((b) => [b.id, b])),
      student: new Map(students.map((s) => [s.id, s])),
      staff: new Map(staff.map((s) => [s.id, s])),
      subject: new Map(subjects.map((s) => [s.id, s])),
      topic: new Map(topics.map((t) => [t.id, t])),
      role: new Map(roles.map((r) => [r.id, r])),
    }),
    [batches, students, staff, subjects, topics, roles],
  );
}

/**
 * Data limited to the active campus ("all" = every campus). Sessions,
 * invoices, payments and assessments follow their batch/student.
 */
export function useScopedData() {
  const campusId = useActiveCampusId();
  const batches = useDataStore((s) => s.batches);
  const students = useDataStore((s) => s.students);
  const sessions = useDataStore((s) => s.sessions);
  const invoices = useDataStore((s) => s.invoices);
  const payments = useDataStore((s) => s.payments);
  const assessments = useDataStore((s) => s.assessments);
  const coverage = useDataStore((s) => s.coverage);

  return useMemo(() => {
    if (campusId === ALL_CAMPUSES) return { campusId, batches, students, sessions, invoices, payments, assessments, coverage };
    const b = batches.filter((x) => x.campusId === campusId);
    const batchIds = new Set(b.map((x) => x.id));
    const s = students.filter((x) => x.campusId === campusId);
    const studentIds = new Set(s.map((x) => x.id));
    return {
      campusId,
      batches: b,
      students: s,
      sessions: sessions.filter((x) => batchIds.has(x.batchId)),
      invoices: invoices.filter((x) => studentIds.has(x.studentId)),
      payments: payments.filter((x) => studentIds.has(x.studentId)),
      assessments: assessments.filter((x) => batchIds.has(x.batchId)),
      coverage: coverage.filter((x) => batchIds.has(x.batchId)),
    };
  }, [campusId, batches, students, sessions, invoices, payments, assessments, coverage]);
}

/** Per-student fee summaries across the whole tenant (campus-independent). */
export function useFeeIndex(): Map<ID, StudentFeeSummary> {
  const invoices = useDataStore((s) => s.invoices);
  const payments = useDataStore((s) => s.payments);
  const grace = useDataStore((s) => s.settings.fees.gracePeriodDays);
  return useMemo(() => buildFeeIndex(invoices, payments, today(), grace), [invoices, payments, grace]);
}

export function useMoney() {
  const currency = useDataStore((s) => s.settings.currency);
  return useMemo(
    () => ({
      format: (n: number) => formatCurrency(n, currency),
      compact: (n: number) => formatCurrency(n, currency, { compact: true }),
      symbol: currency.symbol,
    }),
    [currency],
  );
}
