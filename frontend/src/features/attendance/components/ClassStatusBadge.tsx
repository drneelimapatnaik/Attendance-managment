/**
 * Status chip for a class on the timetable (roll-call picker, dashboard
 * schedule). Icon + text, never colour alone.
 */
import { Badge, type BadgeTone } from '@/components/ui';
import type { ClassStatus } from '../classSchedule';

const STATUS: Record<ClassStatus, { tone: BadgeTone; icon: string; label: string }> = {
  marked: { tone: 'success', icon: 'task_alt', label: 'Marked' },
  live: { tone: 'info', icon: 'radio_button_checked', label: 'In progress' },
  upcoming: { tone: 'neutral', icon: 'schedule', label: 'Upcoming' },
  missed: { tone: 'warning', icon: 'pending_actions', label: 'Not marked' },
  scheduled: { tone: 'neutral', icon: 'event', label: 'Scheduled' },
};

export function ClassStatusBadge({ status, className }: { status: ClassStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} icon={s.icon} className={className}>
      {s.label}
    </Badge>
  );
}
