/**
 * Dashboard KPI row — four stat tiles, two per row on phones.
 *
 *  Active students      · admissions this month
 *  Today's attendance   · vs trailing 7-day average, 14-day sparkline
 *  Collected this month · vs the same days last month       } fees.view
 *  Outstanding dues     · students overdue                 }
 *  — or, without fee access —
 *  Classes today        · marked / pending
 *  Syllabus coverage    · topics completed across active batches
 *
 * Delta chips stay short (no period text) so they fit two-up on a 360px
 * phone; the comparison is named in the hint instead.
 */
import { ProgressBar, StatCard } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { useCan, useMoney } from '@/hooks/useTenant';
import { formatPercent, pluralize } from '@/lib/format';
import { formatDayMonth } from '@/lib/date';
import { percentDelta, pointsDelta } from '@/features/attendance/attendanceStats';
import type { DashboardData } from './useDashboardData';

export function KpiRow({ data }: { data: DashboardData }) {
  const can = useCan();
  const money = useMoney();
  const { people, attendance, fees, academics } = data;
  const todayRate = attendance.today?.rate ?? NaN;
  const marked = academics.classesToday.filter((c) => c.session).length;

  return (
    <div className="grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-4">
      <StatCard
        label="Active students"
        icon="groups"
        value={<span className="tnum">{people.active}</span>}
        hint="New this month"
        delta={{ value: `+${people.admittedThisMonth}`, direction: people.admittedThisMonth ? 'up' : 'flat', goodWhen: 'up' }}
        to={can('students.view') ? '/students' : undefined}
      />
      <StatCard
        label="Today's attendance"
        icon="how_to_reg"
        value={<span className="tnum">{formatPercent(todayRate)}</span>}
        hint={
          Number.isFinite(todayRate)
            ? `vs 7-day avg ${formatPercent(attendance.trailingRate)}`
            : `Not marked yet · 7-day avg ${formatPercent(attendance.trailingRate)}`
        }
        delta={pointsDelta(todayRate, attendance.trailingRate)}
        trend={<Sparkline values={attendance.spark} height={28} />}
        to={can('attendance.reports') ? '/reports/attendance?range=7d' : undefined}
      />
      {can('fees.view') ? (
        <>
          <StatCard
            label="Collected this month"
            icon="payments"
            value={<span className="tnum">{money.compact(fees.mtd)}</span>}
            hint={`vs 1–${formatDayMonth(fees.prevCutoff)}`}
            delta={percentDelta(fees.mtd, fees.prevMtd)}
            to="/fees"
          />
          <StatCard
            label="Outstanding dues"
            icon="account_balance_wallet"
            value={<span className="tnum">{money.compact(fees.outstanding)}</span>}
            hint={fees.overdue.length ? `${pluralize(fees.overdue.length, 'student')} overdue` : 'Nobody overdue'}
            to="/fees"
          />
        </>
      ) : (
        <>
          <StatCard
            label="Classes today"
            icon="event_available"
            value={<span className="tnum">{academics.classesToday.length}</span>}
            hint={`${marked} marked · ${academics.classesToday.length - marked} pending`}
            to={can('attendance.mark') ? '/attendance' : undefined}
          />
          <StatCard
            label="Syllabus coverage"
            icon="menu_book"
            value={<span className="tnum">{formatPercent(academics.coverage.ratio)}</span>}
            hint={`${academics.coverage.completed} of ${academics.coverage.total} topics completed`}
            trend={<ProgressBar value={academics.coverage.ratio} label="Syllabus coverage" />}
            to={can('topics.manage') ? '/topics' : undefined}
          />
        </>
      )}
    </div>
  );
}
