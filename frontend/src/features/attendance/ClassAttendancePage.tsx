/**
 * Class Attendance — the live roll call, the most-used screen on phones.
 *
 * URL: /attendance?date=YYYY-MM-DD&batch=<id>[&all=1]
 *  - date defaults to today; batch defaults to the most relevant class
 *    (in progress → just finished and unmarked → next up), so a teacher who
 *    opens the screen lands on the right roll with zero taps.
 *  - faculty see their own classes by default; `all=1` shows everyone's.
 *
 * Layout: class picker in a side column on desktop, a horizontal strip above
 * the roll on phones/tablets. The roll call itself lives in <RollCall>, keyed
 * by batch+date so its unsaved state never leaks between classes.
 */
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ID, ISODate } from '@/types/domain';
import { ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { useCan, useCurrentUser, useScopedData } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { formatLongDate, minutesOf, nowTime, today } from '@/lib/date';
import { classEntriesFor, defaultClass, type ClassEntry } from './classSchedule';
import { ClassPicker } from './components/ClassPicker';
import { DateStepper } from './components/DateStepper';
import { RollCall } from './components/RollCall';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function ClassAttendancePage() {
  useDocumentTitle('Class Attendance');
  const can = useCan();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const { batches, sessions } = useScopedData();

  const todayDate = today();
  const nowMinutes = minutesOf(nowTime());
  const rawDate = params.get('date');
  const date: ISODate = rawDate && ISO_DATE.test(rawDate) ? rawDate : todayDate;
  const isFaculty = user?.role === 'faculty';
  const showAll = !isFaculty || params.get('all') === '1';

  const allEntries = useMemo(() => classEntriesFor(date, batches, sessions), [date, batches, sessions]);
  const mine = useMemo(() => allEntries.filter((e) => e.batch.facultyId === user?.id), [allEntries, user?.id]);
  const entries = showAll ? allEntries : mine;

  // A batch asked for in the URL that isn't in the list (another teacher's
  // class, or not timetabled today) is shown as an extra entry.
  const requestedId = params.get('batch');
  const requested = useMemo<ClassEntry | undefined>(() => {
    if (!requestedId) return undefined;
    const listed = allEntries.find((e) => e.batch.id === requestedId);
    if (listed) return listed;
    const batch = batches.find((b) => b.id === requestedId && b.status !== 'Archived');
    return batch && { batch, date, session: sessions.find((s) => s.batchId === batch.id && s.date === date), extra: true };
  }, [requestedId, allEntries, batches, sessions, date]);

  const shown = useMemo(() => (requested && !entries.includes(requested) ? [...entries, requested] : entries), [requested, entries]);
  const fallbackId = requested ? undefined : defaultClass(entries, todayDate, nowMinutes)?.batch.id;
  const selected = requested ?? entries.find((e) => e.batch.id === fallbackId);

  // Pin the auto-picked class into the URL. Otherwise saving it (or the clock
  // moving on) would change the default and swap the roll out from under the user.
  useEffect(() => {
    if (!fallbackId) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('batch', fallbackId);
        return next;
      },
      { replace: true },
    );
  }, [fallbackId, setParams]);

  const extraOptions = useMemo(() => {
    const listed = new Set(shown.map((e) => e.batch.id));
    return batches.filter((b) => b.status === 'Active' && !listed.has(b.id)).sort((a, b) => a.code.localeCompare(b.code));
  }, [batches, shown]);

  const update = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  const goToDate = (d: ISODate) => {
    // Keep the chosen batch only if it meets (or already has a session) on the new date.
    const keep = requestedId && classEntriesFor(d, batches, sessions).some((e) => e.batch.id === requestedId);
    update({ date: d === todayDate ? null : d, batch: keep ? requestedId : null });
  };
  const selectBatch = (id: ID) => update({ batch: id });

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Attendance"
        title="Class Attendance"
        meta={formatLongDate(date)}
        actions={
          <>
            <DateStepper value={date} onChange={goToDate} />
            {can('attendance.reports') && (
              <ButtonLink to="/reports/attendance" variant="tonal" icon="bar_chart" className="hidden sm:inline-flex">
                Reports
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-space-md lg:grid-cols-12 lg:gap-space-lg">
        <aside
          className="min-w-0 lg:sticky lg:top-[5.5rem] lg:col-span-4 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto xl:col-span-3"
          aria-label="Class picker"
        >
          <ClassPicker
            date={date}
            todayDate={todayDate}
            nowMinutes={nowMinutes}
            entries={shown}
            selectedId={selected?.batch.id}
            onSelect={selectBatch}
            extraOptions={extraOptions}
            facultyScope={
              isFaculty
                ? { showAll, mine: mine.length, all: allEntries.length, onChange: (all) => update({ all: all ? '1' : null, batch: null }) }
                : undefined
            }
          />
        </aside>
        <section className="min-w-0 lg:col-span-8 xl:col-span-9" aria-label="Roll call">
          {selected ? (
            <RollCall key={`${selected.batch.id}|${date}`} batch={selected.batch} date={date} />
          ) : (
            <Card>
              <EmptyState
                icon="event_available"
                title="No class selected"
                description="There are no classes on the timetable for this day. Pick another date, or record an extra class for any batch."
              />
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
