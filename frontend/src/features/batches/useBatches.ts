/**
 * Batches page data + filters.
 *
 * Filters and the chosen view live in the URL
 * (?q=&status=&subject=&grade=&faculty=&view=) so a filtered timetable or
 * list can be bookmarked and shared. Status defaults to "Active".
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Batch, BatchStatus, Staff, Subject } from '@/types/domain';
import { useLookups, useScopedData } from '@/hooks/useTenant';
import { matchesQuery } from '@/lib/format';
import { useBatchMetrics, type BatchMetrics } from './batchMetrics';

export type BatchStatusFilter = BatchStatus | 'all';
export type BatchView = 'grid' | 'list' | 'timetable';

export interface BatchFilters {
  q: string;
  status: BatchStatusFilter;
  subject: string; // subject id or ''
  grade: string;
  faculty: string; // staff id or ''
}

export interface BatchRow {
  batch: Batch;
  subject?: Subject;
  faculty?: Staff;
  m: BatchMetrics;
}

const DEFAULTS: BatchFilters = { q: '', status: 'Active', subject: '', grade: '', faculty: '' };
const STATUSES: BatchStatusFilter[] = ['Active', 'Upcoming', 'Archived', 'all'];
const VIEWS: BatchView[] = ['grid', 'list', 'timetable'];

export function useBatchFilters() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') as BatchStatusFilter | null;
  const view = params.get('view') as BatchView | null;
  const filters: BatchFilters = {
    q: params.get('q') ?? DEFAULTS.q,
    status: status && STATUSES.includes(status) ? status : DEFAULTS.status,
    subject: params.get('subject') ?? DEFAULTS.subject,
    grade: params.get('grade') ?? DEFAULTS.grade,
    faculty: params.get('faculty') ?? DEFAULTS.faculty,
  };

  const update = (key: string, value: string, fallback: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const setFilter = <K extends keyof BatchFilters>(key: K, value: BatchFilters[K]) => update(key, String(value), DEFAULTS[key]);
  const setView = (v: BatchView) => update('view', v, 'grid');
  // Reset clears the filters but keeps the chosen view.
  const reset = () => setParams(view && view !== 'grid' ? { view } : {}, { replace: true });
  const isFiltered = (Object.keys(DEFAULTS) as (keyof BatchFilters)[]).some((k) => filters[k] !== DEFAULTS[k]);

  return { filters, setFilter, reset, isFiltered, view: view && VIEWS.includes(view) ? view : 'grid', setView };
}

export function useBatchRows(filters: BatchFilters) {
  const { batches } = useScopedData();
  const { subject, staff } = useLookups();
  const metrics = useBatchMetrics();

  const all = useMemo<BatchRow[]>(
    () =>
      [...batches]
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        .map((batch) => ({
          batch,
          subject: subject.get(batch.subjectId),
          faculty: staff.get(batch.facultyId),
          m: metrics.get(batch.id)!,
        })),
    [batches, subject, staff, metrics],
  );

  const rows = useMemo(
    () =>
      all.filter(({ batch: b }) => {
        if (filters.status !== 'all' && b.status !== filters.status) return false;
        if (filters.subject && b.subjectId !== filters.subject) return false;
        if (filters.grade && b.grade !== filters.grade) return false;
        if (filters.faculty && b.facultyId !== filters.faculty) return false;
        return matchesQuery(filters.q, b.code, b.name, b.title, b.room);
      }),
    [all, filters.status, filters.subject, filters.grade, filters.faculty, filters.q],
  );

  // Header + KPI numbers are over the whole campus, independent of filters.
  const summary = useMemo(() => {
    const active = all.filter((r) => r.batch.status === 'Active');
    const capacity = active.reduce((s, r) => s + r.batch.capacity, 0);
    const enrolled = active.reduce((s, r) => s + r.m.enrolled, 0);
    const withAttendance = active.filter((r) => Number.isFinite(r.m.attendance));
    return {
      active: active.length,
      upcoming: all.filter((r) => r.batch.status === 'Upcoming').length,
      archived: all.filter((r) => r.batch.status === 'Archived').length,
      capacity,
      enrolled,
      fill: capacity ? enrolled / capacity : 0,
      full: active.filter((r) => r.m.isFull).length,
      attendance: withAttendance.length ? withAttendance.reduce((s, r) => s + r.m.attendance, 0) / withAttendance.length : NaN,
      coverage: active.length ? active.reduce((s, r) => s + r.m.coverage.ratio, 0) / active.length : 0,
    };
  }, [all]);

  return { rows, all, summary };
}
