/**
 * "Register" tab of Attendance Reports: the classic paper register for one
 * batch — students down the side, session dates across the top (the last
 * 20 sessions in the chosen range), a P / L / A / E letter in each cell
 * tinted by mark (letter + colour, never colour alone).
 *
 * The grid scrolls inside a bounded box so both the date header and the
 * student-name column stay pinned; on phones it scrolls horizontally.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { AttendanceMark, AttendanceSession, Batch, ID, Student } from '@/types/domain';
import { Button, Card, CardHeader, EmptyState, SelectField } from '@/components/ui';
import { AttendancePctBadge } from '@/components/domain';
import { useLookups, useScopedData, useSettings } from '@/hooks/useTenant';
import { attendanceRate, countRecords, emptyCounts, addMark, MARK_LABELS, rollFor } from '@/domain/attendance';
import { formatDate, parseISODate, weekdayOf } from '@/lib/date';
import { exportCsv } from '@/lib/export';
import { cn } from '@/lib/cn';
import { MARK_ORDER } from '../attendanceStats';
import { MARK_SOFT } from './markStyles';

const MAX_SESSIONS = 20;

interface AttendanceRegisterProps {
  batch?: Batch;
  /** Sessions already filtered to the report's window (any batch). */
  sessions: AttendanceSession[];
  windowTo: string;
  batchOptions: Batch[];
  onPickBatch: (id: ID) => void;
  fileStem: string;
}

interface RegisterRow {
  student: Student;
  marks: (AttendanceMark | undefined)[];
  rate: number;
}

export function AttendanceRegister({ batch, sessions, windowTo, batchOptions, onPickBatch, fileStem }: AttendanceRegisterProps) {
  const settings = useSettings();
  const { students } = useScopedData();
  const lookups = useLookups();
  const threshold = settings.attendance.lowAttendanceThreshold;
  const lateAsPresent = settings.attendance.countLateAsPresent;

  const register = useMemo(() => {
    if (!batch) return null;
    const all = sessions.filter((s) => s.batchId === batch.id).sort((a, b) => a.date.localeCompare(b.date));
    const shown = all.slice(-MAX_SESSIONS);
    // Everyone recorded in these sessions, plus today's roll (so new joiners show up with blank history).
    const ids = new Set<ID>(rollFor(batch, students, windowTo).map((s) => s.id));
    for (const s of shown) for (const id of Object.keys(s.records)) ids.add(id);
    const rows: RegisterRow[] = [...ids]
      .map((id) => lookups.student.get(id))
      .filter((s): s is Student => !!s)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((student) => {
        const marks = shown.map((s) => s.records[student.id]);
        const c = emptyCounts();
        marks.forEach((m) => m && addMark(c, m));
        return { student, marks, rate: attendanceRate(c, lateAsPresent) };
      });
    const sessionRates = shown.map((s) => attendanceRate(countRecords(s.records), lateAsPresent));
    return { total: all.length, shown, rows, sessionRates };
  }, [batch, sessions, students, lookups.student, windowTo, lateAsPresent]);

  const picker = (
    <SelectField
      aria-label="Batch for the register"
      value={batch?.id ?? ''}
      onChange={(e) => e.target.value && onPickBatch(e.target.value)}
      placeholder="Choose a batch…"
      options={batchOptions.map((b) => ({ value: b.id, label: `${b.name} · ${b.title}` }))}
      containerClassName="w-full sm:w-72"
    />
  );

  if (!batch || !register) {
    return (
      <Card>
        <EmptyState
          icon="table_chart"
          title="Pick a batch to open its register"
          description="The register shows every student against each class date, like the paper roll book."
          action={<div className="w-full max-w-xs">{picker}</div>}
        />
      </Card>
    );
  }

  const exportRegister = () =>
    exportCsv(`${fileStem}-${batch.code}-register`, register.rows, [
      { header: 'Student ID', value: (r) => r.student.id },
      { header: 'Name', value: (r) => r.student.name },
      ...register.shown.map((s, i) => ({ header: s.date, value: (r: RegisterRow) => r.marks[i] ?? '' })),
      { header: 'Attendance %', value: (r) => (Number.isFinite(r.rate) ? Math.round(r.rate * 1000) / 10 : '') },
    ]);

  return (
    <Card className="flex flex-col gap-space-md">
      <CardHeader
        title={`Register · ${batch.name}`}
        icon="table_chart"
        subtitle={
          register.total > register.shown.length
            ? `${batch.title} · last ${register.shown.length} of ${register.total} sessions in range`
            : `${batch.title} · ${register.shown.length} sessions in range`
        }
      />
      <div className="flex flex-col gap-space-xs sm:flex-row sm:items-center sm:justify-between">
        {picker}
        <Button variant="tonal" icon="download" onClick={exportRegister} disabled={!register.shown.length}>
          Export register
        </Button>
      </div>

      {register.shown.length === 0 ? (
        <EmptyState
          compact
          icon="event_busy"
          title="No sessions in this range"
          description="Widen the date range to see this batch's register."
        />
      ) : (
        <>
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-outline-variant/40">
            <table className="w-max min-w-full border-separate border-spacing-0 text-left">
              <caption className="sr-only">
                Attendance register for {batch.name}, {formatDate(register.shown[0].date)} to{' '}
                {formatDate(register.shown[register.shown.length - 1].date)}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="th sticky left-0 top-0 z-30 min-w-[9.5rem] border-b border-r border-outline-variant/40 bg-surface-container-low sm:min-w-[13rem]"
                  >
                    Student
                  </th>
                  {register.shown.map((s) => {
                    const d = parseISODate(s.date);
                    return (
                      <th
                        key={s.id}
                        scope="col"
                        title={formatDate(s.date)}
                        className="sticky top-0 z-20 border-b border-outline-variant/40 bg-surface-container-low px-0.5 py-space-2xs text-center"
                      >
                        <span className="block font-label-sm text-label-sm uppercase text-secondary">{weekdayOf(s.date).slice(0, 2)}</span>
                        <span className="block font-label-md text-label-md text-on-surface tnum">{d.getDate()}</span>
                        <span className="block font-body-sm text-[10px] leading-3 text-secondary">
                          {d.toLocaleString('en', { month: 'short' })}
                        </span>
                      </th>
                    );
                  })}
                  <th
                    scope="col"
                    className="th sticky top-0 z-20 border-b border-l border-outline-variant/40 bg-surface-container-low text-right"
                  >
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {register.rows.map((r) => (
                  <tr key={r.student.id} className="group">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[9.5rem] border-b border-r border-outline-variant/30 bg-surface-container-lowest px-space-sm py-1 font-normal group-hover:bg-surface-container-low sm:max-w-[13rem]"
                    >
                      <Link
                        to={`/students/${r.student.id}`}
                        className="block truncate font-label-md text-label-md text-on-surface hover:text-primary hover:underline"
                      >
                        {r.student.name}
                      </Link>
                      <span className="block font-body-sm text-[10px] leading-3 text-secondary tnum">{r.student.id}</span>
                    </th>
                    {r.marks.map((m, i) => (
                      <td
                        key={register.shown[i].id}
                        className="border-b border-outline-variant/30 px-0.5 py-1 text-center group-hover:bg-surface-container-low/60"
                      >
                        {m ? (
                          <span
                            title={`${formatDate(register.shown[i].date)}: ${MARK_LABELS[m]}`}
                            className={cn(
                              'inline-flex h-7 w-7 items-center justify-center rounded-md font-label-md text-label-md',
                              MARK_SOFT[m],
                            )}
                          >
                            {m}
                          </span>
                        ) : (
                          <span className="inline-flex h-7 w-7 items-center justify-center text-outline" title="Not on the roll">
                            ·
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="border-b border-l border-outline-variant/30 px-space-xs py-1 text-right">
                      <AttendancePctBadge ratio={r.rate} threshold={threshold} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="sticky bottom-0 left-0 z-30 border-r border-t border-outline-variant/40 bg-surface-container-low px-space-sm py-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-secondary"
                  >
                    Class attendance
                  </th>
                  {register.sessionRates.map((rate, i) => (
                    <td
                      key={register.shown[i].id}
                      className={cn(
                        'sticky bottom-0 z-20 border-t border-outline-variant/40 bg-surface-container-low px-0.5 py-space-2xs text-center font-label-sm text-label-sm tnum',
                        Number.isFinite(rate) && rate * 100 < threshold ? 'text-error' : 'text-on-surface-variant',
                      )}
                    >
                      {Number.isFinite(rate) ? Math.round(rate * 100) : '—'}
                    </td>
                  ))}
                  <td className="sticky bottom-0 z-20 border-l border-t border-outline-variant/40 bg-surface-container-low" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-space-md gap-y-1" aria-label="Legend">
            {MARK_ORDER.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary">
                <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded font-label-sm text-label-sm', MARK_SOFT[m])}>
                  {m}
                </span>
                {MARK_LABELS[m]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-secondary">
              <span className="inline-flex h-5 w-5 items-center justify-center text-outline">·</span>
              Not on roll
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
