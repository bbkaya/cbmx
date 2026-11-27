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
