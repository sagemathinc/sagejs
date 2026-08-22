"""Brent's `localmin`: bounded scalar minimization by golden section and
parabolic interpolation.

This is a faithful transcription of Richard Brent's `localmin` procedure
(*Algorithms for Minimization without Derivatives*, Prentice-Hall, 1973,
chapter 5), by way of netlib's Fortran `fmin` translation, matched to the
control flow and constants that `scipy.optimize._minimize_scalar_bounded`
actually runs. Sage's `find_local_minimum` delegates to
`scipy.optimize.fminbound`, which delegates to `_minimize_scalar_bounded`, so
this module targets that exact behavior rather than the textbook description:
the golden-ratio constant, the literal `sqrt(2.2e-16)` machine-epsilon
surrogate, the parabolic-fit acceptance test, the `tol1`/`tol2` tolerance
schedule, and the `maxfun` evaluation budget are all preserved as scipy writes
them.

At every step the algorithm holds three points `xf` (the best point found so
far), `nfc` (second best), and `fulc` (previous second best, "from a previous
lesser candidate" in Brent's naming) together with the bracket `[a, b]`. Each
iteration either fits a parabola through the three points and takes its
minimizer when that step is well-behaved, or falls back to a golden-section
step that shrinks the larger of the two sub-intervals by the constant
`golden_mean = 0.5*(3 - sqrt(5))` (the squared inverse golden ratio).

Example:

```python
from sagejs.optimization.brent_minimize import fminbound

result = fminbound(lambda x: (x - 2.0) ** 2, 0.0, 5.0)
assert abs(result.x - 2.0) < 1e-6
```
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable

# The squared inverse golden ratio, exactly as scipy's
# `_minimize_scalar_bounded` writes it: `0.5*(3.0 - sqrt(5.0))`.
_GOLDEN_MEAN = 0.5 * (3.0 - math.sqrt(5.0))

# scipy's stand-in for the square root of the relative machine precision.
# This is the literal constant `2.2e-16`, not `sys.float_info.epsilon`
# (`2.220446049250313e-16`) and not a computed machine-epsilon loop like the
# Fortran `fmin` uses; scipy hardcodes this value and so do we, to match its
# behavior bit for bit.
_SQRT_EPS = math.sqrt(2.2e-16)

# `math.inf` is absent from the Sage.js `math` module, so the IEEE infinity
# is built from its literal spelling instead.
_INFINITY = float("inf")


@dataclass(frozen=True)
class BrentMinimumResult:
    """The outcome of a bounded Brent minimization.

    Attributes:
        x: The abscissa approximating where `f` attains its minimum on
            `[a, b]`.
        fun: The value of `f` at `x`.
        iterations: The number of main-loop iterations performed (equal to
            `function_calls - 1`, since one evaluation happens before the
            loop starts).
        function_calls: The total number of calls made to `f`.
        converged: `True` when the algorithm met its stopping tolerance
            (or the degenerate `a == b` case) before exhausting `maxfun` or
            encountering a non-finite value.
        flag: A readable status string: `"converged"`,
            `"maximum function evaluations reached"`, or `"nan encountered"`.
    """

    x: float
    fun: float
    iterations: int
    function_calls: int
    converged: bool
    flag: str


def fminbound(
    f: Callable[[float], float],
    a: float,
    b: float,
    tol: float = 1.48e-08,
    maxfun: int = 500,
) -> BrentMinimumResult:
    """Minimize `f` on the bounded interval `[a, b]` by Brent's method.

    Combines golden-section search with successive parabolic interpolation,
    following Brent's `localmin` (1973, chapter 5) as scipy's
    `_minimize_scalar_bounded` implements it; this is the routine Sage's
    `find_local_minimum` runs under the hood via `scipy.optimize.fminbound`.

    `f` is never evaluated at two points closer together than
    `sqrt_eps*abs(x) + tol/3`, where `sqrt_eps = sqrt(2.2e-16)`.

    Args:
        f: The function to minimize; called with a single `float` argument.
        a: The lower bound of the search interval.
        b: The upper bound of the search interval.
        tol: The desired absolute tolerance on the solution `x`.
        maxfun: The maximum number of calls to `f`.

    Returns:
        A `BrentMinimumResult` describing the approximate minimizer.

    Raises:
        ValueError: If `a > b`.
    """
    if a > b:
        raise ValueError("The lower bound exceeds the upper bound.")
    if a == b:
        fa = f(a)
        return BrentMinimumResult(
            x=a,
            fun=fa,
            iterations=0,
            function_calls=1,
            converged=True,
            flag="converged",
        )

    golden_mean = _GOLDEN_MEAN
    sqrt_eps = _SQRT_EPS

    fulc = a + golden_mean * (b - a)
    nfc = fulc
    xf = fulc
    rat = 0.0
    e = 0.0
    x = xf
    fx = f(x)
    num = 1
    fu = _INFINITY

    ffulc = fx
    fnfc = fx
    xm = 0.5 * (a + b)
    tol1 = sqrt_eps * abs(xf) + tol / 3.0
    tol2 = 2.0 * tol1

    flag = 0
    iterations = 0

    while abs(xf - xm) > (tol2 - 0.5 * (b - a)):
        golden = True
        if abs(e) > tol1:
            golden = False
            r = (xf - nfc) * (fx - ffulc)
            q = (xf - fulc) * (fx - fnfc)
            p = (xf - fulc) * q - (xf - nfc) * r
            q = 2.0 * (q - r)
            if q > 0.0:
                p = -p
            q = abs(q)
            r = e
            e = rat

            if abs(p) < abs(0.5 * q * r) and p > q * (a - xf) and p < q * (b - xf):
                rat = p / q
                x = xf + rat

                if (x - a) < tol2 or (b - x) < tol2:
                    si = _sign(xm - xf)
                    rat = tol1 * si
            else:
                golden = True

        if golden:
            e = (a - xf) if xf >= xm else (b - xf)
            rat = golden_mean * e

        si = _sign(rat)
        x = xf + si * max(abs(rat), tol1)
        fu = f(x)
        num += 1
        iterations += 1

        if fu <= fx:
            if x >= xf:
                a = xf
            else:
                b = xf
            fulc, ffulc = nfc, fnfc
            nfc, fnfc = xf, fx
            xf, fx = x, fu
        else:
            if x < xf:
                a = x
            else:
                b = x
            if fu <= fnfc or nfc == xf:
                fulc, ffulc = nfc, fnfc
                nfc, fnfc = x, fu
            elif fu <= ffulc or fulc == xf or fulc == nfc:
                fulc, ffulc = x, fu

        xm = 0.5 * (a + b)
        tol1 = sqrt_eps * abs(xf) + tol / 3.0
        tol2 = 2.0 * tol1

        if num >= maxfun:
            flag = 1
            break

    if _is_nan(xf) or _is_nan(fx) or _is_nan(fu):
        flag = 2

    flag_name = {
        0: "converged",
        1: "maximum function evaluations reached",
        2: "nan encountered",
    }[flag]

    return BrentMinimumResult(
        x=xf,
        fun=fx,
        iterations=iterations,
        function_calls=num,
        converged=(flag == 0),
        flag=flag_name,
    )


def _sign(value: float) -> float:
    """`sign(value)`, treating zero as positive.

    Mirrors scipy's `np.sign(rat) + (rat == 0)`: `np.sign(0.0)` is `0.0`, and
    adding `1` for the zero case makes this return `1.0` at zero rather than
    `0.0`, which matters because the result is used as a step direction that
    must never vanish.
    """
    if value > 0.0:
        return 1.0
    if value < 0.0:
        return -1.0
    return 1.0


def _is_nan(value: float) -> bool:
    return value != value
