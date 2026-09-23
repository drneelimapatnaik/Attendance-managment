/**
 * Fee-specific badges: invoice status (adds "Waived" on top of the shared
 * Paid / Pending / Overdue badge) and payment method chips.
 */
import type { PaymentMethod } from '@/types/domain';
import type { InvoiceView } from '@/domain/fees';
import { Badge } from '@/components/ui';
import { FeeStatusBadge } from '@/components/domain';

export const METHOD_ICON: Record<PaymentMethod, string> = {
  Cash: 'payments',
  UPI: 'qr_code_2',
  Card: 'credit_card',
  'Bank Transfer': 'account_balance',
  Cheque: 'receipt',
};

/**
 * Colours for the Paid / Pending / Overdue composition bar. They match the
 * fee-state language used by FeeStatusBadge and the roster summary strip
 * (primary / secondary / error), and always ship with a labelled legend.
 */
export const FEE_STATUS_COLOR = {
  Paid: 'rgb(var(--c-primary))',
  Pending: 'rgb(var(--c-secondary))',
  Overdue: 'rgb(var(--c-error))',
} as const;

export function InvoiceStatusBadge({ view }: { view: InvoiceView }) {
  if (view.invoice.waived) {
    return (
      <Badge tone="neutral" icon="money_off">
        Waived
      </Badge>
    );
  }
  return <FeeStatusBadge status={view.status} />;
}

export function MethodBadge({ method }: { method: PaymentMethod }) {
  return (
    <Badge tone="surface" icon={METHOD_ICON[method]}>
      {method}
    </Badge>
  );
}
