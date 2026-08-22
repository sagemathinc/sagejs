"""Sage-compatible numerical root finding and optimization entry points.

This module reproduces the public surface of `sage.numerical.optimize`:
`find_root`, `find_local_minimum`, `find_local_maximum` and `minimize`.
Upstream Sage is a thin wrapper over SciPy; Sage.js has no SciPy, so the
wrapper here calls the transliterated algorithms in this package instead —
`brentq` for root finding, `fminbound` for bounded scalar minimization and
`nelder_mead` for the downhill simplex method. Default argument values,
control flow, return shapes and error messages follow the upstream source
so that Sage programs keep working unchanged.

Documented deviations from upstream Sage, all of them temporary:

* `minimize` returns a plain `list[float]`. Upstream returns
  `vector(RDF, ...)`; a later phase gives Sage.js the same real double
  vector and this function will return one.
* `minimize` implements only the downhill simplex method, so it accepts
  `algorithm="default"` and `algorithm="simplex"` and raises
  `NotImplementedError` for the gradient-based algorithms. Upstream routes
  `algorithm="default"` to BFGS whenever a gradient is available (which for
  a symbolic `func` it always is, because it differentiates automatically);
  here `gradient` and `hessian` are accepted and ignored until those
  algorithms land.
* Upstream `minimize` falls off the end of an `if`/`elif` chain for an
  unrecognized `algorithm` and fails with `UnboundLocalError`. Sage.js
  raises `NotImplementedError` naming the algorithm instead.
* `find_root` skips the `f.find_root(...)` duck-typing hop when `f` is a
  Sage.js symbolic expression, because `Expression.find_root` delegates back
  into this module; the expression is compiled with `fast_callable` here
  instead. Every other object still gets the upstream duck-typing hop.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

import sagejs.runtime as runtime

from .brent_minimize import fminbound
from .brent_root import brentq
from .nelder_mead import nelder_mead

_symbolic_module_cache = runtime.undefined

_ONE_DIMENSION_ONLY = "root finding currently only implemented in 1 dimension."
_NO_ZERO = "f appears to have no zero on the interval"
_BRENT_FAILED = "Brent's method failed to find a zero for f on the interval"
_AT_MOST_ONE_VARIABLE = "f must be a function of at most one variable"

# `minimize(**args)` keywords that upstream forwards to `scipy.optimize.fmin`,
# mapped onto the corresponding `nelder_mead` parameter names.
_SIMPLEX_OPTIONS = {
    "xtol": "xatol",
    "ftol": "fatol",
    "maxiter": "maxiter",
    "maxfun": "maxfev",
}

# The `nelder_mead` parameters among `_SIMPLEX_OPTIONS` that count things
# rather than measure them, and so are coerced with `int` and not `float`.
_INTEGER_OPTIONS = ("maxiter", "maxfev")


def _symbolic_module() -> Any:
    """Load the symbolic expression layer lazily.

    The import is deferred so that the algorithms in this package stay
    usable on plain Python callables without dragging in the symbolic
    bootstrap, and so that `Expression.find_root` can delegate here without
    a circular import at module load time.
    """
    global _symbolic_module_cache
    if _symbolic_module_cache is runtime.undefined:
        _symbolic_module_cache = __import__(
            "sagejs._baselib.symbolic",
            fromlist=["fast_callable"],
        )
    return _symbolic_module_cache


def _is_symbolic(value: Any) -> bool:
    """Return whether `value` is a Sage.js symbolic expression.

    The cheap structural pre-check runs first so that a plain Python
    callable never triggers the symbolic import at all.
    """
    if not hasattr(value, "variables") or not hasattr(value, "_tree"):
        return False
    expression_class = getattr(_symbolic_module(), "Expression", None)
    if expression_class is None:
        return False
    return isinstance(value, expression_class)


def _scalar_float_callable(f: Any, message: str) -> Callable[[float], float] | None:
    """Compile a symbolic `f` of one variable into a float callable.

    Returns `None` when `f` is not a symbolic expression, leaving the caller
    to apply Sage's duck-typing hop and then call `f` directly.
    """
    if not _is_symbolic(f):
        return None
    variables = list(f.variables())
    if len(variables) > 1:
        raise NotImplementedError(message)
    if not variables:
        constant = float(f)

        def constant_value(_point: float) -> float:
            return constant

        return constant_value
    evaluator = _symbolic_module().fast_callable(f, vars=variables)

    def evaluate_symbolic(point: float) -> float:
        return float(evaluator(float(point)))

    return evaluate_symbolic


def _plain_float_callable(f: Any) -> Callable[[float], float]:
    """Wrap a plain Python callable so that it always yields a `float`."""

    def evaluate(point: float) -> float:
        return float(f(point))

    return evaluate


def _vector_float_callable(func: Any) -> Any:
    """Compile a symbolic `func` of several variables into a float callable.

    Non-symbolic `func` is returned unchanged, matching upstream, which
    passes a plain Python function straight through to SciPy.
    """
    if not _is_symbolic(func):
        return func
    variables = list(func.variables())
    evaluator = _symbolic_module().fast_callable(func, vars=variables)

    def evaluate_point(point: Sequence[float]) -> float:
        return float(evaluator(*[float(value) for value in point]))

    return evaluate_point


def find_root(
    f: Any,
    a: Any,
    b: Any,
    xtol: float = 10e-13,
    rtol: float = 2.0**-50,
    maxiter: int = 100,
    full_output: bool = False,
) -> Any:
    r"""Numerically find a root of `f` on the closed interval `[a, b]`.

    Works in machine precision only; arbitrary precision approximations are
    not available through this function.

    Args:
        f: A function of one variable, or a symbolic expression.
        a: One endpoint of the interval.
        b: The other endpoint; the interval `[b, a]` is accepted too.
        xtol: Absolute tolerance on the returned root. Must be `> 0`.
        rtol: Relative tolerance. Defaults to `2.0**-50`, which is
            `4*eps` for IEEE-754 doubles and the smallest value Brent's
            method accepts.
        maxiter: Iteration budget for Brent's method.
        full_output: When `True`, return `(root, result)` where `result`
            carries `converged`, `flag`, `function_calls`, `iterations` and
            `root`.

    Returns:
        The root as a `float`, or a `(root, result)` pair when
        `full_output` is set.

    Raises:
        RuntimeError: If `f` appears to have no zero on the interval, or if
            Brent's method did not converge within `maxiter` iterations.
        NotImplementedError: If Brent's method converged to a point that is
            not a zero of `f` — typically an asymptote such as
            `find_root(1/(x - 1) + 1, 0.00001, 2)`.
        ValueError: If `xtol` or `rtol` is out of range.

    Both endpoints may have the same sign: a pre-pass then minimizes (when
    both values are positive) or maximizes (when both are negative) `f` on
    the interval to find a point of the opposite sign to bracket a root
    with. Endpoints where `f` is undefined are handled too — see Sage issue
    #4942 — by shrinking the interval to span the interior extrema.
    """
    g = _scalar_float_callable(f, _ONE_DIMENSION_ONLY)
    if g is None:
        try:
            return f.find_root(
                a=a,
                b=b,
                xtol=xtol,
                rtol=rtol,
                maxiter=maxiter,
                full_output=full_output,
            )
        except AttributeError:
            pass
        g = _plain_float_callable(f)

    a = float(a)
    b = float(b)
    # Sage.js keeps Sage real literals and plain Python floats in separate
    # coercion systems, so the tolerances are normalized here before they
    # meet the plain-float arithmetic inside `brentq`. Upstream relies on
    # NumPy doing the same widening implicitly.
    xtol = float(xtol)
    rtol = float(rtol)
    maxiter = int(maxiter)
    if a > b:
        a, b = b, a
    left = g(a)
    right = g(b)

    if left > 0 and right > 0:
        # Refine further -- try to find a point where this
        # function is negative in the interval.
        val, s = find_local_minimum(g, a, b)
        if val > 0:
            if val < rtol:
                if full_output:
                    return s, "No extra data"
                return s
            raise RuntimeError(_NO_ZERO)
        # Having found such an s, look for a root between a and s instead.
        a = s
    elif left < 0 and right < 0:
        # Refine further.
        val, s = find_local_maximum(g, a, b)
        if val < 0:
            if abs(val) < rtol:
                if full_output:
                    return s, "No extra data"
                return s
            raise RuntimeError(_NO_ZERO)
        a = s

    # Sage issue #4942: if the value at either endpoint is NaN, restrict to
    # the span between the interior minimum and maximum. This could be done
    # in every case, at the cost of two extra optimizations.
    if math.isnan(left) or math.isnan(right):
        minval, s_1 = find_local_minimum(g, a, b)
        maxval, s_2 = find_local_maximum(g, a, b)
        if minval > 0 or maxval < 0 or math.isnan(minval) or math.isnan(maxval):
            raise RuntimeError(_NO_ZERO)
        a = min(s_1, s_2)
        b = max(s_1, s_2)

    result = brentq(g, a, b, xtol=xtol, rtol=rtol, maxiter=maxiter)
    if not result.converged:
        # scipy's C solver reports non-convergence this way, and Sage lets
        # that error propagate because it leaves `disp` at its default.
        raise RuntimeError(
            "Failed to converge after %d iterations." % (result.iterations,)
        )
    root = result.root

    # A check following Sage issue #4942, to confirm a root was really
    # found: take roughly the derivative and multiply by the estimated
    # value of the root.
    if abs(g(root)) > max(abs(root * rtol * (right - left) / (b - a)), 1e-6):
        raise NotImplementedError(_BRENT_FAILED)
    if full_output:
        return root, result
    return root


def find_local_minimum(
    f: Any,
    a: Any,
    b: Any,
    tol: float = 1.48e-08,
    maxfun: int = 500,
) -> tuple[float, float]:
    """Numerically find a local minimum of `f` on the interval `[a, b]`.

    Only a *local* minimum is found, not the global minimum on the
    interval; enlarging the interval can return a *larger* value (Sage issue
    #2607).

    Args:
        f: A function of at most one variable, or a symbolic expression.
        a: The lower endpoint of the interval.
        b: The upper endpoint of the interval.
        tol: The convergence tolerance.
        maxfun: The maximum number of evaluations of `f`.

    Returns:
        The pair `(minval, x)` — the minimum value first and the point
        attaining it second. Note that this order is *reversed* relative to
        SciPy's `fminbound`, matching Sage.

    Uses Brent's `localmin`, golden section search combined with successive
    parabolic interpolation.
    """
    g = _scalar_float_callable(f, _AT_MOST_ONE_VARIABLE)
    if g is None:
        try:
            return f.find_local_minimum(a=a, b=b, tol=tol, maxfun=maxfun)
        except AttributeError:
            pass
        g = _plain_float_callable(f)
    result = fminbound(g, float(a), float(b), tol=float(tol), maxfun=int(maxfun))
    return result.fun, result.x


def find_local_maximum(
    f: Any,
    a: Any,
    b: Any,
    tol: float = 1.48e-08,
    maxfun: int = 500,
) -> tuple[float, float]:
    """Numerically find a local maximum of `f` on the interval `[a, b]`.

    This is `find_local_minimum` applied to `-f`, with the value negated
    again on the way out; see that function for the caveats about local
    versus global extrema.

    Args:
        f: A function of at most one variable, or a symbolic expression.
        a: The lower endpoint of the interval.
        b: The upper endpoint of the interval.
        tol: The convergence tolerance.
        maxfun: The maximum number of evaluations of `f`.

    Returns:
        The pair `(maxval, x)` — the maximum value first, then the point
        attaining it.
    """
    g = _scalar_float_callable(f, _AT_MOST_ONE_VARIABLE)
    if g is None:
        try:
            return f.find_local_maximum(a=a, b=b, tol=tol, maxfun=maxfun)
        except AttributeError:
            pass
        g = _plain_float_callable(f)

    def negated(point: float) -> float:
        return -g(point)

    minval, x = find_local_minimum(negated, a=a, b=b, tol=tol, maxfun=maxfun)
    return -minval, x


def minimize(
    func: Any,
    x0: Sequence[Any],
    gradient: Callable[..., Any] | None = None,
    hessian: Callable[..., Any] | None = None,
    algorithm: str = "default",
    verbose: bool = False,
    **args: Any,
) -> list[float]:
    """Minimize a function of several variables, starting from `x0`.

    Args:
        func: A symbolic expression, or a Python function taking a single
            tuple of `n` components.
        x0: The initial point.
        gradient: Accepted for source compatibility and currently unused;
            the downhill simplex method needs no derivatives.
        hessian: Accepted for source compatibility and currently unused.
        algorithm: `"default"` or `"simplex"` — both select the downhill
            simplex (Nelder-Mead) method.
        verbose: When `True`, print a convergence message.
        **args: Forwarded to the simplex method. `xtol`, `ftol`, `maxiter`
            and `maxfun` carry Sage's SciPy-facing spellings.

    Returns:
        The minimizing point as a `list[float]`.

        This is a documented deviation: upstream Sage returns
        `vector(RDF, ...)`. A later phase introduces the real double vector
        to Sage.js and this function will return one, so callers should not
        rely on list-specific behaviour.

    Raises:
        NotImplementedError: For any `algorithm` other than `"default"` and
            `"simplex"`. The gradient-based methods (`"powell"`, `"bfgs"`,
            `"cg"`, `"ncg"`) arrive in a later phase.
        TypeError: For an unrecognized keyword argument.
    """
    if algorithm not in ("default", "simplex"):
        raise NotImplementedError(
            "minimize() algorithm %r is not implemented yet; only the "
            "downhill simplex method is available, and the gradient-based "
            "algorithms ('powell', 'bfgs', 'cg', 'ncg') arrive in a later "
            "phase" % (algorithm,)
        )

    f = _vector_float_callable(func)
    start = [float(value) for value in x0]

    options: dict[str, Any] = {}
    for name in args:
        target = _SIMPLEX_OPTIONS.get(name)
        if target is None:
            raise TypeError(
                "minimize() got an unexpected keyword argument %r" % (name,)
            )
        value = args[name]
        options[target] = int(value) if target in _INTEGER_OPTIONS else float(value)

    result = nelder_mead(f, start, **options)

    if verbose:
        if result.converged:
            print("Optimization terminated successfully.")
        else:
            print("Warning: the simplex method did not converge (%s)." % result.flag)
        # `%f` is not among the conversions the Sage.js string formatter
        # implements, so the value is rendered with `%s`.
        print("         Current function value: %s" % result.fun)
        print("         Iterations: %d" % result.iterations)
        print("         Function evaluations: %d" % result.function_calls)

    return [float(value) for value in result.x]
