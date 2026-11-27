# Cumulative release file inventory

Reviewed against `main` / fetched `origin/main` at `3282e31cc191b30432a463fd6809ca1eb51d86b3` on 27 November 2026. The final checkpoint is identified by local tag `cbmx-ui-redesign-rc-20261127`; no merge, push or deployment is included.

**51 changed paths**: A = added, M = modified, D = removed. The reference images/PDFs are intentional documentation assets, not production bundle input.

| Status | Path |
| --- | --- |
| M | [.gitignore](../../.gitignore) |
| M | [package.json](../../package.json) |
| A | [review/cbmx/CHANGESET.md](../../review/cbmx/CHANGESET.md) |
| A | [review/cbmx/EXPORT_EDGES.md](../../review/cbmx/EXPORT_EDGES.md) |
| A | [review/cbmx/MANUAL_TEST_PLAN.md](../../review/cbmx/MANUAL_TEST_PLAN.md) |
| A | [review/cbmx/PHASE3.md](../../review/cbmx/PHASE3.md) |
| A | [review/cbmx/PHASE4.md](../../review/cbmx/PHASE4.md) |
| A | [review/cbmx/README.md](../../review/cbmx/README.md) |
| A | [review/cbmx/REFINEMENTS.md](../../review/cbmx/REFINEMENTS.md) |
| A | [review/cbmx/RELEASE_READINESS.md](../../review/cbmx/RELEASE_READINESS.md) |
| A | [review/cbmx/SAFARI_EXPORTS.md](../../review/cbmx/SAFARI_EXPORTS.md) |
| A | [review/cbmx/evidence/README.md](../../review/cbmx/evidence/README.md) |
| A | [review/cbmx/evidence/browser-verification.json](../../review/cbmx/evidence/browser-verification.json) |
| A | [review/cbmx/evidence/chrome-6-sparse.pdf](../../review/cbmx/evidence/chrome-6-sparse.pdf) |
| A | [review/cbmx/evidence/chrome-6-sparse.png](../../review/cbmx/evidence/chrome-6-sparse.png) |
| A | [review/cbmx/evidence/five-actor-fit-1280.jpg](../../review/cbmx/evidence/five-actor-fit-1280.jpg) |
| A | [review/cbmx/evidence/release-checks.json](../../review/cbmx/evidence/release-checks.json) |
| A | [review/cbmx/evidence/webkit-6-sparse.pdf](../../review/cbmx/evidence/webkit-6-sparse.pdf) |
| A | [review/cbmx/evidence/webkit-6-sparse.png](../../review/cbmx/evidence/webkit-6-sparse.png) |
| A | [review/cbmx/evidence/webkit-after-geometry.json](../../review/cbmx/evidence/webkit-after-geometry.json) |
| A | [review/cbmx/evidence/webkit-before-after-edges.png](../../review/cbmx/evidence/webkit-before-after-edges.png) |
| A | [review/cbmx/evidence/webkit-before-geometry.json](../../review/cbmx/evidence/webkit-before-geometry.json) |
| A | [review/cbmx/exportDiagnostics.js](../../review/cbmx/exportDiagnostics.js) |
| A | [review/cbmx/fixtures.js](../../review/cbmx/fixtures.js) |
| A | [review/cbmx/index.html](../../review/cbmx/index.html) |
| A | [review/cbmx/inspect-browser-exports.py](../../review/cbmx/inspect-browser-exports.py) |
| A | [review/cbmx/main.jsx](../../review/cbmx/main.jsx) |
| A | [review/cbmx/preview.css](../../review/cbmx/preview.css) |
| A | [review/cbmx/server.mjs](../../review/cbmx/server.mjs) |
| A | [review/cbmx/verify-browser-exports.mjs](../../review/cbmx/verify-browser-exports.mjs) |
| M | [src/components/cbmx/CBMXTable.tsx](../../src/components/cbmx/CBMXTable.tsx) |
| A | [src/components/cbmx/cbmx.css](../../src/components/cbmx/cbmx.css) |
| A | [src/components/cbmx/cbmxExport.ts](../../src/components/cbmx/cbmxExport.ts) |
| M | [src/components/cbmx/cbmxMutators.ts](../../src/components/cbmx/cbmxMutators.ts) |
| M | [src/components/cbmx/styles.ts](../../src/components/cbmx/styles.ts) |
| A | [src/components/cbmx/ui/CBMXActionIcon.tsx](../../src/components/cbmx/ui/CBMXActionIcon.tsx) |
| A | [src/components/cbmx/ui/CBMXEditorToolbar.tsx](../../src/components/cbmx/ui/CBMXEditorToolbar.tsx) |
| A | [src/components/cbmx/ui/CBMXRowIcon.tsx](../../src/components/cbmx/ui/CBMXRowIcon.tsx) |
| A | [src/components/cbmx/ui/CBMXValidationPanel.tsx](../../src/components/cbmx/ui/CBMXValidationPanel.tsx) |
| M | [src/components/cbmx/ui/EditableProcess.tsx](../../src/components/cbmx/ui/EditableProcess.tsx) |
| M | [src/components/cbmx/ui/EditableText.tsx](../../src/components/cbmx/ui/EditableText.tsx) |
| A | [src/components/cbmx/ui/ItemList.tsx](../../src/components/cbmx/ui/ItemList.tsx) |
| D | `src/components/cbmx/ui/SlotStack.tsx` |
| M | [src/pages/EditorPage.tsx](../../src/pages/EditorPage.tsx) |
| M | [tests/adminDashboard.test.mjs](../../tests/adminDashboard.test.mjs) |
| A | [tests/cbmxEditing.test.mjs](../../tests/cbmxEditing.test.mjs) |
| A | [tests/cbmxExport.test.mjs](../../tests/cbmxExport.test.mjs) |
| A | [tests/cbmxItems.test.mjs](../../tests/cbmxItems.test.mjs) |
| A | [tests/cbmxPresentation.test.mjs](../../tests/cbmxPresentation.test.mjs) |
| A | [tests/cbmxRelease.test.mjs](../../tests/cbmxRelease.test.mjs) |
| M | [tests/processEditing.test.mjs](../../tests/processEditing.test.mjs) |

The cumulative change removes the obsolete `SlotStack` component. Final housekeeping also removes `review/cbmx/inspect-export-artifacts.py` from the earlier branch checkpoint; that temporary inspector never existed on main, so it is absent from this net inventory. Regenerable bulk verification output was untracked and is likewise absent. The reusable preview, synthetic fixtures, diagnostics, browser runner, generic PNG/PDF inspector, tests and compact reference evidence are retained.

Production source paths are limited to the CBMX component tree and `src/pages/EditorPage.tsx`. `package.json` adds only the developer preview command; application dependencies and lockfile are unchanged. Database migrations, RPC definitions, RLS policies, Process Canvas code, persistence adapters, auth, environment configuration and deployment workflows are unchanged. See [release readiness](RELEASE_READINESS.md) for scope, checks, the accepted R1 exception and release/rollback procedures.
