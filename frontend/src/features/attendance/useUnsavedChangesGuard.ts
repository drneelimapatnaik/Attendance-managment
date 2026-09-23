/**
 * Guards unsaved work against accidental navigation:
 *  - in-app navigation (links, back button, changing ?batch= / ?date=) is
 *    paused with react-router's `useBlocker` so the page can ask first;
 *  - closing / reloading the tab triggers the browser's own prompt.
 *
 * Returns the blocker; render a confirm dialog while `state === 'blocked'`
 * and call `proceed()` or `reset()`.
 */
import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useUnsavedChangesGuard(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // required by some browsers to show the prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // If the changes get saved while a navigation is paused, let it through.
  useEffect(() => {
    if (blocker.state === 'blocked' && !dirty) blocker.proceed();
  }, [blocker, dirty]);

  return blocker;
}
