/**
 * Assessment detail: headline stats, topics covered and the ranked score list
 * (rank, grade band, % meter; absentees last). Edit reopens the global
 * assessment form; Delete is confirmed and can be undone from the toast.
 * Reads the assessment live from the store, so edits show immediately.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ID } from '@/types/domain';
import { Badge, Button, ConfirmDialog, EmptyState, Modal, ProgressBar, Tag } from '@/components/ui';
import { PersonCell } from '@/components/domain';
import { useCan, useLookups } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast, useUiStore } from '@/store/uiStore';
import { assessmentStats, PASS_MARK } from '@/domain/academics';
import { formatDate } from '@/lib/date';
import { GradeBadge, pct } from './gradeBands';
import { TYPE_ICON } from './usePerformance';

interface Props {
  assessmentId: ID | null;
  onClose: () => void;
}

export function AssessmentDetailModal({ assessmentId, onClose }: Props) {
  const can = useCan();
  const toast = useToast();
  const openModal = useUiStore((s) => s.openModal);
  const lookups = useLookups();
  const assessment = useDataStore((s) => s.assessments.find((a) => a.id === assessmentId));
  const addAssessment = useDataStore((s) => s.addAssessment);
  const deleteAssessment = useDataStore((s) => s.deleteAssessment);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ranked = useMemo(() => {
    if (!assessment) return [];
    const entries = Object.entries(assessment.scores).map(([sid, score]) => ({ sid, score, student: lookups.student.get(sid) }));
    const present = entries.filter((e) => e.score != null).sort((a, b) => b.score! - a.score!);
    const absent = entries.filter((e) => e.score == null).sort((a, b) => (a.student?.name ?? '').localeCompare(b.student?.name ?? ''));
    // Standard competition ranking: equal scores share a rank (1, 2, 2, 4).
    let rank = 0;
    const withRank = present.map((e, i) => {
      if (i === 0 || e.score !== present[i - 1].score) rank = i + 1;
      return { ...e, rank };
    });
    return [...withRank, ...absent.map((e) => ({ ...e, rank: 0 }))];
  }, [assessment, lookups.student]);

  if (!assessmentId) return null;
  if (!assessment) {
    return (
      <Modal open onClose={onClose} size="sm" title="Assessment">
        <EmptyState compact icon="assignment_late" title="Assessment not found" description="It may have been deleted." />
      </Modal>
    );
  }

  const stats = assessmentStats(assessment);
  const batch = lookups.batch.get(assessment.batchId);
  const canManage = can('performance.manage');

  const remove = () => {
    const { id: _id, ...snapshot } = assessment;
    deleteAssessment(assessment.id);
    setConfirmDelete(false);
    onClose();
    toast({
      title: 'Assessment deleted',
      description: `${assessment.title} · ${batch?.name ?? ''}`,
      action: { label: 'Undo', onClick: () => addAssessment(snapshot) },
    });
  };

  return (
    <>
      <Modal
        open={!confirmDelete}
        onClose={onClose}
        size="lg"
        title={assessment.title}
        description={`${batch ? `${batch.name} · ` : ''}${assessment.type} · ${formatDate(assessment.date)} · max ${assessment.maxMarks} marks`}
        footer={
          <>
            {canManage && (
              <Button variant="danger-soft" icon="delete" onClick={() => setConfirmDelete(true)} className="sm:mr-auto">
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {canManage && (
              <Button
                icon="edit"
                onClick={() => {
                  onClose();
                  openModal({ type: 'assessment-form', assessmentId: assessment.id });
                }}
              >
                Edit scores
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-space-md">
          <dl className="grid grid-cols-2 gap-space-xs sm:grid-cols-4">
            {[
              { label: 'Average', value: pct(stats.average) },
              { label: 'Pass rate', value: pct(stats.passRate) },
              { label: 'Highest', value: stats.appeared ? `${stats.highest}/${assessment.maxMarks}` : '—' },
              { label: 'Appeared', value: `${stats.appeared}/${stats.appeared + stats.absent}` },
            ].map((x) => (
              <div key={x.label} className="rounded-lg bg-surface-container-low px-space-sm py-space-xs">
                <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{x.label}</dt>
                <dd className="font-title-lg text-title-lg text-on-surface tnum">{x.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-space-xs">
            <Badge tone="surface" icon={TYPE_ICON[assessment.type]}>
              {assessment.type}
            </Badge>
            {assessment.topicIds.map((id) => {
              const topic = lookups.topic.get(id);
              return topic ? (
                <Tag key={id} title={topic.chapter}>
                  {topic.name}
                </Tag>
              ) : null;
            })}
            {!assessment.topicIds.length && <span className="font-body-sm text-body-sm text-secondary">No topics tagged</span>}
          </div>

          <section>
            <h3 className="mb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">Scores · highest first</h3>
            <ol className="divide-y divide-surface-container-low rounded-lg border border-outline-variant/40">
              {ranked.map(({ sid, score, student, rank }) => {
                const ratio = score == null ? NaN : score / assessment.maxMarks;
                return (
                  <li key={sid} className="flex items-center gap-space-sm px-space-sm py-space-xs">
                    <span
                      className="w-6 shrink-0 text-center font-label-md text-label-md text-secondary tnum"
                      aria-label={rank ? `Rank ${rank}` : 'Absent'}
                    >
                      {rank || '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      {student ? (
                        <Link to={`/students/${sid}`} onClick={onClose} className="block rounded hover:bg-surface-container-low">
                          <PersonCell name={student.name} subtitle={student.id} photoUrl={student.photoUrl} size="sm" />
                        </Link>
                      ) : (
                        <span className="font-body-md text-body-md text-secondary">{sid}</span>
                      )}
                    </div>
                    {score == null ? (
                      <Badge tone="neutral" icon="event_busy">
                        Absent
                      </Badge>
                    ) : (
                      <>
                        <div className="hidden w-28 sm:block">
                          <ProgressBar
                            value={ratio}
                            tone="auto"
                            thresholds={{ danger: PASS_MARK, warning: 0.6 }}
                            label={`${student?.name} score`}
                          />
                        </div>
                        <span className="w-20 shrink-0 text-right font-label-lg text-label-lg text-on-surface tnum">
                          {score}/{assessment.maxMarks}
                          <span className="block font-body-sm text-body-sm text-secondary">{pct(ratio)}</span>
                        </span>
                        <GradeBadge ratio={ratio} />
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this assessment?"
        confirmLabel="Delete"
        message={
          <>
            <strong className="text-on-surface">{assessment.title}</strong> and all {Object.keys(assessment.scores).length} recorded scores
            will be removed from reports.
          </>
        }
      />
    </>
  );
}
