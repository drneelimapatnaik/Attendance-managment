/**
 * Number / money / text formatting. Currency comes from the tenant's
 * InstituteSettings so every buyer sees their own locale (₹, $, AED …).
 */
import type { InstituteSettings } from '@/types/domain';

type Currency = InstituteSettings['currency'];

export function formatCurrency(amount: number, currency: Currency, opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    maximumFractionDigits: opts.compact ? 1 : 0,
    notation: opts.compact ? 'compact' : 'standard',
  }).format(amount);
}

export function formatNumber(n: number, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale).format(n);
}

/** 0.873 → "87%"; pass `digits` for decimals. NaN renders as an em dash. */
export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** "Dr. Neelima Patnaik" → "NP" */
export function initials(name: string): string {
  const parts = name
    .replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '')
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/**
 * Normalised phone key for matching a login to a stored number: digits only,
 * last 10 (so '+91 98765 43210', '9876543210' and '09876543210' all match).
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Loose phone normaliser for tel: links. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Case-insensitive "contains" across several fields — used by list searches. */
export function matchesQuery(query: string, ...fields: (string | undefined | null)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
