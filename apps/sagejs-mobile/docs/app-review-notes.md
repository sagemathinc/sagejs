# Draft App Review notes

Sage.js is an educational, offline computational mathematics and programming
environment. The application bundles its Sage/Python compiler, exact
mathematical engine, WebAssembly modules, examples, and user interface in the
submitted binary. It does not download executable plugins or use a remote
server to complete computations.

Users type, inspect, edit, save, import, and explicitly execute visible Sage
source. Imported or downloaded examples remain ordinary visible text and are
never executed automatically. This is the educational programming-environment
use case described by App Review Guideline 2.5.2, not an application mechanism
for changing the app's features after review.

Computations execute in a bundled `WKWebView` worker so the interface remains
responsive. The application can terminate and reconstruct that worker for
interrupts, timeouts, lifecycle transitions, or recovery. The worker has no
credentialed origin and no privileged native object. The versioned native
message allowlist supports only document autosave, explicit share/export,
lifecycle, status, interruption, and reset. A random per-session capability
prevents evaluated worker code from forging native messages. There is no
generic JavaScript/native bridge, shell, arbitrary filesystem API, downloaded
binary, or plugin loader.

Meaningful native integration includes Files/iCloud document workflows, recent
worksheets and crash recovery, share sheets for source/plot data, iPad split
layout, hardware-keyboard execution, accessibility labels/live regions,
appearance/resource settings, and offline operation.

Suggested review steps:

1. Open the bundled BSD example.
2. Press Run (or Command+Enter on a hardware keyboard).
3. Observe exact output or a plot, then press Interrupt during a longer input.
4. Export the worksheet to Files and import it again.
5. Enable airplane mode and repeat the evaluation.

Before TestFlight submission, replace this draft with exact version, artifact
identity, supported devices, reviewer contact, and a link to visible source
licenses. Request early App Review consultation; approval is a release risk and
is not inferred from technical completion.
