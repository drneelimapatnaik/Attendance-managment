/**
 * Navigation for the student & parent app. Fees are parent-only; everything
 * else is shared. The first five visible items become the bottom tab bar.
 */
import type { PortalRole } from '@/types/domain';

export interface PortalNavItem {
  path: string;
  label: string;
  shortLabel?: string;
  icon: string;
  /** Limit the entry to one kind of account (omitted = both). */
  role?: PortalRole;
  /** Shown in the bottom tab bar (otherwise only in the "More" sheet). */
  tab?: boolean;
}

export const PORTAL_NAV: PortalNavItem[] = [
  { path: '/portal', label: 'Home', icon: 'home', tab: true },
  { path: '/portal/attendance', label: 'Attendance', icon: 'fact_check', tab: true },
  { path: '/portal/results', label: 'Results', icon: 'trending_up', tab: true },
  { path: '/portal/fees', label: 'Fees', icon: 'payments', role: 'parent', tab: true },
  { path: '/portal/syllabus', label: 'Syllabus', icon: 'menu_book', tab: true },
  { path: '/portal/timetable', label: 'Timetable', icon: 'calendar_month' },
  { path: '/portal/profile', label: 'Account', icon: 'person' },
];

export function portalNavFor(role: PortalRole | undefined): PortalNavItem[] {
  return PORTAL_NAV.filter((i) => !i.role || i.role === role);
}
