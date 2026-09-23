/**
 * Dropdown menu / popover — DESIGN.md › Elevation Level 2.
 *
 * <Menu trigger={(props) => <Button {...props}>Open</Button>} items={[...]} />
 * or pass `children` for arbitrary popover content (notifications, switchers).
 *
 * The popover renders in a portal with fixed positioning, so scrolling or
 * clipping containers (tables, cards) never cut it off. It opens below the
 * trigger, flips above it near the bottom of the screen, stays attached while
 * the page scrolls, and sits above modals. Closes on outside click, Escape and
 * item selection; ↑/↓ move focus between items.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useEscape } from '@/hooks/ui';
import { Icon } from './Icon';

export interface MenuItem {
  label: ReactNode;
  icon?: string;
  onSelect?: () => void;
  description?: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Renders a divider above this item. */
  separator?: boolean;
  checked?: boolean;
}

interface TriggerProps {
  onClick: (e: React.MouseEvent) => void;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
}

interface MenuProps {
  trigger: (props: TriggerProps, open: boolean) => ReactNode;
  items?: MenuItem[];
  children?: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  width?: string; // Tailwind width class
  className?: string;
  header?: ReactNode;
}

const GAP = 8; // px between trigger and popover
const EDGE = 8; // px kept clear of the viewport edge

export function Menu({ trigger, items, children, align = 'end', width = 'w-60', className, header }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);
  useEscape(close, open);

  /** Place the popover against the trigger: below, or above when it won't fit. */
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const a = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.scrollHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - a.bottom - GAP - EDGE;
    const spaceAbove = a.top - GAP - EDGE;
    const up = h > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, up ? spaceAbove : spaceBelow);
    const shown = Math.min(h, maxHeight);
    const rawLeft = align === 'end' ? a.right - w : a.left;
    setPos({
      top: up ? a.top - GAP - shown : a.bottom + GAP,
      left: Math.min(Math.max(EDGE, rawLeft), Math.max(EDGE, vw - w - EDGE)),
      maxHeight,
    });
  }, [align]);

  // Measure once the (invisible) popover has mounted, then position it.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !anchorRef.current?.contains(t)) close();
    };
    // Follow the trigger when the page or a container scrolls (but not when the popover itself scrolls).
    let frame = 0;
    const onMove = (e: Event) => {
      if (e.target instanceof Node && popRef.current?.contains(e.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close, place]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!popRef.current || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const els = Array.from(popRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));
    const idx = els.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % els.length : (idx - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  return (
    <div ref={anchorRef} className={cn('relative', className)}>
      {trigger(
        {
          onClick: (e) => {
            e.stopPropagation(); // don't trigger row clicks in tables
            if (open) close();
            else setOpen(true);
          },
          'aria-haspopup': items ? 'menu' : 'dialog',
          'aria-expanded': open,
          'aria-controls': open ? id : undefined,
        },
        open,
      )}
      {open &&
        createPortal(
          <div
            id={id}
            ref={popRef}
            role={items ? 'menu' : 'dialog'}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: 'hidden' }}
            className={cn(
              // Above modals (z-100) so menus inside dialogs work; below toasts (z-110).
              'fixed z-[105] max-w-[calc(100vw-1rem)] animate-fade-in overflow-y-auto rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-level-2',
              width,
            )}
          >
            {header}
            {items && (
              <div className="py-1">
                {items.map((item, i) => (
                  <div key={i}>
                    {item.separator && <div className="my-1 border-t border-outline-variant/30" />}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        close();
                        item.onSelect?.();
                      }}
                      className={cn(
                        'flex w-full items-start gap-space-xs px-space-sm py-2.5 text-left transition-colors hover:bg-surface-container-low focus:bg-surface-container-low focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent md:py-2',
                        item.tone === 'danger' ? 'text-error' : 'text-on-surface',
                      )}
                    >
                      {item.icon && (
                        <Icon
                          name={item.icon}
                          size={18}
                          className={cn('mt-px', item.tone !== 'danger' && 'text-secondary', item.disabled && 'opacity-40')}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={cn('block font-label-lg text-label-lg', item.disabled && 'opacity-40')}>{item.label}</span>
                        {/* Descriptions stay readable on disabled items — they often explain why. */}
                        {item.description && <span className="block font-body-sm text-body-sm text-secondary">{item.description}</span>}
                      </span>
                      {item.checked && <Icon name="check" size={18} className="text-primary" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {typeof children === 'function' ? children(close) : children}
          </div>,
          document.body,
        )}
    </div>
  );
}
