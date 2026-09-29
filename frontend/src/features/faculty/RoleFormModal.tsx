/**
 * Create / edit a staff role (Faculty & Roles › Roles).
 *
 * The capability catalogue is fixed (config/permissions.ts); the name,
 * description and permission set are the institute's. The picker is grouped by
 * area with plain-language labels, a select-all per group and a live
 * "this role will be able to…" summary.
 *
 * Two kinds of checkbox are locked:
 *  - permissions a built-in role must keep (the reason is shown), and
 *  - permissions the signed-in user doesn't hold themselves — nobody can grant
 *    more than they have (the owner holds everything).
 * Dependent permissions travel together: ticking "Collect fees" also ticks
 * "View fees", and unticking the view permission drops the manage one.
 * The store re-checks everything and returns a reason, shown here as a banner.
 */
import { useMemo, useState, type FormEvent } from 'react';
import type { Permission, Role } from '@/types/domain';
import { Button, Checkbox, Icon, Modal, TextArea, TextField } from '@/components/ui';
import { useCurrentUser, useMyPermissions } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_REQUIRES,
  lockedPermissions,
  permissionLabel,
  withRequired,
} from '@/config/permissions';
import { staffCountForRole } from '@/domain/roles';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface RoleFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The role being edited; omit to create a new one. */
  role?: Role;
  /** Start a new role from this one's permissions ("Duplicate"). */
  copyFrom?: Role;
}

/** Permissions that stop making sense once `p` is switched off. */
const dependentsOf = (p: Permission): Permission[] =>
  (Object.entries(PERMISSION_REQUIRES) as [Permission, Permission][]).filter(([, needs]) => needs === p).map(([dep]) => dep);

export default function RoleFormModal({ open, onClose, role, copyFrom }: RoleFormModalProps) {
  const toast = useToast();
  const me = useCurrentUser();
  const myPermissions = useMyPermissions();
  const staff = useDataStore((s) => s.staff);
  const addRole = useDataStore((s) => s.addRole);
  const updateRole = useDataStore((s) => s.updateRole);

  const source = role ?? copyFrom;
  const [name, setName] = useState(role ? role.name : copyFrom ? `${copyFrom.name} (copy)` : '');
  const [description, setDescription] = useState(source?.description ?? '');
  const [permissions, setPermissions] = useState<Permission[]>(() => withRequired(source?.permissions ?? ['dashboard.view']));
  const [nameError, setNameError] = useState<string>();
  const [refusal, setRefusal] = useState<string>();
  const [saving, setSaving] = useState(false);

  const locked = lockedPermissions(role);
  const lockedSet = useMemo(() => new Set(locked?.permissions ?? []), [locked]);
  /** Nothing can be granted that the signed-in user doesn't hold (owners hold everything). */
  const ungrantable = useMemo(
    () => new Set(ALL_PERMISSIONS.filter((p) => !me?.isOwner && !myPermissions.includes(p) && !source?.permissions.includes(p))),
    [me?.isOwner, myPermissions, source],
  );
  const holders = role ? staffCountForRole(role.id, staff) : 0;

  const has = (p: Permission) => permissions.includes(p);
  const isLocked = (p: Permission) => lockedSet.has(p) || ungrantable.has(p);

  const apply = (mutate: (set: Set<Permission>) => void) =>
    setPermissions((prev) => {
      const next = new Set(prev);
      mutate(next);
      for (const p of lockedSet) next.add(p); // locked permissions stay on
      return ALL_PERMISSIONS.filter((p) => next.has(p));
    });

  const toggle = (p: Permission) =>
    apply((set) => {
      if (set.has(p)) {
        set.delete(p);
        for (const dep of dependentsOf(p)) set.delete(dep);
      } else {
        set.add(p);
        const needs = PERMISSION_REQUIRES[p];
        if (needs) set.add(needs);
      }
    });

  const toggleGroup = (keys: Permission[], on: boolean) =>
    apply((set) => {
      for (const p of keys) {
        if (ungrantable.has(p)) continue;
        if (on) {
          set.add(p);
          const needs = PERMISSION_REQUIRES[p];
          if (needs && !ungrantable.has(needs)) set.add(needs);
        } else {
          set.delete(p);
          for (const dep of dependentsOf(p)) set.delete(dep);
        }
      }
    });

  const summary = useMemo(() => withRequired(permissions).map(permissionLabel), [permissions]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNameError(undefined);
    setRefusal(undefined);
    setSaving(true);
    const draft = { name, description, permissions };
    const result = role ? updateRole(role.id, draft) : addRole(draft);
    setSaving(false);
    if (!result.ok) {
      // Name problems belong on the field; everything else is a banner.
      if (result.code === 'name-required' || result.code === 'name-taken') setNameError(result.reason);
      else setRefusal(result.reason);
      return;
    }
    toast({
      title: role ? `${result.role.name} updated` : `${result.role.name} created`,
      description: role
        ? `${pluralize(holders, 'staff member', 'staff members')} on this role now ${holders === 1 ? 'has' : 'have'} ${result.role.permissions.length} permissions.`
        : 'Assign it to staff from the Staff tab.',
    });
    onClose();
  };

  const sectionTitle = (icon: string, title: string) => (
    <h3 className="mb-space-sm flex items-center gap-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-secondary">
      <Icon name={icon} size={16} className="text-primary" />
      {title}
    </h3>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={role ? `Edit ${role.name}` : copyFrom ? `New role from ${copyFrom.name}` : 'New role'}
      description={
        role?.isSystem
          ? 'Built-in role — you can rename it and adjust what it may do, within the limits below.'
          : 'Name the role the way your institute does, then pick what it may do.'
      }
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" icon={role ? 'save' : 'add'} loading={saving}>
            {role ? 'Save role' : 'Create role'}
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-space-lg">
        {refusal && (
          <p
            role="alert"
            className="flex items-start gap-space-xs rounded-lg bg-error-container px-space-sm py-space-xs font-body-md text-body-md text-on-error-container"
          >
            <Icon name="error" size={18} className="mt-px" />
            {refusal}
          </p>
        )}

        <section>
          {sectionTitle('badge', 'Role')}
          <div className="flex flex-col gap-space-sm">
            <TextField
              label="Role name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={nameError}
              placeholder="e.g. Front Desk, Counsellor, Branch Head"
              hint={role?.isSystem ? 'Renaming a built-in role is fine — what it may do is limited below.' : undefined}
              autoComplete="off"
            />
            <TextArea
              label="Description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is responsible for — shown when assigning staff."
              hint="Optional, but it helps whoever invites staff pick the right role."
            />
          </div>
        </section>

        <section>
          {sectionTitle('tune', 'What this role can do')}
          {locked && (
            <p className="mb-space-sm flex items-start gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-space-xs font-body-sm text-body-sm text-on-surface-variant">
              <Icon name="lock" size={16} className="mt-px text-primary" />
              <span>
                <strong className="text-on-surface">Locked: {locked.permissions.map(permissionLabel).join(' · ')}.</strong> {locked.reason}
              </span>
            </p>
          )}
          <div className="flex flex-col gap-space-sm">
            {PERMISSION_GROUPS.map((group) => {
              const keys = group.permissions.map((p) => p.key);
              const on = keys.filter(has).length;
              const allOn = on === keys.length;
              return (
                <fieldset key={group.area} className="rounded-xl border border-outline-variant/50 p-space-sm">
                  <legend className="sr-only">{group.area}</legend>
                  <div className="mb-space-xs flex items-center justify-between gap-space-xs">
                    <span className="flex items-center gap-space-2xs font-title-sm text-title-sm text-on-surface">
                      <Icon name={group.icon} size={18} className="text-primary" />
                      {group.area}
                    </span>
                    <Checkbox
                      checked={allOn}
                      indeterminate={on > 0 && !allOn}
                      onChange={(e) => toggleGroup(keys, e.target.checked)}
                      aria-label={`${allOn ? 'Clear' : 'Select'} all ${group.area} permissions`}
                      label={<span className="font-label-md text-label-md text-secondary">{allOn ? 'Clear all' : 'Select all'}</span>}
                    />
                  </div>
                  <ul className="flex flex-col gap-space-2xs">
                    {group.permissions.map((p) => {
                      const disabled = isLocked(p.key);
                      const why = lockedSet.has(p.key)
                        ? 'Required for this built-in role.'
                        : ungrantable.has(p.key)
                          ? 'You don’t have this permission yourself, so you can’t grant it.'
                          : undefined;
                      return (
                        <li key={p.key}>
                          <label
                            className={cn(
                              'flex min-h-[44px] cursor-pointer items-start gap-space-xs rounded-lg px-space-2xs py-space-2xs md:min-h-0',
                              disabled ? 'cursor-not-allowed opacity-70' : 'hover:bg-surface-container-low',
                            )}
                          >
                            <Checkbox className="mt-0.5" checked={has(p.key)} disabled={disabled} onChange={() => toggle(p.key)} />
                            <span className="min-w-0">
                              <span className="flex items-center gap-space-2xs font-label-lg text-label-lg text-on-surface">
                                {p.label}
                                {disabled && <Icon name="lock" size={14} className="text-secondary" label={why} />}
                              </span>
                              <span className="block font-body-sm text-body-sm text-secondary">{why ?? p.description}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              );
            })}
          </div>
        </section>

        <section aria-live="polite" className="rounded-xl bg-surface-container-low p-space-md">
          <h3 className="flex items-center gap-space-2xs font-title-sm text-title-sm text-on-surface">
            <Icon name="visibility" size={18} className="text-primary" />
            {name.trim() ? `${name.trim()} will be able to…` : 'This role will be able to…'}
          </h3>
          {summary.length ? (
            <ul className="mt-space-xs grid gap-space-2xs sm:grid-cols-2">
              {summary.map((line) => (
                <li key={line} className="flex items-center gap-space-2xs font-body-md text-body-md text-on-surface-variant">
                  <Icon name="check_circle" filled size={16} className="text-primary" />
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-space-xs font-body-md text-body-md text-secondary">Nothing yet — tick at least one permission above.</p>
          )}
          <p className="mt-space-sm font-body-sm text-body-sm text-secondary tnum">
            {summary.length} of {ALL_PERMISSIONS.length} permissions
            {role ? ` · ${pluralize(holders, 'staff member', 'staff members')} on this role` : ''}
          </p>
        </section>
      </form>
    </Modal>
  );
}
