/**
 * Capsule badges — DESIGN.md › Chips & Status Badges.
 * Status colour never carries meaning alone: pair it with an icon or label.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export type BadgeTone = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'surface';

const TONES: Record<BadgeTone, string> = {
  primary: 'bg-primary-fixed text-on-primary-fixed',
  secondary: 'bg-secondary-fixed text-on-secondary-fixed',
  success: 'bg-success-container text-on-success-container',
  warning: 'bg-warning-container text-on-warning-container',
  danger: 'bg-error-container text-on-error-container',
  neutral: 'bg-neutral-container text-on-neutral-container',
  info: 'bg-tertiary-fixed text-on-tertiary-fixed',
  surface: 'bg-surface-container-high text-on-surface',
};

const DOTS: Record<BadgeTone, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-error',
  neutral: 'bg-outline',
  info: 'bg-tertiary-container',
  surface: 'bg-outline',
};

interface BadgeProps {
  tone?: BadgeTone;
  icon?: string;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'surface', icon, dot, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-label-sm text-label-sm',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} />}
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

/** Small rectangular tag used for batch codes ("Batch M2", "S1"). */
export function Tag({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md bg-surface-container-high px-2 py-0.5 font-label-md text-label-md text-on-surface',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Coloured dot + label, for legends and summary strips. */
export function LegendDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-space-2xs font-label-sm text-label-sm text-secondary">
      <span className={cn('h-2.5 w-2.5 rounded-full', color)} />
      {children}
    </span>
  );
}
