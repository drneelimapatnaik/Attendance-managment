/**
 * Tiny trend line for stat tiles: de-emphasised history with the latest point
 * accented. Purely decorative context — the tile states the number in text.
 */
import { BRAND, useWidth } from './chartUtils';

interface SparklineProps {
  values: (number | null)[];
  height?: number;
  color?: string;
  min?: number;
  max?: number;
}

export function Sparkline({ values, height = 32, color = BRAND, min, max }: SparklineProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const nums = values.filter((v): v is number => v != null);
  const lo = min ?? Math.min(...nums);
  const hi = max ?? Math.max(...nums);
  const x = (i: number) => (values.length <= 1 ? width / 2 : 2 + (i / (values.length - 1)) * (width - 4));
  const y = (v: number) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (height - 6);
  let d = '';
  let started = false;
  values.forEach((v, i) => {
    if (v == null) return void (started = false);
    d += `${started ? 'L' : 'M'}${x(i)},${y(v)}`;
    started = true;
  });
  const lastIdx = values
    .map((v, i) => (v == null ? -1 : i))
    .filter((i) => i >= 0)
    .pop();
  return (
    <div ref={ref} className="w-full" style={{ height }} aria-hidden>
      {width > 0 && nums.length > 1 && (
        <svg width={width} height={height}>
          <path d={d} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {lastIdx != null && <circle cx={x(lastIdx)} cy={y(values[lastIdx]!)} r={3.5} fill={color} />}
        </svg>
      )}
    </div>
  );
}
