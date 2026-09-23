/**
 * Auth session (Zustand, persisted).
 *
 * Demo sign-in: institute code + an active staff email + any password of 6+
 * characters. With a backend, `signIn` will POST /auth/login, store the JWT
 * in `token`, and the HTTP client will attach it (see src/services/http.ts).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ID } from '@/types/domain';

interface SessionState {
  userId: ID | null;
  tenantCode: string | null;
  token: string | null;
  signedInAt: string | null;
  setSession(s: { userId: ID; tenantCode: string; token: string }): void;
  signOut(): void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      tenantCode: null,
      token: null,
      signedInAt: null,
      setSession: ({ userId, tenantCode, token }) => set({ userId, tenantCode, token, signedInAt: new Date().toISOString() }),
      signOut: () => set({ userId: null, tenantCode: null, token: null, signedInAt: null }),
    }),
    { name: 'edutrack:session', storage: createJSONStorage(() => localStorage) },
  ),
);
