import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import ProcessCanvas from "../components/pcb/ProcessCanvas";
import { useAuth } from "../auth";
import {
  deepClonePCB,
  makeBlankProcessCanvasBlueprint,
  type ProcessCanvasBlueprint,
  validateProcessCanvasBlueprint,
} from "../pcb/processCanvasDomain";
import { createPCB, loadPCB, loadPCBLinkContext, updatePCB, type PCBLinkContext } from "../pcb/PCBData";

type ValidationIssue = { level: "error" | "warning"; message: string };

function safeFileName(value: string): string {
  return value.trim().replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-") || "process-canvas";
}

function stableHash(obj: unknown): string {
  return JSON.stringify(obj);
}

export default function PCBEditorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pcbId } = useParams<{ pcbId: string }>();

  const [blueprint, setBlueprint] = useState<ProcessCanvasBlueprint>(() => makeBlankProcessCanvasBlueprint());
  const [validationOpen, setValidationOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkContext, setLinkContext] = useState<PCBLinkContext | null>(null);
  const [lastSavedHash, setLastSavedHash] = useState<string>("");

  const exportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);

  const issues = useMemo<ValidationIssue[]>(() => validateProcessCanvasBlueprint(blueprint), [blueprint]);
  const hasBlocking = issues.some((x) => x.level === "error");
  const isNew = !pcbId || pcbId === "new";
  const blueprintHash = useMemo(() => stableHash(blueprint), [blueprint]);
  const isDirty = blueprintHash !== lastSavedHash;

  useEffect(() => {
    let alive = true;

    async function run() {
      setIsLoading(true);
      setLoadError(null);

      try {
        if (isNew) {
          const blank = makeBlankProcessCanvasBlueprint();
          if (!alive) return;
          setBlueprint(blank);
          setLinkContext(null);
          setLastSavedHash(stableHash(blank));
          return;
        }

        const row = await loadPCB(pcbId);
        const ctx = await loadPCBLinkContext(pcbId);
        if (!alive) return;
        setBlueprint(row.blueprint_json);
        setLinkContext(ctx);
        setLastSavedHash(stableHash(row.blueprint_json));
      } catch (err) {
        if (!alive) return;
        setLoadError(err instanceof Error ? err.message : "Could not load Process Canvas Blueprint.");
      } finally {
        if (alive) setIsLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [isNew, pcbId]);


  function setName(name: string) {
    setBlueprint((prev) => ({
      ...deepClonePCB(prev),
      meta: { ...prev.meta, name, updatedAt: new Date().toISOString() },
    }));
  }

  async function saveBlueprint(options?: { silent?: boolean }): Promise<boolean> {
    if (!user?.id) {
      if (!options?.silent) window.alert("Please log in first.");
      return false;
    }

    if (hasBlocking) {
      if (!options?.silent) window.alert("Fix validation errors before saving.");
      return false;
    }

    setIsSaving(true);

    try {
      const next = deepClonePCB(blueprint);
      next.meta.updatedAt = new Date().toISOString();
      if (!next.meta.createdAt) next.meta.createdAt = next.meta.updatedAt;

      if (isNew) {
        const row = await createPCB({
          ownerUserId: user.id,
          name: next.meta.name || "Untitled Process Canvas",
          blueprint: next,
        });
        setBlueprint(row.blueprint_json);
        setLastSavedHash(stableHash(row.blueprint_json));
        navigate(`/app/pcb/${row.id}`, { replace: true });
      } else {
        await updatePCB({
          pcbId: pcbId!,
          name: next.meta.name || "Untitled Process Canvas",
          blueprint: next,
        });
        setBlueprint(next);
        setLastSavedHash(stableHash(next));
      }

      return true;
    } catch (err) {
      if (!options?.silent) {
        window.alert(err instanceof Error ? err.message : "Could not save Process Canvas Blueprint.");
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function autoSaveBlueprint(): Promise<boolean> {
    if (isSaving || isAutoSaving) return false;
    if (!isDirty) return true;
    if (hasBlocking) return false;
    if (!user?.id) return false;

    setIsAutoSaving(true);
    const ok = await saveBlueprint({ silent: true });
    setIsAutoSaving(false);


    return ok;
  }

  async function ensureSavedBeforeIO(): Promise<boolean> {
    if (hasBlocking) {
      window.alert("Fix validation errors before importing/exporting.");
      return false;
    }

    if (isDirty) {
      const ok = await saveBlueprint({ silent: true });
      if (!ok) {
        window.alert("Could not save before export/import.");
        return false;
      }
    }

    return true;
  }

  function newBlueprint() {
    if (isDirty) {
      const ok = window.confirm("Create a new blank Process Canvas Blueprint? Unsaved changes will be lost.");
      if (!ok) return;
    }
    navigate("/app/pcb/new");
  }

  async function exportJson() {
    const ok = await ensureSavedBeforeIO();
    if (!ok) return;

    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(blueprint.meta.name || "process-canvas")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPng() {
    const ok = await ensureSavedBeforeIO();
    if (!ok) return;
    if (!exportRef.current) return;

    setMenuOpen(false);
    setIsExporting(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const dataUrl = await toPng(exportRef.current, { cacheBust: true, pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${safeFileName(blueprint.meta.name || "process-canvas")}.png`;
      a.click();
    } finally {
      setIsExporting(false);
    }
  }

  async function exportPdf() {
    const ok = await ensureSavedBeforeIO();
    if (!ok) return;
    if (!exportRef.current) return;

    setMenuOpen(false);
    setIsExporting(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const dataUrl = await toPng(exportRef.current, { cacheBust: true, pixelRatio: 2 });
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
      const renderWidth = img.width * ratio;
      const renderHeight = img.height * ratio;
      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;
      pdf.addImage(dataUrl, "PNG", x, y, renderWidth, renderHeight);
      pdf.save(`${safeFileName(blueprint.meta.name || "process-canvas")}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }

  function importJsonFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "{}")) as ProcessCanvasBlueprint;
        setBlueprint(parsed);
      } catch {
        window.alert("Could not read the JSON file.");
      }
    };
    reader.readAsText(file);
  }

  useEffect(() => {
    if (isLoading) return;
    if (!isDirty) return;
    if (hasBlocking) return;
    if (!user?.id) return;

    if (autoSaveTimerRef.current != null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      void autoSaveBlueprint();
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [blueprintHash, isDirty, hasBlocking, isLoading, user?.id]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  if (isLoading) {
    return <div style={{ padding: 24 }}>Loading Process Canvas…</div>;
  }

  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Could not open Process Canvas</div>
        <div style={{ color: "#475569" }}>{loadError}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12, width: "100%", minWidth: 0 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 2,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800 }}>Process Canvas Designer</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={newBlueprint} style={toolbarButton()}>
            New
          </button>

          <span style={{ color: isAutoSaving || isSaving ? "#1d4ed8" : isDirty ? "#b45309" : "#15803d", fontSize: 12, fontWeight: 700 }}>
            {isAutoSaving || isSaving ? "Saving automatically..." : isDirty ? "Unsaved changes" : "All changes saved"}
          </span>

          <div style={{ position: "relative" }}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)} style={toolbarButton()}>
              Export/Import ▾
            </button>

            {menuOpen ? (
              <div
                data-export-exclude="true"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 200,
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
                  padding: 6,
                  zIndex: 20,
                }}
              >
                <button type="button" onClick={() => void exportPng()} style={menuItemButton()}>
                  Export Canvas to PNG
                </button>
                <button type="button" onClick={() => void exportPdf()} style={menuItemButton()}>
                  Export Canvas to PDF
                </button>
                <button type="button" onClick={() => void exportJson()} style={menuItemButton()}>
                  Export Canvas to JSON
                </button>
                <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  style={menuItemButton()}
                >
                  Import Canvas from JSON
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>


      {linkContext ? (
        <section style={linkedCardStyle()}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 6,
              flexWrap: "wrap",
              fontSize: 13,
              color: "#0f172a",
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#0d4678",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Linked from CBMX Blueprint:
            </span>
            <button
              type="button"
              onClick={() => navigate(`/app/b/${linkContext.cbmx_blueprint_id}`)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                color: "#0d4678",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                textDecoration: "underline",
                textAlign: "left",
              }}
            >
              {linkContext.cbmx_blueprint_name}
            </button>
            <span style={{ color: "#64748b" }}>·</span>
            <span>{linkContext.cbmx_process_name}</span>
          </div>
        </section>
      ) : (
        <section style={linkedCardStyle()}>
          <div style={{ color: "#64748b", fontSize: 13 }}>This PCB is not currently linked to a CBMX co-creation process.</div>
        </section>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importJsonFile(file);
          e.currentTarget.value = "";
        }}
      />

      <section style={{ border: "1px solid #d7dde5", borderRadius: 10, background: "#f8fafc", overflow: "hidden" }}>
        {validationOpen ? (
          <div>
            <button type="button" onClick={() => setValidationOpen(false)} style={validationToggleStyle(true)}>
              Validation ▲ {issues.length > 0 ? `(${issues.length})` : ""}
            </button>
            <div style={{ padding: "10px 12px" }}>
              {issues.length === 0 ? (
                <div style={{ color: "#065f46", fontSize: 14 }}>No issues detected.</div>
              ) : (
                <ul style={{ paddingLeft: 18, margin: 0, color: "#334155", fontSize: 13, lineHeight: 1.4 }}>
                  {issues.map((issue, i) => (
                    <li key={i} style={{ marginBottom: 5 }}>
                      <strong>{issue.level}:</strong> {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setValidationOpen(true)} style={validationToggleStyle(false)}>
            Validation ▼ {issues.length > 0 ? `(${issues.length})` : ""}
          </button>
        )}
      </section>

      <div ref={exportRef} style={{ display: "grid", gap: 12 }}>
        <div style={{ background: "#ffffff", border: "1px solid #d7dde5", borderRadius: 12, padding: "6px 10px" }}>
          <input
            value={blueprint.meta.name ?? ""}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled PCB"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              padding: 0,
              margin: 0,
              fontFamily: "inherit",
            }}
          />
        </div>

        <ProcessCanvas blueprint={blueprint} onChange={setBlueprint} showHelpPanel={!isExporting} />
      </div>
    </div>
  );
}

function toolbarButton(primary = false): CSSProperties {
  return {
    border: primary ? "1px solid #0d4678" : "1px solid #cbd5e1",
    background: primary ? "#0d4678" : "#fff",
    color: primary ? "#fff" : "#334155",
    borderRadius: 10,
    padding: "9px 12px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
  };
}

function menuItemButton(): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "transparent",
    color: "#334155",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 500,
  };
}

function validationToggleStyle(open: boolean): CSSProperties {
  return {
    width: "100%",
    border: "none",
    borderBottom: open ? "1px solid #d7dde5" : undefined,
    background: open ? "#eef4f8" : "#f8fafc",
    color: open ? "#334155" : "#475569",
    cursor: "pointer",
    padding: "8px 12px",
    fontSize: 12,
    textAlign: "left",
    fontWeight: 700,
  };
}

function linkedCardStyle(): CSSProperties {
  return {
    background: "#f8fafc",
    border: "1px solid #d7dde5",
    borderRadius: 12,
    padding: "12px 14px",
  };
}


