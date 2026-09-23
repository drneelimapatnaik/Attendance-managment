/**
 * Student & parent app authentication.
 *
 *  Student  → student ID + password.
 *  Parent   → mobile number + a one-time code (SMS) or a password, whichever
 *             the parent chose. Email is mandatory on parent accounts and
 *             optional on student accounts; it is what password recovery uses.
 *
 * This is the MOCK implementation used until the API exists: it validates
 * against the local demo tenant, keeps one-time codes in memory, and (only in
 * demo mode) returns the code so it can be shown on screen instead of sent by
 * SMS. Passwords live in the demo data in plain text for the same reason — a
 * real deployment verifies a salted hash on the server and never ships it to
 * the client. Each function maps to one endpoint of the backend:
 *
 *   POST /auth/student/login          POST /auth/parent/otp/request
 *   POST /auth/parent/login           POST /auth/parent/otp/verify
 *   POST /auth/password/forgot        POST /auth/password/reset
 *   POST /auth/portal/activate
 */
import type { ID, PortalAccount } from '@/types/domain';
import { useDataStore } from '@/store/dataStore';
import { useSessionStore } from '@/store/sessionStore';
import { normalizePhone } from '@/lib/format';
import { uid } from '@/lib/id';
import { addDays, today } from '@/lib/date';
import { useMockBackend } from '@/config/env';

export const OTP_TTL_SECONDS = 120;
export const OTP_MAX_ATTEMPTS = 5;
export const MIN_PASSWORD_LENGTH = 8;

export type PortalAuthResult = { ok: true; account: PortalAccount } | { ok: false; error: string };

interface PendingOtp {
  code: string;
  expiresAt: number;
  attempts: number;
}

/** In-memory only: codes never survive a reload, and are never persisted. */
const pendingOtps = new Map<string, PendingOtp>();

const settings = () => useDataStore.getState().settings;
const accounts = () => useDataStore.getState().portalAccounts;

function wrongTenant(instituteCode: string): boolean {
  return instituteCode.trim().toUpperCase() !== settings().instituteCode;
}

/** Simulated network latency so loading states are exercised in development. */
const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

function findStudentAccount(loginId: string): PortalAccount | undefined {
  const id = loginId.trim().toUpperCase();
  return accounts().find((a) => a.role === 'student' && a.loginId.toUpperCase() === id);
}

function findParentAccount(phone: string): PortalAccount | undefined {
  const key = normalizePhone(phone);
  return accounts().find((a) => a.role === 'parent' && a.loginId === key);
}

/** Blocks sign-in for accounts that are not usable, without revealing details. */
function blockedReason(account: PortalAccount | undefined): string | null {
  if (!account) return 'We could not find an account with those details.';
  if (account.status === 'Disabled') return 'This account has been disabled. Please contact the institute office.';
  if (account.status === 'Invited') return 'This account has not been activated yet. Open the invite link the institute sent you.';
  return null;
}

function startSession(account: PortalAccount): void {
  useDataStore.getState().updatePortalAccount(account.id, { lastLoginAt: new Date().toISOString() });
  useSessionStore.getState().setPortalSession({
    accountId: account.id,
    tenantCode: settings().instituteCode,
    token: `demo.${account.id}`,
    studentId: account.studentIds[0] ?? null,
  });
}

/* ------------------------------------------------------------------ Sign-in */

export async function signInStudent(input: { instituteCode: string; studentId: string; password: string }): Promise<PortalAuthResult> {
  await delay();
  if (wrongTenant(input.instituteCode)) return { ok: false, error: 'No institute found with that code.' };
  const account = findStudentAccount(input.studentId);
  const blocked = blockedReason(account);
  if (blocked || !account) return { ok: false, error: blocked ?? 'Sign-in failed.' };
  if (!account.password || account.password !== input.password) return { ok: false, error: 'Incorrect student ID or password.' };
  startSession(account);
  return { ok: true, account };
}

export async function signInParentWithPassword(input: {
  instituteCode: string;
  phone: string;
  password: string;
}): Promise<PortalAuthResult> {
  await delay();
  if (wrongTenant(input.instituteCode)) return { ok: false, error: 'No institute found with that code.' };
  const account = findParentAccount(input.phone);
  const blocked = blockedReason(account);
  if (blocked || !account) return { ok: false, error: blocked ?? 'Sign-in failed.' };
  // A one-time code always works; a password only once the parent has set one.
  if (!account.password) {
    return { ok: false, error: 'No password is set for this number yet. Sign in with a one-time code.' };
  }
  if (account.password !== input.password) return { ok: false, error: 'Incorrect mobile number or password.' };
  startSession(account);
  return { ok: true, account };
}

/* ---------------------------------------------------------------- One-time code */

export interface OtpRequestResult {
  ok: boolean;
  error?: string;
  /** Demo mode only: shown on screen because no SMS is sent. */
  demoCode?: string;
  expiresInSeconds?: number;
  sentTo?: string; // masked number
}

/** Mask all but the last two digits: "+91 98765 43210" → "•••••• 10". */
export function maskPhone(phone: string): string {
  const key = normalizePhone(phone);
  return `•••••• ${key.slice(-2)}`;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export async function requestParentOtp(input: { instituteCode: string; phone: string }): Promise<OtpRequestResult> {
  await delay(300);
  if (wrongTenant(input.instituteCode)) return { ok: false, error: 'No institute found with that code.' };
  const account = findParentAccount(input.phone);
  const blocked = blockedReason(account);
  if (blocked || !account) return { ok: false, error: blocked ?? 'Sign-in failed.' };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  pendingOtps.set(account.loginId, { code, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000, attempts: 0 });
  // TODO(backend): the server sends the SMS; the code never reaches the client.
  return {
    ok: true,
    demoCode: useMockBackend ? code : undefined,
    expiresInSeconds: OTP_TTL_SECONDS,
    sentTo: maskPhone(account.phone ?? input.phone),
  };
}

export async function verifyParentOtp(input: { instituteCode: string; phone: string; code: string }): Promise<PortalAuthResult> {
  await delay(300);
  const account = findParentAccount(input.phone);
  if (!account) return { ok: false, error: 'We could not find an account with those details.' };
  const pending = pendingOtps.get(account.loginId);
  if (!pending || pending.expiresAt < Date.now()) {
    pendingOtps.delete(account.loginId);
    return { ok: false, error: 'That code has expired. Request a new one.' };
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    pendingOtps.delete(account.loginId);
    return { ok: false, error: 'Too many incorrect attempts. Request a new code.' };
  }
  if (pending.code !== input.code.trim()) {
    pending.attempts++;
    return { ok: false, error: `Incorrect code. ${OTP_MAX_ATTEMPTS - pending.attempts} attempt(s) left.` };
  }
  pendingOtps.delete(account.loginId);
  startSession(account);
  return { ok: true, account };
}

/* ------------------------------------------------------- Activation & recovery */

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (/^[0-9]+$/.test(password)) return 'Use letters as well as numbers.';
  if (/^(password|12345678|qwerty)/i.test(password)) return 'That password is too easy to guess.';
  return null;
}

export function findAccountByToken(token: string): PortalAccount | undefined {
  return accounts().find((a) => a.token?.value === token && a.token.expiresAt >= today());
}

/** Set the first password from an invite link, and confirm the recovery email. */
export async function activateAccount(input: { token: string; password: string; email?: string }): Promise<PortalAuthResult> {
  await delay(300);
  const account = findAccountByToken(input.token);
  if (!account) return { ok: false, error: 'This invite link has expired. Ask the institute to send a new one.' };
  const problem = validatePassword(input.password);
  if (problem) return { ok: false, error: problem };
  const email = input.email?.trim() || account.email;
  if (account.role === 'parent' && !email)
    return { ok: false, error: 'An email address is required so you can reset your password later.' };

  const activated: Partial<PortalAccount> = {
    password: input.password,
    // A parent who sets a password still keeps the option of a one-time code.
    status: 'Active',
    activatedOn: today(),
    email,
    emailVerified: !!email,
    token: undefined,
  };
  useDataStore.getState().updatePortalAccount(account.id, activated);
  const updated = { ...account, ...activated } as PortalAccount;
  startSession(updated);
  return { ok: true, account: updated };
}

export interface RecoveryResult {
  ok: boolean;
  error?: string;
  sentTo?: string; // masked email
  /** Demo mode only: the link token, because no email is sent. */
  demoToken?: string;
}

/**
 * Start password recovery. `identifier` is a student ID or a parent's mobile.
 * Always reports success so the form cannot be used to discover accounts.
 */
export async function requestPasswordReset(input: { instituteCode: string; identifier: string }): Promise<RecoveryResult> {
  await delay();
  if (wrongTenant(input.instituteCode)) return { ok: true };
  const id = input.identifier.trim();
  const account = /^\+?[\d\s-]+$/.test(id) ? findParentAccount(id) : findStudentAccount(id);
  if (!account || account.status === 'Disabled') return { ok: true };
  if (!account.email) {
    return { ok: false, error: 'No email is saved for this account. Please contact the institute office.' };
  }
  const token = uid('reset');
  useDataStore.getState().updatePortalAccount(account.id, {
    token: { value: token, purpose: 'reset', expiresAt: addDays(today(), 1) },
  });
  // TODO(backend): the server emails this link; the token never reaches the client.
  return { ok: true, sentTo: maskEmail(account.email), demoToken: useMockBackend ? token : undefined };
}

export async function resetPassword(input: { token: string; password: string }): Promise<PortalAuthResult> {
  await delay(300);
  const account = findAccountByToken(input.token);
  if (!account) return { ok: false, error: 'This reset link has expired. Request a new one.' };
  const problem = validatePassword(input.password);
  if (problem) return { ok: false, error: problem };
  const patch: Partial<PortalAccount> = { password: input.password, status: 'Active', token: undefined };
  useDataStore.getState().updatePortalAccount(account.id, patch);
  return { ok: true, account: { ...account, ...patch } as PortalAccount };
}

/* ---------------------------------------------------------------- Session */

export function signOutPortal(): void {
  useSessionStore.getState().signOut();
}

/** Children a parent may switch between (a student account has just itself). */
export function linkedStudentIds(account: PortalAccount | undefined): ID[] {
  return account?.studentIds ?? [];
}
