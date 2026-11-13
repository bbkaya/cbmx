import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { useAdminAccess } from "./useAdminAccess";

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const access = useAdminAccess();
  const location = useLocation();
  if (loading) return <p role="status">Checking authentication…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (access.status === "checking") return <p role="status">Checking administrator access…</p>;
  if (access.status === "allowed") return children;
  return (
    <section style={{ textAlign: "left", color: "#0f172a" }}>
      <h1>{access.status === "error" ? "Unable to check administrator access" : "Administrator access required"}</h1>
      <p role={access.status === "error" ? "alert" : undefined}>
        {access.error ?? "This account does not currently have access to administrator reporting."}
      </p>
      <button type="button" onClick={() => void access.retry()}>Check access again</button>{" "}
      <Link to="/app">Return to My Blueprints</Link>
    </section>
  );
}
