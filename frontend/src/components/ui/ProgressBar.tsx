/**
 * Meter / progress bar. The unfilled track is a lighter step of the same hue
 * (dataviz meter rule) so state reads across the whole bar.
 */
import { cn } from '@/lib/cn';

export type MeterTone = 'primary' | 'success' | 'warning' | 'danger' | 'auto';

interface ProgressBarProps {
  value: number; // 0–1
  tone?: MeterTone;
  /** For tone="auto": below `danger` → red, below `warning` → amber, else success. */
  thresholds?: { danger: number; warning: number };
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  label?: string; // accessible label
}

const FILL = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-error' };
const TRACK = {
  primary: 'bg-surface-container-highest',
  success: 'bg-success-container',
  warning: 'bg-warning-container',
  danger: 'bg-error-container',
};

export function ProgressBar({
  value,
  tone = 'primary',
  thresholds = { danger: 0.6, warning: 0.75 },
  size = 'sm',
  className,
  label,
}: ProgressBarProps) {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const resolved = tone === 'auto' ? (v < thresholds.danger ? 'danger' : v < thresholds.warning ? 'warning' : 'success') : tone;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn(
        !/(^|s)w-/.test(className ?? '') && 'w-full',
        'overflow-hidden rounded-full',
        TRACK[resolved],
        size === 'xs' ? 'h-1' : size === 'sm' ? 'h-1.5' : 'h-2.5',
        className,
      )}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', FILL[resolved])} style={{ width: `${v * 100}%` }} />
    </div>
  );
}
