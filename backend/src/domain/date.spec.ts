/**
 * Date handling. The point of these tests is the timezone trap: calendar dates
 * must survive a round trip through Postgres and back without moving a day,
 * whatever timezone the server runs in.
 */
import {
  addDays,
  addMonths,
  diffDays,
  fromISODate,
  isISODate,
  isTimeHM,
  minutesOf,
  periodOf,
  startOfMonth,
  todayIn,
  toISODate,
  weekdayOf,
} from './date';

describe('ISO date round trips', () => {
  it('converts to the Date Prisma stores and back unchanged', () => {
    for (const date of ['2026-01-01', '2026-02-28', '2026-06-15', '2026-12-31']) {
      expect(toISODate(fromISODate(date))).toBe(date);
    }
  });

  it('uses UTC midnight, which is what a Postgres `date` column returns', () => {
    expect(fromISODate('2026-09-23').toISOString()).toBe('2026-09-23T00:00:00.000Z');
  });
});

describe('date arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('adds months, overflowing the way JavaScript does', () => {
    expect(addMonths('2026-09-15', 3)).toBe('2026-12-15');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-15');
  });

  it('measures whole days between dates', () => {
    expect(diffDays('2026-09-01', '2026-09-08')).toBe(7);
    expect(diffDays('2026-09-08', '2026-09-01')).toBe(-7);
    expect(diffDays('2026-09-08', '2026-09-08')).toBe(0);
  });

  it('knows the weekday', () => {
    expect(weekdayOf('2026-09-22')).toBe('Tue');
    expect(weekdayOf('2026-09-27')).toBe('Sun');
  });

  it('derives months and billing periods', () => {
    expect(startOfMonth('2026-09-23')).toBe('2026-09-01');
    expect(periodOf('2026-09-23')).toBe('2026-09');
  });
});

describe('todayIn', () => {
  it('answers in the institute timezone, not the server one', () => {
    // Late evening in Kolkata is still the previous day in UTC.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-23T19:30:00.000Z'));
    expect(todayIn('UTC')).toBe('2026-09-23');
    expect(todayIn('Asia/Kolkata')).toBe('2026-09-24'); // UTC+5:30 → already tomorrow
    jest.useRealTimers();
  });
});

describe('validators', () => {
  it('accepts real calendar dates only', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('23-09-2026')).toBe(false);
  });

  it('accepts 24-hour times only', () => {
    expect(isTimeHM('09:05')).toBe(true);
    expect(isTimeHM('23:59')).toBe(true);
    expect(isTimeHM('24:00')).toBe(false);
    expect(isTimeHM('9:05')).toBe(false);
  });

  it('converts a time to minutes for schedule maths', () => {
    expect(minutesOf('16:30')).toBe(990);
  });
});
