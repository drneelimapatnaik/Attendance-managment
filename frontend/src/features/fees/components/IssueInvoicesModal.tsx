/**
 * "Issue Invoices" — pick a billing month, preview what will be created, then
 * call `issueInvoices(period)`. Mirrors the store rule (every Active student ×
 * Active batch without an invoice for that month, billed per the tenant's
 * billing mode) so the preview matches the result. Tenant-wide, like the action.
 */
import { useMemo, useState } from 'react';
import type { Batch, FeeInvoice, Student } from '@/types/domain';
import { Button, Icon, Modal, SelectField } from '@/components/ui';
import { useMoney, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { discountedFee } from '@/domain/fees';
import { addMonths, formatPeriod, today } from '@/lib/date';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** What `issueInvoices(period)` would create: invoice count, students billed and total amount. */
function previewIssue(period: string, students: Student[], batches: Batch[], invoices: FeeInvoice[]) {
  const has = new Set(invoices.map((i) => `${i.studentId}|${i.batchId}|${i.period}`));
  const batchById = new Map(batches.map((b) => [b.id, b]));
  let count = 0;
  let amount = 0;
  const billed = new Set<string>();
  for (const s of students) {
    if (s.status !== 'Active') continue;
    for (const batchId of s.batchIds) {
      const batch = batchById.get(batchId);
      if (!batch || batch.status !== 'Active' || has.has(`${s.id}|${batchId}|${period}`)) continue;
      count++;
      amount += discountedFee(batch.monthlyFee, s.concessionPct);
      billed.add(s.id);
    }
  }
  return { count, amount, students: billed.size };
}

export function IssueInvoicesModal({ open, onClose }: Props) {
  const toast = useToast();
  const money = useMoney();
  const settings = useSettings();
  const students = useDataStore((s) => s.students);
  const batches = useDataStore((s) => s.batches);
  const invoices = useDataStore((s) => s.invoices);
  const issueInvoices = useDataStore((s) => s.issueInvoices);

  const current = today().slice(0, 7);
  const options = useMemo(
    () =>
      [1, 0, -1, -2].map((offset) => {
        const period = addMonths(`${current}-01`, offset).slice(0, 7);
        const suffix = offset === 1 ? ' (next month)' : offset === 0 ? ' (this month)' : '';
        return { value: period, label: `${formatPeriod(period)}${suffix}` };
      }),
    [current],
  );
  const [period, setPeriod] = useState(current);
  const preview = useMemo(() => previewIssue(period, students, batches, invoices), [period, students, batches, invoices]);

  const issue = () => {
    const created = issueInvoices(period);
    if (created) {
      toast({
        title: `${created} invoice${created === 1 ? '' : 's'} issued for ${formatPeriod(period)}`,
        description: `${money.format(preview.amount)} billed to ${preview.students} students · due ${settings.fees.dueInDays} days after each billing date.`,
      });
    } else {
      toast({
        title: `${formatPeriod(period)} invoices already issued`,
        description: 'Every active enrolment already has an invoice for this month.',
        tone: 'info',
      });
    }
    onClose();
  };

  const billingRule =
    settings.fees.billingMode === 'fixed-day'
      ? `Everyone is billed on day ${settings.fees.billingDay} of the month.`
      : 'Each student is billed on their joining-date anniversary.';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Issue monthly invoices"
      description="Bills tuition to every active enrolment that has no invoice for the month yet."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="receipt_long" onClick={issue}>
            {preview.count ? `Issue ${preview.count} invoices` : 'Issue invoices'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-space-md">
        <SelectField label="Billing month" value={period} onChange={(e) => setPeriod(e.target.value)} options={options} />
        {preview.count ? (
          <div className="rounded-lg bg-primary-fixed/50 p-space-sm text-on-primary-fixed">
            <p className="font-title-md text-title-md tnum">
              {preview.count} invoices · {money.format(preview.amount)}
            </p>
            <p className="font-body-sm text-body-sm">For {preview.students} students across all campuses, after concessions.</p>
          </div>
        ) : (
          <p className="flex items-center gap-space-xs rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface-variant">
            <Icon name="task_alt" size={18} className="text-primary" />
            {formatPeriod(period)} is already fully invoiced.
          </p>
        )}
        <p className="font-body-sm text-body-sm text-secondary">
          {billingRule} Invoices fall due {settings.fees.dueInDays} days after billing, with a {settings.fees.gracePeriodDays}-day grace
          period before they count as overdue.
        </p>
      </div>
    </Modal>
  );
}
