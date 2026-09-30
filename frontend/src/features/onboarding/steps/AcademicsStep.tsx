/**
 * Setup step 4 — what the institute teaches: the grades and the subjects.
 *
 * Both start from the usual coaching-centre answer, which the owner accepts,
 * edits or replaces. Each picked subject becomes a Subject record covering the
 * picked grades; topics are added later in Subject & Topic Master, and batches
 * are created per subject + grade.
 */
import { useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { ChipPicker } from '../components/ChipPicker';
import { SetupStepShell } from '../components/SetupStepShell';
import type { SetupNav } from '../useSetupNav';

/** Starting suggestions — a Grade 10–12 science coaching centre, the common case. */
const GRADE_SUGGESTIONS = ['Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const DEFAULT_GRADES = ['Grade 10', 'Grade 11', 'Grade 12'];
const SUBJECT_SUGGESTIONS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'Computer Science', 'Social Studies'];
const DEFAULT_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'];

/** "Computer Science" → "COM"; kept unique against the codes already in use. */
function subjectCode(name: string, taken: Set<string>): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  const base = (letters.slice(0, 3) || 'SUB').padEnd(3, 'X');
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, 2)}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${taken.size}`;
}

export function AcademicsStep({ nav }: { nav: SetupNav }) {
  const settings = useSettings();
  const subjects = useDataStore((s) => s.subjects);
  const addSubject = useDataStore((s) => s.addSubject);

  // Grades already in use come from the subjects that exist.
  const existingGrades = useMemo(() => [...new Set(subjects.flatMap((s) => s.grades))].sort(), [subjects]);
  const [grades, setGrades] = useState<string[]>(existingGrades.length ? existingGrades : DEFAULT_GRADES);
  const existingNames = useMemo(() => subjects.map((s) => s.name), [subjects]);
  const [picked, setPicked] = useState<string[]>(() => DEFAULT_SUBJECTS.filter((n) => !existingNames.includes(n)));
  const [error, setError] = useState('');

  const save = () => {
    const cleanGrades = grades.map((g) => g.trim()).filter(Boolean);
    const cleanSubjects = picked.map((s) => s.trim()).filter(Boolean);
    if (cleanSubjects.length && !cleanGrades.length) {
      setError('Pick at least one grade, so subjects know which syllabus they belong to.');
      return false;
    }
    setError('');
    const taken = new Set(subjects.map((s) => s.code));
    for (const name of cleanSubjects) {
      if (subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) continue;
      const code = subjectCode(name, taken);
      taken.add(code);
      addSubject({ name, code, grades: cleanGrades });
    }
    return true;
  };

  return (
    <SetupStepShell
      nav={nav}
      onNext={save}
      skipHint="You can add subjects before your first batch."
      note={
        <>
          Nothing here is final: grades and subjects are edited any time in{' '}
          <strong className="text-on-surface">Academic › Subject & Topic Master</strong>, where you also add each subject's chapters and
          topics. {settings.name || 'Your institute'} needs at least one subject before its first batch.
        </>
      }
    >
      <ChipPicker
        label="Grades you teach"
        hint="Used on every student record, batch and syllabus."
        suggestions={GRADE_SUGGESTIONS}
        selected={grades}
        onChange={(next) => {
          setGrades(next);
          setError('');
        }}
        addPlaceholder="Add another grade or class"
        error={error}
      />
      <ChipPicker
        label="Subjects you teach"
        hint="One batch is one subject for one grade, so start with the subjects you run classes for."
        suggestions={SUBJECT_SUGGESTIONS}
        selected={picked}
        onChange={setPicked}
        locked={existingNames}
        lockedHint="Already added — manage it in Subject & Topic Master."
        addPlaceholder="Add another subject"
      />
    </SetupStepShell>
  );
}
