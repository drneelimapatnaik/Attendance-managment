/**
 * Record / edit an assessment. Opened globally via
 * `openModal({ type: 'assessment-form', batchId?, assessmentId? })`.
 *
 * Details (batch, title, type, date, max marks) → topics covered (chips from
 * the batch syllabus) → a score grid for the batch's roll on that date: marks
 * or "Absent" per student, with a live class average. Enter jumps to the next
 * student's marks so a teacher can type a whole sheet without the mouse.
 *
 * Until the user edits them, title, max marks and topics follow smart
 * defaults (derived, not stored): "<Type> <n> · <chapter>", the usual max for
 * the type, and the topics taught since the batch's previous assessment.
 */
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssessmentType, ID, Student } from '@/types/domain';
import { Button, Checkbox, EmptyState, Icon, Modal, SegmentedControl, SelectField, TextField, type Segment } from '@/components/ui';
import { PersonCell } from '@/components/domain';
import { useCan, useLookups, useScopedData } from '@/hooks/useTenant';
import { useDataStore, type AssessmentInput } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { syllabusFor } from '@/domain/academics';
import { rollFor } from '@/domain/attendance';
import { formatDate, today } from '@/lib/date';
import { cn } from '@/lib/cn';
import { pct } from './gradeBands';
import { ASSESSMENT_TYPES, TYPE_ICON } from './usePerformance';

export interface AssessmentFormModalProps {
  open: boolean;
  onClose: () => void;
  batchId?: string;
  assessmentId?: string;
}

interface ScoreEntry {
  value: string;
  absent: boolean;
}

type Errors = Partial<Record<'batch' | 'title' | 'date' | 'maxMarks' | 'roll' | 'scores', string>>;

/** Typical maximum marks per type (matches how the institute sets papers). */
const DEFAULT_MAX: Record<AssessmentType, number> = { Quiz: 20, 'Unit Test': 50, Assignment: 25, 'Mock Exam': 100 };

const TYPE_SEGMENTS: Segment<AssessmentType>[] = ASSESSMENT_TYPES.map((t) => ({ value: t, label: t, icon: TYPE_ICON[t] }));

const EMPTY_ENTRY: ScoreEntry = { value: '', absent: false };

/** Validate one student's marks; undefined when fine. */
function scoreError(entry: ScoreEntry | undefined, max: number): string | undefined {
  if (entry?.absent) return undefined;
  const raw = entry?.value.trim() ?? '';
  if (!raw) return 'Enter marks or tick Absent.';
  const v = Number(raw);
  if (!Number.isFinite(v)) return 'Enter a number.';
  if (v < 0 || v > max) return `Marks must be between 0 and ${max}.`;
  if (Math.round(v * 100) / 100 !== v) return 'Use at most two decimals.';
  return undefined;
}

function SectionTitle({ icon, children, trailing }: { icon: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mb-space-sm flex flex-wrap items-center justify-between gap-space-xs">
      <h3 className="flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
        <Icon name={icon} size={16} className="text-primary" />
        {children}
      </h3>
      {trailing}
    </div>
  );
}

export default function AssessmentFormModal({ open, onClose, batchId, assessmentId }: AssessmentFormModalProps) {
  const can = useCan();
  const navigate = useNavigate();
  const toast = useToast();
  const lookups = useLookups();
  const { batches, sessions, assessments } = useScopedData();
  const allStudents = useDataStore((s) => s.students);
  const topics = useDataStore((s) => s.topics);
  const existing = useDataStore((s) => (assessmentId ? s.assessments.find((a) => a.id === assessmentId) : undefined));
  const addAssessment = useDataStore((s) => s.addAssessment);
  const updateAssessment = useDataStore((s) => s.updateAssessment);

  const batchChoices = useMemo(
    () => batches.filter((b) => b.status === 'Active' || b.id === existing?.batchId).sort((a, b) => a.code.localeCompare(b.code)),
    [batches, existing?.batchId],
  );

  const [selectedBatchId, setSelectedBatchId] = useState<ID>(
    () =>
      existing?.batchId ??
      (batchId && batchChoices.some((b) => b.id === batchId) ? batchId : batchChoices.length === 1 ? batchChoices[0].id : ''),
  );
  const [type, setType] = useState<AssessmentType>(existing?.type ?? 'Unit Test');
  const [date, setDate] = useState(existing?.date ?? today());
  // null = "follow the suggestion" until the user edits the field.
  const [titleInput, setTitleInput] = useState<string | null>(existing?.title ?? null);
  const [maxInput, setMaxInput] = useState<string | null>(existing ? String(existing.maxMarks) : null);
  const [topicInput, setTopicInput] = useState<ID[] | null>(existing?.topicIds ?? null);
  const [scores, setScores] = useState<Record<ID, ScoreEntry>>(() =>
    existing
      ? Object.fromEntries(Object.entries(existing.scores).map(([id, v]) => [id, { value: v == null ? '' : String(v), absent: v == null }]))
      : {},
  );
  const [errors, setErrors] = useState<Errors>({});
  const [rowErrors, setRowErrors] = useState<Record<ID, string>>({});
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const batch = lookups.batch.get(selectedBatchId);
  const syllabus = useMemo(() => (batch ? syllabusFor(batch, topics) : []), [batch, topics]);

  // The batch's latest assessment before this date (other than the one being edited).
  const previous = useMemo(
    () =>
      assessments
        .filter((a) => a.batchId === selectedBatchId && a.id !== existing?.id && a.date < date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .pop(),
    [assessments, selectedBatchId, existing?.id, date],
  );

  // Topics taught in class since that assessment, in syllabus order.
  const suggestedTopics = useMemo(() => {
    if (!batch) return [];
    const since = previous?.date ?? '';
    const taught = new Set(sessions.filter((s) => s.batchId === batch.id && s.date > since && s.date <= date).flatMap((s) => s.topicIds));
    return syllabus.filter((t) => taught.has(t.id)).map((t) => t.id);
  }, [batch, previous, sessions, syllabus, date]);

  const suggestedTitle = useMemo(() => {
    const n = assessments.filter((a) => a.batchId === selectedBatchId && a.type === type && a.id !== existing?.id).length + 1;
    const chapter = lookups.topic.get(suggestedTopics[0])?.chapter.split('· ')[1];
    return `${type} ${n}${chapter ? ` · ${chapter}` : ''}`;
  }, [assessments, selectedBatchId, type, existing?.id, suggestedTopics, lookups.topic]);

  const title = titleInput ?? suggestedTitle;
  const maxText = maxInput ?? String(DEFAULT_MAX[type]);
  const maxMarks = Number(maxText);
  const maxValid = Number.isFinite(maxMarks) && maxMarks > 0 && maxMarks <= 1000;
  const topicIds = topicInput ?? suggestedTopics;

  // Who sits the paper: the roll on that date, plus anyone already scored when editing.
  const roll = useMemo<Student[]>(() => {
    if (!batch) return [];
    const base = rollFor(batch, allStudents, date);
    if (!existing || existing.batchId !== batch.id) return base;
    const onRoll = new Set(base.map((s) => s.id));
    const extra = Object.keys(existing.scores)
      .filter((id) => !onRoll.has(id))
      .map((id) => lookups.student.get(id))
      .filter((s): s is Student => !!s);
    return [...base, ...extra].sort((a, b) => a.name.localeCompare(b.name));
  }, [batch, allStudents, date, existing, lookups.student]);

  const live = useMemo(() => {
    let sum = 0;
    let appeared = 0;
    let absent = 0;
    let pending = 0;
    for (const s of roll) {
      const entry = scores[s.id];
      if (entry?.absent) absent++;
      else if (!entry?.value.trim()) pending++;
      else if (maxValid && !scoreError(entry, maxMarks)) {
        sum += Number(entry.value);
        appeared++;
      }
    }
    return { average: appeared ? sum / appeared / maxMarks : NaN, appeared, absent, pending };
  }, [roll, scores, maxMarks, maxValid]);

  /* ------------------------------------------------------------ Handlers */

  const changeBatch = (id: ID) => {
    setSelectedBatchId(id);
    setScores({});
    setTopicInput(null);
    setRowErrors({});
    setErrors((e) => ({ ...e, batch: undefined, roll: undefined, scores: undefined }));
  };

  const patchScore = (id: ID, patch: Partial<ScoreEntry>) => {
    setScores((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_ENTRY), ...patch } }));
    if (rowErrors[id]) setRowErrors(({ [id]: _cleared, ...rest }) => rest);
  };

  const markRestAbsent = () =>
    setScores((prev) => {
      const next = { ...prev };
      for (const s of roll) if (!next[s.id]?.value.trim() && !next[s.id]?.absent) next[s.id] = { value: '', absent: true };
      return next;
    });

  const toggleTopic = (id: ID) => setTopicInput(topicIds.includes(id) ? topicIds.filter((t) => t !== id) : [...topicIds, id]);

  // Enter → next enabled marks box; after the last one, the Save button.
  const onScoreKey = (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = inputs.current.slice(index + 1).find((el) => el && !el.disabled);
    if (next) next.focus();
    else document.getElementById('assessment-save')?.focus();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    const rowErrs: Record<ID, string> = {};
    if (!batch) errs.batch = 'Choose a batch.';
    if (title.trim().length < 2) errs.title = 'Give the assessment a title.';
    if (!date) errs.date = 'Date is required.';
    else if (date > today()) errs.date = 'The date cannot be in the future.';
    else if (batch && date < batch.startDate) errs.date = `${batch.name} started on ${formatDate(batch.startDate)}.`;
    if (!maxValid) errs.maxMarks = 'Max marks must be between 1 and 1000.';
    if (batch && !roll.length) errs.roll = `No students were on ${batch.name}'s roll on ${formatDate(date)}.`;
    if (maxValid) {
      for (const s of roll) {
        const err = scoreError(scores[s.id], maxMarks);
        if (err) rowErrs[s.id] = err;
      }
    }
    const bad = Object.keys(rowErrs).length;
    if (bad) errs.scores = `${bad} student${bad === 1 ? '' : 's'} need marks or “Absent”.`;
    setErrors(errs);
    setRowErrors(rowErrs);
    if (Object.keys(errs).length || !batch) {
      // Take the teacher straight to the first incomplete row.
      const first = roll.findIndex((s) => rowErrs[s.id]);
      if (first >= 0 && !errs.batch && !errs.title && !errs.date && !errs.maxMarks) inputs.current[first]?.focus();
      return;
    }

    const payload: AssessmentInput = {
      batchId: batch.id,
      title: title.trim(),
      type,
      date,
      maxMarks,
      topicIds,
      scores: Object.fromEntries(roll.map((s) => [s.id, scores[s.id]?.absent ? null : Number(scores[s.id].value)])),
    };
    const summary = `${payload.title} · ${batch.name} · class average ${pct(live.average)}`;
    if (existing) {
      updateAssessment(existing.id, payload);
      toast({ title: 'Assessment updated', description: summary });
    } else {
      addAssessment(payload);
      toast({
        title: 'Assessment recorded',
        description: summary,
        action: { label: 'View results', onClick: () => navigate(`/reports/performance?batch=${batch.id}`) },
      });
    }
    onClose();
  };

  /* ------------------------------------------------------------ Render */

  if (!can('performance.manage')) {
    return (
      <Modal open={open} onClose={onClose} size="sm" title="Record Assessment">
        <EmptyState
          compact
          icon="lock"
          title="You can't record assessments"
          description="Your role doesn't include managing test scores."
        />
      </Modal>
    );
  }
  if (assessmentId && !existing) {
    return (
      <Modal open={open} onClose={onClose} size="sm" title="Edit Assessment">
        <EmptyState compact icon="assignment_late" title="Assessment not found" description="It may have been deleted." />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={existing ? `Edit ${existing.title}` : 'Record Assessment'}
      description={
        existing
          ? `${batch?.name ?? ''} · ${formatDate(existing.date)}`
          : 'Test details, topics covered and every student’s marks in one go.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button id="assessment-save" type="submit" form="assessment-form" icon="save">
            {existing ? 'Save changes' : 'Save assessment'}
          </Button>
        </>
      }
    >
      <form id="assessment-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-space-lg">
        <section>
          <SectionTitle icon="assignment">Details</SectionTitle>
          <div className="grid gap-space-sm sm:grid-cols-2">
            <SelectField
              label="Batch"
              required
              disabled={!!existing}
              value={selectedBatchId}
              onChange={(e) => changeBatch(e.target.value)}
              placeholder="Select a batch…"
              options={batchChoices.map((b) => ({ value: b.id, label: `${b.name} · ${b.title}` }))}
              error={errors.batch}
              hint={existing ? 'A recorded assessment stays with its batch.' : undefined}
              containerClassName="sm:col-span-2"
            />
            <TextField
              label="Title"
              required
              value={title}
              onChange={(e) => setTitleInput(e.target.value)}
              error={errors.title}
              hint={titleInput === null && batch ? 'Suggested from the type and topics — edit freely.' : undefined}
              autoComplete="off"
              containerClassName="sm:col-span-2"
            />
            <div className="sm:col-span-2">
              <span className="label">Type</span>
              <SegmentedControl<AssessmentType>
                ariaLabel="Assessment type"
                value={type}
                onChange={setType}
                segments={TYPE_SEGMENTS}
                className="grid w-full grid-cols-2 sm:grid-cols-4"
              />
            </div>
            <TextField
              label="Date"
              type="date"
              required
              min={batch?.startDate}
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={errors.date}
            />
            <TextField
              label="Max marks"
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={1000}
              value={maxText}
              onChange={(e) => setMaxInput(e.target.value)}
              error={errors.maxMarks}
              className="tnum"
            />
          </div>
        </section>

        <section>
          <SectionTitle
            icon="menu_book"
            trailing={
              syllabus.length > 0 && (
                <span className="font-body-sm text-body-sm text-secondary">
                  {topicIds.length} of {syllabus.length} selected
                </span>
              )
            }
          >
            Topics covered
          </SectionTitle>
          {!batch ? (
            <p className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-secondary">
              Pick a batch to see its syllabus.
            </p>
          ) : !syllabus.length ? (
            <p className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-secondary">
              No syllabus topics for {lookups.subject.get(batch.subjectId)?.name} · {batch.grade} yet.
            </p>
          ) : (
            <>
              {topicInput === null && suggestedTopics.length > 0 && (
                <p className="mb-space-xs flex items-center gap-1 font-body-sm text-body-sm text-secondary">
                  <Icon name="auto_awesome" size={14} className="text-primary" />
                  Preselected: topics taught since {previous ? `${previous.title} (${formatDate(previous.date)})` : 'the batch started'}.
                </p>
              )}
              <div className="flex max-h-48 flex-wrap gap-space-xs overflow-y-auto">
                {syllabus.map((t) => {
                  const on = topicIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      title={t.chapter}
                      onClick={() => toggleTopic(t.id)}
                      className={cn(
                        'inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 font-label-md text-label-md transition-colors',
                        on
                          ? 'border-primary-container bg-primary-fixed text-on-primary-fixed'
                          : 'border-outline-variant/60 text-on-surface-variant hover:bg-surface-container-low',
                      )}
                    >
                      {on && <Icon name="check" size={14} />}
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section>
          {/* Sticky summary so the live average stays visible while scrolling a long roll. */}
          <div className="sticky -top-space-md z-10 -mx-space-md border-b border-outline-variant/30 bg-surface-container-lowest px-space-md py-space-xs md:-mx-space-lg md:px-space-lg">
            <SectionTitle
              icon="scoreboard"
              trailing={
                live.pending > 0 && (
                  <Button size="sm" variant="ghost" icon="event_busy" onClick={markRestAbsent}>
                    Mark {live.pending} blank as absent
                  </Button>
                )
              }
            >
              Scores{batch && ` · ${roll.length} students`}
            </SectionTitle>
            {batch && roll.length > 0 && (
              <div className="-mt-space-xs flex flex-wrap gap-x-space-md gap-y-1 font-body-sm text-body-sm text-secondary">
                <span>
                  Class average <strong className="text-on-surface tnum">{pct(live.average)}</strong>
                </span>
                <span>
                  Appeared <strong className="text-on-surface tnum">{live.appeared}</strong>
                </span>
                <span>
                  Absent <strong className="text-on-surface tnum">{live.absent}</strong>
                </span>
                {live.pending > 0 && (
                  <span>
                    Blank <strong className="text-on-surface tnum">{live.pending}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {(errors.roll || errors.scores) && (
            <p className="mt-space-xs flex items-center gap-1 font-body-sm text-body-sm text-error" role="alert">
              <Icon name="error" size={14} />
              {errors.roll ?? errors.scores}
            </p>
          )}

          {!batch ? (
            <p className="mt-space-sm rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-secondary">
              Pick a batch to load its roll.
            </p>
          ) : !roll.length ? (
            <EmptyState
              compact
              icon="group_off"
              title="No students on the roll"
              description="Nobody was enrolled in this batch on that date."
            />
          ) : (
            <ol className="divide-y divide-surface-container-low">
              {roll.map((s, i) => {
                const entry = scores[s.id] ?? EMPTY_ENTRY;
                const err = rowErrors[s.id];
                const ratio = !entry.absent && entry.value.trim() && maxValid ? Number(entry.value) / maxMarks : NaN;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-space-sm gap-y-1 py-space-xs">
                    <span className="hidden w-6 shrink-0 text-center font-label-md text-label-md text-secondary tnum sm:block">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <PersonCell name={s.name} subtitle={s.id} photoUrl={s.photoUrl} size="sm" dimmed={entry.absent} />
                    </div>
                    <div className="flex shrink-0 items-center gap-space-xs">
                      <input
                        ref={(el) => {
                          inputs.current[i] = el;
                        }}
                        type="number"
                        inputMode="decimal"
                        enterKeyHint="next"
                        step="any"
                        min={0}
                        max={maxValid ? maxMarks : undefined}
                        aria-label={`Marks for ${s.name}`}
                        aria-invalid={!!err}
                        aria-describedby={err ? `score-err-${s.id}` : undefined}
                        placeholder={entry.absent ? 'Absent' : `/ ${maxValid ? maxMarks : '—'}`}
                        value={entry.absent ? '' : entry.value}
                        disabled={entry.absent}
                        onChange={(e) => patchScore(s.id, { value: e.target.value })}
                        onKeyDown={onScoreKey(i)}
                        onFocus={(e) => e.target.select()}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={cn(
                          'field w-20 text-right tnum [appearance:textfield] sm:w-24 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                          err && 'field-invalid',
                        )}
                      />
                      <span className="hidden w-11 text-right font-label-md text-label-md text-secondary tnum sm:block">{pct(ratio)}</span>
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-1.5 font-label-md text-label-md text-on-surface-variant md:min-h-0">
                        <Checkbox checked={entry.absent} onChange={() => patchScore(s.id, { absent: !entry.absent })} />
                        Absent
                      </label>
                    </div>
                    {err && (
                      <p
                        id={`score-err-${s.id}`}
                        className="flex basis-full items-center justify-end gap-1 font-body-sm text-body-sm text-error"
                      >
                        <Icon name="error" size={14} />
                        {err}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </form>
    </Modal>
  );
}
