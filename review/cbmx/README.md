# Phase 3 CBMX review

> This is the historical Phase 3 checkpoint report. See [the Phase 4 report](PHASE4.md) for the current presentations, navigation, compact controls and verification. The earlier [Phase 3 refinements](REFINEMENTS.md) document clean export implementation.

Phase 3 replaces empty modelling slots with populated item lists and explicit Add controls. Work stays on `codex/cbmx-matrix-visual-redesign`. The approved Phase 2 source is recoverable at local commit `d0a0c03` (`Checkpoint approved CBMX Phase 2 controls and responsive editing`). Existing untracked review artifacts were preserved.

## Run the database-free preview

From the repository root, run `npm run review:cbmx`, then open [the synthetic preview](http://127.0.0.1:5176). Stop it with Ctrl+C.

The separate Vite entry point disables application configuration and environment-file loading. It imports the CBMX components directly, uses generated fixtures and in-memory state, and loads no authentication or database client. It is bound to localhost. No application login is needed.

- Choose 2, 5 or 10 actors, then empty, sparse or dense blueprint. Fixture buttons reset in-memory edits.
- Click an item or focus it and press Enter to edit. Save/Cancel, Enter/Escape, composition and duplicate-submit guards retain Phase 2 behaviour.
- Click a contextual Add control. The committed-change counter stays unchanged while typing, cancelling, or attempting an empty addition. A valid Save/Add increments it once.
- Focus or hover an ordinary item to reveal its removal control more clearly. Remove deletes that exact item. Process Delete stays inside its specialized editor.
- Toggle read-only to inspect the presentation without item controls. Open/collapse Help, and use Scroll workspace to check overflow.
- Capture PNG and PDF generates the production capture outputs locally; download links appear below the editor.
- The synthetic toolbar's import/export menu and Process Canvas navigation are illustrative. Use the separate capture button for export review. Preview process deletion confirms and removes only an in-memory record; production permission, link, confirmation and version safeguards are exercised by the mocked-service integration suite.

## Implemented interaction

All eight outcome cells per actor, KPIs and actor services now show populated records and one compact contextual Add control. Processes retain one row each with their linked PCB information and dropdown on the right. Empty bullets, numbered slots and slot ellipses are removed. Add opens an immediately focused, empty local editor below the existing items; its Add control stays visible and is disabled until the draft closes. Whitespace-only additions and services/processes without names are rejected without updating the blueprint.

Ordinary removal controls use one trash icon, descriptive accessible labels and native tooltips. They become prominent on hover/focus; touch devices show them at full opacity. No item-count cap was introduced. Actor addition/removal restrictions remain unchanged.

## Identity and mutations

The display retains each ordinary record's original array index before filtering blank records or sorting KPIs. KPI rank ties retain source order; visible numbering is contiguous. Mutations verify a JSON snapshot of the entire underlying source array, then edit/remove that precise original index. They do not identify items by matching descriptions, names or ranks. This handles duplicate records and interleaved outcome categories without persisted IDs or schema changes.

Each source-list revision starts a new React key epoch. If that source array changes while another edit or addition is active, the affected draft is cancelled with a visible status message. Drafts in unchanged source arrays remain open. This deliberately favours cancelling an obsolete draft over applying it to a neighbouring record. Costs in different categories share one underlying cost array, so a change in one category can cancel an active cost draft in another category for that actor; benefits behave likewise.

Successful edits return focus to the corresponding item, removals to the next/previous visible item (or Add), and additions/cancellations to Add. Focus restoration is consumed once, so later list updates do not steal focus. Table mutations use the latest in-memory blueprint, including events batched before React updates controlled props; stale mutation snapshots are rejected.

Guarded append/edit/remove helpers preserve the existing JSON shapes, trimming, parsing and internal Financial normalization. Hidden legacy blank records are retained; they are not migrated or cleaned up during rendering. Service operations and process participant names/IDs use the existing parsers. Existing blank process records remain visible as `Unnamed process (ID)` with PCB information and the specialized Rename/Delete workflow. Valid process additions generate UUIDs at commit, while renames retain their IDs. Production process deletion, linking, validation, permissions, autosave and versioned persistence were not changed.

## Verification

- `npm test`: **158 passing tests**, versus the Phase 2 baseline of 125. There are 33 new focused item tests; the existing process integration test now activates `+ Add process` instead of an empty slot. The suite covers local-only additions, cancellation/empty input, exact deletion/editing, duplicates, interleaved categories, KPI ordering, legacy blanks, parsing, stale/batched edits, focus, read-only and specialized process deletion safeguards.
- `npx tsc -b`: passes.
- `npm run build`: passes, with the existing bundle-size advisory.
- `npm run lint`: **39 errors and 4 warnings**, unchanged from the approved baseline. New production code introduces no lint diagnostics. The existing CBMXTable Fast Refresh diagnostic remains.
- `git diff --check`: passes.
- Synthetic visual layout checks: all 54 combinations of 2/5/10 actors × empty/sparse/dense × 1280/1440/1920 px × collapsed/expanded Help. Browser zoom was 100%. No console warnings/errors were observed.
- At 1280 px with Help collapsed, all three five-actor densities fit: scroll container 1195 px, table 1195 px, first column 174 px, actor columns about 200 px. The table minimum remains 1190 px, with evenly distributed actor columns and paired outcome subcolumns. Ten actors scroll at all three widths. Five actors with expanded Help scroll at 1280/1440 and fit at 1920. The 22 px outcome indentation is unchanged.
- Nine PNG/PDF pairs cover all actor counts and densities. Three additional dense pairs repeat capture at 1280 with Help expanded and the workspace scrolled, versus 1440/collapsed. Each repeated PNG is pixel-identical to its baseline. Actual PNGs and Poppler-rendered PDF pages were visually inspected, including dense content, right-hand actors and the final scenario row. All PDFs contain one landscape A4 page and proportionally fit the complete image. No editor toolbar, validation panel, Help area, scrollbars or clipped matrix edges appeared.
- Capture code and canonical export sizing were not modified. New item controls can still appear in editing-mode exports; the clean export presentation remains Phase 5.

## Artifacts and limitations

Screenshots, all generated PNG/PDF pairs, PDF renders, interaction crops and measured layout data are in `output/cbmx-phase3-review/`. The directory is an untracked review artifact, consistent with the earlier Phase 1/2 review outputs. Representative files are `five-empty-1280.jpg`, `five-sparse-1280.jpg`, `interaction-states.png`, `export-5-sparse.png` and `export-5-sparse.pdf`. Contact sheets show all nine principal PNGs and rendered PDFs. `responsive-metrics.json` records all 54 measurements; `export-metadata.json` records capture contexts.

Very dense examples are intentionally extreme: actor 3 has six long costs in each category; all actors have multiple benefits, KPIs and services. This produces tall rows and very small text when fitted to one PDF page. Browser/PDF zoom is needed for inspection; the underlying PNG remains legible at its native resolution. Narrow outcome cells wrap long words, and editing buttons may wrap onto separate lines. Minimum actor widths and font sizes were not increased or reduced to accommodate controls.

The existing image library automatically scales a canvas when it would exceed 16,384 px on either side. The final spacing adjustment keeps the tested dense five-actor example at 2512 × 15382 and the ten-actor example at 4612 × 14956, below that cap. Larger blueprints can still reach the library limit; scaling retains complete content and aspect ratio subject to integer-pixel rounding. Large captures consume substantial browser memory and take longer; no guarantee is made for unlimited blueprint size. Pagination, export-size changes and the Phase 5 clean presentation remain outside this phase.

No Phase 4/5 work, live database operations, Process Canvas editor changes, pushes, merges or deployments were performed. Phase 3 source changes remain available for local review.

## Files changed

Modified:

- `package.json` — adds the isolated `review:cbmx` command.
- `src/components/cbmx/CBMXTable.tsx` — item descriptors, guarded mutations, explicit Add lists and real process rows.
- `src/components/cbmx/cbmx.css` — compact lists, Add/removal controls, focus/touch states; existing palette and geometry retained.
- `src/components/cbmx/cbmxMutators.ts` — revision guards and precise source-index item operations; process commit wrapper.
- `src/components/cbmx/ui/CBMXActionIcon.tsx` — generic trash icon.
- `src/components/cbmx/ui/EditableText.tsx` — optional initially active editor and editing/cancellation callbacks.
- `src/components/cbmx/ui/EditableProcess.tsx` — the same local-draft integration and blank-process display fallback.
- `tests/processEditing.test.mjs` — explicit process Add activation, retaining all existing deletion assertions.

New:

- `src/components/cbmx/ui/ItemList.tsx` — local additions, draft lifetime, lightweight rows, precise removal and focus restoration.
- `tests/cbmxItems.test.mjs` — 33 focused regression tests.
- `review/cbmx/server.mjs` — isolated localhost Vite server.
- `review/cbmx/index.html` — preview entry.
- `review/cbmx/main.jsx` — in-memory preview and export controls.
- `review/cbmx/fixtures.js` — synthetic actor counts and densities.
- `review/cbmx/preview.css` — preview shell/controls only.
- `review/cbmx/README.md` — this implementation and verification report.

Removed:

- `src/components/cbmx/ui/SlotStack.tsx` — obsolete empty-slot component, with no remaining callers.

Generated review files are listed in `output/cbmx-phase3-review/artifact-manifest.txt`.

Post-Phase 4 export boundary investigation, correction and review artifacts: [EXPORT_EDGES.md](EXPORT_EDGES.md).
