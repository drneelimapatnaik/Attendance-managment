/**
 * Profile › Performance: headline figures, the student's score % over time
 * against the class average (two series → legend), and every assessment for
 * their batches with score, grade band and the gap to the class average.
 */
import { useMemo } from 'react';
import type { Student } from '@/types/domain';
import { Badge, Card, CardHeader, DataTable, EmptyState, Icon, StatCard, type BadgeTone, type Column } from '@/components/ui';
import { LineChart } from '@/components/charts';
import { gradeBand, type GradeBand } from '@/domain/academics';
import { formatDate, formatDayMonth } from '@/lib/date';
import { formatPercent, pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ScoreRow, StudentProfile } from './useStudentProfile';

interface PerformanceTabProps {
  student: Student;
  profile: StudentProfile;
}

const BAND_TONE: Record<GradeBand, BadgeTone> = { 'A+': 'success', A: 'success', B: 'primary', C: 'info', D: 'warning', E: 'danger' };

const pct = (ratio: number) => (Number.isFinite(ratio) ? Math.round(ratio * 1000) / 10 : null);

/** Signed gap to the class average in percentage points, with a direction icon (never colour alone). */
function VsClass({ row }: { row: ScoreRow }) {
  if (!Number.isFinite(row.ratio) || !Number.isFinite(row.classAverage)) return <span className="text-secondary">—</span>;
  const diff = Math.round((row.ratio - row.classAverage) * 100);
  const up = diff > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 whitespace-nowrap font-label-md text-label-md tnum',
        diff === 0 ? 'text-secondary' : up ? 'text-on-success-container' : 'text-error',
      )}
    >
      <Icon name={diff === 0 ? 'remove' : up ? 'arrow_upward' : 'arrow_downward'} size={14} />
      {diff > 0 ? '+' : ''}
      {diff} pts
    </span>
  );
}

function ScoreCell({ row }: { row: ScoreRow }) {
  if (row.score == null)
    return (
      <Badge tone="neutral" icon="event_busy">
        Absent
      </Badge>
    );
  return (
    <span className="whitespace-nowrap font-label-lg text-label-lg text-on-surface tnum">
      {row.score}
      <span className="font-body-sm text-body-sm text-secondary"> / {row.assessment.maxMarks}</span>
    </span>
  );
}

export function PerformanceTab({ student, profile }: PerformanceTabProps) {
  const { scores, averageScore } = profile;
  const firstName = student.name.split(' ')[0];

  const summary = useMemo(() => {
    const taken = scores.filter((s) => s.score != null);
    const withClass = taken.filter((s) => Number.isFinite(s.classAverage));
    const classAvg = withClass.length ? withClass.reduce((sum, s) => sum + s.classAverage, 0) / withClass.length : NaN;
    const best = taken.reduce<ScoreRow | undefined>((b, s) => (!b || s.ratio > b.ratio ? s : b), undefined);
    const aboveClass = withClass.filter((s) => s.ratio > s.classAverage).length;
    return { taken: taken.length, missed: scores.length - taken.length, classAvg, best, aboveClass, compared: withClass.length };
  }, [scores]);

  // Plot only assessments the student sat: the chart breaks lines at gaps and
  // draws no markers, so an absence would hide the scores around it.
  const chart = useMemo(() => {
    const sat = scores.filter((s) => s.score != null);
    return {
      points: sat,
      labels: sat.map((s) => formatDayMonth(s.assessment.date)),
      series: [
        { id: 'student', label: firstName, values: sat.map((s) => pct(s.ratio)) },
        { id: 'class', label: 'Class average', values: sat.map((s) => pct(s.classAverage)) },
      ],
    };
  }, [scores, firstName]);

  const columns: Column<ScoreRow>[] = [
    {
      key: 'date',
      header: 'Date',
      sortValue: (r) => r.assessment.date,
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface tnum',
      cell: (r) => formatDate(r.assessment.date),
    },
    {
      key: 'title',
      header: 'Assessment',
      sortValue: (r) => r.assessment.title,
      headerClassName: 'min-w-[200px]',
      cell: ({ assessment }) => (
        <>
          <span className="block font-label-lg text-label-lg text-on-surface">{assessment.title}</span>
          <span className="block font-body-sm text-body-sm text-secondary">{assessment.type}</span>
        </>
      ),
    },
    {
      key: 'batch',
      header: 'Batch',
      hideBelow: 'lg',
      sortValue: (r) => r.batch?.name ?? '',
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface-variant',
      cell: (r) => r.batch?.name ?? '—',
    },
    { key: 'score', header: 'Score', align: 'right', sortValue: (r) => r.score ?? -1, cell: (r) => <ScoreCell row={r} /> },
    {
      key: 'pct',
      header: '%',
      align: 'right',
      sortValue: (r) => (Number.isFinite(r.ratio) ? r.ratio : -1),
      className: 'whitespace-nowrap font-label-lg text-label-lg text-on-surface tnum',
      cell: (r) => formatPercent(r.ratio),
    },
    {
      key: 'band',
      header: 'Grade',
      align: 'center',
      cell: (r) => (Number.isFinite(r.ratio) ? <Badge tone={BAND_TONE[gradeBand(r.ratio)]}>{gradeBand(r.ratio)}</Badge> : null),
    },
    {
      key: 'class',
      header: 'Class avg',
      align: 'right',
      sortValue: (r) => (Number.isFinite(r.classAverage) ? r.classAverage : -1),
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface-variant tnum',
      cell: (r) => formatPercent(r.classAverage),
    },
    { key: 'vs', header: 'Vs class', align: 'right', hideBelow: 'xl', cell: (r) => <VsClass row={r} /> },
  ];

  const mobileCard = (r: ScoreRow) => (
    <div className="flex flex-col gap-space-2xs">
      <div className="flex items-start justify-between gap-space-xs">
        <div className="min-w-0">
          <p className="font-label-lg text-label-lg text-on-surface">{r.assessment.title}</p>
          <p className="font-body-sm text-body-sm text-secondary">
            {formatDate(r.assessment.date)} · {r.assessment.type}
            {r.batch && <> · {r.batch.name}</>}
          </p>
        </div>
        {Number.isFinite(r.ratio) && <Badge tone={BAND_TONE[gradeBand(r.ratio)]}>{gradeBand(r.ratio)}</Badge>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-space-xs">
        <span className="flex items-center gap-space-xs">
          <ScoreCell row={r} />
          {Number.isFinite(r.ratio) && <span className="font-body-sm text-body-sm text-secondary tnum">({formatPercent(r.ratio)})</span>}
        </span>
        <span className="flex items-center gap-space-xs font-body-sm text-body-sm text-secondary">
          Class {formatPercent(r.classAverage)}
          <VsClass row={r} />
        </span>
      </div>
    </div>
  );

  if (!scores.length) {
    return (
      <div className="card">
        <EmptyState
          icon="quiz"
          title="No assessments yet"
          description="Scores appear here once tests are recorded for this student's batches."
        />
      </div>
    );
  }

  const avgGap =
    Number.isFinite(averageScore) && Number.isFinite(summary.classAvg) ? Math.round((averageScore - summary.classAvg) * 100) : null;
  const rows = [...scores].reverse(); // newest first for the table

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid grid-cols-2 gap-space-sm md:gap-space-md xl:grid-cols-4">
        <StatCard
          label="Average score"
          icon="school"
          value={formatPercent(averageScore)}
          hint={
            Number.isFinite(averageScore)
              ? `Grade ${gradeBand(averageScore)}${summary.compared ? ` · above class in ${summary.aboveClass}/${summary.compared}` : ''}`
              : 'No scores yet'
          }
        />
        <StatCard
          label="Class average"
          icon="groups"
          value={formatPercent(summary.classAvg)}
          hint={
            avgGap == null
              ? 'Same assessments'
              : avgGap === 0
                ? `${firstName} is level with the class`
                : `${firstName} is ${Math.abs(avgGap)} pts ${avgGap > 0 ? 'above' : 'below'}`
          }
        />
        <StatCard
          label="Best result"
          icon="emoji_events"
          value={summary.best ? formatPercent(summary.best.ratio) : '—'}
          hint={<span className="line-clamp-1">{summary.best?.assessment.title ?? 'No scores yet'}</span>}
        />
        <StatCard
          label="Assessments"
          icon="assignment"
          value={<span className="tnum">{summary.taken}</span>}
          hint={summary.missed ? `${pluralize(summary.missed, 'test')} missed` : 'None missed'}
        />
      </div>

      <Card className="flex flex-col gap-space-md">
        <CardHeader
          title="Score trend"
          icon="show_chart"
          subtitle={`${firstName}'s score % on each assessment taken vs the class average${summary.missed ? ' (missed tests not plotted)' : ''}`}
        />
        {chart.points.length ? (
          <div>
            <LineChart
              labels={chart.labels}
              series={chart.series}
              yMax={100}
              height={240}
              formatValue={(v) => `${Math.round(v)}%`}
              tooltipTitle={(i) => `${chart.points[i].assessment.title} · ${formatDayMonth(chart.points[i].assessment.date)}`}
              ariaLabel={`${student.name}'s assessment scores compared with the class average`}
            />
          </div>
        ) : (
          <EmptyState
            compact
            icon="show_chart"
            title="Nothing to plot yet"
            description={`${firstName} hasn't sat any assessment so far.`}
          />
        )}
      </Card>

      <section className="flex flex-col gap-space-sm" aria-labelledby="assessments-heading">
        <div className="flex items-baseline justify-between gap-space-sm">
          <h2 id="assessments-heading" className="font-title-lg text-title-lg font-bold text-on-surface">
            Assessments
          </h2>
          <span className="font-body-sm text-body-sm text-secondary">{pluralize(scores.length, 'assessment')}</span>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.assessment.id}
          mobileCard={mobileCard}
          entityLabel="assessments"
          caption={`Assessment results for ${student.name}`}
        />
      </section>
    </div>
  );
}
