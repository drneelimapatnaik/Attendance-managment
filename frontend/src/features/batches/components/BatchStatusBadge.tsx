/** Batch lifecycle badge (Active / Upcoming / Archived) — colour always paired with an icon + text. */
import type { BatchStatus } from '@/types/domain';
import { Badge, type BadgeTone } from '@/components/ui';

const STATUS: Record<BatchStatus, { tone: BadgeTone; icon: string }> = {
  Active: { tone: 'success', icon: 'play_circle' },
  Upcoming: { tone: 'info', icon: 'event_upcoming' },
  Archived: { tone: 'neutral', icon: 'archive' },
};

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return (
    <Badge tone={STATUS[status].tone} icon={STATUS[status].icon}>
      {status}
    </Badge>
  );
}
