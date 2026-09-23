/**
 * Batch detail › Students: the batch roster with 30-day attendance in THIS
 * batch, overall fee status and a "Remove from batch" action (confirmed,
 * undoable) for users who can manage students.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Batch, Student } from '@/types/domain';
import { Button, ConfirmDialog, DataTable, EmptyState, Icon, IconButton, SearchInput, type Column } from '@/components/ui';
import { AttendancePctBadge, FeeStatusBadge, PersonCell, StudentStatusBadge } from '@/components/domain';
import { useCan, useFeeIndex, useSettings } from '@/hooks/useTenant';
import { useDataStore } from '@/store/dataStore';
import { useToast, useUiStore } from '@/store/uiStore';
import { enrolledIn } from '@/domain/academics';
import { attendanceRate, buildStudentAttendanceIndex } from '@/domain/attendance';
import { feeSummaryFor, type StudentFeeSummary } from '@/domain/fees';
import { addDays, formatDate, today } from '@/lib/date';
import { matchesQuery, telHref } from '@/lib/format';
import { ATTENDANCE_WINDOW_DAYS } from '../batchMetrics';

interface Row {
  student: Student;
  fee: StudentFeeSummary;
  attendance: number;
}

export function BatchStudentsTab({ batch }: { batch: Batch }) {
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const openModal = useUiStore((s) => s.openModal);
  const settings = useSettings();
  const students = useDataStore((s) => s.students);
  const sessions = useDataStore((s) => s.sessions);
  const updateStudent = useDataStore((s) => s.updateStudent);
  const feeIndex = useFeeIndex();
  const [q, setQ] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Student | null>(null);
  const canManage = can('students.manage') && batch.status !== 'Archived';
  const { lowAttendanceThreshold: threshold, countLateAsPresent } = settings.attendance;

  const all = useMemo<Row[]>(() => {
    const from = addDays(today(), -(ATTENDANCE_WINDOW_DAYS - 1));
    const index = buildStudentAttendanceIndex(sessions.filter((s) => s.batchId === batch.id && s.date >= from));
    return enrolledIn(batch, students)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((student) => {
        const counts = index.get(student.id);
        return {
          student,
          fee: feeSummaryFor(feeIndex, student.id),
          attendance: counts ? attendanceRate(counts, countLateAsPresent) : NaN,
        };
      });
  }, [batch, students, sessions, feeIndex, countLateAsPresent]);

  const rows = useMemo(
    () => all.filter(({ student: s }) => matchesQuery(q, s.name, s.id, s.cardNo, s.guardian.name, s.guardian.phone)),
    [all, q],
  );

  const remove = (s: Student) => {
    const before = s.batchIds;
    updateStudent(s.id, { batchIds: before.filter((id) => id !== batch.id) });
    setRemoveTarget(null);
    toast({
      title: `${s.name} removed from ${batch.name}`,
      description: 'Attendance history is kept; future invoices for this batch stop.',
      action: { label: 'Undo', onClick: () => updateStudent(s.id, { batchIds: before }, { issueInvoices: false }) },
    });
  };

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Student',
      sortValue: (r) => r.student.name,
      headerClassName: 'min-w-[200px]',
      cell: ({ student: s }) => (
        <PersonCell
          name={s.name}
          subtitle={`${s.id} · ${s.section}`}
          photoUrl={s.photoUrl}
          to={`/students/${s.id}`}
          dimmed={s.status !== 'Active'}
        />
      ),
    },
    {
      key: 'guardian',
      header: 'Parent',
      hideBelow: 'lg',
      cell: ({ student: s }) => (
        <>
          <span className="block font-label-md text-label-md text-on-surface">{s.guardian.name}</span>
          <a
            href={telHref(s.guardian.phone)}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 whitespace-nowrap font-body-sm text-body-sm text-primary hover:underline"
          >
            <Icon name="call" size={14} />
            {s.guardian.phone}
          </a>
        </>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      hideBelow: 'xl',
      className: 'whitespace-nowrap',
      sortValue: (r) => r.student.joiningDate,
      cell: ({ student: s }) => <span className="font-body-md text-body-md text-on-surface-variant">{formatDate(s.joiningDate)}</span>,
    },
    {
      key: 'attendance',
      header: 'Attend. 30d',
      align: 'center',
      sortValue: (r) => (Number.isFinite(r.attendance) ? r.attendance : -1),
      cell: ({ attendance }) => <AttendancePctBadge ratio={attendance} threshold={threshold} />,
    },
    {
      key: 'fee',
      header: 'Fee Status',
      className: 'whitespace-nowrap',
      sortValue: (r) => r.fee.outstanding,
      cell: ({ fee }) => <FeeStatusBadge status={fee.status} amount={fee.outstanding} />,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      hideBelow: 'lg',
      sortValue: (r) => r.student.status,
      cell: ({ student: s }) => <StudentStatusBadge status={s.status} />,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right' as const,
            cell: ({ student: s }: Row) => (
              <IconButton
                icon="person_remove"
                label={`Remove ${s.name} from ${batch.name}`}
                size="sm"
                tone="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setRemoveTarget(s);
                }}
              />
            ),
          },
        ]
      : []),
  ];

  const mobileCard = ({ student: s, fee, attendance }: Row) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <PersonCell name={s.name} subtitle={`${s.id} · ${s.section}`} photoUrl={s.photoUrl} dimmed={s.status !== 'Active'} />
        {canManage && (
          <IconButton
            icon="person_remove"
            label={`Remove ${s.name} from ${batch.name}`}
            size="sm"
            tone="danger"
            onClick={(e) => {
              e.stopPropagation();
              setRemoveTarget(s);
            }}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-space-xs">
        <AttendancePctBadge ratio={attendance} threshold={threshold} />
        <FeeStatusBadge status={fee.status} amount={fee.outstanding} />
        {s.status !== 'Active' && <StudentStatusBadge status={s.status} />}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-space-md">
      {all.length > 0 && (
        <div className="flex flex-col gap-space-sm sm:flex-row sm:items-center">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search students in this batch..."
            containerClassName="sm:max-w-sm sm:flex-1"
          />
          <span className="font-body-sm text-body-sm text-secondary sm:ml-auto">
            Attendance is for this batch only · fee status covers all of a student's batches
          </span>
        </div>
      )}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.student.id}
        onRowClick={(r) => navigate(`/students/${r.student.id}`)}
        rowClassName={(r) => (r.fee.status === 'Overdue' ? 'bg-error-container/20' : undefined)}
        mobileCard={mobileCard}
        entityLabel="students"
        initialSort={{ key: 'name', dir: 'asc' }}
        caption={`Students in ${batch.name}`}
        empty={
          <EmptyState
            icon={all.length ? 'person_search' : 'group_add'}
            title={all.length ? 'No students match your search' : 'No students enrolled yet'}
            description={
              all.length ? 'Try a different name, ID or phone number.' : `Add students to ${batch.name} to start marking attendance.`
            }
            action={
              all.length ? (
                <Button variant="tonal" icon="close" onClick={() => setQ('')}>
                  Clear search
                </Button>
              ) : can('students.manage') && batch.status !== 'Archived' ? (
                <Button icon="person_add" onClick={() => openModal({ type: 'student-form', batchId: batch.id })}>
                  Add student
                </Button>
              ) : undefined
            }
          />
        }
      />

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && remove(removeTarget)}
        title="Remove from batch?"
        confirmLabel="Remove"
        message={
          removeTarget && (
            <>
              <strong className="text-on-surface">{removeTarget.name}</strong> will be taken off the {batch.name} roll call and no longer
              billed for it. Their attendance and fee history is kept, and they stay enrolled in any other batches.
            </>
          )
        }
      />
    </div>
  );
}
