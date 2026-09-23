/** CSV export of roster rows ("Export Excel" in the design). */
import { exportCsv } from '@/lib/export';
import { formatDate, today } from '@/lib/date';
import type { Batch, ID } from '@/types/domain';
import type { RosterRow } from './useRoster';

export function exportRoster(rows: RosterRow[], batchById: Map<ID, Batch>, instituteName: string) {
  exportCsv(`${instituteName.replace(/\s+/g, '-')}-students-${today()}`, rows, [
    { header: 'Student ID', value: (r) => r.student.id },
    { header: 'Card No', value: (r) => r.student.cardNo },
    { header: 'Name', value: (r) => r.student.name },
    { header: 'Gender', value: (r) => r.student.gender },
    { header: 'Date of Birth', value: (r) => formatDate(r.student.dob) },
    { header: 'Grade', value: (r) => r.student.grade },
    { header: 'Section', value: (r) => r.student.section },
    { header: 'Guardian', value: (r) => r.student.guardian.name },
    { header: 'Guardian Phone', value: (r) => r.student.guardian.phone },
    { header: 'Batches', value: (r) => r.student.batchIds.map((id) => batchById.get(id)?.name ?? id).join('; ') },
    { header: 'Joining Date', value: (r) => formatDate(r.student.joiningDate) },
    { header: 'Fee Status', value: (r) => r.fee.status },
    { header: 'Outstanding', value: (r) => r.fee.outstanding },
    { header: 'Status', value: (r) => r.student.status },
  ]);
}
