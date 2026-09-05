# Validation overflow qualification

The correction at `0f3f7472a` rejects overflowed normalization instead of
reporting zero relative error for a wrong factorization. It covers LU, QR,
Cholesky, backward-error, stationarity and row-space checks. Independently
computed zero solve residuals retain their existing behavior. Extended-range
scaled validation is not implemented by this correction.

All four persistent hosts pass the CPython and dynamic Sage.js regression,
including the guard against incidental exact-library loading. The selected
3,095-file source/runtime snapshot is identical before and after each run:

`7243c402f6db6270a5b33fd2cbde3c0cd7b531dcaefc833501ce774dc82752d2`

The collector records its digest and refuses existing receipt paths:

```sh
node bench/numerics/performance/prepared-api-portable.cjs receipt.json --validation
```

These isolated source witnesses are not full product builds, npm/SEA tests,
performance qualification or a release. Prior qualification bundles and receipts
were preserved. The ordinary dense corpus, Node 22.22.2 regression, strict Python
(376 modules) and architecture checks also passed locally for this source.

`browsers.json` retains the source-browser witness for Chromium, Firefox and
WebKit, each with disabled, enabled, stale and missing optional floating packs.
All twelve routes passed, including the overflow regression and recovery. The
embedded root timing samples are development observations, not a paired speedup
claim. Exact Wasm assets were reused; this is not a rebuilt release artifact.

The initial harness expected the old stdout and then a combined-fixture WebKit
run failed an unlabeled assertion. Separate, filename-labeled fixture evaluations
passed on WebKit and the full matrix. The cause of that combined-fixture assertion
is not established; this evidence must not be described as fixing a WebKit bug.
