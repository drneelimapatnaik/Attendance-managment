/** Floating tooltip used by every chart; clamps itself inside the chart box. */
import type { ReactNode } from 'react';

interface ChartTooltipProps {
  x: number;
  y: number;
  containerWidth: number;
  title: ReactNode;
  rows: { color?: string; label: ReactNode; value: ReactNode }[];
}

export function ChartTooltip({ x, y, containerWidth, title, rows }: ChartTooltipProps) {
  const width = 176;
  const left = Math.min(Math.max(x - width / 2, 0), Math.max(0, containerWidth - width));
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 shadow-level-2"
      style={{ left, top: Math.max(0, y - 12), width, transform: 'translateY(-100%)' }}
    >
      <p className="mb-1 font-label-md text-label-md text-on-surface">{title}</p>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-2 font-body-sm text-body-sm">
          <span className="flex min-w-0 items-center gap-1.5 text-secondary">
            {r.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />}
            <span className="truncate">{r.label}</span>
          </span>
          <span className="font-semibold text-on-surface tnum">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Legend for ≥ 2 series — identity never relies on colour matching alone. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-space-md gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
