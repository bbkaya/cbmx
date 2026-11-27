# CBMX UI redesign: final release readiness

Finalization date: **27 November 2026**, Europe/Amsterdam.

**Release candidate prepared for approval.** The user manually verified the corrected PNG and PDF exports in actual Safari, confirmed clipping is resolved, and approved the final CBMX UI. The user also explicitly accepted the documented pre-existing autosave risk temporarily for this UI release. No new regression was found in the completed checks. Merging, pushing and deploying remain unauthorized and have not been performed.

## Checkpoint and cumulative review

Branch: `codex/cbmx-matrix-visual-redesign`. The final local checkpoint is the commit containing this report, identified by local annotated tag **`cbmx-ui-redesign-rc-20261127`**. The final handoff reports its full commit identifier; the tag is not pushed.

`origin/main` was fetched for this final review. Both local `main` and `origin/main` resolve to **`3282e31cc191b30432a463fd6809ca1eb51d86b3`**, also the branch's merge-base. Earlier recoverable checkpoints remain: `dbadeac` (original export-boundary correction), `82998a4` (Phase 4), `6d46ae7` (Phase 3 refinements), `141856f` (Phase 3), `d0a0c03` (Phase 2), and `2d3e8f1` (Phase 1).

The cumulative diff covers matrix colours/icons/hierarchy and responsive layout; toolbar and validation presentation; explicit inline keyboard/focus editing; item management with source-position targeting and stale-draft guards; clean read-only/export presentation; permission-aware Process Canvas navigation; and independent full-matrix PNG capture with proportional single-page landscape A4 PDFs. The Safari correction freezes measured offscreen cells before SVG cloning and adds the approved uniform 5 CSS px outer white frame. See [Safari investigation and manual sign-off](SAFARI_EXPORTS.md).

The review confirmed:

- Production changes are confined to CBMX components and `EditorPage`. The CBMX item mutators gained guarded item-list operations without changing the persisted conceptual model. Existing persistence/autosave/concurrency logic, specialized linking/deletion data operations and backend permissions are preserved.
- Process Canvas components, editor, domain/data adapters, authentication, CBMX persisted domain helpers/types, Supabase migrations/functions/policies, deployment workflow, Vite configuration, package lock and dependencies are unchanged against main.
- Both existing validators are retained. The table validator's function body and the separate domain validator are unchanged. Shared rendering is reused for export; no independent model or alternate persisted JSON was introduced.
- CBMX styles are scoped to CBMX roots. New editable/toolbar components have CBMX production callers. Obsolete `SlotStack` was removed without remaining callers; pre-existing unused mutator exports were not removed as unrelated cleanup.
- The synthetic preview, export diagnostics and verification scripts are isolated developer tooling, not production entry points. `package.json` adds only `review:cbmx`; no library or lockfile change is needed.
- Finalization introduced documentation and housekeeping changes only. The previously approved Safari correction and tests are included in the final checkpoint; no further UI changes or autosave correction were made.

The complete [cumulative file inventory](CHANGESET.md) records every release path against main.

## Accepted pre-existing autosave risk — R1

A delayed autosave response can replace a later committed local edit with the earlier saved value. Reproduction: commit `First saved name`; start its request; commit `Later committed local name`; resolve the first response. The displayed name reverts to the earlier value. The same desired-behaviour assertion failed against both original main and the redesigned branch using mocked services. This is pre-existing application behaviour, not a redesign regression.

The regression **`release: a pending autosave must preserve a later committed edit`** remains in [tests/processEditing.test.mjs](../../tests/processEditing.test.mjs). Its assertion executes and currently fails under an explicit TODO; it is not skipped. The test file was preserved byte-for-byte throughout finalization (Git blob `01b5c3a71589296d0cbd1f1c6e329b751bf2e55d`). The implementation, assertion and TODO reason have not been changed to manufacture a passing result.

**User decision:** “I accept this existing risk temporarily for the UI release.” This supersedes the earlier release-blocker recommendation for this UI release only. The TODO's historical “Release gate” wording remains deliberately intact; this record documents the accepted exception. A zero test-command exit does not establish autosave reliability. Fixing the race and removing the TODO belong to the separate autosave reliability task.

## Final Node 20 verification

A clean isolated copy of the release source/tests/configuration was installed from the unchanged lockfile using **Node 20.20.2 and npm 10.8.2**. All commands below ran with that Node 20 runtime, matching the deployment workflow's major version. No workspace environment files or authentication credentials were loaded. The source/test/configuration fingerprint matches the final workspace; documentation-only finalization does not change the tested application.

| Check | Final result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passed in clean isolated copy; no package/lockfile edits. This was not a vulnerability audit. |
| `npm test` | **232 total: 231 passed, 0 ordinary failures, 1 known-failing TODO (R1), 0 skipped**; exit 0. |
| Separate `tsc -b` | Passed. |
| `npm run lint` | Exit 1: **39 errors, 4 warnings**, unchanged from the supplied baseline. Normalized file/severity/rule counts match the pre-finalization run with no added findings. Original main had 40 errors and 4 warnings. |
| `npm run build` | Passed; existing large-chunk advisory remains. |
| In-memory PostgreSQL 17 fixtures | All four suites passed: 106 administrator reporting checks; 13 administrative artifact scenarios; 15 safe process-deletion scenarios; 18 process-linking scenarios. |
| `git diff --check` | Passed. |

SQL fixture runners also used Node 20 with pinned external PGlite 0.3.0 and synthetic data; they had no hosted connection. **No live database operation was performed.** Machine-readable results and the tested-source fingerprint are retained in [release-checks.json](evidence/release-checks.json).

These final checks ran on macOS arm64. The unchanged GitHub deployment workflow uses Ubuntu and Node 20; that Linux deployment run has not been triggered. The isolated local build is validation output, not a publishable production artifact configured with the target's secrets.

## Functional, visual and browser evidence

The suites cover direct single/multiline keyboard editing, IME/repeat/duplicate-commit guards, explicit Save/Cancel and focus restoration; item addition/removal, duplicate/source targeting and stale drafts; actor limits and legacy JSON/import/export; validation/save suppression; permission-aware navigation and read-only actions; specialized process deletion/linking and stale/network/forbidden responses. Mocked application tests and in-memory SQL fixtures do not establish the current hosted project's configuration or actual multi-session behaviour.

Prior final visual verification recorded **90 synthetic layout cases** across 2–10 actors, empty/sparse/dense content, editing/viewing, contextual help and 1280/1440/1920 px widths. The approved **174 px** first column and **22 px** outcome indentation remain. Five actors at 1280 px with collapsed help measured **1195 px available and 1195 px content**, with natural wrapping and no horizontal scrolling. Expanded help or more actors retain scrolling. Compact plus controls remain 24 × 24 px on desktop. Finalization did not modify these styles.

The latest export verification used the actual `html-to-image` library and real engines:

| Browser | Result and limits |
| --- | --- |
| Installed Chrome 158.0.8127.37, headless | 29 actual PNG/PDF pairs passed. |
| Playwright WebKit 26.0 | 29 corrected pairs passed; negative control reproduced the clone-width expansion and clipping. This is WebKit automation, not the Safari application. |
| Actual Safari | **User manually confirmed PNG/PDF clipping resolved and approved the final UI on 27 November 2026.** Version not supplied. This is user-reported sign-off, not an automated claim. |
| Firefox 146.0.1 automation | Could not initialize the isolated engine. No Firefox export pass is claimed. |

Each successful engine covered all actor counts 2–10 with empty/sparse/dense fixtures, plus 6- and 10-actor long-content read-only/help-expanded/scrolled variants at a different viewport/device scale. All 58 PNGs were decoded and PDF pages rendered/inspected. Measured original and SVG clone widths match; rightmost Benefits and bottom Scenario fit fully within capture bounds, with the uniform frame outside the matrix. Every PDF retains one proportional landscape A4 page. PNG capture remains 2× with the library's existing automatic canvas limit. Source editor markup is unchanged by capture.

The [retained reference evidence](evidence/README.md) includes a before/after edge comparison, representative Chrome/WebKit PNG/PDF pairs, clone geometry, five-actor fit and a compact 58-case summary. Reusable real-browser regression scripts and diagnostics are documented in the [preview/tool guide](README.md).

## Housekeeping and remaining limitations

Approximately **591 MB** of regenerable CBMX phase screenshots, rendered PDFs, logs, scratch manifests and temporary capture modules were removed from the repository workspace after sign-off. Roughly **3 MB** of intentional reference evidence remains. The obsolete one-off `inspect-export-artifacts.py` was removed; the reusable `inspect-browser-exports.py`, browser runner, synthetic fixtures, preview and diagnostics remain. Narrow ignore rules prevent generated `output/cbmx-*` and `output/pdf/cbmx-*.pdf` files from being staged accidentally. No unrelated source or work was removed. Historical phase reports now point to current evidence and identify removed historical captures.

Remaining limits are the explicitly accepted R1 race; pre-existing lint debt and build-size advisory; incomplete automated Firefox coverage; and unexecuted authenticated/assistive-technology/live multi-session checks. Dense or very tall blueprints are complete but can be difficult to read at whole-page A4 scale. Native PNG viewing/PDF zoom helps; extreme dimensions remain subject to browser memory and the existing 16384 px canvas-dimension limiting strategy. This release is not a full WCAG audit or a comprehensive malformed-JSON validation rewrite. The unchanged import error alert's reference to a nonexistent “Save Now” button remains existing debt.

## Database and configuration impact

**No database migrations, RPC changes, RLS policy changes, environment configuration changes, dependency updates or workflow changes are required by this UI release.** Existing database contracts, authorization and environment values are reused. Do not replay existing migrations or alter policies/configuration as part of this release or rollback. This statement follows the cumulative source diff; it does not claim the deployed project's existing configuration was inspected live.

## Essential checks before deployment authorization

1. Review this final checkpoint and its cumulative diff. If main advances, re-review conflicts and rerun relevant checks on the exact merge candidate. Preserve R1's accepted exception and known-failing TODO.
2. Record the current production commit, deployment ID and recoverable build artifact before release. Confirm the existing Pages target and required `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` configuration are already available; no new values are required.
3. Confirm an authenticated staging smoke pass for owner/editor persistence after refresh, viewer/admin read-only access and existing Process Canvas navigation/link/deletion permissions, without disturbing production data. The [manual test plan](MANUAL_TEST_PLAN.md) details the full matrix; these essential hosted checks were not executed here. Actual Safari export sign-off is complete and need not be treated as outstanding.
4. Obtain **explicit authorization covering merge, push and deployment**. A push to `main` automatically starts GitHub Pages deployment. Observe the unchanged Ubuntu/Node 20 workflow, then perform the brief authorized post-release smoke below. No such action has been taken.

## Recommended merge and deployment procedure

After authorization, retain the final checkpoint, fetch main again and create a reviewed **merge commit** for this feature on the current main (`--no-ff`), using the repository's normal review process. Avoid squash/rebase if retaining a single merge-revert boundary is preferred. Inspect the exact resulting tree and repeat verification if the merge changes tested code or configuration. Do not reset or overwrite unrelated main changes.

Push the approved main commit only when deployment is also authorized: `.github/workflows/deploy.yml` automatically runs `npm ci`, the Node 20 production build with existing target secrets, and the Pages artifact deployment. It does not independently run the full tests or lint; keep this report associated with the reviewed release SHA. No deployment/configuration or database changes are part of the procedure.

After the authorized deployment, confirm the expected Pages URL and commit, application load, a brief authenticated role/persistence/navigation smoke, and representative 6-/10-actor PNG/PDF edges. Keep the accepted autosave limitation visible. Report release status against the actual deployment SHA.

## Rollback procedure

Before release, preserve the last-known-good production SHA and deployment artifact. If rollback is needed, obtain authorization and redeploy that artifact through the existing Pages release process, or revert only this feature's merge with **`git revert -m 1 <UI_MERGE_COMMIT>`**, review the resulting tree and push the approved revert to trigger the unchanged deployment workflow. The `-m 1` procedure applies to the recommended merge commit, not to an arbitrary ordinary commit. If a different merge strategy is chosen, prepare the corresponding scoped revert instead.

Preserve unrelated changes made after the UI release. Do not force-push or reset shared history. Recheck the application/permissions and representative exports after rollback. **No database rollback, migration replay, RPC or RLS change is needed.** A UI rollback does not fix the pre-existing R1 race or restore a local edit already lost through it; any recovery/remediation belongs to a separately authorized task.
