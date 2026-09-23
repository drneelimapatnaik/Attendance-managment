/**
 * Student & parent app — Home: the daily check-in.
 *
 * One scroll answers "what's happening today, how am I doing, and what changed
 * since I last looked": today's classes, a 30-day attendance tile, the latest
 * result, fees (parents only), syllabus progress, recent updates and shortcuts.
 *
 * Every number comes from `usePortalScreen()`, which is scoped to the student
 * in view, so a parent's tiles follow the child picked in the top bar.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Badge, ButtonLink, Card, CardHeader, Icon, ProgressBar } from '@/components/ui';
import { FeeStatusBadge } from '@/components/domain';
import { useDocumentTitle } from '@/hooks/ui';
import { useMoney } from '@/hooks/useTenant';
import { MARK_LABELS, attendanceRate, classesOn, type ScheduledClass } from '@/domain/attendance';
import { assessmentStats, coverageProgress, gradeBand } from '@/domain/academics';
import { addDays, formatDayMonth, formatLongDate, formatTime, formatTimeRange, nowTime, relativeTime, today } from '@/lib/date';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { countRows, pastInstant, usePortalScreen } from './usePortalDerived';
import { MarkChip } from '@/components/domain';
import { PortalAttendanceStatus } from './components/PortalAttendanceStatus';
import { PortalArchivedNotice, PortalNoBatches, PortalNoStudent } from './components/PortalEmptyStates';

/** One row of the "Recent updates" feed, whatever it was built from. */
interface UpdateItem {
  id: string;
  at: string; // ISO instant, newest first
  icon: string;
  title: string;
  detail?: string;
  to: string;
  tone?: 'plain' | 'alert';
}

const greetingFor = (hour: number) => (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');

export default function PortalHomePage() {
  useDocumentTitle('Home');
  const screen = usePortalScreen();
  const { student, batches, sessions, assessments, coverage, topics, invoices, payments, fees } = screen;
  const { rows, voice, threshold, countLate, isParent, account, subjectOf, facultyOf } = screen;
  const money = useMoney();

  const t = today();
  const now = nowTime();
  // An archived student keeps their history but is no longer timetabled.
  const enrolmentClosed = student?.status === 'Inactive';

  /* Today ---------------------------------------------------------------- */
  const todayClasses = useMemo(() => (enrolmentClosed ? [] : classesOn(t, batches, sessions)), [enrolmentClosed, t, batches, sessions]);

  // The next class that has not finished: today's remaining ones first, then
  // the first class on any of the following two weeks.
  const nextClass = useMemo<ScheduledClass | undefined>(() => {
    if (enrolmentClosed) return undefined;
    const laterToday = todayClasses.find((c) => c.batch.endTime > now);
    if (laterToday) return laterToday;
    for (let i = 1; i <= 14; i++) {
      const [first] = classesOn(addDays(t, i), batches, []);
      if (first) return first;
    }
    return undefined;
  }, [enrolmentClosed, todayClasses, now, t, batches]);

  /* Attendance ----------------------------------------------------------- */
  const last30 = useMemo(() => {
    const from = addDays(t, -29);
    return countRows(rows.filter((r) => r.session.date >= from));
  }, [rows, t]);
  const rate30 = attendanceRate(last30, countLate);
  // Oldest → newest so the strip reads left to right like a timeline.
  const recent10 = useMemo(() => rows.slice(0, 10).reverse(), [rows]);

  /* Latest result -------------------------------------------------------- */
  const latest = useMemo(() => {
    if (!student) return undefined;
    const a = [...assessments].sort((x, y) => y.date.localeCompare(x.date))[0];
    if (!a) return undefined;
    const score = a.scores[student.id] ?? null;
    return {
      assessment: a,
      score,
      ratio: score == null ? NaN : score / a.maxMarks,
      classAverage: assessmentStats(a).average,
      batch: batches.find((b) => b.id === a.batchId),
    };
  }, [assessments, student, batches]);

  /* Syllabus ------------------------------------------------------------- */
  const syllabus = useMemo(() => {
    const per = batches.map((b) => ({ batch: b, progress: coverageProgress(b, topics, coverage) }));
    const total = per.reduce((n, p) => n + p.progress.total, 0);
    const done = per.reduce((n, p) => n + p.progress.completed, 0);
    const studying = per.find((p) => p.progress.current);
    return { per, ratio: total ? done / total : NaN, done, total, studying };
  }, [batches, topics, coverage]);

  /* Recent updates ------------------------------------------------------- */
  const updates = useMemo<UpdateItem[]>(() => {
    const items: UpdateItem[] = [];

    for (const r of rows.slice(0, 12)) {
      const where = r.batch ? ` in ${subjectOf(r.batch)}` : '';
      items.push({
        id: `att-${r.session.id}`,
        at: r.session.markedAt,
        icon: r.mark === 'A' ? 'event_busy' : r.mark === 'L' ? 'schedule' : r.mark === 'E' ? 'edit_calendar' : 'check_circle',
        tone: r.mark === 'A' ? 'alert' : 'plain',
        title: `${voice.subject} ${voice.was} marked ${MARK_LABELS[r.mark].toLowerCase()}${where}`,
        detail: `Class on ${formatDayMonth(r.session.date)}`,
        to: '/portal/attendance',
      });
    }

    if (student) {
      for (const a of [...assessments].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5)) {
        const score = a.scores[student.id] ?? null;
        items.push({
          id: `asm-${a.id}`,
          // Results are published at the end of the exam day in the demo data.
          at: pastInstant(a.date, '17:00'),
          icon: 'grading',
          title: `New result · ${a.title}`,
          detail: score == null ? 'Marked absent for this one' : `${score}/${a.maxMarks} · ${formatPercent(score / a.maxMarks)}`,
          to: '/portal/results',
        });
      }
    }

    // Money is parent-only: `invoices`/`payments` are empty for a student login.
    for (const inv of [...invoices].sort((x, y) => y.issuedOn.localeCompare(x.issuedOn)).slice(0, 4)) {
      items.push({
        id: `inv-${inv.id}`,
        at: pastInstant(inv.issuedOn, '09:00'),
        icon: 'receipt_long',
        title: `New fee invoice · ${inv.description}`,
        detail: `${money.format(inv.amount)} · due ${formatDayMonth(inv.dueDate)}`,
        to: '/portal/fees',
      });
    }
    for (const p of [...payments].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 4)) {
      items.push({
        id: `pay-${p.id}`,
        at: pastInstant(p.date, '12:00'),
        icon: 'task_alt',
        title: `Payment received · ${money.format(p.amount)}`,
        detail: `${p.method} · receipt ${p.receiptNo}`,
        to: '/portal/fees',
      });
    }

    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  }, [rows, assessments, invoices, payments, student, voice, subjectOf, money]);

  if (!student) return <PortalNoStudent />;

  const heading = isParent
    ? `${greetingFor(new Date().getHours())}, ${account?.name.split(' ')[0] ?? ''}`
    : greetingFor(new Date().getHours());

  return (
    <div className="flex flex-col gap-space-md">
      {/* Greeting — for a parent it always names the child currently in view. */}
      <section className="card flex items-center gap-space-sm bg-primary-fixed p-space-md text-on-primary-fixed">
        <Avatar name={student.name} src={student.photoUrl} size="lg" />
        <div className="min-w-0">
          <p className="font-title-lg text-title-lg">
            {heading}
            {!isParent && `, ${voice.first}`}
          </p>
          <p className="mt-0.5 font-body-md text-body-md opacity-90">
            {isParent ? `Here's ${student.name}'s day · ` : ''}
            {formatLongDate(t)}
          </p>
          <p className="mt-0.5 font-body-sm text-body-sm opacity-80">
            {student.grade} · {student.section} · ID {student.id}
          </p>
        </div>
      </section>

      {student.status === 'Inactive' && <PortalArchivedNotice possessive={voice.possessive} />}

      {batches.length === 0 ? (
        <PortalNoBatches subject={voice.subject} is={voice.is} />
      ) : (
        <>
          {/* Today / next class ------------------------------------------ */}
          <Card className="flex flex-col gap-space-sm">
            <CardHeader
              icon="today"
              title="Today"
              subtitle={todayClasses.length ? `${todayClasses.length} class${todayClasses.length === 1 ? '' : 'es'} scheduled` : undefined}
              actions={
                <Link to="/portal/timetable" className="font-label-md text-label-md text-primary hover:underline">
                  Full timetable
                </Link>
              }
            />
            {todayClasses.length === 0 ? (
              <div className="rounded-xl bg-surface-container-low p-space-md">
                <p className="font-body-lg text-body-lg text-on-surface">
                  {enrolmentClosed ? 'No classes are scheduled any more.' : 'No classes today — enjoy the break.'}
                </p>
                {nextClass && (
                  <p className="mt-1 font-body-md text-body-md text-secondary">
                    Next up: {subjectOf(nextClass.batch)} on {formatDayMonth(nextClass.date)} at {formatTime(nextClass.batch.startTime)}.
                  </p>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-space-xs">
                {todayClasses.map((c) => (
                  <li key={c.batch.id}>
                    <ClassRow
                      scheduled={c}
                      now={now}
                      studentId={student.id}
                      subject={subjectOf(c.batch)}
                      faculty={facultyOf(c.batch.facultyId)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Tiles --------------------------------------------------------- */}
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
            {/* Attendance */}
            <Link to="/portal/attendance" className="card flex flex-col gap-space-xs p-space-md transition-shadow hover:shadow-level-2">
              <div className="flex items-start justify-between gap-space-xs">
                <span className="font-label-md text-label-md text-secondary">Attendance · last 30 days</span>
                <Icon name="fact_check" className="text-primary" />
              </div>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-lg text-headline-lg-mobile text-on-surface tnum">{formatPercent(rate30)}</span>
                <PortalAttendanceStatus ratio={rate30} threshold={threshold} />
              </div>
              <ProgressBar
                value={Number.isFinite(rate30) ? rate30 : 0}
                // With nothing to measure, "auto" would paint an alarming red
                // empty track — fall back to the neutral brand track.
                tone={Number.isFinite(rate30) ? 'auto' : 'primary'}
                thresholds={{ danger: threshold / 100, warning: (threshold + 10) / 100 }}
                label="Attendance over the last 30 days"
              />
              <p className="font-body-sm text-body-sm text-secondary">
                {Number.isFinite(rate30)
                  ? `${last30.P + last30.L} of ${last30.P + last30.L + last30.A} classes attended · institute target ${threshold}%`
                  : 'No classes recorded in the last 30 days.'}
              </p>
              {recent10.length > 0 && (
                <div className="mt-space-2xs">
                  <p className="mb-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Last {recent10.length} classes</p>
                  <div className="flex flex-wrap gap-1">
                    {recent10.map((r) => (
                      <MarkChip key={r.session.id} mark={r.mark} size="sm" />
                    ))}
                  </div>
                </div>
              )}
            </Link>

            {/* Latest result */}
            <Link to="/portal/results" className="card flex flex-col gap-space-xs p-space-md transition-shadow hover:shadow-level-2">
              <div className="flex items-start justify-between gap-space-xs">
                <span className="font-label-md text-label-md text-secondary">Latest result</span>
                <Icon name="trending_up" className="text-primary" />
              </div>
              {!latest ? (
                <p className="font-body-md text-body-md text-secondary">No tests yet. {voice.possessive} first result will show up here.</p>
              ) : latest.score == null ? (
                <>
                  <p className="font-title-md text-title-md text-on-surface">{latest.assessment.title}</p>
                  <Badge tone="neutral" icon="event_busy">
                    Absent for this test
                  </Badge>
                  <p className="font-body-sm text-body-sm text-secondary">{formatDayMonth(latest.assessment.date)}</p>
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-space-xs">
                    <span className="font-headline-lg text-headline-lg-mobile text-on-surface tnum">
                      {latest.score}
                      <span className="font-body-md text-body-md text-secondary">/{latest.assessment.maxMarks}</span>
                    </span>
                    <Badge tone={latest.ratio >= 0.6 ? 'success' : latest.ratio >= 0.4 ? 'warning' : 'danger'} icon="workspace_premium">
                      {formatPercent(latest.ratio)} · {gradeBand(latest.ratio)}
                    </Badge>
                  </div>
                  <p className="truncate font-title-md text-title-md text-on-surface" title={latest.assessment.title}>
                    {latest.assessment.title}
                  </p>
                  <p className="font-body-sm text-body-sm text-secondary">
                    {latest.batch ? `${subjectOf(latest.batch)} · ` : ''}
                    {formatDayMonth(latest.assessment.date)}
                  </p>
                  {Number.isFinite(latest.classAverage) && (
                    <p className="font-body-sm text-body-sm text-secondary">
                      Class average {formatPercent(latest.classAverage)} —{' '}
                      <span className={cn('font-semibold', latest.ratio >= latest.classAverage ? 'text-success' : 'text-warning')}>
                        {latest.ratio >= latest.classAverage ? 'above' : 'below'} average
                      </span>
                    </p>
                  )}
                </>
              )}
            </Link>

            {/* Fees — parents only; a student login never sees money. */}
            {isParent && fees && (
              <div className="card flex flex-col gap-space-xs p-space-md">
                <div className="flex items-start justify-between gap-space-xs">
                  <span className="font-label-md text-label-md text-secondary">Fees</span>
                  <Icon name="payments" className="text-primary" />
                </div>
                <div className="flex items-baseline gap-space-xs">
                  <span className="font-headline-lg text-headline-lg-mobile text-on-surface tnum">{money.format(fees.outstanding)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-space-2xs">
                  <FeeStatusBadge status={fees.status} />
                  <span className="font-body-sm text-body-sm text-secondary">
                    {fees.outstanding > 0 ? 'outstanding' : 'nothing due right now'}
                  </span>
                </div>
                <ButtonLink
                  to="/portal/fees"
                  size="md"
                  variant={fees.outstanding > 0 ? 'primary' : 'secondary'}
                  fullWidth
                  className="mt-space-2xs"
                >
                  {fees.outstanding > 0 ? 'Pay now' : 'View fees & receipts'}
                </ButtonLink>
              </div>
            )}

            {/* Syllabus */}
            <Link to="/portal/syllabus" className="card flex flex-col gap-space-xs p-space-md transition-shadow hover:shadow-level-2">
              <div className="flex items-start justify-between gap-space-xs">
                <span className="font-label-md text-label-md text-secondary">Syllabus covered</span>
                <Icon name="menu_book" className="text-primary" />
              </div>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-lg text-headline-lg-mobile text-on-surface tnum">{formatPercent(syllabus.ratio)}</span>
                <span className="font-body-sm text-body-sm text-secondary tnum">
                  {syllabus.done} of {syllabus.total} topics
                </span>
              </div>
              <ProgressBar value={Number.isFinite(syllabus.ratio) ? syllabus.ratio : 0} label="Syllabus covered" />
              <p className="font-body-sm text-body-sm text-secondary">
                {syllabus.studying?.progress.current
                  ? `Currently studying ${syllabus.studying.progress.current.name}`
                  : 'Topic list and progress for every batch.'}
              </p>
            </Link>
          </div>

          {/* Recent updates ------------------------------------------------ */}
          <Card className="flex flex-col gap-space-sm">
            <CardHeader icon="notifications" title="Recent updates" subtitle="Newest first" />
            {updates.length === 0 ? (
              <p className="py-space-md text-center font-body-md text-body-md text-secondary">Nothing new yet.</p>
            ) : (
              <ul className="flex flex-col">
                {updates.map((u) => (
                  <li key={u.id} className="border-b border-outline-variant/30 last:border-0">
                    <Link to={u.to} className="flex min-h-[56px] items-center gap-space-sm py-space-xs">
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                          u.tone === 'alert' ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-primary',
                        )}
                      >
                        <Icon name={u.icon} size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-body-lg text-body-lg text-on-surface">{u.title}</span>
                        {u.detail && <span className="block font-body-sm text-body-sm text-secondary">{u.detail}</span>}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-label-sm text-label-sm text-secondary">{relativeTime(u.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* Quick actions ---------------------------------------------------- */}
      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-space-sm sm:grid-cols-4">
        {[
          { to: '/portal/attendance', icon: 'fact_check', label: 'Attendance' },
          { to: '/portal/results', icon: 'trending_up', label: 'Results' },
          { to: '/portal/syllabus', icon: 'menu_book', label: 'Syllabus' },
          { to: '/portal/timetable', icon: 'calendar_month', label: 'Timetable' },
          ...(isParent ? [{ to: '/portal/fees', icon: 'payments', label: 'Fees' }] : []),
          { to: '/portal/profile', icon: 'person', label: 'Account' },
        ].map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="card flex min-h-[72px] flex-col items-center justify-center gap-space-2xs p-space-sm text-center transition-shadow hover:shadow-level-2"
          >
            <Icon name={a.icon} size={24} className="text-primary" />
            <span className="font-label-md text-label-md text-on-surface">{a.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** One of today's classes: when it runs, where, who teaches it, and its mark. */
function ClassRow({
  scheduled,
  now,
  studentId,
  subject,
  faculty,
}: {
  scheduled: ScheduledClass;
  now: string;
  studentId: string;
  subject: string;
  faculty: string;
}) {
  const { batch, session } = scheduled;
  const mark = session?.records[studentId];
  const running = !mark && batch.startTime <= now && batch.endTime > now;
  const finished = !mark && batch.endTime <= now;

  return (
    <div
      className={cn(
        'flex items-center gap-space-sm rounded-xl p-space-sm',
        running ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-low',
      )}
    >
      <div className="w-[4.5rem] shrink-0">
        <p className={cn('font-label-lg text-label-lg tnum', running ? 'text-on-primary-fixed' : 'text-on-surface')}>
          {formatTime(batch.startTime)}
        </p>
        <p className={cn('font-body-sm text-body-sm tnum', running ? 'opacity-80' : 'text-secondary')}>{formatTime(batch.endTime)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-title-md text-title-md', running ? 'text-on-primary-fixed' : 'text-on-surface')}>{subject}</p>
        <p className={cn('font-body-sm text-body-sm', running ? 'opacity-90' : 'text-secondary')}>
          {batch.name} · Room {batch.room}
        </p>
        <p className={cn('font-body-sm text-body-sm', running ? 'opacity-90' : 'text-secondary')}>{faculty}</p>
        <p className="sr-only">{formatTimeRange(batch.startTime, batch.endTime)}</p>
      </div>
      <div className="shrink-0">
        {mark ? (
          <MarkChip mark={mark} size="md" />
        ) : running ? (
          <Badge tone="surface" icon="play_circle">
            Now
          </Badge>
        ) : finished ? (
          <Badge tone="neutral" icon="hourglass_empty">
            Not marked
          </Badge>
        ) : (
          <Badge tone="secondary" icon="schedule">
            Upcoming
          </Badge>
        )}
      </div>
    </div>
  );
}
