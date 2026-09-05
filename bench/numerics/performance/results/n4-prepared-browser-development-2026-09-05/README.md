# Public prepared roots in browsers

The public prepared-function and root fixtures pass in real Chromium, Firefox
and WebKit workers with the optional pack enabled, disabled, stale and missing
(12 configurations). The existing public prepared-statistics fixture also
passes those 12 configurations with the expanded pack. Root checks include
independent validation, forged-success rejection, ownership, changed parameters,
budgets, unsupported-expression fallback and session recovery.

Run from a source-current built workspace:

```sh
SAGEJS_NUMERICAL_BROWSER_TESTS=1 \
SAGEJS_NUMERICAL_BROWSER_WORKLOAD=evaluators \
SAGEJS_NUMERICAL_BROWSER_MEASUREMENTS=/absolute/new/report.json \
node --test test/numerics/performance/prepared-browser.cjs
```

The report refuses an existing output path. Omit the workload variable to run
the statistics regression. The witness validates the current lazy module bundle,
rebuilds the compiler frontend and floating pack, and uses existing exact Wasm
assets. It does **not** constitute a new product or release build.

The saved `browsers.json` contains seven measured batches after three warmups,
alternating route order. Each batch contains 20 complete public roots with
alternating parameters 2 and 3. Required independent validation and result
construction are included; expression preparation is separate. Plan inspection
is outside the timed region. Serialization, rendering, cold session startup
and peak memory are not measured. The key `native` denotes the requested
backend; the recorded actual execution target is `wasm` in every engine.

| Engine | Wasm ms/root | Dynamic ms/root |
| --- | ---: | ---: |
| Chromium | 3.66 | 15.74 |
| Firefox | 5.84 | 19.71 |
| WebKit | 5.61 | 17.97 |

These are local development medians, not frozen cross-platform performance
qualification or a matched SciPy comparison. The 1 ms scalar-root ambition
remains open. A separate instrumented local experiment points to substantial
problem/plan/result construction overhead; it does not justify attributing the
remaining cost entirely to evaluator arithmetic.

The combined explicit-only pack has six functions, zero unsupported functions,
no exact-library archives and a 64,122-byte Wasm payload. Imported-source hashes
are checked against the Python module bundle and authenticated pack identity;
missing, changed or tampered dependency metadata cannot expose acceleration.
This does not remove the full browser evaluator's pre-existing exact-math
startup dependencies.
