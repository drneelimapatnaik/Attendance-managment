/**
 * Setup step 1 — the institute itself: name, sign-in code, contact details,
 * address, timezone, currency and the academic year.
 *
 * Fields and validation come from features/settings/fields (the same ones
 * Institute Settings uses). The institute code is read-only once a backend has
 * issued it during provisioning (docs/HOSTING.md); on the local store the
 * owner picks it here.
 */
import { useMemo, useState } from 'react';
import { SelectField } from '@/components/ui';
import { useMockBackend } from '@/config/env';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import {
  CURRENCIES,
  ProfileFields,
  timezoneOptions,
  validateProfile,
  type ProfileDraft,
  type ProfileErrors,
} from '@/features/settings/fields';
import { useDraft } from '@/features/settings/useDraft';
import { SetupStepShell } from '../components/SetupStepShell';
import type { SetupNav } from '../useSetupNav';

interface InstituteDraft extends ProfileDraft {
  instituteCode: string;
  timezone: string;
  currencyCode: string;
}

const CODE_RE = /^[A-Z0-9-]{2,20}$/;

export function InstituteStep({ nav }: { nav: SetupNav }) {
  const settings = useSettings();
  const updateSettings = useDataStore((s) => s.updateSettings);
  const [submitted, setSubmitted] = useState(false);
  // A server-issued code belongs to provisioning, not to the institute.
  const codeIsOurs = useMockBackend;

  const saved = useMemo<InstituteDraft>(
    () => ({
      name: settings.name,
      tagline: settings.tagline,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      address: settings.address,
      logoUrl: settings.logoUrl ?? '',
      academicYear: settings.academicYear,
      academicYearStart: settings.academicYearStart,
      instituteCode: settings.instituteCode,
      timezone: settings.timezone,
      currencyCode: settings.currency.code,
    }),
    [settings],
  );
  const { draft, patch } = useDraft(saved);

  const validate = (d: InstituteDraft): ProfileErrors & { instituteCode?: string } => {
    const e: ProfileErrors & { instituteCode?: string } = validateProfile(d);
    if (codeIsOurs && !CODE_RE.test(d.instituteCode)) e.instituteCode = 'Use 2–20 letters, digits or dashes.';
    return e;
  };
  const errors = submitted ? validate(draft) : {};

  const persist = () => {
    const currency = CURRENCIES.find((c) => c.code === draft.currencyCode);
    updateSettings({
      name: draft.name.trim(),
      tagline: draft.tagline.trim(),
      contactEmail: draft.contactEmail.trim(),
      contactPhone: draft.contactPhone.trim(),
      address: draft.address.trim(),
      academicYear: draft.academicYear.trim(),
      academicYearStart: draft.academicYearStart,
      timezone: draft.timezone,
      ...(codeIsOurs ? { instituteCode: draft.instituteCode } : {}),
      ...(currency ? { currency: { code: currency.code, symbol: currency.symbol, locale: currency.locale } } : {}),
    });
  };

  const save = () => {
    setSubmitted(true);
    if (Object.keys(validate(draft)).length) return false;
    persist();
    return true;
  };

  return (
    <SetupStepShell
      nav={nav}
      onNext={save}
      note={
        <>
          Everything here can be changed later in <strong className="text-on-surface">Settings › Institute profile</strong>. Your institute
          code is what staff type at sign-in.
        </>
      }
    >
      <ProfileFields
        draft={draft}
        patch={patch}
        errors={errors}
        instituteCode={draft.instituteCode}
        onInstituteCodeChange={codeIsOurs ? (instituteCode) => patch({ instituteCode }) : undefined}
        codeHint={
          codeIsOurs ? 'Short and memorable — staff type this at sign-in, e.g. BRIGHTKIDS.' : 'Issued when your instance was created.'
        }
        codeError={errors.instituteCode}
        extras={
          <>
            <SelectField
              label="Timezone"
              value={draft.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
              options={timezoneOptions(settings.timezone)}
              hint="Used for class times, roll call and reports."
            />
            <SelectField
              label="Currency"
              value={draft.currencyCode}
              onChange={(e) => patch({ currencyCode: e.target.value })}
              options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name} (${c.symbol})` }))}
              hint="Fees, invoices and receipts are shown in this currency."
            />
          </>
        }
      />
    </SetupStepShell>
  );
}
