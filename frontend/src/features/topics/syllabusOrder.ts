/**
 * Ordering rules for a subject + grade syllabus. Topics carry one `order`
 * sequence per syllabus and chapters are shown in first-topic order, so a
 * topic added to (or moved into) a chapter must slot in after that chapter's
 * last topic — shifting everything after it down by one.
 */
import type { ID, Topic } from '@/types/domain';

export interface OrderChange {
  id: ID;
  order: number;
}

/** Where a topic goes when appended to `chapter`, and the shifts that make room. */
export function insertionPlan(syllabus: Topic[], chapter: string, excludeId?: ID): { order: number; shifts: OrderChange[] } {
  const others = syllabus.filter((t) => t.id !== excludeId);
  const inChapter = others.filter((t) => t.chapter === chapter);
  const order = inChapter.length ? Math.max(...inChapter.map((t) => t.order)) + 1 : Math.max(0, ...others.map((t) => t.order)) + 1;
  const shifts = others.filter((t) => t.order >= order).map((t) => ({ id: t.id, order: t.order + 1 }));
  return { order, shifts };
}

/** Swap a topic with its neighbour inside the same chapter; [] at the chapter's edge. */
export function movePlan(syllabus: Topic[], topic: Topic, direction: -1 | 1): OrderChange[] {
  const chapter = syllabus.filter((t) => t.chapter === topic.chapter).sort((a, b) => a.order - b.order);
  const idx = chapter.findIndex((t) => t.id === topic.id);
  const neighbour = chapter[idx + direction];
  if (idx === -1 || !neighbour) return [];
  return [
    { id: topic.id, order: neighbour.order },
    { id: neighbour.id, order: topic.order },
  ];
}
