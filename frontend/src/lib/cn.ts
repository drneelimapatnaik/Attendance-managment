/**
 * Join class names, skipping falsy values.
 * Deliberately NOT tailwind-merge: our custom text tokens (text-label-md) and
 * colour tokens (text-on-surface) share the `text-` prefix and would be merged
 * away. Callers avoid passing conflicting classes instead.
 */
export type ClassValue = string | number | false | null | undefined | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (Array.isArray(v)) {
      const nested = cn(...v);
      if (nested) out.push(nested);
    } else {
      out.push(String(v));
    }
  }
  return out.join(' ');
}
