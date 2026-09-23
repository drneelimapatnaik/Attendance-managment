/**
 * Mobile navigation (below lg):
 *  - BottomNav: 4 primary tabs + "More" (DESIGN.md › Mobile: bottom touch bar)
 *  - MobileDrawer: slide-in panel with the full sidebar content
 * Both respect safe-area insets for notched phones.
 */
import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ALL_NAV_ITEMS } from '@/config/navigation';
import { useCan } from '@/hooks/useTenant';
import { useEscape } from '@/hooks/ui';
import { useUiStore } from '@/store/uiStore';
import { Icon, IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { BrandMark, SidebarContent } from './Sidebar';

export function BottomNav() {
  const can = useCan();
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  const tabs = ALL_NAV_ITEMS.filter((i) => i.mobileTab && can(i.permission)).slice(0, 4);
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant/30 bg-surface-container-lowest/95 pb-safe backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            className={({ isActive }) =>
              cn(
                'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors',
                isActive ? 'text-primary' : 'text-secondary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-primary-fixed')}
                >
                  <Icon name={t.icon} filled={isActive} size={22} />
                </span>
                <span className="font-label-sm text-[10px]">{t.shortLabel ?? t.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-secondary"
        >
          <span className="flex h-7 w-12 items-center justify-center">
            <Icon name="menu" size={22} />
          </span>
          <span className="font-label-sm text-[10px]">More</span>
        </button>
      </div>
    </nav>
  );
}

export function MobileDrawer() {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  const { pathname } = useLocation();
  useEscape(() => setOpen(false), open);

  // Close whenever the route changes.
  useEffect(() => setOpen(false), [pathname, setOpen]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <div className="absolute inset-0 animate-fade-in bg-[#0F172A66]" onClick={() => setOpen(false)} />
      <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] animate-slide-in-left flex-col bg-surface-container-lowest pt-safe shadow-level-3">
        <div className="flex h-16 items-center justify-between border-b border-outline-variant/20 px-space-md">
          <BrandMark />
          <IconButton icon="close" label="Close menu" onClick={() => setOpen(false)} />
        </div>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </aside>
    </div>
  );
}
