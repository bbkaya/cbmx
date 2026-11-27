import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { act, createElement as h } from 'react';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { fixture } from '../review/cbmx/fixtures.js';

let window, server, domain, mutators, Table, validateTable, Lock, createRoot, root, container, blueprint, updates, locked;
before(async () => {
  window = new Window();
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ configFile: false, envFile: false, esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  domain = await server.ssrLoadModule('/src/components/cbmx/cbmxDomain.ts');
  mutators = await server.ssrLoadModule('/src/components/cbmx/cbmxMutators.ts');
  const table = await server.ssrLoadModule('/src/components/cbmx/CBMXTable.tsx');
  Table = table.default; validateTable = table.validateCBMXBlueprint;
  Lock = (await server.ssrLoadModule('/src/editing/EditingLock.tsx')).EditingLockContext;
  const style = document.createElement('style');
  style.textContent = await readFile(new URL('../src/components/cbmx/cbmx.css', import.meta.url), 'utf8');
  document.head.append(style);
});
beforeEach(() => {
  blueprint = fixture(5, 'dense'); updates = []; locked = false;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(async () => { await server?.close(); await window?.happyDOM.close(); });
const render = async (props = {}, lockState = locked) => act(async () => root.render(h(Lock.Provider,
  { value: { locked: lockState, blocked: () => locked } }, h(Table, { blueprint, onChange: next => { updates.push(next); blueprint = next; }, ...props }))));
const click = async node => { assert.ok(node); await act(async () => node.click()); };
const key = async (node, value) => act(async () => node.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));
const triggers = () => [...container.querySelectorAll('.cbmx-role-trigger')];
const options = () => [...container.querySelectorAll('[role="menuitemradio"]')];
const types = bp => bp.actors.map(actor => actor.type);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('normalization retains multiple customers, order, IDs and content without changing loaded JSON or saving', async () => {
  blueprint.actors[2].type = blueprint.actors[4].type = 'Customer';
  const original = structuredClone(blueprint); freeze(blueprint);
  const normalized = domain.normalizeActors(blueprint.actors);
  assert.deepEqual(normalized.actors, original.actors); assert.equal(normalized.N, 5);
  for (let i = 0; i < 5; i++) { assert.notEqual(normalized.actors[i], blueprint.actors[i]); assert.notEqual(normalized.actors[i].costs, blueprint.actors[i].costs); }
  assert.deepEqual(domain.normalizeActors(blueprint.actors, 3).actors, original.actors.slice(0, 3));
  await render(); assert.deepEqual(blueprint, original); assert.equal(updates.length, 0);
  blueprint = fixture(3); blueprint.actors[0].type = 'Other'; blueprint.actors[1].type = 'Customer'; blueprint.actors[2].type = 'Orchestrator';
  assert.deepEqual(domain.normalizeActors(blueprint.actors).actors.map(a => a.type), ['Customer', 'Orchestrator', 'Other']);
});

test('setActorType changes only the actor type by stable ID; round-trips preserve all content and process identities', () => {
  // Deliberately use non-positional IDs to catch ID/index confusion.
  blueprint.actors[2].id = 'stable-employer'; blueprint.coCreationProcesses[0].participantActorIds.push('stable-employer');
  const before = structuredClone(blueprint), actor = blueprint.actors[2], costs = actor.costs, processes = blueprint.coCreationProcesses;
  mutators.setActorType(blueprint, 'stable-employer', 'Customer');
  const expected = structuredClone(before); expected.actors[2].type = 'Customer';
  assert.deepEqual(blueprint, expected); assert.equal(actor.costs, costs); assert.equal(blueprint.coCreationProcesses, processes);
  mutators.setActorType(blueprint, blueprint.actors[4].id, 'Customer');
  const imported = JSON.parse(JSON.stringify(domain.prepareCBMXJsonExport(blueprint)));
  assert.deepEqual(imported, blueprint); assert.deepEqual(domain.normalizeActors(imported.actors).actors, blueprint.actors);
  assert.deepEqual(domain.validateActorTypes(imported.actors), []);
  mutators.setActorType(blueprint, 'stable-employer', 'Other');
  mutators.setActorType(blueprint, blueprint.actors[4].id, 'Other');
  assert.deepEqual(blueprint, before);
});

test('setActorType rejects protected IDs, missing IDs and invalid runtime target types without mutations', () => {
  freeze(blueprint); // Even assignments of the same value must be avoided.
  for (const id of [blueprint.actors[0].id, blueprint.actors[1].id, 'missing'])
    for (const type of ['Customer', 'Other', 'Orchestrator', 'Bad', null, undefined]) mutators.setActorType(blueprint, id, type);
  for (const type of ['Other', 'Orchestrator', 'Bad', null, undefined]) mutators.setActorType(blueprint, 'A3', type);
});

for (const [label, change, message] of [
  ['missing actors', bp => { delete bp.actors; }, /actors array/i],
  ['one actor', bp => { bp.actors.length = 1; }, /At least 2/],
  ['no customers', bp => { bp.actors[0].type = 'Other'; }, /At least 1 Customer/],
  ['no orchestrator', bp => { bp.actors[1].type = 'Other'; }, /Exactly 1 Orchestrator/],
  ['swapped fixed actors', bp => { [bp.actors[0], bp.actors[1]] = [bp.actors[1], bp.actors[0]]; }, /Actor #1 must be Customer/],
  ['second customer', bp => { bp.actors[1].type = 'Customer'; }, /Actor #2 must be Orchestrator/],
  ['additional orchestrator', bp => { bp.actors[2].type = 'Orchestrator'; }, /Actor #3 must be Customer or Other/],
  ['unknown type', bp => { bp.actors[2].type = 'Partner'; }, /Actor #3 must be Customer or Other/],
  ['null actor', bp => { bp.actors[2] = null; }, /Actor #3 must be Customer or Other/],
  ['missing type', bp => { delete bp.actors[2].type; }, /Actor #3 must be Customer or Other/],
  ['over limit', bp => { bp.actors = [...bp.actors, ...fixture(7).actors]; }, /at most 10/],
]) test(`both validators reject ${label} with clear actor-configuration errors`, () => {
  change(blueprint);
  for (const validate of [domain.validateCBMXBlueprint, validateTable]) {
    const issues = validate(blueprint); assert.ok(issues.some(issue => issue.level === 'error' && message.test(issue.message)), JSON.stringify(issues));
  }
});

test('both validators accept legacy and several customers; unrelated cost severities stay distinct', () => {
  for (const count of [2, 5, 10]) {
    blueprint = fixture(count);
    for (const multi of [false, true]) {
      if (multi) blueprint.actors.slice(2).forEach(actor => { actor.type = 'Customer'; });
      for (const validate of [domain.validateCBMXBlueprint, validateTable]) assert.equal(validate(blueprint).filter(issue => issue.level === 'error').length, 0);
      const imported = JSON.parse(JSON.stringify(domain.prepareCBMXJsonExport(blueprint)));
      assert.deepEqual(domain.normalizeActors(imported.actors).actors, blueprint.actors);
    }
  }
  blueprint.actors[2].costs = [];
  assert.ok(domain.validateCBMXBlueprint(blueprint).some(i => i.level === 'error' && /Cost item/.test(i.message)));
  assert.ok(validateTable(blueprint).some(i => i.level === 'warning' && /has no costs/.test(i.message)));
});

test('additional Customers remain removable; fixed actors, max 10 and participant cleanup stay intact', () => {
  const original = structuredClone(blueprint);
  mutators.removeActor(blueprint, 'A1'); mutators.removeActor(blueprint, 'A2'); assert.deepEqual(blueprint, original);
  mutators.setActorType(blueprint, 'A3', 'Customer'); mutators.removeActor(blueprint, 'A3');
  assert.deepEqual(blueprint.actors.map(a => a.id), ['A1', 'A2', 'A4', 'A5']);
  assert.ok(blueprint.coCreationProcesses.every(p => !p.participantActorIds.includes('A3')));
  while (blueprint.actors.length < 10) { mutators.addActor(blueprint); assert.equal(blueprint.actors.at(-1).type, 'Other'); }
  const atLimit = structuredClone(blueprint); mutators.addActor(blueprint); assert.deepEqual(blueprint, atLimit);
});

test('picker commits immediately, updates both colors, retains content, allows reverse selection and skips no-op updates', async () => {
  const before = structuredClone(blueprint); await render(); assert.equal(triggers().length, 3);
  await click(triggers()[0]); assert.deepEqual(options().map(b => b.textContent), ['Customer', 'Other✓']);
  assert.equal(options()[1].getAttribute('aria-checked'), 'true'); assert.equal(document.activeElement, options()[1]);
  await click(options()[0]); assert.equal(updates.length, 1); assert.equal(container.querySelector('[role="menu"]'), null);
  await render(); const expected = structuredClone(before); expected.actors[2].type = 'Customer'; assert.deepEqual(blueprint, expected);
  const headers = [...container.querySelectorAll('.cbmx-actor-header')];
  assert.equal(window.getComputedStyle(headers[0]).backgroundColor, '#24554F');
  assert.equal(window.getComputedStyle(headers[2]).backgroundColor, window.getComputedStyle(headers[0]).backgroundColor);
  assert.equal(window.getComputedStyle(headers[2]).color, '#fff');
  assert.equal(window.getComputedStyle(triggers()[0]).backgroundColor, '#E0F0EB');
  assert.equal(window.getComputedStyle(triggers()[0]).color, '#24554F');
  await click(triggers()[0]); await click(options()[0]); assert.equal(updates.length, 1);
  await click(triggers()[0]); await click(options()[1]); await render(); assert.deepEqual(blueprint, before);
  assert.equal(window.getComputedStyle(container.querySelectorAll('.cbmx-actor-header')[2]).backgroundColor, '#0D4678');
  assert.equal(window.getComputedStyle(triggers()[0]).backgroundColor, '#E0EFFE');
});

test('keyboard navigation, Escape, outside touch/pointer and Tab close without committing', async () => {
  await render(); const trigger = triggers()[0]; await act(async () => trigger.focus()); await key(trigger, 'ArrowDown');
  assert.equal(document.activeElement, options()[0]); await key(options()[0], 'ArrowUp'); assert.equal(document.activeElement, options()[1]);
  await key(options()[1], 'Home'); assert.equal(document.activeElement, options()[0]);
  await key(options()[0], 'End'); assert.equal(document.activeElement, options()[1]);
  await key(options()[1], 'Escape'); assert.equal(container.querySelector('[role="menu"]'), null); assert.equal(document.activeElement, trigger);
  for (const pointerType of ['touch', 'mouse']) {
    await click(trigger);
    await act(async () => document.body.dispatchEvent(new window.PointerEvent('pointerdown', { pointerType, bubbles: true })));
    assert.equal(container.querySelector('[role="menu"]'), null);
  }
  await click(trigger); await act(async () => container.querySelector('.cbmx-add-actor').focus());
  assert.equal(container.querySelector('[role="menu"]'), null); assert.equal(updates.length, 0);
});

test('synchronous and rendered save locks prevent type mutations and close active menus', async () => {
  await render(); await click(triggers()[0]); locked = true;
  await click(options()[0]); assert.equal(updates.length, 0);
  await render(); assert.equal(container.querySelector('[role="menu"]'), null); assert.equal(triggers().length, 0);
  locked = false; await render(); assert.equal(container.querySelector('[role="menu"]'), null); assert.equal(triggers().length, 3);
});

for (const props of [{ presentation: 'readonly' }, { presentation: 'export' }, { onChange: undefined }])
  test(`static actor labels for ${JSON.stringify(props)} preserve types, colors and ordering`, async () => {
    blueprint.actors[2].type = 'Customer'; await render(props);
    assert.deepEqual([...container.querySelectorAll('.cbmx-role')].map(n => n.textContent), types(blueprint));
    assert.equal(container.querySelector('.cbmx-role-trigger,.cbmx-role-chevron,.cbmx-role-menu,.cbmx-remove-actor'), null);
    assert.equal(window.getComputedStyle(container.querySelectorAll('.cbmx-actor-header')[1]).backgroundColor, '#78374C');
    assert.equal(window.getComputedStyle(container.querySelectorAll('.cbmx-role')[1]).backgroundColor, '#F6E5EB');
    assert.equal(updates.length, 0);
  });

test('UI removes an additional Customer with confirmation and keeps exactly two protected headers', async () => {
  blueprint.actors[2].type = 'Customer'; const original = structuredClone(blueprint); await render();
  assert.equal(container.querySelectorAll('.cbmx-remove-actor').length, 3);
  for (const header of [...container.querySelectorAll('.cbmx-actor-header')].slice(0, 2)) assert.equal(header.querySelector('.cbmx-remove-actor'), null);
  window.confirm = () => false; await click(container.querySelector('.cbmx-remove-actor')); assert.deepEqual(blueprint, original);
  window.confirm = () => true; await click(container.querySelector('.cbmx-remove-actor'));
  assert.deepEqual(blueprint.actors.map(a => a.id), ['A1', 'A2', 'A4', 'A5']); assert.ok(blueprint.coCreationProcesses.every(p => !p.participantActorIds.includes('A3')));
});

const moveButtons = () => [...container.querySelectorAll('.cbmx-move-actor')];
const moveButton = (index, direction) => container.querySelectorAll('.cbmx-row--actor > td')[index + 1].querySelectorAll('.cbmx-move-actor')[direction === 'left' ? 0 : 1];
const names = () => [...container.querySelectorAll('.cbmx-actor-header')].map(node => node.textContent.replace('−', '').trim());
const changeInput = async (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});

test('moveActor moves complete objects by stable ID in both directions and preserves all references', () => {
  blueprint.actors[3].id = 'stable-employer'; blueprint.actors[3].type = 'Customer';
  blueprint.actors[3].extension = { arbitrary: ['retained'] };
  blueprint.coCreationProcesses[0].participantActorIds.push('stable-employer');
  const original = structuredClone(blueprint), array = blueprint.actors, actor = array[3], processes = blueprint.coCreationProcesses;
  mutators.moveActor(blueprint, actor.id, 'left');
  assert.equal(blueprint.actors, array); assert.equal(array[2], actor); assert.equal(blueprint.coCreationProcesses, processes);
  assert.deepEqual(array.map(a => a.id), ['A1', 'A2', 'stable-employer', 'A3', 'A5']);
  assert.deepEqual([...array].sort((a, b) => a.id.localeCompare(b.id)), [...original.actors].sort((a, b) => a.id.localeCompare(b.id)));
  assert.deepEqual(blueprint.coCreationProcesses, original.coCreationProcesses);
  mutators.moveActor(blueprint, actor.id, 'right'); assert.deepEqual(blueprint, original); assert.equal(array[3], actor);
});

test('moveActor rejects fixed positions, boundaries, unknown IDs and invalid directions without even writing', () => {
  freeze(blueprint);
  for (const id of ['A1', 'A2', 'missing']) for (const direction of ['left', 'right']) mutators.moveActor(blueprint, id, direction);
  mutators.moveActor(blueprint, 'A3', 'left'); mutators.moveActor(blueprint, 'A5', 'right');
  for (const direction of ['up', '', null, undefined, 1, {}, 'LEFT']) mutators.moveActor(blueprint, 'A4', direction);
});

test('repeated moves, JSON round trip, normalization, reclassification, append and removal retain intended order', () => {
  blueprint.actors[2].type = blueprint.actors[4].type = 'Customer';
  mutators.moveActor(blueprint, 'A5', 'left'); mutators.moveActor(blueprint, 'A5', 'left');
  mutators.moveActor(blueprint, 'A3', 'right');
  assert.deepEqual(blueprint.actors.map(a => a.id), ['A1', 'A2', 'A5', 'A4', 'A3']);
  const imported = JSON.parse(JSON.stringify(domain.prepareCBMXJsonExport(blueprint)));
  assert.deepEqual(imported, blueprint); assert.deepEqual(domain.normalizeActors(imported.actors).actors, blueprint.actors);
  assert.deepEqual(domain.validateActorTypes(imported.actors), []);
  mutators.moveActor(imported, 'A4', 'left'); assert.equal(imported.actors[2].id, 'A4');
  const ids = blueprint.actors.map(a => a.id); mutators.setActorType(blueprint, 'A4', 'Customer');
  assert.deepEqual(blueprint.actors.map(a => a.id), ids);
  mutators.addActor(blueprint); assert.equal(blueprint.actors.at(-1).id, 'A6');
  mutators.removeActor(blueprint, 'A5'); assert.deepEqual(blueprint.actors.map(a => a.id), ['A1', 'A2', 'A4', 'A3', 'A6']);
  assert.ok(blueprint.coCreationProcesses.every(p => !p.participantActorIds.includes('A5')));
});

for (const count of [2, 3, 5, 10]) test(`${count} actors: paired controls protect fixed positions and array boundaries`, async () => {
  blueprint = fixture(count); await render(); assert.equal(moveButtons().length, Math.max(0, count - 2) * 2);
  assert.equal(container.querySelectorAll('.cbmx-row--actor > td')[1].querySelector('.cbmx-actor-position'), null);
  assert.equal(container.querySelectorAll('.cbmx-row--actor > td')[2].querySelector('.cbmx-actor-position'), null);
  for (let i = 2; i < count; i++) {
    const left = moveButton(i, 'left'), right = moveButton(i, 'right');
    assert.equal(left.disabled, i === 2); assert.equal(right.disabled, i === count - 1);
    assert.equal(left.getAttribute('aria-label'), `Move ${blueprint.actors[i].name} left`);
    assert.equal(right.title, `Move ${blueprint.actors[i].name} right`);
    assert.equal(left.getAttribute('type'), 'button');
  }
  if (count > 2) { await click(moveButton(2, 'left')); await click(moveButton(count - 1, 'right')); }
  assert.equal(updates.length, 0);
});

test('UI moves whole columns in every actor-dependent row and keeps actor text/list drafts attached to stable IDs', async () => {
  await render(); const actor = blueprint.actors[3];
  const originalCells = [...container.querySelectorAll('tr')].map(row => {
    const cells = [...row.children];
    if (![6, 11].includes(cells.length)) return null;
    return [row, cells.length === 6 ? [cells[4]] : [cells[7], cells[8]]];
  }).filter(Boolean);
  await click(container.querySelectorAll('.cbmx-actor-header [title="Click to edit"]')[3]);
  const input = container.querySelector('.cbmx-actor-header input'); await changeInput(input, 'Uncommitted employer');
  const kpiRow = container.querySelector('.cbmx-row--kpis');
  await click(kpiRow.children[4].querySelector('[title="Click to edit"]'));
  const kpiDraft = kpiRow.querySelector('input'); await changeInput(kpiDraft, 'Draft KPI');
  await click(moveButton(3, 'left')); await render(); assert.equal(blueprint.actors[2].id, actor.id);
  assert.equal(container.querySelector('.cbmx-actor-header input'), input); assert.equal(input.value, 'Uncommitted employer');
  assert.equal(kpiRow.children[3].querySelector('input'), kpiDraft); assert.equal(kpiDraft.value, 'Draft KPI');
  for (const [row, cells] of originalCells) {
    const current = [...row.children]; assert.deepEqual(current.length === 6 ? [current[3]] : [current[5], current[6]], cells);
  }
  await key(input, 'Enter'); await render(); assert.equal(blueprint.actors[2].name, 'Uncommitted employer');
  assert.equal(blueprint.actors[3].name.includes('Service delivery'), true);
  await key(kpiDraft, 'Enter'); await render(); assert.ok(blueprint.actors[2].kpis.some(k => k.name === 'Draft KPI'));
});

test('process edit/add disables moves with an explanation, retains draft and unlocks on commit or cancel', async () => {
  await render(); await click(container.querySelector('.cbmx-process-trigger'));
  const input = container.querySelector('input[aria-label="Co-creation process"]'); await changeInput(input, 'Draft process (A1, A4)');
  assert.ok(moveButtons().every(b => b.disabled)); assert.match(container.querySelector('.cbmx-move-notice').textContent, /Finish or cancel/);
  await click(moveButton(3, 'left')); assert.equal(updates.length, 0); assert.equal(input.value, 'Draft process (A1, A4)');
  await key(input, 'Enter'); await render(); assert.equal(moveButton(3, 'left').disabled, false);
  await click(moveButton(3, 'left')); await render(); assert.equal(blueprint.actors[2].id, 'A4');
  assert.deepEqual(blueprint.coCreationProcesses[0].participantActorIds, ['A1', 'A4']);
  await click(container.querySelector('.cbmx-process-list .cbmx-add-item'));
  assert.ok(moveButtons().every(b => b.disabled));
  await key(container.querySelector('input[aria-label="Co-creation process"]'), 'Escape');
  assert.equal(moveButton(3, 'left').disabled, false); assert.equal(container.querySelector('.cbmx-move-notice'), null);
});

test('external reorder invalidates a process draft with the existing visible notice and stale commit guard', async () => {
  await render(); const revision = mutators.processListRevision(blueprint);
  await click(container.querySelector('.cbmx-process-trigger'));
  await changeInput(container.querySelector('input[aria-label="Co-creation process"]'), 'Old draft');
  mutators.moveActor(blueprint, 'A4', 'left'); blueprint = structuredClone(blueprint); await render();
  assert.equal(container.querySelector('input[aria-label="Co-creation process"]'), null);
  assert.match(container.querySelector('.cbmx-list-notice').textContent, /Uncommitted edits were cancelled/);
  assert.throws(() => mutators.commitProcessItem(blueprint, revision, 'P1', 'Old draft'), /process list changed/);
  assert.equal(moveButton(3, 'left').disabled, false); assert.equal(updates.length, 0);
});

test('multiple movements before props rerender serialize against latest array and save locks prevent mutations', async () => {
  await render(); const right = moveButton(2, 'right');
  await act(async () => { right.click(); right.click(); });
  assert.deepEqual(blueprint.actors.map(a => a.id), ['A1', 'A2', 'A4', 'A5', 'A3']); assert.equal(updates.length, 2);
  locked = true; await click(right); assert.equal(updates.length, 2);
  await render(); assert.ok(moveButtons().every(b => b.disabled));
  locked = false; await render(); await click(moveButton(4, 'left')); await render(); assert.equal(blueprint.actors[3].id, 'A3');
});

test('type menus close on focus leaving for movement; reclassification after a move changes no order', async () => {
  await render(); await click(triggers()[1]); const arrow = moveButton(3, 'left');
  await act(async () => arrow.focus()); assert.equal(options().length, 0);
  await click(arrow); await render(); const order = blueprint.actors.map(a => a.id);
  await click(triggers()[0]); await click(options()[0]); await render();
  assert.deepEqual(blueprint.actors.map(a => a.id), order); assert.equal(blueprint.actors[2].type, 'Customer');
});

for (const props of [{ presentation: 'readonly' }, { presentation: 'export' }, { onChange: undefined }])
  test(`positioning adds no controls or space in static view ${JSON.stringify(props)}`, async () => {
    await render(props); assert.equal(container.querySelector('.cbmx-actor-position,.cbmx-move-actor,.cbmx-move-notice'), null);
    assert.deepEqual(names(), blueprint.actors.map(a => a.name)); assert.equal(updates.length, 0);
  });

test('movement stays disabled until every concurrent process draft closes, including failed commits', async () => {
  await render(); const processTriggers = [...container.querySelectorAll('.cbmx-process-trigger')];
  await click(processTriggers[0]); await click(processTriggers[1]);
  const fields = [...container.querySelectorAll('input[aria-label="Co-creation process"]')];
  await changeInput(fields[0], ''); await key(fields[0], 'Enter');
  assert.match(container.querySelector('[role="alert"]').textContent, /Enter a co-creation process name/);
  assert.ok(moveButtons().every(button => button.disabled));
  await key(fields[0], 'Escape'); assert.ok(moveButtons().every(button => button.disabled));
  await key(fields[1], 'Escape'); assert.equal(moveButton(3, 'left').disabled, false);
});
