import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { act, createElement } from 'react';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

let window, server, Table, createRoot, root, container, notifications, opened, managed, blueprint;
const fixture = () => ({ networkValueProposition: { statement: 'Shared network value' },
  actors: [1, 2].map(n => ({ id: `A${n}`, type: n === 1 ? 'Customer' : 'Orchestrator', name: `Actor ${n}`,
    actorValueProposition: { statement: 'Contribution' }, costs: [{ type: 'Financial', description: '' }, { type: 'Financial', description: 'Service fee' }],
    benefits: [{ type: 'Environmental', description: 'Reduced emissions' }],
    kpis: [{ name: 'Reliability (≥ 99%)', rank: 2 }, { name: 'Satisfaction (≥ 4.5/5)', rank: 1 }],
    services: [{ name: 'Delivery', operations: [{ name: 'Plan' }, { name: 'Operate' }] }] })),
  coCreationProcesses: [{ id: 'P1', name: 'Fulfil request', participantActorIds: ['A1', 'A2'] }, { id: 'P2', name: 'Support', participantActorIds: ['A2'] }],
  serviceScenario: 'First paragraph\n\nSecond paragraph',
});
const links = role => [{ cbmx_process_id: 'P1', link_exists: true, has_pcb_access: Boolean(role), pcb_access_role: role,
  process_canvas_blueprint_id: 'canvas-id', process_canvas_blueprint_name: 'Visible canvas' }];
const editingControls = '.cbmx-add-item,.cbmx-add-actor,.cbmx-remove-actor,.cbmx-remove-item,.cbmx-editable-trigger,.cbmx-inline-editor,input,textarea,.cbmx-pcb-button';
before(async () => {
  window = new Window({ url: 'http://localhost/synthetic' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  server = await createServer({ configFile: false, envFile: false, esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  Table = (await server.ssrLoadModule('/src/components/cbmx/CBMXTable.tsx')).default;
});
beforeEach(() => { blueprint = fixture(); notifications = 0; opened = []; managed = [];
  container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(async () => { await server?.close(); await window?.happyDOM.close(); });
const render = async props => act(async () => root.render(createElement(Table, {
  blueprint, onChange: () => { notifications++; }, processLinks: links('viewer'),
  onOpenLinkedPCB: id => opened.push(id), onCreatePCBForProcess: id => managed.push(['create', id]),
  onLinkExistingPCBToProcess: id => managed.push(['relink', id]), onUnlinkPCBFromProcess: id => managed.push(['unlink', id]),
  onDeleteProcess: async id => { managed.push(['delete', id]); return false; }, ...props,
})));
const click = async node => { assert.ok(node, 'control exists'); await act(async () => node.click()); };
const button = text => [...container.querySelectorAll('button')].find(node => node.textContent === text);

for (const presentation of ['editor', 'readonly', 'export']) test(`${presentation}: one shared matrix retains content and the correct controls`, async () => {
  const before = JSON.stringify(blueprint); await render({ presentation });
  assert.equal(container.querySelectorAll('table.cbmx-table').length, 1); assert.equal(container.querySelectorAll('tbody > tr').length, 13);
  assert.equal(container.querySelectorAll('.cbmx-row-label--category').length, 4); assert.equal(container.querySelectorAll('.cbmx-row-icon').length, 15);
  for (const text of ['Shared network value', 'Contribution', 'Service fee', 'Reduced emissions', 'Reliability (≥ 99%)',
    'Satisfaction (≥ 4.5/5)', 'Delivery', ' (Plan, Operate)', 'Fulfil request', ' (Actor 1, Actor 2)', 'Second paragraph', 'Visible canvas'])
    assert.ok(container.textContent.includes(text), text);
  assert.deepEqual([...container.querySelector('.cbmx-row--kpis td:nth-child(2)').querySelectorAll('.cbmx-item-marker')].map(node => node.textContent), ['1.', '2.']);
  if (presentation === 'editor') {
    assert.ok(container.querySelector('.cbmx-add-item')); assert.ok(button('Process Canvas ▾')); assert.equal(container.querySelector('.cbmx-pcb-open'), null);
  } else assert.equal(container.querySelector(editingControls), null);
  if (presentation === 'export') assert.equal(container.querySelector('button,[role="button"],.cbmx-info,.cbmx-help'), null);
  else assert.equal(container.querySelectorAll('.cbmx-info').length, 13);
  assert.equal(Boolean(container.querySelector('.cbmx-pcb-open')), presentation === 'readonly');
  assert.equal(JSON.stringify(blueprint), before); assert.equal(notifications, 0); assert.deepEqual(managed, []);
});

test('read-only mode retains contextual help and never activates text editing', async () => {
  await render({ presentation: 'readonly' });
  await click(container.querySelector('[aria-label="Open help panel"]'));
  await click(container.querySelector('[aria-label="Info: Actor Services"]'));
  assert.equal(container.querySelector('.cbmx-help-title').textContent, 'Actor Services');
  assert.match(container.querySelector('.cbmx-help-content').textContent, /capabilities/);
  const content = container.querySelector('.cbmx-row--Financial .cbmx-item-content');
  await click(content);
  await act(async () => content.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  assert.equal(container.querySelector(editingControls), null); assert.equal(notifications, 0);
  await click(container.querySelector('[aria-label="Collapse tips panel"]')); assert.ok(container.querySelector('[aria-label="Open help panel"]'));
});

for (const role of ['owner', 'editor', 'viewer']) test(`read-only CBMX opens a PCB with ${role} access, without exposing management actions`, async () => {
  await render({ presentation: 'readonly', processLinks: links(role) });
  const open = container.querySelector('.cbmx-pcb-open'); assert.ok(open);
  assert.equal(open.textContent.trim(), 'PCB: Visible canvas'); assert.equal(open.title, 'Open linked Process Canvas');
  assert.equal(open.getAttribute('aria-label'), 'Open linked Process Canvas: Visible canvas');
  await click(open); assert.deepEqual(opened, ['canvas-id']);
  assert.equal(container.querySelector('[role="menu"],.cbmx-pcb-button'), null);
  assert.equal(container.querySelector(editingControls), null); assert.equal(notifications, 0); assert.deepEqual(managed, []);
});

for (const flags of [
  { has_pcb_access: false, pcb_access_role: 'owner' },
  { has_pcb_access: true, pcb_access_role: null },
  { has_pcb_access: true, pcb_access_role: 'administrator' },
  { link_exists: false, has_pcb_access: true, pcb_access_role: 'viewer' },
]) test(`read-only denies navigation and protected names for inconsistent/inaccessible PCB flags ${JSON.stringify(flags)}`, async () => {
  const processLinks = links('viewer'); Object.assign(processLinks[0], flags, {
    process_canvas_blueprint_id: 'SECRET-ID', process_canvas_blueprint_name: 'SECRET-NAME',
  });
  await render({ presentation: 'readonly', processLinks });
  assert.ok(!container.outerHTML.includes('SECRET')); assert.equal(container.querySelector('.cbmx-pcb-open'), null);
  assert.match(container.textContent, flags.link_exists === false ? /No PCB linked/ : /Linked PCB \(no access\)/);
  assert.equal(container.querySelector(editingControls), null); assert.deepEqual(opened, []); assert.deepEqual(managed, []);
});

test('an authorized PCB with a missing target ID is shown as plain text without a broken Open control', async () => {
  const processLinks = links('viewer'); processLinks[0].process_canvas_blueprint_id = null;
  await render({ presentation: 'readonly', processLinks }); assert.match(container.textContent, /Visible canvas/);
  assert.equal(container.querySelector('.cbmx-pcb-open'), null); assert.deepEqual(opened, []);
});

for (const role of ['owner', 'editor', 'viewer', null]) test(`editing mode preserves PCB dropdown management restrictions for ${role ?? 'no access'}`, async () => {
  await render({ presentation: 'editor', processLinks: links(role) });
  await click(button('Process Canvas ▾'));
  const canManage = role === 'owner' || role === 'editor';
  for (const label of ['Replace with new Canvas', 'Relink to existing Canvas', 'Remove link']) assert.equal(Boolean(button(label) && !button(label).disabled), canManage, label);
  assert.ok(button('Open linked Canvas')); assert.equal(button('Open linked Canvas').disabled, !role);
  assert.equal(container.querySelector('.cbmx-pcb-open'), null);
  if (role) { await click(button('Open linked Canvas')); assert.deepEqual(opened, ['canvas-id']); }
  assert.deepEqual(managed, []);
});

test('read-only blank legacy records share clean export presentation while editing retains process recovery', async () => {
  for (const actor of blueprint.actors) { actor.costs = [{ type: 'Financial', description: '' }]; actor.benefits = []; actor.kpis = []; actor.services = [{ name: '', operations: [] }]; }
  blueprint.coCreationProcesses = [{ id: 'P0', name: '', participantActorIds: [] }, { id: 'P1', name: '', participantActorIds: [] }];
  const before = JSON.stringify(blueprint); await render({ presentation: 'readonly' });
  assert.equal(container.querySelectorAll('.cbmx-process-row').length, 1); assert.match(container.textContent, /Visible canvas/);
  assert.ok(!container.textContent.includes('Unnamed process')); assert.ok(!container.textContent.includes('…')); assert.ok(!container.textContent.includes('Click to edit'));
  assert.equal(container.querySelector('.cbmx-item-marker'), null); assert.equal(container.querySelectorAll('tbody > tr').length, 13);
  assert.equal(JSON.stringify(blueprint), before);
  await render({ presentation: 'editor' }); assert.equal(container.querySelectorAll('.cbmx-process-row').length, 2);
  assert.match(container.textContent, /Unnamed process \(P0\)/); assert.equal(JSON.stringify(blueprint), before);
});

test('editing keeps the specialized process Delete callback with its stable process ID', async () => {
  await render({ presentation: 'editor' });
  await click([...container.querySelectorAll('button[title="Click to edit"]')].find(node => node.textContent.startsWith('Fulfil request')));
  assert.ok(button('Rename')); assert.ok(button('Delete'));
  await click(button('Delete')); assert.deepEqual(managed, [['delete', 'P1']]); assert.equal(notifications, 0);
  assert.equal(blueprint.coCreationProcesses[0].id, 'P1'); assert.ok(container.querySelector('input[aria-label="Co-creation process"]'));
});

test('a blank legacy process with an authorized unnamed PCB still offers navigation in read-only mode', async () => {
  blueprint.coCreationProcesses = [{ id: 'P1', name: '', participantActorIds: [] }];
  const processLinks = links('viewer'); processLinks[0].process_canvas_blueprint_name = '';
  await render({ presentation: 'readonly', processLinks });
  const open = container.querySelector('.cbmx-pcb-open'); assert.ok(open); assert.equal(open.textContent.trim(), 'PCB: Linked Process Canvas');
  assert.ok(!container.textContent.includes('Unnamed process')); await click(open); assert.deepEqual(opened, ['canvas-id']);
  await render({ presentation: 'export', processLinks }); assert.equal(container.querySelector('.cbmx-process-row'), null);
  assert.equal(container.querySelectorAll('tbody > tr').length, 13);
});
