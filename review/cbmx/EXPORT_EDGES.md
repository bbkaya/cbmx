# Export boundary correction after Phase 4

> Historical checkpoint report. Generated bulk captures were removed during final release preparation after user sign-off. See [current release readiness](RELEASE_READINESS.md) and [retained evidence](evidence/README.md).

Implemented on `codex/cbmx-matrix-visual-redesign`. Recoverable Phase 4 checkpoint: `82998a4` (`Checkpoint approved CBMX Phase 4 presentation and navigation`). Generated outputs from previous phases were excluded from the checkpoint and preserved. No push, merge, deployment, Phase 5 work or database operations were performed.

## Investigation and correction

The capture boundary was derived from the nominal `190 + actorCount × 210` table width plus the existing 16 px of wrapper padding, and then from the wrapper's bounding box and integer `scrollWidth`/`scrollHeight`. It never checked the actual right and bottom edges of the table cells or their descendants. Consequently, fractional table/cell overflow beyond the wrapper could fall outside the image. The table also retained `width: 100%`, so increasing the wrapper to accommodate overflow could change the table layout again during capture.

The correction pins the offscreen table to its measured rendered width after fonts are ready. It then measures the union of the table and every rendered descendant relative to the capture origin, includes the existing computed right/bottom padding, and rounds the final image dimensions upward. Both the offscreen container and rasterizer receive those final dimensions. The table no longer grows when the capture boundary grows. No actor-count compensation or new blank margin was added.

The precise reported six-actor clipping threshold was **not reproduced** in the available local browser before the change: the original six- and ten-actor sparse fixtures already had complete edges. The old boundary calculation is demonstrably incomplete, and the new regression tests reproduce its failure with fractional cell/content overflows. This establishes the boundary defect and its correction, but does not establish a separate browser-specific cause for the reported threshold. The preserved `before-6.png`, `before-10.png` and `before-6-metrics.json` document this limitation rather than implying a reproduced before/after visual failure.

Additional findings:

- The interactive table's minimum-width formula, first-column width, overflow wrapper and responsive geometry are unchanged. Export still uses its independent canonical table width.
- Border spacing remains 3 px; cell padding, colours, rounded corners and paired outcome columns are unchanged. Measured clone/table rounding drift reached 0.25 CSS px in these fixtures, within the retained edge padding.
- No nested scroll container, help panel, contextual help indicator or editing control enters the export renderer. There are no new overflow restrictions.
- The resolution strategy remains `pixelRatio: 2`, including html-to-image's existing automatic canvas dimension limit handling.
- PDF placement is unchanged: the complete PNG is proportionally fitted and centred on one landscape A4 page. All PDF image placement matrices were checked against the page bounds; no cropping or nonuniform scaling was found.

## Verification

`npm test`: **215 passed**, 0 failed (baseline 205; 10 new extent tests).

`npm run build`: passed; existing bundle-size advisory remains.

`npx tsc -b`: passed.

`npm run lint`: **39 errors, 4 warnings**, unchanged from the supplied baseline. Lint is not clean; no new lint findings were introduced.

`git diff --check`: passed.

### Actual generated files

34 PNG/PDF pairs were generated with the real table renderer, html-to-image and jsPDF in the isolated memory-only preview:

- All nine actor counts 2–10, each empty, sparse and dense: **27 pairs**, editing mode, 1440 × 1000 viewport, help collapsed.
- 6, 7, 8, 9 and 10 actors, dense: **5 pairs**, read-only mode, 1280 × 900, help expanded, horizontal and vertical scrolling. Horizontal offsets ranged from 387 to 1195 px; vertical offsets ranged from 3163 to 3233 px.
- Five actors, dense: 1920 × 1080, editing mode, help collapsed, scrolled.
- Five actors, sparse: 1280 × 900, editing mode, help collapsed.

Non-empty fixtures contain long Financial Benefits in the last actor, multiple dense modelling items, and eight long scenario stages. End markers are `END BENEFITS A<n>` and `END SERVICE SCENARIO`. Empty fixtures keep the structural rows and short narratives while outcome/KPI/service/process lists are empty.

Every PNG was decoded and checked for non-white content reaching the image boundary; every PDF was parsed and rendered with Poppler. All 34 pages contain one image on one landscape A4 page, with an unchanged aspect ratio, fully inside the page. All raster-clone elements fit inside the image dimensions and no export controls/scroll containers were found. The editor canvas markup and its horizontal scroll position remained unchanged by every capture.

All five expanded-help/read-only/scrolled dense PNGs are pixel-identical (RGB comparison) to their editing-mode baselines. Extent assertions and explicit edge inspection supplement this comparison; equality alone is not used as evidence of completeness.

Across all 34 files:

- Rightmost non-white pixels end **22 PNG pixels** before the image boundary.
- Bottommost non-white pixels end **22–24 PNG pixels** before the image boundary.
- Rendered clone table/descendant right clearances are **7.75–8 CSS px**; bottom clearances are positive in every case.
- The complete last Benefits blocks, their text/end markers, backgrounds and rounded corners are visible.
- The complete bottom Service Scenario row and its bottom/right rounded corners are visible.

The 1280 px editor check still reports a 1195 px scroll area with 1195 px content: no horizontal scrolling for five actors. First column: **174 px**. Category indentation: **22 px**.

### Review artifacts

All paths below are relative to this report. PNG files are the actual full-resolution exports. PDF files are the actual generated PDFs; page and detail sheets are rendered from those PDFs.

| Actors | PNG | Single-page A4 PDF | PNG dimensions |
| --- | --- | --- | --- |
| 5 | PNG (historical generated artefact; removed at final cleanup) | PDF (historical generated artefact; removed at final cleanup) | 2512 × 2924 |
| 6 | PNG (historical generated artefact; removed at final cleanup) | PDF (historical generated artefact; removed at final cleanup) | 2932 × 2924 |
| 7 | PNG (historical generated artefact; removed at final cleanup) | PDF (historical generated artefact; removed at final cleanup) | 3352 × 2656 |
| 10 | PNG (historical generated artefact; removed at final cleanup) | PDF (historical generated artefact; removed at final cleanup) | 4612 × 2628 |

- PNG right and bottom edge details (historical generated artefact; removed at final cleanup)
- Rendered PDF right and bottom edge details (historical generated artefact; removed at final cleanup)
- All 27 base PNGs: overview (historical generated artefact; removed at final cleanup)
- All 27 base PDF pages: overview (historical generated artefact; removed at final cleanup)
- Browser context and measured bounds (historical generated artefact; removed at final cleanup)
- PNG boundaries and PDF placement results (historical generated artefact; removed at final cleanup)
- Full automated test log (historical generated artefact; removed at final cleanup)
- New regression tests against the checkpoint module (historical generated artefact; removed at final cleanup)

The overview sheets and native PNG edge details were visually inspected. Representative PDF pages were additionally rendered at a 6000 px page width for detailed edge inspection. A follow-up smoke capture verifies the extracted diagnostic helper; its output is `6-sparse-diagnostics-check.*` with metadata in `diagnostics-smoke.json`.

## Files changed

Modified:

- `src/components/cbmx/cbmxExport.ts`: measured table width, complete rendered extent and final capture sizing. No PDF placement changes.
- `tests/cbmxExport.test.mjs`: nine actor-count boundary regressions plus a computed-padding regression. Fractional overflowing last Benefits cells and bottom scenario descendants are checked explicitly, including image dimensions and pinned table/container widths. The old wrapper-only calculation fails these assertions. Running the new suite against the checkpoint export module confirmed 20 existing tests passing and all 10 new tests failing; the corrected module passes all 30.
- `review/cbmx/main.jsx`: all actor counts 2–10, boundary diagnostics and capture metrics in the local preview.
- `review/cbmx/fixtures.js`: long last-actor Benefits and long Service Scenario stress content.
- `review/cbmx/README.md`: link to this review report.

New:

- `review/cbmx/exportDiagnostics.js`: preview-only measurement of the offscreen capture and html-to-image's serialized computed-style clone; no production hooks or API changes.
- The historical `review/cbmx/inspect-export-artifacts.py` was superseded and removed at finalization. Use the retained generic `inspect-browser-exports.py` and [current tool guide](README.md) for PNG boundaries, PDF placement and rendered page inspection.
- `review/cbmx/EXPORT_EDGES.md`: this report.

Generated review evidence is under `output/cbmx-export-edges-review/` and is not staged. Previous output folders remain intact. Interactive styling, item controls, mutators, permissions, persistence, validation and Process Canvas code have no changes after checkpoint `82998a4`.

## Limitations

The exact browser/data combination that produced the original six-actor symptom was unavailable. The correction is verified against explicit overflowing/fractional geometry and all generated synthetic files, rather than a claimed reproduction of that particular symptom.

Very tall dense blueprints remain difficult to read at whole-page A4 scale. Their complete contents are present, but they require substantial PDF zoom; a PNG viewed at native resolution is more legible. This follows from the retained single-page A4 requirement. The tallest tested PNG was 1672 × 12506 pixels. The existing html-to-image 16384 px canvas dimension cap can reduce resolution proportionally for larger blueprints; that strategy is unchanged. Large captures can also require substantial browser memory. No unlimited-size guarantee or additional export modes were introduced.
