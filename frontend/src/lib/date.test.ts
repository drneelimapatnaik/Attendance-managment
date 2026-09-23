/** Local-date helpers — guards against the classic UTC off-by-one bugs. */
import { describe, expect, it } from 'vitest';
import { addDays, addMonths, ageOn, dateRange, diffDays, formatTime, tenureLabel, weekdayOf } from './date';

describe('date helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('adds months', () => {
    expect(addMonths('2026-06-15', 3)).toBe('2026-09-15');
  });

  it('computes whole-day differences and inclusive ranges', () => {
    expect(diffDays('2026-09-01', '2026-09-22')).toBe(21);
    expect(dateRange('2026-09-01', '2026-09-03')).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('resolves weekdays in local time', () => {
    expect(weekdayOf('2026-09-22')).toBe('Tue');
  });

  it('formats 24h times as 12h', () => {
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('16:30')).toBe('04:30 PM');
  });

  it('computes age and tenure', () => {
    expect(ageOn('2010-09-23', '2026-09-22')).toBe(15);
    expect(ageOn('2010-09-22', '2026-09-22')).toBe(16);
    expect(tenureLabel('2026-06-15', '2026-10-15')).toBe('4 mos enrolled');
  });
});
