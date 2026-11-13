import { useEffect, useMemo, type ReactNode } from "react";
import { useAuth } from "../auth";
import { getAdminAccess } from "./AdminData";
import { AdminAccessController } from "./AdminAccessController";
import { AdminAccessContext } from "./adminAccessContext";

export default function AdminAccessProvider({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  const userId = user?.id ?? null;
  // A new identity gets a new controller synchronously, so another account's
  // allowed state cannot survive even the first render after an account switch.
  const controller = useMemo(() => new AdminAccessController(getAdminAccess,
    loading || userId ? "checking" : "signed-out"), [loading, userId]);

  useEffect(() => {
    if (loading || !userId) return;
    void controller.refresh();
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible" && controller.isRefreshDue()) void controller.refresh();
    };
    const timer = window.setInterval(() => {
      if (controller.getSnapshot().status === "allowed") checkWhenVisible();
    }, 60_000);
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      controller.cancelPending();
    };
  }, [controller, loading, userId]);

  return <AdminAccessContext.Provider value={controller}>{children}</AdminAccessContext.Provider>;
}
