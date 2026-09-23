/**
 * Faculty › Roles & permissions (read-only). Roles map to a fixed set of
 * permissions (config/permissions.ts); the server enforces the same matrix.
 *
 *  md+    role summary cards + a permission × role matrix (grouped by area)
 *  phones one expandable card per role listing what it can and can't do
 *
 * Every check/dash carries an accessible label, never colour alone.
 */
import { Fragment, useMemo } from 'react';
import type { Permission, Role } from '@/types/domain';
import { Card, Icon } from '@/components/ui';
import { PERMISSION_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS, can } from '@/config/permissions';
import { useDataStore } from '@/store/dataStore';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ROLES, ROLE_META } from '../staffRules';

const PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

// Permission keys are "<area>.<action>"; areas fold into these groups.
const AREA_GROUP: Record<string, string> = {
  dashboard: 'Overview',
  attendance: 'Attendance',
  students: 'Students',
  batches: 'Batches & syllabus',
  topics: 'Batches & syllabus',
  fees: 'Fees',
  performance: 'Performance',
  faculty: 'Administration',
  settings: 'Administration',
};

const GROUPS = PERMISSIONS.reduce<{ label: string; permissions: Permission[] }[]>((groups, p) => {
  const label = AREA_GROUP[p.split('.')[0]] ?? 'Other';
  const g = groups.find((x) => x.label === label);
  if (g) g.permissions.push(p);
  else groups.push({ label, permissions: [p] });
  return groups;
}, []);

function Allowed({ role, permission }: { role: Role; permission: Permission }) {
  return can(role, permission) ? (
    <Icon name="check_circle" filled className="text-primary" label={`${ROLE_LABELS[role]}: ${PERMISSION_LABELS[permission]} — allowed`} />
  ) : (
    <Icon name="remove" className="text-outline-variant" label={`${ROLE_LABELS[role]}: ${PERMISSION_LABELS[permission]} — not allowed`} />
  );
}

export function RolesMatrix() {
  const staff = useDataStore((s) => s.staff);
  const headcount = useMemo(() => {
    const map = new Map<Role, number>();
    for (const s of staff) if (s.status !== 'Inactive') map.set(s.role, (map.get(s.role) ?? 0) + 1);
    return map;
  }, [staff]);
  const granted = (r: Role) => PERMISSIONS.filter((p) => can(r, p)).length;

  return (
    <div className="flex flex-col gap-space-md">
      <p className="flex items-start gap-space-xs rounded-xl bg-surface-container-low px-space-md py-space-sm font-body-md text-body-md text-on-surface-variant">
        <Icon name="info" size={18} className="mt-px text-primary" />
        Each staff member has one role. Roles are fixed for your plan — change what someone can do by changing their role on the Staff tab.
      </p>

      {/* Tablet & desktop: role cards + matrix */}
      <div className="hidden gap-space-sm md:grid md:grid-cols-2 xl:grid-cols-5">
        {ROLES.map((r) => (
          <Card key={r} className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-low text-primary">
                <Icon name={ROLE_META[r].icon} />
              </span>
              <div className="min-w-0">
                <p className="truncate font-title-md text-title-md text-on-surface">{ROLE_LABELS[r]}</p>
                <p className="font-body-sm text-body-sm text-secondary">{pluralize(headcount.get(r) ?? 0, 'person', 'people')}</p>
              </div>
            </div>
            <p className="flex-1 font-body-sm text-body-sm text-on-surface-variant">{ROLE_DESCRIPTIONS[r]}</p>
            <p className="font-label-md text-label-md text-primary tnum">
              {granted(r)} of {PERMISSIONS.length} permissions
            </p>
          </Card>
        ))}
      </div>

      <Card padded={false} className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <caption className="sr-only">Permissions granted to each role</caption>
            <thead>
              <tr className="bg-surface-container-low">
                <th scope="col" className="th w-[34%]">
                  Permission
                </th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="th text-center">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <Fragment key={g.label}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={ROLES.length + 1}
                      className="border-t border-surface-container-low bg-surface px-space-sm py-1.5 text-left font-label-sm text-label-sm uppercase tracking-wider text-secondary"
                    >
                      {g.label}
                    </th>
                  </tr>
                  {g.permissions.map((p) => (
                    <tr key={p} className="border-t border-surface-container-low hover:bg-surface-container-low/60">
                      <th scope="row" className="td text-left font-body-md text-body-md font-normal text-on-surface">
                        {PERMISSION_LABELS[p]}
                      </th>
                      {ROLES.map((r) => (
                        <td key={r} className="td text-center">
                          <Allowed role={r} permission={p} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Phones: one expandable card per role */}
      <ul className="flex flex-col gap-space-sm md:hidden">
        {ROLES.map((r) => (
          <li key={r}>
            <details className="card group overflow-hidden">
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-space-sm p-space-md [&::-webkit-details-marker]:hidden">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary">
                  <Icon name={ROLE_META[r].icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-title-md text-title-md text-on-surface">{ROLE_LABELS[r]}</span>
                  <span className="block font-body-sm text-body-sm text-secondary">
                    {pluralize(headcount.get(r) ?? 0, 'person', 'people')} · {granted(r)} of {PERMISSIONS.length} permissions
                  </span>
                </span>
                <Icon name="expand_more" className="text-secondary transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-space-sm border-t border-surface-container-low p-space-md">
                <p className="font-body-md text-body-md text-on-surface-variant">{ROLE_DESCRIPTIONS[r]}</p>
                <ul className="flex flex-col gap-space-xs">
                  {PERMISSIONS.map((p) => {
                    const ok = can(r, p);
                    return (
                      <li
                        key={p}
                        className={cn(
                          'flex items-center gap-space-xs font-body-md text-body-md',
                          ok ? 'text-on-surface' : 'text-secondary',
                        )}
                      >
                        <Icon
                          name={ok ? 'check_circle' : 'remove'}
                          filled={ok}
                          size={18}
                          className={ok ? 'text-primary' : 'text-outline-variant'}
                          label={ok ? 'Allowed' : 'Not allowed'}
                        />
                        <span className={cn(!ok && 'line-through decoration-outline-variant')}>{PERMISSION_LABELS[p]}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
