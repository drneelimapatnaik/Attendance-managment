/**
 * Fee Management overview: four KPI tiles, collections per month across the
 * academic year, and the Paid / Pending / Overdue split with the batches
 * carrying the most overdue money.
 */
import { BarList, ColumnChart, StackedBar } from '@/components/charts';
import { Badge, Card, CardHeader, EmptyState, ProgressBar, StatCard } from '@/components/ui';
import { useLookups, useMoney, useSettings } from '@/hooks/useTenant';
import { formatPeriod, formatPeriodShort, today } from '@/lib/date';
import { formatPercent } from '@/lib/format';
import { useFeeOverview } from '../useFees';
import { FEE_STATUS_COLOR } from './FeeBadges';

export function FeeOverview() {
  const o = useFeeOverview();
  const money = useMoney();
  const settings = useSettings();
  const { batch } = useLookups();

  // Month-to-date comparison against the same days of last month.
  const change = o.prevToDate ? (o.collected - o.prevToDate) / o.prevToDate : NaN;
  const direction = !Number.isFinite(change) || Math.abs(change) < 0.005 ? 'flat' : change > 0 ? 'up' : 'down';
  const dayOfMonth = Number(today().slice(8, 10));
  const ayCollected = o.monthly.reduce((s, m) => s + m.collected, 0);
  const statusTotal = o.statusCounts.Paid + o.statusCounts.Pending + o.statusCounts.Overdue;

  const overdueBatches = [...o.overdueByBatch.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxOverdue = overdueBatches[0]?.[1] ?? 1;

  return (
    <>
      <div className="grid grid-cols-1 gap-space-sm sm:grid-cols-2 md:gap-space-md xl:grid-cols-4">
        <StatCard
          label="Collected this month"
          icon="account_balance_wallet"
          value={money.format(o.collected)}
          hint={`${o.receipts} receipts · ${formatPeriodShort(o.prevMonth)} total ${money.compact(o.prevTotal)}`}
          delta={
            Number.isFinite(change)
              ? {
                  value: formatPercent(Math.abs(change)),
                  direction,
                  period: `vs 1–${dayOfMonth} ${formatPeriodShort(o.prevMonth)}`,
                }
              : undefined
          }
        />
        <StatCard
          label="Pending dues"
          icon="schedule"
          value={money.format(o.pending)}
          hint={`${o.pendingInvoices} invoices · ${o.pendingStudents} students, within grace period`}
          to="/fees?due=Pending"
        />
        <StatCard
          label="Overdue"
          icon="error"
          value={<span className={o.overdue > 0 ? 'text-error' : undefined}>{money.format(o.overdue)}</span>}
          hint={`${o.overdueStudents} students past due + ${settings.fees.gracePeriodDays}-day grace`}
          to="/fees?due=Overdue"
        />
        <StatCard
          label={`Collection rate · ${formatPeriodShort(o.month)} bills`}
          icon="percent"
          value={formatPercent(o.collectionRate)}
          hint={
            o.billedThisPeriod
              ? `${money.compact(o.collectedThisPeriod)} of ${money.compact(o.billedThisPeriod)} billed`
              : `No invoices for ${formatPeriod(o.month)} yet`
          }
          trend={
            Number.isFinite(o.collectionRate) && (
              <ProgressBar value={o.collectionRate} tone="auto" thresholds={{ danger: 0.5, warning: 0.8 }} label="Collection rate" />
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-space-md xl:grid-cols-3">
        <Card className="flex min-w-0 flex-col gap-space-md xl:col-span-2">
          <CardHeader
            title="Collections by month"
            icon="bar_chart"
            subtitle={`Academic Year ${settings.academicYear} · tap a month for billed vs collected`}
            actions={
              <Badge tone="primary" className="hidden sm:inline-flex">
                {money.compact(ayCollected)} this year
              </Badge>
            }
          />
          <ColumnChart
            valueLabel="Collected"
            ariaLabel="Fee collections per month"
            data={o.monthly.map((m) => ({
              label: formatPeriodShort(m.period),
              value: m.collected,
              details: [
                { label: 'Billed', value: money.format(m.billed) },
                { label: 'Collected ÷ billed', value: formatPercent(m.billed ? m.collected / m.billed : NaN) },
                { label: 'Receipts', value: String(m.receipts) },
              ],
            }))}
            highlight={o.monthly.length - 1}
            formatValue={money.compact}
          />
        </Card>

        <Card className="flex min-w-0 flex-col gap-space-md">
          <CardHeader title="Fee status" icon="donut_small" subtitle={`${statusTotal} current students`} />
          <StackedBar
            ariaLabel="Current students by fee status"
            height={14}
            segments={(['Paid', 'Pending', 'Overdue'] as const).map((s) => ({
              label: s,
              value: o.statusCounts[s],
              color: FEE_STATUS_COLOR[s],
            }))}
          />
          <div className="flex flex-col gap-space-sm border-t border-outline-variant/30 pt-space-sm">
            <h3 className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Overdue by batch</h3>
            {overdueBatches.length ? (
              <BarList
                items={overdueBatches.map(([id, amount]) => ({
                  id,
                  label: batch.get(id)?.name ?? id,
                  sublabel: batch.get(id)?.title,
                  value: amount / maxOverdue,
                  display: money.format(amount),
                  to: `/fees?due=Overdue&batch=${id}`,
                }))}
              />
            ) : (
              <EmptyState compact icon="task_alt" title="Nothing overdue" description="Every invoice is paid or within its grace period." />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
