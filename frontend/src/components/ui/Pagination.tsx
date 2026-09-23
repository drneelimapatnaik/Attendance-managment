/**
 * Table footer: "Showing 1 – 10 of 342 students · Rows per page" + page buttons.
 * Page list collapses with ellipses: 1 2 3 … 35.
 */
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  entityLabel?: string;
  pageSizeOptions?: number[];
}

function pageList(page: number, count: number): (number | '…')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, 2, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  if (page <= 3) [3, 4].forEach((p) => set.add(p));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  from,
  to,
  onPageChange,
  onPageSizeChange,
  entityLabel = 'records',
  pageSizeOptions = [10, 25, 50],
}: PaginationProps) {
  return (
    <div className="flex flex-col items-center justify-between gap-space-sm p-space-md sm:flex-row">
      <div className="flex items-center gap-space-xs font-body-sm text-body-sm text-secondary">
        <span>Showing</span>
        <span className="font-semibold text-on-surface tnum">
          {from} – {to}
        </span>
        <span>of</span>
        <span className="font-semibold text-on-surface tnum">{total}</span>
        <span>{entityLabel}</span>
        {onPageSizeChange && (
          <>
            <span className="mx-2 hidden h-4 w-px bg-surface-container sm:block" />
            <label className="hidden items-center gap-space-xs md:flex">
              Rows per page:
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="cursor-pointer rounded bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface outline-none"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-secondary hover:text-on-surface disabled:pointer-events-none disabled:opacity-40"
          >
            <Icon name="chevron_left" size={18} />
          </button>
          {pageList(page, pageCount).map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1 text-secondary">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPageChange(p)}
                className={cn(
                  'h-9 min-w-9 rounded-lg px-1 font-label-md text-label-md tnum transition-colors',
                  p === page ? 'bg-primary font-semibold text-on-primary' : 'text-on-surface-variant hover:bg-surface-container',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-secondary hover:text-on-surface disabled:pointer-events-none disabled:opacity-40"
          >
            <Icon name="chevron_right" size={18} />
          </button>
        </nav>
      )}
    </div>
  );
}
