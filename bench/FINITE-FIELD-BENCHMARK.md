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
- 20 factorizations of `x^96 + x^5 + 1`;
- three complete `sum(list(Zmod(100000)))` operations.

Construction and process startup are excluded. Each case is warmed up and
then measured seven times. The table reports the median divided by the number
of operations.

On the initial x86-64 machine (Node 26.5.1, SageMath 10.9.post1, Sage.js
FLINT 3.5.0), the results were:

| Operation | Sage.js | SageMath | Sage.js / SageMath |
|---|---:|---:|---:|
| scalar multiply-add | 224 ns | 130 ns | 1.72x |
| polynomial multiply | 9.00 us | 2.83 us | 3.18x |
| polynomial GCD | 43.0 us | 51.1 us | 0.84x |
| polynomial factorization | 0.90 ms | 1.19 ms | 0.75x |
| residue-list sum | 27.3 ms | 37.5 ms | 0.73x |

The residue-list case is also a guard against language-runtime overhead:
enumerating the ring creates 100,000 exact modular elements before summing
them. It therefore catches accidental per-instance costs that native FLINT
benchmarks cannot expose.

These are measurements of the complete language-level operations, not merely
the underlying C calls. Same-parent finite scalar operations use a guarded
closed-parent path, then construct an immutable element whose value is already
reduced. This retains the general coercion model for mixed-parent operations
while avoiding it in the hot scalar loop. The small polynomial product is
still sensitive to one Node-API crossing and wrapper allocation per operation.
GCD and factorization do enough native work per crossing that the boundary is
no longer dominant; on this workload the current Sage.js/FLINT path is already
competitive.

Library build choices, CPU, and polynomial shape all matter. The conclusion is
not that one runtime universally wins, but that the architecture crosses the
native boundary at a useful granularity: scalar field arithmetic stays cheap
in JavaScript, while substantial polynomial algorithms run entirely inside
FLINT.
