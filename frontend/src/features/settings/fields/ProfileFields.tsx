/**
 * Institute profile fields + their validation, shared by Settings › Institute
 * profile and the setup wizard's Institute step.
 *
 * The component is presentational: the caller owns the draft and decides when
 * it is saved (a section's Save button, or the wizard's Next).
 */
import type { ReactNode } from 'react';
import { IconButton, TextArea, TextField } from '@/components/ui';
import { EMAIL_RE, PHONE_RE, YEAR_RE } from '../sections/fieldRules';

export interface ProfileDraft {
  name: string;
  tagline: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  logoUrl: string;
  academicYear: string;
  academicYearStart: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileDraft, string>>;

export function validateProfile(d: ProfileDraft): ProfileErrors {
  const e: ProfileErrors = {};
  if (d.name.trim().length < 2) e.name = 'Enter your institute’s name.';
  if (!EMAIL_RE.test(d.contactEmail.trim())) e.contactEmail = 'Enter a valid email address.';
  if (!PHONE_RE.test(d.contactPhone.trim())) e.contactPhone = 'Enter a valid phone number.';
  if (!YEAR_RE.test(d.academicYear.trim())) e.academicYear = 'Use the format 2026-27.';
  if (!d.academicYearStart) e.academicYearStart = 'Pick the date the academic year starts.';
  return e;
}

interface ProfileFieldsProps {
  draft: ProfileDraft;
  patch: (p: Partial<ProfileDraft>) => void;
  errors: ProfileErrors;
  /** The tenant's sign-in code. Editable only where the institute owns it. */
  instituteCode: string;
  onInstituteCodeChange?: (code: string) => void;
  /** Copy button on the read-only code field. */
  onCopyCode?: () => void;
  codeHint?: string;
  codeError?: string;
  /** Extra controls placed in the academic-year row (the wizard adds timezone + currency). */
  extras?: ReactNode;
}

export function ProfileFields({
  draft,
  patch,
  errors,
  instituteCode,
  onInstituteCodeChange,
  onCopyCode,
  codeHint = 'Staff enter this code to sign in. Contact support to change it.',
  codeError,
  extras,
}: ProfileFieldsProps) {
  const setCode = onInstituteCodeChange;
  return (
    <div className="flex flex-col gap-space-lg">
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
          value={instituteCode}
          readOnly={!setCode}
          autoCapitalize="characters"
          // Codes are uppercase letters, digits and dashes — the same shape the backend issues.
          onChange={setCode ? (e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')) : undefined}
          hint={codeHint}
          error={codeError}
          className="font-label-lg text-label-lg tracking-wider"
          trailing={onCopyCode ? <IconButton icon="content_copy" label="Copy institute code" size="sm" onClick={onCopyCode} /> : undefined}
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
        {extras}
      </div>
    </div>
  );
}
