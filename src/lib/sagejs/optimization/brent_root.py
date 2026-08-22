"""Brent's `zeroin` bracketed root finder and plain bisection.

`brentq` is a direct transliteration of Brent's ALGOL 60 procedure `zero`
(Richard Brent, *Algorithms for Minimization without Derivatives*,
Prentice-Hall, 1973, chapter 4), following the control flow of scipy's C
reimplementation (`scipy/optimize/Zeros/brentq.c`, by Charles Harris) rather
than netlib's older Fortran `zeroin.f` translation. Sage's `find_root`
delegates to `scipy.optimize.brentq`, so this module matches scipy's
iteration structure, tolerance formula, and error vocabulary exactly rather
than re-deriving the method from Brent's book alone.

At each step the bracket is `[xblk, xcur]` (or `[xcur, xblk]`; the order is
not maintained), `xcur` is the current best estimate, `xpre` is the previous
estimate, and `|f(xblk)| >= |f(xcur)|`. The next trial point comes from
inverse quadratic interpolation through the three most recent distinct
ordinates when the previous step made good progress, from secant
(linear) interpolation when only two usable ordinates are available, and
from bisection whenever neither interpolant is trustworthy. This mirrors
the accept/reject test in Brent's original algorithm: an interpolated step
is used only when it lies inside the bracket and is smaller than half the
previous step, otherwise the algorithm bisects, which guarantees the
superlinear convergence of secant/inverse-quadratic methods without ever
giving up the linear worst-case guarantee of bisection.

`bisect` is the companion transliteration of scipy's `bisect.c`. It is far
slower than `brentq` but its convergence behaviour is trivial to reason
about, which makes it a useful differential oracle for `brentq` on
well-behaved (smooth, single-root) problems.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

# scipy's `_zeros_py.py` sets the default `rtol` to `4 * np.finfo(float).eps`
# and rejects anything smaller with this exact literal, not
# `sys.float_info.epsilon` scaled at call time.
_RTOL_MIN = 8.881784197001252e-16


def _signbit(x: float) -> bool:
    """Return whether `x`'s sign bit is set, matching C's `signbit(x)`.

    This distinguishes `+0.0` from `-0.0` and is defined for `nan` (whose
    sign bit is whatever the platform produced), exactly like the C
    `signbit` macro that scipy's `brentq.c`/`bisect.c` call.
    """
    return math.copysign(1.0, x) < 0


@dataclass(frozen=True)
class BrentRootResult:
    """The outcome of a bracketed scalar root search.

    `flag` follows scipy's vocabulary from `_zeros_py.py`: `"converged"`,
    `"sign error"`, `"convergence error"`, or `"value error"`. `converged`
    is `True` exactly when `flag == "converged"`.
    """

    root: float
    iterations: int
    function_calls: int
    converged: bool
    flag: str


def _validate_tolerances(xtol: float, rtol: float) -> None:
    """Reject tolerances scipy's `_zeros_py.py` would reject.

    scipy formats the offending values with `%g`; the Sage.js string
    formatter has no `%g` conversion, so `%s` is used instead. Only the
    rendering of the number differs, not the message or the condition.
    """
    if xtol <= 0:
        raise ValueError("xtol too small (%s <= 0)" % xtol)
    if rtol < _RTOL_MIN:
        raise ValueError("rtol too small (%s < %s)" % (rtol, _RTOL_MIN))


def brentq(
    f: Callable[[float], float],
    a: float,
    b: float,
    xtol: float = 2e-12,
    rtol: float = 8.881784197001252e-16,
    maxiter: int = 100,
) -> BrentRootResult:
    """Find a root of `f` bracketed by `[a, b]` using Brent's method.

    `f(a)` and `f(b)` must have different signs. The search stops once the
    current bracket half-width `|sbis|` is below `delta = (xtol +
    rtol*|xcur|) / 2` — scipy's exact mixed absolute/relative tolerance,
    read from `brentq.c` rather than reconstructed — or once `f` evaluates
    to exactly zero.

    Raises `ValueError` if `xtol <= 0`, if `rtol` is smaller than the
    tightest tolerance representable in double precision (matching scipy's
    `rtol too small` check), or if `f(a)` and `f(b)` share a sign. A root
    found exactly at `a` or `b` is returned immediately with
    `converged=True` and no iterations spent. If `maxiter` is exhausted
    without satisfying the tolerance, the best current estimate is returned
    with `converged=False` and `flag="convergence error"` rather than
    raising.
    """
    _validate_tolerances(xtol, rtol)

    xpre = a
    xcur = b
    xblk = 0.0
    fblk = 0.0
    spre = 0.0
    scur = 0.0

    fpre = f(xpre)
    fcur = f(xcur)
    function_calls = 2

    if fpre == 0:
        return BrentRootResult(
            root=xpre,
            iterations=0,
            function_calls=function_calls,
            converged=True,
            flag="converged",
        )
    if fcur == 0:
        return BrentRootResult(
            root=xcur,
            iterations=0,
            function_calls=function_calls,
            converged=True,
            flag="converged",
        )
    if _signbit(fpre) == _signbit(fcur):
        raise ValueError("f(a) and f(b) must have different signs")

    iterations = 0
    for _ in range(maxiter):
        iterations += 1

        if fpre != 0 and fcur != 0 and _signbit(fpre) != _signbit(fcur):
            xblk = xpre
            fblk = fpre
            spre = xcur - xpre
            scur = xcur - xpre

        if abs(fblk) < abs(fcur):
            # Faithful to brentq.c's sequential (not simultaneous) three
            # assignments: xpre and xblk both end up holding the old xcur.
            xpre = xcur
            xcur = xblk
            xblk = xpre

            fpre = fcur
            fcur = fblk
            fblk = fpre

        delta = (xtol + rtol * abs(xcur)) / 2
        sbis = (xblk - xcur) / 2
        if fcur == 0 or abs(sbis) < delta:
            return BrentRootResult(
                root=xcur,
                iterations=iterations,
                function_calls=function_calls,
                converged=True,
                flag="converged",
            )

        if abs(spre) > delta and abs(fcur) < abs(fpre):
            if xpre == xblk:
                # Secant (linear) interpolation: only two distinct usable
                # ordinates are available.
                stry = -fcur * (xcur - xpre) / (fcur - fpre)
            else:
                # Inverse quadratic interpolation/extrapolation through the
                # three most recent distinct ordinates.
                dpre = (fpre - fcur) / (xpre - xcur)
                dblk = (fblk - fcur) / (xblk - xcur)
                stry = (
                    -fcur * (fblk * dblk - fpre * dpre) / (dblk * dpre * (fblk - fpre))
                )

            if 2 * abs(stry) < min(abs(spre), 3 * abs(sbis) - delta):
                # Good short step: accept the interpolated step.
                spre = scur
                scur = stry
            else:
                # Interpolated step rejected: bisect instead.
                spre = sbis
                scur = sbis
        else:
            # Interpolation not trustworthy this round: bisect.
            spre = sbis
            scur = sbis

        xpre = xcur
        fpre = fcur
        if abs(scur) > delta:
            xcur += scur
        else:
            xcur += delta if sbis > 0 else -delta

        fcur = f(xcur)
        function_calls += 1

    return BrentRootResult(
        root=xcur,
        iterations=iterations,
        function_calls=function_calls,
        converged=False,
        flag="convergence error",
    )


def bisect(
    f: Callable[[float], float],
    a: float,
    b: float,
    xtol: float = 2e-12,
    rtol: float = 8.881784197001252e-16,
    maxiter: int = 100,
) -> BrentRootResult:
    """Find a root of `f` bracketed by `[a, b]` by plain bisection.

    `f(a)` and `f(b)` must have different signs. Transliterated from
    scipy's `bisect.c`: each step halves the bracket and keeps whichever
    half still has `sign(f) == sign(f(a))`, using the *original* `f(a)`'s
    sign throughout (never re-sampled), exactly as the C source does.
    Convergence uses the same `xtol + rtol*|xm|` tolerance as `brentq`,
    compared against the *unhalved-again* current step `dm` rather than a
    half-step, so `bisect` and `brentq` are not expected to stop at
    bit-identical iteration counts even on the same problem.

    Raises `ValueError` under the same conditions as `brentq`. If `maxiter`
    is exhausted first, returns the last-updated bracket endpoint with
    `converged=False` and `flag="convergence error"`.
    """
    _validate_tolerances(xtol, rtol)

    xa = a
    xb = b
    fa = f(xa)
    fb = f(xb)
    function_calls = 2

    if fa == 0:
        return BrentRootResult(
            root=xa,
            iterations=0,
            function_calls=function_calls,
            converged=True,
            flag="converged",
        )
    if fb == 0:
        return BrentRootResult(
            root=xb,
            iterations=0,
            function_calls=function_calls,
            converged=True,
            flag="converged",
        )
    if _signbit(fa) == _signbit(fb):
        raise ValueError("f(a) and f(b) must have different signs")

    dm = xb - xa
    xm = xa
    iterations = 0
    for _ in range(maxiter):
        iterations += 1
        dm *= 0.5
        xm = xa + dm
        fm = f(xm)
        function_calls += 1

        if _signbit(fm) == _signbit(fa):
            xa = xm

        if fm == 0 or abs(dm) < xtol + rtol * abs(xm):
            return BrentRootResult(
                root=xm,
                iterations=iterations,
                function_calls=function_calls,
                converged=True,
                flag="converged",
            )

    return BrentRootResult(
        root=xa,
        iterations=iterations,
        function_calls=function_calls,
        converged=False,
        flag="convergence error",
    )
