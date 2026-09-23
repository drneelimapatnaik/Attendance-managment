/**
 * Level-1 containers — DESIGN.md › Elevation & Depth.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ padded = true, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('card', padded && 'p-space-md', className)} {...rest}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  icon?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, icon, subtitle, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-space-sm', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-space-2xs">
          {icon && <Icon name={icon} className="text-primary" />}
          <h2 className="truncate font-title-lg text-title-lg font-bold text-on-surface">{title}</h2>
        </div>
        {subtitle && <p className="mt-0.5 font-body-sm text-body-sm text-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-space-xs">{actions}</div>}
    </div>
  );
}
