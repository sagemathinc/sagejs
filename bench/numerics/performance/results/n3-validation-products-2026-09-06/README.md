# Independent reconstruction-row opportunity

Local development evidence only. Public LU/QR/Cholesky dispatch and validation
remain unchanged. The [raw receipt](local.json) binds the two mathematical
sources, generated core/addon and native cache identity; the reproduction
script is `../../validation-products.cjs`.

The private `reconstruction_row` kernel computes separately rounded binary64
products and reuses the source-transparent partials sum previously housed in
statistics. It does not share LU elimination arithmetic, use a backend's
success flag as a proof, or substitute a BLAS reduction for `math.fsum`.
The summation source now lives in numerical core, avoiding an import of the
statistics API from linear algebra. Historical receipts retain their original
source paths and are not relabeled as current qualification.

| Square product | Native median | Generated JS median |
| --- | ---: | ---: |
| 16 | 0.163 ms | 5.60 ms |
| 32 | 0.681 ms | 39.2 ms |
| 64 | 4.55 ms | 323 ms |

Each sample computes all rows with reused Float64Array arguments and ordinary
wrapper marshalling. Three warmups precede seven alternating-order sample
blocks. Initial buffer allocation, DenseMatrix construction, norms, diagnostic
construction, and public solver calls are excluded. This is neither a public
speedup claim nor an N3 target pass. No remote performance jobs were run while
the release lane reserved the persistent hosts.

The focused corpus compares ordinary CPython source with `math.fsum` of
separately rounded products, generated JS, native Node, and emitted Wasm.
It includes rectangular/empty-inner shapes, cancellation, half-even-sensitive
sums, subnormals, nonfinite rejection, intermediate overflow, storage bounds,
input preservation and output sentinels. Real Chromium, Firefox and WebKit
workers pass the same finite corpus. A deliberately rounded-product example
guards against silently replacing the product-plus-sum semantics with FMA.

The kernel admits at most 128 columns and 128 terms per dot, with no callbacks
inside a row. Its writable storage is private and must be discarded on failure.
Public integration still needs an explicit cancellation contract: the existing
validator checks at every cell, so it cannot simply replace that path with one
row call and silently remove observable callbacks. Default selection, public
end-to-end timing, four-host qualification and package qualification remain open.

## Shared-sum relocation: public browser regression check

The rebuilt lazy bundle contains 411 modules and eight dynamic programs.
The [source-browser record](statistics-browser.json) retains the prepared
statistics query samples and source/pack hashes after moving the shared sum.
Chromium, Firefox and WebKit each passed disabled, floating, stale and missing
pack routes, checking ownership, exactness, budgets, fallback and recovery.
These twelve routes qualify this local source integration, not a deployed
website, npm/SEA release or the new dense row kernel's public integration.
Their timings are not a paired speedup comparison. All 116 local portable
files also pass after correcting the floating-only Wasm admission guard.
