/**
 * Institute Settings sections, in page order. Drives the sticky section nav
 * (lg+), the phone chip bar and the section anchors.
 */
export const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Institute profile', icon: 'apartment' },
  { id: 'branding', label: 'Branding', icon: 'palette' },
  { id: 'campuses', label: 'Campuses', icon: 'location_city' },
  { id: 'attendance', label: 'Attendance rules', icon: 'fact_check' },
  { id: 'fees', label: 'Fees & billing', icon: 'payments' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'working-days', label: 'Working days', icon: 'calendar_month' },
  { id: 'subscription', label: 'Subscription', icon: 'workspace_premium' },
  { id: 'data', label: 'Data & privacy', icon: 'shield' },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

export const SECTION_IDS: SettingsSectionId[] = SETTINGS_SECTIONS.map((s) => s.id);
