/**
 * Attendance rules — the server-side port of frontend/src/domain/attendance.ts.
 *
 * Attendance % = (Present [+ Late when countLateAsPresent]) / (Present + Late + Absent).
 * Excused (approved leave) is excluded from the denominator, so approved leave
 * never drags a student's percentage down. Reports, the low-attendance flag and
 * the parent portal all run through these functions.
 */
import { ISODate, Weekday, weekdayOf } from './date';

/** P = Present, L = Late, A = Absent, E = Excused (approved leave). */
export type AttendanceMark = 'P' | 'L' | 'A' | 'E';

export const MARK_LABELS: Record<AttendanceMark, string> = {
  P: 'Present',
  L: 'Late',
  A: 'Absent',
  E: 'Excused',
};

export interface MarkCounts {
  P: number;
  L: number;
  A: number;
  E: number;
  total: number;
}

export const emptyCounts = (): MarkCounts => ({ P: 0, L: 0, A: 0, E: 0, total: 0 });

export function addMark(counts: MarkCounts, mark: AttendanceMark): void {
  counts[mark]++;
  counts.total++;
}

/** The minimum a session must look like for these aggregations. */
export interface SessionLike {
  batchId: string;
  date: ISODate;
  /** studentId → mark */
  records: Record<string, AttendanceMark>;
}

export function countRecords(records: Record<string, AttendanceMark>): MarkCounts {
  const counts = emptyCounts();
  for (const mark of Object.values(records)) addMark(counts, mark);
  return counts;
}

/** Ratio 0–1, or NaN when there is nothing to measure. */
export function attendanceRate(counts: MarkCounts, countLateAsPresent = true): number {
  const denominator = counts.P + counts.L + counts.A; // Excused is excluded on purpose.
  if (denominator === 0) return NaN;
  return (counts.P + (countLateAsPresent ? counts.L : 0)) / denominator;
}

/** Percentage 0–100 rounded to one decimal, or null when there is nothing to measure. */
export function attendancePercent(counts: MarkCounts, countLateAsPresent = true): number | null {
  const rate = attendanceRate(counts, countLateAsPresent);
  return Number.isNaN(rate) ? null : Math.round(rate * 1000) / 10;
}

/** Is this student below the institute's low-attendance threshold? */
export function isLowAttendance(counts: MarkCounts, thresholdPct: number, countLateAsPresent = true): boolean {
  const percent = attendancePercent(counts, countLateAsPresent);
  return percent !== null && percent < thresholdPct;
}

export interface SessionFilter {
  from?: ISODate;
  to?: ISODate;
  batchIds?: readonly string[];
}

export function filterSessions<T extends SessionLike>(sessions: readonly T[], filter: SessionFilter): T[] {
  return sessions.filter(
    (s) =>
      (!filter.from || s.date >= filter.from) &&
      (!filter.to || s.date <= filter.to) &&
      (!filter.batchIds || filter.batchIds.includes(s.batchId)),
  );
}

/** Per-student counts across the given sessions, in one pass. */
export function buildStudentAttendanceIndex(sessions: readonly SessionLike[]): Map<string, MarkCounts> {
  const index = new Map<string, MarkCounts>();
  for (const session of sessions) {
    for (const [studentId, mark] of Object.entries(session.records)) {
      let counts = index.get(studentId);
      if (!counts) index.set(studentId, (counts = emptyCounts()));
      addMark(counts, mark);
    }
  }
  return index;
}

/** Per-batch counts across the given sessions. */
export function buildBatchAttendanceIndex(sessions: readonly SessionLike[]): Map<string, MarkCounts> {
  const index = new Map<string, MarkCounts>();
  for (const session of sessions) {
    let counts = index.get(session.batchId);
    if (!counts) index.set(session.batchId, (counts = emptyCounts()));
    for (const mark of Object.values(session.records)) addMark(counts, mark);
  }
  return index;
}

/** Daily attendance counts (all batches combined), keyed by date. */
export function dailyCounts(sessions: readonly SessionLike[]): Map<ISODate, MarkCounts> {
  const map = new Map<ISODate, MarkCounts>();
  for (const session of sessions) {
    let counts = map.get(session.date);
    if (!counts) map.set(session.date, (counts = emptyCounts()));
    for (const mark of Object.values(session.records)) addMark(counts, mark);
  }
  return map;
}

/** Latest-first run of consecutive absences for a student within a batch. */
export function absenceStreak(studentId: string, batchSessions: readonly SessionLike[]): number {
  const sorted = batchSessions.filter((s) => studentId in s.records).sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const session of sorted) {
    if (session.records[studentId] === 'A') streak++;
    else break;
  }
  return streak;
}

export interface BatchScheduleLike {
  id: string;
  days: readonly Weekday[];
  startDate: ISODate;
  endDate?: ISODate | null;
  status: 'Active' | 'Upcoming' | 'Archived';
}

/** Does this batch meet on that date? Drives "today's classes" and absence alerts. */
export function batchMeetsOn(batch: BatchScheduleLike, date: ISODate): boolean {
  if (batch.status !== 'Active') return false;
  if (batch.startDate > date) return false;
  if (batch.endDate && batch.endDate < date) return false;
  return batch.days.includes(weekdayOf(date));
}

/** Mark counted as "turned up" for the roll-call summary. */
export function isPresentish(mark: AttendanceMark, countLateAsPresent = true): boolean {
  return mark === 'P' || (countLateAsPresent && mark === 'L');
}

/**
 * Late threshold: a student arriving more than `lateAfterMinutes` after the class
 * starts is Late rather than Present (InstituteSettings.attendance.lateAfterMinutes).
 */
export function markForArrival(minutesAfterStart: number, lateAfterMinutes: number): AttendanceMark {
  return minutesAfterStart > lateAfterMinutes ? 'L' : 'P';
}
