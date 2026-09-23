/**
 * Per-row quick actions from the roster design. The set adapts to fee state:
 *  - Overdue → solid "Notice" (urgent fee alert) + overflow menu
 *  - Pending → "Reminder" (SMS) + edit
 *  - Clear   → view profile, fee ledger, edit, archive
 */
import { useNavigate } from 'react-router-dom';
import type { Student } from '@/types/domain';
import type { StudentFeeSummary } from '@/domain/fees';
import { Icon, IconButton, Menu } from '@/components/ui';
import { useCan, useMoney } from '@/hooks/useTenant';
import { useUiStore, useToast } from '@/store/uiStore';
import { cn } from '@/lib/cn';

interface Props {
  student: Student;
  fee: StudentFeeSummary;
  onArchive: (student: Student) => void;
}

export function useFeeReminder() {
  const toast = useToast();
  const money = useMoney();
  return (student: Student, fee: StudentFeeSummary, urgent = false) =>
    toast({
      title: urgent ? `Fee notice sent to ${student.guardian.name}` : `Reminder sent to ${student.guardian.name}`,
      description: `${money.format(fee.outstanding)} outstanding · via SMS & WhatsApp to ${student.guardian.phone}`,
      tone: 'info',
    });
}

export function StudentQuickActions({ student, fee, onArchive }: Props) {
  const navigate = useNavigate();
  const can = useCan();
  const openModal = useUiStore((s) => s.openModal);
  const remind = useFeeReminder();
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const pill = (label: string, icon: string, urgent: boolean) => (
    <button
      type="button"
      title={urgent ? 'Urgent Fee Alert' : 'Send SMS reminder'}
      onClick={stop(() => remind(student, fee, urgent))}
      className={cn(
        'flex h-8 items-center gap-1 rounded px-2 text-[12px] font-semibold transition-all',
        urgent
          ? 'bg-primary text-on-primary hover:bg-primary-container'
          : 'bg-surface-container text-primary hover:bg-primary hover:text-on-primary',
      )}
    >
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );

  if (fee.status === 'Overdue') {
    return (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {pill('Notice', 'notification_important', true)}
        <Menu
          width="w-52"
          items={[
            { label: 'View profile', icon: 'visibility', onSelect: () => navigate(`/students/${student.id}`) },
            { label: 'Fee ledger', icon: 'receipt_long', onSelect: () => navigate(`/students/${student.id}?tab=fees`) },
            ...(can('fees.collect')
              ? [
                  {
                    label: 'Record payment',
                    icon: 'payments',
                    onSelect: () => openModal({ type: 'record-payment', studentId: student.id }),
                  },
                ]
              : []),
            ...(can('students.manage')
              ? [
                  { label: 'Edit student', icon: 'edit', onSelect: () => openModal({ type: 'student-form', studentId: student.id }) },
                  { label: 'Archive', icon: 'archive', tone: 'danger' as const, separator: true, onSelect: () => onArchive(student) },
                ]
              : []),
          ]}
          trigger={(props) => <IconButton {...props} icon="more_vert" label="Student settings" size="sm" />}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {fee.status === 'Pending' ? (
        pill('Reminder', 'sms', false)
      ) : (
        <>
          <IconButton icon="visibility" label="View Profile" size="sm" tone="primary" onClick={() => navigate(`/students/${student.id}`)} />
          <IconButton
            icon="receipt_long"
            label="Fee Ledger"
            size="sm"
            tone="primary"
            onClick={() => navigate(`/students/${student.id}?tab=fees`)}
          />
        </>
      )}
      {can('students.manage') && (
        <IconButton icon="edit" label="Edit Student" size="sm" onClick={() => openModal({ type: 'student-form', studentId: student.id })} />
      )}
      {can('students.manage') && fee.status === 'Paid' && (
        <IconButton icon="delete" label="Remove / Archive" size="sm" tone="danger" onClick={() => onArchive(student)} />
      )}
    </div>
  );
}
