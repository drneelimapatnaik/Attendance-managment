/**
 * Student & parent app — Account.
 *
 * Everything about this login and the student(s) behind it: how you sign in,
 * your password, the email used to recover it, which alerts you want, and the
 * children linked to the login (a parent can switch between them here). A
 * student account never sees the fee alert — money is parent-only.
 *
 * Writes go through `updatePortalAccount`; the demo verifies the current
 * password in the browser because there is no server yet (see portalAuth.ts).
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Batch, PortalAccount, Student } from '@/types/domain';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Icon, Switch, Tag, TextField } from '@/components/ui';
import { StudentStatusBadge } from '@/components/domain';
import { usePortalAccount, usePortalStudents, useActiveStudent } from '@/hooks/usePortal';
import { useLookups, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { useDataStore } from '@/store/dataStore';
import { useSessionStore } from '@/store/sessionStore';
import { useToast } from '@/store/uiStore';
import { MIN_PASSWORD_LENGTH, maskPhone, signOutPortal, validatePassword } from '@/services/portalAuth';
import { formatDate, relativeTime } from '@/lib/date';
import { PortalHeading, PortalNotices } from './components/PortalPageChrome';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Password input with a show/hide eye, matching the sign-in screen. */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      label={label}
      type={show ? 'text' : 'password'}
      leadingIcon="lock"
      required
      autoComplete={autoComplete}
      value={value}
      hint={hint}
      onChange={(e) => onChange(e.target.value)}
      trailing={
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-secondary hover:bg-surface-container"
        >
          <Icon name={show ? 'visibility_off' : 'visibility'} size={18} />
        </button>
      }
    />
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-space-xs rounded-lg bg-error-container px-space-sm py-space-xs font-body-md text-body-md text-on-error-container"
    >
      <Icon name="error" size={18} className="mt-0.5" />
      {children}
    </p>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">{label}</dt>
      <dd className="mt-0.5 break-words font-body-md text-body-md text-on-surface">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------- Account card */

function AccountCard({ account }: { account: PortalAccount }) {
  const isParent = account.role === 'parent';
  return (
    <Card className="flex flex-col gap-space-md">
      <div className="flex items-center gap-space-sm">
        <Avatar name={account.name} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-title-lg text-title-lg text-on-surface">{account.name}</p>
          <Badge tone={isParent ? 'primary' : 'info'} icon={isParent ? 'family_restroom' : 'school'}>
            {isParent ? 'Parent account' : 'Student account'}
          </Badge>
        </div>
      </div>
      <dl className="grid gap-x-space-lg gap-y-space-md sm:grid-cols-2">
        {/* The mobile is masked: this screen is often held up in front of other people. */}
        <Detail label={isParent ? 'You sign in with' : 'Your student ID'}>
          <span className="tnum">{isParent ? maskPhone(account.phone ?? account.loginId) : account.loginId}</span>
        </Detail>
        <Detail label="Sign-in method">
          {account.password
            ? isParent
              ? 'Password, or a one-time code by SMS'
              : 'Password'
            : 'A one-time code sent to your mobile by SMS'}
        </Detail>
        <Detail label="Email">
          {account.email ? (
            <span className="flex flex-wrap items-center gap-space-xs">
              {account.email}
              {account.emailVerified ? (
                <Badge tone="success" icon="verified">
                  Verified
                </Badge>
              ) : (
                <Badge tone="warning" icon="mark_email_unread">
                  Not verified yet
                </Badge>
              )}
            </span>
          ) : (
            <span className="text-secondary">Not added</span>
          )}
        </Detail>
        <Detail label="Last sign-in">{account.lastLoginAt ? relativeTime(account.lastLoginAt) : 'This is your first visit'}</Detail>
        <Detail label="Using the app since">{formatDate(account.activatedOn ?? account.invitedOn)}</Detail>
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------ Password card */

function PasswordCard({ account }: { account: PortalAccount }) {
  const updateAccount = useDataStore((s) => s.updatePortalAccount);
  const toast = useToast();
  const hasPassword = !!account.password;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    // DEMO ONLY: a real backend checks the current password server-side.
    if (hasPassword && current !== account.password) return setError('That is not your current password.');
    const weak = validatePassword(next);
    if (weak) return setError(weak);
    if (next !== confirm) return setError('The two new passwords do not match.');
    // Setting a first password also makes it the way this login signs in.
    updateAccount(account.id, { password: next, authMethod: 'password' });
    setCurrent('');
    setNext('');
    setConfirm('');
    toast({
      title: hasPassword ? 'Password changed' : 'Password set',
      description: hasPassword ? 'Use the new password the next time you sign in.' : 'You can now sign in without waiting for a code.',
    });
  };

  return (
    <Card className="flex flex-col gap-space-md">
      <CardHeader
        title={hasPassword ? 'Change your password' : 'Set a password'}
        icon="password"
        subtitle={
          hasPassword
            ? 'Pick something only you would guess.'
            : 'With a password you can sign in straight away, instead of waiting for a code by SMS.'
        }
      />
      <form onSubmit={submit} className="flex flex-col gap-space-md" noValidate>
        {hasPassword && <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />}
        <PasswordField
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters, with letters as well as numbers.`}
        />
        <PasswordField label="Repeat the new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <ErrorLine>{error}</ErrorLine>}
        <Button type="submit" size="lg" fullWidth disabled={!next || !confirm || (hasPassword && !current)}>
          {hasPassword ? 'Save new password' : 'Set password'}
        </Button>
      </form>
    </Card>
  );
}

/* --------------------------------------------------------------- Email card */

function EmailCard({ account }: { account: PortalAccount }) {
  const updateAccount = useDataStore((s) => s.updatePortalAccount);
  const toast = useToast();
  const required = account.role === 'parent';
  const [email, setEmail] = useState(account.email ?? '');
  const [error, setError] = useState('');
  const trimmed = email.trim();
  const changed = trimmed !== (account.email ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!trimmed) {
      if (required) return setError('Parents need an email address so we can help you back into your account.');
      updateAccount(account.id, { email: undefined, emailVerified: false });
      return toast({ title: 'Email removed', tone: 'info' });
    }
    if (!EMAIL_RE.test(trimmed)) return setError('That does not look like an email address.');
    // A new address always starts unverified — the link in the email confirms it.
    updateAccount(account.id, { email: trimmed, emailVerified: false });
    toast({ title: 'Verification email sent', description: `Open the link we sent to ${trimmed} to confirm the address.` });
  };

  return (
    <Card className="flex flex-col gap-space-md">
      <CardHeader
        title="Email address"
        icon="mail"
        subtitle="This is where we send a link if you ever forget your password."
        actions={
          account.email &&
          !account.emailVerified && (
            <Badge tone="warning" icon="mark_email_unread">
              Not verified
            </Badge>
          )
        }
      />
      <form onSubmit={submit} className="flex flex-col gap-space-md" noValidate>
        <TextField
          label="Email"
          type="email"
          leadingIcon="alternate_email"
          inputMode="email"
          autoComplete="email"
          required={required}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint={required ? 'Required on a parent account.' : 'Optional, but it is the only way to reset your own password.'}
        />
        {error && <ErrorLine>{error}</ErrorLine>}
        <Button type="submit" size="lg" fullWidth variant="tonal" disabled={!changed}>
          Save email
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------- Notification card */

function NotificationsCard({ account }: { account: PortalAccount }) {
  const updateAccount = useDataStore((s) => s.updatePortalAccount);
  const toast = useToast();
  const isParent = account.role === 'parent';

  const set = (key: keyof PortalAccount['notify'], value: boolean, label: string) => {
    updateAccount(account.id, { notify: { ...account.notify, [key]: value } });
    toast({ title: value ? `${label} alerts on` : `${label} alerts off`, tone: 'info' });
  };

  return (
    <Card className="flex flex-col gap-space-md">
      <CardHeader title="What we tell you about" icon="notifications" subtitle="Turn off anything you would rather not hear about." />
      <div className="flex flex-col gap-space-md">
        <Switch
          checked={account.notify.attendance}
          onChange={(v) => set('attendance', v, 'Attendance')}
          label="Attendance"
          description={isParent ? 'When your child is marked absent or late.' : 'When you are marked absent or late.'}
        />
        <Switch
          checked={account.notify.results}
          onChange={(v) => set('results', v, 'Result')}
          label="Results"
          description="When marks for a new test are published."
        />
        {/* Money is parent-only: a student account never gets fee alerts. */}
        {isParent && (
          <Switch
            checked={account.notify.fees}
            onChange={(v) => set('fees', v, 'Fee')}
            label="Fees"
            description="When a new bill is raised, and before it falls due."
          />
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------ Linked students card */

function LinkedStudentsCard({ account, students, activeId }: { account: PortalAccount; students: Student[]; activeId?: string }) {
  const { batch: batchMap } = useLookups();
  const setActiveStudent = useSessionStore((s) => s.setActiveStudent);
  const isParent = account.role === 'parent';
  const canSwitch = isParent && students.length > 1;

  return (
    <Card className="flex flex-col gap-space-md">
      <CardHeader
        title={isParent ? (students.length > 1 ? 'Your children' : 'Your child') : 'Your record'}
        icon="school"
        subtitle={canSwitch ? 'Tap a name to switch whose information the app shows.' : undefined}
      />
      {students.length ? (
        <ul className="flex flex-col gap-space-sm">
          {students.map((s) => {
            const batches = s.batchIds.map((id) => batchMap.get(id)).filter((b): b is Batch => !!b);
            const viewing = s.id === activeId;
            const body = (
              <>
                <Avatar name={s.name} src={s.photoUrl} size="md" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="flex flex-wrap items-center gap-space-xs font-title-md text-title-md text-on-surface">
                    {s.name}
                    {canSwitch && viewing && (
                      <Badge tone="primary" icon="visibility">
                        Showing now
                      </Badge>
                    )}
                  </p>
                  <p className="font-body-sm text-body-sm text-secondary">
                    {s.grade} · {s.section} · <span className="tnum">{s.id}</span>
                  </p>
                  <div className="mt-space-2xs flex flex-wrap items-center gap-space-2xs">
                    {batches.length ? (
                      batches.map((b) => (
                        <Tag key={b.id} title={b.title}>
                          {b.name}
                        </Tag>
                      ))
                    ) : (
                      <span className="font-body-sm text-body-sm text-secondary">Not in a batch yet</span>
                    )}
                    <StudentStatusBadge status={s.status} />
                  </div>
                </div>
              </>
            );
            return (
              <li key={s.id}>
                {canSwitch ? (
                  <button
                    type="button"
                    onClick={() => setActiveStudent(s.id)}
                    aria-pressed={viewing}
                    className="flex w-full items-start gap-space-sm rounded-xl border border-outline-variant/50 p-space-sm text-left transition-colors hover:bg-surface-container-low"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-space-sm rounded-xl border border-outline-variant/50 p-space-sm">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          compact
          icon="school"
          title="No student linked yet"
          description="Call the institute office so they can link the right record to this login."
        />
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- The page */

export default function PortalProfilePage() {
  useDocumentTitle('Account');
  const navigate = useNavigate();
  const account = usePortalAccount();
  const students = usePortalStudents();
  const active = useActiveStudent();
  const settings = useSettings();

  if (!account) {
    return (
      <div className="card">
        <EmptyState
          icon="person_off"
          title="You are signed out"
          description="Sign in again to see your account."
          action={<Button onClick={() => navigate('/portal/login', { replace: true })}>Go to sign in</Button>}
        />
      </div>
    );
  }

  const signOut = () => {
    signOutPortal();
    navigate('/portal/login', { replace: true });
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <PortalHeading title="Account" subtitle={`Your ${settings.name} app login and settings.`} />
      <PortalNotices account={account} student={active} />

      <AccountCard account={account} />
      <PasswordCard account={account} />
      <EmailCard account={account} />
      <NotificationsCard account={account} />
      <LinkedStudentsCard account={account} students={students} activeId={active?.id} />

      <Card className="flex flex-col gap-space-sm">
        <Button variant="danger-soft" size="lg" icon="logout" fullWidth onClick={signOut}>
          Sign out
        </Button>
        <p className="text-center font-body-sm text-body-sm text-secondary">
          Work at {settings.name}?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in to the institute console
          </Link>
        </p>
      </Card>
    </div>
  );
}
