/**
 * Tenant data store (Zustand).
 *
 * Holds the current institute's data and every mutation the UI can perform.
 * Today it is local-first: state persists to device storage and first run
 * generates a tenant — the demo institute when demo data is on (config/env.ts
 * → `useDemoData`), otherwise an EMPTY institute whose owner is taken through
 * the setup wizard (features/onboarding). When the backend lands, each action keeps
 * its signature but also calls the API (optimistic update → server confirm),
 * and `pendingSync` flags records that have not been acknowledged yet.
 *
 * Rules:
 *  - Components never mutate state directly; they call these actions.
 *  - Derived values (fee status, attendance %) are NEVER stored — compute them
 *    with src/domain/* helpers (usually via hooks in src/hooks/useTenant.ts).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  ActivityEntry,
  Assessment,
  AttendanceSession,
  Batch,
  CoverageStatus,
  DataSnapshot,
  FeeInvoice,
  ID,
  ISODate,
  InstituteSettings,
  Payment,
  PaymentMethod,
  PortalAccount,
  PortalAccountStatus,
  PortalRole,
  Role,
  Staff,
  Student,
  StudentStatus,
  Subject,
  Topic,
} from '@/types/domain';
import {
  createDemoSnapshot,
  createDemoSettingsOnly,
  createEmptySnapshot,
  createEmptySettingsOnly,
  type EmptyInstituteInput,
} from '@/data/seed';
import { useDemoData } from '@/config/env';
import { nextCode, uid } from '@/lib/id';
import { normalizePhone } from '@/lib/format';
import { addDays, today } from '@/lib/date';
import { billingDateFor, discountedFee } from '@/domain/fees';
import {
  activeAdministrators,
  checkAddRole,
  checkDeleteRole,
  checkUpdateRole,
  isRoleFailure,
  roleKeyFrom,
  type RoleDraft,
  type RoleFailure,
  type RoleGuardContext,
} from '@/domain/roles';
import { withRequired } from '@/config/permissions';
import { useSessionStore } from './sessionStore';

/* ------------------------------------------------------------ Input types */

export type StudentInput = Omit<Student, 'id' | 'cardNo'> & { cardNo?: string };
export type BatchInput = Omit<Batch, 'id' | 'name'> & { name?: string };
export type SessionInput = Omit<AttendanceSession, 'id' | 'markedAt' | 'markedBy'>;
export type AssessmentInput = Omit<Assessment, 'id'>;
export type StaffInput = Omit<Staff, 'id' | 'isOwner'> & { isOwner?: boolean };
export type TopicInput = Omit<Topic, 'id' | 'order'> & { order?: number };

/** Role writes report refusals instead of throwing, so the UI can show why. */
export type RoleInput = RoleDraft;
export type RolePatch = Partial<RoleDraft>;
export type RoleSaved = { ok: true; role: Role };
export type RoleDeleted = { ok: true; role: Role; movedStaff: ID[]; reassignedTo?: Role };
export type RoleResult = RoleSaved | RoleFailure;
export type RoleDeleteResult = RoleDeleted | RoleFailure;

export interface PaymentInput {
  invoiceId: ID;
  amount: number;
  method: PaymentMethod;
  date: ISODate;
  reference?: string;
}

/** Settings patch: top-level keys replace; nested groups merge one level deep. */
export type SettingsPatch = {
  [K in keyof InstituteSettings]?: InstituteSettings[K] extends object
    ? InstituteSettings[K] extends unknown[]
      ? InstituteSettings[K]
      : Partial<InstituteSettings[K]>
    : InstituteSettings[K];
};

interface DataActions {
  /* Students */
  addStudent(input: StudentInput): Student;
  /** Newly added batches get an invoice unless `issueInvoices: false` (e.g. undoing a removal). */
  updateStudent(id: ID, patch: Partial<Student>, opts?: { issueInvoices?: boolean }): void;
  setStudentsStatus(ids: ID[], status: StudentStatus): void;
  deleteStudents(ids: ID[]): void;

  /* Batches */
  addBatch(input: BatchInput): Batch;
  updateBatch(id: ID, patch: Partial<Batch>): void;
  archiveBatch(id: ID): void;

  /* Attendance — one session per batch per date (saving again overwrites). */
  saveSession(input: SessionInput): AttendanceSession;
  deleteSession(id: ID): void;

  /* Syllabus & coverage */
  addSubject(input: Omit<Subject, 'id'>): Subject;
  addTopic(input: TopicInput): Topic;
  updateTopic(id: ID, patch: Partial<Topic>): void;
  deleteTopic(id: ID): void;
  setCoverage(batchId: ID, topicId: ID, status: CoverageStatus): void;

  /* Fees */
  recordPayment(input: PaymentInput): Payment;
  addInvoice(input: Omit<FeeInvoice, 'id'>): FeeInvoice;
  /** Issue monthly invoices for `period` to every active enrolment missing one. Returns count created. */
  issueInvoices(period: string): number;
  waiveInvoice(id: ID, waived: boolean): void;

  /* Assessments */
  addAssessment(input: AssessmentInput): Assessment;
  updateAssessment(id: ID, patch: Partial<Assessment>): void;
  deleteAssessment(id: ID): void;

  /* Roles — every write is checked against src/domain/roles.ts first. */
  addRole(input: RoleInput): RoleResult;
  updateRole(id: ID, patch: RolePatch): RoleResult;
  /** Staff on the role move to `reassignToId`, which is required while anyone holds it. */
  deleteRole(id: ID, reassignToId?: ID): RoleDeleteResult;

  /* Staff */
  addStaff(input: StaffInput): Staff;
  updateStaff(id: ID, patch: Partial<Staff>): void;
  /** Returns false (and changes nothing) while the person still teaches a batch. */
  removeStaff(id: ID): boolean;

  /* Student & parent app accounts */
  /** Invite (or re-invite) the student and/or parent login for a student. */
  invitePortalAccounts(studentId: ID, roles: PortalRole[]): PortalAccount[];
  updatePortalAccount(id: ID, patch: Partial<PortalAccount>): void;
  setPortalAccountStatus(id: ID, status: PortalAccountStatus): void;

  /* Settings & notifications */
  updateSettings(patch: SettingsPatch): void;
  markNotificationRead(id: ID): void;
  markAllNotificationsRead(): void;

  /* First-run setup (features/onboarding) */
  /** Mark the institute as set up, so /setup stops intercepting staff. */
  completeSetup(): void;

  /** Wipe local data and regenerate the demo tenant. */
  resetDemoData(): void;
  /** Wipe local data and start from an empty institute (what a new client gets). */
  resetToEmptyInstitute(input?: EmptyInstituteInput): void;
}

export type DataState = DataSnapshot & DataActions;

/* ---------------------------------------------------------------- Helpers */

const STORAGE_KEY = 'edutrack:tenant-data';
// v2 added student/parent app accounts; v3 fixed phone normalisation (login ids);
// v4 replaced the fixed staff-role enum with institute-defined Role records.
// Older saved data is regenerated (see `migrate`).
const STORAGE_VERSION = 4;

/**
 * The tenant a first run (or an unreadable save) starts from: the demo
 * institute only when demo data is switched on, otherwise an empty institute.
 */
function freshSnapshot(): DataSnapshot {
  return useDemoData ? createDemoSnapshot() : createEmptySnapshot();
}

/**
 * Initial state before hydration. When saved data exists, persist() replaces
 * these values synchronously on load, so we skip generating the (≈130 ms) demo
 * tenant and only build a settings shell. First run gets the full tenant.
 */
function initialSnapshot(): DataSnapshot {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return useDemoData ? createDemoSettingsOnly() : createEmptySettingsOnly();
  } catch {
    // Storage blocked (private mode): fall through to an in-memory tenant.
  }
  return freshSnapshot();
}

function actor(): ID {
  return useSessionStore.getState().userId ?? 'system';
}

/** Who is asking + what exists, for the role guards in src/domain/roles.ts. */
function guardContext(state: DataSnapshot): RoleGuardContext {
  const id = useSessionStore.getState().userId;
  return { roles: state.roles, staff: state.staff, actor: state.staff.find((s) => s.id === id) };
}

function logEntry(action: string, entity?: ActivityEntry['entity']): ActivityEntry {
  return { id: uid('act'), at: new Date().toISOString(), actorId: actor(), action, entity };
}

/** Keep the activity log bounded so local storage never grows unbounded. */
const withLog = (log: ActivityEntry[], entry: ActivityEntry) => [entry, ...log].slice(0, 200);

/** Highest numeric suffix among codes like "INV-2609-0012" / "RCPT-000123" (0 when none). */
function maxSuffix(codes: string[]): number {
  return codes.reduce((m, c) => Math.max(m, Number(c.slice(c.lastIndexOf('-') + 1)) || 0), 0);
}

/** Invoice numbers keep counting up even after records are deleted, so they never repeat. */
function invoiceId(period: string, existing: FeeInvoice[]): ID {
  const next = maxSuffix(existing.map((i) => i.id)) + 1;
  return `INV-${period.slice(2, 4)}${period.slice(5, 7)}-${String(next).padStart(4, '0')}`;
}

/** Admission invoice(s): one per newly joined batch, issued on the joining date. */
function admissionInvoices(state: DataSnapshot, student: Student, batchIds: ID[]): FeeInvoice[] {
  const created: FeeInvoice[] = [];
  const issuedOn = student.joiningDate <= today() ? student.joiningDate : today();
  const period = issuedOn.slice(0, 7);
  for (const batchId of batchIds) {
    const batch = state.batches.find((b) => b.id === batchId);
    if (!batch || batch.status !== 'Active') continue;
    const exists = state.invoices.some((i) => i.studentId === student.id && i.batchId === batchId && i.period === period);
    if (exists) continue;
    created.push({
      id: invoiceId(period, [...state.invoices, ...created]),
      studentId: student.id,
      batchId,
      period,
      description: `${batch.name} · ${batch.title} — monthly tuition`,
      amount: discountedFee(batch.monthlyFee, student.concessionPct),
      issuedOn,
      dueDate: addDays(issuedOn, state.settings.fees.dueInDays),
    });
  }
  return created;
}

/* ------------------------------------------------------------------ Store */

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      ...initialSnapshot(),

      /* Students ------------------------------------------------------- */
      addStudent(input) {
        const state = get();
        const student: Student = {
          ...input,
          id: nextCode(
            state.students.map((s) => s.id),
            'STU',
          ),
          cardNo: input.cardNo || String(Math.max(9400, ...state.students.map((s) => Number(s.cardNo) || 0)) + 1),
        };
        const invoices = student.status === 'Active' ? admissionInvoices(state, student, student.batchIds) : [];
        set({
          students: [...state.students, student],
          invoices: [...state.invoices, ...invoices],
          activity: withLog(state.activity, logEntry(`admitted ${student.name}`, { type: 'student', id: student.id })),
        });
        return student;
      },

      updateStudent(id, patch, opts) {
        const state = get();
        const before = state.students.find((s) => s.id === id);
        if (!before) return;
        const after = { ...before, ...patch, id };
        const added = after.batchIds.filter((b) => !before.batchIds.includes(b));
        const invoices =
          added.length && after.status === 'Active' && opts?.issueInvoices !== false
            ? admissionInvoices(state, { ...after, joiningDate: today() }, added)
            : [];
        set({
          students: state.students.map((s) => (s.id === id ? after : s)),
          invoices: invoices.length ? [...state.invoices, ...invoices] : state.invoices,
          activity: withLog(state.activity, logEntry(`updated ${after.name}'s profile`, { type: 'student', id })),
        });
      },

      setStudentsStatus(ids, status) {
        const state = get();
        set({
          students: state.students.map((s) => (ids.includes(s.id) ? { ...s, status } : s)),
          activity: withLog(
            state.activity,
            ids.length === 1
              ? logEntry(`set ${state.students.find((s) => s.id === ids[0])?.name ?? 'a student'} to ${status}`, {
                  type: 'student',
                  id: ids[0],
                })
              : logEntry(`set ${ids.length} students to ${status}`),
          ),
        });
      },

      deleteStudents(ids) {
        const state = get();
        const drop = new Set(ids);
        set({
          students: state.students.filter((s) => !drop.has(s.id)),
          invoices: state.invoices.filter((i) => !drop.has(i.studentId)),
          payments: state.payments.filter((p) => !drop.has(p.studentId)),
          activity: withLog(state.activity, logEntry(`deleted ${ids.length} student record(s)`)),
        });
      },

      /* Batches -------------------------------------------------------- */
      addBatch(input) {
        const state = get();
        const batch: Batch = { ...input, id: uid('bat'), name: input.name || `Batch ${input.code}` };
        set({
          batches: [...state.batches, batch],
          activity: withLog(state.activity, logEntry(`created ${batch.name}`, { type: 'batch', id: batch.id })),
        });
        return batch;
      },

      updateBatch(id, patch) {
        const state = get();
        set({
          batches: state.batches.map((b) => (b.id === id ? { ...b, ...patch, id } : b)),
          activity: withLog(state.activity, logEntry(`updated batch details`, { type: 'batch', id })),
        });
      },

      archiveBatch(id) {
        const state = get();
        const batch = state.batches.find((b) => b.id === id);
        set({
          batches: state.batches.map((b) => (b.id === id ? { ...b, status: 'Archived', endDate: today() } : b)),
          activity: withLog(state.activity, logEntry(`archived ${batch?.name ?? 'a batch'}`, { type: 'batch', id })),
        });
      },

      /* Attendance ----------------------------------------------------- */
      saveSession(input) {
        const state = get();
        const existing = state.sessions.find((s) => s.batchId === input.batchId && s.date === input.date);
        const session: AttendanceSession = {
          ...input,
          id: existing?.id ?? `ses-${uid()}`,
          markedAt: new Date().toISOString(),
          markedBy: actor(),
          pendingSync: true, // cleared by the sync layer once the backend confirms
        };
        const batch = state.batches.find((b) => b.id === input.batchId);

        // Topics taught in this session move to "In Progress" if not started yet.
        const coverage = state.coverage.map((c) =>
          c.batchId === input.batchId && input.topicIds.includes(c.topicId) && c.status === 'Not Started'
            ? { ...c, status: 'In Progress' as const, startedOn: input.date }
            : c,
        );
        set({
          sessions: existing ? state.sessions.map((s) => (s.id === existing.id ? session : s)) : [...state.sessions, session],
          coverage,
          activity: withLog(
            state.activity,
            logEntry(`${existing ? 'updated' : 'marked'} attendance for ${batch?.name ?? 'a batch'}`, { type: 'session', id: session.id }),
          ),
        });
        return session;
      },

      deleteSession(id) {
        set({ sessions: get().sessions.filter((s) => s.id !== id) });
      },

      /* Syllabus & coverage ------------------------------------------- */
      addSubject(input) {
        const state = get();
        const subject: Subject = { ...input, id: uid('sub') };
        set({ subjects: [...state.subjects, subject], activity: withLog(state.activity, logEntry(`added subject ${subject.name}`)) });
        return subject;
      },

      addTopic(input) {
        const state = get();
        const siblings = state.topics.filter((t) => t.subjectId === input.subjectId && t.grade === input.grade);
        const topic: Topic = { ...input, id: uid('top'), order: input.order ?? siblings.length + 1 };
        // Every batch following this syllabus gets a "Not Started" coverage row.
        const newCoverage = state.batches
          .filter((b) => b.subjectId === topic.subjectId && b.grade === topic.grade)
          .map((b) => ({ batchId: b.id, topicId: topic.id, status: 'Not Started' as const, hoursSpent: 0 }));
        set({
          topics: [...state.topics, topic],
          coverage: [...state.coverage, ...newCoverage],
          activity: withLog(state.activity, logEntry(`added topic "${topic.name}" to ${topic.grade} syllabus`)),
        });
        return topic;
      },

      updateTopic(id, patch) {
        const state = get();
        const topic = state.topics.find((t) => t.id === id);
        set({
          topics: state.topics.map((t) => (t.id === id ? { ...t, ...patch, id } : t)),
          activity: withLog(state.activity, logEntry(`edited topic "${patch.name ?? topic?.name ?? id}"`)),
        });
      },

      deleteTopic(id) {
        const state = get();
        set({
          topics: state.topics.filter((t) => t.id !== id),
          coverage: state.coverage.filter((c) => c.topicId !== id),
          activity: withLog(state.activity, logEntry(`removed topic "${state.topics.find((t) => t.id === id)?.name ?? id}"`)),
        });
      },

      setCoverage(batchId, topicId, status) {
        const state = get();
        const d = today();
        const found = state.coverage.some((c) => c.batchId === batchId && c.topicId === topicId);
        const next = (c: (typeof state.coverage)[number]) => ({
          ...c,
          status,
          startedOn: status === 'Not Started' ? undefined : (c.startedOn ?? d),
          completedOn: status === 'Completed' ? (c.completedOn ?? d) : undefined,
        });
        const topic = state.topics.find((t) => t.id === topicId);
        const batch = state.batches.find((b) => b.id === batchId);
        set({
          coverage: found
            ? state.coverage.map((c) => (c.batchId === batchId && c.topicId === topicId ? next(c) : c))
            : [...state.coverage, next({ batchId, topicId, status, hoursSpent: 0 })],
          activity: withLog(
            state.activity,
            logEntry(`marked "${topic?.name ?? 'topic'}" ${status.toLowerCase()} for ${batch?.name ?? 'a batch'}`, {
              type: 'batch',
              id: batchId,
            }),
          ),
        });
      },

      /* Fees ----------------------------------------------------------- */
      recordPayment(input) {
        const state = get();
        const invoice = state.invoices.find((i) => i.id === input.invoiceId);
        if (!invoice) throw new Error(`Invoice ${input.invoiceId} not found`);
        const payment: Payment = {
          id: uid('pay'),
          receiptNo: `${state.settings.fees.receiptPrefix}-${String(maxSuffix(state.payments.map((p) => p.receiptNo)) + 1).padStart(6, '0')}`,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          amount: input.amount,
          date: input.date,
          method: input.method,
          reference: input.reference,
          collectedBy: actor(),
        };
        const student = state.students.find((s) => s.id === invoice.studentId);
        set({
          payments: [...state.payments, payment],
          activity: withLog(
            state.activity,
            logEntry(
              `collected ${state.settings.currency.symbol}${input.amount.toLocaleString(state.settings.currency.locale)} from ${student?.name ?? 'a student'}`,
              {
                type: 'invoice',
                id: invoice.id,
              },
            ),
          ),
        });
        return payment;
      },

      addInvoice(input) {
        const state = get();
        const invoice: FeeInvoice = { ...input, id: invoiceId(input.period, state.invoices) };
        set({ invoices: [...state.invoices, invoice] });
        return invoice;
      },

      issueInvoices(period) {
        const state = get();
        const created: FeeInvoice[] = [];
        const has = new Set(state.invoices.map((i) => `${i.studentId}|${i.batchId}|${i.period}`));
        for (const s of state.students) {
          if (s.status !== 'Active') continue;
          for (const batchId of s.batchIds) {
            const batch = state.batches.find((b) => b.id === batchId);
            if (!batch || batch.status !== 'Active' || has.has(`${s.id}|${batchId}|${period}`)) continue;
            const issuedOn = billingDateFor(s, period, state.settings);
            created.push({
              id: invoiceId(period, [...state.invoices, ...created]),
              studentId: s.id,
              batchId,
              period,
              description: `${batch.name} · ${batch.title} — monthly tuition`,
              amount: discountedFee(batch.monthlyFee, s.concessionPct),
              issuedOn,
              dueDate: addDays(issuedOn, state.settings.fees.dueInDays),
            });
          }
        }
        if (created.length) {
          set({
            invoices: [...state.invoices, ...created],
            activity: withLog(state.activity, logEntry(`issued ${created.length} invoices for ${period}`)),
          });
        }
        return created.length;
      },

      waiveInvoice(id, waived) {
        const state = get();
        set({
          invoices: state.invoices.map((i) => (i.id === id ? { ...i, waived } : i)),
          activity: withLog(state.activity, logEntry(`${waived ? 'waived' : 'reinstated'} invoice ${id}`, { type: 'invoice', id })),
        });
      },

      /* Assessments ---------------------------------------------------- */
      addAssessment(input) {
        const state = get();
        const assessment: Assessment = { ...input, id: uid('asm') };
        set({
          assessments: [...state.assessments, assessment],
          activity: withLog(state.activity, logEntry(`recorded ${assessment.title}`, { type: 'assessment', id: assessment.id })),
        });
        return assessment;
      },

      updateAssessment(id, patch) {
        const state = get();
        const current = state.assessments.find((a) => a.id === id);
        set({
          assessments: state.assessments.map((a) => (a.id === id ? { ...a, ...patch, id } : a)),
          activity: withLog(
            state.activity,
            logEntry(`updated ${patch.title ?? current?.title ?? 'an assessment'}`, { type: 'assessment', id }),
          ),
        });
      },

      deleteAssessment(id) {
        const state = get();
        const current = state.assessments.find((a) => a.id === id);
        set({
          assessments: state.assessments.filter((a) => a.id !== id),
          activity: withLog(state.activity, logEntry(`deleted ${current?.title ?? 'an assessment'}`)),
        });
      },

      /* Roles ---------------------------------------------------------- */
      addRole(input) {
        const state = get();
        const refusal = checkAddRole(input, guardContext(state));
        if (refusal) return refusal;
        const permissions = withRequired(input.permissions);
        const role: Role = {
          id: uid('rol'),
          key: roleKeyFrom(input.name, state.roles),
          name: input.name.trim(),
          description: input.description?.trim() || undefined,
          permissions,
          isSystem: false,
        };
        set({
          roles: [...state.roles, role],
          activity: withLog(state.activity, logEntry(`created the ${role.name} role`)),
        });
        return { ok: true, role };
      },

      updateRole(id, patch) {
        const state = get();
        const refusal = checkUpdateRole(id, patch, guardContext(state));
        if (refusal) return refusal;
        const current = state.roles.find((r) => r.id === id)!;
        const role: Role = {
          ...current,
          name: patch.name !== undefined ? patch.name.trim() : current.name,
          description: patch.description !== undefined ? patch.description.trim() || undefined : current.description,
          // A role's key never changes: batches, reports and the backend refer to it.
          permissions: patch.permissions !== undefined ? withRequired(patch.permissions) : current.permissions,
        };
        set({
          roles: state.roles.map((r) => (r.id === id ? role : r)),
          activity: withLog(state.activity, logEntry(`updated the ${role.name} role`)),
        });
        return { ok: true, role };
      },

      deleteRole(id, reassignToId) {
        const state = get();
        const plan = checkDeleteRole(id, reassignToId, guardContext(state));
        if (isRoleFailure(plan)) return plan;
        const { role, affected, reassignTo } = plan;
        const movedStaff = affected.map((s) => s.id);
        set({
          roles: state.roles.filter((r) => r.id !== id),
          staff: reassignTo ? state.staff.map((s) => (s.roleId === id ? { ...s, roleId: reassignTo.id } : s)) : state.staff,
          activity: withLog(
            state.activity,
            logEntry(
              reassignTo
                ? `deleted the ${role.name} role and moved ${movedStaff.length} staff to ${reassignTo.name}`
                : `deleted the ${role.name} role`,
            ),
          ),
        });
        return { ok: true, role, movedStaff, reassignedTo: reassignTo };
      },

      /* Staff ---------------------------------------------------------- */
      addStaff(input) {
        const state = get();
        const member: Staff = { isOwner: false, ...input, id: uid('st') };
        const roleName = state.roles.find((r) => r.id === member.roleId)?.name ?? 'staff';
        set({
          staff: [...state.staff, member],
          activity: withLog(state.activity, logEntry(`invited ${member.name} as ${roleName}`, { type: 'staff', id: member.id })),
        });
        return member;
      },

      updateStaff(id, patch) {
        const state = get();
        const member = state.staff.find((s) => s.id === id);
        // Role/status changes may not leave the institute without an administrator.
        // The staff form blocks this first (features/faculty/staffRules.ts); this
        // is the same rule the backend will apply.
        if (patch.roleId !== undefined || patch.status !== undefined) {
          const after = state.staff.map((s) => (s.id === id ? { ...s, ...patch, id } : s));
          if (!activeAdministrators(after, state.roles).length) return;
        }
        // Sign-in only bumps lastActiveAt — not worth an activity entry.
        const meaningful = Object.keys(patch).some((k) => k !== 'lastActiveAt');
        set({
          staff: state.staff.map((s) => (s.id === id ? { ...s, ...patch, id } : s)),
          activity: meaningful
            ? withLog(state.activity, logEntry(`updated staff record for ${patch.name ?? member?.name ?? id}`, { type: 'staff', id }))
            : state.activity,
        });
      },

      removeStaff(id) {
        const state = get();
        // Never leave a batch without a teacher; reassign batches first.
        if (state.batches.some((b) => b.facultyId === id && b.status !== 'Archived')) return false;
        // Never remove the last person who can manage staff & roles.
        if (
          !activeAdministrators(
            state.staff.filter((s) => s.id !== id),
            state.roles,
          ).length
        )
          return false;
        const member = state.staff.find((s) => s.id === id);
        set({
          staff: state.staff.filter((s) => s.id !== id),
          activity: withLog(state.activity, logEntry(`removed ${member?.name ?? 'a staff member'} from staff`)),
        });
        return true;
      },

      /* Student & parent app accounts ---------------------------------- */
      invitePortalAccounts(studentId, roles) {
        const state = get();
        const student = state.students.find((s) => s.id === studentId);
        if (!student) return [];
        const expires = addDays(today(), 7);
        const accounts = [...state.portalAccounts];
        const created: PortalAccount[] = [];

        for (const role of roles) {
          const phoneKey = normalizePhone(student.guardian.phone);
          const idx = accounts.findIndex((a) =>
            role === 'student' ? a.role === 'student' && a.studentIds.includes(studentId) : a.role === 'parent' && a.loginId === phoneKey,
          );
          if (idx >= 0) {
            // Existing login: re-issue the invite and link this child if needed.
            const existing = accounts[idx];
            accounts[idx] = {
              ...existing,
              studentIds: existing.studentIds.includes(studentId) ? existing.studentIds : [...existing.studentIds, studentId],
              status: existing.status === 'Active' ? 'Active' : 'Invited',
              token: existing.status === 'Active' ? existing.token : { value: uid('invite'), purpose: 'activate', expiresAt: expires },
            };
            created.push(accounts[idx]);
            continue;
          }
          const account: PortalAccount = {
            id: uid(role === 'student' ? 'pa-s' : 'pa-p'),
            role,
            name: role === 'student' ? student.name : student.guardian.name,
            studentIds: [studentId],
            loginId: role === 'student' ? student.id : phoneKey,
            phone: role === 'parent' ? student.guardian.phone : student.phone,
            email: role === 'student' ? student.email : student.guardian.email,
            emailVerified: false,
            authMethod: role === 'student' ? 'password' : 'otp',
            status: 'Invited',
            invitedOn: today(),
            token: { value: uid('invite'), purpose: 'activate', expiresAt: expires },
            notify: { attendance: true, fees: role === 'parent', results: true },
          };
          accounts.push(account);
          created.push(account);
        }

        set({
          portalAccounts: accounts,
          // Keep the roster's "app access" summary in step with the student's own login.
          students: roles.includes('student')
            ? state.students.map((s) => (s.id === studentId && s.portalAccess === 'Not Invited' ? { ...s, portalAccess: 'Invited' } : s))
            : state.students,
          activity: withLog(
            state.activity,
            logEntry(`invited ${roles.join(' & ')} app access for ${student.name}`, { type: 'student', id: studentId }),
          ),
        });
        return created;
      },

      updatePortalAccount(id, patch) {
        const state = get();
        const account = state.portalAccounts.find((a) => a.id === id);
        // Signing in only bumps lastLoginAt — not worth an activity entry.
        const audited = Object.keys(patch).some((k) => k !== 'lastLoginAt');
        const what = patch.password ? 'password' : patch.email ? 'email address' : 'app account';
        set({
          portalAccounts: state.portalAccounts.map((a) => (a.id === id ? { ...a, ...patch, id } : a)),
          activity: audited ? withLog(state.activity, logEntry(`${account?.name ?? 'a user'} updated their ${what}`)) : state.activity,
        });
      },

      setPortalAccountStatus(id, status) {
        const state = get();
        const account = state.portalAccounts.find((a) => a.id === id);
        set({
          portalAccounts: state.portalAccounts.map((a) => (a.id === id ? { ...a, status } : a)),
          activity: withLog(
            state.activity,
            logEntry(`${status === 'Disabled' ? 'disabled' : 'enabled'} app access for ${account?.name ?? id}`),
          ),
        });
      },

      /* Settings & notifications -------------------------------------- */
      updateSettings(patch) {
        const current = get().settings;
        const next = { ...current } as Record<string, unknown>;
        for (const [key, value] of Object.entries(patch)) {
          const prev = (current as unknown as Record<string, unknown>)[key];
          next[key] =
            value && typeof value === 'object' && !Array.isArray(value) && prev && typeof prev === 'object' ? { ...prev, ...value } : value;
        }
        set({ settings: next as unknown as InstituteSettings });
      },

      markNotificationRead(id) {
        set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) });
      },

      markAllNotificationsRead() {
        set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) });
      },

      /* First-run setup ------------------------------------------------ */
      completeSetup() {
        const state = get();
        set({
          settings: { ...state.settings, setupCompletedAt: new Date().toISOString() },
          activity: withLog(state.activity, logEntry(`finished setting up ${state.settings.name || 'the institute'}`)),
        });
      },

      resetDemoData() {
        set(createDemoSnapshot());
      },

      resetToEmptyInstitute(input) {
        set(createEmptySnapshot(input));
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      /**
       * Only data is persisted; actions are recreated on load. Everything that
       * is not a function is saved, so adding a collection to DataSnapshot can
       * never be forgotten here (which would silently drop it on reload).
       */
      partialize: (s) => {
        return Object.fromEntries(Object.entries(s).filter(([, value]) => typeof value !== 'function')) as unknown as DataSnapshot;
      },
      // Schema changed between versions → start from a fresh tenant.
      migrate: () => freshSnapshot() as unknown as DataState,
      // Unreadable saved data (corrupt JSON, quota issues) → start from a fresh tenant.
      onRehydrateStorage: () => (state, error) => {
        // Deferred: with synchronous storage this runs while the store is still being created.
        if (error || (state && state.staff.length === 0)) queueMicrotask(() => useDataStore.setState(freshSnapshot()));
      },
    },
  ),
);
