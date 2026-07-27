# Prime finite-field benchmark

This benchmark runs one source file unchanged under Sage.js and SageMath:

```sh
pnpm run bench:finite-fields
```

It measures a word-sized prime field and its FLINT-backed univariate
polynomial ring:

- 500,000 scalar multiply-add iterations in `GF(65537)`;
- 5,000 products of degree-128 and degree-126 polynomials;
- 1,000 GCDs of degree-192 polynomials with a degree-64 common factor;
- 20 factorizations of `x^96 + x^5 + 1`.

Construction and process startup are excluded. Each case is warmed up and
then measured seven times. The table reports the median divided by the number
of operations.

On the initial x86-64 machine (Node 26.5.0, SageMath 10.9.post1, Sage.js
FLINT 3.5.0), the results were:

| Operation | Sage.js | SageMath | Sage.js / SageMath |
|---|---:|---:|---:|
| scalar multiply-add | 138 ns | 131 ns | 1.06x |
| polynomial multiply | 5.60 us | 2.84 us | 1.97x |
| polynomial GCD | 38.0 us | 50.8 us | 0.75x |
| polynomial factorization | 0.85 ms | 1.18 ms | 0.72x |

These are measurements of the complete language-level operations, not merely
the underlying C calls. The small polynomial product remains sensitive to one
Node-API crossing and wrapper allocation per operation. GCD and factorization
do enough native work per crossing that the boundary is no longer dominant;
on this workload the current Sage.js/FLINT path is already competitive.

Library build choices, CPU, and polynomial shape all matter. The conclusion is
not that one runtime universally wins, but that the architecture crosses the
native boundary at a useful granularity: scalar field arithmetic stays cheap
in JavaScript, while substantial polynomial algorithms run entirely inside
FLINT.
