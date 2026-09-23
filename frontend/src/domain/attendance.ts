/**
 * Attendance rules and aggregations — pure functions.
 *
 * Attendance % = (Present [+ Late when countLateAsPresent]) / (Present + Late + Absent).
 * Excused (approved leave) is excluded from the denominator so leave never
 * drags a student's percentage down.
 */
import type { AttendanceMark, AttendanceSession, Batch, ID, ISODate, Student } from '@/types/domain';
import { weekdayOf } from '@/lib/date';

export interface MarkCounts {
  P: number;
  L: number;
  A: number;
  E: number;
  total: number;
}

export const emptyCounts = (): MarkCounts => ({ P: 0, L: 0, A: 0, E: 0, total: 0 });

export const MARK_LABELS: Record<AttendanceMark, string> = {
  P: 'Present',
  L: 'Late',
  A: 'Absent',
  E: 'Excused',
};

export function addMark(c: MarkCounts, m: AttendanceMark): void {
  c[m]++;
  c.total++;
}

export function countRecords(records: Record<ID, AttendanceMark>): MarkCounts {
  const c = emptyCounts();
  for (const m of Object.values(records)) addMark(c, m);
  return c;
}

/** Ratio 0–1, or NaN when there is nothing to measure. */
export function attendanceRate(c: MarkCounts, countLateAsPresent = true): number {
  const denom = c.P + c.L + c.A;
  if (denom === 0) return NaN;
  return (c.P + (countLateAsPresent ? c.L : 0)) / denom;
}

export interface SessionFilter {
  from?: ISODate;
  to?: ISODate;
  batchIds?: ID[];
}

export function filterSessions(sessions: AttendanceSession[], f: SessionFilter): AttendanceSession[] {
  return sessions.filter(
    (s) => (!f.from || s.date >= f.from) && (!f.to || s.date <= f.to) && (!f.batchIds || f.batchIds.includes(s.batchId)),
  );
}

/** Per-student counts across the given sessions, in one pass. */
export function buildStudentAttendanceIndex(sessions: AttendanceSession[]): Map<ID, MarkCounts> {
  const index = new Map<ID, MarkCounts>();
  for (const s of sessions) {
    for (const [sid, m] of Object.entries(s.records)) {
      let c = index.get(sid);
      if (!c) index.set(sid, (c = emptyCounts()));
      addMark(c, m);
    }
  }
  return index;
}

/** Per-batch counts across the given sessions. */
export function buildBatchAttendanceIndex(sessions: AttendanceSession[]): Map<ID, MarkCounts> {
  const index = new Map<ID, MarkCounts>();
  for (const s of sessions) {
    let c = index.get(s.batchId);
    if (!c) index.set(s.batchId, (c = emptyCounts()));
    for (const m of Object.values(s.records)) addMark(c, m);
  }
  return index;
}

/** Daily attendance counts (all batches combined), keyed by date. */
export function dailyCounts(sessions: AttendanceSession[]): Map<ISODate, MarkCounts> {
  const map = new Map<ISODate, MarkCounts>();
  for (const s of sessions) {
    let c = map.get(s.date);
    if (!c) map.set(s.date, (c = emptyCounts()));
    for (const m of Object.values(s.records)) addMark(c, m);
  }
  return map;
}

/** Latest-first run of consecutive absences for a student within a batch. */
export function absenceStreak(studentId: ID, batchSessions: AttendanceSession[]): number {
  const sorted = batchSessions.filter((s) => studentId in s.records).sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const s of sorted) {
    if (s.records[studentId] === 'A') streak++;
    else break;
  }
  return streak;
}

/** Who belongs on a batch's roll call on a given date. */
export function rollFor(batch: Batch, students: Student[], date: ISODate): Student[] {
  return students
    .filter((s) => s.batchIds.includes(batch.id) && s.status !== 'Inactive' && s.joiningDate <= date)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface ScheduledClass {
  batch: Batch;
  date: ISODate;
  session?: AttendanceSession; // present once attendance is marked
}

/** Classes timetabled on a date (active batches meeting that weekday), by start time. */
export function classesOn(date: ISODate, batches: Batch[], sessions: AttendanceSession[]): ScheduledClass[] {
  const day = weekdayOf(date);
  const byBatch = new Map(sessions.filter((s) => s.date === date).map((s) => [s.batchId, s]));
  return batches
    .filter((b) => b.status === 'Active' && b.days.includes(day) && b.startDate <= date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((batch) => ({ batch, date, session: byBatch.get(batch.id) }));
}

export function sessionKey(batchId: ID, date: ISODate): string {
  return `${batchId}__${date}`;
}
