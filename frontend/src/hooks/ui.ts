/**
 * Generic UI hooks (no domain knowledge).
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

/** Reactive CSS media query, e.g. useMediaQuery('(min-width: 1024px)'). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Tailwind breakpoints as booleans. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useIsMobile = () => !useMediaQuery('(min-width: 768px)');

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Call `handler` on pointer-down outside `ref` (menus, popovers). */
export function useClickOutside(ref: RefObject<HTMLElement>, handler: () => void, enabled = true): void {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) saved.current();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [ref, enabled]);
}

/** Close on Escape while `enabled`. */
export function useEscape(handler: () => void, enabled = true): void {
  const saved = useRef(handler);
  saved.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && saved.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Sets the document title as "<title> · EduTrack". */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · EduTrack`;
  }, [title]);
}

/** Client-side pagination over an in-memory list. Resets to page 1 when the list changes size. */
export function usePagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => setPage(1), [items.length, pageSize]);
  const current = Math.min(page, pageCount);
  const pageItems = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);
  return {
    page: current,
    pageSize,
    pageCount,
    total: items.length,
    from: items.length ? (current - 1) * pageSize + 1 : 0,
    to: Math.min(current * pageSize, items.length),
    pageItems,
    setPage,
    setPageSize,
  };
}

/** Row selection for tables (checkbox column). */
export function useSelection<K extends string>(visibleKeys: K[]) {
  const [selected, setSelected] = useState<Set<K>>(new Set());
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const someSelected = visibleKeys.some((k) => selected.has(k));
  return {
    selected,
    count: selected.size,
    isSelected: (k: K) => selected.has(k),
    toggle: (k: K) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      }),
    toggleAll: () =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (allSelected) visibleKeys.forEach((k) => next.delete(k));
        else visibleKeys.forEach((k) => next.add(k));
        return next;
      }),
    clear: () => setSelected(new Set()),
    allSelected,
    indeterminate: someSelected && !allSelected,
  };
}
