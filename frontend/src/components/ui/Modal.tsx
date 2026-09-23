/**
 * Modal dialog — DESIGN.md › Elevation Level 3.
 *
 * Desktop: centred dialog over a 40% slate scrim.
 * Mobile:  bottom sheet (full width, rounded top, safe-area padding).
 *
 * Accessibility: focus moves into the dialog on open, Tab is trapped inside,
 * Escape / scrim click closes, focus returns to the trigger on close, and the
 * page behind stops scrolling.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { IconButton } from './Button';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Open modals, topmost last. Only the topmost handles Escape/Tab; all share one scroll lock. */
const modalStack: symbol[] = [];

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  /** Sticky footer (actions). */
  footer?: ReactNode;
  /** Prevent closing via scrim/Escape (e.g. while saving). */
  dismissible?: boolean;
  className?: string;
}

const SIZES = { sm: 'md:max-w-md', md: 'md:max-w-xl', lg: 'md:max-w-3xl', xl: 'md:max-w-5xl' };

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = 'md',
  children,
  footer,
  dismissible = true,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const token = useRef(Symbol('modal')).current;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    modalStack.push(token);
    document.body.style.overflow = 'hidden';

    // Focus the first form control, else the panel itself.
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      const first = panel?.querySelector<HTMLElement>('input,select,textarea') ?? panel;
      first?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return; // a modal stacked above us owns the keyboard
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(token), 1);
      if (modalStack.length === 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open, token]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:p-space-lg">
      <div className="absolute inset-0 animate-fade-in bg-[#0F172A66]" onClick={() => dismissible && onClose()} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-2xl bg-surface-container-lowest shadow-level-3 outline-none md:max-h-[88vh] md:rounded-2xl',
          SIZES[size],
          className,
        )}
      >
        {/* Drag handle affordance on mobile sheets */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-outline-variant md:hidden" aria-hidden />
        <header className="flex items-start gap-space-sm border-b border-outline-variant/30 px-space-md py-space-sm md:px-space-lg md:py-space-md">
          {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-headline-sm text-headline-sm text-on-surface">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 font-body-md text-body-md text-secondary">
                {description}
              </p>
            )}
          </div>
          {dismissible && <IconButton icon="close" label="Close" size="sm" onClick={onClose} />}
        </header>
        <div className="flex-1 overflow-y-auto px-space-md py-space-md md:px-space-lg">{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse gap-space-xs border-t border-outline-variant/30 px-space-md py-space-sm pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end md:px-space-lg">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}

/** Yes/no confirmation for destructive or irreversible actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="font-body-md text-body-md text-on-surface-variant">{message}</div>
    </Modal>
  );
}
