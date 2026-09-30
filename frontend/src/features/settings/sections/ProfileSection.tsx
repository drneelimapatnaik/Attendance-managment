/**
 * Settings › Institute profile: name, tagline, contact details, address,
 * logo and academic year. The institute code is read-only (staff type it at
 * sign-in) with a copy button.
 *
 * The fields and their validation live in ../fields, shared with the first-run
 * setup wizard; this section only adds the draft, the save and the toast.
 */
import { useMemo, useState } from 'react';
import { ButtonLink } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { SettingsSection } from '../components/SettingsSection';
import { LogoField, ProfileFields, validateProfile, type ProfileDraft } from '../fields';
import { useDraft } from '../useDraft';

export function ProfileSection() {
  const settings = useSettings();
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const [submitted, setSubmitted] = useState(false);

  const saved = useMemo<ProfileDraft>(
    () => ({
      name: settings.name,
      tagline: settings.tagline,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      address: settings.address,
      logoUrl: settings.logoUrl ?? '',
      academicYear: settings.academicYear,
      academicYearStart: settings.academicYearStart,
    }),
    [settings],
  );
  const { draft, patch, dirty, reset } = useDraft(saved);
  // Errors show after the first save attempt and then update live.
  const errors = submitted ? validateProfile(draft) : {};

  const save = () => {
    setSubmitted(true);
    if (Object.keys(validateProfile(draft)).length) return;
    updateSettings({
      name: draft.name.trim(),
      tagline: draft.tagline.trim(),
      contactEmail: draft.contactEmail.trim(),
      contactPhone: draft.contactPhone.trim(),
      address: draft.address.trim(),
      logoUrl: draft.logoUrl || undefined,
      academicYear: draft.academicYear.trim(),
      academicYearStart: draft.academicYearStart,
    });
    setSubmitted(false);
    toast({ title: 'Institute profile saved' });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(settings.instituteCode);
      toast({ title: 'Institute code copied', description: `Share “${settings.instituteCode}” with staff for sign-in.`, tone: 'info' });
    } catch {
      toast({ title: 'Couldn’t copy automatically', description: `Your institute code is ${settings.instituteCode}.`, tone: 'error' });
    }
  };

  return (
    <SettingsSection
      id="profile"
      icon="apartment"
      title="Institute profile"
      description="How your institute appears to staff, parents and on receipts."
      dirty={dirty}
      onSave={save}
      onDiscard={() => {
        reset();
        setSubmitted(false);
      }}
      headerActions={
        // Walk through the first-run wizard again. ?rerun=1 keeps the institute
        // marked as set up, so nobody is locked into the wizard half-way.
        <ButtonLink to="/setup?rerun=1" variant="tonal" size="sm" icon="checklist">
          Re-run setup
        </ButtonLink>
      }
    >
      <div className="flex flex-col gap-space-lg">
        <LogoField value={draft.logoUrl} onChange={(logoUrl) => patch({ logoUrl })} name={draft.name} />
        <ProfileFields draft={draft} patch={patch} errors={errors} instituteCode={settings.instituteCode} onCopyCode={copyCode} />
      </div>
    </SettingsSection>
  );
}
