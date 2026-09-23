/**
 * Faculty › Staff tab: filter bar (search, role, status — in the URL), the
 * staff table (cards on phones) and per-member actions: edit, activate /
 * deactivate, resend invite and remove (confirmed). Guard rails from
 * staffRules.ts disable actions that would lock the institute out, with the
 * reason shown in the menu. `?staff=ID` highlights one member.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Role, Staff, StaffStatus } from '@/types/domain';
import {
  Menu,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Icon,
  IconButton,
  SearchInput,
  SelectField,
  Tag,
  type Column,
  type MenuItem,
} from '@/components/ui';
import { PersonCell, StaffStatusBadge } from '@/components/domain';
import { useCurrentUser, useSettings } from '@/hooks/useTenant';
import { useDebouncedValue } from '@/hooks/ui';
import { useDataStore } from '@/store/dataStore';
import { useToast, useUiStore } from '@/store/uiStore';
import { ROLE_LABELS } from '@/config/permissions';
import { relativeTime } from '@/lib/date';
import { ROLES, ROLE_META, accessLockReason, removeBlockReason } from '../staffRules';
import { useStaffFilters, useStaffRows, type StaffFilters, type StaffRow } from '../useStaffDirectory';

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge tone={ROLE_META[role].tone} icon={ROLE_META[role].icon}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

function lastActive(s: Staff, isMe: boolean): string {
  if (isMe) return 'Online now';
  if (s.lastActiveAt) return relativeTime(s.lastActiveAt);
  return s.status === 'Invited' ? 'Invite pending' : 'Never signed in';
}

/** Row actions: edit + overflow menu. Disabled items explain why. */
function StaffActions({ row, onRemove }: { row: StaffRow; onRemove: (s: Staff) => void }) {
  const me = useCurrentUser();
  const toast = useToast();
  const openModal = useUiStore((s) => s.openModal);
  const staff = useDataStore((s) => s.staff);
  const batches = useDataStore((s) => s.batches);
  const updateStaff = useDataStore((s) => s.updateStaff);
  const s = row.staff;
  const lock = accessLockReason(s, me, staff);
  const removeBlock = removeBlockReason(s, me, staff, batches);

  const setStatus = (status: StaffStatus) => {
    const previous = s.status;
    updateStaff(s.id, { status });
    toast({
      title: status === 'Inactive' ? `${s.name} deactivated` : `${s.name} reactivated`,
      description: status === 'Inactive' ? 'They can no longer sign in. Their records are kept.' : 'They can sign in again.',
      action: { label: 'Undo', onClick: () => updateStaff(s.id, { status: previous }) },
    });
  };

  const items: MenuItem[] = [
    { label: 'Edit details', icon: 'edit', onSelect: () => openModal({ type: 'staff-form', staffId: s.id }) },
    ...(s.status === 'Invited'
      ? [
          {
            label: 'Resend invite',
            icon: 'forward_to_inbox',
            onSelect: () =>
              toast({ title: `Invite re-sent to ${s.email}`, description: 'The sign-up link is valid for 7 days.', tone: 'info' }),
          } satisfies MenuItem,
        ]
      : []),
    s.status === 'Inactive'
      ? { label: 'Activate', icon: 'person_check', disabled: !!lock, description: lock ?? undefined, onSelect: () => setStatus('Active') }
      : {
          label: 'Deactivate',
          icon: 'person_off',
          disabled: !!lock,
          description: lock ?? undefined,
          onSelect: () => setStatus('Inactive'),
        },
    {
      label: 'Remove from institute',
      icon: 'person_remove',
      tone: 'danger',
      separator: true,
      disabled: !!removeBlock,
      description: removeBlock ?? undefined,
      onSelect: () => onRemove(s),
    },
  ];

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <IconButton icon="edit" label={`Edit ${s.name}`} size="sm" onClick={() => openModal({ type: 'staff-form', staffId: s.id })} />
      <Menu
        width="w-72"
        items={items}
        trigger={(props) => <IconButton {...props} icon="more_vert" label={`More actions for ${s.name}`} size="sm" />}
      />
    </div>
  );
}

function SubjectTags({ row }: { row: StaffRow }) {
  if (!row.subjects.length) return <span className="font-body-sm text-body-sm text-secondary">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {row.subjects.map((sub) => (
        <Tag key={sub.id} title={sub.name}>
          {sub.shortName ?? sub.name}
        </Tag>
      ))}
    </div>
  );
}

function FiltersBar({
  filters,
  setFilter,
  onReset,
  isFiltered,
}: {
  filters: StaffFilters;
  setFilter: <K extends keyof StaffFilters>(key: K, value: StaffFilters[K]) => void;
  onReset: () => void;
  isFiltered: boolean;
}) {
  // Instant typing locally; the URL updates after a short pause.
  const [q, setQ] = useState(filters.q);
  const debounced = useDebouncedValue(q, 250);
  useEffect(() => {
    if (debounced !== filters.q) setFilter('q', debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => setQ(filters.q), [filters.q]);

  return (
    <div className="card flex flex-col gap-space-sm p-space-md lg:flex-row lg:items-center">
      <SearchInput value={q} onChange={setQ} placeholder="Search by name, email, phone or title…" containerClassName="flex-1" />
      <div className="flex items-center gap-space-xs">
        <div className="grid flex-1 grid-cols-2 gap-space-xs lg:w-[26rem] lg:flex-none">
          <SelectField
            aria-label="Filter by role"
            value={filters.role}
            onChange={(e) => setFilter('role', e.target.value as StaffFilters['role'])}
            options={[{ value: '', label: 'Role: All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))]}
          />
          <SelectField
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value as StaffFilters['status'])}
            options={[
              { value: '', label: 'Status: All' },
              { value: 'Active', label: 'Active' },
              { value: 'Invited', label: 'Invited' },
              { value: 'Inactive', label: 'Inactive' },
            ]}
          />
        </div>
        <IconButton
          icon="filter_alt_off"
          label="Reset filters"
          disabled={!isFiltered}
          onClick={onReset}
          className="hidden shrink-0 bg-surface-container md:inline-flex"
        />
      </div>
    </div>
  );
}

export function StaffDirectory() {
  const toast = useToast();
  const settings = useSettings();
  const openModal = useUiStore((s) => s.openModal);
  const removeStaff = useDataStore((s) => s.removeStaff);
  const { filters, setFilter, reset, isFiltered, highlightId, clearHighlight } = useStaffFilters();
  const { rows, highlighted } = useStaffRows(filters, highlightId);
  const [removeTarget, setRemoveTarget] = useState<Staff | null>(null);

  const remove = (s: Staff) => {
    setRemoveTarget(null);
    // The store refuses while they still teach a batch (the menu normally prevents this).
    if (!removeStaff(s.id)) {
      toast({ title: `${s.name} still teaches active batches`, description: 'Reassign their batches first.', tone: 'error' });
      return;
    }
    if (s.id === highlightId) clearHighlight();
    toast({ title: `${s.name} removed`, description: 'Their access has been revoked.' });
  };

  const columns: Column<StaffRow>[] = [
    {
      key: 'name',
      header: 'Staff member',
      sortValue: (r) => r.staff.name,
      headerClassName: 'min-w-[220px]',
      cell: ({ staff: s, isMe }) => (
        <div className="flex items-center gap-space-xs">
          <PersonCell name={s.name} subtitle={s.title} photoUrl={s.avatarUrl} dimmed={s.status === 'Inactive'} />
          {isMe && <Badge tone="primary">You</Badge>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: '2xl',
      cell: ({ staff: s }) => (
        <>
          <a
            href={`mailto:${s.email}`}
            onClick={(e) => e.stopPropagation()}
            className="block font-body-md text-body-md text-primary hover:underline"
          >
            {s.email}
          </a>
          <span className="block font-body-sm text-body-sm text-secondary tnum">{s.phone}</span>
        </>
      ),
    },
    { key: 'role', header: 'Role', sortValue: (r) => ROLES.indexOf(r.staff.role), cell: (r) => <RoleBadge role={r.staff.role} /> },
    { key: 'subjects', header: 'Subjects', hideBelow: 'lg', cell: (r) => <SubjectTags row={r} /> },
    {
      key: 'batches',
      header: 'Batches',
      align: 'center',
      sortValue: (r) => r.batches.length,
      cell: (r) =>
        r.batches.length ? (
          <span title={r.batches.map((b) => b.name).join(', ')} className="font-label-lg text-label-lg text-on-surface tnum">
            {r.batches.length}
          </span>
        ) : (
          <span className="text-secondary">—</span>
        ),
    },
    { key: 'status', header: 'Status', sortValue: (r) => r.staff.status, cell: (r) => <StaffStatusBadge status={r.staff.status} /> },
    {
      key: 'active',
      header: 'Last active',
      hideBelow: 'xl',
      sortValue: (r) => r.staff.lastActiveAt ?? '',
      className: 'whitespace-nowrap font-body-md text-body-md text-on-surface-variant',
      cell: (r) => lastActive(r.staff, r.isMe),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      headerClassName: 'pr-space-md',
      cell: (r) => <StaffActions row={r} onRemove={setRemoveTarget} />,
    },
  ];

  const mobileCard = (r: StaffRow) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <PersonCell name={r.staff.name} subtitle={r.staff.title} photoUrl={r.staff.avatarUrl} dimmed={r.staff.status === 'Inactive'} />
        <StaffStatusBadge status={r.staff.status} />
      </div>
      <div className="flex flex-wrap items-center gap-space-xs">
        <RoleBadge role={r.staff.role} />
        {r.isMe && <Badge tone="primary">You</Badge>}
        {r.subjects.length > 0 && <SubjectTags row={r} />}
      </div>
      <div className="flex items-center justify-between gap-space-xs">
        <span className="font-body-sm text-body-sm text-secondary">
          {r.batches.length ? `${r.batches.length} batch${r.batches.length === 1 ? '' : 'es'}` : 'No batches'} ·{' '}
          {lastActive(r.staff, r.isMe)}
        </span>
        <StaffActions row={r} onRemove={setRemoveTarget} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-space-md">
      <FiltersBar filters={filters} setFilter={setFilter} onReset={reset} isFiltered={isFiltered} />

      {highlighted && (
        <div
          role="status"
          className="flex flex-col gap-space-xs rounded-xl bg-primary-fixed px-space-md py-space-sm text-on-primary-fixed sm:flex-row sm:items-center"
        >
          <Icon name="person_search" />
          <p className="min-w-0 flex-1 font-label-lg text-label-lg">
            Showing {highlighted.staff.name} from search
            <span className="block font-body-sm text-body-sm opacity-80">
              {ROLE_LABELS[highlighted.staff.role]} · {highlighted.staff.email}
            </span>
          </p>
          <div className="flex gap-space-xs">
            <Button
              size="sm"
              variant="inverse"
              icon="edit"
              onClick={() => openModal({ type: 'staff-form', staffId: highlighted.staff.id })}
            >
              Edit details
            </Button>
            <Button size="sm" variant="ghost" icon="close" onClick={clearHighlight} className="text-on-primary-fixed">
              Clear
            </Button>
          </div>
        </div>
      )}
      {highlightId && !highlighted && (
        <p className="rounded-xl bg-surface-container-low px-space-md py-space-sm font-body-md text-body-md text-secondary">
          That staff member no longer exists.{' '}
          <Link to="/faculty" className="text-primary hover:underline">
            Show everyone
          </Link>
        </p>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.staff.id}
        mobileCard={mobileCard}
        onRowClick={(r) => openModal({ type: 'staff-form', staffId: r.staff.id })}
        rowClassName={(r) =>
          r.staff.id === highlightId
            ? 'bg-primary-fixed/40 ring-2 ring-inset ring-primary-container'
            : r.staff.status === 'Inactive'
              ? 'opacity-70'
              : undefined
        }
        entityLabel="staff"
        pageSize={25}
        caption="Staff members"
        empty={
          <EmptyState
            icon="person_search"
            title={isFiltered ? 'No staff match these filters' : 'No staff yet'}
            description={isFiltered ? 'Try a different search or reset the filters.' : 'Invite your first teacher or administrator.'}
            action={
              isFiltered ? (
                <Button variant="tonal" icon="filter_alt_off" onClick={reset}>
                  Reset filters
                </Button>
              ) : (
                <Button icon="person_add" onClick={() => openModal({ type: 'staff-form' })}>
                  Invite Staff
                </Button>
              )
            }
          />
        }
      />

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && remove(removeTarget)}
        title="Remove staff member?"
        confirmLabel="Remove"
        message={
          removeTarget && (
            <>
              <strong className="text-on-surface">{removeTarget.name}</strong> will lose access to {settings.name} immediately. Attendance
              and fee records they created are kept. To pause access instead, deactivate them.
            </>
          )
        }
      />
    </div>
  );
}
