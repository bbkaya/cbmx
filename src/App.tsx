import "./App.css";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";

export default function App() {
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
        <h1 style={{ margin: 0, fontSize: 20 }}>CBMX Blueprint Tool</h1>

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
        Goal: create, edit, and export CBMX blueprints (PNG/PDF). Next we’ll add the actual CBMX table layout.
      </p>

      <div
        id="cbmx-canvas"
        style={{
          marginTop: 16,
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 16,
          minHeight: 480,
          background: "white",
        }}
      >
        <strong>Canvas placeholder</strong>
        <div style={{ marginTop: 8, color: "#666" }}>
          In the next step, we will render the CBMX blueprint table here.
        </div>
      </div>
    </div>
  );
}