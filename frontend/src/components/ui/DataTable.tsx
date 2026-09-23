/**
 * DataTable — DESIGN.md › Attendance Grid & Tabular Views.
 *
 * - Sortable columns (click a header with `sortValue`)
 * - Built-in pagination footer
 * - Optional checkbox selection (pass `selection` from `useSelection`)
 * - Responsive: below `md`, rows render as stacked cards via `mobileCard`
 *   (DESIGN.md › Mobile: "Roster rows convert into vertical card stacks")
 *
 * Filtering stays with the caller — pass already-filtered `rows`.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePagination } from '@/hooks/ui';
import { Checkbox } from './Form';
import { Icon } from './Icon';
import { Pagination } from './Pagination';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'center' | 'right';
  className?: string; // applied to <td>
  headerClassName?: string;
  /** Hide below this breakpoint to keep the table scannable on tablets. */
  hideBelow?: 'lg' | 'xl' | '2xl';
}

interface Selection {
  isSelected: (key: string) => boolean;
  toggle: (key: string) => void;
  toggleAll: () => void;
  allSelected: boolean;
  indeterminate: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  selection?: Selection;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  mobileCard?: (row: T) => ReactNode;
  empty?: ReactNode;
  pageSize?: number; // 0 disables pagination
  entityLabel?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  className?: string;
  caption?: string; // accessible table description
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' };
const HIDE = { lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell', '2xl': 'hidden 2xl:table-cell' };

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selection,
  onRowClick,
  rowClassName,
  mobileCard,
  empty,
  pageSize = 10,
  entityLabel = 'records',
  initialSort,
  className,
  caption,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const dir = sort!.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
  }, [rows, columns, sort]);

  const pager = usePagination(sorted, pageSize || Math.max(sorted.length, 1));
  const visible = pageSize ? pager.pageItems : sorted;

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className={cn('card overflow-hidden', className)}>
      {rows.length === 0 ? (
        (empty ?? <div className="p-space-xl text-center text-secondary">Nothing to show.</div>)
      ) : (
        <>
          {/* Table: tablet & desktop (or always, when no mobile card renderer is given) */}
          <div className={cn('overflow-x-auto', mobileCard && 'hidden md:block')}>
            <table className="w-full text-left">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead>
                <tr className="bg-surface-container-low">
                  {selection && (
                    <th className="w-12 px-space-md py-space-sm text-center">
                      <Checkbox
                        aria-label="Select all"
                        checked={selection.allSelected}
                        indeterminate={selection.indeterminate}
                        onChange={selection.toggleAll}
                      />
                    </th>
                  )}
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={cn('th', ALIGN[c.align ?? 'left'], c.hideBelow && HIDE[c.hideBelow], c.headerClassName)}
                      >
                        {c.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={cn('inline-flex items-center gap-0.5 uppercase hover:text-on-surface', active && 'text-on-surface')}
                          >
                            {c.header}
                            <Icon
                              name={active ? (sort!.dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                              size={14}
                              className={active ? '' : 'opacity-40'}
                            />
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low">
                {visible.map((row) => {
                  const key = rowKey(row);
                  return (
                    <tr
                      key={key}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'group transition-colors hover:bg-surface-container-low/60',
                        onRowClick && 'cursor-pointer',
                        selection?.isSelected(key) && 'bg-primary-fixed/30',
                        rowClassName?.(row),
                      )}
                    >
                      {selection && (
                        <td className="px-space-md py-space-sm text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label={`Select row ${key}`}
                            checked={selection.isSelected(key)}
                            onChange={() => selection.toggle(key)}
                          />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} className={cn('td', ALIGN[c.align ?? 'left'], c.hideBelow && HIDE[c.hideBelow], c.className)}>
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards: phones */}
          {mobileCard && (
            <ul className="divide-y divide-surface-container-low md:hidden">
              {visible.map((row) => {
                const key = rowKey(row);
                return (
                  <li
                    key={key}
                    className={cn(
                      'flex items-start gap-space-sm p-space-md',
                      selection?.isSelected(key) && 'bg-primary-fixed/30',
                      rowClassName?.(row),
                    )}
                  >
                    {selection && (
                      <Checkbox
                        className="mt-1"
                        aria-label={`Select ${key}`}
                        checked={selection.isSelected(key)}
                        onChange={() => selection.toggle(key)}
                      />
                    )}
                    <div
                      className={cn('min-w-0 flex-1', onRowClick && 'cursor-pointer')}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {mobileCard(row)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {pageSize > 0 && (
            <Pagination
              page={pager.page}
              pageCount={pager.pageCount}
              pageSize={pager.pageSize}
              total={pager.total}
              from={pager.from}
              to={pager.to}
              onPageChange={pager.setPage}
              onPageSizeChange={pager.setPageSize}
              entityLabel={entityLabel}
            />
          )}
        </>
      )}
    </div>
  );
}
