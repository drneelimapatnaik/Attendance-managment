/**
 * Fee collection over the last six months (fees.view only). Columns show the
 * amount collected per month with the current month emphasised; the hover
 * tooltip adds billed vs collected and the collection rate.
 */
import { ButtonLink, Card, CardHeader } from '@/components/ui';
import { ColumnChart } from '@/components/charts';
import { useMoney } from '@/hooks/useTenant';
import { formatPeriod, formatPeriodShort } from '@/lib/date';
import { formatPercent } from '@/lib/format';
import type { MonthFees } from './useDashboardData';

interface FeeCollectionCardProps {
  months: MonthFees[];
  className?: string;
}

export function FeeCollectionCard({ months, className }: FeeCollectionCardProps) {
  const money = useMoney();
  const current = months[months.length - 1];
  const rate = current.billed ? current.collected / current.billed : NaN;
  return (
    <Card className={className}>
      <CardHeader
        title="Fee collection"
        icon="payments"
        subtitle="Collected per month · last 6 months"
        actions={
          <ButtonLink to="/fees" size="sm" variant="tonal" trailingIcon="arrow_forward">
            Fees
          </ButtonLink>
        }
      />
      <p className="mt-space-sm font-body-md text-body-md text-secondary">
        {formatPeriod(current.period)}: <strong className="text-on-surface tnum">{money.format(current.collected)}</strong> collected of{' '}
        <span className="tnum">{money.format(current.billed)}</span> billed
        {Number.isFinite(rate) && <span className="tnum"> ({formatPercent(rate)})</span>}
      </p>
      <div className="mt-space-md">
        <ColumnChart
          valueLabel="Collected"
          data={months.map((m) => ({
            label: formatPeriodShort(m.period),
            value: m.collected,
            details: [
              { label: 'Billed', value: money.format(m.billed) },
              { label: 'Collection rate', value: m.billed ? formatPercent(m.collected / m.billed) : '—' },
            ],
          }))}
          highlight={months.length - 1}
          formatValue={money.compact}
          ariaLabel="Fees collected per month, last six months"
        />
      </div>
    </Card>
  );
}
