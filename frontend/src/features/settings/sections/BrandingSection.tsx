/**
 * Settings › Branding: pick the tenant's brand colour. Choosing a swatch
 * applies it to the whole app immediately as a live preview; Save makes it
 * permanent, Discard (or leaving the page unsaved) restores the saved brand.
 * Swatch colours come from config/themes.ts — the only raw colours here.
 */
import { useEffect, useMemo, type KeyboardEvent } from 'react';
import type { BrandTheme } from '@/types/domain';
import { Badge, Icon, ProgressBar } from '@/components/ui';
import { BRAND_THEMES, applyBrandTheme } from '@/config/themes';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { cn } from '@/lib/cn';
import { SettingsSection } from '../components/SettingsSection';
import { useDraft } from '../useDraft';

/** A miniature of real UI in the current brand tokens (the brand is applied live). */
function BrandPreview({ label }: { label: string }) {
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

export function BrandingSection() {
  const settings = useSettings();
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const saved = useMemo(() => ({ brandTheme: settings.brandTheme }), [settings.brandTheme]);
  const { draft, patch, dirty, reset } = useDraft(saved);

  // The app always shows the draft brand (live preview). This also covers
  // Discard and a draft reset by "Reset demo data".
  useEffect(() => applyBrandTheme(draft.brandTheme), [draft.brandTheme]);
  // Leaving the page with an unsaved preview restores the saved brand.
  useEffect(() => () => applyBrandTheme(useDataStore.getState().settings.brandTheme), []);

  const choose = (id: BrandTheme) => patch({ brandTheme: id });

  // Radio-group keyboard model: arrows move (and select) within the group.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = BRAND_THEMES.findIndex((t) => t.id === draft.brandTheme);
    const next = BRAND_THEMES[(i + delta + BRAND_THEMES.length) % BRAND_THEMES.length];
    choose(next.id);
    e.currentTarget.querySelector<HTMLElement>(`[data-theme="${next.id}"]`)?.focus();
  };

  const current = BRAND_THEMES.find((t) => t.id === draft.brandTheme) ?? BRAND_THEMES[0];

  return (
    <SettingsSection
      id="branding"
      icon="palette"
      title="Branding"
      description="Your brand colour for buttons, navigation and charts. Status colours (paid, absent…) never change."
      dirty={dirty}
      onSave={() => {
        updateSettings({ brandTheme: draft.brandTheme });
        toast({ title: 'Brand colour saved', description: `${current.label} is now used across the app for everyone.` });
      }}
      onDiscard={reset}
    >
      <div className="grid gap-space-md xl:grid-cols-2">
        <div
          role="radiogroup"
          aria-label="Brand colour"
          onKeyDown={onKeyDown}
          className="grid grid-cols-2 gap-space-xs sm:grid-cols-3 xl:grid-cols-2"
        >
          {BRAND_THEMES.map((t) => {
            const on = t.id === draft.brandTheme;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-theme={t.id}
                onClick={() => choose(t.id)}
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
                {t.id === settings.brandTheme && <span className="font-label-sm text-label-sm text-secondary">Saved</span>}
              </button>
            );
          })}
        </div>
        <BrandPreview label={current.label} />
      </div>
    </SettingsSection>
  );
}
