import "./App.css";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import CBMXTable, { type CBMXBlueprint, validateCBMXBlueprint } from "./components/cbmx/CBMXTable";
import { useEffect, useMemo, useRef, useState } from "react";

type ValidationIssue = { level: "error" | "warning"; message: string };

function makeBlankActor(idNum: number) {
  const id = `A${idNum}`;
  return {
    id,
    type: "Other" as const,
    name: "Click to edit",
    actorValueProposition: { statement: "Click to edit" },

    costs: [{ type: "Financial" as const, description: "Click to edit" }],
    benefits: [{ type: "Financial" as const, description: "Click to edit" }],

    kpis: [],
    services: [
      {
        name: "Click to edit",
        operations: [],
      },
    ],
  };
}

const starterBlueprint: CBMXBlueprint = {
  meta: { id: "cbmx-new", name: "New CBMX Blueprint" },
  networkValueProposition: {
    statement: "Click to edit",
  },
  actors: [makeBlankActor(1), makeBlankActor(2), makeBlankActor(3), makeBlankActor(4), makeBlankActor(5)],

  coCreationProcesses: [
    {
      name: "Click to edit",
      participantActorIds: ["A1", "A2", "A3", "A4", "A5"],
    },
  ],
};

export default function App() {
  // Canonical persisted blueprint
  const [blueprint, setBlueprint] = useState<CBMXBlueprint>(starterBlueprint);

  // Draft for editing (what the table edits)
  const [draft, setDraft] = useState<CBMXBlueprint>(() => deepClone(starterBlueprint));

  // JSON import file input
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Actions menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Dirtiness checks
  const blueprintHash = useMemo(() => stableHash(blueprint), [blueprint]);
  const draftHash = useMemo(() => stableHash(draft), [draft]);
  const isDirty = draftHash !== blueprintHash;

  // Validation tied to draft
  const issues = useMemo<ValidationIssue[]>(() => validateCBMXBlueprint(draft), [draft]);
  const hasBlocking = issues.some((x: ValidationIssue) => x.level === "error");

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

  function newBlueprint() {
    const fresh = deepClone(starterBlueprint);
    setBlueprint(fresh);
    setDraft(deepClone(fresh));
  }

  function saveDraft() {
    if (hasBlocking) return;
    const committed = deepClone(draft);
    setBlueprint(committed);
    setDraft(deepClone(committed));
  }

  function discardDraft() {
    setDraft(deepClone(blueprint));
  }

  // -------- Import/Export gating rule --------
  // Only allowed when there are no unsaved changes.
  const ioEnabled = !isDirty;

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

  function exportJsonSaved() {
    // Only export the committed/saved blueprint
    const name = (blueprint.meta?.name ?? "cbmx-blueprint").trim() || "cbmx-blueprint";
    downloadJson(`${safeFilename(name)}.json`, blueprint);
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

    // Load into draft (not into saved blueprint)
    setDraft(deepClone(candidate));

    const importedIssues: ValidationIssue[] = validateCBMXBlueprint(candidate);
    const importedErrors = importedIssues.filter((x: ValidationIssue) => x.level === "error");

    if (importedErrors.length > 0) {
      alert(
        `Import completed with ${importedErrors.length} validation error(s). Fix them; then click Save to commit.`
      );
    } else {
      alert("Import successful. Review and click Save to commit.");
    }
  }

  // ---------------- PNG/PDF Export ----------------
  // Export should reflect what is on screen. But per your rule, we only allow it when saved/no unsaved changes.
  async function exportPng() {
    const node = document.getElementById("cbmx-canvas");
    if (!node) {
      alert("Canvas not found.");
      return;
    }
    const dataUrl = await toPng(node, { pixelRatio: 2 });
    const link = document.createElement("a");
    link.download = "cbmx-blueprint.png";
    link.href = dataUrl;
    link.click();
  }

  async function exportPdf() {
    const node = document.getElementById("cbmx-canvas");
    if (!node) {
      alert("Canvas not found.");
      return;
    }

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

  // ---------------- New button confirmation flow ----------------
  function confirmNew() {
    // If nothing to lose, just reset immediately
    if (!isDirty) {
      newBlueprint();
      return;
    }

    // 1) Confirm discard
    const discard = window.confirm(
      "Start a new model?\n\nYou have unsaved changes. This will discard them."
    );

    if (discard) {
      newBlueprint();
      return;
    }

    // 2) Offer export of the SAVED blueprint (per your gating rule)
    const exportFirst = window.confirm(
      "Do you want to export the current saved model to a JSON file first?"
    );

    if (!exportFirst) return;

    exportJsonSaved();

    // Optional follow-up: after export, ask again whether to start new
    const discardAfterExport = window.confirm(
      "Exported.\n\nStart a new model now? This will discard your unsaved changes."
    );

    if (discardAfterExport) {
      newBlueprint();
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>CBMX Blueprint Editor</h1>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={confirmNew}>
            New
          </button>

          <button type="button" onClick={discardDraft} disabled={!isDirty}>
            Discard changes
          </button>

          <button
            type="button"
            onClick={saveDraft}
            disabled={!isDirty || hasBlocking}
            title={hasBlocking ? "Fix validation errors before saving." : undefined}
          >
            Save
          </button>

          <span style={{ color: isDirty ? "#b45309" : "#15803d", fontSize: 12 }}>
            {isDirty ? "Unsaved changes" : "All changes saved"}
          </span>

          {/* Actions (kebab) menu */}
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={ioEnabled ? "Import/Export" : "Save or discard changes before importing/exporting."}
              style={{
                width: 34,
                height: 34,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                lineHeight: 1,
                borderRadius: 8,
              }}
            >
              ⋯
            </button>

            {menuOpen ? (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 40,
                  minWidth: 220,
                  background: "white",
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                  padding: 6,
                  zIndex: 50,
                }}
              >
                <MenuItem disabled={!ioEnabled} label="Export JSON" onClick={() => runMenuAction(exportJsonSaved)} />
                <MenuItem disabled={!ioEnabled} label="Export PNG" onClick={() => runMenuAction(exportPng)} />
                <MenuItem disabled={!ioEnabled} label="Export PDF" onClick={() => runMenuAction(exportPdf)} />

                <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />

                <MenuItem disabled={!ioEnabled} label="Import JSON" onClick={() => runMenuAction(openImportDialog)} />

                {!ioEnabled ? (
                  <div style={{ padding: "6px 10px", fontSize: 12, color: "#b45309" }}>
                    Save or discard changes first.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <ValidationPanel issues={issues} />

      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // allow importing same file twice
          e.currentTarget.value = "";
          if (file) void handleImportFile(file);
        }}
      />

      <div
        id="cbmx-canvas"
        style={{
          marginTop: 16,
          display: "inline-block",
          background: "white",
        }}
      >
        {/* Table edits the DRAFT, not the committed blueprint */}
        <CBMXTable blueprint={draft} actorCount={5} onChange={setDraft} />
      </div>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
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
        borderRadius: 8,
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

  const errors = issues.filter((x: ValidationIssue) => x.level === "error");
  const warnings = issues.filter((x: ValidationIssue) => x.level === "warning");

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: 12,
        maxWidth: 1100,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>Validation</div>
        {errors.length > 0 ? (
          <div style={{ color: "#b91c1c", fontSize: 12 }}>{errors.length} error(s) — Save disabled</div>
        ) : (
          <div style={{ color: "#15803d", fontSize: 12 }}>No blocking errors</div>
        )}
        {warnings.length > 0 ? (
          <div style={{ color: "#b45309", fontSize: 12 }}>{warnings.length} warning(s)</div>
        ) : null}
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
