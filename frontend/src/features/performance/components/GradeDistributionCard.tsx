/**
 * Grade distribution: how many current students fall in each band (A+ … E),
 * using each student's average across the filtered assessments.
 */
import { ColumnChart } from '@/components/charts';
import { Card, CardHeader, EmptyState } from '@/components/ui';
import type { GradeBand } from '@/domain/academics';
import { formatPercent } from '@/lib/format';
import { GRADE_BANDS, GRADE_RANGE } from '../gradeBands';

interface Props {
  counts: Record<GradeBand, number>;
}

export function GradeDistributionCard({ counts }: Props) {
  const total = GRADE_BANDS.reduce((s, b) => s + counts[b], 0);
  return (
    <Card className="flex min-w-0 flex-col gap-space-md">
      <CardHeader title="Grade distribution" icon="leaderboard" subtitle={`${total} students by average score`} />
      {total ? (
        <ColumnChart
          valueLabel="Students"
          ariaLabel="Students per grade band"
          height={240}
          data={GRADE_BANDS.map((band) => ({
            label: band,
            value: counts[band],
            details: [
              { label: 'Score range', value: GRADE_RANGE[band] },
              { label: 'Share of students', value: formatPercent(counts[band] / total) },
            ],
          }))}
        />
      ) : (
        <EmptyState
          compact
          icon="leaderboard"
          title="No scores yet"
          description="Record an assessment to see how students are distributed."
        />
      )}
    </Card>
  );
}
