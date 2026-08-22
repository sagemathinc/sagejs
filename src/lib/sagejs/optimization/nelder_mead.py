"""The Nelder-Mead downhill simplex method for derivative-free minimization.

This module implements Nelder & Mead, *A Simplex Method for Function
Minimization*, Computer Journal 7:308-313 (1965): the classic reflect /
expand / contract / shrink update of a simplex of `n + 1` points in `n`
dimensions. It has no derivative requirement and evaluates `f` only at
simplex vertices.

The four move coefficients (traditionally `alpha`, `gamma`, `beta`, `delta`
in the original paper) are exposed as explicit parameters rather than
hard-coded, because this implementation serves two callers with different
naming conventions for the same defaults:

* scipy's `_minimize_neldermead` (`rho=1.0`, `chi=2.0`, `psi=0.5`,
  `sigma=0.5`), which Sage's `minimize(algorithm='simplex')` inherits.
* Wolfram `NMinimize`'s `"ReflectRatio"`/`"ExpandRatio"`/`"ContractRatio"`/
  `"ShrinkRatio"` (numerically the same defaults, but user-settable).

The initial simplex, when not supplied explicitly, follows scipy's rule
(also documented in Baudin's survey of Nelder-Mead variants): vertex
`i + 1` is `x0` with coordinate `i` scaled by `1.05`, except that a zero
coordinate is replaced by `0.00025`.

Convergence uses scipy's two-part test: the run stops successfully once
*both* the maximum coordinate spread across the simplex is at most `xatol`
*and* the maximum spread of function values at the vertices is at most
`fatol`.

McKinnon (1998), *Convergence of the Nelder-Mead Simplex Method to a
Nonstationary Point*, SIAM J. Optim. 9(1):148-158, exhibits a family of
smooth, strictly convex functions for which the unmodified method above
stalls at a non-stationary point: repeated inside contractions collapse the
simplex onto a line orthogonal to the steepest-descent direction. This is a
property of the algorithm itself, not a bug in a particular implementation;
callers minimizing ill-conditioned or adversarial objectives should treat
convergence as a heuristic stopping condition, not a certificate of
optimality, and should consider restarting from the reported optimum.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass

_NONZERO_SCALE = 0.05
"""scipy's `nonzdelt`: a nonzero coordinate `x0[i]` becomes `x0[i] * 1.05`."""

_ZERO_DELTA = 0.00025
"""scipy's `zdelt`: a zero coordinate `x0[i]` becomes `0.00025`."""

_INFINITY = float("inf")
"""IEEE `+inf`; the Sage.js `math` module has no `math.inf` attribute."""


class _BudgetExhausted(Exception):
    """Internal control-flow signal: the function-call budget was reached."""


@dataclass(frozen=True)
class NelderMeadResult:
    """The outcome of a Nelder-Mead minimization run.

    `flag` is one of `"converged"` (both tolerance tests passed),
    `"maxiter"` (the iteration limit was reached first), or `"maxfev"` (the
    function-evaluation limit was reached first). `converged` is `True`
    exactly when `flag == "converged"`. `simplex` is the final simplex,
    sorted so that `simplex[0]` is the best vertex (equal to `x`) and
    `simplex[-1]` is the worst.
    """

    x: list[float]
    fun: float
    iterations: int
    function_calls: int
    converged: bool
    flag: str
    simplex: list[list[float]]


def nelder_mead(
    f: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    xatol: float = 1e-4,
    fatol: float = 1e-4,
    maxiter: int | None = None,
    maxfev: int | None = None,
    reflect: float = 1.0,
    expand: float = 2.0,
    contract: float = 0.5,
    shrink: float = 0.5,
    initial_simplex: Sequence[Sequence[float]] | None = None,
) -> NelderMeadResult:
    """Minimize scalar-valued `f` over `n` real variables by downhill simplex.

    `x0` gives the starting point and fixes the dimension `n = len(x0)`.
    When `initial_simplex` is `None`, the starting simplex is built from
    `x0` by scipy's rule (see module docstring); otherwise `initial_simplex`
    must be an `(n + 1, n)` sequence of vertices and overrides `x0`'s
    coordinates (only its length is used).

    `reflect`, `expand`, `contract`, and `shrink` are the four move
    coefficients — scipy's `rho`, `chi`, `psi`, `sigma`, equivalently
    Wolfram `NMinimize`'s `"ReflectRatio"`, `"ExpandRatio"`,
    `"ContractRatio"`, `"ShrinkRatio"`. The defaults `1.0, 2.0, 0.5, 0.5`
    match both conventions.

    `maxiter` and `maxfev` default to `n * 200` when both are `None`
    (scipy's rule). When only one is given, the other becomes unbounded.

    Vertices are ranked by function value, breaking exact ties by the
    vertex's own coordinates in lexicographic order, so that repeated runs
    on the same inputs are bit-identical regardless of any incidental
    ordering in `f`'s implementation. A vertex where `f` returns NaN is
    always ranked worst (never accepted as an improvement, never mistaken
    for a converged spread), so a NaN evaluation cannot silently produce a
    false convergence.
    """
    x0 = [float(v) for v in x0]
    n = len(x0)

    if initial_simplex is None:
        simplex = _initial_simplex(x0)
    else:
        simplex = [[float(v) for v in vertex] for vertex in initial_simplex]
        if len(simplex) != n + 1 or any(len(vertex) != n for vertex in simplex):
            raise ValueError(
                "`initial_simplex` must have shape `(n + 1, n)` matching `x0`"
            )

    default_limit = float(n * 200)
    maxiter_limit = _resolve_limit(maxiter, maxfev, default_limit)
    maxfev_limit = _resolve_limit(maxfev, maxiter, default_limit)

    function_calls = 0
    values = [_INFINITY] * (n + 1)

    def evaluate(point: list[float]) -> float:
        nonlocal function_calls
        if function_calls >= maxfev_limit:
            raise _BudgetExhausted
        function_calls += 1
        return float(f(point))

    try:
        for index, vertex in enumerate(simplex):
            values[index] = evaluate(vertex)
    except _BudgetExhausted:
        pass

    simplex, values = _sorted_simplex(simplex, values)

    iterations = 1
    converged = False
    flag = "maxiter"

    while function_calls < maxfev_limit and iterations < maxiter_limit:
        if _converged(simplex, values, xatol, fatol):
            converged = True
            flag = "converged"
            break

        try:
            _step(simplex, values, evaluate, reflect, expand, contract, shrink, n)
        except _BudgetExhausted:
            flag = "maxfev"
            break

        iterations += 1
        simplex, values = _sorted_simplex(simplex, values)
    else:
        flag = "maxfev" if function_calls >= maxfev_limit else "maxiter"

    return NelderMeadResult(
        x=list(simplex[0]),
        fun=values[0],
        iterations=iterations,
        function_calls=function_calls,
        converged=converged,
        flag=flag,
        simplex=[list(vertex) for vertex in simplex],
    )


def _resolve_limit(
    primary: int | None, other: int | None, default_limit: float
) -> float:
    """Resolve one of `maxiter`/`maxfev` against the other, scipy's rule.

    If `primary` is given, it wins outright. Otherwise, if `other` is also
    unset, both default to `default_limit` (`n * 200`). Otherwise `other`
    is a genuine user-supplied bound, so `primary` becomes unbounded
    (`+inf`) — unless `other` itself is already unbounded, in which
    case both fall back to `default_limit` to avoid an unbounded run.
    """
    if primary is not None:
        return float(primary)
    if other is None:
        return default_limit
    if float(other) == _INFINITY:
        return default_limit
    return _INFINITY


def _initial_simplex(x0: list[float]) -> list[list[float]]:
    """Build the starting simplex from `x0` by scipy's coordinate-scale rule."""
    n = len(x0)
    simplex = [list(x0)]
    for k in range(n):
        vertex = list(x0)
        if vertex[k] != 0:
            vertex[k] = vertex[k] * (1.0 + _NONZERO_SCALE)
        else:
            vertex[k] = _ZERO_DELTA
        simplex.append(vertex)
    return simplex


def _centroid(vertices: list[list[float]]) -> list[float]:
    """Return the componentwise mean of `vertices` (all but the worst vertex)."""
    count = len(vertices)
    dimension = len(vertices[0])
    return [sum(vertex[i] for vertex in vertices) / count for i in range(dimension)]


def _extrapolate(xbar: list[float], worst: list[float], coeff: float) -> list[float]:
    """Return `xbar + coeff * (xbar - worst)`.

    Every reflect/expand/contract move is this one formula at a different
    `coeff`: `coeff = reflect` for reflection, `reflect * expand` for
    expansion, `contract * reflect` for outside contraction, and
    `-contract` for inside contraction.
    """
    return [xb + coeff * (xb - w) for xb, w in zip(xbar, worst, strict=True)]


def _shrink_vertex(best: list[float], vertex: list[float], sigma: float) -> list[float]:
    """Return `vertex` shrunk toward `best` by ratio `sigma`."""
    return [b + sigma * (v - b) for b, v in zip(best, vertex, strict=True)]


def _step(
    simplex: list[list[float]],
    values: list[float],
    evaluate: Callable[[list[float]], float],
    reflect: float,
    expand: float,
    contract: float,
    shrink: float,
    n: int,
) -> None:
    """Perform one reflect/expand/contract/shrink step, mutating `simplex`/`values`.

    `simplex` and `values` must already be sorted best-to-worst. On return
    they are updated in place but *not* re-sorted; the caller re-sorts.
    Raises `_BudgetExhausted` (via `evaluate`) if the function-call budget
    runs out partway through; in that case the step's partial candidate
    evaluations are simply discarded and the simplex from before the step
    is left untouched, so a truncated step never applies a half-finished
    update.
    """
    xbar = _centroid(simplex[:-1])
    worst = simplex[-1]

    xr = _extrapolate(xbar, worst, reflect)
    fxr = evaluate(xr)

    if fxr < values[0]:
        xe = _extrapolate(xbar, worst, reflect * expand)
        fxe = evaluate(xe)
        if fxe < fxr:
            simplex[-1], values[-1] = xe, fxe
        else:
            simplex[-1], values[-1] = xr, fxr
        return

    if fxr < values[-2]:
        simplex[-1], values[-1] = xr, fxr
        return

    if fxr < values[-1]:
        xc = _extrapolate(xbar, worst, contract * reflect)
        fxc = evaluate(xc)
        if fxc <= fxr:
            simplex[-1], values[-1] = xc, fxc
            return
    else:
        xcc = _extrapolate(xbar, worst, -contract)
        fxcc = evaluate(xcc)
        if fxcc < values[-1]:
            simplex[-1], values[-1] = xcc, fxcc
            return

    for j in range(1, n + 1):
        simplex[j] = _shrink_vertex(simplex[0], simplex[j], shrink)
        values[j] = evaluate(simplex[j])


def _sort_key(entry: tuple[list[float], float]) -> tuple[float, tuple[float, ...]]:
    """Sort key ranking `(vertex, value)` by value, then lexicographically.

    A NaN value is mapped to `+inf` for ordering purposes only (the actual
    `value` returned elsewhere is untouched), so a NaN vertex always sorts
    as worst. Ties (equal, including equal-NaN, sort values) are broken by
    the vertex's own coordinates, giving a total order so repeated runs are
    deterministic.
    """
    vertex, value = entry
    ordering_value = _INFINITY if math.isnan(value) else value
    return (ordering_value, tuple(vertex))


def _sorted_simplex(
    simplex: list[list[float]], values: list[float]
) -> tuple[list[list[float]], list[float]]:
    """Return `(simplex, values)` re-ordered best-to-worst by `_sort_key`."""
    pairs = sorted(zip(simplex, values, strict=True), key=_sort_key)
    return [list(vertex) for vertex, _ in pairs], [value for _, value in pairs]


def _max_coordinate_spread(best: list[float], simplex: list[list[float]]) -> float:
    """Return the maximum absolute coordinate difference from `best` to any vertex."""
    worst = 0.0
    for vertex in simplex[1:]:
        for coord, best_coord in zip(vertex, best, strict=True):
            diff = abs(coord - best_coord)
            if diff > worst:
                worst = diff
    return worst


def _max_abs_diff(base: float, others: Iterable[float]) -> float:
    """Return the maximum of `abs(base - other)`, or `+inf` if any value is NaN.

    Plain `max()` over values containing NaN can silently drop the NaN
    (comparisons against NaN are always false, so it never wins and never
    loses a `max()` comparison), which would let a NaN function value pass
    unnoticed. Returning `+inf` instead makes a NaN spread visibly fail
    every tolerance test.
    """
    if math.isnan(base):
        return _INFINITY
    worst = 0.0
    for other in others:
        if math.isnan(other):
            return _INFINITY
        diff = abs(base - other)
        if diff > worst:
            worst = diff
    return worst


def _converged(
    simplex: list[list[float]], values: list[float], xatol: float, fatol: float
) -> bool:
    """scipy's convergence test: both the coordinate spread and value spread are small."""
    spread_x = _max_coordinate_spread(simplex[0], simplex)
    spread_f = _max_abs_diff(values[0], values[1:])
    return spread_x <= xatol and spread_f <= fatol
