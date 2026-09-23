/**
 * KPI stat tile — DESIGN.md › Metric KPI Cards + dataviz stat-tile contract:
 * label (sentence case) · value · optional delta (signed, vs a named period,
 * coloured by whether "up" is good) · optional trend slot (sparkline).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: string;
  hint?: ReactNode;
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; goodWhen?: 'up' | 'down'; period?: string };
  trend?: ReactNode;
  to?: string;
  className?: string;
}

export function StatCard({ label, value, icon, hint, delta, trend, to, className }: StatCardProps) {
  const good = delta && delta.direction !== 'flat' && delta.direction === (delta.goodWhen ?? 'up');
  const bad = delta && delta.direction !== 'flat' && !good;
  const body = (
    <>
      <div className="flex items-start justify-between gap-space-xs">
        <span className="font-label-md text-label-md text-secondary">{label}</span>
        {icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-low text-primary">
            <Icon name={icon} />
          </span>
        )}
      </div>
      <div className="mt-1 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">{value}</div>
      <div className="mt-space-xs flex items-end justify-between gap-space-xs">
        <div className="min-w-0 font-body-sm text-body-sm text-secondary">{hint}</div>
        {delta && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 font-label-sm text-label-sm',
              good && 'bg-success-container text-on-success-container',
              bad && 'bg-error-container text-on-error-container',
              !good && !bad && 'bg-neutral-container text-on-neutral-container',
            )}
          >
            <Icon name={delta.direction === 'up' ? 'arrow_upward' : delta.direction === 'down' ? 'arrow_downward' : 'remove'} size={12} />
            {delta.value}
            {/* The comparison period is dropped on phones, where tiles sit two-up. */}
            {delta.period && <span className="hidden font-normal opacity-80 sm:inline">&nbsp;{delta.period}</span>}
          </span>
        )}
      </div>
      {trend && <div className="mt-space-xs">{trend}</div>}
    </>
  );
  const cls = cn('card flex flex-col p-space-md', to && 'transition-shadow hover:shadow-level-2', className);
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
