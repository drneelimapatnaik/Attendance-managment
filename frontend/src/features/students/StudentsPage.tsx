/**
 * Students & Batch Roster — the screen from the design mock-up.
 *
 * Layout (2xl): roster table (9 cols) + side column (3 cols) with the
 * "Active Batches Overview" and the "Bulk Attendance" CTA. Below 2xl the side
 * column stacks under the table; below md the table becomes cards.
 *
 * Tabs switch between the roster, a batch grid and the subject/topic master.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Student } from '@/types/domain';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Icon,
  LegendDot,
  Menu,
  PageHeader,
  Tabs,
  type Column,
  type MenuItem,
} from '@/components/ui';
import { BatchTags, FeeStatusBadge, PersonCell, StudentStatusBadge } from '@/components/domain';
import { useCan, useLookups, useScopedData, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle, useSelection } from '@/hooks/ui';
import { useDataStore } from '@/store/dataStore';
import { useToast, useUiStore } from '@/store/uiStore';
import { occupancy } from '@/domain/academics';
import { ageOn, formatDate, tenureLabel } from '@/lib/date';
import { telHref } from '@/lib/format';
import { cn } from '@/lib/cn';
import { BatchSummaryCard } from '@/features/batches/components/BatchSummaryCard';
import { FastAttendanceCard } from '@/features/attendance/components/FastAttendanceCard';
import { RosterFiltersBar } from './components/RosterFilters';
import { StudentQuickActions, useFeeReminder } from './components/StudentQuickActions';
import { IdCardsModal } from './IdCardsModal';
import { exportRoster } from './exportStudents';
import { useRosterFilters, useRosterRows, type RosterRow } from './useRoster';

type View = 'students' | 'batches' | 'subjects';

export default function StudentsPage() {
  useDocumentTitle('Students Roster');
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const openModal = useUiStore((s) => s.openModal);
  const settings = useSettings();
  const { batches, students } = useScopedData();
  const lookups = useLookups();
  const subjects = useDataStore((s) => s.subjects);
  const topics = useDataStore((s) => s.topics);
  const setStudentsStatus = useDataStore((s) => s.setStudentsStatus);
  const remind = useFeeReminder();

  const [view, setView] = useState<View>('students');
  const [archiveTarget, setArchiveTarget] = useState<Student | null>(null);
  const [idCardsFor, setIdCardsFor] = useState<Student[] | null>(null);

  const { filters, setFilter, reset, isFiltered } = useRosterFilters();
  const { rows, summary } = useRosterRows(filters);
  const selection = useSelection(rows.map((r) => r.student.id));
  const selectedRows = rows.filter((r) => selection.isSelected(r.student.id));

  const activeBatches = useMemo(() => batches.filter((b) => b.status === 'Active'), [batches]);
  const cohort = useMemo(() => {
    const cap = activeBatches.reduce((s, b) => s + b.capacity, 0);
    const filled = activeBatches.reduce((s, b) => s + occupancy(b, students).enrolled, 0);
    return cap ? Math.round((filled / cap) * 100) : 0;
  }, [activeBatches, students]);
  // "Featured" batches: the three fullest active batches.
  const featured = useMemo(
    () => [...activeBatches].sort((a, b) => occupancy(b, students).ratio - occupancy(a, students).ratio).slice(0, 3),
    [activeBatches, students],
  );

  // Print / export act on the selection when there is one, else on the filtered list.
  const secondaryActions: (MenuItem & { label: string; icon: string; onSelect: () => void; className?: string })[] = [
    {
      label: 'Print ID Cards',
      icon: 'badge',
      onSelect: () => setIdCardsFor(selectedRows.length ? selectedRows.map((r) => r.student) : rows.map((r) => r.student)),
    },
    {
      label: 'Export Excel',
      icon: 'table_view',
      onSelect: () => exportRoster(selectedRows.length ? selectedRows : rows, lookups.batch, settings.name),
    },
    ...(can('batches.manage')
      ? [
          {
            label: '+ Create New Batch',
            icon: 'domain_add',
            className: 'bg-surface-container-highest text-on-surface hover:bg-surface-dim',
            onSelect: () => openModal({ type: 'batch-form' }),
          },
        ]
      : []),
  ];

  const archive = (s: Student) => {
    setStudentsStatus([s.id], 'Inactive');
    setArchiveTarget(null);
    toast({
      title: `${s.name} archived`,
      description: 'Marked inactive — their seat is now free.',
      action: { label: 'Undo', onClick: () => setStudentsStatus([s.id], s.status) },
    });
  };

  const columns: Column<RosterRow>[] = [
    {
      key: 'id',
      header: 'Student ID',
      sortValue: (r) => r.student.id,
      className: 'whitespace-nowrap',
      cell: ({ student: s }) => (
        <>
          <Link
            to={`/students/${s.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-label-md text-label-md font-semibold text-primary hover:underline"
          >
            {s.id}
          </Link>
          <span className="block font-body-sm text-body-sm text-secondary">Card #{s.cardNo}</span>
        </>
      ),
    },
    {
      key: 'name',
      header: 'Student Details',
      sortValue: (r) => r.student.name,
      headerClassName: 'min-w-[200px]',
      cell: ({ student: s }) => (
        <PersonCell name={s.name} subtitle={`${s.grade} - ${s.section}`} photoUrl={s.photoUrl} dimmed={s.status !== 'Active'} />
      ),
    },
    {
      key: 'dob',
      header: 'Gender & DOB',
      hideBelow: 'xl',
      className: 'whitespace-nowrap',
      sortValue: (r) => r.student.dob,
      cell: ({ student: s }) => (
        <>
          <span className="font-body-md text-body-md text-on-surface">
            {s.gender}, {ageOn(s.dob)} yrs
          </span>
          <span className="block font-body-sm text-body-sm text-secondary">DOB: {formatDate(s.dob)}</span>
        </>
      ),
    },
    {
      key: 'parent',
      header: 'Parent Details',
      headerClassName: 'min-w-[170px]',
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
      key: 'batch',
      header: 'Assigned Batch',
      className: 'whitespace-nowrap',
      cell: ({ student: s }) => <BatchTags batchIds={s.batchIds} />,
    },
    {
      key: 'joined',
      header: 'Joining Date',
      hideBelow: '2xl',
      className: 'whitespace-nowrap',
      sortValue: (r) => r.student.joiningDate,
      cell: ({ student: s }) => (
        <>
          <span className="font-body-md text-body-md text-on-surface">{formatDate(s.joiningDate)}</span>
          <span className="block font-body-sm text-body-sm text-secondary">{tenureLabel(s.joiningDate)}</span>
        </>
      ),
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
      sortValue: (r) => r.student.status,
      cell: ({ student: s }) => <StudentStatusBadge status={s.status} />,
    },
    {
      key: 'actions',
      header: 'Quick Actions',
      align: 'right',
      className: 'whitespace-nowrap',
      headerClassName: 'pr-space-md',
      cell: ({ student, fee }) => <StudentQuickActions student={student} fee={fee} onArchive={setArchiveTarget} />,
    },
  ];

  const mobileCard = ({ student: s, fee }: RosterRow) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <PersonCell name={s.name} subtitle={`${s.id} · ${s.grade} - ${s.section}`} photoUrl={s.photoUrl} />
        <StudentStatusBadge status={s.status} />
      </div>
      <div className="flex flex-wrap items-center gap-space-xs">
        <BatchTags batchIds={s.batchIds} />
        <FeeStatusBadge status={fee.status} amount={fee.outstanding} />
      </div>
      <div className="flex items-center justify-between">
        <a
          href={telHref(s.guardian.phone)}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 font-body-sm text-body-sm text-primary"
        >
          <Icon name="call" size={14} />
          {s.guardian.name}
        </a>
        <StudentQuickActions student={s} fee={fee} onArchive={setArchiveTarget} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Academic Administration"
        title="Students & Batch Roster"
        meta={`Cohort Capacity: ${cohort}% Filled`}
        actions={
          <>
            {/* Secondary actions: inline buttons from `sm`, an overflow menu on phones. */}
            {secondaryActions.map((a) => (
              <Button key={a.label} variant="tonal" icon={a.icon} className={cn('hidden sm:inline-flex', a.className)} onClick={a.onSelect}>
                {a.label}
              </Button>
            ))}
            <Menu
              align="start"
              className="sm:hidden"
              items={secondaryActions}
              trigger={(props) => (
                <Button {...props} variant="tonal" icon="more_horiz">
                  More
                </Button>
              )}
            />
            {can('students.manage') && (
              <Button
                icon="person_add"
                className="px-space-md"
                onClick={() => openModal({ type: 'student-form', batchId: filters.batch || undefined })}
              >
                + Add New Student
              </Button>
            )}
          </>
        }
      />

      <Tabs<View>
        value={view}
        onChange={setView}
        ariaLabel="Roster views"
        items={[
          { value: 'students', label: 'Active Students', icon: 'group', count: summary.current },
          { value: 'batches', label: 'Batches', icon: 'grid_view', count: activeBatches.length },
          { value: 'subjects', label: 'Subject & Topic Master', icon: 'auto_stories' },
        ]}
        trailing={
          <>
            <LegendDot color="bg-primary">{summary.paid} Paid</LegendDot>
            <LegendDot color="bg-secondary">{summary.pending} Due</LegendDot>
            <LegendDot color="bg-error">{summary.overdue} Overdue</LegendDot>
          </>
        }
      />

      {view === 'students' && (
        <>
          <RosterFiltersBar filters={filters} setFilter={setFilter} onReset={reset} isFiltered={isFiltered} />
          <div className="grid grid-cols-1 gap-space-lg 2xl:grid-cols-12">
            <div className="flex flex-col gap-space-md 2xl:col-span-9">
              {selection.count > 0 && (
                <div className="flex flex-wrap items-center gap-space-xs rounded-xl bg-primary-fixed px-space-md py-space-xs text-on-primary-fixed">
                  <span className="mr-auto font-label-lg text-label-lg">{selection.count} selected</span>
                  <Button size="sm" variant="ghost" icon="badge" onClick={() => setIdCardsFor(selectedRows.map((r) => r.student))}>
                    ID cards
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="sms"
                    onClick={() => {
                      const due = selectedRows.filter((r) => r.fee.outstanding > 0);
                      due.forEach((r) => remind(r.student, r.fee));
                      if (!due.length) toast({ title: 'No dues among the selected students', tone: 'info' });
                    }}
                  >
                    Fee reminder
                  </Button>
                  {can('students.manage') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="archive"
                      onClick={() => {
                        setStudentsStatus([...selection.selected], 'Inactive');
                        toast({ title: `${selection.count} students archived` });
                        selection.clear();
                      }}
                    >
                      Archive
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon="close" onClick={selection.clear}>
                    Clear
                  </Button>
                </div>
              )}
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(r) => r.student.id}
                selection={selection}
                onRowClick={(r) => navigate(`/students/${r.student.id}`)}
                rowClassName={(r) => (r.fee.status === 'Overdue' ? 'bg-error-container/20' : undefined)}
                mobileCard={mobileCard}
                entityLabel="students"
                initialSort={{ key: 'id', dir: 'asc' }}
                caption="Students roster"
                empty={
                  <EmptyState
                    icon="person_search"
                    title={isFiltered ? 'No students match these filters' : 'No students yet'}
                    description={
                      isFiltered
                        ? 'Try a different search or reset the filters.'
                        : 'Add your first student to start tracking attendance and fees.'
                    }
                    action={
                      isFiltered ? (
                        <Button variant="tonal" icon="filter_alt_off" onClick={reset}>
                          Reset filters
                        </Button>
                      ) : can('students.manage') ? (
                        <Button icon="person_add" onClick={() => openModal({ type: 'student-form' })}>
                          Add student
                        </Button>
                      ) : undefined
                    }
                  />
                }
              />
            </div>

            <div className="flex flex-col gap-space-md 2xl:col-span-3">
              <Card className="flex flex-col gap-space-md">
                <CardHeader title="Active Batches Overview" icon="hub" actions={<Badge tone="surface">{featured.length} Featured</Badge>} />
                <div className="grid gap-space-sm md:grid-cols-3 2xl:grid-cols-1">
                  {featured.map((b) => (
                    <BatchSummaryCard key={b.id} batch={b} />
                  ))}
                </div>
                <ButtonLink to="/batches" variant="tonal" trailingIcon="dataset" fullWidth className="text-on-surface">
                  View All {activeBatches.length} Active Batches
                </ButtonLink>
              </Card>
              {can('attendance.mark') && <FastAttendanceCard />}
            </div>
          </div>
        </>
      )}

      {view === 'batches' && (
        <div className="grid gap-space-md sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {activeBatches.map((b) => (
            <div key={b.id} className="card p-space-xs">
              <BatchSummaryCard batch={b} />
            </div>
          ))}
        </div>
      )}

      {view === 'subjects' && (
        <Card padded={false}>
          <div className="p-space-md">
            <CardHeader
              title="Subject & Topic Master"
              icon="auto_stories"
              subtitle="Syllabus per subject and grade. Manage topics and track coverage per batch in Topic Coverage."
              actions={
                <ButtonLink to="/topics" variant="tonal" icon="menu_book" size="sm">
                  Open Topic Coverage
                </ButtonLink>
              }
            />
          </div>
          <ul className="divide-y divide-surface-container-low">
            {subjects.map((sub) => (
              <li key={sub.id} className="flex flex-col gap-space-xs p-space-md md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-fixed font-label-md text-label-md text-on-primary-fixed">
                    {sub.code}
                  </span>
                  <div>
                    <p className="font-title-md text-title-md text-on-surface">{sub.name}</p>
                    <p className="font-body-sm text-body-sm text-secondary">
                      {batches.filter((b) => b.subjectId === sub.id && b.status === 'Active').length} active batches
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-space-xs">
                  {sub.grades.map((g) => {
                    const n = topics.filter((t) => t.subjectId === sub.id && t.grade === g).length;
                    return (
                      <Link
                        key={g}
                        to={`/topics?subject=${sub.id}&grade=${encodeURIComponent(g)}`}
                        className={cn('rounded-lg bg-surface-container-low px-space-sm py-1.5 hover:bg-surface-container')}
                      >
                        <span className="font-label-md text-label-md text-on-surface">{g}</span>
                        <span className="ml-2 font-body-sm text-body-sm text-secondary">{n} topics</span>
                      </Link>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && archive(archiveTarget)}
        title="Archive student?"
        confirmLabel="Archive"
        message={
          archiveTarget && (
            <>
              <strong className="text-on-surface">{archiveTarget.name}</strong> will be marked inactive and removed from roll calls. Their
              attendance and fee history is kept, and you can restore them any time from their profile.
            </>
          )
        }
      />
      <IdCardsModal open={!!idCardsFor} onClose={() => setIdCardsFor(null)} students={idCardsFor ?? []} />
    </div>
  );
}
