/**
 * Roster data + filters for the Students page.
 *
 * Filters live in the URL (?q=&batch=&grade=&fee=&status=) so a filtered view
 * survives refresh/back navigation and can be shared as a link.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FeeStatus, Student } from '@/types/domain';
import { useFeeIndex, useScopedData } from '@/hooks/useTenant';
import { feeSummaryFor, type StudentFeeSummary } from '@/domain/fees';
import { matchesQuery } from '@/lib/format';

export type StatusFilter = 'current' | 'Active' | 'On Leave' | 'Inactive' | 'all';

export interface RosterFilters {
  q: string;
  batch: string; // batch id or ''
  grade: string;
  fee: FeeStatus | '';
  status: StatusFilter;
}

export interface RosterRow {
  student: Student;
  fee: StudentFeeSummary;
}

const DEFAULTS: RosterFilters = { q: '', batch: '', grade: '', fee: '', status: 'current' };

export function useRosterFilters() {
  const [params, setParams] = useSearchParams();
  const filters: RosterFilters = {
    q: params.get('q') ?? DEFAULTS.q,
    batch: params.get('batch') ?? DEFAULTS.batch,
    grade: params.get('grade') ?? DEFAULTS.grade,
    fee: (params.get('fee') as FeeStatus | null) ?? DEFAULTS.fee,
    status: (params.get('status') as StatusFilter | null) ?? DEFAULTS.status,
  };
  const setFilter = <K extends keyof RosterFilters>(key: K, value: RosterFilters[K]) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === DEFAULTS[key]) next.delete(key);
        else next.set(key, String(value));
        return next;
      },
      { replace: true },
    );
  };
  const reset = () => setParams(new URLSearchParams(), { replace: true });
  const isFiltered = (Object.keys(DEFAULTS) as (keyof RosterFilters)[]).some((k) => filters[k] !== DEFAULTS[k]);
  return { filters, setFilter, reset, isFiltered };
}

export function matchesStatus(student: Student, status: StatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'current') return student.status !== 'Inactive';
  return student.status === status;
}

export function useRosterRows(filters: RosterFilters) {
  const { students } = useScopedData();
  const feeIndex = useFeeIndex();

  const all = useMemo<RosterRow[]>(
    () => students.map((student) => ({ student, fee: feeSummaryFor(feeIndex, student.id) })),
    [students, feeIndex],
  );

  const rows = useMemo(() => {
    const digits = filters.q.replace(/\D/g, '');
    return all.filter(({ student: s, fee }) => {
      if (!matchesStatus(s, filters.status)) return false;
      if (filters.batch && !s.batchIds.includes(filters.batch)) return false;
      if (filters.grade && s.grade !== filters.grade) return false;
      if (filters.fee && fee.status !== filters.fee) return false;
      if (!filters.q) return true;
      return (
        matchesQuery(filters.q, s.name, s.id, s.cardNo, s.guardian.name) ||
        (digits.length >= 3 && s.guardian.phone.replace(/\D/g, '').includes(digits))
      );
    });
  }, [all, filters]);

  // Summary strip counts ("318 Paid · 18 Due · 6 Overdue") over current students.
  const summary = useMemo(() => {
    const current = all.filter((r) => r.student.status !== 'Inactive');
    return {
      current: current.length,
      paid: current.filter((r) => r.fee.status === 'Paid').length,
      pending: current.filter((r) => r.fee.status === 'Pending').length,
      overdue: current.filter((r) => r.fee.status === 'Overdue').length,
    };
  }, [all]);

  return { rows, summary };
}
