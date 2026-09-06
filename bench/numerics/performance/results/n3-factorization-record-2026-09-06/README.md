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
No browser, persistent-host, npm/SEA or default-backend promotion is claimed.

```sh
node --test test/numerics/linear_algebra/factorization-record.cjs
node bench/numerics/performance/dense-phase-profile.cjs NEW_RECEIPT.json
```
