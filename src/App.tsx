// src/App.tsx
import "./App.css";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { RedirectIfAuthed, RequireAuth } from "./routesGuards";

import PublicLayout from "./layouts/PublicLayout";
import AppLayout from "./layouts/AppLayout";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import EditorPage from "./pages/EditorPage";
import AccountPage from "./pages/AccountPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
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
        </Route>

        {/* Protected */}
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/b/:blueprintId" element={<EditorPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}