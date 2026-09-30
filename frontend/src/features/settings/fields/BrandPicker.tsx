/**
 * Brand colour picker + live preview, shared by Settings › Branding and the
 * setup wizard's Branding step. Swatch colours come from config/themes.ts —
 * the only raw colours here; the preview itself is built from design tokens,
 * so it shows whatever brand the document currently has applied.
 */
import type { KeyboardEvent } from 'react';
import type { BrandTheme } from '@/types/domain';
import { Badge, Icon, ProgressBar } from '@/components/ui';
import { BRAND_THEMES } from '@/config/themes';
import { cn } from '@/lib/cn';

/** A miniature of real UI in the current brand tokens (the brand is applied live). */
export function BrandPreview({ label }: { label: string }) {
  return (
    <div aria-hidden className="flex flex-col gap-space-sm rounded-xl border border-outline-variant/50 bg-surface p-space-sm">
      <div className="flex items-center justify-between gap-space-xs">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Preview · {label}</span>
        <Badge tone="primary" icon="check_circle">
          Paid (Clear)
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-space-xs">
        <span className="inline-flex items-center gap-space-xs rounded-lg bg-primary-container px-space-sm py-2 font-label-lg text-label-lg text-on-primary">
          <Icon name="fact_check" size={18} filled />
          Class Attendance
        </span>
        <span className="inline-flex items-center gap-space-xs rounded-lg px-space-sm py-2 font-label-lg text-label-lg text-on-surface-variant">
          <Icon name="groups" size={18} />
          Students
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-space-xs">
        <span className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-space-sm font-label-lg text-label-lg text-on-primary shadow-sm">
          <Icon name="person_add" size={16} />
          Add student
        </span>
        <span className="inline-flex h-9 items-center rounded-lg bg-surface-container px-space-sm font-label-lg text-label-lg text-on-surface-variant">
          Export
        </span>
        <span className="font-label-lg text-label-lg text-primary underline">View report</span>
      </div>
      <ProgressBar value={0.72} size="sm" />
    </div>
  );
}

interface BrandThemePickerProps {
  value: BrandTheme;
  onChange: (theme: BrandTheme) => void;
  /** Marks the theme currently persisted, so an unsaved preview is obvious. */
  savedValue?: BrandTheme;
  className?: string;
}

export function BrandThemePicker({ value, onChange, savedValue, className }: BrandThemePickerProps) {
  // Radio-group keyboard model: arrows move (and select) within the group.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = BRAND_THEMES.findIndex((t) => t.id === value);
    const next = BRAND_THEMES[(i + delta + BRAND_THEMES.length) % BRAND_THEMES.length];
    onChange(next.id);
    e.currentTarget.querySelector<HTMLElement>(`[data-theme="${next.id}"]`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Brand colour"
      onKeyDown={onKeyDown}
      className={cn('grid grid-cols-2 gap-space-xs sm:grid-cols-3 xl:grid-cols-2', className)}
    >
      {BRAND_THEMES.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-theme={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex min-h-[44px] items-center gap-space-xs rounded-lg border p-space-xs text-left transition-colors',
              on ? 'border-primary-container bg-primary-fixed/50' : 'border-outline-variant/60 hover:bg-surface-container-low',
            )}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-primary shadow-sm"
              style={{ background: t.swatch }}
            >
              {on && <Icon name="check" size={18} />}
            </span>
            <span className="min-w-0 flex-1 truncate font-label-lg text-label-lg text-on-surface">{t.label}</span>
            {t.id === savedValue && <span className="font-label-sm text-label-sm text-secondary">Saved</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Human label for a theme id, for toasts and preview captions. */
export function brandLabel(theme: BrandTheme): string {
  return (BRAND_THEMES.find((t) => t.id === theme) ?? BRAND_THEMES[0]).label;
}
