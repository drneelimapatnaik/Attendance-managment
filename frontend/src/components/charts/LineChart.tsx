/**
 * Line / area chart for trends over time (attendance %, scores).
 * 2px lines, one y-axis, recessive hairline grid, crosshair + tooltip on hover,
 * legend when there are 2–3 series. Nulls break the line (no data that day).
 */
import { useMemo, useState, type PointerEvent } from 'react';
import { AXIS_TEXT, BRAND, GRID, SERIES_COLORS, SURFACE, niceTicks, useWidth } from './chartUtils';
import { ChartLegend, ChartTooltip } from './ChartTooltip';

export interface LineSeries {
  id: string;
  label: string;
  values: (number | null)[];
  color?: string;
}

interface LineChartProps {
  labels: string[]; // x categories (already formatted, e.g. "12 Sep")
  series: LineSeries[];
  height?: number;
  yMax?: number; // fixed top (e.g. 100 for percentages)
  yMin?: number;
  formatValue?: (v: number) => string;
  tooltipTitle?: (index: number) => string;
  area?: boolean;
  /** Draw a dashed-free reference line (e.g. the low-attendance threshold). */
  reference?: { value: number; label: string };
  ariaLabel: string;
}

const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

export function LineChart({
  labels,
  series,
  height = 220,
  yMax,
  yMin = 0,
  formatValue = (v) => String(Math.round(v)),
  tooltipTitle,
  area = series.length === 1,
  reference,
  ariaLabel,
}: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const colors = series.map((s, i) => s.color ?? (series.length === 1 ? BRAND : SERIES_COLORS[i % SERIES_COLORS.length]));

  const { ticks, top } = useMemo(() => {
    const max = yMax ?? Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v != null)));
    const t = yMax != null ? niceTicks(yMax - yMin, 4).map((v) => v + yMin) : niceTicks(max, 4);
    return { ticks: t, top: t[t.length - 1] };
  }, [series, yMax, yMin]);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = labels.length;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - yMin) / (top - yMin || 1)) * innerH;

  const paths = series.map((s) => {
    let d = '';
    let started = false;
    s.values.forEach((v, i) => {
      if (v == null) {
        started = false;
        return;
      }
      d += `${started ? 'L' : 'M'}${x(i)},${y(v)}`;
      started = true;
    });
    return d;
  });

  // Label every k-th x tick so labels never collide.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 64))));

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / (rect.width || 1);
    setHover(Math.min(n - 1, Math.max(0, Math.round(rel * (n - 1)))));
  };

  return (
    <div className="flex flex-col gap-space-xs">
      {series.length > 1 && <ChartLegend items={series.map((s, i) => ({ label: s.label, color: colors[i] }))} />}
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT} className="tnum">
                  {formatValue(t)}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.75) ? (
                <text
                  key={i}
                  x={x(i)}
                  y={height - 6}
                  textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                  fontSize={11}
                  fill={AXIS_TEXT}
                >
                  {l}
                </text>
              ) : null,
            )}
            {reference && (
              <g>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(reference.value)}
                  y2={y(reference.value)}
                  stroke="rgb(var(--c-error))"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
                <text x={width - PAD.right} y={y(reference.value) - 4} textAnchor="end" fontSize={10} fill="rgb(var(--c-error))">
                  {reference.label}
                </text>
              </g>
            )}
            {area &&
              series.map((s, si) => {
                const pts = s.values.map((v, i) => (v == null ? null : ([x(i), y(v)] as const))).filter(Boolean) as [number, number][];
                if (pts.length < 2) return null;
                const d =
                  `M${pts[0][0]},${y(yMin)}` + pts.map((p) => `L${p[0]},${p[1]}`).join('') + `L${pts[pts.length - 1][0]},${y(yMin)}Z`;
                return <path key={s.id} d={d} fill={colors[si]} fillOpacity={0.1} />;
              })}
            {paths.map((d, i) => (
              <path key={series[i].id} d={d} fill="none" stroke={colors[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* A value with no neighbours draws no line segment — mark it with a dot instead. */}
            {series.map((s, si) =>
              s.values.map((v, i) =>
                v != null && s.values[i - 1] == null && s.values[i + 1] == null ? (
                  <circle key={`${s.id}-dot-${i}`} cx={x(i)} cy={y(v)} r={3.5} fill={colors[si]} />
                ) : null,
              ),
            )}
            {hover != null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke={AXIS_TEXT}
                  strokeOpacity={0.4}
                  strokeWidth={1}
                />
                {series.map((s, i) =>
                  s.values[hover] != null ? (
                    <circle key={s.id} cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={colors[i]} stroke={SURFACE} strokeWidth={2} />
                  ) : null,
                )}
              </g>
            )}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover != null && width > 0 && (
          <ChartTooltip
            x={x(hover)}
            y={Math.min(...series.map((s) => (s.values[hover] != null ? y(s.values[hover]!) : PAD.top + innerH)))}
            containerWidth={width}
            title={tooltipTitle ? tooltipTitle(hover) : labels[hover]}
            rows={series.map((s, i) => ({
              color: colors[i],
              label: s.label,
              value: s.values[hover] == null ? '—' : formatValue(s.values[hover]!),
            }))}
          />
        )}
      </div>
      {/* Screen-reader data table. Wrapped: an sr-only <table> keeps its intrinsic width and can widen the page. */}
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th>Label</th>
              {series.map((s) => (
                <th key={s.id}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={i}>
                <td>{l}</td>
                {series.map((s) => (
                  <td key={s.id}>{s.values[i] == null ? '—' : formatValue(s.values[i]!)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
