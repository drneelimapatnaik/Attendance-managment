/**
 * Filter bar for Attendance Reports: date-range preset (with from–to fields
 * for a custom range), grade and batch, plus reset. Values live in the URL
 * via useReportFilters.
 */
import { IconButton, SelectField, TextField } from '@/components/ui';
import { useScopedData } from '@/hooks/useTenant';
import { today } from '@/lib/date';
import { RANGE_OPTIONS, type RangeKey, type useReportFilters } from '../useAttendanceReport';

type FiltersApi = ReturnType<typeof useReportFilters>;

export function ReportFiltersBar({ api }: { api: FiltersApi }) {
  const { batches } = useScopedData();
  const { filters } = api;
  const grades = [...new Set(batches.map((b) => b.grade))].sort();
  const batchOptions = batches
    .filter((b) => b.status !== 'Upcoming' && (!filters.grade || b.grade === filters.grade))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((b) => ({ value: b.id, label: `${b.name} · ${b.title}${b.status === 'Archived' ? ' (archived)' : ''}` }));

  return (
    <div className="card flex flex-col gap-space-sm p-space-md">
      <div className="flex items-end gap-space-xs">
        <div className="grid flex-1 grid-cols-2 gap-space-xs sm:grid-cols-3">
          <SelectField
            containerClassName="col-span-2 sm:col-span-1"
            label="Date range"
            value={filters.range}
            onChange={(e) => api.setRange(e.target.value as RangeKey)}
            options={RANGE_OPTIONS}
          />
          <SelectField
            label="Grade"
            value={filters.grade}
            onChange={(e) => api.setGrade(e.target.value)}
            options={[{ value: '', label: 'All grades' }, ...grades.map((g) => ({ value: g, label: g }))]}
          />
          <SelectField
            label="Batch"
            value={filters.batch}
            onChange={(e) => api.setBatch(e.target.value)}
            options={[{ value: '', label: 'All batches' }, ...batchOptions]}
          />
        </div>
        <IconButton
          icon="filter_alt_off"
          label="Reset filters"
          disabled={!api.isFiltered}
          onClick={api.reset}
          className="shrink-0 bg-surface-container"
        />
      </div>
      {filters.range === 'custom' && (
        <div className="grid grid-cols-2 gap-space-xs sm:max-w-md">
          <TextField
            label="From"
            type="date"
            value={filters.window.from}
            max={filters.window.to}
            onChange={(e) => e.target.value && api.setCustom(e.target.value, filters.window.to)}
          />
          <TextField
            label="To"
            type="date"
            value={filters.window.to}
            min={filters.window.from}
            max={today()}
            onChange={(e) => e.target.value && api.setCustom(filters.window.from, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
