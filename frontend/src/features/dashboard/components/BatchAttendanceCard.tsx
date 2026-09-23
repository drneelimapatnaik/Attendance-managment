/**
 * Attendance by batch over the last 30 days, highest first. Batches below
 * the tenant threshold are flagged (red bar + warning icon). Each row opens
 * that batch's attendance report (or the batch page without report access).
 */
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui';
import { BarList } from '@/components/charts';
import { useCan } from '@/hooks/useTenant';
import type { BatchRate } from './useDashboardData';

interface BatchAttendanceCardProps {
  rows: BatchRate[];
  threshold: number;
  className?: string;
}

export function BatchAttendanceCard({ rows, threshold, className }: BatchAttendanceCardProps) {
  const can = useCan();
  const below = rows.filter((r) => Number.isFinite(r.rate) && r.rate * 100 < threshold).length;
  return (
    <Card className={className}>
      <CardHeader
        title="Batch attendance"
        icon="leaderboard"
        subtitle="Last 30 days"
        actions={
          below > 0 ? (
            <Badge tone="danger" icon="warning">
              {below} below {threshold}%
            </Badge>
          ) : rows.length ? (
            <Badge tone="success" icon="check_circle">
              All above {threshold}%
            </Badge>
          ) : undefined
        }
      />
      {rows.length ? (
        <BarList
          className="mt-space-md"
          threshold={threshold / 100}
          thresholdLabel={`Below ${threshold}%`}
          items={rows.map((r) => ({
            id: r.batch.id,
            label: r.batch.name,
            sublabel: r.batch.title,
            value: r.rate,
            to: can('attendance.reports') ? `/reports/attendance?batch=${r.batch.id}` : `/batches/${r.batch.id}`,
          }))}
        />
      ) : (
        <EmptyState compact icon="leaderboard" title="No sessions yet" description="Batch attendance appears once classes are marked." />
      )}
    </Card>
  );
}
