/**
 * Chrome shared by every wizard step: the step heading, the fields, and the
 * Back / Skip / Next footer. The step owns its draft and tells the shell
 * whether Next may proceed, so validation messages stay next to the fields.
 *
 * Enter submits (the fields sit in a real form) and on phones the primary
 * action is a full-width button at the bottom, within thumb reach.
 */
import type { ReactNode } from 'react';
import { Badge, Button, Icon } from '@/components/ui';
import type { SetupNav } from '../useSetupNav';

interface SetupStepShellProps {
  nav: SetupNav;
  /** Save and validate; returning false keeps the owner on this step. */
  onNext: () => boolean;
  /** Save whatever is already valid before stepping back. */
  onBack?: () => void;
  /** Shown beside Skip to explain what skipping means. */
  skipHint?: string;
  nextLabel?: string;
  /** A line under the fields: what can still be changed later. */
  note?: ReactNode;
  children: ReactNode;
}

export function SetupStepShell({ nav, onNext, onBack, skipHint, nextLabel, note, children }: SetupStepShellProps) {
  const { step } = nav;
  const proceed = () => {
    // The closing step finishes setup itself; there is nowhere further to go.
    if (onNext() && !nav.isLast) nav.next();
  };
  const goBack = () => {
    onBack?.();
    nav.back();
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        proceed();
      }}
      className="card flex flex-col gap-space-lg p-space-md md:p-space-lg"
    >
      <header className="flex items-start gap-space-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary">
          <Icon name={step.icon} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-space-xs">
            <h2 className="font-title-lg text-title-lg font-bold text-on-surface">{step.title}</h2>
            {step.optional && <Badge tone="surface">Optional</Badge>}
          </div>
          <p className="mt-0.5 font-body-md text-body-md text-secondary">{step.description}</p>
        </div>
      </header>

      {children}

      {note && (
        <p className="flex items-start gap-space-xs rounded-xl bg-surface-container-low p-space-sm font-body-sm text-body-sm text-on-surface-variant">
          <Icon name="info" size={16} className="mt-px text-primary" />
          <span>{note}</span>
        </p>
      )}

      <footer className="flex flex-col gap-space-sm border-t border-outline-variant/30 pt-space-md sm:flex-row-reverse sm:items-center sm:justify-between">
        <Button type="submit" size="lg" trailingIcon="arrow_forward" className="w-full sm:w-auto">
          {nextLabel ?? (nav.isLastForm ? 'Review & finish' : 'Save & continue')}
        </Button>
        <div className="flex flex-wrap items-center gap-space-xs">
          {!nav.isFirst && (
            <Button variant="ghost" icon="arrow_back" onClick={goBack}>
              Back
            </Button>
          )}
          {step.optional && !nav.isLast && (
            <Button variant="ghost" onClick={() => nav.next()}>
              Skip for now
            </Button>
          )}
          {step.optional && !nav.isLast && skipHint && <span className="font-body-sm text-body-sm text-secondary">{skipHint}</span>}
        </div>
      </footer>
    </form>
  );
}
