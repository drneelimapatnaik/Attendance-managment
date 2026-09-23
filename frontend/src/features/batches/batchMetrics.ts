/**
 * Per-batch derived metrics shared by the Batches list/grid and the batch
 * detail page: seat occupancy, 30-day attendance and syllabus progress.
 * Computed in one memoised pass — never stored.
 */
import { useMemo } from 'react';
import type { AttendanceSession, Batch, ID, Student, Topic, TopicCoverage } from '@/types/domain';
import { useDataStore } from '@/store/dataStore';
import { useScopedData, useSettings } from '@/hooks/useTenant';
import { coverageProgress, occupancy, type CoverageProgress } from '@/domain/academics';
import { attendanceRate, buildBatchAttendanceIndex, filterSessions } from '@/domain/attendance';
import { addDays, today } from '@/lib/date';

/** Attendance KPIs on batch screens look back this many days (including today). */
export const ATTENDANCE_WINDOW_DAYS = 30;

export interface BatchMetrics {
  enrolled: number;
  ratio: number; // enrolled / capacity
  isFull: boolean;
  attendance: number; // ratio 0–1 over the window; NaN when no sessions were held
  sessionsInWindow: number;
  coverage: CoverageProgress;
}

export function computeBatchMetrics(
  batches: Batch[],
  data: { students: Student[]; sessions: AttendanceSession[]; coverage: TopicCoverage[]; topics: Topic[] },
  countLateAsPresent: boolean,
): Map<ID, BatchMetrics> {
  const recent = filterSessions(data.sessions, { from: addDays(today(), -(ATTENDANCE_WINDOW_DAYS - 1)), to: today() });
  const attendance = buildBatchAttendanceIndex(recent);
  const sessionCount = new Map<ID, number>();
  for (const s of recent) sessionCount.set(s.batchId, (sessionCount.get(s.batchId) ?? 0) + 1);

  const out = new Map<ID, BatchMetrics>();
  for (const b of batches) {
    const occ = occupancy(b, data.students);
    const counts = attendance.get(b.id);
    out.set(b.id, {
      ...occ,
      attendance: counts ? attendanceRate(counts, countLateAsPresent) : NaN,
      sessionsInWindow: sessionCount.get(b.id) ?? 0,
      coverage: coverageProgress(b, data.topics, data.coverage),
    });
  }
  return out;
}

/** Metrics for every batch at the campus in view. */
export function useBatchMetrics(): Map<ID, BatchMetrics> {
  const { batches, students, sessions, coverage } = useScopedData();
  const topics = useDataStore((s) => s.topics);
  const lateAsPresent = useSettings().attendance.countLateAsPresent;
  return useMemo(
    () => computeBatchMetrics(batches, { students, sessions, coverage, topics }, lateAsPresent),
    [batches, students, sessions, coverage, topics, lateAsPresent],
  );
}

/** Seat fill across active batches, e.g. 0.87 — used in page header meta. */
export function seatFill(batches: Batch[], metrics: Map<ID, BatchMetrics>): number {
  let cap = 0;
  let filled = 0;
  for (const b of batches) {
    if (b.status !== 'Active') continue;
    cap += b.capacity;
    filled += metrics.get(b.id)?.enrolled ?? 0;
  }
  return cap ? filled / cap : 0;
}
