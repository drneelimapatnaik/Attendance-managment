/**
 * Sign-in for institute staff. Multi-tenant: the institute code picks the
 * tenant, then email + password authenticate the staff member.
 * Demo mode lists one account per role for quick review.
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Icon, TextField } from '@/components/ui';
import { useDataStore } from '@/store/dataStore';
import { useSessionStore } from '@/store/sessionStore';
import { signIn } from '@/services/auth';
import { ROLE_LABELS } from '@/config/permissions';
import { useMockBackend } from '@/config/env';
import { useDocumentTitle } from '@/hooks/ui';
import { cn } from '@/lib/cn';

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useSessionStore((s) => s.userId);
  const settings = useDataStore((s) => s.settings);
  const staff = useDataStore((s) => s.staff);

  const [code, setCode] = useState(useMockBackend ? settings.instituteCode : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  if (userId) return <Navigate to={from} replace />;

  const submit = async (e?: FormEvent, override?: { email: string }) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    const res = await signIn({ instituteCode: code, email: override?.email ?? email, password: override ? 'demo-pass' : password });
    setLoading(false);
    if (res.ok) navigate(from, { replace: true });
    else setError(res.error);
  };

  const demoAccounts = staff.filter(
    (s, i, all) => s.status === 'Active' && all.findIndex((x) => x.role === s.role && x.status === 'Active') === i,
  );

  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-primary p-space-2xl text-on-primary lg:flex lg:w-[44%] lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -bottom-24 -right-24 opacity-10">
          <Icon name="school" size={420} />
        </div>
        <div className="flex items-center gap-space-xs">
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-xl" />
          <div>
            <p className="font-title-lg text-title-lg">EduTrack</p>
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-primary-container">Tuition Suite</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-headline-xl text-headline-xl">Run your institute from one place.</h1>
          <p className="mt-space-sm font-body-lg text-body-lg text-on-primary/80">
            Attendance in seconds, batches and syllabus on track, fees collected on time — on desktop, tablet and phone.
          </p>
          <ul className="mt-space-lg space-y-space-xs font-body-md text-body-md text-on-primary/90">
            {['Live roll call with parent alerts', 'Fee ledger, receipts and reminders', 'Topic coverage and test analytics'].map((t) => (
              <li key={t} className="flex items-center gap-space-xs">
                <Icon name="check_circle" size={18} className="text-on-primary-container" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative font-body-sm text-body-sm text-on-primary/60">
          © {new Date().getFullYear()} EduTrack · Secure multi-institute platform
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-space-md py-space-xl pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-md">
          <div className="mb-space-lg flex items-center gap-space-xs lg:hidden">
            <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
            <span className="font-title-lg text-title-lg text-primary">EduTrack</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface">Sign in to your institute</h2>
          <p className="mt-1 font-body-md text-body-md text-secondary">Use the institute code shared by your administrator.</p>

          <form onSubmit={submit} className="mt-space-lg flex flex-col gap-space-md" noValidate>
            <TextField
              label="Institute code"
              leadingIcon="domain"
              required
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. APEX"
            />
            <TextField
              label="Work email"
              type="email"
              leadingIcon="mail"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@institute.com"
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              leadingIcon="lock"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-secondary hover:bg-surface-container"
                >
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={18} />
                </button>
              }
            />
            {error && (
              <p
                role="alert"
                className="flex items-center gap-space-xs rounded-lg bg-error-container px-space-sm py-space-xs font-body-md text-body-md text-on-error-container"
              >
                <Icon name="error" size={18} />
                {error}
              </p>
            )}
            <Button type="submit" size="lg" loading={loading} fullWidth>
              Sign in
            </Button>
          </form>

          {useMockBackend && (
            <div className="mt-space-xl">
              <p className="mb-space-xs flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
                <Icon name="science" size={16} />
                Demo accounts · {settings.name} ({settings.instituteCode})
              </p>
              <div className="grid gap-space-xs sm:grid-cols-2">
                {demoAccounts.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={loading}
                    onClick={() => submit(undefined, { email: s.email })}
                    className={cn(
                      'flex flex-col rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-space-sm py-space-xs text-left transition-colors hover:border-primary-container hover:bg-surface-container-low',
                    )}
                  >
                    <span className="font-label-lg text-label-lg text-on-surface">{ROLE_LABELS[s.role]}</span>
                    <span className="truncate font-body-sm text-body-sm text-secondary">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
