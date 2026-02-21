import "./App.css";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import CBMXTable, { type CBMXBlueprint } from "./components/CBMXTable";
import { useState } from "react";

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
  const [blueprint, setBlueprint] = useState<CBMXBlueprint>(sampleBlueprint);
  
  async function exportPng() {
    const node = document.getElementById("cbmx-canvas");
    if (!node) {
      alert("Canvas not found.");
      return;
    }

    // higher pixel density for sharper exports
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

  // Capture the canvas as an image
  const dataUrl = await toPng(node, { pixelRatio: 2 });

  // Create an A4 landscape PDF (good default for wide tables)
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // We need the image dimensions to scale it to fit the page
  const img = new Image();
  img.src = dataUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for PDF export."));
  });

  const imgWidth = img.width;
  const imgHeight = img.height;

  // Fit image into page while preserving aspect ratio
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

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => alert("New blueprint (next step)")}>
          New
        </button>
        <button type="button" onClick={exportPng}>
          Export PNG
        </button>
        <button type="button" onClick={exportPdf}>
          Export PDF
        </button>
      </div>
    </header>

    <p style={{ marginTop: 8, color: "#444" }}>
      Goal: create, edit, and export CBMX blueprints (PNG/PDF).
    </p>

    {/* This wrapper is what your export code captures */}
    <div
      id="cbmx-canvas"
      style={{
        marginTop: 16,
        display: "inline-block", // important: export only the table width, not full page
        background: "white",
      }}
    >
      <CBMXTable blueprint={blueprint} actorCount={5} onChange={setBlueprint} />
    </div>
  </div>
);
}
