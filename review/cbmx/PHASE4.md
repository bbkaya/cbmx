# Phase 4 CBMX review

> Historical checkpoint report. Generated bulk captures were removed during final release preparation after user sign-off. See [current release readiness](RELEASE_READINESS.md) and [retained evidence](evidence/README.md).

Phase 4 is complete on `codex/cbmx-matrix-visual-redesign`. The approved Phase 3 refinements were checkpointed locally at `6d46ae7` (`Checkpoint approved CBMX Phase 3 refinements and clean exports`) before implementation. Existing untracked review artifacts were preserved. Phase 4 changes remain uncommitted for review.

## Implemented changes

The list Add symbol now inherits the standard modelling font size: **12 px**, reduced from 16 px. It has regular weight, a transparent background, no border and no surrounding margin. Its desktop click target is **24 × 24 px**, while the visible symbol occupies a small 14 px container. Touch/coarse-pointer targets remain 28 × 28 px. Hover highlights only the small symbol area, and keyboard focus retains a clear outline around the clickable target. Tooltips, accessible labels, local drafts, Enter/Space activation and explicit commit/cancel behaviour are unchanged. The structural Add Actor button is unchanged.

Read-only matrices now reuse clean content presentation while retaining interactive contextual help and authorized PCB navigation. They show populated modelling items, numbered KPIs, services/operations, processes/participants and the complete multiline scenario without Add/Edit/Remove/Delete controls, pencil indicators, editing hover effects or empty slots/placeholders. Empty cells and all conceptual rows remain aligned. The existing toolbar continues to show `View only` / `Read-only access`, or `Admin View — Read Only` for administrative inspection.

An authorized linked PCB name becomes a compact underlined text button in read-only mode. It invokes the existing `EditorPage.openLinkedPCB` handler. No single-action dropdown or link-management controls appear. Inaccessible associations show only `Linked PCB (no access)`, with no protected name, ID or Open control. Authorized names remain plain text if no target ID or navigation callback is available.

Legacy blank process records remain recoverable in editing mode through the existing stable-ID Rename/Delete editor. Read-only mode omits empty recovery placeholders, but retains populated participants, authorized PCB names and authorized navigation targets. Even an entirely blank process with an authorized unnamed PCB remains navigable through the generic `Linked Process Canvas` action. Export retains its approved clean-content rules. No legacy records are removed or migrated.

## One matrix, three presentations

`CBMXTable` now accepts `presentation="editor" | "readonly" | "export"`. EditorPage passes its existing permission-derived mode explicitly. The same HTML table, row renderers, item descriptors, icons and display components serve every context. Read-only/export presentations suppress editing callbacks even if a caller supplies one; ordinary callers that omit `onChange` retain read-only behaviour.

| Presentation | Modelling controls | Contextual help | Authorized PCB navigation | Association management |
| --- | --- | --- | --- | --- |
| Editing | Existing authorized controls | Indicators and collapsible panel | Existing dropdown Open action | Existing dropdown rules |
| Read-only | Hidden; plain populated content | Indicators and collapsible panel | Lightweight clickable PCB name | Hidden |
| Export | Hidden; committed content only | Hidden | Plain authorized PCB names only | Hidden |

The existing PNG/PDF helper still renders an independent committed-data snapshot through `CBMXTable` in export mode. It does not switch the live editor's mode or copy local field drafts. No duplicated matrix implementation was introduced, and no export helper or PDF fitting code changed in Phase 4.

The interactive matrix retains the **174 px** first column, **22 px** category indentation, paired Costs/Benefits columns, responsive sizing, colours, typography and scrolling. The approved canonical export geometry remains separate from the responsive editor: a 190 px export label column, `190 + actorCount × 210` canonical width, 2× PNG resolution and one proportionally fitted landscape A4 PDF page.

## Navigation and permissions

A common display/navigation check requires an existing link, `has_pcb_access=true` and an owner/editor/viewer PCB role. It governs protected PCB name visibility across the matrix. Inconsistent or unsupported roles do not reveal names or enable navigation.

The new read-only name control requires a target ID and invokes the existing navigation callback. That handler independently checks the loaded link's access flag and PCB role before using the existing normal `/app/pcb/:id` or administrative `/app/admin/pcb/:id` route. It does not pass an editing capability or derive PCB rights from CBMX membership. The destination continues to determine its own editing/read-only mode from its PCB permissions.

The local administrative contract was inspected: authorized administrative inspection can supply effective viewer access to a linked PCB, while the actual artifact role remains separate. Existing administrative routing and destination checks are unchanged. Administrative read capability does not synthesize PCB owner/editor rights.

| CBMX context | Linked PCB access | Available interaction |
| --- | --- | --- |
| Read-only | Owner, editor or viewer | Open authorized PCB by its name; no management actions |
| Read-only | Inaccessible or inconsistent access flags | Generic association status; no protected name/ID or navigation |
| Editing | PCB owner/editor | Existing Open, Replace, Relink and Unlink actions |
| Editing | PCB viewer | Existing Open action; no mutation actions |
| Editing | PCB inaccessible | Existing disabled menu actions and explanation |
| Editing, no association | No current PCB | Existing Create/Link workflow |
| Export | Authorized name | Static annotation without navigation or controls |

Existing mutation callbacks, confirmation dialogs, server/RPC guards, versioned deletion, autosave and conflict handling were preserved. No Process Canvas editor, shared navigation handler, database schema, security policy or authentication implementation was modified. No live database connection, query, migration or operation was performed.

## Verification

| Check | Result |
| --- | --- |
| All automated tests (`npm test`) | **205 passing**, up from 170; no failures |
| TypeScript (`npx tsc -b`) | Pass |
| Production build (`npm run build`) | Pass; existing bundle-size advisory remains |
| Lint (`npm run lint`) | **39 errors and 4 warnings**, unchanged baseline |
| Whitespace (`git diff --check`) | Pass |
| Synthetic responsive layouts | **108 combinations** checked |
| Actual PNG/PDF capture pairs | **11 pairs** generated and inspected |

The 35 new tests comprise 19 shared-presentation/navigation regressions, 5 real-EditorPage tests with mocked services for CBMX viewers, 8 administrative route/destination-role scenarios and 3 normal-route scenarios using the actual PCB destination component. Coverage includes all three presentations, absence of editing/management controls, read-only contextual help, owner/editor/viewer PCB access, inaccessible and inconsistent summaries, protected-name/ID masking, missing IDs, blank legacy records, unchanged editing dropdown restrictions and specialized Delete callback identity. The existing suite continues to cover item addition, cancellation, duplicates, source-index targeting, stale drafts, keyboard guards, process link management, version/permission/confirmation deletion safeguards and clean export isolation from active drafts.

Administrative navigation tests cover CBMX viewer and non-member inspection, with destination PCB owner/editor/viewer/non-member roles. Actual destination components retain editing only for owner/editor roles; viewer/non-member administrative destinations remain read-only. Navigation performs no mutation. Three normal-route tests also take a CBMX viewer into the actual PCB component: owner/editor PCB roles open editable destinations, while PCB viewers remain read-only. The existing guarded navigation route is available only when the PCB summary permits it.

The browser confirmed Enter/Space Add activation, local-only typing/cancellation, focus restoration, one valid addition and precise removal. Computed styles confirm a 12 px Add symbol matching modelling text, a 24 × 24 px desktop target, zero border/margin and transparent background. Read-only mode has zero modelling/management controls, all 13 contextual help indicators and all 13 conceptual rows. Keyboard activation of the PCB name works for owner/editor/viewer summaries; the synthetic preview reports the intended target mode without contacting a database or navigating to a real PCB.

Responsive checks cover editing/read-only × 2/5/10 actors × empty/sparse/dense item lists × 1280/1440/1920 px × collapsed/expanded help. At 1280 px with help collapsed, every five-actor combination fits: table and scroll-container widths are 1195 px, the first column is 174 px and actor columns are about 200 px. Ten actors and expanded help preserve scrolling when needed. No modelling font size or minimum actor width was reduced/increased to obtain this result.

Nine principal PNGs cover all actor counts and densities. **Every RGB pixel matches the approved Phase 3 refinement export** for the corresponding fixture. A read-only five-actor capture also matches its editing-mode export exactly. A read-only ten-actor capture at 1280 px, with help expanded and the workspace vertically and horizontally scrolled, likewise matches its editing-mode export. All capture contexts preserve source matrix markup, field values and horizontal scroll.

Actual PNGs and Poppler-rendered PDF pages were inspected, including the final scenario row, right-most actor and dense content. All 11 PDFs contain one landscape A4 page, with the PNG dimensions retained and the image proportionally fitted inside the page without cropping. No editing/navigation controls, help or scrollbars appear in exports. No browser console errors/warnings were observed.

## Screenshots and artifacts

All generated review files are in `output/cbmx-phase4-review/` and listed in `artifact-manifest.txt`.

- `five-editing-1280.jpg`, `five-readonly-1280.jpg` and `clean-5-sparse-overview.jpg` compare the same populated five-actor blueprint. The editing screenshot is a normal viewport capture; the longer editor remains scrollable below it.
- `smaller-plus-crop.png` shows the lightweight symbols and keyboard focus target; `plus-metrics.json` records their measured styling.
- `pcb-access-comparison.png` compares owner/editor/viewer/inaccessible link presentation; `access-verification.json` records actions and hidden-name checks.
- `readonly-help-expanded.jpg` and `administrative-readonly.jpg` show interactive help and administrative read-only status.
- `clean-5-sparse.png` and `clean-5-sparse.pdf` are representative complete clean exports.
- The remaining `clean-*` PNG/PDF pairs, `pdf-renders/`, contact sheets and dense-content crops provide capture evidence.
- `responsive-metrics.json`, capture metadata, `export-comparison.json` and `pdf-verification.json` contain measured results. Build/test/lint logs are included.

## Review without a database

Run `npm run review:cbmx` from the repository root, then open <http://127.0.0.1:5176>. The preview may already be running. Its separate Vite entry point disables application configuration/environment loading and imports the actual matrix/export components directly. It uses in-memory fixtures and no authentication or database client.

1. Choose 2, 5 or 10 actors and empty, sparse or dense item lists. Fixture buttons reset in-memory edits. The empty fixture retains seeded actor names and narrative context.
2. In editing mode, use the small plus buttons and existing inline editors. The committed-change counter stays unchanged while typing/cancelling and increments only for committed changes.
3. Use Toggle read-only to compare the same blueprint. Help remains available; modelling controls and PCB management menus disappear.
4. Select owner/editor/viewer/no access under PCB access. The first process changes its navigation availability. The second linked process remains inaccessible, providing a simultaneous masked example. Activate the underlined name with mouse or keyboard; the preview status reports the simulated destination mode. This callback does not navigate to a real PCB.
5. Toggle administrative view to inspect the existing administrative read-only toolbar and routing context. This is a visual fixture; real authorization and destination-role behaviour are exercised by the mocked integration tests.
6. Capture PNG and PDF from either interactive mode. Download links appear below the editor. Help, viewport, scrolling and local field drafts do not enter the export. The preview's toolbar import/export menu is illustrative; use the dedicated Capture button.

Stop the preview with Ctrl+C when running it in your own terminal.

## Files changed

Modified:

- `src/components/cbmx/CBMXTable.tsx` — explicit read-only presentation; shared blank/content rules; permission-aware name visibility and lightweight PCB navigation; existing editing management retained.
- `src/components/cbmx/cbmx.css` — smaller visible Add symbols and lightweight PCB-name control styles.
- `src/pages/EditorPage.tsx` — passes the existing permission-derived presentation explicitly; navigation handler and persistence logic unchanged.
- `review/cbmx/main.jsx` — read-only/admin/access preview controls and an in-memory navigation callback.
- `review/cbmx/index.html` — Phase 4 preview title.
- `review/cbmx/server.mjs` — Phase 4 startup label.
- `review/cbmx/README.md` — links the current Phase 4 report from historical documentation.
- `tests/processEditing.test.mjs` — CBMX viewer navigation, inaccessible summaries and no-mutation checks.
- `tests/adminDashboard.test.mjs` — normal and administrative CBMX/PCB role combinations through actual destination components; per-artifact membership fixtures.

New:

- `tests/cbmxPresentation.test.mjs` — 19 focused shared-presentation and permission regressions.
- `review/cbmx/PHASE4.md` — this implementation/review report.
- Review artifacts listed in `output/cbmx-phase4-review/artifact-manifest.txt` (untracked).

The export helper, item-management component/mutators, domain/JSON definitions, inline editors, validators, Process Canvas editor and Supabase files are unchanged.

## Deviations and remaining limitations

No scope deviations were necessary. Phase 5 was not started. No pushes, merges or deployments were performed.

Link visibility uses the permission summary already loaded by the application; no new live permission request was introduced. The destination's existing authorization remains authoritative. The browser preview simulates navigation only; actual normal/admin route handling and destination roles are covered with mocked services, as requested.

Raster PNG/PDF exports retain their existing characteristics. Dense single-page PDFs require substantial zoom, large captures use significant browser memory/time, and the image library can proportionally scale images that exceed its 16,384 px dimension limit. The tested dense exports remain 2512 × 11376 (five actors) and 4612 × 11344 (ten actors). Existing lint debt and the build-size advisory remain. No new regressions were found in the tested flows.
