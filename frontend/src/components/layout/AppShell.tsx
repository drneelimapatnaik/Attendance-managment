/**
 * Authenticated application frame: sidebar + top bar + routed page,
 * plus mobile navigation, the global modal host and toasts.
 */
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import { useOnlineStatus } from '@/hooks/ui';
import { Icon, PageLoader, Toaster } from '@/components/ui';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { GlobalModals } from '@/app/GlobalModals';
import { cn } from '@/lib/cn';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav, MobileDrawer } from './MobileNav';

function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-space-xs bg-inverse-surface px-space-md py-1.5 font-label-md text-label-md text-inverse-on-surface"
    >
      <Icon name="cloud_off" size={16} />
      You're offline — changes are saved on this device and will sync when you reconnect.
    </div>
  );
}

export function AppShell() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        Skip to content
      </a>
      <Sidebar />
      <MobileDrawer />
      <div className={cn('flex min-h-dvh flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-rail' : 'lg:pl-sidebar')}>
        <Topbar />
        <OfflineBanner />
        <main
          id="main"
          className="w-full flex-1 bg-surface px-space-md py-space-md pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-space-lg md:py-space-lg lg:pb-space-lg"
        >
          {/* Reset the error boundary on navigation so one broken page never locks the app. */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
      <GlobalModals />
      <Toaster />
    </div>
  );
}
