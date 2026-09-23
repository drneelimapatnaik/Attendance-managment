/**
 * Institute Settings (/settings — owners only; guarded in app/router.tsx).
 *
 * One long page of independent section cards, each with its own Save that
 * writes only that section's fields (updateSettings). Navigation is a sticky
 * side list on lg+ and a pinned, horizontally scrolling chip bar on phones.
 *
 * Sections report unsaved edits to the page, which marks them in the nav and
 * asks before leaving (in-app navigation via useBlocker, tab close via
 * beforeunload) so half-finished changes are not lost silently.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { ConfirmDialog, PageHeader } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { DirtyReporterContext } from './components/SettingsSection';
import { SettingsChipBar, SettingsSideNav, useActiveSection } from './components/SettingsNav';
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settingsSections';
import { AttendanceRulesSection } from './sections/AttendanceRulesSection';
import { BrandingSection } from './sections/BrandingSection';
import { CampusesSection } from './sections/CampusesSection';
import { DataPrivacySection } from './sections/DataPrivacySection';
import { FeesSection } from './sections/FeesSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { ProfileSection } from './sections/ProfileSection';
import { SubscriptionSection } from './sections/SubscriptionSection';
import { WorkingDaysSection } from './sections/WorkingDaysSection';

type DirtyMap = Partial<Record<SettingsSectionId, boolean>>;

export default function InstituteSettingsPage() {
  useDocumentTitle('Institute Settings');
  const settings = useSettings();
  const { active, jump } = useActiveSection();
  const [dirty, setDirty] = useState<DirtyMap>({});
  // Mirror of `dirty` that the navigation blocker reads at navigation time, so
  // it is current right after a section reports (state + blocker re-registration lag a render).
  const dirtyRef = useRef<DirtyMap>({});
  const report = useCallback((id: SettingsSectionId, isDirty: boolean) => {
    dirtyRef.current = { ...dirtyRef.current, [id]: isDirty };
    setDirty((prev) => (!!prev[id] === isDirty ? prev : { ...prev, [id]: isDirty }));
  }, []);

  const unsaved = SETTINGS_SECTIONS.filter((s) => dirty[s.id]);
  const anyDirty = unsaved.length > 0;

  // Leaving for another screen with unsaved sections → confirm first.
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      Object.values(dirtyRef.current).some(Boolean) && currentLocation.pathname !== nextLocation.pathname,
    [],
  );
  const blocker = useBlocker(shouldBlock);
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyDirty]);

  return (
    <DirtyReporterContext.Provider value={report}>
      <div className="flex flex-col gap-space-lg">
        <PageHeader
          eyebrow="Settings"
          title="Institute Settings"
          meta={`${settings.name} · ${settings.instituteCode}`}
          description="Profile, branding, campuses and the rules EduTrack applies to attendance and fees. Each section saves on its own."
        />

        <SettingsChipBar active={active} dirty={dirty} onJump={jump} />

        <div className="grid gap-space-lg lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-[calc(4rem+env(safe-area-inset-top)+1.5rem)]">
              <SettingsSideNav active={active} dirty={dirty} onJump={jump} />
            </div>
          </aside>
          <div className="flex min-w-0 flex-col gap-space-lg">
            <ProfileSection />
            <BrandingSection />
            <CampusesSection />
            <AttendanceRulesSection />
            <FeesSection />
            <NotificationsSection />
            <WorkingDaysSection />
            <SubscriptionSection />
            <DataPrivacySection />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Leave without saving?"
        confirmLabel="Discard & leave"
        message={
          <>
            Unsaved changes in <strong className="text-on-surface">{unsaved.map((s) => s.label).join(', ')}</strong> will be lost. Stay to
            save them, or leave and discard.
          </>
        }
      />
    </DirtyReporterContext.Provider>
  );
}
