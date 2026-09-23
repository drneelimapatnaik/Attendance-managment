/**
 * Derivations shared by the student & parent app's content screens
 * (home, attendance, syllabus, timetable).
 *
 * Everything is built on `usePortalData()`, which is already scoped to the
 * student in view, so nothing here can reach another student's record. These
 * live beside the portal screens on purpose: the staff console has its own,
 * denser equivalents in `features/students/profile`.
 */
import { useMemo } from 'react';
import type { AttendanceMark, AttendanceSession, Batch, ID, ISODate, TimeHM, Topic } from '@/types/domain';
import { useDataStore } from '@/store/dataStore';
import { usePortalAccount, usePortalData, useCanSeeFees } from '@/hooks/usePortal';
import { useSettings } from '@/hooks/useTenant';
import { addMark, emptyCounts, type MarkCounts } from '@/domain/attendance';
import { parseISODate } from '@/lib/date';

/** One class the student was on the roll for, joined to its batch. */
export interface PortalClassRow {
  session: AttendanceSession;
  batch?: Batch;
  mark: AttendanceMark;
}

export function countRows(rows: PortalClassRow[]): MarkCounts {
  const c = emptyCounts();
  for (const r of rows) addMark(c, r.mark);
  return c;
}

/** Classes counted as attended under the institute's late rule. */
export const attendedOf = (c: MarkCounts, countLate: boolean) => c.P + (countLate ? c.L : 0);

/** Classes that count towards the percentage — excused leave is excluded. */
export const countedOf = (c: MarkCounts) => c.P + c.L + c.A;

/**
 * A local instant for a calendar date, clamped to "now" so a relative-time
 * label never reads as being in the future (seed data stamps some events at
 * midday on the current date).
 */
export function pastInstant(date: ISODate, hm: TimeHM = '12:00'): string {
  const d = parseISODate(date);
  const [h, m] = hm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return new Date(Math.min(d.getTime(), Date.now())).toISOString();
}

/**
 * Whose data is on screen, so copy reads naturally for both account roles:
 * a student sees "You were marked absent", a parent "Ananya was marked absent".
 */
export interface PortalVoice {
  isParent: boolean;
  /** The student's first name. */
  first: string;
  /** Sentence subject: "You" or "Ananya". */
  subject: string;
  /** Possessive at the start of a sentence: "Your" or "Ananya's". */
  possessive: string;
  /** The same possessive mid-sentence: "your" or "Ananya's" (a name keeps its capital). */
  possessiveLower: string;
  /** Past tense of "to be" matching `subject`. */
  was: string;
  /** Present tense of "to be" matching `subject`. */
  is: string;
}

/**
 * One call gives a portal screen the student in view, their batches, their
 * marked classes (newest first) and the small lookups every screen needs.
 */
export function usePortalScreen() {
  const data = usePortalData();
  const account = usePortalAccount();
  const isParent = useCanSeeFees();
  const settings = useSettings();
  const subjects = useDataStore((s) => s.subjects);

  const { student, batches, sessions, topics, staff } = data;

  // Every class the student was marked in, newest first. Reading the session
  // records (not the batch roll) keeps the history of batches they have left.
  const rows = useMemo<PortalClassRow[]>(() => {
    if (!student) return [];
    const byBatch = new Map(batches.map((b) => [b.id, b]));
    return sessions
      .map((session) => ({ session, batch: byBatch.get(session.batchId), mark: session.records[student.id] }))
      .sort((a, b) => b.session.date.localeCompare(a.session.date) || b.session.startTime.localeCompare(a.session.startTime));
  }, [student, sessions, batches]);

  const topicById = useMemo(() => new Map<ID, Topic>(topics.map((t) => [t.id, t])), [topics]);

  const subjectOf = useMemo(() => {
    const map = new Map(subjects.map((s) => [s.id, s]));
    return (batch: Batch) => map.get(batch.subjectId)?.name ?? batch.title;
  }, [subjects]);

  const facultyOf = useMemo(() => {
    const map = new Map(staff.map((s) => [s.id, s]));
    return (id: ID) => map.get(id)?.name ?? 'Faculty';
  }, [staff]);

  const voice = useMemo<PortalVoice>(() => {
    const first = student?.name.split(' ')[0] ?? 'your child';
    return {
      isParent,
      first,
      subject: isParent ? first : 'You',
      possessive: isParent ? `${first}'s` : 'Your',
      possessiveLower: isParent ? `${first}'s` : 'your',
      was: isParent ? 'was' : 'were',
      is: isParent ? 'is' : 'are',
    };
  }, [isParent, student]);

  return {
    ...data,
    account,
    isParent,
    settings,
    rows,
    topicById,
    subjectOf,
    facultyOf,
    voice,
    /** Percentage below which the institute flags a student (e.g. 75). */
    threshold: settings.attendance.lowAttendanceThreshold,
    countLate: settings.attendance.countLateAsPresent,
  };
}

export type PortalScreen = ReturnType<typeof usePortalScreen>;
