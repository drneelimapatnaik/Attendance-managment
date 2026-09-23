/** Formatting helpers — phone matching is security-relevant (it resolves a parent login). */
import { describe, expect, it } from 'vitest';
import { formatPercent, initials, matchesQuery, normalizePhone, pluralize, telHref } from './format';

describe('normalizePhone', () => {
  it('matches the same number written in different ways', () => {
    const key = normalizePhone('+91 98765 43210');
    expect(key).toBe('9876543210');
    expect(normalizePhone('9876543210')).toBe(key);
    expect(normalizePhone('09876543210')).toBe(key);
    expect(normalizePhone('+91-98765-43210')).toBe(key);
    expect(normalizePhone('(98765) 43210')).toBe(key);
  });

  it('keeps short numbers as-is and drops every non-digit', () => {
    expect(normalizePhone('080 4123 7788')).toBe('8041237788');
    expect(normalizePhone('12345')).toBe('12345');
    expect(normalizePhone('D1D2D3')).toBe('123');
  });

  it('does not confuse two different numbers', () => {
    expect(normalizePhone('+91 98765 43210')).not.toBe(normalizePhone('+91 98765 43211'));
  });
});

describe('text helpers', () => {
  it('builds initials without honorifics', () => {
    expect(initials('Dr. Neelima Patnaik')).toBe('NP');
    expect(initials('Aarav Patel')).toBe('AP');
    expect(initials('Madonna')).toBe('M');
  });

  it('formats percentages and handles missing data', () => {
    expect(formatPercent(0.873)).toBe('87%');
    expect(formatPercent(0.873, 1)).toBe('87.3%');
    expect(formatPercent(NaN)).toBe('—');
  });

  it('pluralises and builds tel: links', () => {
    expect(pluralize(1, 'student')).toBe('1 student');
    expect(pluralize(3, 'student')).toBe('3 students');
    expect(telHref('+91 98765 43210')).toBe('tel:+919876543210');
  });

  it('searches across fields, case-insensitively', () => {
    expect(matchesQuery('pat', 'Aarav Patel', 'STU-1042')).toBe(true);
    expect(matchesQuery('1042', 'Aarav Patel', 'STU-1042')).toBe(true);
    expect(matchesQuery('zzz', 'Aarav Patel', undefined)).toBe(false);
    expect(matchesQuery('   ', 'anything')).toBe(true);
  });
});
