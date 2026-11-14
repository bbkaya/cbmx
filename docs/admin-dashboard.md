# Administrator Dashboard frontend

The pending local [administrative artifact viewing enhancement](admin-artifact-viewing.md)
adds inventory name links and a separate, server-authorized content-read endpoint.
Its migration has not been deployed. The original reporting endpoints below
remain metadata-only and do not grant artifact mutation rights.

Route: `/#/app/admin`. The existing HashRouter, authenticated Supabase client, and
shared SiteShell remain in use. The database is reported deployed and verified by
the maintainer; no hosted database access is needed to build or test this feature.

## Access and data lifecycle

`AdminAccessProvider` consumes the existing `useAuth()` context and shares one
`admin_get_access()` result between navigation and `RequireAdmin`. Signed-out and
authentication-loading states make no admin requests. A non-administrator never
mounts the reports. Errors fail closed with a retry action, rather than treating
an unknown status as allowed. Existing login redirection preserves `/app/admin`.

Controllers are scoped to the authenticated user ID and authentication-loading
state. An account change creates an unconfirmed controller synchronously, hiding
the previous account's dashboard before any new response arrives. Sign-out,
revocation, and access errors unmount the reporting components, clearing their
in-memory results. Reporting requests are aborted on cleanup; late responses are
also ignored even if an underlying transport ignores cancellation.

Allowed access is rechecked every 60 seconds while the page is visible, and on
focus/visibility return when the last check is at least 60 seconds old. Ordinary
users are not continuously polled. In-flight checks are deduplicated. A reporting
RPC error with SQLSTATE `42501`, or HTTP 401/403, immediately invalidates shared
access and clears the dashboard. A late access response cannot restore revoked
access. Database authorization is authoritative on every reporting request;
navigation visibility and periodic checks are only frontend behavior.

No administrator email is hardcoded. Editable metadata, local storage, and session
storage are not used for access or report persistence. Existing Supabase session
storage and SiteShell's unrelated landing-page scroll behavior remain unchanged.
Existing owner/editor/viewer permissions, editors, save/versioning/sharing logic,
and RLS are untouched.

## UI and RPC contracts

`src/admin/AdminData.ts` centralizes these four reporting calls:

- `admin_get_access`: strictly boolean capability result.
- `admin_get_statistics`: non-negative numeric totals for three overview cards.
- `admin_list_blueprints`: typed unified metadata inventory, six allowed sort
  columns, type filter, literal server search, and server pagination.
- `admin_list_users`: typed Auth-user inventory, ownership counts, confirmation
  status, and ban status, with server search/pagination.

Responses are validated and reconstructed using only known fields; unexpected
payloads such as blueprint JSON are discarded from reporting responses. The new
artifact loader has its own explicit content contract. Invalid contracts and missing RPCs
produce a maintainer-facing error message; the frontend never changes the database
to work around a mismatch. Null display names/emails/dates have readable fallbacks.
Dates use `toLocaleString()`, matching the existing dashboard date convention.

Blueprint and user filters are independent. Searches commit after 300ms of
inactivity, with a 200-character input limit. Search/filter/sort/page-size changes
reset pagination to page 1. Default size is 25, with 50 and 100 available. The
blueprint default sort is last modified descending. Sort headers expose aria-sort;
controls have labels and focus styles. Tables are keyboard-focusable horizontal
scroll regions on narrow screens, and overview cards stack at 600px.

Users are displayed exactly as returned by the RPC, including banned and
unconfirmed registrations. Banned status takes visual precedence over confirmation.
Zero counts are explicit. Blueprint names link to protected viewers with actual
artifact-specific edit rights. Inventory tables add no write actions,
collaboration controls, account-management actions, or administrator assignments.

Each report has separate loading, empty, error/retry, and refresh behavior. Results
are hidden when a request changes, and superseded successes/errors cannot replace
newer data. Authorization errors are the exception: they invalidate that identity
even if its search request was superseded. Offset pagination is not a frozen database snapshot; if concurrent
deletions empty a later page, First/Previous can return to available results.

## Tests

Run `npm test`, `npm run build` (includes TypeScript), and `npm run lint`.
`tests/adminDashboard.test.mjs` follows the existing Node test/Vite transformation
approach and uses Happy DOM as a pinned **development-only** dependency. It replaces
both Auth and Supabase modules with fixtures, never loading the real client or
`.env.local`. No test logs in or contacts a hosted service.

Tests exercise the actual App routes and navigation, access checks/denials/errors,
sign-out, account switching, revocation, typed RPC parsing, statistics, table
filters/sorting/pagination/search debounce, statuses, missing fields, empty/error
states, retries, and stale requests. A controller test verifies in-flight check
deduplication and protection against stale reauthorization. DOM tests do not
provide browser layout measurements or verify an actual hosted account.

The deployed admin migration is `20261113093318_read_only_admin_dashboard.sql`.
The database fixture runner checks the exact deployed SQL SHA-256, all three
recovered historical file hashes, and chronological ordering. It applies only the
admin SQL inside a disposable in-memory database; it never replays hosted history.

## Manual validation before frontend release

Use the normal local development command and the existing configured project only
when ready for real authenticated read requests. Existing authentication may upsert
a profile; this feature itself calls only read-only reporting RPCs.

1. Sign in as the designated administrator. Confirm Admin appears, opens
   `/#/app/admin`, and the overview/tables match the existing RPC results.
2. Search each table; filter All/CBMX/Process Canvas; toggle column sorting; change
   pages and page size. Confirm totals, page resets, empty results, and zero counts.
3. Confirm banned users are listed as Banned even if confirmed, unconfirmed users
   are labeled, and no edit/delete inventory buttons appear. After the new migration
   is approved/deployed, verify that blueprint names open in the correct access mode.
4. Check keyboard navigation and narrow mobile widths. Verify that tables scroll
   within their regions and overview cards stack.
5. Sign out: previous rows disappear and direct admin access goes to login. Sign
   in as a non-administrator: Admin stays hidden and the direct route is denied.
6. Test revocation with mocks or a separately authorized disposable environment;
   do not alter production roles for validation. A forbidden RPC must hide all
   reports immediately; background access checks must not resurrect revoked data.
7. Verify ordinary CBMX/Process Canvas navigation and editing remain normal for
   accounts with their existing collaboration permissions.

No commits, pushes, database changes, or deployments are part of implementation.
