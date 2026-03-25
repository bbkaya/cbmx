import "./App.css";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { RedirectIfAuthed, RequireAuth } from "./routesGuards";

import PublicLayout from "./layouts/PublicLayout";
import AppLayout from "./layouts/AppLayout";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import EditorPage from "./pages/EditorPage";
import PCBEditorPage from "./pages/PCBEditorPage";
import PCBDashboardPage from "./pages/PCBDashboardPage";
import AccountPage from "./pages/AccountPage";
import BlueprintSharePage from "./pages/BlueprintSharePage";
import PCBSharePage from "./pages/PCBSharePage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <LoginPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/signup"
            element={
              <RedirectIfAuthed>
                <SignupPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <RedirectIfAuthed>
                <ForgotPasswordPage />
              </RedirectIfAuthed>
            }
          />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/b/:blueprintId" element={<EditorPage />} />
          <Route path="/app/b/:blueprintId/share" element={<BlueprintSharePage />} />

          <Route path="/app/pcbs" element={<PCBDashboardPage />} />
          <Route path="/app/pcb/new" element={<PCBEditorPage />} />
          <Route path="/app/pcb/:pcbId" element={<PCBEditorPage />} />
          <Route path="/app/pcb/:pcbId/share" element={<PCBSharePage />} />

          <Route path="/account" element={<AccountPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}