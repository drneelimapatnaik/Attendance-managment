/**
 * "Student summary" tab of Attendance Reports: one row per student with
 * sessions, P / L / A / E counts and attendance %, sortable, with a
 * "Below threshold only" toggle, name/ID search and CSV export. Phones get
 * stacked cards. Sorted lowest attendance first so follow-ups surface.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, DataTable, EmptyState, SearchInput, Switch, type Column } from '@/components/ui';
import { AttendancePctBadge, BatchTags, PersonCell } from '@/components/domain';
import { useLookups } from '@/hooks/useTenant';
import { exportCsv } from '@/lib/export';
import { matchesQuery } from '@/lib/format';
import { isBelowThreshold } from '../attendanceStats';
import { REPORT_MIN_SESSIONS, type ReportStudentRow } from '../useAttendanceReport';

interface StudentSummaryTableProps {
  rows: ReportStudentRow[];
  threshold: number;
  belowOnly: boolean;
  onBelowOnly: (on: boolean) => void;
  /** e.g. "attendance-2026-08-24-to-2026-09-22" */
  fileStem: string;
  isFiltered: boolean;
  onReset: () => void;
}

// Students with only excused marks have no % — sort them after everyone else in "lowest first".
const pctValue = (r: ReportStudentRow) => (Number.isFinite(r.rate) ? r.rate : 2);

export function exportStudentSummary(rows: ReportStudentRow[], fileStem: string, batchName: (id: string) => string) {
  exportCsv(`${fileStem}-students`, rows, [
    { header: 'Student ID', value: (r) => r.student.id },
    { header: 'Name', value: (r) => r.student.name },
    { header: 'Grade', value: (r) => r.student.grade },
    { header: 'Batches', value: (r) => r.batchIds.map(batchName).join('; ') },
    { header: 'Sessions', value: (r) => r.sessions },
    { header: 'Present', value: (r) => r.counts.P },
    { header: 'Late', value: (r) => r.counts.L },
    { header: 'Absent', value: (r) => r.counts.A },
    { header: 'Excused', value: (r) => r.counts.E },
    { header: 'Attendance %', value: (r) => (Number.isFinite(r.rate) ? Math.round(r.rate * 1000) / 10 : '') },
  ]);
}

export function StudentSummaryTable({ rows, threshold, belowOnly, onBelowOnly, fileStem, isFiltered, onReset }: StudentSummaryTableProps) {
  const navigate = useNavigate();
  const { batch } = useLookups();
  const [query, setQuery] = useState('');

  const visible = useMemo(
    () =>
      rows.filter(
        (r) => (!belowOnly || isBelowThreshold(r, threshold, REPORT_MIN_SESSIONS)) && matchesQuery(query, r.student.name, r.student.id),
      ),
    [rows, belowOnly, threshold, query],
  );

  const count = (key: 'P' | 'L' | 'A' | 'E', header: string, hideBelow?: Column<ReportStudentRow>['hideBelow']) => ({
    key,
    header,
    align: 'center' as const,
    hideBelow,
    className: 'tnum',
    sortValue: (r: ReportStudentRow) => r.counts[key],
    cell: (r: ReportStudentRow) => (
      <span className={key === 'A' && r.counts.A ? 'font-semibold text-error' : undefined}>{r.counts[key]}</span>
    ),
  });

  const columns: Column<ReportStudentRow>[] = [
    {
      key: 'name',
      header: 'Student',
      headerClassName: 'min-w-[200px]',
      sortValue: (r) => r.student.name,
      cell: ({ student: s }) => (
        <PersonCell name={s.name} subtitle={`${s.id} · ${s.grade}`} photoUrl={s.photoUrl} to={`/students/${s.id}`} size="sm" />
      ),
    },
    {
      key: 'batches',
      header: 'Batches',
      hideBelow: 'lg',
      className: 'whitespace-nowrap',
      cell: (r) => <BatchTags batchIds={r.batchIds} withSubject={false} />,
    },
    { key: 'sessions', header: 'Sessions', align: 'center', className: 'tnum', sortValue: (r) => r.sessions, cell: (r) => r.sessions },
    count('P', 'P'),
    count('L', 'L'),
    count('A', 'A'),
    count('E', 'E', 'xl'),
    {
      key: 'rate',
      header: 'Attendance',
      align: 'right',
      headerClassName: 'pr-space-md',
      className: 'pr-space-md',
      sortValue: pctValue,
      cell: (r) => <AttendancePctBadge ratio={r.rate} threshold={threshold} />,
    },
  ];

  const mobileCard = (r: ReportStudentRow) => (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-start justify-between gap-space-xs">
        <PersonCell name={r.student.name} subtitle={`${r.student.id} · ${r.student.grade}`} photoUrl={r.student.photoUrl} size="sm" />
        <AttendancePctBadge ratio={r.rate} threshold={threshold} />
      </div>
      <p className="font-body-sm text-body-sm text-secondary tnum">
        {r.sessions} sessions · <span className="text-on-surface">{r.counts.P} P</span> · {r.counts.L} L ·{' '}
        <span className={r.counts.A ? 'font-semibold text-error' : undefined}>{r.counts.A} A</span> · {r.counts.E} E
      </p>
      <BatchTags batchIds={r.batchIds} withSubject={false} />
    </div>
  );

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="card flex flex-col gap-space-sm p-space-sm sm:flex-row sm:items-center md:p-space-md">
        <SearchInput value={query} onChange={setQuery} placeholder="Search student name or ID…" containerClassName="min-w-0 flex-1" />
        <div className="flex items-center justify-between gap-space-md">
          <Switch checked={belowOnly} onChange={onBelowOnly} label={`Below ${threshold}% only`} />
          <Button
            variant="tonal"
            icon="download"
            disabled={!visible.length}
            onClick={() => exportStudentSummary(visible, fileStem, (id) => batch.get(id)?.name ?? id)}
          >
            Export CSV
          </Button>
        </div>
      </div>
      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(r) => r.student.id}
        onRowClick={(r) => navigate(`/students/${r.student.id}`)}
        rowClassName={(r) => (isBelowThreshold(r, threshold, REPORT_MIN_SESSIONS) ? 'bg-error-container/20' : undefined)}
        mobileCard={mobileCard}
        entityLabel="students"
        initialSort={{ key: 'rate', dir: 'asc' }}
        caption="Attendance summary per student"
        empty={
          <EmptyState
            icon="person_search"
            title={rows.length ? 'No students match' : 'No attendance in this period'}
            description={
              rows.length
                ? belowOnly
                  ? `Nobody is below ${threshold}% with at least ${REPORT_MIN_SESSIONS} sessions — great news.`
                  : 'Try a different search.'
                : 'No sessions were marked for this range and scope.'
            }
            action={
              isFiltered || belowOnly || query ? (
                <Button
                  variant="tonal"
                  icon="filter_alt_off"
                  onClick={() => {
                    setQuery('');
                    onReset();
                  }}
                >
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
