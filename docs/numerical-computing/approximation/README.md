# Validated numerical approximation

This package supplies the P2 approximation slice as ordinary,
CPython-parseable Python. It constructs interpolation polynomials, local linear
interpolants, cubic splines, diagnosed finite differences, and Chebyshev
approximants through the shared `NumericalProblem` → `NumericalPlan` →
`NumericalResult` contract.

The implementation has no native dependency. The same source is the portable
fallback for browser, Node, the Sage.js executable, and native four-platform
builds. The current direct import is:

```python
from sagejs.numerics.approximation import (
    chebyshev_approximation,
    cubic_spline,
    finite_difference,
    interpolate,
)
```

The integration lane will decide which names also belong in
`sagejs.numerics`; this lane deliberately does not edit the parent package or
the shared capability registry.

## A first laboratory

```python
import math

from sagejs.numerics.approximation import interpolate

nodes = [-1.0, -0.4, 0.2, 0.75, 1.5]
values = [x**4 - 2*x + 1 for x in nodes]
result = interpolate(nodes, values, trace="iterations")

assert result.success
print(result.evaluate(0.6))
print(result.evaluate(0.6, derivative=1))
print(result.validation.to_dict())
print(result.explain())
plot_data = result.plot_data()
```

`result.value` is detached coefficient/stencil data, not a live Python
object. Consequently `result.to_json()` remains deterministic and the model
can cross a worker or process boundary. `plot_data()` exposes semantic line
and point layers that an integration visualizer can lower to `PlotSpec`.

## Supported surface

| Operation | Methods and conditions | Construction | Query | Truth level |
|---|---|---:|---:|---|
| polynomial interpolation | scaled second-form barycentric, at most 32 nodes | `O(n²)` | `O(n)` | validated approximate |
| piecewise interpolation | linear, end-segment extrapolation | `O(n)` | `O(log n)` | validated approximate |
| cubic spline | not-a-knot, natural, clamped, periodic, mixed first/second derivative endpoints | `O(n)` | `O(log n)` | validated approximate |
| finite-difference derivative | Fornberg central/forward/backward stencils, at most 65 points | `O(s²)` weights and two `s`-point callback passes | scalar | heuristic, or validated approximate with analytic reference |
| polynomial approximation | first-kind Chebyshev samples and direct DCT-II, degree at most 512 | `O(n²)` | `O(n)` | heuristic |

The spline stores interval coefficients in the readable power basis
`a + b*dx + c*dx² + d*dx³`. Not-a-knot and periodic systems are still solved
in linear time; large problems do not silently enter a dense solve.

Global barycentric interpolation fails closed above 32 nodes. At or below that
limit every result is checked at off-node points against an independently
constructed Newton form. Larger binary64 global polynomials cannot honestly
claim this validation; use fewer nodes, Chebyshev approximation, or
`method="linear"` instead.

## Boundary conditions

The endpoint equations are explicit construction data:

```python
# Default: first two and last two pieces share a cubic.
cubic_spline(x, y, boundary="not-a-knot")

# S'' is zero at both endpoints.
cubic_spline(x, y, boundary="natural")

# S' is zero at both endpoints.
cubic_spline(x, y, boundary="clamped")

# S'(x[0]) = left_slope and S'(x[-1]) = right_slope.
cubic_spline(x, y, boundary=(left_slope, right_slope))

# Mixed derivative orders, each 1 or 2.
cubic_spline(x, y, boundary=((2, left_second), (1, right_slope)))

# Values and the first two derivatives match across the period.
cubic_spline(x, y, boundary="periodic")
```

Periodic construction requires at least three nodes and matching endpoint
values. Periodic evaluation wraps the query into the construction interval.
Other splines extrapolate their end segment by default; use
`extrapolate=False` to reject outside queries.

Piecewise-linear first derivatives and spline third derivatives are undefined
at knots where their one-sided values differ. Evaluation raises `ValueError`
at such a knot instead of silently selecting the right-hand segment. Values
and the first two spline derivatives remain well-defined by C2 continuity.

## Finite-difference planning and error evidence

Planning fixes the stencil and step without calling the function:

```python
from sagejs.numerics.approximation import (
    finite_difference_problem,
    plan_finite_difference,
    solve_finite_difference_problem,
)

problem = finite_difference_problem(
    math.exp,
    1.0,
    derivative_order=1,
    accuracy_order=4,
    derivative=math.exp,  # optional independent analytic reference
)
plan = plan_finite_difference(problem)
result = solve_finite_difference_problem(problem)
```

The automatic step balances the declared truncation order with binary64
roundoff. Execution evaluates the stencil at `h` and `h/2`, reports their
disagreement, a Richardson correction, a weighted roundoff floor, and a
cancellation index. The reported error is a diagnostic estimate, not an
interval enclosure. Without an analytic derivative, validation is therefore
`heuristic`. Supplying an analytic reference upgrades only the explicit
cross-check to `validated_approximate`; it does not make the derivative
rigorous. The analytic residual must independently meet the caller's `atol`
and `rtol`; a large heuristic error estimate never relaxes that requirement.
The generated weights are also checked against all defining polynomial moments
before the result can pass.

At a domain boundary, request `stencil="forward"` or `"backward"`. Supplying a
positive `step` overrides the automatic balance and remains visible in the
plan.

## Chebyshev approximation and Runge's example

```python
runge = lambda x: 1 / (1 + 25*x*x)
result = chebyshev_approximation(runge, [-1, 1], degree=16)
```

The constructor samples first-kind Chebyshev roots, computes coefficients in
the `T_k` basis, and uses Clenshaw recurrence for values and derivatives. Its
holdout residual and coefficient tail are useful observations, not a uniform
error proof. When `tolerance=` is supplied, failure to meet the observed
holdout target returns `status="validation_failed"`; raising the degree or
changing the model is then the appropriate response.

The reported error estimate is the maximum independent holdout residual plus
a floating-point floor. A final-coefficient tail is recorded separately only
from degree four onward; it is an indicator and is never promoted into an error
bound. Overflow-safe affine coordinates support large finite interval
endpoints. A derivative whose interval scaling cannot be represented fails
explicitly.

The corpus contrasts this result with a degree-16 polynomial through
equispaced Runge samples. A stable barycentric representation cannot repair
an intrinsically poor global node choice: the Chebyshev error is smaller even
though both computations themselves are stable.

## Failure behavior and diagnostics

- duplicate or nonfinite nodes, inconsistent sample lengths, and malformed
  boundary conditions fail before execution with `ValueError`;
- callback exceptions and nonfinite callback values produce structured
  `callback_error` and `nonfinite_evaluation` results;
- cancellation and evaluation/iteration/time limits produce structured stop
  reasons and preserve the bounded trace; the integration lane maps the exact
  `maximum_elapsed_time` reason into the shared status/diagnostic registry;
- a large sampled Lebesgue indicator emits `ill_conditioned`;
- independent-form disagreement or a large cancellation index emits
  `loss_of_significance`; and
- failed defining-equation or requested-tolerance checks emit
  `validation_failed`.

The result never upgrades sampled residual evidence to a proof. The exact
shared diagnostic additions requested from the integration lane are listed in
[`integration-requests.md`](integration-requests.md).

## Equivalent communication snippets

These snippets communicate mathematical intent; they do not assert identical
defaults or result schemas in other systems.

| Intent | Sage/Python | MATLAB | Wolfram Language |
|---|---|---|---|
| polynomial interpolation | `interpolate(x, y)` | `polyval(polyfit(x,y,n-1),q)` | `InterpolatingPolynomial[Thread[x -> y], q]` |
| cubic spline | `cubic_spline(x, y, boundary="natural")` | `interp1(x,y,q,"spline")` (different default endpoint convention) | `Interpolation[Thread[{x,y}], InterpolationOrder -> 3][q]` |
| numerical derivative | `finite_difference(f, x0)` | finite-difference stencil or `gradient` on sampled data | `ND[f, x0]` |
| Chebyshev approximation | `chebyshev_approximation(f, [a,b], n)` | sample Chebyshev nodes and fit in a Chebyshev basis | `ChebyshevT` basis projection/interpolation |

Endpoint conventions and error records must be stated when translating; a
generic “cubic” keyword is not enough to prove equivalent splines.

## Evidence

Run the portable success/failure corpus and live mature-library differentials:

```sh
node --test test/numerics/approximation/approximation-laboratory.test.cjs
python3 -I test/numerics/approximation/differential_oracles.py
python3 -I bench/numerics/approximation/benchmark.py --check
```

The dual-runtime corpus executes the same mathematical assertions under
CPython and Sage.js. The live oracle compares well-conditioned barycentric
values to SciPy, every supported spline boundary family to SciPy,
coefficients to NumPy, and derivatives to 80-digit mpmath values. See
[`algorithms.md`](algorithms.md) for the surveyed sources and equations, and
[`support-matrix.json`](support-matrix.json) for the machine-readable envelope.
