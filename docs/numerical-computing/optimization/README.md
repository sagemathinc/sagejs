# Validated optimization and fitting

`sagejs.numerics.optimization` is the ordinary-Python fallback slice for local
optimization, nonlinear systems, least squares, and fitting. The same source is
CPython-parseable and runs through the Sage.js dynamic Python runtime. Results
separate solver termination (`status`) from independent mathematical
validation (`validation`); `success` is true only when both support the claim.

## Qualified methods

The public result and plan always report the exact implemented method. The
current Linux x64 CPython and Sage.js Node evidence covers:

| Operation | Exact method | Envelope |
| --- | --- | --- |
| bounded scalar minimum | `bounded-brent` | finite binary64 interval |
| unconstrained minimum | `nelder-mead` | no bounds, dimension at most 64 |
| unconstrained minimum | `bfgs` | no bounds, dimension at most 128 |
| box-bounded minimum | `projected-bfgs` | at least one finite box bound, dimension at most 128 |
| nonlinear system | `damped-newton` | square dense system, dimension at most 128 |
| nonlinear least squares / curve fit | `damped-gauss-newton` | dense Jacobian envelope below |
| affine fit | `centered-linear-fit` | two parameters |

`auto` respects these envelopes. In particular, derivative-free problems above
dimension 64 select finite-difference BFGS instead of escaping the validated
Nelder-Mead range. An explicit method outside its bound or dimension envelope
raises before callback evaluation.

These names do not imply a different library algorithm. `projected-bfgs` is
not TNC or L-BFGS-B, `damped-gauss-newton` is not MINPACK `lmdif`/`lmder`, and
`damped-newton` is not MINPACK `hybr`.

## Validation and failures

Validation re-evaluates opaque callbacks and uses derivative formulas separate
from the solver. Scalar and box minima use bound-aware projected stationarity;
unconstrained minima use an independent five-point finite-difference gradient;
systems use an independent residual; and least squares uses an independent
five-point Jacobian plus local second-order probes. The latter prevents a zero
Gauss-Newton gradient at a stationary maximum from becoming a successful fit.

Least-squares norms, comparisons, normal equations, stationarity, and local
second-order probes use a LAPACK-style scaled sum of squares and a common
residual/Jacobian normalization. Multiplying every residual by `1e200` or
`1e-200` therefore does not change the computed parameter or silently overflow
or underflow the solver's convergence evidence. If a nonzero squared residual
is outside binary64's representable range, `objective` and `cost` are `None`;
the receipt retains finite `residual_scale`, `scaled_sum_of_squares`, and a
finite residual norm when that norm itself is representable.

An unconstrained, box, or least-squares minimum also requires its independent
coordinate probes to resolve some objective variation unless every coordinate
is fixed.
If variable scaling makes all configured local probes numerically identical,
validation returns `indeterminate` instead of interpreting rounded-zero finite
differences as proof of a local minimum. Rescaling variables is required before
such a problem can receive a success result.

Callback exceptions, non-finite results, nonnumeric scalar/vector/matrix
results, cancellation, elapsed time, evaluation exhaustion, and trace limits
become structured statuses and diagnostics. A callback or budget failure that
occurs during validation replaces a nominal `converged` status. The exception
object and message are not serialized into the result.

Derivative or normal-equation scale ratios that lose nonzero binary64 values,
and norms that cannot be represented even in scaled form, fail closed with an
`invalid_problem` stop reason rather than entering trace or result JSON as
infinities.

Hard allocation ceilings are part of the public envelope:

- parameter and dense-system dimension: 128;
- residual or fit observations: 16,384;
- dense Jacobian elements: 262,144; and
- fit animation observations: 256.

The effective residual ceiling is the smaller of 16,384 and
`floor(262144 / parameter_dimension)`. Fit constructors reject known oversized
data before copying it. Dynamically sized residual callbacks are converted only
after their length has passed the ceiling.

Parameter diagnostics use a scaled-pivot inverse of the current returned-point
normal matrix and its induced one-norm condition estimate. Covariance is marked
unavailable if no current Jacobian exists; it is never reported from a stale
pre-step linearization.

## Traces and visualization

`trace="summary"` retains truthful initial progress and logarithmically sampled
accepted iterates. `trace="iterations"` retains every accepted iteration within
the event and byte budgets. Scalar animations replay retained candidates, and
fit animations replay retained fitted values; neither substitutes the final
answer for earlier frames. `trace="none"` cannot be animated because no history
was retained. Static plots may still show the final result.

## Evidence and current limits

The production corpus, SciPy development oracle, benchmark runner, schemas, and
Linux x64 receipts live in `bench/numerics/optimization/`. The SciPy receipt
requires the expected Sage.js method identity in addition to mathematical
agreement. It labels L-BFGS-B, MINPACK `hybr`, and SciPy TRF comparisons as
mathematical oracles rather than interchangeable methods.

This slice is not yet the complete P3 backend portfolio. It does **not** claim:

- cminpack Wasm `lmdif`/`lmder` or Sage `find_fit` compatibility;
- NLopt/PRIMA Nelder-Mead or feasibility-aware COBYLA;
- Powell, CG, Newton-CG, TNC, or L-BFGS-B;
- nonlinear constraints, global optimization, or arbitrary precision;
- browser, SEA, Linux ARM64, macOS ARM64, or Windows x64 qualification; or
- four-platform release qualification.

Those capabilities remain absent until their exact-method corpus, independent
feasibility checks, Wasm upstream tests, browser run, payload evidence, and
four-host receipts are checked in. The central integration lane owns the shared
package graph, public registries, and top-level numerical surface.
