/**
 * Attendance analytics shared by the dashboard, the live roll call and the
 * attendance reports: date windows, pooled counts, per-day chart series,
 * absence streaks and period-over-period deltas.
 *
 * The business rules (what counts as attended, how % is computed) live in
 * src/domain/attendance.ts; this file only shapes data for presentation, so
 * it stays inside the attendance feature.
 */
import type { AttendanceMark, AttendanceSession, ID, ISODate, Student } from '@/types/domain';
import { addMark, attendanceRate, buildStudentAttendanceIndex, dailyCounts, emptyCounts, type MarkCounts } from '@/domain/attendance';
import { addDays, diffDays, today } from '@/lib/date';

export const MARK_ORDER: AttendanceMark[] = ['P', 'L', 'A', 'E'];

/**
 * A student needs at least this many marked sessions in the window before
 * they can be flagged for low attendance — one absence by a new joiner
 * shouldn't raise an alert.
 */
export const MIN_SESSIONS_FOR_FLAG = 4;

export interface DateWindow {
  from: ISODate;
  to: ISODate;
}

/** The last `days` calendar days ending on `end` (inclusive). */
export function lastDays(days: number, end: ISODate = today()): DateWindow {
  return { from: addDays(end, -(days - 1)), to: end };
}

/** The window of equal length immediately before `w` (for "vs previous period"). */
export function previousWindow(w: DateWindow): DateWindow {
  const length = diffDays(w.from, w.to) + 1;
  const to = addDays(w.from, -1);
  return { from: addDays(to, -(length - 1)), to };
}

/** Mark counts pooled across every record of the given sessions. */
export function pooledCounts(sessions: AttendanceSession[]): MarkCounts {
  const c = emptyCounts();
  for (const s of sessions) for (const m of Object.values(s.records)) addMark(c, m);
  return c;
}

export interface DailyPoint {
  date: ISODate;
  counts: MarkCounts;
  rate: number; // 0–1, NaN when only excused marks
}

/**
 * One point per class day, oldest first. Days without any session (Sundays,
 * holidays) are skipped rather than plotted as gaps, so trend lines stay
 * continuous and the x-axis reads as "class days".
 */
export function dailySeries(sessions: AttendanceSession[], lateAsPresent: boolean): DailyPoint[] {
  return [...dailyCounts(sessions).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, counts, rate: attendanceRate(counts, lateAsPresent) }));
}

/**
 * Current run of consecutive absences for every student, per batch
 * (batchId → studentId → run length). Same rule as `absenceStreak` in the
 * domain — latest session first, sessions without a record for the student
 * are skipped — but computed for everyone in a single pass.
 */
export function absenceStreaksByBatch(sessions: AttendanceSession[]): Map<ID, Map<ID, number>> {
  const byBatch = new Map<ID, AttendanceSession[]>();
  for (const s of sessions) {
    const list = byBatch.get(s.batchId);
    if (list) list.push(s);
    else byBatch.set(s.batchId, [s]);
  }
  const out = new Map<ID, Map<ID, number>>();
  for (const [batchId, list] of byBatch) {
    list.sort((a, b) => b.date.localeCompare(a.date));
    const streaks = new Map<ID, number>();
    const settled = new Set<ID>(); // students whose run has already been broken
    for (const s of list) {
      for (const [sid, mark] of Object.entries(s.records)) {
        if (settled.has(sid)) continue;
        if (mark === 'A') streaks.set(sid, (streaks.get(sid) ?? 0) + 1);
        else settled.add(sid);
      }
    }
    out.set(batchId, streaks);
  }
  return out;
}

export interface StudentAttendanceRow {
  student: Student;
  counts: MarkCounts;
  rate: number;
}

/** Per-student counts + rate for the given sessions, limited to known students. */
export function studentAttendanceRows(
  sessions: AttendanceSession[],
  students: Map<ID, Student>,
  lateAsPresent: boolean,
): StudentAttendanceRow[] {
  const rows: StudentAttendanceRow[] = [];
  for (const [sid, counts] of buildStudentAttendanceIndex(sessions)) {
    const student = students.get(sid);
    if (student) rows.push({ student, counts, rate: attendanceRate(counts, lateAsPresent) });
  }
  return rows;
}

/** True when a row should be flagged as below the tenant's threshold (a percentage, e.g. 75). */
export function isBelowThreshold(row: Pick<StudentAttendanceRow, 'counts' | 'rate'>, thresholdPct: number, minSessions: number): boolean {
  return row.counts.P + row.counts.L + row.counts.A >= minSessions && Number.isFinite(row.rate) && row.rate * 100 < thresholdPct;
}

export interface Delta {
  value: string;
  direction: 'up' | 'down' | 'flat';
  goodWhen?: 'up' | 'down';
  period?: string;
}

/** Difference between two ratios in percentage points, e.g. "2.4 pts" ↑. Undefined when either side is missing. */
export function pointsDelta(current: number, previous: number, period?: string): Delta | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return undefined;
  const pts = (current - previous) * 100;
  const rounded = Math.round(Math.abs(pts) * 10) / 10;
  return {
    value: `${rounded} pts`,
    direction: rounded === 0 ? 'flat' : pts > 0 ? 'up' : 'down',
    goodWhen: 'up',
    period,
  };
}

/** Relative change between two amounts, e.g. "12%" ↑. Undefined when there's no baseline. */
export function percentDelta(current: number, previous: number, period?: string): Delta | undefined {
  if (!previous) return undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { value: `${Math.abs(pct)}%`, direction: pct === 0 ? 'flat' : pct > 0 ? 'up' : 'down', goodWhen: 'up', period };
}
