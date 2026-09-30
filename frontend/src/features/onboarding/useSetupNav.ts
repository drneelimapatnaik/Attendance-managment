/**
 * Wizard navigation and the data the steps report progress from.
 *
 * The current step lives in the URL (`/setup?step=campuses`) so Back, Forward
 * and a refresh all behave, and a reload with no step resumes at the first
 * thing still missing (every step writes to the store as it is left).
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDataStore } from '@/store/dataStore';
import { SETUP_STEPS, isSetupStepId, resumeStep, stepAt, stepIndex, type SetupData, type SetupStep, type SetupStepId } from './setupStatus';

/** The slice of the store the first-run rules read. */
export function useSetupData(): SetupData {
  const settings = useDataStore((s) => s.settings);
  const subjects = useDataStore((s) => s.subjects);
  const staff = useDataStore((s) => s.staff);
  const batches = useDataStore((s) => s.batches);
  const students = useDataStore((s) => s.students);
  return useMemo(() => ({ settings, subjects, staff, batches, students }), [settings, subjects, staff, batches, students]);
}

export interface SetupNav {
  step: SetupStep;
  index: number;
  total: number;
  isFirst: boolean;
  /** True on the last step that collects anything (the closing screen follows). */
  isLastForm: boolean;
  /** True on the closing screen, where the primary action finishes setup. */
  isLast: boolean;
  goTo: (id: SetupStepId) => void;
  next: () => void;
  back: () => void;
}

/** `restart` opens at step 1 instead of resuming — used by "Re-run setup". */
export function useSetupNav(data: SetupData, opts: { restart?: boolean } = {}): SetupNav {
  const [params, setParams] = useSearchParams();
  const requested = params.get('step');
  const id: SetupStepId = isSetupStepId(requested) ? requested : opts.restart ? 'institute' : resumeStep(data);

  // Pin the resumed step into the URL so Back/refresh return to the same place.
  useEffect(() => {
    if (isSetupStepId(requested)) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('step', id);
        return next;
      },
      { replace: true },
    );
  }, [requested, id, setParams]);

  const goTo = useCallback(
    (to: SetupStepId) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('step', to);
        return next;
      });
      // A new step starts at the top, like a fresh page.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setParams],
  );

  const index = stepIndex(id);
  return {
    step: SETUP_STEPS[index],
    index,
    total: SETUP_STEPS.length,
    isFirst: index === 0,
    isLastForm: index === SETUP_STEPS.length - 2,
    isLast: index === SETUP_STEPS.length - 1,
    goTo,
    next: () => goTo(stepAt(index + 1)),
    back: () => goTo(stepAt(index - 1)),
  };
}
