# Approximation algorithm survey and formulas

The implementation follows the repository's ordinary-Python-first rule. This
survey was completed before algorithm selection; none of the operations needs
a new native boundary for its initial production envelope.

## Mature references surveyed

- Berrut and Trefethen, [“Barycentric Lagrange
  Interpolation”](https://doi.org/10.1137/S0036144502417715), *SIAM Review* 46
  (2004), establishes barycentric interpolation as the fast, stable form of
  Lagrange interpolation and cautions against high-degree equispaced nodes.
- SciPy's documented
  [`BarycentricInterpolator`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.BarycentricInterpolator.html)
  uses the second barycentric formula and is the differential oracle.
- SciPy's documented
  [`CubicSpline`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.CubicSpline.html)
  defines the not-a-knot, periodic, clamped, natural, and explicit endpoint
  semantics used by the corpus. Its source uses banded/cyclic linear solves;
  the Sage.js implementation preserves `O(n)` construction without importing
  SciPy.
- Fornberg, [“Generation of Finite Difference Formulas on Arbitrarily Spaced
  Grids”](https://doi.org/10.1090/S0025-5718-1988-0935077-0), *Mathematics of
  Computation* 51 (1988), gives the recursive arbitrary-grid weight algorithm
  implemented here.
- SciPy's
  [`differentiate.derivative`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.differentiate.derivative.html)
  demonstrates production step refinement, explicit one-sided direction, and
  previous-estimate error evidence. Sage.js uses the smaller fixed two-level
  contract for this slice and reports its limitation.
- NumPy's
  [`chebinterpolate`](https://numpy.org/doc/stable/reference/generated/numpy.polynomial.chebyshev.chebinterpolate.html)
  uses first-kind Chebyshev samples and is the coefficient-convention oracle.

## Barycentric interpolation

For distinct nodes `x_i`, relative weights are

```text
w_i = 1 / product_{j != i}(x_i - x_j).
```

Only their ratios matter. Sage.js first maps every node to an overflow-safe
affine coordinate on `[-1,1]`, accumulates the sign and logarithm of each
scaled product, subtracts the largest logarithm, and exponentiates once. This
avoids overflow/underflow in the unscaled product over the supported envelope.
If even normalized weights underflow, construction rejects the problem and
suggests fewer nodes, Chebyshev-clustered nodes, or piecewise interpolation.

Queries use the second form

```text
p(x) = sum_i w_i y_i/(x-x_i) / sum_i w_i/(x-x_i),
```

with `math.fsum` and an exact-node branch. The sampled Lebesgue function

```text
Lambda(x) = sum_i |w_i/(x-x_i)| / |sum_i w_i/(x-x_i)|
```

is a conditioning indicator, not a forward-error bound. For at most 32 nodes,
an independently constructed Newton divided-difference form is checked at
off-node points. Larger Newton forms become a worse oracle than the
barycentric form, so the qualified global-polynomial envelope stops at 32
nodes and larger requests fail before construction. This avoids attaching a
passed validation record to a model that received no independent off-node
check.

## Cubic splines

Let `h_i = x_(i+1)-x_i`, `delta_i = (y_(i+1)-y_i)/h_i`, and `M_i = S''(x_i)`.
Interior continuity gives

```text
h_(i-1) M_(i-1) + 2(h_(i-1)+h_i) M_i + h_i M_(i+1)
    = 6(delta_i-delta_(i-1)).
```

Natural or supplied second-derivative conditions set an endpoint `M`
directly. A supplied first derivative `d_left` gives

```text
2 h_0 M_0 + h_0 M_1 = 6(delta_0-d_left),
```

with the analogous right equation. Not-a-knot eliminates the two endpoint
second derivatives from the first and last interior equations. The periodic
case solves a cyclic tridiagonal system by Sherman–Morrison and repeats
`M_0` at the final node. Two- and three-node not-a-knot cases follow the
standard line/parabola semantics documented by SciPy.

Each interval stores

```text
a_i = y_i
b_i = delta_i - h_i(2 M_i + M_(i+1))/6
c_i = M_i/2
d_i = (M_(i+1)-M_i)/(6 h_i).
```

Validation independently evaluates every node, all first/second derivative
jumps, and the chosen endpoint equations. Periodic endpoint checks explicitly
evaluate the final polynomial segment at `x[-1]`; normal periodic query
wrapping is not used by validation.

## Finite differences

Fornberg's recursion computes unit-grid weights for arbitrary distinct
offsets and derivative order. Central stencils use the smallest symmetric
grid meeting the requested formal accuracy; forward and backward stencils use
`derivative_order + accuracy_order` points.

For formal truncation order `p` and derivative order `d`, the automatic scale
starts at

```text
h = eps**(1/(p+d)) * max(1, |x|),
```

bounded below by a multiple of the representable spacing scale. The estimate
is repeated at `h/2`, and

```text
richardson = D(h/2) + (D(h/2)-D(h))/(2**p-1).
```

The result separately records the correction, weighted floating-point
roundoff floor, and cancellation index. These quantities diagnose the usual
truncation/roundoff tradeoff but do not certify an enclosure.

All polynomial moments through degree `s-1` are recomputed from the generated
weights. When an analytic derivative reference is supplied, its residual must
meet the requested absolute/relative tolerance directly. The heuristic
step-halving error cannot widen that acceptance threshold.

## Chebyshev approximation

For degree `n`, set `N=n+1` and sample at first-kind roots

```text
t_j = cos(pi*(j+1/2)/N).
```

An affine map carries them to `[a,b]`. Coefficients are the direct DCT-II

```text
c_0 = sum_j f(t_j)/N
c_k = 2 sum_j f(t_j) cos(k*pi*(j+1/2)/N)/N, k > 0.
```

Clenshaw recurrence evaluates the series. A coefficient recurrence produces
derivatives before applying an overflow-safe interval scale. Independent
holdout samples determine the reported heuristic error together with a
roundoff floor. From degree four onward a small final coefficient tail is
recorded separately as a convergence indicator; it is not folded into the
error estimate or labeled a rigorous sup-norm bound. DCT normalization is
applied to each term before summation so a representable coefficient does not
fail because an unscaled intermediate sum overflowed.

## Explanation and visualization boundary

Presentation is derived only from the detached result model and retained
semantic trace. Static views use canonical `line`, `point`, or `text`
`PlotLayer` values in a `PlotSpec`. Interpolation reveals construction samples,
spline frames reveal completed segments, Chebyshev frames evaluate successive
coefficient prefixes, and finite-difference frames compare the exact stored
coarse and halved stencils. Failed results use a semantic text layer and expose
the same status and stop reason as the explanation envelope; they never invent
a curve for a model that did not validate.

Plot sampling and animation budgets are independent of numerical execution
budgets. Static plots permit at most 4097 samples. Animations permit at most 64
frames and 257 curve samples per frame, with hard 200,000-scalar and 8 MiB JSON
materialization limits. The underlying `NumericalTrace` separately enforces
its event and byte limits with deterministic truncation. Thus requesting a
richer view cannot retroactively spend callback evaluations or create an
unbounded replay payload.
