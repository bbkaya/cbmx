// src/routesGuards.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const loc = useLocation();

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;

  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (user) return <Navigate to="/app" replace />;

  return <>{children}</>;
}