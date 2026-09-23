/**
 * UI state (Zustand): sidebar, mobile drawer, toasts and the global modal host.
 *
 * Global modals let any screen (or the "New Entry" menu in the top bar) open a
 * feature form without prop-drilling: `openModal({ type: 'student-form' })`.
 * The modal host lives in src/app/GlobalModals.tsx.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ID } from '@/types/domain';
import { uid } from '@/lib/id';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

export type ModalState =
  | { type: 'student-form'; studentId?: ID; batchId?: ID }
  | { type: 'batch-form'; batchId?: ID }
  | { type: 'record-payment'; studentId?: ID; invoiceId?: ID }
  | { type: 'assessment-form'; batchId?: ID; assessmentId?: ID }
  | { type: 'staff-form'; staffId?: ID };

interface UiState {
  /** Campus shown in the app: a campus id, or 'all'. Empty = the tenant's first campus. */
  campusId: string;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  toasts: Toast[];
  modal: ModalState | null;
  setCampusId(id: string): void;
  toggleSidebar(): void;
  setMobileNavOpen(open: boolean): void;
  toast(t: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }): void;
  dismissToast(id: string): void;
  openModal(m: ModalState): void;
  closeModal(): void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      campusId: '',
      sidebarCollapsed: false,
      mobileNavOpen: false,
      toasts: [],
      modal: null,
      setCampusId: (campusId) => set({ campusId }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      toast: (t) => {
        const toast: Toast = { tone: 'success', ...t, id: uid('toast') };
        set({ toasts: [...get().toasts, toast].slice(-4) });
        setTimeout(() => get().dismissToast(toast.id), 4500);
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
      openModal: (modal) => set({ modal }),
      closeModal: () => set({ modal: null }),
    }),
    {
      name: 'edutrack:ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, campusId: s.campusId }),
    },
  ),
);

/** Shorthand for components: `const toast = useToast(); toast({ title: 'Saved' })`. */
export const useToast = () => useUiStore((s) => s.toast);
