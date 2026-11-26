import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act, createElement, useState } from "react";
import { Window } from "happy-dom";
import { createServer } from "vite";

let window, server, root, container, createRoot, Table, mutators, bp, notifications, replace;
const fixture = () => ({ actors: [1, 2].map((n) => ({ id: `A${n}`, type: n === 1 ? "Customer" : "Orchestrator", name: `Actor ${n}`,
  actorValueProposition: { statement: "Value" }, costs: [{ type: "Financial", description: "" }],
  benefits: [{ type: "Financial", description: "" }], kpis: [], services: [] })), coCreationProcesses: [] });
before(async () => {
  window = new Window({ url: "http://localhost/synthetic" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Node", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({ configFile: false, envFile: false, esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  Table = (await server.ssrLoadModule("/src/components/cbmx/CBMXTable.tsx")).default;
  mutators = await server.ssrLoadModule("/src/components/cbmx/cbmxMutators.ts");
});
beforeEach(() => { bp = fixture(); notifications = []; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(async () => { await server?.close(); await window?.happyDOM.close(); });
function Harness({ readOnly = false, onDeleteProcess, processLinks }) {
  const [value, setValue] = useState(bp); replace = setValue;
  return createElement(Table, { blueprint: value, onDeleteProcess, processLinks, onChange: readOnly ? undefined : next => {
    notifications.push(next); bp = next; setValue(next);
  } });
}
const mount = async props => act(async () => root.render(createElement(Harness, props)));
const list = label => [...container.querySelectorAll(".cbmx-item-list")].find(element => element.getAttribute("aria-label") === label);
const button = (parent, text) => [...parent.querySelectorAll("button")].find(element => element.textContent === text);
const click = async element => { assert.ok(element, "control exists"); await act(async () => element.click()); };
const key = async (element, key, options = {}) => act(async () => element.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })));
const change = async (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
});
const cost = () => list("Financial cost for Actor 1");
const input = parent => parent.querySelector("input");
const item = (parent, index) => parent.querySelectorAll("[data-item-key]")[index];
const edit = async (parent, index) => click(item(parent, index).querySelector('[title="Click to edit"]'));
const remove = async (parent, index) => click(item(parent, index).querySelector(".cbmx-remove-item"));

for (const [kind, label, addLabel, value] of [
  ["costs", "Financial cost", "+ Add cost", "New expense"],
  ["benefits", "Financial benefit", "+ Add benefit", "New gain"],
  ["kpis", "KPI", "+ Add KPI", "Reliability (≥ 99%)"],
  ["services", "Service", "+ Add service", "Delivery (Plan, Operate)"],
]) for (const populated of [false, true]) test(`${kind}: add to ${populated ? "populated" : "empty"} list commits once, with local-only drafts`, async () => {
  if (populated) mutators.appendActorItem(bp, "A1", kind, mutators.actorListRevision(bp.actors[0], kind), "Existing", "Financial");
  await mount(); const parent = list(`${label} for Actor 1`); const original = JSON.stringify(bp);
  await click(button(parent, addLabel)); assert.equal(input(parent).value, ""); assert.equal(JSON.stringify(bp), original); assert.equal(notifications.length, 0);
  assert.equal(parent.lastElementChild.textContent, addLabel); assert.ok(parent.lastElementChild.disabled);
  await change(input(parent), value); assert.equal(JSON.stringify(bp), original); assert.equal(notifications.length, 0);
  const field = input(parent);
  await act(async () => { for (let n = 0; n < 2; n++) field.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  assert.equal(notifications.length, 1); assert.equal(input(parent), null); assert.equal(document.activeElement, button(parent, addLabel));
  const record = bp.actors[0][kind].at(-1);
  if (kind === "services") assert.deepEqual(record, { name: "Delivery", operations: [{ name: "Plan" }, { name: "Operate" }] });
  else assert.equal(record.description ?? record.name, value);
});

for (const method of ["Cancel", "Escape", "empty"]) test(`${method} addition leaves JSON and change notifications untouched`, async () => {
  await mount(); const original = JSON.stringify(bp); const parent = cost();
  await click(button(parent, "+ Add cost"));
  if (method !== "empty") await change(input(parent), "Uncommitted");
  if (method === "Cancel") await click(button(parent, "Cancel"));
  else await key(input(parent), method === "Escape" ? "Escape" : "Enter");
  assert.equal(JSON.stringify(bp), original); assert.equal(notifications.length, 0);
  if (method === "empty") { assert.ok(input(parent)); assert.ok(parent.querySelector('[role="alert"]')); }
  else assert.equal(document.activeElement, button(parent, "+ Add cost"));
});

test("all eight outcome cells have one contextual Add; blank legacy arrays remain untouched", async () => {
  bp.actors[0].costs.push({ type: "Social", description: "  " }); const original = JSON.stringify(bp); await mount();
  assert.equal(container.querySelectorAll('.cbmx-add-item').length, 2 * 10 + 1);
  assert.equal(container.querySelectorAll('.cbmx-item').length, 0);
  assert.equal(container.querySelectorAll('.cbmx-item-marker').length, 0);
  assert.equal(JSON.stringify(bp), original); assert.equal(notifications.length, 0);
});

test("interleaved categories, blank records and duplicate descriptions target exact source indexes", async () => {
  bp.actors[0].costs = [
    { type: "Social", description: "Other category" }, { type: "Financial", description: "" },
    { type: "Financial", description: "Duplicate" }, { type: "Environmental", description: "Energy" },
    { type: "Financial", description: "Duplicate" },
  ];
  await mount(); await edit(cost(), 1); await change(input(cost()), "Second duplicate updated"); await key(input(cost()), "Enter");
  assert.deepEqual(bp.actors[0].costs.map(x => x.description), ["Other category", "", "Duplicate", "Energy", "Second duplicate updated"]);
  assert.equal(document.activeElement.textContent, "Second duplicate updated");
  await remove(cost(), 0); assert.deepEqual(bp.actors[0].costs.map(x => x.description), ["Other category", "", "Energy", "Second duplicate updated"]);
});

test("duplicate KPI names and ranks retain rank order, source targeting and contiguous visible numbering", async () => {
  bp.actors[0].kpis = [{ name: "Duplicate", rank: 4 }, { name: "", rank: 0 }, { name: "First", rank: 1 }, { name: "Duplicate", rank: 4 }];
  await mount(); const parent = list("KPI for Actor 1");
  assert.deepEqual([...parent.querySelectorAll('.cbmx-item-marker')].map(x => x.textContent), ["1.", "2.", "3."]);
  await edit(parent, 2); await change(input(parent), "Last changed"); await key(input(parent), "Enter");
  assert.deepEqual(bp.actors[0].kpis, [{ name: "Duplicate", rank: 4 }, { name: "", rank: 0 }, { name: "First", rank: 1 }, { name: "Last changed", rank: 4 }]);
  await remove(parent, 1); assert.equal(bp.actors[0].kpis[0].name, ""); assert.equal(bp.actors[0].kpis.at(-1).name, "Last changed");
  assert.deepEqual([...parent.querySelectorAll('.cbmx-item-marker')].map(x => x.textContent), ["1.", "2."]);
  await click(button(parent, "+ Add KPI")); await change(input(parent), "Newest (target)"); await key(input(parent), "Enter");
  assert.equal(bp.actors[0].kpis.at(-1).rank, 5);
});

test("services preserve operation parsing and remove the selected duplicate after hidden blanks", async () => {
  bp.actors[0].services = [{ name: "", operations: [] }, { name: "Same", operations: [] }, { name: "Same", operations: [] }];
  await mount(); const parent = list("Service for Actor 1");
  await edit(parent, 1); await change(input(parent), "Same ( Assess, , Deliver )"); await key(input(parent), "Enter");
  assert.deepEqual(bp.actors[0].services[2], { name: "Same", operations: [{ name: "Assess" }, { name: "Deliver" }] });
  await remove(parent, 1); assert.deepEqual(bp.actors[0].services, [{ name: "", operations: [] }, { name: "Same", operations: [] }]);
  await click(button(parent, "+ Add service")); await change(input(parent), "(Operation only)"); await key(input(parent), "Enter");
  assert.equal(bp.actors[0].services.length, 2); assert.ok(parent.querySelector('[role="alert"]'));
});

test("removing the last populated outcome retains the required internal blank Financial record", async () => {
  bp.actors[0].costs = [{ type: "Social", description: "Effort" }]; await mount();
  await remove(list("Social cost for Actor 1"), 0);
  assert.deepEqual(bp.actors[0].costs, [{ type: "Financial", description: "" }]); assert.equal(cost().querySelector('.cbmx-item'), null);
});

for (const operation of ["remove", "add", "update", "external"]) test(`${operation} invalidates another active draft instead of moving it to a neighbour`, async () => {
  bp.actors[0].costs = ["First", "Second", "Third"].map(description => ({ type: "Financial", description }));
  await mount(); await edit(cost(), 1); await change(input(cost()), "Local second draft"); const staleInput = input(cost());
  if (operation === "remove") await remove(cost(), 0);
  if (operation === "add") { await click(button(cost(), "+ Add cost")); const fields = cost().querySelectorAll('input'); await change(fields[1], "Fourth"); await key(fields[1], "Enter"); }
  if (operation === "update") { await edit(cost(), 0); const field = cost().querySelectorAll('input')[0]; await change(field, "Changed first"); await key(field, "Enter"); }
  if (operation === "external") { const external = structuredClone(bp); external.actors[0].costs.reverse(); await act(async () => replace(external)); bp = external; }
  assert.equal(input(cost()), null); assert.match(cost().querySelector('[role="status"]').textContent, /Uncommitted edits were cancelled/);
  assert.ok(!JSON.stringify(bp).includes("Local second draft"));
  await key(staleInput, "Enter"); assert.ok(!JSON.stringify(bp).includes("Local second draft"));
});

test("an unrelated list change preserves a local draft; its subsequent commit uses the latest blueprint", async () => {
  bp.actors[0].costs = [{ type: "Financial", description: "Fee" }]; await mount(); await edit(cost(), 0); await change(input(cost()), "Updated fee");
  const kpis = list("KPI for Actor 1"); await click(button(kpis, "+ Add KPI")); await change(input(kpis), "Target"); await key(input(kpis), "Enter");
  assert.equal(input(cost()).value, "Updated fee"); await key(input(cost()), "Enter");
  assert.equal(bp.actors[0].kpis[0].name, "Target"); assert.equal(bp.actors[0].costs[0].description, "Updated fee");
});

test("same-batch deletion then stale commit cannot resurrect or overwrite any source item", async () => {
  bp.actors[0].costs = ["First", "Second"].map(description => ({ type: "Financial", description }));
  await mount(); await edit(cost(), 1); await change(input(cost()), "Stale draft"); const stale = input(cost());
  await act(async () => {
    item(cost(), 0).querySelector('.cbmx-remove-item').click();
    stale.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  assert.equal(notifications.length, 1); assert.deepEqual(bp.actors[0].costs, [{ type: "Financial", description: "Second" }]);
});

test("external list changes cancel local additions with no change notification", async () => {
  await mount(); await click(button(cost(), "+ Add cost")); await change(input(cost()), "Local addition");
  const external = structuredClone(bp); external.actors[0].costs.push({ type: "Financial", description: "External" });
  await act(async () => replace(external));
  assert.equal(input(cost()), null); assert.match(cost().textContent, /Uncommitted edits were cancelled/); assert.equal(notifications.length, 0);
});

test("process addition validates before generating an ID, retains participant parsing and stable identity", async () => {
  await mount(); const parent = list("Co-creation processes"); const original = JSON.stringify(bp);
  await click(button(parent, "+ Add process")); assert.equal(JSON.stringify(bp), original);
  await key(input(parent), "Enter"); assert.equal(notifications.length, 0);
  await change(input(parent), "Delivery (Actor 1, A2, Actor 1, Unknown)"); await key(input(parent), "Enter");
  const id = bp.coCreationProcesses[0].id; assert.match(id, /^P-[0-9a-f-]{36}$/);
  assert.deepEqual(bp.coCreationProcesses[0].participantActorIds, ["A1", "A2"]);
  await edit(parent, 0); assert.ok(button(parent, "Rename")); await change(input(parent), "Renamed (A2)"); await key(input(parent), "Enter");
  assert.deepEqual(bp.coCreationProcesses[0], { id, name: "Renamed", participantActorIds: ["A2"] });
});

test("legacy blank linked process remains identifiable, renameable and uses only specialized Delete", async () => {
  bp.coCreationProcesses = [{ id: "legacy-process", name: "", participantActorIds: [] }]; const deleted = [];
  await mount({ processLinks: [{ cbmx_process_id: "legacy-process", link_exists: true, has_pcb_access: false }],
    onDeleteProcess: async id => { deleted.push(id); return false; } }); const parent = list("Co-creation processes");
  assert.match(parent.textContent, /Linked PCB \(no access\)/);
  assert.match(parent.textContent, /Unnamed process \(legacy-process\)/); assert.equal(parent.querySelector('.cbmx-remove-item'), null);
  await edit(parent, 0); await click(button(parent, "Delete")); assert.deepEqual(deleted, ["legacy-process"]);
  assert.equal(notifications.length, 0); assert.ok(input(parent)); await change(input(parent), "Recovered"); await click(button(parent, "Rename"));
  assert.equal(bp.coCreationProcesses[0].id, "legacy-process"); assert.equal(bp.coCreationProcesses[0].name, "Recovered");
});

test("participant actor renames invalidate process drafts rather than silently dropping participants", async () => {
  bp.coCreationProcesses = [{ id: "P1", name: "Delivery", participantActorIds: ["A1"] }]; await mount();
  const parent = list("Co-creation processes"); await edit(parent, 0);
  const external = structuredClone(bp); external.actors[0].name = "Renamed actor"; await act(async () => replace(external));
  assert.equal(input(parent), null); assert.match(parent.textContent, /Uncommitted edits were cancelled/); assert.equal(notifications.length, 0);
});

test("read-only lists display only populated data and no add, remove, or editing controls", async () => {
  bp.actors[0].costs.push({ type: "Financial", description: "Fee" }); await mount({ readOnly: true });
  assert.match(cost().textContent, /Fee/); assert.equal(container.querySelector('.cbmx-add-item,.cbmx-remove-item,[title="Click to edit"],input'), null);
});

test("snapshot guard rejects outdated indexes even for byte-identical duplicate records", () => {
  bp.actors[0].kpis = [{ name: "Same", rank: 1 }, { name: "Same", rank: 1 }];
  const revision = mutators.actorListRevision(bp.actors[0], "kpis");
  mutators.removeActorItem(bp, "A1", "kpis", revision, 0);
  assert.throws(() => mutators.editActorItem(bp, "A1", "kpis", revision, 1, "Wrong"), /list changed/);
  assert.deepEqual(bp.actors[0].kpis, [{ name: "Same", rank: 1 }]);
});

test("raw empty arrays use raw source snapshots rather than synthetic normalization records", async () => {
  bp.actors[0].costs = []; bp.actors[0].benefits = []; const original = JSON.stringify(bp); await mount();
  assert.equal(JSON.stringify(bp), original); await click(button(cost(), "+ Add cost")); await change(input(cost()), "Fee"); await key(input(cost()), "Enter");
  assert.deepEqual(bp.actors[0].costs, [{ type: "Financial", description: "Fee" }]);
  assert.deepEqual(bp.actors[0].benefits, [{ type: "Financial", description: "" }]);
});

test("cancelling a process addition creates neither a process nor a blueprint notification", async () => {
  await mount(); const parent = list("Co-creation processes"); await click(button(parent, "+ Add process"));
  await change(input(parent), "Not persisted (A1)"); await key(input(parent), "Escape");
  assert.deepEqual(bp.coCreationProcesses, []); assert.equal(notifications.length, 0);
  assert.equal(document.activeElement, button(parent, "+ Add process"));
});

test("removing an item currently being edited discards that draft without changing its neighbour", async () => {
  bp.actors[0].costs = ["First", "Second"].map(description => ({ type: "Financial", description }));
  await mount(); await edit(cost(), 0); await change(input(cost()), "Unsaved first"); await remove(cost(), 0);
  assert.deepEqual(bp.actors[0].costs, [{ type: "Financial", description: "Second" }]); assert.equal(input(cost()), null);
  assert.equal(document.activeElement.textContent, "Second");
});

test("guarded append has no artificial item limit and preserves all legacy blank entries", () => {
  for (let n = 0; n < 30; n++) mutators.appendActorItem(bp, "A1", "costs", mutators.actorListRevision(bp.actors[0], "costs"), `Expense ${n}`, "Financial");
  assert.equal(bp.actors[0].costs.length, 31); assert.equal(bp.actors[0].costs[0].description, "");
  assert.equal(bp.actors[0].costs.at(-1).description, "Expense 29");
});

test("focus restoration runs once and does not steal focus after a later change to another outcome category", async () => {
  bp.actors[0].costs = [{ type: "Financial", description: "Fee" }, { type: "OtherNonFinancial", description: "Effort" }];
  await mount(); const other = list("Other Non-Financial cost for Actor 1");
  await edit(other, 0); await change(input(other), "Changed effort"); await key(input(other), "Enter");
  assert.equal(document.activeElement.textContent, "Changed effort");
  await edit(cost(), 0); await change(input(cost()), "Changed fee"); await key(input(cost()), "Enter");
  assert.equal(document.activeElement.textContent, "Changed fee");
  await edit(other, 0); await change(input(other), "Latest effort"); await key(input(other), "Enter");
  assert.equal(document.activeElement.textContent, "Latest effort");
});
