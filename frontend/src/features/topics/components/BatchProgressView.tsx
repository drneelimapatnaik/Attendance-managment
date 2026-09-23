/**
 * Topic Coverage › Batch progress.
 *
 * xl+:  batch list with coverage meters (left) | selected batch syllabus (right),
 *       pace overview under the list.
 * < xl: batch + subject selects on top, syllabus, then the pace overview.
 * The selected batch and subject filter live in the URL (?batch=&subject=).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Batch, ID } from '@/types/domain';
import { ButtonLink, Card, CardHeader, EmptyState, Icon, ProgressBar, SelectField } from '@/components/ui';
import { BarList } from '@/components/charts';
import { useCan, useLookups, useScopedData, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { coverageProgress, type CoverageProgress } from '@/domain/academics';
import { formatPercent, pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { paceFor, type Pace } from '../coverage';
import type { TopicParams } from '../useTopicParams';
import { PaceIndicator } from './PaceIndicator';
import { SyllabusChecklist } from './SyllabusChecklist';

interface Entry {
  batch: Batch;
  progress: CoverageProgress;
  pace: Pace;
}

export function BatchProgressView({
  batchId,
  subjectId,
  topicId,
  patch: patchParams,
}: Pick<TopicParams, 'batchId' | 'subjectId' | 'topicId' | 'patch'>) {
  const can = useCan();
  // Pin the view: a ?subject without ?batch would otherwise default to the master.
  const patch = (changes: Record<string, string | null>) => patchParams({ view: 'progress', ...changes });
  const settings = useSettings();
  const { batches, coverage } = useScopedData();
  const topics = useDataStore((s) => s.topics);
  const subjects = useDataStore((s) => s.subjects);
  const lookups = useLookups();

  const entries = useMemo<Entry[]>(
    () =>
      batches
        .filter((b) => b.status === 'Active' && (!subjectId || b.subjectId === subjectId))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
        .map((batch) => {
          const progress = coverageProgress(batch, topics, coverage);
          return { batch, progress, pace: paceFor(batch, progress, settings) };
        }),
    [batches, subjectId, topics, coverage, settings],
  );

  // A ?batch link may point at a batch outside the current list (other campus,
  // upcoming…) — still show it rather than silently switching.
  const selected = useMemo<Entry | undefined>(() => {
    const inList = entries.find((e) => e.batch.id === batchId);
    if (inList) return inList;
    const linked = batchId ? lookups.batch.get(batchId) : undefined;
    if (linked) {
      const progress = coverageProgress(linked, topics, coverage);
      return { batch: linked, progress, pace: paceFor(linked, progress, settings) };
    }
    return entries[0];
  }, [entries, batchId, lookups.batch, topics, coverage, settings]);

  const select = (id: ID) => patch({ batch: id, topic: null });
  const onTrack = entries.filter((e) => e.pace.state === 'on-track').length;
  // Most-behind first so the overview doubles as a to-do list.
  const overview = useMemo(
    () => [...entries].sort((a, b) => b.pace.behindBy - a.pace.behindBy || a.progress.ratio - b.progress.ratio),
    [entries],
  );

  const subjectFilter = (
    <SelectField
      aria-label="Filter batches by subject"
      value={subjectId}
      onChange={(e) => patch({ subject: e.target.value, batch: null, topic: null })}
      options={[{ value: '', label: 'All subjects' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
    />
  );

  if (!entries.length && !selected) {
    return (
      <Card>
        <EmptyState
          icon="menu_book"
          title={subjectId ? 'No active batches for this subject' : 'No active batches'}
          description="Coverage is tracked per active batch. Create or activate a batch to start."
          action={
            subjectId ? (
              <button
                type="button"
                className="font-label-lg text-label-lg text-primary hover:underline"
                onClick={() => patch({ subject: null })}
              >
                Show all subjects
              </button>
            ) : can('batches.manage') ? (
              <ButtonLink to="/batches" variant="tonal" icon="class">
                Go to batches
              </ButtonLink>
            ) : undefined
          }
        />
      </Card>
    );
  }

  const sel = selected!;
  const selSubject = lookups.subject.get(sel.batch.subjectId);
  const selFaculty = lookups.staff.get(sel.batch.facultyId);

  return (
    <div className="grid gap-space-lg xl:grid-cols-12 xl:items-start">
      {/* Batch list — desktop only */}
      <Card padded={false} className="hidden flex-col xl:col-span-4 xl:flex 2xl:col-span-3">
        <div className="flex flex-col gap-space-sm p-space-md pb-space-sm">
          <CardHeader
            title="Active batches"
            icon="class"
            subtitle={`${onTrack} of ${pluralize(entries.length, 'batch', 'batches')} on pace`}
          />
          {subjectFilter}
        </div>
        <ul className="flex flex-col gap-1 px-space-xs pb-space-xs" aria-label="Batches">
          {entries.map(({ batch: b, progress, pace }) => {
            const active = b.id === sel.batch.id;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => select(b.id)}
                  className={cn(
                    'flex w-full flex-col gap-1.5 rounded-lg px-space-sm py-space-xs text-left transition-colors',
                    active ? 'bg-primary-fixed/50 ring-1 ring-primary/40' : 'hover:bg-surface-container-low',
                  )}
                >
                  <span className="flex items-baseline justify-between gap-space-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-label-lg text-label-lg text-on-surface">{b.name}</span>
                      <span className="ml-1.5 font-body-sm text-body-sm text-secondary">{b.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-label-md text-label-md text-on-surface tnum">
                      {pace.state === 'behind' && <Icon name="schedule" size={14} className="text-warning" label="Behind pace" />}
                      {formatPercent(progress.ratio)}
                    </span>
                  </span>
                  <ProgressBar value={progress.ratio} label={`${b.name} syllabus covered`} />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Selected batch */}
      <div className="flex min-w-0 flex-col gap-space-md xl:col-span-8 xl:row-span-2 2xl:col-span-9">
        <div className="grid grid-cols-1 gap-space-xs sm:grid-cols-2 xl:hidden">
          <SelectField
            aria-label="Batch"
            value={sel.batch.id}
            onChange={(e) => select(e.target.value)}
            options={[
              ...(entries.some((e) => e.batch.id === sel.batch.id)
                ? []
                : [{ value: sel.batch.id, label: `${sel.batch.name} · ${sel.batch.title}` }]),
              ...entries.map(({ batch: b, progress }) => ({
                value: b.id,
                label: `${b.name} · ${b.title} — ${formatPercent(progress.ratio)}`,
              })),
            ]}
          />
          {subjectFilter}
        </div>

        <Card className="flex flex-col gap-space-md">
          <div className="flex flex-col gap-space-sm md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">
                {selSubject?.name} · {sel.batch.grade}
              </p>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                {sel.batch.name} · {sel.batch.title}
              </h2>
              <p className="font-body-sm text-body-sm text-secondary">{selFaculty?.name ?? 'No faculty assigned'}</p>
            </div>
            <Link
              to={`/batches/${sel.batch.id}?tab=syllabus`}
              className="flex shrink-0 items-center gap-0.5 font-label-md text-label-md text-primary hover:underline"
            >
              Batch details
              <Icon name="arrow_forward" size={16} />
            </Link>
          </div>
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-baseline justify-between gap-space-sm">
              <span className="font-headline-md text-headline-md text-on-surface tnum">{formatPercent(sel.progress.ratio)}</span>
              <span className="font-body-sm text-body-sm text-secondary tnum">
                {sel.progress.completed} of {pluralize(sel.progress.total, 'topic')} completed · {sel.progress.inProgress} in progress
              </span>
            </div>
            <ProgressBar size="md" value={sel.progress.ratio} label="Syllabus completed" />
          </div>
          {sel.progress.total > 0 && <PaceIndicator pace={sel.pace} total={sel.progress.total} />}
        </Card>

        <SyllabusChecklist
          batch={sel.batch}
          canManage={can('topics.manage') && sel.batch.status !== 'Archived'}
          highlightTopicId={topicId || undefined}
        />
      </div>

      {/* Pace overview */}
      {entries.length > 1 && (
        <Card className="flex flex-col gap-space-md xl:col-span-4 2xl:col-span-3">
          <CardHeader title="Coverage across batches" icon="leaderboard" subtitle="Most behind pace first" />
          <BarList
            items={overview.map(({ batch: b, progress, pace }) => ({
              id: b.id,
              label: b.name,
              sublabel: pace.state === 'behind' ? `behind by ${pace.behindBy}` : 'on pace',
              value: progress.ratio,
              to: `/topics?view=progress&batch=${b.id}${subjectId ? `&subject=${subjectId}` : ''}`,
            }))}
          />
        </Card>
      )}
    </div>
  );
}
