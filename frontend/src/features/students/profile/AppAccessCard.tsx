/**
 * Profile › Details › App access.
 *
 * The two logins that can exist for one student — the student's own (student ID
 * + password) and the parent's (guardian mobile + a one-time code) — with their
 * status, last sign-in and the actions the front desk actually needs: send or
 * resend the invite, copy the activation link to paste into a message, and
 * switch a login off or back on.
 *
 * A parent login is keyed on the mobile number, so one login can cover several
 * children; when it does, the siblings are named here.
 */
import { useMemo } from 'react';
import type { PortalAccount, PortalRole, Student } from '@/types/domain';
import { Badge, Button, Card, CardHeader, Icon, type BadgeTone } from '@/components/ui';
import { useCan, useLookups } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { normalizePhone } from '@/lib/format';
import { formatDate, relativeTime } from '@/lib/date';

const STATUS_TONE: Record<PortalAccount['status'], BadgeTone> = { Active: 'success', Invited: 'info', Disabled: 'neutral' };

/** The activation link the invite email/SMS carries — safe to paste into a chat. */
function inviteLink(token: string): string {
  return `${window.location.origin}/portal/activate?token=${token}`;
}

interface LoginRowProps {
  role: PortalRole;
  account?: PortalAccount;
  loginId: string;
  /** Names of the other children this (parent) login also covers. */
  siblings: string[];
  canManage: boolean;
  onInvite: () => void;
  onCopy: () => void;
  onToggle: () => void;
}

function LoginRow({ role, account, loginId, siblings, canManage, onInvite, onCopy, onToggle }: LoginRowProps) {
  const isStudent = role === 'student';
  return (
    <div className="flex flex-col gap-space-sm rounded-xl border border-outline-variant/60 p-space-sm">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="flex min-w-0 items-start gap-space-xs">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary">
            <Icon name={isStudent ? 'school' : 'family_restroom'} />
          </span>
          <div className="min-w-0">
            <p className="font-label-lg text-label-lg text-on-surface">{isStudent ? 'Student login' : 'Parent login'}</p>
            <p className="truncate font-body-sm text-body-sm text-secondary tnum">{loginId}</p>
          </div>
        </div>
        {account ? (
          <Badge tone={STATUS_TONE[account.status]} dot>
            {account.status}
          </Badge>
        ) : (
          <Badge tone="neutral">Not invited</Badge>
        )}
      </div>

      {account ? (
        <dl className="grid grid-cols-2 gap-x-space-sm gap-y-space-xs">
          <div className="min-w-0">
            <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Last sign-in</dt>
            <dd className="font-body-sm text-body-sm text-on-surface">
              {account.lastLoginAt ? relativeTime(account.lastLoginAt) : 'Never'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Signs in with</dt>
            {/* Students always use a password (set from the invite); parents may use either. */}
            <dd className="font-body-sm text-body-sm text-on-surface">
              {isStudent ? 'Password' : account.password ? 'Password or code' : 'One-time code'}
            </dd>
          </div>
          <div className="col-span-2 min-w-0">
            <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Email on the account</dt>
            <dd className="flex flex-wrap items-center gap-space-xs break-all font-body-sm text-body-sm text-on-surface">
              {account.email ?? <span className="text-secondary">None saved</span>}
              {account.email &&
                (account.emailVerified ? (
                  <Badge tone="success" icon="verified">
                    Verified
                  </Badge>
                ) : (
                  <Badge tone="warning" icon="mark_email_unread">
                    Unverified
                  </Badge>
                ))}
            </dd>
          </div>
          {account.status === 'Invited' && (
            <div className="col-span-2 min-w-0">
              <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Invited</dt>
              <dd className="font-body-sm text-body-sm text-on-surface">
                {formatDate(account.invitedOn)}
                {account.token && ` · link valid until ${formatDate(account.token.expiresAt.slice(0, 10))}`}
              </dd>
            </div>
          )}
          {siblings.length > 0 && (
            <div className="col-span-2 min-w-0">
              <dt className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Also linked to</dt>
              <dd className="font-body-sm text-body-sm text-on-surface">{siblings.join(', ')}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="font-body-sm text-body-sm text-secondary">
          {isStudent
            ? 'No app login yet. An invite lets the student set a password for their student ID.'
            : 'No app login yet. An invite lets the parent activate the number above.'}
        </p>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-space-xs">
          {account?.status !== 'Active' && (
            <Button size="sm" variant="tonal" icon="send" onClick={onInvite}>
              {account ? 'Resend invite' : 'Send invite'}
            </Button>
          )}
          {account?.token?.purpose === 'activate' && (
            <Button size="sm" variant="ghost" icon="link" onClick={onCopy}>
              Copy invite link
            </Button>
          )}
          {account && (
            <Button
              size="sm"
              variant={account.status === 'Disabled' ? 'ghost' : 'danger-soft'}
              icon={account.status === 'Disabled' ? 'lock_open' : 'block'}
              onClick={onToggle}
            >
              {account.status === 'Disabled' ? 'Enable' : 'Disable'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function AppAccessCard({ student }: { student: Student }) {
  const can = useCan();
  const toast = useToast();
  const accounts = useDataStore((s) => s.portalAccounts);
  const invite = useDataStore((s) => s.invitePortalAccounts);
  const setStatus = useDataStore((s) => s.setPortalAccountStatus);
  const { student: studentMap } = useLookups();
  const canManage = can('students.manage');

  const { studentAccount, parentAccount } = useMemo(() => {
    const phoneKey = normalizePhone(student.guardian.phone);
    return {
      studentAccount: accounts.find((a) => a.role === 'student' && a.studentIds.includes(student.id)),
      // Match the store's own rule (one parent login per number), then fall back
      // to any parent login that already lists this child.
      parentAccount:
        accounts.find((a) => a.role === 'parent' && a.loginId === phoneKey) ??
        accounts.find((a) => a.role === 'parent' && a.studentIds.includes(student.id)),
    };
  }, [accounts, student.guardian.phone, student.id]);

  const siblingNames = (account: PortalAccount | undefined): string[] =>
    (account?.studentIds ?? [])
      .filter((id) => id !== student.id)
      .map((id) => studentMap.get(id)?.name ?? id)
      .sort();

  const sendInvite = (role: PortalRole) => {
    const [created] = invite(student.id, [role]);
    if (!created) return toast({ title: 'Could not send the invite', tone: 'error' });
    // Say where it went; with neither email nor mobile on file, the link has to be shared by hand.
    const sentTo = created.email ?? created.phone;
    toast({
      title: role === 'student' ? 'Student invite sent' : 'Parent invite sent',
      description: sentTo
        ? `Sent to ${sentTo}. The activation link is valid for 7 days.`
        : 'No email or mobile is saved for this login — use "Copy invite link" to share it.',
      tone: sentTo ? 'success' : 'info',
    });
  };

  const copyInvite = async (account: PortalAccount) => {
    const link = account.token ? inviteLink(account.token.value) : '';
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Invite link copied', description: 'Paste it into a message to the family.' });
    } catch {
      // Clipboard access can be blocked (insecure context, browser policy).
      toast({ title: 'Could not copy the link', description: link, tone: 'error' });
    }
  };

  const toggle = (account: PortalAccount) => {
    const next = account.status === 'Disabled' ? 'Active' : 'Disabled';
    setStatus(account.id, next);
    toast({
      title: next === 'Disabled' ? 'App access disabled' : 'App access enabled',
      description: `${account.name} ${next === 'Disabled' ? 'can no longer sign in to' : 'can sign in to'} the student & parent app.`,
      tone: next === 'Disabled' ? 'info' : 'success',
    });
  };

  return (
    <Card className="flex flex-col gap-space-md lg:col-span-2">
      <CardHeader
        title="App access"
        icon="phone_iphone"
        subtitle="Parents sign in to the student & parent app with their mobile number; students sign in with their student ID."
      />
      <div className="grid gap-space-sm lg:grid-cols-2">
        <LoginRow
          role="student"
          account={studentAccount}
          loginId={student.id}
          siblings={[]}
          canManage={canManage}
          onInvite={() => sendInvite('student')}
          onCopy={() => studentAccount && void copyInvite(studentAccount)}
          onToggle={() => studentAccount && toggle(studentAccount)}
        />
        <LoginRow
          role="parent"
          account={parentAccount}
          loginId={`${student.guardian.name} · ${student.guardian.phone}`}
          siblings={siblingNames(parentAccount)}
          canManage={canManage}
          onInvite={() => sendInvite('parent')}
          onCopy={() => parentAccount && void copyInvite(parentAccount)}
          onToggle={() => parentAccount && toggle(parentAccount)}
        />
      </div>
    </Card>
  );
}
