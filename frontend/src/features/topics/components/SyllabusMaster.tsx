/**
 * Topic Coverage › Syllabus master: pick a subject + grade (URL state) and
 * manage its chapters and topics — add (into an existing or new chapter),
 * edit, reorder within a chapter, delete (confirmed). "Add subject" creates a
 * new subject. A topic linked via ?topic= is highlighted and scrolled to.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Subject, Topic } from '@/types/domain';
import { Button, Card, ConfirmDialog, EmptyState, IconButton, Menu, SelectField, Tag } from '@/components/ui';
import { useCan } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { syllabusFor } from '@/domain/academics';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { groupByChapter } from '../coverage';
import { movePlan } from '../syllabusOrder';
import type { TopicParams } from '../useTopicParams';
import { SubjectFormModal } from './SubjectFormModal';
import { TopicFormModal } from './TopicFormModal';

type TopicDialog = { mode: 'add'; chapter?: string } | { mode: 'edit'; topic: Topic } | null;

const hrs = (n: number) => `${Math.round(n * 10) / 10}h`;

export function SyllabusMaster({
  subjectId,
  grade,
  topicId,
  patch: patchParams,
}: Pick<TopicParams, 'subjectId' | 'grade' | 'topicId' | 'patch'>) {
  const can = useCan();
  const toast = useToast();
  const subjects = useDataStore((s) => s.subjects);
  const topics = useDataStore((s) => s.topics);
  const batches = useDataStore((s) => s.batches);
  const coverage = useDataStore((s) => s.coverage);
  const updateTopic = useDataStore((s) => s.updateTopic);
  const deleteTopic = useDataStore((s) => s.deleteTopic);
  const canEdit = can('topics.manage');
  const canAddSubject = can('batches.manage');

  const [dialog, setDialog] = useState<TopicDialog>(null);
  const [deleting, setDeleting] = useState<Topic | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);

  const patch = (changes: Record<string, string | null>) => patchParams({ view: 'master', ...changes });

  // Resolve subject/grade: explicit params → the linked topic's → first available.
  const linkedTopic = topics.find((t) => t.id === topicId);
  const subject: Subject | undefined =
    subjects.find((s) => s.id === subjectId) ?? subjects.find((s) => s.id === linkedTopic?.subjectId) ?? subjects[0];
  const activeGrade =
    subject && subject.grades.includes(grade)
      ? grade
      : subject && linkedTopic && subject.grades.includes(linkedTopic.grade)
        ? linkedTopic.grade
        : (subject?.grades[0] ?? '');

  const syllabus = useMemo(
    () => (subject ? syllabusFor({ subjectId: subject.id, grade: activeGrade }, topics) : []),
    [subject, activeGrade, topics],
  );
  const chapters = useMemo(() => groupByChapter(syllabus, (t) => t), [syllabus]);
  const followers = useMemo(
    () =>
      batches
        .filter((b) => b.subjectId === subject?.id && b.grade === activeGrade && b.status !== 'Archived')
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [batches, subject?.id, activeGrade],
  );
  const plannedTotal = syllabus.reduce((s, t) => s + t.plannedHours, 0);
  // topicId → how many of the following batches have completed it.
  const completedIn = useMemo(() => {
    const ids = new Set(followers.map((b) => b.id));
    const map = new Map<string, number>();
    for (const c of coverage) if (c.status === 'Completed' && ids.has(c.batchId)) map.set(c.topicId, (map.get(c.topicId) ?? 0) + 1);
    return map;
  }, [coverage, followers]);

  const move = (t: Topic, dir: -1 | 1) => movePlan(syllabus, t, dir).forEach((c) => updateTopic(c.id, { order: c.order }));

  const confirmDelete = () => {
    if (!deleting) return;
    deleteTopic(deleting.id);
    if (deleting.id === topicId) patch({ topic: null });
    toast({ title: 'Topic deleted', description: `${deleting.name} was removed from the syllabus.` });
    setDeleting(null);
  };
  const deletingTracked = deleting ? coverage.filter((c) => c.topicId === deleting.id && c.status !== 'Not Started').length : 0;

  if (!subject) {
    return (
      <Card>
        <EmptyState
          icon="auto_stories"
          title="No subjects yet"
          description="Add a subject, then build its syllabus chapter by chapter."
          action={
            canAddSubject ? (
              <Button icon="add" onClick={() => setAddingSubject(true)}>
                Add subject
              </Button>
            ) : undefined
          }
        />
        <SubjectFormModal
          open={addingSubject}
          onClose={() => setAddingSubject(false)}
          onCreated={(s) => patch({ subject: s.id, grade: s.grades[0], topic: null })}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-space-md">
      <Card className="flex flex-col gap-space-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-2 gap-space-xs lg:w-[28rem]">
          <SelectField
            label="Subject"
            value={subject.id}
            onChange={(e) => patch({ subject: e.target.value, grade: null, topic: null })}
            options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
          />
          <SelectField
            label="Grade"
            value={activeGrade}
            onChange={(e) => patch({ subject: subject.id, grade: e.target.value, topic: null })}
            options={subject.grades.map((g) => ({ value: g, label: g }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-space-xs">
          {canAddSubject && (
            <Button variant="tonal" icon="library_add" onClick={() => setAddingSubject(true)}>
              Add subject
            </Button>
          )}
          {canEdit && (
            <Button icon="add" onClick={() => setDialog({ mode: 'add' })}>
              Add topic
            </Button>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-xs px-space-2xs font-body-sm text-body-sm text-secondary">
        <span className="tnum">
          <strong className="font-semibold text-on-surface">{pluralize(syllabus.length, 'topic')}</strong> in{' '}
          {pluralize(chapters.length, 'chapter')} · {hrs(plannedTotal)} planned
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {followers.length ? (
            <>
              Followed by
              {followers.map((b) => (
                <Link key={b.id} to={`/topics?view=progress&batch=${b.id}`} title={b.title}>
                  <Tag className="hover:bg-surface-container-highest">{b.code}</Tag>
                </Link>
              ))}
            </>
          ) : (
            'No batches follow this syllabus yet'
          )}
        </span>
      </div>

      {!chapters.length ? (
        <Card>
          <EmptyState
            icon="menu_book"
            title={`No topics for ${subject.name} · ${activeGrade} yet`}
            description="Start with the first chapter — batches following this syllabus pick up new topics automatically."
            action={
              canEdit ? (
                <Button icon="add" onClick={() => setDialog({ mode: 'add' })}>
                  Add first topic
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        chapters.map(({ chapter, items }) => (
          <Card key={chapter} padded={false} className="overflow-hidden">
            <header className="flex items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-sm">
              <div className="min-w-0">
                <h3 className="truncate font-title-md text-title-md text-on-surface">{chapter}</h3>
                <p className="font-body-sm text-body-sm text-secondary tnum">
                  {pluralize(items.length, 'topic')} · {hrs(items.reduce((s, t) => s + t.plannedHours, 0))} planned
                </p>
              </div>
              {canEdit && (
                <Button variant="ghost" size="sm" icon="add" onClick={() => setDialog({ mode: 'add', chapter })}>
                  <span className="hidden sm:inline">Add topic</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              )}
            </header>
            <ol className="divide-y divide-surface-container-low">
              {items.map((t, i) => (
                <TopicRow
                  key={t.id}
                  topic={t}
                  position={syllabus.indexOf(t) + 1}
                  completedIn={completedIn.get(t.id) ?? 0}
                  batchCount={followers.length}
                  highlighted={t.id === topicId}
                  canEdit={canEdit}
                  isFirst={i === 0}
                  isLast={i === items.length - 1}
                  onEdit={() => setDialog({ mode: 'edit', topic: t })}
                  onMove={(dir) => move(t, dir)}
                  onDelete={() => setDeleting(t)}
                />
              ))}
            </ol>
          </Card>
        ))
      )}

      {dialog && (
        <TopicFormModal
          open
          onClose={() => setDialog(null)}
          subjectId={subject.id}
          subjectName={subject.name}
          grade={activeGrade}
          chapters={chapters.map((c) => c.chapter)}
          topic={dialog.mode === 'edit' ? dialog.topic : undefined}
          defaultChapter={dialog.mode === 'add' ? dialog.chapter : undefined}
        />
      )}
      {addingSubject && (
        <SubjectFormModal
          open
          onClose={() => setAddingSubject(false)}
          onCreated={(s) => patch({ subject: s.id, grade: s.grades[0], topic: null })}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete topic?"
        confirmLabel="Delete topic"
        message={
          deleting && (
            <>
              <strong className="text-on-surface">{deleting.name}</strong> will be removed from the {subject.name} · {activeGrade} syllabus
              and from coverage tracking in {pluralize(followers.length, 'batch', 'batches')}.
              {deletingTracked > 0 && ` ${pluralize(deletingTracked, 'batch has', 'batches have')} already started or completed it.`} Past
              attendance sessions are not changed.
            </>
          )
        }
      />
    </div>
  );
}

interface TopicRowProps {
  topic: Topic;
  position: number;
  completedIn: number;
  batchCount: number;
  highlighted: boolean;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}

function TopicRow({
  topic,
  position,
  completedIn,
  batchCount,
  highlighted,
  canEdit,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onDelete,
}: TopicRowProps) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  return (
    <li
      ref={ref}
      className={cn(
        'flex items-center gap-space-sm px-space-md py-space-sm',
        highlighted && 'bg-primary-fixed/40 ring-2 ring-inset ring-primary',
      )}
      aria-current={highlighted ? 'true' : undefined}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container font-label-md text-label-md text-on-surface-variant tnum">
        {position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-label-lg text-label-lg text-on-surface">{topic.name}</p>
        <p className="font-body-sm text-body-sm text-secondary tnum">
          {hrs(topic.plannedHours)} planned
          {batchCount > 0 && ` · completed in ${completedIn} of ${pluralize(batchCount, 'batch', 'batches')}`}
        </p>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <IconButton icon="edit" label={`Edit ${topic.name}`} size="sm" onClick={onEdit} className="hidden sm:inline-flex" />
          <Menu
            width="w-48"
            items={[
              { label: 'Edit', icon: 'edit', onSelect: onEdit },
              { label: 'Move up', icon: 'arrow_upward', onSelect: () => onMove(-1), disabled: isFirst },
              { label: 'Move down', icon: 'arrow_downward', onSelect: () => onMove(1), disabled: isLast },
              { label: 'Delete', icon: 'delete', tone: 'danger', separator: true, onSelect: onDelete },
            ]}
            trigger={(props) => <IconButton {...props} icon="more_vert" label={`More actions for ${topic.name}`} size="sm" />}
          />
        </div>
      )}
    </li>
  );
}
