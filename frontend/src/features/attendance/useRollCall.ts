/**
 * State for one roll call — one batch on one date.
 *
 * Holds the marks, topics covered and notes being edited and compares them
 * with what is saved (the session in the store, or the defaults for a new
 * session) so the page knows when there are unsaved changes. Mount the
 * consumer keyed by `batchId|date` so switching class starts fresh.
 *
 * Defaults for a new session: students "On Leave" are preset to Excused and
 * the batch's current In-Progress topic is pre-selected.
 */
import { useCallback, useMemo, useState } from 'react';
import type { AttendanceMark, AttendanceSession, Batch, ID, ISODate, Student } from '@/types/domain';
import { useCurrentUser, useLookups, useScopedData } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { buildStudentAttendanceIndex, countRecords, rollFor, type MarkCounts } from '@/domain/attendance';
import { coverageProgress } from '@/domain/academics';
import { addDays } from '@/lib/date';
import { absenceStreaksByBatch } from './attendanceStats';

type Marks = Record<ID, AttendanceMark>;

interface Snapshot {
  marks: Marks;
  topicIds: ID[];
  notes: string;
}

export interface RollCounts extends MarkCounts {
  unmarked: number;
}

export interface SaveResult {
  session: AttendanceSession;
  counts: MarkCounts;
  /** Students newly marked absent by this save (for parent alerts). */
  newlyAbsent: Student[];
}

const sameMarks = (a: Marks, b: Marks) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};
const sameSet = (a: ID[], b: ID[]) => a.length === b.length && a.every((x) => b.includes(x));

export function useRollCall(batch: Batch, date: ISODate) {
  const user = useCurrentUser();
  const { students, sessions, coverage } = useScopedData();
  const lookups = useLookups();
  const topics = useDataStore((s) => s.topics);
  const saveSession = useDataStore((s) => s.saveSession);

  const session = useMemo(() => sessions.find((s) => s.batchId === batch.id && s.date === date), [sessions, batch.id, date]);

  // Current roll, plus anyone recorded in the saved session who has since left
  // the batch — editing an old session must never silently drop their record.
  const roll = useMemo(() => {
    const base = rollFor(batch, students, date);
    if (!session) return base;
    const onRoll = new Set(base.map((s) => s.id));
    const former = Object.keys(session.records)
      .filter((id) => !onRoll.has(id))
      .map((id) => lookups.student.get(id))
      .filter((s): s is Student => !!s);
    return former.length ? [...base, ...former].sort((a, b) => a.name.localeCompare(b.name)) : base;
  }, [batch, students, date, session, lookups.student]);

  const baseline = useMemo<Snapshot>(() => {
    if (session) return { marks: session.records, topicIds: session.topicIds, notes: session.notes ?? '' };
    const marks: Marks = {};
    for (const s of roll) if (s.status === 'On Leave') marks[s.id] = 'E';
    const current = coverageProgress(batch, topics, coverage).current;
    return { marks, topicIds: current ? [current.id] : [], notes: '' };
  }, [session, roll, batch, topics, coverage]);

  const [marks, setMarks] = useState<Marks>(() => baseline.marks);
  const [topicIds, setTopicIds] = useState<ID[]>(() => baseline.topicIds);
  const [notes, setNotes] = useState(() => baseline.notes);

  const dirty = !sameMarks(marks, baseline.marks) || !sameSet(topicIds, baseline.topicIds) || notes.trim() !== baseline.notes.trim();

  const counts = useMemo<RollCounts>(() => {
    const c = countRecords(Object.fromEntries(roll.filter((s) => marks[s.id]).map((s) => [s.id, marks[s.id]])));
    return { ...c, unmarked: roll.length - c.total };
  }, [roll, marks]);

  // History before this class: 30-day % in this batch and the current run of absences.
  const history = useMemo(() => {
    const past = sessions.filter((s) => s.batchId === batch.id && s.date < date);
    const from = addDays(date, -30);
    return {
      recent: buildStudentAttendanceIndex(past.filter((s) => s.date >= from)),
      streaks: absenceStreaksByBatch(past).get(batch.id) ?? new Map<ID, number>(),
    };
  }, [sessions, batch.id, date]);

  // Stable so memoised rows don't re-render when a sibling's mark changes.
  const setMark = useCallback((id: ID, mark: AttendanceMark) => setMarks((m) => ({ ...m, [id]: mark })), []);

  /** Everyone not yet marked becomes Present (existing marks are kept). */
  const markRestPresent = () =>
    setMarks((m) => {
      const next = { ...m };
      for (const s of roll) next[s.id] ??= 'P';
      return next;
    });

  const reset = () => {
    setMarks(baseline.marks);
    setTopicIds(baseline.topicIds);
    setNotes(baseline.notes);
  };

  const toggleTopic = (id: ID) => setTopicIds((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  /** Persist the roll call. `fillUnmarked: 'A'` records anyone still unmarked as absent. */
  const save = (fillUnmarked?: AttendanceMark): SaveResult => {
    const records: Marks = {};
    for (const s of roll) {
      const m = marks[s.id] ?? fillUnmarked;
      if (m) records[s.id] = m;
    }
    const trimmed = notes.trim();
    const saved = saveSession({
      batchId: batch.id,
      date,
      startTime: session?.startTime ?? batch.startTime,
      endTime: session?.endTime ?? batch.endTime,
      // A substitute teacher marking the class is recorded as its faculty.
      facultyId: session?.facultyId ?? (user?.role === 'faculty' ? user.id : batch.facultyId),
      topicIds,
      records,
      notes: trimmed || undefined,
    });
    const newlyAbsent = roll.filter((s) => records[s.id] === 'A' && session?.records[s.id] !== 'A');
    // Adopt exactly what was saved so the page reads as clean again.
    setMarks(records);
    setNotes(trimmed);
    return { session: saved, counts: countRecords(records), newlyAbsent };
  };

  return {
    session,
    roll,
    marks,
    topicIds,
    notes,
    dirty,
    counts,
    history,
    setMark,
    markRestPresent,
    reset,
    toggleTopic,
    setNotes,
    save,
  };
}

export type RollCallState = ReturnType<typeof useRollCall>;
