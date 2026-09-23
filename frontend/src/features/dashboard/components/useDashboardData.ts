/**
 * Every number the dashboard shows, derived once per data change.
 *
 * Attendance: today's composition and rate vs the trailing 7 days, the
 * 30-day daily trend, per-batch rates and the alert lists (below threshold,
 * consecutive absences). Fees: month-to-date collections vs the same days
 * last month, 6-month billed/collected history and overdue students.
 * Academics: classes today and syllabus coverage.
 *
 * All data is scoped to the campus picked in the top bar.
 */
import { useMemo } from 'react';
import type { Batch, Student } from '@/types/domain';
import { useFeeIndex, useLookups, useScopedData, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { attendanceRate, buildBatchAttendanceIndex, filterSessions, type MarkCounts } from '@/domain/attendance';
import { coverageProgress } from '@/domain/academics';
import { billedByMonth, collectionsByMonth, type StudentFeeSummary } from '@/domain/fees';
import { addDays, addMonths, startOfMonth, today } from '@/lib/date';
import {
  MIN_SESSIONS_FOR_FLAG,
  absenceStreaksByBatch,
  dailySeries,
  isBelowThreshold,
  lastDays,
  pooledCounts,
  studentAttendanceRows,
  type DailyPoint,
  type StudentAttendanceRow,
} from '@/features/attendance/attendanceStats';
import { classEntriesFor, type ClassEntry } from '@/features/attendance/classSchedule';

export interface StreakAlert {
  student: Student;
  batch: Batch;
  streak: number;
}

export interface OverdueAlert {
  student: Student;
  fee: StudentFeeSummary;
  daysOverdue: number;
}

export interface MonthFees {
  period: string; // YYYY-MM
  billed: number;
  collected: number;
}

export interface BatchRate {
  batch: Batch;
  counts: MarkCounts;
  rate: number;
}

export function useDashboardData() {
  const settings = useSettings();
  const { students, batches, sessions, invoices, payments, coverage } = useScopedData();
  const lookups = useLookups();
  const topics = useDataStore((s) => s.topics);
  const feeIndex = useFeeIndex();
  const t = today();
  const lateAsPresent = settings.attendance.countLateAsPresent;
  const threshold = settings.attendance.lowAttendanceThreshold;

  const people = useMemo(() => {
    const monthStart = startOfMonth(t);
    return {
      active: students.filter((s) => s.status === 'Active').length,
      onLeave: students.filter((s) => s.status === 'On Leave').length,
      admittedThisMonth: students.filter((s) => s.status !== 'Inactive' && s.joiningDate >= monthStart && s.joiningDate <= t).length,
    };
  }, [students, t]);

  const attendance = useMemo(() => {
    const recent = filterSessions(sessions, lastDays(30, t));
    const trend: DailyPoint[] = dailySeries(recent, lateAsPresent);
    const todayPoint = trend.find((p) => p.date === t);
    const trailing = pooledCounts(filterSessions(sessions, { from: addDays(t, -7), to: addDays(t, -1) }));
    const batchIndex = buildBatchAttendanceIndex(recent);
    const byBatch: BatchRate[] = batches
      .filter((b) => b.status === 'Active' && batchIndex.has(b.id))
      .map((b) => {
        const counts = batchIndex.get(b.id)!;
        return { batch: b, counts, rate: attendanceRate(counts, lateAsPresent) };
      })
      .sort((a, b) => (b.rate || 0) - (a.rate || 0));

    const low: StudentAttendanceRow[] = studentAttendanceRows(recent, lookups.student, lateAsPresent)
      .filter((r) => r.student.status !== 'Inactive' && isBelowThreshold(r, threshold, MIN_SESSIONS_FOR_FLAG))
      .sort((a, b) => a.rate - b.rate);

    const batchById = new Map(batches.map((b) => [b.id, b]));
    const streaks: StreakAlert[] = [];
    for (const [batchId, runs] of absenceStreaksByBatch(sessions)) {
      const batch = batchById.get(batchId);
      if (!batch || batch.status !== 'Active') continue;
      for (const [sid, streak] of runs) {
        const student = lookups.student.get(sid);
        if (streak >= 3 && student && student.status !== 'Inactive') streaks.push({ student, batch, streak });
      }
    }
    streaks.sort((a, b) => b.streak - a.streak);

    return {
      trend,
      today: todayPoint,
      overall: attendanceRate(pooledCounts(recent), lateAsPresent),
      trailingRate: attendanceRate(trailing, lateAsPresent),
      spark: trend.filter((p) => p.date >= addDays(t, -13)).map((p) => (Number.isFinite(p.rate) ? p.rate * 100 : null)),
      byBatch,
      low,
      streaks,
    };
  }, [sessions, batches, lookups.student, lateAsPresent, threshold, t]);

  const fees = useMemo(() => {
    const collected = collectionsByMonth(payments);
    const billed = billedByMonth(invoices);
    const thisMonth = startOfMonth(t);
    const months: MonthFees[] = Array.from({ length: 6 }, (_, i) => {
      const period = addMonths(thisMonth, i - 5).slice(0, 7);
      return { period, billed: billed.get(period) ?? 0, collected: collected.get(period) ?? 0 };
    });
    // Month-to-date vs the same days of last month, so early in the month the
    // comparison isn't against a full month.
    const prevStart = addMonths(thisMonth, -1);
    const prevCutoff = [addDays(thisMonth, -1), `${prevStart.slice(0, 8)}${t.slice(8, 10)}`].sort()[0]; // clamp to month end
    let mtd = 0;
    let prevMtd = 0;
    for (const p of payments) {
      if (p.date >= thisMonth && p.date <= t) mtd += p.amount;
      else if (p.date >= prevStart && p.date < thisMonth && p.date <= prevCutoff) prevMtd += p.amount;
    }

    let outstanding = 0;
    const overdue: OverdueAlert[] = [];
    for (const s of students) {
      const fee = feeIndex.get(s.id);
      if (!fee) continue;
      outstanding += fee.outstanding;
      if (fee.overdue > 0) {
        const daysOverdue = Math.max(0, ...fee.invoices.filter((i) => i.status === 'Overdue').map((i) => i.daysOverdue));
        overdue.push({ student: s, fee, daysOverdue });
      }
    }
    overdue.sort((a, b) => b.fee.overdue - a.fee.overdue);
    return { months, mtd, prevMtd, prevCutoff, outstanding, overdue };
  }, [payments, invoices, students, feeIndex, t]);

  const academics = useMemo(() => {
    const classesToday: ClassEntry[] = classEntriesFor(t, batches, sessions);
    let completed = 0;
    let total = 0;
    for (const b of batches) {
      if (b.status !== 'Active') continue;
      const p = coverageProgress(b, topics, coverage);
      completed += p.completed;
      total += p.total;
    }
    return { classesToday, coverage: { completed, total, ratio: total ? completed / total : NaN } };
  }, [batches, sessions, topics, coverage, t]);

  return { people, attendance, fees, academics, threshold, today: t };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
