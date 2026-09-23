/**
 * Plain-language verdict on an attendance percentage, for screens that already
 * show the number itself (repeating "98%" in a badge beside "98%" tells a
 * parent nothing). Colour is always paired with an icon and words.
 */
import { Badge, type BadgeTone } from '@/components/ui';

interface PortalAttendanceStatusProps {
  /** Attendance ratio 0–1, or NaN when there is nothing to measure. */
  ratio: number;
  /** The institute's low-attendance threshold as a percentage (e.g. 75). */
  threshold: number;
}

export function PortalAttendanceStatus({ ratio, threshold }: PortalAttendanceStatusProps) {
  if (!Number.isFinite(ratio)) return <Badge tone="neutral">No classes yet</Badge>;
  const pct = ratio * 100;
  // A 10-point band above the threshold is the "watch this" zone.
  const [tone, icon, label]: [BadgeTone, string, string] =
    pct < threshold
      ? ['danger', 'trending_down', 'Below target']
      : pct < threshold + 10
        ? ['warning', 'priority_high', 'Close to target']
        : ['success', 'check_circle', 'On track'];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}
