# Isolated floating-pack portability

Identical source-hashed loader, exercise, manifest and Wasm bytes pass on all
four persistent hosts. The collector verifies the unchanged bundle before and
after execution and refuses to overwrite a receipt. The exercise is shared
with the Node/browser pack test, not reimplemented for remote qualification.

| Platform | Node | Status |
| --- | --- | --- |
| Linux x64 | 26.5.1 | passed |
| Linux ARM64 | 26.5.1 | passed |
| macOS ARM64 | 26.8.1 | passed |
| Windows x64 | 26.5.1 | passed |

Each checks cancellation-sensitive summation, source binding, digest rejection,
unavailable-pack fallback, stable signed-zero ordering, rejected nonfinite
sorting, boxed values without conversion hooks, and stable Wasm memory capacity
over 1,000 repeated small calls. The remote runs need no compiler, package
manager, FLINT or full checkout. Files record the exact bytes and collector hash.

These are **isolated pack/loader receipts**, not full public API, npm/SEA,
minimum-Node, cold-start, peak-RSS or release qualification. Small-call stable
capacity is not proof of bounded memory for arbitrary sustained workloads.
The three-browser public API and timing evidence lives in the adjacent
`n2-browser-transfers-2026-09-05` directory. Transfer source was `aa085f09e`;
this commit adds the reusable collector and shared exercise without changing
that loader or mathematical pack.
