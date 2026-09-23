/**
 * Hooks for the student & parent app.
 *
 * Everything here is scoped to the signed-in account: a student sees only
 * their own record, a parent only their linked children (one at a time, chosen
 * with the child switcher). Fees are visible to parents only.
 */
import { useMemo } from 'react';
import { useDataStore } from '@/store/dataStore';
import { useSessionStore } from '@/store/sessionStore';
import { feeSummaryFor, type StudentFeeSummary } from '@/domain/fees';
import { buildFeeIndex } from '@/domain/fees';
import { today } from '@/lib/date';
import type { Batch, PortalAccount, Student } from '@/types/domain';

export function usePortalAccount(): PortalAccount | undefined {
  const id = useSessionStore((s) => s.portalAccountId);
  const accounts = useDataStore((s) => s.portalAccounts);
  return useMemo(() => accounts.find((a) => a.id === id), [accounts, id]);
}

/** Children linked to this login (one for a student account). */
export function usePortalStudents(): Student[] {
  const account = usePortalAccount();
  const students = useDataStore((s) => s.students);
  return useMemo(
    () => (account ? account.studentIds.map((id) => students.find((s) => s.id === id)).filter((s): s is Student => !!s) : []),
    [account, students],
  );
}

/** The student currently in view. */
export function useActiveStudent(): Student | undefined {
  const activeId = useSessionStore((s) => s.activeStudentId);
  const linked = usePortalStudents();
  return linked.find((s) => s.id === activeId) ?? linked[0];
}

/** True when the signed-in account may see money (parents only). */
export function useCanSeeFees(): boolean {
  return usePortalAccount()?.role === 'parent';
}

/**
 * Everything the app needs about the student in view, already filtered:
 * their batches, attendance sessions, assessments, syllabus coverage, and
 * (for parents) invoices, payments and the fee summary.
 */
export function usePortalData() {
  const student = useActiveStudent();
  const isParent = useCanSeeFees();
  const batches = useDataStore((s) => s.batches);
  const sessions = useDataStore((s) => s.sessions);
  const assessments = useDataStore((s) => s.assessments);
  const coverage = useDataStore((s) => s.coverage);
  const topics = useDataStore((s) => s.topics);
  const staff = useDataStore((s) => s.staff);
  const subjects = useDataStore((s) => s.subjects);
  const invoices = useDataStore((s) => s.invoices);
  const payments = useDataStore((s) => s.payments);
  const grace = useDataStore((s) => s.settings.fees.gracePeriodDays);

  return useMemo(() => {
    const myBatches = student ? batches.filter((b) => student.batchIds.includes(b.id)) : [];
    const batchIds = new Set(myBatches.map((b) => b.id));
    const mySessions = student ? sessions.filter((s) => batchIds.has(s.batchId) && student.id in s.records) : [];
    const myInvoices = student && isParent ? invoices.filter((i) => i.studentId === student.id) : [];
    const myPayments = student && isParent ? payments.filter((p) => p.studentId === student.id) : [];
    const fees: StudentFeeSummary | undefined =
      student && isParent ? feeSummaryFor(buildFeeIndex(myInvoices, myPayments, today(), grace), student.id) : undefined;
    const subjectById = new Map(subjects.map((x) => [x.id, x]));
    return {
      student,
      batches: myBatches,
      subjects,
      /** Subject record for a batch — every portal screen labels classes by subject. */
      subjectOf: (batch: Batch) => subjectById.get(batch.subjectId),
      sessions: mySessions,
      assessments: student ? assessments.filter((a) => batchIds.has(a.batchId) && student.id in a.scores) : [],
      coverage: coverage.filter((c) => batchIds.has(c.batchId)),
      topics,
      staff,
      invoices: myInvoices,
      payments: myPayments,
      fees,
    };
  }, [student, isParent, batches, sessions, assessments, coverage, topics, staff, subjects, invoices, payments, grace]);
}
