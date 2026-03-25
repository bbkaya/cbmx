// src/pages/EditorPage.tsx
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import CBMXTable, { type CBMXBlueprint, type ProcessCanvasLinkSummary, validateCBMXBlueprint } from "../components/cbmx/CBMXTable";
import { supabase } from "../supabaseClient";
import { useAuth } from "../auth";
import {
  canEditBlueprint,
  canRoleEditBlueprint,
  getBlueprintRole,
  loadBlueprint,
  updateBlueprintWithVersion,
  type BlueprintAccessRole,
  type CBMXRow,
} from "../cbmx/CBMXData";
import { canEditPCB, canRoleEditPCB, listAccessiblePCBs } from "../pcb/PCBData";
import { makeBlankProcessCanvasBlueprint } from "../pcb/processCanvasDomain";

type ValidationIssue = { level: "error" | "warning"; message: string };

// include owner_user_id so we can enforce per-user uniqueness
type BlueprintRowFull = CBMXRow;
type ProcessCanvasBlueprintRow = { id: string; name: string; owner_user_id?: string };
type PCBAccessRole = "owner" | "editor" | "viewer";
type CBMXProcessLinkAccessRow = {
  cbmx_process_id: string;
  link_exists: boolean;
  process_canvas_blueprint_id: string | null;
  process_canvas_blueprint_name: string | null;
  pcb_access_role: PCBAccessRole | null;
  has_pcb_access: boolean;
};

export default function EditorPage() {
  const { blueprintId } = useParams<{ blueprintId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dbBusy, setDbBusy] = useState(false);
  const [blueprintRole, setBlueprintRole] = useState<BlueprintAccessRole | null>(null);
  const [blueprintOwnerUserId, setBlueprintOwnerUserId] = useState<string | null>(null);
  const [loadedVersionNo, setLoadedVersionNo] = useState<number | null>(null);

  // Draft blueprint (working copy)
  const [draft, setDraft] = useState<CBMXBlueprint | null>(null);

  // Tracks last DB-synced state to compute dirtiness (instead of "Save local")
  const [lastSavedHash, setLastSavedHash] = useState<string>("");
  const [processLinks, setProcessLinks] = useState<ProcessCanvasLinkSummary[]>([]);

  // Autosave
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSaveTimerRef = useRef<number | null>(null);

  // JSON import
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Actions menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  async function loadProcessLinks(currentBlueprintId: string): Promise<ProcessCanvasLinkSummary[]> {
    const { data, error } = await supabase.rpc("list_cbmx_process_links_with_access", {
      p_cbmx_blueprint_id: currentBlueprintId,
    });

    if (error) throw error;

    const rows = (data ?? []) as CBMXProcessLinkAccessRow[];

    return rows.map((row) => ({
      cbmx_process_id: row.cbmx_process_id,
      link_exists: Boolean(row.link_exists),
      process_canvas_blueprint_id: row.process_canvas_blueprint_id,
      process_canvas_blueprint_name: row.process_canvas_blueprint_name,
      pcb_access_role: row.pcb_access_role,
      has_pcb_access: Boolean(row.has_pcb_access),
    }));
  }

  // Load blueprint from DB
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!blueprintId) return;

      setDbBusy(true);
      let row: BlueprintRowFull;
      try {
        row = await loadBlueprint(blueprintId);
      } catch (err) {
        setDbBusy(false);
        if (!alive) return;
        alert("Open failed: " + (err instanceof Error ? err.message : "Unknown error"));
        return;
      }
      setDbBusy(false);

      if (!alive) return;

      let nextRole: BlueprintAccessRole | null = null;
      if (user?.id) {
        try {
          nextRole = await getBlueprintRole(blueprintId, user.id);
        } catch (err) {
          console.warn("Failed to load blueprint membership:", err);
          nextRole = null;
        }
      }

      const loaded = deepClone(row.blueprint_json);
      const loadedLinks = await loadProcessLinks(blueprintId).catch((err: { message?: string }) => {
        alert("Failed to load Process Canvas links: " + (err?.message ?? "Unknown error"));
        return [] as ProcessCanvasLinkSummary[];
      });

      // Canonical name is DB name; keep JSON meta in sync for exports/imports.
      const canonicalName = (row.name ?? loaded.meta?.name ?? "").trim() || "Untitled";
      loaded.meta = { ...(loaded.meta ?? {}), name: canonicalName };

      setDraft(loaded);
      setProcessLinks(loadedLinks);
      setBlueprintRole(nextRole);
      setBlueprintOwnerUserId(row.owner_user_id ?? null);
      setLoadedVersionNo(row.version_no ?? null);
      setLastSavedHash(stableHash(loaded));
    }

    void load();

    return () => {
      alive = false;
    };
  }, [blueprintId, user?.id]);

  const draftHash = useMemo(() => stableHash(draft), [draft]);
  const isDirty = draftHash !== lastSavedHash;

  const isOwner = Boolean(user?.id && blueprintOwnerUserId && user.id === blueprintOwnerUserId);
  const canEditCurrentBlueprint = isOwner || canRoleEditBlueprint(blueprintRole);
  const isReadOnly = !canEditCurrentBlueprint;

  const issues = useMemo<ValidationIssue[]>(() => (draft ? validateCBMXBlueprint(draft) : []), [draft]);
  const hasBlocking = issues.some((x) => x.level === "error");

  function setDraftName(name: string) {
    if (isReadOnly) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      next.meta = { ...(next.meta ?? {}), name };
      return next;
    });
  }

  // Close menu on outside click / escape
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!menuOpen) return;
      const target = e.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (!menuOpen) return;
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [menuOpen]);



  function normalizeName(raw: string | undefined | null): string {
    const n = (raw ?? "").trim();
    return n || "Untitled";
  }

  function escapeIlikePattern(s: string): string {
    // Escape %, _ for ilike patterns. Backslash escaping works in Postgres.
    return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  }

  function nextSuffixName(base: string, existingNames: string[]): string {
    // base -> base (2), base (3) ...
    let maxN = 1; // base itself implies N=1
    const re = new RegExp(`^${escapeRegExp(base)}\\s\\((\\d+)\\)$`);
    for (const n of existingNames) {
      if (n === base) {
        maxN = Math.max(maxN, 1);
        continue;
      }
      const m = n.match(re);
      if (m) {
        const num = Number(m[1]);
        if (Number.isFinite(num)) maxN = Math.max(maxN, num);
      }
    }
    return `${base} (${maxN + 1})`;
  }

  async function resolveUniqueNameForOwner(desiredRaw: string, excludeBlueprintId?: string): Promise<string> {
    const desired = normalizeName(desiredRaw);

    const namespaceOwnerUserId = blueprintOwnerUserId ?? user?.id ?? null;
    if (!namespaceOwnerUserId) return desired;

    const desiredEsc = escapeIlikePattern(desired);
    // Fetch names that start with desired; we’ll parse " (n)" suffixes.
    // Note: we use ilike + escape with `\\` and set `escapeChar` implicitly via Postgres; this works in PostgREST.
    const { data, error } = await supabase
      .from("blueprints")
      .select("id,name")
      .eq("owner_user_id", namespaceOwnerUserId)
      .ilike("name", `${desiredEsc}%`);

    if (error) {
      // If the check fails, don’t block save; just return desired and rely on DB constraint if present.
      return desired;
    }

    const rows = (data ?? []) as Array<{ id: string; name: string }>;
    const names = rows
      .filter((r) => (excludeBlueprintId ? r.id !== excludeBlueprintId : true))
      .map((r) => (r.name ?? "").trim())
      .filter(Boolean);

    if (!names.includes(desired)) return desired;

    return nextSuffixName(desired, names);
  }

  function isUniqueViolation(err: any): boolean {
    // PostgREST/Supabase commonly uses 23505 for unique violations
    return err?.code === "23505" || String(err?.message ?? "").toLowerCase().includes("duplicate key");
  }



function handleBlueprintSaveFailure(
  reason: "stale" | "forbidden" | "not_found",
  options?: { silent?: boolean },
): Promise<boolean> | boolean {
  if (reason === "stale") {
    return reloadBlueprintFromDb().then(() => {
      if (!options?.silent) {
        alert("This blueprint was updated elsewhere. Your local changes were not saved, and the latest version has been reloaded.");
      }
      return false;
    });
  }

  if (reason === "forbidden") {
    if (!options?.silent) {
      alert("You no longer have permission to save changes to this blueprint. Your access may have been changed, or this blueprint may now be view-only.");
    }
    return false;
  }

  if (!options?.silent) {
    alert("This blueprint could not be found. It may have been deleted or you may no longer have access to it.");
  }
  return false;
}

  async function saveBlueprintToDbDirect(bp: CBMXBlueprint, options?: { silent?: boolean }): Promise<boolean> {
    if (isReadOnly) return false;
    if (!blueprintId) return false;
    if (!user?.id) return false;
    if (loadedVersionNo == null) return false;

    const desiredName = normalizeName(bp.meta?.name);
    const uniqueName = await resolveUniqueNameForOwner(desiredName, blueprintId);

    const toSave = deepClone(bp);
    toSave.meta = { ...(toSave.meta ?? {}), name: uniqueName };

    setDbBusy(true);
    try {
      const result = await updateBlueprintWithVersion({
        blueprintId,
        loadedVersionNo,
        userId: user.id,
        name: uniqueName,
        blueprint: toSave,
      });

      if (!result.ok) {
        return await handleBlueprintSaveFailure(result.reason, options);
      }

      const saved = result.row;
      const savedBlueprint = deepClone(saved.blueprint_json);
      savedBlueprint.meta = { ...(savedBlueprint.meta ?? {}), name: saved.name || uniqueName };

      setDraft(savedBlueprint);
      setLoadedVersionNo(saved.version_no ?? null);
      setLastSavedHash(stableHash(savedBlueprint));

      if (saved.name !== desiredName && !options?.silent) {
        alert(`That name was already used. Saved as “${saved.name}”.`);
      }

      return true;
    } catch (error: any) {
      if (isUniqueViolation(error)) {
        const bumped = await resolveUniqueNameForOwner(uniqueName, blueprintId);
        const bumpedSave = deepClone(toSave);
        bumpedSave.meta = { ...(bumpedSave.meta ?? {}), name: bumped };

        const result = await updateBlueprintWithVersion({
          blueprintId,
          loadedVersionNo,
          userId: user.id,
          name: bumped,
          blueprint: bumpedSave,
        });

        if (!result.ok) {
          return await handleBlueprintSaveFailure(result.reason, options);
        }

        const saved = result.row;
        const savedBlueprint = deepClone(saved.blueprint_json);
        savedBlueprint.meta = { ...(savedBlueprint.meta ?? {}), name: saved.name || bumped };

        setDraft(savedBlueprint);
        setLoadedVersionNo(saved.version_no ?? null);
        setLastSavedHash(stableHash(savedBlueprint));

        if (saved.name !== desiredName && !options?.silent) {
          alert(`That name was already used. Saved as “${saved.name}”.`);
        }

        return true;
      }

      if (!options?.silent) {
        alert(error instanceof Error ? error.message : "Could not save blueprint.");
      }
      return false;
    } finally {
      setDbBusy(false);
    }
  }

  function findProcessById(processId: string) {
    return (draft?.coCreationProcesses ?? []).find((p) => p.id === processId) ?? null;
  }

  function getProcessLink(processId: string): ProcessCanvasLinkSummary | null {
    return processLinks.find((x) => x.cbmx_process_id === processId) ?? null;
  }

  function canRoleViewPCB(role: PCBAccessRole | null | undefined): boolean {
    return role === "owner" || role === "editor" || role === "viewer";
  }

  function canRoleMutatePCBLink(role: PCBAccessRole | null | undefined): boolean {
    return role === "owner" || role === "editor";
  }

  async function reloadBlueprintFromDb(options?: { alertOnError?: boolean }) {
    if (!blueprintId) return false;

    try {
      const row = await loadBlueprint(blueprintId);
      const loaded = deepClone(row.blueprint_json);
      const canonicalName = (row.name ?? loaded.meta?.name ?? "").trim() || "Untitled";
      loaded.meta = { ...(loaded.meta ?? {}), name: canonicalName };

      const loadedLinks = await loadProcessLinks(blueprintId).catch(() => [] as ProcessCanvasLinkSummary[]);

      setDraft(loaded);
      setProcessLinks(loadedLinks);
      setBlueprintOwnerUserId(row.owner_user_id ?? null);
      setLoadedVersionNo(row.version_no ?? null);
      setLastSavedHash(stableHash(loaded));
      return true;
    } catch (err) {
      if (options?.alertOnError) {
        alert(err instanceof Error ? err.message : "Could not reload blueprint.");
      }
      return false;
    }
  }

  async function verifyEditableArtifacts(processCanvasBlueprintId: string): Promise<{ ok: true; pcb: ProcessCanvasBlueprintRow } | { ok: false }> {
    if (!blueprintId || !user?.id) {
      alert("You must be signed in to link artefacts.");
      return { ok: false };
    }

    try {
      const cbmxEditable = await canEditBlueprint(blueprintId, user.id);
      if (!cbmxEditable) {
        alert("Linking is allowed only when you can edit both artefacts. You do not currently have edit rights on this CBMX blueprint.");
        return { ok: false };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Could not validate edit access to the CBMX blueprint: " + message);
      return { ok: false };
    }

    const { data: pcbRow, error: pcbError } = await supabase
      .from("process_canvas_blueprints")
      .select("id,name,owner_user_id")
      .eq("id", processCanvasBlueprintId)
      .single();

    if (pcbError) {
      alert("Could not validate the selected Process Canvas: " + pcbError.message);
      return { ok: false };
    }

    try {
      const pcbEditable = await canEditPCB(processCanvasBlueprintId, user.id);
      if (!pcbEditable) {
        alert("Linking is allowed only when you can edit both artefacts. You do not currently have edit rights on the selected Process Canvas.");
        return { ok: false };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Could not validate edit access to the selected Process Canvas: " + message);
      return { ok: false };
    }

    return { ok: true, pcb: pcbRow as ProcessCanvasBlueprintRow };
  }

  async function refreshProcessLinks() {
    if (!blueprintId) return;
    const links = await loadProcessLinks(blueprintId).catch((err: { message?: string }) => {
      alert("Failed to refresh Process Canvas links: " + (err?.message ?? "Unknown error"));
      return [] as ProcessCanvasLinkSummary[];
    });
    setProcessLinks(links);
  }

  async function createPCBForProcess(processId: string) {
    if (isReadOnly) {
      alert("You have read-only access to this CBMX blueprint.");
      return;
    }
    if (!blueprintId || !user?.id) return;
    const process = findProcessById(processId);
    if (!process) return alert("Process not found.");

    const currentLink = getProcessLink(processId);
    if (currentLink?.link_exists) {
      if (!currentLink.has_pcb_access) {
        alert(
          "This co-creation process is already linked to a Process Canvas, but you do not have access to it. Ask the owner to share that canvas if you need access."
        );
        return;
      }

      if (!canRoleMutatePCBLink(currentLink.pcb_access_role as PCBAccessRole | null | undefined)) {
        alert(
          "This co-creation process is already linked to a Process Canvas. You can open it, but only PCB editors can replace or relink it."
        );
        return;
      }
    }

    const suggestedName = `${normalizeName(draft?.meta?.name)} - ${process.name.trim() || process.id}`;
    const nameInput = window.prompt("Name for the new Process Canvas blueprint:", suggestedName);
    if (nameInput == null) return;

    const desiredName = normalizeName(nameInput);
    const blankPCB = makeBlankProcessCanvasBlueprint();
    blankPCB.meta.name = desiredName;

    setDbBusy(true);
    const { data: pcbRow, error: pcbError } = await supabase
      .from("process_canvas_blueprints")
      .insert({
        owner_user_id: user.id,
        name: desiredName,
        blueprint_json: blankPCB,
      })
      .select("id,name,owner_user_id")
      .single();

    if (pcbError) {
      setDbBusy(false);
      alert("Create PCB failed: " + pcbError.message);
      return;
    }

    const verified = await verifyEditableArtifacts((pcbRow as ProcessCanvasBlueprintRow).id);
    if (!verified.ok) {
      setDbBusy(false);
      return;
    }

    const { error: linkError } = await supabase.rpc("upsert_cbmx_process_link", {
      p_cbmx_blueprint_id: blueprintId,
      p_cbmx_process_id: processId,
      p_process_canvas_blueprint_id: (pcbRow as ProcessCanvasBlueprintRow).id,
    });
    setDbBusy(false);

    if (linkError) {
      alert("PCB was created, but linking failed: " + linkError.message);
      return;
    }

    await refreshProcessLinks();
    alert("The Process Canvas was linked to the CBMX process. This creates only the association between the artefacts; it does not copy access rights automatically.");
    navigate(`/app/pcb/${(pcbRow as ProcessCanvasBlueprintRow).id}`);
  }

  async function linkExistingPCBToProcess(processId: string) {
    if (isReadOnly) {
      alert("You have read-only access to this CBMX blueprint.");
      return;
    }
    if (!blueprintId || !user?.id) return;
    const process = findProcessById(processId);
    if (!process) return alert("Process not found.");

    const currentLink = getProcessLink(processId);
    if (currentLink?.link_exists) {
      if (!currentLink.has_pcb_access) {
        alert(
          "This co-creation process is already linked to a Process Canvas, but you do not have access to it. Ask the owner to share that canvas if you need access."
        );
        return;
      }

      if (!canRoleMutatePCBLink(currentLink.pcb_access_role as PCBAccessRole | null | undefined)) {
        alert(
          "This co-creation process is already linked to a Process Canvas. You can open it, but only PCB editors can replace or relink it."
        );
        return;
      }
    }

    setDbBusy(true);
    let accessibleRows;
    try {
      accessibleRows = await listAccessiblePCBs(user.id);
    } catch (err) {
      setDbBusy(false);
      const message = err instanceof Error ? err.message : "Unknown error";
      return alert("Load existing PCBs failed: " + message);
    }
    setDbBusy(false);

    const rows = accessibleRows
      .filter((row) => canRoleEditPCB(row.role))
      .map((row) => ({ id: row.id, name: row.name, owner_user_id: row.owner_user_id } satisfies ProcessCanvasBlueprintRow))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (rows.length === 0) {
      alert("No editable Process Canvas blueprints found yet. Create one first or ask for editor access.");
      return;
    }

    const options = rows.map((row) => row.name).join("\n");
    const chosenName = window.prompt(
      `Type the exact PCB name to link to process “${process.name || process.id}”.

Available editable PCBs:
${options}`,
      rows[0]?.name ?? ""
    );
    if (chosenName == null) return;

    const chosen = rows.find((row) => row.name.trim().toLowerCase() === chosenName.trim().toLowerCase());
    if (!chosen) {
      alert("No editable PCB matched that name exactly.");
      return;
    }

    const verified = await verifyEditableArtifacts(chosen.id);
    if (!verified.ok) return;

    setDbBusy(true);
    const { error: linkError } = await supabase.rpc("upsert_cbmx_process_link", {
      p_cbmx_blueprint_id: blueprintId,
      p_cbmx_process_id: processId,
      p_process_canvas_blueprint_id: chosen.id,
    });
    setDbBusy(false);

    if (linkError) return alert("Link existing PCB failed: " + linkError.message);

    await refreshProcessLinks();
    alert("The Process Canvas was linked to the CBMX process. This creates only the association between the artefacts; it does not copy access rights automatically.");
  }


  async function unlinkPCBFromProcess(processId: string) {
    if (isReadOnly) {
      alert("You have read-only access to this CBMX blueprint.");
      return;
    }
    if (!blueprintId) return;

    const currentLink = getProcessLink(processId);
    if (!currentLink?.link_exists || !currentLink.process_canvas_blueprint_id) {
      alert("There is no linked Process Canvas for this co-creation process.");
      return;
    }

    if (!currentLink.has_pcb_access) {
      alert(
        "This co-creation process is linked to a Process Canvas, but you do not have access to it. Ask the owner to share that canvas if you need access."
      );
      return;
    }

    if (!canRoleMutatePCBLink(currentLink.pcb_access_role as PCBAccessRole | null | undefined)) {
      alert("Only PCB editors can unlink or replace the linked Process Canvas.");
      return;
    }

    const process = findProcessById(processId);
    const ok = window.confirm(`Unlink the Process Canvas from process “${process?.name || processId}”?`);
    if (!ok) return;

    setDbBusy(true);
    const { error } = await supabase.rpc("unlink_cbmx_process_link", {
      p_cbmx_blueprint_id: blueprintId,
      p_cbmx_process_id: processId,
    });
    setDbBusy(false);

    if (error) return alert("Unlink failed: " + error.message);

    await refreshProcessLinks();
  }

  function openLinkedPCB(processCanvasBlueprintId: string) {
    const link = processLinks.find((x) => x.process_canvas_blueprint_id === processCanvasBlueprintId) ?? null;

    if (!link) {
      alert("Linked Process Canvas not found.");
      return;
    }

    if (!link.has_pcb_access || !canRoleViewPCB(link.pcb_access_role as PCBAccessRole | null | undefined)) {
      alert("You do not have access to open this linked Process Canvas.");
      return;
    }

    navigate(`/app/pcb/${processCanvasBlueprintId}`);
  }

  async function saveDraftToDb(): Promise<boolean> {
    if (isReadOnly) return false;
    if (!blueprintId) return false;
    if (!draft) return false;

    if (hasBlocking) {
      alert("Fix validation errors before saving.");
      return false;
    }

    return await saveBlueprintToDbDirect(draft, { silent: false });
  }

  async function autoSaveDraftToDb(): Promise<boolean> {
    if (isReadOnly) return false;
    if (!blueprintId || !draft) return false;
    if (dbBusy) return false;
    if (hasBlocking) return false;
    if (!isDirty) return true;

    setIsAutoSaving(true);
    const ok = await saveBlueprintToDbDirect(draft, { silent: true });
    setIsAutoSaving(false);
    return ok;
  }

  /**
   * Ensures the DB has the latest changes (if any) BEFORE IO operations.
   * IMPORTANT: returns boolean only; it does NOT stop the caller from continuing.
   * The caller controls the continuation (export/import).
   */
  async function ensureSavedBeforeIO(): Promise<boolean> {
    if (!draft) return false;
    if (isReadOnly) return true;

    if (hasBlocking) {
      alert("Fix validation errors before importing/exporting.");
      return false;
    }

    if (isDirty) {
      const ok = await saveDraftToDb();
      if (!ok) return false;
    }

    return true;
  }

  useEffect(() => {
    if (isReadOnly) return;
    if (!draft) return;
    if (!isDirty) return;
    if (hasBlocking) return;
    if (!blueprintId) return;

    if (autoSaveTimerRef.current != null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      void autoSaveDraftToDb();
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [draftHash, isDirty, hasBlocking, blueprintId]);

  // ---------------- JSON Export/Import ----------------
  function downloadJson(filename: string, obj: unknown) {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportJson() {
    const ok = await ensureSavedBeforeIO();
    if (!ok) return;
    if (!draft) return;

    const name = (draft.meta?.name ?? "cbmx-blueprint").trim() || "cbmx-blueprint";
    downloadJson(`${safeFilename(name)}.json`, draft);
  }

  function openImportDialog() {
    if (isReadOnly) {
      alert("You have read-only access to this CBMX blueprint.");
      return;
    }
    importInputRef.current?.click();
  }

  async function handleImportFile(file: File) {
    if (isReadOnly) {
      alert("You have read-only access to this CBMX blueprint.");
      return;
    }

    const text = await file.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert("Import failed: file is not valid JSON.");
      return;
    }

    const candidate = parsed as CBMXBlueprint;
    if (!candidate || !Array.isArray(candidate.actors)) {
      alert("Import failed: JSON does not look like a CBMX blueprint (missing actors array).");
      return;
    }

    const importedIssues: ValidationIssue[] = validateCBMXBlueprint(candidate);
    const importedErrors = importedIssues.filter((x) => x.level === "error");

    // Always load into the editor view
    const imported = deepClone(candidate);
    imported.meta = { ...(imported.meta ?? {}), name: normalizeName(imported.meta?.name) };
    setDraft(imported);

    if (importedErrors.length > 0) {
      alert(`Import completed with ${importedErrors.length} validation error(s). Fix them, then click “Save Now”.`);
      return;
    }

    // Auto-save imported blueprint to repository-DB (name uniqueness enforced on save)
    const ok = await saveBlueprintToDbDirect(imported, { silent: false });
    if (ok) alert("Import successful and saved to the repository.");
    else alert("Imported, but save to the repository failed.");
  }

  // ---------------- PNG/PDF Export ----------------
  async function exportPng() {
    const ok = await ensureSavedBeforeIO();
    if (!ok) return;

    const node = document.getElementById("cbmx-canvas");
    if (!node) return alert("Canvas not found.");

    const dataUrl = await toPng(node, { pixelRatio: 2 });
    const link = document.createElement("a");
    link.download = "cbmx-blueprint.png";
    link.href = dataUrl;
    link.click();
  }

  async function exportPdf() {
    const ok = await ensureSavedBeforeIO();
    if (!ok) return;

    const node = document.getElementById("cbmx-canvas");
    if (!node) return alert("Canvas not found.");

    const dataUrl = await toPng(node, { pixelRatio: 2 });

    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const img = new Image();
    img.src = dataUrl;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image for PDF export."));
    });

    const imgWidth = img.width;
    const imgHeight = img.height;

    const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight);
    const renderWidth = imgWidth * scale;
    const renderHeight = imgHeight * scale;

    const x = (pageWidth - renderWidth) / 2;
    const y = (pageHeight - renderHeight) / 2;

    pdf.addImage(dataUrl, "PNG", x, y, renderWidth, renderHeight);
    pdf.save("cbmx-blueprint.pdf");
  }

  function runMenuAction(fn: () => void | Promise<void>) {
    setMenuOpen(false);
    void fn();
  }

  // Warn on refresh/close tab when there are unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isReadOnly) return;
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, isReadOnly]);

  if (dbBusy && !draft) return <div style={{ padding: 16 }}>Loading blueprint…</div>;
  if (!draft) return <div style={{ padding: 16 }}>No blueprint loaded.</div>;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link to="/app" style={{ fontSize: 13 }}>
            ← Back to My Blueprints
          </Link>

          {isReadOnly ? (
            <div
              style={{
                display: "grid",
                gap: 2,
                minWidth: 280,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 16 }}>{draft.meta?.name ?? ""}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>View only</div>
            </div>
          ) : (
            <input
              value={draft.meta?.name ?? ""}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Blueprint name"
              aria-label="Blueprint name"
              style={{
                fontWeight: 800,
                fontSize: 16,
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                minWidth: 280,
                height: 34,
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>


          <span style={{ color: isReadOnly ? "#64748b" : isAutoSaving ? "#1d4ed8" : isDirty ? "#b45309" : "#15803d", fontSize: 11, fontWeight: 700 }}>
            {isReadOnly ? "Read-only access" : isAutoSaving ? "Saving automatically..." : isDirty ? "Unsaved changes" : "All changes saved"}
          </span>

          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              disabled={isAutoSaving}
              title={isReadOnly ? "Export options" : "Import/Export (auto-saves first when needed)"}
              style={{ width: 140, height: 40, borderRadius: 5, fontSize: 14 }}
            >
              {isReadOnly ? "Export ▾" : "Export/Import ▾"}
            </button>

            {menuOpen ? (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 44,
                  minWidth: 220,
                  background: "white",
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                  padding: 6,
                  zIndex: 50,
                }}
              >
                <MenuItem label="Export CBMX to JSON" onClick={() => runMenuAction(exportJson)} disabled={isAutoSaving} />
                <MenuItem label="Export CBMX to PNG" onClick={() => runMenuAction(exportPng)} disabled={isAutoSaving} />
                <MenuItem label="Export CBMX to PDF" onClick={() => runMenuAction(exportPdf)} disabled={isAutoSaving} />

                {!isReadOnly ? (
                  <>
                    <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />
                    <MenuItem label="Import CBMX from JSON" onClick={() => runMenuAction(openImportDialog)} disabled={isAutoSaving} />
                  </>
                ) : null}

                {hasBlocking && !isReadOnly ? (
                  <div style={{ padding: "6px 10px", fontSize: 12, color: "#b91c1c" }}>
                    Fix validation errors before IO.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ValidationPanel issues={issues} />

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (file) void handleImportFile(file);
        }}
      />

      <div id="cbmx-canvas" style={{ marginTop: 16, display: "inline-block", background: "white" }}>
        <CBMXTable
          blueprint={draft}
          onChange={isReadOnly ? undefined : setDraft}
          processLinks={processLinks}
          onCreatePCBForProcess={isReadOnly ? undefined : (processId) => void createPCBForProcess(processId)}
          onLinkExistingPCBToProcess={isReadOnly ? undefined : (processId) => void linkExistingPCBToProcess(processId)}
          onOpenLinkedPCB={openLinkedPCB}
          onUnlinkPCBFromProcess={isReadOnly ? undefined : (processId) => void unlinkPCBFromProcess(processId)}
        />
      </div>
    </div>
  );
}

function MenuItem({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        borderRadius: 10,
        border: "none",
        background: "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  if (!issues || issues.length === 0) return null;

  const errors = issues.filter((x) => x.level === "error");
  const warnings = issues.filter((x) => x.level === "warning");

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 12,
        maxWidth: 1100,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800 }}>Validation</div>
        {errors.length > 0 ? (
          <div style={{ color: "#b91c1c", fontSize: 12 }}>{errors.length} error(s) — Save disabled</div>
        ) : (
          <div style={{ color: "#15803d", fontSize: 12 }}>No blocking errors</div>
        )}
        {warnings.length > 0 ? <div style={{ color: "#b45309", fontSize: 12 }}>{warnings.length} warning(s)</div> : null}
      </div>

      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
        {issues.map((it, idx) => (
          <div key={idx} style={{ fontSize: 12, color: it.level === "error" ? "#b91c1c" : "#b45309" }}>
            {it.level === "error" ? "⛔" : "⚠️"} {it.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function stableHash(obj: unknown): string {
  return JSON.stringify(obj);
}

function safeFilename(name: string) {
  return (
    name
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .slice(0, 80) || "cbmx-blueprint"
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}