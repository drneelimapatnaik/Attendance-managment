/**
 * Batches filter bar: search (code, title, room) + status, subject, grade and
 * faculty selects, a reset button and the Grid / List / Timetable switch.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Staff } from '@/types/domain';
import { IconButton, SearchInput, SegmentedControl, SelectField } from '@/components/ui';
import { useLookups, useScopedData } from '@/hooks/useTenant';
import { useDebouncedValue } from '@/hooks/ui';
import { useDataStore } from '@/store/dataStore';
import { pluralize } from '@/lib/format';
import type { BatchFilters, BatchView } from '../useBatches';

interface BatchFiltersBarProps {
  filters: BatchFilters;
  setFilter: <K extends keyof BatchFilters>(key: K, value: BatchFilters[K]) => void;
  onReset: () => void;
  isFiltered: boolean;
  view: BatchView;
  onViewChange: (view: BatchView) => void;
  resultCount: number;
}

export function BatchFiltersBar({ filters, setFilter, onReset, isFiltered, view, onViewChange, resultCount }: BatchFiltersBarProps) {
  const { batches } = useScopedData();
  const subjects = useDataStore((s) => s.subjects);
  const { staff } = useLookups();

  // Local text state keeps typing instant; the URL updates after a pause.
  const [q, setQ] = useState(filters.q);
  const debounced = useDebouncedValue(q, 250);
  useEffect(() => {
    if (debounced !== filters.q) setFilter('q', debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => setQ(filters.q), [filters.q]);

  const grades = useMemo(() => [...new Set(batches.map((b) => b.grade))].sort(), [batches]);
  // Only faculty who actually run a batch here are worth filtering by.
  const faculty = useMemo(
    () =>
      [...new Set(batches.map((b) => b.facultyId))]
        .map((id) => staff.get(id))
        .filter((s): s is Staff => !!s)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ value: s.id, label: s.name })),
    [batches, staff],
  );

  return (
    <div className="card flex flex-col gap-space-sm p-space-md">
      <div className="flex flex-col items-stretch gap-space-sm 2xl:flex-row 2xl:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search by batch code, title or room..." containerClassName="flex-1" />
        <div className="flex items-center gap-space-xs">
          <div className="grid flex-1 grid-cols-2 gap-space-xs md:grid-cols-4 2xl:w-[44rem] 2xl:flex-none">
            <SelectField
              aria-label="Filter by status"
              value={filters.status}
              onChange={(e) => setFilter('status', e.target.value as BatchFilters['status'])}
              options={[
                { value: 'Active', label: 'Status: Active' },
                { value: 'Upcoming', label: 'Status: Upcoming' },
                { value: 'Archived', label: 'Status: Archived' },
                { value: 'all', label: 'Status: All' },
              ]}
            />
            <SelectField
              aria-label="Filter by subject"
              value={filters.subject}
              onChange={(e) => setFilter('subject', e.target.value)}
              options={[{ value: '', label: 'Subject: All' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
            />
            <SelectField
              aria-label="Filter by grade"
              value={filters.grade}
              onChange={(e) => setFilter('grade', e.target.value)}
              options={[{ value: '', label: 'Grade: All' }, ...grades.map((g) => ({ value: g, label: g }))]}
            />
            <SelectField
              aria-label="Filter by faculty"
              value={filters.faculty}
              onChange={(e) => setFilter('faculty', e.target.value)}
              options={[{ value: '', label: 'Faculty: All' }, ...faculty]}
            />
          </div>
          <IconButton
            icon="filter_alt_off"
            label="Reset filters"
            disabled={!isFiltered}
            onClick={onReset}
            className="hidden shrink-0 bg-surface-container md:inline-flex"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-space-sm border-t border-surface-container-low pt-space-sm">
        <span className="font-label-md text-label-md text-secondary tnum" aria-live="polite">
          {pluralize(resultCount, 'batch', 'batches')}
          {isFiltered && (
            <button type="button" onClick={onReset} className="ml-space-xs text-primary hover:underline md:hidden">
              Reset
            </button>
          )}
        </span>
        <SegmentedControl<BatchView>
          ariaLabel="Batch view"
          value={view}
          onChange={onViewChange}
          segments={[
            { value: 'grid', icon: 'grid_view', label: <span className="hidden sm:inline">Grid</span>, ariaLabel: 'Grid view' },
            { value: 'list', icon: 'view_list', label: <span className="hidden sm:inline">List</span>, ariaLabel: 'List view' },
            {
              value: 'timetable',
              icon: 'calendar_view_week',
              label: <span className="hidden sm:inline">Timetable</span>,
              ariaLabel: 'Timetable view',
            },
          ]}
        />
      </div>
    </div>
  );
}
