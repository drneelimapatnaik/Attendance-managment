/**
 * Fee & billing rule fields + validation, shared by Settings › Fees & billing
 * and the setup wizard's rules step. A worked example under the fields shows
 * how the rules play out for an invoice issued today, so owners can
 * sanity-check before saving.
 *
 * The currency select is optional: the setup wizard asks for currency with the
 * rest of the institute's details, so it hides it here.
 */
import { useMemo } from 'react';
import type { InstituteSettings } from '@/types/domain';
import { Icon, SegmentedControl, SelectField, TextField } from '@/components/ui';
import { addDays, formatDate, today } from '@/lib/date';
import { formatCurrency } from '@/lib/format';
import { FieldGroupLabel } from '../components/SettingsSection';
import { CURRENCIES, intInRange, isAmount } from '../sections/fieldRules';

export type BillingMode = 'joining-date' | 'fixed-day';

export interface FeesDraft {
  billingMode: BillingMode;
  billingDay: string;
  dueInDays: string;
  gracePeriodDays: string;
  lateFee: string;
  receiptPrefix: string;
  currency: string; // code
}

export type FeesErrors = Partial<Record<keyof FeesDraft, string>>;

export function validateFees(d: FeesDraft): FeesErrors {
  const e: FeesErrors = {};
  if (d.billingMode === 'fixed-day' && !intInRange(d.billingDay, 1, 28)) e.billingDay = 'Pick a day from 1 to 28 (works in every month).';
  if (!intInRange(d.dueInDays, 0, 90)) e.dueInDays = 'Enter 0–90 days.';
  if (!intInRange(d.gracePeriodDays, 0, 60)) e.gracePeriodDays = 'Enter 0–60 days.';
  if (!isAmount(d.lateFee)) e.lateFee = 'Enter an amount (0 for none).';
  if (!/^[A-Z0-9-]{2,10}$/.test(d.receiptPrefix)) e.receiptPrefix = 'Use 2–10 letters, digits or dashes.';
  return e;
}

interface FeeRuleFieldsProps {
  draft: FeesDraft;
  patch: (p: Partial<FeesDraft>) => void;
  errors: FeesErrors;
  /** The tenant's saved currency — the fallback when the draft code is unknown. */
  currency: InstituteSettings['currency'];
  /** Receipts issued so far, for the "next receipt" hint. */
  paymentsCount: number;
  showCurrency?: boolean;
}

export function FeeRuleFields({ draft, patch, errors, currency, paymentsCount, showCurrency = true }: FeeRuleFieldsProps) {
  const draftCurrency = CURRENCIES.find((c) => c.code === draft.currency) ?? currency;

  // Worked example for an invoice issued today (only when the numbers are valid).
  const example = useMemo(() => {
    if (!intInRange(draft.dueInDays, 0, 90) || !intInRange(draft.gracePeriodDays, 0, 60)) return null;
    const issued = today();
    const due = addDays(issued, Number(draft.dueInDays));
    const overdue = addDays(due, Number(draft.gracePeriodDays) + 1);
    return { issued, due, overdue };
  }, [draft.dueInDays, draft.gracePeriodDays]);

  const lateFeeText =
    isAmount(draft.lateFee) && Number(draft.lateFee) > 0
      ? `, and a late fee of ${formatCurrency(Number(draft.lateFee), draftCurrency)} applies`
      : '';

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col gap-space-sm">
        <div>
          <FieldGroupLabel id="billing-mode-label">Monthly billing date</FieldGroupLabel>
          <SegmentedControl<BillingMode>
            ariaLabel="Monthly billing date"
            value={draft.billingMode}
            onChange={(v) => patch({ billingMode: v })}
            segments={[
              { value: 'joining-date', label: "Student's joining date", icon: 'event' },
              { value: 'fixed-day', label: 'Fixed day', icon: 'event_repeat' },
            ]}
            className="flex w-full sm:inline-flex sm:w-auto [&>button]:flex-1 [&>button]:whitespace-nowrap"
          />
          <p className="mt-1 font-body-sm text-body-sm text-secondary">
            {draft.billingMode === 'joining-date'
              ? 'Each student is billed on the same day of the month they joined (29th–31st bill on the 28th).'
              : 'Everyone is billed on the same day each month.'}
          </p>
        </div>
        {draft.billingMode === 'fixed-day' && (
          <TextField
            label="Billing day of the month"
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
            value={draft.billingDay}
            onChange={(e) => patch({ billingDay: e.target.value })}
            error={errors.billingDay}
            hint="1–28, so it exists in every month."
            containerClassName="sm:max-w-xs"
          />
        )}
      </div>

      <div className="grid gap-space-sm sm:grid-cols-2 xl:grid-cols-3">
        <TextField
          label="Due in (days)"
          type="number"
          inputMode="numeric"
          min={0}
          max={90}
          value={draft.dueInDays}
          onChange={(e) => patch({ dueInDays: e.target.value })}
          error={errors.dueInDays}
          hint="Days after the invoice is issued."
        />
        <TextField
          label="Grace period (days)"
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          value={draft.gracePeriodDays}
          onChange={(e) => patch({ gracePeriodDays: e.target.value })}
          error={errors.gracePeriodDays}
          hint="After the due date, before it is Overdue."
        />
        <TextField
          label={`Late fee (${draftCurrency.symbol})`}
          type="number"
          inputMode="decimal"
          min={0}
          value={draft.lateFee}
          onChange={(e) => patch({ lateFee: e.target.value })}
          error={errors.lateFee}
          hint="Added once an invoice is overdue. 0 for none."
        />
        <TextField
          label="Receipt prefix"
          value={draft.receiptPrefix}
          maxLength={10}
          autoCapitalize="characters"
          onChange={(e) => patch({ receiptPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })}
          error={errors.receiptPrefix}
          hint={`Next receipt: ${draft.receiptPrefix || '…'}-${String(paymentsCount + 1).padStart(6, '0')}`}
          className="tnum"
        />
        {showCurrency && (
          <SelectField
            label="Currency"
            value={draft.currency}
            onChange={(e) => patch({ currency: e.target.value })}
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name} (${c.symbol})` }))}
            hint={`Amounts look like ${formatCurrency(12500, draftCurrency)}.`}
            containerClassName="sm:col-span-2 xl:col-span-1"
          />
        )}
      </div>

      {example && (
        <p className="flex items-start gap-space-xs rounded-xl bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface-variant">
          <Icon name="lightbulb" size={18} className="mt-px text-primary" />
          <span>
            An invoice issued on <strong className="text-on-surface">{formatDate(example.issued)}</strong> is due{' '}
            <strong className="text-on-surface">{formatDate(example.due)}</strong> and becomes overdue on{' '}
            <strong className="text-on-surface">{formatDate(example.overdue)}</strong>
            {lateFeeText}.
          </span>
        </p>
      )}
    </div>
  );
}
