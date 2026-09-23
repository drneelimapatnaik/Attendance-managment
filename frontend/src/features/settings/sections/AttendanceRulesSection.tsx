/**
 * Settings › Attendance rules: late threshold, low-attendance flag, whether
 * Late counts as present, and absence alerts to parents. Numbers are edited
 * as text and validated on save.
 */
import { useMemo, useState } from 'react';
import { Switch, TextField } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { SettingsSection } from '../components/SettingsSection';
import { useDraft } from '../useDraft';
import { intInRange } from './fieldRules';

interface AttendanceDraft {
  lateAfterMinutes: string;
  lowAttendanceThreshold: string;
  countLateAsPresent: boolean;
  notifyParentOnAbsence: boolean;
}

function validate(d: AttendanceDraft) {
  return {
    lateAfterMinutes: intInRange(d.lateAfterMinutes, 0, 120) ? undefined : 'Enter whole minutes between 0 and 120.',
    lowAttendanceThreshold: intInRange(d.lowAttendanceThreshold, 1, 100) ? undefined : 'Enter a percentage between 1 and 100.',
  };
}

export function AttendanceRulesSection() {
  const rules = useSettings().attendance;
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const [submitted, setSubmitted] = useState(false);
  const saved = useMemo<AttendanceDraft>(
    () => ({
      lateAfterMinutes: String(rules.lateAfterMinutes),
      lowAttendanceThreshold: String(rules.lowAttendanceThreshold),
      countLateAsPresent: rules.countLateAsPresent,
      notifyParentOnAbsence: rules.notifyParentOnAbsence,
    }),
    [rules],
  );
  const { draft, patch, dirty, reset } = useDraft(saved);
  const errors: Partial<ReturnType<typeof validate>> = submitted ? validate(draft) : {};

  const save = () => {
    setSubmitted(true);
    const e = validate(draft);
    if (e.lateAfterMinutes || e.lowAttendanceThreshold) return;
    updateSettings({
      attendance: {
        lateAfterMinutes: Number(draft.lateAfterMinutes),
        lowAttendanceThreshold: Number(draft.lowAttendanceThreshold),
        countLateAsPresent: draft.countLateAsPresent,
        notifyParentOnAbsence: draft.notifyParentOnAbsence,
      },
    });
    setSubmitted(false);
    toast({ title: 'Attendance rules saved', description: 'Reports and alerts use the new rules from now on.' });
  };

  const late = Number(draft.lateAfterMinutes);

  return (
    <SettingsSection
      id="attendance"
      icon="fact_check"
      title="Attendance rules"
      description="How arrivals are marked and when students are flagged for low attendance."
      dirty={dirty}
      onSave={save}
      onDiscard={() => {
        reset();
        setSubmitted(false);
      }}
    >
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
    </SettingsSection>
  );
}
