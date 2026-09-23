/**
 * Faculty & Roles (/faculty — owners and admins; guarded in app/router.tsx).
 *
 * Tabs, kept in the URL (?tab=staff|roles|workload):
 *  - Staff     directory with filters, invite/edit, activate/deactivate, remove
 *  - Roles     read-only permission matrix per role
 *  - Workload  teaching hours, classes held and attendance-marking compliance
 *
 * Global search links here with ?staff=ID to highlight one member.
 */
import { useSearchParams } from 'react-router-dom';
import { Button, PageHeader, Tabs } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/ui';
import { useDataStore } from '@/store/dataStore';
import { useUiStore } from '@/store/uiStore';
import { RolesMatrix } from './components/RolesMatrix';
import { StaffDirectory } from './components/StaffDirectory';
import { WorkloadPanel } from './components/WorkloadPanel';

type FacultyTab = 'staff' | 'roles' | 'workload';
const TAB_IDS: FacultyTab[] = ['staff', 'roles', 'workload'];

export default function FacultyPage() {
  useDocumentTitle('Faculty & Roles');
  const [params, setParams] = useSearchParams();
  const openModal = useUiStore((s) => s.openModal);
  const staff = useDataStore((s) => s.staff);

  const requested = params.get('tab') as FacultyTab | null;
  const tab: FacultyTab = requested && TAB_IDS.includes(requested) ? requested : 'staff';
  const setTab = (next: FacultyTab) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'staff') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );

  const active = staff.filter((s) => s.status === 'Active').length;
  const invited = staff.filter((s) => s.status === 'Invited').length;

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        eyebrow="Settings"
        title="Faculty & Roles"
        meta={`${active} active${invited ? ` · ${invited} invited` : ''}`}
        description="Invite teachers and office staff, choose what each role can do and keep teaching load balanced."
        actions={
          <Button icon="person_add" onClick={() => openModal({ type: 'staff-form' })}>
            Invite Staff
          </Button>
        }
      />

      <Tabs<FacultyTab>
        value={tab}
        onChange={setTab}
        ariaLabel="Faculty views"
        items={[
          { value: 'staff', label: 'Staff', icon: 'badge', count: staff.length },
          { value: 'roles', label: 'Roles & permissions', icon: 'admin_panel_settings' },
          { value: 'workload', label: 'Workload', icon: 'monitoring' },
        ]}
      />

      {tab === 'staff' && <StaffDirectory />}
      {tab === 'roles' && <RolesMatrix />}
      {tab === 'workload' && <WorkloadPanel />}
    </div>
  );
}
