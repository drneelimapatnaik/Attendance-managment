/**
 * "Bulk Attendance" call-to-action from the roster design. Finds the next
 * class today that hasn't been marked (or one in progress) and links straight
 * into the roll call for it. Faculty are pointed at their own classes first.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '@/components/ui';
import { useCurrentUser, useScopedData } from '@/hooks/useTenant';
import { classesOn } from '@/domain/attendance';
import { minutesOf, nowTime, today } from '@/lib/date';

export function FastAttendanceCard() {
  const navigate = useNavigate();
  const { batches, sessions } = useScopedData();
  const user = useCurrentUser();

  const target = useMemo(() => {
    const now = minutesOf(nowTime());
    const all = classesOn(today(), batches, sessions).filter((c) => !c.session);
    const mine = user?.role === 'faculty' ? all.filter((c) => c.batch.facultyId === user.id) : [];
    const pending = mine.length ? mine : all;
    // Prefer a class in progress, then the next one to start.
    const live = pending.find((c) => minutesOf(c.batch.startTime) <= now && minutesOf(c.batch.endTime) >= now);
    const next = pending.find((c) => minutesOf(c.batch.startTime) > now);
    const overdue = pending.find((c) => minutesOf(c.batch.endTime) < now);
    return live
      ? { c: live, kind: 'live' as const }
      : next
        ? { c: next, kind: 'next' as const }
        : overdue
          ? { c: overdue, kind: 'overdue' as const }
          : null;
  }, [batches, sessions, user]);

  const startsIn = target ? minutesOf(target.c.batch.startTime) - minutesOf(nowTime()) : 0;
  const message = !target
    ? "All of today's classes have been marked. Great job!"
    : target.kind === 'live'
      ? `${target.c.batch.name} is in session right now. Quick roll call is unlocked.`
      : target.kind === 'next'
        ? `${target.c.batch.name} has an upcoming session starting in ${startsIn >= 60 ? `${Math.floor(startsIn / 60)}h ${startsIn % 60}m` : `${startsIn} minutes`}. Quick roll call is unlocked.`
        : `${target.c.batch.name} finished without attendance being marked. Record it now.`;

  return (
    <div className="relative flex flex-col gap-space-xs overflow-hidden rounded-xl bg-primary p-space-md text-on-primary shadow-md">
      <div className="pointer-events-none absolute -bottom-6 -right-6 opacity-10">
        <Icon name="school" size={140} />
      </div>
      <div className="flex items-center gap-2">
        <Icon name="campaign" className="text-on-primary-container" />
        <span className="font-label-md text-label-md font-semibold uppercase tracking-wider text-on-primary-container">
          Bulk Attendance
        </span>
      </div>
      <h3 className="font-title-md text-title-md font-bold">{target ? `Mark ${target.c.batch.name}'s Slot` : 'Roll Call Complete'}</h3>
      <p className="font-body-sm text-body-sm text-on-primary/80">{message}</p>
      <div className="pt-space-xs">
        <Button
          variant="inverse"
          icon="checklist"
          fullWidth
          onClick={() => navigate(target ? `/attendance?batch=${target.c.batch.id}` : '/attendance')}
        >
          {target ? 'Launch Fast Attendance' : "View Today's Classes"}
        </Button>
      </div>
    </div>
  );
}
