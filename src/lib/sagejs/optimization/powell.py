"""Powell's modified direction-set method for derivative-free minimization.

M. J. D. Powell, *An efficient method for finding the minimum of a function
of several variables without calculating derivatives*, Computer Journal
7(2):155-162 (1964); see also Press, Teukolsky, Vetterling & Flannery,
*Numerical Recipes*, section 10.5. This module is a transcription of the
variant scipy actually ships as `scipy.optimize.fmin_powell` /
`_minimize_powell`, which is what Sage's `minimize(algorithm='powell')`
calls into.

The method keeps a set of `n` search directions, initially the coordinate
basis. One *iteration* sweeps the whole set, minimizing `f` exactly along
each direction in turn by a one-dimensional search — here the unbounded
Brent minimizer from `brent_minimize`, which needs no derivatives either.
After the sweep, the net displacement `x - x1` over the iteration becomes a
candidate new direction. Along a quadratic form, replacing directions this
way accumulates a conjugate set, so the method terminates in finitely many
sweeps; on a general function it behaves like a robust, slow, entirely
derivative-free descent.

The subtle part is *which* direction the new one replaces, and whether to
accept it at all. Naively dropping the direction of greatest decrease every
sweep makes the direction set collapse toward linear dependence, at which
point the method can only search a proper subspace. Powell's 1964 criterion
guards against this, and scipy implements it verbatim from *Numerical
Recipes*: with `fx` the value at the start of the sweep, `fval` the value at
the end, `delta` the largest single-direction decrease during the sweep, and
`fx2 = f(2*x - x1)` the value at the point extrapolated one full step beyond
the sweep's displacement, the new direction is accepted only when both

1. `fx2 < fx` — the extrapolated point still improves on where the sweep
   started, so there is further gain to be had along the new direction; and
2. `2*(fx - 2*fval + fx2)*(fx - fval - delta)**2 - delta*(fx - fx2)**2 < 0`
   — the direction of greatest decrease accounted for a large enough share
   of this sweep's total decrease to be worth retiring.

Test 2 is the one that is usually simplified away in textbook
re-implementations; it is written out here exactly as scipy accumulates it
into the temporary `t`, because the accept/reject decision changes the
direction set and therefore every subsequent function evaluation. When both
tests pass, the direction that produced the largest decrease is overwritten
by the last direction in the set and the new direction is appended at the
end — scipy's rotation, not a plain in-place replacement.

Convergence is scipy's relative test on the value: the run stops once
`2*(fx - fval) <= ftol*(abs(fx) + abs(fval)) + 1e-20`, i.e. once a whole
sweep of `n` line searches no longer moves the objective by a relative
`ftol`. Note this makes a *stalled* sweep indistinguishable from a converged
one, so as with Nelder-Mead the returned `converged` flag is a stopping
condition, not a certificate of optimality.

Example:

```python
from sagejs.optimization.powell import powell

result = powell(lambda v: (v[0] - 1.0) ** 2 + (v[1] + 2.0) ** 2, [0.0, 0.0])
assert abs(result.x[0] - 1.0) < 1e-4
assert abs(result.x[1] + 2.0) < 1e-4
```
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from .brent_minimize import BracketError, BracketResult, brent

_INFINITY = float("inf")
"""IEEE `+inf`; the Sage.js `math` module has no `math.inf` attribute."""

_CONVERGENCE_FLOOR = 1e-20
"""scipy's additive floor in the `ftol` test, keeping it usable at `f == 0`."""


class _MaxFuncCallError(Exception):
    """Internal control-flow signal: the function-call budget was reached.

    scipy raises the same exception from inside its counting wrapper, so a
    budget overrun aborts whatever line search is in progress and unwinds to
    the main loop. That matters for reproducing scipy's evaluation counts
    exactly: the run stops *mid* line search, not at the next iteration
    boundary, and the partial search's result is discarded.
    """


@dataclass(frozen=True)
class PowellResult:
    """The outcome of a Powell direction-set minimization run.

    Attributes:
        x: The best point found.
        fun: The value of `f` at `x`.
        direc: The final direction set, as `n` vectors of length `n`. Passing
            it back as the `direc` argument of a follow-up call resumes with
            the conjugate directions already accumulated.
        iterations: The number of completed sweeps over the direction set.
        function_calls: The total number of calls made to `f`.
        converged: `True` exactly when `flag == "converged"`.
        flag: A readable status string: `"converged"`,
            `"maximum function evaluations reached"`,
            `"maximum iterations reached"`, or `"nan encountered"`. These
            correspond to scipy's `warnflag` values `0`, `1`, `2` and `3`,
            and are tested in that order.
    """

    x: list[float]
    fun: float
    direc: list[list[float]]
    iterations: int
    function_calls: int
    converged: bool
    flag: str


def powell(
    f: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    xtol: float = 1e-4,
    ftol: float = 1e-4,
    maxiter: int | None = None,
    maxfev: int | None = None,
    direc: Sequence[Sequence[float]] | None = None,
) -> PowellResult:
    """Minimize scalar-valued `f` over `n` real variables by Powell's method.

    A transcription of scipy's `_minimize_powell`, the routine behind
    `scipy.optimize.fmin_powell` and `minimize(method='powell')`. No
    derivatives are used or estimated; every step comes from one-dimensional
    minimizations along the evolving direction set described in the module
    docstring.

    Args:
        f: The objective; called with a sequence of `n` floats.
        x0: The starting point, which fixes `n = len(x0)`.
        xtol: The line-search tolerance. Each one-dimensional Brent search
            runs with relative tolerance `xtol * 100`, scipy's scaling.
        ftol: The relative tolerance on `f` for the sweep-to-sweep
            convergence test.
        maxiter: The maximum number of sweeps over the direction set.
        maxfev: The maximum number of calls to `f`. Overrunning this aborts
            the line search in progress, so the returned point is the best
            completed one.
        direc: The initial direction set, `n` vectors of length `n`,
            defaulting to the identity basis (unit steps along each
            coordinate, tried in index order). A zero row suppresses its
            coordinate on the first sweep; a scaled row changes that
            coordinate's initial step. Directions are free to change as the
            minimization proceeds.

    Returns:
        A `PowellResult`.

    Raises:
        ValueError: If `direc` is not `n` vectors of length `n`.

    Note:
        `maxiter` and `maxfev` both default to `n * 1000` when neither is
        given; supplying one leaves the other unbounded. This is scipy's
        rule, and it means the bare-defaults budget scales with the problem
        size rather than being a fixed constant.

        Unlike scipy, this does not warn when `direc` is rank-deficient: the
        rank test needs a matrix decomposition, and a deficient set is a
        documented (if usually unintended) way to restrict the search to a
        subspace. The behavior is otherwise identical.
    """
    x = [float(v) for v in x0]
    n = len(x)

    default_limit = float(n * 1000)
    maxiter_limit = _resolve_limit(maxiter, maxfev, default_limit)
    maxfev_limit = _resolve_limit(maxfev, maxiter, default_limit)

    directions = _initial_directions(direc, n)

    function_calls = 0

    def evaluate(point: Sequence[float]) -> float:
        nonlocal function_calls
        if function_calls >= maxfev_limit:
            raise _MaxFuncCallError
        function_calls += 1
        return float(f(list(point)))

    line_tol = xtol * 100

    fval = evaluate(x)
    x1 = list(x)
    iterations = 0

    while True:
        try:
            fx = fval
            bigind = 0
            delta = 0.0
            for i in range(n):
                direc1 = list(directions[i])
                fx2 = fval
                fval, x, direc1 = _linesearch_powell(
                    evaluate, x, direc1, tol=line_tol, fval=fval
                )
                if (fx2 - fval) > delta:
                    delta = fx2 - fval
                    bigind = i
            iterations += 1

            bnd = ftol * (abs(fx) + abs(fval)) + _CONVERGENCE_FLOOR
            if 2.0 * (fx - fval) <= bnd:
                break
            if function_calls >= maxfev_limit:
                break
            if iterations >= maxiter_limit:
                break
            if math.isnan(fx) and math.isnan(fval):
                # Ended up in a nan-region: bail out.
                break

            # The extrapolated point, one further step along the net
            # displacement this sweep produced.
            direc1 = [xi - x1i for xi, x1i in zip(x, x1, strict=True)]
            x1 = list(x)
            x2 = [xi + d for xi, d in zip(x, direc1, strict=True)]
            fx2 = evaluate(x2)

            if fx > fx2:
                # Powell's 1964 acceptance criterion, accumulated exactly as
                # scipy writes it. `t < 0` is condition 2 of the module
                # docstring; the enclosing `fx > fx2` is condition 1.
                t = 2.0 * (fx + fx2 - 2.0 * fval)
                temp = fx - fval - delta
                t *= temp * temp
                temp = fx - fx2
                t -= delta * temp * temp
                if t < 0.0:
                    fval, x, direc1 = _linesearch_powell(
                        evaluate, x, direc1, tol=line_tol, fval=fval
                    )
                    if any(v != 0.0 for v in direc1):
                        directions[bigind] = list(directions[-1])
                        directions[-1] = direc1
        except _MaxFuncCallError:
            break

    if function_calls >= maxfev_limit:
        flag = "maximum function evaluations reached"
    elif iterations >= maxiter_limit:
        flag = "maximum iterations reached"
    elif math.isnan(fval) or any(math.isnan(v) for v in x):
        flag = "nan encountered"
    else:
        flag = "converged"

    return PowellResult(
        x=list(x),
        fun=fval,
        direc=[list(row) for row in directions],
        iterations=iterations,
        function_calls=function_calls,
        converged=(flag == "converged"),
        flag=flag,
    )


def _linesearch_powell(
    f: Callable[[Sequence[float]], float],
    p: list[float],
    xi: list[float],
    tol: float,
    fval: float | None,
) -> tuple[float, list[float], list[float]]:
    """Minimize `f(p + alpha*xi)` over `alpha`, returning the step taken.

    scipy's `_linesearch_powell`, restricted to the unbounded case (this
    module exposes no `bounds` argument, so scipy's `lower_bound`/
    `upper_bound` branches and their `arctan` change of variables are not
    reachable).

    A zero direction is skipped without evaluating anything, reusing the
    supplied `fval` — this is why the driver threads the current value
    through: it saves one call per suppressed coordinate.

    When the bracketing search fails (a monotone or otherwise unbracketable
    ride along `xi`), scipy does not propagate the error out of Powell.
    `scipy.optimize._recover_from_bracket_error` catches it and falls back
    to the best of the three points the failed bracket did produce, with the
    evaluations still charged to the budget. That fallback is reproduced
    here, since it changes both the step taken and the count.

    Returns:
        A tuple `(fret, p_new, xi_scaled)`: the value at the new point, the
        new point `p + alpha*xi`, and the actual displacement `alpha*xi`.
    """
    if not any(v != 0.0 for v in xi):
        # `xi` is identically zero, so there is nothing to search along.
        # NaN entries count as nonzero here, matching `np.any`.
        return (fval, p, xi) if fval is not None else (f(p), p, xi)

    def along(alpha: float) -> float:
        return f([pi + alpha * xii for pi, xii in zip(p, xi, strict=True)])

    try:
        result = brent(along, tol=tol)
        alpha_min = result.x
        fret = result.fun
    except BracketError as error:
        alpha_min, fret = _best_of_failed_bracket(error.result)

    step = [alpha_min * v for v in xi]
    return fret, [pi + s for pi, s in zip(p, step, strict=True)], step


def _best_of_failed_bracket(result: BracketResult) -> tuple[float, float]:
    """Return `(x, f(x))` for the best point of an invalid bracket.

    scipy's `_recover_from_bracket_error`: if any of the six numbers is NaN
    the whole line search degenerates to NaN, otherwise the lowest of the
    three bracket values wins, ties going to the earliest (`np.argmin`).
    """
    xs = [result.xa, result.xb, result.xc]
    fs = [result.fa, result.fb, result.fc]
    if any(math.isnan(v) for v in xs) or any(math.isnan(v) for v in fs):
        nan = float("nan")
        return nan, nan
    best = 0
    for index in (1, 2):
        if fs[index] < fs[best]:
            best = index
    return xs[best], fs[best]


def _initial_directions(
    direc: Sequence[Sequence[float]] | None, n: int
) -> list[list[float]]:
    """Return the starting direction set: `direc` validated, or the identity."""
    if direc is None:
        return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    rows = [[float(v) for v in row] for row in direc]
    if len(rows) != n or any(len(row) != n for row in rows):
        raise ValueError("`direc` must be `n` direction vectors of length `n`")
    return rows


def _resolve_limit(
    primary: int | None, other: int | None, default_limit: float
) -> float:
    """Resolve one of `maxiter`/`maxfev` against the other, scipy's rule.

    If `primary` is given, it wins outright. Otherwise, if `other` is also
    unset, both default to `default_limit` (`n * 1000`). Otherwise `other`
    is a genuine user-supplied bound, so `primary` becomes unbounded
    (`+inf`) — unless `other` itself is already unbounded, in which case
    both fall back to `default_limit` to avoid an unbounded run.
    """
    if primary is not None:
        return float(primary)
    if other is None:
        return default_limit
    if float(other) == _INFINITY:
        return default_limit
    return _INFINITY
