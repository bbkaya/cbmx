# Supabase database changes

The link/relink dropdown migration is documented in
[Process Canvas link selection](../docs/process-canvas-link-selection.md).
`20261114143904_process_canvas_link_selection.sql` was deployed to cbmx1 with
explicit approval on 2026-11-14. Do not replay it. Its local filename matches the
deployed version without changing the SQL bytes. It reuses the existing one-to-one
constraints; deployment preserved all application records and historical associations.

The co-creation process deletion migration and its isolated tests
are documented in [co-creation process editing](../docs/co-creation-process-editing.md).
It was deployed to cbmx1 with explicit user approval as
`20261114091941_safe_cbmx_process_deletion` on 2026-11-14. Its SQL bytes were
preserved when aligning the local filename with the deployed version. Do not
replay it. Blueprint data, PCBs, and links were unchanged by deployment;
historical-orphan cleanup still requires separate approval.

## Read-only Administrator Dashboard: database layer

The maintainer reports the database layer has been deployed and verified in
cbmx1 as `20261113093318_read_only_admin_dashboard`. The repository file was renamed
to that deployed version without changing its SQL bytes. The four migrations
described in this section are historical records for cbmx1 and must not be replayed there.
The React integration is described in [the frontend guide](../docs/admin-dashboard.md).
No hosted database was contacted or changed during frontend implementation.

## Existing database and scope

The application uses one Supabase client for both blueprint types. The intended
hosted project is **cbmx1**; a separate project named ProcessCanvas is out of scope.
Project display names are not CLI project references: verify the actual project
reference before any future hosted operation.

The maintainer supplied these database facts: 67 Auth users, 64 profiles, 112 CBMX
blueprints, 42 Process Canvas blueprints, blueprint RLS enabled, and the existing
security migrations listed below. These facts were **not independently verified
against the hosted project** during this implementation. Counts are a historical
observation, not test expectations or deployment checks.

The checkout previously had no SQL migrations, Supabase configuration, or schema
baseline. The new migration is strictly incremental: it depends on existing Auth,
profiles, blueprint tables, and permissions. It does not recreate them. No
`config.toml`, project link, seed configuration, deployment workflow, or generated
production schema has been added.

## Design and security boundary

`private.app_admins` contains:

| Column | Definition |
| --- | --- |
| `user_id` | UUID primary key, references `auth.users(id)`, cascades on hard deletion |
| `granted_at` | Non-null `timestamptz`, defaults to database time |
| `granted_by` | Nullable Auth UUID, set null if the granting account is deleted |

The registry starts empty. Its owner is `postgres`; RLS is enabled with no client
policies. All table privileges are explicitly revoked from PUBLIC, `anon`,
`authenticated`, and `service_role`, even if a project has permissive defaults.
Registry reads/writes belong exclusively to trusted database maintenance. Existing
objects or schema-wide privileges are not revoked or changed.

The **private schema must not be exposed through the Data API**. The migration
rejects a visible `pgrst.db_schemas` setting containing `private`, but API exposure
can also be configured outside SQL. Independent verification in the project's
Data API settings is a mandatory release prerequisite. This migration does not
alter global PostgREST settings. Registry ACLs and RLS still deny browser access
even if an operator mistakenly exposes the schema.

### Why no additional reporting role or private reporting wrappers?

Four small public `SECURITY DEFINER` functions owned by the existing trusted
`postgres` role are sufficient for this metadata-only scope. They deliberately
read across RLS after checking the caller, without changing any blueprint SELECT
policy or giving a browser elevated table privileges. They are `STABLE`, contain
only reporting queries, and never call save/sharing functions. Their output is
explicitly projected; blueprint JSON, password hashes, tokens, and raw metadata
objects are never returned.

This is an intentional, narrowly bounded use of a privileged function owner,
not a claim that SECURITY DEFINER enforces RLS. The owner can bypass RLS; the
database authorization checks and function definitions are the security boundary.
The migration fails unless run as `postgres` with superuser or BYPASSRLS capability.
Review any future function changes with that privilege in mind.

Every public function has `search_path = ''`; relations/functions are schema
qualified. EXECUTE is revoked from PUBLIC, `anon`, `authenticated`, and
`service_role`, then granted only to `authenticated`. No new Postgres role,
browser administrator JWT claim, RLS policy, or base-table grant is introduced.
The internal `private.cbmx_admin_is_authorized()` helper is SECURITY INVOKER and
cannot be called by browser roles; it runs under the public functions' owner.

The helper checks `auth.uid()` against the live registry and Auth account on every
call. No user-supplied UUID, user metadata, profile flag, or email allowlist can
authorize a request. Removing the registry entry takes effect on the next request
without a JWT refresh. Existing in-flight requests and previously downloaded data
cannot be retroactively revoked. Ordinary Supabase access-token expiry/session
semantics still apply after logout; strict per-session revocation is not added.

Application administrators gain inventory access only. Their existing ownership,
editor, or viewer memberships continue to determine normal content access and
editing rights. The migration does not touch existing policies, membership tables,
save functions, triggers, version columns, or concurrency protection.

## RPC contracts

Only authenticated sessions can execute these functions. `admin_get_access()`
returns false for non-administrators or missing identities. The other functions
raise SQLSTATE `42501` before querying inventory when authorization fails.

### `public.admin_get_access() → boolean`

Returns the current caller's administrator capability. It reveals no other
administrator records and performs no assignment.

### `public.admin_list_blueprints(...) → jsonb`

| Parameter | Default | Rules |
| --- | --- | --- |
| `p_search text` | `''` | Case-insensitive literal substring; null/blank means no search; maximum 200 characters |
| `p_blueprint_type text` | null | null = both; CBMX or PC (case-insensitive) |
| `p_sort_by text` | `updated_at` | `blueprint_type`, `name`, `owner_name`, `owner_email`, `created_at`, `updated_at` |
| `p_sort_direction text` | `desc` | asc/desc, case-insensitive |
| `p_page integer` | 1 | Positive, one-based |
| `p_page_size integer` | 25 | 1–100; larger values are rejected, not silently truncated |

Search covers blueprint name, owner display name, and current Auth email. SQL-like
text and `%`, `_`, or backslashes are ordinary characters. Only whitelisted sort
identifiers/directions are interpolated into SQL; other values are bound parameters.
Text ordering uses the database collation; it is not forced to lowercase. Null
sort values come last. Type and UUID are stable tie-breakers.

Response:

```json
{
  "items": [{
    "blueprint_type": "CBMX",
    "blueprint_id": "uuid",
    "name": "Example",
    "owner_user_id": "uuid",
    "owner_name": "Example owner",
    "owner_email": "owner@example.invalid",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }],
  "total_count": 1,
  "page": 1,
  "page_size": 25
}
```

UNION ALL preserves both types, including coincident UUIDs. Left joins preserve
inventory rows if an owner profile is missing. Owner names use profile display
name, then Auth display-name/full-name/name metadata, email prefix, or "Unknown
user". User metadata is display-only. Email comes from Auth; a stale profile email
does not override it. Missing Auth records produce a null email. Dates come from
table columns, not blueprint JSON. `blueprint_json` is not read or returned.

### `public.admin_list_users(p_search text = '', p_page integer = 1, p_page_size integer = 25) → jsonb`

Same pagination envelope, search length, and page-size bounds. Search covers name
and Auth email. Order is registration date descending, then UUID ascending.
Each item contains `user_id`, `email`, `display_name`, `registration_date`,
`is_confirmed`, `is_banned`, `owned_cbmx_count`, and `owned_pc_count`.

`auth.users` is authoritative and `profiles` is left-joined. Missing profiles are
not created. Registration date is `auth.users.created_at`. Confirmation means
either `email_confirmed_at` or `phone_confirmed_at` is present; unconfirmed users
are included. Names use the same display-only fallbacks as inventory owners.

**Registered user for reporting** means `deleted_at IS NULL` and
`is_anonymous IS NOT TRUE`. Currently banned accounts and unconfirmed registrations
are included. Anonymous and soft-deleted accounts are excluded. Email may be null
for a phone-based account. The list and registered-user statistics use this same
definition; the result may still be smaller than a raw Auth row count of 67.

`is_banned` is always a boolean: true when `banned_until` is non-null and later
than the current statement time, false when absent or expired. An indefinite
PostgreSQL `infinity` ban is true. **Reporting visibility does not imply access:**
the separate administrator-authorization helper still rejects currently banned,
anonymous, or soft-deleted administrators on every privileged request. Including
banned users in reports does not change their permissions or ban status.

Counts are separate per-table aggregates on `owner_user_id`, zero-filled after
joining; memberships are not ownership and multiple counts do not multiply.

### `public.admin_get_statistics() → jsonb`

Returns `total_registered_users`, `total_cbmx_blueprints`, and
`total_pc_blueprints`. Blueprint counts cover all rows in both tables, independent
of the owner account's current status. They are global, not search-filtered totals.
All totals in one statistics call use one statement snapshot. Separate dashboard
requests can differ briefly under concurrent changes. Offset pagination is
deterministic for a fixed dataset but is not a frozen snapshot across requests.

All invalid filters, sort options, searches over 200 characters, or pagination
inputs raise SQLSTATE `22023`. Empty or out-of-range pages retain the matching
`total_count`. No unbounded download endpoint is added. At the reported current
size, literal search and exact totals are appropriate; review query plans and
existing indexes before adding performance migrations for larger datasets.

## Recovered migration history and remaining deployment gates

These exact files were recovered by the maintainer from cbmx1's migration history
and supplied in `cbmx_recovered_migration_history.zip`. They are now present in
`supabase/migrations/`, with their original bytes, filenames, and versions intact:

1. `20261111223326_remove_insecure_blueprint_member_self_insert.sql`
2. `20261111224202_restrict_privileged_function_execution_to_authenticated.sql`
3. `20261111224503_pin_search_path_for_public_helper_and_trigger_functions.sql`

They have **already been executed on the hosted database**. They were not executed
again or fetched remotely during this task. Archive notes were treated as reference
material; the user's request is the authorization for incorporating these files.
The test runner pins each recovered file's SHA-256 digest and verifies exact bytes
and order automatically. The administrator migration is
`20261113093318_read_only_admin_dashboard.sql`, chronologically later than all three.
It was renamed from `20261113084351_read_only_admin_dashboard.sql` to match the
maintainer-supplied deployed version, preserving its SQL byte-for-byte. The runner
also verifies the administrator SQL digest so deployed history cannot be silently
rewritten. No hosted migration-history repair or replay was performed.

These historical files only remove a policy, restrict existing function execution,
and alter existing function search paths. They do **not** create the application's
tables or provide the bodies of its save/sharing/helper/trigger functions. The
archive contains no schema dump. Consequently, this is not a complete initial
schema baseline and a fresh Supabase reset cannot reconstruct the app from these
four files alone. Do not fabricate missing schema or empty history placeholders.

For any future database/environment changes, a separately authorized maintainer must:

1. Verify the real project reference belongs to cbmx1 and use a pinned CLI version.
   Do not use the unrelated ProcessCanvas project. Review local `--help`: CLI v3
   database commands default to local targets. No project link is created here.
2. Compare the hosted migration list with these exact versions through a separately
   approved read operation. Confirm the three historical versions are already
   applied, together with administrator version `20261113093318`; account for any
   migrations added since this history was recovered. Do not reapply these files or use
   migration repair merely to silence a mismatch.
3. Obtain an audited schema-only snapshot, preserving actual grants, policies,
   triggers, and function definitions, through a separately approved read operation.
   Restore it only into a disposable PostgreSQL 17/Supabase environment. If the
   snapshot already includes the three security fixes, do not replay them. Keep
   it separate from pending production migrations; never blindly apply an existing
   schema snapshot back to cbmx1.
4. Validate the admin migration and existing save/sharing/concurrency behavior on
   that isolated actual-schema copy. Review API exposure to ensure `private` is
   unexposed and verify the required Auth columns. The fixture tests cannot stand
   in for this missing actual-schema validation.
5. Inspect any future pending migration plan with the installed CLI's dry-run
   facilities. Reject any plan that recreates existing tables, changes old history,
   or reapplies historical fixes. The current frontend feature requires no database
   migration or administrator assignment. Future database changes require separate
   production approval. No deployment automation is added here.

The migration is atomic, additive, and intentionally fails on object-name
collisions rather than CREATE OR REPLACE-ing unknown existing functions or tables.
It checks expected columns, blueprint RLS, executing role, and function-owner
capabilities before adding anything. It never updates the migration-history table
itself. No indexes on existing tables are added without reviewing existing indexes.

### Trusted assignment and revocation (future maintenance only)

After a separately approved deployment, the trusted database maintainer should
verify an eligible user's Auth UUID and make an explicit maintenance assignment:

```sql
-- Templates only. Replace placeholders only after verifying the intended account.
insert into private.app_admins (user_id, granted_by)
values ('<verified-admin-user-uuid>'::uuid, null);

-- Revoke by UUID; takes effect on the next reporting request.
delete from private.app_admins where user_id = '<verified-admin-user-uuid>'::uuid;
```

No real administrator has been created. An application administrator cannot grant
themselves or others this capability from the browser. Do not expose these
maintenance statements through a frontend endpoint or put privileged keys in Vite.

### Rollback planning

For emergency feature disablement, revoke EXECUTE on the four exact new public
signatures from `authenticated` through a separately approved maintenance change.
Preserve the registry for audit/recovery. If removing the feature permanently,
drop the four exact new public functions, the exact new private helper, and the
registry in dependency order after backing up registry assignments. Never use
DROP SCHEMA private CASCADE: the schema may contain unrelated existing helpers.
Do not change collaboration policies or replay old migrations as a rollback.

## Tests and honest limits

The runner always instantiates an in-memory PGlite PostgreSQL database; it accepts
no database URL, does not read `.env.local`, and cannot target a hosted project.
The `.invalid` users and blueprint contents are synthetic. The SQL assertions run
inside a transaction that is rolled back; the entire in-memory database is then
destroyed. No real accounts or blueprint data are involved.

Install the test-only engine **outside** the application dependencies and run:

```sh
npm install --prefix /private/tmp/cbmx-admin-tools/pglite-pg17 --no-save --package-lock=false @electric-sql/pglite@0.3.0
node supabase/tests/run-admin-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js --require-pg-major=17
```

This pins a PostgreSQL 17 PGlite build and explicitly checks the runtime major
version. It does not change the application's package.json or lockfile. The runner
verifies historical file hashes/order but applies only the admin migration; the
historical scripts require the actual existing schema and should be tested there
separately. Fixture SQL is never part of the migrations directory and
must never be applied to a hosted project. The fixture is a deliberately incomplete
stand-in, not a production baseline or proof of the hosted functions' behavior.

Covered: anon/missing-identity/non-admin/admin access; metadata spoofing; registry
ACLs/RLS, self-assignment and reassignment denial; immediate revocation; registered-user
filtering, inclusion and boolean status of banned accounts, and denial of banned
administrators; missing profiles and unconfirmed registrations; Auth email/registration
dates; correct ownership counts; all inventory sort directions; literal search;
type filtering; page limits, totals, empty pages, and tie-breakers; SQL-injection
inputs; no blueprint-JSON output; unchanged blueprint data/versions/profiles after
reporting; existing table grants/policies/function definitions; preserved fixture
owner/editor/viewer behavior and stale-version rejection; atomic preflight failures
and collision rejection; exact recovered historical migration bytes/order.
Permissive legacy default grants are deliberately simulated.

Still required before production: execution on the **actual recovered Supabase
schema using PostgreSQL 17**; its real save/sharing/concurrency
functions; HTTP/PostgREST JWT/error/grant tests; API schema exposure verification;
and database advisors/lint/query-plan review on the isolated Supabase stack. A
PostgreSQL 17 PGlite fixture run matches the reported hosted major version, but is
not a native Supabase stack or a copy of cbmx1's schema. A PostgreSQL 18.6 PGlite
build (`@electric-sql/pglite@0.5.16`) can also run the suite as an additional
cross-version check without `--require-pg-major=17`.

Latest local validation: **106 checks passed on PostgreSQL 17.4** using
PGlite 0.3.0, and **106 checks passed on PostgreSQL 18.6** using PGlite 0.5.16.
Both runs used disposable synthetic fixtures and applied only the admin
migration. Neither run contacted cbmx1 or executed the recovered migrations there.

References: [Supabase database-function security](https://supabase.com/docs/guides/database/functions),
[Data API security](https://supabase.com/docs/guides/api/securing-your-api),
[CLI reference](https://supabase.com/docs/reference/cli/introduction).
