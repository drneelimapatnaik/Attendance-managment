/** CSV exports for each Fee Management tab (exactly the rows currently filtered). */
import type { Batch, ID } from '@/types/domain';
import { exportCsv } from '@/lib/export';
import { formatDate, formatPeriod, today } from '@/lib/date';
import type { DueRow, InvoiceRow, PaymentRow } from './useFees';

const fileName = (institute: string, what: string) => `${institute.replace(/\s+/g, '-')}-${what}-${today()}`;

export function exportDues(rows: DueRow[], batchById: Map<ID, Batch>, institute: string) {
  exportCsv(fileName(institute, 'fee-dues'), rows, [
    { header: 'Student ID', value: (r) => r.student.id },
    { header: 'Name', value: (r) => r.student.name },
    { header: 'Grade', value: (r) => r.student.grade },
    { header: 'Batches', value: (r) => r.student.batchIds.map((id) => batchById.get(id)?.name ?? id).join('; ') },
    { header: 'Guardian', value: (r) => r.student.guardian.name },
    { header: 'Guardian Phone', value: (r) => r.student.guardian.phone },
    { header: 'Pending', value: (r) => r.fee.pending },
    { header: 'Overdue', value: (r) => r.fee.overdue },
    { header: 'Outstanding', value: (r) => r.fee.outstanding },
    { header: 'Max Days Overdue', value: (r) => r.maxDaysOverdue },
    { header: 'Unpaid Invoices', value: (r) => r.unpaid.map((v) => v.invoice.id).join('; ') },
    { header: 'Last Payment', value: (r) => formatDate(r.fee.lastPaymentOn) },
    { header: 'Status', value: (r) => r.fee.status },
  ]);
}

export function exportInvoices(rows: InvoiceRow[], institute: string) {
  exportCsv(fileName(institute, 'invoices'), rows, [
    { header: 'Invoice', value: (r) => r.view.invoice.id },
    { header: 'Student ID', value: (r) => r.view.invoice.studentId },
    { header: 'Student', value: (r) => r.student?.name },
    { header: 'Batch', value: (r) => r.batch?.name },
    { header: 'Period', value: (r) => formatPeriod(r.view.invoice.period) },
    { header: 'Description', value: (r) => r.view.invoice.description },
    { header: 'Issued', value: (r) => formatDate(r.view.invoice.issuedOn) },
    { header: 'Due', value: (r) => formatDate(r.view.invoice.dueDate) },
    { header: 'Amount', value: (r) => r.view.invoice.amount },
    { header: 'Paid', value: (r) => r.view.paid },
    { header: 'Balance', value: (r) => r.view.balance },
    { header: 'Status', value: (r) => (r.view.invoice.waived ? 'Waived' : r.view.status) },
  ]);
}

export function exportPayments(rows: PaymentRow[], institute: string) {
  exportCsv(fileName(institute, 'payments'), rows, [
    { header: 'Receipt No', value: (r) => r.payment.receiptNo },
    { header: 'Date', value: (r) => formatDate(r.payment.date) },
    { header: 'Student ID', value: (r) => r.payment.studentId },
    { header: 'Student', value: (r) => r.student?.name },
    { header: 'Invoice', value: (r) => r.payment.invoiceId },
    { header: 'Period', value: (r) => (r.invoice ? formatPeriod(r.invoice.period) : '') },
    { header: 'Amount', value: (r) => r.payment.amount },
    { header: 'Method', value: (r) => r.payment.method },
    { header: 'Reference', value: (r) => r.payment.reference },
    { header: 'Collected By', value: (r) => r.collector?.name },
  ]);
}
