/**
 * Performance Analytics data + URL filters.
 *
 * View state lives in the URL so a filtered report can be shared:
 *   ?tab=assessments|students &batch= &type= &from= &to= &q= &cmp=
 * `cmp` holds the compared batches as three positional colour slots
 * ("bat-a1,,bat-m2") so removing one batch never repaints the others;
 * "none" means the user cleared them all; absent means "use the default".
 *
 * Everything below is derived from the filtered assessments in a few passes
 * (≈100 assessments × ≈30 scores) and memoised.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Assessment, AssessmentType, Batch, ID, Student } from '@/types/domain';
import { useLookups, useScopedData, useSettings } from '@/hooks/useTenant';
import { assessmentStats, buildScoreIndex, gradeBand, PASS_MARK, type AssessmentStats, type GradeBand } from '@/domain/academics';
import { attendanceRate, buildStudentAttendanceIndex } from '@/domain/attendance';
import { addDays, today } from '@/lib/date';
import { matchesQuery } from '@/lib/format';
import { AT_RISK_BELOW, GRADE_BANDS } from './gradeBands';

/* ------------------------------------------------------------ Filters */

export type PerfTab = 'assessments' | 'students';
const TABS: PerfTab[] = ['assessments', 'students'];
export const ASSESSMENT_TYPES: AssessmentType[] = ['Unit Test', 'Quiz', 'Mock Exam', 'Assignment'];
export const TYPE_ICON: Record<AssessmentType, string> = {
  'Unit Test': 'assignment',
  Quiz: 'quiz',
  'Mock Exam': 'workspace_premium',
  Assignment: 'edit_note',
};
export const MAX_COMPARE = 3;

export interface PerfFilters {
  tab: PerfTab;
  batch: string;
  type: AssessmentType | '';
  from: string;
  to: string;
  q: string;
  cmp: string;
}

const DEFAULTS: PerfFilters = { tab: 'assessments', batch: '', type: '', from: '', to: '', q: '', cmp: '' };
const VIEW_KEYS: (keyof PerfFilters)[] = ['batch', 'type', 'from', 'to'];

export type SetPerfFilter = <K extends keyof PerfFilters>(key: K, value: PerfFilters[K]) => void;

export function usePerformanceFilters() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') as PerfTab | null;
  const filters: PerfFilters = {
    tab: tab && TABS.includes(tab) ? tab : DEFAULTS.tab,
    batch: params.get('batch') ?? DEFAULTS.batch,
    type: (params.get('type') as AssessmentType | null) ?? DEFAULTS.type,
    from: params.get('from') ?? DEFAULTS.from,
    to: params.get('to') ?? DEFAULTS.to,
    q: params.get('q') ?? DEFAULTS.q,
    cmp: params.get('cmp') ?? DEFAULTS.cmp,
  };
  const setFilter: SetPerfFilter = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === DEFAULTS[key]) next.delete(key);
        else next.set(key, String(value));
        return next;
      },
      { replace: true },
    );
  const reset = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        [...VIEW_KEYS, 'q', 'cmp'].forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );
  const isFiltered = VIEW_KEYS.some((k) => filters[k] !== DEFAULTS[k]);
  return { filters, setFilter, reset, isFiltered };
}

/* ------------------------------------------------------------ Rows */

export interface AssessmentRow {
  assessment: Assessment;
  batch?: Batch;
  stats: AssessmentStats;
}

export interface StudentPerfRow {
  student: Student;
  avg: number; // ratio 0–1 across the filtered assessments
  taken: number;
  band: GradeBand;
  recent: number[]; // last five score ratios, oldest → newest
  attendance: number; // 30-day ratio, NaN when no sessions
  needsAttention: boolean; // scoring below 50% or attending below the low-attendance threshold
}

export function usePerformanceData(filters: PerfFilters) {
  const { assessments, batches, sessions } = useScopedData();
  const lookups = useLookups();
  const settings = useSettings();
  const { batch, type, from, to } = filters;

  // Filtered assessments, oldest first (the order charts read in).
  const filtered = useMemo(
    () =>
      assessments
        .filter((a) => (!batch || a.batchId === batch) && (!type || a.type === type) && (!from || a.date >= from) && (!to || a.date <= to))
        .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
    [assessments, batch, type, from, to],
  );

  const rows = useMemo<AssessmentRow[]>(
    () => filtered.map((a) => ({ assessment: a, batch: lookups.batch.get(a.batchId), stats: assessmentStats(a) })),
    [filtered, lookups.batch],
  );

  // Batches worth offering in filters: active ones plus any with results in this campus.
  const batchOptions = useMemo(() => {
    const assessed = new Set(assessments.map((a) => a.batchId));
    return batches.filter((b) => b.status === 'Active' || assessed.has(b.id)).sort((a, b) => a.code.localeCompare(b.code));
  }, [assessments, batches]);

  const students = useMemo<StudentPerfRow[]>(() => {
    const scores = buildScoreIndex(filtered);
    const recent = new Map<ID, number[]>();
    for (const a of filtered) {
      for (const [sid, v] of Object.entries(a.scores)) {
        if (v == null) continue;
        const list = recent.get(sid) ?? [];
        list.push(v / a.maxMarks);
        recent.set(sid, list);
      }
    }
    // Attendance over the last 30 days, limited to the selected batch when there is one.
    const since = addDays(today(), -30);
    const attendance = buildStudentAttendanceIndex(sessions.filter((s) => s.date >= since && (!batch || s.batchId === batch)));
    const threshold = settings.attendance.lowAttendanceThreshold / 100;

    return [...scores.entries()].flatMap(([sid, e]) => {
      const student = lookups.student.get(sid);
      if (!student || student.status === 'Inactive') return [];
      const counts = attendance.get(sid);
      const att = counts ? attendanceRate(counts, settings.attendance.countLateAsPresent) : NaN;
      return [
        {
          student,
          avg: e.avg,
          taken: e.n,
          band: gradeBand(e.avg),
          recent: (recent.get(sid) ?? []).slice(-5),
          attendance: att,
          needsAttention: e.avg < AT_RISK_BELOW || (Number.isFinite(att) && att < threshold),
        },
      ];
    });
  }, [filtered, sessions, batch, lookups.student, settings.attendance]);

  const kpis = useMemo(() => {
    let sum = 0;
    let scripts = 0;
    let passed = 0;
    const byMonth = new Map<string, { sum: number; n: number }>();
    for (const a of filtered) {
      for (const v of Object.values(a.scores)) {
        if (v == null) continue;
        const r = v / a.maxMarks;
        sum += r;
        scripts++;
        if (r >= PASS_MARK) passed++;
        const m = byMonth.get(a.date.slice(0, 7)) ?? { sum: 0, n: 0 };
        m.sum += r;
        m.n++;
        byMonth.set(a.date.slice(0, 7), m);
      }
    }
    return {
      average: scripts ? sum / scripts : NaN,
      passRate: scripts ? passed / scripts : NaN,
      held: filtered.length,
      scripts,
      atRisk: students.filter((s) => s.avg < AT_RISK_BELOW).length,
      belowPass: students.filter((s) => s.avg < PASS_MARK).length,
      monthlyAverage: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, m]) => m.sum / m.n),
    };
  }, [filtered, students]);

  const gradeCounts = useMemo(() => {
    const counts = Object.fromEntries(GRADE_BANDS.map((b) => [b, 0])) as Record<GradeBand, number>;
    for (const s of students) counts[s.band]++;
    return counts;
  }, [students]);

  return { filtered, rows, students, kpis, gradeCounts, batchOptions };
}

/** Student rows narrowed by the Students tab search. */
export function useStudentSearch(rows: StudentPerfRow[], q: string) {
  return useMemo(() => (q ? rows.filter((r) => matchesQuery(q, r.student.name, r.student.id)) : rows), [rows, q]);
}
