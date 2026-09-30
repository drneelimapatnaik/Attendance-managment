/**
 * First-run setup (/setup) — where the owner of a brand-new institute lands
 * after activating their account (docs/HOSTING.md).
 *
 * A full-screen wizard rather than an app screen: there is nothing to navigate
 * to yet, so the app frame would only be noise. Seven steps, each saving to the
 * store as it is left, with the step in the URL so refresh, Back and Forward all
 * resume where the owner was. Guarded in app/router.tsx: staff who cannot manage
 * settings never see it, and an institute already set up is sent to the dashboard.
 */
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Icon, Toaster } from '@/components/ui';
import { useCurrentUser, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { signOut } from '@/services/auth';
import { SetupProgress } from './components/SetupProgress';
import { AcademicsStep } from './steps/AcademicsStep';
import { BrandingStep } from './steps/BrandingStep';
import { CampusesStep } from './steps/CampusesStep';
import { DoneStep } from './steps/DoneStep';
import { InstituteStep } from './steps/InstituteStep';
import { RulesStep } from './steps/RulesStep';
import { TeamStep } from './steps/TeamStep';
import { deferSetup } from './setupStatus';
import { useSetupData, useSetupNav } from './useSetupNav';

export default function SetupWizardPage() {
  useDocumentTitle('Set up your institute');
  const navigate = useNavigate();
  const settings = useSettings();
  const user = useCurrentUser();
  const data = useSetupData();
  // Institute Settings › Re-run setup arrives with ?rerun=1: start at step 1
  // and leave by the same door (Settings), since setup is already finished.
  const [params] = useSearchParams();
  const rerun = params.get('rerun') === '1';
  const nav = useSetupNav(data, { restart: rerun });

  // Looking around before finishing: allowed for this session only, so the
  // next sign-in lands back here until setup is actually completed.
  const leave = () => {
    if (rerun) {
      navigate('/settings', { replace: true });
      return;
    }
    deferSetup();
    navigate('/dashboard', { replace: true });
  };
  const leaveLabel = rerun ? 'Exit setup' : 'Finish later';
  // Nothing to leave to on step 1 of a first run: the institute has no name yet.
  const canLeave = rerun || (!nav.isFirst && !nav.isLast);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-outline-variant/40 bg-surface px-space-md pt-[max(0.75rem,env(safe-area-inset-top))] pb-space-sm md:px-space-lg">
        <div className="mx-auto flex max-w-4xl flex-col gap-space-sm">
          <div className="flex items-center justify-between gap-space-sm">
            <div className="flex min-w-0 items-center gap-space-xs">
              <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
              <div className="min-w-0">
                <p className="font-title-md text-title-md text-on-surface">Set up {settings.name || 'your institute'}</p>
                <p className="truncate font-body-sm text-body-sm text-secondary">
                  {user ? `Signed in as ${user.name}` : 'EduTrack Tuition Suite'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-space-2xs">
              {canLeave && (
                <Button variant="ghost" size="sm" onClick={leave} className="hidden sm:inline-flex">
                  {leaveLabel}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon="logout"
                onClick={() => {
                  signOut();
                  navigate('/login', { replace: true });
                }}
              >
                Sign out
              </Button>
            </div>
          </div>
          <SetupProgress current={nav.step.id} index={nav.index} total={nav.total} data={data} onJump={nav.goTo} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-space-md py-space-lg pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-space-lg">
        {nav.step.id === 'institute' && <InstituteStep nav={nav} />}
        {nav.step.id === 'branding' && <BrandingStep nav={nav} />}
        {nav.step.id === 'campuses' && <CampusesStep nav={nav} />}
        {nav.step.id === 'academics' && <AcademicsStep nav={nav} />}
        {nav.step.id === 'rules' && <RulesStep nav={nav} />}
        {nav.step.id === 'team' && <TeamStep nav={nav} />}
        {nav.step.id === 'done' && <DoneStep nav={nav} />}

        {canLeave && (
          <p className="mt-space-md text-center sm:hidden">
            <button type="button" onClick={leave} className="font-label-md text-label-md text-primary underline">
              {leaveLabel}
            </button>
          </p>
        )}
        <p className="mt-space-lg flex items-center justify-center gap-space-2xs font-body-sm text-body-sm text-secondary">
          <Icon name="lock" size={14} />
          Everything you enter stays in {settings.name || 'your institute'}'s own database.
        </p>
      </main>
      <Toaster />
    </div>
  );
}
