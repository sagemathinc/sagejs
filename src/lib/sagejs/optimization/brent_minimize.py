"""Brent's `localmin`: scalar minimization by golden section and parabolic
interpolation, in both a bounded and an unbounded form.

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

`fminbound` above is the bounded routine, confined to a caller-supplied
interval. `bracket` and `brent` below are its unbounded counterpart, matched
in the same way to scipy's `bracket` function and `Brent` class (driven by
`_minimize_scalar_brent`, which is what `scipy.optimize.brent` exposes).
There the caller supplies at most two starting points; `bracket` marches
downhill from them until it has three points whose middle value is lowest,
and `brent` then refines inside that bracket, free to leave the starting
points behind entirely. The two routines deliberately do *not* share
constants: scipy writes the bounded one's golden ratio as the computed
`0.5*(3 - sqrt(5))` and the unbounded one's as the truncated literal
`0.3819660`, and their tolerance schedules differ too (`sqrt(2.2e-16)*|x| +
tol/3` against `tol*|x| + 1e-11`). Both are reproduced as written, since the
evaluation sequences — and hence the function-call counts — depend on them.

Example:

```python
from sagejs.optimization.brent_minimize import brent, fminbound

result = fminbound(lambda x: (x - 2.0) ** 2, 0.0, 5.0)
assert abs(result.x - 2.0) < 1e-6

unbounded = brent(lambda x: (x - 2.0) ** 2)
assert abs(unbounded.x - 2.0) < 1e-6
```
"""

from __future__ import annotations

import math
from collections.abc import Sequence
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


# ---------------------------------------------------------------------------
# Unbounded Brent minimization: `bracket` plus the `Brent` core algorithm.
# ---------------------------------------------------------------------------

# The golden ratio `(1 + sqrt(5))/2`, as scipy's `bracket` hardcodes it:
# the literal `1.618034`, not `0.5*(1.0 + sqrt(5.0))`
# (`1.618033988749895`). The truncated literal is what scipy multiplies by,
# so the expansion steps land on slightly different points than the exact
# constant would give; reproducing scipy's evaluation sequence means
# reproducing its constant.
_GOLD = 1.618034

# scipy's `_verysmall_num`: the floor below which the parabolic denominator
# in `bracket` is considered degenerate and replaced.
_VERY_SMALL_NUM = 1e-21

# scipy's `Brent._cg`: the truncated squared inverse golden ratio
# `0.3819660`, again a literal rather than `0.5*(3 - sqrt(5))`
# (`0.38196601125010515`). Note that `fminbound` above uses the *computed*
# constant `_GOLDEN_MEAN` while this routine uses the truncated one — that
# asymmetry is scipy's, faithfully preserved.
_CONJUGATE_GOLD = 0.3819660

# scipy's `Brent._mintol`: an absolute floor added to the relative
# tolerance so that the convergence test stays meaningful near `x == 0`.
_MIN_TOL = 1.0e-11


@dataclass(frozen=True)
class BracketResult:
    """A downhill bracket `(xa, xb, xc)` around a minimum, with its values.

    A bracket is *valid* when the three abscissae are strictly ordered
    (either `xa < xb < xc` or `xc < xb < xa`), all three are finite, and the
    middle value is no larger than both ends with at least one inequality
    strict. `bracket` raises `BracketError` carrying an (invalid)
    `BracketResult` rather than returning one that fails those tests.

    Attributes:
        xa: The first bracket abscissa.
        xb: The middle bracket abscissa, where `f` is smallest.
        xc: The third bracket abscissa.
        fa: `f(xa)`.
        fb: `f(xb)`.
        fc: `f(xc)`.
        function_calls: The number of calls made to `f` while bracketing.
    """

    xa: float
    xb: float
    xc: float
    fa: float
    fb: float
    fc: float
    function_calls: int


class BracketError(RuntimeError):
    """Raised when `bracket` terminates without a valid bracket.

    Mirrors scipy's `BracketError`, including the attached partial data:
    scipy stashes the final `(xa, xb, xc, fa, fb, fc, funcalls)` tuple on
    the exception as `e.data` so that callers which prefer a soft failure
    (`scipy.optimize._recover_from_bracket_error`, reached from
    `minimize_scalar` and from Powell's line search) can recover the best of
    the three points instead of propagating the error. The same data is
    carried here as a `BracketResult`.
    """

    def __init__(self, message: str, result: BracketResult) -> None:
        super().__init__(message)
        self.result = result


@dataclass(frozen=True)
class BrentResult:
    """The outcome of an unbounded Brent minimization.

    Attributes:
        x: The abscissa approximating a local minimizer of `f`.
        fun: The value of `f` at `x`.
        iterations: The number of main-loop iterations performed.
        function_calls: The total number of calls made to `f`, including the
            calls spent bracketing.
        converged: scipy's `_minimize_scalar_brent` success test — the
            iteration limit was not reached and neither `x` nor `fun` is
            NaN.
        flag: A readable status string: `"converged"`,
            `"maximum iterations reached"`, or `"nan encountered"`.
    """

    x: float
    fun: float
    iterations: int
    function_calls: int
    converged: bool
    flag: str


def bracket(
    f: Callable[[float], float],
    xa: float = 0.0,
    xb: float = 1.0,
    grow_limit: float = 110.0,
    maxiter: int = 1000,
) -> BracketResult:
    """Search downhill from `xa`, `xb` for three points that bracket a minimum.

    A transcription of `scipy.optimize.bracket`. Starting from the two
    initial points (scipy's defaults `xa = 0.0`, `xb = 1.0`), the pair is
    ordered so that `f(xb) <= f(xa)`, a third point is taken a golden-ratio
    step beyond `xb`, and the triple is then marched downhill. At each step
    a parabola through the current three points proposes a new abscissa
    `w`; depending on where `w` falls relative to the current interval and
    to the growth limit `xb + grow_limit*(xc - xb)`, the routine either
    accepts `w`, clamps to the growth limit, or takes another golden-ratio
    step. `grow_limit` therefore caps how fast the bracket may expand in a
    single iteration, which keeps a monotone `f` from overflowing.

    Args:
        f: The function to bracket; called with a single `float` argument.
        xa: The first initial point.
        xb: The second initial point; its offset from `xa` sets the initial
            step and the search direction.
        grow_limit: The maximum single-step growth factor.
        maxiter: The maximum number of downhill steps.

    Returns:
        A valid `BracketResult`.

    Raises:
        BracketError: If the loop finishes without a valid bracket — for
            example on a monotone function, or where `f` returns a
            non-finite value. The partial bracket is attached as
            `error.result`.
        RuntimeError: If `maxiter` steps are exhausted first. scipy raises a
            plain `RuntimeError` here rather than a `BracketError`, so this
            case is *not* softened by callers that recover from
            `BracketError`; that distinction is preserved.
    """
    fa = f(xa)
    fb = f(xb)
    if fa < fb:
        xa, xb = xb, xa
        fa, fb = fb, fa
    xc = xb + _GOLD * (xb - xa)
    fc = f(xc)
    function_calls = 3
    iterations = 0

    while fc < fb:
        tmp1 = (xb - xa) * (fb - fc)
        tmp2 = (xb - xc) * (fb - fa)
        val = tmp2 - tmp1
        if abs(val) < _VERY_SMALL_NUM:
            denom = 2.0 * _VERY_SMALL_NUM
        else:
            denom = 2.0 * val
        w = xb - ((xb - xc) * tmp2 - (xb - xa) * tmp1) / denom
        wlim = xb + grow_limit * (xc - xb)
        if iterations > maxiter:
            raise RuntimeError(
                "No valid bracket was found before the iteration limit was "
                "reached. Consider trying different initial points or "
                "increasing `maxiter`."
            )
        iterations += 1
        if (w - xc) * (xb - w) > 0.0:
            fw = f(w)
            function_calls += 1
            if fw < fc:
                xa = xb
                xb = w
                fa = fb
                fb = fw
                break
            elif fw > fb:
                xc = w
                fc = fw
                break
            w = xc + _GOLD * (xc - xb)
            fw = f(w)
            function_calls += 1
        elif (w - wlim) * (wlim - xc) >= 0.0:
            w = wlim
            fw = f(w)
            function_calls += 1
        elif (w - wlim) * (xc - w) > 0.0:
            fw = f(w)
            function_calls += 1
            if fw < fc:
                xb = xc
                xc = w
                w = xc + _GOLD * (xc - xb)
                fb = fc
                fc = fw
                fw = f(w)
                function_calls += 1
        else:
            w = xc + _GOLD * (xc - xb)
            fw = f(w)
            function_calls += 1
        xa = xb
        xb = xc
        xc = w
        fa = fb
        fb = fc
        fc = fw

    result = BracketResult(
        xa=xa, xb=xb, xc=xc, fa=fa, fb=fb, fc=fc, function_calls=function_calls
    )

    # scipy's three validity conditions, checked exactly as written there.
    cond1 = (fb < fc and fb <= fa) or (fb < fa and fb <= fc)
    cond2 = (xa < xb < xc) or (xc < xb < xa)
    cond3 = _is_finite(xa) and _is_finite(xb) and _is_finite(xc)
    if not (cond1 and cond2 and cond3):
        raise BracketError(
            "The algorithm terminated without finding a valid bracket. "
            "Consider trying different initial points.",
            result,
        )

    return result


def brent(
    f: Callable[[float], float],
    brack: Sequence[float] | None = None,
    tol: float = 1.48e-8,
    maxiter: int = 500,
) -> BrentResult:
    """Minimize `f` over the whole real line by Brent's method.

    This is the *unbounded* companion to `fminbound` above: a transcription
    of scipy's `Brent` class driven by `_minimize_scalar_brent`, which is
    what `scipy.optimize.brent` and Powell's line search both run. Where
    `fminbound` is confined to a user-supplied interval, this routine first
    calls `bracket` to find an interval containing a minimum and is then
    free to leave the initial points behind entirely — the returned `x` need
    not lie between `brack[0]` and `brack[1]`.

    The core loop is again golden section plus successive parabolic
    interpolation, but the bookkeeping differs from `fminbound` in ways that
    matter for reproducing scipy's evaluation counts: the tolerance is
    `tol*abs(x) + 1e-11` (purely relative plus a small absolute floor,
    rather than `fminbound`'s `sqrt(2.2e-16)*abs(x) + tol/3`), and the
    golden-section constant is the truncated literal `0.3819660`.

    Args:
        f: The function to minimize; called with a single `float` argument.
        brack: `None` to bracket from scipy's default starting points
            `(0.0, 1.0)`; a pair `(xa, xb)` of starting points for
            `bracket`; or a triple `(xa, xb, xc)` already known to bracket a
            minimum.
        tol: The relative error in `x` acceptable for convergence.
        maxiter: The maximum number of main-loop iterations.

    Returns:
        A `BrentResult` describing the approximate minimizer.

    Raises:
        ValueError: If `brack` is neither `None` nor of length 2 or 3, or if
            a length-3 `brack` is not a strictly ordered downhill bracket.
        BracketError: If `brack` is `None` or a pair and `bracket` cannot
            find a valid bracket.
    """
    if tol < 0.0:
        raise ValueError("tolerance should be >= 0")

    start = _bracket_info(f, brack)
    function_calls = start.function_calls

    # scipy's `Brent.optimize` reads only the middle point's value out of the
    # bracket; `fa` and `fc` are needed to *establish* the bracket, not to
    # refine inside it.
    x = start.xb
    w = start.xb
    v = start.xb
    fw = start.fb
    fv = start.fb
    fx = start.fb
    if start.xa < start.xc:
        a = start.xa
        b = start.xc
    else:
        a = start.xc
        b = start.xa
    deltax = 0.0
    iterations = 0

    # scipy leaves `rat` unbound until the first branch that assigns it
    # (a documented wart, gh-4140). It is safe there — and here — because
    # `deltax` starts at `0.0` and `tol1` is always at least `_MIN_TOL > 0`,
    # so the first iteration necessarily takes the golden-section branch
    # that assigns `rat`. Seeding it explicitly avoids relying on that.
    rat = 0.0

    while iterations < maxiter:
        tol1 = tol * abs(x) + _MIN_TOL
        tol2 = 2.0 * tol1
        xmid = 0.5 * (a + b)
        if abs(x - xmid) < (tol2 - 0.5 * (b - a)):
            break
        if abs(deltax) <= tol1:
            # Golden-section step into the larger sub-interval.
            deltax = (a - x) if x >= xmid else (b - x)
            rat = _CONJUGATE_GOLD * deltax
        else:
            # Parabolic step through `(v, fv)`, `(w, fw)`, `(x, fx)`.
            tmp1 = (x - w) * (fx - fv)
            tmp2 = (x - v) * (fx - fw)
            p = (x - v) * tmp2 - (x - w) * tmp1
            tmp2 = 2.0 * (tmp2 - tmp1)
            if tmp2 > 0.0:
                p = -p
            tmp2 = abs(tmp2)
            dx_temp = deltax
            deltax = rat
            if (
                p > tmp2 * (a - x)
                and p < tmp2 * (b - x)
                and abs(p) < abs(0.5 * tmp2 * dx_temp)
            ):
                rat = p * 1.0 / tmp2
                u = x + rat
                if (u - a) < tol2 or (b - u) < tol2:
                    rat = tol1 if (xmid - x) >= 0.0 else -tol1
            else:
                deltax = (a - x) if x >= xmid else (b - x)
                rat = _CONJUGATE_GOLD * deltax

        if abs(rat) < tol1:
            u = (x + tol1) if rat >= 0.0 else (x - tol1)
        else:
            u = x + rat
        fu = f(u)
        function_calls += 1

        if fu > fx:
            if u < x:
                a = u
            else:
                b = u
            if fu <= fw or w == x:
                v = w
                w = u
                fv = fw
                fw = fu
            elif fu <= fv or v == x or v == w:
                v = u
                fv = fu
        else:
            if u >= x:
                a = x
            else:
                b = x
            v = w
            w = x
            x = u
            fv = fw
            fw = fx
            fx = fu

        iterations += 1

    converged = iterations < maxiter and not (_is_nan(x) or _is_nan(fx))
    if converged:
        flag = "converged"
    elif _is_nan(x) or _is_nan(fx):
        flag = "nan encountered"
    else:
        flag = "maximum iterations reached"

    return BrentResult(
        x=x,
        fun=fx,
        iterations=iterations,
        function_calls=function_calls,
        converged=converged,
        flag=flag,
    )


def _bracket_info(
    f: Callable[[float], float], brack: Sequence[float] | None
) -> BracketResult:
    """Resolve `brack` into a starting bracket for `brent`.

    scipy's `Brent.get_bracket_info`. `None` and a pair both delegate to
    `bracket`; a triple is validated (strictly ordered, middle value
    strictly lowest) and evaluated directly, costing exactly three calls.
    """
    if brack is None:
        return bracket(f)
    if len(brack) == 2:
        return bracket(f, xa=float(brack[0]), xb=float(brack[1]))
    if len(brack) == 3:
        xa = float(brack[0])
        xb = float(brack[1])
        xc = float(brack[2])
        if xa > xc:  # swap so `xa < xc` can be assumed
            xc, xa = xa, xc
        if not (xa < xb and xb < xc):
            raise ValueError(
                "Bracketing values (xa, xb, xc) do not fulfill this "
                "requirement: (xa < xb) and (xb < xc)"
            )
        fa = f(xa)
        fb = f(xb)
        fc = f(xc)
        if not (fb < fa and fb < fc):
            raise ValueError(
                "Bracketing values (xa, xb, xc) do not fulfill this "
                "requirement: (f(xb) < f(xa)) and (f(xb) < f(xc))"
            )
        return BracketResult(xa=xa, xb=xb, xc=xc, fa=fa, fb=fb, fc=fc, function_calls=3)
    raise ValueError("Bracketing interval must be length 2 or 3 sequence.")


def _is_finite(value: float) -> bool:
    """`True` when `value` is neither NaN nor an infinity."""
    return value == value and value != _INFINITY and value != -_INFINITY
