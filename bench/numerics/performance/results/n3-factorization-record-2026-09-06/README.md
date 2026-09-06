# Single factorization presentation

Public LU, QR and Cholesky results previously called `factorization.to_dict()`
twice: once for `value`, again for the domain payload. The result now constructs
that presentation once. `NumericalResult` still independently materializes both
records; no mutable cache, public alias or lazy result field is introduced.
This also avoids reconstructing QR's explicit Q a second time.

The CPython/Sage.js regression checks one presentation call for each of the
three operations, correct validation, and detached nested ownership against
mutations to the source presentation, exported value and exported domain payload.
The source-level linear-algebra corpus and validation regressions pass.

`profile.json` is a local instrumented public-LU diagnostic from the existing
phase collector, with source hashes, three warmups and seven samples. The
32-square result phase median is 97.9 ms, compared with 115.8 ms in the
[previous diagnostic](../n3-coordinate-validation-2026-09-06/README.md).
Total median is 613.2 ms, and validation remains about 436.8 ms. These separate
runs are not a paired controlled speed comparison or target qualification.
No persistent-host, npm/SEA or default-backend promotion is claimed.

The final source-browser run passes all twelve disabled/floating/stale/missing
routes in Chromium, Firefox and WebKit after rebuilding 411 lazy modules and
eight dynamic programs. Each includes LU/QR/Cholesky presentation ownership and
call-count checks. `browsers.json` records source/pack hashes; its timings are
the existing root workload, not LU. The first attempt stopped because the
harness expected output omitted the new test's success line; the corrected
exact-output assertion passes. This is browser source integration, not a
fresh complete release qualification. Node 22 floor, strict Python (377 modules)
and architecture also pass.

```sh
node --test test/numerics/linear_algebra/factorization-record.cjs
node bench/numerics/performance/dense-phase-profile.cjs NEW_RECEIPT.json
```
