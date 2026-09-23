/**
 * Daily attendance % line chart shared by the dashboard and the reports:
 * one point per class day, the tenant's low-attendance threshold as a
 * reference line, a y-axis floor low enough to show the data but high
 * enough that day-to-day movement is visible, and weekday-aware tooltips.
 */
import { LineChart } from '@/components/charts';
import { formatDayMonth, weekdayOf } from '@/lib/date';
import type { DailyPoint } from '../attendanceStats';

interface AttendanceTrendChartProps {
  points: DailyPoint[];
  threshold: number; // %
  height?: number;
  ariaLabel: string;
}

export function AttendanceTrendChart({ points, threshold, height = 220, ariaLabel }: AttendanceTrendChartProps) {
  const values = points.map((p) => (Number.isFinite(p.rate) ? Math.round(p.rate * 1000) / 10 : null));
  const lowest = Math.min(100, ...values.filter((v): v is number => v != null));
  // 40% unless the data dips lower, then the next 20% step down (keeps ticks on round numbers).
  const yMin = Math.min(40, Math.floor(lowest / 20) * 20);
  return (
    <LineChart
      labels={points.map((p) => formatDayMonth(p.date))}
      series={[{ id: 'attendance', label: 'Attendance', values }]}
      height={height}
      yMax={100}
      yMin={yMin}
      formatValue={(v) => `${Math.round(v)}%`}
      tooltipTitle={(i) => `${weekdayOf(points[i].date)}, ${formatDayMonth(points[i].date)} · ${points[i].counts.total} marks`}
      reference={{ value: threshold, label: `${threshold}% threshold` }}
      ariaLabel={ariaLabel}
    />
  );
}
