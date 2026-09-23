/**
 * Roll-call header: which class this is (batch, title, time, room, faculty)
 * and its save state — "Last saved by X · time", with a "saved on this
 * device" hint while the write hasn't synced to the server yet.
 */
import { Link } from 'react-router-dom';
import type { AttendanceSession, Batch } from '@/types/domain';
import { Badge, Icon } from '@/components/ui';
import { useLookups } from '@/hooks/useTenant';
import { formatDayMonth, formatTime, formatTimeRange, relativeTime, toISODate } from '@/lib/date';

interface RollCallHeaderProps {
  batch: Batch;
  session?: AttendanceSession;
  /** A future class — nothing to mark yet. */
  upcoming?: boolean;
}

export function RollCallHeader({ batch, session, upcoming }: RollCallHeaderProps) {
  const { staff, subject } = useLookups();
  const faculty = staff.get(session?.facultyId ?? batch.facultyId);
  const savedBy = session && staff.get(session.markedBy);
  const savedAt = session && new Date(session.markedAt);

  const meta = (icon: string, text: string) => (
    <span className="inline-flex items-center gap-1">
      <Icon name={icon} size={16} className="text-primary" />
      {text}
    </span>
  );

  return (
    <div className="flex flex-col gap-space-sm md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-space-xs">
          <Link
            to={`/batches/${batch.id}`}
            className="font-headline-sm text-headline-sm text-on-surface hover:text-primary hover:underline"
          >
            {batch.name}
          </Link>
          <Badge tone="primary">{batch.grade}</Badge>
          <Badge tone="surface">{subject.get(batch.subjectId)?.name ?? 'Subject'}</Badge>
        </div>
        <p className="mt-0.5 font-body-md text-body-md text-secondary">{batch.title}</p>
        <div className="mt-space-xs flex flex-wrap gap-x-space-md gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
          {meta('schedule', formatTimeRange(session?.startTime ?? batch.startTime, session?.endTime ?? batch.endTime))}
          {meta('meeting_room', batch.room)}
          {meta('school', faculty?.name ?? 'Unassigned')}
        </div>
      </div>
      <div className="shrink-0 md:text-right">
        {session && savedAt ? (
          <div className="flex flex-col gap-1 md:items-end">
            <Badge tone="success" icon="cloud_done">
              Attendance recorded
            </Badge>
            <p className="font-body-sm text-body-sm text-secondary">
              Last saved by <strong className="text-on-surface">{savedBy?.name ?? 'a staff member'}</strong> ·{' '}
              <time dateTime={session.markedAt} title={savedAt.toLocaleString()}>
                {formatDayMonth(toISODate(savedAt))}, {formatTime(savedAt.toTimeString().slice(0, 5))} ({relativeTime(session.markedAt)})
              </time>
            </p>
            {session.pendingSync && (
              <p className="flex items-center gap-1 font-body-sm text-body-sm text-secondary md:justify-end">
                <Icon name="cloud_upload" size={14} />
                Saved on this device · syncs automatically
              </p>
            )}
          </div>
        ) : upcoming ? (
          <Badge tone="neutral" icon="event">
            Scheduled
          </Badge>
        ) : (
          <Badge tone="warning" icon="pending_actions">
            Not marked yet
          </Badge>
        )}
      </div>
    </div>
  );
}
