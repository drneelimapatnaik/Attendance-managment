/**
 * Setup step 5 — the rules EduTrack applies on the institute's behalf:
 * attendance marking and the fee/billing cycle. Both field groups (and their
 * validation) are the ones Institute Settings uses; the currency was already
 * chosen in step 1, so it is hidden here.
 */
import { useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import {
  AttendanceRuleFields,
  FeeRuleFields,
  validateAttendance,
  validateFees,
  type AttendanceDraft,
  type FeesDraft,
} from '@/features/settings/fields';
import { useDraft } from '@/features/settings/useDraft';
import { SetupStepShell } from '../components/SetupStepShell';
import type { SetupNav } from '../useSetupNav';

export function RulesStep({ nav }: { nav: SetupNav }) {
  const settings = useSettings();
  const paymentsCount = useDataStore((s) => s.payments.length);
  const updateSettings = useDataStore((s) => s.updateSettings);
  const [submitted, setSubmitted] = useState(false);
  const { attendance, fees, currency } = settings;

  const savedAttendance = useMemo<AttendanceDraft>(
    () => ({
      lateAfterMinutes: String(attendance.lateAfterMinutes),
      lowAttendanceThreshold: String(attendance.lowAttendanceThreshold),
      countLateAsPresent: attendance.countLateAsPresent,
      notifyParentOnAbsence: attendance.notifyParentOnAbsence,
    }),
    [attendance],
  );
  const savedFees = useMemo<FeesDraft>(
    () => ({
      billingMode: fees.billingMode,
      billingDay: String(fees.billingDay),
      dueInDays: String(fees.dueInDays),
      gracePeriodDays: String(fees.gracePeriodDays),
      lateFee: String(fees.lateFee),
      receiptPrefix: fees.receiptPrefix,
      currency: currency.code,
    }),
    [fees, currency.code],
  );
  const a = useDraft(savedAttendance);
  const f = useDraft(savedFees);

  const attendanceErrors = submitted ? validateAttendance(a.draft) : {};
  const feeErrors = submitted ? validateFees(f.draft) : {};

  const save = () => {
    setSubmitted(true);
    if (Object.keys(validateAttendance(a.draft)).length || Object.keys(validateFees(f.draft)).length) return false;
    updateSettings({
      attendance: {
        lateAfterMinutes: Number(a.draft.lateAfterMinutes),
        lowAttendanceThreshold: Number(a.draft.lowAttendanceThreshold),
        countLateAsPresent: a.draft.countLateAsPresent,
        notifyParentOnAbsence: a.draft.notifyParentOnAbsence,
      },
      fees: {
        billingMode: f.draft.billingMode,
        billingDay: f.draft.billingMode === 'fixed-day' ? Number(f.draft.billingDay) : fees.billingDay,
        dueInDays: Number(f.draft.dueInDays),
        gracePeriodDays: Number(f.draft.gracePeriodDays),
        lateFee: Number(f.draft.lateFee),
        receiptPrefix: f.draft.receiptPrefix,
      },
    });
    return true;
  };

  return (
    <SetupStepShell
      nav={nav}
      onNext={save}
      skipHint="The defaults shown here are kept."
      note={
        <>
          These rules only affect what happens from now on — nothing is recalculated behind you. Adjust them any time in{' '}
          <strong className="text-on-surface">Settings › Attendance rules</strong> and{' '}
          <strong className="text-on-surface">Settings › Fees &amp; billing</strong>.
        </>
      }
    >
      <section aria-labelledby="setup-attendance-rules" className="flex flex-col gap-space-sm">
        <h3 id="setup-attendance-rules" className="font-title-md text-title-md text-on-surface">
          Attendance
        </h3>
        <AttendanceRuleFields draft={a.draft} patch={a.patch} errors={attendanceErrors} />
      </section>
      <section aria-labelledby="setup-fee-rules" className="flex flex-col gap-space-sm border-t border-outline-variant/30 pt-space-md">
        <h3 id="setup-fee-rules" className="font-title-md text-title-md text-on-surface">
          Fees &amp; billing
        </h3>
        <FeeRuleFields
          draft={f.draft}
          patch={f.patch}
          errors={feeErrors}
          currency={currency}
          paymentsCount={paymentsCount}
          showCurrency={false}
        />
      </section>
    </SetupStepShell>
  );
}
