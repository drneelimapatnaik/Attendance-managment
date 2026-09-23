/**
 * Add / edit student (admission form). Opened globally via
 * `openModal({ type: 'student-form', studentId?, batchId? })`.
 *
 * Batch choices are filtered to the student's grade; full batches are
 * disabled. Saving a new active student issues their first invoice(s).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Gender, Guardian, PortalAccess, Student, StudentStatus } from '@/types/domain';
import { Button, Checkbox, Icon, Modal, SelectField, Switch, TextArea, TextField } from '@/components/ui';
import { useActiveCampusId, useLookups, useMoney, useScopedData, useSettings, ALL_CAMPUSES } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { occupancy } from '@/domain/academics';
import { discountedFee } from '@/domain/fees';
import { formatTimeRange, today } from '@/lib/date';
import { cn } from '@/lib/cn';

export interface StudentFormModalProps {
  open: boolean;
  onClose: () => void;
  studentId?: string;
  batchId?: string;
}

interface FormState {
  name: string;
  gender: Gender | '';
  dob: string;
  grade: string;
  section: string;
  school: string;
  phone: string;
  email: string;
  address: string;
  guardian: Guardian;
  batchIds: string[];
  joiningDate: string;
  status: StudentStatus;
  concessionPct: string;
  portalAccess: PortalAccess;
  notes: string;
  campusId: string;
}

type Errors = Partial<Record<keyof FormState | 'guardianName' | 'guardianPhone', string>>;

const PHONE_RE = /^\+?[\d\s-]{8,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = 'Enter the student’s full name.';
  if (!f.gender) e.gender = 'Select a gender.';
  if (!f.dob) e.dob = 'Date of birth is required.';
  else if (f.dob >= today()) e.dob = 'Date of birth must be in the past.';
  if (!f.grade) e.grade = 'Select a grade.';
  if (f.guardian.name.trim().length < 2) e.guardianName = 'Enter the parent/guardian name.';
  if (!PHONE_RE.test(f.guardian.phone.trim())) e.guardianPhone = 'Enter a valid mobile number.';
  if (f.email && !EMAIL_RE.test(f.email)) e.email = 'Enter a valid email address.';
  if (f.phone && !PHONE_RE.test(f.phone.trim())) e.phone = 'Enter a valid phone number.';
  if (!f.joiningDate) e.joiningDate = 'Joining date is required.';
  const c = Number(f.concessionPct || 0);
  if (!Number.isFinite(c) || c < 0 || c > 100) e.concessionPct = 'Concession must be between 0 and 100%.';
  return e;
}

export default function StudentFormModal({ open, onClose, studentId, batchId }: StudentFormModalProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const settings = useSettings();
  const activeCampus = useActiveCampusId();
  const { batches, students } = useScopedData();
  const { staff } = useLookups();
  const existing = useDataStore((s) => s.students.find((x) => x.id === studentId));
  const addStudent = useDataStore((s) => s.addStudent);
  const updateStudent = useDataStore((s) => s.updateStudent);
  const presetBatch = batches.find((b) => b.id === batchId);

  const [form, setForm] = useState<FormState>(() =>
    existing
      ? {
          ...existing,
          school: existing.school ?? '',
          phone: existing.phone ?? '',
          email: existing.email ?? '',
          address: existing.address ?? '',
          notes: existing.notes ?? '',
          concessionPct: String(existing.concessionPct),
        }
      : {
          name: '',
          gender: '',
          dob: '',
          grade: presetBatch?.grade ?? '',
          section: '',
          school: '',
          phone: '',
          email: '',
          address: '',
          guardian: { name: '', relation: 'Father', phone: '', email: '' },
          batchIds: presetBatch ? [presetBatch.id] : [],
          joiningDate: today(),
          status: 'Active',
          concessionPct: '0',
          portalAccess: 'Invited',
          notes: '',
          campusId: presetBatch?.campusId ?? (activeCampus === ALL_CAMPUSES ? settings.campuses[0].id : activeCampus),
        },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setGuardian = (patch: Partial<Guardian>) => setForm((f) => ({ ...f, guardian: { ...f.guardian, ...patch } }));

  const grades = useMemo(() => [...new Set(batches.map((b) => b.grade))].sort(), [batches]);
  const eligibleBatches = useMemo(
    () =>
      batches
        .filter((b) => b.status !== 'Archived' && (!form.grade || b.grade === form.grade))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [batches, form.grade],
  );
  const concession = Number(form.concessionPct) || 0;
  const monthlyTotal = form.batchIds.reduce((sum, id) => {
    const b = batches.find((x) => x.id === id);
    return b && b.status === 'Active' ? sum + discountedFee(b.monthlyFee, concession) : sum;
  }, 0);

  const toggleBatch = (id: string) =>
    set('batchIds', form.batchIds.includes(id) ? form.batchIds.filter((x) => x !== id) : [...form.batchIds, id]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const payload: Omit<Student, 'id' | 'cardNo'> = {
      name: form.name.trim(),
      gender: form.gender as Gender,
      dob: form.dob,
      grade: form.grade,
      section: form.section.trim() || 'General',
      school: form.school.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      guardian: {
        ...form.guardian,
        name: form.guardian.name.trim(),
        phone: form.guardian.phone.trim(),
        email: form.guardian.email?.trim() || undefined,
      },
      batchIds: form.batchIds,
      joiningDate: form.joiningDate,
      status: form.status,
      concessionPct: concession,
      portalAccess: form.portalAccess,
      notes: form.notes.trim() || undefined,
      campusId: form.campusId,
    };
    if (existing) {
      updateStudent(existing.id, payload);
      toast({ title: 'Student updated', description: `${payload.name}'s profile has been saved.` });
    } else {
      const created = addStudent(payload);
      toast({
        title: `${created.name} admitted`,
        description: `${created.id} · ${form.batchIds.length ? 'first invoice issued' : 'no batch assigned yet'}`,
        action: { label: 'View profile', onClick: () => navigate(`/students/${created.id}`) },
      });
    }
    setSaving(false);
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
      title={existing ? `Edit ${existing.name}` : 'Add New Student'}
      description={existing ? `${existing.id} · Card #${existing.cardNo}` : 'Admission details, guardian contact and batch assignment.'}
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="student-form" icon={existing ? 'save' : 'person_add'} loading={saving}>
            {existing ? 'Save changes' : 'Admit student'}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-space-lg">
        <section>
          {sectionTitle('person', 'Student')}
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
            <SelectField
              label="Gender"
              required
              value={form.gender}
              onChange={(e) => set('gender', e.target.value as Gender)}
              placeholder="Select…"
              options={['Male', 'Female', 'Other'].map((g) => ({ value: g, label: g }))}
              error={errors.gender}
            />
            <TextField
              label="Date of birth"
              type="date"
              required
              max={today()}
              value={form.dob}
              onChange={(e) => set('dob', e.target.value)}
              error={errors.dob}
            />
            <SelectField
              label="Grade"
              required
              value={form.grade}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  grade: e.target.value,
                  batchIds: f.batchIds.filter((id) => batches.find((b) => b.id === id)?.grade === e.target.value),
                }))
              }
              placeholder="Select…"
              options={grades.map((g) => ({ value: g, label: g }))}
              error={errors.grade}
            />
            <TextField
              label="Section / stream"
              placeholder="e.g. Section B, Pre-Med"
              value={form.section}
              onChange={(e) => set('section', e.target.value)}
            />
            <TextField label="School" value={form.school} onChange={(e) => set('school', e.target.value)} />
            <TextField
              label="Student mobile"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
            />
            <TextField
              label="Student email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
              containerClassName="sm:col-span-2"
            />
          </div>
        </section>

        <section>
          {sectionTitle('family_restroom', 'Parent / guardian')}
          <div className="grid gap-space-sm sm:grid-cols-2">
            <TextField
              label="Name"
              required
              value={form.guardian.name}
              onChange={(e) => setGuardian({ name: e.target.value })}
              error={errors.guardianName}
            />
            <SelectField
              label="Relation"
              value={form.guardian.relation}
              onChange={(e) => setGuardian({ relation: e.target.value as Guardian['relation'] })}
              options={['Father', 'Mother', 'Guardian'].map((r) => ({ value: r, label: r }))}
            />
            <TextField
              label="Mobile"
              type="tel"
              inputMode="tel"
              required
              placeholder="+91 98765 43210"
              value={form.guardian.phone}
              onChange={(e) => setGuardian({ phone: e.target.value })}
              error={errors.guardianPhone}
              hint="Used for absence alerts and fee reminders."
            />
            <TextField
              label="Email"
              type="email"
              value={form.guardian.email ?? ''}
              onChange={(e) => setGuardian({ email: e.target.value })}
            />
            <TextArea
              label="Address"
              rows={2}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              containerClassName="sm:col-span-2"
            />
          </div>
        </section>

        <section>
          {sectionTitle('class', 'Batches')}
          {!form.grade ? (
            <p className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-secondary">
              Pick a grade to see matching batches.
            </p>
          ) : eligibleBatches.length === 0 ? (
            <p className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-secondary">
              No batches for {form.grade} at this campus yet.
            </p>
          ) : (
            <ul className="grid gap-space-xs sm:grid-cols-2">
              {eligibleBatches.map((b) => {
                const occ = occupancy(b, students);
                const checked = form.batchIds.includes(b.id);
                const full = occ.isFull && !existing?.batchIds.includes(b.id);
                return (
                  <li key={b.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-space-xs rounded-lg border p-space-sm transition-colors',
                        checked
                          ? 'border-primary-container bg-primary-fixed/40'
                          : 'border-outline-variant/50 hover:bg-surface-container-low',
                        full && !checked && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <Checkbox className="mt-0.5" checked={checked} disabled={full && !checked} onChange={() => toggleBatch(b.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-label-lg text-label-lg text-on-surface">
                            {b.name} · {b.title}
                          </span>
                        </span>
                        <span className="block font-body-sm text-body-sm text-secondary">
                          {b.days.join(', ')} · {formatTimeRange(b.startTime, b.endTime)} · {staff.get(b.facultyId)?.name}
                        </span>
                        <span className="mt-0.5 block font-body-sm text-body-sm text-secondary">
                          {money.format(b.monthlyFee)}/mo · {occ.enrolled}/{b.capacity} seats
                          {full && <span className="ml-1 font-semibold text-error">· Full</span>}
                          {b.status === 'Upcoming' && <span className="ml-1 font-semibold text-primary">· Upcoming</span>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          {sectionTitle('receipt_long', 'Enrolment & fees')}
          <div className="grid gap-space-sm sm:grid-cols-3">
            <TextField
              label="Joining date"
              type="date"
              required
              value={form.joiningDate}
              onChange={(e) => set('joiningDate', e.target.value)}
              error={errors.joiningDate}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={(e) => set('status', e.target.value as StudentStatus)}
              options={['Active', 'On Leave', 'Inactive'].map((s) => ({ value: s, label: s }))}
            />
            <TextField
              label="Concession (%)"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              value={form.concessionPct}
              onChange={(e) => set('concessionPct', e.target.value)}
              error={errors.concessionPct}
            />
            {settings.campuses.length > 1 && (
              <SelectField
                label="Campus"
                value={form.campusId}
                onChange={(e) => set('campusId', e.target.value)}
                options={settings.campuses.map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
          </div>
          <div className="mt-space-sm flex flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-sm">
            <div className="flex items-center justify-between">
              <span className="font-body-md text-body-md text-secondary">Monthly tuition after concession</span>
              <span className="font-title-md text-title-md text-on-surface tnum">{money.format(monthlyTotal)}</span>
            </div>
            <Switch
              checked={form.portalAccess !== 'Not Invited'}
              onChange={(v) => set('portalAccess', v ? (existing?.portalAccess === 'Active' ? 'Active' : 'Invited') : 'Not Invited')}
              label="Parent & student app access"
              description="Sends an invite so the family can see attendance, fees and scores in the mobile app."
            />
          </div>
          <TextArea
            label="Notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            containerClassName="mt-space-sm"
            placeholder="Medical info, pickup instructions…"
          />
        </section>
      </form>
    </Modal>
  );
}
