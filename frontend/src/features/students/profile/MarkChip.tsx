/**
 * Lettered attendance chip (P / L / A / E) used across the student profile:
 * the recent-attendance strip, calendar cells and legends. Colour comes from
 * the shared MARK_STYLE; the letter and accessible label carry the meaning,
 * so the state never relies on colour alone.
 */
import type { AttendanceMark } from '@/types/domain';
import { MARK_STYLE } from '@/components/domain';
import { MARK_LABELS } from '@/domain/attendance';
import { cn } from '@/lib/cn';

const SIZES = {
  xs: 'h-4 w-4 rounded text-[10px] font-bold leading-none sm:h-5 sm:w-5 sm:text-[11px]',
  sm: 'h-7 w-7 rounded-md font-label-md text-label-md',
  md: 'h-9 w-9 rounded-lg font-label-lg text-label-lg',
} as const;

interface MarkChipProps {
  mark: AttendanceMark;
  size?: keyof typeof SIZES;
  /** Accessible label; defaults to the mark's name ("Present"). */
  label?: string;
  /** Hide from assistive tech when adjacent text already names the mark. */
  decorative?: boolean;
  className?: string;
}

export function MarkChip({ mark, size = 'md', label, decorative, className }: MarkChipProps) {
  const text = label ?? MARK_LABELS[mark];
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : text}
      aria-hidden={decorative || undefined}
      title={decorative ? undefined : text}
      className={cn('inline-flex shrink-0 select-none items-center justify-center', MARK_STYLE[mark].solid, SIZES[size], className)}
    >
      {mark}
    </span>
  );
}

/** Soft tints for calendar days holding a single mark (paired with the lettered chip). */
export const MARK_TINT: Record<AttendanceMark, string> = {
  P: 'bg-success-container',
  L: 'bg-warning-container',
  A: 'bg-error-container',
  E: 'bg-neutral-container',
};

export const MARK_ORDER: AttendanceMark[] = ['P', 'L', 'A', 'E'];

/** Legend row: chip + name for every mark. */
export function MarkLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-space-md gap-y-space-2xs', className)} aria-label="Attendance legend">
      {MARK_ORDER.map((m) => (
        <li key={m} className="inline-flex items-center gap-space-2xs font-label-sm text-label-sm text-secondary">
          <MarkChip mark={m} size="xs" decorative />
          {MARK_LABELS[m]}
        </li>
      ))}
    </ul>
  );
}
