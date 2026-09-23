/**
 * Activate a student/parent login from the invite link (/portal/activate?token=…):
 * confirm the recovery email and choose a password. Parents must give an email;
 * for students it is optional but recommended.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Icon, TextField } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/ui';
import { activateAccount, findAccountByToken, validatePassword } from '@/services/portalAuth';
import { PortalAuthLayout } from './components/PortalAuthLayout';

export default function PortalActivatePage() {
  useDocumentTitle('Activate your account');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const account = findAccountByToken(token);

  const [email, setEmail] = useState(account?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('The two passwords do not match.');
    const weak = validatePassword(password);
    if (weak) return setError(weak);
    setLoading(true);
    const res = await activateAccount({ token, password, email });
    setLoading(false);
    if (res.ok) navigate('/portal', { replace: true });
    else setError(res.error);
  };

  if (!account) {
    return (
      <PortalAuthLayout title="Link expired" subtitle="Invite links are valid for 7 days.">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Ask the institute office to send you a new invite, then open it on this device.
        </p>
        <Link to="/portal/login" className="mt-space-md block text-center font-label-lg text-label-lg text-primary hover:underline">
          Back to sign in
        </Link>
      </PortalAuthLayout>
    );
  }

  const isParent = account.role === 'parent';
  return (
    <PortalAuthLayout
      title={`Welcome, ${account.name.split(' ')[0]}`}
      subtitle={isParent ? 'Set a password for your parent account.' : 'Set a password for your student account.'}
    >
      <form onSubmit={submit} className="flex flex-col gap-space-md" noValidate>
        <div className="rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm text-on-surface-variant">
          Signing in as <strong className="text-on-surface">{account.loginId}</strong>
          {account.role === 'parent' && ' (your registered mobile)'}
        </div>
        <TextField
          label="Email address"
          type="email"
          leadingIcon="mail"
          required={isParent}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          hint={
            isParent
              ? 'Required — used if you ever need to reset your password.'
              : 'Optional, but it lets you reset your password yourself.'
          }
        />
        <TextField
          label="New password"
          type={show ? 'text' : 'password'}
          leadingIcon="lock"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters, with letters and numbers."
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
        <TextField
          label="Confirm password"
          type={show ? 'text' : 'password'}
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <p
            role="alert"
            className="flex items-start gap-space-xs rounded-lg bg-error-container px-space-sm py-space-xs font-body-md text-body-md text-on-error-container"
          >
            <Icon name="error" size={18} className="mt-0.5" />
            {error}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth loading={loading}>
          Activate & sign in
        </Button>
      </form>
    </PortalAuthLayout>
  );
}
