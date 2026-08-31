# Validated dense numerical linear algebra

This package is the source-portable binary64 reference slice for dense numerical
linear algebra. It solves real finite systems, exposes the factorization it
actually used, reports scale-aware rank and conditioning evidence, optionally
refines a solution, and independently checks the mathematical result before
claiming success.

The implementation is ordinary CPython-parseable source under
`sagejs.numerics.linear_algebra`; one executable corpus runs the same files in
CPython and Sage.js on validated Linux x64. Browser and additional native-host
receipts remain release work rather than implied platform claims.
There is no native dependency or hidden replacement kernel. The immutable
flat row-major representation is an interchange contract that can later be
marshalled to a packed `Float64Array` backend without changing semantics.

## Quick start

The integration lane has not yet re-exported this package from the shared
`sagejs.numerics` facade, so import the domain package directly:

```python
from sagejs.numerics.linear_algebra import solve

result = solve([[3.0, 1.0], [1.0, 2.0]], [9.0, 8.0])
assert result.success
assert result.value == [2.0, 3.0]
print(result.validation.to_dict())
print(result.to_json())
```

`solve` is deliberately square-only. Use `least_squares` for rectangular
problems:

```python
from sagejs.numerics.linear_algebra import least_squares

fit = least_squares([[1, 1], [1, 2], [1, 3]], [1, 2, 2])
assert fit.success
assert fit.value == [2 / 3, 1 / 2]
```

Full-row-rank wide problems return the minimum-Euclidean-norm solution.
Rank-deficient least squares is rejected rather than returning an undocumented
basic solution; pseudoinverse/SVD completion belongs to the later spectral
slice.

## Public operations

| Operation | Method and contract | Independent check |
|---|---|---|
| `solve` | partial-pivot LU by default; checked Cholesky only from an explicit positive-definite contract; pivoted QR on request | compensated `B - A X`, normwise infinity backward error, condition-times-backward-error indicator |
| `least_squares` | column-pivoted Householder QR for tall inputs; column-pivoted QR of `A.T` for a wide minimum-norm solve; no normal equations | `A.T (B - A X)` stationarity or direct backward error, plus an independently reorthogonalized row-space check for wide minimum norm |
| `lu` | `A = P L U`, matching Sage's public orientation | full reconstruction |
| `qr` | reduced Householder QR; optional `A P = Q R` column pivoting; complete factors available from the retained object | reconstruction and `Q.T Q = I` |
| `cholesky` | pair-scale-aware symmetry check, then lower `A = L L.T`; real SPD means every computed Schur pivot is strictly positive, regardless of its magnitude | reconstruction and positive diagonal |
| `matrix_rank` | scale-normalized one-sided Jacobi singular-value estimates with the NumPy/MATLAB-style `sigma_max * max(m,n) * eps` default threshold | convergence and threshold record; truth level remains `heuristic` |
| `condition_number` | estimated 2-norm condition from largest/smallest Jacobi singular values | convergence record; `None` plus `condition_kind = "infinite"` is the JSON-safe singular result |
| `determinant` | partial-pivot LU, only when explicitly requested | LU reconstruction; sign and finite `log(abs(det))` survive ordinary underflow/overflow |
| `inverse` | repeated retained-LU solves, only when explicitly requested | both `A A^-1 = I` and `A^-1 A = I` |

Every operation returns `LinearAlgebraResult`, a domain extension of the shared
`NumericalResult`. Common fields include the problem digest, selected method,
backend, truth level, validation checks, diagnostics, provenance, resource
measurements, and a bounded semantic trace. Factorization results additionally
retain their typed factor object at `result.factorization` while serializing a
backend-neutral value record.

Every public operation accepts `max_elapsed_ms` and `cancel`. The cooperative
guard is evaluated within factorization, Jacobi, factor application,
refinement, and independent-validation loops, rather than only between whole
cubic phases. Cancellation callback exceptions are classified results.

## Numerical truth and refinement

For a direct solution, the independent validator computes

```text
r = b - A x
eta_inf = ||r||_inf / (||A||_inf ||x||_inf + ||b||_inf).
```

The residual accumulation lives in `validation.py`, separate from elimination
and factor application, and uses `math.fsum`. A small `eta_inf` is evidence of
a small backward error. It is not a claim of a small forward error when `A` is
ill-conditioned. When a finite condition estimate is available, the result
reports `condition * eta_inf` only as a forward-error indicator.

LU, QR, and Cholesky solve paths can apply accepted-step iterative refinement.
Each correction solves `A delta = r` with the retained factors. A candidate is
published only if its independently recomputed backward error decreases; every
attempt records before/after error, correction norm, and acceptance in the
bounded trace. The
[`solve-well-conditioned`](../../../test/numerics/linear_algebra/corpus.json)
and refinement regression in `linear-algebra.cjs` cover normal and improving
paths.

Rank and condition are deliberately labeled heuristic rather than proofs. The
Jacobi iteration first normalizes by the largest input magnitude, then records
convergence, every retained singular-value estimate,
and the exact rank threshold. A singular condition is represented as `None`
with an explicit `infinite` kind so deterministic JSON never contains `NaN` or
`Infinity`.

## Automatic selection and failures

`solve(..., method="auto")` selects general partial-pivot LU. It selects
Cholesky only when the caller supplies `assume="positive_definite"`; Cholesky
still verifies symmetry and positive pivots. There is no silent symmetry guess
and no silent fallback from a false structural claim.

Domain failures remain explicit even though the current shared status registry
does not contain all linear-algebra codes:

| `result.failure_code` | Current shared status | Meaning and response |
|---|---|---|
| `rank_deficient` | `validation_failed` | Direct solve/inverse or current QR least-squares contract is numerically rank deficient; inspect the threshold, reformulate, or wait for SVD/pseudoinverse support. |
| `matrix_not_square` | `invalid_problem` | Use `least_squares` for a rectangular solve or provide a square matrix for determinant/inverse. |
| `dimension_mismatch` | `invalid_problem` | Make the right side's row count equal `A.nrows`. |
| `not_symmetric` | `invalid_problem` | Repair the structural claim or use LU/QR. |
| `not_positive_definite` | `invalid_problem` | Use an indefinite/general method or repair the model. |
| `maximum_elapsed_time` | `maximum_elapsed_time` | Increase the explicit budget or reduce the dense problem. |
| `rank_diagnostic_indeterminate` | `validation_failed` | Jacobi diagnostics exhausted their sweep budget before a rank decision; increase the budget. |
| `cancelled` | `cancelled` | The requested cancellation was observed by a cooperative inner-loop guard. |
| `cancellation_callback_error` | `validation_failed` | The cancellation callback raised; repair the callback before retrying. |
| `nonfinite_intermediate` | `validation_failed` | A mathematically required intermediate is outside representable binary64 range; rescale or use a wider numeric type. |

Until the remaining shared normalization lands, domain-specific failures use
existing `ill_conditioned`, `validation_failed`, and `cancelled` diagnostics
as applicable, while the domain code and structured details preserve the
precise identity. Elapsed-time exhaustion already uses the shared
`maximum_elapsed_time` status and diagnostic. See
[`integration-requests.md`](integration-requests.md) for the exact shared
changes requested from the integration lane.

Invalid storage is rejected before computation: ragged rows, wrong entry
counts, and non-finite or non-convertible entries never enter an algorithm.
The schema-checked correctness corpus includes singular and nonsquare solves,
dimension mismatch, rank-deficient least squares, coupled wide minimum norm,
nonsymmetric and indefinite Cholesky, uniform-scale metamorphic cases through
`1e-200` and `1e200`, a one-dimensional QR case at `1e308`, determinant
overflow, non-finite storage, cancellation
inside every public computation family, callback failure, and trace
truncation. Fixed NumPy references are executed as data; NumPy is not a runtime
dependency.

When NumPy and SciPy are available for development or release qualification,
run `python3 test/numerics/linear_algebra/numpy-oracle.py`. Its deterministic
seeded campaign checks 400 solves, 250 tall/wide least-squares problems, 100
condition estimates, and five uniform exponent scalings; the portable fixed
corpus remains the routine test.

## Complexity and practical envelope

The direct factorizations and Jacobi diagnostics take cubic time for square
matrices and quadratic storage. A retained LU or Cholesky factor solves each
additional right side in quadratic time. Independent residual and
factorization checks add matrix-product-scale work; they are part of the
truth contract, not optional logging.

This source-readable implementation is intended for teaching, portable
fallbacks, and differential truth. Linux x64 CPython/Sage.js is the currently
validated host pair; browser suitability remains a target pending its receipt.
It does not claim
BLAS/LAPACK throughput. The representative benchmark separates conversion,
factorization, retained solves, validation, diagnostics, complete structured
results, and trace overhead; see
[`bench/numerics/linear_algebra/`](../../../bench/numerics/linear_algebra/README.md).

## Compatibility views

The canonical operation is richer than a scalar/list return. Equivalent human
intent, once frontend wiring is integrated, is:

```python
# Python
result = solve(A, b)

# Sage view (planned shared facade)
result = numerical_solve(A, b)
```

```matlab
% MATLAB
x = A \ b;
```

```wolfram
(* Wolfram Language *)
x = LinearSolve[A, b];
```

Sage's familiar `A.solve_right(b)` remains a natural scalar-looking view, but
the current lane does not alter the shared `Matrix` API. Integration must
decide how that view opts into the structured numerical result without
changing exact-ring behavior.

## Library and semantics survey

The design was fixed after reviewing the repository's exact
`sagejs.linear_algebra.decompositions`, the existing Sage.js `Matrix` contracts,
and maintained-library behavior:

- [NumPy `solve`](https://numpy.org/doc/stable/reference/generated/numpy.linalg.solve.html)
  restricts direct solve to square full-rank systems and delegates to LAPACK
  `gesv`; this slice likewise keeps rectangular intent in `least_squares`.
- [NumPy `matrix_rank`](https://numpy.org/doc/stable/reference/generated/numpy.linalg.matrix_rank.html)
  documents the widely used `sigma_max * max(m,n) * eps` threshold adopted
  here, while this slice exposes the threshold instead of hiding it.
- [NumPy `qr`](https://numpy.org/doc/stable/reference/generated/numpy.linalg.qr.html)
  defines reduced and complete factor shapes. The same shapes are used here;
  optional pivoting adds the explicit `A P = Q R` identity.
- [NumPy `slogdet`](https://numpy.org/doc/stable/reference/generated/numpy.linalg.slogdet.html)
  explains why sign/log magnitude must remain available when an ordinary
  determinant underflows or overflows.
- [SciPy's linear algebra guide](https://docs.scipy.org/doc/scipy/tutorial/linalg.html)
  distinguishes reusable LU solve factors, general QR, and the SPD-only
  Cholesky path. This slice retains reusable factors and validates each claimed
  structure.
- [mpmath's matrix documentation](https://mpmath.org/doc/current/matrices.html)
  warns that least squares through normal equations squares conditioning and
  recommends QR for accuracy. This slice never forms normal equations.
- [Sage's dense RDF/CDF matrix documentation](https://doc.sagemath.org/html/en/reference/matrices/sage/matrix/matrix_double_dense.html)
  defines `A = Q R`, unitary/orthogonal `Q`, and delegates numerical QR to
  SciPy/LAPACK. The portable implementation preserves those visible identities
  without pretending to match LAPACK performance.

No third-party source was copied. These references determine public semantics,
failure expectations, and oracle comparisons; the algorithms remain readable
same-source Python.

## Supported and deferred surface

The machine-readable classification is
[`support-matrix.json`](support-matrix.json). In short, this milestone supports
finite real dense binary64 data; vector or multiple right sides; square direct
solves; full-rank tall/wide least squares; LU/QR/Cholesky; rank/condition
diagnostics; explicit determinant/inverse; refinement; structured validation;
and bounded traces.

Complex/Hermitian data, sparse matrices, batches, strided/borrowed views,
rank-deficient minimum-norm least squares, nullspaces, pseudoinverses, SVD,
eigenproblems, arbitrary precision, interval certification, GPU execution, and
BLAS/LAPACK/Wasm/native acceleration are explicitly unsupported here. P5
spectral and sparse work must repeat the survey/corpus/backend process rather
than treating this reference implementation as an accidental production
backend selection.
