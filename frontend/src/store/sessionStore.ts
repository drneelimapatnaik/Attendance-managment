/**
 * Auth session (Zustand, persisted).
 *
 * Two kinds of principal share this store:
 *  - staff   → `userId` (the institute console)
 *  - portal  → `portalAccountId` (the student / parent app), plus the child a
 *              parent is currently viewing.
 * Only one can be signed in at a time; `signOut()` clears both.
 *
 * Demo sign-in happens in services/auth.ts and services/portalAuth.ts. With a
 * backend, `token` holds the JWT and src/services/http.ts attaches it.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ID } from '@/types/domain';

interface SessionState {
  userId: ID | null;
  portalAccountId: ID | null;
  /** Parents can be linked to several children; this is the one in view. */
  activeStudentId: ID | null;
  tenantCode: string | null;
  token: string | null;
  signedInAt: string | null;
  setSession(s: { userId: ID; tenantCode: string; token: string }): void;
  setPortalSession(s: { accountId: ID; tenantCode: string; token: string; studentId: ID | null }): void;
  setActiveStudent(studentId: ID): void;
  signOut(): void;
}

const EMPTY = { userId: null, portalAccountId: null, activeStudentId: null, tenantCode: null, token: null, signedInAt: null };

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...EMPTY,
      setSession: ({ userId, tenantCode, token }) => set({ ...EMPTY, userId, tenantCode, token, signedInAt: new Date().toISOString() }),
      setPortalSession: ({ accountId, tenantCode, token, studentId }) =>
        set({ ...EMPTY, portalAccountId: accountId, activeStudentId: studentId, tenantCode, token, signedInAt: new Date().toISOString() }),
      setActiveStudent: (activeStudentId) => set({ activeStudentId }),
      signOut: () => set({ ...EMPTY }),
    }),
    { name: 'edutrack:session', storage: createJSONStorage(() => localStorage) },
  ),
);
