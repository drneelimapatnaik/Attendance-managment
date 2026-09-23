/**
 * Card shell for one settings section: icon + title header, the fields, and
 * a footer with Discard / Save. Save stays disabled until the section has
 * changes, and Enter in a field submits. Each section reports whether it is
 * dirty to the page (unsaved dot in the nav + leave-page warning).
 * Read-only sections (subscription, data) omit `onSave` and get no footer.
 */
import { createContext, useContext, useEffect, useId, type ReactNode } from 'react';
import { Button, Icon } from '@/components/ui';
import type { SettingsSectionId } from '../settingsSections';

/** Page-level sink for per-section dirty flags. */
export const DirtyReporterContext = createContext<(id: SettingsSectionId, dirty: boolean) => void>(() => {});

interface SettingsSectionProps {
  id: SettingsSectionId;
  icon: string;
  title: string;
  description?: ReactNode;
  dirty?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({
  id,
  icon,
  title,
  description,
  dirty = false,
  onSave,
  onDiscard,
  saveLabel = 'Save changes',
  headerActions,
  children,
}: SettingsSectionProps) {
  const report = useContext(DirtyReporterContext);
  const headingId = useId();
  useEffect(() => report(id, dirty), [report, id, dirty]);
  useEffect(() => () => report(id, false), [report, id]);

  return (
    // scroll-mt clears the sticky top bar (and the chip bar on phones) when jumping here.
    <section id={id} aria-labelledby={headingId} className="card scroll-mt-[8.5rem] p-space-md md:p-space-lg lg:scroll-mt-24">
      <header className="mb-space-md flex flex-col gap-space-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-space-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary">
            <Icon name={icon} />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="font-title-lg text-title-lg font-bold text-on-surface">
              {title}
            </h2>
            {description && <p className="mt-0.5 font-body-sm text-body-sm text-secondary">{description}</p>}
          </div>
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-space-xs pl-[3.25rem] sm:pl-0">{headerActions}</div>}
      </header>

      {onSave ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) onSave();
          }}
        >
          {children}
          <footer className="mt-space-lg flex flex-col gap-space-sm border-t border-outline-variant/30 pt-space-md sm:flex-row sm:items-center sm:justify-between">
            <p className="font-body-sm text-body-sm text-secondary" aria-live="polite">
              {dirty ? (
                <span className="inline-flex items-center gap-1.5 font-label-md text-label-md text-on-surface">
                  <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
                  Unsaved changes
                </span>
              ) : (
                'All changes saved'
              )}
            </p>
            <div className="flex gap-space-xs">
              {dirty && onDiscard && (
                <Button variant="ghost" icon="undo" onClick={onDiscard} className="flex-1 sm:flex-none">
                  Discard
                </Button>
              )}
              <Button type="submit" icon="save" disabled={!dirty} className="flex-1 sm:flex-none">
                {saveLabel}
              </Button>
            </div>
          </footer>
        </form>
      ) : (
        children
      )}
    </section>
  );
}

/** Small uppercase label used above groups inside a section. */
export function FieldGroupLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="label">
      {children}
    </p>
  );
}
