import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { act, createElement as h } from 'react';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { boundaries } from '../review/autosave/boundaries.mjs';
import { makeServices } from '../review/autosave/mockServices.js';
import { fixture } from '../review/cbmx/fixtures.js';

let window, server, root, container, createRoot, MemoryRouter, Routes, Route, useNavigate, Editor, PCBEditor, blankPCB, model, timers, navigate, mode;
before(async () => {
  window = new Window({ url: 'http://localhost/synthetic' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'Event', 'MouseEvent', 'FileReader'])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.alert = window.alert = () => {};
  ({ createRoot } = await import('react-dom/client'));
  ({ MemoryRouter, Routes, Route, useNavigate } = await import('react-router-dom'));
  server = await createServer({ configFile: false, envFile: false, esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, plugins: [boundaries()] });
  Editor = (await server.ssrLoadModule('/src/pages/EditorPage.tsx')).default;
  PCBEditor = (await server.ssrLoadModule('/src/pages/PCBEditorPage.tsx')).default;
  blankPCB = (await server.ssrLoadModule('/src/pcb/processCanvasDomain.ts')).makeBlankProcessCanvasBlueprint;
  const setTimer = window.setTimeout.bind(window), clearTimer = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) => ms === 1200 ? (timers.set(--timerId, fn), timerId) : setTimer(fn, ms, ...args);
  window.clearTimeout = id => id < 0 ? timers.delete(id) : clearTimer(id);
});
let timerId = 0;
beforeEach(() => {
  const pcb = blankPCB(); pcb.meta.name = 'Synthetic Canvas'; pcb.desirability.purpose = 'Original purpose';
  model = makeServices(fixture(3), pcb); globalThis.__autosaveModel = model; timers = new Map();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(async () => { await server.close(); await window.happyDOM.close(); delete globalThis.__autosaveModel; });
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 1)); });
const click = element => act(async () => { assert.ok(element); element.click(); });
const key = (element, value, options = {}) => act(async () => element.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, ...options })));
const change = (element, value) => act(async () => {
  const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const button = text => [...container.querySelectorAll('button')].find(element => element.textContent === text);
const nameInput = () => container.querySelector('input[aria-label="Blueprint name"]');
const status = () => container.querySelector('[role="status"]')?.textContent;
const writes = () => model.calls.filter(call => call.name.startsWith('save_') || call.name === 'createPCB');
function Probe() { navigate = useNavigate(); return null; }
async function mount(kind, id = kind) {
  mode = kind;
  await act(async () => root.render(h(MemoryRouter, { initialEntries: [`/app/${kind === 'cbmx' ? 'b' : 'pcb'}/${id}`] }, h(Probe),
    h(Routes, null, h(Route, { path: '/app/b/:blueprintId', element: h(Editor) }), h(Route, { path: '/app/pcb/:pcbId', element: h(PCBEditor) }), h(Route, { path: '/away', element: h('p', null, 'Away') })))));
  await flush();
}
async function fireAutosave() {
  const callbacks = [...timers.values()]; timers.clear(); assert.ok(callbacks.length, 'Debounce scheduled');
  await act(async () => { for (const callback of callbacks) callback(); }); await flush();
}
async function startSave() { await change(nameInput(), 'Committed name'); assert.match(status(), /Unsaved changes/); await fireAutosave(); assert.equal(model.pending.length, 1); assert.match(status(), /Saving/); }
async function finish(outcome) { await act(async () => model.finish(outcome)); await flush(); }
const inlineField = () => container.querySelector(mode === 'cbmx' ? 'input[aria-label="Network Value Proposition"]' : 'textarea');
async function openInline() {
  if (mode === 'cbmx') await click(container.querySelector('.cbmx-row--networkVP [title="Click to edit"]'));
  else await click([...container.querySelectorAll('[role="button"]')].find(element => element.textContent === 'Original purpose'));
  await change(inlineField(), 'Uncommitted local draft');
}
for (const kind of ['cbmx', 'pcb']) {
  test(`${kind}: debounce stays editable; pending save blocks rename and duplicate requests; success unlocks`, async () => {
    await mount(kind); assert.equal(status().trim(), 'Saved');
    await change(nameInput(), 'Before debounce'); assert.equal(nameInput().disabled, false); assert.equal(writes().length, 0);
    await startSave(); const input = nameInput(); await change(input, 'Blocked rename'); assert.equal(nameInput().value, 'Committed name'); assert.equal(input.disabled, true);
    await click(button(kind === 'cbmx' ? 'Export/Import ▾' : 'Export/Import ▾')); assert.equal(writes().length, 1);
    await finish('ok'); assert.equal(nameInput(), input); assert.equal(input.disabled, false); assert.equal(status().trim(), 'Saved');
    await change(input, 'Next edit'); assert.match(status(), /Unsaved changes/); await fireAutosave(); assert.equal(writes()[1].args.p_loaded_version_no, 2); await finish('ok');
  });
  for (const outcome of ['network', 'forbidden', 'not_found', 'stale']) test(`${kind}: ${outcome} response unlocks and accurately reports failure`, async () => {
    await mount(kind); await startSave();
    if (outcome === 'stale') { model.rows[kind].name = 'Concurrent'; model.rows[kind].blueprint_json.meta.name = 'Concurrent'; model.rows[kind].version_no = 2; }
    await finish(outcome); assert.equal(nameInput().disabled, false); assert.doesNotMatch(status(), /^Saved$/);
    assert.equal(nameInput().value, outcome === 'stale' ? 'Concurrent' : 'Committed name');
    assert.match(status(), outcome === 'stale' ? /conflict.*reloaded/ : /Save failed — changes retained/);
    assert.equal(timers.size, 0, 'No automatic retry after failure');
    await change(nameInput(), 'Edit after failure'); assert.equal(nameInput().value, 'Edit after failure');
  });
  for (const outcome of ['ok', 'network']) test(`${kind}: active draft survives save ${outcome}, blocked Enter/Save/blur, and unlock without automatic commit`, async () => {
    await mount(kind); await openInline(); const field = inlineField();
    await startSave(); assert.equal(inlineField(), field); assert.equal(field.value, 'Uncommitted local draft');
    await key(field, 'Enter', kind === 'pcb' ? { ctrlKey: true } : {}); await click(button('Save')); field.blur(); await flush();
    assert.equal(inlineField(), field); assert.equal(field.value, 'Uncommitted local draft'); assert.equal(writes().length, 1);
    await finish(outcome); assert.equal(inlineField(), field); assert.equal(field.value, 'Uncommitted local draft');
    const saved = model.rows[kind].blueprint_json;
    assert.notEqual(kind === 'cbmx' ? saved.networkValueProposition.statement : saved.desirability.purpose, 'Uncommitted local draft');
    await key(field, 'Enter', kind === 'pcb' ? { ctrlKey: true } : {}); assert.equal(inlineField(), null); assert.match(status(), /Unsaved changes|Save failed/);
    await fireAutosave(); await finish('ok'); assert.equal(status().trim(), 'Saved');
    assert.equal(kind === 'cbmx' ? model.rows[kind].blueprint_json.networkValueProposition.statement : model.rows[kind].blueprint_json.desirability.purpose, 'Uncommitted local draft');
  });
  for (const transition of ['blueprint', 'account', 'navigation']) test(`${kind}: late response cannot update or navigate a different ${transition} session`, async () => {
    await mount(kind); await startSave();
    if (transition === 'navigation') await act(async () => navigate('/away'));
    else if (transition === 'blueprint') {
      model.rows.other = structuredClone(model.rows[kind]); model.rows.other.id = 'other'; model.rows.other.name = 'Other blueprint'; model.rows.other.blueprint_json.meta.name = 'Other blueprint';
      await act(async () => navigate(`/app/${kind === 'cbmx' ? 'b' : 'pcb'}/other`)); await flush();
    } else { model.user = { id: 'different-user' }; model.role = 'viewer'; await mount(kind); }
    await finish('ok');
    if (transition === 'navigation') assert.equal(container.textContent, 'Away');
    else if (transition === 'blueprint') { assert.equal(nameInput().value, 'Other blueprint'); assert.equal(nameInput().disabled, false); }
    else { assert.equal(nameInput(), null); assert.match(status(), /Read-only/); }
  });
  test(`${kind}: viewer has no mutation controls and cannot autosave`, async () => {
    model.user = { id: 'viewer' }; model.role = 'viewer'; await mount(kind); assert.equal(nameInput(), null); assert.match(status(), /Read-only/); assert.equal(timers.size, 0);
  });
  test(`${kind}: two export actions in one event turn cannot overlap saves`, async () => {
    await mount(kind); await change(nameInput(), 'Before export'); await click(button('Export/Import ▾'));
    const exports = [...container.querySelectorAll('button')].filter(button => /Export .* to (JSON|PNG)/.test(button.textContent));
    await act(async () => { exports[0].click(); exports[1].click(); }); await flush();
    assert.equal(writes().length, 1); assert.equal(model.pending.length, 1); await finish('network'); assert.equal(nameInput().disabled, false);
  });
}

test('cbmx: duplicate-name resolution and its retry hold the same lock; retry failure unlocks', async () => {
  await mount('cbmx'); let resolveNames;
  model.nameQuery = () => new Promise(resolve => { resolveNames = resolve; });
  await change(nameInput(), 'Duplicate'); await fireAutosave();
  assert.equal(writes().length, 0); assert.equal(nameInput().disabled, true);
  await change(nameInput(), 'Blocked during lookup'); assert.equal(nameInput().value, 'Duplicate');
  await act(async () => resolveNames({ data: [], error: null })); await flush();
  await finish('duplicate'); assert.equal(nameInput().disabled, true); assert.equal(model.pending.length, 0);
  model.nameQuery = null; await act(async () => resolveNames({ data: [{ id: 'other', name: 'Duplicate' }], error: null })); await flush();
  assert.equal(model.pending.length, 1); assert.equal(writes()[1].args.p_name, 'Duplicate (2)');
  await finish('network'); assert.equal(nameInput().disabled, false); assert.match(status(), /Save failed/);
});

test('cbmx: active addition retains its node and draft throughout saving', async () => {
  await mount('cbmx'); await click(container.querySelector('.cbmx-add-item')); const field = container.querySelector('.cbmx-addition input');
  await change(field, 'New cost draft'); await startSave(); await key(field, 'Enter'); assert.equal(container.querySelector('.cbmx-addition input'), field);
  await finish('ok'); assert.equal(container.querySelector('.cbmx-addition input'), field); assert.equal(field.value, 'New cost draft');
  await key(field, 'Enter'); assert.equal(container.querySelector('.cbmx-addition'), null); await fireAutosave(); await finish('ok');
  assert.ok(model.rows.cbmx.blueprint_json.actors[0].costs.some(item => item.description === 'New cost draft'));
});

test('cbmx: open linking dialog rechecks availability after autosave starts', async () => {
  await mount('cbmx'); await click(button('Process Canvas ▾')); await click(button('Link existing Canvas'));
  const select = container.querySelector('dialog select'); assert.ok(select);
  await act(async () => { select.value = 'pcb'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await startSave(); const confirm = [...container.querySelectorAll('dialog button')].find(button => /^(Link|Confirm)/.test(button.textContent));
  await click(confirm); assert.equal(model.calls.filter(call => call.name === 'link_available_cbmx_process_canvas').length, 0);
  assert.ok(container.querySelector('dialog')); await finish('ok'); await click(confirm); await flush();
  assert.equal(model.calls.filter(call => call.name === 'link_available_cbmx_process_canvas').length, 1);
});

for (const kind of ['cbmx', 'pcb']) {
  test(`${kind}: commit handlers reject events in the same turn that establishes the save lock`, async () => {
    await mount(kind); await openInline(); await change(nameInput(), 'Committed name'); await click(button('Export/Import ▾'));
    const exportAction = [...container.querySelectorAll('button')].find(button => /Export .* to JSON/.test(button.textContent));
    const field = inlineField(); const name = nameInput();
    await act(async () => {
      exportAction.click(); // Synchronous lock, before React updates any disabled controls.
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(name, 'Blocked same-turn rename');
      name.dispatchEvent(new window.Event('input', { bubbles: true }));
      field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: kind === 'pcb', bubbles: true }));
    });
    assert.equal(nameInput().value, 'Committed name'); assert.equal(inlineField(), field); assert.equal(field.value, 'Uncommitted local draft'); assert.equal(writes().length, 1);
    await finish('network'); assert.equal(inlineField(), field);
  });
  test(`${kind}: an import read begun earlier cannot replace the blueprint during a pending save`, async () => {
    await mount(kind); const imported = structuredClone(model.rows[kind].blueprint_json); imported.meta.name = 'Imported replacement';
    let completeRead;
    const originalRead = window.FileReader.prototype.readAsText;
    const file = kind === 'cbmx' ? { text: () => new Promise(resolve => { completeRead = () => resolve(JSON.stringify(imported)); }) } : new window.File(['{}'], 'draft.json');
    if (kind === 'pcb') window.FileReader.prototype.readAsText = function () { completeRead = () => { Object.defineProperty(this, 'result', { value: JSON.stringify(imported) }); this.dispatchEvent(new window.Event('load')); }; };
    try {
      const input = container.querySelector('input[type="file"]'); Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
      assert.ok(completeRead); await startSave(); await act(async () => completeRead()); await flush();
      assert.equal(nameInput().value, 'Committed name'); assert.equal(writes().length, 1); await finish('ok'); assert.equal(model.rows[kind].name, 'Committed name');
    } finally { window.FileReader.prototype.readAsText = originalRead; }
  });
  test(`${kind}: save-before-JSON-export waits for success and uses the saved snapshot`, async () => {
    await mount(kind); await change(nameInput(), 'Saved export'); await click(button('Export/Import ▾'));
    const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalClick = window.HTMLAnchorElement.prototype.click;
    let blob, downloads = 0;
    URL.createObjectURL = value => { blob = value; return 'blob:synthetic'; }; URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () { downloads++; };
    try {
      await click([...container.querySelectorAll('button')].find(button => /Export .* to JSON/.test(button.textContent)));
      assert.equal(downloads, 0); assert.equal(writes().length, 1); await finish('ok'); assert.equal(downloads, 1);
      const exported = JSON.parse(await blob.text()); assert.equal(exported.meta.name, model.rows[kind].name); assert.deepEqual(exported, model.rows[kind].blueprint_json);
    } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; window.HTMLAnchorElement.prototype.click = originalClick; }
  });
}
for (const outcome of ['ok', 'network']) test(`pcb: first create ${outcome} remains exclusive and preserves active addition drafts`, async () => {
  await mount('pcb', 'new');
  await click([...container.querySelectorAll('[role="button"]')].find(element => element.textContent === '...'));
  const field = container.querySelector('textarea,input:not([aria-label="Blueprint name"]):not([type="file"])'); assert.ok(field);
  await change(field, 'New Canvas addition draft'); await startSave(); assert.equal(writes()[0].name, 'createPCB');
  assert.equal(container.contains(field), true); await finish(outcome); assert.equal(container.contains(field), true); assert.equal(field.value, 'New Canvas addition draft');
  assert.equal(nameInput().disabled, false); assert.match(status(), outcome === 'ok' ? /^Saved$/ : /Save failed/);
});
for (const outcome of ['ok', 'network']) test(`cbmx: duplicate-name retry ${outcome} finishes within the lock and unlocks`, async () => {
  await mount('cbmx'); await startSave(); await finish('duplicate'); assert.equal(nameInput().disabled, true); assert.equal(model.pending.length, 1); assert.equal(writes().length, 2);
  await finish(outcome); assert.equal(nameInput().disabled, false); assert.match(status(), outcome === 'ok' ? /^Saved$/ : /Save failed/); assert.equal(timers.size, 0);
});
test('cbmx: validation errors pause autosave without imposing the temporary save lock', async () => {
  await mount('cbmx'); const invalid = structuredClone(model.rows.cbmx.blueprint_json); invalid.serviceScenario = 42;
  const file = { text: async () => JSON.stringify(invalid) }; const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file] }); await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true }))); await flush();
  assert.match(status(), /Autosave paused — validation errors/); assert.equal(nameInput().disabled, false); assert.equal(writes().length, 0); assert.equal(timers.size, 0);
});
test('cbmx: process rename drafts are not closed by blocked keyboard commits', async () => {
  await mount('cbmx'); await click(container.querySelector('.cbmx-process-trigger'));
  const field = container.querySelector('input[aria-label="Co-creation process"]'); await change(field, 'Process draft');
  await startSave(); await key(field, 'Enter'); assert.equal(container.querySelector('input[aria-label="Co-creation process"]'), field);
  await finish('ok'); assert.equal(field.value, 'Process draft'); await key(field, 'Enter'); assert.equal(container.querySelector('input[aria-label="Co-creation process"]'), null);
});

test('cbmx: actor confirmation rechecks the synchronous lock before applying removal', async () => {
  await mount('cbmx'); await change(nameInput(), 'Before confirmation');
  const originalConfirm = window.confirm;
  window.confirm = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); return true; };
  try { await click(container.querySelector('[title="Remove actor"]')); await flush(); }
  finally { window.confirm = originalConfirm; }
  assert.equal(model.pending.length, 1); assert.equal(nameInput().disabled, true);
  assert.equal(container.querySelectorAll('.cbmx-actor-header').length, 3); await finish('ok'); assert.equal(model.rows.cbmx.blueprint_json.actors.length, 3);
});
for (const failure of [false, true]) test(`cbmx: pending linking excludes autosave and mutations; ${failure ? 'failure' : 'success'} unlocks`, async () => {
  await mount('cbmx'); await click(button('Process Canvas ▾')); await click(button('Link existing Canvas'));
  const select = container.querySelector('dialog select');
  await act(async () => { select.value = 'pcb'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
  const rpc = model.rpc.bind(model); let complete;
  model.rpc = (name, args) => name === 'link_available_cbmx_process_canvas' ? new Promise((resolve, reject) => { complete = () => failure ? reject(new Error('Synthetic link failure')) : resolve({ data: [], error: null }); }) : rpc(name, args);
  await click(button('Link Canvas')); await flush(); assert.ok(complete); assert.equal(nameInput().disabled, true);
  await change(nameInput(), 'Blocked during linking'); assert.notEqual(nameInput().value, 'Blocked during linking'); assert.equal(writes().length, 0);
  await act(async () => complete()); await flush(); assert.equal(nameInput().disabled, false);
  if (failure) assert.match(container.querySelector('dialog [role="alert"]').textContent, /Synthetic link failure/);
});


test('cbmx: custom process addition retains its draft and can commit after unlocking', async () => {
  await mount('cbmx'); await click(container.querySelector('.cbmx-process-list .cbmx-add-item'));
  const field = container.querySelector('.cbmx-process-list .cbmx-addition input'); await change(field, 'New process draft');
  await startSave(); await key(field, 'Enter'); assert.equal(container.querySelector('.cbmx-process-list .cbmx-addition input'), field);
  await finish('ok'); assert.equal(field.value, 'New process draft'); assert.equal(container.contains(field), true);
  await key(field, 'Enter'); assert.equal(container.querySelector('.cbmx-process-list .cbmx-addition'), null);
  await fireAutosave(); await finish('ok'); assert.ok(model.rows.cbmx.blueprint_json.coCreationProcesses.some(process => process.name === 'New process draft'));
});

const actorTypeTrigger = () => container.querySelector('.cbmx-role-trigger');
const selectActorType = async type => {
  await click(actorTypeTrigger());
  await click([...container.querySelectorAll('[role="menuitemradio"]')].find(node => node.textContent.startsWith(type)));
};
async function importActorBlueprint(candidate) {
  const input = container.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ text: async () => JSON.stringify(candidate) }] });
  await act(async () => input.dispatchEvent(new window.Event('change', { bubbles: true })));
  await flush();
}
for (const role of ['owner', 'editor']) test(`cbmx: ${role} type changes autosave and reload with version, content and PCB references intact`, async () => {
  model.role = role;
  if (role === 'editor') { model.user.id = 'editor-id'; }
  const before = structuredClone(model.rows.cbmx.blueprint_json);
  await mount('cbmx'); assert.equal(timers.size, 0); assert.equal(writes().length, 0);
  await selectActorType('Customer'); assert.match(status(), /Unsaved changes/);
  await fireAutosave(); assert.equal(writes().length, 1); assert.equal(writes()[0].args.p_loaded_version_no, 1);
  const expected = structuredClone(before); expected.actors[2].type = 'Customer';
  assert.deepEqual(writes()[0].args.p_blueprint_json, expected);
  assert.equal(actorTypeTrigger(), null); // Save lock temporarily shows static labels.
  await finish('ok'); assert.deepEqual(model.rows.cbmx.blueprint_json, expected); assert.equal(model.rows.cbmx.version_no, 2);
  await act(async () => root.unmount()); root = createRoot(container); await mount('cbmx');
  assert.equal(actorTypeTrigger().textContent, 'Customer'); assert.equal(timers.size, 0);
  assert.equal(container.querySelectorAll('.cbmx-actor--customer.cbmx-actor-header').length, 2);
  await selectActorType('Other'); await fireAutosave(); await finish('ok');
  assert.deepEqual(model.rows.cbmx.blueprint_json, before); assert.equal(model.rows.cbmx.version_no, 3);
});

test('cbmx: viewer sees additional Customer labels and cannot reclassify or delete them', async () => {
  model.role = 'viewer'; model.user.id = 'viewer-id'; model.rows.cbmx.blueprint_json.actors[2].type = 'Customer';
  await mount('cbmx');
  assert.equal(container.querySelector('.cbmx-role-trigger,.cbmx-role-chevron,.cbmx-remove-actor'), null);
  assert.deepEqual([...container.querySelectorAll('.cbmx-role')].map(node => node.textContent), ['Customer', 'Orchestrator', 'Customer']);
  assert.equal(writes().length, 0); assert.equal(timers.size, 0);
});

for (const outcome of ['stale', 'forbidden', 'network']) test(`cbmx: actor reclassification preserves existing ${outcome} handling and stored configuration`, async () => {
  const before = structuredClone(model.rows.cbmx.blueprint_json);
  await mount('cbmx'); await selectActorType('Customer'); await fireAutosave(); await finish(outcome);
  assert.deepEqual(model.rows.cbmx.blueprint_json, before); assert.equal(writes().length, 1);
  assert.match(status(), /Save failed|Conflict|conflict/);
});

for (const [label, change, message] of [
  ['first actor type', bp => { bp.actors[0].type = 'Other'; }, /Actor #1 must be Customer/],
  ['second actor type', bp => { bp.actors[1].type = 'Customer'; }, /Actor #2 must be Orchestrator/],
  ['extra orchestrator', bp => { bp.actors[2].type = 'Orchestrator'; }, /Actor #3 must be Customer or Other/],
  ['unknown role', bp => { bp.actors[2].type = 'Partner'; }, /Actor #3 must be Customer or Other/],
  ['null actor', bp => { bp.actors[2] = null; }, /Actor #3 must be Customer or Other/],
  ['missing role', bp => { delete bp.actors[2].type; }, /Actor #3 must be Customer or Other/],
  ['too few actors', bp => { bp.actors = bp.actors.slice(0, 1); }, /At least 2/],
  ['too many actors', bp => { bp.actors.push(...fixture(10).actors); }, /at most 10/],
]) test(`cbmx: malformed import (${label}) reports the rule and leaves the correctable draft and storage untouched`, async () => {
  await mount('cbmx'); const original = structuredClone(model.rows.cbmx.blueprint_json);
  const candidate = structuredClone(original); change(candidate);
  const callsBefore = model.calls.length, alerts = []; const oldAlert = globalThis.alert;
  globalThis.alert = value => alerts.push(value);
  try { await importActorBlueprint(candidate); } finally { globalThis.alert = oldAlert; }
  assert.match(alerts.at(-1), message); assert.match(alerts.at(-1), /Correct the JSON file/);
  assert.equal(status().trim(), 'Saved'); assert.equal(writes().length, 0); assert.equal(timers.size, 0);
  assert.equal(model.calls.length, callsBefore); assert.deepEqual(model.rows.cbmx.blueprint_json, original);
  assert.deepEqual([...container.querySelectorAll('.cbmx-role')].map(n => n.textContent), original.actors.map(a => a.type));
  await selectActorType('Customer'); assert.match(status(), /Unsaved changes/); // Existing draft is still editable.
});

for (const multi of [false, true]) test(`cbmx: ${multi ? 'multi-customer' : 'legacy single-customer'} JSON import uses existing versioned save and preserves actor content`, async () => {
  await mount('cbmx'); const imported = structuredClone(model.rows.cbmx.blueprint_json);
  if (multi) imported.actors[2].type = 'Customer';
  model.hold = false; await importActorBlueprint(imported);
  assert.equal(writes().length, 1); assert.equal(writes()[0].args.p_loaded_version_no, 1);
  assert.deepEqual(model.rows.cbmx.blueprint_json, imported); assert.equal(model.rows.cbmx.version_no, 2);
  assert.equal(actorTypeTrigger().textContent, multi ? 'Customer' : 'Other'); assert.equal(timers.size, 0);
});
