/**
 * Settings › Branding: pick the tenant's brand colour. Choosing a swatch
 * applies it to the whole app immediately as a live preview; Save makes it
 * permanent, Discard (or leaving the page unsaved) restores the saved brand.
 * The picker and preview live in ../fields, shared with the setup wizard.
 */
import { useEffect, useMemo } from 'react';
import { applyBrandTheme } from '@/config/themes';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { SettingsSection } from '../components/SettingsSection';
import { BrandPreview, BrandThemePicker, brandLabel } from '../fields';
import { useDraft } from '../useDraft';

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

  const label = brandLabel(draft.brandTheme);

  return (
    <SettingsSection
      id="branding"
      icon="palette"
      title="Branding"
      description="Your brand colour for buttons, navigation and charts. Status colours (paid, absent…) never change."
      dirty={dirty}
      onSave={() => {
        updateSettings({ brandTheme: draft.brandTheme });
        toast({ title: 'Brand colour saved', description: `${label} is now used across the app for everyone.` });
      }}
      onDiscard={reset}
    >
      <div className="grid gap-space-md xl:grid-cols-2">
        <BrandThemePicker value={draft.brandTheme} onChange={(brandTheme) => patch({ brandTheme })} savedValue={settings.brandTheme} />
        <BrandPreview label={label} />
      </div>
    </SettingsSection>
  );
}
