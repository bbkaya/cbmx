import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import CBMXTable from "./CBMXTable";
import { deepClone, type CBMXBlueprint, type ProcessCanvasLinkSummary } from "./cbmxDomain";

type ExportSnapshot = { blueprint: CBMXBlueprint; processLinks?: ProcessCanvasLinkSummary[] };

/** Reuse the matrix renderer, with no editor state, callbacks, or local field drafts. */
function renderExportTable(snapshot: ExportSnapshot): HTMLTableElement {
  const staging = document.createElement("div");
  const root = createRoot(staging);
  try {
    flushSync(() => root.render(createElement(CBMXTable, { ...deepClone(snapshot), presentation: "export" })));
    const table = staging.querySelector<HTMLTableElement>(".cbmx-table");
    if (!table) throw new Error("CBMX matrix not found.");
    return table.cloneNode(true) as HTMLTableElement;
  } finally {
    root.unmount();
  }
}

/** Capture the modelling table, independently of the editor viewport and help. */
export async function captureBlueprintPng(node: HTMLElement, snapshot: ExportSnapshot): Promise<string> {
  if (!snapshot?.blueprint) throw new Error("Committed CBMX blueprint is required for export.");
  const table = renderExportTable(snapshot);

  // Preserve the approved export geometry independently of responsive editing.
  const matrixWidth = Number.parseFloat(table.dataset.exportWidth ?? table.style.minWidth);
  if (!Number.isFinite(matrixWidth) || matrixWidth <= 0) {
    throw new Error("CBMX matrix export width is unavailable.");
  }

  const capture = document.createElement("div");
  capture.className = "cbmx-matrix cbmx-matrix--export";
  Object.assign(capture.style, {
    width: `${matrixWidth + 16}px`,
    position: "fixed",
    left: "-100000px",
    top: "0",
    fontFamily: getComputedStyle(node).fontFamily,
  });
  capture.setAttribute("aria-hidden", "true");
  capture.inert = true;
  // Only the independent read-only table enters the capture environment. The
  // original editor DOM, focus, open menus, and local drafts are never changed.
  const exportTable = table;
  exportTable.style.minWidth = `${matrixWidth}px`;
  const labelColumn = exportTable.querySelector<HTMLTableColElement>("col");
  if (labelColumn) labelColumn.style.width = "190px";
  capture.appendChild(exportTable);
  document.body.appendChild(capture);
  try {
    await document.fonts.ready;
    const bounds = capture.getBoundingClientRect();
    return await toPng(capture, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width: Math.ceil(Math.max(bounds.width, capture.scrollWidth)),
      height: Math.ceil(Math.max(bounds.height, capture.scrollHeight)),
      style: { position: "static", margin: "0", overflow: "visible" },
    });
  } finally {
    capture.remove();
  }
}

/** Keep the existing single landscape A4 page and proportional image fitting. */
export async function createBlueprintPdf(dataUrl: string): Promise<jsPDF> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for PDF export."));
    img.src = dataUrl;
  });

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min(pageWidth / img.width, pageHeight / img.height);
  const width = img.width * scale;
  const height = img.height * scale;
  pdf.addImage(dataUrl, "PNG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
  return pdf;
}
