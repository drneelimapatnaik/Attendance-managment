/**
 * Shared chrome for the student & parent app screens.
 *
 * `PortalHeading` is the compact page title used instead of the staff console's
 * PageHeader, which is tuned for wide desktop toolbars. `PortalNotices` prints
 * the plain-language banners that explain an unusual state — a login the
 * institute switched off, or a student who has left or is on leave — so every
 * screen says the same thing, in the same words, in the same place.
 */
import type { ReactNode } from 'react';
import type { PortalAccount, Student } from '@/types/domain';
import { EmptyState, Icon } from '@/components/ui';

export function PortalHeading({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-space-sm">
      <div className="min-w-0">
        <h1 className="font-headline-sm text-headline-sm text-on-surface">{title}</h1>
        {subtitle && <p className="mt-0.5 font-body-md text-body-md text-secondary">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** "Read this before you read the numbers" note. Colour is always paired with an icon. */
export function PortalNote({ icon = 'info', children }: { icon?: string; children: ReactNode }) {
  return (
    <p className="flex items-start gap-space-xs rounded-xl bg-warning-container px-space-sm py-space-sm font-body-md text-body-md text-on-warning-container">
      <Icon name={icon} size={18} className="mt-0.5" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Banners for the states that change how the rest of the page should be read. */
export function PortalNotices({ account, student }: { account?: PortalAccount; student?: Student }) {
  const firstName = student?.name.split(' ')[0];
  return (
    <>
      {account?.status === 'Disabled' && (
        <PortalNote icon="lock">
          This login has been switched off by the institute. You can still read what is already here, but nothing new will arrive. Please
          call the office to switch it back on.
        </PortalNote>
      )}
      {student?.status === 'Inactive' && (
        <PortalNote icon="history">
          {firstName} is no longer enrolled, so this is the record as it stood on the last day of classes.
        </PortalNote>
      )}
      {student?.status === 'On Leave' && (
        <PortalNote icon="event_busy">{firstName} is marked as on leave, so classes are paused for now.</PortalNote>
      )}
    </>
  );
}

/** Shown when the signed-in login is not linked to any student record. */
export function PortalNoStudent() {
  return (
    <div className="card">
      <EmptyState
        icon="school"
        title="No student linked to this login"
        description="Please call the institute office so they can link the right student record to this account."
      />
    </div>
  );
}
