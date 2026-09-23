/**
 * "New Entry" quick-create menu. Opens global modals (see src/app/GlobalModals.tsx)
 * or jumps to a workflow; items are filtered by the user's permissions.
 */
import { useNavigate } from 'react-router-dom';
import { Button, Menu, type MenuItem } from '@/components/ui';
import { useCan } from '@/hooks/useTenant';
import { useUiStore } from '@/store/uiStore';

export function NewEntryMenu() {
  const can = useCan();
  const navigate = useNavigate();
  const openModal = useUiStore((s) => s.openModal);

  const items: MenuItem[] = [
    can('students.manage') && {
      label: 'Add student',
      description: 'Admission & batch assignment',
      icon: 'person_add',
      onSelect: () => openModal({ type: 'student-form' }),
    },
    can('attendance.mark') && {
      label: 'Mark attendance',
      description: "Today's classes",
      icon: 'fact_check',
      onSelect: () => navigate('/attendance'),
    },
    can('fees.collect') && {
      label: 'Record payment',
      description: 'Collect fees & issue receipt',
      icon: 'payments',
      onSelect: () => openModal({ type: 'record-payment' }),
    },
    can('batches.manage') && {
      label: 'Create batch',
      description: 'Schedule, faculty & capacity',
      icon: 'domain_add',
      onSelect: () => openModal({ type: 'batch-form' }),
    },
    can('performance.manage') && {
      label: 'Record assessment',
      description: 'Test / quiz scores',
      icon: 'grading',
      onSelect: () => openModal({ type: 'assessment-form' }),
    },
    can('faculty.manage') && {
      label: 'Invite staff',
      description: 'Faculty, accountant, front desk',
      icon: 'badge',
      onSelect: () => openModal({ type: 'staff-form' }),
      separator: true,
    },
  ].filter(Boolean) as MenuItem[];

  if (!items.length) return null;
  return (
    <Menu
      width="w-72"
      items={items}
      trigger={(props) => (
        <>
          <Button {...props} icon="add_circle" className="hidden sm:inline-flex">
            New Entry
          </Button>
          <Button {...props} icon="add" aria-label="New entry" className="w-11 px-0 sm:hidden" />
        </>
      )}
    />
  );
}
