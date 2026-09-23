/**
 * Search box whose value lives in the URL: typing stays instant (local state)
 * and the committed value updates after a short pause. Used by every list
 * screen whose search term is kept in the URL.
 */
import { useEffect, useState } from 'react';
import { SearchInput } from './Form';
import { useDebouncedValue } from '@/hooks/ui';

interface Props {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  className?: string;
}

export function DebouncedSearch({ value, onCommit, placeholder, className }: Props) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 250);
  useEffect(() => {
    if (debounced !== value) onCommit(debounced);
    // Only react to the debounced text; `value`/`onCommit` change on every URL update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // Follow external changes (reset button, back navigation).
  useEffect(() => setText(value), [value]);
  return <SearchInput value={text} onChange={setText} placeholder={placeholder} containerClassName={className} />;
}
