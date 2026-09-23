/**
 * Student & parent sign-in.
 *
 *  Student tab → institute code + student ID + password.
 *  Parent tab  → institute code + mobile, then either a one-time code sent by
 *                SMS (default) or the password they set.
 *
 * Mobile-first: this screen is used mostly on phones.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Icon, SegmentedControl, TextField } from '@/components/ui';
import { useDataStore } from '@/store/dataStore';
import { useSessionStore } from '@/store/sessionStore';
import { useDocumentTitle } from '@/hooks/ui';
import { useMockBackend } from '@/config/env';
import {
  OTP_TTL_SECONDS,
  requestParentOtp,
  signInParentWithPassword,
  signInStudent,
  verifyParentOtp,
  type OtpRequestResult,
} from '@/services/portalAuth';
import { cn } from '@/lib/cn';
import { PortalAuthLayout } from './components/PortalAuthLayout';

type Tab = 'student' | 'parent';
type ParentMethod = 'otp' | 'password';

export default function PortalLoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signedIn = useSessionStore((s) => s.portalAccountId);
  const staffSignedIn = useSessionStore((s) => s.userId);
  const settings = useDataStore((s) => s.settings);
  const accounts = useDataStore((s) => s.portalAccounts);

  const [tab, setTab] = useState<Tab>((params.get('as') as Tab) ?? 'student');
  const [code, setCode] = useState(useMockBackend ? settings.instituteCode : '');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState<ParentMethod>('otp');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState<OtpRequestResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  // Count down the one-time code's validity so "Resend" appears at the right time.
  useEffect(() => {
    if (!secondsLeft) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  if (signedIn) return <Navigate to="/portal" replace />;
  if (staffSignedIn) return <Navigate to="/dashboard" replace />;

  const reset = () => {
    setError('');
    setSent(null);
    setOtp('');
  };

  const submitStudent = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await signInStudent({ instituteCode: code, studentId, password });
    setLoading(false);
    if (res.ok) navigate('/portal', { replace: true });
    else setError(res.error);
  };

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    const res = await requestParentOtp({ instituteCode: code, phone });
    setLoading(false);
    if (!res.ok) return setError(res.error ?? 'Could not send the code.');
    setSent(res);
    setSecondsLeft(res.expiresInSeconds ?? OTP_TTL_SECONDS);
    setTimeout(() => otpRef.current?.focus(), 50);
  };

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await verifyParentOtp({ instituteCode: code, phone, code: otp });
    setLoading(false);
    if (res.ok) navigate('/portal', { replace: true });
    else setError(res.error);
  };

  const submitParentPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await signInParentWithPassword({ instituteCode: code, phone, password });
    setLoading(false);
    if (res.ok) navigate('/portal', { replace: true });
    else setError(res.error);
  };

  // Demo helpers: a ready student login and a parent with more than one child.
  const demoStudent = useMockBackend ? accounts.find((a) => a.role === 'student' && a.status === 'Active') : undefined;
  const demoParent = useMockBackend
    ? (accounts.filter((a) => a.role === 'parent' && a.status === 'Active').sort((a, b) => b.studentIds.length - a.studentIds.length)[0] ??
      undefined)
    : undefined;

  const instituteField = (
    <TextField
      label="Institute code"
      leadingIcon="domain"
      required
      autoCapitalize="characters"
      value={code}
      onChange={(e) => setCode(e.target.value.toUpperCase())}
      placeholder="e.g. APEX"
      hint="On your invite message from the institute."
    />
  );

  const errorBox = error && (
    <p
      role="alert"
      className="flex items-start gap-space-xs rounded-lg bg-error-container px-space-sm py-space-xs font-body-md text-body-md text-on-error-container"
    >
      <Icon name="error" size={18} className="mt-0.5" />
      {error}
    </p>
  );

  return (
    <PortalAuthLayout
      title="Student & parent app"
      subtitle={`${settings.name} · attendance, fees and results in your pocket`}
      footer={
        <p className="text-center font-body-sm text-body-sm text-secondary">
          Staff member?{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in to the institute console
          </Link>
        </p>
      }
    >
      <SegmentedControl<Tab>
        className="w-full"
        ariaLabel="Account type"
        value={tab}
        onChange={(v) => {
          setTab(v);
          reset();
        }}
        segments={[
          { value: 'student', label: 'Student', icon: 'school', activeClassName: 'bg-primary text-on-primary shadow-sm' },
          { value: 'parent', label: 'Parent', icon: 'family_restroom', activeClassName: 'bg-primary text-on-primary shadow-sm' },
        ]}
      />

      {tab === 'student' ? (
        <form onSubmit={submitStudent} className="mt-space-lg flex flex-col gap-space-md" noValidate>
          {instituteField}
          <TextField
            label="Student ID"
            leadingIcon="badge"
            required
            autoCapitalize="characters"
            autoComplete="username"
            placeholder="e.g. STU-1042"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.toUpperCase())}
            hint="Printed on your ID card."
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
          {errorBox}
          <Button type="submit" size="lg" fullWidth loading={loading}>
            Sign in
          </Button>
          <Link to="/portal/forgot" className="text-center font-label-md text-label-md text-primary hover:underline">
            Forgot password?
          </Link>
        </form>
      ) : (
        <div className="mt-space-lg flex flex-col gap-space-md">
          {!sent ? (
            <form onSubmit={method === 'otp' ? sendCode : submitParentPassword} className="flex flex-col gap-space-md" noValidate>
              {instituteField}
              <TextField
                label="Registered mobile number"
                type="tel"
                inputMode="tel"
                leadingIcon="smartphone"
                required
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                hint="The number the institute has for you."
              />
              {method === 'password' && (
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
              )}
              {errorBox}
              <Button type="submit" size="lg" fullWidth loading={loading} icon={method === 'otp' ? 'sms' : undefined}>
                {method === 'otp' ? 'Send me a code' : 'Sign in'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMethod(method === 'otp' ? 'password' : 'otp');
                  setError('');
                }}
                className="text-center font-label-md text-label-md text-primary hover:underline"
              >
                {method === 'otp' ? 'Use my password instead' : 'Get a one-time code instead'}
              </button>
              {method === 'password' && (
                <Link to="/portal/forgot" className="-mt-2 text-center font-label-md text-label-md text-secondary hover:underline">
                  Forgot password?
                </Link>
              )}
            </form>
          ) : (
            <form onSubmit={submitOtp} className="flex flex-col gap-space-md" noValidate>
              <div className="rounded-lg bg-surface-container-low p-space-sm">
                <p className="font-body-md text-body-md text-on-surface">
                  We sent a 6-digit code to <strong>{sent.sentTo}</strong>.
                </p>
                <button type="button" onClick={() => reset()} className="mt-1 font-label-md text-label-md text-primary hover:underline">
                  Use a different number
                </button>
              </div>
              {sent.demoCode && (
                <p className="flex items-center gap-space-xs rounded-lg bg-warning-container px-space-sm py-space-xs font-body-sm text-body-sm text-on-warning-container">
                  <Icon name="science" size={16} />
                  Demo mode — no SMS is sent. Your code is <strong className="tnum">{sent.demoCode}</strong>.
                </p>
              )}
              <TextField
                ref={otpRef}
                label="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="text-center font-title-lg text-title-lg tracking-[0.5em] tnum"
              />
              {errorBox}
              <Button type="submit" size="lg" fullWidth loading={loading} disabled={otp.length < 6}>
                Verify & sign in
              </Button>
              <button
                type="button"
                disabled={secondsLeft > 0 || loading}
                onClick={() => sendCode()}
                className={cn(
                  'text-center font-label-md text-label-md',
                  secondsLeft > 0 ? 'text-secondary' : 'text-primary hover:underline',
                )}
              >
                {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Resend code'}
              </button>
            </form>
          )}
        </div>
      )}

      {useMockBackend && (demoStudent || demoParent) && (
        <div className="mt-space-xl rounded-xl border border-outline-variant/50 p-space-sm">
          <p className="mb-space-xs flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
            <Icon name="science" size={16} />
            Demo logins
          </p>
          <ul className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
            {demoStudent && (
              <li>
                <strong className="text-on-surface">Student</strong> · {demoStudent.loginId} · password <code>student123</code>
              </li>
            )}
            {demoParent && (
              <li>
                <strong className="text-on-surface">Parent</strong> · {demoParent.phone} · code shown on screen
                {demoParent.studentIds.length > 1 && ` · ${demoParent.studentIds.length} children`}
              </li>
            )}
          </ul>
        </div>
      )}
    </PortalAuthLayout>
  );
}
