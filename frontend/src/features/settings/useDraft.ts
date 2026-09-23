/**
 * Local draft for one settings section.
 *
 * The draft starts as the saved value and is edited freely; `dirty` (draft ≠
 * saved) enables the section's Save button. When the saved value changes
 * underneath — after Save, or "Reset demo data" — the draft adopts it.
 * Values are compared structurally (JSON), so callers may pass fresh objects.
 */
import { useState } from 'react';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useDraft<T extends object>(saved: T) {
  const [draft, setDraft] = useState<T>(saved);
  const [base, setBase] = useState<T>(saved);

  // Saved value moved on: adopt it. Adjusting state while rendering is React's
  // documented pattern for resetting state when an input changes.
  if (!same(saved, base)) {
    setBase(saved);
    setDraft(saved);
  }

  return {
    draft,
    setDraft,
    patch: (p: Partial<T>) => setDraft((d) => ({ ...d, ...p })),
    dirty: !same(draft, saved),
    reset: () => setDraft(saved),
  };
}
