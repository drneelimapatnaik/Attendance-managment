/**
 * Topic Coverage URL state: ?view=progress|master&batch=&subject=&grade=&topic=
 *
 * Incoming links decide the default view when ?view is absent:
 *  - /topics?topic=ID (global search) and /topics?subject=&grade= (students
 *    page) open the Syllabus master;
 *  - /topics and /topics?batch=ID open Batch progress.
 */
import { useSearchParams } from 'react-router-dom';

export type TopicView = 'progress' | 'master';

export function useTopicParams() {
  const [params, setParams] = useSearchParams();
  const batchId = params.get('batch') ?? '';
  const subjectId = params.get('subject') ?? '';
  const grade = params.get('grade') ?? '';
  const topicId = params.get('topic') ?? '';
  const raw = params.get('view');
  const view: TopicView = raw === 'progress' || raw === 'master' ? raw : (topicId || subjectId) && !batchId ? 'master' : 'progress';

  /** Merge changes into the URL; empty / null values remove the key. */
  const patch = (changes: Record<string, string | null | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  return { view, batchId, subjectId, grade, topicId, patch };
}

export type TopicParams = ReturnType<typeof useTopicParams>;
