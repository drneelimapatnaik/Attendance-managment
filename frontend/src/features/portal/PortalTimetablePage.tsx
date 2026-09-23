/**
 * Student & parent app — Timetable.
 *
 * A week of classes grouped Monday to Sunday: when each class runs, which
 * batch, which room and who teaches it. Today is highlighted, classes that
 * have already finished are dimmed, and every empty day says why it is empty.
 * The week in view lives in the URL (`?week=YYYY-MM-DD`, any day of that week).
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ISODate, Weekday } from '@/types/domain';
import { Badge, Card, Icon, IconButton, PageHeader } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/ui';
import { classesOn, type ScheduledClass } from '@/domain/attendance';
import { addDays, dateRange, formatDayMonth, formatTime, formatTimeRange, nowTime, parseISODate, today, weekdayOf } from '@/lib/date';
import { cn } from '@/lib/cn';
import { usePortalScreen } from './usePortalDerived';
import { MarkChip } from '@/components/domain';
import { PortalArchivedNotice, PortalNoBatches, PortalNoStudent } from './components/PortalEmptyStates';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DAY_NAMES: Record<Weekday, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

/** The Monday on or before `date`. */
function mondayOf(date: ISODate): ISODate {
  return addDays(date, -((parseISODate(date).getDay() + 6) % 7));
}

export default function PortalTimetablePage() {
  useDocumentTitle('Timetable');
  const { student, batches, sessions, voice, settings, subjectOf, facultyOf } = usePortalScreen();
  const [params, setParams] = useSearchParams();

  const t = today();
  const now = nowTime();
  const weekParam = params.get('week');
  const weekStart = mondayOf(weekParam && DATE_RE.test(weekParam) ? weekParam : t);
  const weekEnd = addDays(weekStart, 6);

  const setWeek = (start: ISODate) => {
    const p = new URLSearchParams(params);
    p.set('week', start);
    setParams(p, { replace: true });
  };

  // An archived student is no longer timetabled, so only classes that were
  // actually held (and marked) while they were enrolled are shown.
  const enrolmentClosed = student?.status === 'Inactive';

  /** The seven days of the week with the classes timetabled on each. */
  const days = useMemo(() => {
    return dateRange(weekStart, weekEnd).map((date) => {
      const list = classesOn(date, batches, sessions);
      return { date, classes: enrolmentClosed ? list.filter((c) => c.session) : list };
    });
  }, [weekStart, weekEnd, batches, sessions, enrolmentClosed]);

  const totalClasses = days.reduce((n, d) => n + d.classes.length, 0);

  // The next class that has not started yet, looked up over the coming fortnight
  // so the hint still works when the week on screen is empty or in the past.
  const nextClass = useMemo(() => {
    if (enrolmentClosed) return undefined;
    for (let i = 0; i <= 14; i++) {
      const date = addDays(t, i);
      const found = classesOn(date, batches, []).find((c) => i > 0 || c.batch.startTime > now);
      if (found) return found;
    }
    return undefined;
  }, [enrolmentClosed, t, now, batches]);

  if (!student) return <PortalNoStudent />;

  const weekLabel = `${formatDayMonth(weekStart)} – ${formatDayMonth(weekEnd)}`;
  const isThisWeek = weekStart === mondayOf(t);

  return (
    <div className="flex flex-col gap-space-md">
      <PageHeader eyebrow="Timetable" title={voice.isParent ? `${voice.first}'s week` : 'Your week'} />

      {student.status === 'Inactive' && <PortalArchivedNotice possessive={voice.possessive} />}

      {batches.length === 0 ? (
        <PortalNoBatches subject={voice.subject} is={voice.is} />
      ) : (
        <>
          {/* Week at a glance --------------------------------------------- */}
          <Card className="flex flex-col gap-space-sm">
            <div className="flex items-center justify-between gap-space-xs">
              <div className="min-w-0">
                <h2 className="font-title-lg text-title-lg font-bold text-on-surface" aria-live="polite">
                  {isThisWeek ? 'This week' : weekLabel}
                </h2>
                <p className="font-body-sm text-body-sm text-secondary">
                  {isThisWeek && `${weekLabel} · `}
                  {totalClasses} class{totalClasses === 1 ? '' : 'es'}
                </p>
              </div>
              <div className="flex items-center gap-space-2xs">
                <IconButton icon="chevron_left" label="Previous week" onClick={() => setWeek(addDays(weekStart, -7))} />
                <IconButton icon="chevron_right" label="Next week" onClick={() => setWeek(addDays(weekStart, 7))} />
              </div>
            </div>

            {/* Seven compact columns: weekday, date and one dot per class. */}
            <ul className="grid grid-cols-7 gap-1">
              {days.map(({ date, classes }) => (
                <li
                  key={date}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg py-space-xs',
                    date === t ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-low',
                    date < t && 'opacity-60',
                  )}
                >
                  <span className="font-label-sm text-label-sm uppercase">{weekdayOf(date)[0]}</span>
                  <span className="font-label-md text-label-md tnum">{Number(date.slice(8))}</span>
                  <span className="flex h-2 items-center gap-0.5" aria-hidden>
                    {classes.length === 0 ? (
                      <span className="h-0.5 w-2 rounded-full bg-outline-variant" />
                    ) : (
                      classes.slice(0, 3).map((c) => <span key={c.batch.id} className="h-1.5 w-1.5 rounded-full bg-primary" />)
                    )}
                  </span>
                  <span className="sr-only">
                    {DAY_NAMES[weekdayOf(date)]} {formatDayMonth(date)}: {classes.length} classes
                  </span>
                </li>
              ))}
            </ul>

            {nextClass && (
              <p className="flex items-start gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-space-xs font-body-md text-body-md text-on-surface-variant">
                <Icon name="schedule" size={18} className="mt-0.5 text-primary" />
                <span>
                  Next class: <strong className="text-on-surface">{subjectOf(nextClass.batch)}</strong> on{' '}
                  {nextClass.date === t ? 'today' : DAY_NAMES[weekdayOf(nextClass.date)]} {formatDayMonth(nextClass.date)} at{' '}
                  {formatTime(nextClass.batch.startTime)}, room {nextClass.batch.room}.
                </span>
              </p>
            )}
          </Card>

          {/* Day by day --------------------------------------------------- */}
          {days.map(({ date, classes }) => {
            const day = weekdayOf(date);
            const closed = !settings.workingDays.includes(day);
            // A whole day in the past is dimmed once on the card; a row only
            // dims on its own for a class that has already finished today.
            return (
              <Card key={date} className={cn('flex flex-col gap-space-sm', date < t && 'opacity-75')}>
                <div className="flex items-baseline justify-between gap-space-xs">
                  <h3 className="font-title-md text-title-md text-on-surface">
                    {DAY_NAMES[day]} · <span className="tnum">{formatDayMonth(date)}</span>
                  </h3>
                  {date === t && (
                    <Badge tone="primary" icon="today">
                      Today
                    </Badge>
                  )}
                </div>

                {classes.length === 0 ? (
                  <p className="flex items-center gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-space-sm font-body-md text-body-md text-secondary">
                    <Icon name={enrolmentClosed ? 'archive' : closed ? 'home' : 'free_cancellation'} size={18} />
                    {enrolmentClosed
                      ? 'No classes — enrolment is closed.'
                      : closed
                        ? `No classes — ${settings.name} is closed on ${DAY_NAMES[day]}s.`
                        : `No classes — ${voice.possessiveLower} batches don't meet on ${DAY_NAMES[day]}s.`}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-space-xs">
                    {classes.map((c) => (
                      <li key={c.batch.id}>
                        <TimetableRow
                          scheduled={c}
                          past={date === t && c.batch.endTime <= now}
                          live={date === t && c.batch.startTime <= now && c.batch.endTime > now}
                          studentId={student.id}
                          subject={subjectOf(c.batch)}
                          faculty={facultyOf(c.batch.facultyId)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

/** One timetabled class: time, subject, room, faculty and (once past) its mark. */
function TimetableRow({
  scheduled,
  past,
  live,
  studentId,
  subject,
  faculty,
}: {
  scheduled: ScheduledClass;
  past: boolean;
  live: boolean;
  studentId: string;
  subject: string;
  faculty: string;
}) {
  const { batch, session } = scheduled;
  const mark = session?.records[studentId];
  return (
    <div
      className={cn(
        'flex items-center gap-space-sm rounded-xl p-space-sm',
        live ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-low',
        past && !live && 'opacity-60',
      )}
    >
      <div className="w-[4.5rem] shrink-0">
        <p className={cn('font-label-lg text-label-lg tnum', live ? 'text-on-primary-fixed' : 'text-on-surface')}>
          {formatTime(batch.startTime)}
        </p>
        <p className={cn('font-body-sm text-body-sm tnum', live ? 'opacity-80' : 'text-secondary')}>{formatTime(batch.endTime)}</p>
        <span className="sr-only">{formatTimeRange(batch.startTime, batch.endTime)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-title-md text-title-md', live ? 'text-on-primary-fixed' : 'text-on-surface')}>{subject}</p>
        <p className={cn('font-body-sm text-body-sm', live ? 'opacity-90' : 'text-secondary')}>
          {batch.name} · Room {batch.room}
        </p>
        <p className={cn('font-body-sm text-body-sm', live ? 'opacity-90' : 'text-secondary')}>{faculty}</p>
      </div>
      {live ? (
        <Badge tone="surface" icon="play_circle">
          Now
        </Badge>
      ) : (
        mark && <MarkChip mark={mark} size="sm" />
      )}
    </div>
  );
}
