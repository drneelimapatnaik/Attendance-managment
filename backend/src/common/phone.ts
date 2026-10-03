/**
 * Phone-number matching.
 *
 * Parents type their mobile number differently every time ("+91 98765 43210",
 * "09876543210", "9876543210"). Sign-in, OTP delivery and guardian lookup all
 * compare the *key*: digits only, last 10. The display form is stored separately
 * so receipts and SMS still show what the institute entered.
 *
 * (The frontend helper of the same name has a typo — `/D/g` instead of `/\D/g` —
 * so it does not actually strip punctuation. The server's version is correct and
 * is the one that decides who can sign in.)
 */

/** Digits only, last 10 — the value stored in `guardianPhoneKey` / `phoneKey`. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** A usable Indian-style mobile key is exactly 10 digits. */
export function isPhoneKey(value: string): boolean {
  return /^\d{10}$/.test(value);
}

/** Masks a number for logs and "we sent a code to …" messages: +91 98765 43210 → ••••• 43210. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '•'.repeat(digits.length);
  return `••••• ${digits.slice(-5)}`;
}

/** Masks an email for the same purpose: kavya.nair@apex.in → k••••@apex.in */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•'.repeat(email.length);
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}
