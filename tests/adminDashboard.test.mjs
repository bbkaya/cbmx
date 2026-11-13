import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createServer } from "vite";

let server, window, createRoot, root, container, App, MemoryRouter, data, Controller;
let calls = [];
let handler;
const ok = (data) => ({ data, error: null, status: 200 });
const denied = () => ({ data: null, error: { code: "42501", message: "denied" }, status: 403 });
const stats = { total_registered_users: 67, total_cbmx_blueprints: 112, total_pc_blueprints: 42 };
const blueprint = (index = 0, type = "CBMX") => ({
  blueprint_type: type, blueprint_id: `blueprint-${index}`, name: `Blueprint ${index + 1}`,
  owner_user_id: "owner-id", owner_name: "Inventory Owner", owner_email: "owner@example.invalid",
  created_at: "2026-01-01T12:00:00Z", updated_at: "2026-11-13T12:00:00Z",
});
const users = Array.from({ length: 28 }, (_, i) => ({
  user_id: `hidden-user-${i}`, email: i === 0 ? null : `user${i}@example.invalid`,
  display_name: i === 0 ? null : i === 1 ? "Banned Person" : i === 2 ? "Pending Person" : `User ${i}`,
  registration_date: "2026-01-01T12:00:00Z", is_confirmed: i !== 2, is_banned: i === 1,
  owned_cbmx_count: 0, owned_pc_count: i,
}));
function defaultHandler(name, args) {
  if (name === "admin_get_access") return ok(true);
  if (name === "admin_get_statistics") return ok(stats);
  if (name === "admin_list_blueprints") {
    const items = Array.from({ length: 52 }, (_, i) => blueprint(i, i % 2 ? "PC" : "CBMX"))
      .filter((row) => (!args.p_blueprint_type || row.blueprint_type === args.p_blueprint_type) &&
        `${row.name} ${row.owner_name} ${row.owner_email}`.toLowerCase().includes(args.p_search.toLowerCase()));
    return ok({ items: items.slice((args.p_page - 1) * args.p_page_size, args.p_page * args.p_page_size), total_count: items.length, page: args.p_page, page_size: args.p_page_size });
  }
  if (name === "admin_list_users") {
    const items = users.filter((row) => `${row.display_name} ${row.email}`.toLowerCase().includes(args.p_search.toLowerCase()));
    return ok({ items: items.slice((args.p_page - 1) * args.p_page_size, args.p_page * args.p_page_size), total_count: items.length, page: args.p_page, page_size: args.p_page_size });
  }
  throw new Error(`Unexpected RPC: ${name}`);
}

before(async () => {
  window = new Window({ url: "http://localhost/#/app/admin" });
  for (const key of ["window", "document", "navigator", "sessionStorage", "localStorage", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Node", "Event", "MouseEvent"])
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__adminAuthListeners = new Set();
  globalThis.__adminTestRpc = (name, args) => {
    const call = { name, args, signal: null };
    calls.push(call);
    const promise = Promise.resolve().then(() => handler(name, args));
    const request = {
      then: promise.then.bind(promise),
      abortSignal(signal) { call.signal = signal; return request; },
    };
    return request;
  };
  ({ createRoot } = await import("react-dom/client"));
  ({ MemoryRouter } = await import("react-router-dom"));
  server = await createServer({
    configFile: false, envFile: false, esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "mock-admin-boundaries", enforce: "pre",
      resolveId(source) {
        if (source === "../auth" || source === "./auth") return "\0admin-test-auth";
        if (source.endsWith("/supabaseClient") || source === "./supabaseClient") return "\0admin-test-supabase";
      },
      load(id) {
        if (id === "\0admin-test-auth") return `
          import { useSyncExternalStore } from 'react';
          export function useAuth() { return useSyncExternalStore(
            (fn) => { globalThis.__adminAuthListeners.add(fn); return () => globalThis.__adminAuthListeners.delete(fn); },
            () => globalThis.__adminTestAuth, () => globalThis.__adminTestAuth); }
          export function AuthProvider({children}) { return children; }
        `;
        if (id === "\0admin-test-supabase") return `export const supabase = {
          rpc: (...args) => globalThis.__adminTestRpc(...args),
          auth: { signOut() { throw new Error('Real authentication is disabled in tests'); } }
        };`;
      },
    }],
  });
  App = (await server.ssrLoadModule("/src/App.tsx")).default;
  data = await server.ssrLoadModule("/src/admin/AdminData.ts");
  Controller = (await server.ssrLoadModule("/src/admin/AdminAccessController.ts")).AdminAccessController;
});
beforeEach(() => {
  calls = [];
  handler = defaultHandler;
  globalThis.__adminTestAuth = { loading: false, user: { id: "admin-a", email: "admin@example.invalid" }, displayName: "Test Administrator" };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});
after(async () => { await server?.close(); await window?.happyDOM.close(); });

const text = () => container.textContent;
const section = (label) => container.querySelector(`[aria-labelledby="${label}"]`);
const button = (name, scope = container) => [...scope.querySelectorAll("button")].find((b) => b.textContent.trim() === name || b.getAttribute("aria-label") === name);
async function flush(delay = 0) { await act(async () => { await new Promise((resolve) => setTimeout(resolve, delay)); }); }
async function mount(path = "/app/admin") {
  await act(async () => { root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App))); });
  await flush();
}
async function click(element) { assert.ok(element, "control exists"); await act(async () => element.click()); await flush(); }
async function change(element, value) {
  assert.ok(element, "input exists");
  await act(async () => {
    const prototype = element instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function auth(value) {
  await act(async () => { globalThis.__adminTestAuth = value; for (const listener of globalThis.__adminAuthListeners) listener(); });
  await flush();
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("admin route renders statistics, read-only tables, statuses, and confirmed navigation", async () => {
  await mount();
  assert.ok(text().includes("Administrator Dashboard"));
  assert.ok(container.querySelector('a[href="/app/admin"][aria-current="page"]'));
  const overview = section("admin-overview-title");
  for (const value of ["67", "112", "42"]) assert.ok(overview.textContent.includes(value));
  assert.equal(section("admin-blueprints-title").querySelectorAll("tbody tr").length, 25);
  const userRows = [...section("admin-users-title").querySelectorAll("tbody tr")];
  assert.ok(userRows[0].textContent.includes("Unnamed user"));
  assert.ok(userRows[0].textContent.includes("—"));
  assert.equal(userRows[0].children[4].textContent, "0");
  assert.equal(userRows[1].children[3].textContent, "Banned");
  assert.equal(userRows[2].children[3].textContent, "Unconfirmed");
  assert.ok(!text().includes("hidden-user-"));
  assert.equal(section("admin-blueprints-title").querySelectorAll("tbody a, tbody button").length, 0);
  assert.equal(calls.filter((call) => call.name === "admin_get_access").length, 1, "navigation and guard share one access request");
  assert.equal(localStorage.length, 0, "admin reports are not persisted locally");
  assert.equal(sessionStorage.length, 0, "admin reports are not persisted for the browser session");
});

test("ordinary accounts cannot access the protected route or see the Admin link", async () => {
  handler = (name, args) => name === "admin_get_access" ? ok(false) : defaultHandler(name, args);
  await mount();
  assert.ok(text().includes("Administrator access required"));
  assert.ok(!container.querySelector('a[href="/app/admin"]'));
  assert.equal(calls.length, 1, "no reporting calls occur without confirmed access");
});

test("access stays unconfirmed until the capability response arrives", async () => {
  const reply = deferred();
  handler = (name, args) => name === "admin_get_access" ? reply.promise : defaultHandler(name, args);
  await mount();
  assert.ok(text().includes("Checking administrator access…"));
  assert.ok(!container.querySelector('a[href="/app/admin"]'));
  assert.equal(calls.length, 1);
  await act(async () => reply.resolve(ok(true))); await flush();
  assert.ok(text().includes("Administrator Dashboard"));
});

test("Admin navigation opens the actual protected route from the public shell", async () => {
  await mount("/");
  await click(container.querySelector('a[href="/app/admin"]'));
  assert.ok(text().includes("Administrator Dashboard"));
});

test("authentication loading and signed-out states never request reporting", async () => {
  globalThis.__adminTestAuth = { loading: true, user: null };
  await mount();
  assert.ok(text().includes("Loading"));
  assert.equal(calls.length, 0);
  await auth({ loading: false, user: null });
  assert.ok(container.querySelector('input[type="password"]'), "existing login route handles signed-out access");
  assert.equal(calls.length, 0);
});

test("sign-out clears administrator tables and navigation", async () => {
  await mount();
  assert.ok(text().includes("Inventory Owner"));
  await auth({ loading: false, user: null });
  assert.ok(!text().includes("Inventory Owner"));
  assert.ok(!text().includes("Administrator Dashboard"));
  assert.ok(!container.querySelector('a[href="/app/admin"]'));
});

test("account switching hides old data immediately and ignores old request completions", async () => {
  const oldUsers = deferred();
  handler = (name, args) => name === "admin_list_users" ? oldUsers.promise : defaultHandler(name, args);
  await mount();
  handler = (name, args) => name === "admin_get_access" ? ok(false) : defaultHandler(name, args);
  await auth({ loading: false, user: { id: "ordinary-b" }, displayName: "Ordinary User" });
  assert.ok(!text().includes("Inventory Owner"));
  await act(async () => oldUsers.resolve(ok({ items: users, total_count: users.length, page: 1, page_size: 25 })));
  await flush();
  assert.ok(text().includes("Administrator access required"));
  assert.ok(!text().includes("Banned Person"));
  assert.ok(calls.find((call) => call.name === "admin_list_users").signal.aborted);
});

test("reporting authorization failures revoke the whole dashboard immediately", async () => {
  await mount();
  handler = (name, args) => name === "admin_get_access" ? ok(false) : name === "admin_list_users" ? denied() : defaultHandler(name, args);
  await click(button("Refresh users"));
  assert.ok(text().includes("Administrator access required"));
  assert.ok(!text().includes("Inventory Owner"));
  assert.ok(!container.querySelector('a[href="/app/admin"]'));
});

test("focus revalidation is throttled and detects revocation", async () => {
  await mount();
  await act(async () => window.dispatchEvent(new window.Event("focus"))); await flush();
  assert.equal(calls.filter((c) => c.name === "admin_get_access").length, 1);
  const now = Date.now;
  try {
    Date.now = () => now() + 61_000;
    handler = (name, args) => name === "admin_get_access" ? ok(false) : defaultHandler(name, args);
    await act(async () => window.dispatchEvent(new window.Event("focus"))); await flush();
    assert.equal(calls.filter((c) => c.name === "admin_get_access").length, 2);
    assert.ok(text().includes("Administrator access required"));
    assert.ok(!text().includes("Inventory Owner"));
  } finally { Date.now = now; }
});

test("access errors fail closed and can be retried", async () => {
  handler = (name, args) => name === "admin_get_access" ? Promise.reject(new Error("offline")) : defaultHandler(name, args);
  await mount();
  assert.ok(text().includes("Unable to check administrator access"));
  assert.ok(container.querySelector('[role="alert"]'));
  assert.equal(calls.length, 1);
  handler = defaultHandler;
  await click(button("Check access again"));
  assert.ok(text().includes("Administrator Dashboard"));
});

test("blueprint pagination, filters, and sort use server parameters and reset the page", async () => {
  await mount();
  await click(button("Next blueprints page"));
  assert.ok(section("admin-blueprints-title").textContent.includes("Page 2 of 3"));
  assert.equal(calls.filter((c) => c.name === "admin_list_blueprints").at(-1).args.p_page, 2);
  await change(section("admin-blueprints-title").querySelector("select"), "PC"); await flush();
  let args = calls.filter((c) => c.name === "admin_list_blueprints").at(-1).args;
  assert.equal(args.p_blueprint_type, "PC"); assert.equal(args.p_page, 1);
  await click(button("Next blueprints page"));
  await click(button("Sort by Blueprint Name"));
  args = calls.filter((c) => c.name === "admin_list_blueprints").at(-1).args;
  assert.equal(args.p_sort_by, "name"); assert.equal(args.p_sort_direction, "asc");
  assert.equal(args.p_page, 1);
  assert.ok(container.querySelector('th[aria-sort="ascending"]'));
  await click(button("Sort by Blueprint Name"));
  assert.equal(calls.filter((c) => c.name === "admin_list_blueprints").at(-1).args.p_sort_direction, "desc");
});

test("search is debounced, resets pagination, and shows empty results", async () => {
  await mount();
  await click(button("Next blueprints page"));
  const before = calls.filter((c) => c.name === "admin_list_blueprints").length;
  const input = section("admin-blueprints-title").querySelector("input");
  await change(input, "no-match");
  assert.equal(calls.filter((c) => c.name === "admin_list_blueprints").length, before);
  await flush(330);
  const args = calls.filter((c) => c.name === "admin_list_blueprints").at(-1).args;
  assert.equal(args.p_search, "no-match"); assert.equal(args.p_page, 1);
  assert.ok(text().includes("No blueprints match these criteria."));
});

test("user search and pagination are independent of blueprint controls", async () => {
  await mount();
  const blueprintCalls = calls.filter((c) => c.name === "admin_list_blueprints").length;
  await click(button("Next users page"));
  assert.equal(calls.filter((c) => c.name === "admin_list_users").at(-1).args.p_page, 2);
  await change(section("admin-users-title").querySelector("input"), "Banned Person"); await flush(330);
  const args = calls.filter((c) => c.name === "admin_list_users").at(-1).args;
  assert.equal(args.p_search, "Banned Person"); assert.equal(args.p_page, 1);
  assert.ok(section("admin-users-title").textContent.includes("1 matching user"));
  assert.equal(calls.filter((c) => c.name === "admin_list_blueprints").length, blueprintCalls);
});

test("a stale inventory response cannot overwrite newer filter results", async () => {
  const old = deferred();
  handler = (name, args) => name === "admin_list_blueprints" && args.p_blueprint_type === null ? old.promise : defaultHandler(name, args);
  await mount();
  assert.ok(text().includes("Loading blueprints…"));
  await change(section("admin-blueprints-title").querySelector("select"), "PC"); await flush();
  assert.ok(section("admin-blueprints-title").textContent.includes("PC"));
  await act(async () => old.resolve(ok({ items: [{ ...blueprint(), name: "STALE RESULT" }], total_count: 1, page: 1, page_size: 25 })));
  await flush();
  assert.ok(!text().includes("STALE RESULT"));
});

test("authorization failure from a superseded search still revokes the current identity", async () => {
  const old = deferred();
  handler = (name, args) => name === "admin_list_blueprints" && args.p_blueprint_type === null ? old.promise : defaultHandler(name, args);
  await mount();
  await change(section("admin-blueprints-title").querySelector("select"), "PC"); await flush();
  await act(async () => old.resolve(denied())); await flush();
  assert.ok(text().includes("Administrator access required"));
  assert.ok(!text().includes("Inventory Owner"));
});

test("page-size changes reset the users page and remain server-side", async () => {
  await mount(); await click(button("Next users page"));
  await change(section("admin-users-title").querySelector('select[aria-label="users rows per page"]'), "50"); await flush();
  const args = calls.filter((c) => c.name === "admin_list_users").at(-1).args;
  assert.equal(args.p_page, 1); assert.equal(args.p_page_size, 50);
  assert.equal(section("admin-users-title").querySelectorAll("tbody tr").length, 28);
});

test("statistics and inventory failures show errors with retry controls", async () => {
  handler = (name, args) => name === "admin_get_statistics" || name === "admin_list_users"
    ? { data: null, error: { code: "XX000" }, status: 500 } : defaultHandler(name, args);
  await mount();
  assert.ok(section("admin-overview-title").querySelector('[role="alert"]'));
  assert.ok(section("admin-users-title").querySelector('[role="alert"]'));
  handler = defaultHandler;
  await click(button("Try again", section("admin-users-title")));
  assert.ok(section("admin-users-title").textContent.includes("Banned Person"));
});

test("typed RPC parsing rejects malformed contracts and discards unexpected blueprint payloads", async () => {
  handler = () => ok("true");
  await assert.rejects(data.getAdminAccess(), (error) => error.code === "RPC_CONTRACT");
  const params = { search: "", type: null, sortBy: "updated_at", sortDirection: "desc", page: 1, pageSize: 25 };
  handler = () => ok({ items: [{ ...blueprint(), blueprint_json: { secret: "must not escape" } }], total_count: 1, page: 1, page_size: 25 });
  const result = await data.listAdminBlueprints(params);
  assert.equal(Object.hasOwn(result.items[0], "blueprint_json"), false);
  handler = () => ok({ ...stats, total_registered_users: -1 });
  await assert.rejects(data.getAdminStatistics(), (error) => error.code === "RPC_CONTRACT");
});

test("shared access controller deduplicates checks and cannot be reauthorized by a stale response", async () => {
  const reply = deferred(); let requests = 0;
  const access = new Controller(() => { requests += 1; return reply.promise; }, "checking");
  const first = access.refresh(); const second = access.refresh();
  assert.equal(first, second); await Promise.resolve(); assert.equal(requests, 1);
  access.denyAccess(); reply.resolve(true); await first;
  assert.equal(access.getSnapshot().status, "denied");
  const signedOut = new Controller(() => { throw new Error("must not load"); }, "signed-out");
  await signedOut.refresh(); assert.equal(signedOut.getSnapshot().status, "signed-out");
});

test("frontend tests never load the real Supabase client or authentication module", () => {
  for (const id of server.moduleGraph.idToModuleMap.keys()) {
    assert.ok(!id.endsWith("/src/supabaseClient.ts") && !id.endsWith("/src/auth.tsx"), id);
  }
  assert.ok(calls.every((call) => ["admin_get_access", "admin_get_statistics", "admin_list_users", "admin_list_blueprints"].includes(call.name)));
});
