/**
 * Small validators and constants shared by the settings sections.
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

/** Currencies a tenant can bill in (code → symbol + number/date locale). */
export const CURRENCIES: (InstituteSettings['currency'] & { name: string })[] = [
  { code: 'INR', symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', locale: 'en-US', name: 'US Dollar' },
  { code: 'AED', symbol: 'د.إ', locale: 'ar-AE', name: 'UAE Dirham' },
  { code: 'GBP', symbol: '£', locale: 'en-GB', name: 'British Pound' },
  { code: 'EUR', symbol: '€', locale: 'en-IE', name: 'Euro' },
];
