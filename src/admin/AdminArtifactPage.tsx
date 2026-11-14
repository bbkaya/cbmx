import { useCallback, useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import EditorPage from "../pages/EditorPage";
import PCBEditorPage from "../pages/PCBEditorPage";
import { isAdminAuthorizationError, loadAdminArtifact } from "./AdminData";
import { useAdminAccess } from "./useAdminAccess";
import { useAdminResource } from "./useAdminResource";
import { ReportError } from "./AdminTableUI";
import { adminInventoryReturnState } from "./adminNavigation";

export default function AdminArtifactPage({ type }: { type: "CBMX" | "PC" }) {
  const { user } = useAuth();
  const { blueprintId, pcbId } = useParams();
  const id = (type === "CBMX" ? blueprintId : pcbId) ?? "";
  const location = useLocation();
  const returnState = useMemo(() => adminInventoryReturnState(location.state), [location.state]);
  const { denyAccess } = useAdminAccess();
  const identity = user?.id;
  const load = useCallback((signal?: AbortSignal) => {
    if (!identity) throw new Error("Authentication required");
    return loadAdminArtifact(type, id, signal);
  }, [type, id, identity]);
  const report = useAdminResource(load);
  const reload = useCallback(async () => {
    try { return await load(); }
    catch (error) { if (isAdminAuthorizationError(error)) denyAccess(); throw error; }
  }, [load, denyAccess]);
  const artifact = report.data;
  // Keep session props stable during same-account auth/profile refreshes, so
  // viewer load effects do not reset an owner's in-progress edits.
  const cbmxView = useMemo(() => artifact?.blueprint_type === "CBMX" ? {
    initial: artifact, linkedArtifactState: returnState,
    reload: async () => { const value = await reload(); if (value.blueprint_type !== "CBMX") throw new Error("Unexpected artifact type"); return value; },
  } : undefined, [artifact, returnState, reload]);
  const pcbView = useMemo(() => artifact?.blueprint_type === "PC" ? {
    initial: artifact, linkedArtifactState: returnState,
    reload: async () => { const value = await reload(); if (value.blueprint_type !== "PC") throw new Error("Unexpected artifact type"); return value; },
  } : undefined, [artifact, returnState, reload]);
  return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", textAlign: "left" }}>
      <Link to="/app/admin" state={returnState} className="blueprint-name-link">← Back to Admin Dashboard</Link>
    </div>
    {report.loading ? <p role="status">Loading artifact…</p> : report.error ? <ReportError message={report.error} retry={report.retry} /> :
      cbmxView ? <EditorPage key={`${identity}:CBMX:${id}`} adminView={cbmxView} /> :
      pcbView ? <PCBEditorPage key={`${identity}:PC:${id}`} adminView={pcbView} /> : null}
  </div>;
}
