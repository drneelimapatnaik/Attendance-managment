/**
 * Class picker for the roll call.
 *
 * Desktop: a vertical list of class cards in a side column.
 * Phones/tablets: the same cards as a horizontal, snap-scrolling strip above
 * the roll so the roll itself stays in view.
 *
 * Also offers an "extra class" select (any other active batch) and, for
 * faculty, a "My classes / All" switch.
 */
import { useEffect, useRef } from 'react';
import type { Batch, ID, ISODate } from '@/types/domain';
import { EmptyState, Icon, SegmentedControl, SelectField, Tag } from '@/components/ui';
import { useLookups } from '@/hooks/useTenant';
import { formatTimeRange, weekdayOf } from '@/lib/date';
import { cn } from '@/lib/cn';
import { countRecords } from '@/domain/attendance';
import { classStatus, type ClassEntry } from '../classSchedule';
import { ClassStatusBadge } from './ClassStatusBadge';

interface ClassPickerProps {
  date: ISODate;
  todayDate: ISODate;
  nowMinutes: number;
  entries: ClassEntry[];
  selectedId?: ID;
  onSelect: (batchId: ID) => void;
  /** Active batches not in `entries`, offered as extra classes. */
  extraOptions: Batch[];
  /** Faculty only: whether "All classes" is showing, and how many are their own. */
  facultyScope?: { showAll: boolean; mine: number; all: number; onChange: (showAll: boolean) => void };
}

export function ClassPicker({ date, todayDate, nowMinutes, entries, selectedId, onSelect, extraOptions, facultyScope }: ClassPickerProps) {
  const { staff } = useLookups();
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the chosen class visible in the phone strip (e.g. when it was auto-picked).
  // Scrolls the strip only — never the page — so nothing jumps vertically.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-pressed="true"]')?.parentElement;
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    const offset = item.getBoundingClientRect().left - list.getBoundingClientRect().left;
    if (offset < 0 || offset + item.offsetWidth > list.clientWidth) list.scrollBy({ left: offset - 16 });
  }, [selectedId, date]);

  return (
    <div className="flex flex-col gap-space-sm lg:rounded-xl lg:bg-surface-container-lowest lg:p-space-md lg:shadow-level-1">
      <div className="flex items-center justify-between gap-space-xs">
        <h2 className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">
          Classes · {weekdayOf(date)} <span className="tnum">({entries.length})</span>
        </h2>
        {facultyScope && (
          <SegmentedControl<'mine' | 'all'>
            size="sm"
            ariaLabel="Which classes to show"
            value={facultyScope.showAll ? 'all' : 'mine'}
            onChange={(v) => facultyScope.onChange(v === 'all')}
            segments={[
              { value: 'mine', label: `Mine (${facultyScope.mine})` },
              { value: 'all', label: `All (${facultyScope.all})` },
            ]}
          />
        )}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl bg-surface-container-low">
          <EmptyState
            compact
            icon="event_busy"
            title={facultyScope && !facultyScope.showAll ? 'None of your classes meet today' : 'No classes on the timetable'}
            description="Pick a batch below to record an extra or make-up class."
          />
        </div>
      ) : (
        <ul
          ref={listRef}
          aria-label="Classes"
          className="scrollbar-none -mx-space-md flex snap-x snap-mandatory scroll-px-space-md gap-space-xs overflow-x-auto px-space-md pb-1 md:-mx-space-lg md:scroll-px-space-lg md:px-space-lg lg:mx-0 lg:snap-none lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {entries.map((entry) => {
            const { batch, session } = entry;
            const active = batch.id === selectedId;
            const status = classStatus(entry, todayDate, nowMinutes);
            const c = session ? countRecords(session.records) : null;
            return (
              <li key={batch.id} className="w-[15.5rem] shrink-0 snap-start lg:w-auto">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(batch.id)}
                  className={cn(
                    'flex h-full w-full flex-col gap-1 rounded-xl border p-space-sm text-left transition-colors',
                    active
                      ? 'border-primary-container bg-primary-fixed/50'
                      : 'border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low',
                  )}
                >
                  <span className="flex items-center justify-between gap-space-xs">
                    <span className="font-label-md text-label-md text-secondary tnum">
                      {formatTimeRange(session?.startTime ?? batch.startTime, session?.endTime ?? batch.endTime)}
                    </span>
                    {active && <Icon name="check_circle" size={18} filled className="text-primary" />}
                  </span>
                  <span className="flex items-center gap-space-2xs">
                    <span className="font-title-md text-title-md text-on-surface">{batch.name}</span>
                    {entry.extra && <Tag className="px-1.5 font-label-sm text-label-sm">Extra</Tag>}
                  </span>
                  <span className="truncate font-body-sm text-body-sm text-secondary">{batch.title}</span>
                  <span className="flex min-w-0 items-center gap-1 font-body-sm text-body-sm text-secondary">
                    <Icon name="meeting_room" size={14} />
                    <span className="truncate">
                      {batch.room} · {staff.get(batch.facultyId)?.name ?? 'Unassigned'}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-space-xs gap-y-1">
                    <ClassStatusBadge status={status} />
                    {c && (
                      <span className="font-label-md text-label-md text-on-surface-variant tnum">
                        {c.P} P · {c.L} L · {c.A} A{c.E ? ` · ${c.E} E` : ''}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {extraOptions.length > 0 && (
        <SelectField
          aria-label="Record an extra class for another batch"
          value=""
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          placeholder="+ Extra class…"
          options={extraOptions.map((b) => ({ value: b.id, label: `${b.name} · ${b.title}` }))}
        />
      )}
    </div>
  );
}
