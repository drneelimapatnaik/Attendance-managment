/**
 * Topic Coverage (/topics).
 *
 * Two views (URL ?view=):
 *  - Batch progress: per-batch syllabus checklist with pace vs the academic
 *    calendar, status changes via setCoverage, and a cross-batch overview.
 *  - Syllabus master: the subject + grade syllabus (chapters/topics) editor.
 * See useTopicParams for how incoming links (?batch, ?subject&grade, ?topic)
 * pick the view.
 */
import { useMemo } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { useScopedData } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { useDataStore } from '@/store/dataStore';
import { coverageProgress } from '@/domain/academics';
import { formatPercent } from '@/lib/format';
import { BatchProgressView } from './components/BatchProgressView';
import { SyllabusMaster } from './components/SyllabusMaster';
import { useTopicParams, type TopicView } from './useTopicParams';

export default function TopicCoveragePage() {
  useDocumentTitle('Topic Coverage');
  const params = useTopicParams();
  const { batches, coverage } = useScopedData();
  const topics = useDataStore((s) => s.topics);

  // Header meta: average completion across active batches at this campus.
  const summary = useMemo(() => {
    const active = batches.filter((b) => b.status === 'Active');
    const avg = active.length ? active.reduce((s, b) => s + coverageProgress(b, topics, coverage).ratio, 0) / active.length : 0;
    return { active: active.length, avg };
  }, [batches, topics, coverage]);

  const setView = (v: TopicView) => params.patch({ view: v, topic: null, ...(v === 'progress' ? {} : { batch: null }) });

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Academic"
        title="Topic Coverage"
        meta={`${summary.active} active batches · ${formatPercent(summary.avg)} average syllabus covered`}
        description="Track what each batch has taught against its syllabus, and keep the subject & topic master up to date."
      />

      <Tabs<TopicView>
        value={params.view}
        onChange={setView}
        ariaLabel="Topic coverage views"
        items={[
          { value: 'progress', label: 'Batch progress', icon: 'donut_large', count: summary.active },
          { value: 'master', label: 'Syllabus master', icon: 'auto_stories' },
        ]}
      />

      {params.view === 'progress' ? (
        <BatchProgressView batchId={params.batchId} subjectId={params.subjectId} topicId={params.topicId} patch={params.patch} />
      ) : (
        <SyllabusMaster subjectId={params.subjectId} grade={params.grade} topicId={params.topicId} patch={params.patch} />
      )}
    </div>
  );
}
