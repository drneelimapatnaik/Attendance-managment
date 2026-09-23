/**
 * Report filters (all in the URL): batch, assessment type and a date range.
 * They drive every KPI, chart and table on the Performance page.
 */
import type { AssessmentType, Batch } from '@/types/domain';
import { Button, IconButton, SelectField, TextField } from '@/components/ui';
import { today } from '@/lib/date';
import { ASSESSMENT_TYPES, type PerfFilters, type SetPerfFilter } from '../usePerformance';

interface Props {
  filters: PerfFilters;
  setFilter: SetPerfFilter;
  batchOptions: Batch[];
  onReset: () => void;
  isFiltered: boolean;
}

export function PerformanceFilters({ filters, setFilter, batchOptions, onReset, isFiltered }: Props) {
  const rangeError = filters.from && filters.to && filters.from > filters.to ? '“From” is after “To”.' : undefined;
  return (
    <div className="card flex flex-col gap-space-sm p-space-md sm:flex-row sm:items-end sm:gap-space-xs">
      <div className="grid flex-1 grid-cols-2 gap-space-sm lg:grid-cols-4">
        <SelectField
          label="Batch"
          value={filters.batch}
          onChange={(e) => setFilter('batch', e.target.value)}
          options={[{ value: '', label: 'All batches' }, ...batchOptions.map((b) => ({ value: b.id, label: `${b.name} · ${b.title}` }))]}
        />
        <SelectField
          label="Assessment type"
          value={filters.type}
          onChange={(e) => setFilter('type', e.target.value as AssessmentType | '')}
          options={[{ value: '', label: 'All types' }, ...ASSESSMENT_TYPES.map((t) => ({ value: t, label: t }))]}
        />
        <TextField
          type="date"
          label="From"
          max={filters.to || today()}
          value={filters.from}
          onChange={(e) => setFilter('from', e.target.value)}
          error={rangeError}
        />
        <TextField
          type="date"
          label="To"
          min={filters.from || undefined}
          max={today()}
          value={filters.to}
          onChange={(e) => setFilter('to', e.target.value)}
        />
      </div>
      <IconButton
        icon="filter_alt_off"
        label="Reset filters"
        disabled={!isFiltered}
        onClick={onReset}
        className="hidden shrink-0 bg-surface-container sm:inline-flex"
      />
      {/* Phones: a full-width reset appears only while a filter is active. */}
      {isFiltered && (
        <Button variant="ghost" size="sm" icon="filter_alt_off" onClick={onReset} className="self-start sm:hidden">
          Reset filters
        </Button>
      )}
    </div>
  );
}
