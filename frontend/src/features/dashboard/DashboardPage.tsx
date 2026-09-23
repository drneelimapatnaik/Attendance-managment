/**
 * Dashboard — the landing screen for every role.
 *
 * Content adapts to permissions: fee KPIs, the fee chart and overdue alerts
 * need fees.view (others see classes-today / syllabus KPIs instead); the
 * roll-call CTA needs attendance.mark.
 *
 * Layout (xl): KPI row, then a 12-column grid — main column (8) with today's
 * schedule, the attendance trend, fee collection and recent activity; side
 * column (4) with the fast-attendance CTA, alerts and batch attendance.
 * Below xl everything stacks (side cards go two-up on tablets) and the
 * activity feed moves to the end.
 */
import { Button, ButtonLink, PageHeader } from '@/components/ui';
import { useCan, useCurrentUser } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { useUiStore } from '@/store/uiStore';
import { formatLongDate } from '@/lib/date';
import { FastAttendanceCard } from '@/features/attendance/components/FastAttendanceCard';
import { AlertsCard } from './components/AlertsCard';
import { AttendanceTrendCard } from './components/AttendanceTrendCard';
import { BatchAttendanceCard } from './components/BatchAttendanceCard';
import { FeeCollectionCard } from './components/FeeCollectionCard';
import { KpiRow } from './components/KpiRow';
import { RecentActivity } from './components/RecentActivity';
import { TodaySchedule } from './components/TodaySchedule';
import { useDashboardData } from './components/useDashboardData';

/** "Dr. Neelima Patnaik" → "Neelima"; "Prof. K. Sen" → "Sen" (titles and initials skipped). */
function firstName(fullName: string): string {
  const parts = fullName
    .replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '')
    .split(/\s+/)
    .filter((p) => p && !/^[A-Z]\.?$/i.test(p));
  return parts[0] ?? fullName;
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const can = useCan();
  const user = useCurrentUser();
  const openModal = useUiStore((s) => s.openModal);
  const data = useDashboardData();
  const hello = greeting(new Date().getHours());

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Overview"
        title={user ? `${hello}, ${firstName(user.name)}` : hello}
        meta={formatLongDate(data.today)}
        actions={
          <>
            {can('students.manage') && (
              <Button variant="tonal" icon="person_add" onClick={() => openModal({ type: 'student-form' })}>
                Add Student
              </Button>
            )}
            {can('fees.collect') && (
              <Button variant="tonal" icon="payments" onClick={() => openModal({ type: 'record-payment' })}>
                Record Payment
              </Button>
            )}
            {can('attendance.mark') && (
              <ButtonLink to="/attendance" icon="fact_check" className="order-first sm:order-none">
                Mark Attendance
              </ButtonLink>
            )}
          </>
        }
      />

      <KpiRow data={data} />

      <div className="grid grid-cols-1 gap-space-lg xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-space-lg xl:col-span-8">
          <TodaySchedule entries={data.academics.classesToday} today={data.today} />
          <AttendanceTrendCard attendance={data.attendance} threshold={data.threshold} />
          {can('fees.view') && <FeeCollectionCard months={data.fees.months} />}
          <RecentActivity className="hidden xl:block" />
        </div>
        <div className="grid min-w-0 grid-cols-1 content-start items-start gap-space-lg md:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          {can('attendance.mark') && (
            <div className="md:col-span-2 xl:col-span-1">
              <FastAttendanceCard />
            </div>
          )}
          <AlertsCard low={data.attendance.low} streaks={data.attendance.streaks} overdue={data.fees.overdue} threshold={data.threshold} />
          <BatchAttendanceCard rows={data.attendance.byBatch} threshold={data.threshold} />
          {/* Below xl the feed closes the page after the side cards. */}
          <RecentActivity className="md:col-span-2 xl:hidden" />
        </div>
      </div>
    </div>
  );
}
