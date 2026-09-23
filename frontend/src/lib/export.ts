/**
 * Client-side exports (CSV opens directly in Excel / Google Sheets).
 * On native shells the WebView handles the download; the Capacitor
 * Filesystem/Share plugins can replace `downloadBlob` there later.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsv(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCsv(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCsv(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
}

export function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export rows as a UTF-8 CSV (with BOM so Excel detects the encoding). */
export function exportCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  downloadBlob('﻿' + toCsv(rows, columns), name, 'text/csv;charset=utf-8');
}
