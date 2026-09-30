/**
 * Attendance rule fields + validation, shared by Settings › Attendance rules
 * and the setup wizard's rules step. Numbers are edited as text and validated
 * by the caller before saving.
 */
import { Switch, TextField } from '@/components/ui';
import { intInRange } from '../sections/fieldRules';

export interface AttendanceDraft {
  lateAfterMinutes: string;
  lowAttendanceThreshold: string;
  countLateAsPresent: boolean;
  notifyParentOnAbsence: boolean;
}

export type AttendanceErrors = Partial<Record<'lateAfterMinutes' | 'lowAttendanceThreshold', string>>;

export function validateAttendance(d: AttendanceDraft): AttendanceErrors {
  const e: AttendanceErrors = {};
  if (!intInRange(d.lateAfterMinutes, 0, 120)) e.lateAfterMinutes = 'Enter whole minutes between 0 and 120.';
  if (!intInRange(d.lowAttendanceThreshold, 1, 100)) e.lowAttendanceThreshold = 'Enter a percentage between 1 and 100.';
  return e;
}

interface AttendanceRuleFieldsProps {
  draft: AttendanceDraft;
  patch: (p: Partial<AttendanceDraft>) => void;
  errors: AttendanceErrors;
}

export function AttendanceRuleFields({ draft, patch, errors }: AttendanceRuleFieldsProps) {
  const late = Number(draft.lateAfterMinutes);
  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid gap-space-sm sm:grid-cols-2">
        <TextField
          label="Late after (minutes)"
          type="number"
          inputMode="numeric"
          min={0}
          max={120}
          value={draft.lateAfterMinutes}
          onChange={(e) => patch({ lateAfterMinutes: e.target.value })}
          error={errors.lateAfterMinutes}
          hint={
            Number.isFinite(late) && late >= 0
              ? `Arriving more than ${late} min after the start is marked Late.`
              : 'Minutes after class starts.'
          }
        />
        <TextField
          label="Low-attendance threshold (%)"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={draft.lowAttendanceThreshold}
          onChange={(e) => patch({ lowAttendanceThreshold: e.target.value })}
          error={errors.lowAttendanceThreshold}
          hint="Students below this are flagged in reports and on their profile."
        />
      </div>
      <div className="flex flex-col gap-space-md rounded-xl bg-surface-container-low p-space-sm">
        <Switch
          checked={draft.countLateAsPresent}
          onChange={(v) => patch({ countLateAsPresent: v })}
          label="Count late arrivals as present"
          description="When off, Late counts against the attendance percentage like an absence."
        />
        <Switch
          checked={draft.notifyParentOnAbsence}
          onChange={(v) => patch({ notifyParentOnAbsence: v })}
          label="Notify parents on absence"
          description="Sends an alert to the guardian when a roll call marks the student absent (uses your notification channels)."
        />
      </div>
    </div>
  );
}
