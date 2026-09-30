/**
 * Setup step 6 — invite the team. Each person gets a name, a work email and one
 * of the institute's roles; they are saved as Invited staff and activate their
 * own sign-in from the email.
 *
 * Roles come from the store, not from a fixed list: Administrator and Faculty
 * are built in, and the institute creates any others it needs in
 * Faculty & Roles › Roles.
 */
import { useMemo, useState } from 'react';
import { Badge, Button, Icon, IconButton, SelectField, TextField } from '@/components/ui';
import { useRoles } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { today } from '@/lib/date';
import { uid } from '@/lib/id';
import { EMAIL_RE } from '@/features/settings/fields';
import { SetupStepShell } from '../components/SetupStepShell';
import type { SetupNav } from '../useSetupNav';

interface InviteRow {
  key: string;
  name: string;
  email: string;
  roleId: string;
}

type RowErrors = Partial<Record<'name' | 'email', string>>;

const blankRow = (roleId: string): InviteRow => ({ key: uid('inv'), name: '', email: '', roleId });

export function TeamStep({ nav }: { nav: SetupNav }) {
  const roles = useRoles();
  const staff = useDataStore((s) => s.staff);
  const addStaff = useDataStore((s) => s.addStaff);
  // Most first invites are teachers.
  const defaultRoleId = useMemo(() => roles.find((r) => r.key === 'faculty')?.id ?? roles[0]?.id ?? '', [roles]);
  const [rows, setRows] = useState<InviteRow[]>(() => [blankRow(defaultRoleId)]);
  const [submitted, setSubmitted] = useState(false);

  const invited = staff.filter((s) => !s.isOwner);
  const takenEmails = new Set(staff.map((s) => s.email.toLowerCase()));

  const filled = (r: InviteRow) => r.name.trim() !== '' || r.email.trim() !== '';
  const errorsFor = (r: InviteRow, others: InviteRow[]): RowErrors => {
    const e: RowErrors = {};
    if (!filled(r)) return e;
    if (r.name.trim().length < 2) e.name = 'Enter their name.';
    const email = r.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) e.email = 'Enter a valid work email.';
    else if (takenEmails.has(email)) e.email = 'Someone at this institute already uses that email.';
    else if (others.some((o) => o.email.trim().toLowerCase() === email)) e.email = 'This email is already in the list.';
    return e;
  };

  const patchRow = (key: string, patch: Partial<InviteRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = () => {
    setSubmitted(true);
    const pending = rows.filter(filled);
    if (
      pending.some(
        (r, i) =>
          Object.keys(
            errorsFor(
              r,
              pending.filter((_, j) => j !== i),
            ),
          ).length,
      )
    )
      return false;
    for (const r of pending) {
      addStaff({
        name: r.name.trim(),
        email: r.email.trim(),
        phone: '',
        roleId: r.roleId,
        title: roles.find((x) => x.id === r.roleId)?.name ?? 'Staff',
        subjectIds: [],
        status: 'Invited',
        joinedOn: today(),
      });
    }
    // Saved rows now live in the store; start the list fresh.
    setRows([blankRow(defaultRoleId)]);
    setSubmitted(false);
    return true;
  };

  return (
    <SetupStepShell
      nav={nav}
      onNext={save}
      skipHint="You can invite staff at any time."
      note={
        <>
          <strong className="text-on-surface">Administrator</strong> and <strong className="text-on-surface">Faculty</strong> are built in.
          Need something narrower — an accountant who only handles fees, or a front desk that only admits students? Create your own roles in{' '}
          <strong className="text-on-surface">Faculty &amp; Roles › Roles</strong> and pick exactly what each one may do.
        </>
      }
    >
      {invited.length > 0 && (
        <div className="flex flex-col gap-space-xs rounded-xl bg-surface-container-low p-space-sm">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-secondary">Already invited</p>
          <ul className="flex flex-wrap gap-space-xs">
            {invited.map((s) => (
              <li key={s.id}>
                <Badge tone="info" icon="mail">
                  {s.name} · {roles.find((r) => r.id === s.roleId)?.name ?? 'Staff'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex flex-col gap-space-sm">
        {rows.map((row, i) => {
          const errors = submitted
            ? errorsFor(
                row,
                rows.filter((_, j) => j !== i),
              )
            : {};
          return (
            <li key={row.key} className="flex flex-col gap-space-xs sm:flex-row sm:items-start sm:gap-space-sm">
              <TextField
                label="Name"
                placeholder="e.g. Prof. K. Sen"
                value={row.name}
                onChange={(e) => patchRow(row.key, { name: e.target.value })}
                error={errors.name}
                containerClassName="flex-1"
              />
              <TextField
                label="Work email"
                type="email"
                placeholder="name@institute.com"
                value={row.email}
                onChange={(e) => patchRow(row.key, { email: e.target.value })}
                error={errors.email}
                containerClassName="flex-1"
              />
              <SelectField
                label="Role"
                value={row.roleId}
                onChange={(e) => patchRow(row.key, { roleId: e.target.value })}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
                containerClassName="sm:w-44"
              />
              <div className="flex justify-end sm:pt-[1.6rem]">
                <IconButton
                  icon="delete"
                  label={`Remove invite ${i + 1}`}
                  tone="danger"
                  disabled={rows.length === 1 && !filled(row)}
                  onClick={() => setRows((rs) => (rs.length === 1 ? [blankRow(defaultRoleId)] : rs.filter((r) => r.key !== row.key)))}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-space-sm">
        <Button variant="tonal" icon="person_add" onClick={() => setRows((rs) => [...rs, blankRow(defaultRoleId)])}>
          Add another
        </Button>
        <p className="flex items-center gap-1 font-body-sm text-body-sm text-secondary">
          <Icon name="mail" size={14} />
          Each person gets an email to set their own password. You never see it.
        </p>
      </div>
    </SetupStepShell>
  );
}
