/** CSV exports for the Performance tabs (the rows currently in view). */
import type { Batch, ID } from '@/types/domain';
import { exportCsv } from '@/lib/export';
import { formatDate, today } from '@/lib/date';
import { formatPercent } from '@/lib/format';
import type { AssessmentRow, StudentPerfRow } from './usePerformance';

const fileName = (institute: string, what: string) => `${institute.replace(/\s+/g, '-')}-${what}-${today()}`;

export function exportAssessments(rows: AssessmentRow[], institute: string) {
  exportCsv(fileName(institute, 'assessments'), rows, [
    { header: 'Assessment', value: (r) => r.assessment.title },
    { header: 'Batch', value: (r) => r.batch?.name },
    { header: 'Type', value: (r) => r.assessment.type },
    { header: 'Date', value: (r) => formatDate(r.assessment.date) },
    { header: 'Max Marks', value: (r) => r.assessment.maxMarks },
    { header: 'Appeared', value: (r) => r.stats.appeared },
    { header: 'Absent', value: (r) => r.stats.absent },
    { header: 'Average %', value: (r) => formatPercent(r.stats.average, 1) },
    { header: 'Pass Rate %', value: (r) => formatPercent(r.stats.passRate, 1) },
    { header: 'Highest', value: (r) => r.stats.highest },
    { header: 'Lowest', value: (r) => r.stats.lowest },
  ]);
}

export function exportStudentPerformance(rows: StudentPerfRow[], batchById: Map<ID, Batch>, institute: string) {
  exportCsv(fileName(institute, 'student-performance'), rows, [
    { header: 'Student ID', value: (r) => r.student.id },
    { header: 'Name', value: (r) => r.student.name },
    { header: 'Grade', value: (r) => r.student.grade },
    { header: 'Batches', value: (r) => r.student.batchIds.map((id) => batchById.get(id)?.name ?? id).join('; ') },
    { header: 'Assessments', value: (r) => r.taken },
    { header: 'Average %', value: (r) => formatPercent(r.avg, 1) },
    { header: 'Grade Band', value: (r) => r.band },
    { header: 'Last 5 Scores %', value: (r) => r.recent.map((v) => Math.round(v * 100)).join(' → ') },
    { header: 'Attendance 30d %', value: (r) => formatPercent(r.attendance, 1) },
    { header: 'Needs Attention', value: (r) => (r.needsAttention ? 'Yes' : 'No') },
  ]);
}
