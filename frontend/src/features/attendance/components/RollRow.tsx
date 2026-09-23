/**
 * One student on the roll call: roll number, avatar, name + ID, 30-day
 * attendance badge, warning chips (absence run, on leave) and the P / L / A / E
 * control.
 *
 * Keyboard: rows are focusable; P / L / A / E set the mark and move to the
 * next student, ↑ / ↓ move between students. Phones get a full-width control
 * with 44px segments under the name.
 */
import { memo, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AttendanceMark, ID, Student } from '@/types/domain';
import { Avatar, Badge, SegmentedControl } from '@/components/ui';
import { AttendanceBadge, AttendancePctBadge } from '@/components/domain';
import { attendanceRate, type MarkCounts } from '@/domain/attendance';
import { cn } from '@/lib/cn';
import { MARK_ORDER } from '../attendanceStats';
import { MARK_ACCENT, MARK_SEGMENTS } from './markStyles';

interface RollRowProps {
  index: number;
  student: Student;
  batchId: ID;
  mark?: AttendanceMark;
  onMark: (studentId: ID, mark: AttendanceMark) => void;
  recent?: MarkCounts; // this batch, last 30 days before the class
  streak: number; // consecutive absences before this class
  threshold: number; // low-attendance threshold, %
  lateAsPresent: boolean;
  readOnly?: boolean;
}

/** Move focus to the previous/next roll row within the same list. */
function focusSibling(row: HTMLElement, step: 1 | -1) {
  const rows = Array.from(row.parentElement?.querySelectorAll<HTMLElement>('[data-roll-row]') ?? []);
  rows[rows.indexOf(row) + step]?.focus();
}

export const RollRow = memo(function RollRow({
  index,
  student,
  batchId,
  mark,
  onMark,
  recent,
  streak,
  threshold,
  lateAsPresent,
  readOnly,
}: RollRowProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toUpperCase() as AttendanceMark;
    if (!readOnly && MARK_ORDER.includes(key)) {
      e.preventDefault();
      onMark(student.id, key);
      focusSibling(e.currentTarget, 1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusSibling(e.currentTarget, e.key === 'ArrowDown' ? 1 : -1);
    }
  };

  const onLeave = student.status === 'On Leave';
  // Only possible when editing an old session: the student has since left.
  const former = student.status === 'Inactive' || !student.batchIds.includes(batchId);

  return (
    <li
      data-roll-row
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-keyshortcuts={readOnly ? undefined : 'P L A E'}
      className={cn(
        'flex flex-col gap-space-xs border-l-4 px-space-sm py-space-sm transition-colors focus:outline-none focus-visible:bg-primary-fixed/40 sm:flex-row sm:items-center sm:gap-space-md md:px-space-md',
        mark ? MARK_ACCENT[mark] : 'border-l-transparent',
        mark === 'A' && 'bg-danger-container/30',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-space-xs">
        <span className="w-6 shrink-0 text-right font-label-md text-label-md text-secondary tnum" aria-hidden>
          {index + 1}
        </span>
        <Avatar name={student.name} src={student.photoUrl} size="md" dimmed={former} />
        <div className="min-w-0 flex-1">
          <Link
            to={`/students/${student.id}`}
            tabIndex={-1}
            className="block truncate font-label-lg text-label-lg text-on-surface hover:text-primary hover:underline"
          >
            {student.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="font-body-sm text-body-sm text-secondary tnum">{student.id}</span>
            {recent && <AttendancePctBadge ratio={attendanceRate(recent, lateAsPresent)} threshold={threshold} />}
            {streak >= 2 && (
              <Badge tone="warning" icon="warning">
                Absent {streak}× in a row
              </Badge>
            )}
            {onLeave && (
              <Badge tone="neutral" icon="event_busy">
                On leave
              </Badge>
            )}
            {former && <Badge tone="neutral">Left batch</Badge>}
          </div>
        </div>
      </div>
      {readOnly ? (
        mark && <AttendanceBadge mark={mark} />
      ) : (
        <SegmentedControl<AttendanceMark>
          ariaLabel={`Attendance for ${student.name}`}
          value={mark ?? null}
          onChange={(m) => onMark(student.id, m)}
          segments={MARK_SEGMENTS}
          className="grid w-full shrink-0 grid-cols-4 sm:inline-flex sm:w-auto"
        />
      )}
    </li>
  );
});
