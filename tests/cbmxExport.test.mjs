import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import { Window } from "happy-dom";

let server, window, captureBlueprintPng, createBlueprintPdf, rasterize;
let imageDimensions = { width: 1200, height: 900 };

before(async () => {
  window = new Window();
  for (const key of ["document", "HTMLElement", "HTMLTableElement"]) {
    Object.defineProperty(globalThis, key, { configurable: true, value: window[key] });
  }
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() } });
  globalThis.Image = class {
    constructor() { Object.assign(this, imageDimensions); }
    set src(value) { this.source = value; queueMicrotask(() => this.onload()); }
  };
  globalThis.__cbmxRasterize = (...args) => rasterize(...args);
  server = await createServer({ configFile: false, envFile: false,
    ssr: { noExternal: ["html-to-image", "jspdf"] },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "cbmx-export-boundaries", enforce: "pre", resolveId(source) {
      if (source === "html-to-image" || source === "jspdf") return `\0export-test-${source}`;
    }, load(id) {
      if (id === "\0export-test-html-to-image") return "export const toPng = (...args) => globalThis.__cbmxRasterize(...args);";
      if (id === "\0export-test-jspdf") return `export class jsPDF {
        internal = {pageSize:{getWidth:()=>841.89,getHeight:()=>595.28}};
        images=[]; constructor(options){this.options=options;}
        addImage(...args){this.images.push(args);}
      }`;
    } }],
  });
  ({ captureBlueprintPng, createBlueprintPdf } = await server.ssrLoadModule("/src/components/cbmx/cbmxExport.ts"));
});

after(async () => { await server?.close(); await window?.happyDOM.close(); });

for (const count of [2, 5, 10]) test(`${count}-actor capture excludes workspace and keeps canonical width, source DOM and scrolling`, async () => {
  const node = document.createElement("div");
  node.innerHTML = `<header>Toolbar</header><aside>Validation</aside><div class="cbmx-matrix">
    <div class="cbmx-matrix-scroll" style="overflow:auto;max-height:200px">
      <table class="cbmx-table" style="min-width:${190 + count * 210}px"><tbody>
        <tr><td>Network Value Proposition</td></tr><tr><td>Service Scenario</td></tr>
      </tbody></table></div><aside class="cbmx-help">Expanded help</aside></div>`;
  document.body.append(node);
  const scroller = node.querySelector(".cbmx-matrix-scroll");
  scroller.scrollLeft = 111; scroller.scrollTop = 222;
  const before = node.outerHTML;
  rasterize = async (capture, options) => {
    assert.equal(capture.style.width, `${190 + count * 210 + 16}px`);
    assert.equal(capture.children.length, 1);
    assert.ok(capture.firstElementChild.matches(".cbmx-table"));
    assert.equal(capture.querySelector(".cbmx-help,.cbmx-matrix-scroll,header,aside"), null);
    assert.ok(capture.textContent.includes("Service Scenario"));
    assert.equal(capture.inert, true);
    assert.equal(options.pixelRatio, 2);
    assert.equal(options.style.overflow, "visible");
    assert.equal(options.style.position, "static");
    return "data:image/png;base64,synthetic";
  };
  try {
    for (const viewportWidth of [400, 1440]) {
      node.style.width = `${viewportWidth}px`;
      await captureBlueprintPng(node);
    }
    node.style.removeProperty("width"); node.removeAttribute("style");
    assert.equal(node.outerHTML, before);
    assert.equal(scroller.scrollLeft, 111); assert.equal(scroller.scrollTop, 222);
    assert.equal(document.querySelector(".cbmx-matrix--export"), null);
  } finally { node.remove(); }
});

test("failed rasterization always removes its offscreen copy", async () => {
  const node = document.createElement("div");
  node.innerHTML = '<table class="cbmx-table" style="min-width:610px"></table>';
  rasterize = async () => { throw new Error("Synthetic capture failure"); };
  await assert.rejects(captureBlueprintPng(node), /Synthetic capture failure/);
  assert.equal(document.querySelector(".cbmx-matrix--export"), null);
  assert.ok(node.querySelector("table"));
});

test("a missing matrix is rejected without leaving a capture node", async () => {
  await assert.rejects(captureBlueprintPng(document.createElement("div")), /matrix not found/);
  assert.equal(document.querySelector(".cbmx-matrix--export"), null);
});

for (const dimensions of [{ width: 1252, height: 4200 }, { width: 2512, height: 2300 }, { width: 4612, height: 2300 }]) {
  test(`single-page PDF proportionally fits ${dimensions.width}×${dimensions.height} without cropping`, async () => {
    imageDimensions = dimensions;
    const pdf = await createBlueprintPdf("data:image/png;base64,synthetic");
    assert.equal(pdf.options.format, "a4"); assert.equal(pdf.options.orientation, "landscape");
    assert.equal(pdf.images.length, 1);
    const [, format, x, y, width, height] = pdf.images[0];
    assert.equal(format, "PNG"); assert.ok(x >= 0 && y >= 0);
    assert.ok(x + width <= 841.89 + 0.001 && y + height <= 595.28 + 0.001);
    assert.ok(Math.abs(width / height - dimensions.width / dimensions.height) < 0.000001);
  });
}
