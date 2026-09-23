/**
 * "Topics covered" multi-select chips from the batch's syllabus.
 *
 * A syllabus can run to 30+ topics, so by default only a window around the
 * batch's current (In-Progress) topic is shown — the one before it and the
 * next few — plus anything already selected. "All topics" expands the list.
 * Completed topics carry a tick so re-teaching is a conscious choice.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Batch, ID } from '@/types/domain';
import { Icon } from '@/components/ui';
import { useCan, useLookups, useScopedData } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { coverageProgress, syllabusFor } from '@/domain/academics';
import { cn } from '@/lib/cn';

interface TopicPickerProps {
  batch: Batch;
  value: ID[];
  onToggle: (topicId: ID) => void;
  readOnly?: boolean;
}

const BEFORE = 1;
const AFTER = 3;

export function TopicPicker({ batch, value, onToggle, readOnly }: TopicPickerProps) {
  const can = useCan();
  const topics = useDataStore((s) => s.topics);
  const { coverage } = useScopedData();
  const { subject } = useLookups();
  const [expanded, setExpanded] = useState(false);

  const { syllabus, status, currentIdx } = useMemo(() => {
    const list = syllabusFor(batch, topics);
    const progress = coverageProgress(batch, topics, coverage);
    const byTopic = new Map(coverage.filter((c) => c.batchId === batch.id).map((c) => [c.topicId, c.status]));
    const idx = list.findIndex((t) => t.id === progress.current?.id);
    // Whole syllabus done → centre the window on the last topics.
    return { syllabus: list, status: byTopic, currentIdx: idx === -1 ? list.length - 1 : idx };
  }, [batch, topics, coverage]);

  const shown = expanded
    ? syllabus
    : syllabus.filter((t, i) => value.includes(t.id) || (i >= currentIdx - BEFORE && i <= currentIdx + AFTER));
  const hidden = syllabus.length - shown.length;

  if (!syllabus.length) {
    return (
      <p className="rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm text-secondary">
        No syllabus topics for {subject.get(batch.subjectId)?.name ?? 'this subject'} · {batch.grade} yet.
        {can('topics.manage') && (
          <Link to="/topics" className="ml-1 font-semibold text-primary hover:underline">
            Add topics
          </Link>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between gap-space-xs">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">
          Topics covered <span className="tnum normal-case">({value.length} selected)</span>
        </span>
        {(hidden > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex min-h-9 items-center gap-0.5 font-label-md text-label-md text-primary hover:underline"
            aria-expanded={expanded}
          >
            {expanded ? 'Show fewer' : `All ${syllabus.length} topics`}
            <Icon name={expanded ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-space-2xs" role="group" aria-label="Topics covered in this class">
        {shown.map((t) => {
          const selected = value.includes(t.id);
          const done = status.get(t.id) === 'Completed';
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              disabled={readOnly}
              title={`${t.chapter} · ${t.name}${done ? ' (completed)' : ''}`}
              onClick={() => onToggle(t.id)}
              className={cn(
                'inline-flex h-10 max-w-full items-center gap-1 rounded-full border px-space-sm font-label-md text-label-md transition-colors disabled:cursor-default md:h-8',
                selected
                  ? 'border-primary-container bg-primary-fixed text-on-primary-fixed'
                  : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low',
              )}
            >
              <Icon
                name={selected ? 'check' : done ? 'task_alt' : 'add'}
                size={16}
                className={selected ? 'text-primary' : done ? 'text-success' : 'text-secondary'}
              />
              <span className="truncate">{t.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
