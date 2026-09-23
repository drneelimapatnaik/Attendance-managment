/**
 * Invite / edit a staff member. Opened globally via
 * `openModal({ type: 'staff-form', staffId? })` (see app/GlobalModals.tsx).
 *
 * New staff are created as "Invited" (joined today) and receive an email
 * invite; they sign in with the institute code once they accept. Guard rails
 * (staffRules.ts): emails are unique within the tenant, only owners grant or
 * change the owner role, nobody changes their own role/status, and the last
 * active owner can't be demoted or deactivated.
 */
import { useMemo, useState, type FormEvent } from 'react';
import type { Role, StaffStatus } from '@/types/domain';
import { Button, Icon, Modal, SelectField, TextField } from '@/components/ui';
import { useCurrentUser, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/config/permissions';
import { formatDate, today } from '@/lib/date';
import { cn } from '@/lib/cn';
import { ROLES, accessLockReason, isLastOwner } from './staffRules';

export interface StaffFormModalProps {
  open: boolean;
  onClose: () => void;
  staffId?: string;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  role: Role;
  title: string;
  subjectIds: string[];
  status: StaffStatus;
}

type Errors = Partial<Record<keyof FormState, string>>;

const PHONE_RE = /^\+?[\d\s-]{8,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function StaffFormModal({ open, onClose, staffId }: StaffFormModalProps) {
  const toast = useToast();
  const settings = useSettings();
  const me = useCurrentUser();
  const staff = useDataStore((s) => s.staff);
  const subjects = useDataStore((s) => s.subjects);
  const addStaff = useDataStore((s) => s.addStaff);
  const updateStaff = useDataStore((s) => s.updateStaff);
  const existing = useMemo(() => staff.find((s) => s.id === staffId), [staff, staffId]);

  const [form, setForm] = useState<FormState>(() =>
    existing
      ? {
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          role: existing.role,
          title: existing.title,
          subjectIds: existing.subjectIds,
          status: existing.status,
        }
      : { name: '', email: '', phone: '', role: 'faculty', title: '', subjectIds: [], status: 'Invited' },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleSubject = (id: string) =>
    set('subjectIds', form.subjectIds.includes(id) ? form.subjectIds.filter((x) => x !== id) : [...form.subjectIds, id]);

  const isSelf = !!existing && existing.id === me?.id;
  // Role and status are locked for yourself, the last owner, and (for non-owners) any owner.
  const accessLock = existing ? accessLockReason(existing, me, staff) : null;
  const iAmOwner = me?.role === 'owner';

  const validate = (f: FormState): Errors => {
    const e: Errors = {};
    if (f.name.trim().length < 2) e.name = 'Enter the staff member’s full name.';
    const email = f.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email address.';
    else if (staff.some((s) => s.id !== existing?.id && s.email.toLowerCase() === email))
      e.email = 'Someone on your staff already uses this email.';
    if (!PHONE_RE.test(f.phone.trim())) e.phone = 'Enter a valid mobile number.';
    if (existing && f.role !== existing.role) {
      if (isSelf) e.role = 'You can’t change your own role — ask another owner.';
      else if (existing.role === 'owner' && isLastOwner(existing, staff))
        e.role = 'Make someone else an owner first — every institute needs one.';
      else if ((existing.role === 'owner' || f.role === 'owner') && !iAmOwner) e.role = 'Only an owner can grant or change the owner role.';
    }
    if (!existing && f.role === 'owner' && !iAmOwner) e.role = 'Only an owner can grant the owner role.';
    if (existing && f.status !== existing.status && accessLock) e.status = accessLock;
    return e;
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      role: form.role,
      title: form.title.trim() || ROLE_LABELS[form.role],
      subjectIds: form.subjectIds,
    };
    if (existing) {
      updateStaff(existing.id, { ...payload, status: form.status });
      toast({ title: 'Staff details saved', description: `${payload.name} · ${ROLE_LABELS[payload.role]}` });
    } else {
      addStaff({ ...payload, status: 'Invited', joinedOn: today() });
      toast({
        title: `Invite sent to ${payload.email}`,
        description: `${payload.name} can sign in with institute code ${settings.instituteCode} once they accept.`,
      });
    }
    setSaving(false);
    onClose();
  };

  const roleOptions = ROLES.map((r) => ({
    value: r,
    label: ROLE_LABELS[r],
    // Non-owners can't hand out the owner role.
    disabled: r === 'owner' && !iAmOwner && existing?.role !== 'owner',
  }));
  const statusOptions: { value: StaffStatus; label: string }[] = [
    { value: 'Active', label: 'Active' },
    { value: 'Inactive', label: 'Inactive — no sign-in' },
    ...(existing?.status === 'Invited' ? [{ value: 'Invited' as const, label: 'Invited — awaiting sign-up' }] : []),
  ];

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
      size="md"
      title={existing ? `Edit ${existing.name}` : 'Invite Staff'}
      description={
        existing
          ? `${ROLE_LABELS[existing.role]} · joined ${formatDate(existing.joinedOn)}`
          : 'They’ll get an email invite to join your institute on EduTrack.'
      }
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="staff-form" icon={existing ? 'save' : 'send'} loading={saving}>
            {existing ? 'Save changes' : 'Send invite'}
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-space-lg">
        <section>
          {sectionTitle('person', 'Contact')}
          <div className="grid gap-space-sm sm:grid-cols-2">
            <TextField
              label="Full name"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              error={errors.name}
              autoComplete="off"
              containerClassName="sm:col-span-2"
            />
            <TextField
              label="Work email"
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
              hint={existing ? undefined : 'The invite and sign-in link go here.'}
              autoComplete="off"
            />
            <TextField
              label="Mobile"
              type="tel"
              inputMode="tel"
              required
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
            />
          </div>
        </section>

        <section>
          {sectionTitle('admin_panel_settings', 'Role & access')}
          <div className="grid gap-space-sm sm:grid-cols-2">
            <SelectField
              label="Role"
              required
              value={form.role}
              onChange={(e) => set('role', e.target.value as Role)}
              options={roleOptions}
              disabled={!!existing && !!accessLock}
              error={errors.role}
              hint={existing && accessLock ? accessLock : ROLE_DESCRIPTIONS[form.role]}
              containerClassName={existing ? undefined : 'sm:col-span-2'}
            />
            {existing && (
              <SelectField
                label="Status"
                value={form.status}
                onChange={(e) => set('status', e.target.value as StaffStatus)}
                options={statusOptions}
                disabled={!!accessLock}
                error={errors.status}
                hint={accessLock ?? (form.status === 'Inactive' ? 'Inactive staff can’t sign in. Their records are kept.' : undefined)}
              />
            )}
            <TextField
              label="Job title"
              placeholder={form.role === 'faculty' ? 'e.g. Senior Faculty · Physics' : `e.g. ${ROLE_LABELS[form.role]}`}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              hint="Shown on the staff list and batch pages."
              containerClassName="sm:col-span-2"
            />
          </div>
        </section>

        <section>
          {sectionTitle('menu_book', 'Subjects taught')}
          <div role="group" aria-label="Subjects taught" className="flex flex-wrap gap-space-xs">
            {subjects.map((sub) => {
              const on = form.subjectIds.includes(sub.id);
              return (
                <button
                  key={sub.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSubject(sub.id)}
                  className={cn(
                    'inline-flex h-11 items-center gap-1 rounded-full border px-space-sm font-label-lg text-label-lg transition-colors md:h-9',
                    on
                      ? 'border-primary-container bg-primary-fixed text-on-primary-fixed'
                      : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low',
                  )}
                >
                  <Icon name={on ? 'check' : 'add'} size={16} />
                  {sub.name}
                </button>
              );
            })}
          </div>
          <p className="mt-space-xs font-body-sm text-body-sm text-secondary">
            {form.role === 'faculty'
              ? 'Used to suggest teachers when creating batches.'
              : 'Optional — leave empty for staff who don’t teach.'}
          </p>
        </section>
      </form>
    </Modal>
  );
}
