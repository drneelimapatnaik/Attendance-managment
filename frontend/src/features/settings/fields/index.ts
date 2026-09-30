/**
 * Shared settings field groups.
 *
 * Presentational field sets plus their validators, so the same inputs and the
 * same rules serve both Institute Settings (section cards that save one at a
 * time) and the first-run setup wizard (features/onboarding), which collects
 * many of the same values.
 */
export { LogoField } from './LogoField';
export { ProfileFields, validateProfile, type ProfileDraft, type ProfileErrors } from './ProfileFields';
export { BrandPreview, BrandThemePicker, brandLabel } from './BrandPicker';
export { CampusEditor, type CampusEditing } from './CampusEditor';
export { AttendanceRuleFields, validateAttendance, type AttendanceDraft, type AttendanceErrors } from './AttendanceRuleFields';
export { FeeRuleFields, validateFees, type BillingMode, type FeesDraft, type FeesErrors } from './FeeRuleFields';
export { CURRENCIES, EMAIL_RE, PHONE_RE, TIMEZONES, YEAR_RE, intInRange, isAmount, timezoneOptions } from '../sections/fieldRules';
