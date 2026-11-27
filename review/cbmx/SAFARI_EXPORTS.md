# Safari/WebKit export clipping correction

Status: **User manually verified Safari PNG/PDF exports, confirmed clipping resolved, and approved the final UI on 27 November 2026.** Safari version was not supplied.

Date: 27 November 2026. Branch: `codex/cbmx-matrix-visual-redesign`.

## Root cause and reproduction

The earlier boundary correction measured the original offscreen DOM correctly, but did not prevent **a second HTML table layout after html-to-image cloned its computed styles**. A larger original capture rectangle could not guarantee that the later SVG contained the same geometry.

This issue is now reproduced with the actual installed **html-to-image 1.11.13** in **Playwright WebKit 26.0**. WebKit reports `0px` computed widths for `col` elements, despite positive rendered column-track widths. The library copies those computed widths into its clone. The fixed-layout table then resolves the cloned spanning-cell widths and border spacing again, producing a wider table inside the SVG foreignObject. Chrome's computed column widths do not exhibit this behaviour.

A controlled comparison loaded the approved checkpoint's capture helper (`dbadeac`) as a temporary synthetic module. An isolated shadow-root diagnostic prevents application styles from contaminating the serialized SVG's layout:

| Six-actor sparse fixture | Measured source table | Serialized clone table | Capture width |
| --- | ---: | ---: | ---: |
| Approved checkpoint helper | 1450 CSS px | **1483 CSS px** | 1466 CSS px |
| Corrected helper | 1450 CSS px | **1450 CSS px** | 1460 CSS px |

The old clone added 33 px, corresponding to the repeated internal spacing across the spanning outcome columns. The old actual PNG visibly cuts the last Benefits block and its text; the corrected PNG includes its end marker, right edge and rounded corners. The retained [edge comparison](evidence/webkit-before-after-edges.png) and source/clone geometry JSON preserve the controlled result; the temporary full negative-control captures were removed after sign-off. In this automated build some fixtures already clip at five actors; the exact first affected count can vary with engine/version/layout. The mechanism reproduces the reported six-actor-and-above failure.

This was **not a PDF placement issue**, a pixel-ratio error, or a missing fixed-width allowance. Both formats used the same already-clipped PNG. Source measurement alone was insufficient because the clone changed layout later.

## Correction

After rendering the existing committed-data export presentation and waiting for fonts, the capture helper records the physical bounds of the table and every cell. Only this disposable offscreen copy is then frozen:

- The table becomes a positioned block with its measured width and height.
- Column groups are hidden and row wrappers use `display: contents`.
- Each cell becomes a positioned block at its measured fractional coordinates, with its measured dimensions and border-box sizing. Padding/borders are included once.
- The original backgrounds, content, wrapping space, icons and rounded blocks are retained. html-to-image can still copy styles/embed fonts/build the SVG/rasterize, but it cannot perform another HTML table layout.
- The complete descendant extent is still checked and final capture dimensions rounded upward.

This is browser independent: no user-agent detection, actor-specific compensation, retries or library replacement/upgrade. Fractional geometry is retained rather than accumulated through a fresh column calculation. The original editor DOM and CSS are not changed.

The export receives an explicit **5 CSS px white outer frame on every side**, added outside the complete measured matrix. Its existing 3 px table edge spacing is preserved, so the painted blueprint has approximately **8 CSS px** of visible white gutter. At the retained 2× PNG strategy, all tested images have 16 px left/top/right clearance and 16–18 px bottom clearance; the possible extra bottom pixel in CSS space comes from rounding the image height upward. The table's own width is unchanged; the frame does not consume modelling space.

The single-page landscape A4 PDF helper and proportional fitting are unchanged. The frame is part of the embedded image for both formats. Any extra A4 page space remains the existing consequence of aspect-ratio fitting.

## Browser and file verification

| Browser/engine | Actual verification | Result |
| --- | --- | --- |
| Installed Google Chrome, headless, version 158.0.8127.37 | Actual DOM cloning, SVG rasterization, PNG and PDF generation | **29 pairs passed** |
| Playwright WebKit 26.0 | Actual WebKit DOM/cloning/SVG/canvas; negative control reproduced clipping | **29 corrected pairs passed** |
| Installed Safari | Native automation was unavailable during investigation; the user subsequently verified actual Safari PNG/PDF exports | **User confirmed resolved and approved** |
| Playwright Firefox 146.0.1 engine | Two isolated launch attempts stalled before the first fixture; terminated only the test processes | **No Firefox export verification claimed** |

Each successful engine ran every actor count 2–10 with empty, sparse and dense synthetic blueprints (27 cases), plus dense 6- and 10-actor read-only/help-expanded/scrolled cases at a different viewport/device scale. Base cases used 1280 × 900 and DPR 2; variants used 1440 × 900 and DPR 1. PNG output remained 2× in both. Non-empty fixtures contain long last-actor Benefits, a long Scenario and multiple modelling items.

All **58 actual PNG/PDF pairs** were decoded/parsed. Every PDF page was rendered with Poppler and overview sheets were visually inspected. Native PNG edge details were inspected. Checks explicitly cover:

- Source and serialized clone table widths are equal; table/descendant right and bottom extents plus the frame fit in the capture.
- No editing controls, contextual help or scroll container occurs in the export clone.
- The source editor markup is unchanged by capture.
- Five actors fit at 1280 px; the 174 px editor label width and 22 px indentation are unchanged.
- Every PNG has a complete, nearly uniform white perimeter; every PDF has exactly one proportional image, fully inside one landscape A4 page.

All four representative Chrome image dimensions match the approved pre-correction geometry after accounting for the changed frame. This is not a bitwise pixel-equivalence claim: freezing measured fractional cell positions can change subpixel text rasterization compared with reflowing the clone. No font-size or palette changes were made, and the matrix's measured dimensions are retained. Cross-engine text metrics/row heights can differ naturally.

## Automated checks and regression coverage

- `npm test`: **232 tests: 231 pass, 0 ordinary failures, 1 existing known-failing autosave TODO**. That pre-existing TODO and autosave implementation were not changed in this task.
- Focused export suite: **31 pass**. Existing 2–10 actor fractional-boundary cases now assert frozen cell positions/sizes and border-box sizing, and a new test verifies a uniform frame outside the unchanged matrix width.
- `review/cbmx/verify-browser-exports.mjs`: actual-engine regressions assert that the serialized clone does not widen, that right/bottom extents fit with the frame, that source DOM is unchanged and that output retains 2× resolution. The width assertion fails for the checkpoint WebKit negative control above. It restricts HTTP requests to the synthetic loopback preview.
- Separate TypeScript checks: passed.
- Production build: passed; existing chunk-size advisory remains.
- Lint: **39 errors, 4 warnings**, unchanged.
- `git diff --check`: passed.

The Node/happy-dom capture tests mock the rasterizer and do **not** establish Safari rendering correctness. The 58 browser cases use real browser engines and the actual library; Playwright WebKit is still **not the installed Safari application**. The subsequent actual Safari sign-off is user-reported, separate from those automated results. No Firefox pass is inferred.

## Safari/WebKit compatibility research

The pinned [1.11.13 README](https://github.com/bubkoo/html-to-image/blob/v1.11.13/README.md#how-it-works) documents computed-style cloning followed by SVG foreignObject and canvas rendering. Its browser support statement is not a guarantee that post-clone table geometry matches the original.

Related reports were reviewed, without treating them as proof of this defect:

- [Issue 488](https://github.com/bubkoo/html-to-image/issues/488) concerns blank/incomplete Safari images and canvas/decode limitations, including reports for 1.11.13. Repeated image draws would not correct the deterministic table expansion reproduced here, so no such workaround was added.
- [Issue 516](https://github.com/bubkoo/html-to-image/issues/516) concerns stylesheet/font parsing regressions in 1.11.13; that error did not occur in this reproduction.
- [WebKit bug 280852](https://bugs.webkit.org/show_bug.cgi?id=280852) documents fixed-table relayout/invalidation differences. It is related context, not an assertion that this is the identical upstream bug.

The repository's newer development documentation describes APIs beyond the installed version; those APIs were not assumed available. The package and lockfile remain unchanged at 1.11.13.

## Manual Safari verification and diagnostics

1. Use the current development branch. If the isolated preview is not already running, run `npm run review:cbmx`. Open **http://127.0.0.1:5176/** in Safari. This preview loads no authentication client or environment file and uses no database.
2. Test 5, then 6–10 actors. Start with sparse, then dense and empty fixtures. Press **Capture PNG and PDF** and wait for **Capture complete**.
3. Download/open the PNG and generated PDF using the existing links beneath the preview image. Inspect the complete last Benefits column, its end marker/background/corners, and the bottom Scenario including `END SERVICE SCENARIO`. Check the white frame on all sides at high zoom.
4. Repeat with help expanded/collapsed, **Scroll workspace**, **Toggle read-only**, and different window widths. Repeat a first export after reloading the page, not just subsequent captures.
5. After capture completes, click **Download export diagnostics**. This button exists only in the synthetic preview, not in the application editor. The JSON contains browser user-agent, device pixel ratio, viewport/scale, original and serialized clone bounds, column/cell sizing and output image dimensions. It does not contain the blueprint text or transmit anything to a service. A WebKit download test verified this control; use the freshly downloaded JSON when collecting a new diagnostic.
6. Record Safari's actual version from **Safari → About Safari**, macOS version, browser zoom, actor count/density and whether this was the first capture after reload. The user-agent alone is not a reliable substitute for the actual Safari version.
7. If clipping remains, retain the diagnostic JSON, the actual PNG/PDF and an image showing the affected edge. Also note any Web Inspector console errors. If the synthetic fixture passes but a real blueprint fails, record that distinction and collect the failing export files separately; No backend changes are needed to collect synthetic diagnostics.

For a real editor export that cannot be reproduced in the preview, the current fix leaves an offscreen `.cbmx-matrix--export` node briefly during capture. A Safari Web Inspector **subtree-modification breakpoint on `document.body`** can pause when it is added. Continue once to allow font completion/layout, then inspect its table display/width and final cell positions; the corrected table should be `display: block`, with positioned cells. Avoid changing styles or viewport while diagnosing. The preview's downloadable post-clone measurements are preferable because a source-only inspection cannot prove SVG raster bounds.

Firefox can be checked manually in the same preview. Do not interpret the unavailable automated Firefox run as a verified pass.

## Changed files and retained scope

Production change:

- `src/components/cbmx/cbmxExport.ts` — measured export-cell freeze and explicit outer frame. The PDF helper is unchanged.

Tests/tooling/documentation:

- `tests/cbmxExport.test.mjs` — frozen-geometry checks, updated frame expectations and a new frame regression.
- `review/cbmx/exportDiagnostics.js` — detailed style/environment metrics and isolated shadow-root clone measurement, avoiding external CSS contamination.
- `review/cbmx/main.jsx` — synthetic-only diagnostic download and compact diagnostic display.
- `review/cbmx/verify-browser-exports.mjs` — new actual-browser regression runner; Playwright is supplied externally, not added to app dependencies.
- `review/cbmx/inspect-browser-exports.py` — new PNG edge/PDF geometry/rendering checks.
- `review/cbmx/SAFARI_EXPORTS.md` — this report and diagnostic instructions.
- `review/cbmx/README.md` — link to this report.

Pre-existing uncommitted Phase 5 work (including `tests/processEditing.test.mjs`, its TODO, release tests and reports) was preserved. No interactive CSS/layout, item management, persistence, permissions, PCB logic, dependency manifests, deployment configuration or database objects/data were changed. No push, merge or deployment was performed.

## Evidence and remaining limits

Bulk generated captures and temporary modules were removed after user sign-off. The compact [retained evidence](evidence/README.md) includes:

- [Before/after WebKit edge comparison](evidence/webkit-before-after-edges.png).
- [58-case browser verification summary](evidence/browser-verification.json).
- [Original clone geometry](evidence/webkit-before-geometry.json) and [corrected geometry](evidence/webkit-after-geometry.json).
- Corrected six-actor [WebKit PNG](evidence/webkit-6-sparse.png) / [PDF](evidence/webkit-6-sparse.pdf) and [Chrome PNG](evidence/chrome-6-sparse.png) / [PDF](evidence/chrome-6-sparse.pdf).

The reusable browser runner and inspector can regenerate the complete output matrix; see [the tool guide](README.md). The superseded one-off inspector and temporary legacy modules were removed. Final Node 20 results are in [release readiness](RELEASE_READINESS.md).

Actual Safari confirmation is now complete: the user reported PNG and PDF clipping resolved and approved the UI. The user also temporarily accepted the documented pre-existing autosave risk for this UI release; the implementation and TODO remain unchanged. Older Safari/iOS builds, font metrics and canvas memory limits can differ from Playwright WebKit. Very tall blueprints retain the existing canvas-dimension/resolution limits and dense single-page A4 legibility limitations. No attempt was made to solve the separate autosave issue or change the image capture library.
