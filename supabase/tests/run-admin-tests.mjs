// No connection string, environment-file loading, disk database, or remote mode.
// Always creates and destroys an in-memory PostgreSQL database.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const moduleFlag = process.argv.find((arg) => arg.startsWith("--pglite-module="));
let PGlite;
try {
  ({ PGlite } = await import(moduleFlag
    ? pathToFileURL(moduleFlag.slice("--pglite-module=".length)).href
    : "@electric-sql/pglite"));
} catch (error) {
  throw new Error("Install a pinned PGlite engine outside the application, then pass --pglite-module=/absolute/path/to/dist/index.js. See supabase/README.md for the PostgreSQL 17 engine.", { cause: error });
}

const db = new PGlite();
const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const allMigrationNames = (await readdir(new URL("../migrations/", import.meta.url)))
  .filter((name) => name.endsWith(".sql")).sort();
const migrationNames = allMigrationNames.filter((name) => name.endsWith("_read_only_admin_dashboard.sql"));
assert.equal(migrationNames.length, 1, "Expected exactly one admin migration");
assert.equal(migrationNames[0], "20261113093318_read_only_admin_dashboard.sql", "Use the actual deployed migration version");
const migration = await read("../migrations/" + migrationNames[0]);
assert.equal(createHash("sha256").update(migration).digest("hex"), "25b871b4bcee434eb128dd02ef3c045bae7d6291234864f6b5e1049416734ce8", "Deployed administrator SQL must remain unchanged");

async function existingObjects() {
  return (await db.query(`
    select 'policy' as kind, schemaname || '.' || tablename || '.' || policyname as name,
           to_jsonb(p)::text as definition from pg_policies p where schemaname = 'public'
    union all
    select 'relation', n.nspname || '.' || c.relname,
           jsonb_build_object('rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
                              'acl', c.relacl, 'owner', c.relowner)::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    union all
    select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           jsonb_build_object('ddl', pg_get_functiondef(p.oid), 'acl', p.proacl, 'owner', p.proowner)::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname = 'save_blueprint_with_version')
       or (n.nspname = 'private' and p.proname = 'existing_helper')
    order by kind, name
  `)).rows;
}

try {
  console.log((await db.query("select version() as version")).rows[0].version);
  const majorFlag = process.argv.find((arg) => arg.startsWith("--require-pg-major="));
  if (majorFlag) {
    const expectedMajor = Number(majorFlag.slice("--require-pg-major=".length));
    const actualVersion = Number((await db.query("show server_version_num")).rows[0].server_version_num);
    assert.equal(Math.floor(actualVersion / 10000), expectedMajor, "PostgreSQL major version must match requested validation target");
  }
  // SHA-256 values taken from the user-supplied recovered history archive.
  // Verify exact bytes without requiring access to Downloads or a hosted project.
  const recoveredHistory = {
    "20261111223326_remove_insecure_blueprint_member_self_insert.sql": "7570de5834e2543f0ec073c884b13c23d56f7a4594f3dfcc2e989b08ba7f8a9a",
    "20261111224202_restrict_privileged_function_execution_to_authenticated.sql": "982b0f6c21e842bd695980d648bf8d9d284f126f8fc8d3a615cba319e28d41c4",
    "20261111224503_pin_search_path_for_public_helper_and_trigger_functions.sql": "79509c8c7520d60d2f1ebac39e1a492d3b3ae9b7a15604acfd342b49f506dc3c",
  };
  assert.deepEqual(allMigrationNames, [...Object.keys(recoveredHistory), migrationNames[0]], "Admin migration must follow all three recovered migrations");
  for (const [name, digest] of Object.entries(recoveredHistory)) {
    const bytes = await readFile(new URL("../migrations/" + name, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, "Recovered migration must remain byte-for-byte unchanged: " + name);
  }
  console.log("ok - exact recovered history hashes and chronological ordering verified");
  await db.exec(await read("fixtures/minimal-schema.sql"));
  const before = await existingObjects();
  await db.exec("select set_config('pgrst.db_schemas', 'public, private', false)");
  await assert.rejects(db.exec(migration), /Remove private from the Data API/);
  await db.exec("rollback; select set_config('pgrst.db_schemas', 'public', false)");
  assert.equal((await db.query("select to_regclass('private.app_admins') is null as absent")).rows[0].absent, true);
  console.log("ok - exposed-private-schema preflight fails atomically");
  await db.exec(migration);
  assert.deepEqual(await existingObjects(), before,
    "Existing table grants, RLS policies, helper/save functions must remain identical");
  console.log("ok - existing object definitions, policies, owners, and grants unchanged");
  await assert.rejects(db.exec(migration), /already exists/);
  await db.exec("rollback");
  assert.deepEqual(await existingObjects(), before);
  console.log("ok - duplicate application fails instead of replacing existing objects");
  await db.exec(await read("fixtures/accounts-and-blueprints.sql"));
  const results = await db.exec(await read("admin-reporting.sql"));
  const checks = results.flatMap((result) => result.rows ?? [])
    .flatMap((row) => Object.values(row)).filter((value) => typeof value === "string" && value.startsWith("ok - "));
  for (const check of checks) console.log(check);
  assert.ok(checks.length >= 40, "Expected the complete SQL assertion suite");
  console.log(`PASS: ${checks.length + 4} checks. In-memory fixtures only; no hosted connection.`);
} finally {
  await db.close();
}
