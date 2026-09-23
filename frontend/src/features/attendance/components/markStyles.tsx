/**
 * Presentation helpers for attendance marks used across the roll call,
 * register grid and dashboard charts. Colours follow MARK_STYLE's tones
 * (Present green, Late amber, Absent red, Excused grey) and every use pairs
 * the colour with the letter or label, never colour alone.
 */
import type { AttendanceMark } from '@/types/domain';
import type { Segment } from '@/components/ui';
import { MARK_STYLE } from '@/components/domain';
import { STATUS_COLORS, type StackSegment } from '@/components/charts';
import { MARK_LABELS, type MarkCounts } from '@/domain/attendance';
import { MARK_ORDER } from '../attendanceStats';

/** Soft tints (container colour + readable ink) matching each mark's MARK_STYLE tone. */
export const MARK_SOFT: Record<AttendanceMark, string> = {
  P: 'bg-success-container text-on-success-container',
  L: 'bg-warning-container text-on-warning-container',
  A: 'bg-danger-container text-on-danger-container',
  E: 'bg-neutral-container text-on-neutral-container',
};

/** Left accent used on roll-call rows once a mark is chosen. */
export const MARK_ACCENT: Record<AttendanceMark, string> = {
  P: 'border-l-success',
  L: 'border-l-warning',
  A: 'border-l-danger',
  E: 'border-l-outline',
};

export const MARK_CHART_COLOR: Record<AttendanceMark, string> = {
  P: STATUS_COLORS.present,
  L: STATUS_COLORS.late,
  A: STATUS_COLORS.absent,
  E: STATUS_COLORS.excused,
};

/** P / L / A / E segments whose active state uses MARK_STYLE's solid colours. Full words on phones, letters from `sm`. */
export const MARK_SEGMENTS: Segment<AttendanceMark>[] = MARK_ORDER.map((m) => ({
  value: m,
  ariaLabel: MARK_LABELS[m],
  activeClassName: `${MARK_STYLE[m].solid} shadow-sm`,
  label: (
    <>
      <span className="sm:hidden">{MARK_LABELS[m]}</span>
      <span className="hidden sm:inline" aria-hidden>
        {m}
      </span>
    </>
  ),
}));

/** Present / Late / Absent / Excused composition for StackedBar. */
export function compositionSegments(c: MarkCounts): StackSegment[] {
  return MARK_ORDER.map((m) => ({ label: MARK_LABELS[m], value: c[m], color: MARK_CHART_COLOR[m] }));
}
