/**
 * Create / edit batch. Opened globally via
 * `openModal({ type: 'batch-form', batchId? })`.
 *
 * Grade choices follow the subject's grades; faculty teaching the subject are
 * listed first. Errors block saving (unique code, end after start, capacity
 * not below current enrolment…). Faculty/room double-bookings and non-working
 * days are shown as warnings only — some centres run parallel sections.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BatchStatus, Weekday } from '@/types/domain';
import { WEEKDAYS } from '@/types/domain';
import { Button, Icon, Modal, SelectField, TextField, type SelectOption } from '@/components/ui';
import { ALL_CAMPUSES, useActiveCampusId, useMoney, useSettings } from '@/hooks/useTenant';
import { useDataStore, type BatchInput } from '@/store/dataStore';
import { useToast } from '@/store/uiStore';
import { occupancy } from '@/domain/academics';
import { ROLE_LABELS } from '@/config/permissions';
import { formatTimeRange, today } from '@/lib/date';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { findClashes, sortDays, weeklyHours, type Clash } from './schedule';

export interface BatchFormModalProps {
  open: boolean;
  onClose: () => void;
  batchId?: string;
}

interface FormState {
  code: string;
  title: string;
  subjectId: string;
  grade: string;
  facultyId: string;
  days: Weekday[];
  startTime: string;
  endTime: string;
  room: string;
  capacity: string;
  monthlyFee: string;
  startDate: string;
  status: BatchStatus;
  campusId: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,7}$/;
const TEACHING_ROLES = new Set(['faculty', 'owner', 'admin']);

interface ValidationContext {
  takenCodes: Map<string, string>; // CODE → batch name using it
  enrolled: number; // current enrolment when editing
}

function validate(f: FormState, ctx: ValidationContext): Errors {
  const e: Errors = {};
  const code = f.code.trim().toUpperCase();
  if (!code) e.code = 'Enter a short batch code, e.g. A1.';
  else if (!CODE_RE.test(code)) e.code = 'Use up to 8 letters, numbers or dashes.';
  else if (ctx.takenCodes.has(code)) e.code = `Code already used by ${ctx.takenCodes.get(code)}.`;
  if (f.title.trim().length < 3) e.title = 'Give the batch a descriptive title.';
  if (!f.subjectId) e.subjectId = 'Select a subject.';
  if (!f.grade) e.grade = 'Select a grade.';
  if (!f.facultyId) e.facultyId = 'Assign a faculty member.';
  if (!f.days.length) e.days = 'Pick at least one class day.';
  if (!f.startTime) e.startTime = 'Start time is required.';
  if (!f.endTime) e.endTime = 'End time is required.';
  else if (f.startTime && f.endTime <= f.startTime) e.endTime = 'End time must be after the start time.';
  if (!f.room.trim()) e.room = 'Enter a room or hall.';
  const cap = Number(f.capacity);
  if (!Number.isInteger(cap) || cap < 1) e.capacity = 'Capacity must be a whole number of at least 1.';
  else if (cap < ctx.enrolled) e.capacity = `${pluralize(ctx.enrolled, 'student is', 'students are')} enrolled — capacity can't be lower.`;
  const fee = Number(f.monthlyFee);
  if (f.monthlyFee.trim() === '' || !Number.isFinite(fee) || fee < 0) e.monthlyFee = 'Enter the monthly fee (0 for free batches).';
  if (!f.startDate) e.startDate = 'Start date is required.';
  return e;
}

export default function BatchFormModal({ open, onClose, batchId }: BatchFormModalProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const settings = useSettings();
  const activeCampus = useActiveCampusId();
  const allBatches = useDataStore((s) => s.batches);
  const students = useDataStore((s) => s.students);
  const subjects = useDataStore((s) => s.subjects);
  const staff = useDataStore((s) => s.staff);
  const addBatch = useDataStore((s) => s.addBatch);
  const updateBatch = useDataStore((s) => s.updateBatch);
  const existing = allBatches.find((b) => b.id === batchId);
  const enrolled = existing ? occupancy(existing, students).enrolled : 0;

  const [form, setForm] = useState<FormState>(() =>
    existing
      ? {
          ...existing,
          capacity: String(existing.capacity),
          monthlyFee: String(existing.monthlyFee),
        }
      : {
          code: '',
          title: '',
          subjectId: '',
          grade: '',
          facultyId: '',
          days: [],
          startTime: '16:00',
          endTime: '17:30',
          room: '',
          capacity: '30',
          monthlyFee: '',
          startDate: today(),
          status: 'Active',
          campusId: activeCampus === ALL_CAMPUSES ? settings.campuses[0].id : activeCampus,
        },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear a field's error as soon as it's edited.
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const subject = subjects.find((s) => s.id === form.subjectId);

  const takenCodes = useMemo(
    () => new Map(allBatches.filter((b) => b.id !== existing?.id).map((b) => [b.code.toUpperCase(), `${b.name} (${b.status})`])),
    [allBatches, existing?.id],
  );

  // Teaching staff; those who teach the chosen subject first.
  const facultyOptions = useMemo<SelectOption[]>(() => {
    const pool = staff.filter((s) => (s.status === 'Active' && TEACHING_ROLES.has(s.role)) || s.id === existing?.facultyId);
    const teaches = pool.filter((s) => form.subjectId && s.subjectIds.includes(form.subjectId));
    const others = pool.filter((s) => !teaches.includes(s)).sort((a, b) => a.name.localeCompare(b.name));
    // Others are tagged with the subject codes they teach (or their role) to keep labels short.
    const codeOf = new Map(subjects.map((x) => [x.id, x.code]));
    const note = (s: (typeof pool)[number]) =>
      s.subjectIds
        .map((id) => codeOf.get(id))
        .filter(Boolean)
        .join(', ') || ROLE_LABELS[s.role];
    return [
      ...teaches.sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: s.id, label: s.name })),
      ...(teaches.length && others.length ? [{ value: '__sep', label: '── Other staff ──', disabled: true }] : []),
      ...others.map((s) => ({ value: s.id, label: `${s.name} · ${note(s)}` })),
    ];
  }, [staff, subjects, form.subjectId, existing?.facultyId]);

  // Non-blocking warnings, recomputed as the schedule changes.
  const clashes = useMemo(() => {
    if (!form.days.length || !form.startTime || !form.endTime || form.endTime <= form.startTime) return { faculty: [], room: [] };
    return findClashes(form, allBatches, existing?.id);
  }, [form, allBatches, existing?.id]);
  const offDays = form.days.filter((d) => !settings.workingDays.includes(d));

  const toggleDay = (d: Weekday) => set('days', form.days.includes(d) ? form.days.filter((x) => x !== d) : sortDays([...form.days, d]));

  const onSubjectChange = (subjectId: string) => {
    const next = subjects.find((s) => s.id === subjectId);
    setForm((f) => ({ ...f, subjectId, grade: next?.grades.includes(f.grade) ? f.grade : (next?.grades[0] ?? '') }));
    setErrors((e) => ({ ...e, subjectId: undefined, grade: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(form, { takenCodes, enrolled });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const code = form.code.trim().toUpperCase();
    const payload: BatchInput = {
      code,
      title: form.title.trim(),
      subjectId: form.subjectId,
      grade: form.grade,
      facultyId: form.facultyId,
      days: sortDays(form.days),
      startTime: form.startTime,
      endTime: form.endTime,
      room: form.room.trim(),
      capacity: Number(form.capacity),
      monthlyFee: Number(form.monthlyFee),
      startDate: form.startDate,
      status: form.status,
      campusId: form.campusId,
    };

    if (existing) {
      // Keep the default "Batch <code>" name in step with a renamed code.
      const name = existing.name === `Batch ${existing.code}` ? `Batch ${code}` : existing.name;
      // Archiving closes the batch today; un-archiving reopens it.
      const endDate = form.status === 'Archived' ? (existing.status === 'Archived' ? existing.endDate : today()) : undefined;
      updateBatch(existing.id, { ...payload, name, endDate });
      toast({
        title: `${name} updated`,
        description: payload.title,
        action: { label: 'View batch', onClick: () => navigate(`/batches/${existing.id}`) },
      });
    } else {
      const created = addBatch(payload);
      toast({
        title: `${created.name} created`,
        description: `${created.title} · ${created.days.join(', ')} ${formatTimeRange(created.startTime, created.endTime)}`,
        action: { label: 'View batch', onClick: () => navigate(`/batches/${created.id}`) },
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

  const clashLine = (c: Clash) => (
    <li key={c.batch.id}>
      <strong className="font-semibold">{c.batch.name}</strong> · {c.batch.title} — {c.days.join(', ')}{' '}
      {formatTimeRange(c.batch.startTime, c.batch.endTime)}
    </li>
  );

  const facultyName = staff.find((s) => s.id === form.facultyId)?.name;
  const hasWarnings = clashes.faculty.length > 0 || clashes.room.length > 0 || offDays.length > 0;
  const hours = form.endTime > form.startTime ? weeklyHours(form) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={existing ? `Edit ${existing.name}` : 'Create New Batch'}
      description={
        existing
          ? `${existing.title} · ${pluralize(enrolled, 'student')} enrolled`
          : 'Subject, schedule, faculty and seats. Students can be added once the batch exists.'
      }
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="batch-form" icon={existing ? 'save' : 'domain_add'} loading={saving}>
            {existing ? 'Save changes' : 'Create batch'}
          </Button>
        </>
      }
    >
      <form id="batch-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-space-lg">
        <section>
          {sectionTitle('class', 'Batch')}
          <div className="grid gap-space-sm sm:grid-cols-3">
            <TextField
              label="Code"
              required
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              error={errors.code}
              placeholder="e.g. B3"
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              hint={form.code ? `Shown as “Batch ${form.code.trim().toUpperCase()}”` : 'Short code used on tags and ID cards.'}
            />
            <TextField
              label="Title"
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              error={errors.title}
              placeholder="e.g. Advanced Physics Mechanics"
              containerClassName="sm:col-span-2"
            />
            <SelectField
              label="Subject"
              required
              value={form.subjectId}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Select…"
              options={subjects.map((s) => ({ value: s.id, label: s.name }))}
              error={errors.subjectId}
            />
            <SelectField
              label="Grade"
              required
              value={form.grade}
              onChange={(e) => set('grade', e.target.value)}
              placeholder={subject ? 'Select…' : 'Pick a subject first'}
              disabled={!subject}
              options={(subject?.grades ?? []).map((g) => ({ value: g, label: g }))}
              error={errors.grade}
            />
            <SelectField
              label="Faculty"
              required
              value={form.facultyId}
              onChange={(e) => set('facultyId', e.target.value)}
              placeholder="Select…"
              options={facultyOptions}
              error={errors.facultyId}
              hint={subject ? `${subject.name} teachers are listed first.` : undefined}
            />
          </div>
        </section>

        <section>
          {sectionTitle('calendar_month', 'Schedule')}
          <div className="flex flex-col gap-space-sm">
            <fieldset>
              <legend className="label">
                Class days<span className="ml-0.5 text-error">*</span>
              </legend>
              <div className="grid grid-cols-7 gap-space-2xs sm:flex sm:flex-wrap sm:gap-space-xs" role="group" aria-label="Class days">
                {WEEKDAYS.map((d) => {
                  const on = form.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        'flex h-11 items-center justify-center gap-1 rounded-lg px-space-xs font-label-md text-label-md transition-colors sm:min-w-14 md:h-9',
                        on
                          ? 'bg-primary text-on-primary shadow-sm hover:bg-primary-container'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
                        !settings.workingDays.includes(d) && !on && 'text-secondary',
                      )}
                    >
                      {on && <Icon name="check" size={14} className="hidden sm:inline" />}
                      {d}
                    </button>
                  );
                })}
              </div>
              {errors.days && (
                <p className="mt-1 flex items-center gap-1 font-body-sm text-body-sm text-error">
                  <Icon name="error" size={14} />
                  {errors.days}
                </p>
              )}
            </fieldset>
            <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-3">
              <TextField
                label="Start time"
                type="time"
                required
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
                error={errors.startTime}
              />
              <TextField
                label="End time"
                type="time"
                required
                value={form.endTime}
                onChange={(e) => set('endTime', e.target.value)}
                error={errors.endTime}
                hint={hours ? `${hours} h per week` : undefined}
              />
              <TextField
                label="Room"
                required
                value={form.room}
                onChange={(e) => set('room', e.target.value)}
                error={errors.room}
                placeholder="Science Lab 2"
                containerClassName="col-span-2 sm:col-span-1"
              />
            </div>

            {hasWarnings && (
              <div role="status" className="flex gap-space-xs rounded-lg bg-warning-container p-space-sm text-on-warning-container">
                <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
                <div className="flex min-w-0 flex-col gap-space-xs font-body-sm text-body-sm">
                  {clashes.faculty.length > 0 && (
                    <div>
                      <p className="font-label-md text-label-md">
                        {facultyName ?? 'This faculty member'} is already teaching at this time:
                      </p>
                      <ul className="ml-4 list-disc">{clashes.faculty.map(clashLine)}</ul>
                    </div>
                  )}
                  {clashes.room.length > 0 && (
                    <div>
                      <p className="font-label-md text-label-md">{form.room.trim()} is already booked:</p>
                      <ul className="ml-4 list-disc">{clashes.room.map(clashLine)}</ul>
                    </div>
                  )}
                  {offDays.length > 0 && (
                    <p>
                      {offDays.join(', ')} {offDays.length === 1 ? 'is not a working day' : 'are not working days'} in Institute Settings.
                    </p>
                  )}
                  <p className="opacity-80">You can still save — these are warnings, not errors.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          {sectionTitle('event_seat', 'Seats, fees & status')}
          <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-3">
            <TextField
              label="Capacity"
              type="number"
              inputMode="numeric"
              min={Math.max(1, enrolled)}
              required
              value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)}
              error={errors.capacity}
              hint={existing ? `${enrolled} currently enrolled` : undefined}
            />
            <TextField
              label={`Monthly fee (${money.symbol})`}
              type="number"
              inputMode="decimal"
              min={0}
              step={50}
              required
              value={form.monthlyFee}
              onChange={(e) => set('monthlyFee', e.target.value)}
              error={errors.monthlyFee}
              hint={Number(form.monthlyFee) > 0 ? `${money.format(Number(form.monthlyFee))} per student` : undefined}
            />
            <TextField
              label="Start date"
              type="date"
              required
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
              error={errors.startDate}
              containerClassName="col-span-2 sm:col-span-1"
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={(e) => set('status', e.target.value as BatchStatus)}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Upcoming', label: 'Upcoming' },
                { value: 'Archived', label: 'Archived' },
              ]}
              hint={
                form.status === 'Active' && form.startDate > today()
                  ? 'Starts in the future — “Upcoming” may fit better.'
                  : form.status === 'Archived' && existing?.status !== 'Archived'
                    ? 'Archiving closes the batch today.'
                    : undefined
              }
              containerClassName={settings.campuses.length > 1 ? undefined : 'col-span-2 sm:col-span-1'}
            />
            {settings.campuses.length > 1 && (
              <SelectField
                label="Campus"
                value={form.campusId}
                onChange={(e) => set('campusId', e.target.value)}
                options={settings.campuses.map((c) => ({ value: c.id, label: c.name }))}
                containerClassName="sm:col-span-2"
              />
            )}
          </div>
        </section>
      </form>
    </Modal>
  );
}
