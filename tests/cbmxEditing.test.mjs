import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { act, createElement } from "react";
import { Window } from "happy-dom";
import { createServer } from "vite";

let window, server, root, container, createRoot, EditableText, EditableProcess, ValidationPanel;
before(async () => {
  window = new Window({ url: "http://localhost/synthetic" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Node", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import("react-dom/client"));
  server = await createServer({ configFile: false, envFile: false, esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  EditableText = (await server.ssrLoadModule("/src/components/cbmx/ui/EditableText.tsx")).default;
  EditableProcess = (await server.ssrLoadModule("/src/components/cbmx/ui/EditableProcess.tsx")).default;
  ValidationPanel = (await server.ssrLoadModule("/src/components/cbmx/ui/CBMXValidationPanel.tsx")).default;
});
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(async () => { await server?.close(); await window?.happyDOM.close(); });
const render = async (component, props) => act(async () => root.render(createElement(component, props)));
const trigger = () => container.querySelector('[title="Click to edit"]');
const field = () => container.querySelector("input,textarea");
const button = (name) => [...container.querySelectorAll("button")].find((element) => element.textContent === name);
const click = async (element) => act(async () => element.click());
const key = async (element, name, options = {}) => {
  const event = new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...options });
  await act(async () => element.dispatchEvent(event));
  return event;
};
const change = async (value) => act(async () => {
  const element = field();
  const prototype = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
});

for (const Component of ["text", "process"]) {
  test(`${Component}: Enter activates, Enter saves once, focus returns to content`, async () => {
    const commits = [];
    await render(Component === "text" ? EditableText : EditableProcess, { value: "Original", existing: true, onCommit: value => commits.push(value) });
    const activator = trigger(); activator.focus();
    await key(activator, "Enter");
    assert.ok(field()); assert.deepEqual(commits, []); assert.equal(document.activeElement, field());
    await change("Updated");
    const input = field();
    await act(async () => {
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    assert.deepEqual(commits, ["Updated"]); assert.equal(field(), null); assert.equal(document.activeElement, trigger());
  });
  test(`${Component}: Escape and Cancel discard drafts without blur commits`, async () => {
    const commits = [];
    await render(Component === "text" ? EditableText : EditableProcess, { value: "Original", onCommit: value => commits.push(value) });
    await click(trigger()); await change("Discard this");
    field().blur(); assert.deepEqual(commits, []);
    await key(field(), "Escape"); assert.equal(field(), null); assert.deepEqual(commits, []);
    assert.equal(document.activeElement, trigger());
    await click(trigger()); assert.equal(field().value, "Original"); await change("Discard again");
    button("Cancel").focus(); await key(button("Cancel"), "Escape");
    assert.equal(field(), null); assert.deepEqual(commits, []); assert.equal(document.activeElement, trigger());
    await click(trigger()); await click(button("Cancel")); assert.equal(document.activeElement, trigger());
  });
  test(`${Component}: composition and repeat keys never activate or commit`, async () => {
    const commits = [];
    await render(Component === "text" ? EditableText : EditableProcess, { value: "Original", onCommit: value => commits.push(value) });
    await key(trigger(), "Enter", { isComposing: true }); assert.equal(field(), null);
    await key(trigger(), "Enter", { repeat: true }); assert.equal(field(), null);
    await click(trigger());
    await key(field(), "Enter", { isComposing: true }); await key(field(), "Escape", { isComposing: true });
    await key(field(), "Enter", { repeat: true }); assert.ok(field()); assert.deepEqual(commits, []);
  });
  test(`${Component}: failed commit retains the draft and supports retry`, async () => {
    let fail = true; const commits = [];
    await render(Component === "text" ? EditableText : EditableProcess, { value: "Original", label: "Network Value Proposition", onCommit: value => {
      if (fail) throw new Error("Synthetic validation error"); commits.push(value);
    } });
    await click(trigger()); await change("Valid draft"); await key(field(), "Enter");
    assert.equal(field().value, "Valid draft"); assert.match(container.querySelector('[role="alert"]').textContent, /Synthetic validation error/);
    assert.equal(field().getAttribute("aria-describedby"), container.querySelector('[role="alert"]').id);
    if (Component === "text") assert.equal(field().getAttribute("aria-label"), "Network Value Proposition");
    fail = false; await key(field(), "Enter"); assert.deepEqual(commits, ["Valid draft"]);
  });
  test(`${Component}: read-only content has no editing controls`, async () => {
    await render(Component === "text" ? EditableText : EditableProcess, { value: "Read only", readOnly: true, onCommit: () => assert.fail("Must not commit") });
    assert.equal(trigger(), null); assert.equal(field(), null); assert.equal(container.querySelector("button"), null);
  });
}

for (const modifier of ["ctrlKey", "metaKey"]) test(`multiline: Enter preserves newlines; ${modifier}+Enter saves verbatim`, async () => {
  const commits = [];
  await render(EditableText, { value: "First paragraph", multiline: true, onCommit: value => commits.push(value) });
  await key(trigger(), "Enter");
  const newline = await key(field(), "Enter"); assert.equal(newline.defaultPrevented, false); assert.deepEqual(commits, []);
  await change("  First paragraph\n\nSecond paragraph  ");
  await key(field(), "Enter", { [modifier]: true });
  assert.deepEqual(commits, ["  First paragraph\n\nSecond paragraph  "]); assert.equal(document.activeElement, trigger());
});

test("an external value update does not overwrite an active draft; Cancel shows latest value", async () => {
  const props = { value: "Original", onCommit: () => assert.fail("Cancel must not commit") };
  await render(EditableText, props); await click(trigger()); await change("Local draft");
  await render(EditableText, { ...props, value: "Latest saved value" });
  assert.equal(field().value, "Local draft"); await click(button("Cancel"));
  assert.equal(trigger().textContent, "Latest saved value");
  await click(trigger()); assert.equal(field().value, "Latest saved value");
});

test("process retains contextual Rename/Add, error, and specialized Delete actions", async () => {
  let deleted = 0;
  await render(EditableProcess, { value: "Original", existing: true, onCommit: value => {
    if (!value.trim()) throw new Error("Enter a co-creation process name.");
  }, onDelete: async () => { deleted++; return false; } });
  await click(trigger()); assert.ok(button("Rename")); assert.ok(button("Delete")); assert.equal(button("Save"), undefined);
  await change(""); await key(field(), "Enter"); assert.ok(field()); assert.equal(deleted, 0);
  await click(button("Delete")); assert.equal(deleted, 1); assert.ok(field());
});

test("validation stays compact, exposes every message on expansion, and highlights blocking errors", async () => {
  await render(ValidationPanel, { issues: [{ level: "error", message: "Missing actors" }, { level: "warning", message: "Empty NVP" }] });
  const toggle = container.querySelector("button");
  assert.equal(toggle.getAttribute("aria-expanded"), "false"); assert.match(toggle.textContent, /Saving blocked/);
  assert.equal(container.querySelector("section").dataset.state, "error");
  await click(toggle); assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(container.querySelector(".cbmx-validation-messages").hidden, false);
  assert.match(container.querySelector("ul").textContent, /Missing actors/); assert.match(container.querySelector("ul").textContent, /Empty NVP/);
  await click(toggle); assert.equal(container.querySelector(".cbmx-validation-messages").hidden, true);
});
