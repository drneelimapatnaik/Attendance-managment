/**
 * Settings › Fees & billing: billing mode (each student's joining date or a
 * fixed day), due / grace periods, late fee, receipt numbering and currency.
 * The fields, the worked example and the validation live in ../fields, shared
 * with the first-run setup wizard.
 */
import { useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { SettingsSection } from '../components/SettingsSection';
import { CURRENCIES, FeeRuleFields, validateFees, type FeesDraft } from '../fields';
import { useDraft } from '../useDraft';

export function FeesSection() {
  const settings = useSettings();
  const paymentsCount = useDataStore((s) => s.payments.length);
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const [submitted, setSubmitted] = useState(false);
  const { fees, currency } = settings;

  const saved = useMemo<FeesDraft>(
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
  const { draft, patch, dirty, reset } = useDraft(saved);
  const errors = submitted ? validateFees(draft) : {};

  const save = () => {
    setSubmitted(true);
    if (Object.keys(validateFees(draft)).length) return;
    const next = CURRENCIES.find((c) => c.code === draft.currency);
    updateSettings({
      fees: {
        billingMode: draft.billingMode,
        billingDay: draft.billingMode === 'fixed-day' ? Number(draft.billingDay) : fees.billingDay,
        dueInDays: Number(draft.dueInDays),
        gracePeriodDays: Number(draft.gracePeriodDays),
        lateFee: Number(draft.lateFee),
        receiptPrefix: draft.receiptPrefix,
      },
      ...(next && next.code !== currency.code ? { currency: { code: next.code, symbol: next.symbol, locale: next.locale } } : {}),
    });
    setSubmitted(false);
    toast({ title: 'Fee rules saved', description: 'New invoices and receipts follow these rules.' });
  };

  return (
    <SettingsSection
      id="fees"
      icon="payments"
      title="Fees & billing"
      description="When invoices are raised, when they fall due and how receipts are numbered."
      dirty={dirty}
      onSave={save}
      onDiscard={() => {
        reset();
        setSubmitted(false);
      }}
    >
      <FeeRuleFields draft={draft} patch={patch} errors={errors} currency={currency} paymentsCount={paymentsCount} />
    </SettingsSection>
  );
}
