/**
 * Staff directory data + filters for the Faculty page.
 *
 * Filters live in the URL (?q=&role=&status=) like the roster, so a filtered
 * view is shareable. `?staff=ID` (from global search) marks one member to
 * highlight; that row is pinned to the top so it is visible on page one.
 *
 * Staff are tenant-wide (they can teach at any campus), so batch counts use
 * every campus rather than the campus picked in the top bar.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Batch, Role, Staff, StaffStatus, Subject } from '@/types/domain';
import { useCurrentUser } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { matchesQuery } from '@/lib/format';
import { batchesTaughtBy } from './staffRules';

export interface StaffFilters {
  q: string;
  role: Role | '';
  status: StaffStatus | '';
}

export interface StaffRow {
  staff: Staff;
  batches: Batch[];
  subjects: Subject[];
  isMe: boolean;
}

const DEFAULTS: StaffFilters = { q: '', role: '', status: '' };
const STATUS_ORDER: Record<StaffStatus, number> = { Active: 0, Invited: 1, Inactive: 2 };

export function useStaffFilters() {
  const [params, setParams] = useSearchParams();
  const filters: StaffFilters = {
    q: params.get('q') ?? DEFAULTS.q,
    role: (params.get('role') as Role | null) ?? DEFAULTS.role,
    status: (params.get('status') as StaffStatus | null) ?? DEFAULTS.status,
  };
  const highlightId = params.get('staff');
  const update = (mutate: (p: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: true },
    );
  const setFilter = <K extends keyof StaffFilters>(key: K, value: StaffFilters[K]) =>
    update((p) => (value === DEFAULTS[key] ? p.delete(key) : p.set(key, String(value))));
  const reset = () => update((p) => (['q', 'role', 'status'] as const).forEach((k) => p.delete(k)));
  const clearHighlight = () => update((p) => p.delete('staff'));
  const isFiltered = (Object.keys(DEFAULTS) as (keyof StaffFilters)[]).some((k) => filters[k] !== DEFAULTS[k]);
  return { filters, setFilter, reset, isFiltered, highlightId, clearHighlight };
}

export function useStaffRows(filters: StaffFilters, highlightId: string | null) {
  const staff = useDataStore((s) => s.staff);
  const batches = useDataStore((s) => s.batches);
  const subjects = useDataStore((s) => s.subjects);
  const me = useCurrentUser();

  const all = useMemo<StaffRow[]>(() => {
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    return staff.map((st) => ({
      staff: st,
      batches: batchesTaughtBy(st.id, batches).filter((b) => b.status === 'Active'),
      subjects: st.subjectIds.map((id) => subjectMap.get(id)).filter((s): s is Subject => !!s),
      isMe: st.id === me?.id,
    }));
  }, [staff, batches, subjects, me?.id]);

  const rows = useMemo(
    () =>
      all
        .filter(({ staff: s }) => {
          // The highlighted member stays visible even if filters would hide them.
          if (s.id === highlightId) return true;
          if (filters.role && s.role !== filters.role) return false;
          if (filters.status && s.status !== filters.status) return false;
          return matchesQuery(filters.q, s.name, s.email, s.title, s.phone);
        })
        .sort(
          (a, b) =>
            Number(b.staff.id === highlightId) - Number(a.staff.id === highlightId) ||
            STATUS_ORDER[a.staff.status] - STATUS_ORDER[b.staff.status] ||
            a.staff.name.localeCompare(b.staff.name),
        ),
    [all, filters.q, filters.role, filters.status, highlightId],
  );

  const counts = useMemo(
    () => ({
      total: staff.length,
      active: staff.filter((s) => s.status === 'Active').length,
      invited: staff.filter((s) => s.status === 'Invited').length,
    }),
    [staff],
  );

  return { rows, counts, highlighted: all.find((r) => r.staff.id === highlightId) };
}
