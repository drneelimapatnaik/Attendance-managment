/**
 * Setup step 2 — branding: brand colour (applied live so the whole wizard
 * changes with it) and an optional logo. Both reuse the settings components.
 *
 * Leaving the step without saving restores the stored brand, so Skip never
 * leaves a colour the institute did not choose.
 */
import { useEffect, useMemo } from 'react';
import { applyBrandTheme } from '@/config/themes';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { BrandPreview, BrandThemePicker, LogoField, brandLabel } from '@/features/settings/fields';
import { useDraft } from '@/features/settings/useDraft';
import { SetupStepShell } from '../components/SetupStepShell';
import type { SetupNav } from '../useSetupNav';

export function BrandingStep({ nav }: { nav: SetupNav }) {
  const settings = useSettings();
  const updateSettings = useDataStore((s) => s.updateSettings);
  const saved = useMemo(
    () => ({ brandTheme: settings.brandTheme, logoUrl: settings.logoUrl ?? '' }),
    [settings.brandTheme, settings.logoUrl],
  );
  const { draft, patch } = useDraft(saved);

  // Live preview across the whole wizard…
  useEffect(() => applyBrandTheme(draft.brandTheme), [draft.brandTheme]);
  // …and back to what is stored if the step is skipped or stepped away from.
  useEffect(() => () => applyBrandTheme(useDataStore.getState().settings.brandTheme), []);

  const save = () => {
    updateSettings({ brandTheme: draft.brandTheme, logoUrl: draft.logoUrl || undefined });
    return true;
  };

  return (
    <SetupStepShell
      nav={nav}
      onNext={save}
      onBack={save}
      skipHint="Royal Blue and your initials are used until you change them."
      note={
        <>
          Status colours (paid, absent, overdue) never change — only your brand colour does, so the app always reads the same way. Change it
          any time in <strong className="text-on-surface">Settings › Branding</strong>.
        </>
      }
    >
      <LogoField
        value={draft.logoUrl}
        onChange={(logoUrl) => patch({ logoUrl })}
        name={settings.name}
        description="Optional. Square image under 256 KB — shown in the app header, on ID cards and on receipts."
      />
      <div className="grid gap-space-md xl:grid-cols-2">
        <BrandThemePicker value={draft.brandTheme} onChange={(brandTheme) => patch({ brandTheme })} savedValue={settings.brandTheme} />
        <BrandPreview label={brandLabel(draft.brandTheme)} />
      </div>
    </SetupStepShell>
  );
}
