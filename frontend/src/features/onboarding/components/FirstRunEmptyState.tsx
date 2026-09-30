/**
 * The empty state a screen shows in a brand-new institute: one line of what
 * this screen is for, the primary action that fills it, and — while setup is
 * unfinished — a way back into the wizard.
 *
 * Used by the Dashboard, Students, Batches, Fees and Attendance screens so a
 * fresh institute reads as "nothing here yet, do this" rather than broken.
 */
import type { ReactNode } from 'react';
import { ButtonLink, EmptyState } from '@/components/ui';
import { useCan, useSettings } from '@/hooks/useTenant';
import { isSetupComplete } from '../setupStatus';

interface FirstRunEmptyStateProps {
  icon: string;
  title: string;
  /** What this screen is for, in one line. */
  description: ReactNode;
  /** The primary action — "Create your first batch", "Admit your first student"… */
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function FirstRunEmptyState({ icon, title, description, action, compact, className }: FirstRunEmptyStateProps) {
  const settings = useSettings();
  const can = useCan();
  // Only the person who can finish setup is offered the wizard.
  const unfinished = !isSetupComplete(settings) && can('settings.manage');

  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      compact={compact}
      className={className}
      action={
        action || unfinished ? (
          <div className="flex flex-col items-center gap-space-xs sm:flex-row">
            {action}
            {unfinished && (
              <ButtonLink to="/setup" variant="ghost" icon="checklist">
                Finish setting up
              </ButtonLink>
            )}
          </div>
        ) : undefined
      }
    />
  );
}
