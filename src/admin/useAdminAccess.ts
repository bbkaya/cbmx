import { useContext, useSyncExternalStore } from "react";
import { AdminAccessContext } from "./adminAccessContext";

export function useAdminAccess() {
  const controller = useContext(AdminAccessContext);
  if (!controller) throw new Error("AdminAccessProvider is required");
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...state, retry: controller.refresh, denyAccess: controller.denyAccess };
}
