// Isolated in-memory PostgreSQL only. No connection URLs or env-file loading.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const moduleFlag = process.argv.find(value => value.startsWith("--pglite-module="));
const { PGlite } = await import(moduleFlag ? pathToFileURL(moduleFlag.split("=")[1]).href : "@electric-sql/pglite");
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), "utf8");
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const admin = "00000000-0000-0000-0000-000000000001";
const owner = "00000000-0000-0000-0000-000000000002";
const owned = "30000000-0000-0000-0000-000000000001";
const edited = "10000000-0000-0000-0000-000000000002";
const viewed = "10000000-0000-0000-0000-000000000001";
const unshared = "10000000-0000-0000-0000-000000000004";
const json = { meta: { name: "Full content" }, coCreationProcesses: [{ id: "P1", name: "Delivery" }], private_notes: "Synthetic complete artifact contents" };
let checks = 0;
const pass = message => { checks++; console.log("ok - " + message); };
const caller = async (user = admin, role = "authenticated") => {
  await db.exec(`reset role; set role ${role}`);
  await query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
};
const load = async (type = "CBMX", id = unshared) => (await query("select public.admin_load_artifact($1,$2) as result", [type, id]))[0].result;
const snapshot = async () => (await query(`select jsonb_build_object(
  'blueprints',(select jsonb_agg(to_jsonb(b) order by id) from public.blueprints b),
  'pcbs',(select jsonb_agg(to_jsonb(p) order by id) from public.process_canvas_blueprints p),
  'members',(select jsonb_agg(to_jsonb(m) order by blueprint_id,user_id) from public.blueprint_members m),
  'pcb_members',(select jsonb_agg(to_jsonb(m) order by process_canvas_blueprint_id,user_id) from public.process_canvas_blueprint_members m),
  'links',(select jsonb_agg(to_jsonb(l) order by id) from public.cbmx_process_links l)) as result`))[0].result;
try {
  console.log((await query("select version() as v"))[0].v);
  assert.equal(Math.floor(Number((await query("show server_version_num"))[0].server_version_num) / 10000), 17);
  await db.exec(await read("fixtures/minimal-schema.sql"));
  await db.exec(await read("fixtures/process-links.sql"));
  await db.exec("alter table public.process_canvas_blueprints add column updated_by_user_id uuid references auth.users; alter table public.process_canvas_blueprints alter column version_no type bigint");
  await db.exec(await read("fixtures/process-link-functions.sql"));
  await db.exec(await read("fixtures/pcb-save-function.sql"));
  await db.exec(await read("../migrations/20261113093318_read_only_admin_dashboard.sql"));
  await db.exec(await read("fixtures/accounts-and-blueprints.sql"));
  await query("insert into private.app_admins(user_id) values ($1)", [admin]);
  for (const table of ["blueprints", "process_canvas_blueprints"]) {
    await query(`insert into public.${table}(id,owner_user_id,name,blueprint_json) values ($1,$2,'Owned by admin',$3)`, [owned, admin, json]);
    await query(`update public.${table} set blueprint_json=$1`, [json]);
    await db.exec(`create trigger bump_version before update on public.${table} for each row execute function public.bump_version_and_updated_at()`);
  }
  await query("insert into blueprint_members values ($1,$3,'owner'),($2,$3,'editor')", [owned, edited, admin]);
  await query("insert into process_canvas_blueprint_members values ($1,$3,'owner'),($2,$3,'editor')", [owned, edited, admin]);
  await query("insert into cbmx_process_links(cbmx_blueprint_id,cbmx_process_id,process_canvas_blueprint_id) values ($1,'P1',$2)", [unshared, unshared]);
  const existing = async () => query(`select 'policy' kind, schemaname||'.'||tablename||'.'||policyname name, to_jsonb(p)::text definition from pg_policies p
    union all select 'function',oid::regprocedure::text,pg_get_functiondef(oid)||coalesce(proacl::text,'') from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace) and proname<>'admin_load_artifact'
    union all select 'table',n.nspname||'.'||c.relname,jsonb_build_object('acl',c.relacl,'rls',c.relrowsecurity)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' order by 1,2`);
  const schemaBefore = await existing(); const dataBefore = await snapshot();
  const migration = await read("../migrations/20261114151932_admin_artifact_viewing.sql");
  await db.exec(migration);
  assert.deepEqual(await existing(), schemaBefore); assert.deepEqual(await snapshot(), dataBefore);
  pass("migration changes no existing policy, table grant, function, content, version, link, or membership");
  const settings = (await query("select proconfig,provolatile,prosecdef from pg_proc where oid='public.admin_load_artifact(text,uuid)'::regprocedure"))[0];
  assert.deepEqual(settings.proconfig, ['search_path=""']); assert.equal(settings.provolatile, "s"); assert.equal(settings.prosecdef, true);
  assert.equal((await query("select has_function_privilege('anon','public.admin_load_artifact(text,uuid)','execute') ok"))[0].ok, false);
  pass("new RPC is stable, has a pinned search path, and denies anonymous execution");

  await caller(admin, "anon"); await assert.rejects(load(), /permission denied/);
  await caller(""); await assert.rejects(load(), error => error.code === "42501");
  await caller(owner); await assert.rejects(load(), error => error.code === "42501");
  await assert.rejects(load("BAD", null), error => error.code === "42501");
  await db.exec("reset role"); await query("update auth.users set raw_user_meta_data=$1 where id=$2", [{ admin: true, role: "admin" }, owner]);
  await caller(owner); await assert.rejects(load(), error => error.code === "42501");
  pass("ordinary owner, metadata spoofing, missing identity, and anonymous callers cannot use admin reads");

  await caller();
  for (const type of ["CBMX", "PC"]) {
    for (const [id, role] of [[owned, "owner"], [edited, "editor"], [viewed, "viewer"], [unshared, null]]) {
      const artifact = await load(type, id);
      assert.equal(artifact.blueprint_type, type); assert.equal(artifact.role, role); assert.equal(artifact.row.id, id);
      assert.deepEqual(artifact.row.blueprint_json, json); assert.equal(artifact.row.version_no, 1);
    }
    pass(`${type}: complete content and actual owner/editor/viewer/no-membership role returned without role promotion`);
  }
  const cbmx = await load(); assert.equal(cbmx.process_links[0].pcb_access_role, "viewer");
  assert.equal(cbmx.process_links[0].has_pcb_access, true); assert.equal(cbmx.process_links[0].process_canvas_blueprint_id, unshared);
  const pcb = await load("PC"); assert.equal(pcb.link_context.cbmx_blueprint_id, unshared); assert.equal(pcb.link_context.cbmx_process_name, "Delivery");
  pass("linked artifacts expose admin-authorized view metadata without synthetic PCB edit rights");
  await assert.rejects(load("other"), error => error.code === "22023");
  await assert.rejects(load("CBMX", "99999999-9999-9999-9999-999999999999"), error => error.code === "P0002");
  for (const table of ["blueprints", "process_canvas_blueprints"]) {
    assert.equal((await query(`select count(*)::int n from public.${table} where id=$1`, [unshared]))[0].n, 0);
    assert.equal((await query(`update public.${table} set blueprint_json='{}' where id=$1 returning id`, [unshared])).length, 0);
    assert.equal((await query(`update public.${table} set owner_user_id=$1 where id=$2 returning id`, [admin, unshared])).length, 0);
    assert.equal((await query(`delete from public.${table} where id=$1 returning id`, [unshared])).length, 0);
  }
  await assert.rejects(query("insert into blueprint_members values ($1,$2,'owner')", [unshared, admin]), /row-level security/);
  await assert.rejects(query("insert into process_canvas_blueprint_members values ($1,$2,'owner')", [unshared, admin]), /row-level security/);
  await assert.rejects(query("select * from unlink_cbmx_process_link($1,'P1')", [unshared]), /edit access/);
  await assert.rejects(query("select * from upsert_cbmx_process_link($1,'P1',$2)", [unshared, owned]), /edit access/);
  pass("administrative reads confer no direct write, ownership, membership, unlink, or relink permission");
  for (const [type, rpc] of [["CBMX", "save_blueprint_with_version"], ["PC", "save_process_canvas_blueprint_with_version"]]) {
    for (const id of [unshared, viewed]) {
      const result = (await query(`select * from public.${rpc}($1,1,'Forbidden',$2)`, [id, json]))[0];
      assert.equal(result.ok, false); assert.equal(result.reason, "forbidden");
    }
    pass(`${type}: actual versioned save RPC still denies both non-member admin and viewer admin`);
  }
  await db.exec("reset role"); assert.deepEqual(await snapshot(), dataBefore);
  pass("all admin reads and rejected writes leave artifacts, versions, memberships, and associations unchanged");
  await caller();
  for (const rpc of ["save_blueprint_with_version", "save_process_canvas_blueprint_with_version"]) {
    for (const id of [owned, edited]) {
      const saved = (await query(`select * from public.${rpc}($1,1,'Allowed',$2)`, [id, json]))[0];
      assert.equal(saved.ok, true); assert.equal(saved.version_no, 2);
      assert.equal((await query(`select * from public.${rpc}($1,1,'Stale',$2)`, [id, json]))[0].reason, "stale");
    }
  }
  pass("owner/editor admin retain ordinary saves and stale-version rejection for both artifact types");

  await db.exec("reset role"); await query("delete from private.app_admins where user_id=$1", [admin]);
  await caller(); await assert.rejects(load(), error => error.code === "42501");
  await assert.rejects(load("PC"), error => error.code === "42501");
  pass("live admin revocation denies the next artifact read without JWT refresh");
  await db.exec("reset role"); await query("insert into private.app_admins(user_id) values ($1)", [admin]);
  for (const change of ["banned_until='infinity'", "is_anonymous=true", "deleted_at=now()"]) {
    await query(`update auth.users set ${change} where id=$1`, [admin]); await caller();
    await assert.rejects(load(), error => error.code === "42501"); await assert.rejects(load("PC"), error => error.code === "42501");
    await db.exec("reset role"); await query("update auth.users set banned_until=null,is_anonymous=false,deleted_at=null where id=$1", [admin]);
  }
  pass("banned, anonymous, and deleted administrators cannot read either artifact type");
  console.log(`PASS: ${checks} administrative artifact database scenarios; PostgreSQL 17 fixtures only.`);
} finally { await db.close(); }
