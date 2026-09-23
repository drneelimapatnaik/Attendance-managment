/**
 * 100% stacked bar for composition (today's Present / Late / Absent / Excused).
 * 2px surface gap between segments, legend with counts underneath so the
 * reading never depends on colour alone.
 */
import { cn } from '@/lib/cn';

export interface StackSegment {
  label: string;
  value: number;
  color: string;
}

interface StackedBarProps {
  segments: StackSegment[];
  height?: number;
  showLegend?: boolean;
  className?: string;
  ariaLabel: string;
}

export function StackedBar({ segments, height = 12, showLegend = true, className, ariaLabel }: StackedBarProps) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className={cn('flex flex-col gap-space-xs', className)}>
      <div
        className="flex w-full gap-[2px] overflow-hidden rounded-full bg-surface-container"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      >
        {total > 0 &&
          visible.map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          ))}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-space-md gap-y-1">
          {segments.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
              <span className="text-on-surface tnum">{s.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
