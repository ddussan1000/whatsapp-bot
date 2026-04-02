import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { HomePage } from "./pages/HomePage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { LoginPage } from "./pages/LoginPage";
import { ConversationDetailPage } from "./pages/ConversationDetailPage";
import { AuthGuard } from "./components/AuthGuard";
import { OrganizationPage } from "./pages/OrganizationPage";
import { FlowsPage } from "./pages/FlowsPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { InstancesPage } from "./pages/InstancesPage";
import { InstanceCreatePage } from "./pages/InstanceCreatePage";
import { MediaPage } from "./pages/MediaPage";
import { ConfigPage } from "./pages/ConfigPage";
import { InstructionsPage } from "./pages/InstructionsPage";
import { AdminGuard } from "./components/AdminGuard";
import { AdminLayout } from "./layout/AdminLayout";
import { AdminPage } from "./pages/AdminPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <Route path="/conversations/:id" element={<ConversationDetailPage />} />
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
  );
}

export default App;
