// Disposable in-memory PostgreSQL only. No env files, URLs, or hosted mode.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const moduleFlag = process.argv.find((arg) => arg.startsWith("--pglite-module="));
const { PGlite } = await import(moduleFlag ? pathToFileURL(moduleFlag.split("=")[1]).href : "@electric-sql/pglite");
const db = new PGlite();
const read = (name) => readFile(new URL(name, import.meta.url), "utf8");
const owner = "00000000-0000-0000-0000-000000000001";
const editor = "00000000-0000-0000-0000-000000000002";
const viewer = "00000000-0000-0000-0000-000000000003";
const bp = "10000000-0000-0000-0000-000000000001";
const pcb = "20000000-0000-0000-0000-000000000001";
const pcb2 = "20000000-0000-0000-0000-000000000002";
const json = { meta: { name: "Test" }, coCreationProcesses: [
  { id: "P1", name: "Delivery", participantActorIds: ["A1", "A2"] },
  { id: "P2", name: "Support", participantActorIds: [] },
] };
let checks = 0;
const pass = (label) => { checks++; console.log("ok - " + label); };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const snapshot = async () => (await rows(`select jsonb_build_object('blueprints',(select jsonb_agg(to_jsonb(b)) from blueprints b),
  'links',(select jsonb_agg(to_jsonb(l)) from cbmx_process_links l), 'pcbs',(select jsonb_agg(to_jsonb(p)) from process_canvas_blueprints p)) as data`))[0].data;
const caller = async (user = owner, role = "authenticated") => {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
};
const remove = async ({ id = "P1", expected = pcb, version = 1, draft = json, name = "Test" } = {}) =>
  (await rows("select * from public.delete_cbmx_process_with_version($1,$2,$3,$4,$5,$6)", [bp, version, name, draft, id, expected]))[0];
async function reset({ link = true } = {}) {
  await db.exec("reset role; truncate public.cbmx_process_links, public.blueprint_members, public.process_canvas_blueprint_members, public.blueprints, public.process_canvas_blueprints cascade");
  await db.query("insert into blueprints(id,owner_user_id,name,blueprint_json) values ($1,$2,'Test',$3)", [bp, owner, json]);
  await db.query("insert into blueprint_members values ($1,$2,'owner'),($1,$3,'editor'),($1,$4,'viewer')", [bp, owner, editor, viewer]);
  await db.query("insert into process_canvas_blueprints(id,owner_user_id,name,blueprint_json) values ($1,$3,'Canvas',$4),($2,$3,'Other Canvas',$4)", [pcb, pcb2, owner, { contents: "Keep everything" }]);
  if (link) await db.query("insert into cbmx_process_links(cbmx_blueprint_id,cbmx_process_id,process_canvas_blueprint_id) values ($1,'P1',$2)", [bp, pcb]);
  await caller();
}
try {
  console.log((await rows("select version() as v"))[0].v);
  assert.equal(Math.floor(Number((await rows("show server_version_num"))[0].server_version_num) / 10000), 17);
  await db.exec(await read("fixtures/minimal-schema.sql"));
  await db.exec(await read("fixtures/process-links.sql"));
  await db.exec(await read("fixtures/process-link-functions.sql"));
  await db.exec(`create trigger bump_version before update on public.blueprints for each row execute function public.bump_version_and_updated_at();
    revoke all on function public.save_blueprint_with_version(uuid,bigint,text,jsonb) from public, anon;
    revoke all on function public.unlink_cbmx_process_link(uuid,text) from public, anon;
    revoke all on function public.upsert_cbmx_process_link(uuid,text,uuid) from public, anon;
    revoke all on function public.list_cbmx_process_links_with_access(uuid) from public, anon;
    grant execute on function public.save_blueprint_with_version(uuid,bigint,text,jsonb), public.unlink_cbmx_process_link(uuid,text),
      public.upsert_cbmx_process_link(uuid,text,uuid), public.list_cbmx_process_links_with_access(uuid) to authenticated;`);
  const definitions = await rows(`select oid::regprocedure::text signature, pg_get_functiondef(oid) definition from pg_proc
    where pronamespace = 'public'::regnamespace order by signature`);
  const migration = await read("../migrations/20261114091941_safe_cbmx_process_deletion.sql");
  assert.equal(createHash("sha256").update(migration).digest("hex"), "896fde1bac976eeae22e1598911111895061b08d44bba90384f06c7a683d9c91", "Deployed process deletion SQL must remain unchanged");
  await db.exec(migration);
  const afterDefinitions = await rows(`select oid::regprocedure::text signature, pg_get_functiondef(oid) definition from pg_proc
    where pronamespace = 'public'::regnamespace and proname <> 'delete_cbmx_process_with_version' order by signature`);
  assert.deepEqual(afterDefinitions, definitions);
  assert.equal((await rows(`select has_function_privilege('anon', 'public.delete_cbmx_process_with_version(uuid,bigint,text,jsonb,text,uuid)', 'execute') allowed`))[0].allowed, false);
  assert.equal((await rows(`select has_function_privilege('authenticated', 'private.guard_cbmx_process_link_removal()', 'execute') allowed`))[0].allowed, false);
  pass("existing RPC definitions unchanged; anonymous endpoint and direct helper execution denied");
  await db.query("insert into auth.users(id,created_at) values ($1,now()),($2,now()),($3,now())", [owner, editor, viewer]);

  for (const link of [false, true]) {
    await reset({ link });
    const renamed = structuredClone(json); renamed.coCreationProcesses[0].name = "Renamed";
    const saved = (await rows("select * from save_blueprint_with_version($1,1,'Test',$2)", [bp, renamed]))[0];
    assert.equal(saved.ok, true); assert.equal(saved.version_no, 2);
    assert.deepEqual(saved.blueprint_json.coCreationProcesses[0], { ...json.coCreationProcesses[0], name: "Renamed" });
    assert.equal((await rows("select count(*)::int n from cbmx_process_links"))[0].n, link ? 1 : 0);
    assert.deepEqual((await rows("select blueprint_json from blueprints where id=$1", [bp]))[0].blueprint_json, renamed);
    pass(`rename and reload preserve stable ID, actors, and ${link ? "link" : "unlinked state"}`);
  }
  await reset({ link: false });
  const unlinked = await remove({ expected: null });
  assert.equal(unlinked.ok, true); assert.equal(unlinked.version_no, 2);
  assert.deepEqual(unlinked.blueprint_json.coCreationProcesses.map(p => p.id), ["P2"]);
  pass("unlinked deletion saves and reloads atomically");

  await reset();
  const pcbsBefore = await rows("select * from process_canvas_blueprints order by id");
  const deleted = await remove();
  assert.equal(deleted.ok, true); assert.equal(deleted.version_no, 2);
  assert.equal((await rows("select count(*)::int n from cbmx_process_links"))[0].n, 0);
  assert.deepEqual((await rows("select blueprint_json from blueprints where id=$1", [bp]))[0].blueprint_json.coCreationProcesses.map(p => p.id), ["P2"]);
  assert.deepEqual(await rows("select * from process_canvas_blueprints order by id"), pcbsBefore);
  pass("linked deletion removes process and association; repository PCB bytes remain unchanged");
  const added = structuredClone(deleted.blueprint_json);
  added.coCreationProcesses.push({ id: "P-new-uuid", name: "New", participantActorIds: [] });
  assert.equal((await rows("select * from save_blueprint_with_version($1,2,'Test',$2)", [bp, added]))[0].ok, true);
  assert.deepEqual(await rows("select * from list_cbmx_process_links_with_access($1)", [bp]), []);
  pass("adding and reloading after deletion cannot restore the removed link");

  await reset();
  await caller(editor);
  const hidden = (await rows("select * from list_cbmx_process_links_with_access($1)", [bp]))[0];
  assert.equal(hidden.has_pcb_access, false); assert.equal(hidden.process_canvas_blueprint_name, null);
  await assert.rejects(remove(), /edit access to the linked Process Canvas/);
  await db.exec("reset role"); const before = await snapshot();
  await caller(viewer); assert.equal((await remove()).reason, "forbidden");
  await caller(""); await assert.rejects(remove(), /Not authenticated/);
  await caller(owner, "anon"); await assert.rejects(remove(), /permission denied/);
  await db.exec("reset role"); assert.deepEqual(await snapshot(), before);
  pass("hidden PCB, viewer, missing identity, and anon cannot bypass unlink/save permissions");
  await db.query("insert into process_canvas_blueprint_members values ($1,$2,'viewer')", [pcb, editor]);
  await caller(editor); await assert.rejects(remove(), /edit access to the linked Process Canvas/);
  await db.exec("reset role; update process_canvas_blueprint_members set role='editor'");
  await caller(editor); assert.equal((await remove()).ok, true);
  pass("PCB viewers cannot delete linked process; editors of both artifacts can");

  await reset(); await db.exec("reset role"); const original = await snapshot(); await caller();
  assert.equal((await remove({ version: 0 })).reason, "stale");
  await assert.rejects(remove({ expected: null }), /association changed/);
  await assert.rejects(remove({ expected: pcb2 }), /association changed/);
  await db.exec("reset role"); assert.deepEqual(await snapshot(), original);
  pass("stale version and changed/missing confirmation abort without touching either record");
  await caller();
  const without = { ...json, coCreationProcesses: [json.coCreationProcesses[1]] };
  await assert.rejects(rows("select * from save_blueprint_with_version($1,1,'Test',$2)", [bp, without]), /Delete linked co-creation processes explicitly/);
  await assert.rejects(rows("update blueprints set blueprint_json=$1 where id=$2", [without, bp]), /Delete linked co-creation processes explicitly/);
  await db.exec("reset role"); assert.deepEqual(await snapshot(), original);
  pass("legacy save, JSON replacement, and direct owner updates cannot orphan links");

  await db.query("insert into cbmx_process_links(cbmx_blueprint_id,cbmx_process_id,process_canvas_blueprint_id) values ($1,'P2',$2)", [bp, pcb2]);
  const bothLinks = await snapshot(); await caller();
  await assert.rejects(remove({ draft: { ...json, coCreationProcesses: [json.coCreationProcesses[0]] } }), /Delete linked co-creation processes explicitly/);
  await db.exec("reset role"); assert.deepEqual(await snapshot(), bothLinks);
  await db.query("delete from cbmx_process_links where cbmx_blueprint_id=$1 and cbmx_process_id='P2'", [bp]);
  pass("atomic deletion cannot smuggle removal of another linked process in the draft");

  await db.exec("alter table cbmx_process_links disable trigger guard_cbmx_process_link_target");
  await db.query("insert into cbmx_process_links(cbmx_blueprint_id,cbmx_process_id,process_canvas_blueprint_id) values ($1,'P3',$2)", [bp, pcb2]);
  await db.exec("alter table cbmx_process_links enable trigger guard_cbmx_process_link_target");
  const historical = await snapshot();
  await caller();
  await assert.rejects(rows("select * from save_blueprint_with_version($1,1,'Test',$2)", [bp, { ...json, coCreationProcesses: [...json.coCreationProcesses, { id: "P3", name: "Reused" }] }]), /historical association/);
  await db.exec("reset role"); assert.deepEqual(await snapshot(), historical);
  pass("historical orphan remains untouched and cannot attach to a newly introduced ID");

  await reset(); await db.exec("reset role"); const failureBefore = await snapshot();
  // Fail AFTER unlinking, inside the existing save RPC's update.
  await db.exec(`create function private.fail_process_save() returns trigger language plpgsql as $$ begin raise exception 'simulated database failure'; end $$;
    create trigger zz_fail before update on blueprints for each row execute function private.fail_process_save();`);
  await caller(); await assert.rejects(remove(), /simulated database failure/);
  await db.exec("reset role; drop trigger zz_fail on blueprints");
  assert.deepEqual(await snapshot(), failureBefore);
  pass("save exception after unlink rolls back process, link, version, and PCB");
  await db.exec(`create function private.revoke_during_unlink() returns trigger language plpgsql as $$
    begin delete from public.blueprint_members where blueprint_id=old.cbmx_blueprint_id and user_id=auth.uid(); return old; end $$;
    create trigger simulate_revocation before delete on public.cbmx_process_links for each row execute function private.revoke_during_unlink();`);
  await caller(); await assert.rejects(remove(), /Could not save process deletion/);
  await db.exec("reset role; drop trigger simulate_revocation on public.cbmx_process_links");
  assert.deepEqual(await snapshot(), failureBefore);
  assert.equal((await rows("select count(*)::int n from blueprint_members where user_id=$1", [owner]))[0].n, 1);
  pass("normal save failure result after unlink also rolls back association and membership change");
  await caller();
  await assert.rejects(remove({ id: "missing" }), /exactly one process/);
  await assert.rejects(rows("select * from upsert_cbmx_process_link($1,'missing',$2)", [bp, pcb2]), /does not belong/);
  await assert.rejects(rows("insert into cbmx_process_links(cbmx_blueprint_id,cbmx_process_id,process_canvas_blueprint_id) values ($1,'missing',$2)", [bp, pcb2]), /permission denied/);
  await db.exec("reset role");
  await assert.rejects(rows("insert into cbmx_process_links(cbmx_blueprint_id,cbmx_process_id,process_canvas_blueprint_id) values ($1,'missing',$2)", [bp, pcb2]), /no longer belongs/);
  pass("missing process IDs rejected by deletion, legacy linking, and link write guard");
  assert.deepEqual(await snapshot(), failureBefore);
  console.log(`PASS: ${checks} database scenarios; PostgreSQL 17 in memory; hosted data untouched.`);
} finally { await db.close(); }
