/**
 * Top app bar — sticky, translucent, from the roster design.
 *
 *  [☰ mobile] [Current Institute ▾] [Search…]   [date] [🔔] [New Entry] | [avatar ▾]
 *
 * Collapses progressively: date hides below xl, the institute pill below md,
 * search becomes an icon on phones.
 */
import { useUiStore } from '@/store/uiStore';
import { IconButton, Icon } from '@/components/ui';
import { formatLongDate, today } from '@/lib/date';
import { CampusSwitcher } from './topbar/CampusSwitcher';
import { GlobalSearch } from './topbar/GlobalSearch';
import { NotificationsMenu } from './topbar/NotificationsMenu';
import { NewEntryMenu } from './topbar/NewEntryMenu';
import { ProfileMenu } from './topbar/ProfileMenu';
import { BrandMark } from './Sidebar';

export function Topbar() {
  const setMobileNav = useUiStore((s) => s.setMobileNavOpen);
  return (
    <header className="sticky top-0 z-40 border-b border-outline-variant/30 bg-surface-container-lowest/90 pt-safe shadow-bar backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-space-sm px-space-sm md:gap-space-md md:px-space-lg">
        <div className="flex min-w-0 flex-1 items-center gap-space-xs md:gap-space-md">
          <IconButton icon="menu" label="Open menu" className="lg:hidden" onClick={() => setMobileNav(true)} />
          <div className="md:hidden">
            <BrandMark hideSubtitle />
          </div>
          <div className="hidden min-w-0 md:block">
            <CampusSwitcher />
          </div>
          <GlobalSearch />
        </div>
        <div className="flex shrink-0 items-center gap-space-2xs md:gap-space-sm">
          <div className="hidden items-center gap-space-2xs rounded-lg bg-surface-container-low px-space-sm py-1.5 text-secondary xl:flex">
            <Icon name="calendar_today" size={18} />
            <span className="font-label-md text-label-md font-semibold text-on-surface-variant">{formatLongDate(today())}</span>
          </div>
          <NotificationsMenu />
          <NewEntryMenu />
          <div className="hidden h-8 w-px bg-outline-variant/30 sm:block" />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
