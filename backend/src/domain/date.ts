/**
 * Calendar-date helpers — the server-side port of frontend/src/lib/date.ts.
 *
 * Calendar dates ("2026-09-23") are handled as strings, never as `Date`, so no
 * timezone can shift them by a day. The only places a `Date` appears are the edges:
 * Postgres `@db.Date` columns come back as UTC midnight, so `toISODate` /
 * `fromISODate` convert using UTC getters — using local getters here is the classic
 * off-by-one-day bug.
 *
 * "Today" is a question about a place, not the server: pass the institute's
 * timezone (InstituteSettings.timezone) so a 23:30 payment in Asia/Kolkata is not
 * booked on the previous day by a server running in UTC.
 */

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // full ISO 8601
export type TimeHM = string; // HH:mm (24h)

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export const WEEKDAYS: readonly Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const WEEKDAY_BY_INDEX: readonly Weekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** A Postgres `date` (UTC midnight) → "YYYY-MM-DD". */
export function toISODate(date: Date): ISODate {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** "YYYY-MM-DD" → the `Date` Prisma expects for a `@db.Date` column. */
export function fromISODate(date: ISODate): Date {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Today's calendar date in the given IANA timezone (default UTC). */
export function todayIn(timeZone = 'UTC'): ISODate {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we want.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = fromISODate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function addMonths(date: ISODate, months: number): ISODate {
  const d = fromISODate(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toISODate(d);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

export function weekdayOf(date: ISODate): Weekday {
  return WEEKDAY_BY_INDEX[fromISODate(date).getUTCDay()];
}

/** First day of the month containing `date`. */
export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

/** "2026-09-23" → "2026-09" (the billing period it falls in). */
export function periodOf(date: ISODate): string {
  return date.slice(0, 7);
}

/** True for a well-formed calendar date that actually exists (rejects 2026-02-30). */
export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toISODate(fromISODate(value)) === value;
}

/** True for "HH:mm" in 24-hour form. */
export function isTimeHM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function minutesOf(time: TimeHM): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
