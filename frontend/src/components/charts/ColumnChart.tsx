/**
 * Vertical column chart for magnitudes by category (fees collected per month,
 * score distribution). Bars ≤ 24px wide, 4px rounded top, square baseline,
 * hover tooltip, value labelled only on the highlighted bar.
 */
import { useState } from 'react';
import { AXIS_TEXT, BRAND, GRID, columnPath, niceTicks, useWidth } from './chartUtils';
import { ChartTooltip } from './ChartTooltip';

export interface ColumnDatum {
  label: string;
  value: number;
  /** Extra tooltip rows (e.g. billed vs collected). */
  details?: { label: string; value: string }[];
}

interface ColumnChartProps {
  data: ColumnDatum[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  /** Index to emphasise (e.g. current month); others render lighter. */
  highlight?: number;
  /** Tooltip label for the bar value, e.g. "Collected" or "Students". */
  valueLabel?: string;
  ariaLabel: string;
}

const PAD = { top: 18, right: 8, bottom: 26, left: 44 };

export function ColumnChart({
  data,
  height = 220,
  color = BRAND,
  formatValue = (v) => String(v),
  highlight,
  valueLabel = 'Value',
  ariaLabel,
}: ColumnChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(Math.max(1, ...data.map((d) => d.value)), 4);
  const top = ticks[ticks.length - 1];
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const bx = (i: number) => PAD.left + band * i + (band - barW) / 2;
  const emphasised = hover ?? highlight;

  return (
    <div className="flex flex-col">
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT} className="tnum">
                  {formatValue(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => (
              <g key={d.label}>
                <path
                  d={columnPath(bx(i), y(d.value), barW, y(0) - y(d.value))}
                  fill={color}
                  fillOpacity={emphasised == null || emphasised === i ? 1 : 0.45}
                />
                <text x={bx(i) + barW / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={AXIS_TEXT}>
                  {d.label}
                </text>
                {emphasised === i && d.value > 0 && (
                  <text
                    x={bx(i) + barW / 2}
                    y={y(d.value) - 6}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="rgb(var(--c-on-surface))"
                    className="tnum"
                  >
                    {formatValue(d.value)}
                  </text>
                )}
                {/* Hit target wider than the mark */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerDown={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              </g>
            ))}
          </svg>
        )}
        {hover != null && width > 0 && (
          <ChartTooltip
            x={bx(hover) + barW / 2}
            y={y(data[hover].value)}
            containerWidth={width}
            title={data[hover].label}
            rows={[{ color, label: valueLabel, value: formatValue(data[hover].value) }, ...(data[hover].details ?? [])]}
          />
        )}
      </div>
      {/* Screen-reader data table. Wrapped: an sr-only <table> keeps its intrinsic width and can widen the page. */}
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th>{d.label}</th>
                <td>{formatValue(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
