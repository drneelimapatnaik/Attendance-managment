/**
 * Primary navigation — matches the roster design's left sidebar.
 *
 * Desktop (lg+): fixed, 256px expanded or a 72px icon rail (collapse button).
 * Mobile/tablet: the same content renders inside <MobileDrawer>.
 * Items are filtered by the signed-in user's role (config/navigation.ts).
 */
import { NavLink } from 'react-router-dom';
import { NAV_SECTIONS, type NavItem } from '@/config/navigation';
import { useCan, useSettings } from '@/hooks/useTenant';
import { useUiStore } from '@/store/uiStore';
import { Icon, IconButton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/date';

export function BrandMark({ compact, hideSubtitle }: { compact?: boolean; hideSubtitle?: boolean }) {
  const settings = useSettings();
  return (
    <div className="flex min-w-0 items-center gap-space-xs">
      <img src={settings.logoUrl || '/icon.svg'} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
      {!compact && (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-title-md text-title-md leading-tight tracking-tight text-primary">EduTrack</span>
          {!hideSubtitle && (
            <span className="font-label-sm text-label-sm uppercase leading-none tracking-wider text-secondary">Tuition Suite</span>
          )}
        </div>
      )}
    </div>
  );
}

function NavEntry({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-space-xs rounded-lg px-space-sm py-2.5 transition-all lg:py-space-xs',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary-container font-bold text-on-primary shadow-sm'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} filled={isActive} />
          {!collapsed && <span className="truncate font-label-lg text-label-lg">{item.label}</span>}
          {!collapsed && item.badge === 'live' && (
            <span
              className={cn(
                'ml-auto rounded-full px-space-2xs py-0.5 font-label-sm text-label-sm',
                isActive ? 'bg-on-primary/20 text-on-primary' : 'bg-primary-fixed text-on-primary-fixed',
              )}
            >
              Live
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** Navigation list + licence footer; shared by the desktop sidebar and the mobile drawer. */
export function SidebarContent({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const can = useCan();
  const settings = useSettings();
  const sections = NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => can(i.permission)) })).filter((s) => s.items.length);

  return (
    <>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-space-sm py-space-md">
        <div className="space-y-space-md">
          {sections.map((section) => (
            <div key={section.title} className="space-y-space-2xs">
              {collapsed ? (
                <div className="mx-auto h-px w-6 bg-outline-variant/40" />
              ) : (
                <span className="block px-space-xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
                  {section.title}
                </span>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavEntry key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
      <div className="border-t border-outline-variant/20 p-space-sm">
        {collapsed ? (
          <div className="flex justify-center text-primary" title={`License active · ${settings.license.tier}`}>
            <Icon name="verified" />
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-xs">
            <div className="flex items-center gap-space-2xs">
              <Icon name="verified" size={18} className="text-primary" />
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm font-semibold text-on-surface">License Active</span>
                <span className="font-body-sm text-body-sm text-secondary">
                  {settings.license.tier} Tier {settings.academicYear}
                </span>
              </div>
            </div>
            <span className="p-1 text-primary" title={`Valid until ${formatDate(settings.license.validUntil)}`}>
              <Icon name="help" size={18} />
            </span>
          </div>
        )}
      </div>
    </>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 hidden h-full flex-col border-r border-outline-variant/30 bg-surface-container-lowest shadow-bar transition-[width] duration-200 lg:flex',
        collapsed ? 'w-rail' : 'w-sidebar',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center border-b border-outline-variant/20',
          collapsed ? 'justify-center' : 'justify-between px-space-md',
        )}
      >
        {!collapsed && <BrandMark />}
        <IconButton
          icon={collapsed ? 'menu' : 'menu_open'}
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          size="sm"
          onClick={toggle}
        />
      </div>
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}
