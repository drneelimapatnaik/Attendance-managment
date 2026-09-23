/**
 * Roster filter bar: search (name, ID, parent mobile) + batch, grade,
 * fee status and enrolment status selects + reset.
 */
import { DebouncedSearch, IconButton, SelectField } from '@/components/ui';
import { useScopedData } from '@/hooks/useTenant';
import type { RosterFilters } from '../useRoster';

interface RosterFiltersBarProps {
  filters: RosterFilters;
  setFilter: <K extends keyof RosterFilters>(key: K, value: RosterFilters[K]) => void;
  onReset: () => void;
  isFiltered: boolean;
}

export function RosterFiltersBar({ filters, setFilter, onReset, isFiltered }: RosterFiltersBarProps) {
  const { batches } = useScopedData();
  const grades = [...new Set(batches.map((b) => b.grade))].sort();
  const batchOptions = batches
    .filter((b) => b.status !== 'Archived')
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((b) => ({ value: b.id, label: `${b.name} (${b.title})` }));

  return (
    <div className="card flex flex-col items-stretch gap-space-sm p-space-md 2xl:flex-row 2xl:items-center">
      <DebouncedSearch
        value={filters.q}
        onCommit={(q) => setFilter('q', q)}
        placeholder="Search by Student Name, ID, or Parent Mobile..."
        className="flex-1"
      />
      <div className="flex items-center gap-space-xs">
        <div className="grid flex-1 grid-cols-2 gap-space-xs md:grid-cols-4 2xl:w-[44rem] 2xl:flex-none">
          <SelectField
            aria-label="Filter by batch"
            value={filters.batch}
            onChange={(e) => setFilter('batch', e.target.value)}
            options={[{ value: '', label: 'Batch: All Batches' }, ...batchOptions]}
          />
          <SelectField
            aria-label="Filter by grade"
            value={filters.grade}
            onChange={(e) => setFilter('grade', e.target.value)}
            options={[{ value: '', label: 'Grade: All Grades' }, ...grades.map((g) => ({ value: g, label: g }))]}
          />
          <SelectField
            aria-label="Filter by fee status"
            value={filters.fee}
            onChange={(e) => setFilter('fee', e.target.value as RosterFilters['fee'])}
            options={[
              { value: '', label: 'Fee Status: All' },
              { value: 'Paid', label: 'Paid (Clear)' },
              { value: 'Pending', label: 'Pending' },
              { value: 'Overdue', label: 'Overdue' },
            ]}
          />
          <SelectField
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value as RosterFilters['status'])}
            options={[
              { value: 'current', label: 'Status: Active Only' },
              { value: 'Active', label: 'Status: Attending' },
              { value: 'On Leave', label: 'Status: On Leave' },
              { value: 'Inactive', label: 'Status: Inactive' },
              { value: 'all', label: 'All Enrolled' },
            ]}
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
  );
}
