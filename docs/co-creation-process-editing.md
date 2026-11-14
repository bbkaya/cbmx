# Co-creation process editing and deletion

The user verified the deletion flow and approved publishing the implementation
to GitHub on 2026-11-14. Following the user's earlier explicit approval,
the database migration was applied to **cbmx1**
(`chaibudxqtvxptxlglse`) on 2026-11-14 as version **20261114091941**.
Before/after hashes confirmed all 114 CBMX blueprints, 46 PCBs, and 28 link rows
were unchanged, including the one historical orphan. The separate ProcessCanvas
Supabase project was not changed.

## Editing and identity

`EditableProcess.tsx` replaces the editor only in the co-creation process row.
Existing processes have Cancel, Rename, and Delete. Empty slots have Cancel and
Add. Validation uses the existing process/participant syntax and checks the parsed
name, so whitespace and actor-only input cannot remove or create a process.
Cancel discards the input; renaming finds the process by ID and preserves that ID.
The shared `EditableText.tsx` is unchanged.

Runtime changes are in `CBMXTable.tsx` (process controls), `cbmxMutators.ts`
(validation and rename by ID), `cbmxDomain.ts` (new/imported IDs), `EditorPage.tsx`
(confirmation, autosave coordination, and import checks), and `CBMXData.ts`
(versioned deletion RPC dispatch), plus the two new UI components and SQL migration.

New processes use `P-<random UUID>` identifiers instead of the largest numeric ID
plus one. JSON imports retain IDs already in the current blueprint (and their
links), and assign fresh IDs to newly introduced processes. Old numeric IDs are
still supported for existing processes. Imports that remove linked processes are
rejected with instructions to delete those processes explicitly first.

## Transaction and concurrency

Deployed migration:
`supabase/migrations/20261114091941_safe_cbmx_process_deletion.sql`.

Running the frontend locally can still connect to the hosted Supabase database.
Initial local testing encountered a missing-RPC error because the database
migration was still pending. It is now installed and recognized by the API.
The UI retains its clear unavailable message for environments that have not
received the database update; it never falls back to separate unlink/save requests.
The local migration filename was aligned with the server-assigned version without
changing the deployed SQL bytes (including its original pending-migration comment).

1. Clicking Delete pauses autosave and checks the database using the existing
   `list_cbmx_process_links_with_access` RPC. Cached frontend state is insufficient.
2. An unlinked process needs no further confirmation. A linked process requires
   PCB edit access and the requested confirmation dialog. Hidden PCB names are
   never rendered. Cancelling the dialog makes no deletion request.
3. The new `delete_cbmx_process_with_version` RPC receives the intact draft, stable
   target process ID, loaded version, and the PCB ID that was confirmed (null for
   no link). The frontend does not stage a deletion in its autosaved draft.
4. The RPC authenticates and checks the same blueprint membership rule as the
   existing save RPC, locks the blueprint row, checks its version, locks the link,
   and verifies that the association still matches the confirmation. A new,
   replaced, or removed link requires another review before deletion can proceed.
5. If linked, it calls the existing `unlink_cbmx_process_link` while the process
   still exists in persisted JSON. This preserves its CBMX and PCB edit checks.
   It removes the target ID from the supplied draft, preserving array order, and
   calls the existing `save_blueprint_with_version`. Existing version triggers
   remain in control. A failure result **or** exception rolls back the unlink.
6. Only a successful response replaces the frontend draft, version, and link state.
   A stale-version response preserves the draft and pauses autosave until the
   user explicitly chooses to reload and discard local edits.

No function deletes or updates a `process_canvas_blueprints` record. The PCB
remains an independent artifact in the repository.

Two table triggers protect other writers without replacing any existing RPC or
policy:

- A blueprint update cannot remove a linked ID. It also cannot introduce an ID
  that already has a historical orphan link. These checks see links even when
  the caller cannot read the PCB. Errors disclose no PCB name or identifier.
- Link insert/update locks the blueprint and verifies the process still exists.
  This closes the legacy upsert RPC's check/write race against process deletion.
  Contending operations can fail and require a retry; they cannot commit an orphan.

The new RPC and trigger helpers use a pinned empty search path. The RPC is granted
only to authenticated callers; trigger helpers cannot be directly executed by
browser roles. Their narrowly scoped definer privileges let them inspect hidden
links; authorization for unlinking remains in the existing unlink RPC. Ordinary
save, sharing, and versioning function definitions and existing RLS are unchanged.

## Local verification

```sh
npm run build
npm test
node supabase/tests/run-process-deletion-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js
node supabase/tests/run-admin-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js --require-pg-major=17
```

Verified locally: build/TypeScript passed, all **46 frontend tests** passed
(18 process scenarios), all **15 process database scenarios** passed, and the
existing **106 administrator database checks** passed on PostgreSQL 17.4 PGlite.

The database runner accepts no connection URL and loads no environment files. It
uses disposable PostgreSQL 17 PGlite fixtures with synthetic accounts and content.
`fixtures/process-link-functions.sql` preserves the inspected bodies of the
existing save/unlink/list/upsert/version functions for those tests; it is **not**
a schema baseline or migration. Other fixture tables/policies are incomplete.

Coverage includes rename/reload with and without links; participant editing;
blank input and Cancel; deletion with cleared input; confirmation cancellation;
confirmed deletion and subsequent Add/reload; hidden and viewer PCB access;
database link checks; pending autosave; stale versions; imports; direct table
updates; historical orphan reattachment rejection; and rollback after both a
save exception and a normal unsuccessful save result following unlink.
Valid JSON imports are placed into the editor only after a successful save, so a
failed replacement cannot leave a removed process staged for autosave.

The full lint command has existing failures. The changed legacy files have the
same lint diagnostics as HEAD; the new components, test files, data module,
domain, and mutators pass their targeted lint checks. Build retains Vite's existing
large-chunk warning.

Deployment verification confirmed the RPC signature, pinned search path,
authenticated-only execution, non-callable trigger helpers, and both enabled
guards. Existing save/unlink definitions and grants were unchanged. Read-only
transactions verified missing-identity rejection and denial without membership.
An anonymous HTTP request received the expected `401 / 42501` permission denial,
confirming PostgREST recognizes the new function instead of returning `PGRST202`.
No deletion of a real process was performed as part of deployment verification.

Security advisors were checked before and after deployment. The only added
finding is the intended authenticated SECURITY DEFINER endpoint; its explicit
authorization and execute grants were verified. See the
[advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
The existing [private admin-registry policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
were unchanged; this deployment does not change those settings.

The local suite simulates stale versions, association changes, and failures.
The user confirmed the deletion flow works after the database deployment;
native overlapping-session testing remains an additional check. Confirm the `private` schema remains
unexposed in project API settings; the SQL session's exposed-schema setting is
unset, so it cannot establish the dashboard configuration. Do not replay any
deployed migration. Historical cleanup still requires separate approval and is
not part of publishing the implementation.

## Historical orphan audit and proposed cleanup

Read-only audit found **one** association whose stable process ID is absent from
the CBMX JSON:

| CBMX blueprint | Missing process | Linked PCB |
| --- | --- | --- |
| `a689e919-3fae-40ae-8ca0-5627d16338bf` | `P3` | `9ed14cff-8bdf-42d3-9f19-2871a057f791` |

Audit query (read only; rerun before any approved cleanup):

```sql
select l.id, l.cbmx_blueprint_id, l.cbmx_process_id,
       l.process_canvas_blueprint_id, l.created_at, l.updated_at
from public.cbmx_process_links l
join public.blueprints b on b.id = l.cbmx_blueprint_id
where not exists (
  select 1
  from jsonb_array_elements(coalesce(b.blueprint_json -> 'coCreationProcesses', '[]'::jsonb)) p
  where p ->> 'id' = l.cbmx_process_id
)
order by l.cbmx_blueprint_id, l.cbmx_process_id;
```

No historical rows are deleted by the migration or tests. Proposed maintenance
procedure, **only after explicit approval**:

1. Export the exact link rows and relevant blueprint version/JSON to a secure
   backup. Review ownership, timestamps, and intent; an ID may have already been
   reused, in which case absence alone will not identify the mistaken association.
2. For each approved link, begin a transaction as the trusted database maintainer.
   Lock the CBMX blueprint row first, then the exact link row with `FOR UPDATE`.
3. Recheck the approved blueprint ID, process ID, PCB ID, and link ID, and verify
   that the process is still absent. Abort on any mismatch. Delete **only that
   link row**, with the same predicates and absence check, using `RETURNING`.
4. Verify exactly one approved row was removed, the blueprint JSON/version is
   unchanged, and the PCB record/content is unchanged; then commit. Otherwise
   roll back. Retain the backup/audit record and reload the blueprint in the UI.

Do not temporarily recreate the missing process to call the ordinary unlink RPC:
that risks reviving the very association being repaired. Any trusted direct
maintenance is a separate approved operation, not a browser permission bypass.
