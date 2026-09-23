/**
 * Teaching workload per faculty member (Faculty › Workload).
 *
 *  weekly hours   Σ over active batches of (meeting days × class length)
 *  classes held   sessions they took in the last 30 days
 *  compliance     share of those sessions marked on the day of the class
 *                 (markedAt's local date = session date)
 *  avg attendance mean of their batches' attendance % over the same window
 *
 * Tenant-wide (teachers work across campuses), like the rest of this page.
 */
import { useMemo } from 'react';
import type { AttendanceSession, Batch, ID, Staff } from '@/types/domain';
import { useDataStore } from '@/store/dataStore';
import { useSettings } from '@/hooks/useTenant';
import { attendanceRate, buildBatchAttendanceIndex } from '@/domain/attendance';
import { addDays, minutesOf, toISODate, today } from '@/lib/date';

export const WORKLOAD_WINDOW_DAYS = 30;

export interface WorkloadRow {
  staff: Staff;
  batches: Batch[];
  weeklyHours: number;
  held: number;
  onTime: number;
  compliance: number; // 0–1, NaN when no classes held
  avgAttendance: number; // 0–1, NaN when nothing to measure
}

const classHours = (b: Batch) => Math.max(0, minutesOf(b.endTime) - minutesOf(b.startTime)) / 60;

/** Marked on the day the class was held (in the device's local time). */
const markedSameDay = (s: AttendanceSession) => toISODate(new Date(s.markedAt)) === s.date;

export function useWorkload() {
  const staff = useDataStore((s) => s.staff);
  const batches = useDataStore((s) => s.batches);
  const sessions = useDataStore((s) => s.sessions);
  const countLate = useSettings().attendance.countLateAsPresent;

  return useMemo(() => {
    const to = today();
    const from = addDays(to, -(WORKLOAD_WINDOW_DAYS - 1));
    const recent = sessions.filter((s) => s.date >= from && s.date <= to);
    const batchIndex = buildBatchAttendanceIndex(recent);
    const byFaculty = new Map<ID, AttendanceSession[]>();
    for (const s of recent) byFaculty.set(s.facultyId, [...(byFaculty.get(s.facultyId) ?? []), s]);

    const rows: WorkloadRow[] = staff
      .map((st) => {
        const own = batches.filter((b) => b.facultyId === st.id && b.status === 'Active');
        const held = byFaculty.get(st.id) ?? [];
        const onTime = held.filter(markedSameDay).length;
        const rates = own.map((b) => batchIndex.get(b.id)).map((c) => (c ? attendanceRate(c, countLate) : NaN));
        const finite = rates.filter(Number.isFinite);
        return {
          staff: st,
          batches: own,
          weeklyHours: own.reduce((h, b) => h + b.days.length * classHours(b), 0),
          held: held.length,
          onTime,
          compliance: held.length ? onTime / held.length : NaN,
          avgAttendance: finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : NaN,
        };
      })
      // Teaching staff only: faculty, plus anyone else who runs a batch or took a class.
      .filter((r) => r.staff.role === 'faculty' || r.batches.length > 0 || r.held > 0)
      .sort((a, b) => b.weeklyHours - a.weeklyHours || a.staff.name.localeCompare(b.staff.name));

    const held = rows.reduce((n, r) => n + r.held, 0);
    const onTime = rows.reduce((n, r) => n + r.onTime, 0);
    return {
      rows,
      totals: {
        teachers: rows.filter((r) => r.batches.length).length,
        weeklyHours: rows.reduce((h, r) => h + r.weeklyHours, 0),
        held,
        compliance: held ? onTime / held : NaN,
      },
    };
  }, [staff, batches, sessions, countLate]);
}
