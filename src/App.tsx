import "./App.css";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import CBMXTable, { type CBMXBlueprint, validateCBMXBlueprint } from "./components/CBMXTable";
import { useMemo, useRef, useState } from "react";

const sampleBlueprint: CBMXBlueprint = {
  meta: { id: "cbmx-001", name: "Sample CBMX" },
  networkValueProposition: {
    statement: "Deliver an integrated solution through a collaborative network.",
  },
  actors: [
    {
      id: "A1",
      type: "Customer",
      name: "Actor 1 (Customer)",
      actorValueProposition: { statement: "Provides demand, feedback, and adoption." },
      costs: [{ type: "Financial", description: "Subscription fee" }],
      benefits: [{ type: "Social", description: "Improved accessibility" }],
      kpis: [{ name: "User satisfaction", rank: 1 }],
      services: [{ name: "Use service", operations: [{ name: "Request" }, { name: "Rate" }] }],
    },
    {
      id: "A2",
      type: "Orchestrator",
      name: "Actor 2 (Orchestrator)",
      actorValueProposition: { statement: "Coordinates actors and ensures service integration." },
      costs: [{ type: "OtherNonFinancial", description: "Coordination effort" }],
      benefits: [{ type: "Financial", description: "Orchestration fee" }],
      kpis: [{ name: "Network adoption", rank: 1 }],
      services: [{ name: "Orchestration", operations: [{ name: "Matchmaking" }] }],
    },
    {
      id: "A3",
      type: "Other",
      name: "Actor 3",
      actorValueProposition: { statement: "Provides complementary service capability." },
      costs: [{ type: "Environmental", description: "Operational footprint" }],
      benefits: [{ type: "Financial", description: "Usage-based revenue" }],
      kpis: [{ name: "Utilization", rank: 1 }],
      services: [{ name: "Service delivery", operations: [] }],
    },
    {
      id: "A4",
      type: "Other",
      name: "Actor 4",
      actorValueProposition: { statement: "Provides data/asset needed for delivery." },
      costs: [{ type: "Financial", description: "Integration cost" }],
      benefits: [{ type: "OtherNonFinancial", description: "Reputation uplift" }],
      kpis: [{ name: "Data quality", rank: 1 }],
      services: [{ name: "Data provision", operations: [{ name: "Publish" }] }],
    },
    {
      id: "A5",
      type: "Other",
      name: "Actor 5",
      actorValueProposition: { statement: "Provides support and maintenance." },
      costs: [{ type: "Social", description: "On-call load" }],
      benefits: [{ type: "Financial", description: "Support contract margin" }],
      kpis: [{ name: "SLA compliance", rank: 1 }],
      services: [{ name: "Support", operations: [{ name: "Resolve incidents" }] }],
    },
  ],
  coCreationProcesses: [
    { id: "P1", name: "Onboarding", participantActorIds: ["A1", "A2", "A4"] },
    { id: "P2", name: "Service delivery", participantActorIds: ["A1", "A2", "A3"] },
    { id: "P3", name: "Support & improvement", participantActorIds: ["A1", "A2", "A5"] },
  ],
};

export default function App() {
  // Canonical persisted blueprint
  const [blueprint, setBlueprint] = useState<CBMXBlueprint>(sampleBlueprint);

  // Draft for editing (what the table edits)
  const [draft, setDraft] = useState<CBMXBlueprint>(() => deepClone(sampleBlueprint));

  // file picker ref for import
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Dirtiness checks
  const blueprintHash = useMemo(() => stableHash(blueprint), [blueprint]);
  const draftHash = useMemo(() => stableHash(draft), [draft]);
  const isDirty = draftHash !== blueprintHash;

  // Keep validation tied to the draft (what user is editing)
  const issues = useMemo(() => validateCBMXBlueprint(draft), [draft]);
  const hasBlocking = issues.some((x) => x.level === "error");

  function newBlueprint() {
    const fresh = deepClone(sampleBlueprint);
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

  function exportJsonDraft() {
    const name = (draft.meta?.name ?? "cbmx-blueprint").trim() || "cbmx-blueprint";
    downloadJson(`${safeFilename(name)}-draft.json`, draft);
  }

  function exportJsonSaved() {
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

    // Minimal shape check
    const candidate = parsed as CBMXBlueprint;
    if (!candidate || !Array.isArray(candidate.actors)) {
      alert("Import failed: JSON does not look like a CBMX blueprint (missing actors array).");
      return;
    }

    // Validate; allow import even with warnings; block if errors? (I recommend allow, but Save will be disabled)
    const importedIssues = validateCBMXBlueprint(candidate);
    const importedErrors = importedIssues.filter((x) => x.level === "error");

    setDraft(deepClone(candidate));

    if (importedErrors.length > 0) {
      alert(
        `Imported with ${importedErrors.length} validation error(s). You can edit to fix them; Save will remain disabled until resolved.`
      );
    } else {
      alert("Import successful. Review and click Save to commit.");
    }
  }

  // ---------------- PNG/PDF Export ----------------

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

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>CBMX Blueprint Editor</h1>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={newBlueprint}>
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

          {/* JSON buttons */}
          <button type="button" onClick={exportJsonDraft}>
            Export JSON (Draft)
          </button>
          <button type="button" onClick={exportJsonSaved}>
            Export JSON (Saved)
          </button>
          <button type="button" onClick={openImportDialog}>
            Import JSON
          </button>

          <button type="button" onClick={exportPng}>
            Export PNG
          </button>
          <button type="button" onClick={exportPdf}>
            Export PDF
          </button>
        </div>
      </header>

      <p style={{ marginTop: 8, color: "#444" }}>Goal: create, edit, and export CBMX blueprints (PNG/PDF).</p>

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

function ValidationPanel({
  issues,
}: {
  issues: { level: "error" | "warning"; message: string }[];
}) {
  if (!issues || issues.length === 0) return null;

  const errors = issues.filter((x) => x.level === "error");
  const warnings = issues.filter((x) => x.level === "warning");

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
  // keep it simple and cross-platform
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 80) || "cbmx-blueprint";
}
