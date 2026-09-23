/**
 * Navigation map — single source of truth for the sidebar, the mobile bottom
 * bar and route permissions. Adding a page = add an entry here + a route in
 * src/app/router.tsx.
 */
import type { Permission } from '@/types/domain';

export interface NavItem {
  path: string;
  label: string;
  icon: string; // Material Symbols name
  permission: Permission;
  badge?: 'live';
  /** Shown as a tab in the mobile bottom bar (max 4; the 5th tab is "More"). */
  mobileTab?: boolean;
  /** Shorter label for the bottom bar. */
  shortLabel?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Main',
    items: [
      { path: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: 'dashboard', permission: 'dashboard.view', mobileTab: true },
      {
        path: '/attendance',
        label: 'Class Attendance',
        shortLabel: 'Attendance',
        icon: 'fact_check',
        permission: 'attendance.mark',
        badge: 'live',
        mobileTab: true,
      },
    ],
  },
  {
    title: 'Academic',
    items: [
      { path: '/batches', label: 'Batches & Classes', icon: 'class', permission: 'batches.view' },
      { path: '/students', label: 'Students Roster', shortLabel: 'Students', icon: 'groups', permission: 'students.view', mobileTab: true },
      { path: '/topics', label: 'Topic Coverage', icon: 'menu_book', permission: 'topics.manage' },
    ],
  },
  {
    title: 'Finance',
    items: [{ path: '/fees', label: 'Fee Management', shortLabel: 'Fees', icon: 'payments', permission: 'fees.view', mobileTab: true }],
  },
  {
    title: 'Analytics & Reports',
    items: [
      { path: '/reports/attendance', label: 'Attendance Reports', icon: 'bar_chart', permission: 'attendance.reports' },
      { path: '/reports/performance', label: 'Performance', icon: 'trending_up', permission: 'performance.view' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { path: '/faculty', label: 'Faculty & Roles', icon: 'badge', permission: 'faculty.manage' },
      { path: '/settings', label: 'Institute Settings', icon: 'corporate_fare', permission: 'settings.manage' },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);
