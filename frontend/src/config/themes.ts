/**
 * Tenant brand themes. Each maps to a `[data-brand]` block in
 * src/styles/index.css that overrides the primary colour group only —
 * surfaces and status colours stay fixed so meaning never changes per tenant.
 */
import type { BrandTheme } from '@/types/domain';

export const BRAND_THEMES: { id: BrandTheme; label: string; swatch: string; metaColor: string }[] = [
  { id: 'royal', label: 'Royal Blue', swatch: '#1d4ed8', metaColor: '#0037b0' },
  { id: 'indigo', label: 'Indigo', swatch: '#4f46e5', metaColor: '#3730a3' },
  { id: 'teal', label: 'Teal', swatch: '#0f766e', metaColor: '#115e59' },
  { id: 'plum', label: 'Plum', swatch: '#7e22ce', metaColor: '#6b21a8' },
  { id: 'slate', label: 'Slate', swatch: '#334155', metaColor: '#1e293b' },
];

/** Apply a brand theme to the document (called on login and when settings change). */
export function applyBrandTheme(theme: BrandTheme): void {
  const root = document.documentElement;
  if (theme === 'royal') delete root.dataset.brand;
  else root.dataset.brand = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = BRAND_THEMES.find((t) => t.id === theme)?.metaColor;
  if (meta && color) meta.setAttribute('content', color);
}
