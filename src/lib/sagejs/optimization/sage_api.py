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
* `minimize` implements all six of upstream's algorithms —
  `"default"`/`"simplex"` (downhill simplex), `"powell"`, `"bfgs"`, `"cg"`
  and `"ncg"` — routed exactly as upstream routes them, including
  `algorithm="default"` selecting BFGS whenever a gradient is available,
  which for a symbolic `func` it always is. Sage.js's `Expression` has no
  `gradient()`/`hessian()` methods the way upstream Sage's does, so this
  module builds them itself, out of the `Expression.derivative` API that
  does exist, rather than adding either method to the symbolic bootstrap
  package; see `_symbolic_gradient_callable` and
  `_symbolic_hessian_callable` below.
* `minimize_constrained` implements all three of upstream's algorithms —
  COBYLA, L-BFGS-B and TNC — routed exactly as upstream routes them:
  bound-interval `cons` goes to TNC by default (`algorithm="default"` or
  `"tnc"`) or to L-BFGS-B on request (`algorithm="l-bfgs-b"`); `g(x) >= 0`
  constraint-function `cons` always goes to COBYLA, regardless of
  `algorithm`, exactly as upstream's own `fmin_cobyla` call never consults
  `algorithm` either. The one deliberate deviation: asking a box-only
  solver (`"l-bfgs-b"`/`"tnc"`) for constraint functions, or COBYLA for
  bound intervals, raises `TypeError` naming the mismatch rather than
  upstream's silent substitution (function constraints) or its dedicated
  COBYLA-only support (bound intervals used to be turned into inequality
  constraints here, before L-BFGS-B and TNC existed). Nothing silently
  falls back to a different algorithm.
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
from .gradient_methods import fmin_bfgs, fmin_cg, fmin_ncg
from .lbfgsb import fmin_l_bfgs_b
from .levenberg_marquardt import leastsq
from .nelder_mead import nelder_mead
from .powell import powell
from .tnc import fmin_tnc

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

# The four `minimize_constrained(algorithm=...)` values this package
# understands. `"default"` is not itself a solver: which of the other three
# it resolves to depends on the *shape* of `cons` -- see `minimize_constrained`.
_CONSTRAINED_ALGORITHMS = ("default", "cobyla", "l-bfgs-b", "tnc")

# `minimize_constrained(**args)` keywords, which upstream forwards to
# `scipy.optimize.fmin_cobyla`. The `cobyla` in this package spells them the
# same way, so the mapping is the identity and only `maxfun` counts things.
_COBYLA_OPTIONS = ("rhobeg", "rhoend", "maxfun", "catol")

# `minimize_constrained(algorithm="l-bfgs-b", **args)` keywords, matching
# `fmin_l_bfgs_b`'s own parameter names, which are scipy's `fmin_l_bfgs_b`
# names exactly -- the mapping is the identity.
_LBFGSB_OPTIONS = {
    "m": "m",
    "factr": "factr",
    "pgtol": "pgtol",
    "epsilon": "epsilon",
    "maxfun": "maxfun",
    "maxiter": "maxiter",
    "maxls": "maxls",
}
_LBFGSB_INTEGER_OPTIONS = ("m", "maxfun", "maxiter", "maxls")

# `minimize_constrained(algorithm="tnc"|"default", **args)` keywords upstream
# forwards to `scipy.optimize.fmin_tnc`, mapped onto `fmin_tnc`'s own
# parameter names here. Only `epsilon` differs in spelling: scipy calls it
# `epsilon`, this package's `fmin_tnc` (matching MINPACK/`tnc.c` usage
# elsewhere in the module) calls it `eps`.
_TNC_OPTIONS = {
    "epsilon": "eps",
    "maxCGit": "maxCGit",
    "maxfun": "maxfun",
    "eta": "eta",
    "stepmx": "stepmx",
    "accuracy": "accuracy",
    "fmin": "fmin",
    "ftol": "ftol",
    "xtol": "xtol",
    "pgtol": "pgtol",
    "rescale": "rescale",
}
_TNC_INTEGER_OPTIONS = ("maxCGit", "maxfun")
# `scale` and `offset` are per-variable sequences, not scalars, so they are
# coerced separately from every other `_TNC_OPTIONS` entry.
_TNC_VECTOR_OPTIONS = ("scale", "offset")

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

# `minimize(algorithm="powell", **args)` keywords, mapped onto `powell`'s own
# parameter names. `powell` already spells `xtol`/`ftol`/`maxiter` the way
# upstream's `scipy.optimize.fmin_powell` does; only `maxfun` differs, since
# `powell` calls the same thing `maxfev`.
_POWELL_OPTIONS = {
    "xtol": "xtol",
    "ftol": "ftol",
    "maxiter": "maxiter",
    "maxfun": "maxfev",
}

# `minimize(algorithm="bfgs"|"cg", **args)` keywords. `fmin_bfgs`/`fmin_cg`
# already spell every one of these the way upstream's
# `scipy.optimize.fmin_bfgs`/`fmin_cg` do, so the mapping is the identity.
_BFGS_OPTIONS = {
    "gtol": "gtol",
    "norm": "norm",
    "epsilon": "epsilon",
    "maxiter": "maxiter",
    "c1": "c1",
    "c2": "c2",
}
_CG_OPTIONS = dict(_BFGS_OPTIONS)

# `minimize(algorithm="ncg", **args)` keywords, matching `fmin_ncg`'s own
# parameter names, which are upstream's `scipy.optimize.fmin_ncg` names.
_NCG_OPTIONS = {
    "avextol": "avextol",
    "epsilon": "epsilon",
    "maxiter": "maxiter",
    "c1": "c1",
    "c2": "c2",
}

# The options among `_POWELL_OPTIONS`/`_BFGS_OPTIONS`/`_CG_OPTIONS`/
# `_NCG_OPTIONS` that count things rather than measure them.
_GRADIENT_INTEGER_OPTIONS = ("maxiter", "maxfev")

# The six `minimize()` algorithm names Sage documents, `"default"` included.
_MINIMIZE_ALGORITHMS = ("default", "simplex", "powell", "bfgs", "cg", "ncg")


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


def _symbolic_partials(func: Any, order: Sequence[Any]) -> list[Any]:
    """Differentiate `func` once with respect to each variable in `order`.

    Sage.js's `Expression` has no `gradient()` method, unlike upstream
    Sage's, so the gradient is assembled here out of `Expression.derivative`
    instead — one partial derivative per entry of `order`. A variable that
    does not occur in `func` differentiates to the zero expression exactly
    as `Expression.derivative` already handles it, so the returned list
    always has the same length and order as `order`, whether or not `func`
    mentions every variable in it.
    """
    return [func.derivative(variable) for variable in order]


def _symbolic_gradient_callable(func: Any, order: Sequence[Any]) -> Any:
    """Build `grad func` as a `list[float]`-returning callable over `order`.

    Each entry of `_symbolic_partials` is compiled independently with
    `_compiled_over`, all over the same `order`, so the returned callable
    matches the `Callable[[Sequence[float]], Sequence[float]]` shape
    `fmin_bfgs`/`fmin_cg`/`fmin_ncg` expect for `fprime`.
    """
    order = list(order)
    compiled = [
        _compiled_over(partial, order) for partial in _symbolic_partials(func, order)
    ]

    def evaluate(point: Sequence[float]) -> list[float]:
        return [component(point) for component in compiled]

    return evaluate


def _symbolic_hessian_callable(func: Any, order: Sequence[Any]) -> Any:
    """Build `hess func` as a `list[list[float]]`-returning callable.

    Sage.js's `Expression` has no `hessian()` method either. Each entry of
    row `i` is the mixed partial `d/d(order[i]) d/d(order[j]) func`,
    obtained by differentiating `func` once for the gradient (row `i`'s own
    partial) and once more for column `j`, then compiling every entry over
    `order`. The result matches `fmin_ncg`'s `fhess` shape.
    """
    order = list(order)
    gradient = _symbolic_partials(func, order)
    compiled = [
        [_compiled_over(partial.derivative(variable), order) for variable in order]
        for partial in gradient
    ]

    def evaluate(point: Sequence[float]) -> list[list[float]]:
        return [[entry(point) for entry in row] for row in compiled]

    return evaluate


def _mapped_options(args: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    """Validate and coerce a `minimize()` `**args` mapping onto `mapping`.

    `mapping` translates Sage's keyword spelling onto this package's own
    parameter name (the identity for every algorithm but `"powell"`'s
    `maxfun`/`maxfev`); values are coerced with `int` for the counting
    options in `_GRADIENT_INTEGER_OPTIONS` and `float` for everything else,
    the same convention `_SIMPLEX_OPTIONS`/`_cobyla_options` use.
    """
    options: dict[str, Any] = {}
    for name in args:
        target = mapping.get(name)
        if target is None:
            raise TypeError(
                "minimize() got an unexpected keyword argument %r" % (name,)
            )
        value = args[name]
        options[target] = (
            int(value) if target in _GRADIENT_INTEGER_OPTIONS else float(value)
        )
    return options


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
    """Validate and coerce the `**args` `minimize_constrained` forwards to
    `cobyla`."""
    options: dict[str, Any] = {}
    for name in args:
        if name not in _COBYLA_OPTIONS:
            raise TypeError(
                "minimize_constrained() got an unexpected keyword argument %r" % (name,)
            )
        value = args[name]
        options[name] = int(value) if name == "maxfun" else float(value)
    return options


def _lbfgsb_options(args: dict[str, Any]) -> dict[str, Any]:
    """Validate and coerce the `**args` `minimize_constrained` forwards to
    `fmin_l_bfgs_b`, under `_LBFGSB_OPTIONS`'s (identity) name mapping."""
    options: dict[str, Any] = {}
    for name in args:
        target = _LBFGSB_OPTIONS.get(name)
        if target is None:
            raise TypeError(
                "minimize_constrained() got an unexpected keyword argument %r" % (name,)
            )
        value = args[name]
        options[target] = (
            int(value) if target in _LBFGSB_INTEGER_OPTIONS else float(value)
        )
    return options


def _tnc_options(args: dict[str, Any]) -> dict[str, Any]:
    """Validate and coerce the `**args` `minimize_constrained` forwards to
    `fmin_tnc`, under `_TNC_OPTIONS`'s name mapping (`epsilon` -> `eps`,
    every other name unchanged). `scale` and `offset` are per-variable
    sequences and are coerced element-wise rather than as a single scalar."""
    options: dict[str, Any] = {}
    for name in args:
        value = args[name]
        if name in _TNC_VECTOR_OPTIONS:
            options[name] = [float(v) for v in value]
            continue
        target = _TNC_OPTIONS.get(name)
        if target is None:
            raise TypeError(
                "minimize_constrained() got an unexpected keyword argument %r" % (name,)
            )
        options[target] = int(value) if target in _TNC_INTEGER_OPTIONS else float(value)
    return options


def _minimize_constrained_gradient(
    gradient: Callable[..., Any] | None, func: Any, order: Sequence[Any] | None
) -> Callable[[Sequence[float]], list[float]] | None:
    """Resolve the `gradient` `fprime` argument for the bound-constrained
    (L-BFGS-B/TNC) path.

    Upstream unconditionally differentiates a symbolic `func` itself
    (`func.gradient()`), discarding whatever `gradient` the caller passed --
    unlike `minimize()`, which only fills in a missing gradient. That
    asymmetry is upstream's own and is reproduced here: a symbolic `func`
    always gets its automatic gradient on this path. Sage.js's `Expression`
    has no `gradient()` method, so `_symbolic_gradient_callable` builds one
    out of `Expression.derivative`, exactly as `minimize()` does.
    """
    if _is_symbolic(func):
        assert order is not None
        return _symbolic_gradient_callable(func, order)
    if gradient is None:
        return None

    def evaluate(point: Sequence[float]) -> list[float]:
        return [float(v) for v in gradient(point)]

    return evaluate


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
        gradient: The gradient of `func`, accepting a coordinate sequence
            and returning one `float` per component. Computed automatically
            when `func` is a symbolic expression and `gradient` is not
            given; `"bfgs"`, `"cg"` and `"ncg"` fall back to a forward-
            difference approximation when it is still `None` at that point
            (`"ncg"` excepted — see below).
        hessian: The Hessian of `func`, accepting a coordinate sequence and
            returning `n` rows of `n` second partial derivatives. Computed
            automatically for a symbolic `func` when `algorithm="ncg"` and
            `hessian` is not given; `"ncg"` falls back to a forward-
            difference Hessian-vector product when it is still `None`.
        algorithm: `"default"`, `"simplex"`, `"powell"`, `"bfgs"`, `"cg"` or
            `"ncg"`. `"default"` selects `"bfgs"` whenever a gradient is
            available — which for a symbolic `func` it always is, since one
            is then differentiated automatically — and `"simplex"`
            otherwise, exactly as upstream routes it.
        verbose: When `True`, print a convergence message.
        **args: Forwarded to the selected algorithm, under Sage's SciPy-
            facing keyword spellings: `xtol`, `ftol`, `maxiter` and `maxfun`
            for `"simplex"`/`"powell"`; `gtol`, `norm`, `epsilon`, `maxiter`,
            `c1` and `c2` for `"bfgs"`/`"cg"`; `avextol`, `epsilon`,
            `maxiter`, `c1` and `c2` for `"ncg"`.

    Returns:
        The minimizing point as a `list[float]`.

        This is a documented deviation: upstream Sage returns
        `vector(RDF, ...)`. A later phase introduces the real double vector
        to Sage.js and this function will return one, so callers should not
        rely on list-specific behaviour.

    Raises:
        NotImplementedError: For any `algorithm` other than the six above.
        TypeError: For an unrecognized keyword argument, or for
            `algorithm="ncg"` when no gradient is available (`func` is not
            symbolic and `gradient` was not given) — `fmin_ncg` requires
            one, unlike `"bfgs"`/`"cg"`.

    Sage.js's `Expression` has no `gradient()`/`hessian()` methods the way
    upstream Sage's does; see `_symbolic_gradient_callable` and
    `_symbolic_hessian_callable` above for how they are assembled instead,
    out of `Expression.derivative` over `func.variables()` — the same order
    `_vector_float_callable` compiles `func` itself over.
    """
    if algorithm not in _MINIMIZE_ALGORITHMS:
        raise NotImplementedError(
            "minimize() algorithm %r is not implemented; algorithm must be "
            "one of 'default', 'simplex', 'powell', 'bfgs', 'cg', 'ncg'" % (algorithm,)
        )

    symbolic = _is_symbolic(func)
    order = list(func.variables()) if symbolic else None
    f = _vector_float_callable(func)

    needs_gradient = algorithm in ("default", "bfgs", "cg", "ncg")
    if symbolic and gradient is None and needs_gradient:
        assert order is not None
        gradient = _symbolic_gradient_callable(func, order)

    resolved = algorithm
    if algorithm == "default":
        resolved = "simplex" if gradient is None else "bfgs"

    if resolved == "ncg" and symbolic and hessian is None:
        assert order is not None
        hessian = _symbolic_hessian_callable(func, order)

    start = [float(value) for value in x0]

    if resolved == "simplex":
        options: dict[str, Any] = {}
        for name in args:
            target = _SIMPLEX_OPTIONS.get(name)
            if target is None:
                raise TypeError(
                    "minimize() got an unexpected keyword argument %r" % (name,)
                )
            value = args[name]
            options[target] = int(value) if target in _INTEGER_OPTIONS else float(value)
        simplex_result = nelder_mead(f, start, **options)
        if verbose:
            if simplex_result.converged:
                print("Optimization terminated successfully.")
            else:
                print(
                    "Warning: the simplex method did not converge (%s)."
                    % simplex_result.flag
                )
            # `%f` is not among the conversions the Sage.js string
            # formatter implements, so the value is rendered with `%s`.
            print("         Current function value: %s" % simplex_result.fun)
            print("         Iterations: %d" % simplex_result.iterations)
            print("         Function evaluations: %d" % simplex_result.function_calls)
        return [float(value) for value in simplex_result.x]

    if resolved == "powell":
        powell_options = _mapped_options(args, _POWELL_OPTIONS)
        powell_result = powell(f, start, **powell_options)
        if verbose:
            if powell_result.converged:
                print("Optimization terminated successfully.")
            else:
                print(
                    "Warning: Powell's method did not converge (%s)."
                    % powell_result.flag
                )
            print("         Current function value: %s" % powell_result.fun)
            print("         Iterations: %d" % powell_result.iterations)
            print("         Function evaluations: %d" % powell_result.function_calls)
        return [float(value) for value in powell_result.x]

    if resolved == "bfgs":
        bfgs_options = _mapped_options(args, _BFGS_OPTIONS)
        bfgs_result = fmin_bfgs(f, start, fprime=gradient, **bfgs_options)
        if verbose:
            print(bfgs_result.message)
            print("         Current function value: %s" % bfgs_result.fun)
            print("         Iterations: %d" % bfgs_result.nit)
            print("         Function evaluations: %d" % bfgs_result.nfev)
            print("         Gradient evaluations: %d" % bfgs_result.njev)
        return [float(value) for value in bfgs_result.x]

    if resolved == "cg":
        cg_options = _mapped_options(args, _CG_OPTIONS)
        cg_result = fmin_cg(f, start, fprime=gradient, **cg_options)
        if verbose:
            print(cg_result.message)
            print("         Current function value: %s" % cg_result.fun)
            print("         Iterations: %d" % cg_result.nit)
            print("         Function evaluations: %d" % cg_result.nfev)
            print("         Gradient evaluations: %d" % cg_result.njev)
        return [float(value) for value in cg_result.x]

    # resolved == "ncg"
    if gradient is None:
        raise TypeError(
            "minimize() algorithm 'ncg' requires a gradient: pass one "
            "explicitly, or use a symbolic func so one is differentiated "
            "automatically"
        )
    ncg_options = _mapped_options(args, _NCG_OPTIONS)
    ncg_result = fmin_ncg(f, start, fprime=gradient, fhess=hessian, **ncg_options)
    if verbose:
        print(ncg_result.message)
        print("         Current function value: %s" % ncg_result.fun)
        print("         Iterations: %d" % ncg_result.nit)
        print("         Function evaluations: %d" % ncg_result.nfev)
        print("         Gradient evaluations: %d" % ncg_result.njev)
        print("         Hessian evaluations: %d" % ncg_result.nhev)
    return [float(value) for value in ncg_result.x]


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
            constraints at all, and is accepted by every algorithm.
        x0: The initial point. It need not be feasible.
        gradient: The gradient of `func`, accepting a coordinate sequence and
            returning one `float` per component. Consulted only on the
            bound-constrained path (`"l-bfgs-b"`/`"tnc"`); COBYLA is
            derivative-free and never sees it, matching upstream. A symbolic
            `func` gets its gradient differentiated automatically on that
            path regardless of what is passed here — see
            `_minimize_constrained_gradient`.
        algorithm: `"default"`, `"cobyla"`, `"l-bfgs-b"` or `"tnc"`.
            `"default"` does not name a solver by itself: which one it
            resolves to depends on the *shape* of `cons`, exactly as
            upstream resolves it --

            * `cons` a list of `(min, max)` bound intervals (or `None`
              entries), or empty: `"l-bfgs-b"` selects L-BFGS-B;
              `"default"` and `"tnc"` both select TNC. `"cobyla"` is
              rejected — COBYLA takes `g(x) >= 0` constraint functions, not
              bound intervals.
            * `cons` one or more constraint functions: `"default"` and
              `"cobyla"` select COBYLA; `"l-bfgs-b"` and `"tnc"` are
              rejected, since a box-only solver cannot represent a general
              inequality.

            **Documented divergence from upstream, deliberately not a
            bug-for-bug copy.** Upstream tests `algorithm` exactly once,
            as `algorithm == 'l-bfgs-b'`, and lets everything else fall
            through: bound intervals with any other name run TNC, and
            constraint functions run COBYLA regardless of what was asked
            for. Nothing is reported either way, so `algorithm='L-BFGS-B'`
            — a capitalisation slip — silently runs TNC and the result
            gives no hint. Sage.js validates `algorithm` and raises instead.
            Reported upstream as
            [sagemath/sage#42711](https://github.com/sagemath/sage/issues/42711);
            the doctests upstream ships never exercise these fall-throughs,
            so the corpus in `upstream-tests/sage/numerical/` is unaffected.

            The same report covers two further upstream defects this
            function does not reproduce, because `cons` is read by shape
            rather than by `cons[0]`'s type: upstream raises `IndexError`
            from `cons[0]` when `cons` is `[]` (a natural spelling of "no
            constraints", accepted here), and `UnboundLocalError` when a
            constraint is any callable that is not a plain function — a
            `functools.partial`, a bound method, an object with `__call__`.
            `_constraint_callables` tests `callable(...)`, so all of those
            work, and anything else gets a `TypeError` naming the index.
        **args: Forwarded to the selected solver, under Sage's SciPy-facing
            keyword spellings: `rhobeg`, `rhoend`, `maxfun` and `catol` for
            COBYLA; `m`, `factr`, `pgtol`, `epsilon`, `maxfun`, `maxiter`
            and `maxls` for L-BFGS-B; `epsilon`, `scale`, `offset`,
            `maxCGit`, `maxfun`, `eta`, `stepmx`, `accuracy`, `fmin`,
            `ftol`, `xtol`, `pgtol` and `rescale` for TNC.

    Returns:
        The minimizing point as a `list[float]`.

        This is a documented deviation: upstream Sage returns
        `vector(RDF, ...)`. A later phase introduces the real double vector
        to Sage.js and this function will return one, so callers should not
        rely on list-specific behaviour.

    Raises:
        NotImplementedError: For any `algorithm` other than the four above.
        TypeError: If `cons` is neither of the two shapes above; if
            `algorithm="cobyla"` is combined with bound-interval `cons`; if
            `algorithm` is `"l-bfgs-b"` or `"tnc"` and `cons` holds one or
            more constraint functions; or for an unrecognized keyword
            argument. The two algorithm/shape mismatches are Sage.js
            rejecting what upstream silently reroutes — see `algorithm`
            above and sagemath/sage#42711.
        ValueError: If a bound-interval `cons` has a different length than
            `x0`.

    A symbolic `func` is compiled over `func.arguments()`, its *declaration*
    order, so `f(y, x) = x - y` is minimized over `(y, x)`. That differs
    from `minimize`, which compiles over `func.variables()` and so works in
    alphabetical order; the module docstring explains why the asymmetry is
    kept.

    `x0` is not clipped into the box before an `"l-bfgs-b"`/`"tnc"` run —
    both solvers project it themselves, matching upstream's scipy calls,
    which never clip on the way in either.
    """
    if algorithm not in _CONSTRAINED_ALGORITHMS:
        raise NotImplementedError(
            "minimize_constrained() algorithm %r is not implemented; "
            "algorithm must be one of 'default', 'cobyla', 'l-bfgs-b', 'tnc'"
            % (algorithm,)
        )

    order: list[Any] | None = None
    if _is_symbolic(func):
        order = _argument_order(func)
        f = _compiled_over(func, order)
    else:
        f = _point_callable(func)

    start = [float(value) for value in x0]
    cons_is_empty = isinstance(cons, (list, tuple)) and len(cons) == 0
    bounds = None if cons_is_empty else _bound_pairs(cons)

    if bounds is not None or cons_is_empty:
        if bounds is not None and len(bounds) != len(start):
            raise ValueError(
                "cons gives %d bound intervals but x0 has %d components"
                % (len(bounds), len(start))
            )
        if algorithm == "cobyla":
            raise TypeError(
                "minimize_constrained() algorithm 'cobyla' does not accept "
                "bound interval constraints (a list of (min, max) pairs); "
                "COBYLA needs g(x) >= 0 constraint functions instead. Use "
                "algorithm='default', 'l-bfgs-b' or 'tnc' for bound "
                "constraints. Upstream Sage runs TNC here without saying so "
                "-- see sagemath/sage#42711."
            )
        fprime = _minimize_constrained_gradient(gradient, func, order)
        if algorithm == "l-bfgs-b":
            lbfgsb_result = fmin_l_bfgs_b(
                f, start, fprime=fprime, bounds=bounds, **_lbfgsb_options(args)
            )
            return [float(value) for value in lbfgsb_result.x]
        # "default" and "tnc" both resolve to TNC for bound constraints.
        tnc_result = fmin_tnc(
            f, start, fprime=fprime, bounds=bounds, **_tnc_options(args)
        )
        return [float(value) for value in tnc_result.x]

    # `cons` holds one or more `g(x) >= 0` constraint functions: always
    # COBYLA, regardless of `algorithm` -- see the Args docstring above.
    if algorithm in ("l-bfgs-b", "tnc"):
        raise TypeError(
            "minimize_constrained() algorithm %r is a box-constrained "
            "solver and cannot take general g(x) >= 0 constraint "
            "functions; only a list of (min, max) bound intervals is "
            "supported for this algorithm. Upstream Sage runs COBYLA here "
            "and discards the requested algorithm silently -- see "
            "sagemath/sage#42711." % (algorithm,)
        )
    constraints = _constraint_callables(cons, order)
    result = cobyla(f, start, constraints, **_cobyla_options(args))
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


_NUMERICAL_OPTIMIZE_PROVENANCE = {
    "kind": "sage-derived",
    "source": "SageMath numerical optimization API",
    "url": (
        "https://doc.sagemath.org/html/en/reference/numerical/"
        "sage/numerical/optimize.html"
    ),
    "license": "GPL-2.0-or-later",
}
runtime.register_doc(
    "find_root",
    find_root,
    {
        "kind": "function",
        "module": "sage.numerical.optimize",
        "tags": ["numerical mathematics", "optimization", "root finding"],
        "backends": ["Sage.js Brent root finder"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": (
                "Matches SciPy's `brentq` root, iteration count, and "
                "function-call count exactly for the same bracket and "
                "tolerances."
            ),
        },
        "provenance": [
            _NUMERICAL_OPTIMIZE_PROVENANCE,
            {
                "kind": "literature-implemented",
                "source": "Brent's method for bracketed root finding",
            },
        ],
        "implementation": {
            "algorithm": (
                "Brent's method, reproducing SciPy's `brentq` root, "
                "iteration count, and function-call count exactly."
            ),
        },
        "limitations": [],
    },
)
runtime.register_doc(
    "find_local_minimum",
    find_local_minimum,
    {
        "kind": "function",
        "module": "sage.numerical.optimize",
        "tags": ["numerical mathematics", "optimization", "local optimization"],
        "backends": ["Sage.js bounded Brent minimizer"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": "Matches Sage's bounded Brent search and `(value, point)` return convention.",
        },
        "provenance": [
            _NUMERICAL_OPTIMIZE_PROVENANCE,
            {
                "kind": "literature-implemented",
                "source": "Brent's method for bounded univariate minimization",
            },
        ],
        "implementation": {
            "algorithm": "Bounded Brent search (golden section combined with successive parabolic interpolation).",
        },
        "limitations": [],
    },
)
runtime.register_doc(
    "find_local_maximum",
    find_local_maximum,
    {
        "kind": "function",
        "module": "sage.numerical.optimize",
        "tags": ["numerical mathematics", "optimization", "local optimization"],
        "backends": ["Sage.js bounded Brent minimizer"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": "Matches Sage's bounded Brent search and `(value, point)` return convention.",
        },
        "provenance": [
            _NUMERICAL_OPTIMIZE_PROVENANCE,
            {
                "kind": "literature-implemented",
                "source": "Brent's method for bounded univariate minimization",
            },
        ],
        "implementation": {
            "algorithm": "Bounded Brent search over the negated objective.",
        },
        "limitations": [],
    },
)
runtime.register_doc(
    "minimize",
    minimize,
    {
        "kind": "function",
        "module": "sage.numerical.optimize",
        "tags": ["numerical mathematics", "optimization", "minimization"],
        "backends": [
            "Sage.js Nelder-Mead, Powell, BFGS, conjugate-gradient, and Newton-CG solvers",
        ],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Matches Sage's algorithms, defaults, and automatic "
                "symbolic differentiation; returns a `list[float]` where "
                "Sage returns `vector(RDF, ...)`."
            ),
        },
        "provenance": [
            _NUMERICAL_OPTIMIZE_PROVENANCE,
            {
                "kind": "literature-implemented",
                "source": (
                    "Nelder-Mead (1965) simplex search, Powell's "
                    "direction-set method, and BFGS/conjugate-gradient/"
                    "Newton-CG quasi-Newton methods sharing a Wolfe line search"
                ),
            },
        ],
        "implementation": {
            "algorithm": (
                "`simplex` selects Nelder-Mead, `powell` selects Powell's "
                "direction-set method, and `bfgs`/`cg`/`ncg` select "
                "quasi-Newton, conjugate-gradient, and Newton-CG methods "
                "sharing a Wolfe line search; symbolic objectives are "
                "differentiated automatically for the gradient and, for "
                "`ncg`, the Hessian."
            ),
        },
        "limitations": [
            "Returns a `list[float]` rather than Sage's `vector(RDF, ...)`.",
        ],
    },
)
runtime.register_doc(
    "minimize_constrained",
    minimize_constrained,
    {
        "kind": "function",
        "module": "sage.numerical.optimize",
        "tags": [
            "numerical mathematics",
            "optimization",
            "constrained minimization",
        ],
        "backends": ["Sage.js COBYLA, L-BFGS-B, and TNC solvers"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Matches Sage's algorithms and defaults; returns a "
                "`list[float]` where Sage returns `vector(RDF, ...)`, and "
                "validates `algorithm` where Sage silently falls through "
                "to a different solver."
            ),
        },
        "provenance": [
            _NUMERICAL_OPTIMIZE_PROVENANCE,
            {
                "kind": "literature-implemented",
                "source": (
                    "Powell's COBYLA, the Byrd-Lu-Nocedal-Zhu L-BFGS-B "
                    "bound-constrained solver, and Nash's truncated "
                    "Newton (TNC) method"
                ),
            },
        ],
        "implementation": {
            "algorithm": (
                "`cobyla` selects Powell's derivative-free "
                "linear-approximation solver; `l-bfgs-b` and `tnc` select "
                "bound-constrained quasi-Newton and truncated-Newton solvers."
            ),
        },
        "limitations": [
            "Returns a `list[float]` rather than Sage's `vector(RDF, ...)`.",
            (
                "Raises on an unrecognized `algorithm`, where upstream "
                "Sage silently falls through to a different solver "
                "(reported upstream as sagemath/sage#42711)."
            ),
        ],
    },
)
runtime.register_doc(
    "find_fit",
    find_fit,
    {
        "kind": "function",
        "module": "sage.numerical.optimize",
        "tags": [
            "numerical mathematics",
            "optimization",
            "curve fitting",
            "least squares",
        ],
        "backends": ["Sage.js Levenberg-Marquardt least-squares solver"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": "Matches Sage's default Levenberg-Marquardt fitting behavior.",
        },
        "provenance": [
            _NUMERICAL_OPTIMIZE_PROVENANCE,
            {
                "kind": "literature-implemented",
                "source": "MINPACK's `lmdif`/`lmpar` Levenberg-Marquardt least-squares algorithm",
            },
        ],
        "implementation": {
            "algorithm": "Levenberg-Marquardt least squares, following MINPACK's `lmdif`/`lmpar`.",
        },
        "limitations": [],
    },
)
