/**
 * Attendance Reports: URL-backed filters and the derived report.
 *
 * Filters live in the URL so a report is shareable and survives refresh:
 *   ?range=7d|30d|month|ay|custom  (default 30d)
 *   &from=&to=                     (custom range only)
 *   &batch=<id> &grade=<grade>     (scope)
 *   &tab=summary|register &below=1 (view options)
 *
 * The report pools every session in the window and scope once: overall and
 * previous-period rate, daily series, per-batch and per-student counts.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AttendanceSession, Batch, ID, ISODate } from '@/types/domain';
import { useLookups, useScopedData, useSettings } from '@/hooks/useTenant';
import { addMark, attendanceRate, emptyCounts, filterSessions, type MarkCounts } from '@/domain/attendance';
import { diffDays, formatDate, startOfMonth, today } from '@/lib/date';
import {
  dailySeries,
  isBelowThreshold,
  lastDays,
  pooledCounts,
  previousWindow,
  type DailyPoint,
  type DateWindow,
  type StudentAttendanceRow,
} from './attendanceStats';

export type RangeKey = '7d' | '30d' | 'month' | 'ay' | 'custom';
export type ReportTab = 'summary' | 'register';

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'ay', label: 'Academic year' },
  { value: 'custom', label: 'Custom range' },
];

/** Reports flag students with at least this many marked sessions (short ranges hold only 2–3 per batch). */
export const REPORT_MIN_SESSIONS = 3;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RANGE: RangeKey = '30d';

export interface ReportFilters {
  range: RangeKey;
  window: DateWindow;
  batch: ID; // '' = all
  grade: string; // '' = all
  tab: ReportTab;
  below: boolean;
}

function resolveWindow(range: RangeKey, from: string | null, to: string | null, ayStart: ISODate, t: ISODate): DateWindow {
  switch (range) {
    case '7d':
      return lastDays(7, t);
    case 'month':
      return { from: startOfMonth(t), to: t };
    case 'ay':
      return { from: ayStart, to: t };
    case 'custom': {
      const f = from && ISO_DATE.test(from) ? from : lastDays(30, t).from;
      const e = to && ISO_DATE.test(to) ? to : t;
      return f <= e ? { from: f, to: e } : { from: e, to: f };
    }
    default:
      return lastDays(30, t);
  }
}

export function useReportFilters() {
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  const t = today();
  const rawRange = params.get('range') as RangeKey | null;
  const range = rawRange && RANGE_OPTIONS.some((o) => o.value === rawRange) ? rawRange : DEFAULT_RANGE;

  const filters: ReportFilters = {
    range,
    window: resolveWindow(range, params.get('from'), params.get('to'), settings.academicYearStart, t),
    batch: params.get('batch') ?? '',
    grade: params.get('grade') ?? '',
    tab: params.get('tab') === 'register' ? 'register' : 'summary',
    below: params.get('below') === '1',
  };

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  return {
    filters,
    setRange: (r: RangeKey) =>
      // Switching to custom starts from the window currently shown.
      r === 'custom'
        ? update({ range: r, from: filters.window.from, to: filters.window.to })
        : update({ range: r === DEFAULT_RANGE ? null : r, from: null, to: null }),
    setCustom: (from: ISODate, to: ISODate) => update({ range: 'custom', from, to }),
    setBatch: (id: ID) => update({ batch: id }),
    setGrade: (grade: string) => update({ grade, batch: null }),
    setTab: (tab: ReportTab) => update({ tab: tab === 'summary' ? null : tab }),
    setBelow: (on: boolean) => update({ below: on ? '1' : null }),
    reset: () => update({ range: null, from: null, to: null, batch: null, grade: null, below: null }),
    isFiltered: range !== DEFAULT_RANGE || !!filters.batch || !!filters.grade || filters.below,
    windowLabel: `${formatDate(filters.window.from)} – ${formatDate(filters.window.to)}`,
    windowDays: diffDays(filters.window.from, filters.window.to) + 1,
  };
}

export interface ReportStudentRow extends StudentAttendanceRow {
  batchIds: ID[];
  sessions: number;
}

export interface ReportBatchRow {
  batch: Batch;
  counts: MarkCounts;
  rate: number;
  sessions: number;
}

export interface AttendanceReport {
  sessions: AttendanceSession[]; // in window + scope
  counts: MarkCounts;
  rate: number;
  prevRate: number;
  lateShare: number; // late / attended
  prevLateShare: number;
  daily: DailyPoint[];
  batches: ReportBatchRow[];
  students: ReportStudentRow[];
  below: ReportStudentRow[];
}

const lateShareOf = (c: MarkCounts) => (c.P + c.L ? c.L / (c.P + c.L) : NaN);

export function useAttendanceReport(filters: ReportFilters): AttendanceReport {
  const settings = useSettings();
  const { sessions, batches } = useScopedData();
  const lookups = useLookups();
  const lateAsPresent = settings.attendance.countLateAsPresent;
  const threshold = settings.attendance.lowAttendanceThreshold;
  const { batch, grade } = filters;
  const { from, to } = filters.window; // primitives, so the memo doesn't rerun on every render

  return useMemo(() => {
    const scopedBatches = batches.filter((b) => (!batch || b.id === batch) && (!grade || b.grade === grade));
    const batchIds = batch || grade ? scopedBatches.map((b) => b.id) : undefined;
    const inRange = filterSessions(sessions, { from, to, batchIds });
    const previous = filterSessions(sessions, { ...previousWindow({ from, to }), batchIds });
    const counts = pooledCounts(inRange);
    const prevCounts = pooledCounts(previous);

    // One pass over every record: per-student counts + the batches they sat in,
    // and per-batch counts + sessions held.
    const perStudent = new Map<ID, { counts: MarkCounts; batchIds: Set<ID> }>();
    const perBatch = new Map<ID, { counts: MarkCounts; sessions: number }>();
    for (const s of inRange) {
      let b = perBatch.get(s.batchId);
      if (!b) perBatch.set(s.batchId, (b = { counts: emptyCounts(), sessions: 0 }));
      b.sessions++;
      for (const [sid, m] of Object.entries(s.records)) {
        addMark(b.counts, m);
        let st = perStudent.get(sid);
        if (!st) perStudent.set(sid, (st = { counts: emptyCounts(), batchIds: new Set() }));
        addMark(st.counts, m);
        st.batchIds.add(s.batchId);
      }
    }

    const students: ReportStudentRow[] = [];
    for (const [sid, v] of perStudent) {
      const student = lookups.student.get(sid);
      if (!student) continue;
      students.push({
        student,
        counts: v.counts,
        rate: attendanceRate(v.counts, lateAsPresent),
        batchIds: [...v.batchIds],
        sessions: v.counts.total,
      });
    }

    const batchRows: ReportBatchRow[] = [];
    for (const [id, v] of perBatch) {
      const b = lookups.batch.get(id);
      if (b) batchRows.push({ batch: b, counts: v.counts, sessions: v.sessions, rate: attendanceRate(v.counts, lateAsPresent) });
    }
    batchRows.sort((a, b) => (b.rate || 0) - (a.rate || 0));

    return {
      sessions: inRange,
      counts,
      rate: attendanceRate(counts, lateAsPresent),
      prevRate: attendanceRate(prevCounts, lateAsPresent),
      lateShare: lateShareOf(counts),
      prevLateShare: lateShareOf(prevCounts),
      daily: dailySeries(inRange, lateAsPresent),
      batches: batchRows,
      students,
      below: students.filter((r) => isBelowThreshold(r, threshold, REPORT_MIN_SESSIONS)),
    };
  }, [sessions, batches, lookups, from, to, batch, grade, lateAsPresent, threshold]);
}
