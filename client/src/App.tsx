import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminApplicationDetail from "./pages/AdminApplicationDetail";
import AdminWorkers from "./pages/AdminWorkers";
import AdminTasks from "./pages/AdminTasks";
import AdminDocuments from "./pages/AdminDocuments";
import AdminAgency from "./pages/AdminAgency";
import AdminClients from "./pages/AdminClients";
import AdminClientDetail from "./pages/AdminClientDetail";
import AdminDuplicates from "./pages/AdminDuplicates";
import AdminAssessmentReport from "./pages/AdminAssessmentReport";
import AdminNotifications from "./pages/AdminNotifications";
import AdminAuditLog from "./pages/AdminAuditLog";
import { usePageViewLogger } from "./hooks/usePageViewLogger";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import AdminReferrals from "./pages/AdminReferrals";
import ReferrerPortal from "./pages/ReferrerPortal";
import AssessorPortal from "./pages/AssessorPortal";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AdminEmailBlast from "./pages/AdminEmailBlast";
import AdminChatInbox from "./pages/AdminChatInbox";
import AdminOrganizations from "./pages/AdminOrganizations";
import AdminOrgChats from "./pages/AdminOrgChats";
import OrgPortal from "./pages/OrgPortal";
import OrgNotifications from "./pages/OrgNotifications";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import ComplianceDashboard from "./pages/compliance/ComplianceDashboard";
import RequirementsLibrary from "./pages/compliance/RequirementsLibrary";
import ComplianceClientPanel from "./pages/compliance/ComplianceClientPanel";
import AuditWorkspace from "./pages/compliance/AuditWorkspace";
import GuidanceLibrary from "./pages/compliance/GuidanceLibrary";
import ComplianceReports from "./pages/compliance/ComplianceReports";
import MfaSettings from "./pages/compliance/MfaSettings";
import SessionSettings from "./pages/compliance/SessionSettings";

function Router() {
  usePageViewLogger();
  return (
    <Switch>
      {/* Public */}
      <Route path={"/"} component={Home} />
      <Route path={"/privacy"} component={PrivacyPolicy} />

      {/* Admin */}
      <Route path={"/admin"} component={AdminLogin} />
      <Route path={"/admin/login"} component={AdminLogin} />
      <Route path={"/admin/forgot-password"} component={ForgotPassword} />
      <Route path={"/admin/reset-password"} component={ResetPassword} />
      <Route path={"/admin/dashboard"} component={AdminDashboard} />
      <Route path={"/admin/application/:id"} component={AdminApplicationDetail} />
      <Route path={"/admin/workers"} component={AdminWorkers} />
      <Route path={"/admin/tasks"} component={AdminTasks} />
      <Route path={"/admin/documents"} component={AdminDocuments} />
      <Route path={"/admin/agency"} component={AdminAgency} />
      <Route path={"/admin/clients"} component={AdminClients} />
      <Route path={"/admin/clients/:id"} component={AdminClientDetail} />
      <Route path={"/admin/referrals"} component={AdminReferrals} />
      <Route path={"/admin/duplicates"} component={AdminDuplicates} />
      <Route path={"/admin/assessment-report"} component={AdminAssessmentReport} />
      <Route path={"/admin/notifications"} component={AdminNotifications} />
      <Route path={"/admin/audit-log"} component={AdminAuditLog} />
      <Route path={"/admin/email-blast"} component={AdminEmailBlast} />
      <Route path={"/admin/chat"} component={AdminChatInbox} />
      <Route path={"/admin/organizations"} component={AdminOrganizations} />
      <Route path={"/admin/org-chats"} component={AdminOrgChats} />

      {/* Compliance & Audit module (feature-flagged; nav hidden unless enabled) */}
      <Route path={"/admin/compliance"} component={ComplianceDashboard} />
      <Route path={"/admin/compliance/requirements"} component={RequirementsLibrary} />
      <Route path={"/admin/compliance/audits"} component={AuditWorkspace} />
      <Route path={"/admin/compliance/guidance"} component={GuidanceLibrary} />
      <Route path={"/admin/compliance/reports"} component={ComplianceReports} />
      <Route path={"/admin/compliance/mfa"} component={MfaSettings} />
      <Route path={"/admin/compliance/sessions"} component={SessionSettings} />
      <Route path={"/admin/compliance/clients/:id"} component={ComplianceClientPanel} />

      {/* Referrer Portal */}
      <Route path={"/referrer"} component={ReferrerPortal} />

      {/* Assessor Portal */}
      <Route path={"/assessor"} component={AssessorPortal} />
      <Route path={"/assessor/clients/:id"} component={AdminClientDetail} />

      {/* Organization Portal */}
      <Route path={"/org"} component={OrgPortal} />
      <Route path={"/org/clients/:id"} component={AdminClientDetail} />
      <Route path={"/org/notifications"} component={OrgNotifications} />

      {/* Fallback */}
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <ImpersonationBanner />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
