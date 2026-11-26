import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

/** Capture the modelling table, independently of the editor viewport and help. */
export async function captureBlueprintPng(node: HTMLElement): Promise<string> {
  const table = node.querySelector<HTMLTableElement>(".cbmx-table");
  if (!table) throw new Error("CBMX matrix not found.");

  // CBMXTable derives this width from its label column and actor count. Using
  // it instead of viewport bounds also keeps wrapping identical across exports.
  const matrixWidth = Number.parseFloat(table.style.minWidth);
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
    fontFamily: getComputedStyle(table).fontFamily,
  });
  capture.setAttribute("aria-hidden", "true");
  capture.inert = true;
  // No workspace ancestor is copied: scrolling containers, help, toolbar and
  // validation cannot constrain the capture or appear in the generated image.
  capture.appendChild(table.cloneNode(true));
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
