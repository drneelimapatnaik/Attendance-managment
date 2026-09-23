/**
 * Authentication service.
 *
 * Mock mode (no VITE_API_URL): validates against the local demo tenant.
 * Backend mode: POST /auth/login { instituteCode, email, password } → { token, user }.
 */
import { useDataStore } from '@/store/dataStore';
import { useSessionStore } from '@/store/sessionStore';
import { useMockBackend } from '@/config/env';
import { http } from './http';
import type { Staff } from '@/types/domain';

export interface SignInInput {
  instituteCode: string;
  email: string;
  password: string;
}

export type SignInResult = { ok: true; user: Staff } | { ok: false; error: string };

export async function signIn({ instituteCode, email, password }: SignInInput): Promise<SignInResult> {
  if (!useMockBackend) {
    try {
      const res = await http.post<{ token: string; user: Staff }>('/auth/login', { instituteCode, email, password });
      useSessionStore.getState().setSession({ userId: res.user.id, tenantCode: instituteCode.toUpperCase(), token: res.token });
      return { ok: true, user: res.user };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Sign-in failed' };
    }
  }

  // Simulated latency so loading states are exercised during development.
  await new Promise((r) => setTimeout(r, 450));
  const { settings, staff } = useDataStore.getState();
  if (instituteCode.trim().toUpperCase() !== settings.instituteCode) {
    return { ok: false, error: 'No institute found with that code.' };
  }
  const user = staff.find((s) => s.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) return { ok: false, error: 'No staff account with that email at this institute.' };
  if (user.status !== 'Active') return { ok: false, error: 'This account has not been activated yet.' };
  if (password.length < 6) return { ok: false, error: 'Incorrect password.' };

  useSessionStore.getState().setSession({ userId: user.id, tenantCode: settings.instituteCode, token: `demo.${user.id}` });
  useDataStore.getState().updateStaff(user.id, { lastActiveAt: new Date().toISOString() });
  return { ok: true, user };
}

export function signOut(): void {
  useSessionStore.getState().signOut();
}
