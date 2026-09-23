/**
 * Horizontal ranked bars with labels (attendance % by batch, scores by batch).
 * HTML rather than SVG so long labels wrap naturally on small screens.
 * Values are labelled at the bar tip; an optional threshold tints bars below
 * it with the reserved "critical" colour — paired with a warning icon so the
 * signal never relies on colour alone.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';

export interface BarListItem {
  id: string;
  label: string;
  sublabel?: string;
  value: number; // 0–1 when `max` is 1
  display?: string; // formatted value; defaults to %
  to?: string;
}

interface BarListProps {
  items: BarListItem[];
  max?: number;
  threshold?: number; // values below are flagged
  thresholdLabel?: string;
  className?: string;
}

export function BarList({ items, max = 1, threshold, thresholdLabel = 'Below target', className }: BarListProps) {
  return (
    <ul className={cn('flex flex-col gap-space-sm', className)}>
      {items.map((item) => {
        const pct = Math.max(0, Math.min(1, (Number.isFinite(item.value) ? item.value : 0) / max));
        const low = threshold != null && Number.isFinite(item.value) && item.value < threshold;
        const content = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-space-xs">
              <span className="min-w-0 truncate font-label-md text-label-md text-on-surface">
                {item.label}
                {item.sublabel && <span className="ml-1.5 font-body-sm text-body-sm text-secondary">{item.sublabel}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-label-md text-label-md text-on-surface tnum">
                {low && <Icon name="warning" size={14} className="text-error" label={thresholdLabel} />}
                {item.display ?? `${Math.round(item.value * 100)}%`}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div
                className={cn('h-full rounded-full transition-[width] duration-500', low ? 'bg-error' : 'bg-primary-container')}
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={item.id}>
            {item.to ? (
              <Link to={item.to} className="block rounded-lg p-1 -m-1 transition-colors hover:bg-surface-container-low">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
