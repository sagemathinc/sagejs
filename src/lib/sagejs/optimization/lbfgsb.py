"""L-BFGS-B: limited-memory BFGS with box constraints.

Byrd, Lu, Nocedal and Zhu, *A limited memory algorithm for bound
constrained optimization*, SIAM J. Sci. Comput. 16(5):1190-1208 (1995);
Zhu, Byrd, Lu and Nocedal, *L-BFGS-B: Fortran subroutines for large-scale
bound-constrained optimization*, ACM TOMS 23(4):550-560 (1997); and the
2011 Morales-Nocedal remark that corrected the subspace minimization
(`subsm`). This targets `scipy.optimize.fmin_l_bfgs_b` (`_minimize_lbfgsb`),
which for its actual numerics wraps a compiled translation of the original
Fortran `lbfgsb.f` (`setulb`/`mainlb`/`cauchy`/`subsm`/`lnsrlb`/`matupd`/
`formk`/`formt`/`cmprlb`) — the reference read for this port was that
Fortran source (L-BFGS-B v3.0, April 2011), not scipy's thin Python wrapper.

## Algorithm shape

Each outer iteration:

1. **Generalized Cauchy point** (`_cauchy`, Fortran `cauchy`): walk the
   projected-gradient path `P(x - t*g, low, high)` — a piecewise-linear
   function of `t` — and find the first local minimizer of the quadratic
   model `Q(x+s) = g's + s'Bs/2` along it, where `B` is the current
   limited-memory BFGS approximation. Every point where a coordinate hits
   its bound is a breakpoint of the path; breakpoints are visited in
   increasing order (a min-heap, `heapq`, standing in for Fortran's
   hand-rolled `hpsolb`) and each coordinate is *fixed* at its bound as its
   breakpoint is passed, until the quadratic's stationary point falls
   inside the current segment. This is what makes the method bound-
   constrained rather than "BFGS, then clip": the search space for the
   *next* step is restricted to whatever remains free at the Cauchy point.
2. **Subspace minimization** (`_subsm`, Fortran `subsm`): an approximate
   Newton step for the free variables only, solved via the Sherman-
   Morrison-Woodbury form of the limited-memory Hessian restricted to the
   free/active split (`_subsm_reduced_matrix`, Fortran `formk`'s `K`
   matrix), then projected back into the box; if that projection reverses
   the direction (a positive directional derivative), the Newton step is
   discarded outright and the Cauchy point stands; otherwise a backtracking
   ratio keeps the result on the correct side of whichever bound would
   otherwise have been crossed.
3. A line search along `d = z - x` (the combined Cauchy+subspace step) via
   the same Moré-Thuente `dcsrch` this package already verified for BFGS,
   CG, Newton-CG and TNC (`line_search.DCSRCH`), safeguarded to the
   feasible step interval so no trial point leaves the box (`_max_feasible_step`,
   Fortran `lnsrlb`).
4. The limited-memory update (`_matupd`): append `(s, y) = (x_{k+1}-x_k,
   g_{k+1}-g_k)`, evict the oldest pair once more than `m` are held, and
   rescale `B_0 = theta*I` by `theta = y'y/y's` — but only when
   `y's > epsmch * (-alpha*gd_old)`, Fortran's exact skip test (`matupd`'s
   `dr .le. epsmch*ddum` guard). Skipping a nearly-degenerate pair, rather
   than updating with it anyway, is what keeps the limited-memory matrix
   well-conditioned; dropping this test silently destroys convergence on
   hard problems, so it is preserved verbatim.

## What is deliberately not a transliteration

Fortran's `bmv`/`formk`/`formt` cache and *incrementally update* two
Cholesky factorizations (`wt`, `wn`) across outer iterations, adjusting only
the rows/columns touched by variables that changed free/active status since
the last iteration (`indx2`'s `nenter`/`ileave`). That bookkeeping exists
purely for Fortran-era performance; the actual matrices it maintains — the
compact middle matrix `M = [[-D, L'], [L, theta*S'S]]` for the *global*
Hessian (`_bmv_matrix`, used in the Cauchy search and in `cmprlb`) and its
free/active-restricted cousin `K` (`_subsm_reduced_matrix`, used only in
`subsm`) — are small (`2*maxcor` <= 20) and cheap to rebuild from scratch
every outer iteration, directly from the stored correction pairs and the
*current* free/active partition. This module does that instead: no `wn1`
cache spanning outer iterations, no Cholesky, just a dense Gaussian
elimination with partial pivoting (`_lu_factor`/`_lu_apply`, wrapped as
`_solve_dense` for a single right-hand side) on a matrix rebuilt once per
outer iteration. `M` specifically *is* cached for the lifetime of one
`_LBFGSMemory` state (`_cached_bmv_factored`, invalidated by a version
counter `_matupd`/`reset` bump whenever `S`/`Y`/`theta` actually change):
`_cauchy` and `_cmprlb` both solve against the identical `M` within a single
outer iteration (`_matupd` only runs once, at the end, after both), so
rebuilding and re-factoring it twice was pure duplicated work rather than
part of the "no incremental cache" design being described here. `K` is not
cached this way because nothing else needs it in the same iteration. The
values these matrices hold, and the linear systems solved against them, are
unchanged from Fortran's; only the "remember what changed since last outer
iteration" optimization is dropped. A consequence: this port costs
`O(maxcor**2 * n)` per outer iteration to rebuild the Gram matrices, plus
`O(maxcor**3)` per iteration for each of the (at most two) dense solves
against them, against Fortran's amortized `O(maxcor**2)` — a difference
that only matters for `n`/`maxcor` far larger than any problem in this
package's test suite (see the numerics house rule: no speculative native
work ahead of a measured need).

The line search reuses `line_search.DCSRCH` (MINPACK-2 `dcsrch`/`dcstep`)
directly, the same class `tnc.py` already drives for the same reason:
`lnsrlb`'s own parameters (`ftol=1e-3`, `gtol=0.9`, `xtol=0.1`, `stpmin=0`)
and its per-iteration `stpmax` (the largest step that keeps every bounded
coordinate feasible) have no counterpart in `scalar_search_wolfe1`'s public
extrapolation heuristic for the *first* trial step, nor does that wrapper
offer any way to accept a `stpmax`-boundary warning as the discovery of a
new active constraint rather than a failure. So `DCSRCH.iterate` — the
public reverse-communication entry point built for exactly this — is driven
by hand in a bounded loop (`_line_search` below), exactly as `tnc.py` does;
see `line_search.DCSRCH`'s docstring. One consequence, confined to the very
first outer iteration and only when some coordinate is not bounded on both
sides:
Fortran's `lnsrlb` picks that iteration's first trial step as
`min(1/dnorm, stpmax)` rather than `1.0`, to avoid an overlong step before
any curvature information exists. This module always tries `1.0` first
(always feasible, because the Cauchy/subspace step `z` is feasible by
construction, so `stpmax >= 1` exactly). `dcsrch` is safeguarded regardless
of the first guess, so this changes only how many trial evaluations that
one line search takes, never where it converges.

## Defaults and bounds

`m=10`, `factr=1e7` (`ftol = factr * eps = 2.220446049250313e-09`),
`pgtol=1e-5`, `maxiter=15000`, `maxfun=15000`, `maxls=20` — scipy's exact
defaults. Convergence is tested both ways scipy does: the projected
gradient's infinity norm against `pgtol` (`_projected_gradient_inf_norm`,
Fortran `projgr`), and the relative function-reduction test
`(f_k - f_{k+1}) / max(|f_k|, |f_{k+1}|, 1) <= ftol`.

Bounds are `(low, high)` pairs, `None` on either side meaning unbounded
there, matching scipy's `bounds` argument to `fmin_l_bfgs_b` and Sage's
`minimize_constrained`. All four `nbd` cases are supported (`0` unbounded,
`1` lower only, `2` both, `3` upper only), including the degenerate case
`low == high` (a permanently fixed variable, `iwhere = 3` in Fortran's
vocabulary — never revisited by the Cauchy search once fixed). An
infeasible starting point is silently projected into the box, as scipy
does; `low[i] > high[i]` raises `ValueError`, matching
`scipy.optimize._lbfgsb_py._minimize_lbfgsb`'s own check exactly.

## Function-evaluation counting

`function_calls` counts requests for the combined `(f(x), grad f(x))` pair
— the unit Fortran's own `nfgv` counts, since `mainlb`'s reverse
communication always asks for both together at a trial point. When
`fprime` is `None`, `line_search.approx_fprime`'s `n+1` forward-difference
probes are folded into the *same* counter (this package's usual
convention, e.g. `gradient_methods.py`), at the cost of one extra
evaluation of `f` alone (to have a value to hand back immediately) beyond
what `approx_fprime` itself needs — `n+2` per request rather than scipy's
memoized `n+1`, since this interface (unlike `gradient_methods.py`'s
BFGS/CG) always needs both `f` and `grad f` together at every trial point,
with no line-search-side cache to draw `f` from for free. Exact `nfev`
agreement with scipy is not attempted or expected for an algorithm-level
port with its own line search making its own trial points; see the
verification notes for where and why iteration counts diverge.

Example:

```python
from sagejs.optimization.lbfgsb import fmin_l_bfgs_b

f = lambda v: (v[0] - 1.0) ** 2 + (v[1] + 2.0) ** 2
g = lambda v: [2.0 * (v[0] - 1.0), 2.0 * (v[1] + 2.0)]
result = fmin_l_bfgs_b(f, [0.0, 0.0], fprime=g)
assert abs(result.x[0] - 1.0) < 1e-6
assert result.converged
```
"""

from __future__ import annotations

import heapq
import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from .line_search import DCSRCH, approx_fprime

__all__ = ["LBFGSBResult", "fmin_l_bfgs_b"]

_INFINITY = float("inf")
"""IEEE `+inf`; the Sage.js `math` module has no `math.inf` attribute."""

_FLOAT64_EPS = 2.220446049250313e-16
"""`sys.float_info.epsilon`, spelled as scipy's `np.finfo(np.float64).eps`
literal, matching Fortran's `epsmch = 2*dlamch('e')` exactly (LAPACK's
`dlamch('E')` is the IEEE double unit roundoff, half of this value)."""

# Bound-type codes, matching Byrd-Lu-Nocedal-Zhu's `nbd` and scipy's
# `bounds_map` exactly, so cross-checking against either reference is a
# direct lookup rather than a re-derivation.
_UNBOUNDED = 0
_LOWER_ONLY = 1
_BOTH = 2
_UPPER_ONLY = 3

_MSG_CONVERGED_GRAD = "CONVERGENCE: NORM OF PROJECTED GRADIENT <= PGTOL"
_MSG_CONVERGED_F = "CONVERGENCE: RELATIVE REDUCTION OF F <= FACTR*EPSMCH"
_MSG_MAXITER = "STOP: TOTAL NO. OF ITERATIONS REACHED LIMIT"
_MSG_MAXFUN = "STOP: TOTAL NO. OF F,G EVALUATIONS EXCEEDS LIMIT"
_MSG_ASCENT = "ABNORMAL_TERMINATION_IN_LNSRCH: ascent direction in projection"
_MSG_ABNORMAL_LS = "ABNORMAL_TERMINATION_IN_LNSRCH: line search failed"
_MSG_NO_PROGRESS = "ABNORMAL_TERMINATION_IN_LNSRCH: no feasible descent direction"

_MAX_MEMORY_RESETS = 8
"""Cap on consecutive "refresh the L-BFGS memory and retry this iteration"
recoveries (Fortran's response to a singular Cholesky/linear system or a
line-search failure with `col > 0`). Fortran's `goto 222` has no such cap
and can in principle loop forever on a pathological problem; this bounds
that loop so a broken objective reports failure instead of hanging."""


@dataclass(frozen=True)
class LBFGSBResult:
    """The outcome of an `fmin_l_bfgs_b` run.

    Attributes:
        x: The best point found (always inside the box).
        fun: `f(x)`.
        jac: `grad f(x)`.
        iterations: Completed outer (Cauchy + subspace + line-search)
            iterations.
        function_calls: Requests made for the combined `(f, grad f)` pair —
            see the module docstring's counting section.
        converged: `True` exactly when `status == 0`.
        flag: A short code: `"CONVERGED_PGTOL"`, `"CONVERGED_FTOL"`,
            `"MAXITER"`, `"MAXFUN"`, or `"ABNORMAL"`.
        message: A human-readable status string; the two convergence
            messages and the two limit messages are scipy's own wording
            (`fmin_l_bfgs_b`'s `status_messages`/`task_messages`).
        status: `0` converged, `1` an iteration/evaluation limit was hit,
            `2` an abnormal termination (matching scipy's `warnflag`).
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
# Small vector/matrix helpers. There is no numpy in this runtime.
# ---------------------------------------------------------------------------


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    """The Euclidean inner product of two equal-length vectors.

    Indexes by `range(n)` rather than `zip(a, b, strict=True)`: this is the
    single most frequently called function in the module (every entry of
    every compact middle matrix goes through it), and the transpiled
    runtime's iterator protocol pays for a captured JS stack trace on every
    `StopIteration` a generator-backed construct like `zip` raises to signal
    exhaustion — a cost invisible in CPython but dominant here. A plain
    `range` loop is the same arithmetic in the same order (bit-identical),
    just without that iterator machinery. The length check keeps `zip`'s
    `strict=True` behaviour (a mismatch raises rather than silently
    truncating)."""
    n = len(a)
    if len(b) != n:
        raise ValueError("_dot: mismatched lengths")
    total = 0.0
    for i in range(n):
        total += a[i] * b[i]
    return total


_LUFactored = tuple[list[list[float]], list[tuple[int, list[tuple[int, float]]]]]
"""The result of `_lu_factor`: the eliminated (upper-triangular) matrix, and
one `(pivot_row, [(row, factor), ...])` entry per column recording exactly
the row operations `_lu_factor` performed, so `_lu_apply` can replay the
identical sequence against any right-hand side without re-eliminating."""


def _lu_factor(a: Sequence[Sequence[float]]) -> _LUFactored | None:
    """Gaussian elimination with partial pivoting on `a` alone (`n` square,
    `n >= 1`), separated from solving a right-hand side so a caller that
    poses several right-hand sides against the same `a` — `_cauchy`'s
    breakpoint walk solves its compact middle matrix once per breakpoint —
    can factor once (`O(n**3)`) and apply the recorded operations to each
    right-hand side afterward (`_lu_apply`, `O(n**2)`) instead of
    re-eliminating from scratch every time. This is the amortization
    Fortran's `bmv`/`formk` get from an incrementally *cached* Cholesky
    factorization, done here for the lifetime of one factored matrix rather
    than across iterations — `M`/`K` themselves are rebuilt every iteration
    (see the module docstring), so there is nothing to cache across
    iterations, but a single Cauchy walk still poses many right-hand sides
    against one unchanging matrix.

    `a` is small (at most `2*maxcor <= 20` here) and generally indefinite
    (the compact L-BFGS middle matrices), so a plain dense factorization —
    no Cholesky, no symmetry exploited — is simplest and fast enough; see
    the module docstring's "what is deliberately not a transliteration"
    section. Built with plain `range`/`for` loops and an explicit pivot
    search rather than `zip(..., strict=True)`, a `max(genexpr, ...)` or
    `max(..., key=...)`: the transpiled runtime's per-`StopIteration`
    stack-trace capture (generator-backed constructs) and its generic
    `key=`-callback dispatch were both measured to dominate this function's
    cost, called as it is on every `_cmprlb`/`_subsm` call and (before this
    split) every Cauchy breakpoint.

    Returns:
        `(mat, ops)`, or `None` when a pivot is smaller than `1e-13` times
        `a`'s largest entry, signalling a numerically singular system.
        Callers treat `None` the way Fortran treats `info != 0` from
        `dpofa`/`dtrsl`: refresh the L-BFGS memory and retry.
    """
    n = len(a)
    mat = [list(row) for row in a]
    scale = None
    for row in a:
        for v in row:
            av = abs(v)
            if scale is None or av > scale:
                scale = av
    if scale is None or scale == 0.0:
        scale = 1.0
    threshold = 1e-13 * scale
    ops: list[tuple[int, list[tuple[int, float]]]] = []
    for col in range(n):
        pivot_row = col
        pivot_abs = abs(mat[col][col])
        for r in range(col + 1, n):
            row_abs = abs(mat[r][col])
            if row_abs > pivot_abs:
                pivot_row = r
                pivot_abs = row_abs
        if pivot_abs <= threshold:
            return None
        if pivot_row != col:
            mat[col], mat[pivot_row] = mat[pivot_row], mat[col]
        pivot_val = mat[col][col]
        row_col = mat[col]
        factors: list[tuple[int, float]] = []
        for r in range(col + 1, n):
            factor = mat[r][col] / pivot_val
            factors.append((r, factor))
            if factor == 0.0:
                continue
            row_r = mat[r]
            for c in range(col, n):
                row_r[c] -= factor * row_col[c]
        ops.append((pivot_row, factors))
    return mat, ops


def _lu_apply(factored: _LUFactored, b: Sequence[float]) -> list[float]:
    """Solve `a @ x = b` using `a`'s factorization from `_lu_factor`.

    Replays `_lu_factor`'s recorded swaps and multipliers against `b`
    (forward substitution), then back-substitutes through the stored
    upper-triangular matrix — the same two phases `_solve_dense`'s single
    Gaussian-elimination pass folds together, split out so the elimination
    phase (the expensive one) runs once per matrix instead of once per
    right-hand side. Bit-identical to solving `a`'s augmented `[a | b]`
    directly: the multipliers depend only on `a`, so replaying them in the
    same order against `b` performs the exact same floating-point
    operations in the exact same sequence as eliminating the augmented
    column alongside `a` would.
    """
    mat, ops = factored
    n = len(b)
    vec = list(b)
    for col in range(n):
        pivot_row, factors = ops[col]
        if pivot_row != col:
            vec[col], vec[pivot_row] = vec[pivot_row], vec[col]
        pivot_col_val = vec[col]
        for r, factor in factors:
            if factor == 0.0:
                continue
            vec[r] -= factor * pivot_col_val
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = vec[i]
        for j in range(i + 1, n):
            s -= mat[i][j] * x[j]
        x[i] = s / mat[i][i]
    return x


def _solve_dense(
    a: Sequence[Sequence[float]], b: Sequence[float]
) -> list[float] | None:
    """Solve `a @ x = b` by Gaussian elimination with partial pivoting.

    A thin `_lu_factor` + `_lu_apply` wrapper for the (common) case of a
    single right-hand side; see `_lu_factor` for why the two are split, and
    `_cauchy` for the one caller that uses them directly instead, to reuse
    one factorization across several right-hand sides.

    Returns:
        The solution, or `None` when a pivot is smaller than `1e-13` times
        the matrix's largest entry, signalling a numerically singular
        system. Callers treat `None` the way Fortran treats `info != 0`
        from `dpofa`/`dtrsl`: refresh the L-BFGS memory and retry.
    """
    n = len(b)
    if n == 0:
        return []
    if len(a) != n:
        raise ValueError("_solve_dense: mismatched lengths")
    factored = _lu_factor(a)
    if factored is None:
        return None
    return _lu_apply(factored, b)


# ---------------------------------------------------------------------------
# Bounds resolution
# ---------------------------------------------------------------------------


def _resolve_bounds(
    bounds: Sequence[tuple[float | None, float | None]] | None, n: int
) -> tuple[list[int], list[float], list[float]]:
    """`(low, high)` pairs, `None` meaning unbounded, into `(nbd, low, high)`.

    Matches `scipy.optimize._lbfgsb_py._minimize_lbfgsb`'s `bounds_map`
    exactly: a side left `None` contributes `0.0` as a placeholder into
    `low`/`high` (never read, since `nbd` says that side is unbounded).
    """
    nbd = [_UNBOUNDED] * n
    low = [0.0] * n
    high = [0.0] * n
    if bounds is None:
        return nbd, low, high
    for i, (lo, hi) in enumerate(bounds):
        has_low = lo is not None
        has_high = hi is not None
        if has_low:
            low[i] = float(lo)
        if has_high:
            high[i] = float(hi)
        if has_low and has_high:
            nbd[i] = _BOTH
        elif has_low:
            nbd[i] = _LOWER_ONLY
        elif has_high:
            nbd[i] = _UPPER_ONLY
        else:
            nbd[i] = _UNBOUNDED
    return nbd, low, high


def _init_iwhere(
    low: Sequence[float], high: Sequence[float], nbd: Sequence[int]
) -> list[int]:
    """Fortran `active`'s `iwhere` initialization: `-1` always free (no
    bounds), `3` permanently fixed (`low == high`), `0` otherwise (refined
    per-call by `_cauchy`)."""
    iwhere = [0] * len(nbd)
    for i, b in enumerate(nbd):
        if b == _UNBOUNDED:
            iwhere[i] = -1
        elif b == _BOTH and high[i] - low[i] <= 0.0:
            iwhere[i] = 3
        else:
            iwhere[i] = 0
    return iwhere


def _project_into_box(
    x: list[float], low: Sequence[float], high: Sequence[float], nbd: Sequence[int]
) -> None:
    """Fortran `active`'s projection half: clamp `x` into the box, in place."""
    for i in range(len(x)):
        if nbd[i] in (_LOWER_ONLY, _BOTH) and x[i] < low[i]:
            x[i] = low[i]
        elif nbd[i] in (_BOTH, _UPPER_ONLY) and x[i] > high[i]:
            x[i] = high[i]


def _projected_gradient_inf_norm(
    x: Sequence[float],
    g: Sequence[float],
    low: Sequence[float],
    high: Sequence[float],
    nbd: Sequence[int],
) -> float:
    """Fortran `projgr`: the infinity norm of the projected (negative)
    gradient, scipy/L-BFGS-B's convergence measure."""
    result = 0.0
    for i in range(len(x)):
        gi = g[i]
        if gi != gi:
            return gi  # NaN: propagate it, as `projgr` does.
        if nbd[i] != _UNBOUNDED:
            if gi < 0.0:
                if nbd[i] >= _BOTH:
                    gi = max(x[i] - high[i], gi)
            elif nbd[i] <= _BOTH:
                gi = min(x[i] - low[i], gi)
        result = max(result, abs(gi))
    return result


def _max_feasible_step(
    x: Sequence[float],
    low: Sequence[float],
    high: Sequence[float],
    nbd: Sequence[int],
    d: Sequence[float],
) -> float:
    """Fortran `lnsrlb`'s `stpmx`: the largest `t >= 0` such that
    `x + t*d` stays inside the box. `1e10` (Fortran's `big`) stands in for
    "unbounded"."""
    stpmx = 1.0e10
    for i in range(len(x)):
        di = d[i]
        if di == 0.0 or nbd[i] == _UNBOUNDED:
            continue
        if di < 0.0 and nbd[i] <= _BOTH:
            a2 = low[i] - x[i]
            if a2 >= 0.0:
                stpmx = 0.0
            elif di * stpmx < a2:
                stpmx = a2 / di
        elif di > 0.0 and nbd[i] >= _BOTH:
            a2 = high[i] - x[i]
            if a2 <= 0.0:
                stpmx = 0.0
            elif di * stpmx > a2:
                stpmx = a2 / di
    return stpmx


# ---------------------------------------------------------------------------
# The limited-memory representation: correction pairs, theta, the skip rule
# ---------------------------------------------------------------------------


@dataclass
class _LBFGSMemory:
    """The correction pairs `(S, Y)` and scaling `theta` defining the
    current limited-memory BFGS matrix `B = theta*I - W M^-1 W'`.

    Oldest-to-newest order, a plain Python list rather than Fortran's
    circular buffer (`head`/`itail`) — there is no performance reason to
    avoid `list.append`/`list.pop(0)` at `maxcor <= 10` pairs.
    """

    S: list[list[float]] = field(default_factory=list)
    Y: list[list[float]] = field(default_factory=list)
    theta: float = 1.0
    bmv_version: int = 0
    """Bumped by `_matupd` and `reset` — the only two places that mutate
    `S`/`Y`/`theta` — so `_cached_bmv_factored` can tell whether its cached
    factorization of `_bmv_matrix(memory)` is still current."""
    bmv_cache: tuple[int, _LUFactored | None] | None = None
    """`(version, factored)` from the last `_cached_bmv_factored` call, or
    `None` before the first one."""

    @property
    def col(self) -> int:
        return len(self.S)

    def reset(self) -> None:
        """Fortran's "refresh the lbfgs memory": drop every correction
        pair and restore `B_0 = I`, in response to a singular linear
        system or a line-search failure with `col > 0`."""
        self.S.clear()
        self.Y.clear()
        self.theta = 1.0
        self.bmv_version += 1


def _matupd(
    memory: _LBFGSMemory,
    maxcor: int,
    s: list[float],
    y: list[float],
    rr: float,
    dr: float,
) -> None:
    """Fortran `matupd`: append the newest correction pair, evict the
    oldest once more than `maxcor` are held, and rescale `theta = y'y/y's`.

    The *skip* decision (`dr <= epsmch * ddum`) is made by the caller
    before this is invoked — this function only ever appends, matching
    Fortran's `matupd`, which likewise is only ever called after `mainlb`'s
    own skip test has already passed.
    """
    memory.S.append(s)
    memory.Y.append(y)
    if len(memory.S) > maxcor:
        memory.S.pop(0)
        memory.Y.pop(0)
    memory.theta = rr / dr
    memory.bmv_version += 1


def _bmv_matrix(memory: _LBFGSMemory) -> list[list[float]]:
    """The compact middle matrix `M = [[-D, L'], [L, theta*S'S]]` of the
    *global* (unrestricted) limited-memory Hessian, Byrd-Nocedal-Schnabel's
    representation. `D = diag(s_i'y_i)`, `L` the strictly-lower-triangular
    part of `S'Y` (both computed directly from the stored pairs, not
    maintained incrementally — see the module docstring)."""
    s, y, theta = memory.S, memory.Y, memory.theta
    col = len(s)
    size = 2 * col
    mat = [[0.0] * size for _ in range(size)]
    for a in range(col):
        mat[a][a] = -_dot(s[a], y[a])
    for a in range(col):
        for b in range(a):
            val = _dot(s[a], y[b])
            mat[col + a][b] = val
            mat[b][col + a] = val
    for a in range(col):
        for b in range(col):
            mat[col + a][col + b] = theta * _dot(s[a], s[b])
    return mat


def _cached_bmv_factored(memory: _LBFGSMemory) -> _LUFactored | None:
    """`_bmv_matrix(memory)`'s LU factorization, cached for as long as
    `memory` stays unchanged.

    `_cauchy` and `_cmprlb` both need this factorization for the *same*
    `memory` within one outer iteration of `_minimize_lbfgsb` — `_cauchy`
    runs first, `_cmprlb` right after, and `memory` is never touched
    between them (`_matupd` only runs once per outer iteration, after both,
    once a step is accepted). Rebuilding `M` from its correction pairs
    (`_bmv_matrix`) and re-factoring it (`_lu_factor`) a second time for an
    identical matrix was pure duplicated work; caching by `bmv_version`
    (bumped exactly when `S`/`Y`/`theta` change: `_matupd` and `reset`)
    removes it without changing which factorization is ever used, so
    results are unaffected.
    """
    cache = memory.bmv_cache
    if cache is None or cache[0] != memory.bmv_version:
        factored = _lu_factor(_bmv_matrix(memory)) if memory.col > 0 else None
        cache = (memory.bmv_version, factored)
        memory.bmv_cache = cache
    return cache[1]


# ---------------------------------------------------------------------------
# The generalized Cauchy point
# ---------------------------------------------------------------------------


@dataclass
class _CauchyResult:
    xcp: list[float]
    c: list[float]
    iwhere: list[int]


def _cauchy(
    x: Sequence[float],
    low: Sequence[float],
    high: Sequence[float],
    nbd: Sequence[int],
    g: Sequence[float],
    iwhere: Sequence[int],
    memory: _LBFGSMemory,
    epsmch: float,
) -> _CauchyResult | None:
    """Fortran `cauchy`: the first local minimizer of the quadratic model
    `Q(x+s) = g's + s'Bs/2` along the piecewise-linear projected-gradient
    path `P(x - t*g, low, high)`, found by walking its breakpoints — the
    points where a coordinate would cross its bound — in increasing order
    (a min-heap standing in for Fortran's `hpsolb`) and fixing each
    coordinate at its bound as its breakpoint is passed, until the
    quadratic's unconstrained stationary point on the current segment
    falls short of the next breakpoint.

    Returns:
        The Cauchy point `xcp`, the accumulated `c = W'(xcp - x)` cmprlb
        needs, and the refined `iwhere`; or `None` if the compact-matrix
        solve (`_bmv_matrix`) hit a singular system, signalling the caller
        to refresh the L-BFGS memory and retry.
    """
    n = len(x)
    col = memory.col
    theta = memory.theta
    s_pairs, y_pairs = memory.S, memory.Y

    iwhere = list(iwhere)
    neg_dir = [0.0] * n
    p = [0.0] * (2 * col)
    breakpoints: list[tuple[float, int]] = []
    bnded = True
    f1 = 0.0

    for i in range(n):
        neggi = -g[i]
        if iwhere[i] not in (3, -1):
            tl = x[i] - low[i] if nbd[i] <= _BOTH else None
            tu = high[i] - x[i] if nbd[i] >= _BOTH else None
            xlower = nbd[i] <= _BOTH and tl is not None and tl <= 0.0
            xupper = nbd[i] >= _BOTH and tu is not None and tu <= 0.0
            iwhere[i] = 0
            if xlower:
                if neggi <= 0.0:
                    iwhere[i] = 1
            elif xupper:
                if neggi >= 0.0:
                    iwhere[i] = 2
            elif abs(neggi) <= 0.0:
                iwhere[i] = -3

        if iwhere[i] not in (0, -1):
            continue

        neg_dir[i] = neggi
        f1 -= neggi * neggi
        for j in range(col):
            p[j] += y_pairs[j][i] * neggi
            p[col + j] += s_pairs[j][i] * neggi

        if nbd[i] != _UNBOUNDED and nbd[i] <= _BOTH and neggi < 0.0:
            heapq.heappush(breakpoints, ((x[i] - low[i]) / -neggi, i))
        elif nbd[i] >= _BOTH and neggi > 0.0:
            heapq.heappush(breakpoints, ((high[i] - x[i]) / neggi, i))
        elif neggi != 0.0:
            bnded = False

    if theta != 1.0:
        for j in range(col):
            p[col + j] *= theta

    xcp = list(x)
    if not breakpoints and all(v == 0.0 for v in neg_dir):
        return _CauchyResult(xcp=xcp, c=[0.0] * (2 * col), iwhere=iwhere)

    # `_cached_bmv_factored` factors `_bmv_matrix(memory)` once per `memory`
    # state and reuses it for every right-hand side this walk poses (the
    # initial `p` below, then one `wbp` per breakpoint) *and* for
    # `_cmprlb`'s solve right after this call returns, for the same
    # unchanged `memory` -- see its docstring.
    bmv_factored: _LUFactored | None = None
    c = [0.0] * (2 * col)
    f2 = -theta * f1
    f2_org = f2
    if col > 0:
        bmv_factored = _cached_bmv_factored(memory)
        if bmv_factored is None:
            return None
        v = _lu_apply(bmv_factored, p)
        f2 -= _dot(v, p)

    dtm = -f1 / f2 if f2 != 0.0 else 0.0
    tsum = 0.0
    tj_prev = 0.0
    while breakpoints:
        tj, ibp = heapq.heappop(breakpoints)
        dt = tj - tj_prev
        tj_prev = tj
        if dtm < dt:
            break
        tsum += dt
        dibp = neg_dir[ibp]
        neg_dir[ibp] = 0.0
        if dibp > 0.0:
            zibp = high[ibp] - x[ibp]
            xcp[ibp] = high[ibp]
            iwhere[ibp] = 2
        else:
            zibp = low[ibp] - x[ibp]
            xcp[ibp] = low[ibp]
            iwhere[ibp] = 1
        dibp2 = dibp * dibp
        f1 = f1 + dt * f2 + dibp2 - theta * dibp * zibp
        f2 = f2 - theta * dibp2
        if col > 0:
            assert bmv_factored is not None
            for k in range(2 * col):
                c[k] += dt * p[k]
            wbp = [y_pairs[j][ibp] for j in range(col)] + [
                theta * s_pairs[j][ibp] for j in range(col)
            ]
            v = _lu_apply(bmv_factored, wbp)
            wmc = _dot(c, v)
            wmp = _dot(p, v)
            wmw = _dot(wbp, v)
            for k in range(2 * col):
                p[k] -= dibp * wbp[k]
            f1 += dibp * wmc
            f2 += 2.0 * dibp * wmp - dibp2 * wmw
        f2 = max(epsmch * f2_org, f2)
        if breakpoints:
            dtm = -f1 / f2 if f2 != 0.0 else 0.0
        else:
            dtm = 0.0 if bnded else (-f1 / f2 if f2 != 0.0 else 0.0)

    dtm = max(dtm, 0.0)
    tsum += dtm
    for i in range(n):
        xcp[i] += tsum * neg_dir[i]
    if col > 0:
        for k in range(2 * col):
            c[k] += dtm * p[k]
    return _CauchyResult(xcp=xcp, c=c, iwhere=iwhere)


# ---------------------------------------------------------------------------
# The reduced gradient at the Cauchy point, and subspace minimization
# ---------------------------------------------------------------------------


def _cmprlb(
    x: Sequence[float],
    g: Sequence[float],
    memory: _LBFGSMemory,
    z: Sequence[float],
    c: Sequence[float],
    free_idx: Sequence[int],
    cnstnd: bool,
) -> list[float] | None:
    """Fortran `cmprlb`: `r = -Z'B(xcp - x) - Z'g`, the reduced gradient of
    the quadratic model at the Cauchy point over the free variables,
    computed from `c = W'(xcp - x)` (`_cauchy`'s output) rather than
    forming `B` explicitly.

    Returns:
        `None` when the compact-matrix solve hit a singular system
        (`_cached_bmv_factored`), signalling a memory refresh and retry.
    """
    col = memory.col
    if not cnstnd and col > 0:
        return [-gi for gi in g]

    r = [-memory.theta * (z[k] - x[k]) - g[k] for k in free_idx]
    if col > 0:
        # `_cached_bmv_factored`, not a fresh `_bmv_matrix`/`_solve_dense`:
        # `_cauchy` (called just before this, for the same unchanged
        # `memory`) already built and factored the identical matrix -- see
        # its docstring.
        bmv_factored = _cached_bmv_factored(memory)
        if bmv_factored is None:
            return None
        a = _lu_apply(bmv_factored, c)
        s_pairs, y_pairs, theta = memory.S, memory.Y, memory.theta
        # `range(len(free_idx))` rather than `enumerate(free_idx)` -- see
        # `_dot`'s docstring; this loop runs every outer iteration.
        for idx in range(len(free_idx)):
            k = free_idx[idx]
            add = 0.0
            for j in range(col):
                add += y_pairs[j][k] * a[j] + s_pairs[j][k] * theta * a[col + j]
            r[idx] += add
    return r


def _subsm_reduced_matrix(
    memory: _LBFGSMemory, free_idx: Sequence[int], active_idx: Sequence[int]
) -> list[list[float]]:
    """Fortran `formk`'s `K` matrix: the free/active-restricted compact
    representation `subsm` needs for the Sherman-Morrison-Woodbury form of
    `(Z'BZ)^-1`,

    ```text
    K = [ -D - Y'ZZ'Y/theta    L_a' - R_z'      ]
        [  L_a - R_z           theta*S'AA'S     ]
    ```

    where `Z`/`A` project onto the free/active coordinates respectively,
    `L_a` is the strictly-pair-lower-triangular part of `S'Y` restricted to
    the *active* set, and `R_z` the pair-upper-or-diagonal part restricted
    to the *free* set. `D` is the ordinary (unrestricted) diagonal `S'Y`
    already used by `_bmv_matrix` — computed directly here (no `formk`-style
    incremental cache; see the module docstring).
    """
    s_pairs, y_pairs, theta = memory.S, memory.Y, memory.theta
    col = len(s_pairs)
    size = 2 * col
    mat = [[0.0] * size for _ in range(size)]

    def dot_over(u: Sequence[float], v: Sequence[float], idx: Sequence[int]) -> float:
        # A plain accumulator loop rather than `sum(genexpr)`: called
        # `O(maxcor**2)` times per call, and a generator expression pays the
        # same per-`StopIteration` stack-trace tax `_dot` avoids above.
        total = 0.0
        for k in idx:
            total += u[k] * v[k]
        return total

    d_diag = [_dot(s_pairs[a], y_pairs[a]) for a in range(col)]
    for a in range(col):
        for b in range(col):
            yff = dot_over(y_pairs[a], y_pairs[b], free_idx)
            mat[a][b] = -yff / theta - (d_diag[a] if a == b else 0.0)
    for a in range(col):
        for b in range(col):
            saa = dot_over(s_pairs[a], s_pairs[b], active_idx)
            mat[col + a][col + b] = theta * saa
    for a in range(col):
        for b in range(col):
            if b > a:
                val = dot_over(s_pairs[b], y_pairs[a], active_idx)
            else:
                val = -dot_over(s_pairs[b], y_pairs[a], free_idx)
            mat[a][col + b] = val
            mat[col + b][a] = val
    return mat


def _subsm(
    free_idx: Sequence[int],
    low: Sequence[float],
    high: Sequence[float],
    nbd: Sequence[int],
    x: Sequence[float],
    g: Sequence[float],
    z: Sequence[float],
    r: Sequence[float],
    memory: _LBFGSMemory,
) -> tuple[list[float], int] | None:
    """Fortran `subsm` (the 2011 Morales-Nocedal version): an approximate
    Newton step for the free variables of the quadratic model, from the
    Cauchy point `z` and its reduced gradient `r` (`_cmprlb`'s output).

    The Newton direction is projected into the box; if that projection
    reverses the direction (checked via the sign of `(x_new - z)'g` over
    *all* coordinates, not just the free ones), the projected step is
    discarded outright and `z` itself is returned unchanged. Otherwise a
    backtracking ratio `alpha <= 1` pulls the step back to the first bound
    it would otherwise cross.

    Returns:
        `(values, iword)` — `values[i]` is the new coordinate for
        `free_idx[i]`, and `iword` is `0` if the unprojected Newton step
        stayed inside the box, `1` otherwise (matching Fortran's `iword`,
        which `mainlb` reports as `sub = 'con'`/`'bnd'`). `None` when a
        reduced-matrix solve was singular (refresh and retry).
    """
    nsub = len(free_idx)
    if nsub == 0:
        return [], 0

    col = memory.col
    theta = memory.theta
    d = list(r)

    if col > 0:
        s_pairs, y_pairs = memory.S, memory.Y
        wv = [0.0] * (2 * col)
        # `range(nsub)` rather than `enumerate(free_idx)` -- see `_dot`'s
        # docstring. This one matters most: it is nested inside the
        # `col`-loop, so the old form built and exhausted a fresh
        # `enumerate` generator (one `StopIteration` each) up to `maxcor`
        # times per `_subsm` call.
        for a in range(col):
            t1 = 0.0
            t2 = 0.0
            for idx in range(nsub):
                k = free_idx[idx]
                t1 += y_pairs[a][k] * d[idx]
                t2 += s_pairs[a][k] * d[idx]
            wv[a] = t1
            wv[col + a] = theta * t2

        free_set = set(free_idx)
        active_idx = [i for i in range(len(x)) if i not in free_set]
        k_matrix = _subsm_reduced_matrix(memory, free_idx, active_idx)
        y_sol = _solve_dense(k_matrix, wv)
        if y_sol is None:
            return None

        for idx in range(nsub):
            k = free_idx[idx]
            add = 0.0
            for a in range(col):
                add += y_pairs[a][k] * y_sol[a] / theta + s_pairs[a][k] * y_sol[col + a]
            d[idx] += add
        d = [di / theta for di in d]

    new_x: dict[int, float] = {}
    iword = 0
    for idx in range(nsub):
        k = free_idx[idx]
        dk = d[idx]
        xk = z[k]
        if nbd[k] == _UNBOUNDED:
            new_x[k] = xk + dk
        elif nbd[k] == _LOWER_ONLY:
            val = max(low[k], xk + dk)
            if val == low[k]:
                iword = 1
            new_x[k] = val
        elif nbd[k] == _BOTH:
            val = max(low[k], xk + dk)
            val = min(high[k], val)
            if val == low[k] or val == high[k]:
                iword = 1
            new_x[k] = val
        else:
            val = min(high[k], xk + dk)
            if val == high[k]:
                iword = 1
            new_x[k] = val

    if iword == 0:
        return [new_x[k] for k in free_idx], 0

    dd_p = 0.0
    for k in range(len(x)):
        new_val = new_x.get(k, z[k])
        dd_p += (new_val - x[k]) * g[k]
    if dd_p > 0.0:
        # The projected Newton step is not a descent direction: discard it
        # entirely and keep the Cauchy point.
        return [z[k] for k in free_idx], iword

    alpha = 1.0
    ibd = -1
    for idx in range(nsub):
        k = free_idx[idx]
        dk = d[idx]
        if nbd[k] == _UNBOUNDED:
            continue
        temp1 = alpha
        xk_clipped = new_x[k]
        if dk < 0.0 and nbd[k] <= _BOTH:
            temp2 = low[k] - xk_clipped
            if temp2 >= 0.0:
                temp1 = 0.0
            elif dk * alpha < temp2:
                temp1 = temp2 / dk
        elif dk > 0.0 and nbd[k] >= _BOTH:
            temp2 = high[k] - xk_clipped
            if temp2 <= 0.0:
                temp1 = 0.0
            elif dk * alpha > temp2:
                temp1 = temp2 / dk
        if temp1 < alpha:
            alpha = temp1
            ibd = idx

    if alpha < 1.0 and ibd >= 0:
        dk = d[ibd]
        k = free_idx[ibd]
        if dk > 0.0:
            new_x[k] = high[k]
        elif dk < 0.0:
            new_x[k] = low[k]
        d[ibd] = 0.0

    for idx in range(nsub):
        k = free_idx[idx]
        new_x[k] = new_x[k] + alpha * d[idx]

    return [new_x[k] for k in free_idx], iword


# ---------------------------------------------------------------------------
# The line search: `line_search.DCSRCH`, driven directly
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _LineSearchOutcome:
    x: list[float]
    f: float
    g: list[float]
    alpha: float
    exhausted_maxfun: bool = False


def _line_search(
    fun_and_grad: Callable[[list[float]], tuple[float, list[float]]],
    x0: Sequence[float],
    d: Sequence[float],
    low: Sequence[float],
    high: Sequence[float],
    nbd: Sequence[int],
    f0: float,
    gd0: float,
    stpmx: float,
    maxls: int,
    counts: _EvalCounts,
    maxfun: int,
) -> _LineSearchOutcome | None:
    """Fortran `lnsrlb`: a Moré-Thuente step along `d` from `x0`, safeguarded
    to `[0, stpmx]` so every trial point stays inside the box.

    `line_search.DCSRCH.iterate` is driven by hand, the same pattern
    `tnc.py`'s `_line_search` uses `DCSRCH` for — see the module
    docstring for why the public `scalar_search_wolfe1` wrapper does not
    fit here. The trial step always starts at `1.0`: since `d` reaches a
    point already inside the box at `alpha=1` (the Cauchy/subspace point),
    `stpmx >= 1` always holds, so this is never rejected as infeasible.

    A `dcsrch` outcome is accepted whenever its `task` is `"CONVERGENCE"` or
    any `"WARNING: ..."`, matching Fortran `lnsrlb.f` exactly
    (`if (csave(1:4) .ne. 'CONV' .and. csave(1:4) .ne. 'WARN') then
    task = 'FG_LNSRCH'`, i.e. anything *other* than those two means "ask for
    another trial point"; both are otherwise treated identically as "done,
    take this step" — `lnsrlb` itself never distinguishes them, and the
    outer loop (`mainlb`) decides convergence from its own `pgtol`/`factr`
    tests, entirely independently of which of the two `dcsrch` returned).
    This matters concretely: `"WARNING: STP = STPMAX"` — a sufficient
    decrease with the curvature condition unmet exactly at the box
    boundary — is the single most common outcome of a bound-constrained
    line search once a coordinate's unconstrained optimum lies outside the
    box, because the curvature condition can be mathematically impossible
    to satisfy *within* the feasible interval (there is no room to extend
    the step far enough for the derivative to flatten out, the box wall
    gets there first). Requiring a bare `"CONVERGENCE"` here would reject
    that outcome as a failure on the very first iteration of, for example,
    minimizing `(x-10)**2` in `x <= 5` from `x = 0`, even though `x = 5` is
    plainly the constrained minimizer.

    Returns:
        The accepted step's point, value, gradient and `alpha`; `None` on
        an outright line-search failure (an error from `dcsrch`, or `maxls`
        trial steps without either a convergence or a warning outcome); or
        an outcome with `exhausted_maxfun=True` if the function-call budget
        ran out mid-search.
    """
    n = len(x0)
    last_g: list[float] = []
    last_f = f0

    def trial_point(alpha: float) -> list[float]:
        point = []
        for i in range(n):
            xi = x0[i] + alpha * d[i]
            if nbd[i] in (_LOWER_ONLY, _BOTH):
                xi = max(xi, low[i])
            if nbd[i] in (_BOTH, _UPPER_ONLY):
                xi = min(xi, high[i])
            point.append(xi)
        return point

    def phi(alpha: float) -> float:
        nonlocal last_g, last_f
        fx, gx = fun_and_grad(trial_point(alpha))
        last_g, last_f = gx, fx
        return fx

    def derphi(alpha: float) -> float:
        del alpha  # `derphi` is only ever called right after `phi` below.
        return _dot(last_g, d)

    dcsrch = DCSRCH(phi, derphi, 1e-3, 0.9, 0.1, 0.0, stpmx)

    stp = 1.0
    f_val = f0
    g_val = gd0
    task = "START"
    accepted = False
    for _ in range(maxls):
        step, f_val, g_val, task = dcsrch.iterate(stp, f_val, g_val, task)
        if not math.isfinite(step):
            return None
        stp = step
        if not task.startswith("FG"):
            # Fortran `lnsrlb` accepts CONVERGENCE and any WARNING alike —
            # see the docstring above — and rejects only ERROR tasks, which
            # `_minimize_lbfgsb` guards against ever reaching this point
            # (the `gd0 >= 0.0` ascent check runs before every call here).
            accepted = task.startswith("CONVERGENCE") or task.startswith("WARNING")
            break
        if counts.calls >= maxfun:
            return _LineSearchOutcome([], 0.0, [], 0.0, exhausted_maxfun=True)
        f_val = phi(stp)
        g_val = derphi(stp)
    else:
        return None

    if not accepted:
        return None
    return _LineSearchOutcome(trial_point(stp), f_val, list(last_g), stp)


# ---------------------------------------------------------------------------
# Function/gradient evaluation counting
# ---------------------------------------------------------------------------


@dataclass
class _EvalCounts:
    calls: int = 0


def _make_fun_and_grad(
    fun: Callable[[Sequence[float]], float],
    jac: Callable[[Sequence[float]], Sequence[float]] | None,
    eps: float,
    counts: _EvalCounts,
) -> Callable[[list[float]], tuple[float, list[float]]]:
    """Build the counted `(f(x), grad f(x))` evaluator every trial point in
    this module goes through — see the module docstring's counting
    section for why an analytic `jac` costs one count per pair while a
    finite-difference fallback costs `n + 2`."""

    def counted_fun(x: Sequence[float]) -> float:
        counts.calls += 1
        return float(fun(list(x)))

    if jac is None:

        def fun_and_grad_numeric(x: list[float]) -> tuple[float, list[float]]:
            fx = counted_fun(x)
            g = approx_fprime(list(x), counted_fun, eps)
            return fx, g

        return fun_and_grad_numeric

    def fun_and_grad_analytic(x: list[float]) -> tuple[float, list[float]]:
        return counted_fun(x), [float(v) for v in jac(list(x))]

    return fun_and_grad_analytic


# ---------------------------------------------------------------------------
# The main driver
# ---------------------------------------------------------------------------


def _make_result(
    x: Sequence[float],
    fval: float,
    g: Sequence[float],
    iteration: int,
    calls: int,
    converged: bool,
    status: int,
    message: str,
) -> LBFGSBResult:
    flag = "CONVERGED_PGTOL"
    if converged:
        flag = "CONVERGED_FTOL" if message == _MSG_CONVERGED_F else "CONVERGED_PGTOL"
    elif status == 1:
        flag = "MAXFUN" if message == _MSG_MAXFUN else "MAXITER"
    else:
        flag = "ABNORMAL"
    return LBFGSBResult(
        x=list(x),
        fun=fval,
        jac=list(g),
        iterations=iteration,
        function_calls=calls,
        converged=converged,
        flag=flag,
        message=message,
        status=status,
    )


def _minimize_lbfgsb(
    fun: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    jac: Callable[[Sequence[float]], Sequence[float]] | None = None,
    bounds: Sequence[tuple[float | None, float | None]] | None = None,
    m: int = 10,
    factr: float = 1e7,
    pgtol: float = 1e-5,
    eps: float = 1e-8,
    maxfun: int = 15000,
    maxiter: int = 15000,
    maxls: int = 20,
) -> LBFGSBResult:
    """The algorithm itself — see the module docstring for the shape and
    `fmin_l_bfgs_b` for scipy's public spelling of the arguments."""
    n = len(x0)
    if bounds is not None and len(bounds) != n:
        raise ValueError("length of x0 != length of bounds")

    nbd, low, high = _resolve_bounds(bounds, n)
    for i in range(n):
        if nbd[i] == _BOTH and low[i] > high[i]:
            raise ValueError(
                "LBFGSB - one of the lower bounds is greater than an upper bound."
            )

    x_cur = [float(v) for v in x0]
    _project_into_box(x_cur, low, high, nbd)
    iwhere = _init_iwhere(low, high, nbd)
    cnstnd = any(b != _UNBOUNDED for b in nbd)

    counts = _EvalCounts()
    fun_and_grad = _make_fun_and_grad(fun, jac, eps, counts)

    tol = factr * _FLOAT64_EPS
    f_cur, g_cur = fun_and_grad(x_cur)

    sbgnrm = _projected_gradient_inf_norm(x_cur, g_cur, low, high, nbd)
    if sbgnrm <= pgtol:
        return _make_result(
            x_cur, f_cur, g_cur, 0, counts.calls, True, 0, _MSG_CONVERGED_GRAD
        )

    memory = _LBFGSMemory()
    iteration = 0
    memory_resets = 0

    while True:
        if not cnstnd and memory.col > 0:
            z = list(x_cur)
            c_vec = [0.0] * (2 * memory.col)
        else:
            cauchy_result = _cauchy(
                x_cur, low, high, nbd, g_cur, iwhere, memory, _FLOAT64_EPS
            )
            if cauchy_result is None:
                memory.reset()
                memory_resets += 1
                if memory_resets > _MAX_MEMORY_RESETS:
                    return _make_result(
                        x_cur,
                        f_cur,
                        g_cur,
                        iteration,
                        counts.calls,
                        False,
                        2,
                        _MSG_ABNORMAL_LS,
                    )
                continue
            z = cauchy_result.xcp
            iwhere = cauchy_result.iwhere
            c_vec = cauchy_result.c

        free_idx = [i for i in range(n) if iwhere[i] <= 0]

        if free_idx and memory.col > 0:
            r = _cmprlb(x_cur, g_cur, memory, z, c_vec, free_idx, cnstnd)
            if r is None:
                memory.reset()
                memory_resets += 1
                if memory_resets > _MAX_MEMORY_RESETS:
                    return _make_result(
                        x_cur,
                        f_cur,
                        g_cur,
                        iteration,
                        counts.calls,
                        False,
                        2,
                        _MSG_ABNORMAL_LS,
                    )
                continue
            subsm_result = _subsm(free_idx, low, high, nbd, x_cur, g_cur, z, r, memory)
            if subsm_result is None:
                memory.reset()
                memory_resets += 1
                if memory_resets > _MAX_MEMORY_RESETS:
                    return _make_result(
                        x_cur,
                        f_cur,
                        g_cur,
                        iteration,
                        counts.calls,
                        False,
                        2,
                        _MSG_ABNORMAL_LS,
                    )
                continue
            new_vals, _iword = subsm_result
            for idx in range(len(free_idx)):
                z[free_idx[idx]] = new_vals[idx]

        d = [z[i] - x_cur[i] for i in range(n)]
        dnorm = math.sqrt(_dot(d, d))
        if dnorm == 0.0:
            return _make_result(
                x_cur, f_cur, g_cur, iteration, counts.calls, False, 2, _MSG_NO_PROGRESS
            )

        stpmx = _max_feasible_step(x_cur, low, high, nbd, d)
        gd0 = _dot(g_cur, d)
        if gd0 >= 0.0:
            return _make_result(
                x_cur, f_cur, g_cur, iteration, counts.calls, False, 2, _MSG_ASCENT
            )

        if counts.calls >= maxfun:
            return _make_result(
                x_cur, f_cur, g_cur, iteration, counts.calls, False, 1, _MSG_MAXFUN
            )

        ls = _line_search(
            fun_and_grad,
            x_cur,
            d,
            low,
            high,
            nbd,
            f_cur,
            gd0,
            stpmx,
            maxls,
            counts,
            maxfun,
        )

        if ls is None:
            if memory.col == 0:
                return _make_result(
                    x_cur,
                    f_cur,
                    g_cur,
                    iteration,
                    counts.calls,
                    False,
                    2,
                    _MSG_ABNORMAL_LS,
                )
            memory.reset()
            memory_resets += 1
            if memory_resets > _MAX_MEMORY_RESETS:
                return _make_result(
                    x_cur,
                    f_cur,
                    g_cur,
                    iteration,
                    counts.calls,
                    False,
                    2,
                    _MSG_ABNORMAL_LS,
                )
            continue

        if ls.exhausted_maxfun:
            return _make_result(
                x_cur, f_cur, g_cur, iteration, counts.calls, False, 1, _MSG_MAXFUN
            )

        memory_resets = 0
        x_new, f_new, g_new, alpha_k = ls.x, ls.f, ls.g, ls.alpha
        iteration += 1

        sbgnrm = _projected_gradient_inf_norm(x_new, g_new, low, high, nbd)
        converged_grad = sbgnrm <= pgtol
        ddum = max(abs(f_cur), abs(f_new), 1.0)
        converged_f = (f_cur - f_new) <= tol * ddum

        s_vec = [x_new[i] - x_cur[i] for i in range(n)]
        y_vec = [g_new[i] - g_cur[i] for i in range(n)]
        dr = _dot(y_vec, s_vec)
        rr = _dot(y_vec, y_vec)
        ddum2 = -gd0 * alpha_k
        if dr > _FLOAT64_EPS * ddum2:
            _matupd(memory, m, s_vec, y_vec, rr, dr)

        x_cur, f_cur, g_cur = x_new, f_new, g_new

        if converged_grad:
            return _make_result(
                x_cur,
                f_cur,
                g_cur,
                iteration,
                counts.calls,
                True,
                0,
                _MSG_CONVERGED_GRAD,
            )
        if converged_f:
            return _make_result(
                x_cur, f_cur, g_cur, iteration, counts.calls, True, 0, _MSG_CONVERGED_F
            )
        if iteration >= maxiter:
            return _make_result(
                x_cur, f_cur, g_cur, iteration, counts.calls, False, 1, _MSG_MAXITER
            )
        if counts.calls > maxfun:
            return _make_result(
                x_cur, f_cur, g_cur, iteration, counts.calls, False, 1, _MSG_MAXFUN
            )


def fmin_l_bfgs_b(
    f: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    fprime: Callable[[Sequence[float]], Sequence[float]] | None = None,
    bounds: Sequence[tuple[float | None, float | None]] | None = None,
    m: int = 10,
    factr: float = 1e7,
    pgtol: float = 1e-5,
    epsilon: float = 1e-8,
    maxfun: int = 15000,
    maxiter: int = 15000,
    maxls: int = 20,
) -> LBFGSBResult:
    """`scipy.optimize.fmin_l_bfgs_b`'s public spelling of `_minimize_lbfgsb`.

    Args:
        f: The scalar objective `f(x)`.
        x0: The starting point; fixes `n = len(x0)`. A point outside
            `bounds` is silently projected into the box, as scipy does.
        fprime: The gradient `grad f(x)`, or `None` to approximate it by
            `line_search.approx_fprime` with step `epsilon`.
        bounds: `(low, high)` pairs, one per coordinate, `None` on either
            side meaning unbounded there; `None` overall means unbounded
            everywhere. `low[i] > high[i]` raises `ValueError`; `low[i] ==
            high[i]` pins that coordinate permanently.
        m: The maximum number of correction pairs kept in the limited-
            memory matrix.
        factr: The relative function-reduction tolerance is
            `factr * numpy.finfo(float).eps`; the default `1e7` gives
            `ftol ~= 2.22e-9`.
        pgtol: The projected-gradient infinity-norm convergence tolerance.
        epsilon: The forward-difference step, used only when `fprime` is
            `None`. scipy's default here is `1e-8`, not the `sqrt(machine
            epsilon)` `line_search.approx_fprime`'s own default is.
        maxfun: Cap on `(f, grad f)` evaluation requests.
        maxiter: Cap on outer iterations.
        maxls: Cap on trial steps per line search.

    Returns:
        An `LBFGSBResult`.

    Raises:
        ValueError: If `bounds` is given with a length other than
            `len(x0)`, or if some `low[i] > high[i]`.
    """
    return _minimize_lbfgsb(
        f,
        x0,
        jac=fprime,
        bounds=bounds,
        m=m,
        factr=factr,
        pgtol=pgtol,
        eps=epsilon,
        maxfun=maxfun,
        maxiter=maxiter,
        maxls=maxls,
    )
