/**
 * Global modal host. Renders the form requested via `useUiStore.openModal()`
 * so any screen — or the top bar's "New Entry" menu — can open feature forms.
 * Forms are lazy-loaded to keep the initial bundle small.
 */
import { lazy, Suspense } from 'react';
import { useUiStore } from '@/store/uiStore';

const StudentFormModal = lazy(() => import('@/features/students/StudentFormModal'));
const BatchFormModal = lazy(() => import('@/features/batches/BatchFormModal'));
const RecordPaymentModal = lazy(() => import('@/features/fees/RecordPaymentModal'));
const AssessmentFormModal = lazy(() => import('@/features/performance/AssessmentFormModal'));
const StaffFormModal = lazy(() => import('@/features/faculty/StaffFormModal'));

export function GlobalModals() {
  const modal = useUiStore((s) => s.modal);
  const close = useUiStore((s) => s.closeModal);
  if (!modal) return null;
  return (
    <Suspense fallback={null}>
      {modal.type === 'student-form' && <StudentFormModal open onClose={close} studentId={modal.studentId} batchId={modal.batchId} />}
      {modal.type === 'batch-form' && <BatchFormModal open onClose={close} batchId={modal.batchId} />}
      {modal.type === 'record-payment' && (
        <RecordPaymentModal open onClose={close} studentId={modal.studentId} invoiceId={modal.invoiceId} />
      )}
      {modal.type === 'assessment-form' && (
        <AssessmentFormModal open onClose={close} batchId={modal.batchId} assessmentId={modal.assessmentId} />
      )}
      {modal.type === 'staff-form' && <StaffFormModal open onClose={close} staffId={modal.staffId} />}
    </Suspense>
  );
}
