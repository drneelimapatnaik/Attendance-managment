/**
 * Toast stack (bottom-right on desktop, above the bottom nav on mobile).
 * Trigger toasts with `useToast()` from src/store/uiStore.ts.
 */
import { useUiStore } from '@/store/uiStore';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

const TONE = {
  success: { icon: 'check_circle', cls: 'text-success' },
  error: { icon: 'error', cls: 'text-error' },
  info: { icon: 'info', cls: 'text-primary' },
} as const;

export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[110] flex flex-col items-center gap-space-xs px-space-md lg:bottom-space-lg lg:right-space-lg lg:left-auto lg:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-space-xs rounded-xl bg-inverse-surface p-space-sm text-inverse-on-surface shadow-level-3"
        >
          <Icon name={TONE[t.tone].icon} filled className={cn('mt-px', TONE[t.tone].cls)} />
          <div className="min-w-0 flex-1">
            <p className="font-label-lg text-label-lg">{t.title}</p>
            {t.description && <p className="mt-0.5 font-body-sm text-body-sm opacity-80">{t.description}</p>}
          </div>
          {t.action && (
            <button
              type="button"
              className="shrink-0 font-label-md text-label-md text-inverse-primary hover:underline"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="shrink-0 opacity-70 hover:opacity-100">
            <Icon name="close" size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
