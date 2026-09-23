/**
 * Profile › Overview: KPI tiles (30-day attendance, average score,
 * outstanding fees, tenure), the last 12 classes as a lettered strip, the
 * classes coming up this week and the student's recent activity.
 */
import { useMemo } from 'react';
import type { Student } from '@/types/domain';
import { Avatar, ButtonLink, Card, CardHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { FeeStatusBadge } from '@/components/domain';
import { useCan, useCurrentUser, useLookups, useMoney, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { MARK_LABELS, classesOn } from '@/domain/attendance';
import { gradeBand } from '@/domain/academics';
import { addDays, formatDate, formatDayMonth, formatTimeRange, nowTime, relativeTime, tenureLabel, today, weekdayOf } from '@/lib/date';
import { formatPercent, pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { MarkChip, MarkLegend } from '@/components/domain';
import { attendedOf, countedOf, type StudentProfile } from './useStudentProfile';

interface OverviewTabProps {
  student: Student;
  profile: StudentProfile;
}

const RECENT_COUNT = 12;

/**
 * Change vs the previous 30 days as a wrapping text line (icon + signed
 * points), rather than StatCard's delta chip, which is too wide for the
 * two-up tiles on phones.
 */
function TrendNote({ pts }: { pts: number }) {
  const tone = pts > 0 ? 'text-on-success-container' : pts < 0 ? 'text-error' : 'text-secondary';
  return (
    <span className={cn('flex items-center gap-0.5 font-label-sm text-label-sm', tone)}>
      <Icon name={pts > 0 ? 'arrow_upward' : pts < 0 ? 'arrow_downward' : 'remove'} size={12} />
      {pts > 0 ? '+' : ''}
      {pts} pts vs prior 30 days
    </span>
  );
}
const UPCOMING_DAYS = 7;

export function OverviewTab({ student, profile }: OverviewTabProps) {
  const can = useCan();
  const money = useMoney();
  const me = useCurrentUser();
  const { staff } = useLookups();
  const countLate = useSettings().attendance.countLateAsPresent;
  const activity = useDataStore((s) => s.activity);
  const { attendance, batches, sessionRows, scores, averageScore, fee } = profile;

  // Oldest → newest so the strip reads left to right like a timeline.
  const recent = useMemo(() => sessionRows.slice(0, RECENT_COUNT).reverse(), [sessionRows]);
  const multiBatch = new Set(recent.map((r) => r.session.batchId)).size > 1;

  // Timetabled classes for the next 7 days (today's only if not over yet).
  const upcoming = useMemo(() => {
    if (student.status === 'Inactive') return [];
    const t = today();
    const now = nowTime();
    return Array.from({ length: UPCOMING_DAYS }, (_, i) => addDays(t, i)).flatMap((d) =>
      classesOn(d, batches, []).filter((c) => d !== t || c.batch.endTime > now),
    );
  }, [batches, student.status]);

  // Audit entries about this student: profile edits and payments on their invoices.
  const entries = useMemo(() => {
    const invoiceIds = new Set(fee.invoices.map((v) => v.invoice.id));
    return activity
      .filter(
        (a) =>
          a.entity &&
          ((a.entity.type === 'student' && a.entity.id === student.id) || (a.entity.type === 'invoice' && invoiceIds.has(a.entity.id))),
      )
      .slice(0, 8);
  }, [activity, fee.invoices, student.id]);

  const { last30 } = attendance;
  const deltaPts =
    Number.isFinite(attendance.rate30) && Number.isFinite(attendance.ratePrev30)
      ? Math.round((attendance.rate30 - attendance.ratePrev30) * 100)
      : null;
  const taken = scores.filter((s) => s.score != null).length;
  const dayLabel = (d: string) => (d === today() ? 'Today' : d === addDays(today(), 1) ? 'Tomorrow' : weekdayOf(d));

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-4">
        <StatCard
          label="30-day attendance"
          icon="fact_check"
          value={formatPercent(attendance.rate30)}
          hint={
            countedOf(last30) ? (
              <>
                {attendedOf(last30, countLate)}/{countedOf(last30)} classes
                {deltaPts != null && <TrendNote pts={deltaPts} />}
              </>
            ) : (
              'No classes yet'
            )
          }
          to="?tab=attendance"
        />
        {can('performance.view') && (
          <StatCard
            label="Average score"
            icon="school"
            value={formatPercent(averageScore)}
            hint={Number.isFinite(averageScore) ? `Grade ${gradeBand(averageScore)} · ${pluralize(taken, 'test')}` : 'No scores yet'}
            to="?tab=performance"
          />
        )}
        {can('fees.view') && (
          <StatCard
            label="Outstanding fees"
            icon="account_balance_wallet"
            value={<span className="tnum">{money.format(fee.outstanding)}</span>}
            hint={<FeeStatusBadge status={fee.status} />}
            to="?tab=fees"
          />
        )}
        <StatCard
          label="Tenure"
          icon="event_available"
          value={tenureLabel(student.joiningDate).replace(' enrolled', '')}
          hint={`Joined ${formatDate(student.joiningDate)}`}
        />
      </div>

      <div className="grid gap-space-lg xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-space-lg xl:col-span-2">
          <Card className="flex flex-col gap-space-md">
            <CardHeader
              title="Recent attendance"
              icon="history"
              subtitle={`Last ${RECENT_COUNT} classes across all batches`}
              actions={
                <ButtonLink to="?tab=attendance" variant="ghost" size="sm" trailingIcon="chevron_right">
                  Full history
                </ButtonLink>
              }
            />
            {recent.length ? (
              <>
                <ol className="grid grid-cols-6 gap-x-space-xs gap-y-space-sm sm:grid-cols-12">
                  {recent.map((r) => {
                    const label = `${formatDate(r.session.date)} · ${r.batch?.name ?? 'Class'}: ${MARK_LABELS[r.mark]}`;
                    return (
                      <li key={r.session.id} className="flex min-w-0 flex-col items-center gap-1 text-center">
                        <span className="font-label-sm text-label-sm text-secondary" aria-hidden>
                          {weekdayOf(r.session.date)}
                        </span>
                        <MarkChip mark={r.mark} label={label} />
                        <span className="whitespace-nowrap font-body-sm text-body-sm text-on-surface-variant tnum" aria-hidden>
                          {formatDayMonth(r.session.date)}
                        </span>
                        {multiBatch && (
                          <span className="font-label-sm text-label-sm text-secondary" aria-hidden>
                            {r.batch?.code}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <MarkLegend />
              </>
            ) : (
              <EmptyState
                compact
                icon="event_busy"
                title="No classes recorded yet"
                description="Attendance appears here once a roll call is taken."
              />
            )}
          </Card>

          <Card className="flex flex-col gap-space-sm">
            <CardHeader title="Recent activity" icon="manage_history" subtitle="Profile changes and payments" />
            {entries.length ? (
              <ul className="divide-y divide-surface-container-low">
                {entries.map((a) => {
                  const actor = staff.get(a.actorId);
                  return (
                    <li key={a.id} className="flex items-start gap-space-sm py-space-sm">
                      <Avatar name={actor?.name ?? 'System'} src={actor?.avatarUrl} size="sm" />
                      <p className="min-w-0 flex-1 font-body-md text-body-md text-on-surface">
                        <span className="font-semibold">{a.actorId === me?.id ? 'You' : (actor?.name ?? 'System')}</span> {a.action}
                      </p>
                      <time dateTime={a.at} className="shrink-0 whitespace-nowrap font-body-sm text-body-sm text-secondary">
                        {relativeTime(a.at)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                icon="history_toggle_off"
                title="No recent activity"
                description="Profile edits and payments for this student will show up here."
              />
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-space-lg">
          <Card className="flex flex-col gap-space-sm">
            <CardHeader title="This week" icon="event_upcoming" subtitle={`Classes in the next ${UPCOMING_DAYS} days`} />
            {upcoming.length ? (
              <ul className="flex flex-col gap-space-xs">
                {upcoming.slice(0, 6).map((c) => (
                  <li
                    key={`${c.batch.id}-${c.date}`}
                    className="flex items-center gap-space-sm rounded-lg bg-surface-container-low p-space-xs"
                  >
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-container-lowest">
                      <span className="font-label-sm text-label-sm text-primary">{weekdayOf(c.date)}</span>
                      <span className="font-title-md text-title-md leading-none text-on-surface tnum">{Number(c.date.slice(8))}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-label-lg text-label-lg text-on-surface">
                        {c.batch.name} · {c.batch.title}
                      </p>
                      <p className="truncate font-body-sm text-body-sm text-secondary">
                        {dayLabel(c.date)} · {formatTimeRange(c.batch.startTime, c.batch.endTime)}
                      </p>
                      <p className="truncate font-body-sm text-body-sm text-secondary">
                        {c.batch.room}
                        {staff.get(c.batch.facultyId) && <> · {staff.get(c.batch.facultyId)!.name}</>}
                      </p>
                    </div>
                  </li>
                ))}
                {upcoming.length > 6 && (
                  <li className="px-space-xs font-body-sm text-body-sm text-secondary">+{upcoming.length - 6} more this week</li>
                )}
              </ul>
            ) : (
              <EmptyState
                compact
                icon="event_available"
                title="No classes scheduled"
                description={
                  student.status === 'Inactive'
                    ? 'Inactive students are off the timetable.'
                    : 'Nothing on the timetable for the next 7 days.'
                }
              />
            )}
          </Card>

          {student.notes && (
            <Card className="flex flex-col gap-space-xs">
              <h2 className="flex items-center gap-space-2xs font-title-lg text-title-lg font-bold text-on-surface">
                <Icon name="sticky_note_2" className="text-primary" />
                Notes
              </h2>
              <p className="whitespace-pre-line font-body-md text-body-md text-on-surface-variant">{student.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
