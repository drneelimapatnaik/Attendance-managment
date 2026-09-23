/**
 * Signed-in user menu. In demo mode it also offers "Switch demo account" so
 * reviewers can see each role's view (RBAC) without signing out.
 */
import { useNavigate } from 'react-router-dom';
import { Avatar, Icon, Menu, type MenuItem } from '@/components/ui';
import { useCurrentUser } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useSessionStore } from '@/store/sessionStore';
import { ROLE_LABELS } from '@/config/permissions';
import { useMockBackend } from '@/config/env';
import { signOut } from '@/services/auth';

export function ProfileMenu() {
  const user = useCurrentUser();
  const staff = useDataStore((s) => s.staff);
  const setSession = useSessionStore((s) => s.setSession);
  const tenantCode = useSessionStore((s) => s.tenantCode);
  const navigate = useNavigate();
  if (!user) return null;

  // One demo account per role.
  const demoAccounts = useMockBackend
    ? staff.filter(
        (s, i, all) => s.status === 'Active' && s.id !== user.id && all.findIndex((x) => x.role === s.role && x.status === 'Active') === i,
      )
    : [];

  const items: MenuItem[] = [
    ...demoAccounts.map((s, i) => ({
      label: s.name,
      description: `View as ${ROLE_LABELS[s.role]}`,
      icon: 'switch_account',
      separator: i === 0,
      onSelect: () => {
        setSession({ userId: s.id, tenantCode: tenantCode ?? 'APEX', token: `demo.${s.id}` });
        navigate('/dashboard');
      },
    })),
    {
      label: 'Sign out',
      icon: 'logout',
      tone: 'danger',
      separator: true,
      onSelect: () => {
        signOut();
        navigate('/login');
      },
    },
  ];

  return (
    <Menu
      width="w-72"
      items={items}
      header={
        <div className="flex items-center gap-space-xs border-b border-outline-variant/30 px-space-sm py-space-sm">
          <Avatar name={user.name} src={user.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate font-label-lg text-label-lg text-on-surface">{user.name}</p>
            <p className="truncate font-body-sm text-body-sm text-secondary">{user.email}</p>
            <p className="font-label-sm text-label-sm text-primary">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
      }
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label="Account menu"
          className="group flex items-center gap-space-xs rounded-lg py-1 pl-space-2xs pr-1"
        >
          <Avatar
            name={user.name}
            src={user.avatarUrl}
            size="sm"
            className="ring-2 ring-primary/20 transition-all group-hover:ring-primary"
          />
          <span className="hidden flex-col text-left 2xl:flex">
            <span className="font-label-lg text-label-lg font-semibold leading-tight text-on-surface">{user.name}</span>
            <span className="font-label-sm text-label-sm leading-tight text-secondary">{user.title}</span>
          </span>
          <Icon name="expand_more" size={18} className="hidden text-secondary group-hover:text-on-surface sm:block" />
        </button>
      )}
    />
  );
}
