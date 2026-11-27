# Remaining authenticated integration and release checks

Status: **not executed**. This is a plan for an explicitly authorized, disposable authenticated test backend. Phase 5 used synthetic browser fixtures, mocked services and isolated in-memory PostgreSQL fixtures only. No production accounts, data, RPC definitions, policies, configuration or deployment were changed.

## Entry gates and preparation

The user has approved the UI and successful actual Safari PNG/PDF verification and has explicitly accepted R1 temporarily for this UI release. Retain its known-failing TODO without changing the assertion or implementation. R1 remediation and removal of its TODO status belong to the separate autosave task; they are not prerequisites imposed again for this approved UI release. See [release readiness](RELEASE_READINESS.md).

Final Node 20 checks are recorded in release readiness. Repeat them if the code or main branch changes. Before authorized integration work, record the approved commit/build identifier and the actual current deployment identifier. Use the existing application configuration for a designated test environment. A backend owner should confirm that its installed migrations and function contracts match the repository; this plan does not authorize applying migrations or changing policies. Use disposable synthetic artefacts, an owner, an editor, a viewer, an unrelated account, an administrator without membership, and a separate administrator with ordinary membership. Use two independent browser profiles for concurrency checks. Never use real user data as a fixture.

Record pass/fail, account role, CBMX/PCB fixture IDs, browser/version, viewport/zoom, observed version numbers and screenshots. Retain exported test files. Any account/fixture creation and later cleanup requires the separate test-backend authorization.

## Management, JSON and modelling

1. Create a CBMX through the actual dashboard. Confirm exactly five actors in order A1–A5, Customer then Orchestrator then three Other actors; blank Service Scenario and a process referring to all five. Refresh and reopen from the dashboard.
2. Rename through the toolbar. Verify autosave after the existing delay, dashboard canonical name, refresh/reopen, owner namespace uniqueness and a duplicate-name retry. Include spaces, Unicode, `%`, `_` and backslash in synthetic names. Do not introduce a manual save button.
3. Import a saved legacy JSON without `serviceScenario`, with blank legacy records, duplicate item descriptions/ranks and extra unrelated extension fields. Verify no write merely on loading. Export JSON and reimport it; preserve extension data and existing process identities. Newly introduced process IDs must be regenerated as designed.
4. Reject invalid JSON and missing actors. Import an otherwise valid blueprint with a blocking Scenario type error; confirm the error is accessible in validation and no save occurs. Separately characterize malformed nested actor/service/process shapes: the unchanged validators are not a full JSON-schema boundary. Record any uncaught exception as an existing validation defect rather than silently claiming full malformed-input coverage.
5. Edit each scalar field, all four categories and both costs/benefits, KPIs/ranks, services/operations, and process names/participants. Add duplicate values and remove the second duplicate after intervening blank records. Confirm only the intended source item changes after refresh.
6. Cancel empty and populated additions, including Escape. Confirm no blank model record or server version increment. Check stale list drafts after another list revision, and that an unrelated list edit preserves the active draft.
7. Grow to 10 actors, reject an eleventh, protect the first two actors from removal, remove an Other actor and verify participant cleanup and stable remaining order. Check the two-actor minimum and new actor IDs after a removal.
8. Check Enter activation, single-line Enter save, Escape cancel, multiline newline and Ctrl/Cmd+Enter save, IME composition/repeated keys and focus restoration in the actual browser. Confirm no save-on-blur.

## Autosave and collaboration

9. Verify ordinary owner/editor saves, no writes for viewers/admin-only readers, blocking-error suppression, and version increments. Save an item while retaining unrelated narrative, actor, process, service and extension data.
10. **R1 follow-up (accepted UI-release exception):** throttle/delay the save response. Commit a second name or modelling edit while the first request is pending; let that response complete. The second edit must remain present and subsequently be saved exactly once. Repeat with the second edit arriving after the debounce timer fires while busy. Check the unique-name retry path too. The current implementation fails the deterministic offline name case.
11. In two profiles, save concurrent modifications against the same version. Verify that stale ordinary saves cannot overwrite newer server data and follow the existing reload behaviour. Warn testers that this existing path discards the stale local draft; capture any needed synthetic work first.
12. Disconnect/reconnect the network during autosave and revoke edit access before a save. Verify server data stays unchanged on failure, pending local content/status remains accurate, and any retry behaviour is understood. The existing silent failure path and absence of an explicit retry are known debt; do not assume an automatic retry was verified.

## Independent CBMX and Process Canvas permissions

| CBMX access | Linked PCB access | Expected result |
| --- | --- | --- |
| Owner/editor | Owner/editor | Existing PCB creation/link/replacement/relink/unlink actions are available, with server rechecks. |
| Owner/editor | Viewer | PCB opens read-only; association mutation is refused. |
| Owner/editor | None | No protected PCB name or navigation target is disclosed; association mutation is refused. |
| Viewer | Owner/editor | CBMX stays read-only; authorized PCB opens in its independently permitted editing mode. |
| Viewer | Viewer | Both open read-only; no CBMX mutation/import/link management. |
| Viewer | None | No PCB navigation/name disclosure. |
| Admin without ordinary membership | None/any ordinary membership | Administrative artefact reads require current backend capability; viewing alone must not grant edit/link/delete rights. PCB destination independently resolves ordinary or administrative access. |

13. Exercise direct URLs, refresh, Back navigation, account switching, sign-out, membership removal and administrator capability revocation. Ensure stale responses never restore another account's content. URL/state role flags must grant no access.
14. Through the authorized test backend, attempt the corresponding unauthorized save/link/delete requests directly as viewer/unrelated/anonymous accounts. UI hiding alone is insufficient. Verify actual RLS/function enforcement and absence of protected PCB names in responses and files.
15. Create a PCB from a process; link an existing eligible PCB; replace with a new PCB; relink to a different eligible PCB; unlink. Verify the expected current association, global uniqueness, versions and unchanged PCB content. Test an eligible PCB being claimed or permissions being revoked after the chooser opens.
16. Delete an unlinked process. For a linked process, cancel then confirm the specialized dialog; preserve its PCB and unrelated content. Change the association/version/access while confirmation is open. Confirm rejection/rollback, preserved draft, paused autosave on stale deletion, and explicit reload recovery. Confirm blank Rename never deletes a process and recreated processes cannot inherit an orphaned link.

## Browser, visuals and exports

17. Repeat representative empty/sparse/dense 2–10 actor cases on the supported Chrome/Chromium, Safari and Firefox versions at 100% zoom. Test 1280, 1440 and 1920 px viewports; collapsed and expanded help; editing, viewing and administrative routes. Confirm the 174 px label column, 22 px category indentation, compact plus controls, wrapping and alignment. Check actual Process Canvas presentation and interactions after navigating from CBMX; its source was unchanged, but Phase 5 did not perform an authenticated visual smoke test.
18. Export all actor counts, especially 6–10. Include long last-actor Benefits and long Scenario text, different scroll positions, help states and an active unsaved field draft. Inspect actual PNGs and rendered PDFs. Expect no controls/help/scrollbars/placeholders/clipping, retained authorized PCB names, excluded unsaved field drafts, unchanged PNG strategy, one proportionally fitted landscape A4 PDF page. Inspect at high zoom and record dense A4 legibility separately from completeness.
19. Perform a screen-reader and keyboard-only smoke test, including validation expansion, all messages, menus, inline errors and focus after item changes. Phase 5 is not a complete WCAG audit or touch-device certification.

## Exit gate

Require the recorded Node 20 frontend/build/TypeScript checks with no new failures or lint findings, the completed Safari sign-off, and the remaining essential authenticated staging smoke checks. The single existing R1 TODO remains an explicitly accepted temporary exception; preserve it and schedule its separate follow-up. The fuller matrix above documents additional coverage rather than claiming those live checks have already run. Document accepted existing debt. Obtain explicit approval covering the merge, push and the resulting deployment before a main-branch push: the existing workflow deploys automatically on pushes to main.
