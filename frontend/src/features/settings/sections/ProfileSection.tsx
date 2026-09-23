/**
 * Settings › Institute profile: name, tagline, contact details, address,
 * logo and academic year. The institute code is read-only (staff type it at
 * sign-in) with a copy button. The logo is read locally into a data URL —
 * small files only, since it is stored with the tenant settings.
 */
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Button, IconButton, TextArea, TextField } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { initials } from '@/lib/format';
import { SettingsSection } from '../components/SettingsSection';
import { useDraft } from '../useDraft';

const MAX_LOGO_BYTES = 256 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s-]{8,18}$/;
const YEAR_RE = /^\d{4}-\d{2}$/;

interface ProfileDraft {
  name: string;
  tagline: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  logoUrl: string;
  academicYear: string;
  academicYearStart: string;
}

type Errors = Partial<Record<keyof ProfileDraft, string>>;

function validate(d: ProfileDraft): Errors {
  const e: Errors = {};
  if (d.name.trim().length < 2) e.name = 'Enter your institute’s name.';
  if (!EMAIL_RE.test(d.contactEmail.trim())) e.contactEmail = 'Enter a valid email address.';
  if (!PHONE_RE.test(d.contactPhone.trim())) e.contactPhone = 'Enter a valid phone number.';
  if (!YEAR_RE.test(d.academicYear.trim())) e.academicYear = 'Use the format 2026-27.';
  if (!d.academicYearStart) e.academicYearStart = 'Pick the date the academic year starts.';
  return e;
}

export function ProfileSection() {
  const settings = useSettings();
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
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
  const errors = submitted ? validate(draft) : {};

  const save = () => {
    setSubmitted(true);
    if (Object.keys(validate(draft)).length) return;
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

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Choose an image file', description: 'PNG, JPG, SVG or WebP.', tone: 'error' });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({ title: 'Logo is too large', description: 'Use an image under 256 KB (square works best).', tone: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && patch({ logoUrl: reader.result });
    reader.onerror = () => toast({ title: 'Couldn’t read that file', tone: 'error' });
    reader.readAsDataURL(file);
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
    >
      <div className="flex flex-col gap-space-lg">
        <div className="flex items-center gap-space-md">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-outline-variant/50 bg-surface-container-low">
            {draft.logoUrl ? (
              <img src={draft.logoUrl} alt={`${draft.name} logo`} className="h-full w-full object-contain p-1.5" />
            ) : (
              <span className="font-headline-sm text-headline-sm text-primary" aria-hidden>
                {initials(draft.name || 'Institute')}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-space-xs">
            <div>
              <p className="font-label-lg text-label-lg text-on-surface">Logo</p>
              <p className="font-body-sm text-body-sm text-secondary">
                Square image under 256 KB. Shown in the app header and on ID cards.
              </p>
            </div>
            <div className="flex flex-wrap gap-space-xs">
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onLogo} tabIndex={-1} aria-hidden />
              <Button variant="tonal" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
                {draft.logoUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              {draft.logoUrl && (
                <Button variant="ghost" size="sm" icon="delete" onClick={() => patch({ logoUrl: '' })}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-space-sm sm:grid-cols-2">
          <TextField
            label="Institute name"
            required
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            error={errors.name}
          />
          <TextField
            label="Institute code"
            value={settings.instituteCode}
            readOnly
            hint="Staff enter this code to sign in. Contact support to change it."
            className="font-label-lg text-label-lg tracking-wider"
            trailing={<IconButton icon="content_copy" label="Copy institute code" size="sm" onClick={copyCode} />}
          />
          <TextField
            label="Tagline"
            placeholder="e.g. Coaching for Grades 10–12"
            value={draft.tagline}
            onChange={(e) => patch({ tagline: e.target.value })}
            containerClassName="sm:col-span-2"
          />
          <TextField
            label="Contact email"
            type="email"
            required
            value={draft.contactEmail}
            onChange={(e) => patch({ contactEmail: e.target.value })}
            error={errors.contactEmail}
          />
          <TextField
            label="Contact phone"
            type="tel"
            inputMode="tel"
            required
            value={draft.contactPhone}
            onChange={(e) => patch({ contactPhone: e.target.value })}
            error={errors.contactPhone}
          />
          <TextArea
            label="Registered address"
            rows={2}
            value={draft.address}
            onChange={(e) => patch({ address: e.target.value })}
            hint="Printed on receipts and invoices."
            containerClassName="sm:col-span-2"
          />
        </div>

        <div className="grid gap-space-sm sm:grid-cols-2">
          <TextField
            label="Academic year"
            placeholder="2026-27"
            value={draft.academicYear}
            onChange={(e) => patch({ academicYear: e.target.value })}
            error={errors.academicYear}
            hint="Shown in page headers and on ID cards."
          />
          <TextField
            label="Academic year starts on"
            type="date"
            value={draft.academicYearStart}
            onChange={(e) => patch({ academicYearStart: e.target.value })}
            error={errors.academicYearStart}
            hint="Start of the reporting year."
          />
        </div>
      </div>
    </SettingsSection>
  );
}
