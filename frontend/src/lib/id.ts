/** ID helpers for client-created records (the backend may replace them). */

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return prefix ? `${prefix}-${rand}` : rand;
}

/** Next sequential code: nextCode(['STU-1042', 'STU-1045'], 'STU') → 'STU-1046'. */
export function nextCode(existing: string[], prefix: string, start = 1000): string {
  const max = existing.reduce((m, code) => {
    const n = Number(code.replace(`${prefix}-`, ''));
    return Number.isFinite(n) && n > m ? n : m;
  }, start);
  return `${prefix}-${max + 1}`;
}
