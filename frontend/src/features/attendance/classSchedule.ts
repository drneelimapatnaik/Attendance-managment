/**
 * The class list for a day, as used by the roll-call picker and the
 * dashboard's "Today's schedule": timetabled classes plus any extra classes
 * that already have a saved session, each with a live status
 * (Marked / In progress / Upcoming / Not marked / Scheduled).
 */
import type { AttendanceSession, Batch, ISODate } from '@/types/domain';
import { classesOn } from '@/domain/attendance';
import { minutesOf } from '@/lib/date';

export interface ClassEntry {
  batch: Batch;
  date: ISODate;
  session?: AttendanceSession;
  /** Not on the timetable for this weekday (an extra / make-up class). */
  extra?: boolean;
}

export type ClassStatus = 'marked' | 'live' | 'upcoming' | 'missed' | 'scheduled';

/** Timetabled classes on `date` plus extra classes already saved that day, by start time. */
export function classEntriesFor(date: ISODate, batches: Batch[], sessions: AttendanceSession[]): ClassEntry[] {
  const scheduled: ClassEntry[] = classesOn(date, batches, sessions);
  const seen = new Set(scheduled.map((c) => c.batch.id));
  const byId = new Map(batches.map((b) => [b.id, b]));
  const extras: ClassEntry[] = [];
  for (const s of sessions) {
    if (s.date !== date || seen.has(s.batchId)) continue;
    const batch = byId.get(s.batchId);
    if (batch) extras.push({ batch, date, session: s, extra: true });
  }
  return [...scheduled, ...extras].sort((a, b) =>
    (a.session?.startTime ?? a.batch.startTime).localeCompare(b.session?.startTime ?? b.batch.startTime),
  );
}

/** Where a class stands relative to "now" (`todayDate` + minutes since midnight). */
export function classStatus(entry: ClassEntry, todayDate: ISODate, nowMinutes: number): ClassStatus {
  if (entry.session) return 'marked';
  if (entry.date > todayDate) return 'scheduled';
  if (entry.date < todayDate) return 'missed';
  if (nowMinutes < minutesOf(entry.batch.startTime)) return 'upcoming';
  if (nowMinutes <= minutesOf(entry.batch.endTime)) return 'live';
  return 'missed';
}

/**
 * The class to open when none is chosen: the one in progress, else the most
 * recently finished class still unmarked, else the next one to start, else
 * the first unmarked (past dates) or simply the first class.
 */
export function defaultClass(entries: ClassEntry[], todayDate: ISODate, nowMinutes: number): ClassEntry | undefined {
  const status = (e: ClassEntry) => classStatus(e, todayDate, nowMinutes);
  return (
    entries.find((e) => status(e) === 'live') ??
    [...entries].reverse().find((e) => status(e) === 'missed') ??
    entries.find((e) => status(e) === 'upcoming') ??
    entries[0]
  );
}
