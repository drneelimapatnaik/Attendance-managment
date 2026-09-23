/**
 * Timetable maths for batches — pure functions shared by the batch form
 * (clash warnings) and the weekly timetable (block layout).
 */
import type { Batch, TimeHM, Weekday } from '@/types/domain';
import { WEEKDAYS } from '@/types/domain';
import { minutesOf } from '@/lib/date';

/** Days in calendar order (Mon → Sun), whatever order they were picked in. */
export function sortDays(days: Weekday[]): Weekday[] {
  return WEEKDAYS.filter((d) => days.includes(d));
}

/** "Mon, Wed, Fri" — or "Weekdays" / "Every day" for the common sets. */
export function formatDays(days: Weekday[]): string {
  const sorted = sortDays(days);
  if (sorted.length === 7) return 'Every day';
  if (sorted.length === 5 && !sorted.includes('Sat') && !sorted.includes('Sun')) return 'Mon – Fri';
  return sorted.join(', ');
}

export function durationMinutes(start: TimeHM, end: TimeHM): number {
  return minutesOf(end) - minutesOf(start);
}

/** Teaching hours per week, e.g. 3 days × 1.5 h = 4.5. */
export function weeklyHours(b: Pick<Batch, 'days' | 'startTime' | 'endTime'>): number {
  return (b.days.length * Math.max(0, durationMinutes(b.startTime, b.endTime))) / 60;
}

type Slot = Pick<Batch, 'days' | 'startTime' | 'endTime'>;

/** Weekdays on which two slots overlap in time (empty when they never clash). */
export function clashDays(a: Slot, b: Slot): Weekday[] {
  const timeOverlap = minutesOf(a.startTime) < minutesOf(b.endTime) && minutesOf(b.startTime) < minutesOf(a.endTime);
  return timeOverlap ? sortDays(a.days.filter((d) => b.days.includes(d))) : [];
}

export interface Clash {
  batch: Batch;
  days: Weekday[];
}

/**
 * Faculty and room double-bookings for a proposed slot against the other
 * live (non-archived) batches. Rooms only clash within the same campus;
 * a faculty member can't be in two places at once on any campus.
 */
export function findClashes(
  slot: Slot & Pick<Batch, 'facultyId' | 'room' | 'campusId'>,
  batches: Batch[],
  excludeId?: string,
): { faculty: Clash[]; room: Clash[] } {
  const faculty: Clash[] = [];
  const room: Clash[] = [];
  const roomKey = slot.room.trim().toLowerCase();
  for (const b of batches) {
    if (b.id === excludeId || b.status === 'Archived') continue;
    const days = clashDays(slot, b);
    if (!days.length) continue;
    if (slot.facultyId && b.facultyId === slot.facultyId) faculty.push({ batch: b, days });
    if (roomKey && b.campusId === slot.campusId && b.room.trim().toLowerCase() === roomKey) room.push({ batch: b, days });
  }
  return { faculty, room };
}

export interface PlacedBlock<T> {
  item: T;
  lane: number; // 0-based column within its overlap cluster
  lanes: number; // columns in the cluster (block width = 1 / lanes)
}

/**
 * Side-by-side layout for overlapping blocks in one timetable column
 * (classic calendar packing): blocks that overlap in time are grouped into a
 * cluster, and each block takes the first free lane in its cluster.
 */
export function packBlocks<T>(items: T[], start: (t: T) => number, end: (t: T) => number): PlacedBlock<T>[] {
  const sorted = [...items].sort((a, b) => start(a) - start(b) || end(a) - end(b));
  const placed: PlacedBlock<T>[] = [];
  let cluster: PlacedBlock<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    cluster.forEach((p) => (p.lanes = laneEnds.length));
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (start(item) >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= start(item));
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = end(item);
    const block = { item, lane, lanes: 1 };
    cluster.push(block);
    placed.push(block);
    clusterEnd = Math.max(clusterEnd, end(item));
  }
  flush();
  return placed;
}
