/**
 * Add a subject to the Subject & Topic Master: name, short code, optional
 * short name and the grades it is taught in (known grades as chips, plus a
 * custom grade).
 */
import { useMemo, useState, type FormEvent } from 'react';
import type { Subject } from '@/types/domain';
import { Button, Icon, Modal, TextField } from '@/components/ui';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { cn } from '@/lib/cn';

interface SubjectFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (subject: Subject) => void;
}

type Errors = Partial<Record<'name' | 'code' | 'grades', string>>;

const CODE_RE = /^[A-Z]{2,5}$/;

export function SubjectFormModal({ open, onClose, onCreated }: SubjectFormModalProps) {
  const toast = useToast();
  const subjects = useDataStore((s) => s.subjects);
  const batches = useDataStore((s) => s.batches);
  const addSubject = useDataStore((s) => s.addSubject);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [shortName, setShortName] = useState('');
  const [grades, setGrades] = useState<string[]>([]);
  const [extraGrades, setExtraGrades] = useState<string[]>([]);
  const [customGrade, setCustomGrade] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  // Grades already used anywhere in the institute, plus any typed in here.
  const known = useMemo(
    () =>
      [...new Set([...subjects.flatMap((s) => s.grades), ...batches.map((b) => b.grade), ...extraGrades])].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [subjects, batches, extraGrades],
  );

  const toggle = (g: string) => setGrades((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g]));

  const addCustom = () => {
    const g = customGrade.trim();
    if (!g) return;
    if (!known.some((k) => k.toLowerCase() === g.toLowerCase())) setExtraGrades((x) => [...x, g]);
    const match = known.find((k) => k.toLowerCase() === g.toLowerCase()) ?? g;
    setGrades((list) => (list.includes(match) ? list : [...list, match]));
    setCustomGrade('');
    setErrors((e) => ({ ...e, grades: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const c = code.trim().toUpperCase();
    const errs: Errors = {};
    if (n.length < 2) errs.name = 'Enter the subject name.';
    else if (subjects.some((s) => s.name.toLowerCase() === n.toLowerCase())) errs.name = `${n} already exists.`;
    if (!CODE_RE.test(c)) errs.code = 'Use 2–5 letters, e.g. PHY.';
    else if (subjects.some((s) => s.code.toUpperCase() === c)) errs.code = `Code ${c} is already used.`;
    if (!grades.length) errs.grades = 'Pick at least one grade.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const ordered = known.filter((g) => grades.includes(g));
    const created = addSubject({ name: n, code: c, shortName: shortName.trim() || undefined, grades: ordered });
    toast({ title: `${created.name} added`, description: `Now add chapters and topics for ${ordered.join(', ')}.` });
    onCreated(created);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Add subject"
      description="Subjects group a syllabus per grade. Batches pick a subject + grade."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="subject-form" icon="add">
            Add subject
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-space-sm">
        <TextField
          label="Subject name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          placeholder="Computer Science"
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-space-sm">
          <TextField
            label="Code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={errors.code}
            placeholder="CS"
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
          />
          <TextField
            label="Short name"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="CompSci"
            hint="Used in compact tables."
          />
        </div>
        <fieldset>
          <legend className="label">
            Grades<span className="ml-0.5 text-error">*</span>
          </legend>
          <div className="flex flex-wrap gap-space-xs" role="group" aria-label="Grades">
            {known.map((g) => {
              const on = grades.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    toggle(g);
                    setErrors((e) => ({ ...e, grades: undefined }));
                  }}
                  className={cn(
                    'flex h-11 items-center gap-1 rounded-lg px-space-sm font-label-md text-label-md transition-colors md:h-9',
                    on
                      ? 'bg-primary text-on-primary shadow-sm hover:bg-primary-container'
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
                  )}
                >
                  {on && <Icon name="check" size={14} />}
                  {g}
                </button>
              );
            })}
          </div>
          {errors.grades && (
            <p className="mt-1 flex items-center gap-1 font-body-sm text-body-sm text-error">
              <Icon name="error" size={14} />
              {errors.grades}
            </p>
          )}
          <div className="mt-space-xs flex items-end gap-space-xs">
            <TextField
              aria-label="Add another grade"
              value={customGrade}
              onChange={(e) => setCustomGrade(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Another grade, e.g. Grade 9"
              containerClassName="flex-1"
            />
            <Button variant="tonal" icon="add" onClick={addCustom} disabled={!customGrade.trim()}>
              Add
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
