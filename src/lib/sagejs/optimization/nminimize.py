"""The Wolfram `NMinimize` engine: initial regions, dispatch, and penalties.

Wolfram's `NMinimize` is not itself an algorithm. It coordinates: it decides
*which* global method to run, hands that method a rectangular initial
region, and folds the constraints into the objective as penalties. This
module is that coordinator, sitting on top of `nelder_mead`,
`differential_evolution`, `simulated_annealing` and `random_search`.

The user-facing builtins (`NMinimize`, `NMaximize`, `NArgMin`, `NArgMax`,
`NMinValue`, `NMaxValue`) live in the polyglot `wolfram` module, which
converts symbolic objectives and rule-shaped results. Everything here is
plain numeric Python: an objective is a callable of one coordinate sequence,
and the answer is a `GlobalResult`.

## The initial region

From the tutorial *Constrained Optimization: Global Numerical*, verbatim:

> "The initial region is specified by giving each variable a finite upper
> and lower bound. This is done by including `a <= x <= b` in the
> constraints, or `{x, a, b}` in the variables. If both are given, the
> bounds in the variables are used for the initial region, and the
> constraints are just used as constraints. **If no initial region is
> specified for a variable x, the default initial region of `-1 <= x <= 1`
> is used.**"

`_normalize_variables` does exactly that; the separate `bounds` argument is
an already-extracted region for a caller that computed one, and overrides
both. The region is *not* a constraint — nothing here clips an answer back
into the box, because the documentation keeps the sampling box and the
feasible set distinct.

## Method dispatch

The method names are Wolfram's own strings: `"NelderMead"`,
`"DifferentialEvolution"`, `"SimulatedAnnealing"`, `"RandomSearch"`, and
`"Automatic"`. The convex and commercial methods (`"Convex"`, `"MOSEK"`,
`"Gurobi"`, `"Xpress"`, `"Couenne"`) are third-party libraries Wolfram
links, so they are rejected by name.

Automatic selection, verbatim from the same tutorial:

> "With the default method, NMinimize picks which method to use based on the
> type of problem. If the objective function and constraints are linear,
> `LinearOptimization` is used. If there are integer variables, or if the
> head of the objective function is not a numeric function, differential
> evolution is used. For everything else, it uses Nelder-Mead, but if
> Nelder-Mead does poorly, it switches to differential evolution."

Linearity detection needs the modelling language Wolfram parses and Sage.js
does not, so that first branch is absent; the rest is implemented literally.
Two of its predicates are stated qualitatively, and the definitions below
are **our documented choices**, not published Wolfram behaviour:

* *"the head of the objective function is not a numeric function"* — the
  objective is evaluated once at the centre of the initial region, and
  counts as non-numeric when that call raises, returns something `float()`
  rejects, or returns NaN. The probe's one call is included in
  `function_calls`.
* *"if Nelder-Mead does poorly"* — the Nelder-Mead run did poorly when
  **any** of these holds: (1) it did not converge, (2) its best value is NaN
  or infinite, (3) its best point left the initial region by more than
  `tolerance` in some coordinate, or (4) its best point violates a
  constraint by more than `tolerance`. Differential evolution is then run
  as well, the better of the two answers is returned with `":de-fallback"`
  appended to its `flag`, and both runs' `function_calls` are summed.
  Wolfram publishes no threshold here, so no implementation can match its
  numbers; these four tests fire exactly when the Nelder-Mead answer would
  be reported as a non-answer anyway.

## Constraints

> "Constraints are generally enforced by adding penalties when points leave
> the feasible region."

A `Constraint` is an inequality `g(x) >= 0` or an equality `h(x) == 0`. Its
*violation* is `max(0, -g(x))` or `abs(h(x))` respectively, and a NaN
constraint value counts as an infinite violation, so a point where a
constraint cannot be evaluated is never mistaken for a feasible one. The
method actually sees

```text
penalized(x) = f(x) + weight * sum_j violation_j(x) ** 2
weight = penalty_scale / tolerance ** 2
```

Wolfram shapes this with the sub-option `"PenaltyFunction"`, whose
`Automatic` value is printed nowhere in the documentation; the docs note
only that a user penalty is `Function[{d, i}, ...]` of the violation and the
iteration number, and that the default "doubles every tenth iteration". No
method here passes an iteration number to its objective, so an
iteration-dependent penalty cannot be expressed and the penalty above is
static — **our documented choice**, and the reason `"PenaltyFunction"` is
rejected rather than silently ignored.

A static quadratic penalty is a *soft* one: its minimizer sits outside the
feasible set by an amount shrinking like `1 / weight`. Deriving `weight`
from `tolerance` is how the default stays stiff enough to be useful without
an iteration counter — a violation exactly at the feasibility tolerance
costs one unit of objective, and a tighter `tolerance` automatically buys a
stiffer penalty. `penalty_scale` multiplies that weight, and is the knob to
raise when the objective's own scale dwarfs it.

`tolerance` doubles as Wolfram's `"Tolerance"`, "tolerance for accepting
constraint violations": the winning point is feasible when its largest
violation is at most `tolerance`. An infeasible answer is still returned —
with its true objective value, so the caller can see how close it came — but
`converged` is `False` and `":infeasible"` is appended to `flag`.

## Post-processing

> "PostProcess — whether to post-process using local search methods"

Wolfram lists that sub-option, with default `Automatic`, on all four
heuristic methods, and nowhere publishes what `Automatic` decides. The
policy below is therefore **ours**, stated so it can be argued with:

* `Automatic` means *on*. Every accepted value is polished by a local
  method started at the point the global method returned.
* The polish is `nelder_mead` when the problem has no constraints, and
  `cobyla` when it has any, so that a constrained polish moves under the
  constraints themselves rather than under a soft penalty and cannot walk
  out of the feasible region on its way to a lower objective.
* An equality constraint `h(x) == 0` is handed to `cobyla` as the pair
  `h(x) >= 0` and `-h(x) >= 0`; COBYLA takes inequalities only, and the
  pair is the same set exactly.
* The polish is asked for a tolerance `0.01 * tolerance` — a hundred times
  tighter than the run — because its whole job is to turn "in the right
  basin" into "at the bottom of it". That tightening applies to
  feasibility too (it is `cobyla`'s `catol`): the acceptance rule below
  calls anything within `tolerance` feasible, so a polish held only to
  `tolerance` would be free to spend the entire feasibility margin buying
  objective, and would hand back an answer sitting exactly on the edge of
  what counts as feasible.
* The polished point replaces the global one only if it *wins*: it must
  stay inside the initial region (within `tolerance`), and it must be
  better under the ordering used everywhere else here — feasible beats
  infeasible, then smaller worst violation between two infeasible points,
  then smaller objective, and NaN never wins. A polish that made things
  worse is discarded and the global answer is returned untouched.
* Because the region test is part of that rule, a polish that escapes the
  initial region is discarded rather than clipped: the global methods
  searched only that region and the answer stays in it.
* Every evaluation the polish spends is added to `function_calls`,
  including the ones spent on a polish that was then discarded.
* `":polished"` is appended to `flag` exactly when the polished point did
  replace the global one. A polish never changes `converged`, which keeps
  reporting how the *global* run stopped.
* `"PostProcess" -> False` skips all of this, and reproduces the
  unpolished answer bit for bit.

A variable declared over `Integers` is rounded before the polish's
objective sees it too, exactly as during the run, so the polish walks the
same lattice the answer lives on; it usually finds nothing better than the
cell it started in, and then costs only the evaluations it spent looking.

The one case where the polish is nearly free of effect by construction is
`"RandomSearch"`, whose local phase already runs a local method from every
start: its answer is a converged local minimum before post-processing ever
sees it.

## Integer variables

A variable declared over `"Integers"` has its coordinate rounded to the
nearest integer (halves away from zero rather than to even, so the rule is
monotone and sign-symmetric) before the objective or any constraint sees it,
and the reported `x` carries the rounded value. **Our documented choice**:
Wolfram's integer handling is part of its unpublished modelling layer.

## Reported values

`fun` is always the *original* objective's value at the reported point —
neither penalized nor negated, so a `maximize=True` run reports the maximum
itself. That costs one extra evaluation after the method finishes, counted
in `function_calls`. `flag`, `iterations` and `seed` come from the
underlying method.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, cast

from .cobyla import cobyla
from .differential_evolution import differential_evolution
from .global_result import GlobalResult
from .nelder_mead import nelder_mead
from .random_search import random_search
from .simulated_annealing import simulated_annealing

Objective = Callable[[Sequence[float]], float]
"""An objective or constraint function: one coordinate sequence to a float."""

_INFINITY = float("inf")
"""IEEE `+inf`; the Sage.js `math` module has no `math.inf` attribute."""

_DEFAULT_LOW = -1.0
"""Wolfram's documented default initial region is `-1 <= x <= 1`."""

_DEFAULT_HIGH = 1.0
"""The upper half of that same documented default initial region."""

_DEFAULT_MAX_ITERATIONS = 100
"""The only published numeric `MaxIterations` for `NMinimize` (v4 package)."""

_INEQUALITY = "inequality"
"""`Constraint.kind` for `g(x) >= 0`."""

_EQUALITY = "equality"
"""`Constraint.kind` for `h(x) == 0`."""

_AUTOMATIC = "Automatic"
"""Wolfram's `Method -> Automatic`, the default selection rule."""

_REJECTED_METHODS = ("Convex", "MOSEK", "Gurobi", "Xpress", "Couenne")
"""Documented `NMinimize` methods backed by libraries Sage.js does not link."""

_POST_PROCESS = "PostProcess"
"""Wolfram's sub-option asking for a local-search polish of the answer."""

_SHARED_OPTIONS = (_POST_PROCESS, "RandomSeed", "Tolerance")
"""Method sub-options every method's table lists, handled before dispatch."""

_UNSUPPORTED_OPTIONS = ("PenaltyFunction",)
"""Sub-options whose `Automatic` behaviour Wolfram never publishes."""

_POLISHED = ":polished"
"""Appended to `flag` when a polished point replaced the global answer."""

_POLISH_TOLERANCE_SCALE = 0.01
"""The polish is run at this multiple of the requested `tolerance`."""

_POLISH_RADIUS_SCALE = 0.1
"""COBYLA's initial trust radius, as a fraction of the widest region side."""

_OPTION_KEYWORDS: dict[str, dict[str, str]] = {
    "NelderMead": {
        "ContractRatio": "contract",
        "ExpandRatio": "expand",
        "InitialPoints": "initial_simplex",
        "ReflectRatio": "reflect",
        "ShrinkRatio": "shrink",
    },
    "DifferentialEvolution": {
        "CrossProbability": "cross_probability",
        "InitialPoints": "initial_points",
        "ScalingFactor": "scaling_factor",
        "SearchPoints": "search_points",
    },
    "SimulatedAnnealing": {
        "BoltzmannExponent": "boltzmann_exponent",
        "InitialPoints": "initial_points",
        "LevelIterations": "level_iterations",
        "PerturbationScale": "perturbation_scale",
        "SearchPoints": "search_points",
    },
    "RandomSearch": {
        "InitialPoints": "initial_points",
        "Method": "local_method",
        "SearchPoints": "search_points",
    },
}
"""Wolfram method sub-option names mapped onto this package's keywords."""


@dataclass(frozen=True)
class VariableSpec:
    """One optimization variable and the initial region it is searched in.

    `variable` is whatever the caller named the variable with — a string, a
    symbolic variable, anything — and is carried through untouched so that a
    caller building `x -> xmin` rules can pair values back with the objects
    it started from. `name` is `str(variable)`, computed once. `low` and
    `high` bound the rectangular initial region (`-1.0` and `1.0` when the
    caller gave none), and `integer` marks a variable declared over
    Wolfram's `Integers` domain.
    """

    variable: Any
    name: str
    low: float
    high: float
    integer: bool


@dataclass(frozen=True)
class Constraint:
    """One constraint, either `g(x) >= 0` or `h(x) == 0`.

    `kind` is `"inequality"` or `"equality"`; build instances with
    `inequality` and `equality` rather than spelling the strings out.
    `function` maps a coordinate sequence to the constraint's value.
    """

    kind: str
    function: Objective


def inequality(g: Objective) -> Constraint:
    """Return the constraint `g(x) >= 0`."""
    return Constraint(kind=_INEQUALITY, function=g)


def equality(h: Objective) -> Constraint:
    """Return the constraint `h(x) == 0`."""
    return Constraint(kind=_EQUALITY, function=h)


def nminimize(
    objective: Objective,
    variables: Sequence[Any],
    bounds: Sequence[tuple[float, float]] | None = None,
    constraints: Sequence[Any] | None = None,
    *,
    method: str = _AUTOMATIC,
    method_options: dict[str, Any] | None = None,
    max_iterations: int | None = None,
    tolerance: float = 0.001,
    seed: int = 0,
    penalty_scale: float = 1.0,
    maximize: bool = False,
) -> GlobalResult:
    """Search for a global minimum of `objective`, Wolfram `NMinimize`-style.

    Args:
        objective: The function to minimize, taking one sequence of `d`
            coordinates and returning a float.
        variables: One entry per variable, in coordinate order. An entry is
            a `VariableSpec`; a `(variable, low, high)` triple giving that
            variable's initial region; a `(variable, low, high, domain)`
            quadruple whose `domain` is `"Reals"` or `"Integers"`; a
            one-element sequence; or a bare variable, which takes the
            documented default region `-1 <= x <= 1`.
        bounds: Optional `(low, high)` pairs, one per variable, replacing
            every region taken from `variables`. This is the already-
            extracted initial region for a caller that computed it itself.
        constraints: Optional `Constraint` values; a bare callable `g` is
            read as the inequality `g(x) >= 0`. Enforced by the penalty
            transformation described in the module docstring, never by
            clipping.
        method: `"Automatic"` (the default), `"NelderMead"`,
            `"DifferentialEvolution"`, `"SimulatedAnnealing"` or
            `"RandomSearch"`.
        method_options: Wolfram method sub-options by their documented
            string names, for example `{"ScalingFactor": 1.0}`. Three names
            are shared by every method's table and are read here rather than
            forwarded: `"RandomSeed"` overrides `seed`, `"Tolerance"`
            overrides `tolerance`, and `"PostProcess"` (`True`, `False` or
            `"Automatic"`, the default, which means `True`) turns the local
            polish described in the module docstring on or off. Only those
            three may be given when `method` is `"Automatic"`, since the
            method is not yet chosen.
        max_iterations: Iteration budget for the chosen method; `None` uses
            `100`, the only published numeric default.
        tolerance: Both the method's convergence tolerance and Wolfram's
            `"Tolerance"`, the largest constraint violation still accepted
            as feasible.
        seed: Seed for every random draw the chosen method makes, Wolfram's
            `"RandomSeed"`. Echoed back on the result.
        penalty_scale: Multiplies the penalty weight, which is
            `penalty_scale / tolerance ** 2`; see the module docstring.
        maximize: When `True`, minimize `-objective` and report the original
            objective's value — this is exactly what `NMaximize` is.

    Returns:
        A `GlobalResult` whose `x` is the best point found (with integer
        coordinates rounded) and whose `fun` is the *original* objective's
        value there. `converged` additionally requires the point to be
        feasible within `tolerance`; see the module docstring for the `flag`
        vocabulary.

    Raises:
        ValueError: If `variables` is empty, a variable's region is
            non-finite or inverted, `bounds` has the wrong length, a domain,
            method name or `"PostProcess"` value is not one of the
            documented ones, or a method sub-option does not appear in that
            method's option table.
        NotImplementedError: For `"PenaltyFunction"`, whose `Automatic`
            behaviour Wolfram does not publish, and for the convex and
            commercial methods.
        TypeError: If a constraint is neither a `Constraint` nor a callable.
    """
    specs = _normalize_variables(variables, bounds)
    rules = _normalize_constraints(constraints)
    options = method_options if method_options is not None else {}

    if "RandomSeed" in options:
        seed = int(options["RandomSeed"])
    if "Tolerance" in options:
        tolerance = float(options["Tolerance"])
    polish = _wants_post_process(options)
    limit = _DEFAULT_MAX_ITERATIONS if max_iterations is None else int(max_iterations)

    box = [(spec.low, spec.high) for spec in specs]
    flags = [spec.integer for spec in specs]
    penalized = _penalized_objective(
        objective,
        flags,
        rules,
        _penalty_weight(float(penalty_scale), tolerance),
        bool(maximize),
    )

    if method == _AUTOMATIC:
        if len(options) > len(_present_shared(options)):
            raise ValueError(
                "`Method -> Automatic` takes no method sub-options; name a "
                "method before setting them"
            )
        outcome, extra = _run_automatic(
            objective, penalized, box, flags, rules, limit, tolerance, seed
        )
    elif method in _OPTION_KEYWORDS:
        keywords = _method_keywords(method, options)
        outcome = _run_method(method, penalized, box, limit, tolerance, seed, keywords)
        extra = 0
    elif method in _REJECTED_METHODS:
        raise NotImplementedError(
            "NMinimize method %r is a third-party or convex-only solver that "
            "Sage.js does not link" % (method,)
        )
    else:
        raise ValueError("unknown NMinimize method %r" % (method,))

    if polish:
        outcome = _post_process(
            objective, outcome, box, flags, rules, limit, tolerance, bool(maximize)
        )

    return _finish(objective, outcome, flags, rules, tolerance, seed, extra)


def _present_shared(options: dict[str, Any]) -> list[str]:
    """Return the `_SHARED_OPTIONS` names actually present in `options`."""
    return [name for name in _SHARED_OPTIONS if name in options]


def _normalize_constraints(constraints: Sequence[Any] | None) -> list[Constraint]:
    """Coerce `constraints` into `Constraint` values, a callable meaning `g >= 0`."""
    if constraints is None:
        return []
    result: list[Constraint] = []
    for index in range(len(constraints)):
        entry = constraints[index]
        if isinstance(entry, Constraint):
            if entry.kind != _INEQUALITY and entry.kind != _EQUALITY:
                raise ValueError(
                    "constraint %d has kind %r, expected %r or %r"
                    % (index, entry.kind, _INEQUALITY, _EQUALITY)
                )
            result.append(entry)
        elif callable(entry):
            result.append(inequality(cast(Objective, entry)))
        else:
            raise TypeError(
                "constraint %d must be a `Constraint` or a callable `g` read "
                "as `g(x) >= 0`" % (index,)
            )
    return result


def _normalize_variables(
    variables: Sequence[Any],
    bounds: Sequence[tuple[float, float]] | None,
) -> list[VariableSpec]:
    """Build one `VariableSpec` per variable, applying the documented defaults."""
    if len(variables) == 0:
        raise ValueError("`variables` must name at least one variable")

    specs = [_variable_spec(variables[index], index) for index in range(len(variables))]

    if bounds is not None:
        if len(bounds) != len(specs):
            raise ValueError(
                "`bounds` has %d entries but there are %d variables"
                % (len(bounds), len(specs))
            )
        specs = [
            VariableSpec(
                variable=spec.variable,
                name=spec.name,
                low=float(pair[0]),
                high=float(pair[1]),
                integer=spec.integer,
            )
            for spec, pair in zip(specs, bounds, strict=True)
        ]

    for index in range(len(specs)):
        spec = specs[index]
        if not math.isfinite(spec.low) or not math.isfinite(spec.high):
            raise ValueError(
                "variable %d (%s) has a non-finite initial region; Wolfram "
                "requires a finite upper and lower bound" % (index, spec.name)
            )
        if spec.low > spec.high:
            raise ValueError(
                "variable %d (%s) has an inverted initial region %r > %r"
                % (index, spec.name, spec.low, spec.high)
            )
    return specs


def _variable_spec(entry: Any, index: int) -> VariableSpec:
    """Read one `variables` entry in any of its documented shapes."""
    if isinstance(entry, VariableSpec):
        return entry
    if isinstance(entry, (list, tuple)):
        values = list(entry)
        if len(values) == 1:
            return _spec(values[0], _DEFAULT_LOW, _DEFAULT_HIGH, False)
        if len(values) == 3:
            return _spec(values[0], float(values[1]), float(values[2]), False)
        if len(values) == 4:
            return _spec(
                values[0],
                float(values[1]),
                float(values[2]),
                _integer_domain(values[3], index),
            )
        raise ValueError(
            "variable %d has %d elements; expected a bare variable, "
            "`(variable,)`, `(variable, low, high)` or "
            "`(variable, low, high, domain)`" % (index, len(values))
        )
    return _spec(entry, _DEFAULT_LOW, _DEFAULT_HIGH, False)


def _spec(variable: Any, low: float, high: float, integer: bool) -> VariableSpec:
    """Build a `VariableSpec`, deriving `name` from `variable` once."""
    return VariableSpec(
        variable=variable,
        name=str(variable),
        low=low,
        high=high,
        integer=integer,
    )


def _integer_domain(domain: Any, index: int) -> bool:
    """Return whether `domain` is Wolfram's `Integers`, rejecting anything else."""
    if domain == "Integers":
        return True
    if domain == "Reals":
        return False
    raise ValueError(
        "variable %d has domain %r; only 'Reals' and 'Integers' are "
        "supported" % (index, domain)
    )


def _snap(point: Sequence[float], flags: Sequence[bool]) -> list[float]:
    """Round every integer-declared coordinate, leaving the rest untouched.

    Halves go away from zero (`floor(v + 0.5)` above zero, `ceil(v - 0.5)`
    below it) rather than to even, so the rule is monotone and symmetric —
    see the module docstring.
    """
    result: list[float] = []
    for value, integral in zip(point, flags, strict=True):
        number = float(value)
        if not integral or math.isnan(number) or not math.isfinite(number):
            result.append(number)
        elif number < 0.0:
            result.append(float(math.ceil(number - 0.5)))
        else:
            result.append(float(math.floor(number + 0.5)))
    return result


def _violations(
    constraints: Sequence[Constraint], point: Sequence[float]
) -> list[float]:
    """Return each constraint's violation at `point`, NaN counting as infinite."""
    amounts: list[float] = []
    for constraint in constraints:
        value = float(constraint.function(point))
        if math.isnan(value):
            amounts.append(_INFINITY)
        elif constraint.kind == _EQUALITY:
            amounts.append(abs(value))
        elif value < 0.0:
            amounts.append(-value)
        else:
            amounts.append(0.0)
    return amounts


def _worst_violation(
    constraints: Sequence[Constraint], point: Sequence[float]
) -> float:
    """Return the largest violation at `point`, or `0.0` with no constraints."""
    worst = 0.0
    for amount in _violations(constraints, point):
        if amount > worst:
            worst = amount
    return worst


def _penalized_objective(
    objective: Objective,
    flags: Sequence[bool],
    constraints: Sequence[Constraint],
    weight: float,
    maximize: bool,
) -> Objective:
    """Wrap `objective` with integer rounding, negation, and constraint penalties.

    `weight` is the already-resolved penalty weight from `_penalty_weight`,
    not the caller's `penalty_scale`.
    """
    sign = -1.0 if maximize else 1.0

    def evaluate(point: Sequence[float]) -> float:
        snapped = _snap(point, flags)
        value = sign * float(objective(snapped))
        if len(constraints) == 0:
            return value
        penalty = 0.0
        for amount in _violations(constraints, snapped):
            penalty += amount * amount
        return value + weight * penalty

    return evaluate


def _penalty_weight(penalty_scale: float, tolerance: float) -> float:
    """Resolve the multiplier on the sum of squared constraint violations.

    The weight is `penalty_scale / tolerance ** 2`, so a violation sitting
    exactly at the feasibility tolerance costs one unit of objective and
    anything worse costs quadratically more. This is **our documented
    choice** and the reason `penalty_scale` defaults to a plain `1.0`
    without leaving the default penalty uselessly soft: Wolfram's own
    default doubles every tenth iteration and so ends up stiff, but nothing
    here can see an iteration number (see the module docstring). Tying the
    weight to `tolerance` also keeps the two settings consistent — asking
    for a tighter feasibility tolerance automatically buys a stiffer
    penalty. A non-positive `tolerance` leaves the weight at
    `penalty_scale`, since there is then no scale to derive one from.
    """
    if tolerance <= 0.0:
        return penalty_scale
    return penalty_scale / (tolerance * tolerance)


def _method_keywords(method: str, options: dict[str, Any]) -> dict[str, Any]:
    """Translate Wolfram sub-option names into this package's keyword names.

    `"RandomSearch"`'s nested `Method` is the one sub-option whose Wolfram
    values are strings (`Automatic` or `"InteriorPoint"`). No interior-point
    solver exists in this package, so a string is rejected by name; the
    keyword takes a callable satisfying `random_search`'s `LocalMethod`
    contract instead.
    """
    keywords = _OPTION_KEYWORDS[method]
    translated: dict[str, Any] = {}
    for name in options:
        if name in _SHARED_OPTIONS:
            continue
        if name in _UNSUPPORTED_OPTIONS:
            raise NotImplementedError(
                "method sub-option %r is not implemented: Wolfram never "
                "publishes its `Automatic` behaviour" % (name,)
            )
        if name not in keywords:
            raise ValueError("method %r has no sub-option %r" % (method, name))
        value = options[name]
        if keywords[name] == "local_method" and isinstance(value, str):
            raise NotImplementedError(
                "the nested local method %r is not implemented; pass a "
                "callable local method instead" % (value,)
            )
        translated[keywords[name]] = value
    return translated


def _centre(box: Sequence[tuple[float, float]]) -> list[float]:
    """Return the centre point of the rectangular initial region."""
    return [(low + high) / 2.0 for low, high in box]


def _region_simplex(box: Sequence[tuple[float, float]]) -> list[list[float]]:
    """Build a starting simplex spanning half of the initial region.

    Vertex `0` is the region's centre and vertex `k + 1` is that centre with
    coordinate `k` pushed out to the region's upper bound. This is **our
    choice**, not a published one: `nelder_mead`'s own default simplex
    scales each coordinate by `1.05` and replaces a zero coordinate by
    `0.00025`, which on the documented default region `-1 <= x <= 1`
    (centre `0`) would start the search inside a box a ten-thousandth of the
    region's width. Spanning the region instead keeps the first simplex
    proportional to the area the caller actually asked to search. A
    coordinate pinned by `low == high` yields a vertex equal to the centre,
    leaving that coordinate fixed for the whole run.
    """
    centre = _centre(box)
    simplex = [list(centre)]
    for index in range(len(box)):
        vertex = list(centre)
        high = box[index][1]
        if high > centre[index]:
            vertex[index] = high
        simplex.append(vertex)
    return simplex


def _run_nelder_mead(
    f: Objective,
    box: Sequence[tuple[float, float]],
    limit: int,
    tolerance: float,
    seed: int,
    keywords: dict[str, Any],
) -> GlobalResult:
    """Run `nelder_mead` over the initial region and restate it as a `GlobalResult`."""
    if "initial_simplex" not in keywords:
        keywords["initial_simplex"] = _region_simplex(box)
    outcome = nelder_mead(
        f,
        _centre(box),
        xatol=tolerance,
        fatol=tolerance,
        maxiter=limit,
        **keywords,
    )
    return GlobalResult(
        x=list(outcome.x),
        fun=outcome.fun,
        iterations=outcome.iterations,
        function_calls=outcome.function_calls,
        converged=outcome.converged,
        flag=outcome.flag,
        seed=seed,
    )


def _run_method(
    method: str,
    f: Objective,
    box: Sequence[tuple[float, float]],
    limit: int,
    tolerance: float,
    seed: int,
    keywords: dict[str, Any],
) -> GlobalResult:
    """Dispatch to one named heuristic method with its translated keywords."""
    if method == "NelderMead":
        return _run_nelder_mead(f, box, limit, tolerance, seed, keywords)
    if method == "DifferentialEvolution":
        return differential_evolution(
            f,
            box,
            max_iterations=limit,
            tolerance=tolerance,
            seed=seed,
            **keywords,
        )
    if method == "SimulatedAnnealing":
        return simulated_annealing(
            f,
            box,
            max_iterations=limit,
            tolerance=tolerance,
            seed=seed,
            **keywords,
        )
    return random_search(
        f,
        box,
        max_iterations=limit,
        tolerance=tolerance,
        seed=seed,
        **keywords,
    )


def _is_numeric_objective(objective: Objective, point: Sequence[float]) -> bool:
    """Probe `objective` once: is its head a numeric function, in Wolfram's phrase?

    See the module docstring — this predicate is our definition of a
    qualitative Wolfram one. A call that raises, returns something `float()`
    rejects, or returns NaN means "not numeric", and automatic selection
    then picks differential evolution exactly as documented.
    """
    try:
        value = float(objective(point))
    except Exception:
        return False
    return not math.isnan(value)


def _did_poorly(
    outcome: GlobalResult,
    box: Sequence[tuple[float, float]],
    constraints: Sequence[Constraint],
    tolerance: float,
) -> bool:
    """Decide whether a Nelder-Mead run "does poorly" — our four documented tests."""
    if not outcome.converged:
        return True
    if math.isnan(outcome.fun) or not math.isfinite(outcome.fun):
        return True
    for value, pair in zip(outcome.x, box, strict=True):
        if value < pair[0] - tolerance or value > pair[1] + tolerance:
            return True
    return _worst_violation(constraints, outcome.x) > tolerance


def _better(candidate: GlobalResult, current: GlobalResult) -> bool:
    """Return whether `candidate` improves on `current`, NaN never winning."""
    if math.isnan(candidate.fun):
        return False
    if math.isnan(current.fun):
        return True
    return candidate.fun < current.fun


def _run_automatic(
    objective: Objective,
    penalized: Objective,
    box: Sequence[tuple[float, float]],
    flags: Sequence[bool],
    constraints: Sequence[Constraint],
    limit: int,
    tolerance: float,
    seed: int,
) -> tuple[GlobalResult, int]:
    """Apply Wolfram's documented automatic selection; see the module docstring.

    Returns the chosen run together with the number of extra objective
    calls automatic selection itself spent (the numeric probe, plus a whole
    discarded Nelder-Mead run when the fallback fires).
    """
    centre = _centre(box)
    extra = 0

    integral = False
    for value in flags:
        if value:
            integral = True

    if not integral:
        extra += 1
        if not _is_numeric_objective(objective, _snap(centre, flags)):
            integral = True

    if integral:
        return differential_evolution(
            penalized, box, max_iterations=limit, tolerance=tolerance, seed=seed
        ), extra

    simplex = _run_nelder_mead(penalized, box, limit, tolerance, seed, {})
    if not _did_poorly(simplex, box, constraints, tolerance):
        return simplex, extra

    evolved = differential_evolution(
        penalized, box, max_iterations=limit, tolerance=tolerance, seed=seed
    )
    winner = evolved if _better(evolved, simplex) else simplex
    loser = simplex if winner is evolved else evolved
    return (
        GlobalResult(
            x=winner.x,
            fun=winner.fun,
            iterations=winner.iterations,
            function_calls=winner.function_calls,
            converged=winner.converged,
            flag=winner.flag + ":de-fallback",
            seed=seed,
        ),
        extra + loser.function_calls,
    )


def _wants_post_process(options: dict[str, Any]) -> bool:
    """Resolve `"PostProcess"`: absent or `Automatic` means polish, as we define it.

    Wolfram documents the three values `True`, `False` and `Automatic` and
    never says what `Automatic` decides; **our documented choice** is that
    it polishes. See the module docstring for what the polish is.
    """
    if _POST_PROCESS not in options:
        return True
    value = options[_POST_PROCESS]
    if isinstance(value, str):
        if value == _AUTOMATIC:
            return True
        raise ValueError(
            "method sub-option %r must be True, False or %r, not %r"
            % (_POST_PROCESS, _AUTOMATIC, value)
        )
    return bool(value)


def _signed_objective(
    objective: Objective, flags: Sequence[bool], maximize: bool
) -> Objective:
    """Wrap `objective` with integer rounding and the `maximize` sign, no penalty.

    This is what the polish minimizes: the constraints reach `cobyla` as
    constraints, so folding them in as penalties a second time would make
    the polish fight itself.
    """
    sign = -1.0 if maximize else 1.0

    def evaluate(point: Sequence[float]) -> float:
        return sign * float(objective(_snap(point, flags)))

    return evaluate


def _signed_constraint(g: Objective, flags: Sequence[bool], sign: float) -> Objective:
    """Return `sign * g(snap(x))`, COBYLA's `g(x) >= 0` shape with rounding applied."""

    def evaluate(point: Sequence[float]) -> float:
        return sign * float(g(_snap(point, flags)))

    return evaluate


def _polish_constraints(
    constraints: Sequence[Constraint], flags: Sequence[bool]
) -> list[Objective]:
    """Restate the constraints as the inequalities `cobyla` accepts.

    `g(x) >= 0` passes through; an equality `h(x) == 0` becomes the pair
    `h(x) >= 0` and `-h(x) >= 0`, which is the same set exactly and gives
    COBYLA two linear models it can build rather than one it cannot.
    """
    result: list[Objective] = []
    for constraint in constraints:
        result.append(_signed_constraint(constraint.function, flags, 1.0))
        if constraint.kind == _EQUALITY:
            result.append(_signed_constraint(constraint.function, flags, -1.0))
    return result


def _polish_radius(box: Sequence[tuple[float, float]]) -> float:
    """Return COBYLA's `rhobeg`: a tenth of the widest side of the initial region.

    Powell's own advice is that `rhobeg` should be about a tenth of the
    greatest expected change in a variable, and the region the caller asked
    to search is the only statement of scale available here. A region with
    every side pinned to zero width leaves nothing to scale, and falls back
    to `cobyla`'s own default of `1.0`.
    """
    widest = 0.0
    for low, high in box:
        width = high - low
        if width > widest:
            widest = width
    if widest <= 0.0:
        return 1.0
    return widest * _POLISH_RADIUS_SCALE


def _inside_region(
    point: Sequence[float], box: Sequence[tuple[float, float]], tolerance: float
) -> bool:
    """Return whether `point` sits in the initial region, within `tolerance`."""
    for value, pair in zip(point, box, strict=True):
        if math.isnan(value):
            return False
        if value < pair[0] - tolerance or value > pair[1] + tolerance:
            return False
    return True


def _polish_wins(
    candidate_value: float,
    candidate_violation: float,
    current_value: float,
    current_violation: float,
    tolerance: float,
) -> bool:
    """Order two points the way the rest of this module does: feasibility, then value.

    A feasible point beats an infeasible one; between two infeasible points
    the smaller worst violation wins; otherwise the smaller objective wins.
    NaN never wins, so a polish that lost the objective cannot displace an
    answer that still has one.
    """
    if math.isnan(candidate_value):
        return False
    candidate_feasible = candidate_violation <= tolerance
    current_feasible = current_violation <= tolerance
    if candidate_feasible != current_feasible:
        return candidate_feasible
    if not candidate_feasible and candidate_violation != current_violation:
        return candidate_violation < current_violation
    if math.isnan(current_value):
        return True
    return candidate_value < current_value


def _post_process(
    objective: Objective,
    outcome: GlobalResult,
    box: Sequence[tuple[float, float]],
    flags: Sequence[bool],
    constraints: Sequence[Constraint],
    limit: int,
    tolerance: float,
    maximize: bool,
) -> GlobalResult:
    """Polish `outcome` with a local method, keeping the better of the two points.

    `nelder_mead` polishes an unconstrained problem and `cobyla` a
    constrained one; the polished point is accepted only if it stays in the
    initial region and wins under `_polish_wins`. Either way the polish's
    evaluations are folded into `function_calls`. The returned `fun` is in
    the minimization sense the methods report, and is recomputed from `x`
    by `_finish` before any caller sees it.
    """
    signed = _signed_objective(objective, flags, maximize)
    calls = 0

    def counted(point: Sequence[float]) -> float:
        nonlocal calls
        calls += 1
        return signed(point)

    start = [float(value) for value in outcome.x]
    current_value = counted(start)
    current_violation = _worst_violation(constraints, _snap(start, flags))
    polish_tolerance = tolerance * _POLISH_TOLERANCE_SCALE

    if len(constraints) == 0:
        local = nelder_mead(
            counted,
            start,
            xatol=polish_tolerance,
            fatol=polish_tolerance,
            maxiter=limit,
        )
        candidate = [float(value) for value in local.x]
        candidate_value = local.fun
    else:
        width = len(start)
        constrained = cobyla(
            counted,
            start,
            _polish_constraints(constraints, flags),
            rhobeg=_polish_radius(box),
            rhoend=polish_tolerance,
            maxfun=max(width + 2, limit * (width + 1)),
            catol=polish_tolerance,
        )
        candidate = [float(value) for value in constrained.x]
        candidate_value = constrained.fun

    candidate_violation = _worst_violation(constraints, _snap(candidate, flags))
    accepted = _inside_region(candidate, box, tolerance) and _polish_wins(
        candidate_value,
        candidate_violation,
        current_value,
        current_violation,
        tolerance,
    )

    if not accepted:
        return GlobalResult(
            x=list(outcome.x),
            fun=outcome.fun,
            iterations=outcome.iterations,
            function_calls=outcome.function_calls + calls,
            converged=outcome.converged,
            flag=outcome.flag,
            seed=outcome.seed,
        )
    return GlobalResult(
        x=candidate,
        fun=candidate_value,
        iterations=outcome.iterations,
        function_calls=outcome.function_calls + calls,
        converged=outcome.converged,
        flag=outcome.flag + _POLISHED,
        seed=outcome.seed,
    )


def _finish(
    objective: Objective,
    outcome: GlobalResult,
    flags: Sequence[bool],
    constraints: Sequence[Constraint],
    tolerance: float,
    seed: int,
    extra: int,
) -> GlobalResult:
    """Re-evaluate the true objective at the winner and settle feasibility."""
    point = _snap(outcome.x, flags)
    value = float(objective(point))
    feasible = _worst_violation(constraints, point) <= tolerance
    return GlobalResult(
        x=point,
        fun=value,
        iterations=outcome.iterations,
        function_calls=outcome.function_calls + extra + 1,
        converged=outcome.converged and feasible,
        flag=outcome.flag if feasible else outcome.flag + ":infeasible",
        seed=seed,
    )
