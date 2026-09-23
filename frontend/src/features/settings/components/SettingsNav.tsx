/**
 * Section navigation for Institute Settings.
 *
 *  lg+     sticky vertical list beside the sections
 *  phones  horizontally scrolling chip bar pinned under the top bar
 *
 * The section in view is tracked with an IntersectionObserver and marked
 * aria-current; sections with unsaved edits show a dot. Jumping scrolls with
 * scrollIntoView rather than #hash links, which would clash with the hash
 * router used inside the native shells.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SECTION_IDS, SETTINGS_SECTIONS, type SettingsSectionId } from '../settingsSections';

/** Which section is currently in the reading zone (upper part of the viewport). */
export function useActiveSection() {
  const [active, setActive] = useState<SettingsSectionId>(SECTION_IDS[0]);
  useEffect(() => {
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting));
        const first = SECTION_IDS.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const jump = (id: SettingsSectionId) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return { active, jump };
}

interface NavProps {
  active: SettingsSectionId;
  dirty: Partial<Record<SettingsSectionId, boolean>>;
  onJump: (id: SettingsSectionId) => void;
}

const UnsavedDot = () => (
  <>
    <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
    <span className="sr-only">(unsaved changes)</span>
  </>
);

export function SettingsSideNav({ active, dirty, onJump }: NavProps) {
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-1">
      {SETTINGS_SECTIONS.map((s) => {
        const on = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() => onJump(s.id)}
            className={cn(
              'flex items-center gap-space-xs rounded-lg px-space-sm py-space-xs text-left transition-colors',
              on ? 'bg-primary-fixed text-on-primary-fixed' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            <Icon name={s.icon} size={18} filled={on} />
            <span className="min-w-0 flex-1 truncate font-label-lg text-label-lg">{s.label}</span>
            {dirty[s.id] && <UnsavedDot />}
          </button>
        );
      })}
    </nav>
  );
}

export function SettingsChipBar({ active, dirty, onJump }: NavProps) {
  const barRef = useRef<HTMLDivElement>(null);

  // Keep the active chip in view as the page scrolls.
  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - 16, behavior: 'smooth' });
  }, [active]);

  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-space-md border-b border-outline-variant/30 bg-surface/95 backdrop-blur md:-mx-space-lg lg:hidden"
    >
      <div ref={barRef} className="scrollbar-none flex gap-space-xs overflow-x-auto px-space-md py-space-xs md:px-space-lg">
        {SETTINGS_SECTIONS.map((s) => {
          const on = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              data-section={s.id}
              aria-current={on ? 'true' : undefined}
              onClick={() => onJump(s.id)}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-space-sm font-label-lg text-label-lg transition-colors',
                on
                  ? 'border-primary-container bg-primary-container text-on-primary'
                  : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface-variant',
              )}
            >
              <Icon name={s.icon} size={18} />
              {s.label}
              {dirty[s.id] && <UnsavedDot />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
