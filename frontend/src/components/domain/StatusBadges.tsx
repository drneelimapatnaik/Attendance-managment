/**
 * Domain status badges — one place defines how each state looks, so fee,
 * student and attendance states read identically on every screen.
 * Each pairs colour with an icon and text (never colour alone).
 */
import type { AttendanceMark, CoverageStatus, FeeStatus, StaffStatus, StudentStatus } from '@/types/domain';
import { Badge, type BadgeTone } from '@/components/ui';
import { useMoney } from '@/hooks/useTenant';
import { MARK_LABELS } from '@/domain/attendance';

/* Fee: Paid (Clear) · Pending ₹2,500 · Overdue ₹5,000 — from the roster design. */
const FEE: Record<FeeStatus, { tone: BadgeTone; icon: string }> = {
  Paid: { tone: 'primary', icon: 'check_circle' },
  Pending: { tone: 'secondary', icon: 'schedule' },
  Overdue: { tone: 'danger', icon: 'error' },
};

export function FeeStatusBadge({ status, amount }: { status: FeeStatus; amount?: number }) {
  const money = useMoney();
  const cfg = FEE[status];
  return (
    <Badge tone={cfg.tone} icon={cfg.icon}>
      {status === 'Paid' ? 'Paid (Clear)' : `${status}${amount ? ` ${money.format(amount)}` : ''}`}
    </Badge>
  );
}

const STUDENT: Record<StudentStatus, { tone: BadgeTone; cls?: string }> = {
  Active: { tone: 'surface' },
  'On Leave': { tone: 'surface', cls: 'text-secondary' },
  Inactive: { tone: 'neutral' },
};

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  return (
    <Badge tone={STUDENT[status].tone} className={STUDENT[status].cls}>
      {status}
    </Badge>
  );
}

const STAFF: Record<StaffStatus, BadgeTone> = { Active: 'success', Invited: 'info', Inactive: 'neutral' };

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  return (
    <Badge tone={STAFF[status]} dot>
      {status}
    </Badge>
  );
}

/* Attendance: DESIGN.md › Chips — Present green, Late amber, Absent red. */
export const MARK_STYLE: Record<AttendanceMark, { tone: BadgeTone; icon: string; solid: string }> = {
  P: { tone: 'success', icon: 'check', solid: 'bg-success text-white' },
  L: { tone: 'warning', icon: 'schedule', solid: 'bg-warning text-white' },
  A: { tone: 'danger', icon: 'close', solid: 'bg-danger text-white' },
  E: { tone: 'neutral', icon: 'event_busy', solid: 'bg-outline text-white' },
};

export function AttendanceBadge({ mark, short }: { mark: AttendanceMark; short?: boolean }) {
  const s = MARK_STYLE[mark];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {short ? mark : MARK_LABELS[mark]}
    </Badge>
  );
}

const COVERAGE: Record<CoverageStatus, { tone: BadgeTone; icon: string }> = {
  Completed: { tone: 'success', icon: 'task_alt' },
  'In Progress': { tone: 'info', icon: 'pending' },
  'Not Started': { tone: 'neutral', icon: 'radio_button_unchecked' },
};

export function CoverageBadge({ status }: { status: CoverageStatus }) {
  return (
    <Badge tone={COVERAGE[status].tone} icon={COVERAGE[status].icon}>
      {status}
    </Badge>
  );
}

/** Attendance percentage chip, coloured against the tenant's low-attendance threshold. */
export function AttendancePctBadge({ ratio, threshold }: { ratio: number; threshold: number }) {
  if (!Number.isFinite(ratio)) return <Badge tone="neutral">No data</Badge>;
  const pct = Math.round(ratio * 100);
  const tone: BadgeTone = pct < threshold ? 'danger' : pct < threshold + 10 ? 'warning' : 'success';
  return (
    <Badge tone={tone} icon={pct < threshold ? 'trending_down' : undefined}>
      {pct}%
    </Badge>
  );
}
