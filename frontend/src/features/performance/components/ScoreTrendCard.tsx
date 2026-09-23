/**
 * Score trend chart.
 *
 *  - One batch selected → that batch's average % per assessment over time,
 *    with the batch's overall average as a neutral reference series.
 *  - All batches → monthly average % for up to three batches the user picks.
 *    Batches meet on different days, so points are bucketed by month to give
 *    every series the same x-axis (per-assessment dates would leave gaps).
 *    Each pick keeps a fixed colour slot (SERIES_COLORS[i]) while it stays
 *    selected, so adding/removing one never repaints the others.
 * The 40% pass mark is drawn as a reference line in both modes.
 */
import { useMemo } from 'react';
import { BRAND, LineChart, SERIES_COLORS, type LineSeries } from '@/components/charts';
import { Button, Card, CardHeader, Checkbox, EmptyState, Menu } from '@/components/ui';
import { PASS_MARK } from '@/domain/academics';
import { formatDate, formatDayMonth, formatPeriod, formatPeriodShort } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { Batch } from '@/types/domain';
import { MAX_COMPARE, type AssessmentRow, type PerfFilters, type SetPerfFilter } from '../usePerformance';

interface Props {
  rows: AssessmentRow[]; // filtered, oldest first
  batchOptions: Batch[];
  filters: PerfFilters;
  setFilter: SetPerfFilter;
}

const NEUTRAL = 'rgb(var(--c-outline))';
const asPct = (v: number) => `${Math.round(v)}%`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Decode `cmp` into three colour slots (see usePerformance.ts). */
function parseSlots(cmp: string, fallback: string[], valid: Set<string>): string[] {
  if (!cmp) return [...fallback, '', '', ''].slice(0, MAX_COMPARE);
  if (cmp === 'none') return Array(MAX_COMPARE).fill('');
  return [...cmp.split(','), '', '', ''].slice(0, MAX_COMPARE).map((id) => (valid.has(id) ? id : ''));
}

export function ScoreTrendCard({ rows, batchOptions, filters, setFilter }: Props) {
  const single = batchOptions.find((b) => b.id === filters.batch);
  const assessedIds = useMemo(() => [...new Set(rows.map((r) => r.assessment.batchId))], [rows]);

  // Default comparison: the first three batches (by code) that have results in view.
  const slots = useMemo(() => {
    const fallback = batchOptions.filter((b) => assessedIds.includes(b.id)).map((b) => b.id);
    return parseSlots(filters.cmp, fallback.slice(0, MAX_COMPARE), new Set(batchOptions.map((b) => b.id)));
  }, [filters.cmp, batchOptions, assessedIds]);

  const toggleCompare = (id: string) => {
    const next = [...slots];
    const at = next.indexOf(id);
    if (at >= 0) next[at] = '';
    else {
      const free = next.indexOf('');
      if (free < 0) return;
      next[free] = id;
    }
    setFilter('cmp', next.some(Boolean) ? next.join(',') : 'none');
  };

  const chart = useMemo(() => {
    const valid = rows.filter((r) => Number.isFinite(r.stats.average));
    if (single) {
      const values = valid.map((r) => r.stats.average * 100);
      const overall = values.length ? mean(values) : NaN;
      const series: LineSeries[] = [
        { id: 'avg', label: 'Test average', values, color: BRAND },
        { id: 'mean', label: 'Batch mean', values: values.map(() => overall), color: NEUTRAL },
      ];
      return {
        overall,
        labels: valid.map((r) => formatDayMonth(r.assessment.date)),
        tooltip: (i: number) => `${valid[i].assessment.title} · ${formatDate(valid[i].assessment.date)}`,
        series,
        points: values.length,
      };
    }
    const months = [...new Set(valid.map((r) => r.assessment.date.slice(0, 7)))].sort();
    const series: LineSeries[] = slots.flatMap((id, slot) => {
      const batch = batchOptions.find((b) => b.id === id);
      if (!batch) return [];
      const values = months.map((m) => {
        const inMonth = valid.filter((r) => r.assessment.batchId === id && r.assessment.date.startsWith(m));
        return inMonth.length ? mean(inMonth.map((r) => r.stats.average)) * 100 : null;
      });
      return [{ id, label: batch.name, values, color: SERIES_COLORS[slot] }];
    });
    return {
      overall: NaN,
      labels: months.map(formatPeriodShort),
      tooltip: (i: number) => formatPeriod(months[i]),
      series,
      points: months.length,
    };
  }, [rows, single, slots, batchOptions]);

  const picked = slots.filter(Boolean).length;
  const comparePicker = !single && (
    <Menu
      width="w-72"
      trigger={(props) => (
        <Button {...props} size="sm" variant="tonal" icon="compare_arrows">
          Compare · {picked}/{MAX_COMPARE}
        </Button>
      )}
    >
      <div role="group" aria-label="Batches to compare" className="max-h-80 overflow-y-auto py-1">
        <p className="px-space-sm pb-1 pt-space-xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
          Pick up to {MAX_COMPARE} batches
        </p>
        {batchOptions.map((b) => {
          const slot = slots.indexOf(b.id);
          const disabled = slot < 0 && picked >= MAX_COMPARE;
          return (
            <label
              key={b.id}
              className={cn(
                'flex min-h-[44px] items-center gap-space-xs px-space-sm py-1.5 hover:bg-surface-container-low md:min-h-0',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              )}
            >
              <Checkbox checked={slot >= 0} disabled={disabled} onChange={() => toggleCompare(b.id)} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-label-lg text-label-lg text-on-surface">{b.name}</span>
                <span className="ml-1.5 font-body-sm text-body-sm text-secondary">{b.title}</span>
              </span>
              {slot >= 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES_COLORS[slot] }} aria-hidden />}
            </label>
          );
        })}
      </div>
    </Menu>
  );

  const empty = !chart.series.length ? (
    <EmptyState compact icon="compare_arrows" title="Pick batches to compare" description="Use Compare to choose up to three batches." />
  ) : chart.points < 2 ? (
    <EmptyState
      compact
      icon="show_chart"
      title="Not enough results for a trend"
      description="At least two assessments (or months, when comparing) are needed. Widen the date range or type filter."
    />
  ) : null;

  return (
    <Card className="flex h-full min-w-0 flex-col gap-space-md">
      <CardHeader
        title="Score trend"
        icon="show_chart"
        subtitle={
          single
            ? `${single.name} · average score per assessment · mean ${asPct(chart.overall)}`
            : chart.series.length === 1
              ? `Monthly average score · ${chart.series[0].label}`
              : 'Monthly average score by batch'
        }
        actions={comparePicker}
      />
      {empty ?? (
        <LineChart
          ariaLabel={single ? `${single.name} average score per assessment` : 'Monthly average score for compared batches'}
          labels={chart.labels}
          series={chart.series}
          yMax={100}
          formatValue={asPct}
          tooltipTitle={chart.tooltip}
          reference={{ value: PASS_MARK * 100, label: `Pass mark ${PASS_MARK * 100}%` }}
          height={240}
        />
      )}
    </Card>
  );
}
