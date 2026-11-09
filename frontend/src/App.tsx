import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth, RequireRole } from './auth/guards';
import { useAuth } from './auth/AuthProvider';
import { HOME_BY_ROLE } from './lib/constants';
import { AppLayout } from './components/layout/AppLayout';

import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

import { StudentDashboardPage } from './pages/student/DashboardPage';
import { EligibilityPage } from './pages/student/EligibilityPage';
import { PlansPage } from './pages/student/PlansPage';
import { PlanDetailPage } from './pages/student/PlanDetailPage';
import { StandingPage } from './pages/student/StandingPage';
import { EarlyWarningPage } from './pages/student/EarlyWarningPage';
import { GraduationPage } from './pages/student/GraduationPage';
import { GpaSimulatorPage } from './pages/student/GpaSimulatorPage';
import { WhatIfPage } from './pages/student/WhatIfPage';
import { CoursesPage } from './pages/student/CoursesPage';
import { StudentAdvisorPage } from './pages/student/StudentAdvisorPage';
import { ChatPage } from './pages/student/ChatPage';
import { NotificationsPage } from './pages/student/NotificationsPage';

import { AdvisorDashboardPage } from './pages/advisor/AdvisorDashboardPage';
import { AdvisorStudentsPage } from './pages/advisor/AdvisorStudentsPage';
import { AdvisorStudentDetailPage } from './pages/advisor/StudentDetailPage';
import { AtRiskPage } from './pages/advisor/AtRiskPage';
import { AdvisorPlansPage } from './pages/advisor/PlansReviewPage';
import { AdvisorOfficeHoursPage } from './pages/advisor/OfficeHoursPage';
import { AdvisorEscalationsPage } from './pages/advisor/EscalationsPage';

import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage';
import { AdminStudentDetailPage } from './pages/admin/AdminStudentDetailPage';
import { AdminAdvisorsPage } from './pages/admin/AdminAdvisorsPage';
import { AdminDepartmentsPage } from './pages/admin/AdminDepartmentsPage';
import { AdminCoursesPage } from './pages/admin/AdminCoursesPage';
import { AdminCourseDetailPage } from './pages/admin/AdminCourseDetailPage';
import { AdminAnomaliesPage } from './pages/admin/AdminAnomaliesPage';
import { AdminAnomalyDetailPage } from './pages/admin/AdminAnomalyDetailPage';
import { AdminRulesPage } from './pages/admin/AdminRulesPage';
import { AdminRuleDetailPage } from './pages/admin/AdminRuleDetailPage';
import { AdminEscalationsPage } from './pages/admin/AdminEscalationsPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage';
import { AdminImportsPage } from './pages/admin/AdminImportsPage';
import { AdminImportDetailPage } from './pages/admin/AdminImportDetailPage';

import { SettingsPage } from './pages/SettingsPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { NotFoundPage } from './pages/NotFoundPage';

function HomeRedirect() {
  const { status, user } = useAuth();
  if (status === 'bootstrapping') return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
}

function LayoutRoute() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route path="/403" element={<ForbiddenPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<LayoutRoute />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route element={<RequireRole roles={['student']} />}>
            <Route path="/student" element={<StudentDashboardPage />} />
            <Route path="/student/eligibility" element={<EligibilityPage />} />
            <Route path="/student/plans" element={<PlansPage />} />
            <Route path="/student/plans/:id" element={<PlanDetailPage />} />
            <Route path="/student/standing" element={<StandingPage />} />
            <Route path="/student/early-warning" element={<EarlyWarningPage />} />
            <Route path="/student/graduation" element={<GraduationPage />} />
            <Route path="/student/gpa" element={<GpaSimulatorPage />} />
            <Route path="/student/what-if" element={<WhatIfPage />} />
            <Route path="/student/courses" element={<CoursesPage />} />
            <Route path="/student/advisor" element={<StudentAdvisorPage />} />
            <Route path="/student/chat" element={<ChatPage />} />
            <Route path="/student/notifications" element={<NotificationsPage />} />
          </Route>

          <Route element={<RequireRole roles={['advisor']} />}>
            <Route path="/advisor" element={<AdvisorDashboardPage />} />
            <Route path="/advisor/students" element={<AdvisorStudentsPage />} />
            <Route path="/advisor/students/:id" element={<AdvisorStudentDetailPage />} />
            <Route path="/advisor/at-risk" element={<AtRiskPage />} />
            <Route path="/advisor/plans" element={<AdvisorPlansPage />} />
            <Route path="/advisor/office-hours" element={<AdvisorOfficeHoursPage />} />
            <Route path="/advisor/escalations" element={<AdvisorEscalationsPage />} />
          </Route>

          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin" element={<AdminOverviewPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/students" element={<AdminStudentsPage />} />
            <Route path="/admin/students/:id" element={<AdminStudentDetailPage />} />
            <Route path="/admin/advisors" element={<AdminAdvisorsPage />} />
            <Route path="/admin/departments" element={<AdminDepartmentsPage />} />
            <Route path="/admin/courses" element={<AdminCoursesPage />} />
            <Route path="/admin/courses/:id" element={<AdminCourseDetailPage />} />
            <Route path="/admin/anomalies" element={<AdminAnomaliesPage />} />
            <Route path="/admin/anomalies/:id" element={<AdminAnomalyDetailPage />} />
            <Route path="/admin/rules" element={<AdminRulesPage />} />
            <Route path="/admin/rules/:code" element={<AdminRuleDetailPage />} />
            <Route path="/admin/escalations" element={<AdminEscalationsPage />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />
            <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
            <Route path="/admin/imports" element={<AdminImportsPage />} />
            <Route path="/admin/imports/:id" element={<AdminImportDetailPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
