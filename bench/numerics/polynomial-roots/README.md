# Polynomial-root benchmark

Run:

```sh
python3 -I bench/numerics/polynomial-roots/benchmark.py
```

The benchmark performs one warmup, then reports the median and minimum of nine
ordinary-CPython runs through degree 16 and five runs above it. Every timed run
must return `success` with independent backward validation. The methods,
iterations, evaluation counts, condition indicators, and Vieta errors are part
of the JSON output; the benchmark is not a timing-only gate.

## 2026-08-31 Linux x64 development measurement

Host: Linux 6.17 x86_64, CPython 3.14.4. These are local development numbers,
not browser or four-platform qualification receipts.

| Workload | Degree | Sage.js Python | NumPy companion | Iterations | Evaluations | Max backward error |
|---|---:|---:|---:|---:|---:|---:|
| separated complex | 4 | 1.18 ms | 0.07 ms | 6 | 24 | 3.4e-16 |
| separated complex | 8 | 5.84 ms | 0.09 ms | 14 | 112 | 6.6e-16 |
| separated complex | 16 | 23.0 ms | 0.21 ms | 18 | 288 | 7.8e-14 |
| separated complex | 32 | 199 ms | 0.70 ms | 45 | 1,440 | 1.7e-15 |
| separated complex | 64 | 1,094 ms | 2.46 ms | 66 | 4,224 | 2.9e-12 |
| repeated root | 8 | 8.48 ms | 0.15 ms | 22 | 176 | 9.7e-17 |
| 300-decade quadratic pair | 2 | 0.33 ms | 0.06 ms | 0 | 0 | 6.1e-17 |

The algorithms differ: NumPy measures companion-matrix eigenvalues through
mature compiled linear algebra, whereas Sage.js measures direct
Aberth--Ehrlich sweeps plus independent result construction and validation.
The comparison is therefore a product/backend baseline, not a same-method
microbenchmark. It makes the current limit clear: the ordinary Python path is
roughly 17--450 times slower in this corpus. Degree 64 is about one second on
this host, which is a reasonable substantial-local fallback but not an
instant-classroom workload. A future MPSolve or LAPACK-class pack must report
storage conversion, cold load, payload, and the same post-validation
separately before replacing this path.
