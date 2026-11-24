import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createServer } from "vite";

let server, window, createRoot, root, container, App, MemoryRouter, HashRouter, useLocation;
let calls, allowedAdmin, canvasRole;
const signedIn = { loading: false, user: { id: "test-user", email: "test@example.invalid" }, displayName: "Test User" };
const signedOut = { loading: false, user: null, displayName: "User" };
const ok = data => ({ data, error: null });

before(async () => {
  window = new Window({ url: "http://localhost/#/process-canvas" });
  for (const key of ["window", "document", "navigator", "sessionStorage", "localStorage", "HTMLElement", "HTMLInputElement", "Node", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.alert = message => assert.fail(`Unexpected alert: ${message}`);
  globalThis.__navListeners = new Set();
  globalThis.__navSetAuth = value => {
    globalThis.__navAuth = value;
    for (const listener of globalThis.__navListeners) listener();
  };
  globalThis.__navRpc = name => {
    calls.push(name);
    assert.equal(name, "admin_get_access");
    const promise = Promise.resolve(ok(allowedAdmin));
    const request = { then: promise.then.bind(promise), abortSignal() { return request; } };
    return request;
  };
  globalThis.__navFrom = table => {
    calls.push(table);
    const fixture = {
      process_canvas_blueprints: [{ id: "canvas-id", owner_user_id: "test-user", name: "Private Canvas", updated_at: "2026-01-01T00:00:00Z" }],
      process_canvas_blueprint_members: [{ process_canvas_blueprint_id: "canvas-id", user_id: "test-user", role: canvasRole }],
      profiles: [{ id: "test-user", email: "test@example.invalid", display_name: "Test User" }],
      blueprints: [],
    };
    assert.ok(Object.hasOwn(fixture, table), `Unexpected table: ${table}`);
    const request = {
      select() { return request; }, order() { return request; }, limit() { return request; },
      in() { return request; }, eq() { return request; },
      then(resolve, reject) { return Promise.resolve(ok(fixture[table])).then(resolve, reject); },
    };
    return request;
  };
  globalThis.__navSignIn = async () => { calls.push("signIn"); globalThis.__navSetAuth(signedIn); return ok(null); };
  globalThis.__navSignOut = async () => { calls.push("signOut"); globalThis.__navSetAuth(signedOut); return ok(null); };
  ({ createRoot } = await import("react-dom/client"));
  ({ MemoryRouter, HashRouter, useLocation } = await import("react-router-dom"));
  server = await createServer({
    configFile: false, envFile: false, esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "navigation-test-boundaries", enforce: "pre",
      resolveId(source) {
        if (source === "../auth" || source === "./auth") return "\0navigation-auth";
        if (source.endsWith("/supabaseClient") || source === "./supabaseClient") return "\0navigation-supabase";
      },
      load(id) {
        if (id === "\0navigation-auth") return `
          import { useSyncExternalStore } from 'react';
          export function useAuth() { return useSyncExternalStore(
            fn => { globalThis.__navListeners.add(fn); return () => globalThis.__navListeners.delete(fn); },
            () => globalThis.__navAuth, () => globalThis.__navAuth); }
          export function AuthProvider({children}) { return children; }
        `;
        if (id === "\0navigation-supabase") return `export const supabase = {
          rpc: (...args) => globalThis.__navRpc(...args), from: (...args) => globalThis.__navFrom(...args),
          auth: { signInWithPassword: () => globalThis.__navSignIn(), signOut: () => globalThis.__navSignOut() }
        };`;
      },
    }],
  });
  App = (await server.ssrLoadModule("/src/App.tsx")).default;
});

beforeEach(() => {
  calls = []; allowedAdmin = false; canvasRole = "owner";
  globalThis.__navAuth = signedOut;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
after(async () => { await server?.close(); await window?.happyDOM.close(); });

function LocationProbe() {
  const location = useLocation();
  return createElement("output", { id: "test-location" }, JSON.stringify({ path: location.pathname + location.search, state: location.state }));
}
const location = () => JSON.parse(container.querySelector("#test-location").textContent);
const header = () => container.querySelector("header");
const button = (text, scope = container) => [...scope.querySelectorAll("button")].find(node => node.textContent.trim() === text);
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function mount(path = "/process-canvas", hash = false) {
  if (hash) window.location.hash = `#${path}`;
  await act(async () => root.render(createElement(hash ? HashRouter : MemoryRouter,
    hash ? { window } : { initialEntries: [path] }, createElement(App), createElement(LocationProbe))));
  await flush();
}
async function click(node) { assert.ok(node, "control exists"); await act(async () => node.click()); await flush(); }

test("public page has content, examples, public navigation and no blueprint queries or controls", async () => {
  await mount();
  assert.deepEqual([...header().querySelectorAll("nav a")].map(node => node.textContent.trim()), ["CBMX", "Process Canvas"]);
  assert.equal(header().querySelector('a[href="/process-canvas"]').getAttribute("aria-current"), "page");
  for (const path of ["/login", "/signup"]) assert.ok(header().querySelector(`a[href="${path}"]`));
  for (const id of ["what", "how", "use-cases", "examples"]) assert.ok(container.querySelector(`#${id}`));
  assert.equal(container.querySelectorAll("main img").length, 5);
  assert.ok(container.textContent.includes("responsibility"));
  assert.equal(container.querySelector("table"), null);
  assert.equal(button("Rename"), undefined);
  assert.equal(button("Delete"), undefined);
  assert.deepEqual(calls, []);
  await click(header().querySelector('a[href="/"]'));
  for (const id of ["what-is", "how-it-works", "use-cases", "example"]) assert.ok(container.querySelector(`#${id}`));
});

test("public create CTA uses existing login destination and returns to creation after mocked sign-in", async () => {
  await mount();
  await click(container.querySelector('main a[href="/app/pcb/new"]'));
  assert.equal(location().path, "/login");
  assert.equal(location().state.from, "/app/pcb/new");
  const inputs = container.querySelectorAll("input");
  await act(async () => {
    for (const [index, value] of ["test@example.invalid", "test-password"].entries()) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(inputs[index], value);
      inputs[index].dispatchEvent(new window.Event("input", { bubbles: true }));
    }
  });
  await click(button("Login"));
  assert.equal(location().path, "/app/pcb/new");
  assert.ok(calls.includes("signIn"));
  // The existing editor starts as an unsaved canvas: navigating here must not insert a row.
  assert.equal(calls.includes("process_canvas_blueprints"), false);
});

for (const admin of [false, true]) test(`signed-in ${admin ? "administrator" : "member"} navigation, account and logout`, async () => {
  globalThis.__navAuth = signedIn; allowedAdmin = admin;
  await mount();
  assert.deepEqual([...header().querySelector("nav").querySelectorAll("a, button")].map(node => node.textContent.trim()), ["CBMX", "Process Canvas", "My Blueprints ▾"]);
  assert.equal(Boolean(header().querySelector('a[href="/app/admin"]')), admin);
  assert.equal([...header().querySelectorAll("a")].some(node => node.textContent.trim() === "Account"), false);
  assert.equal(calls.some(call => call.includes("blueprint")), false);
  const account = header().querySelector('a[href="/account"]');
  assert.ok(account.textContent.includes("Test User"));
  await click(account);
  assert.equal(location().path, "/account");
  assert.ok(container.querySelector("main").textContent.includes("Send password reset email"));
  await click(button("Logout"));
  assert.ok(calls.includes("signOut"));
  assert.equal(location().path, "/");
  assert.equal(button("My Blueprints ▾"), undefined);
  assert.ok(header().querySelector('a[href="/login"]'));
});

test("My Blueprints dropdown keeps both workspaces and Escape restores trigger focus", async () => {
  globalThis.__navAuth = signedIn;
  await mount();
  const trigger = button("My Blueprints ▾");
  await click(trigger);
  assert.ok(header().querySelector('#blueprints-navigation a[href="/app"]'));
  const canvasLink = header().querySelector('#blueprints-navigation a[href="/app/pcbs"]');
  canvasLink.focus();
  await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, trigger);
  await click(trigger);
  await click(header().querySelector('#blueprints-navigation a[href="/app/pcbs"]'));
  assert.equal(location().path, "/app/pcbs");
  assert.equal(button("My Blueprints ▾").getAttribute("aria-expanded"), "false");
  assert.equal(header().querySelector('a[href="/process-canvas"]').getAttribute("aria-current"), null);
  assert.equal(button("My Blueprints ▾").getAttribute("data-active"), "true");
  assert.ok(container.querySelector('a[href="/app/pcb/canvas-id"]'));
  for (const label of ["Open", "Share", "Rename", "Delete", "+ New Process Canvas"]) assert.ok(button(label));
  assert.equal(container.querySelector("#examples"), null);
});

test("workspace stays protected and viewer retains Open/Share without rename/delete controls", async () => {
  await mount("/app/pcbs");
  assert.equal(location().path, "/login");
  assert.equal(location().state.from, "/app/pcbs");
  assert.deepEqual(calls, []);
  await act(async () => globalThis.__navSetAuth(signedIn));
  // Re-mount directly to exercise the bookmarked workspace as a viewer.
  await act(async () => root.unmount()); root = createRoot(container);
  canvasRole = "viewer";
  await mount("/app/pcbs");
  assert.ok(button("Open")); assert.ok(button("Share"));
  assert.equal(button("Rename"), undefined); assert.equal(button("Delete"), undefined);
});

test("HashRouter supports direct public loading and refresh with no personal requests", async () => {
  await mount("/process-canvas", true);
  assert.equal(location().path, "/process-canvas");
  assert.ok(container.querySelector("#examples"));
  await act(async () => root.unmount()); root = createRoot(container);
  await mount("/process-canvas", true);
  assert.ok(container.querySelector("#what"));
  assert.deepEqual(calls, []);
});

test("public illustrations open and close independently of authenticated workspace state", async () => {
  await mount();
  await click(container.querySelector("#examples button"));
  const dialog = container.querySelector("dialog");
  assert.ok(dialog.hasAttribute("open"));
  assert.ok(dialog.querySelector('img[src$="TravelJourney.png"]'));
  await click(button("Close", dialog));
  assert.equal(dialog.hasAttribute("open"), false);
  assert.deepEqual(calls, []);
});
