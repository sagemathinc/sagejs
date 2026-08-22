"""Sage-compatible numerical root finding and optimization entry points.

This module reproduces the public surface of `sage.numerical.optimize`:
`find_root`, `find_local_minimum`, `find_local_maximum`, `minimize`,
`minimize_constrained` and `find_fit`. Upstream Sage is a thin wrapper over
SciPy; Sage.js has no SciPy, so the wrapper here calls the transliterated
algorithms in this package instead — `brentq` for root finding, `fminbound`
for bounded scalar minimization, `nelder_mead` for the downhill simplex
method, `cobyla` for constrained minimization and `leastsq` (MINPACK
`lmdif`) for curve fitting. Default argument values, control flow, return
shapes and error messages follow the upstream source so that Sage programs
keep working unchanged.

## Variable ordering: an asymmetry worth preserving

`minimize` compiles a symbolic `func` over `func.variables()`, which Sage
returns in alphabetical order, while `minimize_constrained` compiles it over
`func.arguments()`, which for a callable symbolic function is the order the
user *declared*. So `f(y, x) = x - y` is minimized over `(y, x)` by
`minimize_constrained` but over `(x, y)` by `minimize`. That is real,
observable upstream behaviour — Sage issue #32511 fixed
`minimize_constrained` specifically so its answer lines up with the
declaration order — and it is reproduced here rather than smoothed over.

Documented deviations from upstream Sage, all of them temporary:

* `minimize` and `minimize_constrained` return a plain `list[float]`.
  Upstream returns `vector(RDF, ...)`; a later phase gives Sage.js the same
  real double vector and these functions will return one.
* `minimize` implements only the downhill simplex method, so it accepts
  `algorithm="default"` and `algorithm="simplex"` and raises
  `NotImplementedError` for the gradient-based algorithms. Upstream routes
  `algorithm="default"` to BFGS whenever a gradient is available (which for
  a symbolic `func` it always is, because it differentiates automatically);
  here `gradient` and `hessian` are accepted and ignored until those
  algorithms land.
* `minimize_constrained` implements only COBYLA, so `algorithm="default"`
  and `algorithm="cobyla"` are accepted and `"l-bfgs-b"` and `"tnc"` raise
  `NotImplementedError` naming the algorithm. Upstream sends *bound*
  constraints to TNC by default and to L-BFGS-B on request; here bound
  constraints are turned into the equivalent pair of COBYLA inequality
  constraints instead. Nothing silently falls back to a different
  algorithm.
* Upstream `minimize` and `minimize_constrained` both fall off the end of an
  `if`/`elif` chain — for an unrecognized `algorithm` and for an
  unrecognized `cons` respectively — and fail with `UnboundLocalError`, and
  `minimize_constrained` additionally fails with `IndexError` on an empty
  `cons` list. Sage.js raises `NotImplementedError`/`TypeError` naming what
  it did not understand, and reads an empty `cons` as "no constraints".
* Upstream `find_fit` checks the width of `data` against `len(variables)`
  *before* it checks that `variables` was supplied at all, so a Python
  callable `model` with `variables=None` fails with `TypeError` out of
  `len(None)` instead of a message about the missing argument. Sage.js
  performs that check first and raises an explicit `ValueError`.
* Upstream `find_fit` deduces the parameters with `list.remove`, which
  raises `ValueError: list.remove(x): x not in list` when a declared
  argument of a symbolic `model` does not occur in its body (`f(x, y) =
  a*x`). Sage.js subtracts the variables by name, leaving `[a]`.
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
from .cobyla import cobyla
from .levenberg_marquardt import leastsq
from .nelder_mead import nelder_mead

_symbolic_module_cache = runtime.undefined

_ONE_DIMENSION_ONLY = "root finding currently only implemented in 1 dimension."
_NO_ZERO = "f appears to have no zero on the interval"
_BRENT_FAILED = "Brent's method failed to find a zero for f on the interval"
_AT_MOST_ONE_VARIABLE = "f must be a function of at most one variable"

_BAD_FIT_DATA = "data has to be a list of lists, a matrix, or a numpy array"
_BAD_FIT_ENTRY = "the entries of data have to be of type float"
_BAD_FIT_TABLE = "data has to be a two dimensional table of floating point numbers"
_BAD_FIT_GUESS = "initial_guess has to be a list, tuple, or numpy array"
_BAD_GUESS_LENGTH = (
    "length of initial_guess does not coincide with the number of parameters"
)
_NO_FIT_VARIABLES = (
    "no variables given: `variables` must list the independent variables of "
    "`model`; they are deduced automatically only when `model` is a symbolic "
    "expression"
)
_NO_FIT_PARAMETERS = (
    "no parameters given: `parameters` must list the free parameters of "
    "`model`; they are deduced automatically only when `model` is a symbolic "
    "expression"
)

# The constrained algorithms upstream reaches through SciPy that this package
# does not carry yet, mapped onto how they are named in the error message.
_DEFERRED_CONSTRAINED = {
    "l-bfgs-b": "L-BFGS-B (Byrd, Lu, Nocedal and Zhu, [ZBN1997])",
    "tnc": "the truncated Newton method (TNC)",
}

# `minimize_constrained(**args)` keywords, which upstream forwards to
# `scipy.optimize.fmin_cobyla`. The `cobyla` in this package spells them the
# same way, so the mapping is the identity and only `maxfun` counts things.
_COBYLA_OPTIONS = ("rhobeg", "rhoend", "maxfun", "catol")

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


def _argument_order(expression: Any) -> list[Any]:
    """Return the symbolic arguments of `expression` in declaration order.

    Sage's `Expression.arguments()` asks the parent for its argument tuple,
    so a callable symbolic function `f(y, x) = ...` reports `(y, x)` — the
    order the user wrote — and falls back to `variables()`, which is
    alphabetical, for a plain expression with no callable parent. Two
    Sage.js details are absorbed here:

    * `arguments` is published as a JavaScript prototype alias of
      `_arguments_tuple`, and that alias is not reachable through the
      Python attribute protocol, so the aliased method is called directly.
    * a plain `Expression` answers with an empty tuple rather than
      implementing Sage's fallback to `variables()`, so the fallback is
      applied here.
    """
    arguments = list(expression._arguments_tuple())
    if arguments:
        return arguments
    return list(expression.variables())


def _compiled_over(expression: Any, order: Sequence[Any]) -> Any:
    """Compile a symbolic `expression` over an explicit variable order."""
    evaluator = _symbolic_module().fast_callable(expression, vars=list(order))

    def evaluate_point(point: Sequence[float]) -> float:
        return float(evaluator(*[float(value) for value in point]))

    return evaluate_point


def _point_callable(g: Any) -> Any:
    """Wrap a callable of one coordinate sequence so it yields a `float`."""

    def evaluate(point: Sequence[float]) -> float:
        return float(g(point))

    return evaluate


def _lower_bound(index: int, low: float) -> Any:
    """Build the COBYLA constraint `x[index] - low >= 0`."""

    def evaluate(point: Sequence[float]) -> float:
        return float(point[index]) - low

    return evaluate


def _upper_bound(index: int, high: float) -> Any:
    """Build the COBYLA constraint `high - x[index] >= 0`."""

    def evaluate(point: Sequence[float]) -> float:
        return high - float(point[index])

    return evaluate


def _bound_pairs(cons: Any) -> list[tuple[float | None, float | None]] | None:
    """Read `cons` as a list of `(min, max)` intervals, or return `None`.

    Upstream decides between the two shapes `cons` may take by looking at
    `cons[0]` alone: a `tuple`, a `list` or `None` there selects the bound
    constrained path and anything else the constraint-function path. The
    same first-element test is used here, but every remaining entry is then
    checked too, so that a list mixing intervals with functions is rejected
    with a message instead of being read as intervals and failing later.
    """
    if not isinstance(cons, (list, tuple)):
        return None
    entries = list(cons)
    if not entries:
        return None
    head = entries[0]
    if head is not None and not isinstance(head, (list, tuple)):
        return None
    pairs: list[tuple[float | None, float | None]] = []
    for index in range(len(entries)):
        entry = entries[index]
        if entry is None:
            pairs.append((None, None))
            continue
        if not isinstance(entry, (list, tuple)) or len(entry) != 2:
            raise TypeError(
                "cons[%d] is not a (min, max) pair; a list of bound "
                "intervals may not be mixed with constraint functions" % (index,)
            )
        raw_low = entry[0]
        raw_high = entry[1]
        low = None if raw_low is None else float(raw_low)
        high = None if raw_high is None else float(raw_high)
        if low is not None and high is not None and low > high:
            raise ValueError(
                "cons[%d] has its minimum above its maximum: %s > %s"
                % (index, low, high)
            )
        pairs.append((low, high))
    return pairs


def _bound_constraints(
    bounds: Sequence[tuple[float | None, float | None]],
) -> list[Any]:
    """Turn `(min, max)` intervals into COBYLA `g(x) >= 0` constraints."""
    constraints: list[Any] = []
    for index in range(len(bounds)):
        low, high = bounds[index]
        if low is not None:
            constraints.append(_lower_bound(index, low))
        if high is not None:
            constraints.append(_upper_bound(index, high))
    return constraints


def _constraint_callables(cons: Any, order: Sequence[Any] | None) -> list[Any]:
    """Compile `cons` into a list of COBYLA `g(x) >= 0` constraints.

    `cons` may be one function, one symbolic expression, or a list of
    either; symbolic constraints are compiled over `order`, the argument
    order of `func`. When `func` is a plain Python function there is no such
    order, so a symbolic constraint supplies its own — upstream compiles
    symbolic constraints only alongside a symbolic `func` and hands them to
    SciPy uncompiled otherwise, which cannot work.
    """
    entries = list(cons) if isinstance(cons, (list, tuple)) else [cons]
    constraints: list[Any] = []
    for index in range(len(entries)):
        entry = entries[index]
        if _is_symbolic(entry):
            entry_order = _argument_order(entry) if order is None else order
            constraints.append(_compiled_over(entry, entry_order))
        elif callable(entry):
            constraints.append(_point_callable(entry))
        else:
            raise TypeError(
                "cons must be a constraint function, a list of constraint "
                "functions, or a list of (min, max) bound intervals; "
                "cons[%d] is none of those" % (index,)
            )
    return constraints


def _cobyla_options(args: dict[str, Any]) -> dict[str, Any]:
    """Validate and coerce the `**args` `minimize_constrained` forwards."""
    options: dict[str, Any] = {}
    for name in args:
        if name not in _COBYLA_OPTIONS:
            raise TypeError(
                "minimize_constrained() got an unexpected keyword argument %r" % (name,)
            )
        value = args[name]
        options[name] = int(value) if name == "maxfun" else float(value)
    return options


def _fit_data_rows(data: Any) -> list[list[float]]:
    """Normalize `data` into a rectangular table of floats.

    Accepts a list of lists or tuples, a matrix (anything answering
    `rows()`) and any other iterable of iterables. The three error messages
    are upstream's own: a shape or element type NumPy could not turn into a
    two dimensional float array raises `TypeError`, and a table that is not
    two dimensional or holds non-float entries raises `ValueError`.
    """
    source = data.rows() if hasattr(data, "rows") else data
    try:
        raw = list(source)
    except TypeError:
        raise TypeError(_BAD_FIT_DATA) from None
    rows: list[list[float]] = []
    for entry in raw:
        try:
            values = list(entry)
        except TypeError:
            raise ValueError(_BAD_FIT_TABLE) from None
        row: list[float] = []
        for value in values:
            try:
                row.append(float(value))
            except (TypeError, ValueError):
                raise ValueError(_BAD_FIT_ENTRY) from None
        rows.append(row)
    if not rows:
        raise ValueError(_BAD_FIT_TABLE)
    width = len(rows[0])
    for row in rows:
        if len(row) != width:
            raise TypeError(_BAD_FIT_DATA)
    return rows


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


def minimize_constrained(
    func: Any,
    cons: Any,
    x0: Sequence[Any],
    gradient: Callable[..., Any] | None = None,
    algorithm: str = "default",
    **args: Any,
) -> list[float]:
    """Minimize a function of several variables subject to constraints.

    Args:
        func: A symbolic expression, or a Python function taking a single
            tuple of `n` components.
        cons: The constraints, in either of two shapes. A function, or a
            list of functions, each of a single tuple of `n` components, is
            read as `g(x) >= 0`. A list of `(min, max)` intervals, one per
            variable, is read as bounds; either endpoint may be `None` for
            "unbounded on that side", and a whole entry may be `None` for
            "unbounded in that variable". An empty list means no
            constraints.
        x0: The initial point. It need not be feasible.
        gradient: Accepted for source compatibility and currently unused.
            Upstream consults it only on the bound constrained path, which
            here runs COBYLA — a derivative-free method.
        algorithm: `"default"` or `"cobyla"` — both select COBYLA.
        **args: Forwarded to `cobyla`: `rhobeg`, `rhoend`, `maxfun` and
            `catol`, the same names upstream passes to
            `scipy.optimize.fmin_cobyla`.

    Returns:
        The minimizing point as a `list[float]`.

        This is a documented deviation: upstream Sage returns
        `vector(RDF, ...)`. A later phase introduces the real double vector
        to Sage.js and this function will return one, so callers should not
        rely on list-specific behaviour.

    Raises:
        NotImplementedError: For `algorithm="l-bfgs-b"` or
            `algorithm="tnc"`, which arrive in a later phase, and for any
            other unrecognized `algorithm`. Nothing falls back silently to
            a different method.
        TypeError: If `cons` is neither of the two shapes above, or for an
            unrecognized keyword argument.

    A symbolic `func` is compiled over `func.arguments()`, its *declaration*
    order, so `f(y, x) = x - y` is minimized over `(y, x)`. That differs
    from `minimize`, which compiles over `func.variables()` and so works in
    alphabetical order; the module docstring explains why the asymmetry is
    kept.

    Bound constraints are turned into the equivalent pair of COBYLA
    inequality constraints, `x[i] - min >= 0` and `max - x[i] >= 0` —
    upstream instead routes them to TNC, or to L-BFGS-B on request, neither
    of which is available yet. `x0` is *not* clipped into the box on the way
    in, even though both of those solvers do clip: COBYLA works towards
    feasibility from wherever it starts, and clipping would place the first
    simplex on the boundary, which is the worst conditioned place for it.
    """
    if algorithm in _DEFERRED_CONSTRAINED:
        raise NotImplementedError(
            "minimize_constrained() algorithm %r is not implemented yet; %s "
            "arrives in a later phase. Only COBYLA ('default', 'cobyla') is "
            "available, and it is not substituted silently."
            % (algorithm, _DEFERRED_CONSTRAINED[algorithm])
        )
    if algorithm not in ("default", "cobyla"):
        raise NotImplementedError(
            "minimize_constrained() algorithm %r is not implemented yet; "
            "only COBYLA ('default', 'cobyla') is available" % (algorithm,)
        )

    order: list[Any] | None = None
    if _is_symbolic(func):
        order = _argument_order(func)
        f = _compiled_over(func, order)
    else:
        f = _point_callable(func)

    start = [float(value) for value in x0]
    options = _cobyla_options(args)

    bounds = _bound_pairs(cons)
    if bounds is None:
        constraints = _constraint_callables(cons, order)
    else:
        if len(bounds) != len(start):
            raise ValueError(
                "cons gives %d bound intervals but x0 has %d components"
                % (len(bounds), len(start))
            )
        constraints = _bound_constraints(bounds)

    result = cobyla(f, start, constraints, **options)
    return [float(value) for value in result.x]


def find_fit(
    data: Any,
    model: Any,
    initial_guess: Any = None,
    parameters: Any = None,
    variables: Any = None,
    solution_dict: bool = False,
) -> Any:
    r"""Fit `model` to `data` by nonlinear least squares.

    Args:
        data: A two dimensional table of floating point numbers, as a list
            of lists or tuples or as a matrix. Each row is
            `[x_1, x_2, ..., x_k, f]`: the last column holds the dependent
            value and the earlier columns the independent variables.
        model: A symbolic expression, a callable symbolic function, or a
            Python function of `(x_1, ..., x_k, a_1, ..., a_l)` — the
            variables first, then the parameters.
        initial_guess: The starting estimate for `(a_1, ..., a_l)`, as a
            list, tuple or vector. Defaults to `1` for every parameter.
        parameters: The free parameters `(a_1, ..., a_l)`. Deduced from a
            symbolic `model` when omitted; required otherwise.
        variables: The independent variables `(x_1, ..., x_k)`. Deduced
            from a symbolic `model` when omitted; required otherwise.
        solution_dict: When `True`, return a dict mapping each parameter to
            its fitted value instead of a list of equations.

    Returns:
        A list of symbolic equations `parameter == value`, one per
        parameter, or that same correspondence as a dict when
        `solution_dict` is set.

    Raises:
        TypeError: If `data` is not a table of the right shape, or
            `initial_guess` is not a sequence of numbers.
        ValueError: If `data` is not two dimensional, holds non-numeric
            entries, or has rows of the wrong width; if `parameters` or
            `variables` is missing or empty; or if `initial_guess` has a
            length other than the number of parameters.

    The sum of the squared residuals `model(x_i, a) - f_i` is minimized
    with `leastsq`, this package's transliteration of MINPACK's `lmdif`
    Levenberg-Marquardt algorithm — the same routine
    `scipy.optimize.leastsq` calls, so upstream Sage's ALGORITHM note still
    describes what happens.

    Two upstream accidents are not reproduced, both of them argument
    validation misfiring before the argument it is about has been checked
    for presence: a Python-callable `model` with `variables=None` fails
    upstream inside `len(None)`, and a symbolic `model` with a declared
    argument that does not occur in its body fails upstream inside
    `list.remove`. Both raise a message naming the real problem here; the
    module docstring lists them.
    """
    rows = _fit_data_rows(data)

    if _is_symbolic(model):
        if variables is None:
            variables = _argument_order(model)
        if parameters is None:
            variable_names = [str(value) for value in variables]
            parameters = [
                symbol
                for symbol in model.variables()
                if str(symbol) not in variable_names
            ]

    variable_list = [] if variables is None else list(variables)
    parameter_list = [] if parameters is None else list(parameters)
    if not variable_list:
        raise ValueError(_NO_FIT_VARIABLES)
    if not parameter_list:
        raise ValueError(_NO_FIT_PARAMETERS)

    width = len(variable_list) + 1
    if len(rows[0]) != width:
        raise ValueError(
            "each row of data needs %d entries, only %d entries given"
            % (width, len(rows[0]))
        )

    if initial_guess is None:
        guess = [1.0] * len(parameter_list)
    else:
        try:
            guess = [float(value) for value in initial_guess]
        except (TypeError, ValueError):
            raise TypeError(_BAD_FIT_GUESS) from None
    if len(guess) != len(parameter_list):
        raise ValueError(_BAD_GUESS_LENGTH)

    if _is_symbolic(model):
        # The symbolic path compiles the model over the variables first and
        # the parameters second, so that a data row and the current
        # parameter estimate concatenate straight into the argument list.
        func = _symbolic_module().fast_callable(
            model,
            vars=variable_list + parameter_list,
        )
    else:
        func = model

    x_rows = [row[: len(variable_list)] for row in rows]
    y_values = [row[-1] for row in rows]

    def residuals(params: Sequence[float]) -> list[float]:
        estimate = [float(value) for value in params]
        return [
            float(func(*(x_row + estimate))) - y_value
            for x_row, y_value in zip(x_rows, y_values, strict=True)
        ]

    result = leastsq(residuals, guess)
    estimated = [float(value) for value in result.x]

    if solution_dict:
        answer: dict[Any, float] = {}
        for parameter, value in zip(parameter_list, estimated, strict=True):
            answer[parameter] = value
        return answer

    ring = _symbolic_module().SR
    return [
        ring(parameter) == value
        for parameter, value in zip(parameter_list, estimated, strict=True)
    ]
