/**
 * The two "we have nothing to show you" states every content screen of the
 * student & parent app shares: a login whose student record is missing or
 * archived, and a student the institute has not put in a batch yet.
 */
import { Card, EmptyState, Icon } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { telHref } from '@/lib/format';

/** Shown when the login has no readable student record (removed or archived). */
export function PortalNoStudent() {
  const settings = useSettings();
  return (
    <Card>
      <EmptyState
        icon="person_off"
        title="We can't find your record"
        description={
          <>
            This account isn&apos;t linked to a student right now — the record may have been archived. {settings.name} can sort this out for
            you.
          </>
        }
        action={
          <a
            href={telHref(settings.contactPhone)}
            className="inline-flex h-11 items-center gap-space-2xs rounded-lg bg-primary px-space-md font-label-lg text-label-lg text-on-primary"
          >
            <Icon name="call" size={18} />
            Call the institute
          </a>
        }
      />
    </Card>
  );
}

/** Shown on every screen when the student is not enrolled in any batch. */
export function PortalNoBatches({ subject, is }: { subject: string; is: string }) {
  const settings = useSettings();
  return (
    <Card>
      <EmptyState
        icon="school"
        title="No batches yet"
        description={`${subject} ${is} not in a batch at the moment, so there are no classes, marks or topics to show. ${settings.name} will add one soon.`}
      />
    </Card>
  );
}

/** Banner for a student the institute has marked Inactive — history stays readable. */
export function PortalArchivedNotice({ possessive }: { possessive: string }) {
  return (
    <p className="flex items-start gap-space-xs rounded-xl bg-neutral-container px-space-sm py-space-xs font-body-md text-body-md text-on-neutral-container">
      <Icon name="archive" size={18} className="mt-0.5" />
      <span>{possessive} enrolment is closed, so nothing new will be added here. Everything from before is still yours to read.</span>
    </p>
  );
}
