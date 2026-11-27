# Phase 3 refinements: compact Add controls and clean exports

> Historical checkpoint report. Generated bulk captures were removed during final release preparation after user sign-off. See [current release readiness](RELEASE_READINESS.md) and [retained evidence](evidence/README.md).

These two refinements are complete on `codex/cbmx-matrix-visual-redesign`. The reviewed Phase 3 implementation was checkpointed locally as `141856f` (`Checkpoint reviewed CBMX Phase 3 item management`) before changing source. Existing generated review artifacts were preserved. Refinement changes remain uncommitted for review.

## Compact Add controls

Every outcome list, KPI list, actor-service list and co-creation-process list now ends with a small standalone `+` button. Buttons are 22 × 22 px on desktop and 28 × 28 px on touch/coarse-pointer surfaces, with subtle borders/backgrounds and the existing focus indicator. Empty cells retain a discoverable control. Tooltips identify the item type and outcome category; accessible names also include the actor/list context.

The existing local-draft state, validation, Save/Cancel or Rename/Add confirmation, keyboard guards, focus restoration and precise item targeting are retained. Add controls remain visible and disabled while their addition draft is open. The existing Add Actor button and actor removal controls are unchanged in the editor.

## Clean export implementation

`captureBlueprintPng` now requires the current committed blueprint and Process Canvas link summaries as well as the editor canvas node. EditorPage passes the same blueprint state that drives the matrix after the existing `ensureSavedBeforeIO` workflow. Uncommitted inline field drafts remain inside their editor components and are not part of this snapshot. The canvas node supplies the existing font family; its table, input values, scrolling containers and controls are not used as export content.

The export helper deep-copies the supplied data and mounts the existing `CBMXTable` component into a detached React root with `presentation="export"`. This mode uses the existing read-only text/process rendering, suppresses editing callbacks, contextual help indicators and the help sidebar, and provides plain PCB name annotations. A static copy of that independently rendered table enters the existing fixed offscreen capture container; the temporary React root is unmounted immediately. The live editor is never switched to read-only or otherwise altered.

The resulting capture contains no Add/Remove Actor buttons, item Add/Edit/Delete controls, pencil indicators, Process Canvas menus, Save/Cancel controls, inputs, textareas, contextual help icons or sidebar, UI placeholders, unused slots, hover/focus styles, toolbar, validation panel or scrollbars. Empty modelling cells and every conceptual row remain structurally present. Content retains row-label icons, actor types/names, the palette, rounded blocks, paired outcome subcolumns, category indentation, KPI ordering/numbering, service operations, process participants and multiline Service Scenario text.

An export displays a PCB name only when the supplied summary reports an existing link, `has_pcb_access=true`, and an owner/editor/viewer role. Unauthorized and inconsistent flags omit the name entirely. Export does not introduce a permission lookup or expose IDs as name fallbacks. Unlinked/no-access UI status labels and unnamed-process editing placeholders are omitted. A legacy blank process with populated participants or an authorized PCB name retains that content; an entirely blank process contributes no placeholder row. This is presentation only: no legacy records are removed or migrated.

The approved capture geometry remains unchanged: canonical width `190 + actorCount × 210`, a 190 px export label column, capture padding, 2× PNG resolution, visible nested overflow and one proportionally fitted landscape A4 PDF page. The interactive matrix retains its 174 px label column and responsive actor sizing. There is no duplicated matrix implementation and no multipage export.

## Verification

| Check | Result |
| --- | --- |
| Automated tests | **170 pass**, versus 158 at the Phase 3 checkpoint; 12 additional regression cases |
| TypeScript (`npx tsc -b`) | Pass |
| Production build (`npm run build`) | Pass; existing bundle-size advisory remains |
| Lint (`npm run lint`) | **39 errors and 4 warnings**, unchanged; no new diagnostics |
| Whitespace (`git diff --check`) | Pass |
| Synthetic layout | 54 combinations: 2/5/10 actors × empty/sparse/dense item lists × 1280/1440/1920 px × collapsed/expanded help |
| Actual exports | 13 PNG/PDF pairs generated and inspected, including Poppler renders of the PDFs |

Focused coverage verifies plus-only controls and contextual tooltips/labels; all existing addition/edit/removal cases remain passing. Export tests verify structural/content retention, empty cells, KPI ordering, authorized owner/editor/viewer PCB names, rejection of inconsistent access flags, legacy blank processes, cleanup on capture failure and canonical sizing. A mounted interactive-editor regression keeps actor-name, outcome, service-addition, process and multiline scenario drafts active while capturing; all drafts, focus/selection, help, open PCB menu, source markup and scroll positions remain intact, with zero blueprint change notifications.

Browser checks confirmed native Enter/Space activation, local-only typing/cancellation, focus restoration, one committed addition and exact individual removal. At 1280 px with help collapsed, empty/sparse/dense five-actor matrices all fit: scroller width 1195 px, table width 1195 px, label width 174 px, actor columns about 200 px. The 22 px category indentation remains. Expanded help and ten actors retain horizontal scrolling where needed.

Nine principal capture pairs cover all actor-count/density combinations at 1440 px. Three dense pairs repeat at 1280 px with help expanded and the workspace scrolled, including horizontal scroll offsets of 185 px (five actors) and 1195 px (ten actors). Each repeated PNG is pixel-identical to its baseline. A thirteenth pair captures a sparse five-actor editor with uncommitted outcome, service and multiline scenario drafts; its PNG is also pixel-identical to the committed baseline. In all 13 browser captures, the source matrix markup, field values and horizontal scroll position remain unchanged.

The actual PNGs and rendered PDF pages were inspected for visible controls/placeholders, content completeness, row/column alignment, the last actor column and final scenario row. All 13 PDFs have one landscape A4 page; their single embedded image matches the PNG dimensions and fits proportionally inside the page without cropping. Unauthorized PCB names are covered with intentionally populated hidden names in regression fixtures; the actual synthetic exports show the authorized name only. No browser console errors or warnings were observed.

## Review locally

Run `npm run review:cbmx` from the repository root and open <http://127.0.0.1:5176>. The preview may already be running from this review. Choose 2, 5 or 10 actors and empty, sparse or dense item lists. The empty fixture keeps actor names and narrative/context fields seeded so list structure is easy to inspect. The preview imports the actual matrix/export components directly, disables application configuration/environment loading, and uses in-memory fixtures with no auth or database client.

Click or keyboard-activate a plus, type and cancel/save while watching the committed-change counter. To check draft isolation, leave one or more inline fields open, type without saving, then use **Capture PNG and PDF**. The editor keeps its drafts; the image below the editor and its download links contain committed values. Toggle help and use Scroll workspace to repeat the capture. Preview navigation and toolbar menu entries remain illustrative; the dedicated capture button invokes the real capture/PDF functions. Process deletion in this isolated preview affects memory only; production specialized deletion remains covered by the existing mocked-service suite.

Artifacts are in `output/cbmx-refinements-review/`, separately from earlier review outputs:

- `five-empty-1280.jpg` and `five-populated-1280.jpg`: requested editor screenshots.
- `clean-5-sparse.png` and `clean-5-sparse.pdf`: representative complete clean exports.
- `clean-{2,5,10}-{empty,sparse,dense}.{png,pdf}`: principal fixture exports.
- `*-expanded-scrolled.*` and `clean-5-sparse-active-drafts.*`: capture-isolation examples.
- `pdf-renders/`, contact sheets and dense-content crops: visual inspection evidence.
- `responsive-metrics.json`, capture metadata and `pdf-verification.json`: measured verification.
- Build/test/lint logs and `artifact-manifest.txt`: remaining verification evidence and generated-file inventory.

## Files changed

Modified:

- `src/components/cbmx/ui/ItemList.tsx` — plus-only presentation with contextual title/accessible name; item-management logic unchanged.
- `src/components/cbmx/CBMXTable.tsx` — export presentation mode, clean row labels/process annotations and contextual Add labels.
- `src/components/cbmx/cbmx.css` — compact desktop/touch plus-button sizing and styling.
- `src/components/cbmx/cbmxExport.ts` — independent committed-data rendering through the shared matrix component, retaining the approved capture/PDF mechanisms.
- `src/pages/EditorPage.tsx` — passes committed blueprint/link data to PNG/PDF capture; existing save/permission/concurrency workflows retained.
- `review/cbmx/main.jsx` — passes the same data to the real capture function in the database-free preview.
- `review/cbmx/README.md` — links this refinement report from the historical Phase 3 report.
- `tests/cbmxItems.test.mjs` — semantic selectors plus the new plus-only presentation regression.
- `tests/processEditing.test.mjs` — finds the renamed process Add control through its contextual tooltip, preserving deletion assertions.
- `tests/cbmxExport.test.mjs` — actual shared-renderer capture boundary, content, authorization and active-draft regressions.

New:

- `review/cbmx/REFINEMENTS.md` — this report.
- Generated review artifacts listed in `output/cbmx-refinements-review/artifact-manifest.txt` (untracked).

No mutator/domain/JSON/schema or Process Canvas editor files changed. The broader Phase 4 navigation work remains untouched. No live database operations, pushes, merges or deployments were performed.

## Remaining limitations

The existing export is raster-based. Dense single-page PDFs need substantial zoom, and very large blueprints consume significant browser memory and capture time. The dense five-actor PNG is 2512 × 11376; the dense ten-actor PNG is 4612 × 11344. The existing image library can proportionally reduce images that exceed its 16,384 px dimension limit. These refinements preserve that limit and the single-page approach.

All displayed data is captured as committed when export starts. Later changes do not alter an export already in progress. PCB name visibility uses the permission summary already available to the editor; no new live permission/database operation was introduced. There were no scope deviations beyond the explicitly requested early implementation of clean exports, and no new regressions were found in the tested flows. Existing lint debt and the build-size advisory remain.
