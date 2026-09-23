/**
 * Student profile (/students/:studentId?tab=…).
 *
 * A header card (identity, guardian contact, actions) over five tabs kept in
 * the URL, so links such as the roster's "Fee ledger" (?tab=fees) open the
 * right view and survive refresh:
 *   overview · attendance · fees · performance · details
 * The fees and performance tabs follow the viewer's permissions; unknown IDs
 * get a not-found state with a way back to the roster.
 */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ButtonLink, EmptyState, Icon, Tabs, type TabItem } from '@/components/ui';
import { useCan } from '@/hooks/useTenant';
import { useDocumentTitle } from '@/hooks/ui';
import { AttendanceTab } from './profile/AttendanceTab';
import { DetailsTab } from './profile/DetailsTab';
import { FeesTab } from './profile/FeesTab';
import { OverviewTab } from './profile/OverviewTab';
import { PerformanceTab } from './profile/PerformanceTab';
import { ProfileHeader } from './profile/ProfileHeader';
import { useStudentProfile } from './profile/useStudentProfile';

type ProfileTab = 'overview' | 'attendance' | 'fees' | 'performance' | 'details';
const TAB_IDS: ProfileTab[] = ['overview', 'attendance', 'fees', 'performance', 'details'];

function LockedTab() {
  return (
    <div className="card">
      <EmptyState
        icon="lock"
        title="Not available for your role"
        description="Ask your institute administrator if you need access to this information."
      />
    </div>
  );
}

export default function StudentProfilePage() {
  const { studentId } = useParams();
  const [params, setParams] = useSearchParams();
  const can = useCan();
  const profile = useStudentProfile(studentId);
  const { student } = profile;
  useDocumentTitle(student?.name ?? 'Student not found');

  const requested = params.get('tab') as ProfileTab | null;
  const tab: ProfileTab = requested && TAB_IDS.includes(requested) ? requested : 'overview';
  const setTab = (next: ProfileTab) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'overview') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );

  if (!student) {
    return (
      <div className="card">
        <EmptyState
          icon="person_search"
          title="Student not found"
          description={
            <>
              No student matches <span className="font-semibold text-on-surface">{studentId}</span>. The record may have been removed, or
              the link is outdated.
            </>
          }
          action={
            <ButtonLink to="/students" variant="tonal" icon="arrow_back">
              Back to roster
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const items: TabItem<ProfileTab>[] = [
    { value: 'overview', label: 'Overview', icon: 'space_dashboard' },
    { value: 'attendance', label: 'Attendance', icon: 'fact_check', count: profile.sessionRows.length },
  ];
  if (can('fees.view')) items.push({ value: 'fees', label: 'Fees', icon: 'receipt_long', count: profile.fee.invoices.length });
  if (can('performance.view'))
    items.push({ value: 'performance', label: 'Performance', icon: 'trending_up', count: profile.scores.length });
  items.push({ value: 'details', label: 'Details', icon: 'badge' });

  return (
    <div className="flex flex-col gap-space-lg">
      <Link to="/students" className="inline-flex w-fit items-center gap-1 font-label-md text-label-md text-primary hover:underline">
        <Icon name="arrow_back" size={16} />
        Students roster
      </Link>

      <ProfileHeader student={student} fee={profile.fee} />

      <Tabs<ProfileTab> value={tab} onChange={setTab} items={items} ariaLabel="Student profile sections" />

      {tab === 'overview' && <OverviewTab student={student} profile={profile} />}
      {tab === 'attendance' && <AttendanceTab student={student} profile={profile} />}
      {tab === 'fees' && (can('fees.view') ? <FeesTab student={student} fee={profile.fee} /> : <LockedTab />)}
      {tab === 'performance' && (can('performance.view') ? <PerformanceTab student={student} profile={profile} /> : <LockedTab />)}
      {tab === 'details' && <DetailsTab student={student} />}
    </div>
  );
}
