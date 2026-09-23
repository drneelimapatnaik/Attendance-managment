/**
 * Add / edit a syllabus topic for one subject + grade. The chapter can be an
 * existing one or a new one; new topics (and topics moved to another
 * chapter) are placed at the end of that chapter.
 */
import { useState, type FormEvent } from 'react';
import type { Topic } from '@/types/domain';
import { Button, Modal, SelectField, TextField } from '@/components/ui';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { syllabusFor } from '@/domain/academics';
import { insertionPlan } from '../syllabusOrder';

interface TopicFormModalProps {
  open: boolean;
  onClose: () => void;
  subjectId: string;
  subjectName: string;
  grade: string;
  chapters: string[];
  topic?: Topic;
  defaultChapter?: string;
}

const NEW_CHAPTER = '__new';

interface FormState {
  chapter: string; // existing chapter name or NEW_CHAPTER
  newChapter: string;
  name: string;
  plannedHours: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

export function TopicFormModal({ open, onClose, subjectId, subjectName, grade, chapters, topic, defaultChapter }: TopicFormModalProps) {
  const toast = useToast();
  const topics = useDataStore((s) => s.topics);
  const addTopic = useDataStore((s) => s.addTopic);
  const updateTopic = useDataStore((s) => s.updateTopic);

  const [form, setForm] = useState<FormState>(() => ({
    chapter: topic?.chapter ?? defaultChapter ?? chapters[chapters.length - 1] ?? NEW_CHAPTER,
    newChapter: '',
    name: topic?.name ?? '',
    plannedHours: String(topic?.plannedHours ?? 4),
  }));
  const [errors, setErrors] = useState<Errors>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const syllabus = syllabusFor({ subjectId, grade }, topics);
    const chapter = (form.chapter === NEW_CHAPTER ? form.newChapter : form.chapter).trim();
    const name = form.name.trim();
    const hours = Number(form.plannedHours);
    const errs: Errors = {};
    if (!chapter) errs[form.chapter === NEW_CHAPTER ? 'newChapter' : 'chapter'] = 'Name the chapter, e.g. “Unit 2 · Kinematics”.';
    else if (form.chapter === NEW_CHAPTER && chapters.some((c) => c.toLowerCase() === chapter.toLowerCase()))
      errs.newChapter = 'That chapter already exists — pick it from the list.';
    if (name.length < 2) errs.name = 'Enter the topic name.';
    else if (syllabus.some((t) => t.id !== topic?.id && t.name.toLowerCase() === name.toLowerCase()))
      errs.name = `“${name}” is already in this syllabus.`;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 200) errs.plannedHours = 'Planned hours must be between 0.5 and 200.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    if (topic) {
      const patch: Partial<Topic> = { name, plannedHours: hours, chapter };
      if (chapter !== topic.chapter) {
        // Moving chapters: append to the target chapter and make room for it.
        const plan = insertionPlan(syllabus, chapter, topic.id);
        plan.shifts.forEach((s) => updateTopic(s.id, { order: s.order }));
        patch.order = plan.order;
      }
      updateTopic(topic.id, patch);
      toast({ title: 'Topic updated', description: `${name} · ${chapter}` });
    } else {
      const plan = insertionPlan(syllabus, chapter);
      plan.shifts.forEach((s) => updateTopic(s.id, { order: s.order }));
      addTopic({ subjectId, grade, chapter, name, plannedHours: hours, order: plan.order });
      toast({ title: 'Topic added', description: `${name} · ${subjectName} ${grade}. Batches following this syllabus now track it.` });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={topic ? 'Edit topic' : 'Add topic'}
      description={`${subjectName} · ${grade}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="topic-form" icon={topic ? 'save' : 'add'}>
            {topic ? 'Save topic' : 'Add topic'}
          </Button>
        </>
      }
    >
      <form id="topic-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-space-sm">
        <SelectField
          label="Chapter"
          required
          value={form.chapter}
          onChange={(e) => set('chapter', e.target.value)}
          options={[...chapters.map((c) => ({ value: c, label: c })), { value: NEW_CHAPTER, label: '+ New chapter…' }]}
          error={errors.chapter}
        />
        {form.chapter === NEW_CHAPTER && (
          <TextField
            label="New chapter name"
            required
            value={form.newChapter}
            onChange={(e) => set('newChapter', e.target.value)}
            error={errors.newChapter}
            placeholder="Unit 5 · Thermodynamics"
            autoComplete="off"
          />
        )}
        <TextField
          label="Topic name"
          required
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          placeholder="Laws of Thermodynamics"
          autoComplete="off"
        />
        <TextField
          label="Planned hours"
          type="number"
          inputMode="decimal"
          min={0.5}
          step={0.5}
          required
          value={form.plannedHours}
          onChange={(e) => set('plannedHours', e.target.value)}
          error={errors.plannedHours}
          hint="Teaching time budgeted for this topic; compared with hours actually spent."
        />
      </form>
    </Modal>
  );
}
