/**
 * Page header from the roster design:
 *   EYEBROW • Academic Year 2026-27
 *   Title                         [actions…]
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/hooks/useTenant';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

interface PageHeaderProps {
  eyebrow: string;
  title: ReactNode;
  meta?: ReactNode; // small text beside the title (e.g. "Cohort Capacity: 84% Filled")
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  className?: string;
}

export function PageHeader({ eyebrow, title, meta, description, actions, back, className }: PageHeaderProps) {
  const settings = useSettings();
  return (
    <div className={cn('flex flex-col gap-space-md xl:flex-row xl:items-center xl:justify-between', className)}>
      <div className="flex min-w-0 flex-col gap-space-2xs">
        {back && (
          <Link to={back.to} className="mb-1 inline-flex w-fit items-center gap-1 font-label-md text-label-md text-primary hover:underline">
            <Icon name="arrow_back" size={16} />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-space-xs">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{eyebrow}</span>
          <span className="h-1 w-1 rounded-full bg-secondary" />
          <span className="font-label-sm text-label-sm font-semibold text-primary">Academic Year {settings.academicYear}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-space-sm gap-y-1">
          <h1 className="font-headline-lg text-headline-lg-mobile tracking-tight text-on-surface md:text-headline-lg">{title}</h1>
          {meta && <span className="hidden font-label-md text-label-md text-secondary sm:inline-block">{meta}</span>}
        </div>
        {description && <p className="max-w-3xl font-body-md text-body-md text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-space-xs">{actions}</div>}
    </div>
  );
}
