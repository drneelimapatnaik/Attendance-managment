/**
 * Small validators and constants shared by the settings sections and by the
 * first-run setup wizard (features/onboarding), which collects the same fields.
 */
import type { InstituteSettings } from '@/types/domain';

/** True when `value` is a whole number within [min, max]. */
export function intInRange(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  const n = Number(value);
  return n >= min && n <= max;
}

/** True when `value` is a non-negative amount (up to 2 decimals). */
export function isAmount(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim());
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\+?[\d\s-]{8,18}$/;
/** Academic year label, e.g. "2026-27". */
export const YEAR_RE = /^\d{4}-\d{2}$/;

/** Currencies a tenant can bill in (code → symbol + number/date locale). */
export const CURRENCIES: (InstituteSettings['currency'] & { name: string })[] = [
  { code: 'INR', symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', locale: 'en-US', name: 'US Dollar' },
  { code: 'AED', symbol: 'د.إ', locale: 'ar-AE', name: 'UAE Dirham' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', name: 'British Pound' },
  { code: 'EUR', symbol: '€', locale: 'en-IE', name: 'Euro' },
];

/**
 * Timezones offered during setup — the regions EduTrack is sold in. Anything
 * the device reports is kept as an option too, so a client outside this list
 * is never forced onto the wrong clock.
 */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata', label: 'India — Asia/Kolkata (IST)' },
  { value: 'Asia/Dubai', label: 'UAE — Asia/Dubai (GST)' },
  { value: 'Asia/Colombo', label: 'Sri Lanka — Asia/Colombo' },
  { value: 'Asia/Kathmandu', label: 'Nepal — Asia/Kathmandu' },
  { value: 'Asia/Dhaka', label: 'Bangladesh — Asia/Dhaka' },
  { value: 'Asia/Karachi', label: 'Pakistan — Asia/Karachi' },
  { value: 'Asia/Singapore', label: 'Singapore — Asia/Singapore' },
  { value: 'Europe/London', label: 'United Kingdom — Europe/London' },
  { value: 'America/New_York', label: 'US Eastern — America/New_York' },
  { value: 'UTC', label: 'UTC' },
];

/** The timezone list with `current` guaranteed to be in it. */
export function timezoneOptions(current: string): { value: string; label: string }[] {
  if (!current || TIMEZONES.some((t) => t.value === current)) return TIMEZONES;
  return [{ value: current, label: `${current} (this device)` }, ...TIMEZONES];
}
