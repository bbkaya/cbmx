# Administrative artifact viewing

Implemented for review. Migration
`20261114151932_admin_artifact_viewing.sql` is **not deployed**. Live opening from
the Admin inventory needs that migration approved and installed first; regular
dashboard/editor routes continue to use their existing access checks. No real
artifact data, memberships, administrator assignments, or policies were changed.
Publishing the application source does not apply this database migration.

## Routes and UI

Inventory names are React Router links to:

- `/app/admin/b/:blueprintId` for CBMX.
- `/app/admin/pcb/:pcbId` for Process Canvas.

Both routes use the existing `RequireAdmin`, `AdminAccessProvider`, authenticated
client, and editor/viewer components. Only names are links; inventory filters,
search, sorting, pagination, and user reporting remain in place. Browser link
behavior, modified/middle clicks, direct URLs, and fresh loads are supported.

The server returns the caller's **actual artifact role**. Owner/editor gets the
normal editable component and versioned autosave. Viewer/no membership gets
`Admin View — Read Only`, no editing/import/association management, no autosave,
and the existing exports. Administrative read access never synthesizes a primary
owner/editor role and never inserts a membership.

`← Back to Admin Dashboard` returns to `/app/admin`. Normal in-app name clicks
carry only the blueprint inventory's search/type/sort/page/page-size controls in
React Router navigation state; Back restores them. These values are sanitized
and are not authorization. A new tab without that state returns to default
inventory controls; access is still determined from the authenticated session
and fresh server response. No artifact JSON or permissions are stored in navigation
state, local storage, or session storage.

Admin view sessions are keyed by user/type/ID and pending reads are aborted and
ignored on cleanup. Same-account profile refreshes retain in-progress editor
state. Background admin revalidation and authorization-error invalidation use the
existing provider. Revocation prevents the next admin read; previously downloaded
content cannot be retroactively unread.

## Database boundary

The single new endpoint, `public.admin_load_artifact(text,uuid)`, is `STABLE`,
`SECURITY DEFINER`, owned by `postgres`, and has an empty pinned search path.
Execution is revoked from PUBLIC, anon, and service_role, and granted only to
authenticated callers. Inside the endpoint, the existing
`private.cbmx_admin_is_authorized()` checks the live private registry and Auth
account **before any artifact lookup**. Ordinary users, user-metadata flags,
anonymous/deleted/banned administrators, and revoked registry entries are denied.

The RPC returns an explicitly projected row containing complete blueprint JSON,
normal identity/name/version/timestamps, the actual role derived from ownership
and the caller's membership, and read-only association context. It does not use a
URL flag or frontend role as proof of access. It performs no DML and cannot create,
rename, save, share, delete, change owners/members, or link/unlink anything.
Existing table grants, RLS policies, save/sharing/link RPCs, and helper definitions
remain unchanged. Ordinary base-table SELECT protection is also unchanged: an
admin with no membership cannot use a normal route as a global-read fallback.

For CBMX links, an admin may see the linked PCB name and navigate through the
protected admin route. Its link summary reports at most effective viewer
capability when the caller has no real PCB membership. Real PCB owner/editor
status is retained when present. This summary is not a membership assignment;
the primary artifact role on the next route is fetched independently. Current
PCB edit requirements still control unlinking, relinking, and process deletion.
PCBs likewise return source-CBMX context with navigation through protected admin
routes. All mutation requests still reach their existing independent database
authorization checks, including optimistic version checks.

Read-only production schema inspection confirmed the existing authoritative
helper and relevant columns/policies. No production content or accounts were
used as test fixtures. The separately inspected PCB save function is preserved
in `supabase/tests/fixtures/pcb-save-function.sql` for local authorization tests;
it is not a migration or production schema baseline.

## Changed files

- `src/admin/BlueprintInventory.tsx`: name links using the shared style.
- `src/admin/AdminArtifactPage.tsx`: protected loading, actual-role sessions,
  back navigation, and authorization failure handling.
- `src/admin/adminNavigation.ts`: sanitized inventory return state only.
- `src/admin/AdminData.ts`: validated admin artifact RPC contract.
- `src/App.tsx`: two protected routes.
- `src/pages/EditorPage.tsx`, `src/pages/PCBEditorPage.tsx`: optional admin read
  session, readonly indication, and safe linked-artifact navigation. Ordinary
  loading/mutation behavior is preserved.
- New SQL migration, database test runner/PCB save fixture, and expanded admin
  frontend tests. Previously deployed migrations remain byte-for-byte unchanged.

## Validation

```sh
npm run build
npm test
node supabase/tests/run-admin-artifact-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js
node supabase/tests/run-admin-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js --require-pg-major=17
node supabase/tests/run-process-link-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js
node supabase/tests/run-process-deletion-tests.mjs --pglite-module=/private/tmp/cbmx-admin-tools/pglite-pg17/node_modules/@electric-sql/pglite/dist/index.js
```

Local verification passed: TypeScript/build, **93 frontend tests**, **13 new
administrative artifact database scenarios**, and the existing **106 reporting
checks**, **18 linking scenarios**, and **15 safe-deletion scenarios**. New modules
and tests pass targeted lint; the changed viewers retain their existing lint baseline.

Coverage includes both artifact types in owner/editor/viewer/no-membership modes,
direct opening/fresh mounts, ordinary-user/normal-route denial, state/metadata
spoofing, linked navigation, no readonly autosave/import, JSON export, ordinary
owner/editor saves, stale versions, inventory return state, late-response/account
cleanup, and unchanged content/roles/versions after reads. Database fixtures also
verify denial of direct writes, owner changes, membership inserts, association
changes, and actual versioned saves by non-member/viewer admins. Registry
revocation and banned/anonymous/deleted admin checks use the actual registry helper.

Tests use mocked frontend boundaries and disposable PostgreSQL 17 PGlite; no real
accounts log in and no hosted data is written. Positive authenticated HTTP/browser
validation and database advisors remain deployment checks after explicit approval.
The existing full-project lint errors remain outside this scope; new modules and
tests pass targeted lint, and both changed viewers retain their existing lint
diagnostics.
