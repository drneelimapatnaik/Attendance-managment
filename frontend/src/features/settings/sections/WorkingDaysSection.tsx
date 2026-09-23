/**
 * Settings › Working days: weekday toggle chips. Batches keep their own
 * timetable; the note lists any that meet on a day marked closed so owners
 * notice the mismatch before saving.
 */
import { useMemo, useState } from 'react';
import { WEEKDAYS, type Weekday } from '@/types/domain';
import { Icon } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { cn } from '@/lib/cn';
import { SettingsSection } from '../components/SettingsSection';
import { useDraft } from '../useDraft';

const FULL: Record<Weekday, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

export function WorkingDaysSection() {
  const workingDays = useSettings().workingDays;
  const batches = useDataStore((s) => s.batches);
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const [submitted, setSubmitted] = useState(false);
  const saved = useMemo(() => ({ days: WEEKDAYS.filter((d) => workingDays.includes(d)) }), [workingDays]);
  const { draft, setDraft, dirty, reset } = useDraft(saved);

  const toggle = (d: Weekday) =>
    setDraft((cur) => ({ days: WEEKDAYS.filter((w) => (w === d ? !cur.days.includes(w) : cur.days.includes(w))) }));

  // Active batches that meet on a day the institute would now be closed.
  const clashes = useMemo(
    () => batches.filter((b) => b.status === 'Active' && b.days.some((d) => !draft.days.includes(d))),
    [batches, draft.days],
  );
  const empty = draft.days.length === 0;

  return (
    <SettingsSection
      id="working-days"
      icon="calendar_month"
      title="Working days"
      description="Days the institute is open. Used for timetables, reports and reminders."
      dirty={dirty}
      onSave={() => {
        setSubmitted(true);
        if (empty) return;
        updateSettings({ workingDays: draft.days });
        setSubmitted(false);
        toast({ title: 'Working days saved', description: draft.days.join(', ') });
      }}
      onDiscard={() => {
        reset();
        setSubmitted(false);
      }}
    >
      <div role="group" aria-label="Working days" className="grid grid-cols-4 gap-space-xs sm:flex sm:flex-wrap">
        {WEEKDAYS.map((d) => {
          const on = draft.days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={FULL[d]}
              onClick={() => toggle(d)}
              className={cn(
                'inline-flex h-11 min-w-[4.5rem] items-center justify-center gap-1 rounded-lg border px-space-sm font-label-lg text-label-lg transition-colors',
                on
                  ? 'border-primary-container bg-primary-container text-on-primary'
                  : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low',
              )}
            >
              <Icon name={on ? 'check' : 'block'} size={16} />
              {d}
            </button>
          );
        })}
      </div>
      <p className="mt-space-sm font-body-sm text-body-sm text-secondary">
        {empty ? 'Pick at least one day.' : `Open ${draft.days.length} day${draft.days.length === 1 ? '' : 's'} a week.`}
      </p>
      {submitted && empty && (
        <p role="alert" className="mt-1 flex items-center gap-1 font-body-sm text-body-sm text-error">
          <Icon name="error" size={14} />
          Select at least one working day.
        </p>
      )}
      {!empty && clashes.length > 0 && (
        <p className="mt-space-sm flex items-start gap-space-xs rounded-xl bg-warning-container p-space-sm font-body-md text-body-md text-on-warning-container">
          <Icon name="warning" size={18} className="mt-px" />
          <span>
            {clashes.length === 1 ? `${clashes[0].name} meets` : `${clashes.length} batches meet`} on a closed day (
            {[...new Set(clashes.flatMap((b) => b.days.filter((d) => !draft.days.includes(d))))].join(', ')}). Their timetable is unchanged
            — edit the batch if it should move.
          </span>
        </p>
      )}
    </SettingsSection>
  );
}
