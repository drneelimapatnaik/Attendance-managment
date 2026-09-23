/**
 * Date helpers.
 *
 * All calendar dates are handled as LOCAL dates in `YYYY-MM-DD` form — never
 * via `new Date('2026-09-22')`, which parses as UTC and shifts by a day in
 * timezones west of Greenwich. Keep all date maths going through here.
 */
import type { ISODate, TimeHM, Weekday } from '@/types/domain';

const WEEKDAY_BY_INDEX: Weekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function nowTime(): TimeHM {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(date: ISODate, months: number): ISODate {
  const d = parseISODate(date);
  d.setMonth(d.getMonth() + months);
  return toISODate(d);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export function weekdayOf(date: ISODate): Weekday {
  return WEEKDAY_BY_INDEX[parseISODate(date).getDay()];
}

/** Every date from `from` to `to` inclusive. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

/** "2026-09" → "Sep 2026" */
export function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** "2026-09" → "Sep" */
export function formatPeriodShort(period: string): string {
  return MONTHS_SHORT[Number(period.slice(5, 7)) - 1];
}

/** "12 Aug 2009" */
export function formatDate(date?: ISODate | null): string {
  if (!date) return '—';
  const d = parseISODate(date);
  return `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "12 Aug" */
export function formatDayMonth(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "Wednesday, Oct 24, 2024" */
export function formatLongDate(date: ISODate): string {
  return parseISODate(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "14:30" → "02:30 PM" */
export function formatTime(t: TimeHM): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h12)}:${pad(m)} ${suffix}`;
}

export function formatTimeRange(start: TimeHM, end: TimeHM): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function minutesOf(t: TimeHM): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Age in completed years on `on` (defaults to today). */
export function ageOn(dob: ISODate, on: ISODate = today()): number {
  const b = parseISODate(dob);
  const t = parseISODate(on);
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age;
}

/** Tenure label used in the roster: "4 mos enrolled", "3.5 mos enrolled", "1.2 yrs enrolled". */
export function tenureLabel(joined: ISODate, on: ISODate = today()): string {
  const days = Math.max(0, diffDays(joined, on));
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} enrolled`;
  const months = Math.round((days / 30.44) * 2) / 2; // nearest half month
  if (months < 12) return `${months} mos enrolled`;
  const years = Math.round((months / 12) * 10) / 10;
  return `${years} yr${years === 1 ? '' : 's'} enrolled`;
}

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const secs = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso.slice(0, 10));
}
