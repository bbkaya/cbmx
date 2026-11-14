# Process Canvas link selection

The user approved deployment, commit, and GitHub push on 2026-11-14. The reviewed
migration was applied to **cbmx1** as version **20261114143904**. Both endpoints
are installed and recognized by PostgREST. Environments without the migration
show an update-required message and never fall back to the old name prompt or
separate unlink/save calls. The local SQL filename matches the server-assigned
version; deployed bytes, including its original pending-review comment, are
preserved. Do not replay this migration on cbmx1.

Deployment verification confirmed unchanged hashes for all 114 CBMX blueprints,
47 PCBs, and 28 link rows, including the historical orphan. Existing function
bodies/grants, unique constraints, and RLS policies were also unchanged.

## Files and behavior

- `src/components/cbmx/ui/LinkProcessCanvasDialog.tsx` adds one native modal dialog
  for both Link Existing and Relink. It uses a labeled select, an initially empty
  placeholder, disabled confirmation until selection, Cancel/Escape, loading,
  retry, and the requested informative empty state. Relink shows the authorized
  current Canvas separately. Equal names are distinguished by ownership/editor
  context and the full PCB ID; selection always uses the ID.
- `src/pages/EditorPage.tsx` replaces only the existing-Canvas prompt workflow.
  Dialog context is scoped to the current blueprint, process ID, and signed-in
  user. Create New, Open, Unlink, and process editing/deletion remain in place.
  Autosave continues while the dialog is open; the link operation never supplies
  or saves blueprint JSON. Link-status refresh failures preserve cached links
  and tell the user to reload, rather than clearing the known associations.
- `src/pcb/PCBData.ts` adds RPC adapters, alphabetical sorting, and user-facing
  errors for occupied/deleted targets, lost access, a changed current association,
  an unsaved process, or a missing database update.
- `supabase/migrations/20261114143904_process_canvas_link_selection.sql` adds two
  RPCs without modifying existing functions, constraints, table grants, or RLS.
- `tests/processEditing.test.mjs` covers the dialog through EditorPage, alongside
  the existing safe deletion regression scenarios.
- `supabase/tests/run-process-link-tests.mjs` runs isolated PostgreSQL fixtures
  using the inspected actual link/unlink/list/upsert bodies and deployed safe
  deletion migration. It accepts no connection URL and reads no environment files.

## Database enforcement

Read-only inspection of cbmx1 (`chaibudxqtvxptxlglse`) on 2026-11-14 confirmed:

| Constraint | Existing enforcement |
| --- | --- |
| `cbmx_process_links_cbmx_process_uq` | Unique `(cbmx_blueprint_id, cbmx_process_id)` |
| `cbmx_process_links_pcb_uq` | Unique `process_canvas_blueprint_id` across every CBMX |

A second existing constraint, `cbmx_process_links_unique_process`, duplicates
the process key. This change leaves it alone; no new unique constraint is added.
The migration checks for the actual immediate unique keys and the installed safe
process-target trigger before adding its endpoints. Existing RPC bodies were
verified against the fixture snapshots and are not replaced.

`get_cbmx_process_canvas_options(uuid,text)` verifies authentication, CBMX edit
access, the saved process ID, and edit access to any current PCB. It returns only
the current authorized PCB's ID/name plus editable **globally unlinked** PCBs.
Its definer scope lets `NOT EXISTS` examine links hidden by source-CBMX RLS.
It returns no inaccessible source blueprint ID, source name, link row, or process
details. Viewers, occupied PCBs, and historical orphan associations are excluded.

`link_available_cbmx_process_canvas(uuid,text,uuid,uuid)` verifies the same access
and process identity again at confirmation time. It locks the blueprint and then
the current link, matching safe deletion's order, and compares the current PCB
with the ID displayed in the dialog (null for an unlinked process). A changed
association requires reloading instead of overwriting another user's work.
It checks current/replacement PCB edit rights and global target availability,
then delegates to the existing `upsert_cbmx_process_link` in the same transaction.
The old link is never removed first. The immediate global unique constraint
arbitrates concurrent claims, including claims through legacy callers.
A failed replacement rolls back; the old PCB's record and contents are untouched.

Both endpoints have an empty pinned search path, explicit `auth.uid()` and
authorization checks, and execute grants only for `authenticated`. Definer
privileges are necessary for hidden-link inspection; they do not give the caller
access to another CBMX or remove the existing edit requirements. No PCB contents,
membership records, or blueprint versions are modified by these functions.

## Validation and limits

```sh
npm run build
npm test
node supabase/tests/run-process-link-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js
node supabase/tests/run-process-deletion-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js
node supabase/tests/run-admin-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js --require-pg-major=17
```

Local validation passed: TypeScript/build, **66 frontend tests**, **18 linking
database scenarios**, **15 safe-deletion database scenarios**, and the existing
**106 administrator database checks**. Database suites used PostgreSQL 17.4 PGlite.

Coverage includes owned/shared CBMX access; owned/editor targets; viewer exclusion;
hidden-source occupied PCBs; alphabetical/duplicate-name options; cancellation
and late-response handling; loading/empty/error states; rechecking availability;
lost current/target/CBMX edit access; deleted targets/current PCBs; changed current
links; failed replacement rollback; two callers holding stale availability lists;
legacy upsert uniqueness; unchanged artifacts/versions; and safe process deletion
after relinking. Frontend tests also cover double submission, continued autosave,
and preservation of Create New, Open, and Unlink actions.

PGlite has one backend, so queued competing requests simulate the two-caller
case rather than overlapping native sessions. The real immediate unique key is
the database enforcement mechanism; native overlapping-session and authenticated
PostgREST end-to-end tests remain additional validation. No real links were created,
replaced, unlinked, or deleted during implementation or deployment verification. The existing general
lint failures are outside this scope; changed EditorPage diagnostics match HEAD,
and the new/updated isolated modules and test runner pass targeted lint.

Hosted checks confirmed pinned search paths, authenticated-only execute grants,
and missing-identity/missing-edit rejection for both RPCs. The mutation RPC's
authorization probes used null blueprint IDs in rolled-back transactions; no
application records could match. Anonymous HTTP requests returned `401 / 42501`
permission denials for both endpoints, confirming API schema-cache availability.

Security advisors were checked before/after deployment. The two added findings
are the intended [authenticated SECURITY DEFINER endpoints](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable);
their explicit authorization and execute grants were verified. Existing notices
about the [private admin registry](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
were unchanged. This deployment does not alter either setting.

## Historical records

Read-only audit found **zero** duplicate process keys and **zero** duplicate PCB
keys. No rows violate either one-to-one unique key. The previously documented
`P3` orphan is still present and unchanged; see the
[original audit and guarded cleanup proposal](co-creation-process-editing.md#historical-orphan-audit-and-proposed-cleanup).
It occupies its PCB, so that PCB is correctly excluded from the available list.
Any historical cleanup still needs separate approval, a secure backup, row locks,
and an absence/identity recheck. Do not recreate a dummy process or delete a PCB
to free an association.

Read-only duplicate audit (no identifying data is returned unless a violation exists):

```sql
select cbmx_blueprint_id, cbmx_process_id, count(*)
from public.cbmx_process_links
group by cbmx_blueprint_id, cbmx_process_id
having count(*) > 1;

select process_canvas_blueprint_id, count(*)
from public.cbmx_process_links
group by process_canvas_blueprint_id
having count(*) > 1;
```
