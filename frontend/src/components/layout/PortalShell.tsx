/**
 * Frame for the student & parent app: a compact top bar (institute, child
 * switcher for parents, account menu), the routed page, and a bottom tab bar.
 *
 * Deliberately simpler and larger-touch than the staff console — this surface
 * is used almost entirely on phones, though it scales up to a centred column
 * on tablets and desktops.
 */
import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Avatar, Icon, Menu, PageLoader, Toaster, type MenuItem } from '@/components/ui';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { portalNavFor } from '@/config/portalNavigation';
import { usePortalAccount, usePortalStudents, useActiveStudent } from '@/hooks/usePortal';
import { useSettings } from '@/hooks/useTenant';
import { useSessionStore } from '@/store/sessionStore';
import { signOutPortal } from '@/services/portalAuth';
import { cn } from '@/lib/cn';

export function PortalShell() {
  const navigate = useNavigate();
  const settings = useSettings();
  const account = usePortalAccount();
  const children = usePortalStudents();
  const active = useActiveStudent();
  const setActiveStudent = useSessionStore((s) => s.setActiveStudent);
  const nav = portalNavFor(account?.role);
  const tabs = nav.filter((i) => i.tab).slice(0, 5);

  const accountMenu: MenuItem[] = [
    { label: 'Account & settings', icon: 'settings', onSelect: () => navigate('/portal/profile') },
    { label: 'Timetable', icon: 'calendar_month', onSelect: () => navigate('/portal/timetable') },
    {
      label: 'Sign out',
      icon: 'logout',
      tone: 'danger',
      separator: true,
      onSelect: () => {
        signOutPortal();
        navigate('/portal/login', { replace: true });
      },
    },
  ];

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-40 border-b border-outline-variant/30 bg-surface-container-lowest/95 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-space-xs px-space-md">
          <div className="flex min-w-0 items-center gap-space-xs">
            <img src={settings.logoUrl || '/icon.svg'} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            <div className="min-w-0">
              <p className="truncate font-label-lg text-label-lg text-on-surface">{settings.name}</p>
              <p className="truncate font-label-sm text-label-sm text-secondary">
                {account?.role === 'parent' ? 'Parent app' : 'Student app'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-space-2xs">
            {/* Parents linked to more than one student switch child here. */}
            {children.length > 1 && active && (
              <Menu
                width="w-64"
                items={children.map((c) => ({
                  label: c.name,
                  description: `${c.grade} · ${c.section}`,
                  icon: 'school',
                  checked: c.id === active.id,
                  onSelect: () => setActiveStudent(c.id),
                }))}
                trigger={(props) => (
                  <button
                    {...props}
                    className="flex items-center gap-1.5 rounded-full bg-surface-container-low py-1 pl-1 pr-2 text-on-surface transition-colors hover:bg-surface-container"
                  >
                    <Avatar name={active.name} src={active.photoUrl} size="xs" />
                    <span className="max-w-[7rem] truncate font-label-md text-label-md">{active.name.split(' ')[0]}</span>
                    <Icon name="expand_more" size={16} className="text-secondary" />
                  </button>
                )}
              />
            )}
            <Menu
              width="w-60"
              items={accountMenu}
              header={
                account && (
                  <div className="border-b border-outline-variant/30 px-space-sm py-space-xs">
                    <p className="font-label-lg text-label-lg text-on-surface">{account.name}</p>
                    <p className="font-body-sm text-body-sm text-secondary">{account.email ?? account.loginId}</p>
                  </div>
                )
              }
              trigger={(props) => (
                <button {...props} aria-label="Account menu" className="rounded-full p-0.5">
                  <Avatar name={account?.name ?? '?'} size="sm" />
                </button>
              )}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-space-md py-space-md pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <nav
        aria-label="App sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant/30 bg-surface-container-lowest/95 pb-safe backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {tabs.map((t) => (
            <NavLink
              key={t.path}
              to={t.path}
              end={t.path === '/portal'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 px-1',
                  isActive ? 'text-primary' : 'text-secondary',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-primary-fixed',
                    )}
                  >
                    <Icon name={t.icon} filled={isActive} size={22} />
                  </span>
                  <span className="font-label-sm text-[10px]">{t.shortLabel ?? t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <Toaster />
    </div>
  );
}
