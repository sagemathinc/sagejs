# Isolated bounded LU development samples

`local.json` records source identity, host details, fresh compilation and seven
samples after three warmup batches. Native and generated-JavaScript order
alternates. The matrix and separately owned workspace are allocated beforehand;
each factorization still copies the original input before pivoting.

| Square dimension | Native ms | Generated-JavaScript ms |
| --- | ---: | ---: |
| 8 | 0.0038 | 0.119 |
| 32 | 0.0166 | 6.27 |
| 64 | 0.121 | 47.8 |
| 128 | 0.942 | 399 |

These are isolated factorization medians, **not public solve speedups**. The
comparator is the generated JavaScript fallback for this source, not SciPy,
LAPACK, or the ordinary public LU API. Input conversion, public records,
independent validation, buffer allocation, cold process startup and memory
measurements are excluded. No automatic selection or performance gate follows.

The focused correctness test compares 41 square/rectangular/singular/scaled
cases against the existing ordinary factorization and independent reconstruction.
Native, generated JavaScript, Node-Wasm and real Chromium/Firefox/WebKit workers
agree. Storage/shape/nonfinite/overflow rejection checks run on the three local
execution paths. Four-platform and packaged/public qualification remain open.

Reproduce with `node bench/numerics/performance/packed-lu.cjs`; correctness uses
`SAGEJS_NUMERICAL_BROWSER_TESTS=1 node --test test/numerics/performance/packed-lu.cjs`.
