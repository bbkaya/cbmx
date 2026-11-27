import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { act, createElement, useState } from 'react';
import { createServer } from 'vite';
import { Window } from 'happy-dom';

let window, server, root, container, createRoot, Dashboard, Table, domain, mutators, MemoryRouter, Routes, Route;
let inserted, bp, notifications;
const fixture = () => ({ meta: { name: 'Legacy', extension: { keep: true } },
  networkValueProposition: { statement: 'Network' }, serviceScenario: 'First\n\nLast',
  actors: [1, 2].map(n => ({ id: `A${n}`, name: `Actor ${n}`, type: n === 1 ? 'Customer' : 'Orchestrator',
    actorValueProposition: { statement: 'Contribution' }, costs: [], benefits: [], kpis: [], services: [] })),
  coCreationProcesses: [{ id: 'P1', name: 'Delivery', participantActorIds: ['A1', 'A2'] }], legacyExtension: { preserved: [1, 2] } });
before(async () => {
  window = new Window({ url: 'http://localhost/synthetic' });
  for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Node','Event','MouseEvent'])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.alert = message => assert.fail(message);
  globalThis.__releaseFrom = table => {
    assert.equal(table, 'blueprints');
    const query = { select() { return query; }, eq() { return query; }, ilike() { return query; },
      insert(value) { inserted.push(structuredClone(value)); return query; },
      single: async () => ({ data: { id: 'created-test' }, error: null }),
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); } };
    return query;
  };
  ({ createRoot } = await import('react-dom/client'));
  ({ MemoryRouter, Routes, Route } = await import('react-router-dom'));
  server = await createServer({ configFile: false, envFile: false, esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: 'release-offline-boundaries', enforce: 'pre', resolveId(source) {
      if (source.endsWith('/auth')) return '\0release-auth';
      if (source.endsWith('/supabaseClient')) return '\0release-client';
      if (source.endsWith('/cbmx/CBMXData')) return '\0release-data';
    }, load(id) {
      if (id === '\0release-auth') return "export const useAuth = () => ({ user: { id: 'synthetic-owner' } });";
      if (id === '\0release-client') return 'export const supabase = { from: (...args) => globalThis.__releaseFrom(...args) };';
      if (id === '\0release-data') return 'export const listAccessibleBlueprints = async () => [];';
    } }] });
  Dashboard = (await server.ssrLoadModule('/src/pages/DashboardPage.tsx')).default;
  Table = (await server.ssrLoadModule('/src/components/cbmx/CBMXTable.tsx')).default;
  domain = await server.ssrLoadModule('/src/components/cbmx/cbmxDomain.ts');
  mutators = await server.ssrLoadModule('/src/components/cbmx/cbmxMutators.ts');
});
beforeEach(() => { inserted = []; bp = fixture(); notifications = []; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(async () => { await server.close(); await window.happyDOM.close(); });
const click = async element => { assert.ok(element); await act(async () => element.click()); };
function Harness() {
  const [value, setValue] = useState(bp);
  return createElement(Table, { blueprint: value, onChange: next => { bp = next; notifications.push(next); setValue(next); } });
}

test('actual dashboard creation submits the existing five-actor JSON and navigates without a backend', async () => {
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ['/app'] }, createElement(Routes, null,
    createElement(Route, { path: '/app', element: createElement(Dashboard) }),
    createElement(Route, { path: '/app/b/:id', element: createElement('div', null, 'Created destination') })))));
  const create = [...container.querySelectorAll('button')].find(button => /New.*CBMX|New Blueprint/i.test(button.textContent));
  await click(create);
  assert.equal(inserted.length, 1);
  const record = inserted[0], value = record.blueprint_json;
  assert.equal(record.owner_user_id, 'synthetic-owner'); assert.ok(record.name.startsWith('New-Blueprint-'));
  assert.equal(record.name, value.meta.name); assert.equal(value.serviceScenario, '');
  assert.deepEqual(value.actors.map(a => [a.id, a.type]), [['A1','Customer'],['A2','Orchestrator'],['A3','Other'],['A4','Other'],['A5','Other']]);
  assert.deepEqual(value.coCreationProcesses[0].participantActorIds, ['A1','A2','A3','A4','A5']);
  assert.ok(container.textContent.includes('Created destination'));
});

test('actor limits protect the first two actors, preserve order and update process participation only', () => {
  const original = structuredClone(bp);
  mutators.removeActor(bp, 'A1'); mutators.removeActor(bp, 'A2'); assert.deepEqual(bp, original);
  for (let i = 0; i < 12; i++) mutators.addActor(bp);
  assert.equal(bp.actors.length, 10); assert.deepEqual(bp.actors.map(a => a.id), Array.from({length:10}, (_,i)=>`A${i+1}`));
  assert.deepEqual(bp.coCreationProcesses[0].participantActorIds, bp.actors.map(a => a.id));
  mutators.removeActor(bp, 'A6'); assert.ok(!bp.coCreationProcesses[0].participantActorIds.includes('A6'));
  mutators.addActor(bp); assert.equal(bp.actors.at(-1).id, 'A11');
  assert.deepEqual(bp.legacyExtension, original.legacyExtension); assert.deepEqual(bp.meta, original.meta);
});

for (const [row, text, key] of [
  ['networkVP','Changed network','network'], ['actor','Changed actor','actor'],
  ['actorVP','Changed contribution','contribution'], ['serviceScenario','Paragraph one\n\nParagraph two\n','scenario'],
]) test(`${key}: actual inline commit changes only the selected field and preserves legacy extensions`, async () => {
  await act(async () => root.render(createElement(Harness)));
  const scope = container.querySelector(`.cbmx-row--${row}`);
  await click(scope.querySelector('[title="Click to edit"]'));
  const input = scope.querySelector('input,textarea'); assert.ok(input);
  await act(async () => {
    const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,text);
    input.dispatchEvent(new window.Event('input',{bubbles:true}));
    input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:row==='serviceScenario',bubbles:true,cancelable:true}));
  });
  const expected = fixture();
  if (key==='network') expected.networkValueProposition.statement=text;
  if (key==='actor') expected.actors[0].name=text;
  if (key==='contribution') expected.actors[0].actorValueProposition.statement=text;
  if (key==='scenario') expected.serviceScenario=text;
  assert.deepEqual(bp,expected); assert.equal(notifications.length,1);
});

test('legacy normalization and JSON export preserve the source, extensions and actor order', () => {
  delete bp.serviceScenario; bp.actors[0].type='Other'; const original=structuredClone(bp);
  const normalized=domain.normalizeActors(bp.actors);
  assert.deepEqual(normalized.actors.map(a=>a.type),['Customer','Orchestrator']);
  assert.deepEqual(bp,original);
  const exported=domain.prepareCBMXJsonExport(bp); assert.deepEqual(bp,original);
  assert.deepEqual(JSON.parse(JSON.stringify(exported)),{...original,serviceScenario:''});
});

test('modelled HTML-looking content remains plain text in both interactive and read-only renderers', async () => {
  bp.actors[0].name='<img src=x onerror=alert(1)>';
  bp.serviceScenario='<script>window.leak = true</script>';
  for (const presentation of ['editor','readonly','export']) {
    await act(async () => root.render(createElement(Table,{blueprint:bp,presentation,onChange:()=>assert.fail('Rendering mutated JSON')})));
    assert.equal(container.querySelector('script,img'),null); assert.ok(container.textContent.includes(bp.actors[0].name));
    assert.ok(container.textContent.includes(bp.serviceScenario));
  }
});
