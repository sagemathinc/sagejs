# Independent dense reconstruction storage access

This development measurement changes only independent matrix reconstruction to
borrow the immutable row-major entry tuples after one shape check. It preserves
product order, `math.fsum`, and every cancellation checkpoint. Factorization,
norms, thresholds, result construction and truth classifications are unchanged.
It neither enables the private compiled LU nor removes required validation.

`local.json` records the source digests, runtime and seven alternating paired
samples after three warmups. Both arms use the same current public `lu` call;
the baseline arm substitutes only the previous independent-product body from
`85a84375d`. The timed call receives a preconstructed `DenseMatrix` and includes
factorization, reconstruction, validation and result construction, with no trace.
Matrix creation, serialization, startup and memory peaks are excluded.

| Square dimension | Previous median (ms) | Snapshot median (ms) |
| --- | ---: | ---: |
| 8 | 64.43 | 47.49 |
| 16 | 284.57 | 178.32 |
| 32 | 1757.49 | 957.08 |

These are local, non-quiet-host observations, not final qualification or a SciPy
comparison. The absolute times still miss the program's ambitions substantially.
Independent validation remains a major acceleration target; isolated kernel
timings must not be substituted for these full-call measurements.

The regression compares empty/rectangular products and cancellation-sensitive
sums against the previous body, preserves callback counts and all-stop exception
propagation, and rejects incompatible shapes and nonfinite products. The existing
dense corpus and deliberately incorrect overflow factors remain separate tests.

Reproduce with `node bench/numerics/performance/validation-access.cjs`. The
collector forces dynamic execution and rejects incidental exact-library loads.
