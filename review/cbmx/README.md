# CBMX synthetic preview and release documentation

The UI redesign and corrected Safari PNG/PDF exports have been approved by the user. See [release readiness and procedures](RELEASE_READINESS.md), [the remaining authenticated test plan](MANUAL_TEST_PLAN.md), and [the Safari investigation and manual sign-off](SAFARI_EXPORTS.md).

## Database-free preview

From the repository root with dependencies installed, run `npm run review:cbmx`, then open http://127.0.0.1:5176/. Stop it with Ctrl+C. The historical Phase 4 preview banner remains unchanged.

The isolated Vite entry point disables application configuration/environment-file loading, imports the CBMX renderer directly, binds to loopback, and uses generated in-memory fixtures. It loads no auth or database client.

- Choose any actor count 2–10 and empty/sparse/dense fixtures. Resetting a fixture discards synthetic edits.
- Test direct editing, keyboard interactions, compact Add/removal controls, read-only mode, contextual help and scrolling.
- Use **Capture PNG and PDF** to exercise the production capture helpers against committed in-memory data. Download links appear beneath the generated image.
- After capture completes, use **Download export diagnostics** for browser/device scale, source/clone bounds and image dimensions. Diagnostics contain geometry, not the blueprint narrative.
- Toolbar menu and PCB navigation/deletion callbacks are synthetic illustrations. Real persistence, permissions and link/deletion workflows are covered separately by mocked tests and the authenticated test plan.

## Reusable checks

Run `npm test`, `npx tsc -b`, `npm run lint` and `npm run build` with Node 20. The retained pre-existing autosave TODO intentionally fails its desired-behaviour assertion; the user has temporarily accepted that risk for this UI release. Keep it visible and do not treat the test runner's zero exit alone as proof that autosave is reliable.

`verify-browser-exports.mjs` accepts an externally installed Playwright module, keeping browser tooling outside application dependencies. Start the synthetic preview first. Example:

```sh
PLAYWRIGHT_BROWSERS_PATH=/path/to/test-browsers node review/cbmx/verify-browser-exports.mjs \
  --playwright=/path/to/tools/node_modules/playwright/index.mjs --engine=webkit
```

The runner restricts HTTP requests to the preview, checks every 2–10 actor/density combination, and writes regenerable files to ignored `output/cbmx-safari-review/`. Optional flags include `--engine=chromium` (installed Chrome channel), `--engine=firefox`, `--counts=6,10`, `--densities=dense`, `--variant=readonly-help-scrolled`, `--viewport=1440`, `--dpr=1`, and `--out=...`.

`inspect-browser-exports.py` checks the resulting PNG margins/extents, single-page landscape A4 placement and aspect ratio, then renders PDF pages/contact sheets. It needs Pillow, pypdf and Poppler in a separate tool environment:

```sh
python3 review/cbmx/inspect-browser-exports.py output/cbmx-safari-review
```

Bulk captures, temporary legacy modules and scratch manifests were removed at finalization. A compact, intentional [reference evidence set](evidence/README.md) remains. Historical implementation records are [Phase 3](PHASE3.md), [Phase 3 refinements](REFINEMENTS.md), [Phase 4](PHASE4.md), and [the earlier export-boundary investigation](EXPORT_EDGES.md). Their historical generated file names do not imply those disposable outputs are retained.
