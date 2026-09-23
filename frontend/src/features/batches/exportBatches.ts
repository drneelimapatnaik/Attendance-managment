/** CSV export of the (filtered) batch list — opens directly in Excel / Sheets. */
import type { Campus } from '@/types/domain';
import { exportCsv } from '@/lib/export';
import { today } from '@/lib/date';
import type { BatchRow } from './useBatches';
import { sortDays } from './schedule';

const pct = (ratio: number) => (Number.isFinite(ratio) ? Math.round(ratio * 100) : '');

export function exportBatches(rows: BatchRow[], campuses: Campus[], instituteName: string): void {
  const campus = new Map(campuses.map((c) => [c.id, c.name]));
  exportCsv(`${instituteName.replace(/\s+/g, '-')}-batches-${today()}`, rows, [
    { header: 'Code', value: (r) => r.batch.code },
    { header: 'Batch', value: (r) => r.batch.name },
    { header: 'Title', value: (r) => r.batch.title },
    { header: 'Subject', value: (r) => r.subject?.name },
    { header: 'Grade', value: (r) => r.batch.grade },
    { header: 'Days', value: (r) => sortDays(r.batch.days).join(' ') },
    { header: 'Start', value: (r) => r.batch.startTime },
    { header: 'End', value: (r) => r.batch.endTime },
    { header: 'Faculty', value: (r) => r.faculty?.name },
    { header: 'Room', value: (r) => r.batch.room },
    { header: 'Campus', value: (r) => campus.get(r.batch.campusId) },
    { header: 'Enrolled', value: (r) => r.m.enrolled },
    { header: 'Capacity', value: (r) => r.batch.capacity },
    { header: 'Monthly fee', value: (r) => r.batch.monthlyFee },
    { header: 'Attendance % (30 days)', value: (r) => pct(r.m.attendance) },
    { header: 'Syllabus %', value: (r) => pct(r.m.coverage.ratio) },
    { header: 'Status', value: (r) => r.batch.status },
    { header: 'Start date', value: (r) => r.batch.startDate },
  ]);
}
