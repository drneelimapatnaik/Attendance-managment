/**
 * First-run rules — pure, so they can be unit-tested and reused by the guard,
 * the wizard and the first-run empty states.
 *
 * "Is this institute set up?" is answered by one flag on the institute
 * settings (`setupCompletedAt`), written when the owner finishes (or skips
 * through) the wizard. Everything else here is progress reporting: which steps
 * already have real content, so a refresh resumes where the owner left off and
 * the Done checklist can tick items off.
 */
import type { DataSnapshot, InstituteSettings } from '@/types/domain';

/* ------------------------------------------------------------------- Steps */

export type SetupStepId = 'institute' | 'branding' | 'campuses' | 'academics' | 'rules' | 'team' | 'done';

export interface SetupStep {
  id: SetupStepId;
  /** Nav label, e.g. "Academics". */
  label: string;
  icon: string;
  /** Heading shown above the step's fields. */
  title: string;
  /** One line explaining why the step exists. */
  description: string;
  /** Optional steps can be skipped with a nudge; required ones block Next. */
  optional: boolean;
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'institute',
    label: 'Institute',
    icon: 'apartment',
    title: 'Your institute',
    description: 'The name, contact details and academic year everything else is stamped with.',
    optional: false,
  },
  {
    id: 'branding',
    label: 'Branding',
    icon: 'palette',
    title: 'Make it yours',
    description: 'Pick your brand colour and add your logo. Staff and parents see this everywhere.',
    optional: true,
  },
  {
    id: 'campuses',
    label: 'Campuses',
    icon: 'location_city',
    title: 'Where you teach',
    description: 'At least one campus. Add branches now or later — each keeps its own batches.',
    optional: false,
  },
  {
    id: 'academics',
    label: 'Academics',
    icon: 'menu_book',
    title: 'Grades & subjects',
    description: 'What you teach, so batches and the syllabus have something to hang from.',
    optional: true,
  },
  {
    id: 'rules',
    label: 'Rules',
    icon: 'rule_settings',
    title: 'Attendance & fee rules',
    description: 'How arrivals are marked, when invoices fall due and how receipts are numbered.',
    optional: true,
  },
  {
    id: 'team',
    label: 'Your team',
    icon: 'group_add',
    title: 'Invite your team',
    description: 'Give teachers and office staff their own sign-in, with a role each.',
    optional: true,
  },
  {
    id: 'done',
    label: 'Finish',
    icon: 'flag',
    title: "You're ready",
    description: 'A short checklist to get your first classes running.',
    optional: true,
  },
];

export const SETUP_STEP_IDS: SetupStepId[] = SETUP_STEPS.map((s) => s.id);
/** Steps the owner fills in — "done" is the closing screen, not a form. */
export const LAST_FORM_STEP: SetupStepId = 'team';

export function stepIndex(id: SetupStepId): number {
  const i = SETUP_STEP_IDS.indexOf(id);
  return i < 0 ? 0 : i;
}

export function stepAt(index: number): SetupStepId {
  return SETUP_STEP_IDS[Math.min(Math.max(index, 0), SETUP_STEP_IDS.length - 1)];
}

export function isSetupStepId(value: string | null | undefined): value is SetupStepId {
  return !!value && SETUP_STEP_IDS.includes(value as SetupStepId);
}

/* -------------------------------------------------------------- Is it set up? */

/**
 * The single question the router asks. A blank or missing `setupCompletedAt`
 * means this is a freshly provisioned institute that nobody has configured.
 */
export function isSetupComplete(settings: Pick<InstituteSettings, 'setupCompletedAt'> | undefined | null): boolean {
  return !!settings?.setupCompletedAt && settings.setupCompletedAt.trim().length > 0;
}

/** The data the first-run rules look at (a slice of the store). */
export type SetupData = Pick<DataSnapshot, 'settings' | 'subjects' | 'staff' | 'batches' | 'students'>;

/**
 * True while the institute has no teaching data at all, whether or not setup
 * was finished — this is what the first-run empty states key off.
 */
export function isFirstRun(data: Pick<SetupData, 'batches' | 'students'>): boolean {
  return data.batches.length === 0 && data.students.length === 0;
}

/* --------------------------------------------------------------- Progress */

/** Has this step got real content yet? Used for ticks and for resuming. */
export function isStepDone(id: SetupStepId, data: SetupData): boolean {
  const { settings } = data;
  switch (id) {
    case 'institute':
      // The name and a way to reach the institute are the minimum.
      return settings.name.trim().length >= 2 && settings.contactEmail.trim().length > 0;
    case 'branding':
      // A logo is the only thing that is not defaulted, so it marks the step.
      return !!settings.logoUrl;
    case 'campuses':
      return settings.campuses.length > 0;
    case 'academics':
      return data.subjects.length > 0;
    case 'rules':
      // Rules always hold working values; the owner confirming them is the flag.
      return isSetupComplete(settings);
    case 'team':
      return data.staff.filter((s) => !s.isOwner).length > 0;
    case 'done':
      return isSetupComplete(settings);
  }
}

/** Steps that must have content before setup can be called finished. */
export const REQUIRED_STEPS: SetupStepId[] = SETUP_STEPS.filter((s) => !s.optional).map((s) => s.id);

/** Required steps still missing content, in wizard order. */
export function missingRequiredSteps(data: SetupData): SetupStepId[] {
  return REQUIRED_STEPS.filter((id) => !isStepDone(id, data));
}

/**
 * Where to drop the owner when they open /setup without asking for a step:
 * the first required step with nothing in it, else the first empty optional
 * step, else the closing screen.
 */
export function resumeStep(data: SetupData): SetupStepId {
  // Already finished: there is nothing to resume (a re-run starts at step 1 —
  // see useSetupNav's `restart`).
  if (isSetupComplete(data.settings)) return 'done';
  const required = missingRequiredSteps(data);
  if (required.length) return required[0];
  const pending = SETUP_STEPS.find((s) => s.id !== 'done' && !isStepDone(s.id, data));
  return pending?.id ?? 'done';
}

/** How far along the wizard is, as 0–1, counting the form steps only. */
export function setupProgress(data: SetupData): number {
  const form = SETUP_STEPS.filter((s) => s.id !== 'done');
  return form.filter((s) => isStepDone(s.id, data)).length / form.length;
}

/* ------------------------------------------------- "Finish later" (session) */

const DEFER_KEY = 'edutrack:setup-deferred';

/**
 * Let an owner leave the wizard and look around without finishing it. The
 * redirect is suppressed for this browser session only, so the next sign-in
 * lands back in setup until it is actually completed.
 */
export function deferSetup(): void {
  try {
    sessionStorage.setItem(DEFER_KEY, '1');
  } catch {
    // Storage blocked (private mode): the owner simply gets sent back to /setup.
  }
}

export function clearSetupDeferral(): void {
  try {
    sessionStorage.removeItem(DEFER_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

export function isSetupDeferred(): boolean {
  try {
    return sessionStorage.getItem(DEFER_KEY) === '1';
  } catch {
    return false;
  }
}
