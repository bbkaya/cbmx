// In-memory PostgreSQL only; accepts no connection URL and reads no env files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const moduleFlag = process.argv.find((arg) => arg.startsWith("--pglite-module="));
const { PGlite } = await import(moduleFlag ? pathToFileURL(moduleFlag.split("=")[1]).href : "@electric-sql/pglite");
const db = new PGlite();
const read = (name) => readFile(new URL(name, import.meta.url), "utf8");
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const viewer = "00000000-0000-0000-0000-000000000003";
const other = "00000000-0000-0000-0000-000000000004";
const bp = "10000000-0000-0000-0000-000000000001";
const hiddenBP = "10000000-0000-0000-0000-000000000002";
const sharedBP = "10000000-0000-0000-0000-000000000003";
const ids = Object.fromEntries(["owned", "editor", "viewer", "hidden", "current", "same", "elsewhere", "other"].map((key, i) => [key, `20000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`]));
const json = { coCreationProcesses: [{ id: "P1", name: "Delivery" }, { id: "P2", name: "Support" }] };
let checks = 0;
const pass = (message) => { checks++; console.log("ok - " + message); };
const caller = async (user = a, role = "authenticated") => {
  await db.exec(`reset role; set role ${role}`);
  await query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
};
const options = async (source = bp, process = "P1") => (await query("select public.get_cbmx_process_canvas_options($1,$2) as result", [source, process]))[0].result;
const claim = async ({ source = bp, process = "P1", target = ids.owned, expected = ids.current } = {}) =>
  query("select * from public.link_available_cbmx_process_canvas($1,$2,$3,$4)", [source, process, target, expected]);
const snapshot = async () => (await query(`select jsonb_build_object(
  'blueprints',(select jsonb_agg(to_jsonb(b) order by b.id) from blueprints b),
  'pcbs',(select jsonb_agg(to_jsonb(p) order by p.id) from process_canvas_blueprints p),
  'links',(select jsonb_agg(to_jsonb(l) order by l.id) from cbmx_process_links l)) as result`))[0].result;
async function reset() {
  await db.exec("reset role; truncate cbmx_process_links,blueprint_members,process_canvas_blueprint_members,blueprints,process_canvas_blueprints cascade");
  await query("insert into blueprints(id,owner_user_id,name,blueprint_json) values ($1,$4,'Owned',$6),($2,$5,'Hidden source',$6),($3,$5,'Shared source',$6)", [bp, hiddenBP, sharedBP, a, other, json]);
  await query("insert into blueprint_members values ($1,$4,'owner'),($1,$5,'editor'),($1,$6,'viewer'),($2,$7,'owner'),($3,$7,'owner'),($3,$4,'editor'),($3,$5,'editor')", [bp, hiddenBP, sharedBP, a, b, viewer, other]);
  for (const [key, id] of Object.entries(ids)) {
    await query("insert into process_canvas_blueprints(id,owner_user_id,name,blueprint_json) values ($1,$2,$3,$4)", [id, ["editor", "viewer", "hidden"].includes(key) ? other : a,
      { owned: "Alpha", editor: "Alpha", viewer: "Viewer only", hidden: "Hidden Canvas", current: "Current", same: "Linked here", elsewhere: "Linked in hidden source", other: "Zulu" }[key], { contents: "Untouched " + key }]);
  }
  await query("insert into process_canvas_blueprint_members values ($1,$4,'editor'),($2,$4,'viewer'),($3,$5,'editor'),($6,$5,'editor')", [ids.editor, ids.viewer, ids.current, a, b, ids.owned]);
  await query("insert into cbmx_process_links(cbmx_blueprint_id,cbmx_process_id,process_canvas_blueprint_id) values ($1,'P1',$3),($1,'P2',$4),($2,'P1',$5)", [bp, hiddenBP, ids.current, ids.same, ids.elsewhere]);
  await caller();
}
try {
  console.log((await query("select version() as v"))[0].v);
  assert.equal(Math.floor(Number((await query("show server_version_num"))[0].server_version_num) / 10000), 17);
  await db.exec(await read("fixtures/minimal-schema.sql"));
  await db.exec(await read("fixtures/process-links.sql"));
  await db.exec(await read("fixtures/process-link-functions.sql"));
  await db.exec(await read("../migrations/20261114091941_safe_cbmx_process_deletion.sql"));
  await db.exec("create trigger bump_version before update on blueprints for each row execute function public.bump_version_and_updated_at()");
  const baseline = await query(`select 'constraint' kind, conname name, pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.cbmx_process_links'::regclass
    union all select 'policy',policyname,to_jsonb(p)::text from pg_policies p where schemaname='public'
    union all select 'function',oid::regprocedure::text,pg_get_functiondef(oid) from pg_proc where pronamespace='public'::regnamespace order by 1,2`);
  const migration = await read("../migrations/20261114143904_process_canvas_link_selection.sql");
  assert.equal(createHash("sha256").update(migration).digest("hex"), "9a3bff2fbecdc94fe3974576bbedaaefb6a4a56f8c7cb447a10b38a931fd3a55", "Deployed linking SQL must remain unchanged");
  await db.exec(migration);
  const after = await query(`select 'constraint' kind, conname name, pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.cbmx_process_links'::regclass
    union all select 'policy',policyname,to_jsonb(p)::text from pg_policies p where schemaname='public'
    union all select 'function',oid::regprocedure::text,pg_get_functiondef(oid) from pg_proc where pronamespace='public'::regnamespace
      and proname not in ('get_cbmx_process_canvas_options','link_available_cbmx_process_canvas') order by 1,2`);
  assert.deepEqual(after, baseline);
  pass("no duplicate constraints, policy changes, or changes to existing RPCs");
  for (const signature of ["public.get_cbmx_process_canvas_options(uuid,text)", "public.link_available_cbmx_process_canvas(uuid,text,uuid,uuid)"]) {
    assert.equal((await query("select has_function_privilege('anon',$1,'execute') allowed", [signature]))[0].allowed, false);
    assert.equal((await query("select has_function_privilege('authenticated',$1,'execute') allowed", [signature]))[0].allowed, true);
    const fn = (await query("select proconfig,prosecdef from pg_proc where oid=$1::regprocedure", [signature]))[0];
    assert.deepEqual(fn.proconfig, ['search_path=""']); assert.equal(fn.prosecdef, true);
  }
  pass("RPC grants and pinned search paths restrict the privileged API");
  for (const user of [a, b, viewer, other]) await query("insert into auth.users(id,created_at) values ($1,now())", [user]);

  await reset();
  const list = await options();
  assert.deepEqual(list.current_canvas, { id: ids.current, name: "Current" });
  assert.deepEqual(list.canvases.map(p => p.id), [ids.owned, ids.editor, ids.other]);
  assert.deepEqual(list.canvases.map(p => p.role), ["owner", "editor", "owner"]);
  assert.equal((await query("select count(*)::int n from cbmx_process_links where process_canvas_blueprint_id=$1", [ids.elsewhere]))[0].n, 0, "source link is hidden by RLS");
  assert.ok(!JSON.stringify(list).includes(hiddenBP));
  assert.ok(!list.canvases.some(p => [ids.viewer, ids.hidden, ids.current, ids.same, ids.elsewhere].includes(p.id)));
  pass("options exclude viewers, inaccessible PCBs, current link, same-source and hidden-source links; duplicate names keep distinct IDs");
  await assert.rejects(options(hiddenBP), /CBMX edit access/);
  await assert.rejects(options(bp, "missing"), /saved blueprint/);
  await caller(viewer); await assert.rejects(options(), /CBMX edit access/); await assert.rejects(claim(), /CBMX edit access/);
  await caller(""); await assert.rejects(options(), /Not authenticated/); await assert.rejects(claim(), /Not authenticated/);
  await caller(a, "anon"); await assert.rejects(options(), /permission denied/); await assert.rejects(claim(), /permission denied/);
  pass("hidden CBMX, viewer CBMX, missing identity, anon, and missing process are denied");

  await reset(); await db.exec("reset role"); const beforeRead = await snapshot(); await caller();
  await options(); await db.exec("reset role"); assert.deepEqual(await snapshot(), beforeRead);
  pass("opening or cancelling selection makes no data or version changes");
  await caller(); await claim({ source: sharedBP, expected: null });
  await db.exec("reset role"); const ownedLink = (await query("select * from cbmx_process_links where cbmx_blueprint_id=$1", [sharedBP]))[0];
  assert.equal(ownedLink.process_canvas_blueprint_id, ids.owned);
  assert.deepEqual((await snapshot()).pcbs, beforeRead.pcbs); assert.deepEqual((await snapshot()).blueprints, beforeRead.blueprints);
  pass("CBMX editor can link an owned Canvas without changing either artifact's JSON/version");

  await reset(); await db.exec("reset role"); const beforeRelink = await snapshot();
  const oldLink = beforeRelink.links.find(l => l.cbmx_blueprint_id === bp && l.cbmx_process_id === "P1");
  await caller(); await claim({ target: ids.editor });
  const released = await options(); assert.ok(released.canvases.some(p => p.id === ids.current));
  await db.exec("reset role"); const relinked = await snapshot();
  const newLink = relinked.links.find(l => l.id === oldLink.id);
  assert.equal(newLink.process_canvas_blueprint_id, ids.editor);
  assert.deepEqual(relinked.pcbs, beforeRelink.pcbs); assert.deepEqual(relinked.blueprints, beforeRelink.blueprints);
  pass("relink to a shared Editor Canvas replaces the same link row and releases the unchanged old Canvas");

  for (const target of [ids.current, ids.same, ids.elsewhere]) {
    await reset(); await db.exec("reset role"); const before = await snapshot(); await caller();
    await assert.rejects(claim({ target }), error => error.code === "23505");
    await db.exec("reset role"); assert.deepEqual(await snapshot(), before);
  }
  pass("current, same-source and cross-source occupied targets are rechecked on submit without removing the original link");

  await reset(); await options(); await db.exec("reset role");
  await query("delete from process_canvas_blueprint_members where process_canvas_blueprint_id=$1 and user_id=$2", [ids.editor, a]);
  const targetRevoked = await snapshot(); await caller(); await assert.rejects(claim({ target: ids.editor }), error => error.code === "42501");
  await db.exec("reset role"); assert.deepEqual(await snapshot(), targetRevoked);
  await caller(b); await options(); await db.exec("reset role");
  await query("delete from process_canvas_blueprint_members where process_canvas_blueprint_id=$1 and user_id=$2", [ids.current, b]);
  await caller(b); await assert.rejects(options(), /currently linked Canvas/); await assert.rejects(claim(), error => error.code === "42501");
  pass("revoked target/current PCB edit permission is enforced on confirmation and metadata reload");
  await reset(); await caller(); await options(sharedBP); await db.exec("reset role");
  await query("update blueprint_members set role='viewer' where blueprint_id=$1 and user_id=$2", [sharedBP, a]);
  await caller(); await assert.rejects(claim({ source: sharedBP, expected: null }), error => error.code === "42501");
  pass("revoked shared-CBMX edit access cannot be bypassed");

  await reset(); await claim({ target: ids.other });
  await assert.rejects(claim(), error => error.code === "40001");
  await db.exec("reset role"); assert.equal((await query("select process_canvas_blueprint_id id from cbmx_process_links where cbmx_blueprint_id=$1 and cbmx_process_id='P1'", [bp]))[0].id, ids.other);
  pass("changed association cannot be overwritten from a stale dialog");
  await reset(); await options(); await db.exec("reset role");
  await query("delete from process_canvas_blueprint_members where process_canvas_blueprint_id=$1", [ids.current]);
  await query("delete from process_canvas_blueprints where id=$1", [ids.current]);
  await caller(); await assert.rejects(claim(), error => error.code === "40001");
  assert.equal((await options()).current_canvas, null);
  pass("externally deleted current PCB requires fresh context before linking");

  await reset(); await options(); await db.exec("reset role");
  await query("delete from process_canvas_blueprint_members where process_canvas_blueprint_id=$1", [ids.owned]);
  await query("delete from process_canvas_blueprints where id=$1", [ids.owned]);
  const missingTarget = await snapshot(); await caller();
  await assert.rejects(claim(), error => error.code === "42501");
  await db.exec("reset role"); assert.deepEqual(await snapshot(), missingTarget);
  pass("a selected PCB deleted after loading cannot remove the original association");

  await reset(); await db.exec("reset role");
  await query("insert into cbmx_process_links(cbmx_blueprint_id,cbmx_process_id,process_canvas_blueprint_id) values ($1,'P2',$3),($2,'P1',$4),($2,'P2',$5)", [hiddenBP, sharedBP, ids.owned, ids.editor, ids.other]);
  await caller(); assert.deepEqual((await options()).canvases, []);
  pass("no eligible unlinked editable Canvases returns an empty list without hidden association metadata");

  await reset(); await db.exec("reset role"); const beforeFailure = await snapshot();
  await db.exec(`create function private.fail_link() returns trigger language plpgsql as $$ begin raise exception 'simulated replacement failure'; end $$;
    create trigger fail_link before update on cbmx_process_links for each row execute function private.fail_link();`);
  await caller(); await assert.rejects(claim(), /simulated replacement failure/);
  await db.exec("reset role; drop trigger fail_link on cbmx_process_links"); assert.deepEqual(await snapshot(), beforeFailure);
  pass("failure inside the actual upsert rolls back the entire replacement");

  await reset(); await caller(a); await options(); await caller(b); await options(sharedBP);
  // Two queued requests, each carrying its own caller identity. PGlite has one
  // backend: this simulates competing API claims, not overlapping native sessions.
  const compete = (user, source, expected) => query(`with identity as materialized (select set_config('request.jwt.claim.sub',$1,true) claim)
    select r.* from identity i cross join lateral public.link_available_cbmx_process_canvas($2,'P1',$3,case when length(i.claim)>0 then $4::uuid end) r`, [user, source, ids.owned, expected]);
  const results = await Promise.allSettled([compete(a, bp, ids.current), compete(b, sharedBP, null)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "23505");
  await db.exec("reset role"); assert.equal((await query("select count(*)::int n from cbmx_process_links where process_canvas_blueprint_id=$1", [ids.owned]))[0].n, 1);
  pass("two callers with stale availability lists cannot both claim the same Canvas");

  await reset(); await caller();
  await query("select * from public.upsert_cbmx_process_link($1,'P1',$2)", [sharedBP, ids.owned]);
  await assert.rejects(query("select * from public.upsert_cbmx_process_link($1,'P1',$2)", [bp, ids.owned]), error => error.code === "23505");
  assert.equal((await options()).current_canvas.id, ids.current);
  pass("legacy Create New/upsert path retains global uniqueness and atomic failure behavior");

  await reset(); await claim({ target: ids.editor });
  const deleted = (await query("select * from public.delete_cbmx_process_with_version($1,1,'Owned',$2,'P1',$3)", [bp, json, ids.editor]))[0];
  assert.equal(deleted.ok, true); assert.ok(!deleted.blueprint_json.coCreationProcesses.some(p => p.id === "P1"));
  await db.exec("reset role"); assert.equal((await query("select count(*)::int n from process_canvas_blueprints where id=$1", [ids.editor]))[0].n, 1);
  assert.equal((await query("select count(*)::int n from cbmx_process_links where process_canvas_blueprint_id=$1", [ids.editor]))[0].n, 0);
  pass("safe process deletion still removes the replacement association and preserves its PCB");
  console.log(`PASS: ${checks} linking database scenarios on isolated PostgreSQL 17.`);
} finally { await db.close(); }
