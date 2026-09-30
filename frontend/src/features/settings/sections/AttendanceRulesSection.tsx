/**
 * Settings › Attendance rules: late threshold, low-attendance flag, whether
 * Late counts as present, and absence alerts to parents. The fields and their
 * validation live in ../fields, shared with the first-run setup wizard.
 */
import { useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { SettingsSection } from '../components/SettingsSection';
import { AttendanceRuleFields, validateAttendance, type AttendanceDraft } from '../fields';
import { useDraft } from '../useDraft';

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
  const errors = submitted ? validateAttendance(draft) : {};

  const save = () => {
    setSubmitted(true);
    if (Object.keys(validateAttendance(draft)).length) return;
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
      <AttendanceRuleFields draft={draft} patch={patch} errors={errors} />
    </SettingsSection>
  );
}
