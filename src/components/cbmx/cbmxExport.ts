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
    // Pin the laid-out table before sizing the image. Otherwise its 100% width
    // can grow again when the capture is enlarged to include an overflowing edge.
    const tableBounds = exportTable.getBoundingClientRect();
    exportTable.style.width = `${tableBounds.width || matrixWidth}px`;
    const bounds = capture.getBoundingClientRect();
    const styles = getComputedStyle(capture);
    let right = Math.max(bounds.width, matrixWidth + 16);
    let bottom = bounds.height;
    // Table layout and fractional column widths can extend beyond the wrapper's
    // integer scroll dimensions. Include actual cells and their wrapped content,
    // retaining the existing padding at the far edges rather than adding a fudge.
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    for (const element of exportTable.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      right = Math.max(right, rect.right - bounds.left + paddingRight);
      bottom = Math.max(bottom, rect.bottom - bounds.top + paddingBottom);
    }
    if (tableBounds.width || tableBounds.height) {
      right = Math.max(right, tableBounds.right - bounds.left + paddingRight);
      bottom = Math.max(bottom, tableBounds.bottom - bounds.top + paddingBottom);
    }
    right = Math.max(right, capture.scrollWidth);
    bottom = Math.max(bottom, capture.scrollHeight);
    const width = Math.ceil(right);
    const height = Math.ceil(bottom);
    capture.style.width = `${width}px`;
    capture.style.height = `${height}px`;
    return await toPng(capture, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width,
      height,
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
