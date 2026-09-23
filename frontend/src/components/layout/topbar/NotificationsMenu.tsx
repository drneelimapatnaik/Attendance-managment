/**
 * Bell with unread indicator → panel of absentee alerts, fee dues and
 * system notices. Clicking an item marks it read and opens its link.
 */
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '@/store/dataStore';
import { Icon, Menu } from '@/components/ui';
import { relativeTime } from '@/lib/date';
import { cn } from '@/lib/cn';
import type { NotificationKind } from '@/types/domain';

const KIND: Record<NotificationKind, { icon: string; cls: string }> = {
  absence: { icon: 'person_off', cls: 'bg-error-container text-on-error-container' },
  fee: { icon: 'payments', cls: 'bg-warning-container text-on-warning-container' },
  batch: { icon: 'class', cls: 'bg-primary-fixed text-on-primary-fixed' },
  system: { icon: 'info', cls: 'bg-surface-container-high text-on-surface-variant' },
};

export function NotificationsMenu() {
  const navigate = useNavigate();
  const notifications = useDataStore((s) => s.notifications);
  const markRead = useDataStore((s) => s.markNotificationRead);
  const markAll = useDataStore((s) => s.markAllNotificationsRead);
  const unread = notifications.filter((n) => !n.read).length;
  const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Menu
      width="w-[22rem]"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
          title="Absentee Alerts & Fee Dues Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <Icon name="notifications" size={22} />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-error" />
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-space-md py-space-sm">
            <div>
              <p className="font-title-md text-title-md text-on-surface">Notifications</p>
              <p className="font-body-sm text-body-sm text-secondary">{unread ? `${unread} unread` : 'All caught up'}</p>
            </div>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="font-label-md text-label-md text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-outline-variant/20 overflow-y-auto">
            {sorted.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    markRead(n.id);
                    close();
                    if (n.link) navigate(n.link);
                  }}
                  className={cn(
                    'flex w-full gap-space-xs px-space-md py-space-sm text-left transition-colors hover:bg-surface-container-low',
                    !n.read && 'bg-primary-fixed/20',
                  )}
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', KIND[n.kind].cls)}>
                    <Icon name={KIND[n.kind].icon} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-label-lg text-label-lg text-on-surface">{n.title}</span>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                    </span>
                    <span className="block font-body-sm text-body-sm text-secondary">{n.message}</span>
                    <span className="mt-0.5 block font-label-sm text-label-sm text-outline">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
            {!sorted.length && <li className="px-space-md py-space-lg text-center text-secondary">No notifications yet.</li>}
          </ul>
        </div>
      )}
    </Menu>
  );
}
