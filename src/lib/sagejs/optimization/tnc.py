"""TNC: truncated Newton with bounds.

Stephen G. Nash, *Newton-type minimization via the Lanczos method*, SIAM
J. Numer. Anal. 21(4):770-788 (1984); Nash, *A survey of truncated-Newton
methods*, J. Comput. Appl. Math. 124:45-59 (2000). This module targets the
exact evaluation sequence and stopping rules of `scipy.optimize.fmin_tnc`
(`_minimize_tnc`), which wraps a C translation by Jean-Sebastien Roy
(`tnc.c`, itself a translation of Nash's original Fortran `TNBC`), not a
generic textbook description of truncated Newton.

## Algorithm shape

Each outer iteration:

1. Solve `hess(xk) @ p = -grad f(xk)` *approximately* by a preconditioned
   conjugate-gradient (Lanczos) iteration on the Hessian-vector product,
   stopped early once Nash's ratio test `(k+1)*(1 - qold/qnew) <= 0.5`
   fires, or after `maxCGit` products, or the first time a residual or
   curvature test collapses (`_direction`, the truncated inner solve that
   gives the method its name). The Hessian never appears explicitly: every
   product `hess(xk) @ v` is a forward difference of the gradient
   (`_hessian_times_vector`), since this interface has no analytic Hessian.
   The preconditioner is a two-step self-scaled BFGS approximation built
   from the last two accepted steps (`_init_preconditioner`, `_msolve`),
   refined once more per CG iteration by a diagonal BFGS-like update
   (`_diagonal_scaling`) — *that* diagonal, not the Hessian, is what
   `_direction` calls `emat`/`diagb`.
2. Bound the step by the box: `_step_max` (`stepMax` in `tnc.c`) is the
   largest multiple of the direction that keeps every *currently free*
   coordinate inside `[low, up]`; coordinates already pinned to a bound
   (`pivot[i] != 0`) are ignored, exactly as a projected-gradient active-set
   method ignores them when sizing a step. A zero-length allowable step
   means a new constraint has already been hit without moving.
3. Line-search along that direction up to the box bound, then update the
   active set: `_add_constraint` pins any coordinate the step drove onto
   its bound, `_remove_constraint` releases the *one* currently pinned
   coordinate (largest index wins ties) whose multiplier (`-pivot[i]*g[i]`)
   has gone the wrong sign — the Gill-Murray-Wright first-order test for a
   constraint that should no longer bind.
4. Convergence tests on `|f_n - f_(n-1)|` and `|x_n - x_(n-1)|` fire only
   on an iteration that neither released nor added a constraint, mirroring
   `tnc.c` exactly (a boundary-touching step is never mistaken for having
   converged).

## What is deliberately not a transliteration

`tnc.c`'s own line search (`linearSearch`/`getptcInit`/`getptcIter`) is
Gill and Murray's safeguarded-cubic-interpolation search, *not*
Moré-Thuente — despite the resemblance often drawn between the two, it is
a different derivation with its own bookkeeping (`getptc`'s
`{reltol, abstol, tnytol}` triple has no `dcsrch` counterpart). This module
does not port it. Instead it drives `line_search.DCSRCH`, the verified
MINPACK-2 `dcsrch`/`dcstep` machinery this package already uses for BFGS,
CG and Newton-CG, directly: `tnc.c`'s own Armijo/curvature pair is
`rmu = 1e-4` (hardcoded) and `eta` (the public "severity" parameter, in
`[0, 1)`), which map onto `dcsrch`'s `ftol`/`gtol` with *no* reinterpretation
— both searches accept a step exactly when
`f(step) <= f(0) + rmu*step*f'(0)` and `|f'(step)| <= eta*|f'(0)|`. Reusing
`DCSRCH` needs its own initial step and its own verdict on a
`stpmax`-boundary warning, neither of which `scalar_search_wolfe1`'s public
wrapper offers, which is why `DCSRCH.iterate` — the public reverse-
communication entry point built for exactly this — is driven directly
rather than through that wrapper; see `line_search.DCSRCH`'s docstring.
Two consequences of the substitution, both confined to the line search's
own internal iteration count and neither changing where a run converges:

* `DCSRCH`'s own `xtol` (relative interval width) stands in for
  `getptc`'s `{reltol, abstol, tnytol}` convergence bookkeeping; `1e-14` is
  used, `dcsrch`'s value elsewhere in this package.
* if the function-call budget (`maxfun`) is exhausted *inside* a line
  search, this module stops immediately with `MAXFUN`. `tnc.c` instead
  falls back to the best point `getptc` had found so far and lets the
  outer loop's own bookkeeping decide the return code next time round.
  The difference only bites in the rare case where `maxfun` runs out
  mid-search rather than between outer iterations.

Everything else the assignment calls load-bearing is a direct, faithful
port: the truncated PCG/Lanczos inner solve and its stopping rule
(`_direction`), the diagonal preconditioner and its BFGS-style update
(`_init_preconditioner`, `_diagonal_scaling`), the active-set projection
machinery (`_project`, `_set_constraints`, `_add_constraint`,
`_remove_constraint`), `_step_max`, and the finite-difference
Hessian-vector product (`_hessian_times_vector`).

## Defaults, corrected against `tnc.c` and `_tnc.py`

The docstrings of `scipy.optimize.fmin_tnc`/`_minimize_tnc` describe the
defaults only loosely; the actual resolution happens in `tnc.c`'s `tnc()`
(the C entry point both wrap), and three of the commonly-quoted defaults
are wrong or incomplete there:

* `ftol` does *not* default to `0`. `tnc.c`: `if (ftol < 0.0) ftol =
  accuracy;` — it defaults to `accuracy`, i.e. `sqrt(machine epsilon)` when
  `accuracy` is also left at its own default.
* `maxCGit` gets a *second* clamp the docstrings omit: after resolving
  `maxCGit < 0` to `max(1, min(50, n // 2))`, `tnc.c` additionally clamps
  `maxCGit = min(maxCGit, n)` — relevant only for `n < 2`, where
  `max(1, min(50, n // 2))` would otherwise exceed `n`.
* `stepmx` is not "`0` means `10.0`" but a threshold test:
  `if (stepmx < 10*sqrt(machine epsilon)) stepmx = 10.0;`. The default `0`
  triggers it, but so would any positive `stepmx` smaller than
  `~1.49e-7`.

`eta < 0` (default `-1`) resolves to `0.25`; the resolved bound is `eta in
[0, 1)`, `>= 1.0` is also rejected back to `0.25`. `accuracy <= machine
epsilon` (default `0`) resolves to `sqrt(machine epsilon)`. `pgtol < 0`
(default `-1`) resolves to `1e-2 * sqrt(accuracy)` — using the *already
resolved* `accuracy`, so with every default left alone this is
`1e-2 * (machine epsilon)**0.25`, not `1e-2 * sqrt(machine epsilon)`.
`xtol < 0` (default `-1`) resolves to `sqrt(machine epsilon)`. `rescale <
0` (default `-1`) resolves to `1.3`. `fmin` (the minimum-function-value
*estimate*, called `minfev` inside `_minimize_tnc`) defaults to `0` and is
used as given, no resolution. `maxfun=None` resolves to
`max(100, 10*len(x0))`, in `_minimize_tnc`, not `tnc.c` itself.

`scale`/`offset` are supported exactly as scipy exposes them (a variable
with an explicit `scale` of `0` is pinned at its *starting* value, which
also overrides that coordinate's bounds to that value — `tnc.c`'s own
behaviour, reachable only through an explicit `scale` array). Bounds are
`(low, high)` pairs with `None` meaning unbounded on that side.

## Infeasible starts and the resync

`INFEASIBLE` means `low[i] > up[i]` for some coordinate — a malformed
*box*, checked before anything else runs. A starting point *outside* a
well-formed box is not infeasible in that sense: `tnc.c` silently clamps
`x0` into `[low, up]` (`coercex`) before doing anything else, the same way
this module's `fmin_tnc` does. Every exit path — including `INFEASIBLE`,
`CONSTANT`, and a `maxfun` budget too small to run at all — ends with one
extra call to the objective at whatever `x` is being returned, because
`_minimize_tnc` always does this once more "since x, f and g may be very
slightly out of sync because of scaling" and this module matches that
`function_calls` accounting exactly: it is *always* one more than however
many calls the search itself made, on every exit path without exception.

## Function-evaluation counting

`function_calls` counts calls to the combined `(f(x), grad f(x))`
evaluator, the unit `tnc.c`'s own `tnc_function` callback evaluates in one
call and the unit this module's inner loop budgets against `maxfun`. When
no analytic gradient is supplied this is still one count per point, even
though `line_search.approx_fprime` costs `n + 1` evaluations of the plain
objective underneath it — the same accounting choice `gradient_methods.py`
documents for its own finite-difference fallback. Exact agreement with
scipy's own `nfev` is not expected or attempted: this is a different line
search making different trial points, so it does not make the same number
of calls along the way, even when it reaches the same minimizer.

Example:

```python
from sagejs.optimization.tnc import fmin_tnc

f = lambda v: (v[0] - 1.0) ** 2 + (v[1] + 2.0) ** 2
g = lambda v: [2.0 * (v[0] - 1.0), 2.0 * (v[1] + 2.0)]
result = fmin_tnc(f, [0.0, 0.0], fprime=g, bounds=[(None, None), (None, None)])
assert abs(result.x[0] - 1.0) < 1e-6
assert result.converged
```
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from .line_search import DCSRCH, approx_fprime

__all__ = [
    "CONSTANT",
    "FCONVERGED",
    "INFEASIBLE",
    "LOCALMINIMUM",
    "LSFAIL",
    "MAXFUN",
    "NOPROGRESS",
    "RCSTRINGS",
    "USERABORT",
    "XCONVERGED",
    "TNCResult",
    "fmin_tnc",
]

_INFINITY = float("inf")
"""IEEE `+inf`; the Sage.js `math` module has no `math.inf` attribute."""

_FLOAT64_EPS = 2.220446049250313e-16
"""`sys.float_info.epsilon`, spelled as scipy's `np.finfo(np.float64).eps`
literal so the default-resolution arithmetic below cannot drift from a
platform lookup."""

# scipy's RCSTRINGS vocabulary (`scipy/optimize/_tnc.py`), reproduced
# verbatim: both the integer codes and their exact wording.
INFEASIBLE = -1
LOCALMINIMUM = 0
FCONVERGED = 1
XCONVERGED = 2
MAXFUN = 3
LSFAIL = 4
CONSTANT = 5
NOPROGRESS = 6
USERABORT = 7

RCSTRINGS: dict[int, str] = {
    INFEASIBLE: "Infeasible (lower bound > upper bound)",
    LOCALMINIMUM: "Local minimum reached (|pg| ~= 0)",
    FCONVERGED: "Converged (|f_n-f_(n-1)| ~= 0)",
    XCONVERGED: "Converged (|x_n-x_(n-1)| ~= 0)",
    MAXFUN: "Max. number of function evaluations reached",
    LSFAIL: "Linear search failed",
    CONSTANT: "All lower bounds are equal to the upper bounds",
    NOPROGRESS: "Unable to progress",
    USERABORT: "User requested end of minimization",
}

_FLAG_NAMES: dict[int, str] = {
    INFEASIBLE: "INFEASIBLE",
    LOCALMINIMUM: "LOCALMINIMUM",
    FCONVERGED: "FCONVERGED",
    XCONVERGED: "XCONVERGED",
    MAXFUN: "MAXFUN",
    LSFAIL: "LSFAIL",
    CONSTANT: "CONSTANT",
    NOPROGRESS: "NOPROGRESS",
    USERABORT: "USERABORT",
}

_CONVERGED_CODES = (LOCALMINIMUM, FCONVERGED, XCONVERGED)
"""scipy's `success = (-1 < rc < 3)`, spelled out as the three codes it
actually admits."""


@dataclass(frozen=True)
class TNCResult:
    """The outcome of a `fmin_tnc` run.

    Attributes:
        x: The best point found (always inside `bounds`).
        fun: `f(x)`.
        jac: `grad f(x)`, from one extra evaluation taken after the search
            stops — see the module docstring's "resync" note.
        iterations: Completed outer (direction + line-search) iterations.
            `0` on every exit path that never reaches the main loop
            (`INFEASIBLE`, a `maxfun` budget too small to start, or a fully
            degenerate box).
        function_calls: Calls made to the combined `(f, grad f)` evaluator,
            including the always-present resync call — see the module
            docstring.
        converged: `True` exactly when `flag` is `"LOCALMINIMUM"`,
            `"FCONVERGED"`, or `"XCONVERGED"` — scipy's
            `success = (-1 < rc < 3)`.
        flag: One of scipy's `RCSTRINGS` keys, spelled as its name
            (`"LOCALMINIMUM"`, `"MAXFUN"`, ...) rather than this package's
            usual lowercase `flag` idiom, because the assignment is to
            reproduce that vocabulary faithfully.
        message: `RCSTRINGS[status]`, scipy's own wording.
        status: The raw scipy return code (`-1` through `7`).
    """

    x: list[float]
    fun: float
    jac: list[float]
    iterations: int
    function_calls: int
    converged: bool
    flag: str
    message: str
    status: int


# ---------------------------------------------------------------------------
# Small vector helpers (no numpy in this runtime)
# ---------------------------------------------------------------------------


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    total = 0.0
    for ai, bi in zip(a, b, strict=True):
        total += ai * bi
    return total


def _norm(a: Sequence[float]) -> float:
    return math.sqrt(_dot(a, a))


def _project(v: list[float], pivot: Sequence[int]) -> None:
    """`project`: zero out every coordinate currently pinned to a bound."""
    for i in range(len(v)):
        if pivot[i] != 0:
            v[i] = 0.0


def _project_constants(v: list[float], xscale: Sequence[float]) -> None:
    """`projectConstants`: zero out every coordinate declared constant via
    `scale[i] == 0`."""
    for i in range(len(v)):
        if xscale[i] == 0.0:
            v[i] = 0.0


def _coerce_x(x: list[float], low: Sequence[float], up: Sequence[float]) -> None:
    """`coercex`: clamp `x` into the box, in place."""
    for i in range(len(x)):
        if x[i] < low[i]:
            x[i] = low[i]
        elif x[i] > up[i]:
            x[i] = up[i]


def _unscale_x(
    x: list[float], xscale: Sequence[float], xoffset: Sequence[float]
) -> None:
    for i in range(len(x)):
        x[i] = x[i] * xscale[i] + xoffset[i]


def _scale_x(x: list[float], xscale: Sequence[float], xoffset: Sequence[float]) -> None:
    for i in range(len(x)):
        if xscale[i] > 0.0:
            x[i] = (x[i] - xoffset[i]) / xscale[i]


def _scale_g(g: list[float], xscale: Sequence[float], fscale: float) -> None:
    for i in range(len(g)):
        g[i] *= xscale[i] * fscale


def _set_constraints(
    x: Sequence[float],
    xscale: Sequence[float],
    xoffset: Sequence[float],
    low: Sequence[float],
    up: Sequence[float],
) -> list[int]:
    """`setConstraints`: the initial active-set vector.

    `pivot[i]` is `-1` when coordinate `i` sits on its lower bound, `1` on
    its upper bound, `2` when the coordinate is declared constant
    (`xscale[i] == 0`, from a degenerate box or an explicit `scale` of
    `0`), and `0` when free.
    """
    n = len(x)
    pivot = [0] * n
    for i in range(n):
        if xscale[i] == 0.0:
            pivot[i] = 2
        elif low[i] != -_INFINITY and (
            x[i] * xscale[i] + xoffset[i] - low[i]
            <= _FLOAT64_EPS * 10.0 * (abs(low[i]) + 1.0)
        ):
            pivot[i] = -1
        elif up[i] != _INFINITY and (
            x[i] * xscale[i] + xoffset[i] - up[i]
            >= _FLOAT64_EPS * 10.0 * (abs(up[i]) + 1.0)
        ):
            pivot[i] = 1
        else:
            pivot[i] = 0
    return pivot


def _step_max(
    step: float,
    x: Sequence[float],
    direction: Sequence[float],
    pivot: Sequence[int],
    low: Sequence[float],
    up: Sequence[float],
    xscale: Sequence[float],
    xoffset: Sequence[float],
) -> float:
    """`stepMax`: the largest step along `direction` that keeps every
    currently-free coordinate inside the box (pinned coordinates, and
    coordinates the direction does not move, are ignored)."""
    n = len(x)
    for i in range(n):
        if pivot[i] == 0 and direction[i] != 0.0:
            if direction[i] < 0.0:
                t = (low[i] - xoffset[i]) / xscale[i] - x[i]
                if t > step * direction[i]:
                    step = t / direction[i]
            else:
                t = (up[i] - xoffset[i]) / xscale[i] - x[i]
                if t < step * direction[i]:
                    step = t / direction[i]
    return step


def _add_constraint(
    x: list[float],
    p: Sequence[float],
    pivot: list[int],
    low: Sequence[float],
    up: Sequence[float],
    xscale: Sequence[float],
    xoffset: Sequence[float],
) -> bool:
    """`addConstraint`: pin any free coordinate the step drove onto a
    bound, snapping it exactly onto that bound."""
    n = len(x)
    newcon = False
    for i in range(n):
        if pivot[i] == 0 and p[i] != 0.0:
            if p[i] < 0.0 and low[i] != -_INFINITY:
                tol = _FLOAT64_EPS * 10.0 * (abs(low[i]) + 1.0)
                if x[i] * xscale[i] + xoffset[i] - low[i] <= tol:
                    pivot[i] = -1
                    x[i] = (low[i] - xoffset[i]) / xscale[i]
                    newcon = True
            elif up[i] != _INFINITY:
                tol = _FLOAT64_EPS * 10.0 * (abs(up[i]) + 1.0)
                if up[i] - (x[i] * xscale[i] + xoffset[i]) <= tol:
                    pivot[i] = 1
                    x[i] = (up[i] - xoffset[i]) / xscale[i]
                    newcon = True
    return newcon


def _remove_constraint(
    gtpnew: float,
    gnorm: float,
    pgtolfs: float,
    f: float,
    f_last_constraint: float,
    g: Sequence[float],
    pivot: list[int],
) -> bool:
    """`removeConstraint`: release the one currently-pinned coordinate
    (largest index wins ties) whose multiplier has the wrong sign — Gill,
    Murray and Wright's first-order test (1981, p. 308; see also Fletcher,
    1981, p. 116) for a constraint that is no longer needed. Never touches
    a coordinate declared constant (`pivot[i] == 2`)."""
    if (f_last_constraint - f) <= (gtpnew * -0.5) and gnorm > pgtolfs:
        return False

    imax = -1
    cmax = 0.0
    for i in range(len(g)):
        if pivot[i] == 2:
            continue
        t = -pivot[i] * g[i]
        if t < cmax:
            cmax = t
            imax = i

    if imax != -1:
        pivot[imax] = 0
        return True
    return False


# ---------------------------------------------------------------------------
# The truncated (preconditioned CG) inner solve
# ---------------------------------------------------------------------------


def _ssbfgs(
    n: int,
    gamma: float,
    sj: Sequence[float],
    hjv: Sequence[float],
    hjyj: Sequence[float],
    yjsj: float,
    yjhyj: float,
    vsj: float,
    vhyj: float,
) -> list[float]:
    """`ssbfgs`: one step of the self-scaled BFGS formula, used twice per
    `_msolve` call to build the two-step preconditioner from the last two
    accepted (step, gradient-change) pairs."""
    if yjsj == 0.0:
        delta = 0.0
        beta = 0.0
    else:
        delta = (gamma * yjhyj / yjsj + 1.0) * vsj / yjsj - gamma * vhyj / yjsj
        beta = -gamma * vsj / yjsj
    return [gamma * hjv[i] + delta * sj[i] + beta * hjyj[i] for i in range(n)]


def _msolve(
    g: Sequence[float],
    n: int,
    sk: Sequence[float],
    yk: Sequence[float],
    diagb: Sequence[float],
    sr: Sequence[float],
    yr: Sequence[float],
    upd1: bool,
    yksk: float,
    yrsr: float,
    lreset: bool,
) -> list[float]:
    """`msolve`: apply the current two-step self-scaled BFGS preconditioner
    to `g`. Before any step has been accepted (`upd1`), the preconditioner
    is just the diagonal `diagb`."""
    if upd1:
        return [g[i] / diagb[i] for i in range(n)]

    gsk = _dot(g, sk)
    rdiagb = [1.0 / diagb[i] for i in range(n)]
    hg = [g[i] * rdiagb[i] for i in range(n)]
    hyk = [yk[i] * rdiagb[i] for i in range(n)]

    if lreset:
        ykhyk = _dot(yk, hyk)
        ghyk = _dot(g, hyk)
        return _ssbfgs(n, 1.0, sk, hg, hyk, yksk, ykhyk, gsk, ghyk)

    hyr = [yr[i] * rdiagb[i] for i in range(n)]
    gsr = _dot(g, sr)
    ghyr = _dot(g, hyr)
    yrhyr = _dot(yr, hyr)
    hg = _ssbfgs(n, 1.0, sr, hg, hyr, yrsr, yrhyr, gsr, ghyr)
    yksr = _dot(yk, sr)
    ykhyr = _dot(yk, hyr)
    hyk = _ssbfgs(n, 1.0, sr, hyk, hyr, yrsr, yrhyr, yksr, ykhyr)
    ykhyk = _dot(hyk, yk)
    ghyk = _dot(hyk, g)
    return _ssbfgs(n, 1.0, sk, hg, hyk, yksk, ykhyk, gsk, ghyk)


def _init_preconditioner(
    diagb: Sequence[float],
    n: int,
    lreset: bool,
    yksk: float,
    yrsr: float,
    sk: Sequence[float],
    yk: Sequence[float],
    sr: Sequence[float],
    yr: Sequence[float],
    upd1: bool,
) -> list[float]:
    """`initPreconditioner`: the diagonal preconditioning matrix (`emat`),
    a diagonal-BFGS approximation built from `diagb` and the last one or
    two accepted (step, gradient-change) pairs, recomputed once per outer
    iteration before the CG loop refines it further with
    `_diagonal_scaling`."""
    if upd1:
        return list(diagb)

    if lreset:
        bsk = [diagb[i] * sk[i] for i in range(n)]
        sds = _dot(sk, bsk)
        yksk_safe = 1.0 if yksk == 0.0 else yksk
        sds_safe = 1.0 if sds == 0.0 else sds
        emat = []
        for i in range(n):
            td = diagb[i]
            emat.append(
                td - td * td * sk[i] * sk[i] / sds_safe + yk[i] * yk[i] / yksk_safe
            )
        return emat

    bsk = [diagb[i] * sr[i] for i in range(n)]
    sds = _dot(sr, bsk)
    srds = _dot(sk, bsk)
    yrsk = _dot(yr, sk)
    yrsr_safe = 1.0 if yrsr == 0.0 else yrsr
    sds_safe = 1.0 if sds == 0.0 else sds
    bsk2 = []
    emat = []
    for i in range(n):
        td = diagb[i]
        bsk2.append(td * sk[i] - bsk[i] * srds / sds_safe + yr[i] * yrsk / yrsr_safe)
        emat.append(td - td * td * sr[i] * sr[i] / sds_safe + yr[i] * yr[i] / yrsr_safe)
    sds2 = _dot(sk, bsk2)
    yksk_safe = 1.0 if yksk == 0.0 else yksk
    sds2_safe = 1.0 if sds2 == 0.0 else sds2
    for i in range(n):
        emat[i] -= bsk2[i] * bsk2[i] / sds2_safe + yk[i] * yk[i] / yksk_safe
    return emat


def _diagonal_scaling(
    e: list[float], v: Sequence[float], gv: Sequence[float], r: Sequence[float]
) -> None:
    """`diagonalScaling`: refine the diagonal preconditioner `e` in place
    by a diagonal BFGS-like update from the CG step `v`, its
    Hessian-vector product `gv`, and the current residual `r`."""
    vr = 1.0 / _dot(v, r)
    vgv = 1.0 / _dot(v, gv)
    for i in range(len(e)):
        e[i] += -r[i] * r[i] * vr + gv[i] * gv[i] * vgv
        if e[i] <= 1e-6:
            e[i] = 1.0


def _hessian_times_vector(
    v: Sequence[float],
    n: int,
    x: Sequence[float],
    g: Sequence[float],
    fun_and_grad: Callable[[list[float]], tuple[float, list[float]]],
    xscale: Sequence[float],
    xoffset: Sequence[float],
    fscale: float,
    accuracy: float,
    xnorm: float,
    low: Sequence[float],
    up: Sequence[float],
) -> list[float]:
    """`hessianTimesVector`: `hess(x) @ v` by a forward difference of the
    (scaled) gradient — there is no analytic Hessian in this interface."""
    delta = accuracy * (xnorm + 1.0)
    xv = [x[i] + delta * v[i] for i in range(n)]
    _unscale_x(xv, xscale, xoffset)
    _coerce_x(xv, low, up)
    _, gv_full = fun_and_grad(xv)
    gv = list(gv_full)
    _scale_g(gv, xscale, fscale)
    dinv = 1.0 / delta
    gv = [(gv[i] - g[i]) * dinv for i in range(n)]
    _project_constants(gv, xscale)
    return gv


def _direction(
    x: Sequence[float],
    g: Sequence[float],
    n: int,
    max_cg_it: int,
    maxnfeval: int,
    calls: list[int],
    upd1: bool,
    yksk: float,
    yrsr: float,
    sk: Sequence[float],
    yk: Sequence[float],
    sr: Sequence[float],
    yr: Sequence[float],
    diagb: list[float],
    lreset: bool,
    fun_and_grad: Callable[[list[float]], tuple[float, list[float]]],
    xscale: Sequence[float],
    xoffset: Sequence[float],
    fscale: float,
    pivot: list[int],
    accuracy: float,
    gnorm: float,
    xnorm: float,
    low: Sequence[float],
    up: Sequence[float],
) -> list[float]:
    """`tnc_direction`: the preconditioned conjugate-gradient (Lanczos)
    iteration that solves the Newton system `hess(x) @ p = -g`
    *approximately*, terminated early ("truncated") once the quadratic
    model's reduction has flattened out (Nash's ratio test below), rather
    than solved to convergence. `diagb`, the persistent diagonal
    preconditioner, is updated in place so the next outer iteration starts
    from where this one left off.

    `max_cg_it == 0` short-circuits to plain steepest descent
    (`-g`, projected), scipy's documented meaning for that setting.
    """
    if max_cg_it == 0:
        zsol = [-gi for gi in g]
        _project(zsol, pivot)
        return zsol

    rhsnrm = gnorm
    tol = 1e-12
    qold = 0.0
    rzold = 0.0

    emat = _init_preconditioner(diagb, n, lreset, yksk, yrsr, sk, yk, sr, yr, upd1)

    r = [-gi for gi in g]
    v = [0.0] * n
    zsol = [0.0] * n

    for k in range(max_cg_it):
        _project(r, pivot)
        zk = _msolve(r, n, sk, yk, diagb, sr, yr, upd1, yksk, yrsr, lreset)
        _project(zk, pivot)
        rz = _dot(r, zk)

        if (rz / rhsnrm < tol) or (calls[0] >= maxnfeval - 1):
            # Truncate: the residual has all but vanished, or the function
            # budget cannot afford another Hessian-vector product.
            if k == 0:
                zsol = [-gi for gi in g]
                _project(zsol, pivot)
            break

        beta = 0.0 if k == 0 else rz / rzold
        v = [zk[i] + beta * v[i] for i in range(n)]
        _project(v, pivot)

        gv = _hessian_times_vector(
            v, n, x, g, fun_and_grad, xscale, xoffset, fscale, accuracy, xnorm, low, up
        )
        _project(gv, pivot)

        vgv = _dot(v, gv)
        if vgv / rhsnrm < tol:
            # Truncate: no usable curvature along v; fall back to a
            # preconditioned steepest-descent direction.
            if k == 0:
                zsol = _msolve(g, n, sk, yk, diagb, sr, yr, upd1, yksk, yrsr, lreset)
                zsol = [-zi for zi in zsol]
                _project(zsol, pivot)
            break

        _diagonal_scaling(emat, v, gv, r)

        alpha = rz / vgv
        for i in range(n):
            zsol[i] += alpha * v[i]
            r[i] += -alpha * gv[i]

        gtp = _dot(zsol, g)
        pr = _dot(r, zsol)
        qnew = (gtp + pr) * 0.5
        # Nash's stopping rule: truncate once the quadratic model's
        # reduction from one more product would be less than half of what
        # it has been averaging so far.
        qtest = (k + 1) * (1.0 - (qold / qnew if qnew != 0.0 else _INFINITY))
        if qtest <= 0.5:
            break

        if gtp > 0.0:
            # Cautionary test: the model step is no longer a descent
            # direction, so the last product's contribution is discarded.
            for i in range(n):
                zsol[i] -= alpha * v[i]
            break

        qold = qnew
        rzold = rz

    diagb[:] = emat
    return zsol


# ---------------------------------------------------------------------------
# The line search: `DCSRCH` (MINPACK-2 `dcsrch`), reused directly
# ---------------------------------------------------------------------------

_LS_OK = 0
_LS_MAXFUN = 1
_LS_FAIL = 2


@dataclass(frozen=True)
class _LineSearchOutcome:
    status: int
    x: list[float]
    f: float
    alpha: float
    gfull: list[float]


def _initial_step(fnew: float, fmin: float, gtp: float, smax: float) -> float:
    """`initialStep`: the length of the first trial step along the search
    direction, from an estimate of how much `f` can still decrease."""
    d = abs(fnew - fmin)
    alpha = 1.0
    if d * 2.0 <= -gtp and d >= _FLOAT64_EPS:
        alpha = d * -2.0 / gtp
    if alpha >= smax:
        alpha = smax
    return alpha


def _line_search(
    fun_and_grad: Callable[[list[float]], tuple[float, list[float]]],
    calls: list[int],
    maxnfeval: int,
    n: int,
    low: Sequence[float],
    up: Sequence[float],
    xscale: Sequence[float],
    xoffset: Sequence[float],
    fscale: float,
    eta: float,
    spe: float,
    pk: Sequence[float],
    x: Sequence[float],
    f: float,
    alpha0: float,
    oldgtp: float,
) -> _LineSearchOutcome:
    """`linearSearch`, with `dcsrch`/`dcstep` (MINPACK-2) standing in for
    `tnc.c`'s own Gill-Murray search — see the module docstring. `eta` and
    the hardcoded `rmu = 1e-4` play exactly `dcsrch`'s `gtol`/`ftol`: no
    reinterpretation, both searches accept a step exactly when
    `f(step) <= f(0) + rmu*step*f'(0)` and `|f'(step)| <= eta*|f'(0)|`.

    `stpmax` is passed as the box-feasibility bound `spe`, and hitting it —
    a decrease that satisfies the Armijo condition but not the curvature
    one, because the *unconstrained* line minimum lies outside the box —
    is the single most common outcome of a bound-constrained line search:
    it is exactly how the outer loop discovers a coordinate belongs on its
    bound. `dcsrch`'s public `.search()` wrapper (`scalar_search_wolfe1`'s
    engine) treats every such warning as an outright failure, which is the
    right call for an *unconstrained* search where hitting `stpmax` means
    the caller picked a bad bound — but wrong here, where `getptc` (the
    search this replaces) accepts a boundary or stagnation point outright
    once *any* real decrease has been recorded (`tnc.c`'s
    `if (*xmin != 0.0) return GETPTC_OK;`). So `DCSRCH.iterate` is driven
    directly in the loop below, tracking the best (lowest-`phi`) trial seen,
    and that best point is accepted whenever the loop ends in a warning
    rather than full convergence — matching `getptc`'s acceptance rule
    while leaving `dcsrch`'s bracketing/interpolation mechanics untouched.
    Only "no trial ever improved on `phi(0)`" is a genuine failure.
    """
    last_alpha: float | None = None
    last_g_full: list[float] = []
    last_derphi = 0.0

    def phi(alpha: float) -> float:
        nonlocal last_alpha, last_g_full, last_derphi
        xt = [x[i] + alpha * pk[i] for i in range(n)]
        _unscale_x(xt, xscale, xoffset)
        _coerce_x(xt, low, up)
        f_full, g_full = fun_and_grad(xt)
        g_scaled = list(g_full)
        _scale_g(g_scaled, xscale, fscale)
        last_alpha = alpha
        last_g_full = list(g_full)
        last_derphi = _dot(g_scaled, pk)
        return f_full * fscale

    def derphi(alpha: float) -> float:
        if last_alpha != alpha:
            phi(alpha)
        return last_derphi

    dcsrch = DCSRCH(phi, derphi, 1e-4, eta, 1e-14, 0.0, spe)

    stp = alpha0
    f_val = f
    g_val = oldgtp
    task = "START"
    exhausted = False
    best_alpha: float | None = None
    best_phi = f
    best_g_full: list[float] = []

    for _ in range(64):
        step, f_val, g_val, task = dcsrch.iterate(stp, f_val, g_val, task)
        if not math.isfinite(step):
            task = "WARNING: NON-FINITE STEP"
            break
        stp = step
        if not task.startswith("FG"):
            break
        if calls[0] >= maxnfeval:
            exhausted = True
            break
        f_val = phi(stp)
        g_val = derphi(stp)
        if f_val < best_phi:
            best_phi = f_val
            best_alpha = stp
            best_g_full = list(last_g_full)
    else:
        task = "WARNING: line search did not converge within max iterations"

    if exhausted:
        return _LineSearchOutcome(_LS_MAXFUN, list(x), f, 0.0, [])
    if task.startswith("ERROR"):
        return _LineSearchOutcome(_LS_FAIL, list(x), f, 0.0, [])

    if task.startswith("CONVERGENCE"):
        accepted_alpha = stp
        if last_alpha != accepted_alpha:
            phi(accepted_alpha)
        accepted_phi = f_val
        accepted_g_full = list(last_g_full)
    elif best_alpha is not None:
        accepted_alpha = best_alpha
        accepted_phi = best_phi
        accepted_g_full = best_g_full
    else:
        return _LineSearchOutcome(_LS_FAIL, list(x), f, 0.0, [])

    new_x = [x[i] + accepted_alpha * pk[i] for i in range(n)]
    return _LineSearchOutcome(
        _LS_OK, new_x, accepted_phi, accepted_alpha, accepted_g_full
    )


# ---------------------------------------------------------------------------
# Scale/offset resolution and default-parameter resolution
# ---------------------------------------------------------------------------


def _resolve_scale_offset(
    x: Sequence[float],
    low: list[float],
    up: list[float],
    scale: Sequence[float] | None,
    offset: Sequence[float] | None,
) -> tuple[list[float], list[float]]:
    """Per-variable `xscale`/`xoffset`, scipy's defaulting rule: an
    interval-bounded variable is scaled by its width and centered; an
    unbounded (or half-bounded) one is scaled by `1 + |x|` and centered at
    `x`. An explicit `scale[i] == 0` pins that coordinate at its starting
    value, overriding `low[i]`/`up[i]` to that value too — `tnc.c`'s own
    behaviour, mutating `low`/`up` in place exactly as the C does."""
    n = len(x)
    xscale = [0.0] * n
    xoffset = [0.0] * n
    for i in range(n):
        if scale is not None:
            xscale[i] = abs(scale[i])
            if xscale[i] == 0.0:
                xoffset[i] = x[i]
                low[i] = x[i]
                up[i] = x[i]
            else:
                xoffset[i] = x[i]
        elif low[i] != -_INFINITY and up[i] != _INFINITY:
            xscale[i] = up[i] - low[i]
            xoffset[i] = (up[i] + low[i]) * 0.5
        else:
            xscale[i] = 1.0 + abs(x[i])
            xoffset[i] = x[i]
        if offset is not None:
            xoffset[i] = offset[i]
    return xscale, xoffset


@dataclass(frozen=True)
class _ResolvedParams:
    stepmx: float
    eta: float
    rescale: float
    max_cg_it: int
    accuracy: float
    ftol: float
    pgtol: float
    xtol: float


def _resolve_params(
    n: int,
    stepmx: float,
    eta: float,
    rescale: float,
    max_cg_it: int,
    accuracy: float,
    ftol: float,
    pgtol: float,
    xtol: float,
) -> _ResolvedParams:
    """`tnc.c`'s default-resolution block — see the module docstring for
    the three corrections against the commonly-quoted scipy defaults."""
    rteps = math.sqrt(_FLOAT64_EPS)

    if stepmx < rteps * 10.0:
        stepmx = 10.0
    if eta < 0.0 or eta >= 1.0:
        eta = 0.25
    if rescale < 0.0:
        rescale = 1.3
    if max_cg_it < 0:
        max_cg_it = n // 2
        if max_cg_it < 1:
            max_cg_it = 1
        elif max_cg_it > 50:
            max_cg_it = 50
    if max_cg_it > n:
        max_cg_it = n
    if accuracy <= _FLOAT64_EPS:
        accuracy = rteps
    if ftol < 0.0:
        ftol = accuracy
    if pgtol < 0.0:
        pgtol = 1e-2 * math.sqrt(accuracy)
    if xtol < 0.0:
        xtol = rteps

    return _ResolvedParams(stepmx, eta, rescale, max_cg_it, accuracy, ftol, pgtol, xtol)


# ---------------------------------------------------------------------------
# The main outer loop
# ---------------------------------------------------------------------------


def _tnc_minimize(
    fun_and_grad: Callable[[list[float]], tuple[float, list[float]]],
    calls: list[int],
    x0: Sequence[float],
    f0: float,
    g0: Sequence[float],
    low: list[float],
    up: list[float],
    xscale: Sequence[float],
    xoffset: Sequence[float],
    params: _ResolvedParams,
    fmin: float,
    maxnfeval: int,
    callback: Callable[[list[float]], None] | None,
) -> tuple[int, int, list[float]]:
    """`tnc_minimize`: the scaled outer loop, run after `x0` has already
    been coerced into the box and evaluated once (`f0`, `g0`)."""
    n = len(x0)
    x = list(x0)
    fscale = 1.0
    stepmx = params.stepmx

    _scale_x(x, xscale, xoffset)
    f = f0 * fscale

    pivot = _set_constraints(x, xscale, xoffset, low, up)

    g = list(g0)
    _scale_g(g, xscale, fscale)
    for i in range(n):
        if -pivot[i] * g[i] < 0.0:
            pivot[i] = 0
    _project(g, pivot)

    gnorm = _norm(g)
    f_last_constraint = f
    f_last_reset = f

    diagb = [1.0] * n
    difnew = 0.0
    epsred = 0.05
    upd1 = True
    icycle = n - 1
    newcon = True
    lreset = False
    yrsr = 0.0
    yksk = 0.0

    sk = [0.0] * n
    yk = [0.0] * n
    sr = [0.0] * n
    yr = [0.0] * n
    oldg = [0.0] * n

    gfull = list(g0)
    alpha = 0.0
    niter = 0
    rc = LOCALMINIMUM

    while True:
        if _norm(g) <= params.pgtol * fscale:
            rc = LOCALMINIMUM
            break

        if calls[0] >= maxnfeval:
            rc = MAXFUN
            break

        newscale = _norm(g)
        if newscale > _FLOAT64_EPS and abs(math.log10(newscale)) > params.rescale:
            newscale = 1.0 / newscale
            f *= newscale
            fscale *= newscale
            gnorm *= newscale
            f_last_constraint *= newscale
            f_last_reset *= newscale
            difnew *= newscale
            for i in range(n):
                g[i] *= newscale
            diagb = [1.0] * n
            upd1 = True
            icycle = n - 1
            newcon = True

        temp = list(x)
        _project(temp, pivot)
        xnorm = _norm(temp)
        oldnfeval = calls[0]

        pk = _direction(
            x,
            g,
            n,
            params.max_cg_it,
            maxnfeval,
            calls,
            upd1,
            yksk,
            yrsr,
            sk,
            yk,
            sr,
            yr,
            diagb,
            lreset,
            fun_and_grad,
            xscale,
            xoffset,
            fscale,
            pivot,
            params.accuracy,
            gnorm,
            xnorm,
            low,
            up,
        )

        if not newcon:
            if not lreset:
                sr = [sr[i] + sk[i] for i in range(n)]
                yr = [yr[i] + yk[i] for i in range(n)]
                icycle += 1
            else:
                sr = list(sk)
                yr = list(yk)
                f_last_reset = f
                icycle = 1

        oldg = list(g)
        oldf = f
        oldgtp = _dot(pk, g)

        ustpmax = stepmx / (_norm(pk) + _FLOAT64_EPS)
        spe = _step_max(ustpmax, x, pk, pivot, low, up, xscale, xoffset)

        if spe > 0.0:
            alpha_guess = _initial_step(f, fmin / fscale, oldgtp, spe)
            outcome = _line_search(
                fun_and_grad,
                calls,
                maxnfeval,
                n,
                low,
                up,
                xscale,
                xoffset,
                fscale,
                params.eta,
                spe,
                pk,
                x,
                f,
                alpha_guess,
                oldgtp,
            )
            if outcome.status == _LS_FAIL:
                rc = LSFAIL
                break
            if outcome.status == _LS_MAXFUN:
                rc = MAXFUN
                break

            alpha = outcome.alpha
            f = outcome.f
            x = outcome.x
            gfull = outcome.gfull

            if alpha >= 0.9 * ustpmax:
                stepmx *= 1e2

            newcon = alpha - spe >= -_FLOAT64_EPS * 10.0
        else:
            # Maximum constrained step is zero: a new constraint is
            # already active without moving.
            newcon = True

        if newcon:
            if not _add_constraint(x, pk, pivot, low, up, xscale, xoffset):
                if calls[0] == oldnfeval:
                    rc = NOPROGRESS
                    break
            f_last_constraint = f

        niter += 1

        if callback is not None:
            xt = list(x)
            _unscale_x(xt, xscale, xoffset)
            callback(xt)

        difold = difnew
        difnew = oldf - f

        if icycle == 1:
            if difnew > difold * 2.0:
                epsred += epsred
            if difnew < difold * 0.5:
                epsred *= 0.5

        g = list(gfull)
        _scale_g(g, xscale, fscale)

        temp = list(g)
        _project(temp, pivot)
        gnorm = _norm(temp)

        remcon = _remove_constraint(
            oldgtp, gnorm, params.pgtol * fscale, f, f_last_constraint, g, pivot
        )
        if remcon:
            temp = list(g)
            _project(temp, pivot)
            gnorm = _norm(temp)
            f_last_constraint = f

        if not remcon and not newcon:
            if abs(difnew) <= params.ftol * fscale:
                rc = FCONVERGED
                break
            if alpha * _norm(pk) <= params.xtol:
                rc = XCONVERGED
                break

        _project(g, pivot)

        if not newcon:
            for i in range(n):
                yk[i] = g[i] - oldg[i]
                sk[i] = alpha * pk[i]
            yksk = _dot(yk, sk)
            if icycle == (n - 1) or difnew < epsred * (f_last_reset - f):
                lreset = True
            else:
                yrsr = _dot(yr, sr)
                lreset = yrsr <= 0.0
            upd1 = False

    _unscale_x(x, xscale, xoffset)
    _coerce_x(x, low, up)
    return rc, niter, x


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def _make_fun_and_grad(
    f: Callable[[list[float]], float],
    fprime: Callable[[list[float]], list[float]] | None,
    eps: float,
) -> tuple[Callable[[list[float]], tuple[float, list[float]]], list[int]]:
    """Build the counted `(f, grad f)` evaluator.

    A one-slot cache on the most recently seen `x` mirrors scipy's
    `ScalarFunction` (`_prepare_scalar_function`), which memoizes exactly
    this way: a call at the same point the previous call already evaluated
    is a free cache hit, not a fresh count against `function_calls`. This
    matters whenever the algorithm asks for the same point twice in a row
    — most visibly the always-present resync call in `fmin_tnc` landing on
    whatever point the last internal evaluation already used, on every
    early-exit path (`CONSTANT`, a fully degenerate box, ...) where no
    search ever moved `x` away from it.
    """
    calls = [0]
    last_x: list[float] | None = None
    last_result: tuple[float, list[float]] | None = None

    def evaluate(
        x: list[float], compute: Callable[[], tuple[float, list[float]]]
    ) -> tuple[float, list[float]]:
        nonlocal last_x, last_result
        if last_x is not None and last_x == x:
            assert last_result is not None
            return last_result
        result = compute()
        calls[0] += 1
        last_x = list(x)
        last_result = result
        return result

    if fprime is not None:

        def fun_and_grad_analytic(x: list[float]) -> tuple[float, list[float]]:
            return evaluate(x, lambda: (f(x), list(fprime(x))))

        return fun_and_grad_analytic, calls

    def fun_and_grad_numeric(x: list[float]) -> tuple[float, list[float]]:
        return evaluate(x, lambda: (f(x), approx_fprime(x, f, eps)))

    return fun_and_grad_numeric, calls


def fmin_tnc(
    f: Callable[[list[float]], float],
    x0: Sequence[float],
    fprime: Callable[[list[float]], list[float]] | None = None,
    bounds: Sequence[tuple[float | None, float | None]] | None = None,
    eps: float = 1e-8,
    scale: Sequence[float] | None = None,
    offset: Sequence[float] | None = None,
    maxCGit: int = -1,
    maxfun: int | None = None,
    eta: float = -1.0,
    stepmx: float = 0.0,
    accuracy: float = 0.0,
    fmin: float = 0.0,
    ftol: float = -1.0,
    xtol: float = -1.0,
    pgtol: float = -1.0,
    rescale: float = -1.0,
    callback: Callable[[list[float]], None] | None = None,
) -> TNCResult:
    """`scipy.optimize.fmin_tnc`'s public spelling of `_minimize_tnc`.

    Args:
        f: The objective `f(x)`.
        x0: The starting point; fixes `n = len(x0)`. Need not be inside
            `bounds` — a starting point outside a well-formed box is
            silently clamped into it, not rejected (see the module
            docstring; only `low[i] > up[i]` is `INFEASIBLE`).
        fprime: The gradient `grad f(x)`, or `None` to approximate it by
            `line_search.approx_fprime` with step `eps`.
        bounds: `(low, high)` pairs, one per coordinate, `None` on either
            side meaning unbounded there. `None` overall means unbounded
            everywhere.
        eps: The forward-difference step, used only when `fprime is None`.
            scipy's default here is `1e-8`, *not* the `sqrt(machine
            epsilon)` that `line_search.approx_fprime`'s own default step
            is (a different, smaller number scipy's TNC does not use).
        scale: Per-variable scale factors, or `None` for scipy's default
            rule (interval width, or `1 + |x|` when unbounded). A `0`
            entry pins that coordinate at its starting value.
        offset: Per-variable offsets, or `None` for scipy's default rule
            (interval midpoint, or `x` when unbounded).
        maxCGit: Cap on Hessian-vector products per outer iteration
            (`< 0` resolves to `max(1, min(50, n // 2))`, then clamped to
            `<= n`; `0` means "always use `-grad f(x)`").
        maxfun: Cap on `(f, grad f)` evaluations, `None` resolving to
            `max(100, 10*n)`.
        eta: Line-search severity in `[0, 1)` (outside it resolves to
            `0.25`) — `dcsrch`'s curvature parameter `gtol`, directly.
        stepmx: Maximum line-search step; resolves to `10.0` whenever it is
            smaller than `10*sqrt(machine epsilon)`, not only when it is
            `<= 0`.
        accuracy: Relative precision for the forward-difference
            Hessian-vector product; `<= machine epsilon` resolves to
            `sqrt(machine epsilon)`.
        fmin: An estimate of the minimum function value, used only to pick
            each line search's first trial step.
        ftol: `|f_n - f_(n-1)|` convergence tolerance; `< 0` resolves to
            the resolved `accuracy` (not `0`).
        xtol: `alpha * |p_k|` convergence tolerance; `< 0` resolves to
            `sqrt(machine epsilon)`.
        pgtol: Projected-gradient-norm convergence tolerance; `< 0`
            resolves to `1e-2 * sqrt(accuracy)`, using the already-resolved
            `accuracy`.
        rescale: `log10` threshold for rescaling `f`; `< 0` resolves to
            `1.3`.
        callback: Called as `callback(xk)` after every completed outer
            iteration, `xk` in original (unscaled) coordinates.

    Returns:
        A `TNCResult`.

    Raises:
        ValueError: If `bounds` is given with a length other than
            `len(x0)`.
    """
    n = len(x0)
    x = [float(v) for v in x0]

    if bounds is None:
        bounds = [(None, None)] * n
    if len(bounds) != n:
        raise ValueError("length of x0 != length of bounds")

    low = [-_INFINITY if lo is None else float(lo) for lo, _hi in bounds]
    up = [_INFINITY if hi is None else float(hi) for _lo, hi in bounds]

    fun_and_grad, calls = _make_fun_and_grad(f, fprime, eps)

    rc: int
    niter = 0

    if n == 0:
        rc = CONSTANT
    elif any(lo > hi for lo, hi in zip(low, up, strict=True)):
        # Malformed box: x0 is left exactly as given (not coerced), matching
        # tnc.c's ordering (the coherency check runs before `coercex`).
        rc = INFEASIBLE
    else:
        _coerce_x(x, low, up)
        maxnfeval = max(100, 10 * n) if maxfun is None else maxfun
        if maxnfeval < 1:
            rc = MAXFUN
        else:
            f0, g0 = fun_and_grad(x)
            xscale, xoffset = _resolve_scale_offset(x, low, up, scale, offset)
            nc = sum(1 for i in range(n) if low[i] == up[i] or xscale[i] == 0.0)
            if nc == n:
                rc = CONSTANT
            else:
                params = _resolve_params(
                    n, stepmx, eta, rescale, maxCGit, accuracy, ftol, pgtol, xtol
                )
                rc, niter, x = _tnc_minimize(
                    fun_and_grad,
                    calls,
                    x,
                    f0,
                    g0,
                    low,
                    up,
                    xscale,
                    xoffset,
                    params,
                    fmin,
                    maxnfeval,
                    callback,
                )

    # "On output, x, f and g may be very slightly out of sync because of
    # scaling" (tnc.c) — `_minimize_tnc` always re-evaluates once more to
    # resync them, on every exit path without exception, and this module
    # matches that `function_calls` accounting exactly.
    f_final, g_final = fun_and_grad(x)

    return TNCResult(
        x=x,
        fun=f_final,
        jac=g_final,
        iterations=niter,
        function_calls=calls[0],
        converged=rc in _CONVERGED_CODES,
        flag=_FLAG_NAMES[rc],
        message=RCSTRINGS[rc],
        status=rc,
    )
