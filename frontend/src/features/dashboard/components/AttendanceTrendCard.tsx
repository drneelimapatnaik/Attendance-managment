/**
 * Attendance trend: daily attendance % over the last 30 days (class days
 * only) with the tenant's low-attendance threshold as a reference line,
 * plus today's Present / Late / Absent / Excused composition.
 */
import { ButtonLink, Card, CardHeader } from '@/components/ui';
import { StackedBar } from '@/components/charts';
import { useCan } from '@/hooks/useTenant';
import { formatPercent } from '@/lib/format';
import { AttendanceTrendChart } from '@/features/attendance/components/AttendanceTrendChart';
import { compositionSegments } from '@/features/attendance/components/markStyles';
import type { DashboardData } from './useDashboardData';

interface AttendanceTrendCardProps {
  attendance: DashboardData['attendance'];
  threshold: number;
  className?: string;
}

export function AttendanceTrendCard({ attendance, threshold, className }: AttendanceTrendCardProps) {
  const can = useCan();
  const { trend, today } = attendance;

  return (
    <Card className={className}>
      <CardHeader
        title="Attendance trend"
        icon="show_chart"
        subtitle="Daily attendance · last 30 days (class days)"
        actions={
          <div className="text-right">
            <p className="font-headline-sm text-headline-sm text-on-surface tnum">{formatPercent(attendance.overall)}</p>
            <p className="font-body-sm text-body-sm text-secondary">30-day average</p>
          </div>
        }
      />
      <div className="mt-space-md">
        {trend.length ? (
          <AttendanceTrendChart points={trend} threshold={threshold} ariaLabel="Daily attendance percentage over the last 30 days" />
        ) : (
          <p className="py-space-xl text-center font-body-md text-body-md text-secondary">No attendance recorded in the last 30 days.</p>
        )}
      </div>
      <div className="mt-space-md border-t border-outline-variant/30 pt-space-md">
        <div className="mb-space-xs flex items-center justify-between gap-space-xs">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Today so far</span>
          {can('attendance.reports') && (
            <ButtonLink to="/reports/attendance" size="sm" variant="ghost" trailingIcon="arrow_forward">
              Full report
            </ButtonLink>
          )}
        </div>
        {today ? (
          <StackedBar
            segments={compositionSegments(today.counts)}
            ariaLabel={`Today's attendance: ${today.counts.P} present, ${today.counts.L} late, ${today.counts.A} absent, ${today.counts.E} excused`}
          />
        ) : (
          <p className="font-body-sm text-body-sm text-secondary">No classes have been marked yet today.</p>
        )}
      </div>
    </Card>
  );
}
