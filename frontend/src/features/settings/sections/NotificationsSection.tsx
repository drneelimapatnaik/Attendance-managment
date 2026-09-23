/**
 * Settings › Notifications: which channels parents and staff are reached on.
 * Individual alerts (absence, fee reminders) are sent on every enabled channel.
 */
import { useMemo } from 'react';
import type { InstituteSettings } from '@/types/domain';
import { Icon, Switch } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { SettingsSection } from '../components/SettingsSection';
import { useDraft } from '../useDraft';

type Channels = InstituteSettings['notifications'];

const CHANNELS: { key: keyof Channels; label: string; icon: string; description: string }[] = [
  { key: 'sms', label: 'SMS', icon: 'sms', description: 'Absence alerts and fee reminders by text message.' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'chat', description: 'Receipts, reminders and report cards on WhatsApp.' },
  { key: 'email', label: 'Email', icon: 'mail', description: 'Monthly statements, receipts and staff invites.' },
  { key: 'push', label: 'App notifications', icon: 'notifications_active', description: 'Real-time alerts in the parent & student app.' },
];

export function NotificationsSection() {
  const notifications = useSettings().notifications;
  const updateSettings = useDataStore((s) => s.updateSettings);
  const toast = useToast();
  const saved = useMemo(() => ({ ...notifications }), [notifications]);
  const { draft, patch, dirty, reset } = useDraft<Channels>(saved);
  const enabled = CHANNELS.filter((c) => draft[c.key]).length;

  return (
    <SettingsSection
      id="notifications"
      icon="notifications"
      title="Notifications"
      description="Channels used to reach parents and staff."
      dirty={dirty}
      onSave={() => {
        updateSettings({ notifications: draft });
        toast({ title: 'Notification channels saved', description: `${enabled} of ${CHANNELS.length} channels on.` });
      }}
      onDiscard={reset}
    >
      <div className="flex flex-col divide-y divide-surface-container-low rounded-xl border border-outline-variant/40">
        {CHANNELS.map((c) => (
          <div key={c.key} className="flex items-center gap-space-sm p-space-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary">
              <Icon name={c.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <Switch checked={draft[c.key]} onChange={(v) => patch({ [c.key]: v })} label={c.label} description={c.description} />
            </div>
          </div>
        ))}
      </div>
      {enabled === 0 && (
        <p className="mt-space-sm flex items-center gap-space-xs font-body-sm text-body-sm text-on-warning-container">
          <Icon name="warning" size={16} />
          With every channel off, parents won’t hear about absences or dues.
        </p>
      )}
    </SettingsSection>
  );
}
