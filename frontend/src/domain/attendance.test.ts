/** Attendance maths: rate rules, streaks and the daily timetable. */
import { describe, expect, it } from 'vitest';
import type { AttendanceSession, Batch } from '@/types/domain';
import { absenceStreak, attendanceRate, classesOn, countRecords } from './attendance';

const session = (date: string, records: AttendanceSession['records'], batchId = 'b1'): AttendanceSession => ({
  id: `${batchId}-${date}`,
  batchId,
  date,
  startTime: '10:00',
  endTime: '11:00',
  facultyId: 'f1',
  topicIds: [],
  records,
  markedAt: `${date}T11:00:00.000Z`,
  markedBy: 'f1',
});

describe('attendanceRate', () => {
  it('excludes excused absences from the denominator', () => {
    const c = countRecords({ a: 'P', b: 'A', c: 'E', d: 'E' });
    expect(attendanceRate(c)).toBe(0.5);
  });

  it('counts Late as present only when configured', () => {
    const c = countRecords({ a: 'P', b: 'L' });
    expect(attendanceRate(c, true)).toBe(1);
    expect(attendanceRate(c, false)).toBe(0.5);
  });

  it('returns NaN when there is nothing to measure', () => {
    expect(Number.isNaN(attendanceRate(countRecords({ a: 'E' })))).toBe(true);
  });
});

describe('absenceStreak', () => {
  it('counts consecutive absences from the most recent session', () => {
    const sessions = [session('2026-09-01', { s: 'P' }), session('2026-09-03', { s: 'A' }), session('2026-09-05', { s: 'A' })];
    expect(absenceStreak('s', sessions)).toBe(2);
    expect(absenceStreak('s', [...sessions, session('2026-09-08', { s: 'L' })])).toBe(0);
  });
});

describe('classesOn', () => {
  const batch = (id: string, days: Batch['days'], start: string, status: Batch['status'] = 'Active') =>
    ({ id, days, startTime: start, endTime: '23:00', status, startDate: '2026-06-01' }) as Batch;

  it('lists active batches meeting that weekday, by start time, with marked sessions attached', () => {
    // 2026-09-22 is a Tuesday.
    const batches = [
      batch('late', ['Tue'], '17:00'),
      batch('early', ['Tue', 'Thu'], '09:00'),
      batch('mon', ['Mon'], '10:00'),
      batch('old', ['Tue'], '08:00', 'Archived'),
    ];
    const result = classesOn('2026-09-22', batches, [session('2026-09-22', { s: 'P' }, 'early')]);
    expect(result.map((c) => c.batch.id)).toEqual(['early', 'late']);
    expect(result[0].session).toBeDefined();
    expect(result[1].session).toBeUndefined();
  });
});
