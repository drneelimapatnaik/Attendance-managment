/**
 * Batch detail (/batches/:batchId).
 *
 * Header (status, grade, subject + permission-aware actions) → summary tiles
 * → tabs kept in the URL (?tab=students|attendance|syllabus|assessments).
 * The batch is looked up tenant-wide, so a link from another campus still
 * opens; unknown ids get a not-found state.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  PageHeader,
  Tabs,
  type MenuItem,
} from '@/components/ui';
import { useCan, useLookups, useSettings } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { useDataStore } from '@/store/dataStore';
import { useToast, useUiStore } from '@/store/uiStore';
import { enrolledIn } from '@/domain/academics';
import { formatDate, today } from '@/lib/date';
import { exportCsv } from '@/lib/export';
import { pluralize } from '@/lib/format';
import { SyllabusChecklist } from '@/features/topics/components/SyllabusChecklist';
import { PaceIndicator } from '@/features/topics/components/PaceIndicator';
import { paceFor } from '@/features/topics/coverage';
import { computeBatchMetrics } from './batchMetrics';
import { BatchAssessmentsTab } from './components/BatchAssessmentsTab';
import { BatchAttendanceTab } from './components/BatchAttendanceTab';
import { BatchOverviewTiles } from './components/BatchOverviewTiles';
import { BatchStatusBadge } from './components/BatchStatusBadge';
import { BatchStudentsTab } from './components/BatchStudentsTab';

type Tab = 'students' | 'attendance' | 'syllabus' | 'assessments';
const TABS: Tab[] = ['students', 'attendance', 'syllabus', 'assessments'];

export default function BatchDetailPage() {
  const { batchId = '' } = useParams();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const openModal = useUiStore((s) => s.openModal);
  const settings = useSettings();
  const lookups = useLookups();
  const students = useDataStore((s) => s.students);
  const sessions = useDataStore((s) => s.sessions);
  const coverage = useDataStore((s) => s.coverage);
  const topics = useDataStore((s) => s.topics);
  const assessments = useDataStore((s) => s.assessments);
  const archiveBatch = useDataStore((s) => s.archiveBatch);
  const updateBatch = useDataStore((s) => s.updateBatch);
  const [params, setParams] = useSearchParams();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const batch = lookups.batch.get(batchId);
  useDocumentTitle(batch ? `${batch.name} · ${batch.title}` : 'Batch not found');

  const metrics = useMemo(
    () =>
      batch
        ? computeBatchMetrics([batch], { students, sessions, coverage, topics }, settings.attendance.countLateAsPresent).get(batch.id)
        : undefined,
    [batch, students, sessions, coverage, topics, settings.attendance.countLateAsPresent],
  );
  const assessmentCount = useMemo(() => assessments.filter((a) => a.batchId === batchId).length, [assessments, batchId]);
  const sessionCount = useMemo(() => sessions.filter((s) => s.batchId === batchId).length, [sessions, batchId]);

  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'students';
  const setTab = (t: Tab) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === 'students') next.delete('tab');
        else next.set('tab', t);
        next.delete('range'); // tab-specific state doesn't carry over
        return next;
      },
      { replace: true },
    );

  if (!batch || !metrics) {
    return (
      <div className="flex flex-col gap-space-lg">
        <PageHeader eyebrow="Academic" title="Batch not found" back={{ to: '/batches', label: 'All batches' }} />
        <Card>
          <EmptyState
            icon="search_off"
            title="We couldn't find this batch"
            description={`No batch matches “${batchId}”. It may have been removed, or the link is incomplete.`}
            action={
              <ButtonLink to="/batches" variant="tonal" icon="arrow_back">
                Back to batches
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  const subject = lookups.subject.get(batch.subjectId);
  const faculty = lookups.staff.get(batch.facultyId);
  const archived = batch.status === 'Archived';
  const pace = paceFor(batch, metrics.coverage, settings);

  const archive = () => {
    archiveBatch(batch.id);
    setConfirmArchive(false);
    toast({
      title: `${batch.name} archived`,
      description: 'It no longer appears in roll calls or timetables.',
      action: { label: 'Undo', onClick: () => updateBatch(batch.id, { status: batch.status, endDate: batch.endDate }) },
    });
  };

  const exportRoster = () =>
    exportCsv(`${batch.name.replace(/\s+/g, '-')}-roster-${today()}`, enrolledIn(batch, students), [
      { header: 'Student ID', value: (s) => s.id },
      { header: 'Name', value: (s) => s.name },
      { header: 'Grade', value: (s) => s.grade },
      { header: 'Section', value: (s) => s.section },
      { header: 'Parent', value: (s) => s.guardian.name },
      { header: 'Parent mobile', value: (s) => s.guardian.phone },
      { header: 'Joined', value: (s) => s.joiningDate },
      { header: 'Status', value: (s) => s.status },
    ]);

  const menuItems: MenuItem[] = [
    ...(can('topics.manage')
      ? [{ label: 'Topic coverage', icon: 'menu_book', onSelect: () => navigate(`/topics?batch=${batch.id}`) }]
      : []),
    { label: 'Export roster (CSV)', icon: 'download', onSelect: exportRoster, disabled: metrics.enrolled === 0 },
    ...(can('batches.manage')
      ? archived
        ? [
            {
              label: 'Restore batch',
              icon: 'unarchive',
              separator: true,
              onSelect: () => {
                updateBatch(batch.id, { status: 'Active', endDate: undefined });
                toast({ title: `${batch.name} restored`, description: 'The batch is active again.' });
              },
            },
          ]
        : [{ label: 'Archive batch', icon: 'archive', tone: 'danger' as const, separator: true, onSelect: () => setConfirmArchive(true) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Academic"
        back={{ to: '/batches', label: 'All batches' }}
        title={`${batch.name} · ${batch.title}`}
        description={
          <span className="mt-1 inline-flex flex-wrap items-center gap-space-xs">
            <BatchStatusBadge status={batch.status} />
            <Badge tone="primary" icon="school">
              {batch.grade}
            </Badge>
            {subject && <Badge tone="surface">{subject.name}</Badge>}
            {batch.status === 'Upcoming' && (
              <span className="font-body-sm text-body-sm text-secondary">Starts {formatDate(batch.startDate)}</span>
            )}
            {archived && batch.endDate && (
              <span className="font-body-sm text-body-sm text-secondary">Archived on {formatDate(batch.endDate)}</span>
            )}
          </span>
        }
        actions={
          <>
            {can('attendance.mark') && batch.status === 'Active' && (
              <ButtonLink to={`/attendance?batch=${batch.id}`} icon="how_to_reg" className="px-space-md">
                Mark Attendance
              </ButtonLink>
            )}
            {can('students.manage') && !archived && (
              <Button variant="tonal" icon="person_add" onClick={() => openModal({ type: 'student-form', batchId: batch.id })}>
                Add Student
              </Button>
            )}
            {can('batches.manage') && (
              <Button variant="tonal" icon="edit" onClick={() => openModal({ type: 'batch-form', batchId: batch.id })}>
                Edit
              </Button>
            )}
            <Menu
              width="w-56"
              items={menuItems}
              trigger={(props) => <IconButton {...props} icon="more_vert" label="More batch actions" className="bg-surface-container" />}
            />
          </>
        }
      />

      <BatchOverviewTiles batch={batch} faculty={faculty} metrics={metrics} />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        ariaLabel="Batch sections"
        items={[
          { value: 'students', label: 'Students', icon: 'group', count: metrics.enrolled },
          { value: 'attendance', label: 'Attendance', icon: 'how_to_reg', count: sessionCount },
          { value: 'syllabus', label: 'Syllabus', icon: 'menu_book', count: metrics.coverage.total },
          { value: 'assessments', label: 'Assessments', icon: 'quiz', count: assessmentCount },
        ]}
      />

      {tab === 'students' && <BatchStudentsTab batch={batch} />}
      {tab === 'attendance' && <BatchAttendanceTab batch={batch} />}
      {tab === 'assessments' && <BatchAssessmentsTab batch={batch} />}
      {tab === 'syllabus' && (
        <Card className="flex flex-col gap-space-md">
          <CardHeader
            title="Syllabus coverage"
            icon="menu_book"
            subtitle={`${metrics.coverage.completed} of ${pluralize(metrics.coverage.total, 'topic')} completed · ${metrics.coverage.inProgress} in progress`}
            actions={
              can('topics.manage') ? (
                <ButtonLink to={`/topics?batch=${batch.id}`} variant="tonal" size="sm" trailingIcon="arrow_forward">
                  <span className="hidden sm:inline">Open in </span>Topic Coverage
                </ButtonLink>
              ) : undefined
            }
          />
          {metrics.coverage.total > 0 && <PaceIndicator pace={pace} total={metrics.coverage.total} />}
          <SyllabusChecklist batch={batch} canManage={can('topics.manage') && !archived} />
        </Card>
      )}

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={archive}
        title="Archive batch?"
        confirmLabel="Archive"
        message={
          <>
            <strong className="text-on-surface">
              {batch.name} · {batch.title}
            </strong>{' '}
            will be closed today and removed from roll calls, the timetable and new admissions.{' '}
            {metrics.enrolled > 0 &&
              `Its ${pluralize(metrics.enrolled, 'enrolled student')} keep their history but won't be billed for it. `}
            You can restore it later from this page.
          </>
        }
      />
    </div>
  );
}
