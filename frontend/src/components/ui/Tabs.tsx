/**
 * Pill tab bar from the roster design ("Active Students 342 | Batches 12 | …").
 * Scrolls horizontally on narrow screens (the active tab is kept in view);
 * optional trailing slot for legends.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface TabItem<V extends string> {
  value: V;
  label: ReactNode;
  icon?: string;
  count?: number;
}

interface TabsProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  items: TabItem<V>[];
  trailing?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function Tabs<V extends string>({ value, onChange, items, trailing, className, ariaLabel }: TabsProps<V>) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll the strip (never the page) so the selected tab is fully visible.
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const left = tab.offsetLeft; // the strip is `relative`, so this is relative to it
    if (left < list.scrollLeft) list.scrollLeft = left - 8;
    else if (left + tab.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = left + tab.offsetWidth - list.clientWidth + 8;
  }, [value]);

  return (
    <div
      className={cn(
        'flex flex-col items-stretch justify-between gap-space-sm rounded-xl bg-surface-container-lowest p-space-xs shadow-sm sm:flex-row sm:items-center',
        className,
      )}
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        className="scrollbar-none relative flex items-center gap-space-2xs overflow-x-auto"
      >
        {items.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.value)}
              className={cn(
                'flex h-11 shrink-0 items-center gap-space-xs rounded-lg px-space-md font-label-lg text-label-lg transition-all md:h-10',
                active
                  ? 'bg-primary-container text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
              )}
            >
              {t.icon && <Icon name={t.icon} size={18} />}
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 font-label-sm text-label-sm tnum',
                    active ? 'bg-surface-container-lowest text-primary' : 'bg-surface-container-high text-on-surface',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {trailing && <div className="hidden items-center gap-space-md px-space-sm lg:flex">{trailing}</div>}
    </div>
  );
}
