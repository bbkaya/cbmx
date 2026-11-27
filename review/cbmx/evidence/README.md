# Retained release evidence

This small, intentional documentation set replaces approximately 591 MB of disposable capture/render output. It is not imported by the production application. The synthetic preview and browser regression tools can regenerate the complete matrix.

- [Safari/WebKit before-and-after edge comparison](webkit-before-after-edges.png).
- [Corrected six-actor WebKit PNG](webkit-6-sparse.png) and [PDF](webkit-6-sparse.pdf).
- [Corrected six-actor Chrome PNG](chrome-6-sparse.png) and [PDF](chrome-6-sparse.pdf).
- [Five-actor editor fit at 1280 px](five-actor-fit-1280.jpg).
- [Source/clone geometry before the correction](webkit-before-geometry.json) and [after it](webkit-after-geometry.json).
- [Summary of all 58 successful real-engine browser cases](browser-verification.json).
- [Final Node 20 verification](release-checks.json) records the final Node 20 verification and accepted exceptions.

Automated browser evidence is from headless installed Chrome 158.0.8127.37 and Playwright WebKit 26.0, not the installed Safari application. The user subsequently confirmed actual Safari PNG and PDF clipping is resolved and approved the final UI on 27 November 2026. The Safari version was not supplied; it has not been invented here. Automated Firefox did not initialize and is not claimed as a pass.

The pre-existing autosave race and its desired-behaviour TODO remain unchanged. The user explicitly accepted that existing risk temporarily for this UI release. Full procedures and remaining essential checks are in [release readiness](../RELEASE_READINESS.md).
