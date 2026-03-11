// src/pages/EditorPage.tsx
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import CBMXTable, { type CBMXBlueprint, validateCBMXBlueprint } from "../components/cbmx/CBMXTable";
import { supabase } from "../supabaseClient";
import { useAuth } from "../auth";

type ValidationIssue = { level: "error" | "warning"; message: string };

// include owner_user_id so we can enforce per-user uniqueness
type BlueprintRowFull = { id: string; name: string; owner_user_id: string; blueprint_json: CBMXBlueprint };

export default function EditorPage() {
  const { blueprintId } = useParams<{ blueprintId: string }>();
  const { user } = useAuth();

  const [dbBusy, setDbBusy] = useState(false);

  // Draft blueprint (working copy)
  const [draft, setDraft] = useState<CBMXBlueprint | null>(null);

  // Tracks last DB-synced state to compute dirtiness (instead of "Save local")
  const [lastSavedHash, setLastSavedHash] = useState<string>("");

  // JSON import
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Actions menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Load blueprint from DB
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!blueprintId) return;

      setDbBusy(true);
      const { data, error } = await supabase
        .from("blueprints")
        .select("id,name,owner_user_id,blueprint_json")
        .eq("id", blueprintId)
        .single();
      setDbBusy(false);

      if (!alive) return;

      if (error) {
        alert("Open failed: " + error.message);
        return;
      }

      const row = data as unknown as BlueprintRowFull;
      const loaded = deepClone(row.blueprint_json);

      // Canonical name is DB name; keep JSON meta in sync for exports/imports.
      const canonicalName = (row.name ?? loaded.meta?.name ?? "").trim() || "Untitled";
      loaded.meta = { ...(loaded.meta ?? {}), name: canonicalName };

      setDraft(loaded);
      setLastSavedHash(stableHash(loaded));
    }

    void load();

    return () => {
      alive = false;
    };
  }, [blueprintId]);

  const draftHash = useMemo(() => stableHash(draft), [draft]);
  const isDirty = draftHash !== lastSavedHash;

  const issues = useMemo<ValidationIssue[]>(() => (draft ? validateCBMXBlueprint(draft) : []), [draft]);
  const hasBlocking = issues.some((x) => x.level === "error");

  function setDraftName(name: string) {
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

  async function reloadFromDb() {
    if (!blueprintId) return;

    setDbBusy(true);
    const { data, error } = await supabase
      .from("blueprints")
      .select("name,blueprint_json")
      .eq("id", blueprintId)
      .single();
    setDbBusy(false);

    if (error) return alert("Reload failed: " + error.message);

    const loaded = deepClone((data as any).blueprint_json as CBMXBlueprint);

    const canonicalName = ((data as any).name ?? loaded.meta?.name ?? "").trim() || "Untitled";
    loaded.meta = { ...(loaded.meta ?? {}), name: canonicalName };

    setDraft(loaded);
    setLastSavedHash(stableHash(loaded));
  }

  function discardDraft() {
    const ok = window.confirm("Discard your unsaved changes and reload the last saved version from the database?");
    if (!ok) return;
    void reloadFromDb();
  }

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

  async function resolveUniqueNameForUser(desiredRaw: string, excludeBlueprintId?: string): Promise<string> {
    const desired = normalizeName(desiredRaw);

    if (!user?.id) return desired;

    const desiredEsc = escapeIlikePattern(desired);
    // Fetch names that start with desired; we’ll parse " (n)" suffixes.
    // Note: we use ilike + escape with `\\` and set `escapeChar` implicitly via Postgres; this works in PostgREST.
    const { data, error } = await supabase
      .from("blueprints")
      .select("id,name")
      .eq("owner_user_id", user.id)
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

  async function saveBlueprintToDbDirect(bp: CBMXBlueprint): Promise<boolean> {
    if (!blueprintId) return false;

    // Desired name from editor
    const desiredName = normalizeName(bp.meta?.name);

    // Auto-resolve conflicts per user (except current blueprint)
    const uniqueName = await resolveUniqueNameForUser(desiredName, blueprintId);

    // Ensure embedded JSON carries the same name for export/import portability.
    const toSave = deepClone(bp);
    toSave.meta = { ...(toSave.meta ?? {}), name: uniqueName };

    setDbBusy(true);
    const { error } = await supabase.from("blueprints").update({ name: uniqueName, blueprint_json: toSave }).eq("id", blueprintId);
    setDbBusy(false);

    if (error) {
      // If DB has a unique constraint and we raced, try one more time with a bumped suffix.
      if (isUniqueViolation(error)) {
        const bumped = await resolveUniqueNameForUser(uniqueName, blueprintId);
        const bumpedSave = deepClone(toSave);
        bumpedSave.meta = { ...(bumpedSave.meta ?? {}), name: bumped };

        setDbBusy(true);
        const { error: error2 } = await supabase
          .from("blueprints")
          .update({ name: bumped, blueprint_json: bumpedSave })
          .eq("id", blueprintId);
        setDbBusy(false);

        if (error2) return false;

        setDraft(bumpedSave);
        setLastSavedHash(stableHash(bumpedSave));

        if (bumped !== desiredName) {
          alert(`That name was already used. Saved as “${bumped}”.`);
        }
        return true;
      }

      return false;
    }

    setDraft(toSave);
    setLastSavedHash(stableHash(toSave));

    if (uniqueName !== desiredName) {
      alert(`That name was already used. Saved as “${uniqueName}”.`);
    }

    return true;
  }

  async function saveDraftToDb(): Promise<boolean> {
    if (!blueprintId) return false;
    if (!draft) return false;

    if (hasBlocking) {
      alert("Fix validation errors before saving.");
      return false;
    }

    const ok = await saveBlueprintToDbDirect(draft);
    if (!ok) alert("Save Now to the repository failed.");
    return ok;
  }

  /**
   * Ensures the DB has the latest changes (if any) BEFORE IO operations.
   * IMPORTANT: returns boolean only; it does NOT stop the caller from continuing.
   * The caller controls the continuation (export/import).
   */
  async function ensureSavedBeforeIO(): Promise<boolean> {
    if (!draft) return false;

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
    importInputRef.current?.click();
  }

  async function handleImportFile(file: File) {
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
    const ok = await saveBlueprintToDbDirect(imported);
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
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

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
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={discardDraft}
            disabled={!isDirty || dbBusy}
            style={{ fontSize: 14, borderRadius: 10, height: 40 }}
          >
            Discard changes
          </button>

          <button
            type="button"
            onClick={() => void saveDraftToDb()}
            disabled={dbBusy || !blueprintId || !isDirty || hasBlocking}
            title={
              hasBlocking
                ? "Fix validation errors before saving."
                : !isDirty
                  ? "No changes to save."
                  : "Save current changes to database"
            }
            style={{ fontSize: 14, borderRadius: 10, height: 40 }}
          >
            Save Now
          </button>

          <span style={{ color: isDirty ? "#b45309" : "#15803d", fontSize: 11 }}>
            {isDirty ? "Unsaved changes" : "All changes saved"}
          </span>

          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title="Import/Export (auto-saves first when needed)"
              style={{ width: 80, height: 40, borderRadius: 10, fontSize: 14 }}
            >
              Export/Import
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
                <MenuItem label="Export JSON" onClick={() => runMenuAction(exportJson)} />
                <MenuItem label="Export PNG" onClick={() => runMenuAction(exportPng)} />
                <MenuItem label="Export PDF" onClick={() => runMenuAction(exportPdf)} />

                <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />

                <MenuItem label="Import JSON" onClick={() => runMenuAction(openImportDialog)} />

                {hasBlocking ? (
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
        <CBMXTable blueprint={draft} onChange={setDraft} />
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