/**
 * "Forgot password" for student and parent accounts. The account is found by
 * student ID or registered mobile, and the reset link goes to the email on the
 * account. The response never says whether an account exists.
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Icon, TextField } from '@/components/ui';
import { useDataStore } from '@/store/dataStore';
import { useDocumentTitle } from '@/hooks/ui';
import { useMockBackend } from '@/config/env';
import { requestPasswordReset, type RecoveryResult } from '@/services/portalAuth';
import { PortalAuthLayout } from './components/PortalAuthLayout';

export default function PortalForgotPasswordPage() {
  useDocumentTitle('Reset your password');
  const settings = useDataStore((s) => s.settings);
  const [code, setCode] = useState(useMockBackend ? settings.instituteCode : '');
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState<RecoveryResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await requestPasswordReset({ instituteCode: code, identifier });
    setLoading(false);
    if (res.ok) setSent(res);
    else setError(res.error ?? 'Something went wrong.');
  };

  return (
    <PortalAuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <p className="text-center font-body-sm text-body-sm text-secondary">
          <Link to="/portal/login" className="font-semibold text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="flex flex-col gap-space-md">
          <p className="flex items-start gap-space-xs rounded-lg bg-success-container px-space-sm py-space-xs font-body-md text-body-md text-on-success-container">
            <Icon name="mark_email_read" size={18} className="mt-0.5" />
            If that account exists, a reset link is on its way{sent.sentTo ? ` to ${sent.sentTo}` : ''}. The link is valid for 24 hours.
          </p>
          {sent.demoToken && (
            <p className="rounded-lg bg-warning-container px-space-sm py-space-xs font-body-sm text-body-sm text-on-warning-container">
              <Icon name="science" size={16} className="mr-1 inline align-text-bottom" />
              Demo mode — no email is sent.{' '}
              <Link to={`/portal/reset?token=${sent.demoToken}`} className="font-semibold underline">
                Open the reset link
              </Link>
            </p>
          )}
          <p className="font-body-sm text-body-sm text-secondary">
            No email on your account? The institute office can reset it for you, or send a fresh invite.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-space-md" noValidate>
          <TextField
            label="Institute code"
            leadingIcon="domain"
            required
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <TextField
            label="Student ID or mobile number"
            leadingIcon="person"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="STU-1042 or +91 98765 43210"
            hint="Students use their ID; parents use their registered mobile."
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
            Send reset link
          </Button>
        </form>
      )}
    </PortalAuthLayout>
  );
}
