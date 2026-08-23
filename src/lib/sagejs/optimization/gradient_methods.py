"""Gradient-based descent: BFGS, nonlinear conjugate gradient, Newton-CG.

Three quasi-Newton and Newton-type minimizers live here, transcribed from
`scipy.optimize._optimize._minimize_bfgs`, `_minimize_cg` and
`_minimize_newtoncg` — the routines behind `scipy.optimize.fmin_bfgs`,
`fmin_cg` and `fmin_ncg`. Sage's `minimize(algorithm='bfgs'|'cg'|'ncg')`
calls straight into these three, passing `fprime` (and, for `ncg`, both
`fhess` and `fhess_p` together — scipy then prefers the dense `fhess`), so
this module targets their exact evaluation sequences rather than a textbook
description of the algorithms.

All three share one convergence idiom (a gradient-norm or step-size test,
the same three warning flags) and, more importantly, the *same* line search:
`line_search.line_search_wolfe12`, the MINPACK `dcsrch` search with a
Nocedal-Wright bracket-and-zoom fallback. That is why they live in one
module instead of three: splitting the line-search plumbing three ways
would invite the three copies to drift out of step with scipy and with each
other.

* `fmin_bfgs` / `_minimize_bfgs` — Nocedal and Wright, *Numerical
  Optimization*, 2nd ed., Springer (2006), Algorithm 6.1 (p. 140): a
  quasi-Newton method updating an approximate *inverse* Hessian `Hk` after
  every accepted step via the BFGS formula. `c1 = 1e-4`, `c2 = 0.9`.
* `fmin_cg` / `_minimize_cg` — the Polak-Ribiere-*plus* nonlinear conjugate
  gradient method, R. Fletcher, *Practical Methods of Optimization*, Wiley
  (2000): the update coefficient `beta_k` is clamped to `max(0, ...)` rather
  than the plain Polak-Ribiere ratio, which is what keeps the method
  restarting toward steepest descent instead of accumulating a bad
  direction. Gilbert and Nocedal, *Global convergence properties of
  conjugate gradient methods for optimization*, SIAM J. Optimization 2:21
  (1992), is why a plain strong-Wolfe step is not enough here: the method
  additionally rejects any step that does not leave `pk` a sufficient
  descent direction (`extra_condition` below), which is the one place a
  `line_search_wolfe12` fallback happens for a reason other than the primary
  search failing outright. `c1 = 1e-4`, `c2 = 0.4` — tighter curvature than
  BFGS, because Polak-Ribiere-plus needs the new gradient closer to
  orthogonal to the old search direction for `beta_k` to behave.
* `fmin_ncg` / `_minimize_newtoncg` — truncated ("inexact") Newton-CG,
  Nocedal and Wright, chapter 7: each outer step solves
  `hess(xk) @ p = -grad f(xk)` only approximately, by running linear CG on
  that system and stopping early once the residual has shrunk by the
  Nocedal-Wright forcing sequence `eta_k = min(0.5, sqrt(|grad f(xk)|_1))`
  rather than solving it exactly — solving exactly would waste work far
  from the solution, where the local quadratic model is not trustworthy
  anyway. The Hessian only ever appears as a matrix-vector product, so it
  accepts a dense `fhess`, a product-only `fhess_p`, or neither (a
  forward-difference product on `fprime`, `approx_fhess_p` below); when both
  `fhess` and `fhess_p` are given, `fhess` wins, exactly as scipy prefers it.
  Same Wolfe parameters as BFGS, `c1 = 1e-4`, `c2 = 0.9`, but *not* the
  widened `amin = 1e-100`, `amax = 1e100` bracket BFGS and CG pass — scipy's
  `_minimize_newtoncg` calls `_line_search_wolfe12` with neither keyword, so
  this module does not either.

Two counting choices, both deliberate:

* `line_search_wolfe12` counts every evaluation made by *both* Wolfe
  searches when the first one fails over to the second, where scipy's
  `_line_search_wolfe12` keeps only the fallback's `fc`/`gc` and silently
  drops the first search's tally. This module inherits that honesty rather
  than reproducing the undercount: `nfev`/`njev` below are the true number of
  calls made to the caller's `fun`/`jac`, and will run higher than scipy's
  reported counts on any iteration where the search falls back.
* scipy's `_prepare_scalar_function` wraps the objective in a
  `ScalarFunction` that memoizes the value and gradient at the most
  recently visited point, so a `fun(xk)` immediately followed by a
  `jac(xk)` costs one evaluation of each rather than two — and, when `jac`
  is a finite-difference approximation, the memoized function value at `xk`
  is reused as the base point, so a gradient there costs `n` evaluations of
  `fun` rather than `n + 1`. This module keeps no such general memoization:
  every call to `fun`/`jac`/`fhess`/`fhess_p` inside this module is a real
  call, counted as one, EXCEPT where a value scipy would get for free from
  that cache is instead threaded through explicitly, structurally, at zero
  extra bookkeeping cost:
    * every driver reuses `line_search_wolfe12`'s returned gradient at the
      new point as next iteration's "current gradient" rather than asking
      `jac` for it again — this is what keeps BFGS's and CG's `njev` in
      step with scipy's, and it is why Newton-CG's outer loop computes
      `grad f(xk)` once before the loop and then only ever *carries it
      forward*, never re-deriving it at the top of an iteration the way a
      literal transcription of scipy's Python would (scipy's own
      `b = -fprime(xk)` there is a cache hit after the first iteration; a
      naive port that recomputes it here would not be, and would inflate
      `njev`);
    * Newton-CG's forward-difference Hessian-vector product needs
      `grad f(xk)` at the *same* `xk` the outer loop already just
      computed, so `approx_fhess_p` takes that gradient as an argument
      rather than recomputing it.
  The one place this module does *not* chase scipy's caching is the general
  finite-difference-gradient case: computing `grad f(x)` by forward
  differences here always costs `len(x) + 1` calls to `fun` (via
  `line_search.approx_fprime`), one more than scipy's memoized `len(x)`,
  whenever a fresh finite-difference gradient is needed at a point where
  `fun` was already known. Reproducing that saving would mean giving
  `approx_fprime` a way to skip its own base-point evaluation, which this
  module does not do — see `approx_fprime`'s docstring in `line_search`.

One consequence of carrying Newton-CG's gradient forward: this module's
`NewtonCGResult.jac` is `grad f(x)` at the *returned* `x`, whereas scipy's
`fmin_ncg`/`_minimize_newtoncg` reports whichever gradient its last
completed outer iteration computed *before* that iteration's own step —
stale by one iteration, an artifact of a loop variable scipy's Python never
refreshes after the step. Nothing exercises that field's exact value here;
where fidelity and a small, free correctness improvement pointed the same
direction, the improvement won.

Example:

```python
from sagejs.optimization.gradient_methods import fmin_bfgs

f = lambda v: (v[0] - 1.0) ** 2 + (v[1] + 2.0) ** 2
g = lambda v: [2.0 * (v[0] - 1.0), 2.0 * (v[1] + 2.0)]
result = fmin_bfgs(f, [0.0, 0.0], fprime=g)
assert abs(result.x[0] - 1.0) < 1e-4
assert abs(result.x[1] + 2.0) < 1e-4
assert result.status == 0
```
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from .line_search import (
    EPSILON,
    LineSearchError,
    approx_fprime,
    line_search_wolfe12,
)

__all__ = [
    "BFGSResult",
    "CGResult",
    "NewtonCGResult",
    "fmin_bfgs",
    "fmin_cg",
    "fmin_ncg",
]

_INFINITY = float("inf")
"""IEEE `+inf`; the Sage.js `math` module has no `math.inf` attribute."""

# `sys.float_info.epsilon`, spelled as scipy's `np.finfo(np.float64).eps`
# literal so that no platform lookup can drift from the value scipy uses in
# Newton-CG's curvature test.
_FLOAT64_EPS = 2.220446049250313e-16

_STATUS_SUCCESS = "Optimization terminated successfully."
_STATUS_MAXITER = "Maximum number of iterations has been exceeded."
_STATUS_PR_LOSS = "Desired error not necessarily achieved due to precision loss."
_STATUS_NAN = "NaN result encountered."
_STATUS_NOT_POSITIVE_DEFINITE = (
    "CG iterations didn't converge. The Hessian is not positive definite."
)


# ---------------------------------------------------------------------------
# Small vector/matrix helpers. There is no numpy in this package.
# ---------------------------------------------------------------------------


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    """The Euclidean inner product of two equal-length vectors."""
    total = 0.0
    for ai, bi in zip(a, b, strict=True):
        total += ai * bi
    return total


def _axpy(alpha: float, x: Sequence[float], y: Sequence[float]) -> list[float]:
    """`alpha*x + y`, elementwise."""
    return [alpha * xi + yi for xi, yi in zip(x, y, strict=True)]


def _vecnorm(x: Sequence[float], ord: float = 2.0) -> float:
    """`numpy.linalg.norm`'s `vecnorm` helper: an order-`ord` vector norm.

    `ord = inf` is the max absolute entry, `ord = -inf` the min; any other
    `ord` is the usual `(sum(|x_i|**ord))**(1/ord)`, so `ord = 2.0` (the
    default here) is the Euclidean norm and `ord = 1.0` the sum of absolute
    values.
    """
    if not x:
        return 0.0
    if ord == _INFINITY:
        return max(abs(xi) for xi in x)
    if ord == -_INFINITY:
        return min(abs(xi) for xi in x)
    total = 0.0
    for xi in x:
        total += abs(xi) ** ord
    return total ** (1.0 / ord)


def _l1_norm(x: Sequence[float]) -> float:
    """The sum of absolute values, `numpy.linalg.norm(x, ord=1)`."""
    return sum(abs(xi) for xi in x)


def _is_nan(value: float) -> bool:
    return value != value


def _any_nan(x: Sequence[float]) -> bool:
    return any(_is_nan(xi) for xi in x)


def _identity(n: int) -> list[list[float]]:
    return [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]


def _outer(a: Sequence[float], b: Sequence[float]) -> list[list[float]]:
    return [[ai * bj for bj in b] for ai in a]


def _mat_vec(a: Sequence[Sequence[float]], x: Sequence[float]) -> list[float]:
    return [_dot(row, x) for row in a]


def _mat_matmul(
    a: Sequence[Sequence[float]], b: Sequence[Sequence[float]]
) -> list[list[float]]:
    n = len(a)
    inner = len(b)
    m = len(b[0]) if inner else 0
    result = [[0.0] * m for _ in range(n)]
    for i in range(n):
        row_a = a[i]
        row_r = result[i]
        for k in range(inner):
            aik = row_a[k]
            if aik == 0.0:
                continue
            row_b = b[k]
            for j in range(m):
                row_r[j] += aik * row_b[j]
    return result


def _mat_add(
    a: Sequence[Sequence[float]], b: Sequence[Sequence[float]]
) -> list[list[float]]:
    return [
        [aij + bij for aij, bij in zip(row_a, row_b, strict=True)]
        for row_a, row_b in zip(a, b, strict=True)
    ]


def _mat_sub(
    a: Sequence[Sequence[float]], b: Sequence[Sequence[float]]
) -> list[list[float]]:
    return [
        [aij - bij for aij, bij in zip(row_a, row_b, strict=True)]
        for row_a, row_b in zip(a, b, strict=True)
    ]


def _mat_scale(a: Sequence[Sequence[float]], s: float) -> list[list[float]]:
    return [[s * aij for aij in row] for row in a]


# ---------------------------------------------------------------------------
# Shared evaluation bookkeeping.
# ---------------------------------------------------------------------------


@dataclass
class _EvalCounts:
    """Mutable counters threaded through the closures below.

    Not part of the public API — the frozen `*Result` dataclasses expose the
    final totals as `nfev`/`njev`/`nhev`.
    """

    nfev: int = 0
    njev: int = 0
    nhev: int = 0


def _make_evaluators(
    fun: Callable[[Sequence[float]], float],
    jac: Callable[[Sequence[float]], Sequence[float]] | None,
    eps: float,
    counts: _EvalCounts,
) -> tuple[
    Callable[[Sequence[float]], float], Callable[[Sequence[float]], list[float]]
]:
    """Wrap `fun`/`jac` into counted callables sharing one `_EvalCounts`.

    When `jac` is `None`, the returned gradient falls back to
    `line_search.approx_fprime` evaluated *through* the same counted `f`, so
    every forward-difference probe it makes is charged to `nfev` exactly
    once — the same convention `scipy`'s `ScalarFunction.nfev` uses to fold
    finite-difference probes into the function-evaluation total, distinct
    from `njev`, which counts calls to "the gradient" as one unit each
    regardless of how many `fun` probes it took.
    """

    def f(x: Sequence[float]) -> float:
        counts.nfev += 1
        return float(fun(list(x)))

    if jac is None:

        def grad(x: Sequence[float]) -> list[float]:
            counts.njev += 1
            return approx_fprime(list(x), f, eps)

    else:

        def grad(x: Sequence[float]) -> list[float]:
            counts.njev += 1
            return [float(v) for v in jac(list(x))]

    return f, grad


# ---------------------------------------------------------------------------
# BFGS
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BFGSResult:
    """The outcome of a BFGS minimization.

    Attributes:
        x: The best point found.
        fun: `f(x)`.
        jac: `grad f(x)`.
        hess_inv: The final approximate inverse Hessian, `n` vectors of
            length `n`.
        nit: The number of accepted steps.
        nfev: Calls made to the objective, including every forward-difference
            probe when no analytic gradient was supplied.
        njev: Calls made to "the gradient" — one per request, regardless of
            how many `nfev` it cost.
        status: `0` success, `1` maximum iterations, `2` precision loss (the
            line search failed), `3` a NaN was encountered.
        success: `status == 0`.
        message: A human-readable status string, scipy's own wording.
    """

    x: list[float]
    fun: float
    jac: list[float]
    hess_inv: list[list[float]]
    nit: int
    nfev: int
    njev: int
    status: int
    success: bool
    message: str


def _minimize_bfgs(
    fun: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    jac: Callable[[Sequence[float]], Sequence[float]] | None = None,
    gtol: float = 1e-5,
    norm: float = _INFINITY,
    eps: float = EPSILON,
    maxiter: int | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
    hess_inv0: Sequence[Sequence[float]] | None = None,
    xrtol: float = 0.0,
) -> BFGSResult:
    """Minimize `fun` by BFGS, Nocedal and Wright's Algorithm 6.1.

    A transcription of `scipy.optimize._optimize._minimize_bfgs`. Args match
    that function's options one for one; see the module docstring for the
    algorithm and `line_search.line_search_wolfe12` for the step selection.

    Args:
        fun: The scalar objective `f(x)`.
        x0: The starting point, which fixes `n = len(x0)`.
        jac: The gradient `grad f(x)`, or `None` to approximate it by
            forward differences (`line_search.approx_fprime`).
        gtol: Stop once the gradient's `norm`-order norm falls to `gtol` or
            below.
        norm: The order of the norm used in the `gtol` test: `inf` (the
            default) is the max absolute entry, `-inf` the min.
        eps: The forward-difference step, used only when `jac` is `None`.
        maxiter: The iteration cap; `n * 200` when `None`.
        c1: The Armijo parameter of the line search.
        c2: The curvature parameter of the line search.
        hess_inv0: The initial inverse-Hessian estimate, `n` vectors of
            length `n`; the identity when `None`.
        xrtol: Stop once a step moves `x` by less than `xrtol` relative to
            `x`'s own norm (Frandsen, Jonasson & Nielsen's criterion). `0`
            (scipy's default) disables this test.

    Returns:
        A `BFGSResult`.
    """
    x0 = [float(v) for v in x0]
    n = len(x0)
    if maxiter is None:
        maxiter = n * 200

    counts = _EvalCounts()
    f, grad = _make_evaluators(fun, jac, eps, counts)

    xk = list(x0)
    old_fval = f(xk)
    gfk = grad(xk)
    identity = _identity(n)
    hk = (
        identity
        if hess_inv0 is None
        else [[float(v) for v in row] for row in hess_inv0]
    )

    # Sets the initial line-search step guess to dx ~ 1.
    old_old_fval: float | None = old_fval + _vecnorm(gfk) / 2.0

    k = 0
    warnflag = 0
    gnorm = _vecnorm(gfk, norm)

    while gnorm > gtol and k < maxiter:
        pk = [-v for v in _mat_vec(hk, gfk)]
        try:
            result = line_search_wolfe12(
                f,
                grad,
                xk,
                pk,
                gfk,
                old_fval,
                old_old_fval,
                amin=1e-100,
                amax=1e100,
                c1=c1,
                c2=c2,
            )
        except LineSearchError:
            warnflag = 2
            break

        alpha_k = result.alpha
        if alpha_k is None:
            # `line_search_wolfe12` only returns without raising once
            # `alpha` is set; this guards that invariant instead of
            # asserting it away.
            warnflag = 2
            break

        sk = [alpha_k * pi for pi in pk]
        xk = _axpy(1.0, sk, xk)
        gfkp1 = result.new_gradient if result.new_gradient is not None else grad(xk)

        yk = [gp - g for gp, g in zip(gfkp1, gfk, strict=True)]
        gfk = gfkp1
        k += 1
        old_old_fval = result.old_fval
        old_fval = result.new_fval if result.new_fval is not None else f(xk)

        gnorm = _vecnorm(gfk, norm)
        if gnorm <= gtol:
            break

        # Frandsen, Jonasson & Nielsen, "Unconstrained Optimization", IMM,
        # DTU (1999), chapter 5.
        if alpha_k * _vecnorm(pk) <= xrtol * (xrtol + _vecnorm(xk)):
            break

        if not math.isfinite(old_fval):
            warnflag = 2
            break

        rhok_inv = _dot(yk, sk)
        if rhok_inv == 0.0:
            # Division by zero would be handled by the surrounding numeric
            # code in the original; SciPy keeps this guard "for more
            # safety", and so does this transcription.
            rhok = 1000.0
        else:
            rhok = 1.0 / rhok_inv

        a1 = _mat_sub(identity, _mat_scale(_outer(sk, yk), rhok))
        a2 = _mat_sub(identity, _mat_scale(_outer(yk, sk), rhok))
        hk = _mat_add(
            _mat_matmul(a1, _mat_matmul(hk, a2)), _mat_scale(_outer(sk, sk), rhok)
        )

    fval = old_fval
    warnflag, message = _finalize_flag(warnflag, k, maxiter, gnorm, fval, xk)

    return BFGSResult(
        x=xk,
        fun=fval,
        jac=gfk,
        hess_inv=hk,
        nit=k,
        nfev=counts.nfev,
        njev=counts.njev,
        status=warnflag,
        success=(warnflag == 0),
        message=message,
    )


def _finalize_flag(
    warnflag: int, k: int, maxiter: int, gnorm: float, fval: float, xk: Sequence[float]
) -> tuple[int, str]:
    """The final warning flag and message shared by BFGS and CG.

    Both drivers run this exact sequence of tests in this exact order once
    their main loop ends: a line-search failure (already flag `2`) is
    reported as precision loss; otherwise the iteration cap and a NaN in the
    gradient norm, the function value, or any coordinate are checked, in
    that order; anything else is success.
    """
    if warnflag == 2:
        return warnflag, _STATUS_PR_LOSS
    if k >= maxiter:
        return 1, _STATUS_MAXITER
    if _is_nan(gnorm) or _is_nan(fval) or _any_nan(xk):
        return 3, _STATUS_NAN
    return warnflag, _STATUS_SUCCESS


def fmin_bfgs(
    f: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    fprime: Callable[[Sequence[float]], Sequence[float]] | None = None,
    gtol: float = 1e-5,
    norm: float = _INFINITY,
    epsilon: float = EPSILON,
    maxiter: int | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
    hess_inv0: Sequence[Sequence[float]] | None = None,
) -> BFGSResult:
    """`scipy.optimize.fmin_bfgs`'s public spelling of `_minimize_bfgs`."""
    return _minimize_bfgs(
        f,
        x0,
        jac=fprime,
        gtol=gtol,
        norm=norm,
        eps=epsilon,
        maxiter=maxiter,
        c1=c1,
        c2=c2,
        hess_inv0=hess_inv0,
    )


# ---------------------------------------------------------------------------
# Nonlinear conjugate gradient (Polak-Ribiere-plus)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CGResult:
    """The outcome of a nonlinear conjugate-gradient minimization.

    Attributes: as `BFGSResult`, minus `hess_inv` (CG keeps no Hessian
    estimate).
    """

    x: list[float]
    fun: float
    jac: list[float]
    nit: int
    nfev: int
    njev: int
    status: int
    success: bool
    message: str


@dataclass
class _PolakRibiereState:
    """The current-iteration state `_minimize_cg`'s two nested closures read.

    Mutable and private: `polak_ribiere_powell_step` and `descent_condition`
    are defined once, before the main loop, and read this object's fields
    rather than closing over the loop's `xk`/`pk`/`gfk`/`deltak` names
    directly — those get rebound every iteration, which is exactly what
    ruff's B023 check (and, independently, a spurious self-referential-type
    complaint from pyright over defaulted closure parameters) objects to.
    `cached_step` is `None` until `descent_condition` runs during the line
    search; the driver reuses it afterward instead of recomputing the same
    step.
    """

    xk: list[float]
    pk: list[float]
    gfk: list[float]
    deltak: float
    cached_step: tuple[float, list[float], list[float], list[float], float] | None = (
        None
    )


def _read_cached_step(
    state: _PolakRibiereState,
) -> tuple[float, list[float], list[float], list[float], float] | None:
    """Read `state.cached_step` through its declared type.

    A plain `state.cached_step` at the call site would let pyright narrow
    the read using this *function's own* control flow — which last set the
    attribute to `None` — even though the intervening `line_search_wolfe12`
    call can run `descent_condition`, a closure over the same `state`, and
    set it to a real step. Reading it back out through a call whose return
    type is declared, rather than inferred from a narrowed member access,
    sidesteps that stale narrowing.
    """
    return state.cached_step


def _minimize_cg(
    fun: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    jac: Callable[[Sequence[float]], Sequence[float]] | None = None,
    gtol: float = 1e-5,
    norm: float = _INFINITY,
    eps: float = EPSILON,
    maxiter: int | None = None,
    c1: float = 1e-4,
    c2: float = 0.4,
) -> CGResult:
    """Minimize `fun` by Polak-Ribiere-plus nonlinear conjugate gradient.

    A transcription of `scipy.optimize._optimize._minimize_cg`. See the
    module docstring for why `c2` defaults to `0.4` here and `0.9` in
    `_minimize_bfgs`/`_minimize_newtoncg`, and for the extra descent-
    condition check the line search enforces beyond the strong Wolfe
    conditions themselves.

    Args:
        fun: The scalar objective `f(x)`.
        x0: The starting point, which fixes `n = len(x0)`.
        jac: The gradient `grad f(x)`, or `None` to approximate it by
            forward differences.
        gtol: Stop once the gradient's `norm`-order norm falls to `gtol` or
            below.
        norm: The order of the norm used in the `gtol` test.
        eps: The forward-difference step, used only when `jac` is `None`.
        maxiter: The iteration cap; `n * 200` when `None`.
        c1: The Armijo parameter of the line search.
        c2: The curvature parameter of the line search.

    Returns:
        A `CGResult`.
    """
    x0 = [float(v) for v in x0]
    n = len(x0)
    if maxiter is None:
        maxiter = n * 200

    counts = _EvalCounts()
    f, grad = _make_evaluators(fun, jac, eps, counts)

    xk = list(x0)
    old_fval = f(xk)
    gfk = grad(xk)
    old_old_fval: float | None = old_fval + _vecnorm(gfk) / 2.0

    k = 0
    warnflag = 0
    pk = [-g for g in gfk]
    gnorm = _vecnorm(gfk, norm)
    sigma_3 = 0.01

    state = _PolakRibiereState(xk=xk, pk=pk, gfk=gfk, deltak=0.0)

    def polak_ribiere_powell_step(
        alpha: float, gfkp1: list[float] | None
    ) -> tuple[float, list[float], list[float], list[float], float]:
        # Reads the *current* iteration's point off `state` rather than
        # closing over the `while` loop's `xk`/`pk`/`gfk`/`deltak` directly
        # (which ruff's B023 rightly distrusts, since those names get
        # rebound every iteration): `state` itself is never reassigned, only
        # its fields are, so there is nothing here for B023 to flag.
        xkp1 = _axpy(alpha, state.pk, state.xk)
        resolved_gfkp1 = grad(xkp1) if gfkp1 is None else gfkp1
        yk = [gp - g for gp, g in zip(resolved_gfkp1, state.gfk, strict=True)]
        beta_k = max(0.0, _dot(yk, resolved_gfkp1) / state.deltak)
        pkp1 = [
            -gp + beta_k * p for gp, p in zip(resolved_gfkp1, state.pk, strict=True)
        ]
        step_gnorm = _vecnorm(resolved_gfkp1, norm)
        return (alpha, xkp1, pkp1, resolved_gfkp1, step_gnorm)

    def descent_condition(
        alpha: float, xkp1: list[float], fp1: float, gfkp1: list[float]
    ) -> bool:
        # Polak-Ribiere-plus needs an explicit check of a sufficient descent
        # condition, which strong Wolfe alone does not guarantee. Gilbert &
        # Nocedal, SIAM J. Optimization 2, 21 (1992).
        del xkp1, fp1
        state.cached_step = polak_ribiere_powell_step(alpha, gfkp1)
        _, _, pk_new, gfk_new, gnorm_new = state.cached_step

        if gnorm_new <= gtol:
            return True
        return _dot(pk_new, gfk_new) <= -sigma_3 * _dot(gfk_new, gfk_new)

    while gnorm > gtol and k < maxiter:
        state.xk, state.pk, state.gfk = xk, pk, gfk
        state.deltak = _dot(gfk, gfk)
        state.cached_step = None

        try:
            result = line_search_wolfe12(
                f,
                grad,
                xk,
                pk,
                gfk,
                old_fval,
                old_old_fval,
                c1=c1,
                c2=c2,
                amin=1e-100,
                amax=1e100,
                extra_condition=descent_condition,
            )
        except LineSearchError:
            warnflag = 2
            break

        alpha_k = result.alpha
        if alpha_k is None:
            warnflag = 2
            break

        cached_step = _read_cached_step(state)
        if cached_step is not None and cached_step[0] == alpha_k:
            _, xk, pk, gfk, gnorm = cached_step
        else:
            _, xk, pk, gfk, gnorm = polak_ribiere_powell_step(
                alpha_k, result.new_gradient
            )

        old_old_fval = result.old_fval
        old_fval = result.new_fval if result.new_fval is not None else f(xk)
        k += 1

    fval = old_fval
    warnflag, message = _finalize_flag(warnflag, k, maxiter, gnorm, fval, xk)

    return CGResult(
        x=xk,
        fun=fval,
        jac=gfk,
        nit=k,
        nfev=counts.nfev,
        njev=counts.njev,
        status=warnflag,
        success=(warnflag == 0),
        message=message,
    )


def fmin_cg(
    f: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    fprime: Callable[[Sequence[float]], Sequence[float]] | None = None,
    gtol: float = 1e-5,
    norm: float = _INFINITY,
    epsilon: float = EPSILON,
    maxiter: int | None = None,
    c1: float = 1e-4,
    c2: float = 0.4,
) -> CGResult:
    """`scipy.optimize.fmin_cg`'s public spelling of `_minimize_cg`."""
    return _minimize_cg(
        f,
        x0,
        jac=fprime,
        gtol=gtol,
        norm=norm,
        eps=epsilon,
        maxiter=maxiter,
        c1=c1,
        c2=c2,
    )


# ---------------------------------------------------------------------------
# Truncated Newton-CG
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NewtonCGResult:
    """The outcome of a truncated Newton-CG minimization.

    Attributes: as `CGResult`, plus `nhev`, the number of Hessian
    evaluations — calls to a dense `fhess`, or to `fhess_p` (a dense `fhess`
    fully substitutes for `fhess_p`, so only one of the two is ever
    charged). The finite-difference Hessian-vector product used when
    neither is supplied is not counted here; its cost shows up in `njev`
    instead, since it is built entirely out of gradient evaluations.
    """

    x: list[float]
    fun: float
    jac: list[float]
    nit: int
    nfev: int
    njev: int
    nhev: int
    status: int
    success: bool
    message: str


def approx_fhess_p(
    xk: Sequence[float],
    gfk: Sequence[float],
    p: Sequence[float],
    fprime: Callable[[Sequence[float]], Sequence[float]],
    epsilon: float,
) -> list[float]:
    """Approximate `hess f(xk) @ p` by a forward difference on the gradient.

    `scipy.optimize._optimize.approx_fhess_p`, specialized to take
    `grad f(xk)` as an argument rather than recomputing it: the caller
    (`_minimize_newtoncg`) always already has it, and recomputing it would
    cost a second gradient evaluation for a value that has not changed —
    scipy avoids the same waste via `ScalarFunction`'s memoization, this
    module avoids it structurally instead. See the module docstring.

    Args:
        xk: The point at which the product is wanted.
        gfk: `grad f(xk)`, already known to the caller.
        p: The vector to multiply the Hessian by.
        fprime: The gradient `grad f(x)`.
        epsilon: The forward-difference step.

    Returns:
        The approximate product `hess f(xk) @ p`.
    """
    xkp = _axpy(epsilon, p, xk)
    gfkp = fprime(xkp)
    return [(gi - gki) / epsilon for gi, gki in zip(gfkp, gfk, strict=True)]


def _minimize_newtoncg(
    fun: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    jac: Callable[[Sequence[float]], Sequence[float]] | None = None,
    hess: Callable[[Sequence[float]], Sequence[Sequence[float]]] | None = None,
    hessp: Callable[[Sequence[float], Sequence[float]], Sequence[float]] | None = None,
    xtol: float = 1e-5,
    eps: float = EPSILON,
    maxiter: int | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
) -> NewtonCGResult:
    """Minimize `fun` by truncated ("inexact") Newton-CG.

    A transcription of `scipy.optimize._optimize._minimize_newtoncg`. Each
    outer iteration solves `hess f(xk) @ p = -grad f(xk)` approximately by
    linear CG, stopping the inner solve early via the Nocedal-Wright forcing
    sequence rather than to full precision, then takes a Wolfe step along
    the resulting `p`. See the module docstring for the priority between
    `hess` and `hessp`, and for the Wolfe parameters this uses (scipy's
    default `amin`/`amax`, unlike BFGS and CG).

    Args:
        fun: The scalar objective `f(x)`.
        x0: The starting point, which fixes `n = len(x0)`.
        jac: The gradient `grad f(x)`. scipy requires this; here `None`
            falls back to a forward-difference approximation instead, per
            this package's house convention, though scipy itself never
            reaches that combination.
        hess: The dense Hessian `hess f(x)`, `n` vectors of length `n`, or
            `None`. Takes priority over `hessp` when both are given.
        hessp: The Hessian-vector product `hessp(x, p) -> hess f(x) @ p`, or
            `None`. Used only when `hess` is `None`.
        xtol: Convergence tolerance: stop once a step's `L1` norm falls to
            `len(x0) * xtol` or below.
        eps: The forward-difference step, used for `jac` when it is `None`
            and for the Hessian-vector product when both `hess` and `hessp`
            are `None`.
        maxiter: The outer iteration cap; `n * 200` when `None`. The inner
            CG solve is capped separately at `20 * n`.
        c1: The Armijo parameter of the line search.
        c2: The curvature parameter of the line search.

    Returns:
        A `NewtonCGResult`.
    """
    x0 = [float(v) for v in x0]
    n = len(x0)
    if maxiter is None:
        maxiter = n * 200
    cg_maxiter = 20 * n
    xtol_total = n * xtol

    counts = _EvalCounts()
    f, grad = _make_evaluators(fun, jac, eps, counts)

    def dense_hess(x: Sequence[float]) -> list[list[float]]:
        counts.nhev += 1
        assert hess is not None
        return [[float(v) for v in row] for row in hess(list(x))]

    xk = list(x0)
    k = 0
    old_fval = f(xk)
    old_old_fval: float | None = None
    update_l1norm = _INFINITY
    # `grad f(xk)` for the *current* `xk`. Computed fresh only once, here;
    # every outer iteration afterward carries forward the gradient its own
    # line search already evaluated at the point it just moved to (`result.
    # new_gradient`), the same way BFGS and CG do. scipy gets this reuse for
    # free from `ScalarFunction`'s memoization (its own `b = -fprime(xk)` at
    # the top of every iteration is a cache hit after the first), so
    # recomputing it here would inflate `njev` past scipy's count for no
    # reason.
    gfk: list[float] = grad(xk)

    while update_l1norm > xtol_total:
        if k >= maxiter:
            return _newtoncg_result(xk, old_fval, gfk, 1, _STATUS_MAXITER, k, counts)

        b = [-g for g in gfk]
        maggrad = _l1_norm(b)
        eta = min(0.5, math.sqrt(maggrad))
        termcond = eta * maggrad

        xsupi = [0.0] * n
        ri = [-bi for bi in b]
        psupi = [-ri_i for ri_i in ri]
        i = 0
        dri0 = _dot(ri, ri)

        dense_a = dense_hess(xk) if hess is not None else None
        cg_diverged = True

        for _k2 in range(cg_maxiter):
            if _l1_norm(ri) <= termcond:
                cg_diverged = False
                break
            if dense_a is not None:
                ap = _mat_vec(dense_a, psupi)
            elif hessp is not None:
                ap = [float(v) for v in hessp(list(xk), list(psupi))]
                counts.nhev += 1
            else:
                ap = approx_fhess_p(xk, gfk, psupi, grad, eps)

            curv = _dot(psupi, ap)
            if 0.0 <= curv <= 3.0 * _FLOAT64_EPS:
                cg_diverged = False
                break
            if curv < 0.0:
                cg_diverged = False
                if i == 0:
                    # Fall back to the steepest-descent direction.
                    xsupi = [(dri0 / -curv) * bi for bi in b]
                break

            alphai = dri0 / curv
            xsupi = _axpy(alphai, psupi, xsupi)
            ri = _axpy(alphai, ap, ri)
            dri1 = _dot(ri, ri)
            betai = dri1 / dri0
            psupi = [-r + betai * p for r, p in zip(ri, psupi, strict=True)]
            i += 1
            dri0 = dri1

        if cg_diverged:
            return _newtoncg_result(
                xk, old_fval, gfk, 3, _STATUS_NOT_POSITIVE_DEFINITE, k, counts
            )

        pk = xsupi
        try:
            result = line_search_wolfe12(
                f, grad, xk, pk, gfk, old_fval, old_old_fval, c1=c1, c2=c2
            )
        except LineSearchError:
            return _newtoncg_result(xk, old_fval, gfk, 2, _STATUS_PR_LOSS, k, counts)

        alphak = result.alpha
        if alphak is None:
            return _newtoncg_result(xk, old_fval, gfk, 2, _STATUS_PR_LOSS, k, counts)

        update = [alphak * p for p in pk]
        xk = _axpy(1.0, update, xk)
        old_old_fval = result.old_fval
        old_fval = result.new_fval if result.new_fval is not None else f(xk)
        gfk = result.new_gradient if result.new_gradient is not None else grad(xk)
        k += 1
        update_l1norm = _l1_norm(update)

    # `gfk` is already `grad f(xk)` at this final `xk` — carried forward from
    # the last accepted step above rather than recomputed. (scipy instead
    # reports whichever `gfk` its last completed outer iteration computed
    # *before* that iteration's own step, one iteration stale, because its
    # loop variable is never refreshed after the step; this module's `jac`
    # is current for the point it is actually paired with instead, which
    # costs nothing extra since the value was already in hand. See the
    # module docstring's counting discussion.)
    if _is_nan(old_fval) or _is_nan(update_l1norm):
        return _newtoncg_result(xk, old_fval, gfk, 3, _STATUS_NAN, k, counts)
    return _newtoncg_result(xk, old_fval, gfk, 0, _STATUS_SUCCESS, k, counts)


def _newtoncg_result(
    xk: Sequence[float],
    fval: float,
    gfk: Sequence[float],
    status: int,
    message: str,
    k: int,
    counts: _EvalCounts,
) -> NewtonCGResult:
    return NewtonCGResult(
        x=list(xk),
        fun=fval,
        jac=list(gfk),
        nit=k,
        nfev=counts.nfev,
        njev=counts.njev,
        nhev=counts.nhev,
        status=status,
        success=(status == 0),
        message=message,
    )


def fmin_ncg(
    f: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    fprime: Callable[[Sequence[float]], Sequence[float]],
    fhess_p: Callable[[Sequence[float], Sequence[float]], Sequence[float]]
    | None = None,
    fhess: Callable[[Sequence[float]], Sequence[Sequence[float]]] | None = None,
    avextol: float = 1e-5,
    epsilon: float = EPSILON,
    maxiter: int | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
) -> NewtonCGResult:
    """`scipy.optimize.fmin_ncg`'s public spelling of `_minimize_newtoncg`.

    Unlike `_minimize_newtoncg`, `fprime` is required here (no `None`
    default), matching scipy's own `fmin_ncg` signature, which raises if
    the gradient is omitted.
    """
    return _minimize_newtoncg(
        f,
        x0,
        jac=fprime,
        hess=fhess,
        hessp=fhess_p,
        xtol=avextol,
        eps=epsilon,
        maxiter=maxiter,
        c1=c1,
        c2=c2,
    )
