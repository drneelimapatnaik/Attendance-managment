/**
 * Route table for both surfaces:
 *   /…        the institute console (staff)
 *   /portal/… the student & parent app
 *
 * Pages are lazy-loaded (code-split per feature) and guarded:
 *   - <RequireAuth> / <RequirePortalAuth> send signed-out visitors to the right
 *     sign-in screen, and bounce a principal that lands on the other surface
 *   - <RequirePermission mode="page"> shows a no-access state per staff role
 *   - <RequireParent> keeps fee screens away from student accounts
 *
 * Hash routing inside native shells (Capacitor/Tauri serve from a custom
 * origin without SPA fallbacks); clean browser URLs on the web.
 */
import { lazy, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, createHashRouter, Navigate, useLocation, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PortalShell } from '@/components/layout/PortalShell';
import { RequirePermission } from '@/components/domain';
import { useSessionStore } from '@/store/sessionStore';
import { usePortalAccount } from '@/hooks/usePortal';
import { signOutPortal } from '@/services/portalAuth';
import { isNativeShell } from '@/lib/platform';
import type { Permission } from '@/types/domain';

/* Staff console */
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const ClassAttendancePage = lazy(() => import('@/features/attendance/ClassAttendancePage'));
const AttendanceReportsPage = lazy(() => import('@/features/attendance/AttendanceReportsPage'));
const BatchesPage = lazy(() => import('@/features/batches/BatchesPage'));
const BatchDetailPage = lazy(() => import('@/features/batches/BatchDetailPage'));
const StudentsPage = lazy(() => import('@/features/students/StudentsPage'));
const StudentProfilePage = lazy(() => import('@/features/students/StudentProfilePage'));
const TopicCoveragePage = lazy(() => import('@/features/topics/TopicCoveragePage'));
const FeeManagementPage = lazy(() => import('@/features/fees/FeeManagementPage'));
const PerformancePage = lazy(() => import('@/features/performance/PerformancePage'));
const FacultyPage = lazy(() => import('@/features/faculty/FacultyPage'));
const InstituteSettingsPage = lazy(() => import('@/features/settings/InstituteSettingsPage'));
const NotFoundPage = lazy(() => import('@/features/misc/NotFoundPage'));

/* Student & parent app */
const PortalLoginPage = lazy(() => import('@/features/portal/PortalLoginPage'));
const PortalActivatePage = lazy(() => import('@/features/portal/PortalActivatePage'));
const PortalForgotPasswordPage = lazy(() => import('@/features/portal/PortalForgotPasswordPage'));
const PortalResetPasswordPage = lazy(() => import('@/features/portal/PortalResetPasswordPage'));
const PortalHomePage = lazy(() => import('@/features/portal/PortalHomePage'));
const PortalAttendancePage = lazy(() => import('@/features/portal/PortalAttendancePage'));
const PortalResultsPage = lazy(() => import('@/features/portal/PortalResultsPage'));
const PortalFeesPage = lazy(() => import('@/features/portal/PortalFeesPage'));
const PortalSyllabusPage = lazy(() => import('@/features/portal/PortalSyllabusPage'));
const PortalTimetablePage = lazy(() => import('@/features/portal/PortalTimetablePage'));
const PortalProfilePage = lazy(() => import('@/features/portal/PortalProfilePage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const userId = useSessionStore((s) => s.userId);
  const portalAccountId = useSessionStore((s) => s.portalAccountId);
  const location = useLocation();
  if (portalAccountId) return <Navigate to="/portal" replace />;
  if (!userId) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequirePortalAuth({ children }: { children: ReactNode }) {
  const userId = useSessionStore((s) => s.userId);
  const portalAccountId = useSessionStore((s) => s.portalAccountId);
  const account = usePortalAccount();
  const location = useLocation();
  // Access revoked (or the account removed) while the session was open → end it.
  const revoked = !!portalAccountId && (!account || account.status === 'Disabled');
  useEffect(() => {
    if (revoked) signOutPortal();
  }, [revoked]);

  if (userId) return <Navigate to="/dashboard" replace />;
  if (!portalAccountId || revoked) return <Navigate to="/portal/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Fees are visible to parents only. */
function RequireParent({ children }: { children: ReactNode }) {
  const account = usePortalAccount();
  if (account && account.role !== 'parent') return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

const guard = (permission: Permission, element: ReactNode) => (
  <RequirePermission permission={permission} mode="page">
    {element}
  </RequirePermission>
);

const routes: RouteObject[] = [
  /* Staff console -------------------------------------------------------- */
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: guard('dashboard.view', <DashboardPage />) },
      { path: 'attendance', element: guard('attendance.mark', <ClassAttendancePage />) },
      { path: 'batches', element: guard('batches.view', <BatchesPage />) },
      { path: 'batches/:batchId', element: guard('batches.view', <BatchDetailPage />) },
      { path: 'students', element: guard('students.view', <StudentsPage />) },
      { path: 'students/:studentId', element: guard('students.view', <StudentProfilePage />) },
      { path: 'topics', element: guard('topics.manage', <TopicCoveragePage />) },
      { path: 'fees', element: guard('fees.view', <FeeManagementPage />) },
      { path: 'reports/attendance', element: guard('attendance.reports', <AttendanceReportsPage />) },
      { path: 'reports/performance', element: guard('performance.view', <PerformancePage />) },
      { path: 'faculty', element: guard('faculty.manage', <FacultyPage />) },
      { path: 'settings', element: guard('settings.manage', <InstituteSettingsPage />) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },

  /* Student & parent app -------------------------------------------------- */
  { path: '/portal/login', element: <PortalLoginPage /> },
  { path: '/portal/activate', element: <PortalActivatePage /> },
  { path: '/portal/forgot', element: <PortalForgotPasswordPage /> },
  { path: '/portal/reset', element: <PortalResetPasswordPage /> },
  {
    path: '/portal',
    element: (
      <RequirePortalAuth>
        <PortalShell />
      </RequirePortalAuth>
    ),
    children: [
      { index: true, element: <PortalHomePage /> },
      { path: 'attendance', element: <PortalAttendancePage /> },
      { path: 'results', element: <PortalResultsPage /> },
      {
        path: 'fees',
        element: (
          <RequireParent>
            <PortalFeesPage />
          </RequireParent>
        ),
      },
      { path: 'syllabus', element: <PortalSyllabusPage /> },
      { path: 'timetable', element: <PortalTimetablePage /> },
      { path: 'profile', element: <PortalProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = isNativeShell() ? createHashRouter(routes) : createBrowserRouter(routes);
