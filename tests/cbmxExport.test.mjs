import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { act, createElement } from "react";
import { createServer } from "vite";
import { Window } from "happy-dom";

let server, window, captureBlueprintPng, createBlueprintPdf, rasterize, Table, createRoot;
let imageDimensions = { width: 1200, height: 900 };
const fixture = (count = 2, populated = true) => ({
  networkValueProposition: { statement: populated ? "Network value" : "" },
  actors: Array.from({ length: count }, (_, i) => ({ id: `A${i + 1}`, type: i === 0 ? "Customer" : i === 1 ? "Orchestrator" : "Other",
    name: `Actor ${i + 1}`, actorValueProposition: { statement: populated ? "Contribution" : "" },
    costs: [{ type: "Financial", description: "" }, ...populated ? [
      { type: "Financial", description: "Committed fee" }, { type: "Environmental", description: "Energy use" },
      { type: "Social", description: "Workload" }, { type: "OtherNonFinancial", description: "Coordination" },
    ] : []],
    benefits: [{ type: "Financial", description: populated ? "Savings" : "" }],
    kpis: populated ? [{ name: "Reliability (≥ 95%)", rank: 2 }, { name: "Satisfaction (≥ 4.5/5)", rank: 1 }] : [],
    services: [{ name: "", operations: [] }, ...populated ? [{ name: "Delivery", operations: [{ name: "Plan" }, { name: "Operate" }] }] : []],
  })),
  coCreationProcesses: populated ? [{ id: "P1", name: "Fulfil request", participantActorIds: ["A1", "A2"] }] : [],
  serviceScenario: populated ? "  First paragraph\n\nSecond paragraph\n<modelled text>" : "",
});
const snapshot = (count = 2, populated = true) => ({ blueprint: fixture(count, populated) });
const controls = 'button,input,textarea,select,[contenteditable],[tabindex],.cbmx-info,.cbmx-help,.cbmx-editable-trigger,.cbmx-editor-actions,.cbmx-add-item,.cbmx-remove-item,.cbmx-add-actor,.cbmx-remove-actor,.cbmx-pcb-button';

before(async () => {
  window = new Window();
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLTableElement", "HTMLInputElement", "HTMLTextAreaElement", "Node", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() } });
  globalThis.Image = class {
    constructor() { Object.assign(this, imageDimensions); }
    set src(value) { this.source = value; queueMicrotask(() => this.onload()); }
  };
  ({ createRoot } = await import("react-dom/client"));
  globalThis.__cbmxRasterize = (...args) => rasterize(...args);
  server = await createServer({ configFile: false, envFile: false, esbuild: { jsx: "automatic" },
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
  Table = (await server.ssrLoadModule('/src/components/cbmx/CBMXTable.tsx')).default;
});
after(async () => { await server?.close(); await window?.happyDOM.close(); });
const capture = async (node, data) => {
  let result;
  await act(async () => { result = await captureBlueprintPng(node, data); });
  return result;
};

for (const count of [2, 5, 10]) test(`${count}-actor capture is clean, canonical and independent of source DOM, help and scrolling`, async () => {
  const node = document.createElement("div");
  node.innerHTML = `<header>Toolbar</header><aside>Validation</aside><div class="cbmx-matrix">
    <div class="cbmx-matrix-scroll" style="overflow:auto;max-height:200px">
      <table class="cbmx-table" style="min-width:1190px"><tbody><tr><td>Editor only <input value="LOCAL DRAFT"></td></tr></tbody></table>
    </div><aside class="cbmx-help">Expanded help</aside></div>`;
  document.body.append(node);
  const scroller = node.querySelector(".cbmx-matrix-scroll");
  scroller.scrollLeft = 111; scroller.scrollTop = 222;
  const before = node.outerHTML;
  rasterize = async (exportNode, options) => {
    assert.equal(exportNode.style.width, `${190 + count * 210 + 16}px`);
    assert.equal(exportNode.children.length, 1);
    assert.ok(exportNode.firstElementChild.matches(".cbmx-table"));
    assert.equal(exportNode.querySelector(`${controls},.cbmx-matrix-scroll,header,aside`), null);
    assert.equal(exportNode.querySelectorAll('.cbmx-row--actor > td').length, count + 1);
    assert.ok(exportNode.textContent.includes("Second paragraph"));
    assert.ok(!exportNode.textContent.includes("LOCAL DRAFT"));
    assert.equal(exportNode.inert, true); assert.equal(options.pixelRatio, 2);
    assert.equal(options.style.overflow, "visible"); assert.equal(options.style.position, "static");
    return "data:image/png;base64,synthetic";
  };
  try {
    for (const viewportWidth of [400, 1440]) {
      node.style.width = `${viewportWidth}px`;
      await capture(node, snapshot(count));
    }
    node.style.removeProperty("width"); node.removeAttribute("style");
    assert.equal(node.outerHTML, before); assert.equal(scroller.scrollLeft, 111); assert.equal(scroller.scrollTop, 222);
    assert.equal(document.querySelector(".cbmx-matrix--export"), null);
  } finally { node.remove(); }
});

for (const count of Array.from({ length: 9 }, (_, index) => index + 2)) {
  test(`${count} actors: capture encloses fractional last-cell and bottom-content bounds beyond wrapper scroll dimensions`, async () => {
    const original = window.HTMLElement.prototype.getBoundingClientRect;
    const canonical = 190 + count * 210 + 16;
    const origin = -100000;
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
      if (this.matches('.cbmx-matrix--export')) return rect(origin, 0, canonical, 800);
      if (this.matches('table.cbmx-table')) return rect(origin + 8, 8, canonical - 16 + 0.125, 784.25);
      if (this.matches('.cbmx-row--Financial td:last-child')) return rect(origin + canonical - 100, 300, 103.375, 55);
      if (this.matches('.cbmx-row--serviceScenario td:last-child div')) return rect(origin + 204, 750, 300, 58.625);
      return original.call(this);
    };
    // scrollWidth/scrollHeight are zero in happy-dom: a wrapper-only measurement
    // cannot see either overflow. This explicitly fails the old capture code.
    rasterize = async (node, options) => {
      assert.equal(options.width, canonical + 4);
      assert.equal(options.height, 809);
      assert.equal(node.style.width, `${options.width}px`);
      assert.equal(node.style.height, `${options.height}px`);
      assert.equal(node.querySelector('table').style.width, `${canonical - 16 + 0.125}px`);
      for (const element of [node.querySelector('table'), ...node.querySelectorAll('table *')]) {
        const r = element.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        assert.ok(r.right - origin <= options.width, element.tagName + ' right edge');
        assert.ok(r.bottom <= options.height, element.tagName + ' bottom edge');
      }
      assert.equal(options.pixelRatio, 2);
      return 'data:image/png;base64,synthetic';
    };
    try { await capture(document.createElement('div'), snapshot(count)); }
    finally { window.HTMLElement.prototype.getBoundingClientRect = original; }
  });
}

test('export retains computed right and bottom padding when the table exceeds its wrapper', async () => {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const left = -100000;
    if (this.matches('.cbmx-matrix--export')) {
      this.style.padding = '8px';
      return { left, top: 0, width: 626, height: 800, right: left + 626, bottom: 800 };
    }
    if (this.matches('table.cbmx-table')) return { left: left + 8, top: 8, width: 622.25, height: 799.125, right: left + 630.25, bottom: 807.125 };
    return original.call(this);
  };
  rasterize = async (node, options) => {
    assert.equal(options.width, 639); assert.equal(options.height, 816);
    return 'data:image/png;base64,synthetic';
  };
  try { await capture(document.createElement('div'), snapshot()); }
  finally { window.HTMLElement.prototype.getBoundingClientRect = original; }
});

test("failed rasterization always removes its offscreen copy", async () => {
  const node = document.createElement("div");
  rasterize = async () => { throw new Error("Synthetic capture failure"); };
  await assert.rejects(capture(node, snapshot()), /Synthetic capture failure/);
  assert.equal(document.querySelector(".cbmx-matrix--export"), null);
});

test("export requires committed blueprint data instead of falling back to editor HTML", async () => {
  const node = document.createElement('div'); node.innerHTML = '<table class="cbmx-table"></table>';
  await assert.rejects(capture(node), /Committed CBMX blueprint is required/);
  assert.equal(document.querySelector(".cbmx-matrix--export"), null);
});

test("responsive editor widths never change the approved export table geometry", async () => {
  const node = document.createElement("div");
  node.innerHTML = '<table class="cbmx-table" data-export-width="1240" style="min-width:1190px"><colgroup><col style="width:174px"></colgroup></table>';
  rasterize = async (exportNode) => {
    assert.equal(exportNode.style.width, "1256px");
    assert.equal(exportNode.querySelector("table").style.minWidth, "1240px");
    assert.equal(exportNode.querySelector("col").style.width, "190px");
    return "data:image/png;base64,synthetic";
  };
  await capture(node, snapshot(5));
  assert.equal(node.querySelector("table").style.minWidth, "1190px"); assert.equal(node.querySelector("col").style.width, "174px");
});

for (const dimensions of [{ width: 1252, height: 4200 }, { width: 2512, height: 2300 }, { width: 4612, height: 2300 }]) {
  test(`single-page PDF proportionally fits ${dimensions.width}×${dimensions.height} without cropping`, async () => {
    imageDimensions = dimensions;
    const pdf = await createBlueprintPdf("data:image/png;base64,synthetic");
    assert.equal(pdf.options.format, "a4"); assert.equal(pdf.options.orientation, "landscape"); assert.equal(pdf.images.length, 1);
    const [, format, x, y, width, height] = pdf.images[0];
    assert.equal(format, "PNG"); assert.ok(x >= 0 && y >= 0);
    assert.ok(x + width <= 841.89 + 0.001 && y + height <= 595.28 + 0.001);
    assert.ok(Math.abs(width / height - dimensions.width / dimensions.height) < 0.000001);
  });
}

for (const count of [2, 5, 10]) for (const populated of [false, true]) test(`${count} actors, ${populated ? 'populated' : 'empty'}: retain structural rows, content, icons and numbering without placeholders`, async () => {
  const data = snapshot(count, populated); const before = JSON.stringify(data);
  rasterize = async exportNode => {
    assert.equal(exportNode.querySelector(controls), null);
    assert.equal(exportNode.querySelectorAll('tbody > tr').length, 13);
    assert.equal(exportNode.querySelectorAll('.cbmx-row-icon').length, 15);
    assert.equal(exportNode.querySelector('.cbmx-row--serviceScenario td:last-child').colSpan, count * 2);
    assert.equal(exportNode.querySelectorAll('.cbmx-row--Financial > td').length, 1 + count * 2);
    assert.equal(exportNode.querySelectorAll('.cbmx-row-label--category').length, 4);
    assert.ok(!exportNode.textContent.includes('…')); assert.ok(!exportNode.textContent.includes('Click to edit'));
    if (populated) {
      for (const text of ['Network value', 'Contribution', 'Committed fee', 'Energy use', 'Workload', 'Coordination', 'Savings', 'Satisfaction (≥ 4.5/5)', 'Reliability (≥ 95%)', 'Delivery', ' (Plan, Operate)', 'Fulfil request', ' (Actor 1, Actor 2)', 'Second paragraph', '<modelled text>'])
        assert.ok(exportNode.textContent.includes(text), text);
      assert.deepEqual([...exportNode.querySelector('.cbmx-row--kpis td:nth-child(2)').querySelectorAll('.cbmx-item-marker')].map(e => e.textContent), ['1.', '2.']);
      assert.equal(exportNode.querySelector('.cbmx-row--serviceScenario td:last-child div').style.whiteSpace, 'pre-wrap');
    } else {
      for (const selector of ['.cbmx-row--Financial','.cbmx-row--Environmental','.cbmx-row--Social','.cbmx-row--OtherNonFinancial','.cbmx-row--kpis','.cbmx-row--services','.cbmx-row--processes'])
        assert.equal(exportNode.querySelector(`${selector} td:nth-child(2)`).textContent, '');
    }
    return 'data:image/png;base64,synthetic';
  };
  await capture(document.createElement('div'), data); assert.equal(JSON.stringify(data), before);
});

for (const role of ['owner','editor','viewer']) test(`authorized ${role} PCB name is retained while unauthorized and inconsistent access flags reveal no name`, async () => {
  const data = snapshot();
  data.blueprint.coCreationProcesses.push({ id: 'P2', name: 'Restricted process', participantActorIds: [] }, { id: 'P3', name: 'Uncertain process', participantActorIds: [] });
  data.processLinks = [
    { cbmx_process_id: 'P1', link_exists: true, has_pcb_access: true, pcb_access_role: role, process_canvas_blueprint_name: 'Visible canvas' },
    { cbmx_process_id: 'P2', link_exists: true, has_pcb_access: false, pcb_access_role: 'owner', process_canvas_blueprint_name: 'SECRET no access' },
    { cbmx_process_id: 'P3', link_exists: true, has_pcb_access: true, pcb_access_role: null, process_canvas_blueprint_name: 'SECRET no role' },
  ];
  rasterize = async exportNode => {
    assert.match(exportNode.textContent, /Visible canvas/); assert.ok(!exportNode.outerHTML.includes('SECRET'));
    assert.equal(exportNode.querySelector(controls), null); return 'data:image/png;base64,synthetic';
  };
  await capture(document.createElement('div'), data);
});

test('legacy blank process placeholders are omitted, retaining participants and authorized associations', async () => {
  const data = snapshot(); data.blueprint.coCreationProcesses = [
    { id: 'P0', name: '', participantActorIds: [] }, { id: 'P1', name: '', participantActorIds: ['A1'] },
    { id: 'P2', name: '', participantActorIds: [] },
  ];
  data.processLinks = [{ cbmx_process_id: 'P2', link_exists: true, has_pcb_access: true, pcb_access_role: 'viewer', process_canvas_blueprint_name: 'Existing association' }];
  rasterize = async exportNode => {
    assert.equal(exportNode.querySelectorAll('.cbmx-process-row').length, 2);
    assert.ok(!exportNode.textContent.includes('Unnamed process')); assert.match(exportNode.textContent, /Actor 1/);
    assert.match(exportNode.textContent, /Existing association/); return 'data:image/png;base64,synthetic';
  };
  await capture(document.createElement('div'), data);
});

test('an active editor keeps drafts, focus, scrolling, help and menu while export uses committed values only', async () => {
  const data = snapshot(); const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  let notifications = 0;
  try {
    await act(async () => root.render(createElement(Table, { ...data, onChange: () => { notifications++; } })));
    const activate = async text => act(async () => [...node.querySelectorAll('[title="Click to edit"]')].find(e => e.textContent === text).click());
    await activate('Actor 1');
    const actorInput = node.querySelector('.cbmx-row--actor input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(actorInput, 'UNCOMMITTED ACTOR');
      actorInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await activate('Fulfil request (Actor 1, Actor 2)');
    const processInput = node.querySelector('.cbmx-row--processes input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(processInput, 'UNCOMMITTED PROCESS (Actor 1)');
      processInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await activate('Committed fee');
    const input = node.querySelector('.cbmx-row--Financial input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'UNCOMMITTED OUTCOME');
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      node.querySelector('[aria-label="Open help panel"]').click();
      node.querySelector('.cbmx-pcb-button').click();
    });
    await act(async () => node.querySelector('.cbmx-row--services .cbmx-add-item').click());
    const addition = node.querySelector('.cbmx-row--services input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(addition, 'UNCOMMITTED SERVICE');
      addition.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await activate(data.blueprint.serviceScenario);
    const textarea = node.querySelector('textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'UNCOMMITTED SCENARIO');
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    textarea.focus(); textarea.setSelectionRange(2, 7); const scroller = node.querySelector('.cbmx-matrix-scroll'); scroller.scrollLeft = 77; scroller.scrollTop = 33;
    const original = node.outerHTML;
    rasterize = async exportNode => {
      assert.equal(exportNode.querySelector(controls), null); assert.ok(!exportNode.outerHTML.includes('UNCOMMITTED'));
      assert.match(exportNode.textContent, /Committed fee/); assert.match(exportNode.textContent, /Second paragraph/);
      return 'data:image/png;base64,synthetic';
    };
    await capture(node, data);
    assert.equal(node.outerHTML, original); assert.equal(actorInput.value, 'UNCOMMITTED ACTOR'); assert.equal(processInput.value, 'UNCOMMITTED PROCESS (Actor 1)');
    assert.equal(input.value, 'UNCOMMITTED OUTCOME'); assert.equal(addition.value, 'UNCOMMITTED SERVICE');
    assert.equal(textarea.value, 'UNCOMMITTED SCENARIO'); assert.equal(document.activeElement, textarea); assert.equal(textarea.selectionStart, 2); assert.equal(textarea.selectionEnd, 7);
    assert.equal(scroller.scrollLeft, 77); assert.equal(scroller.scrollTop, 33); assert.equal(notifications, 0);
    assert.ok(node.querySelector('[aria-label="Collapse tips panel"]')); assert.ok(node.querySelector('[role="menu"]'));
  } finally { await act(async () => root.unmount()); node.remove(); }
});
