/**
 * Route guards for the first-run wizard (wired up in app/router.tsx).
 *
 *  <RequireSetupDone>   wraps the app shell: an owner/admin who lands in an
 *                       institute that is not set up is taken to /setup.
 *  <RequireSetupAccess> wraps /setup itself: only signed-in staff who may
 *                       manage settings can open it, and an institute that is
 *                       already set up goes to the dashboard — unless it asked
 *                       to walk through again (Institute Settings › Re-run
 *                       setup links to /setup?rerun=1, which leaves the
 *                       "already set up" flag alone so nobody gets locked into
 *                       the wizard).
 *
 * Staff who cannot manage settings are never redirected: they get the normal
 * app with first-run empty states telling them what their administrator has
 * still to do.
 */
import type { ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useCan, useSettings } from '@/hooks/useTenant';
import { isSetupComplete, isSetupDeferred } from './setupStatus';

export function RequireSetupDone({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const can = useCan();
  const intercept = !isSetupComplete(settings) && can('settings.manage') && !isSetupDeferred();
  if (intercept) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export function RequireSetupAccess({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const can = useCan();
  const [params] = useSearchParams();
  const rerun = params.get('rerun') === '1';
  if (!can('settings.manage')) return <Navigate to="/dashboard" replace />;
  if (isSetupComplete(settings) && !rerun) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
