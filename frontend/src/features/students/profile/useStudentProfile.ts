/**
 * Derived data for one student's profile — attendance history, assessment
 * scores and fee summary — memoised against store changes.
 *
 * A profile is opened by direct link (roster, global search, notifications),
 * so it reads tenant-wide data rather than the campus picked in the top bar:
 * a student from another campus must still open with their full history.
 */
import { useMemo } from 'react';
import type { Assessment, AttendanceMark, AttendanceSession, Batch, ID } from '@/types/domain';
import { useDataStore } from '@/store/dataStore';
import { useFeeIndex, useLookups, useSettings } from '@/hooks/useTenant';
import { addMark, attendanceRate, emptyCounts, type MarkCounts } from '@/domain/attendance';
import { assessmentStats, studentAverage } from '@/domain/academics';
import { feeSummaryFor } from '@/domain/fees';
import { addDays, today } from '@/lib/date';

export interface SessionRow {
  session: AttendanceSession;
  batch?: Batch;
  mark: AttendanceMark;
}

export interface ScoreRow {
  assessment: Assessment;
  batch?: Batch;
  /** Marks obtained; null = absent / not submitted. */
  score: number | null;
  /** score ÷ max (0–1), NaN when absent. */
  ratio: number;
  /** Class average ratio for the same assessment, NaN when nobody appeared. */
  classAverage: number;
}

export function countMarks(rows: SessionRow[]): MarkCounts {
  const c = emptyCounts();
  for (const r of rows) addMark(c, r.mark);
  return c;
}

/** Classes counted as attended under the tenant's late rule. */
export const attendedOf = (c: MarkCounts, countLate: boolean) => c.P + (countLate ? c.L : 0);
/** Classes that count towards the percentage (excused leave is excluded). */
export const countedOf = (c: MarkCounts) => c.P + c.L + c.A;

export function useStudentProfile(studentId: ID | undefined) {
  const lookups = useLookups();
  const sessions = useDataStore((s) => s.sessions);
  const assessments = useDataStore((s) => s.assessments);
  const countLate = useSettings().attendance.countLateAsPresent;
  const feeIndex = useFeeIndex();
  const student = studentId ? lookups.student.get(studentId) : undefined;
  const id = student?.id;

  /** Current (non-archived) batches, in the order the student joined them. */
  const batches = useMemo(
    () => (student?.batchIds ?? []).map((b) => lookups.batch.get(b)).filter((b): b is Batch => !!b && b.status !== 'Archived'),
    [student, lookups.batch],
  );

  // Every class the student was on the roll for — newest first. Uses the
  // records themselves, so batches they have since left keep their history.
  const sessionRows = useMemo<SessionRow[]>(() => {
    if (!id) return [];
    return sessions
      .filter((s) => id in s.records)
      .map((s) => ({ session: s, batch: lookups.batch.get(s.batchId), mark: s.records[id] }))
      .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.session.startTime.localeCompare(a.session.startTime));
  }, [id, sessions, lookups.batch]);

  const attendance = useMemo(() => {
    const t = today();
    const from30 = addDays(t, -29);
    const from60 = addDays(t, -59);
    const overall = countMarks(sessionRows);
    const last30 = countMarks(sessionRows.filter((r) => r.session.date >= from30));
    const prev30 = countMarks(sessionRows.filter((r) => r.session.date >= from60 && r.session.date < from30));
    return {
      overall,
      last30,
      rate: attendanceRate(overall, countLate),
      rate30: attendanceRate(last30, countLate),
      ratePrev30: attendanceRate(prev30, countLate),
    };
  }, [sessionRows, countLate]);

  // Assessments the student was on the roll for, oldest first (chart order).
  const scores = useMemo<ScoreRow[]>(() => {
    if (!id) return [];
    return assessments
      .filter((a) => id in a.scores)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((a) => {
        const score = a.scores[id] ?? null;
        return {
          assessment: a,
          batch: lookups.batch.get(a.batchId),
          score,
          ratio: score == null ? NaN : score / a.maxMarks,
          classAverage: assessmentStats(a).average,
        };
      });
  }, [id, assessments, lookups.batch]);

  const averageScore = useMemo(
    () =>
      id
        ? studentAverage(
            id,
            scores.map((s) => s.assessment),
          )
        : NaN,
    [id, scores],
  );
  const fee = useMemo(() => feeSummaryFor(feeIndex, id ?? ''), [feeIndex, id]);

  return { student, batches, sessionRows, attendance, scores, averageScore, fee };
}

export type StudentProfile = ReturnType<typeof useStudentProfile>;
