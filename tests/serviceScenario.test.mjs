import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// Transform only these UI/domain modules. Do not load App, auth, environment files,
// or the Supabase client, and do not start an HTTP server.
let server;
let domain;
let mutators;
let CBMXTable;
let validateTableBlueprint;
let EditableText;

before(async () => {
  server = await createServer({
    configFile: false,
    envFile: false,
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  domain = await server.ssrLoadModule("/src/components/cbmx/cbmxDomain.ts");
  mutators = await server.ssrLoadModule("/src/components/cbmx/cbmxMutators.ts");
  const table = await server.ssrLoadModule("/src/components/cbmx/CBMXTable.tsx");
  CBMXTable = table.default;
  validateTableBlueprint = table.validateCBMXBlueprint;
  EditableText = (await server.ssrLoadModule("/src/components/cbmx/ui/EditableText.tsx")).default;
});

after(async () => {
  await server?.close();
});

const helpText = "A narrative description of how the network value proposition is realized from the customer's perspective and how other actors contribute to its realization through their activities, interactions, and service exchanges";
const narrative = "\n  The customer requests help.\n\nOther actors exchange services.\n<script>plain text</script>\n";

function legacyBlueprint(actorCount = 2) {
  return {
    meta: { id: "legacy", name: "Legacy blueprint" },
    networkValueProposition: { statement: "Value" },
    actors: Array.from({ length: actorCount }, (_, i) => ({
      id: `A${i + 1}`,
      type: i === 0 ? "Customer" : i === 1 ? "Orchestrator" : "Other",
      name: `Actor ${i + 1}`,
      actorValueProposition: { statement: "Contribution" },
      costs: [{ type: "Financial", description: "Cost" }],
      benefits: [{ type: "Financial", description: "Benefit" }],
      kpis: [],
      services: [{ name: "Service", operations: [] }],
    })),
    coCreationProcesses: [{ id: "P1", name: "Delivery", participantActorIds: ["A1", "A2"] }],
  };
}

function renderTable(blueprint, onChange) {
  return renderToStaticMarkup(createElement(CBMXTable, { blueprint, onChange }));
}

function scenarioRow(markup) {
  const row = [...markup.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)]
    .map(([html]) => html)
    .find((html) => html.includes('<span>Service Scenario</span>'));
  assert.ok(row, "Service Scenario row exists");
  return row;
}

test("legacy rendering and exporting leave the loaded JSON/hash unchanged", () => {
  const blueprint = legacyBlueprint();
  const savedHash = JSON.stringify(blueprint);
  Object.freeze(blueprint);
  let updates = 0;
  renderTable(blueprint, () => { updates += 1; });
  renderTable(blueprint);
  const exported = domain.prepareCBMXJsonExport(blueprint);
  assert.equal(updates, 0);
  assert.equal(JSON.stringify(blueprint), savedHash);
  assert.equal(Object.hasOwn(blueprint, "serviceScenario"), false);
  assert.notEqual(exported, blueprint);
  assert.equal(exported.serviceScenario, "");
});

test("scenario edits and JSON round-trips preserve paragraphs and existing artifacts", () => {
  const blueprint = legacyBlueprint();
  const original = JSON.stringify(blueprint);
  const draft = domain.deepClone(blueprint);
  mutators.setServiceScenario(draft, narrative);
  const imported = JSON.parse(JSON.stringify(domain.prepareCBMXJsonExport(draft)));
  assert.equal(imported.serviceScenario, narrative);
  assert.deepEqual(imported.actors, blueprint.actors);
  assert.deepEqual(imported.coCreationProcesses, blueprint.coCreationProcesses);
  assert.deepEqual(imported.networkValueProposition, blueprint.networkValueProposition);
  assert.equal(JSON.stringify(blueprint), original);
  mutators.setServiceScenario(draft, "");
  assert.equal(domain.prepareCBMXJsonExport(draft).serviceScenario, "");
});

test("both validators allow absent/empty text and reject malformed scenario types", () => {
  for (const validate of [domain.validateCBMXBlueprint, validateTableBlueprint]) {
    const baseline = validate(legacyBlueprint());
    for (const value of [undefined, "", narrative]) {
      assert.deepEqual(validate({ ...legacyBlueprint(), serviceScenario: value }), baseline);
    }
    for (const value of [null, 42, {}, [], true]) {
      const errors = validate({ ...legacyBlueprint(), serviceScenario: value });
      assert.ok(errors.some((issue) => issue.level === "error" && issue.message.includes("Service Scenario")));
    }
  }
});

test("the single scenario row follows processes and spans every actor column", () => {
  for (const count of [2, 5, 10]) {
    const html = renderTable(legacyBlueprint(count));
    assert.equal((html.match(/<span>Service Scenario<\/span>/g) ?? []).length, 1);
    assert.ok(html.indexOf('<span>Co-Creation Processes</span>') < html.indexOf('<span>Service Scenario</span>'));
    assert.ok(html.indexOf('<span>Service Scenario</span>') < html.indexOf('</tbody>'));
    assert.ok(scenarioRow(html).includes(`colSpan="${count * 2}"`));
  }
});

test("viewers see preserved plain text without editing controls", () => {
  const row = scenarioRow(renderTable({ ...legacyBlueprint(), serviceScenario: narrative }));
  assert.ok(row.includes('white-space:pre-wrap'));
  assert.ok(row.includes('overflow-wrap:anywhere'));
  assert.ok(row.includes('\n\nOther actors exchange services.\n'));
  assert.ok(row.includes('&lt;script&gt;plain text&lt;/script&gt;'));
  assert.ok(!row.includes('title="Click to edit"'));
  assert.ok(!row.includes('<textarea'));
});

test("editable scenario uses existing click-to-edit convention and supplied icon help", () => {
  const row = scenarioRow(renderTable(legacyBlueprint(), () => {}));
  assert.ok(row.includes('title="Click to edit"'));
  assert.ok(row.includes('aria-label="Info: Service Scenario"'));
  assert.ok(row.includes(`title="${helpText.replaceAll("'", "&#x27;")}"`));
});

test("multiline formatting is opt-in and retains leading/trailing whitespace", () => {
  for (const readOnly of [true, false]) {
    const html = renderToStaticMarkup(createElement(EditableText, {
      value: narrative,
      multiline: true,
      readOnly,
      onCommit: () => assert.fail("Rendering must not commit"),
    }));
    assert.ok(html.includes('white-space:pre-wrap'));
    assert.ok(html.includes('\n  The customer requests help.\n\n'));
    assert.ok(html.includes('&lt;/script&gt;\n</div>'));
  }
  const singleLine = renderToStaticMarkup(createElement(EditableText, {
    value: "  NVP  ", readOnly: true, onCommit: () => {},
  }));
  assert.equal(singleLine, '<div>NVP</div>');
});

test("offline regression modules do not load Supabase or application auth", () => {
  for (const id of server.moduleGraph.idToModuleMap.keys()) {
    assert.ok(!/supabase|src\/auth\.tsx|src\/App\.tsx/.test(id), id);
  }
});
