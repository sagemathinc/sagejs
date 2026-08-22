"""COBYLA: Constrained Optimization BY Linear Approximation.

Powell M. J. D. (1994), *A direct search optimization method that models
the objective and constraint functions by linear interpolation*, in
Advances in Optimization and Numerical Analysis, eds. S. Gomez and
J-P Hennart, Kluwer Academic (Dordrecht), pp. 51-67. This is the backend
`scipy.optimize.fmin_cobyla` uses and, through it, Sage's
`minimize_constrained` for general (non-box) constraints. A constraint is a
callable read as `g(x) >= 0`, matching both.

## Algorithm shape

COBYLA never uses derivatives. Instead it carries a *simplex* of `n + 1`
points around the current best point (the "pole"). The `n` edges from the
pole to the other vertices form a nonsingular `n x n` matrix; inverting it
gives, in one step, a linear (affine) model of the objective *and* of every
constraint, each exactly interpolating its function values at all `n + 1`
vertices. These models are only trustworthy near the simplex, so a step
built from them is confined to a *trust region* of radius `delta`.

Each outer iteration:

1. Build the linear models `f(pole + d) ~= f(pole) + g.d` and
   `c_j(pole + d) ~= c_j(pole) + a_j.d` from the current simplex.
2. Solve a trust-region subproblem for a step `d` with `||d|| <= delta`
   that decreases a *merit function* combining the model objective with
   the model's maximum constraint violation, `phi(d) = g.d + cpen * t(d)`
   where `t(d) = max(0, max_j(-(c_j(pole) + a_j.d)))` is the worst
   linearized violation after the step. `cpen > 0` is raised whenever the
   current value would not predict a genuine decrease of `phi`, so a step
   that only reduces infeasibility is never mistaken for a bad step. The
   step itself is found by Powell's own two-phase construction — phase 1
   minimizes `t(d)` alone within the ball, phase 2 then minimizes `g.d`
   with whatever length is left over, without exceeding the violation
   phase 1 already achieved — so a step out of a feasible point never
   trades feasibility away merely because `cpen` was not large enough
   (see `_trstlp`). Because those two phases
   are driven by the linearized constraints alone, the step does not
   depend on `cpen` at all, so `cpen` is updated *from* the step rather
   than by re-solving for it.
3. Evaluate `f` and the constraints at `pole + d`; compare the *actual*
   drop in the merit function to the drop the model *predicted*. A good
   ratio grows `delta` (and folds `d` into the simplex, replacing the
   vertex whose removal disturbs the simplex geometry least); a bad ratio
   shrinks it.
4. When trust-region steps stop helping, either the simplex geometry is
   repaired with an explicit *geometry step* (replacing the vertex
   farthest from the pole with one chosen to shrink the simplex's
   condition number), or, if the geometry is already adequate, the trust
   radius floor `rho` is reduced. `rho` starts at `rhobeg` and is driven
   down to `rhoend`; `delta >= rho` always, so `rho` reaching `rhoend` is
   the convergence signal.

## Reference implementation

The PRIMA project (Zaikun Zhang, <https://github.com/libprima/prima>,
BSD-3) is the modern, bug-fixed reference for Powell's derivative-free
methods and is what `scipy.optimize.fmin_cobyla` itself now calls (SciPy
>= 1.16). This module follows PRIMA's *shape* — pole-relative simplex,
adaptive `cpen`, trust radius `delta` bounded below by a floor `rho`,
geometry steps triggered by an "adequate geometry" test on edge lengths —
and step 2 above is Powell's own subproblem solver `TRSTLP`, implemented
here as `_trstlp`. That procedure is what makes COBYLA cheap: it is a
specialized two-stage active-set method run directly on the linearized
constraints, needing no generic QP solver and no matrix factorization from
scratch. It maintains an orthogonal matrix `z` whose leading columns are a
Gram-Schmidt basis for the gradients of the currently active constraints,
together with the diagonal `zdota` of the corresponding triangular factor,
and updates both by plane rotations as constraints enter and leave the
active set.

What is deliberately *not* taken from PRIMA: its Sherman-Morrison-updated
simplex inverse (this module recomputes the `n x n` inverse by a single
Gauss-Jordan sweep per outer iteration — profiling puts that at well under
one percent of the run time, so the incremental update would buy nothing),
its evaluation filter for selecting the returned point (here simply the
best of every point ever evaluated, feasible points within `catol` always
preferred over infeasible ones), and its handling of separate
linear/nonlinear constraint blocks. No PRIMA or Fortran source was copied;
`_trstlp` is a fresh structured implementation of the published procedure,
keeping Powell's names (`iact`, `nact`, `zdota`, `vmultc`, `vmultd`,
`sdirn`, `resmax`) so that it can be read against his description.

Known numerical deviations from PRIMA/Powell: the trust-region radius
update and the `rho` reduction schedule below use fixed constants in the
spirit of Powell's originals rather than his exact values, and the geometry
step's direction/vertex-drop choices are simpler proxies for PRIMA's more
refined conditioning measures.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

_INFINITY = float("inf")
"""IEEE `+inf`; the Sage.js `math` module has no `math.inf` attribute."""

_RHO_SNAP = 1.5
"""When `delta` falls to within this multiple of `rho`, snap `delta = rho`."""

_TR_ETA1 = 0.1
"""Reduction-ratio threshold below which a trust-region step is rejected."""

_TR_ETA2 = 0.7
"""Reduction-ratio threshold above which `delta` is allowed to grow."""

_TR_SHRINK = 0.5
_TR_GROW = 2.0


@dataclass(frozen=True)
class ConstrainedResult:
    """The outcome of a `cobyla` run.

    `maxcv` is the largest constraint violation `max(0, -g_j(x))` over all
    constraints at the returned `x`. `flag` is `"converged"` when the trust
    radius reached `rhoend` at a point with `maxcv <= catol`;
    `"converged:infeasible"` when the radius reached `rhoend` but the best
    point found still violates a constraint by more than `catol` (the
    constraints could not all be satisfied); `"maxfun"` when the function
    call budget ran out first; `"maxiter"` if neither happened within an
    internal safety cap on outer iterations. `converged` is `True` exactly
    when `flag == "converged"` — an infeasible point is never reported as
    converged, regardless of how small the trust radius became.
    """

    x: list[float]
    fun: float
    maxcv: float
    iterations: int
    function_calls: int
    converged: bool
    flag: str


def cobyla(
    f: Callable[[Sequence[float]], float],
    x0: Sequence[float],
    constraints: Sequence[Callable[[Sequence[float]], float]],
    *,
    rhobeg: float = 1.0,
    rhoend: float = 1e-4,
    maxfun: int = 1000,
    catol: float = 2e-4,
) -> ConstrainedResult:
    """Minimize `f` subject to `constraints[j](x) >= 0` for every `j`.

    `x0` fixes the dimension `n = len(x0)` and need not be feasible — COBYLA
    is explicitly designed to start infeasible and work towards feasibility
    alongside optimality, weighing the two through the merit function
    described in the module docstring. `constraints` may be empty, in which
    case the run reduces to an unconstrained trust-region search using
    linear models built from the simplex (COBYLA's mechanism with no
    constraint term in the merit function).

    `rhobeg`/`rhoend` bound the trust radius (matching SciPy's
    `fmin_cobyla` defaults); `maxfun` caps the number of calls to `f` (each
    counted once per trial point, regardless of how many constraints are
    also evaluated there); `catol` is the feasibility tolerance used both to
    decide `flag` (see `ConstrainedResult`) and, throughout the run, to
    prefer a feasible trial point over an infeasible one when picking the
    best point seen so far.

    A `NaN` from `f` is treated as `+inf` (as bad as possible for
    minimization); a `NaN` from a constraint is treated as a constraint
    value of `-inf` (as violated as possible), so neither can be mistaken
    for an improvement or for feasibility.
    """
    x0 = [float(v) for v in x0]
    n = len(x0)
    m = len(constraints)
    rhobeg = float(rhobeg) if float(rhobeg) > 0.0 else 1.0
    rhoend = min(float(rhoend), rhobeg) if float(rhoend) > 0.0 else rhobeg * 1e-4
    maxfun = max(int(maxfun), 1)

    function_calls = 0
    best_x = list(x0)
    best_f = _INFINITY
    best_cv = _INFINITY

    def record(x: list[float], fx: float, cv: float) -> None:
        nonlocal best_x, best_f, best_cv
        if _is_better(fx, cv, best_f, best_cv, catol):
            best_x = list(x)
            best_f = fx
            best_cv = cv

    def evaluate(x: list[float]) -> tuple[float, list[float], float]:
        nonlocal function_calls
        function_calls += 1
        fx = _finite_objective(float(f(x)))
        cvals = [_finite_constraint(float(g(x))) for g in constraints]
        cv = _max_violation(cvals)
        record(x, fx, cv)
        return fx, cvals, cv

    verts = [list(x0)]
    for i in range(n):
        vertex = list(x0)
        vertex[i] += rhobeg
        verts.append(vertex)

    fvals: list[float] = []
    convals: list[list[float]] = []
    cvals: list[float] = []
    for vertex in verts:
        if function_calls >= maxfun:
            break
        fx, cvx, cv = evaluate(vertex)
        fvals.append(fx)
        convals.append(cvx)
        cvals.append(cv)
    if len(fvals) < n + 1:
        return ConstrainedResult(
            x=best_x,
            fun=best_f,
            maxcv=best_cv,
            iterations=0,
            function_calls=function_calls,
            converged=False,
            flag="maxfun",
        )

    rho = rhobeg
    delta = rhobeg
    cpen = 1.0
    iterations = 0
    flag = "maxiter"
    max_outer = min(50 * maxfun, 200000)

    for outer in range(max_outer):
        iterations = outer + 1
        if function_calls >= maxfun:
            flag = "maxfun"
            break

        _bring_pole_to_front(verts, fvals, convals, cvals, cpen)
        edges = _edge_matrix(verts, n)
        inv = _matrix_inverse(edges)
        if inv is None:
            _repair_worst_edge(verts, edges, rho, evaluate, fvals, convals, cvals)
            continue

        df = [fvals[k + 1] - fvals[0] for k in range(n)]
        g = _matvec(inv, df)
        gradients = [
            _matvec(inv, [convals[k + 1][j] - convals[0][j] for k in range(n)])
            for j in range(m)
        ]
        violations = convals[0]

        d = _trust_region_step(g, gradients, violations, delta)
        cpen = _adapt_cpen(cpen, g, gradients, violations, cvals[0], d)
        dnorm = min(delta, _norm(d))
        shortd = dnorm <= 0.1 * rho

        preref = -_dot(g, d)
        predicted = _max_violation(
            [violations[j] + _dot(gradients[j], d) for j in range(m)]
        )
        prerec = cvals[0] - predicted
        prerem = preref + cpen * prerec
        trfail = not (prerem > 1e-8 * min(cpen, 1.0) * rho)

        adequate_geo = all(_norm(edges[k]) <= 2.0 * delta for k in range(n))
        ratio = -1.0
        ximproved = False

        if shortd or trfail:
            delta *= 0.1
            if delta <= _RHO_SNAP * rho:
                delta = rho
        else:
            x = [verts[0][i] + d[i] for i in range(n)]
            fx, cvx, cv = evaluate(x)
            actrem = (fvals[0] + cpen * cvals[0]) - (fx + cpen * cv)
            ratio = _reduction_ratio(actrem, prerem)
            delta = _update_delta(delta, dnorm, ratio)
            if delta <= _RHO_SNAP * rho:
                delta = rho
            ximproved = actrem > 0.0
            if ximproved:
                sigma = [abs(_dot(_column(inv, k), d)) for k in range(n)]
                jdrop = 1 + sigma.index(max(sigma))
                verts[jdrop], fvals[jdrop] = x, fx
                convals[jdrop], cvals[jdrop] = cvx, cv

        bad_trstep = shortd or trfail or ratio <= 0.0 or not ximproved
        improve_geo = bad_trstep and not adequate_geo
        reduce_rho = bad_trstep and adequate_geo and max(delta, dnorm) <= rho

        if improve_geo and function_calls < maxfun:
            edge_norms = [_norm(edges[k]) for k in range(n)]
            jgeo = edge_norms.index(max(edge_norms))
            direction = _geometry_direction(inv, jgeo, delta / 2.0, g)
            x = [verts[0][i] + direction[i] for i in range(n)]
            fx, cvx, cv = evaluate(x)
            verts[jgeo + 1], fvals[jgeo + 1] = x, fx
            convals[jgeo + 1], cvals[jgeo + 1] = cvx, cv

        if reduce_rho:
            if rho <= rhoend:
                flag = "converged"
                break
            new_rho = _reduce_rho(rho, rhoend)
            delta = max(0.5 * rho, new_rho)
            rho = new_rho

    if flag == "converged" and best_cv > catol:
        flag = "converged:infeasible"

    return ConstrainedResult(
        x=best_x,
        fun=best_f,
        maxcv=best_cv,
        iterations=iterations,
        function_calls=function_calls,
        converged=flag == "converged",
        flag=flag,
    )


def _finite_objective(value: float) -> float:
    """Map a `NaN` objective value to `+inf` (as bad as possible to minimize)."""
    return _INFINITY if math.isnan(value) else value


def _finite_constraint(value: float) -> float:
    """Map a `NaN` constraint value to `-inf` (as violated as possible)."""
    return -_INFINITY if math.isnan(value) else value


def _max_violation(values: Sequence[float]) -> float:
    """Return `max(0, max(-v for v in values))`, `0.0` if `values` is empty."""
    worst = 0.0
    for value in values:
        violation = -value
        if violation > worst:
            worst = violation
    return worst


def _is_better(f_a: float, cv_a: float, f_b: float, cv_b: float, catol: float) -> bool:
    """Is point `a` a better answer to report than point `b`?

    A point within `catol` of feasible always beats one that is not;
    between two feasible (or two infeasible) points, lower `f` wins for
    feasible points and lower violation wins for infeasible ones.
    """
    a_ok = cv_a <= catol
    b_ok = cv_b <= catol
    if a_ok != b_ok:
        return a_ok
    return f_a < f_b if a_ok else cv_a < cv_b


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


def _norm(a: Sequence[float]) -> float:
    return math.sqrt(sum(v * v for v in a))


def _matvec(matrix: Sequence[Sequence[float]], vector: Sequence[float]) -> list[float]:
    return [_dot(row, vector) for row in matrix]


def _column(matrix: Sequence[Sequence[float]], j: int) -> list[float]:
    return [row[j] for row in matrix]


def _edge_matrix(verts: Sequence[Sequence[float]], n: int) -> list[list[float]]:
    """Row `k` is the displacement from the pole `verts[0]` to `verts[k + 1]`."""
    return [[verts[k + 1][i] - verts[0][i] for i in range(n)] for k in range(n)]


def _matrix_inverse(matrix: Sequence[Sequence[float]]) -> list[list[float]] | None:
    """Invert a square matrix by one Gauss-Jordan sweep of `[matrix | I]`.

    Returns `None` if `matrix` is numerically singular (pivot magnitude
    below `1e-13`), letting every caller fall back gracefully instead of
    raising. One sweep over the augmented matrix costs `O(size ** 3)`,
    against `O(size ** 4)` for solving `size` separate right-hand sides.
    """
    size = len(matrix)
    aug = [
        list(matrix[i]) + [1.0 if j == i else 0.0 for j in range(size)]
        for i in range(size)
    ]
    width = 2 * size
    for col in range(size):
        pivot_row = col
        best = abs(aug[col][col])
        for r in range(col + 1, size):
            candidate = abs(aug[r][col])
            if candidate > best:
                best = candidate
                pivot_row = r
        if best < 1e-13:
            return None
        aug[col], aug[pivot_row] = aug[pivot_row], aug[col]
        pivot_values = aug[col]
        pivot = pivot_values[col]
        for k in range(col, width):
            pivot_values[k] /= pivot
        for r in range(size):
            row = aug[r]
            factor = row[col]
            if r != col and factor != 0.0:
                for k in range(col, width):
                    row[k] -= factor * pivot_values[k]
    return [row[size:] for row in aug]


def _bring_pole_to_front(
    verts: list[list[float]],
    fvals: list[float],
    convals: list[list[float]],
    cvals: list[float],
    cpen: float,
) -> None:
    """Swap the vertex of least merit `f + cpen * maxcv` into position `0`."""
    merits = [fvals[i] + cpen * cvals[i] for i in range(len(fvals))]
    best = merits.index(min(merits))
    if best != 0:
        verts[0], verts[best] = verts[best], verts[0]
        fvals[0], fvals[best] = fvals[best], fvals[0]
        convals[0], convals[best] = convals[best], convals[0]
        cvals[0], cvals[best] = cvals[best], cvals[0]


def _repair_worst_edge(
    verts: list[list[float]],
    edges: Sequence[Sequence[float]],
    rho: float,
    evaluate: Callable[[list[float]], tuple[float, list[float], float]],
    fvals: list[float],
    convals: list[list[float]],
    cvals: list[float],
) -> None:
    """Recover from a singular simplex by resetting its shortest edge to `rho`.

    A simplex built from well-scaled, distinct evaluations should never
    become exactly singular; this is a last-resort repair for the
    degenerate case (e.g. a constant objective and constraints collapsing
    two vertices together), not a step COBYLA's normal iterations rely on.
    """
    n = len(edges)
    norms = [_norm(edges[k]) for k in range(n)]
    k = norms.index(min(norms))
    vertex = list(verts[0])
    vertex[k] += rho if norms[k] < 1e-10 else -edges[k][k]
    fx, cvx, cv = evaluate(vertex)
    verts[k + 1], fvals[k + 1] = vertex, fx
    convals[k + 1], cvals[k + 1] = cvx, cv


def _adapt_cpen(
    cpen: float,
    g: Sequence[float],
    gradients: Sequence[Sequence[float]],
    violations: Sequence[float],
    cval_pole: float,
    d: Sequence[float],
) -> float:
    """Raise `cpen` until the step `d` predicts `prerem > 0`.

    Mirrors the intent of Powell's `cpen` update (his COBYLA paper, around
    eq. 9): whenever the current penalty lets the model step trade away
    feasibility gain (`prerec > 0`) for objective gain (`preref < 0`) with
    a net non-positive merit change, `cpen` is raised just enough to rule
    that out, so acceptance always measures a genuine descent direction.

    A single closed-form update suffices because `_trust_region_step` is
    Powell's `TRSTLP`, whose two stages read only the linearized
    constraints and the model gradient: `d` is independent of `cpen`, so
    raising `cpen` cannot change the step this has to be consistent with.
    Setting `cpen >= 2 * barmu` gives
    `prerem = preref + cpen * prerec >= -preref > 0`.
    """
    m = len(gradients)
    preref = -_dot(g, d)
    predicted = _max_violation(
        [violations[j] + _dot(gradients[j], d) for j in range(m)]
    )
    prerec = cval_pole - predicted
    if prerec <= 0.0 or preref >= 0.0:
        return cpen
    barmu = -preref / prerec
    return max(cpen, 2.0 * barmu + 1e-8)


def _reduction_ratio(actrem: float, prerem: float) -> float:
    """Actual-to-predicted merit reduction, `-1.0` whenever that is ill-defined."""
    if math.isnan(actrem) or math.isnan(prerem) or prerem <= 0.0:
        return -1.0
    return actrem / prerem


def _update_delta(delta: float, dnorm: float, ratio: float) -> float:
    """Classic trust-region radius update from the reduction ratio."""
    if ratio <= _TR_ETA1:
        return _TR_SHRINK * dnorm
    if ratio <= _TR_ETA2:
        return max(_TR_SHRINK * delta, dnorm)
    return max(delta, _TR_GROW * dnorm)


def _reduce_rho(rho: float, rhoend: float) -> float:
    """Shrink the trust-radius floor, snapping to `rhoend` once close."""
    if rho <= 1.5 * rhoend:
        return rhoend
    if rho <= 250.0 * rhoend:
        return math.sqrt(rho * rhoend)
    return 0.1 * rho


def _geometry_direction(
    inv: Sequence[Sequence[float]], jdrop: int, delbar: float, g: Sequence[float]
) -> list[float]:
    """A length-`delbar` step improving the simplex's conditioning at `jdrop`.

    Column `jdrop` of `inv` (the inverse of the edge matrix) is the
    direction most responsible for how well-conditioned the simplex is at
    that vertex; moving along it — signed to also decrease the linear
    objective model — is Powell's geometry step, `geostep` in PRIMA.
    """
    direction = _column(inv, jdrop)
    length = _norm(direction)
    if length == 0.0:
        return [0.0] * len(direction)
    unit = [v / length for v in direction]
    if _dot(unit, g) > 0.0:
        unit = [-v for v in unit]
    return [v * delbar for v in unit]


def _is_negligible(value: float, magnitude: float) -> bool:
    """Is `value` lost inside the rounding error of its own accumulation?

    `value` is a computed scalar product and `magnitude` the sum of the
    absolute values of the terms that produced it. The two comparisons
    below are Powell's `acca`/`accb` device from `TRSTLP`: they ask whether
    adding a tenth, and then a fifth, of `value` to `magnitude` is visible
    in floating point at all. If either addition vanishes then `value` is
    no larger than the error committed while summing it, and treating it as
    exactly zero is the only safe reading — otherwise the active set would
    be built out of rounding noise.
    """
    acca = magnitude + 0.1 * abs(value)
    accb = magnitude + 0.2 * abs(value)
    return magnitude >= acca or acca >= accb


def _rotate_in_new_gradient(
    z: list[list[float]], nact: int, n: int, gradient: Sequence[float]
) -> float:
    """Prepare `z` for `gradient` to become active constraint number `nact`.

    Plane rotations are applied to columns `nact .. n - 1` of `z` — the
    part of the orthogonal basis not yet claimed by an active constraint —
    until all of them except column `nact` are orthogonal to `gradient`.
    The return value is the scalar product of the new column `nact` with
    `gradient`, that is the new diagonal entry `zdota[nact]` of the
    triangular factor. It is `0.0` exactly when `gradient` lies in the span
    of the gradients that are already active, which is the signal that room
    must be made by dropping one of them first.
    """
    tot = 0.0
    for k in range(n - 1, nact - 1, -1):
        column = z[k]
        sp = 0.0
        spabs = 0.0
        for i in range(n):
            term = column[i] * gradient[i]
            sp += term
            spabs += abs(term)
        if _is_negligible(sp, spabs):
            sp = 0.0
        if tot == 0.0:
            tot = sp
        else:
            following = z[k + 1]
            scale = math.sqrt(sp * sp + tot * tot)
            alpha = sp / scale
            beta = tot / scale
            tot = scale
            for i in range(n):
                mixed = alpha * column[i] + beta * following[i]
                following[i] = alpha * following[i] - beta * column[i]
                column[i] = mixed
    return tot


def _rotate_active_to_end(
    z: list[list[float]],
    zdota: list[float],
    iact: list[int],
    vmultc: list[float],
    amat: Sequence[Sequence[float]],
    n: int,
    nact: int,
    icon: int,
) -> None:
    """Cycle active constraint `icon` to the end of the active list.

    Entries `icon .. nact - 1` of `iact` and `vmultc` rotate left by one,
    so the constraint sitting at `icon` ends up at `nact - 1`, and
    `z`/`zdota` are carried along by one plane rotation per swap. This
    keeps the factorization valid without rebuilding it, and it puts a
    constraint that is about to leave the active set where dropping it is
    merely a matter of decrementing `nact`.
    """
    if icon >= nact - 1:
        return
    isave = iact[icon]
    vsave = vmultc[icon]
    for k in range(icon, nact - 1):
        nxt = k + 1
        moved = iact[nxt]
        column = z[k]
        following = z[nxt]
        row = amat[moved]
        sp = 0.0
        for i in range(n):
            sp += column[i] * row[i]
        scale = math.sqrt(sp * sp + zdota[nxt] * zdota[nxt])
        if scale > 0.0:
            alpha = zdota[nxt] / scale
            beta = sp / scale
            zdota[nxt] = alpha * zdota[k]
            zdota[k] = scale
        else:
            alpha = 1.0
            beta = 0.0
        for i in range(n):
            mixed = alpha * following[i] + beta * column[i]
            following[i] = alpha * column[i] - beta * following[i]
            column[i] = mixed
        iact[k] = moved
        vmultc[k] = vmultc[nxt]
    iact[nact - 1] = isave
    vmultc[nact - 1] = vsave


def _trstlp(
    amat: Sequence[Sequence[float]], bvec: Sequence[float], delta: float, m: int
) -> list[float]:
    """Powell's `TRSTLP`: the COBYLA trust-region subproblem, in two stages.

    `amat[k]` and `bvec[k]` describe the linearized constraint
    `amat[k] . d >= bvec[k]` for `k < m`. The extra row `amat[m]` is the
    *negated* model gradient of the objective with `bvec[m] = 0`, which
    lets stage 2 treat "decrease the objective" as one more constraint to
    push on; that is Powell's device for running both stages through the
    same machinery.

    Stage 1 finds the shortest `d` with `||d|| <= delta` minimizing the
    greatest violation `max(0, max_k(bvec[k] - amat[k] . d))`. Stage 2 then
    spends whatever length is left over on decreasing `-amat[m] . d`
    without letting that greatest violation grow.

    Both stages are the same active-set loop. `nact` constraints are held
    active with indices `iact[:nact]`, the rest of `iact` being a
    permutation of the inactive ones; `z` is orthogonal, its first `nact`
    columns a Gram-Schmidt basis of the active gradients, and `zdota[j]` is
    the scalar product of column `j` of `z` with the `j`-th active
    gradient. `vmultc` holds the (nonnegative) Lagrange multipliers of the
    active constraints followed by the shifted residuals of the inactive
    ones. Each iteration either adds the constraint `iact[icon]` (rotating
    `z` so its trailing columns are orthogonal to the new gradient) or
    drops the active constraint `icon`, then moves along `sdirn` — a
    direction orthogonal to the gradients already active — as far as the
    trust-region boundary or the first blocking constraint allows. Nothing
    is ever refactorized from scratch, which is what makes the whole
    subproblem cost `O(n * (n + m))` per iteration.

    The loop can only end in one of Powell's ways: the trust-region
    boundary is reached, no constraint blocks the step, three successive
    iterations fail to improve the stage objective or enlarge the active
    set, or the geometry degenerates. `budget` is an extra backstop with no
    counterpart in Powell's code, so that meaningless data can never spin
    here forever.
    """
    n = len(amat[m])
    if n == 0:
        return []
    z = [[1.0 if i == k else 0.0 for i in range(n)] for k in range(n)]
    zdota = [0.0] * n
    d = [0.0] * n
    sdirn = [0.0] * n
    iact = list(range(m + 1))
    vmultc = [0.0] * (m + 1)
    vmultd = [0.0] * (m + 1)
    nact = 0
    icon = 0
    resmax = 0.0
    for k in range(m):
        if bvec[k] > resmax:
            resmax = bvec[k]
            icon = k
    for k in range(m):
        vmultc[k] = resmax - bvec[k]
    stage = 1
    mcon = m
    if resmax <= 0.0:
        stage = 2
        mcon = m + 1
        icon = m
        iact[m] = m
        vmultc[m] = 0.0
    budget = 100 * (n + m + 2)

    while True:
        optold = 0.0
        icount = 0
        nactx = nact
        while True:
            budget -= 1
            if budget <= 0:
                return d
            optnew = resmax if stage == 1 else -_dot(d, amat[m])
            if icount == 0 or optnew < optold:
                optold = optnew
                nactx = nact
                icount = 3
            elif nact > nactx:
                nactx = nact
                icount = 3
            else:
                icount -= 1
                if icount == 0:
                    if stage == 1:
                        break
                    return d

            added = icon >= nact
            if added:
                kk = iact[icon]
                work = list(amat[kk])
                tot = _rotate_in_new_gradient(z, nact, n, work)
                if tot != 0.0:
                    nact += 1
                    zdota[nact - 1] = tot
                    vmultc[icon] = vmultc[nact - 1]
                    vmultc[nact - 1] = 0.0
                else:
                    ratio = -1.0
                    for k in range(nact - 1, -1, -1):
                        column = z[k]
                        zdotv = 0.0
                        zdvabs = 0.0
                        for i in range(n):
                            term = column[i] * work[i]
                            zdotv += term
                            zdvabs += abs(term)
                        if _is_negligible(zdotv, zdvabs) or zdota[k] == 0.0:
                            vmultd[k] = 0.0
                            continue
                        multiplier = zdotv / zdota[k]
                        if multiplier > 0.0 and iact[k] < m:
                            bound = vmultc[k] / multiplier
                            if ratio < 0.0 or bound < ratio:
                                ratio = bound
                        if k >= 1:
                            row = amat[iact[k]]
                            for i in range(n):
                                work[i] -= multiplier * row[i]
                        vmultd[k] = multiplier
                    if ratio < 0.0:
                        if stage == 1:
                            break
                        return d
                    for k in range(nact):
                        vmultc[k] = max(0.0, vmultc[k] - ratio * vmultd[k])
                    replaced = _dot(z[nact - 1], amat[kk])
                    if replaced == 0.0:
                        if stage == 1:
                            break
                        return d
                    zdota[nact - 1] = replaced
                    vmultc[icon] = 0.0
                    vmultc[nact - 1] = ratio
                iact[icon] = iact[nact - 1]
                iact[nact - 1] = kk
                if stage == 2 and kk != m:
                    if nact < 2:
                        return d
                    _rotate_active_to_end(
                        z, zdota, iact, vmultc, amat, n, nact, nact - 2
                    )
            else:
                _rotate_active_to_end(z, zdota, iact, vmultc, amat, n, nact, icon)
                nact -= 1

            if stage == 1:
                if added:
                    if zdota[nact - 1] == 0.0:
                        break
                    column = z[nact - 1]
                    last = amat[iact[nact - 1]]
                    shift = (_dot(sdirn, last) - 1.0) / zdota[nact - 1]
                else:
                    column = z[nact]
                    shift = _dot(sdirn, column)
                for i in range(n):
                    sdirn[i] -= shift * column[i]
            else:
                if nact < 1 or zdota[nact - 1] == 0.0:
                    return d
                scale = 1.0 / zdota[nact - 1]
                column = z[nact - 1]
                sdirn = [scale * value for value in column]

            dd = delta * delta
            sd = 0.0
            ss = 0.0
            for i in range(n):
                if abs(d[i]) >= 1e-6 * delta:
                    dd -= d[i] * d[i]
                sd += d[i] * sdirn[i]
                ss += sdirn[i] * sdirn[i]
            if not (dd > 0.0) or not (ss > 0.0):
                if stage == 1:
                    break
                return d
            scale = math.sqrt(ss * dd)
            if abs(sd) >= 1e-6 * scale:
                scale = math.sqrt(ss * dd + sd * sd)
            denominator = scale + sd
            if not (denominator > 0.0):
                if stage == 1:
                    break
                return d
            stpful = dd / denominator
            step = stpful
            if stage == 1:
                if _is_negligible(resmax, step):
                    break
                step = min(step, resmax)
            if not (step > 0.0) or step == _INFINITY:
                if stage == 1:
                    break
                return d

            dnew = [d[i] + step * sdirn[i] for i in range(n)]
            resold = resmax
            if stage == 1:
                resmax = 0.0
                for k in range(nact):
                    kk = iact[k]
                    residual = bvec[kk] - _dot(amat[kk], dnew)
                    if residual > resmax:
                        resmax = residual

            work = list(dnew)
            for k in range(nact - 1, -1, -1):
                column = z[k]
                zdotw = 0.0
                zdwabs = 0.0
                for i in range(n):
                    term = column[i] * work[i]
                    zdotw += term
                    zdwabs += abs(term)
                if _is_negligible(zdotw, zdwabs) or zdota[k] == 0.0:
                    vmultd[k] = 0.0
                else:
                    vmultd[k] = zdotw / zdota[k]
                if k >= 1:
                    row = amat[iact[k]]
                    factor = vmultd[k]
                    for i in range(n):
                        work[i] -= factor * row[i]
            if stage == 2 and nact >= 1:
                vmultd[nact - 1] = max(0.0, vmultd[nact - 1])

            for k in range(nact, mcon):
                kk = iact[k]
                row = amat[kk]
                total = resmax - bvec[kk]
                totabs = resmax + abs(bvec[kk])
                for i in range(n):
                    term = row[i] * dnew[i]
                    total += term
                    totabs += abs(term)
                if _is_negligible(total, totabs):
                    total = 0.0
                vmultd[k] = total

            ratio = 1.0
            icon = -1
            for k in range(mcon):
                if vmultd[k] < 0.0:
                    bound = vmultc[k] / (vmultc[k] - vmultd[k])
                    if bound < ratio:
                        ratio = bound
                        icon = k

            dold = list(d)
            complement = 1.0 - ratio
            for i in range(n):
                d[i] = complement * d[i] + ratio * dnew[i]
            for k in range(mcon):
                vmultc[k] = max(0.0, complement * vmultc[k] + ratio * vmultd[k])
            if stage == 1:
                resmax = resold + ratio * (resmax - resold)
            for value in d:
                if not math.isfinite(value):
                    return dold

            if icon >= 0:
                continue
            if step == stpful:
                return d
            if stage == 1:
                break
            return d

        stage = 2
        mcon = m + 1
        icon = m
        iact[m] = m
        vmultc[m] = 0.0


def _trust_region_step(
    g: Sequence[float],
    gradients: Sequence[Sequence[float]],
    violations: Sequence[float],
    delta: float,
) -> list[float]:
    """Find a trust-region step `d` by Powell's two-stage construction.

    Phase 1 minimizes the worst linearized constraint violation reachable
    within the ball of radius `delta`, ignoring the objective; phase 2
    minimizes the linear objective model `g.d` *without* letting that
    violation grow. This is what guarantees a step out of a feasible or
    near-feasible point never trades away feasibility unless the trust
    region leaves no better choice, and it is why the step does not depend
    on the merit penalty `cpen` at all. Both phases are run by `_trstlp`.

    The constraints reach `_trstlp` as `gradients[j] . d >= -violations[j]`
    and the objective as an extra row `-g` with right-hand side `0`. A row
    whose entries are enormous is rescaled (harmless, since the step is
    invariant under scaling a single constraint) so that forming
    `sqrt(sp * sp + tot * tot)` inside the plane rotations cannot overflow.
    A model with a `NaN` or infinite coefficient carries no information at
    all, and the honest step from it is no step: `[0.0] * n` is returned,
    which the caller reads as a short step and answers by shrinking the
    trust region — never by looping.
    """
    n = len(g)
    m = len(gradients)
    if n == 0 or not (delta > 0.0):
        return [0.0] * n
    amat: list[list[float]] = [list(row) for row in gradients]
    amat.append([-value for value in g])
    bvec: list[float] = [-value for value in violations]
    bvec.append(0.0)
    for k in range(m + 1):
        if not math.isfinite(bvec[k]):
            return [0.0] * n
        row = amat[k]
        largest = 0.0
        for value in row:
            if not math.isfinite(value):
                return [0.0] * n
            magnitude = abs(value)
            if magnitude > largest:
                largest = magnitude
        if largest > 1e12:
            scale = 1.0 / largest
            amat[k] = [value * scale for value in row]
            bvec[k] *= scale
    d = _trstlp(amat, bvec, delta, m)
    length = _norm(d)
    if length > delta:
        shrink = delta / length
        d = [value * shrink for value in d]
    return d
