/**
 * Recent activity feed from the store's audit log: who did what, when.
 * Entries link to the record they touched where a screen exists for it
 * (student profile, batch page, or the roll call for a session).
 */
import { Link } from 'react-router-dom';
import type { ActivityEntry, AttendanceSession } from '@/types/domain';
import { Avatar, Card, CardHeader, EmptyState, Icon } from '@/components/ui';
import { useCan, useLookups } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { relativeTime } from '@/lib/date';
import { cn } from '@/lib/cn';

const LIMIT = 8;

const ENTITY_ICON: Record<NonNullable<ActivityEntry['entity']>['type'], string> = {
  student: 'person',
  batch: 'class',
  invoice: 'receipt_long',
  session: 'fact_check',
  assessment: 'quiz',
  staff: 'badge',
};

export function RecentActivity({ className }: { className?: string }) {
  const can = useCan();
  const activity = useDataStore((s) => s.activity);
  const sessions = useDataStore((s) => s.sessions);
  const { staff } = useLookups();
  const entries = activity.slice(0, LIMIT);

  const linkFor = (e: ActivityEntry): string | undefined => {
    if (!e.entity) return undefined;
    switch (e.entity.type) {
      case 'student':
        return can('students.view') ? `/students/${e.entity.id}` : undefined;
      case 'batch':
        return can('batches.view') ? `/batches/${e.entity.id}` : undefined;
      case 'invoice':
        return can('fees.view') ? '/fees' : undefined;
      case 'session': {
        const id = e.entity.id;
        const s: AttendanceSession | undefined = sessions.find((x) => x.id === id);
        return s && can('attendance.mark') ? `/attendance?batch=${s.batchId}&date=${s.date}` : undefined;
      }
      default:
        return undefined;
    }
  };

  return (
    <Card className={className}>
      <CardHeader title="Recent activity" icon="history" />
      {entries.length === 0 ? (
        <EmptyState compact icon="history" title="No activity yet" description="Changes made by your team will appear here." />
      ) : (
        <ol className="mt-space-sm flex flex-col">
          {entries.map((e) => {
            const actor = staff.get(e.actorId);
            const to = linkFor(e);
            const body = (
              <>
                <span className="relative shrink-0">
                  <Avatar name={actor?.name ?? 'System'} src={actor?.avatarUrl} size="sm" />
                  {e.entity && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface-container-lowest text-primary shadow-sm">
                      <Icon name={ENTITY_ICON[e.entity.type]} size={11} />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-body-md text-body-md text-on-surface-variant">
                    <strong className="font-semibold text-on-surface">{actor?.name ?? 'System'}</strong> {e.action}
                  </span>
                  <time dateTime={e.at} className="font-body-sm text-body-sm text-secondary">
                    {relativeTime(e.at)}
                  </time>
                </span>
              </>
            );
            const cls = '-mx-space-xs flex items-start gap-space-xs rounded-lg px-space-xs py-space-xs';
            return (
              <li key={e.id}>
                {to ? (
                  <Link to={to} className={cn(cls, 'transition-colors hover:bg-surface-container-low')}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
