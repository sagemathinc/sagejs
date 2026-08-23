"""Inexact line searches enforcing the strong Wolfe conditions.

Every gradient-based descent method in this package — BFGS, nonlinear
conjugate gradient, Newton-CG — spends most of its function evaluations
inside a line search, and all three use the *same* one. This module is that
shared search, transcribed from the implementations `scipy.optimize` actually
runs, because SageMath's `minimize` is a thin wrapper around `fmin_bfgs`,
`fmin_cg` and `fmin_ncg` and inherits their step selection exactly.

Two searches live here, and they are tried in that order:

* `line_search_wolfe1` — the Moré-Thuente safeguarded search, MINPACK-2's
  `dcsrch`/`dcstep`. Jorge J. Moré and David J. Thuente, *Line search
  algorithms with guaranteed sufficient decrease*, ACM TOMS 20(3):286-307
  (1994). Transcribed from `scipy/optimize/_dcsrch.py` (the 2023 Python port
  of the Fortran) and `scipy/optimize/_linesearch.py`. This is what SciPy
  calls first.
* `line_search_wolfe2` — the bracket-and-`zoom` search of J. Nocedal and
  S. J. Wright, *Numerical Optimization*, 2nd ed., Springer (2006),
  Algorithms 3.5 and 3.6 (pp. 60-61), with the cubic/quadratic interpolation
  safeguards of `_zoom`, `_cubicmin` and `_quadmin`. Transcribed from
  `scipy/optimize/_linesearch.py`. SciPy falls back to this when `wolfe1`
  returns no step.

`line_search_wolfe12` chains them the way `scipy.optimize._optimize.
_line_search_wolfe12` does and raises `LineSearchError` when both fail;
callers turn that into SciPy's warning flag 2, *"Desired error not
necessarily achieved due to precision loss."*

`approx_fprime` supplies the forward-difference gradient used when the caller
has no analytic one, with SciPy's default step
`sqrt(machine epsilon) = 1.4901161193847656e-08`.

The search accepts a step `alpha > 0` along a descent direction `pk` from
`xk` when it satisfies the strong Wolfe conditions

```text
f(xk + alpha*pk) <= f(xk) + c1*alpha*<grad f(xk), pk>      (Armijo)
|<grad f(xk + alpha*pk), pk>| <= c2*|<grad f(xk), pk>|     (curvature)
```

with SciPy's defaults `c1 = 1e-4` and `c2 = 0.9` (`fmin_bfgs`, `fmin_ncg`);
`fmin_cg` tightens the curvature test to `c2 = 0.4`.

This module deliberately imports nothing from the rest of the package, so
every algorithm module can depend on it without creating a cycle.

Example:

```python
from sagejs.optimization.line_search import line_search_wolfe12

f = lambda v: v[0] ** 2 + 10.0 * v[1] ** 2
g = lambda v: [2.0 * v[0], 20.0 * v[1]]
res = line_search_wolfe12(f, g, [1.0, 1.0], [-2.0, -20.0])
assert res.alpha is not None
```
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

__all__ = [
    "DCSRCH",
    "EPSILON",
    "LineSearchError",
    "LineSearchResult",
    "ScalarSearchResult",
    "approx_fprime",
    "line_search_wolfe1",
    "line_search_wolfe12",
    "line_search_wolfe2",
    "numerical_gradient",
    "scalar_search_wolfe1",
    "scalar_search_wolfe2",
]

# `math.inf` and `math.nan` are absent from the Sage.js `math` module, so the
# IEEE specials are built from their literal spellings.
_INFINITY = float("inf")
_NAN = float("nan")

# SciPy's `_epsilon`: `sqrt(numpy.finfo(float).eps)`, the default
# forward-difference step for `approx_fprime`. Spelled as the literal SciPy
# computes so that no square root of a platform constant can drift.
EPSILON = 1.4901161193847656e-08


class LineSearchError(RuntimeError):
    """Neither Wolfe search produced an acceptable step.

    The counterpart of SciPy's private `_LineSearchError`. Descent methods
    catch this, stop, and report SciPy's warning flag 2, *"Desired error not
    necessarily achieved due to precision loss."*
    """


@dataclass(frozen=True)
class ScalarSearchResult:
    """The outcome of a search along the scalar function `phi(alpha)`.

    Attributes:
        alpha: The accepted step, or `None` when the search failed. A `None`
            here is the signal every caller keys on.
        phi_alpha: `phi(alpha)` at the accepted step; on failure, the value
            at the best point the search reached.
        phi0: `phi(0)`.
        derphi_alpha: `phi'(alpha)` at the accepted step, or `None` when the
            search failed or never evaluated the derivative there.
        function_calls: Calls made to `phi`.
        gradient_calls: Calls made to `derphi`.
        task: A readable status string. `"CONVERGENCE"` on success;
            otherwise one of the MINPACK `"WARNING: ..."` / `"ERROR: ..."`
            strings, or the Nocedal-Wright search's own diagnostic.
    """

    alpha: float | None
    phi_alpha: float
    phi0: float
    derphi_alpha: float | None
    function_calls: int
    gradient_calls: int
    task: str


@dataclass(frozen=True)
class LineSearchResult:
    """The outcome of a search along `alpha -> f(xk + alpha*pk)`.

    Attributes:
        alpha: The accepted step, or `None` when the search failed.
        function_calls: Calls made to `f`. Unlike SciPy's
            `_line_search_wolfe12`, which discards the first search's tally
            when it falls back, this counts *every* evaluation the call
            made — see `line_search_wolfe12`.
        gradient_calls: Calls made to `fprime`, counted the same way.
        new_fval: `f(xk + alpha*pk)`, or `None` on failure.
        old_fval: `f(xk)`.
        new_slope: The directional derivative `<grad f(xk + alpha*pk), pk>`,
            or `None` on failure.
        new_gradient: `grad f(xk + alpha*pk)`, or `None` on failure. This is
            the gradient the caller would otherwise recompute on its next
            iteration, which is why the search hands it back.
        task: The status string of the search that produced `alpha`.
        used_fallback: `True` when `wolfe1` failed and `wolfe2` produced the
            step. Only `line_search_wolfe12` ever sets this.
    """

    alpha: float | None
    function_calls: int
    gradient_calls: int
    new_fval: float | None
    old_fval: float
    new_slope: float | None
    new_gradient: list[float] | None
    task: str
    used_fallback: bool = False


def _check_c1_c2(c1: float, c2: float) -> None:
    """Reject Wolfe parameters outside `0 < c1 < c2 < 1`, as SciPy does.

    Outside that range the two conditions can be jointly unsatisfiable, so
    SciPy refuses the input rather than searching forever.
    """
    if not 0 < c1 < c2 < 1:
        raise ValueError("'c1' and 'c2' do not satisfy '0 < c1 < c2 < 1'.")


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    """The Euclidean inner product of two equal-length vectors."""
    total = 0.0
    for ai, bi in zip(a, b, strict=True):
        total += ai * bi
    return total


def _step_point(xk: Sequence[float], alpha: float, pk: Sequence[float]) -> list[float]:
    """The trial point `xk + alpha*pk`."""
    return [xi + alpha * pi for xi, pi in zip(xk, pk, strict=True)]


def _sign(value: float) -> float:
    """`numpy.sign` for a scalar: `0.0` at zero, not `copysign`'s `+1.0`."""
    if value > 0.0:
        return 1.0
    if value < 0.0:
        return -1.0
    return 0.0


def _clip(value: float, low: float, high: float) -> float:
    """`numpy.clip` for a scalar, propagating `nan` the way NumPy does."""
    if value != value:
        return value
    return min(max(value, low), high)


def _div(numerator: float, denominator: float) -> float:
    """IEEE division: `x/0` is an infinity, `0/0` is `nan`, nothing raises.

    `dcstep` runs under `numpy.errstate(invalid="ignore", over="ignore")` in
    SciPy, so a degenerate interval yields a non-finite step that the caller
    detects and reports rather than an exception. Plain Python division
    raises `ZeroDivisionError` instead, so the IEEE result is restored here.
    """
    if denominator == 0.0:
        if numerator != numerator or numerator == 0.0:
            return _NAN
        same_sign = math.copysign(1.0, numerator) == math.copysign(1.0, denominator)
        return _INFINITY if same_sign else -_INFINITY
    return numerator / denominator


def _safe_sqrt(value: float) -> float:
    """`numpy.sqrt` for a scalar: `nan` for a negative argument.

    The Moré-Thuente radicands are non-negative in exact arithmetic but can
    go slightly negative under rounding; NumPy answers `nan` there, and the
    `nan` then propagates out to the caller's finiteness test.
    """
    if value != value or value < 0.0:
        return _NAN
    return math.sqrt(value)


# ---------------------------------------------------------------------------
# MINPACK-2 dcstep: the safeguarded step within an interval
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _StepUpdate:
    """The state `dcstep` threads between calls.

    `stx` is the step with the least function value seen so far and `sty` the
    other endpoint of the interval; `brackt` records whether a minimizer has
    been trapped between them.
    """

    stx: float
    fx: float
    dx: float
    sty: float
    fy: float
    dy: float
    stp: float
    brackt: bool


def _dcstep(
    stx: float,
    fx: float,
    dx: float,
    sty: float,
    fy: float,
    dy: float,
    stp: float,
    fp: float,
    dp: float,
    brackt: bool,
    stpmin: float,
    stpmax: float,
) -> _StepUpdate:
    """Compute a safeguarded step and update the interval containing it.

    A transcription of MINPACK-2's `dcstep` (Argonne National Laboratory and
    the University of Minnesota, November 1993; Brett M. Averick and Jorge
    J. Moré), by way of SciPy's `scipy/optimize/_dcsrch.py` port.

    The four cases are Moré and Thuente's: a higher function value brackets
    the minimum, derivatives of opposite sign bracket it, a decreasing
    derivative magnitude extrapolates, and a non-decreasing one jumps to a
    bound. `stx` holds the best step and `sty` the other endpoint; the
    derivative at `stx` must be negative in the direction of the step.

    Args:
        stx: Best step so far, one endpoint of the interval.
        fx: Function value at `stx`.
        dx: Derivative at `stx`.
        sty: The interval's other endpoint.
        fy: Function value at `sty`.
        dy: Derivative at `sty`.
        stp: The current trial step, strictly inside the interval when
            `brackt` is set.
        fp: Function value at `stp`.
        dp: Derivative at `stp`.
        brackt: Whether a minimizer has already been bracketed.
        stpmin: Lower bound for the step.
        stpmax: Upper bound for the step.

    Returns:
        The updated interval and the new trial step, as a `_StepUpdate`.
    """
    sgnd = _sign(dp) * _sign(dx)

    if fp > fx:
        # First case: a higher function value. The minimum is bracketed. If
        # the cubic step is closer to stx than the quadratic step, the cubic
        # step is taken, otherwise the average of the two.
        theta = 3.0 * _div(fx - fp, stp - stx) + dx + dp
        s = max(abs(theta), abs(dx), abs(dp))
        gamma = s * _safe_sqrt(_div(theta, s) ** 2 - _div(dx, s) * _div(dp, s))
        if stp < stx:
            gamma = -gamma
        p = (gamma - dx) + theta
        q = ((gamma - dx) + gamma) + dp
        r = _div(p, q)
        stpc = stx + r * (stp - stx)
        stpq = stx + (_div(dx, _div(fx - fp, stp - stx) + dx) / 2.0) * (stp - stx)
        stpf = (
            stpc if abs(stpc - stx) <= abs(stpq - stx) else (stpc + (stpq - stpc) / 2.0)
        )
        brackt = True
    elif sgnd < 0.0:
        # Second case: a lower function value and derivatives of opposite
        # sign. The minimum is bracketed. If the cubic step is farther from
        # stp than the secant step, the cubic step is taken.
        theta = 3.0 * _div(fx - fp, stp - stx) + dx + dp
        s = max(abs(theta), abs(dx), abs(dp))
        gamma = s * _safe_sqrt(_div(theta, s) ** 2 - _div(dx, s) * _div(dp, s))
        if stp > stx:
            gamma = -gamma
        p = (gamma - dp) + theta
        q = ((gamma - dp) + gamma) + dx
        r = _div(p, q)
        stpc = stp + r * (stx - stp)
        stpq = stp + _div(dp, dp - dx) * (stx - stp)
        stpf = stpc if abs(stpc - stp) > abs(stpq - stp) else stpq
        brackt = True
    elif abs(dp) < abs(dx):
        # Third case: a lower function value, derivatives of the same sign,
        # and the derivative magnitude decreases. The cubic step is computed
        # only if the cubic tends to infinity in the direction of the step or
        # if the cubic's minimum is beyond stp; otherwise the cubic step is
        # defined to be the secant step.
        theta = 3.0 * _div(fx - fp, stp - stx) + dx + dp
        s = max(abs(theta), abs(dx), abs(dp))

        # gamma = 0 only arises when the cubic does not tend to infinity in
        # the direction of the step.
        gamma = s * _safe_sqrt(
            max(0.0, _div(theta, s) ** 2 - _div(dx, s) * _div(dp, s))
        )
        if stp > stx:
            gamma = -gamma
        p = (gamma - dp) + theta
        q = (gamma + (dx - dp)) + gamma
        r = _div(p, q)
        if r < 0.0 and gamma != 0.0:
            stpc = stp + r * (stx - stp)
        elif stp > stx:
            stpc = stpmax
        else:
            stpc = stpmin
        stpq = stp + _div(dp, dp - dx) * (stx - stp)

        if brackt:
            # A minimizer has been bracketed: prefer whichever of the cubic
            # and secant steps lies closer to stp, then pull it back inside
            # the interval by the 0.66 safeguard.
            stpf = stpc if abs(stpc - stp) < abs(stpq - stp) else stpq
            if stp > stx:
                stpf = min(stp + 0.66 * (sty - stp), stpf)
            else:
                stpf = max(stp + 0.66 * (sty - stp), stpf)
        else:
            # Not bracketed: prefer whichever step lies farther from stp, so
            # that the interval keeps growing, then clip to the bounds.
            stpf = stpc if abs(stpc - stp) > abs(stpq - stp) else stpq
            stpf = _clip(stpf, stpmin, stpmax)
    else:
        # Fourth case: a lower function value, derivatives of the same sign,
        # and the derivative magnitude does not decrease. If the minimum is
        # not bracketed the step goes to a bound; otherwise take the cubic
        # step through stp and sty.
        if brackt:
            theta = 3.0 * _div(fp - fy, sty - stp) + dy + dp
            s = max(abs(theta), abs(dy), abs(dp))
            gamma = s * _safe_sqrt(_div(theta, s) ** 2 - _div(dy, s) * _div(dp, s))
            if stp > sty:
                gamma = -gamma
            p = (gamma - dp) + theta
            q = ((gamma - dp) + gamma) + dy
            r = _div(p, q)
            stpf = stp + r * (sty - stp)
        elif stp > stx:
            stpf = stpmax
        else:
            stpf = stpmin

    # Update the interval which contains a minimizer.
    if fp > fx:
        sty, fy, dy = stp, fp, dp
    else:
        if sgnd < 0.0:
            sty, fy, dy = stx, fx, dx
        stx, fx, dx = stp, fp, dp

    return _StepUpdate(stx, fx, dx, sty, fy, dy, stpf, brackt)


# ---------------------------------------------------------------------------
# MINPACK-2 dcsrch: the reverse-communication driver
# ---------------------------------------------------------------------------


class DCSRCH:
    """MINPACK-2's `dcsrch`, driving `_dcstep` to a strong Wolfe step.

    Each iteration updates an interval with endpoints `stx` and `sty`,
    initially chosen to contain a minimizer of the modified function

    ```text
    psi(stp) = f(stp) - f(0) - ftol*stp*f'(0).
    ```

    Once `psi(stp) <= 0` and `f'(stp) >= 0` for some step, the search enters
    its second stage and the interval instead contains a minimizer of `f`
    itself. The step returned satisfies the sufficient decrease condition
    `f(stp) <= f(0) + ftol*stp*f'(0)` and the curvature condition
    `abs(f'(stp)) <= gtol*abs(f'(0))`; when `ftol < gtol` and `f` is bounded
    below such a step always exists.

    The original is a reverse-communication Fortran subroutine that returns
    `task = 'FG'` to ask its caller for a new function and derivative value;
    SciPy's port keeps that structure with the work arrays turned into
    attributes, and so does this one. The state below is meaningless until
    the first `START` iteration has filled it in.

    ## `search()` versus `iterate()`

    `search(...)` (used by `scalar_search_wolfe1`) drives the loop to
    completion and reports failure — `stp is None` — whenever the search
    consumes the whole `[stpmin, stpmax]` interval without also satisfying
    the curvature condition. That is the right verdict for an
    *unconstrained* line search: hitting `stpmax` there only ever means the
    caller's extrapolation bound was too small.

    A bound-constrained solver such as `lbfgsb` or `tnc` hits that same
    situation constantly, and for a completely different reason: its
    `stpmax` is not an arbitrary extrapolation limit but the exact largest
    step that keeps every coordinate feasible, and reaching it while the
    objective still decreased is exactly how the solver discovers that a new
    coordinate belongs on its bound. Treating that as an outright failure
    would make it impossible to ever activate a constraint from the
    interior. `iterate()` is the public escape hatch for that: it exposes
    one raw step of the reverse-communication loop — the same `_dcstep`
    bookkeeping `search()` runs internally, minus `search()`'s own
    function-call counting and its unconditional "any warning is failure"
    verdict — so a bound-constrained caller can drive the loop itself and
    decide, using its own knowledge of *why* the step landed on `stpmax`,
    whether a boundary warning is an acceptable outcome or a real one. Both
    `lbfgsb._line_search` and `tnc._line_search` do exactly this, each with
    its own acceptance rule; see their module docstrings.
    """

    def __init__(
        self,
        phi: Callable[[float], float],
        derphi: Callable[[float], float],
        ftol: float,
        gtol: float,
        xtol: float,
        stpmin: float,
        stpmax: float,
    ) -> None:
        self.phi = phi
        self.derphi = derphi
        # All assessment of tolerances and limits is left to the first call,
        # exactly as the Fortran does.
        self.ftol = ftol
        self.gtol = gtol
        self.xtol = xtol
        self.stpmin = stpmin
        self.stpmax = stpmax

        self.brackt = False
        self.stage = 0
        self.finit = 0.0
        self.ginit = 0.0
        self.gtest = 0.0
        self.stx = 0.0
        self.fx = 0.0
        self.gx = 0.0
        self.sty = 0.0
        self.fy = 0.0
        self.gy = 0.0
        self.stmin = 0.0
        self.stmax = 0.0
        self.width = 0.0
        self.width1 = 0.0

    def search(
        self,
        alpha1: float,
        phi0: float,
        derphi0: float,
        maxiter: int = 100,
    ) -> tuple[float | None, float, float, float, str]:
        """Run the reverse-communication loop to convergence or a warning.

        Args:
            alpha1: The initial estimate of a satisfactory step; must be
                positive.
            phi0: `phi(0)`.
            derphi0: `phi'(0)`, which must be negative.
            maxiter: Cap on the number of `dcsrch` iterations.

        Returns:
            A tuple `(stp, phi1, phi0, derphi1, task)`. `stp` is `None`
            whenever `task` reports a warning or an input error, which is
            the failure signal `scalar_search_wolfe1` passes upward.
        """
        phi1 = phi0
        derphi1 = derphi0
        stp: float | None = alpha1

        task = "START"
        for _ in range(maxiter):
            step, phi1, derphi1, task = self.iterate(alpha1, phi1, derphi1, task)

            if not math.isfinite(step):
                task = "WARNING: NON-FINITE STEP"
                stp = None
                break

            stp = step
            if task.startswith("FG"):
                alpha1 = step
                phi1 = self.phi(step)
                derphi1 = self.derphi(step)
            else:
                break
        else:
            # maxiter reached: the line search did not converge.
            stp = None
            task = "WARNING: dcsrch did not converge within max iterations"

        if task.startswith("ERROR") or task.startswith("WARN"):
            stp = None

        return stp, phi1, phi0, derphi1, task

    def iterate(
        self, stp: float, f: float, g: float, task: str
    ) -> tuple[float, float, float, str]:
        """One `dcsrch` step: validate, test, then call `_dcstep`.

        This is the reverse-communication primitive the class docstring's
        "`search()` versus `iterate()`" section describes: unlike `search`,
        it never decides on its own that a `stpmax`-boundary warning is a
        failure — it just reports the warning and lets the caller judge it.
        `lbfgsb._line_search` and `tnc._line_search` call this directly in
        their own bounded loops, each applying its own acceptance rule to
        the `task` string returned.

        Args:
            stp: The current estimate of a satisfactory step.
            f: `phi(0)` on the first call, `phi(stp)` afterwards.
            g: `phi'(0)` on the first call, `phi'(stp)` afterwards.
            task: `"START"` on the first call, then whatever the previous
                call returned.

        Returns:
            `(stp, f, g, task)`, where `task` starting with `"FG"` asks for a
            fresh function and derivative at `stp`, `"CONV"` reports success,
            `"WARN"` reports that the conditions could not be met (and `stp`
            is then the best point found), and `"ERROR"` reports bad input.
        """
        p5 = 0.5
        p66 = 0.66
        xtrapl = 1.1
        xtrapu = 4.0

        if task.startswith("START"):
            if stp < self.stpmin:
                task = "ERROR: STP .LT. STPMIN"
            if stp > self.stpmax:
                task = "ERROR: STP .GT. STPMAX"
            if g >= 0:
                task = "ERROR: INITIAL G .GE. ZERO"
            if self.ftol < 0:
                task = "ERROR: FTOL .LT. ZERO"
            if self.gtol < 0:
                task = "ERROR: GTOL .LT. ZERO"
            if self.xtol < 0:
                task = "ERROR: XTOL .LT. ZERO"
            if self.stpmin < 0:
                task = "ERROR: STPMIN .LT. ZERO"
            if self.stpmax < self.stpmin:
                task = "ERROR: STPMAX .LT. STPMIN"

            if task.startswith("ERROR"):
                return stp, f, g, task

            self.brackt = False
            self.stage = 1
            self.finit = f
            self.ginit = g
            self.gtest = self.ftol * self.ginit
            self.width = self.stpmax - self.stpmin
            self.width1 = self.width / p5

            # (stx, fx, gx) carry step, value and derivative at the best
            # step; (sty, fy, gy) the same at the interval's other endpoint;
            # (stp, f, g) the same at the current trial step.
            self.stx = 0.0
            self.fx = self.finit
            self.gx = self.ginit
            self.sty = 0.0
            self.fy = self.finit
            self.gy = self.ginit
            self.stmin = 0.0
            self.stmax = stp + xtrapu * stp
            return stp, f, g, "FG"

        # If psi(stp) <= 0 and f'(stp) >= 0 for some step, the algorithm
        # enters its second stage.
        ftest = self.finit + stp * self.gtest

        if self.stage == 1 and f <= ftest and g >= 0:
            self.stage = 2

        # Test for warnings.
        if self.brackt and (stp <= self.stmin or stp >= self.stmax):
            task = "WARNING: ROUNDING ERRORS PREVENT PROGRESS"
        if self.brackt and self.stmax - self.stmin <= self.xtol * self.stmax:
            task = "WARNING: XTOL TEST SATISFIED"
        if stp == self.stpmax and f <= ftest and g <= self.gtest:
            task = "WARNING: STP = STPMAX"
        if stp == self.stpmin and (f > ftest or g >= self.gtest):
            task = "WARNING: STP = STPMIN"

        # Test for convergence.
        if f <= ftest and abs(g) <= self.gtol * -self.ginit:
            task = "CONVERGENCE"

        # Test for termination.
        if task.startswith("WARN") or task.startswith("CONV"):
            return stp, f, g, task

        # A modified function is used to predict the step during the first
        # stage if a lower function value has been obtained but the decrease
        # is not sufficient.
        if self.stage == 1 and f <= self.fx and f > ftest:
            fm = f - stp * self.gtest
            fxm = self.fx - self.stx * self.gtest
            fym = self.fy - self.sty * self.gtest
            gm = g - self.gtest
            gxm = self.gx - self.gtest
            gym = self.gy - self.gtest

            update = _dcstep(
                self.stx,
                fxm,
                gxm,
                self.sty,
                fym,
                gym,
                stp,
                fm,
                gm,
                self.brackt,
                self.stmin,
                self.stmax,
            )
            self.stx, fxm, gxm = update.stx, update.fx, update.dx
            self.sty, fym, gym = update.sty, update.fy, update.dy
            stp, self.brackt = update.stp, update.brackt

            # Reset the function and derivative values for f.
            self.fx = fxm + self.stx * self.gtest
            self.fy = fym + self.sty * self.gtest
            self.gx = gxm + self.gtest
            self.gy = gym + self.gtest
        else:
            update = _dcstep(
                self.stx,
                self.fx,
                self.gx,
                self.sty,
                self.fy,
                self.gy,
                stp,
                f,
                g,
                self.brackt,
                self.stmin,
                self.stmax,
            )
            self.stx, self.fx, self.gx = update.stx, update.fx, update.dx
            self.sty, self.fy, self.gy = update.sty, update.fy, update.dy
            stp, self.brackt = update.stp, update.brackt

        # Decide if a bisection step is needed.
        if self.brackt:
            if abs(self.sty - self.stx) >= p66 * self.width1:
                stp = self.stx + p5 * (self.sty - self.stx)
            self.width1 = self.width
            self.width = abs(self.sty - self.stx)

        # Set the minimum and maximum steps allowed for stp.
        if self.brackt:
            self.stmin = min(self.stx, self.sty)
            self.stmax = max(self.stx, self.sty)
        else:
            self.stmin = stp + xtrapl * (stp - self.stx)
            self.stmax = stp + xtrapu * (stp - self.stx)

        # Force the step to lie within the bounds stpmin and stpmax.
        stp = _clip(stp, self.stpmin, self.stpmax)

        # If further progress is not possible, fall back to the best point
        # obtained during the search.
        if (
            self.brackt
            and (stp <= self.stmin or stp >= self.stmax)
            or (self.brackt and self.stmax - self.stmin <= self.xtol * self.stmax)
        ):
            stp = self.stx

        # Obtain another function and derivative value.
        return stp, f, g, "FG"


def _initial_step(phi0: float, old_phi0: float | None, derphi0: float) -> float:
    """SciPy's first trial step for both Wolfe searches.

    A unit step is the natural guess for a quasi-Newton direction. When the
    previous iterate's value is known, SciPy instead extrapolates the decrease
    it achieved — `1.01*2*(phi0 - old_phi0)/derphi0` — and caps it at 1, which
    keeps the very first steps of steepest descent from being absurdly short.
    """
    if old_phi0 is not None and derphi0 != 0:
        alpha1 = min(1.0, 1.01 * 2 * (phi0 - old_phi0) / derphi0)
    else:
        alpha1 = 1.0
    if alpha1 < 0:
        alpha1 = 1.0
    return alpha1


def scalar_search_wolfe1(
    phi: Callable[[float], float],
    derphi: Callable[[float], float],
    phi0: float | None = None,
    old_phi0: float | None = None,
    derphi0: float | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
    amax: float = 50.0,
    amin: float = 1e-8,
    xtol: float = 1e-14,
) -> ScalarSearchResult:
    """Find `alpha` satisfying the strong Wolfe conditions, via MINPACK.

    Uses the `dcsrch` routine of MINPACK-2 (Moré and Thuente, ACM TOMS
    20(3):286-307, 1994). `alpha > 0` is assumed to be a descent direction,
    that is `derphi0 < 0`; `dcsrch` reports `"ERROR: INITIAL G .GE. ZERO"`
    otherwise.

    Args:
        phi: The scalar function `phi(alpha)`.
        derphi: Its derivative `phi'(alpha)`, returning a scalar.
        phi0: `phi(0)`, evaluated here when omitted.
        old_phi0: `phi(0)` at the previous iterate, used to pick the first
            trial step.
        derphi0: `phi'(0)`, evaluated here when omitted.
        c1: The Armijo (sufficient decrease) parameter, `ftol` in MINPACK.
        c2: The curvature parameter, `gtol` in MINPACK.
        amax: Upper bound on the step. SciPy's default is `50`; BFGS and CG
            pass `1e100`.
        amin: Lower bound on the step. SciPy's default is `1e-8`; BFGS and CG
            pass `1e-100`.
        xtol: Relative tolerance on an acceptable step; the search exits with
            a warning once the interval's relative width falls below it.

    Returns:
        A `ScalarSearchResult` whose `alpha` is `None` when no step met both
        conditions.

    Raises:
        ValueError: If `c1` and `c2` violate `0 < c1 < c2 < 1`.
    """
    _check_c1_c2(c1, c2)

    function_calls = 0
    gradient_calls = 0

    def counted_phi(alpha: float) -> float:
        nonlocal function_calls
        function_calls += 1
        return phi(alpha)

    def counted_derphi(alpha: float) -> float:
        nonlocal gradient_calls
        gradient_calls += 1
        return derphi(alpha)

    if phi0 is None:
        phi0 = counted_phi(0.0)
    if derphi0 is None:
        derphi0 = counted_derphi(0.0)

    alpha1 = _initial_step(phi0, old_phi0, derphi0)

    dcsrch = DCSRCH(counted_phi, counted_derphi, c1, c2, xtol, amin, amax)
    stp, phi1, phi0, derphi1, task = dcsrch.search(
        alpha1, phi0=phi0, derphi0=derphi0, maxiter=100
    )

    return ScalarSearchResult(
        alpha=stp,
        phi_alpha=phi1,
        phi0=phi0,
        derphi_alpha=derphi1 if stp is not None else None,
        function_calls=function_calls,
        gradient_calls=gradient_calls,
        task=task,
    )


def line_search_wolfe1(
    f: Callable[[list[float]], float],
    fprime: Callable[[list[float]], list[float]],
    xk: Sequence[float],
    pk: Sequence[float],
    gfk: Sequence[float] | None = None,
    old_fval: float | None = None,
    old_old_fval: float | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
    amax: float = 50.0,
    amin: float = 1e-8,
    xtol: float = 1e-14,
) -> LineSearchResult:
    """`scalar_search_wolfe1` along the direction `pk` from `xk`.

    This is the MINPACK `dcsrch` search, the one SciPy tries first.

    Args:
        f: The objective `f(x)`.
        fprime: Its gradient `grad f(x)`.
        xk: The current point.
        pk: The search direction, which must be a descent direction.
        gfk: `grad f(xk)`, evaluated here when omitted.
        old_fval: `f(xk)`, evaluated by the search when omitted.
        old_old_fval: `f` at the point preceding `xk`.
        c1: The Armijo parameter.
        c2: The curvature parameter.
        amax: Upper bound on the step.
        amin: Lower bound on the step.
        xtol: Relative tolerance on an acceptable step.

    Returns:
        A `LineSearchResult`; its `alpha` is `None` when the search failed.
    """
    function_calls = 0
    gradient_calls = 0

    if gfk is None:
        gfk = fprime(list(xk))
        gradient_calls += 1
    gval: list[float] = list(gfk)
    gval_alpha = 0.0

    def phi(alpha: float) -> float:
        nonlocal function_calls
        function_calls += 1
        return f(_step_point(xk, alpha, pk))

    def derphi(alpha: float) -> float:
        nonlocal gval, gval_alpha, gradient_calls
        gval = fprime(_step_point(xk, alpha, pk))
        gval_alpha = alpha
        gradient_calls += 1
        return _dot(gval, pk)

    derphi0 = _dot(gfk, pk)

    scalar = scalar_search_wolfe1(
        phi,
        derphi,
        phi0=old_fval,
        old_phi0=old_old_fval,
        derphi0=derphi0,
        c1=c1,
        c2=c2,
        amax=amax,
        amin=amin,
        xtol=xtol,
    )
    # `scalar.function_calls` is deliberately *not* added: the closures above
    # already tallied every call the scalar search made through them, and the
    # scalar search calls nothing else.

    alpha = scalar.alpha
    if alpha is None:
        return LineSearchResult(
            alpha=None,
            function_calls=function_calls,
            gradient_calls=gradient_calls,
            new_fval=None,
            old_fval=scalar.phi0,
            new_slope=None,
            new_gradient=None,
            task=scalar.task,
        )

    # `dcsrch` always evaluates the derivative at the step it accepts, so the
    # stored gradient is the one at `xk + alpha*pk` and the caller need not
    # recompute it. Guard the invariant rather than trust it.
    if gval_alpha != alpha:
        derphi(alpha)
    return LineSearchResult(
        alpha=alpha,
        function_calls=function_calls,
        gradient_calls=gradient_calls,
        new_fval=scalar.phi_alpha,
        old_fval=scalar.phi0,
        new_slope=_dot(gval, pk),
        new_gradient=list(gval),
        task=scalar.task,
    )


# ---------------------------------------------------------------------------
# Nocedal & Wright, Algorithms 3.5 and 3.6
# ---------------------------------------------------------------------------


def _cubicmin(
    a: float,
    fa: float,
    fpa: float,
    b: float,
    fb: float,
    c: float,
    fc: float,
) -> float | None:
    """Minimize the cubic through `(a, fa)`, `(b, fb)`, `(c, fc)` with slope
    `fpa` at `a`.

    Writing the interpolant as `f(x) = A*(x-a)**3 + B*(x-a)**2 + C*(x-a) + D`
    fixes `C = fpa` and `D = fa`, and the two remaining coefficients follow
    from a 2x2 solve.

    Returns:
        The interior minimizer, or `None` when the linear algebra degenerates
        or the result is not finite. SciPy detects that with NumPy's
        `errstate(..., "raise")`; here the equivalent Python exceptions —
        `ZeroDivisionError` and `OverflowError` (both `ArithmeticError`), plus
        `ValueError` from a negative square root — stand in for it.
    """
    try:
        big_c = fpa
        db = b - a
        dc = c - a
        denom = (db * dc) ** 2 * (db - dc)
        d00 = dc**2
        d01 = -(db**2)
        d10 = -(dc**3)
        d11 = db**3
        v0 = fb - fa - big_c * db
        v1 = fc - fa - big_c * dc
        big_a = (d00 * v0 + d01 * v1) / denom
        big_b = (d10 * v0 + d11 * v1) / denom
        radical = big_b * big_b - 3 * big_a * big_c
        xmin = a + (-big_b + math.sqrt(radical)) / (3 * big_a)
    except (ArithmeticError, ValueError):
        return None
    if not math.isfinite(xmin):
        return None
    return xmin


def _quadmin(a: float, fa: float, fpa: float, b: float, fb: float) -> float | None:
    """Minimize the quadratic through `(a, fa)` and `(b, fb)` with slope
    `fpa` at `a`.

    With `f(x) = B*(x-a)**2 + C*(x-a) + D` the coefficients are immediate and
    the minimizer is `a - C/(2*B)`.

    Returns:
        The minimizer, or `None` when the fit degenerates or is not finite.
    """
    try:
        big_d = fa
        big_c = fpa
        db = b - a * 1.0
        big_b = (fb - big_d - big_c * db) / (db * db)
        xmin = a - big_c / (2.0 * big_b)
    except (ArithmeticError, ValueError):
        return None
    if not math.isfinite(xmin):
        return None
    return xmin


@dataclass(frozen=True)
class _ZoomResult:
    """What `_zoom` found: a step and the values there, or three `None`s."""

    alpha: float | None
    phi_alpha: float | None
    derphi_alpha: float | None


def _zoom(
    a_lo: float,
    a_hi: float,
    phi_lo: float,
    phi_hi: float,
    derphi_lo: float,
    phi: Callable[[float], float],
    derphi: Callable[[float], float],
    phi0: float,
    derphi0: float,
    c1: float,
    c2: float,
    extra_condition: Callable[[float, float], bool],
) -> _ZoomResult:
    """The zoom stage of the strong-Wolfe search.

    Algorithm 3.6 of Nocedal and Wright, *Numerical Optimization*, 2nd ed.,
    p. 61. The interval `[a_lo, a_hi]` is known to contain a step satisfying
    the strong Wolfe conditions, with `a_lo` the endpoint of lower function
    value. Each pass picks a trial step by cubic interpolation, falls back to
    quadratic interpolation when the cubic lands too near an endpoint, and to
    bisection when that is still too near, then shrinks the interval.

    The `delta1 = 0.2` cubic and `delta2 = 0.1` quadratic guards and the cap
    of 10 iterations are SciPy's, not the book's.

    Returns:
        A `_ZoomResult` whose fields are all `None` if 10 iterations passed
        without a conforming step.
    """
    maxiter = 10
    i = 0
    delta1 = 0.2  # cubic interpolant check
    delta2 = 0.1  # quadratic interpolant check
    phi_rec = phi0
    a_rec = 0.0
    a_j: float | None = None
    cchk = 0.0
    while True:
        # Interpolate for a trial step between a_lo and a_hi: cubic first,
        # then quadratic if the cubic is within delta1*dalpha of an endpoint
        # or outside the interval, then bisection if the quadratic is within
        # delta2*dalpha.
        dalpha = a_hi - a_lo
        if dalpha < 0:
            a, b = a_hi, a_lo
        else:
            a, b = a_lo, a_hi

        if i > 0:
            cchk = delta1 * dalpha
            a_j = _cubicmin(a_lo, phi_lo, derphi_lo, a_hi, phi_hi, a_rec, phi_rec)
        if (i == 0) or (a_j is None) or (a_j > b - cchk) or (a_j < a + cchk):
            qchk = delta2 * dalpha
            a_j = _quadmin(a_lo, phi_lo, derphi_lo, a_hi, phi_hi)
            if (a_j is None) or (a_j > b - qchk) or (a_j < a + qchk):
                a_j = a_lo + 0.5 * dalpha

        phi_aj = phi(a_j)
        if (phi_aj > phi0 + c1 * a_j * derphi0) or (phi_aj >= phi_lo):
            phi_rec = phi_hi
            a_rec = a_hi
            a_hi = a_j
            phi_hi = phi_aj
        else:
            derphi_aj = derphi(a_j)
            if abs(derphi_aj) <= -c2 * derphi0 and extra_condition(a_j, phi_aj):
                return _ZoomResult(a_j, phi_aj, derphi_aj)
            if derphi_aj * (a_hi - a_lo) >= 0:
                phi_rec = phi_hi
                a_rec = a_hi
                a_hi = a_lo
                phi_hi = phi_lo
            else:
                phi_rec = phi_lo
                a_rec = a_lo
            a_lo = a_j
            phi_lo = phi_aj
            derphi_lo = derphi_aj
        i += 1
        if i > maxiter:
            # Failed to find a conforming step size.
            return _ZoomResult(None, None, None)


def scalar_search_wolfe2(
    phi: Callable[[float], float],
    derphi: Callable[[float], float],
    phi0: float | None = None,
    old_phi0: float | None = None,
    derphi0: float | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
    amax: float | None = None,
    extra_condition: Callable[[float, float], bool] | None = None,
    maxiter: int = 10,
) -> ScalarSearchResult:
    """Find `alpha` satisfying the strong Wolfe conditions, by bracket and
    zoom.

    Algorithm 3.5 of Nocedal and Wright, *Numerical Optimization*, 2nd ed.,
    pp. 60-61 (Algorithm 3.2 in the first edition), see also R. Fletcher,
    *Practical Methods of Optimization*, Wiley (2000). `alpha > 0` is assumed
    to be a descent direction.

    The step is doubled each pass until either the Armijo condition fails, the
    value stops decreasing, or the slope turns non-negative; any of those
    three brackets a conforming step and hands the interval to `_zoom`.

    Args:
        phi: The scalar function `phi(alpha)`.
        derphi: Its derivative `phi'(alpha)`.
        phi0: `phi(0)`, evaluated here when omitted.
        old_phi0: `phi(0)` at the previous iterate.
        derphi0: `phi'(0)`, evaluated here when omitted.
        c1: The Armijo parameter.
        c2: The curvature parameter.
        amax: Upper bound on the step, or `None` for no bound — SciPy's
            default here, unlike `wolfe1`'s `50`.
        extra_condition: An optional `extra_condition(alpha, phi_alpha)`
            predicate; a step is accepted only when it also returns `True`.
            It is consulted only for steps already satisfying both Wolfe
            conditions. Polak-Ribiere CG uses it to force a descent
            direction.
        maxiter: Cap on the bracketing iterations.

    Returns:
        A `ScalarSearchResult` whose `alpha` is `None` when the search failed.

    Raises:
        ValueError: If `c1` and `c2` violate `0 < c1 < c2 < 1`.
    """
    _check_c1_c2(c1, c2)

    function_calls = 0
    gradient_calls = 0

    def counted_phi(alpha: float) -> float:
        nonlocal function_calls
        function_calls += 1
        return phi(alpha)

    def counted_derphi(alpha: float) -> float:
        nonlocal gradient_calls
        gradient_calls += 1
        return derphi(alpha)

    if phi0 is None:
        phi0 = counted_phi(0.0)
    if derphi0 is None:
        derphi0 = counted_derphi(0.0)

    alpha0 = 0.0
    alpha1 = _initial_step(phi0, old_phi0, derphi0)
    if amax is not None:
        alpha1 = min(alpha1, amax)

    phi_a1 = counted_phi(alpha1)
    phi_a0 = phi0
    derphi_a0 = derphi0

    def always(alpha: float, phi_value: float) -> bool:
        del alpha, phi_value
        return True

    condition = always if extra_condition is None else extra_condition

    alpha_star: float | None = None
    phi_star = phi0
    derphi_star: float | None = None
    task = "CONVERGENCE"

    for i in range(maxiter):
        if alpha1 == 0 or (amax is not None and alpha0 > amax):
            # alpha1 == 0 should not happen; presumably the increment has
            # slipped below machine precision.
            alpha_star = None
            phi_star = phi0
            derphi_star = None
            if alpha1 == 0:
                task = (
                    "WARNING: rounding errors prevent the line search from converging"
                )
            else:
                task = (
                    "WARNING: the line search algorithm could not find a "
                    f"solution less than or equal to amax: {amax}"
                )
            break

        not_first_iteration = i > 0
        if (phi_a1 > phi0 + c1 * alpha1 * derphi0) or (
            (phi_a1 >= phi_a0) and not_first_iteration
        ):
            zoomed = _zoom(
                alpha0,
                alpha1,
                phi_a0,
                phi_a1,
                derphi_a0,
                counted_phi,
                counted_derphi,
                phi0,
                derphi0,
                c1,
                c2,
                condition,
            )
            alpha_star = zoomed.alpha
            phi_star = phi0 if zoomed.phi_alpha is None else zoomed.phi_alpha
            derphi_star = zoomed.derphi_alpha
            if alpha_star is None:
                task = "WARNING: the zoom stage did not converge"
            break

        derphi_a1 = counted_derphi(alpha1)
        if abs(derphi_a1) <= -c2 * derphi0:
            if condition(alpha1, phi_a1):
                alpha_star = alpha1
                phi_star = phi_a1
                derphi_star = derphi_a1
                break

        if derphi_a1 >= 0:
            zoomed = _zoom(
                alpha1,
                alpha0,
                phi_a1,
                phi_a0,
                derphi_a1,
                counted_phi,
                counted_derphi,
                phi0,
                derphi0,
                c1,
                c2,
                condition,
            )
            alpha_star = zoomed.alpha
            phi_star = phi0 if zoomed.phi_alpha is None else zoomed.phi_alpha
            derphi_star = zoomed.derphi_alpha
            if alpha_star is None:
                task = "WARNING: the zoom stage did not converge"
            break

        alpha2 = 2 * alpha1  # increase by a factor of two each iteration
        if amax is not None:
            alpha2 = min(alpha2, amax)
        alpha0 = alpha1
        alpha1 = alpha2
        phi_a0 = phi_a1
        phi_a1 = counted_phi(alpha1)
        derphi_a0 = derphi_a1
    else:
        # maxiter reached. SciPy hands back the last bracketing step with a
        # `None` slope, which its callers read as a failure.
        alpha_star = alpha1
        phi_star = phi_a1
        derphi_star = None
        task = "WARNING: the line search algorithm did not converge"

    # SciPy returns the last bracketing step here even though it never met
    # both conditions, signalling the failure only through a `None` slope,
    # and its callers accept that step and recompute the gradient. That is
    # preserved: `alpha` stays non-`None` while `derphi_alpha` is `None`.
    return ScalarSearchResult(
        alpha=alpha_star,
        phi_alpha=phi_star,
        phi0=phi0,
        derphi_alpha=derphi_star,
        function_calls=function_calls,
        gradient_calls=gradient_calls,
        task=task,
    )


def line_search_wolfe2(
    f: Callable[[list[float]], float],
    fprime: Callable[[list[float]], list[float]],
    xk: Sequence[float],
    pk: Sequence[float],
    gfk: Sequence[float] | None = None,
    old_fval: float | None = None,
    old_old_fval: float | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
    amax: float | None = None,
    extra_condition: (
        Callable[[float, list[float], float, list[float]], bool] | None
    ) = None,
    maxiter: int = 10,
) -> LineSearchResult:
    """`scalar_search_wolfe2` along the direction `pk` from `xk`.

    This is the pure Nocedal-Wright search, the one SciPy falls back to when
    MINPACK's `dcsrch` returns no step.

    Args:
        f: The objective `f(x)`.
        fprime: Its gradient `grad f(x)`.
        xk: The current point.
        pk: The search direction, which must be a descent direction —
            `alpha` comes back `None` for an ascent direction such as
            `+grad f(xk)`.
        gfk: `grad f(xk)`, evaluated here when omitted.
        old_fval: `f(xk)`, evaluated by the search when omitted.
        old_old_fval: `f` at the point preceding `xk`.
        c1: The Armijo parameter.
        c2: The curvature parameter.
        amax: Upper bound on the step, or `None` for no bound.
        extra_condition: An optional `extra_condition(alpha, x, f, g)`
            predicate over the proposed step and the corresponding point,
            value and gradient. Consulted only for steps already satisfying
            both Wolfe conditions.
        maxiter: Cap on the bracketing iterations.

    Returns:
        A `LineSearchResult`; its `alpha` is `None` when the search failed.
    """
    function_calls = 0
    gradient_calls = 0

    if gfk is None:
        gfk = fprime(list(xk))
        gradient_calls += 1
    gval: list[float] = list(gfk)
    gval_alpha: float | None = None

    def phi(alpha: float) -> float:
        nonlocal function_calls
        function_calls += 1
        return f(_step_point(xk, alpha, pk))

    def derphi(alpha: float) -> float:
        nonlocal gval, gval_alpha, gradient_calls
        gradient_calls += 1
        gval = fprime(_step_point(xk, alpha, pk))
        gval_alpha = alpha
        return _dot(gval, pk)

    derphi0 = _dot(gfk, pk)

    scalar_condition: Callable[[float, float], bool] | None = None
    if extra_condition is not None:
        outer = extra_condition

        def scalar_condition_impl(alpha: float, phi_value: float) -> bool:
            # Add the current gradient as an argument, to avoid a needless
            # re-evaluation.
            if gval_alpha != alpha:
                derphi(alpha)
            return outer(alpha, _step_point(xk, alpha, pk), phi_value, gval)

        scalar_condition = scalar_condition_impl

    scalar = scalar_search_wolfe2(
        phi,
        derphi,
        phi0=old_fval,
        old_phi0=old_old_fval,
        derphi0=derphi0,
        c1=c1,
        c2=c2,
        amax=amax,
        extra_condition=scalar_condition,
        maxiter=maxiter,
    )
    # As in `line_search_wolfe1`, the closures above already counted every
    # call, including the ones `extra_condition` makes behind the scalar
    # search's back, so `scalar.function_calls` must not be added again.

    alpha = scalar.alpha
    if alpha is None:
        return LineSearchResult(
            alpha=None,
            function_calls=function_calls,
            gradient_calls=gradient_calls,
            new_fval=None,
            old_fval=scalar.phi0,
            new_slope=None,
            new_gradient=None,
            task=scalar.task,
        )

    # The stored gradient was computed while evaluating the slope that
    # accepted this step, so it is already the gradient at the next iterate.
    # It is missing only when the bracketing loop hit `maxiter`, where SciPy
    # hands back the last trial step and leaves its caller to recompute the
    # gradient; doing it here costs the same evaluation and keeps
    # `new_gradient` meaningful for every non-`None` `alpha`.
    if gval_alpha != alpha:
        derphi(alpha)
    return LineSearchResult(
        alpha=alpha,
        function_calls=function_calls,
        gradient_calls=gradient_calls,
        new_fval=scalar.phi_alpha,
        old_fval=scalar.phi0,
        new_slope=_dot(gval, pk),
        new_gradient=list(gval),
        task=scalar.task,
    )


def line_search_wolfe12(
    f: Callable[[list[float]], float],
    fprime: Callable[[list[float]], list[float]],
    xk: Sequence[float],
    pk: Sequence[float],
    gfk: Sequence[float] | None = None,
    old_fval: float | None = None,
    old_old_fval: float | None = None,
    c1: float = 1e-4,
    c2: float = 0.9,
    amax: float | None = None,
    amin: float = 1e-8,
    xtol: float = 1e-14,
    extra_condition: (
        Callable[[float, list[float], float, list[float]], bool] | None
    ) = None,
) -> LineSearchResult:
    """Try `line_search_wolfe1`, fall back to `line_search_wolfe2`, or fail.

    The chaining `scipy.optimize._optimize._line_search_wolfe12` performs, and
    the entry point BFGS, CG and Newton-CG all call. `amin` and `xtol` reach
    only the MINPACK search, which is the only one that has them; `amax` of
    `None` means the MINPACK search uses its own default of `50` while the
    Nocedal-Wright fallback runs unbounded, matching SciPy's two signatures.

    Args:
        f: The objective `f(x)`.
        fprime: Its gradient `grad f(x)`.
        xk: The current point.
        pk: The search direction, which must be a descent direction.
        gfk: `grad f(xk)`, evaluated here when omitted.
        old_fval: `f(xk)`.
        old_old_fval: `f` at the point preceding `xk`.
        c1: The Armijo parameter. SciPy's default everywhere is `1e-4`.
        c2: The curvature parameter. SciPy uses `0.9` for `fmin_bfgs` and
            `fmin_ncg`, and `0.4` for `fmin_cg`.
        amax: Upper bound on the step, or `None` for each search's own
            default.
        amin: Lower bound on the step, MINPACK search only.
        xtol: Relative step tolerance, MINPACK search only.
        extra_condition: An optional `extra_condition(alpha, x, f, g)`
            predicate. A step from the MINPACK search that fails it is
            rejected and the fallback runs.

    Returns:
        A `LineSearchResult` with a non-`None` `alpha`. Its `function_calls`
        and `gradient_calls` are the totals across *both* searches; SciPy
        instead returns the fallback's tallies alone and silently loses the
        first search's evaluations, which understates `nfev` on every
        iteration that falls back.

    Raises:
        LineSearchError: If neither search found an acceptable step. Callers
            turn this into SciPy's warning flag 2, "Desired error not
            necessarily achieved due to precision loss."
    """
    result = line_search_wolfe1(
        f,
        fprime,
        xk,
        pk,
        gfk,
        old_fval,
        old_old_fval,
        c1=c1,
        c2=c2,
        amax=50.0 if amax is None else amax,
        amin=amin,
        xtol=xtol,
    )

    if result.alpha is not None and extra_condition is not None:
        xp1 = _step_point(xk, result.alpha, pk)
        fval = result.new_fval
        gval = result.new_gradient
        if (
            fval is None
            or gval is None
            or not extra_condition(result.alpha, xp1, fval, gval)
        ):
            # Reject the step; the fallback search gets to try instead.
            result = LineSearchResult(
                alpha=None,
                function_calls=result.function_calls,
                gradient_calls=result.gradient_calls,
                new_fval=None,
                old_fval=result.old_fval,
                new_slope=None,
                new_gradient=None,
                task="WARNING: extra_condition rejected the dcsrch step",
            )

    if result.alpha is not None:
        return result

    first_function_calls = result.function_calls
    first_gradient_calls = result.gradient_calls

    fallback = line_search_wolfe2(
        f,
        fprime,
        xk,
        pk,
        gfk,
        old_fval,
        old_old_fval,
        c1=c1,
        c2=c2,
        amax=amax,
        extra_condition=extra_condition,
    )
    fallback = LineSearchResult(
        alpha=fallback.alpha,
        function_calls=first_function_calls + fallback.function_calls,
        gradient_calls=first_gradient_calls + fallback.gradient_calls,
        new_fval=fallback.new_fval,
        old_fval=fallback.old_fval,
        new_slope=fallback.new_slope,
        new_gradient=fallback.new_gradient,
        task=fallback.task,
        used_fallback=True,
    )

    if fallback.alpha is None:
        raise LineSearchError(
            "the line search failed to find a step satisfying the strong "
            f"Wolfe conditions: {fallback.task}"
        )
    return fallback


# ---------------------------------------------------------------------------
# Forward-difference gradients
# ---------------------------------------------------------------------------


def approx_fprime(
    xk: Sequence[float],
    f: Callable[[list[float]], float],
    epsilon: float = EPSILON,
) -> list[float]:
    """Approximate `grad f(xk)` by forward differences.

    The formula is SciPy's, from `scipy.optimize.approx_fprime` and the
    `"2-point"` branch of `scipy.optimize._numdiff.approx_derivative`:

    ```text
                f(xk + h*e_i) - f(xk)
    grad[i]  =  ---------------------
                          h
    ```

    Two details of SciPy's implementation are reproduced rather than
    simplified, because they change the answer:

    * The denominator is the *realized* step `(xk[i] + h) - xk[i]`, not `h`.
      For a large `xk[i]` those differ, and using the realized one keeps the
      quotient a true difference quotient.
    * When that realized step rounds to zero — `xk[i]` so large that adding
      `h` changes nothing — SciPy falls back to the relative step
      `sqrt(eps) * sign(xk[i]) * max(1, abs(xk[i]))`, with `sign(0)` taken as
      `+1`.

    Costs `len(xk) + 1` evaluations of `f`.

    Args:
        xk: The point at which to estimate the gradient.
        f: The scalar objective.
        epsilon: The absolute step. SciPy's default is
            `sqrt(machine epsilon) = 1.4901161193847656e-08`.

    Returns:
        The estimated gradient, one entry per coordinate of `xk`.
    """
    x0 = [float(value) for value in xk]
    f0 = f(list(x0))

    grad: list[float] = []
    for i, xi in enumerate(x0):
        sign_x0 = 1.0 if xi >= 0 else -1.0
        h = epsilon
        if (xi + h) - xi == 0.0:
            # A zero step would divide by zero; fall back to a relative one.
            h = EPSILON * sign_x0 * max(1.0, abs(xi))
        x1 = list(x0)
        x1[i] = xi + h
        dx = x1[i] - xi
        grad.append((f(x1) - f0) / dx)
    return grad


def numerical_gradient(
    f: Callable[[list[float]], float], epsilon: float = EPSILON
) -> Callable[[list[float]], list[float]]:
    """Wrap `f` into the gradient callable the line searches expect.

    The descent methods take a gradient of the same shape whether the caller
    supplied one or not; this adapts `approx_fprime` to that signature. Each
    call costs `n + 1` evaluations of `f`.

    Args:
        f: The scalar objective.
        epsilon: The forward-difference step.

    Returns:
        A callable mapping a point to its approximate gradient.
    """

    def gradient(x: list[float]) -> list[float]:
        return approx_fprime(x, f, epsilon)

    return gradient
