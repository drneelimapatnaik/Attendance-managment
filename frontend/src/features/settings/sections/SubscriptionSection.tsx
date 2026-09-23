/**
 * Settings › Subscription (read-only): licence tier, validity and seat usage
 * (current students vs the plan's limit). "Upgrade" hands off to sales.
 */
import { useMemo } from 'react';
import { Badge, Button, ProgressBar } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { diffDays, formatDate, today } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import { SettingsSection } from '../components/SettingsSection';

export function SubscriptionSection() {
  const { license, currency } = useSettings();
  const students = useDataStore((s) => s.students);
  const toast = useToast();
  // Seats are held by every non-archived student across all campuses.
  const used = useMemo(() => students.filter((s) => s.status !== 'Inactive').length, [students]);
  const ratio = license.maxStudents ? used / license.maxStudents : 0;
  const daysLeft = diffDays(today(), license.validUntil);
  const expired = daysLeft < 0;
  const renewSoon = !expired && daysLeft <= 30;
  const fmt = (n: number) => formatNumber(n, currency.locale);

  return (
    <SettingsSection
      id="subscription"
      icon="workspace_premium"
      title="Subscription"
      description="Your EduTrack plan and how much of it you use."
      headerActions={
        <Button
          size="sm"
          icon="rocket_launch"
          onClick={() =>
            toast({
              title: 'Upgrade request sent',
              description: 'Our team will contact you within one business day with plan options.',
              tone: 'info',
            })
          }
        >
          Upgrade
        </Button>
      }
    >
      <div className="grid gap-space-sm sm:grid-cols-3">
        <div className="rounded-xl bg-surface-container-low p-space-sm">
          <p className="font-label-md text-label-md text-secondary">Plan</p>
          <p className="mt-0.5 flex items-center gap-space-xs font-headline-sm text-headline-sm text-on-surface">
            {license.tier}
            <Badge tone={expired ? 'danger' : 'success'} icon={expired ? 'error' : 'verified'}>
              {expired ? 'Expired' : 'Active'}
            </Badge>
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-low p-space-sm">
          <p className="font-label-md text-label-md text-secondary">Valid until</p>
          <p className="mt-0.5 font-headline-sm text-headline-sm text-on-surface tnum">{formatDate(license.validUntil)}</p>
          <p className={renewSoon || expired ? 'font-body-sm text-body-sm text-error' : 'font-body-sm text-body-sm text-secondary'}>
            {expired ? `Expired ${-daysLeft} days ago` : `${daysLeft} days left${renewSoon ? ' — renew soon' : ''}`}
          </p>
        </div>
        <div className="rounded-xl bg-surface-container-low p-space-sm">
          <p className="font-label-md text-label-md text-secondary">Student seats</p>
          <p className="mt-0.5 font-headline-sm text-headline-sm text-on-surface tnum">
            {fmt(used)} <span className="font-body-md text-body-md text-secondary">/ {fmt(license.maxStudents)}</span>
          </p>
          <ProgressBar
            value={ratio}
            tone={ratio >= 0.95 ? 'danger' : ratio >= 0.8 ? 'warning' : 'primary'}
            size="sm"
            className="mt-space-xs"
            label={`${fmt(used)} of ${fmt(license.maxStudents)} student seats used`}
          />
          <p className="mt-1 font-body-sm text-body-sm text-secondary">
            {ratio >= 1 ? 'Limit reached — new admissions need an upgrade.' : `${fmt(Math.max(0, license.maxStudents - used))} seats free`}
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
