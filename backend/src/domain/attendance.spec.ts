/**
 * Attendance maths — the server-side port of frontend/src/domain/attendance.test.ts,
 * plus the rules the server owns on its own (low-attendance flag, timetable check).
 */
import {
  absenceStreak,
  attendancePercent,
  attendanceRate,
  batchMeetsOn,
  buildBatchAttendanceIndex,
  buildStudentAttendanceIndex,
  countRecords,
  dailyCounts,
  filterSessions,
  isLowAttendance,
  markForArrival,
  type AttendanceMark,
  type SessionLike,
} from './attendance';

const session = (date: string, records: Record<string, AttendanceMark>, batchId = 'b1'): SessionLike => ({ batchId, date, records });

describe('attendanceRate', () => {
  it('excludes excused absences from the denominator', () => {
    // Approved leave must never drag a student percentage down.
    expect(attendanceRate(countRecords({ a: 'P', b: 'A', c: 'E', d: 'E' }))).toBe(0.5);
  });

  it('counts Late as present only when configured', () => {
    const counts = countRecords({ a: 'P', b: 'L' });
    expect(attendanceRate(counts, true)).toBe(1);
    expect(attendanceRate(counts, false)).toBe(0.5);
  });

  it('returns NaN when there is nothing to measure', () => {
    expect(Number.isNaN(attendanceRate(countRecords({ a: 'E' })))).toBe(true);
    expect(attendancePercent(countRecords({ a: 'E' }))).toBeNull();
  });

  it('reports a percentage to one decimal', () => {
    expect(attendancePercent(countRecords({ a: 'P', b: 'P', c: 'A' }))).toBe(66.7);
  });
});

describe('isLowAttendance', () => {
  it('flags a student below the institute threshold', () => {
    const counts = countRecords({ a: 'P', b: 'P', c: 'A', d: 'A' }); // 50%
    expect(isLowAttendance(counts, 75)).toBe(true);
  });

  it('does not flag a student exactly on the threshold', () => {
    const counts = countRecords({ a: 'P', b: 'P', c: 'P', d: 'A' }); // 75%
    expect(isLowAttendance(counts, 75)).toBe(false);
  });

  it('does not flag a student with nothing recorded', () => {
    expect(isLowAttendance(countRecords({}), 75)).toBe(false);
  });
});

describe('aggregations', () => {
  const sessions = [
    session('2026-09-01', { s1: 'P', s2: 'A' }),
    session('2026-09-03', { s1: 'L', s2: 'P' }, 'b2'),
    session('2026-09-05', { s1: 'E', s2: 'P' }),
  ];

  it('counts per student across sessions', () => {
    const index = buildStudentAttendanceIndex(sessions);
    expect(index.get('s1')).toEqual({ P: 1, L: 1, A: 0, E: 1, total: 3 });
    expect(index.get('s2')).toEqual({ P: 2, L: 0, A: 1, E: 0, total: 3 });
  });

  it('counts per batch', () => {
    const index = buildBatchAttendanceIndex(sessions);
    expect(index.get('b1')!.total).toBe(4);
    expect(index.get('b2')!.total).toBe(2);
  });

  it('counts per day', () => {
    expect(dailyCounts(sessions).get('2026-09-01')).toEqual({ P: 1, L: 0, A: 1, E: 0, total: 2 });
  });

  it('filters by date range and batch', () => {
    expect(filterSessions(sessions, { from: '2026-09-02' })).toHaveLength(2);
    expect(filterSessions(sessions, { to: '2026-09-02' })).toHaveLength(1);
    expect(filterSessions(sessions, { batchIds: ['b2'] })).toHaveLength(1);
  });
});

describe('absenceStreak', () => {
  it('counts consecutive absences from the most recent session', () => {
    const sessions = [session('2026-09-01', { s: 'P' }), session('2026-09-03', { s: 'A' }), session('2026-09-05', { s: 'A' })];
    expect(absenceStreak('s', sessions)).toBe(2);
    expect(absenceStreak('s', [...sessions, session('2026-09-08', { s: 'L' })])).toBe(0);
  });

  it('ignores sessions the student was not part of', () => {
    const sessions = [session('2026-09-03', { s: 'A' }), session('2026-09-05', { other: 'P' })];
    expect(absenceStreak('s', sessions)).toBe(1);
  });
});

describe('batchMeetsOn', () => {
  // 2026-09-22 is a Tuesday.
  const batch = { id: 'b1', days: ['Tue', 'Thu'] as const, startDate: '2026-06-01', status: 'Active' as const };

  it('is true on a scheduled weekday inside the batch dates', () => {
    expect(batchMeetsOn(batch, '2026-09-22')).toBe(true);
  });

  it('is false on other weekdays', () => {
    expect(batchMeetsOn(batch, '2026-09-21')).toBe(false);
  });

  it('is false before the batch starts or after it ends', () => {
    expect(batchMeetsOn(batch, '2026-05-26')).toBe(false);
    expect(batchMeetsOn({ ...batch, endDate: '2026-09-01' }, '2026-09-22')).toBe(false);
  });

  it('is false for batches that are not running', () => {
    expect(batchMeetsOn({ ...batch, status: 'Archived' }, '2026-09-22')).toBe(false);
    expect(batchMeetsOn({ ...batch, status: 'Upcoming' }, '2026-09-22')).toBe(false);
  });
});

describe('markForArrival', () => {
  it('uses the institute late threshold', () => {
    expect(markForArrival(5, 10)).toBe('P');
    expect(markForArrival(10, 10)).toBe('P'); // exactly on the threshold is still on time
    expect(markForArrival(11, 10)).toBe('L');
  });
});
