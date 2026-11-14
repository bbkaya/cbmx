import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createServer } from "vite";

let server, window, root, container, createRoot, MemoryRouter, Routes, Route, EditorPage, domain, mutators;
let row, links, calls, alerts, rpcOverride, availableCanvases, blueprintRole, createdCanvas;
const blueprint = () => ({
  meta: { id: "test", name: "Test" }, networkValueProposition: { statement: "Value" },
  actors: ["Customer", "Orchestrator"].map((type, i) => ({ id: `A${i + 1}`, type, name: `Actor ${i + 1}`,
    actorValueProposition: { statement: "Value" }, costs: [{ type: "Financial", description: "Cost" }],
    benefits: [{ type: "Financial", description: "Benefit" }], kpis: [], services: [] })),
  coCreationProcesses: [{ id: "P1", name: "Delivery", participantActorIds: ["A1", "A2"] }],
});
const linked = (access = "owner") => [{ cbmx_process_id: "P1", link_exists: true,
  process_canvas_blueprint_id: "canvas-id", process_canvas_blueprint_name: access ? "Delivery Canvas" : null,
  has_pcb_access: Boolean(access), pcb_access_role: access }];
const ok = (data) => ({ data: structuredClone(data), error: null });
async function defaultRpc(name, args) {
  if (name === "list_cbmx_process_links_with_access") return ok(links);
  if (name === "get_cbmx_process_canvas_options") {
    const current = links.find(link => link.cbmx_process_id === args.p_cbmx_process_id);
    if (current && !["owner", "editor"].includes(current.pcb_access_role)) return { data: null, error: { code: "42501" } };
    return ok({ current_canvas: current ? { id: current.process_canvas_blueprint_id, name: current.process_canvas_blueprint_name } : null,
      canvases: availableCanvases.filter(canvas => !links.some(link => link.process_canvas_blueprint_id === canvas.id)) });
  }
  if (["link_available_cbmx_process_canvas", "upsert_cbmx_process_link"].includes(name)) {
    const current = links.find(link => link.cbmx_process_id === args.p_cbmx_process_id);
    if (name === "link_available_cbmx_process_canvas" && (current?.process_canvas_blueprint_id ?? null) !== args.p_expected_current_pcb_id)
      return { data: null, error: { code: "40001" } };
    const canvas = [...availableCanvases, ...(createdCanvas ? [createdCanvas] : [])].find(canvas => canvas.id === args.p_process_canvas_blueprint_id);
    if (!canvas) return { data: null, error: { code: "23505" } };
    links = links.filter(link => link.cbmx_process_id !== args.p_cbmx_process_id);
    links.push({ cbmx_process_id: args.p_cbmx_process_id, link_exists: true, process_canvas_blueprint_id: canvas.id,
      process_canvas_blueprint_name: canvas.name, has_pcb_access: true, pcb_access_role: canvas.role || "owner" });
    return ok([]);
  }
  if (name === "unlink_cbmx_process_link") { links = links.filter(link => link.cbmx_process_id !== args.p_cbmx_process_id); return ok([]); }
  if (["save_blueprint_with_version", "delete_cbmx_process_with_version"].includes(name)) {
    assert.equal(args.p_loaded_version_no, row.version_no);
    row.blueprint_json = structuredClone(args.p_blueprint_json);
    row.name = args.p_name; row.version_no++;
    if (name === "delete_cbmx_process_with_version") {
      // Frontend must send an intact draft; deletion occurs only in the RPC.
      assert.ok(row.blueprint_json.coCreationProcesses.some(p => p.id === args.p_process_id));
      row.blueprint_json.coCreationProcesses = row.blueprint_json.coCreationProcesses.filter(p => p.id !== args.p_process_id);
      links = links.filter(l => l.cbmx_process_id !== args.p_process_id);
    }
    return ok([{ ...row, ok: true, reason: "ok" }]);
  }
  throw new Error("Unexpected RPC: " + name);
}
before(async () => {
  window = new Window({ url: "http://localhost/app/editor/test-id" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Node", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.alert = (message) => alerts.push(message);
  globalThis.__processTestRpc = async (name, args) => {
    calls.push({ name, args: structuredClone(args) });
    return rpcOverride ? await rpcOverride(name, args) : await defaultRpc(name, args);
  };
  globalThis.__processTestFrom = (table) => {
    const query = { select() { return query; }, eq() { return query; }, ilike() { return query; },
      insert(value) { assert.equal(table, "process_canvas_blueprints"); createdCanvas = { ...value, id: "created-canvas", role: "owner" }; return query; },
      single: async () => ok(table === "process_canvas_blueprints" ? createdCanvas : row),
      maybeSingle: async () => ok({ role: table === "blueprint_members" ? blueprintRole : "owner" }),
      then(resolve, reject) { return Promise.resolve(ok(table === "blueprints" ? [{ id: row.id, name: row.name }] : [])).then(resolve, reject); },
    };
    return query;
  };
  ({ createRoot } = await import("react-dom/client"));
  ({ MemoryRouter, Routes, Route } = await import("react-router-dom"));
  server = await createServer({ configFile: false, envFile: false, esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "process-test-boundaries", enforce: "pre", resolveId(source) {
      if (source.endsWith("/auth")) return "\0process-test-auth";
      if (source.endsWith("/supabaseClient")) return "\0process-test-supabase";
    }, load(id) {
      if (id === "\0process-test-auth") return `export function useAuth() { return {user:{id:'owner-id'}}; }`;
      if (id === "\0process-test-supabase") return `export const supabase = { rpc: (...args) => globalThis.__processTestRpc(...args), from: (...args) => globalThis.__processTestFrom(...args) };`;
    } }],
  });
  EditorPage = (await server.ssrLoadModule("/src/pages/EditorPage.tsx")).default;
  domain = await server.ssrLoadModule("/src/components/cbmx/cbmxDomain.ts");
  mutators = await server.ssrLoadModule("/src/components/cbmx/cbmxMutators.ts");
});
beforeEach(() => {
  row = { id: "test-id", name: "Test", owner_user_id: "owner-id", blueprint_json: blueprint(),
    version_no: 1, updated_at: "2026-11-14T12:00:00Z", updated_by_user_id: "owner-id" };
  links = []; calls = []; alerts = []; rpcOverride = null;
  blueprintRole = "owner"; createdCanvas = null;
  availableCanvases = [{ id: "canvas-z", name: "Zulu", role: "owner" },
    { id: "canvas-owned", name: "Alpha", role: "owner" }, { id: "canvas-editor", name: "Alpha", role: "editor" }];
  window.prompt = () => assert.fail("Selection must not use text prompts");
  window.confirm = () => false;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(async () => { await server?.close(); await window?.happyDOM.close(); });
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
const button = (label, scope = container) => [...scope.querySelectorAll("button")].find(b => b.textContent === label);
const click = async (element) => { assert.ok(element, "control exists"); await act(async () => element.click()); await flush(); };
const change = async (element, value) => { assert.ok(element); await act(async () => {
  const prototype = element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
}); };
const input = () => container.querySelector('input[aria-label="Co-creation process"]');
const writes = () => calls.filter(c => !["list_cbmx_process_links_with_access", "get_cbmx_process_canvas_options"].includes(c.name));
async function mount() {
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/app/editor/test-id"] },
    createElement(Routes, null, createElement(Route, { path: "/app/editor/:blueprintId", element: createElement(EditorPage) }),
      createElement(Route, { path: "/app/pcb/:pcbId", element: createElement("div", null, "Process Canvas editor") })))));
  await flush();
}
const edit = async () => click([...container.querySelectorAll("button[title='Click to edit']")].find(b => b.textContent.startsWith("Delivery")));
const waitForAutosave = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 1300)); }); await flush(); };

for (const associated of [false, true]) test(`rename ${associated ? "linked" : "unlinked"} process and reload preserve ID and actors`, async () => {
  links = associated ? linked() : []; await mount(); await edit();
  assert.ok(button("Rename")); assert.ok(button("Delete")); assert.equal(button("Save"), undefined);
  await change(input(), "Dispatch (Actor 2)"); await click(button("Rename")); await waitForAutosave();
  assert.deepEqual(row.blueprint_json.coCreationProcesses, [{ id: "P1", name: "Dispatch", participantActorIds: ["A2"] }]);
  assert.deepEqual(links, associated ? linked() : []); assert.equal(writes()[0].name, "save_blueprint_with_version");
  await act(async () => root.unmount()); root = createRoot(container); await mount();
  assert.ok(container.textContent.includes("Dispatch (Actor 2)"));
});
test("blank/whitespace/actor-only Rename cannot delete or commit; Cancel restores original", async () => {
  links = linked(); await mount(); await edit();
  for (const value of ["", "   ", " (Actor 1)"]) {
    await change(input(), value); await click(button("Rename"));
    assert.ok(input()); assert.match(container.querySelector('[role="alert"]').textContent, /Enter a co-creation process name/);
  }
  await click(button("Cancel")); assert.equal(input(), null); assert.ok(container.textContent.includes("Delivery (Actor 1, Actor 2)"));
  assert.equal(writes().length, 0); assert.deepEqual(links, linked());
});
test("unlinked deletion works with a cleared field and reloads without confirmation", async () => {
  await mount(); await edit(); await change(input(), ""); await click(button("Delete"));
  assert.equal(container.querySelector("dialog"), null); assert.deepEqual(row.blueprint_json.coCreationProcesses, []);
  assert.equal(writes()[0].args.p_process_id, "P1"); assert.equal(writes()[0].args.p_expected_pcb_id, null);
  await act(async () => root.unmount()); root = createRoot(container); await mount();
  assert.ok(!container.textContent.includes("Delivery"));
});
test("linked deletion cancel preserves both artifacts; autosave waits for confirmation", async () => {
  links = linked(); await mount();
  await change(container.querySelector('input[aria-label="Blueprint name"]'), "Draft name");
  await edit(); await change(input(), ""); await click(button("Delete"));
  const dialog = container.querySelector("dialog"); assert.ok(dialog);
  assert.match(dialog.textContent, /Delete co-creation process\?/); assert.match(dialog.textContent, /"Delivery"/);
  assert.match(dialog.textContent, /"Delivery Canvas"/); assert.match(dialog.textContent, /Keep the Process Canvas and all its contents unchanged/);
  await waitForAutosave(); assert.equal(writes().length, 0); assert.equal(row.blueprint_json.coCreationProcesses.length, 1);
  await click(button("Cancel", dialog));
  assert.deepEqual(links, linked()); assert.equal(row.blueprint_json.coCreationProcesses.length, 1);
  assert.ok(input(), "remain in editing mode after cancelled deletion");
});
test("linked confirmation deletes only via atomic RPC and new Add uses an unused ID", async () => {
  links = linked(); await mount(); await edit(); await change(input(), ""); await click(button("Delete"));
  await click(button("Delete process", container.querySelector("dialog")));
  assert.deepEqual(links, []); assert.deepEqual(row.blueprint_json.coCreationProcesses, []);
  assert.equal(writes().length, 1); assert.equal(writes()[0].name, "delete_cbmx_process_with_version");
  assert.equal(writes()[0].args.p_expected_pcb_id, "canvas-id");
  await click([...container.querySelectorAll("button[title='Click to edit']")][0]);
  assert.ok(button("Add")); assert.equal(button("Delete"), undefined); assert.equal(button("Rename"), undefined);
  await click(button("Add")); assert.ok(input()); assert.ok(container.querySelector('[role="alert"]'));
  await change(input(), "New (Actor 1)"); await click(button("Add")); await waitForAutosave();
  assert.match(row.blueprint_json.coCreationProcesses[0].id, /^P-[0-9a-f-]{36}$/);
  assert.notEqual(row.blueprint_json.coCreationProcesses[0].id, "P1"); assert.deepEqual(links, []);
});
for (const access of [null, "viewer"]) test(`deletion with ${access ?? "no"} PCB access exposes no hidden name and keeps everything`, async () => {
  links = linked(access); await mount(); await edit(); await click(button("Delete"));
  assert.equal(container.querySelector("dialog"), null); assert.equal(writes().length, 0);
  assert.match(container.querySelector('[role="alert"]').textContent, /requires edit access/);
  if (!access) assert.ok(!container.textContent.includes("Delivery Canvas"));
  assert.equal(row.blueprint_json.coCreationProcesses.length, 1); assert.equal(links.length, 1);
});
for (const failure of ["stale", "network", "preflight", "missing RPC"]) test(`${failure} deletion failure preserves draft and association`, async () => {
  links = linked(); await mount();
  if (failure === "stale") await change(container.querySelector('input[aria-label="Blueprint name"]'), "Unsaved draft");
  rpcOverride = (name, args) => {
    if (name === "list_cbmx_process_links_with_access") return failure === "preflight"
      ? { data: null, error: { message: "Could not check links" } } : ok(links);
    if (failure === "stale") return ok([{ ok: false, reason: "stale" }]);
    if (failure === "network") return { data: null, error: { message: "Database unavailable" } };
    if (failure === "missing RPC") return { data: null, error: {
      code: "PGRST202", message: "Could not find the function public.delete_cbmx_process_with_version in the schema cache",
    } };
    return defaultRpc(name, args);
  };
  await edit(); await click(button("Delete"));
  if (failure !== "preflight") await click(button("Delete process", container.querySelector("dialog")));
  assert.ok(input()); assert.ok(container.querySelector('[role="alert"]'));
  assert.ok(container.textContent.includes("Delivery")); assert.equal(links.length, 1); assert.equal(row.blueprint_json.coCreationProcesses.length, 1);
  if (failure === "missing RPC") {
    assert.match(container.querySelector('[role="alert"]').textContent, /Safe process deletion is not available yet/);
    assert.ok(!container.textContent.includes("schema cache"));
    assert.equal(writes().length, 1, "do not fall back to separate unlink/save operations");
    assert.equal(writes()[0].name, "delete_cbmx_process_with_version");
  }
  if (failure === "stale") {
    await waitForAutosave(); assert.equal(writes().length, 1, "stale draft must not be autosaved or silently reloaded");
    assert.equal(container.querySelector('input[aria-label="Blueprint name"]').value, "Unsaved draft");
    await click(button("Reload latest (discard local edits)"));
    assert.equal(container.querySelector('input[aria-label="Blueprint name"]').value, "Test");
  }
});
test("mutators reject blank names, use stable IDs after reorder, and imports refresh unknown IDs", () => {
  const bp = blueprint(); bp.coCreationProcesses.push({ id: "P2", name: "Support", participantActorIds: [] });
  bp.coCreationProcesses.reverse();
  mutators.renameProcessById(bp, "P1", "Dispatch (A2)");
  assert.equal(bp.coCreationProcesses[1].name, "Dispatch"); assert.equal(bp.coCreationProcesses[1].id, "P1");
  const before = structuredClone(bp);
  for (const value of ["", "  ", " (Actor 1)"]) assert.throws(() => mutators.setProcessSlot(bp, 1, value), /process name/);
  assert.deepEqual(bp, before);
  const imported = blueprint(); imported.coCreationProcesses.push({ id: "P3", name: "New" });
  domain.assignNewImportedProcessIds(imported, bp);
  assert.equal(imported.coCreationProcesses[0].id, "P1"); assert.notEqual(imported.coCreationProcesses[1].id, "P3");
  const id = domain.makeNewProcessId([]); assert.notEqual(domain.makeNewProcessId([]), id);
});

async function importJSON(json) {
  const element = container.querySelector('input[type="file"]');
  Object.defineProperty(element, "files", { configurable: true, value: [{ text: async () => JSON.stringify(json) }] });
  await act(async () => element.dispatchEvent(new window.Event("change", { bubbles: true })));
  await flush();
}
test("JSON import cannot remove a linked process, including a link added since loading", async () => {
  await mount(); links = linked();
  const imported = blueprint(); imported.coCreationProcesses = [];
  await importJSON(imported);
  assert.match(alerts[0], /Delete that process explicitly first/);
  assert.equal(writes().length, 0); assert.equal(row.blueprint_json.coCreationProcesses.length, 1);
  assert.ok(container.textContent.includes("Delivery"));
});
test("JSON import preserves existing IDs/links and replaces newly introduced legacy IDs", async () => {
  links = linked(); await mount();
  const imported = blueprint(); imported.coCreationProcesses.push({ id: "P3", name: "Support", participantActorIds: [] });
  await importJSON(imported);
  assert.equal(row.blueprint_json.coCreationProcesses[0].id, "P1");
  assert.match(row.blueprint_json.coCreationProcesses[1].id, /^P-[0-9a-f-]{36}$/);
  assert.deepEqual(links, linked()); assert.ok(alerts.includes("Import successful and saved to the repository."));
});
test("failed JSON replacement never stages a process removal for autosave", async () => {
  await mount();
  rpcOverride = (name, args) => {
    if (name === "save_blueprint_with_version") {
      links = linked(); // Another client linked this process after the import preflight.
      return { data: null, error: { message: "Delete linked co-creation processes explicitly" } };
    }
    return defaultRpc(name, args);
  };
  await importJSON({ ...blueprint(), coCreationProcesses: [] });
  assert.ok(container.textContent.includes("Delivery (Actor 1, Actor 2)"));
  assert.equal(row.blueprint_json.coCreationProcesses.length, 1); assert.equal(links.length, 1);
  await waitForAutosave(); assert.equal(writes().length, 1);
  assert.ok(alerts.some(message => message.includes("Import could not be saved")));
});
test("fresh database link check overrides an initially empty frontend cache", async () => {
  await mount(); links = linked(); await edit(); await click(button("Delete"));
  assert.ok(container.querySelector("dialog")); assert.equal(writes().length, 0);
  await click(button("Cancel", container.querySelector("dialog")));
});
test("deletion cannot race an in-flight autosave", async () => {
  await mount(); await edit();
  let release;
  rpcOverride = (name, args) => name === "save_blueprint_with_version"
    ? new Promise(resolve => { release = () => resolve(defaultRpc(name, args)); }) : defaultRpc(name, args);
  await change(container.querySelector('input[aria-label="Blueprint name"]'), "Changed");
  await waitForAutosave(); assert.equal(typeof release, "function");
  await click(button("Delete"));
  assert.match(container.querySelector('[role="alert"]').textContent, /save is in progress/);
  assert.equal(calls.filter(c => c.name === "delete_cbmx_process_with_version").length, 0);
  await act(async () => release()); await flush();
});

const selection = () => container.querySelector("dialog select");
async function openCanvasSelection() {
  await click(button("Process Canvas ▾"));
  await click(button(links.some(link => link.cbmx_process_id === "P1") ? "Relink to existing Canvas" : "Link existing Canvas"));
}
for (const role of ["owner", "editor"]) test(`${role} of CBMX can choose an owned or shared Editor Canvas by ID`, async () => {
  blueprintRole = role;
  if (role === "editor") row.owner_user_id = "another-owner";
  await mount(); await openCanvasSelection();
  const dialog = container.querySelector("dialog");
  assert.match(dialog.textContent, /Link Existing Process Canvas/); assert.match(dialog.textContent, /Co-creation process: Delivery/);
  assert.equal(selection().value, ""); assert.equal(button("Link Canvas").disabled, true);
  const options = [...selection().options];
  assert.equal(options[0].textContent, "Select a Process Canvas...");
  assert.deepEqual(options.slice(1).map(option => option.value), ["canvas-editor", "canvas-owned", "canvas-z"]);
  assert.match(options[1].textContent, /Alpha.*Shared as Editor.*canvas-editor/);
  assert.match(options[2].textContent, /Alpha.*Owned by you.*canvas-owned/);
  await change(selection(), role === "owner" ? "canvas-owned" : "canvas-editor");
  assert.equal(button("Link Canvas").disabled, false); await click(button("Link Canvas"));
  assert.equal(container.querySelector("dialog"), null);
  const call = writes()[0]; assert.equal(call.name, "link_available_cbmx_process_canvas");
  assert.equal(call.args.p_process_canvas_blueprint_id, role === "owner" ? "canvas-owned" : "canvas-editor");
  assert.equal(call.args.p_expected_current_pcb_id, null);
  assert.ok(container.textContent.includes("PCB: Alpha"));
});
test("relink shows current Canvas separately and replaces the association without unlinking or editing the process", async () => {
  links = linked(); const original = structuredClone(row.blueprint_json); await mount(); await openCanvasSelection();
  assert.match(container.querySelector("dialog").textContent, /Relink Process Canvas/);
  assert.match(container.querySelector("dialog").textContent, /Currently linked Canvas: Delivery Canvas/);
  assert.equal([...selection().options].some(option => option.value === "canvas-id"), false);
  assert.match(container.querySelector("dialog label").textContent, /Select replacement Process Canvas/);
  await change(selection(), "canvas-editor"); await click(button("Relink Canvas"));
  assert.equal(links[0].process_canvas_blueprint_id, "canvas-editor");
  assert.equal(writes().length, 1); assert.equal(writes()[0].args.p_expected_current_pcb_id, "canvas-id");
  assert.deepEqual(row.blueprint_json, original); assert.equal(row.version_no, 1);
});
for (const relink of [false, true]) test(`Cancel or Escape ${relink ? "relinking" : "linking"} makes no mutation`, async () => {
  links = relink ? linked() : []; const before = structuredClone(links); await mount(); await openCanvasSelection();
  await change(selection(), "canvas-z"); await click(button("Cancel", container.querySelector("dialog")));
  assert.equal(container.querySelector("dialog"), null); assert.deepEqual(links, before); assert.equal(writes().length, 0);
  await openCanvasSelection();
  await act(async () => container.querySelector("dialog").dispatchEvent(new window.Event("cancel", { cancelable: true })));
  assert.equal(container.querySelector("dialog"), null); assert.deepEqual(links, before); assert.equal(writes().length, 0);
});
test("empty selection shows the requested explanation, no dropdown, and a disabled Link button", async () => {
  availableCanvases = []; await mount(); await openCanvasSelection();
  assert.equal(selection(), null);
  assert.ok(container.querySelector("dialog").textContent.includes("No available Process Canvases were found. You can create a new Process Canvas or request editor access to an existing unlinked Canvas."));
  assert.equal(button("Link Canvas").disabled, true);
});
for (const code of ["23505", "42501", "40001", "23503", "XX000"]) test(`${code} relink failure leaves the original association and supports reloading options`, async () => {
  links = linked(); await mount(); await openCanvasSelection(); await change(selection(), "canvas-owned");
  rpcOverride = (name, args) => name === "link_available_cbmx_process_canvas" ? { data: null, error: { code } } : defaultRpc(name, args);
  await click(button("Relink Canvas"));
  assert.ok(container.querySelector("dialog")); assert.deepEqual(links, linked());
  assert.ok(container.querySelector('dialog [role="alert"]'));
  assert.equal(writes().length, 1); assert.equal(writes()[0].name, "link_available_cbmx_process_canvas");
  availableCanvases = availableCanvases.filter(canvas => canvas.id !== "canvas-owned");
  await click(button("Reload list")); assert.equal(selection().value, ""); assert.equal(button("Relink Canvas").disabled, true);
  assert.equal([...selection().options].some(option => option.value === "canvas-owned"), false);
});
test("missing migration or revoked access shows an actionable load error without disclosing a current Canvas name", async () => {
  for (const code of ["PGRST202", "42501"]) {
    links = linked(); await mount();
    rpcOverride = (name, args) => name === "get_cbmx_process_canvas_options" ? { data: null, error: { code } } : defaultRpc(name, args);
    await openCanvasSelection(); const dialog = container.querySelector("dialog");
    assert.ok(dialog.querySelector('[role="alert"]')); assert.equal(selection(), null);
    assert.ok(!dialog.textContent.includes("Delivery Canvas")); assert.equal(button("Relink Canvas").disabled, true);
    await click(button("Cancel", dialog));
    await act(async () => root.unmount()); root = createRoot(container); rpcOverride = null;
  }
});
test("loading can be cancelled and a late result cannot reopen the selection dialog", async () => {
  await mount(); let release;
  rpcOverride = (name, args) => name === "get_cbmx_process_canvas_options"
    ? new Promise(resolve => { release = () => resolve(defaultRpc(name, args)); }) : defaultRpc(name, args);
  await openCanvasSelection(); assert.match(container.querySelector('dialog [role="status"]').textContent, /Loading/);
  assert.equal(button("Link Canvas").disabled, true); await click(button("Cancel", container.querySelector("dialog")));
  await act(async () => release()); await flush(); assert.equal(container.querySelector("dialog"), null);
});
test("a current association deleted while the dialog is open requires reloading before linking", async () => {
  links = linked(); await mount(); await openCanvasSelection(); await change(selection(), "canvas-z"); links = [];
  await click(button("Relink Canvas")); assert.match(container.querySelector('dialog [role="alert"]').textContent, /association changed/);
  assert.deepEqual(links, []); await click(button("Reload list"));
  assert.match(container.querySelector("dialog h2").textContent, /Link Existing Process Canvas/);
  assert.equal(selection().value, "");
});
test("double submission is blocked while relinking", async () => {
  links = linked(); await mount(); await openCanvasSelection(); await change(selection(), "canvas-z"); let release;
  rpcOverride = (name, args) => name === "link_available_cbmx_process_canvas"
    ? new Promise(resolve => { release = () => resolve(defaultRpc(name, args)); }) : defaultRpc(name, args);
  await click(button("Relink Canvas")); assert.equal(button("Linking…").disabled, true);
  await act(async () => { container.querySelector("dialog form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
  assert.equal(writes().length, 1); await act(async () => release()); await flush(); assert.equal(container.querySelector("dialog"), null);
});
test("autosave continues while the selection dialog is open, without creating an association on cancel", async () => {
  await mount(); await change(container.querySelector('input[aria-label="Blueprint name"]'), "Updated blueprint");
  await openCanvasSelection(); await waitForAutosave(); assert.equal(row.name, "Updated blueprint");
  await click(button("Cancel", container.querySelector("dialog"))); assert.deepEqual(links, []);
  assert.deepEqual(writes().map(call => call.name), ["save_blueprint_with_version"]);
});
test("CBMX viewers still cannot link and PCB viewers cannot relink through the menu", async () => {
  row.owner_user_id = "another-owner"; blueprintRole = "viewer"; await mount(); assert.equal(button("Process Canvas ▾"), undefined);
  await act(async () => root.unmount()); root = createRoot(container); blueprintRole = "owner"; row.owner_user_id = "owner-id";
  links = linked("viewer"); await mount(); await click(button("Process Canvas ▾"));
  assert.equal(button("Relink to existing Canvas"), undefined); assert.ok(button("Open linked Canvas"));
});
test("Open linked Canvas and Unlink retain their existing actions", async () => {
  links = linked(); await mount(); await click(button("Process Canvas ▾")); await click(button("Open linked Canvas"));
  assert.match(container.textContent, /Process Canvas editor/); assert.equal(writes().length, 0);
  await act(async () => root.unmount()); root = createRoot(container); await mount();
  window.confirm = () => true; await click(button("Process Canvas ▾")); await click(button("Remove link"));
  assert.deepEqual(links, []); assert.equal(writes()[0].name, "unlink_cbmx_process_link");
});
test("Create Process Canvas keeps the existing creation and upsert workflow", async () => {
  await mount(); window.prompt = () => "New Canvas"; await click(button("Process Canvas ▾")); await click(button("Create Process Canvas"));
  assert.equal(createdCanvas.name, "New Canvas"); assert.equal(writes()[0].name, "upsert_cbmx_process_link");
  assert.equal(writes()[0].args.p_process_canvas_blueprint_id, "created-canvas"); assert.match(container.textContent, /Process Canvas editor/);
});
test("a failed link-status refresh preserves cached links and explains how to reload the committed association", async () => {
  links = linked(); await mount(); await openCanvasSelection(); await change(selection(), "canvas-z");
  rpcOverride = (name, args) => name === "list_cbmx_process_links_with_access"
    ? { data: null, error: { message: "Network unavailable" } } : defaultRpc(name, args);
  await click(button("Relink Canvas")); assert.equal(links[0].process_canvas_blueprint_id, "canvas-z");
  assert.equal(container.querySelector("dialog"), null); assert.ok(container.textContent.includes("PCB: Delivery Canvas"));
  assert.ok(alerts.some(message => message.includes("Reload the blueprint to see the current association")));
  assert.equal(writes().length, 1);
});
