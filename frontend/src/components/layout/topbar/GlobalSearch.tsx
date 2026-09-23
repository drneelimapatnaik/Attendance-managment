/**
 * Global search: students (name, ID, card, parent phone), batches, topics and
 * staff. Ctrl/⌘+K focuses it; ↑/↓ + Enter navigate results.
 * On phones it opens as a full-screen overlay from the search icon.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataStore } from '@/store/dataStore';
import { Avatar, Icon, IconButton } from '@/components/ui';
import { useClickOutside, useDebouncedValue } from '@/hooks/ui';
import { matchesQuery } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Result {
  id: string;
  group: 'Students' | 'Batches' | 'Topics' | 'Staff';
  title: string;
  subtitle: string;
  to: string;
  icon?: string;
  avatarName?: string;
}

function useSearchResults(query: string): Result[] {
  const students = useDataStore((s) => s.students);
  const batches = useDataStore((s) => s.batches);
  const topics = useDataStore((s) => s.topics);
  const staff = useDataStore((s) => s.staff);
  return useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const digits = q.replace(/\D/g, '');
    const out: Result[] = [];
    students
      .filter(
        (s) =>
          matchesQuery(q, s.name, s.id, s.cardNo, s.guardian.name) ||
          (digits.length >= 4 && s.guardian.phone.replace(/\D/g, '').includes(digits)),
      )
      .slice(0, 6)
      .forEach((s) =>
        out.push({
          id: s.id,
          group: 'Students',
          title: s.name,
          subtitle: `${s.id} · ${s.grade} · ${s.guardian.phone}`,
          to: `/students/${s.id}`,
          avatarName: s.name,
        }),
      );
    batches
      .filter((b) => matchesQuery(q, b.name, b.code, b.title, b.room))
      .slice(0, 4)
      .forEach((b) =>
        out.push({
          id: b.id,
          group: 'Batches',
          title: `${b.name} · ${b.title}`,
          subtitle: `${b.grade} · ${b.room}`,
          to: `/batches/${b.id}`,
          icon: 'class',
        }),
      );
    topics
      .filter((t) => matchesQuery(q, t.name, t.chapter))
      .slice(0, 4)
      .forEach((t) =>
        out.push({
          id: t.id,
          group: 'Topics',
          title: t.name,
          subtitle: `${t.grade} · ${t.chapter}`,
          to: `/topics?topic=${t.id}`,
          icon: 'menu_book',
        }),
      );
    staff
      .filter((s) => matchesQuery(q, s.name, s.email, s.title))
      .slice(0, 3)
      .forEach((s) =>
        out.push({ id: s.id, group: 'Staff', title: s.name, subtitle: s.title, to: `/faculty?staff=${s.id}`, avatarName: s.name }),
      );
    return out;
  }, [query, students, batches, topics, staff]);
}

function ResultsList({
  results,
  activeIndex,
  onPick,
  query,
}: {
  results: Result[];
  activeIndex: number;
  onPick: (r: Result) => void;
  query: string;
}) {
  if (query.trim().length < 2) {
    return (
      <p className="px-space-md py-space-md font-body-md text-body-md text-secondary">
        Type at least 2 characters — names, IDs, phone numbers, batches or topics.
      </p>
    );
  }
  if (!results.length) {
    return <p className="px-space-md py-space-md font-body-md text-body-md text-secondary">No matches for “{query}”.</p>;
  }
  let lastGroup = '';
  return (
    <ul role="listbox" className="max-h-[60vh] overflow-y-auto py-1">
      {results.map((r, i) => {
        const header = r.group !== lastGroup ? r.group : null;
        lastGroup = r.group;
        return (
          <li key={`${r.group}-${r.id}`}>
            {header && (
              <p className="px-space-md pb-1 pt-2 font-label-sm text-label-sm uppercase tracking-wider text-secondary">{header}</p>
            )}
            <button
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r)}
              className={cn(
                'flex w-full items-center gap-space-xs px-space-md py-2 text-left',
                i === activeIndex ? 'bg-surface-container-low' : 'hover:bg-surface-container-low',
              )}
            >
              {r.avatarName ? (
                <Avatar name={r.avatarName} size="sm" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-primary">
                  <Icon name={r.icon ?? 'search'} size={18} />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate font-label-lg text-label-lg text-on-surface">{r.title}</span>
                <span className="block truncate font-body-sm text-body-sm text-secondary">{r.subtitle}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(query, 120);
  const results = useSearchResults(debounced);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  useEffect(() => setActive(0), [debounced]);

  // Ctrl/⌘ + K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.matchMedia('(min-width: 768px)').matches) inputRef.current?.focus();
        else setMobileOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pick = (r: Result) => {
    navigate(r.to);
    setQuery('');
    setOpen(false);
    setMobileOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results[active]) {
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setMobileOpen(false);
    }
  };

  return (
    <>
      {/* Desktop / tablet inline search */}
      <div ref={wrapRef} className="relative hidden max-w-md flex-1 md:block">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search student, batch, topic..."
          aria-label="Search students, batches and topics"
          className="h-10 w-full rounded-lg border border-outline-variant/40 bg-surface pl-10 pr-14 font-body-md text-body-md text-on-surface transition-all placeholder:text-secondary focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-outline-variant/60 px-1.5 font-label-sm text-label-sm text-secondary xl:block">
          Ctrl K
        </kbd>
        {open && query && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 animate-fade-in overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-level-2">
            <ResultsList results={results} activeIndex={active} onPick={pick} query={debounced} />
          </div>
        )}
      </div>

      {/* Phone: icon → full-screen overlay */}
      <IconButton icon="search" label="Search" className="md:hidden" onClick={() => setMobileOpen(true)} />
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[95] flex flex-col bg-surface-container-lowest pt-safe md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div className="flex items-center gap-space-xs border-b border-outline-variant/30 p-space-xs">
            <IconButton icon="arrow_back" label="Close search" onClick={() => setMobileOpen(false)} />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search student, batch, topic..."
              className="h-11 flex-1 bg-transparent font-body-lg text-body-lg text-on-surface outline-none placeholder:text-secondary"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            <ResultsList results={results} activeIndex={active} onPick={pick} query={debounced} />
          </div>
        </div>
      )}
    </>
  );
}
