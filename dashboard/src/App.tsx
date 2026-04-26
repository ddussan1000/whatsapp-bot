import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { AuthGuard } from "./components/AuthGuard";
import { AdminGuard } from "./components/AdminGuard";
import { AdminLayout } from "./layout/AdminLayout";

const HomePage = lazy(() =>
  import("./pages/HomePage").then((m) => ({ default: m.HomePage }))
);
const ConversationsPage = lazy(() =>
  import("./pages/ConversationsPage").then((m) => ({
    default: m.ConversationsPage,
  }))
);
const ConversationDetailPage = lazy(() =>
  import("./pages/ConversationDetailPage").then((m) => ({
    default: m.ConversationDetailPage,
  }))
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage }))
);
const OrganizationPage = lazy(() =>
  import("./pages/OrganizationPage").then((m) => ({
    default: m.OrganizationPage,
  }))
);
const FlowsPage = lazy(() =>
  import("./pages/FlowsPage").then((m) => ({ default: m.FlowsPage }))
);
const TemplatesPage = lazy(() =>
  import("./pages/TemplatesPage").then((m) => ({ default: m.TemplatesPage }))
);
const InstancesPage = lazy(() =>
  import("./pages/InstancesPage").then((m) => ({ default: m.InstancesPage }))
);
const InstanceCreatePage = lazy(() =>
  import("./pages/InstanceCreatePage").then((m) => ({
    default: m.InstanceCreatePage,
  }))
);
const MediaPage = lazy(() =>
  import("./pages/MediaPage").then((m) => ({ default: m.MediaPage }))
);
const ConfigPage = lazy(() =>
  import("./pages/ConfigPage").then((m) => ({ default: m.ConfigPage }))
);
const InstructionsPage = lazy(() =>
  import("./pages/InstructionsPage").then((m) => ({
    default: m.InstructionsPage,
  }))
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const PaymentsPage = lazy(() =>
  import("./pages/PaymentsPage").then((m) => ({ default: m.PaymentsPage }))
);

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route
            path="/admin"
            element={
              <AuthGuard>
                <AdminGuard>
                  <AdminLayout />
                </AdminGuard>
              </AuthGuard>
            }
          >
            <Route index element={<AdminPage />} />
          </Route>
          <Route
            element={
              <AuthGuard>
                <AppLayout />
              </AuthGuard>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/conversations" element={<ConversationsPage />} />
            <Route
              path="/conversations/:id"
              element={<ConversationDetailPage />}
            />
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/organization" element={<OrganizationPage />} />
            <Route path="/flows" element={<FlowsPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/instances" element={<InstancesPage />} />
            <Route path="/instances/create" element={<InstanceCreatePage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/instructions" element={<InstructionsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
