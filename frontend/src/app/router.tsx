/**
 * Route table. Pages are lazy-loaded (code-split per feature) and guarded:
 *   - <RequireAuth> redirects signed-out users to /login
 *   - <RequirePermission mode="page"> shows a no-access state per role
 *
 * Hash routing inside native shells (Capacitor/Tauri serve from a custom
 * origin without SPA fallbacks); clean browser URLs on the web.
 */
import { lazy, type ReactNode } from 'react';
import { createBrowserRouter, createHashRouter, Navigate, useLocation, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequirePermission } from '@/components/domain';
import { useSessionStore } from '@/store/sessionStore';
import { isNativeShell } from '@/lib/platform';
import type { Permission } from '@/types/domain';

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

function RequireAuth({ children }: { children: ReactNode }) {
  const userId = useSessionStore((s) => s.userId);
  const location = useLocation();
  if (!userId) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

const guard = (permission: Permission, element: ReactNode) => (
  <RequirePermission permission={permission} mode="page">
    {element}
  </RequirePermission>
);

const routes: RouteObject[] = [
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
];

export const router = isNativeShell() ? createHashRouter(routes) : createBrowserRouter(routes);
