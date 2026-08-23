"""Local numerical minimization shaped for Wolfram `FindMinimum`.

`nminimize` in this package answers Wolfram's *global* question — search a
whole initial region for the lowest value anywhere in it. `FindMinimum` asks
the local one: start from a given point and walk downhill until the steps stop
paying. The two are separate Wolfram functions with separate documentation
pages and separate method vocabularies, so they are separate modules here
rather than one engine with a flag.

This module is the local counterpart. It owns Wolfram's *surface* for the
local question — the variable specifications `{x, x0}` and
`{x, x0, xmin, xmax}`, the `Method` vocabulary, and the maximization
convention — and dispatches the actual descent to the solvers this package
already has:

| Wolfram `Method`   | solver                                    |
| ------------------ | ----------------------------------------- |
| `"QuasiNewton"`    | `gradient_methods.fmin_bfgs`              |
| `"ConjugateGradient"` | `gradient_methods.fmin_cg`             |
| `"Newton"`         | `gradient_methods.fmin_ncg`               |
| `"PrincipalAxis"`  | `powell.powell`                           |
| bounded, any method | `lbfgsb.fmin_l_bfgs_b`                   |
| constrained, any method | `cobyla.cobyla`                       |

`"PrincipalAxis"` is Wolfram's name for Brent's derivative-free direction-set
method, which is what `powell` implements. The remaining documented values —
`"Gradient"`, `"LevenbergMarquardt"`, `"InteriorPoint"` and
`"LinearProgramming"` — are rejected by name rather than silently redirected
to a different algorithm: `"LevenbergMarquardt"` only applies to sums of
squares (`find_fit` reaches `levenberg_marquardt` for that), and the last two
need a linear/interior-point solver this package does not have.

A variable given bounds is handled by `fmin_l_bfgs_b` whatever `Method` says,
because it is the only solver here that takes a box. That is a deviation from
Wolfram, which applies the requested method inside the box, and it is
recorded in `findminimum`'s docstring rather than hidden.

## The constrained form, `FindMinimum[{f, cons}, {x, x0}]`

Wolfram documents this pair exactly the way it documents `NMinimize[{f,
cons}, ...]` — `cons` is one relation/callable or a `List` of them — and
`Constraint`, `inequality`, `equality` and the normalization rule that reads
a raw `constraints` argument are shared with `nminimize.py` via
`constraint.py` rather than each module defining its own copy; see that
module's docstring for why a shared shape does not cost either engine its
separate lazy-load cache. What is genuinely different between the two
engines is how a constraint gets *enforced*, and for the *local* question
there is only one constrained solver in this package: `cobyla.cobyla`. So,
whatever `Method` asks for, a problem with any constraints runs on COBYLA in
full, exactly as a bounded problem always runs on `fmin_l_bfgs_b` above —
the same kind of deviation, recorded here rather than hidden, and for the
same reason: this module dispatches to the solvers it has, not to one
implementation per requested method.

* An equation `h(x) == 0` becomes the pair of inequalities `h(x) >= 0` and
  `-h(x) >= 0`, the same restatement `nminimize`'s COBYLA polish step uses,
  because COBYLA takes `g(x) >= 0` constraints only and that pair is the
  same feasible set exactly.
* A bounded variable's box has nowhere to go in `cobyla`'s signature — it
  takes no `bounds` argument — so each side becomes one more inequality
  (`x_i - low >= 0`, `high - x_i >= 0`) instead of being handed to
  `fmin_l_bfgs_b`, which cannot combine a box with general constraints
  anyway. A bounded, unconstrained problem is unaffected: it still runs on
  `fmin_l_bfgs_b`, unchanged from before this form existed.
* `Method` is still validated when constraints are present — an unknown or
  declined name still raises `ValueError` — even though the resolved method
  goes unused, matching the bounded case's validate-then-ignore precedent.
* COBYLA is derivative-free, so a `gradient` argument goes unused when
  constraints are present. That costs nothing this module promised: the
  gradient is only ever an opportunistic derivative computed from a
  symbolic objective by the caller in `wolfram.py`, not a value the caller
  asked to have honored.
* `tolerance` is read as both of COBYLA's own tolerances — `rhoend` (how
  small the trust region must shrink before the run is considered
  converged) and `catol` (how large a constraint violation the returned
  point may still carry) — since `findminimum` has only the one tolerance
  knob to offer both, the same overloading `tolerance` already gets for
  `"PrincipalAxis"` above.
* Wolfram's own default `Method` for a *constrained* `FindMinimum` is
  `"InteriorPoint"`, one of the values this module declines by name (see
  `_DECLINED_METHODS`) for lacking an interior-point solver. COBYLA is
  offered as this package's only local constrained solver, not as a claim
  to reproduce Wolfram's numbers or its choice of algorithm.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from .cobyla import cobyla
from .constraint import Constraint
from .constraint import EQUALITY as _EQUALITY
from .constraint import INEQUALITY as _INEQUALITY
from .constraint import equality, inequality
from .constraint import normalize_constraints as _normalize_constraints
from .gradient_methods import fmin_bfgs, fmin_cg, fmin_ncg
from .lbfgsb import fmin_l_bfgs_b
from .powell import powell

Objective = Callable[[Sequence[float]], float]
Gradient = Callable[[Sequence[float]], Sequence[float]]

_AUTOMATIC = "Automatic"
_QUASI_NEWTON = "QuasiNewton"
_CONJUGATE_GRADIENT = "ConjugateGradient"
_NEWTON = "Newton"
_PRINCIPAL_AXIS = "PrincipalAxis"

#: The `Method` values this module implements.
SUPPORTED_METHODS = (
    _AUTOMATIC,
    _QUASI_NEWTON,
    _CONJUGATE_GRADIENT,
    _NEWTON,
    _PRINCIPAL_AXIS,
)

#: Documented Wolfram `FindMinimum` methods this module deliberately declines,
#: each with the reason reported to the caller.
_DECLINED_METHODS = {
    "Gradient": "steepest descent is not implemented in this package",
    "LevenbergMarquardt": (
        "applies to sums of squares; use FindFit, which reaches levenberg_marquardt"
    ),
    "InteriorPoint": "needs an interior-point solver this package does not have",
    "LinearProgramming": "needs a linear-programming solver this package does not have",
}

#: Wolfram's default starting value for a variable given without one. The
#: `FindMinimum` reference page says the starting point is chosen
#: automatically; it does not say how, so this module states its choice
#: instead of claiming to reproduce one.
_DEFAULT_START = 0.0


@dataclass(frozen=True)
class LocalSpec:
    """One variable, where its search starts, and the box it may not leave.

    `low`/`high` are `None` when that side is unbounded, matching the
    `bounds` shape `fmin_l_bfgs_b` takes. `bounded` is true when either side
    is set, which is what selects the bounded solver.
    """

    variable: Any
    name: str
    start: float
    low: float | None = None
    high: float | None = None

    @property
    def bounded(self) -> bool:
        """Whether this variable constrains the search on either side."""
        return self.low is not None or self.high is not None


@dataclass(frozen=True)
class LocalResult:
    """The outcome of a local minimization.

    The shape follows `GlobalResult` in this package — `x`/`fun`/
    `iterations`/`function_calls`/`converged`/`flag` — minus `seed`, which
    only the stochastic global methods have any use for. `flag` is the
    underlying solver's own status wording, so a caller can tell a converged
    run from one that ran out of iterations.
    """

    x: list[float]
    fun: float
    iterations: int
    function_calls: int
    converged: bool
    flag: str


def _bound_constraints(specs: Sequence[LocalSpec]) -> list[Objective]:
    """Restate every variable's box as `g(x) >= 0` inequalities for COBYLA.

    `cobyla.cobyla` has no `bounds` parameter, so a bounded variable in a
    constrained problem is folded in here instead of being routed to
    `fmin_l_bfgs_b`, which cannot combine a box with general constraints;
    see the module docstring.
    """
    result: list[Objective] = []
    for index, spec in enumerate(specs):
        if spec.low is not None:

            def lower(point: Sequence[float], index=index, low=spec.low) -> float:
                return point[index] - low

            result.append(lower)
        if spec.high is not None:

            def upper(point: Sequence[float], index=index, high=spec.high) -> float:
                return high - point[index]

            result.append(upper)
    return result


def _cobyla_constraints(
    constraints: Sequence[Constraint], specs: Sequence[LocalSpec]
) -> list[Objective]:
    """Restate `constraints` and every box as the inequalities COBYLA accepts.

    `g(x) >= 0` passes through unchanged; an equality `h(x) == 0` becomes the
    pair `h(x) >= 0` and `-h(x) >= 0` — the same set exactly, and the same
    restatement `nminimize`'s COBYLA polish step already uses.
    """
    result: list[Objective] = []
    for constraint in constraints:
        result.append(constraint.function)
        if constraint.kind == _EQUALITY:
            result.append(_negated(constraint.function))
    result.extend(_bound_constraints(specs))
    return result


def _negated(f: Objective) -> Objective:
    """Return `-f`, so a maximization can run on a minimizer."""

    def negative(point: Sequence[float]) -> float:
        return -f(point)

    return negative


def _negated_gradient(g: Gradient) -> Gradient:
    """Return `-grad f`, matching `_negated`."""

    def negative(point: Sequence[float]) -> list[float]:
        return [-component for component in g(point)]

    return negative


def _method_for(method: str) -> str:
    """Resolve `Automatic` and reject the methods this module declines."""
    if method in _DECLINED_METHODS:
        raise ValueError(
            "Method %r is not supported: %s" % (method, _DECLINED_METHODS[method])
        )
    if method not in SUPPORTED_METHODS:
        raise ValueError(
            "unknown Method %r; expected one of %s"
            % (method, ", ".join(repr(name) for name in SUPPORTED_METHODS))
        )
    if method != _AUTOMATIC:
        return method
    # Wolfram's own default for a smooth problem is a quasi-Newton step. A
    # bounded problem never reaches this value: the caller routes any box to
    # `fmin_l_bfgs_b` before consulting the resolved method.
    return _QUASI_NEWTON


def findminimum(
    objective: Objective,
    variables: Sequence[LocalSpec],
    *,
    constraints: Sequence[Constraint | Objective] | None = None,
    gradient: Gradient | None = None,
    method: str = _AUTOMATIC,
    max_iterations: int | None = None,
    tolerance: float = 1e-6,
    maximize: bool = False,
) -> LocalResult:
    """Walk downhill from the given starting point, Wolfram `FindMinimum`-style.

    Args:
        objective: The function to minimize, taking one sequence of `d`
            coordinates and returning a float.
        variables: One `LocalSpec` per variable, in coordinate order,
            carrying that variable's starting value and optional box.
        constraints: Optional `Constraint` values, Wolfram's `FindMinimum[{f,
            cons}, ...]`; a bare callable `g` is read as the inequality
            `g(x) >= 0`, matching `nminimize`. Any constraints route the
            whole problem to `cobyla.cobyla` regardless of `method` or a
            variable's own box — see the module docstring's "constrained
            form" section for exactly how and why.
        gradient: `grad objective`, or `None` to let the solver approximate
            it by forward differences. `Method -> "Newton"` requires one:
            `fmin_ncg` has no finite-difference fallback, so a `None`
            gradient is rejected here by name rather than failing inside the
            solver. Unused when `constraints` is given: COBYLA is
            derivative-free.
        method: One of `SUPPORTED_METHODS`. A bounded problem always runs on
            `fmin_l_bfgs_b`, and a constrained problem always runs on
            `cobyla.cobyla`, both regardless of this argument — the module
            docstring's recorded deviations from Wolfram. Still validated
            either way: an unknown or declined name still raises.
        max_iterations: Wolfram's `MaxIterations`, or `None` for each
            solver's own default.
        tolerance: The gradient tolerance for the derivative-based methods,
            the step/value tolerance for `PrincipalAxis`, and — when
            `constraints` is given — both `cobyla`'s `rhoend` and its
            `catol`.
        maximize: Minimize `-objective` and report the maximum instead, so
            `FindMaximum` shares this code path exactly.

    Returns:
        A `LocalResult`. `fun` is already un-negated for `maximize`, so it is
        the value of the original objective at `x` in both cases.
    """
    specs = list(variables)
    if not specs:
        raise ValueError("findminimum needs at least one variable")

    start = [float(spec.start) for spec in specs]
    rules = _normalize_constraints(constraints)
    bounded = any(spec.bounded for spec in specs)
    chosen = _method_for(method)

    f = _negated(objective) if maximize else objective
    g: Gradient | None = None
    if gradient is not None:
        g = _negated_gradient(gradient) if maximize else gradient

    if rules:
        answer = cobyla(
            f,
            start,
            _cobyla_constraints(rules, specs),
            rhoend=tolerance,
            catol=tolerance,
            **({} if max_iterations is None else {"maxfun": max_iterations}),
        )
        result = LocalResult(
            x=[float(value) for value in answer.x],
            fun=float(answer.fun),
            iterations=int(answer.iterations),
            function_calls=int(answer.function_calls),
            converged=bool(answer.converged),
            flag=str(answer.flag),
        )
    elif bounded:
        bounds = [(spec.low, spec.high) for spec in specs]
        answer = fmin_l_bfgs_b(
            f,
            start,
            fprime=g,
            bounds=bounds,
            pgtol=tolerance,
            **({} if max_iterations is None else {"maxiter": max_iterations}),
        )
        result = LocalResult(
            x=[float(value) for value in answer.x],
            fun=float(answer.fun),
            iterations=int(answer.iterations),
            function_calls=int(answer.function_calls),
            converged=bool(answer.converged),
            flag=str(answer.flag),
        )
    elif chosen == _PRINCIPAL_AXIS:
        answer = powell(
            f,
            start,
            xtol=tolerance,
            ftol=tolerance,
            maxiter=max_iterations,
        )
        result = LocalResult(
            x=[float(value) for value in answer.x],
            fun=float(answer.fun),
            iterations=int(answer.iterations),
            function_calls=int(answer.function_calls),
            converged=bool(answer.converged),
            flag=str(answer.flag),
        )
    else:
        if chosen == _NEWTON and g is None:
            raise ValueError(
                'Method -> "Newton" needs a gradient: fmin_ncg has no '
                "forward-difference fallback"
            )
        solver = {
            _QUASI_NEWTON: fmin_bfgs,
            _CONJUGATE_GRADIENT: fmin_cg,
            _NEWTON: fmin_ncg,
        }[chosen]
        answer = solver(
            f,
            start,
            fprime=g,
            **({} if max_iterations is None else {"maxiter": max_iterations}),
            **({"gtol": tolerance} if chosen != _NEWTON else {"avextol": tolerance}),
        )
        result = LocalResult(
            x=[float(value) for value in answer.x],
            fun=float(answer.fun),
            iterations=int(answer.nit),
            function_calls=int(answer.nfev),
            converged=bool(answer.success),
            flag=str(answer.message),
        )

    if maximize:
        return LocalResult(
            x=result.x,
            # `+ 0.0` is identity on every float except `-0.0`, which it
            # normalizes to `0.0`. Without it a maximum of zero is reported as
            # `-0.0`, an artefact of minimizing `-objective` that Wolfram never
            # shows.
            fun=-result.fun + 0.0,
            iterations=result.iterations,
            function_calls=result.function_calls,
            converged=result.converged,
            flag=result.flag,
        )
    return result
