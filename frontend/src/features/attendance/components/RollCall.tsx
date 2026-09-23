/**
 * The live roll call for one batch on one date: class header, topics
 * covered, running tallies, the student list with P / L / A / E controls,
 * class notes and a sticky save bar.
 *
 * Mount keyed by `batchId|date` (see ClassAttendancePage) so switching class
 * resets local state. Unsaved changes block navigation until confirmed, and
 * unmarked students can only be saved after an explicit choice.
 */
import { useMemo, useState } from 'react';
import type { AttendanceMark, Batch, ISODate } from '@/types/domain';
import { Button, Card, ConfirmDialog, EmptyState, Icon, Modal, SearchInput, TextArea } from '@/components/ui';
import { useCan, useSettings } from '@/hooks/useTenant';
import { useToast, useUiStore } from '@/store/uiStore';
import { formatDate, formatLongDate, today } from '@/lib/date';
import { matchesQuery, pluralize } from '@/lib/format';
import { useRollCall } from '../useRollCall';
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard';
import { MarkCounters } from './MarkCounters';
import { RollCallHeader } from './RollCallHeader';
import { RollRow } from './RollRow';
import { SaveBar } from './SaveBar';
import { TopicPicker } from './TopicPicker';

interface RollCallProps {
  batch: Batch;
  date: ISODate;
}

export function RollCall({ batch, date }: RollCallProps) {
  const settings = useSettings();
  const can = useCan();
  const toast = useToast();
  const openModal = useUiStore((s) => s.openModal);
  const rc = useRollCall(batch, date);
  const readOnly = date > today();
  const blocker = useUnsavedChangesGuard(rc.dirty && !readOnly);

  const [query, setQuery] = useState('');
  const [askUnmarked, setAskUnmarked] = useState(false);

  const visible = useMemo(() => rc.roll.filter((s) => matchesQuery(query, s.name, s.id)), [rc.roll, query]);
  const total = rc.roll.length;
  const rollNo = useMemo(() => new Map(rc.roll.map((s, i) => [s.id, i])), [rc.roll]); // stable numbering while searching
  const threshold = settings.attendance.lowAttendanceThreshold;
  const lateAsPresent = settings.attendance.countLateAsPresent;
  const unmarkedStudents = rc.roll.filter((s) => !rc.marks[s.id]);

  const commit = (fillUnmarked?: AttendanceMark) => {
    const { counts, newlyAbsent } = rc.save(fillUnmarked);
    setAskUnmarked(false);
    const alerts = settings.attendance.notifyParentOnAbsence && newlyAbsent.length > 0;
    toast({
      title: counts.A ? `Attendance saved · ${counts.A} absent` : 'Attendance saved',
      description: alerts
        ? `SMS alerts queued to ${pluralize(newlyAbsent.length, 'parent')}.`
        : `${batch.name} · ${counts.P} present, ${counts.L} late${counts.E ? `, ${counts.E} excused` : ''}.`,
    });
  };

  const onSave = () => (rc.counts.unmarked > 0 ? setAskUnmarked(true) : commit());

  return (
    <div className="flex flex-col gap-space-md">
      <Card className="flex flex-col gap-space-md">
        <RollCallHeader batch={batch} session={rc.session} upcoming={readOnly} />
        {readOnly && (
          <div className="flex items-start gap-space-xs rounded-lg bg-tertiary-fixed p-space-sm text-on-tertiary-fixed">
            <Icon name="event_upcoming" className="mt-px" />
            <p className="font-body-md text-body-md">
              This class is on <strong>{formatLongDate(date)}</strong>. Attendance can be marked on the day — the roll below is a preview.
            </p>
          </div>
        )}
        <TopicPicker batch={batch} value={rc.topicIds} onToggle={rc.toggleTopic} readOnly={readOnly} />
        {!readOnly && total > 0 && <MarkCounters counts={rc.counts} total={total} />}
      </Card>

      <Card padded={false}>
        {total === 0 ? (
          <EmptyState
            icon="group_off"
            title="Nobody on this roll"
            description={`No active students were enrolled in ${batch.name} on ${formatDate(date)}.`}
            action={
              can('students.manage') ? (
                <Button icon="person_add" onClick={() => openModal({ type: 'student-form', batchId: batch.id })}>
                  Add student to {batch.name}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="flex flex-col gap-space-xs border-b border-outline-variant/30 p-space-sm sm:flex-row sm:items-center md:p-space-md">
              <SearchInput value={query} onChange={setQuery} placeholder="Search this roll…" containerClassName="min-w-0 flex-1" />
              {!readOnly && (
                <div className="flex gap-space-xs">
                  <Button
                    variant="tonal"
                    icon="done_all"
                    onClick={rc.markRestPresent}
                    disabled={!rc.counts.unmarked}
                    className="flex-1 sm:flex-none"
                  >
                    {rc.counts.unmarked === total ? 'Mark all present' : 'Mark rest present'}
                  </Button>
                  <Button variant="ghost" icon="restart_alt" onClick={rc.reset} disabled={!rc.dirty}>
                    Reset
                  </Button>
                </div>
              )}
            </div>
            {!readOnly && (
              <p className="hidden items-center gap-1 border-b border-outline-variant/30 px-space-md py-space-2xs font-body-sm text-body-sm text-secondary lg:flex">
                <Icon name="keyboard" size={16} />
                Tip: select a student and press <kbd className="font-semibold">P</kbd>, <kbd className="font-semibold">L</kbd>,{' '}
                <kbd className="font-semibold">A</kbd> or <kbd className="font-semibold">E</kbd> — focus moves to the next student.
              </p>
            )}
            {visible.length === 0 ? (
              <EmptyState compact icon="person_search" title="No students match" description={`Nobody on this roll matches “${query}”.`} />
            ) : (
              <ul aria-label={`${batch.name} roll call`} className="divide-y divide-surface-container-low">
                {visible.map((s) => (
                  <RollRow
                    key={s.id}
                    index={rollNo.get(s.id) ?? 0}
                    student={s}
                    batchId={batch.id}
                    mark={rc.marks[s.id]}
                    onMark={rc.setMark}
                    recent={rc.history.recent.get(s.id)}
                    streak={rc.history.streaks.get(s.id) ?? 0}
                    threshold={threshold}
                    lateAsPresent={lateAsPresent}
                    readOnly={readOnly}
                  />
                ))}
              </ul>
            )}
            <div className="border-t border-outline-variant/30 p-space-sm md:p-space-md">
              <TextArea
                label="Class notes"
                rows={2}
                value={rc.notes}
                onChange={(e) => rc.setNotes(e.target.value)}
                disabled={readOnly}
                placeholder="Homework set, substitutions, anything the office should know…"
              />
            </div>
          </>
        )}
      </Card>

      {!readOnly && total > 0 && (
        <SaveBar
          dirty={rc.dirty}
          saved={!!rc.session}
          counts={rc.counts}
          total={total}
          disabled={!rc.dirty && !!rc.session}
          onSave={onSave}
          onReset={rc.reset}
        />
      )}

      <Modal
        open={askUnmarked}
        onClose={() => setAskUnmarked(false)}
        size="md"
        title={`${pluralize(unmarkedStudents.length, 'student')} not marked`}
        description="Choose how to save the rest of the roll."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAskUnmarked(false)}>
              Keep marking
            </Button>
            {rc.counts.total > 0 && (
              <Button variant="tonal" onClick={() => commit()}>
                Save marked only
              </Button>
            )}
            <Button icon="person_off" onClick={() => commit('A')}>
              Mark absent &amp; save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-space-sm font-body-md text-body-md text-on-surface-variant">
          <p>
            Unmarked students can be recorded as <strong className="text-on-surface">Absent</strong>, or left off this session entirely
            (they won't count towards anyone's attendance %).
          </p>
          <ul className="flex flex-wrap gap-1">
            {unmarkedStudents.slice(0, 8).map((s) => (
              <li key={s.id} className="rounded-md bg-surface-container-low px-2 py-0.5 font-label-md text-label-md text-on-surface">
                {s.name}
              </li>
            ))}
            {unmarkedStudents.length > 8 && (
              <li className="px-1 py-0.5 font-label-md text-label-md text-secondary">+{unmarkedStudents.length - 8} more</li>
            )}
          </ul>
        </div>
      </Modal>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Discard unsaved attendance?"
        confirmLabel="Discard & leave"
        message={
          <>
            Your changes to <strong className="text-on-surface">{batch.name}</strong>'s roll call for {formatDate(date)} haven't been saved.
            Leave anyway?
          </>
        }
      />
    </div>
  );
}
