/**
 * "Current Institute" pill from the design. Switches the campus in view
 * (or all campuses); every screen reads data through useScopedData().
 */
import { Icon, Menu } from '@/components/ui';
import { ALL_CAMPUSES, useActiveCampusId, useSettings } from '@/hooks/useTenant';
import { useUiStore } from '@/store/uiStore';

export function CampusSwitcher() {
  const settings = useSettings();
  const active = useActiveCampusId();
  const setCampus = useUiStore((s) => s.setCampusId);
  const campusName = active === ALL_CAMPUSES ? 'All Campuses' : settings.campuses.find((c) => c.id === active)?.name;

  return (
    <Menu
      align="start"
      width="w-72"
      header={
        <div className="border-b border-outline-variant/30 px-space-sm py-space-xs">
          <p className="font-label-sm text-label-sm uppercase text-secondary">Switch campus</p>
        </div>
      }
      items={[
        ...settings.campuses.map((c) => ({
          label: c.name,
          description: c.address,
          icon: 'domain',
          checked: c.id === active,
          onSelect: () => setCampus(c.id),
        })),
        {
          label: 'All Campuses',
          icon: 'apartment',
          checked: active === ALL_CAMPUSES,
          onSelect: () => setCampus(ALL_CAMPUSES),
          separator: true,
        },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="flex min-w-0 items-center gap-space-2xs rounded-lg border border-outline-variant/30 bg-surface-container-low px-space-sm py-1.5 text-left text-on-surface transition-colors hover:bg-surface-container"
        >
          <Icon name="domain" className="text-primary" />
          <span className="flex min-w-0 flex-col">
            <span className="font-label-sm text-label-sm uppercase leading-none text-secondary">Current Institute</span>
            <span className="flex items-center gap-1 truncate font-label-lg text-label-lg font-semibold leading-tight">
              <span className="truncate">
                {settings.name} - {campusName}
              </span>
              <Icon name="arrow_drop_down" size={16} className="text-secondary" />
            </span>
          </span>
        </button>
      )}
    />
  );
}
