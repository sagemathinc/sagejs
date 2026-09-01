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
| nonlinear least squares / curve fit | `cminpack-lmdif` | explicit-only cminpack finite-difference Levenberg-Marquardt; `1 <= n <= 128`, `n <= m <= 16384` |
| nonlinear least squares / curve fit | `cminpack-lmder` | explicit-only cminpack analytic-Jacobian Levenberg-Marquardt; same envelope |
| affine fit | `centered-linear-fit` | two parameters |

`auto` respects these envelopes. In particular, derivative-free problems above
dimension 64 select finite-difference BFGS instead of escaping the validated
Nelder-Mead range. An explicit method outside its bound or dimension envelope
raises before callback evaluation.

These names do not imply a different library algorithm. `projected-bfgs` is
not TNC or L-BFGS-B, `damped-gauss-newton` is not MINPACK `lmdif`/`lmder`, and
`damped-newton` is not MINPACK `hybr`.

The two `cminpack-*` identities are the exception: they execute the pinned
cminpack implementation in a 72,155-byte, separately lazy universal Wasm
reactor. They are available in Sage.js Node, browser, and SEA runtimes on the
four release platforms, but remain explicit-only:

```python
from sagejs.numerics.optimization import least_squares

fit = least_squares(
    lambda p: [10.0 * (p[1] - p[0] * p[0]), 1.0 - p[0]],
    [-1.2, 1.0],
    method="cminpack-lmdif",
)
assert fit.method == "cminpack-lmdif"
assert fit.backend == "cminpack-wasm"
assert fit.success and fit.validation.passed
```

Use `cminpack-lmder` only with `jacobian=...`. An exact method request either
executes that implementation or fails; it never silently substitutes
`damped-gauss-newton`. `auto` intentionally continues to select the
ordinary-Python implementation until an automatic-selection policy has its
own public correctness and performance receipts.

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

Every result provides three domain-owned views:

- `result.explanation()` returns the detached
  `optimization-explanation/v1` record. It keeps solver status separate from
  validation truth, identifies active bounds, reports returned-point parameter
  identifiability, preserves scale-safe least-squares evidence, and gives a
  structured failure narrative with failed independent checks and suggested
  actions. `result.explain()` is a compact text rendering of that same record.
- `result.plot()` (also `result.to_plot_spec()`) returns a canonical `PlotSpec`
  with `Axes2DSettings`, stable semantic layer roles, outcome provenance, and an
  explicit accessible description available through `spec.alt_text()`.
- `result.animate()` returns a topology-stable `PlotAnimation` with play,
  pause, and iteration-slider controls plus a described final-frame static
  fallback. It replays retained numerical evidence and never reruns the solver.

The static view is operation-specific:

| Operation or method | Semantic layers |
| --- | --- |
| bounded scalar minimum | retained objective path, interval reference and endpoints, retained incumbents, returned candidate |
| two-parameter BFGS / nonlinear system / least squares | parameter path, retained iterates, returned point |
| two-parameter Nelder-Mead | parameter path plus the current retained simplex |
| two-parameter projected BFGS | parameter path, finite box-bound lines, active returned bound |
| higher- or lower-dimensional solve | iteration against objective, cost, or residual norm |
| linear and nonlinear curve fit | observations, fitted model, residual sticks |

Only finite intervals and box bounds are visualized because those are the only
qualified constraint classes. The package does not fabricate nonlinear
feasible regions. A failed stationary least-squares point is labeled as solver
convergence rejected by validation; an ill-conditioned fit is labeled as
rank-deficient or ill-conditioned. If a squared cost is outside binary64, the
explanation says so and the convergence view uses the representable residual
norm instead of inserting a non-finite objective.

View construction never invokes a result's user callbacks. Scalar views show
only objective values already present in the retained solver trace and final
result; with `trace="none"`, the static view shows only the returned state and
the finite interval reference. Static fit plots display at most 2,048
deterministically selected retained observations. Fit animation requires at
most 256 retained observations. Every animation contains at most 128 frames,
retains the first and last progress states when decimating, fixes representable
axis ranges from the complete retained story across every frame, and declares
hard sample, layer, payload, and duration limits. The cross-runtime semantic
oracle is
[`visualization-fixtures.json`](visualization-fixtures.json); it fixes the
accessible descriptions, layer roles, canonical lowering, constraint and
identifiability records, failure checks, controls, and animation topology for
representative CPython and Sage.js results.

`capabilities()` advertises this explanation/static/animation contract on every
qualified method record. Its result is recursively detached, and `supports()`
and `plan()` inspect problem metadata without invoking user callbacks, so the
central lazy facade can query the package without causing numerical work.

## Evidence and current limits

The production corpus, SciPy development oracle, benchmark runner, schemas, and
Linux x64 receipts live in `bench/numerics/optimization/`. The SciPy receipt
requires the expected Sage.js method identity in addition to mathematical
agreement. It labels L-BFGS-B, MINPACK `hybr`, and SciPy TRF comparisons as
mathematical oracles rather than interchangeable methods.

This slice is not yet the complete P3 backend portfolio. It does **not** claim:

- Sage `find_fit` compatibility or automatic cminpack selection;
- automatic NLopt Nelder-Mead selection or any certified local/global optimum
  claim for its opaque derivative-free objective;
- feasibility-aware nonlinear constraints (the sanitizer-clean future path is
  a modern PRIMA-family implementation rather than NLopt's legacy COBYLA C
  translation);
- Powell, CG, Newton-CG, TNC, or L-BFGS-B;
- nonlinear constraints, global optimization, or arbitrary precision;
- general nonlinear-optimization qualification outside the exact envelopes
  above; or
- cminpack qualification on a platform/runtime not listed by `capabilities()`.

Those capabilities remain absent until their exact-method corpus, independent
feasibility checks, Wasm upstream tests, browser run, payload evidence, and
four-host receipts are checked in. cminpack's source, license, artifact, MGH
oracle corpus, browser receipt, resource limits, and lifecycle evidence live in
`packages/flint-wasm/numerical/`; its low-level success code is never accepted
as the public validation result.
