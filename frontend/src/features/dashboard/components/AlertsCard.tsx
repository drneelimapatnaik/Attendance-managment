/**
 * Alerts: the students who need a call today.
 *  - attendance below the tenant threshold (last 30 days, min. 4 sessions)
 *  - 3+ consecutive absences in a batch
 *  - largest overdue fee balances (fees.view only)
 * Each row opens the student's profile; section footers link to the full list.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Badge, Card, CardHeader, Icon } from '@/components/ui';
import { AttendancePctBadge } from '@/components/domain';
import { useCan, useMoney } from '@/hooks/useTenant';
import { pluralize } from '@/lib/format';
import type { Student } from '@/types/domain';
import type { StudentAttendanceRow } from '@/features/attendance/attendanceStats';
import type { OverdueAlert, StreakAlert } from './useDashboardData';

const LIMIT = 4;

interface AlertsCardProps {
  low: StudentAttendanceRow[];
  streaks: StreakAlert[];
  overdue: OverdueAlert[];
  threshold: number;
  className?: string;
}

function StudentAlertRow({ student, subtitle, trailing }: { student: Student; subtitle: string; trailing: ReactNode }) {
  return (
    <li>
      <Link
        to={`/students/${student.id}`}
        className="-mx-space-xs flex items-center gap-space-xs rounded-lg px-space-xs py-1.5 transition-colors hover:bg-surface-container-low"
      >
        <Avatar name={student.name} src={student.photoUrl} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-label-lg text-label-lg text-on-surface">{student.name}</span>
          <span className="block truncate font-body-sm text-body-sm text-secondary">{subtitle}</span>
        </span>
        <span className="shrink-0">{trailing}</span>
      </Link>
    </li>
  );
}

function Section({
  icon,
  title,
  count,
  empty,
  more,
  children,
}: {
  icon: string;
  title: string;
  count: number;
  empty: string;
  more?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-space-2xs">
      <h3 className="flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
        <Icon name={icon} size={16} className="text-primary" />
        {title}
        <span className="ml-auto rounded-full bg-surface-container-high px-1.5 py-0.5 text-on-surface tnum">{count}</span>
      </h3>
      {count === 0 ? (
        <p className="flex items-center gap-1 py-1 font-body-sm text-body-sm text-secondary">
          <Icon name="check_circle" size={16} className="text-success" />
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col">{children}</ul>
      )}
      {count > LIMIT &&
        (more ? (
          <Link to={more.to} className="w-fit py-1 font-label-md text-label-md text-primary hover:underline">
            {more.label}
          </Link>
        ) : (
          <p className="py-1 font-body-sm text-body-sm text-secondary">+{count - LIMIT} more</p>
        ))}
    </section>
  );
}

export function AlertsCard({ low, streaks, overdue, threshold, className }: AlertsCardProps) {
  const can = useCan();
  const money = useMoney();
  const total = low.length + streaks.length + (can('fees.view') ? overdue.length : 0);
  return (
    <Card className={className}>
      <CardHeader
        title="Alerts"
        icon="notification_important"
        subtitle="Students who need a follow-up"
        actions={
          total > 0 ? (
            <Badge tone="danger" icon="priority_high">
              {total}
            </Badge>
          ) : undefined
        }
      />
      <div className="mt-space-md flex flex-col gap-space-md">
        <Section
          icon="trending_down"
          title={`Below ${threshold}% attendance`}
          count={low.length}
          empty={`Everyone is at or above ${threshold}% this month.`}
          more={can('attendance.reports') ? { to: '/reports/attendance?below=1', label: `View all ${low.length}` } : undefined}
        >
          {low.slice(0, LIMIT).map((r) => (
            <StudentAlertRow
              key={r.student.id}
              student={r.student}
              subtitle={`${r.counts.A} absent of ${pluralize(r.counts.P + r.counts.L + r.counts.A, 'session')} · 30 days`}
              trailing={<AttendancePctBadge ratio={r.rate} threshold={threshold} />}
            />
          ))}
        </Section>
        <Section icon="event_busy" title="Consecutive absences" count={streaks.length} empty="No one has missed 3 classes in a row.">
          {streaks.slice(0, LIMIT).map((s) => (
            <StudentAlertRow
              key={`${s.student.id}-${s.batch.id}`}
              student={s.student}
              subtitle={`${s.batch.name} · ${s.batch.title}`}
              trailing={
                <Badge tone="danger" icon="warning">
                  {s.streak} in a row
                </Badge>
              }
            />
          ))}
        </Section>
        {can('fees.view') && (
          <Section
            icon="receipt_long"
            title="Overdue fees"
            count={overdue.length}
            empty="No overdue invoices."
            more={{ to: '/fees', label: `View all ${overdue.length}` }}
          >
            {overdue.slice(0, LIMIT).map((o) => (
              <StudentAlertRow
                key={o.student.id}
                student={o.student}
                subtitle={`${o.daysOverdue} days overdue · ${o.student.guardian.name}`}
                trailing={<span className="font-label-lg text-label-lg text-error tnum">{money.format(o.fee.overdue)}</span>}
              />
            ))}
          </Section>
        )}
      </div>
    </Card>
  );
}
