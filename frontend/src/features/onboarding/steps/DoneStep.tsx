/**
 * Setup step 7 — the closing screen. Confirms what was configured, then hands
 * the owner a short checklist of the three things that turn a configured
 * institute into a running one, each linking to the screen that does it.
 *
 * "Open my dashboard" marks setup complete, so /setup stops intercepting staff.
 */
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '@/components/ui';
import { useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { SetupStepShell } from '../components/SetupStepShell';
import { clearSetupDeferral } from '../setupStatus';
import type { SetupNav } from '../useSetupNav';

interface NextAction {
  icon: string;
  title: string;
  description: string;
  to: string;
  cta: string;
  done: boolean;
}

export function DoneStep({ nav }: { nav: SetupNav }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const subjects = useDataStore((s) => s.subjects);
  const batches = useDataStore((s) => s.batches);
  const students = useDataStore((s) => s.students);
  const staff = useDataStore((s) => s.staff);
  const topics = useDataStore((s) => s.topics);
  const portalAccounts = useDataStore((s) => s.portalAccounts);
  const completeSetup = useDataStore((s) => s.completeSetup);

  const actions: NextAction[] = [
    {
      icon: 'domain_add',
      title: 'Create your first batch',
      description: 'A batch is one subject for one grade, on a weekly timetable, with its own monthly fee.',
      to: '/batches',
      cta: 'Go to Batches',
      done: batches.length > 0,
    },
    {
      icon: 'person_add',
      title: 'Admit your students',
      description: 'Add them one by one, or paste a list. Each admission raises its first invoice automatically.',
      to: '/students',
      cta: 'Go to Students',
      done: students.length > 0,
    },
    {
      icon: 'family_restroom',
      title: 'Invite parents & students',
      description: 'They get their own app for attendance, results and fees — invite them from a student’s profile.',
      to: '/students',
      cta: 'Open the roster',
      done: portalAccounts.length > 0,
    },
    {
      icon: 'menu_book',
      title: 'Fill in the syllabus',
      description: 'Add chapters and topics per subject so coverage tracks itself as classes are marked.',
      to: '/topics',
      cta: 'Subject & Topic Master',
      done: topics.length > 0,
    },
  ];

  /**
   * Reaching this screen is the end of setup, so any way out of it finishes
   * first — otherwise the guard would send a checklist link straight back here.
   */
  const leaveTo = (to: string) => {
    completeSetup();
    clearSetupDeferral();
    navigate(to, { replace: true });
  };

  const finish = () => {
    leaveTo('/dashboard');
    return true;
  };

  const summary = [
    `${settings.name || 'Your institute'} · ${settings.instituteCode}`,
    pluralize(settings.campuses.length, 'campus', 'campuses'),
    pluralize(subjects.length, 'subject'),
    `${pluralize(staff.length, 'team member')} incl. you`,
  ];

  return (
    <SetupStepShell nav={nav} onNext={finish} nextLabel="Open my dashboard">
      <div className="flex flex-col gap-space-xs rounded-xl bg-primary-fixed/50 p-space-md">
        <p className="flex items-center gap-space-xs font-title-md text-title-md text-on-surface">
          <Icon name="check_circle" size={20} filled className="text-primary" />
          Your institute is configured
        </p>
        <p className="font-body-md text-body-md text-on-surface-variant">{summary.join(' · ')}</p>
      </div>

      <ul className="flex flex-col gap-space-sm">
        {actions.map((a) => (
          <li
            key={a.title}
            className="flex flex-col gap-space-sm rounded-xl border border-outline-variant/40 p-space-sm sm:flex-row sm:items-center"
          >
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                a.done ? 'bg-success-container text-on-success-container' : 'bg-surface-container-low text-primary',
              )}
            >
              <Icon name={a.done ? 'check' : a.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-label-lg text-label-lg text-on-surface">{a.title}</p>
              <p className="font-body-sm text-body-sm text-secondary">{a.description}</p>
            </div>
            <Button
              variant={a.done ? 'ghost' : 'tonal'}
              trailingIcon="arrow_forward"
              onClick={() => leaveTo(a.to)}
              className="w-full sm:w-auto"
            >
              {a.done ? 'Done' : a.cta}
            </Button>
          </li>
        ))}
      </ul>
    </SetupStepShell>
  );
}
