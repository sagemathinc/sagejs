# N3 dense-kernel checkpoint

`perf/numerical-packed-lu` starts with a private bounded partial-pivot LU
candidate. It lowers the actual ordinary Python body, preserves the existing
first-maximum pivot policy and arithmetic order, and has no host callbacks.
It is not a public or automatically selected backend. Shapes are limited to
1–128 rows and columns; nonfinite arithmetic is classified and writable
buffers must be discarded on failure. Completion does not claim nonsingularity.

The local existing OpenBLAS prefix exports `cblas_dgemm` but not the probed
`dgesv`, `dgetrf`, `dpotrf`, `dsyev` or `dgesvd` routines. This agrees with
`packages/flint/scripts/build-deps.cjs`, which explicitly sets `NOFORTRAN=1`,
`NO_LAPACK=1` and `NO_LAPACKE=1`. Reusing that prefix does not by itself provide
LAPACK. No new external dependency or final backend choice is made here.

The focused corpus compares the source body with the existing ordinary LU
factorization and independently reconstructs permuted input entries. It includes
square and rectangular matrices, singular/zero-pivot cases, scaling, shape and
storage rejection, and nonfinite/overflow rejection. The same successful cases
are compared through native, generated JavaScript and Wasm targets. This is
focused evidence, not general qualification of a dense solver library.

`node bench/numerics/performance/packed-lu.cjs` separates fresh compilation from
warm 8/32/64/128-square factorization batches. It includes the generated adapter
and input-to-workspace copy, but excludes public conversion, independent
validation, planning, result creation and buffer allocation. Its generated
JavaScript comparator is not SciPy, BLAS or the full public fallback. Do not
present isolated kernel ratios as public speedups.

Next gates remain public integration with unchanged independent validation,
matched library alternatives, complete-call benchmarks, persistent four-host
and package qualification, and explicit trace/cancellation boundaries. QR,
Cholesky, eigen and SVD are not delivered by this LU candidate.

The [four-host source receipts](../bench/numerics/performance/results/n3-packed-lu-platforms-2026-09-05/README.md)
now pass for the private kernel with identical unchanged selected input hashes.
Windows required moving the large oracle corpus from argv to stdin; no kernel
change was needed. Strict Python passes with 376 modules, architecture passes,
and Node 22.22.2 and three-engine Wasm source checks pass. Public integration
and the broader qualification gates above remain open.

## Validation overflow correction

Before public acceleration, inspection found an existing false-success path:
`[[1e308, 1e308], [0, 1e308]]` has an infinite binary64 infinity norm, and a
factorization with a ten-percent error in its first entry was accepted with
zero relative residual. Related normalization divisions exist in QR, Cholesky,
linear-system backward errors and least-squares checks.

`fix/numerical-lu-validation-overflow` rejects unrepresentable normalization
as `nonfinite_intermediate` / indeterminate validation, rather than dividing
by infinity. It does not claim extended-range validation is implemented.
Focused tests include deliberately wrong factors and the public structured
failure path. A future scaled normalization implementation needs its own
evidence; acceleration must not bypass these guards.

The [overflow qualification](../bench/numerics/performance/results/validation-overflow-2026-09-05/README.md)
retains matching four-host CPython/dynamic receipts and twelve source-browser
routes. A combined-fixture WebKit assertion remains unexplained; the
filename-labeled separate-fixture harness passed. This is source qualification,
not full product or performance qualification.
