/**
 * Faculty › Roles: the institute's own staff roles.
 *
 * Every deployment ships with two built-in roles (Administrator, Faculty) and
 * creates any others it needs — "Accountant", "Front Desk", "Branch Head" —
 * from the fixed capability catalogue (config/permissions.ts).
 *
 *  - the table lists each role with its description, staff count, built-in
 *    badge and a summary of what it may do (cards on phones)
 *  - create / duplicate / edit open RoleFormModal (permission picker)
 *  - delete asks where to move the staff who hold the role, and offers undo
 *
 * Writes go through the store, which re-checks the rules in domain/roles.ts and
 * returns the reason a refusal happened; it is shown as an error toast.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ID, Role } from '@/types/domain';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  SelectField,
  Tag,
  type Column,
  type MenuItem,
} from '@/components/ui';
import { useCan, useCurrentUser, useRoles } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { ALL_PERMISSIONS, permissionAreas, permissionLabel } from '@/config/permissions';
import { staffCountForRole } from '@/domain/roles';
import { pluralize } from '@/lib/format';
import RoleFormModal from '../RoleFormModal';
import { roleMeta } from '../staffRules';

interface RoleRow {
  role: Role;
  /** Everyone holding the role, whatever their status — they all have to move before it can go. */
  holders: number;
  areas: string[];
}

/** What the role can do, in a line: the areas it touches, or a single permission spelled out. */
function PermissionSummary({ row }: { row: RoleRow }) {
  const { role, areas } = row;
  if (!role.permissions.length) return <span className="font-body-sm text-body-sm text-secondary">Nothing yet</span>;
  if (role.permissions.length === 1)
    return <span className="font-body-md text-body-md text-on-surface-variant">{permissionLabel(role.permissions[0])}</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {areas.map((a) => (
        <Tag key={a}>{a}</Tag>
      ))}
    </div>
  );
}

export function RolesPanel() {
  const can = useCan();
  const canManage = can('faculty.manage');
  const toast = useToast();
  const me = useCurrentUser();
  const roles = useRoles();
  const staff = useDataStore((s) => s.staff);
  const addRole = useDataStore((s) => s.addRole);
  const deleteRole = useDataStore((s) => s.deleteRole);
  const updateStaff = useDataStore((s) => s.updateStaff);

  // One modal for create / edit / duplicate; `null` keeps it closed.
  const [form, setForm] = useState<{ role?: Role; copyFrom?: Role } | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [reassignTo, setReassignTo] = useState<ID>('');

  const rows = useMemo<RoleRow[]>(
    () =>
      roles.map((role) => ({
        role,
        holders: staffCountForRole(role.id, staff),
        areas: permissionAreas(role.permissions),
      })),
    [roles, staff],
  );

  const openDelete = (role: Role) => {
    setDeleting(role);
    // Default the reassignment to the Faculty role (or any other role) so the
    // dialog is one click for the common case.
    const others = roles.filter((r) => r.id !== role.id);
    setReassignTo((others.find((r) => r.key === 'faculty') ?? others[0])?.id ?? '');
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const role = deleting;
    const moving = staff.filter((s) => s.roleId === role.id).map((s) => s.id);
    const result = deleteRole(role.id, moving.length ? reassignTo : undefined);
    setDeleting(null);
    if (!result.ok) {
      toast({ title: `${role.name} wasn’t deleted`, description: result.reason, tone: 'error' });
      return;
    }
    const target = result.reassignedTo;
    toast({
      title: `${role.name} deleted`,
      description: target ? `${pluralize(moving.length, 'staff member', 'staff members')} moved to ${target.name}.` : undefined,
      action: {
        label: 'Undo',
        onClick: () => {
          // Recreate the role and put the staff who moved back on it.
          const back = addRole({ name: role.name, description: role.description, permissions: role.permissions });
          if (!back.ok) {
            toast({ title: 'Could not restore the role', description: back.reason, tone: 'error' });
            return;
          }
          for (const id of moving) updateStaff(id, { roleId: back.role.id });
          toast({ title: `${role.name} restored` });
        },
      },
    });
  };

  /**
   * Nobody but the owner may change the role they are signed in with — the
   * store refuses it too, but the menu should say so before anyone tries.
   */
  const ownRoleLock = (role: Role) =>
    !me?.isOwner && me?.roleId === role.id ? 'You can’t change the role you are signed in with.' : undefined;

  const actions = (row: RoleRow): MenuItem[] => {
    const own = ownRoleLock(row.role);
    return [
      {
        label: 'Edit role',
        icon: 'edit',
        disabled: !!own,
        description: own,
        onSelect: () => setForm({ role: row.role }),
      },
      {
        label: 'Duplicate',
        icon: 'content_copy',
        description: 'Start a new role from this one',
        onSelect: () => setForm({ copyFrom: row.role }),
      },
      {
        label: 'Delete role',
        icon: 'delete',
        tone: 'danger',
        separator: true,
        disabled: row.role.isSystem || !!own,
        description: row.role.isSystem ? 'Built-in roles can’t be deleted.' : own,
        onSelect: () => openDelete(row.role),
      },
    ];
  };

  const nameCell = (row: RoleRow) => (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-space-2xs">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary">
          <Icon name={roleMeta(row.role).icon} size={18} />
        </span>
        <span className="font-title-md text-title-md text-on-surface">{row.role.name}</span>
        {row.role.isSystem && (
          <Badge tone="info" icon="verified">
            Built-in
          </Badge>
        )}
        {me?.roleId === row.role.id && <Badge tone="primary">Your role</Badge>}
      </div>
      {row.role.description && <p className="mt-1 font-body-sm text-body-sm text-secondary">{row.role.description}</p>}
    </div>
  );

  const columns: Column<RoleRow>[] = [
    { key: 'name', header: 'Role', sortValue: (r) => r.role.name, headerClassName: 'min-w-[260px]', cell: nameCell },
    {
      key: 'staff',
      header: 'Staff',
      align: 'center',
      sortValue: (r) => r.holders,
      cell: (r) =>
        r.holders ? (
          <Link
            to={`/faculty?role=${r.role.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-label-lg text-label-lg text-primary hover:underline tnum"
          >
            {r.holders}
          </Link>
        ) : (
          <span className="text-secondary">—</span>
        ),
    },
    {
      key: 'permissions',
      header: 'Can do',
      hideBelow: 'lg',
      sortValue: (r) => r.role.permissions.length,
      cell: (r) => <PermissionSummary row={r} />,
    },
    {
      key: 'count',
      header: 'Permissions',
      align: 'center',
      sortValue: (r) => r.role.permissions.length,
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface-variant tnum',
      cell: (r) =>
        r.role.permissions.length === ALL_PERMISSIONS.length ? 'All' : `${r.role.permissions.length} of ${ALL_PERMISSIONS.length}`,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right' as const,
            headerClassName: 'pr-space-md',
            cell: (r: RoleRow) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <IconButton
                  icon="edit"
                  label={`Edit ${r.role.name}`}
                  size="sm"
                  disabled={!!ownRoleLock(r.role)}
                  onClick={() => setForm({ role: r.role })}
                />
                <Menu
                  width="w-72"
                  items={actions(r)}
                  trigger={(props) => <IconButton {...props} icon="more_vert" label={`More actions for ${r.role.name}`} size="sm" />}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  const mobileCard = (r: RoleRow) => (
    <div className="flex flex-col gap-space-xs">
      {nameCell(r)}
      <div className="flex flex-wrap items-center gap-space-xs">
        <PermissionSummary row={r} />
      </div>
      <div className="flex items-center justify-between gap-space-xs">
        <span className="font-body-sm text-body-sm text-secondary tnum">
          {pluralize(r.holders, 'staff member', 'staff members')} ·{' '}
          {r.role.permissions.length === ALL_PERMISSIONS.length ? 'all permissions' : `${r.role.permissions.length} permissions`}
        </span>
        {canManage && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <IconButton
              icon="edit"
              label={`Edit ${r.role.name}`}
              size="sm"
              disabled={!!ownRoleLock(r.role)}
              onClick={() => setForm({ role: r.role })}
            />
            <Menu
              width="w-72"
              items={actions(r)}
              trigger={(props) => <IconButton {...props} icon="more_vert" label={`More actions for ${r.role.name}`} size="sm" />}
            />
          </div>
        )}
      </div>
    </div>
  );

  const deletingHolders = deleting ? staff.filter((s) => s.roleId === deleting.id).length : 0;

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-col gap-space-sm sm:flex-row sm:items-center">
        <p className="flex flex-1 items-start gap-space-xs rounded-xl bg-surface-container-low px-space-md py-space-sm font-body-md text-body-md text-on-surface-variant">
          <Icon name="info" size={18} className="mt-px text-primary" />
          Roles are yours to shape: create any role your institute needs and pick what it may do. Administrator and Faculty are built in and
          can’t be deleted.
        </p>
        {canManage && (
          <Button icon="add" onClick={() => setForm({})} className="sm:self-stretch">
            New role
          </Button>
        )}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.role.id}
        mobileCard={mobileCard}
        onRowClick={canManage ? (r) => !ownRoleLock(r.role) && setForm({ role: r.role }) : undefined}
        entityLabel="roles"
        pageSize={0}
        caption="Staff roles and what each one can do"
        initialSort={{ key: 'staff', dir: 'desc' }}
        empty={
          <EmptyState
            icon="admin_panel_settings"
            title="No roles yet"
            description="Create the roles your institute works with, then assign staff to them."
            action={
              canManage ? (
                <Button icon="add" onClick={() => setForm({})}>
                  New role
                </Button>
              ) : undefined
            }
          />
        }
      />

      {form && <RoleFormModal open onClose={() => setForm(null)} role={form.role} copyFrom={form.copyFrom} />}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete this role?"
        confirmLabel="Delete role"
        message={
          deleting && (
            <div className="flex flex-col gap-space-sm">
              <p>
                <strong className="text-on-surface">{deleting.name}</strong> will be removed from your institute. The permissions catalogue
                is unchanged — only this role goes.
              </p>
              {deletingHolders > 0 && (
                <SelectField
                  label={`Move ${pluralize(deletingHolders, 'staff member', 'staff members')} to`}
                  required
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  options={roles.filter((r) => r.id !== deleting.id).map((r) => ({ value: r.id, label: r.name }))}
                  hint="They keep their profile and batches; only what they can do changes."
                />
              )}
            </div>
          )
        }
      />
    </div>
  );
}
