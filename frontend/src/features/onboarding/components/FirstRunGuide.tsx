/**
 * What the dashboard shows while an institute has no batches and no students:
 * the three things that turn a configured institute into a running one, each
 * linking to the screen that does it, plus a nudge back into setup if the
 * wizard was left unfinished.
 *
 * Actions the signed-in role cannot perform are left out rather than shown
 * disabled, so a teacher sees the same screen without dead ends.
 */
import { ButtonLink, Icon } from '@/components/ui';
import { useCan, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { cn } from '@/lib/cn';
import { isSetupComplete } from '../setupStatus';

interface GuideStep {
  icon: string;
  title: string;
  description: string;
  to: string;
  cta: string;
  allowed: boolean;
  done: boolean;
}

export function FirstRunGuide() {
  const settings = useSettings();
  const can = useCan();
  const subjects = useDataStore((s) => s.subjects);
  const staff = useDataStore((s) => s.staff);
  const unfinished = !isSetupComplete(settings) && can('settings.manage');

  const steps: GuideStep[] = [
    {
      icon: 'menu_book',
      title: 'Add the subjects you teach',
      description: 'A batch is one subject for one grade, so subjects come first.',
      to: '/topics',
      cta: 'Subjects & topics',
      allowed: can('topics.manage'),
      done: subjects.length > 0,
    },
    {
      icon: 'domain_add',
      title: 'Create your first batch',
      description: 'Set the weekly timetable, the room, the teacher and the monthly fee.',
      to: '/batches',
      cta: 'Create a batch',
      allowed: can('batches.manage'),
      done: false,
    },
    {
      icon: 'person_add',
      title: 'Admit your students',
      description: 'Each admission raises its first invoice and starts the attendance record.',
      to: '/students',
      cta: 'Admit students',
      allowed: can('students.manage'),
      done: false,
    },
    {
      icon: 'group_add',
      title: 'Invite your team',
      description: 'Teachers mark their own classes; office staff handle admissions and fees.',
      to: '/faculty',
      cta: 'Invite staff',
      allowed: can('faculty.manage'),
      done: staff.filter((s) => !s.isOwner).length > 0,
    },
  ].filter((s) => s.allowed);

  return (
    <section aria-labelledby="first-run-heading" className="card flex flex-col gap-space-md p-space-md md:p-space-lg">
      <header className="flex flex-col gap-space-xs sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="first-run-heading" className="font-title-lg text-title-lg font-bold text-on-surface">
            Get {settings.name || 'your institute'} running
          </h2>
          <p className="mt-0.5 font-body-md text-body-md text-secondary">
            Your dashboard fills up on its own — attendance, collections and alerts all come from the classes you run. Here's the short way
            there.
          </p>
        </div>
        {unfinished && (
          <ButtonLink to="/setup" variant="tonal" icon="checklist" className="shrink-0">
            Resume setup
          </ButtonLink>
        )}
      </header>

      <ol className="grid gap-space-sm md:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-space-sm rounded-xl border border-outline-variant/40 p-space-sm">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-label-lg text-label-lg tnum',
                s.done ? 'bg-success-container text-on-success-container' : 'bg-primary-fixed text-primary',
              )}
            >
              {s.done ? <Icon name="check" size={18} /> : i + 1}
            </span>
            <div className="flex min-w-0 flex-col items-start gap-space-2xs">
              <p className="font-label-lg text-label-lg text-on-surface">{s.title}</p>
              <p className="font-body-sm text-body-sm text-secondary">{s.description}</p>
              <ButtonLink to={s.to} variant="ghost" size="sm" trailingIcon="arrow_forward" className="-ml-2.5">
                {s.cta}
              </ButtonLink>
            </div>
          </li>
        ))}
      </ol>

      {steps.length === 0 && (
        <p className="flex items-center gap-space-xs font-body-md text-body-md text-secondary">
          <Icon name="hourglass_empty" size={18} />
          Your administrator is still setting this institute up. Your classes will appear here once batches are created.
        </p>
      )}
    </section>
  );
}
