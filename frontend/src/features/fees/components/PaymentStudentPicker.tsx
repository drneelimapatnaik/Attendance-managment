/**
 * Searchable student picker for Record Payment. With no query it lists only
 * students who owe money (overdue first, then largest balance); a query
 * searches everyone in the campus by name, ID, card number or parent mobile.
 */
import { useMemo, useState } from 'react';
import type { ID } from '@/types/domain';
import { Badge, Icon, SearchInput } from '@/components/ui';
import { FeeStatusBadge, PersonCell } from '@/components/domain';
import { useFeeIndex, useScopedData } from '@/hooks/useTenant';
import { feeSummaryFor } from '@/domain/fees';
import { matchesQuery } from '@/lib/format';
import { cn } from '@/lib/cn';

const MAX_RESULTS = 50;

interface Props {
  onPick: (studentId: ID) => void;
  error?: string;
}

export function PaymentStudentPicker({ onPick, error }: Props) {
  const { students } = useScopedData();
  const feeIndex = useFeeIndex();
  const [query, setQuery] = useState('');

  const ranked = useMemo(
    () =>
      students
        .map((s) => ({ s, fee: feeSummaryFor(feeIndex, s.id) }))
        .sort((a, b) => b.fee.overdue - a.fee.overdue || b.fee.outstanding - a.fee.outstanding || a.s.name.localeCompare(b.s.name)),
    [students, feeIndex],
  );
  const withDues = useMemo(() => ranked.filter((r) => r.fee.outstanding > 0), [ranked]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return withDues.slice(0, MAX_RESULTS);
    const digits = q.replace(/\D/g, '');
    return ranked
      .filter(
        ({ s }) =>
          matchesQuery(q, s.name, s.id, s.cardNo, s.guardian.name) ||
          (digits.length >= 3 && s.guardian.phone.replace(/\D/g, '').includes(digits)),
      )
      .slice(0, MAX_RESULTS);
  }, [query, ranked, withDues]);

  return (
    <div className="flex flex-col gap-space-xs">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search by name, student ID or parent mobile…"
        aria-invalid={!!error}
        className={cn(error && 'field-invalid')}
      />
      <p className="font-body-sm text-body-sm text-secondary">
        {query.trim()
          ? `${results.length}${results.length === MAX_RESULTS ? '+' : ''} matching students`
          : `${withDues.length} students with dues · overdue first`}
      </p>
      {results.length === 0 ? (
        <p className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-secondary">
          {query.trim() ? 'No students match this search.' : 'No outstanding dues — every student is paid up.'}
        </p>
      ) : (
        <ul
          aria-label="Students"
          className="max-h-72 divide-y divide-surface-container-low overflow-y-auto rounded-lg border border-outline-variant/50"
        >
          {results.map(({ s, fee }) => {
            const owes = fee.outstanding > 0;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s.id)}
                  disabled={!owes}
                  className="flex min-h-[52px] w-full items-center gap-space-sm px-space-sm py-space-xs text-left transition-colors hover:bg-surface-container-low focus-visible:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <PersonCell size="sm" name={s.name} photoUrl={s.photoUrl} subtitle={`${s.id} · ${s.grade}`} />
                  </div>
                  {owes ? (
                    <FeeStatusBadge status={fee.status} amount={fee.outstanding} />
                  ) : (
                    <Badge tone="neutral" icon="check">
                      No dues
                    </Badge>
                  )}
                  {owes && <Icon name="chevron_right" size={18} className="hidden text-secondary sm:block" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="flex items-center gap-1 font-body-sm text-body-sm text-error">
          <Icon name="error" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}
