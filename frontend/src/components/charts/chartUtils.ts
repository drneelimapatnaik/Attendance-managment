/**
 * Shared chart plumbing: colours, nice ticks and a width observer.
 *
 * Colour roles (dataviz method):
 *  - Single series → the tenant's brand colour (follows re-branding).
 *  - Multiple series → fixed categorical order, never cycled; validated
 *    palette slots 1–3 (blue, orange, aqua). More than 3 series → fold or facet.
 *  - Status (present/late/absent/excused) → reserved status colours, always
 *    shipped with a text label or legend, never colour alone.
 */
import { useEffect, useRef, useState } from 'react';

export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
export const BRAND = 'rgb(var(--c-primary-container))';

export const STATUS_COLORS = {
  present: 'rgb(var(--c-success))',
  late: 'rgb(var(--c-warning))',
  absent: 'rgb(var(--c-danger))',
  excused: 'rgb(var(--c-outline))',
} as const;

export const GRID = 'rgb(var(--c-outline-variant) / 0.5)';
export const AXIS_TEXT = 'rgb(var(--c-secondary))';
export const SURFACE = 'rgb(var(--c-surface-container-lowest))';

/** Round a max up to a clean axis bound and return evenly spaced ticks. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

/** Observe an element's content width so SVG charts stay crisp and responsive. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Top-rounded bar path: 4px radius on the data end, square at the baseline. */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Right-rounded horizontal bar path. */
export function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}
