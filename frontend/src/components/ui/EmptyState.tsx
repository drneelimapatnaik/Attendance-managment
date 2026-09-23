/** Friendly placeholder for empty lists, no search results and unavailable views. */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon = 'inbox', title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-space-lg' : 'gap-3 py-space-2xl',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-primary">
        <Icon name={icon} size={24} />
      </div>
      <div className="max-w-sm">
        <p className="font-title-md text-title-md text-on-surface">{title}</p>
        {description && <p className="mt-1 font-body-md text-body-md text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}
