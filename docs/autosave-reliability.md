# Autosave reliability review

27 November 2026 · branch `codex/autosave-reliability` · approved production release candidate.

Started from a clean working tree on deployed `main`, commit `7d6a560ff7973a4fa50555b3bedec0164ff62a8c`. Fetching `origin/main` confirmed the same commit before branching. The user successfully completed manual verification in both the CBMX and Process Canvas editors and explicitly approved the implementation and production release on 27 November 2026. Finalization changes documentation and release evidence only; the approved implementation is unchanged. No live database operation, configuration change or workflow change is required or authorized by this release.

## Findings and implementation

**R1 exists in both editors.** CBMX autosave captures a full blueprint, awaits name resolution and the version-checked save, then replaces `draft` with the returned JSON. Previously, local mutation handlers continued accepting edits while awaiting that response. The response could overwrite a later committed edit. Process Canvas follows the same snapshot/replace pattern, and its React saving flags also lacked a synchronous guard against competing save requests.

The existing **1200 ms debounce**, full-blueprint JSON saves, validators, RPCs and database version checks remain. `useSaveLock` adds a synchronous ref plus React state for availability and status. The save function acquires it **before cloning the snapshot or awaiting name lookup**. Every exit releases it in `finally`, including errors during the existing one-time duplicate-name resolution/retry. This adds neither a save queue nor revision tracking, merging, background retry, local recovery or a persistence replacement.

The ref blocks events immediately, including a second event in the same turn before React renders disabled controls. The context exposes this availability to inline components without changing their permission-based `readOnly` props. Both pages also guard blueprint mutation handlers. Successful responses still replace the working blueprint as before; accepting newer committed edits during that interval is now prevented.

`CBMXData.updateBlueprintWithVersion` retains the original database error code when throwing. The previous adapter discarded it, so duplicate detection depended on the error message containing “duplicate key”. The existing duplicate-name retry now also reliably recognizes code `23505` and remains inside the lock. A failure in the retry reaches the outer error handler and releases the lock.

## Protected pathways

| Pathway | Protection |
| --- | --- |
| Blueprint name | Page handler checks the synchronous lock; input is temporarily disabled. |
| CBMX NVP, actor names/AVPs, outcomes, KPIs, services and scenario | `CBMXTable.updateBlueprint`, the page replacement callback and inline commit handlers check the lock. The table updates its internal latest-blueprint ref only after the page accepts the change. |
| Adding/removing actors | Controls disable while saving; the mutation boundary checks the ref. Actor removal rechecks after confirmation. |
| Process addition and rename | `EditableProcess`, `ItemList`, table mutator and page callback reject blocked commits without reporting success. |
| Specialized process deletion | Existing fresh link/access lookup, linked-PCB confirmation, expected PCB ID and version-checked deletion RPC remain. Deletion retains its specialized exclusion/stale safeguards and shares the operation lock. No regular autosave can compete with it. |
| PCB create/link/relink/unlink | Entry and confirmation handlers check availability and identity. Dirty CBMX content is saved first; then the association operation holds the same exclusion lock through its asynchronous work. Existing access, availability, uniqueness and expected-current-link checks remain. The selection dialog stays open and retains selection while autosave blocks confirmation. |
| CBMX JSON replacement | Checks availability before reading and again after file/link awaits. Rejects a replacement if the working blueprint changed meanwhile. Linked process removals still require specialized deletion. A rejected save does not stage a potentially unsafe process removal for later autosave. |
| PCB JSON replacement | Checks before reading and again in FileReader completion, including whether the working blueprint changed. |
| Process Canvas fields, additions and removals | Inline commit checks, `ProcessCanvas.update` and the page callback protect all sections. Existing blank-to-remove semantics remain. |
| Keyboard and blur | CBMX Enter/Ctrl-or-Cmd+Enter and PCB Enter/Ctrl-or-Cmd+Enter/blur cannot commit while locked. Save/Cancel buttons retain the active draft. |
| Save-before-export | The synchronous guard rejects concurrent requests; export waits for its own successful save. JSON uses the actual saved snapshot, including a resolved name. Pending-save export attempts do not start a competing request or continue prematurely. |
| Navigation, account or blueprint change | Separate editor sessions invalidate old asynchronous continuations synchronously during unmount; their responses cannot replace the newly opened editor or navigate the new account. Already issued database requests are not cancelled. |

The first save of a new PCB changes its URL. That **self-initiated creation transition** retains the editor session and uses the already returned row, preserving open addition drafts. Ordinary blueprint/account navigation starts a fresh session. This concerns component lifetime, not persisted blueprint revisions.

The obsolete CBMX `SlotStack` no longer exists on deployed main. Its replacements, `ItemList`, `EditableText` and `EditableProcess`, were reviewed and protected. No replacement SlotStack was introduced.

## Drafts, presentation and status

Locking does not switch either editor to permission-based read-only presentation. It does not change keys for inline drafts, hide controls, close editors, replace the matrix/canvas with an overlay, or commit local text. Existing inline state remains mounted. Blocked actions return before marking a draft committed; the table/page boundaries throw on rejected commits if reached, which existing inline error handling also treats as failure.

CBMX and PCB inputs become temporarily disabled or read-only, and mutation buttons disable. Content, scrolling and contextual help remain available. The only CBMX style additions are scoped status colours and subtle disabled/read-only indications. Approved matrix geometry, actor widths, Process Canvas layout, export implementation and Safari correction are unchanged.

The existing status areas now show `Saved`, `Unsaved changes`, `Saving…`, `Save failed — changes retained`, validation-paused or reload-required messages as appropriate. A stale-save reload reports a conflict rather than claiming the unsaved local draft was retained. `Saved` is selected only when committed working JSON equals the last successfully saved JSON. Open **uncommitted** inline drafts do not mark persisted blueprint content dirty.

## Verification

All commands ran under **Node 20.20.2**, matching deployment's Node 20 major version. No dependencies or lockfiles changed. See [machine-readable checks](../review/autosave/evidence/checks.json) and [real-browser results](../review/autosave/evidence/browser-results.json).

| Check | Supplied production baseline | Current result |
| --- | --- | --- |
| Automated tests | 231 passed; 1 known-failing TODO | **275 passed; 0 failures, TODOs or skips** |
| New focused timing tests | — | **43 passed** |
| TypeScript, `tsc -b` | Passed | Passed |
| Production build | Passed | Passed; existing large-chunk advisory remains |
| Lint | 39 errors, 4 warnings | **37 errors, 4 warnings**; exit 1 remains expected |
| Administrator SQL fixtures | 106 checks | 106 passed |
| Administrative artifact fixtures | 13 scenarios | 13 passed |
| Specialized deletion fixtures | 15 scenarios | 15 passed |
| Linking fixtures | 18 scenarios | 18 passed |
| Whitespace/diff check | Passed | Passed |

Normalized lint file/severity/rule counts show **no added findings**. Two existing `no-explicit-any` findings were removed from the touched CBMX save handling. The four existing dependency warnings remain; lock/busy renders deliberately do not restart the debounce or retry a failed save.

The original R1 test remains in `tests/processEditing.test.mjs`, with its delayed response and final desired-value assertion. Its explicit TODO was replaced with assertions proving that the vulnerable rename is **rejected during saving**, accepted after unlock, and then persisted by the next save. This implements the agreed locking contract rather than pretending an in-flight edit can be committed safely. Existing deletion/read-only/import/conflict tests remain; assertions for a now-disabled Delete button and the new visible failure status were updated to match the requested behavior.

The 43 new tests use held responses and controlled execution of the unchanged debounce, not live services. They cover success/failure unlocking; same-turn rename and inline attempts before disabled props render; modelling/process commitments and addition drafts; Enter and blur; duplicate-name lookup/retry, including retry failure; competing exports; JSON export snapshots; delayed imports; validation/read-only restrictions; actor confirmations; a linking dialog already open when saving begins; pending link exclusion; account/blueprint/navigation changes; first PCB creation; and unchanged stale/forbidden/not-found handling. Existing tests continue covering specialized deletion, permissions, import identity remapping and version checks.

Real **Chrome 158.0.8127.37**, at 1440 × 1000, verified both actual editor pages with synthetic services: the same inline input node and text survived a held request, a blocked keyboard commit and failure; measured draft geometry was identical across failure/unlock; a subsequent commit saved successfully. No browser page error occurred. Screenshots were visually inspected.

Representative six- and ten-actor sparse CBMX exports passed the existing real-browser PNG/PDF checks in **Chrome and Playwright WebKit**: four PNG/PDF pairs total, matching measured/source clone widths, complete right/bottom extents, no editing controls, proportional PDF output and unchanged interactive source markup. The export source itself is unchanged. This is a focused regression pass, not a repetition of the prior release's 58-pair matrix or a new manual Safari sign-off.

All four SQL suites used pinned **PGlite 0.3.0 / PostgreSQL 17**, in memory, with synthetic fixtures. No hosted database was contacted. The agent did not exercise hosted authentication, actual multi-session behavior or native Safari. The user separately reported successful manual verification of both editors before authorizing release; browser/version details were not supplied.

## Screenshots

These show the actual editor pages in the isolated harness. The pale top strip contains developer-only response controls and is not part of production.

| Editor | Normal | Saving, inline draft retained | Save failed, draft retained |
| --- | --- | --- | --- |
| CBMX | [Normal](../review/autosave/evidence/cbmx-normal.png) | [Saving](../review/autosave/evidence/cbmx-saving.png) | [Failure](../review/autosave/evidence/cbmx-failure.png) |
| Process Canvas | [Normal](../review/autosave/evidence/pcb-normal.png) | [Saving](../review/autosave/evidence/pcb-saving.png) | [Failure](../review/autosave/evidence/pcb-failure.png) |

## Manual verification with delayed responses

Use the offline harness; no production credentials or database are required:

```sh
# Use Node 20 in the shell.
node --version
node review/autosave/server.mjs
```

Open [CBMX](http://127.0.0.1:5177/?editor=cbmx) or [Process Canvas](http://127.0.0.1:5177/?editor=pcb). The server disables environment-file loading and substitutes auth/Supabase boundaries; its data exists only in memory. Refreshing resets it.

1. Edit the blueprint name. Observe `Unsaved changes` during the normal 1200 ms debounce; controls remain editable.
2. After `Saving…` appears, the request is deliberately held indefinitely. Attempt another rename, actor/item/process mutation, import/export or keyboard commitment. Check that none changes committed blueprint data and that scrolling/help remain usable.
3. Choose **Complete save**. Check that editing immediately resumes and status becomes `Saved`.
4. Make another edit, wait for `Saving…`, then choose **Fail save**. Check the visible failure message, retained committed content and unlocked controls. It must not automatically issue another request. A new committed edit or an explicit export action can invoke the existing saving mechanism again.
5. For active-draft checks, open a CBMX inline editor, type text without saving it, then rename the blueprint to trigger autosave. Its draft must remain open through blocked Enter/Save and success or failure. CBMX does not commit on blur.
6. In PCB, blur is an existing commit action: rename first, then immediately open Purpose or an empty slot and begin entering a draft **before the debounce expires**. Once saving begins, use Ctrl/Cmd+Enter or Save. The draft must remain open; after Complete/Fail save, it must still be there and commit normally. Wait for Saving before clicking the harness response buttons, so the existing pre-save blur behavior does not commit your draft prematurely.
7. Repeat with a CBMX cost addition and a co-creation process addition. Their text and nodes must survive the lock. Open a link selection before triggering saving, then verify confirmation cannot mutate associations while saving.
8. Switch harness editor links or refresh only when intentionally testing navigation. These intentionally discard that harness instance; they do not provide recovery of unsaved content.

To run the focused deterministic checks:

```sh
node --test tests/autosaveReliability.test.mjs tests/processEditing.test.mjs
```

For reproducible screenshots, install no application dependency: use an existing external Playwright installation and Chrome, then run:

```sh
node review/autosave/verify-browser.mjs --playwright=/absolute/path/to/playwright/index.mjs
```

The browser runner aborts requests outside the isolated localhost server. Stop the review server with Ctrl+C when finished.

## Remaining limits and review notes

- Ordinary network failures retain the current working blueprint and release the lock. A network error can still leave it uncertain whether the server committed the request; the next explicit/new-edit save uses the existing version check. No timeout, retry, queue or browser-local recovery was added. A request that never settles keeps its operation lock until it settles or the editor is left/reloaded.
- Existing stale-save handling still reloads the server version and can discard committed local content. Existing list-revision guards can cancel uncommitted list drafts when a genuinely different list is loaded. This task does not merge or recover conflicts; the status explicitly reports a conflict/reload. Specialized deletion retains its different draft-preserving stale behavior and pauses autosave until reload.
- Authorization remains enforced by the existing adapters, RPCs and database checks. Failure unlocks the UI subject to its current permissions, but does not grant access revoked on the server. Forbidden/not-found saves retain working content where existing mechanisms permit; they remain visibly failed.
- Navigating away, changing accounts, refreshing or closing can lose unsaved content. The existing beforeunload warning remains; no new router navigation guard or local recovery was added. A request already sent may finish on the server after navigation; its response is ignored by the old editor session.
- A delayed import that becomes unsafe because saving or a different working draft intervened is not applied. A failed valid CBMX replacement leaves the original working draft intact, preserving the specialized linked-process-removal safeguard. It does not stage the rejected replacement for later autosave.
- “Saved” describes committed blueprint content. Uncommitted inline drafts are intentionally excluded from saves and exports until the user commits them.
- Permission/read-only modes, JSON structures, authentication, database migrations/RPCs/RLS, Supabase configuration, dependencies, workflows, and approved export implementation are unchanged. No architectural deviation was needed. Two narrow supporting fixes were necessary: preserve duplicate error codes, and preserve PCB component lifetime on its own first-save URL transition.

## Manual sign-off and accepted release limits

The user reported: “I have completed the manual verification of the autosave reliability improvements in both the CBMX and Process Canvas editors. The implementation is working satisfactorily.” The user approved finalization, a reviewed merge commit, publishing main and the existing GitHub Pages deployment, conditional on satisfactory final checks.

The user explicitly accepts the absence of a guaranteed end-to-end save timeout, existing multi-user version-conflict behavior, no automatic retries and no browser-local draft recovery. Do not add a cancellation-aware deadline or further autosave architectural changes in this release. All regression tests and useful database-free tools remain.

## Release preflight and rollback checkpoint

The last successful production release before this change is **`7d6a560ff7973a4fa50555b3bedec0164ff62a8c`**, verified against freshly fetched remote main and GitHub Pages deployment metadata. Its successful workflow is [45976100515](https://github.com/bbkaya/cbmx/actions/runs/45976100515), deployment ID **8106611503**, and Pages artifact **15186827985** (digest `sha256:f78fd4d02afaa8a001cf67a22a4e508fa706d5a40db17ce492a957206c237e07`). The artifact has the existing one-day retention and expires **28 November 2026 at 09:44:03 UTC**. Artifact availability is temporary; the immutable source commit remains the durable rollback basis. [Recorded preflight evidence](../review/autosave/evidence/release-preflight.json).

Final Node 20 tests, lint, TypeScript, production build and all four in-memory SQL fixture suites must match the current 275-test / 37-error-and-4-warning baseline before publishing main. The unchanged workflow still uses Node 20, builds with the existing environment configuration and deploys automatically on a push to main. No dependency, database, environment, migration, RPC or RLS change is included.

Final local checkpoint names: `cbmx-autosave-rc-20261127` on the finalized development commit, and `cbmx-autosave-production-20261127` on the reviewed two-parent production merge. The merge's first parent must be the previous production commit and its tree must equal the approved candidate's tree. Release completion, final SHAs, workflow/deployment results and read-only production checks are recorded in the final handoff and local release audit directory `/private/tmp/cbmx-autosave-release-20261127/` to avoid adding a documentation-only deployment after release.

For a future authorized rollback on a clean checkout:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git revert -m 1 cbmx-autosave-production-20261127
# Review and verify under Node 20; preserve unrelated later work.
git push origin main:main
```

The final handoff also supplies the full merge SHA so rollback does not depend on a local tag. Monitor the resulting Pages workflow and public assets. With no intervening main changes, the revert restores the previous production source tree; it also restores the pre-existing R1 race. Do not reset/force-push, replay migrations or change database/environment settings. If subsequent work creates conflicts, stop and review them. Rollback is documented, not executed.

Housekeeping: removed only the task-owned, regenerable `output/cbmx-autosave-chromium/` and `output/cbmx-autosave-webkit/` verification captures. Retained six screenshots, concise machine-readable evidence, all tests and reusable offline review tools. Normal ignored build output is not source or a deployment configuration change.

## Complete changed-file inventory

This inventory covers intentional branch changes. Ignored `dist/` is regenerable build output; task-owned temporary export captures were removed after verification.

Modified tracked files:

- [src/cbmx/CBMXData.ts](../src/cbmx/CBMXData.ts)
- [src/components/cbmx/CBMXTable.tsx](../src/components/cbmx/CBMXTable.tsx)
- [src/components/cbmx/cbmx.css](../src/components/cbmx/cbmx.css)
- [src/components/cbmx/ui/CBMXEditorToolbar.tsx](../src/components/cbmx/ui/CBMXEditorToolbar.tsx)
- [src/components/cbmx/ui/EditableProcess.tsx](../src/components/cbmx/ui/EditableProcess.tsx)
- [src/components/cbmx/ui/EditableText.tsx](../src/components/cbmx/ui/EditableText.tsx)
- [src/components/cbmx/ui/ItemList.tsx](../src/components/cbmx/ui/ItemList.tsx)
- [src/components/cbmx/ui/LinkProcessCanvasDialog.tsx](../src/components/cbmx/ui/LinkProcessCanvasDialog.tsx)
- [src/components/pcb/ProcessCanvas.tsx](../src/components/pcb/ProcessCanvas.tsx)
- [src/pages/EditorPage.tsx](../src/pages/EditorPage.tsx)
- [src/pages/PCBEditorPage.tsx](../src/pages/PCBEditorPage.tsx)
- [tests/processEditing.test.mjs](../tests/processEditing.test.mjs)

New files (including this report and all retained evidence):

- [docs/autosave-reliability.md](../docs/autosave-reliability.md)
- [review/autosave/boundaries.mjs](../review/autosave/boundaries.mjs)
- [review/autosave/evidence/browser-results.json](../review/autosave/evidence/browser-results.json)
- [review/autosave/evidence/cbmx-failure.png](../review/autosave/evidence/cbmx-failure.png)
- [review/autosave/evidence/cbmx-normal.png](../review/autosave/evidence/cbmx-normal.png)
- [review/autosave/evidence/cbmx-saving.png](../review/autosave/evidence/cbmx-saving.png)
- [review/autosave/evidence/pcb-failure.png](../review/autosave/evidence/pcb-failure.png)
- [review/autosave/evidence/pcb-normal.png](../review/autosave/evidence/pcb-normal.png)
- [review/autosave/evidence/pcb-saving.png](../review/autosave/evidence/pcb-saving.png)
- [review/autosave/index.html](../review/autosave/index.html)
- [review/autosave/main.jsx](../review/autosave/main.jsx)
- [review/autosave/mockServices.js](../review/autosave/mockServices.js)
- [review/autosave/server.mjs](../review/autosave/server.mjs)
- [review/autosave/verify-browser.mjs](../review/autosave/verify-browser.mjs)
- [src/editing/EditingLock.tsx](../src/editing/EditingLock.tsx)
- [tests/autosaveReliability.test.mjs](../tests/autosaveReliability.test.mjs)
- [review/autosave/evidence/checks.json](../review/autosave/evidence/checks.json)

- [review/autosave/evidence/release-preflight.json](../review/autosave/evidence/release-preflight.json)
