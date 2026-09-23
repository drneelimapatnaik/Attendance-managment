/** Set a new password from the emailed reset link (/portal/reset?token=…). */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Icon, TextField } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/ui';
import { useToast } from '@/store/uiStore';
import { findAccountByToken, resetPassword, validatePassword } from '@/services/portalAuth';
import { PortalAuthLayout } from './components/PortalAuthLayout';

export default function PortalResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const account = findAccountByToken(token);

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
    const res = await resetPassword({ token, password });
    setLoading(false);
    if (!res.ok) return setError(res.error);
    toast({ title: 'Password updated', description: 'Sign in with your new password.' });
    navigate('/portal/login', { replace: true });
  };

  if (!account) {
    return (
      <PortalAuthLayout title="Link expired" subtitle="Reset links are valid for 24 hours.">
        <Link to="/portal/forgot" className="block text-center font-label-lg text-label-lg text-primary hover:underline">
          Request a new link
        </Link>
      </PortalAuthLayout>
    );
  }

  return (
    <PortalAuthLayout title="Choose a new password" subtitle={`For ${account.name} · ${account.loginId}`}>
      <form onSubmit={submit} className="flex flex-col gap-space-md" noValidate>
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
          Save new password
        </Button>
      </form>
    </PortalAuthLayout>
  );
}
