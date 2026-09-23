/**
 * Student & parent app — Results.
 *
 * Every assessment the student was listed for, newest first: marks out of the
 * maximum, percentage, grade band and how it compares with the class average.
 * Above the list sit the overall average, a trend line of the student against
 * the class, and a per-subject breakdown. Tests the student missed stay in the
 * list (never silently dropped) but are excluded from every average — the page
 * says so in as many words.
 */
import { useMemo } from 'react';
import type { Assessment, Batch } from '@/types/domain';
import { Badge, Card, CardHeader, EmptyState, Icon, ProgressBar, StatCard, type BadgeTone } from '@/components/ui';
import { BarList, LineChart } from '@/components/charts';
import { PASS_MARK, assessmentStats, gradeBand, type GradeBand } from '@/domain/academics';
import { usePortalAccount, usePortalData } from '@/hooks/usePortal';
import { useLookups } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { formatDate, formatDayMonth } from '@/lib/date';
import { formatPercent, pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PortalHeading, PortalNoStudent, PortalNote, PortalNotices } from './components/PortalPageChrome';

const BAND_TONE: Record<GradeBand, BadgeTone> = { 'A+': 'success', A: 'success', B: 'primary', C: 'info', D: 'warning', E: 'danger' };

/** Grade bands double as the meter's thresholds: below D is a fail, below B needs work. */
const METER_THRESHOLDS = { danger: PASS_MARK, warning: 0.6 };

interface ResultRow {
  assessment: Assessment;
  batch?: Batch;
  subjectName: string;
  /** null = the student did not appear. */
  score: number | null;
  ratio: number; // NaN when absent
  classAverage: number; // NaN when nobody appeared
}

/** Chart values are percentages; a gap (absence) is a null so the line breaks. */
const pct = (ratio: number) => (Number.isFinite(ratio) ? Math.round(ratio * 1000) / 10 : null);

/** One line of plain English comparing this score with the rest of the class. */
function VsClass({ row }: { row: ResultRow }) {
  if (!Number.isFinite(row.classAverage))
    return <span className="font-body-sm text-body-sm text-secondary">No class average for this test yet</span>;
  const diff = Math.round((row.ratio - row.classAverage) * 100);
  return (
    <span
      className={cn(
        'flex items-center gap-1 font-body-sm text-body-sm',
        diff === 0 ? 'text-secondary' : diff > 0 ? 'text-on-success-container' : 'text-error',
      )}
    >
      <Icon name={diff === 0 ? 'remove' : diff > 0 ? 'arrow_upward' : 'arrow_downward'} size={16} />
      {diff === 0
        ? `Level with the class average of ${formatPercent(row.classAverage)}`
        : `${Math.abs(diff)} points ${diff > 0 ? 'above' : 'below'} the class average of ${formatPercent(row.classAverage)}`}
    </span>
  );
}

function ResultCard({ row, firstName }: { row: ResultRow; firstName: string }) {
  const { assessment: a } = row;
  const band = row.score == null ? null : gradeBand(row.ratio);
  return (
    <li className="card flex flex-col gap-space-xs p-space-md">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="min-w-0">
          <p className="font-title-md text-title-md text-on-surface">{a.title}</p>
          <p className="font-body-sm text-body-sm text-secondary">
            {a.type} · {formatDate(a.date)}
            {row.batch && ` · ${row.batch.name}`}
          </p>
        </div>
        {band ? (
          <Badge tone={BAND_TONE[band]}>Grade {band}</Badge>
        ) : (
          <Badge tone="neutral" icon="event_busy">
            Missed
          </Badge>
        )}
      </div>

      {row.score == null ? (
        <p className="font-body-md text-body-md text-on-surface-variant">
          {firstName} did not appear for this test, so it is not counted in the average.
          {Number.isFinite(row.classAverage) && ` The class averaged ${formatPercent(row.classAverage)}.`}
        </p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-space-sm">
            <p className="font-headline-sm text-headline-sm text-on-surface tnum">
              {row.score}
              <span className="font-body-md text-body-md text-secondary"> / {a.maxMarks} marks</span>
            </p>
            <p className="font-title-lg text-title-lg text-primary tnum">{formatPercent(row.ratio)}</p>
          </div>
          <ProgressBar value={row.ratio} tone="auto" thresholds={METER_THRESHOLDS} label={`${formatPercent(row.ratio)} in ${a.title}`} />
          <VsClass row={row} />
        </>
      )}
    </li>
  );
}

export default function PortalResultsPage() {
  useDocumentTitle('Results');
  const account = usePortalAccount();
  const { student, assessments, batches } = usePortalData();
  const { subject: subjectMap } = useLookups();
  const firstName = student?.name.split(' ')[0] ?? 'Your child';

  // One row per assessment the student was listed for, newest first.
  const rows = useMemo<ResultRow[]>(() => {
    if (!student) return [];
    const batchById = new Map(batches.map((b) => [b.id, b]));
    return assessments
      .map((a) => {
        const batch = batchById.get(a.batchId);
        const score = a.scores[student.id] ?? null;
        return {
          assessment: a,
          batch,
          subjectName: batch ? (subjectMap.get(batch.subjectId)?.name ?? batch.name) : 'Other',
          score,
          ratio: score == null ? NaN : score / a.maxMarks,
          classAverage: assessmentStats(a).average,
        };
      })
      .sort((x, y) => y.assessment.date.localeCompare(x.assessment.date));
  }, [assessments, batches, subjectMap, student]);

  const summary = useMemo(() => {
    const sat = rows.filter((r) => r.score != null);
    const withClass = sat.filter((r) => Number.isFinite(r.classAverage));
    const average = sat.length ? sat.reduce((s, r) => s + r.ratio, 0) / sat.length : NaN;
    const classAverage = withClass.length ? withClass.reduce((s, r) => s + r.classAverage, 0) / withClass.length : NaN;
    const best = sat.reduce<ResultRow | undefined>((b, r) => (!b || r.ratio > b.ratio ? r : b), undefined);
    return {
      sat,
      missed: rows.filter((r) => r.score == null),
      average,
      classAverage,
      best,
      aboveClass: withClass.filter((r) => r.ratio > r.classAverage).length,
      compared: withClass.length,
    };
  }, [rows]);

  // The chart reads left → right, so it needs the sat assessments oldest first.
  const chart = useMemo(() => {
    const points = [...summary.sat].reverse();
    return {
      points,
      labels: points.map((r) => formatDayMonth(r.assessment.date)),
      series: [
        { id: 'student', label: firstName, values: points.map((r) => pct(r.ratio)) },
        { id: 'class', label: 'Class average', values: points.map((r) => pct(r.classAverage)) },
      ],
    };
  }, [summary.sat, firstName]);

  const bySubject = useMemo(() => {
    const totals = new Map<string, { sum: number; n: number }>();
    for (const r of summary.sat) {
      const entry = totals.get(r.subjectName) ?? { sum: 0, n: 0 };
      entry.sum += r.ratio;
      entry.n++;
      totals.set(r.subjectName, entry);
    }
    return [...totals.entries()]
      .map(([label, e]) => ({
        id: label,
        label,
        sublabel: pluralize(e.n, 'test'),
        value: e.sum / e.n,
        display: formatPercent(e.sum / e.n),
      }))
      .sort((a, b) => b.value - a.value);
  }, [summary.sat]);

  if (!student) return <PortalNoStudent />;

  const gap =
    Number.isFinite(summary.average) && Number.isFinite(summary.classAverage)
      ? Math.round((summary.average - summary.classAverage) * 100)
      : null;

  return (
    <div className="flex flex-col gap-space-lg">
      <PortalHeading title="Results" subtitle={`Every test ${firstName} has been listed for, newest first.`} />
      <PortalNotices account={account} student={student} />

      {!rows.length ? (
        <div className="card">
          <EmptyState
            icon="quiz"
            title="No results yet"
            description={`Marks appear here as soon as the institute records a test for ${firstName}'s batches.`}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-4">
            <StatCard
              label="Overall average"
              icon="school"
              value={formatPercent(summary.average)}
              hint={Number.isFinite(summary.average) ? `Grade ${gradeBand(summary.average)}` : 'No marks yet'}
            />
            <StatCard
              label="Class average"
              icon="groups"
              value={formatPercent(summary.classAverage)}
              hint={
                gap == null
                  ? 'Same tests'
                  : gap === 0
                    ? `${firstName} is level with the class`
                    : `${firstName} is ${Math.abs(gap)} points ${gap > 0 ? 'ahead' : 'behind'}`
              }
            />
            <StatCard
              label="Best result"
              icon="emoji_events"
              value={summary.best ? formatPercent(summary.best.ratio) : '—'}
              hint={<span className="line-clamp-1">{summary.best?.assessment.title ?? 'No marks yet'}</span>}
            />
            <StatCard
              label="Tests taken"
              icon="assignment_turned_in"
              value={<span className="tnum">{summary.sat.length}</span>}
              hint={
                summary.compared
                  ? `Better than the class in ${summary.aboveClass} of ${summary.compared}`
                  : summary.missed.length
                    ? `${pluralize(summary.missed.length, 'test')} missed`
                    : 'None missed'
              }
            />
          </div>

          {summary.missed.length > 0 && (
            <PortalNote icon="event_busy">
              {firstName} missed {pluralize(summary.missed.length, 'test')} —{' '}
              {summary.missed.map((r) => `${r.assessment.title} (${formatDayMonth(r.assessment.date)})`).join(', ')}. Missed tests are
              listed below but are not counted in any average.
            </PortalNote>
          )}

          <Card className="flex flex-col gap-space-md">
            <CardHeader
              title="How marks are trending"
              icon="show_chart"
              subtitle={`${firstName}'s percentage on each test, next to the class average`}
            />
            {chart.points.length > 1 ? (
              <LineChart
                labels={chart.labels}
                series={chart.series}
                yMax={100}
                height={230}
                formatValue={(v) => `${Math.round(v)}%`}
                tooltipTitle={(i) => `${chart.points[i].assessment.title} · ${formatDayMonth(chart.points[i].assessment.date)}`}
                ariaLabel={`${student.name}'s test percentages compared with the class average`}
              />
            ) : (
              <EmptyState
                compact
                icon="show_chart"
                title="Not enough tests to draw a trend"
                description="Once there are two or more results, the line shows whether marks are going up or down."
              />
            )}
          </Card>

          {bySubject.length > 0 && (
            <Card className="flex flex-col gap-space-md">
              <CardHeader title="By subject" icon="menu_book" subtitle="Average percentage in each subject so far" />
              <BarList items={bySubject} threshold={PASS_MARK} thresholdLabel="Below the pass mark" />
            </Card>
          )}

          <section className="flex flex-col gap-space-sm" aria-labelledby="results-heading">
            <div className="flex items-baseline justify-between gap-space-sm">
              <h2 id="results-heading" className="font-title-lg text-title-lg text-on-surface">
                All tests
              </h2>
              <span className="font-body-sm text-body-sm text-secondary">{pluralize(rows.length, 'test')}</span>
            </div>
            <ul className="flex flex-col gap-space-sm">
              {rows.map((r) => (
                <ResultCard key={r.assessment.id} row={r} firstName={firstName} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
