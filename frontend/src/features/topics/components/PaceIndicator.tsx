/**
 * Syllabus pace chip: "On track" / "Behind by N topics" / "Not started yet",
 * with the expected-by-today figure. Colour is always paired with icon + text.
 */
import { Badge } from '@/components/ui';
import { formatPercent, pluralize } from '@/lib/format';
import type { Pace } from '../coverage';

interface PaceIndicatorProps {
  pace: Pace;
  total: number;
  showExpected?: boolean;
}

export function PaceIndicator({ pace, total, showExpected = true }: PaceIndicatorProps) {
  const chip =
    pace.state === 'not-started' ? (
      <Badge tone="neutral" icon="event_upcoming">
        Not started yet
      </Badge>
    ) : pace.state === 'on-track' ? (
      <Badge tone="success" icon="check_circle">
        On track
      </Badge>
    ) : (
      <Badge tone="warning" icon="schedule">
        Behind by {pluralize(pace.behindBy, 'topic')}
      </Badge>
    );
  if (!showExpected || pace.state === 'not-started') return chip;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-space-xs gap-y-1">
      {chip}
      <span className="font-body-sm text-body-sm text-secondary tnum">
        Expected by today: {formatPercent(pace.expectedRatio)} · {pace.expectedTopics} of {total} topics
      </span>
    </span>
  );
}
