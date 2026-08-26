"""Small runtime used by the experimental Wolfram Language frontend."""

import math
from typing import Any, Callable, SupportsFloat, cast

import sagejs as sage
import sagejs.runtime as runtime


def _runtime_type_name(value: Any) -> str:
    name = type(value).__name__
    if name.startswith("ρσ_"):
        return name[3:]
    return name


def head(value: Any) -> str:
    """Return the Wolfram head corresponding to a shared evaluator object."""

    names = {
        "bool": "Boolean",
        "int": "Integer",
        "Integer": "Integer",
        "Rational": "Rational",
        "float": "Real",
        "RealLiteral": "Real",
        "RealNumberElement": "Real",
        "complex": "Complex",
        "PythonComplex": "Complex",
        "ComplexNumberElement": "Complex",
        "str": "String",
        "list": "List",
        "list_constructor": "List",
        "tuple": "List",
        "set": "Set",
        "dict": "Association",
        "ndarray": "NumericArray",
        "PolynomialRingParent": "PolynomialRing",
        "PolynomialElement": "Polynomial",
        "Expression": "SageExpression",
        "Graphics": "Graphics",
        "Graphics3d": "Graphics3D",
    }
    name = _runtime_type_name(value)
    return names[name] if name in names else name


def dimensions(value: Any) -> list[int]:
    if hasattr(value, "shape"):
        return [int(dimension) for dimension in value.shape]
    if not isinstance(value, (list, tuple)):
        return []
    result = [len(value)]
    if value:
        child = dimensions(value[0])
        if all(dimensions(item) == child for item in value):
            result.extend(child)
    return result


def length(value: Any) -> int:
    if hasattr(value, "shape"):
        shape = value.shape
        return int(shape[0]) if len(shape) else 0
    try:
        return len(value)
    except TypeError:
        return 0


def factor_integer(value: Any) -> list[list[Any]]:
    result = []
    for pair in sage.factor(value):
        result.append([pair[0], pair[1]])
    return result


def prime(index: int) -> int:
    if index < 1:
        raise ValueError("Prime index must be positive")
    found = 0
    candidate = 1
    while found < index:
        candidate += 1
        if sage.is_prime(candidate):
            found += 1
    return candidate


def wolfram_range(
    start: int,
    stop: int | None = None,
    step: int = 1,
) -> list[int]:
    if stop is None:
        stop = start
        start = 1
    if step == 0:
        raise ValueError("Range step must not be zero")
    boundary = stop + (1 if step > 0 else -1)
    return list(range(start, boundary, step))


def table(
    function: Callable[[Any], Any],
    start: int,
    stop: int,
    step: int = 1,
) -> list[Any]:
    return [function(value) for value in wolfram_range(start, stop, step)]


FactorInteger = factor_integer
Dimensions = dimensions
Head = head
Length = length
Prime = prime
Range = wolfram_range
Table = table


_optimization_module_cache = runtime.undefined
_findminimum_module_cache = runtime.undefined
_fit_module_cache = runtime.undefined

_INFEASIBLE = ":infeasible"
"""The `flag` suffix `nminimize` appends when its answer stays infeasible."""

# Wolfram relational heads, mapped to the sign that turns `lhs REL rhs` into
# a `g(x) >= 0` inequality: `1` keeps `lhs - rhs`, `-1` flips to `rhs - lhs`,
# and `0` marks the equation `lhs - rhs == 0`.
_RELATION_ORIENTATION = {
    "Equal": 0,
    "Greater": 1,
    "GreaterEqual": 1,
    "Less": -1,
    "LessEqual": -1,
}


def _optimization_module() -> Any:
    """Load the lazy numerical optimization package on first use."""
    global _optimization_module_cache
    if _optimization_module_cache is runtime.undefined:
        _optimization_module_cache = __import__(
            "sagejs.optimization.nminimize",
            fromlist=["nminimize"],
        )
    return _optimization_module_cache


def _findminimum_module() -> Any:
    """Load the lazy local-minimization module on first use.

    Kept separate from `_optimization_module` because Wolfram's local and
    global questions are separate functions with separate engines here: a
    notebook that only calls `FindMinimum` never pays for `nminimize`'s
    population methods, and the reverse.
    """
    global _findminimum_module_cache
    if _findminimum_module_cache is runtime.undefined:
        _findminimum_module_cache = __import__(
            "sagejs.optimization.findminimum",
            fromlist=["findminimum"],
        )
    return _findminimum_module_cache


def _fit_module() -> Any:
    """Load the lazy least-squares fitting engine on first use.

    Kept separate from `_optimization_module` (`NMinimize`'s family) and
    `_findminimum_module` (`FindMinimum`'s family) for the same reason those
    two are kept apart from each other: `sagejs.optimization.sage_api` pulls
    in `levenberg_marquardt.leastsq` and its own copy of the constrained and
    unconstrained local solvers, so a notebook calling only `FindFit` should
    not pay to import the population methods, and one calling only
    `NMinimize`/`FindMinimum` should not pay to import this module either.
    """
    global _fit_module_cache
    if _fit_module_cache is runtime.undefined:
        _fit_module_cache = __import__(
            "sagejs.optimization.sage_api",
            fromlist=["sage_api"],
        )
    return _fit_module_cache


def _is_symbolic(value: Any) -> bool:
    """Return whether `value` looks like a Sage.js symbolic expression."""
    return hasattr(value, "_tree") and hasattr(value, "variables")


def _is_number(value: Any) -> bool:
    """Return whether `value` is a plain number, not a symbol or a list."""
    if _is_symbolic(value) or isinstance(value, (list, tuple, str)):
        return False
    try:
        float(value)
    except (TypeError, ValueError):
        return False
    return True


def _variable_entries(variables: Any) -> list[Any]:
    """Split a Wolfram variable argument into one entry per variable.

    `NMinimize[f, x]` names a single bare variable, `NMinimize[f, {x, y}]` a
    list of them, and `NMinimize[f, {{x, a, b}, ...}]` a list of variables
    each carrying its own initial region. Wolfram's one genuine ambiguity is
    `{x, a, b}` at the top level, which is a single variable with a region
    rather than three bare variables; it is resolved here the way Wolfram
    resolves it, by checking that the last two elements are numbers.
    """
    if not isinstance(variables, (list, tuple)):
        return [variables]
    entries = list(variables)
    if len(entries) == 3 and _is_number(entries[1]) and _is_number(entries[2]):
        return [entries]
    return entries


def _entry_variable(entry: Any) -> Any:
    """Return the variable itself out of one `_variable_entries` entry."""
    if isinstance(entry, (list, tuple)) and len(entry):
        return list(entry)[0]
    return entry


def _symbolic_function(expression: Any, variables: list[Any]) -> Any:
    """Compile a symbolic expression into a callable of one coordinate list.

    `fast_callable` is reached through the global object, the way
    `_plot_target` reaches the Sage plotting entry points, because the
    `sagejs` import in this module carries compiler intrinsics rather than
    the whole Sage namespace.
    """
    compiler = runtime.reflect.get(runtime.global_object, "fast_callable")
    evaluator = compiler(expression, vars=variables)

    def evaluate(point: Any) -> float:
        return float(evaluator(*[float(value) for value in point]))

    return evaluate


def _objective_function(objective: Any, variables: list[Any]) -> Any:
    """Adapt a Wolfram objective to the numeric contract `nminimize` expects.

    A symbolic expression is compiled against `variables`, in coordinate
    order, and a plain number becomes a constant objective. Anything else
    must be a callable taking one sequence of coordinates; a Wolfram-source
    function defined as `f[x_, y_] := ...` takes its arguments separately
    and so has to be applied in the source (`NMinimize[f[x, y], {x, y}]`)
    rather than passed by name.
    """
    if _is_symbolic(objective):
        return _symbolic_function(objective, variables)
    if not callable(objective):
        constant = float(objective)

        def constant_value(_point: Any) -> float:
            return constant

        return constant_value

    def evaluate(point: Any) -> float:
        return float(cast(SupportsFloat, objective(point)))

    return evaluate


def _relation_parts(value: Any) -> Any:
    """Split a symbolic relation into `(head, lhs, rhs)`, or `None` if it is not one."""
    if not _is_symbolic(value):
        return None
    tree = value._tree
    if not runtime.array.isArray(tree) or len(tree) != 3:
        return None
    name = tree[0]
    if name not in _RELATION_ORIENTATION:
        return None
    builder = type(value)
    return [name, builder(tree[1]), builder(tree[2])]


def _constraint(value: Any, variables: list[Any], module: Any, head: str) -> Any:
    """Turn one Wolfram constraint into an engine-level `Constraint`.

    An equation `lhs == rhs` becomes the equality `lhs - rhs == 0`, and each
    of the four inequalities becomes `g(x) >= 0` with the sides ordered so
    that `g` is non-negative exactly on the feasible side. Strong
    inequalities become weak ones, which the Wolfram documentation also does
    ("Any strong inequalities will be converted to weak inequalities due to
    limits of working with approximate numbers"). A plain callable is read
    as `g(x) >= 0` directly.

    Shared verbatim by `_optimize` (`NMinimize`'s family) and `_find_optimize`
    (`FindMinimum`'s family) -- the `{f, cons}` pair means the same thing to
    both, so there is exactly one converter, not one per family. `head`
    names the caller in the one error this function can raise, so the
    message stays actionable regardless of which family reached it.

    Several constraints arrive here already separated, one call per
    constraint, whether the caller wrote the Wolfram List `{c1, c2}` or the
    conjunction `c1 && c2`: the frontend flattens both to a Python list
    before the pair reaches Python. That matters because `&&` must never be
    allowed to lower to Python `and`, which short-circuits on truthiness and
    would silently drop every constraint but one. See
    `flattenConstraints` in `tools/wolfram/frontend.ts`.
    """
    parts = _relation_parts(value)
    if parts is None:
        if callable(value):
            return module.inequality(value)
        raise ValueError(
            "%s constraints must be equations, inequalities, or callables; "
            "combine several of them in a List or with &&" % (head,)
        )
    orientation = _RELATION_ORIENTATION[parts[0]]
    difference = parts[1] - parts[2] if orientation >= 0 else parts[2] - parts[1]
    function = _symbolic_function(difference, variables)
    if orientation == 0:
        return module.equality(function)
    return module.inequality(function)


def _optimize(
    problem: Any,
    variables: Any,
    maximize: bool,
    method: str,
    method_options: dict[str, Any] | None,
    max_iterations: int | None,
    tolerance: float,
    seed: int,
    penalty_scale: float,
    head: str,
) -> Any:
    """Run the engine and return `[result, variable_names]`.

    `head` is the actual Wolfram head the caller is implementing --
    `"NMinimize"`, `"NMaximize"`, `"NMinValue"`, `"NMaxValue"`, `"NArgMin"`
    or `"NArgMax"` -- so the malformed-`{f, cons}` and bad-constraint
    messages below name the head the caller actually invoked, not always
    `NMinimize` regardless of who called in.
    """
    module = _optimization_module()
    entries = _variable_entries(variables)
    symbols = [_entry_variable(entry) for entry in entries]

    objective_value = problem
    constraint_values: list[Any] = []
    if isinstance(problem, (list, tuple)):
        parts = list(problem)
        if len(parts) != 2:
            raise ValueError(
                "%s takes either an objective or the pair {f, cons}" % (head,)
            )
        objective_value = parts[0]
        if isinstance(parts[1], (list, tuple)):
            constraint_values = list(parts[1])
        else:
            constraint_values = [parts[1]]

    constraints = [
        _constraint(value, symbols, module, head) for value in constraint_values
    ]
    result = module.nminimize(
        _objective_function(objective_value, symbols),
        entries,
        constraints=constraints if len(constraints) else None,
        method=method,
        method_options=method_options,
        max_iterations=max_iterations,
        tolerance=tolerance,
        seed=seed,
        penalty_scale=penalty_scale,
        maximize=maximize,
        head=head,
    )
    return [result, [str(symbol) for symbol in symbols]]


def _infeasible(result: Any) -> bool:
    """Return whether the engine reported the answer as still infeasible."""
    return _INFEASIBLE in result.flag


def _rules(names: list[str], values: Any) -> list[Any]:
    """Build Wolfram's `{x -> xmin, ...}` as a list of `{name, value}` pairs.

    This module has no value-level `Rule` object — the Wolfram frontend does
    not lower `->` outside plot options — so a rule is carried the way every
    other Wolfram list of pairs already is here, as a two-element list. This
    is the same shape `FactorInteger` returns for `{{p, e}, ...}`.
    """
    return [[name, value] for name, value in zip(names, values, strict=True)]


def _extremum(result: Any, names: list[str], maximize: bool) -> list[Any]:
    """Shape `{fmin, {x -> xmin, ...}}`, or the infeasible answer."""
    if _infeasible(result):
        indeterminate = float("nan")
        limit = float("-inf") if maximize else float("inf")
        return [limit, [[name, indeterminate] for name in names]]
    return [result.fun, _rules(names, result.x)]


def n_minimize(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    method_options: dict[str, Any] | None = None,
    max_iterations: int | None = None,
    tolerance: float = 0.001,
    seed: int = 0,
    penalty_scale: float = 1.0,
) -> list[Any]:
    """Search numerically for a global minimum, Wolfram `NMinimize`.

    `problem` is the objective, or the pair `{f, cons}` whose second element
    is the constraint or a List of constraints. `variables` is a bare
    variable, a List of them, or a List of `{x, a, b}` specifications giving
    each variable's initial region; a variable without one gets Wolfram's
    documented default region `-1 <= x <= 1`.

    Returns `{fmin, {x -> xmin, y -> ymin, ...}}`, with each rule carried as
    a two-element list (see `_rules`). When the constraints cannot be
    satisfied within `tolerance` the answer is
    `{Infinity, {x -> Indeterminate, ...}}`, as documented, rendered with
    the IEEE values `inf` and `nan` because this module has no symbolic
    `Infinity` or `Indeterminate` object.

    `method` selects among `"Automatic"`, `"NelderMead"`,
    `"DifferentialEvolution"`, `"SimulatedAnnealing"` and `"RandomSearch"`;
    `method_options` carries that method's Wolfram sub-options by their
    documented string names. The Wolfram frontend lowers `Method ->
    "NelderMead"` and `Method -> {"NelderMead", "RandomSeed" -> i, ...}`
    straight onto `method` and `method_options` (see
    `GLOBAL_OPTIMIZATION_OPTIONS` in `tools/wolfram/frontend.ts`); these
    Python keyword arguments are still there directly for a caller that
    is not going through Wolfram source.
    """
    answer = _optimize(
        problem,
        variables,
        False,
        method,
        method_options,
        max_iterations,
        tolerance,
        seed,
        penalty_scale,
        "NMinimize",
    )
    return _extremum(answer[0], answer[1], False)


def n_maximize(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    method_options: dict[str, Any] | None = None,
    max_iterations: int | None = None,
    tolerance: float = 0.001,
    seed: int = 0,
    penalty_scale: float = 1.0,
) -> list[Any]:
    """Search numerically for a global maximum, Wolfram `NMaximize`.

    This is `n_minimize` of the negated objective with the value negated
    back, and returns `{fmax, {x -> xmax, ...}}` in the same shape.

    One documented deviation: the `NMaximize` reference page states the
    infeasible answer as `{Infinity, {x -> Indeterminate, ...}}`, word for
    word the same as `NMinimize`'s. `-Infinity` is the only value that makes
    sense for a maximization that found nothing, so that is what is returned
    here.
    """
    answer = _optimize(
        problem,
        variables,
        True,
        method,
        method_options,
        max_iterations,
        tolerance,
        seed,
        penalty_scale,
        "NMaximize",
    )
    return _extremum(answer[0], answer[1], True)


def n_arg_min(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    method_options: dict[str, Any] | None = None,
    max_iterations: int | None = None,
    tolerance: float = 0.001,
    seed: int = 0,
    penalty_scale: float = 1.0,
) -> list[Any]:
    """Return just the minimizing variable values, Wolfram `NArgMin`.

    Same arguments as `n_minimize`; the answer is `{xmin, ymin, ...}`, or a
    list of `Indeterminate` when the constraints cannot be satisfied.
    """
    answer = _optimize(
        problem,
        variables,
        False,
        method,
        method_options,
        max_iterations,
        tolerance,
        seed,
        penalty_scale,
        "NArgMin",
    )
    return _arguments(answer[0], answer[1])


def n_arg_max(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    method_options: dict[str, Any] | None = None,
    max_iterations: int | None = None,
    tolerance: float = 0.001,
    seed: int = 0,
    penalty_scale: float = 1.0,
) -> list[Any]:
    """Return just the maximizing variable values, Wolfram `NArgMax`."""
    answer = _optimize(
        problem,
        variables,
        True,
        method,
        method_options,
        max_iterations,
        tolerance,
        seed,
        penalty_scale,
        "NArgMax",
    )
    return _arguments(answer[0], answer[1])


def _arguments(result: Any, names: list[str]) -> list[Any]:
    """Shape `NArgMin`/`NArgMax`: the extremizing values on their own."""
    if _infeasible(result):
        return [float("nan") for _name in names]
    return [value for value in result.x]


def n_min_value(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    method_options: dict[str, Any] | None = None,
    max_iterations: int | None = None,
    tolerance: float = 0.001,
    seed: int = 0,
    penalty_scale: float = 1.0,
) -> float:
    """Return just the minimum value `fmin`, Wolfram `NMinValue`."""
    answer = _optimize(
        problem,
        variables,
        False,
        method,
        method_options,
        max_iterations,
        tolerance,
        seed,
        penalty_scale,
        "NMinValue",
    )
    if _infeasible(answer[0]):
        return float("inf")
    return float(answer[0].fun)


def n_max_value(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    method_options: dict[str, Any] | None = None,
    max_iterations: int | None = None,
    tolerance: float = 0.001,
    seed: int = 0,
    penalty_scale: float = 1.0,
) -> float:
    """Return just the maximum value `fmax`, Wolfram `NMaxValue`."""
    answer = _optimize(
        problem,
        variables,
        True,
        method,
        method_options,
        max_iterations,
        tolerance,
        seed,
        penalty_scale,
        "NMaxValue",
    )
    if _infeasible(answer[0]):
        return float("-inf")
    return float(answer[0].fun)


NMinimize = n_minimize
NMaximize = n_maximize
NArgMin = n_arg_min
NArgMax = n_arg_max
NMinValue = n_min_value
NMaxValue = n_max_value


class _GraphicsDirective:
    def __init__(self, options: dict[str, Any]) -> None:
        self.options = options


def _find_variable_entries(variables: Any) -> list[Any]:
    """Split a Wolfram `FindMinimum` variable argument into one entry each.

    `FindMinimum`'s variable specifications look like `NMinimize`'s but do
    not mean the same thing, so they cannot share `_variable_entries`.
    `NMinimize[f, {x, a, b}]` gives one variable its initial *region*, while
    `FindMinimum[f, {x, x0}]` gives one variable its *starting point* and
    `FindMinimum[f, {x, x0, xmin, xmax}]` adds a box. The list forms collide
    head-on: `{x, y}` is two variables to both functions, but `{x, 1}` is one
    variable to `FindMinimum` and meaningless to `NMinimize`.

    The rule used here is the one that separates them: a top-level list whose
    first element is a variable and whose remaining elements are all numbers
    is a single specification; anything else is a list of specifications.
    """
    if not isinstance(variables, (list, tuple)):
        return [variables]
    entries = list(variables)
    if len(entries) < 2:
        return entries
    if _is_symbolic(entries[0]) and all(_is_number(item) for item in entries[1:]):
        return [entries]
    return entries


def _find_spec(entry: Any, index: int, module: Any) -> Any:
    """Read one `FindMinimum` variable entry into a `LocalSpec`."""
    if not isinstance(entry, (list, tuple)):
        return module.LocalSpec(variable=entry, name=str(entry), start=0.0)
    values = list(entry)
    variable = values[0]
    name = str(variable)
    if len(values) == 1:
        return module.LocalSpec(variable=variable, name=name, start=0.0)
    if len(values) == 2:
        return module.LocalSpec(variable=variable, name=name, start=float(values[1]))
    if len(values) == 3:
        # Wolfram's `{x, x0, x1}` supplies two starting values, for the
        # methods that difference them. Every solver reached from here takes
        # a single starting point, so this is refused by name instead of
        # quietly dropping `x1` and reporting a run the caller did not ask
        # for.
        raise ValueError(
            "variable %d is Wolfram's two-starting-value form {x, x0, x1}, "
            "which is not supported; give {x, x0} or {x, x0, xmin, xmax}" % (index,)
        )
    if len(values) == 4:
        return module.LocalSpec(
            variable=variable,
            name=name,
            start=float(values[1]),
            low=float(values[2]),
            high=float(values[3]),
        )
    raise ValueError(
        "variable %d has %d elements; expected a bare variable, {x, x0} or "
        "{x, x0, xmin, xmax}" % (index, len(values))
    )


def _symbolic_gradient(objective: Any, variables: list[Any]) -> Any:
    """Compile `grad objective` when the objective is symbolic, else `None`.

    `Expression` has no `gradient()` here, so the gradient is assembled from
    one `derivative` per variable, each compiled over the same coordinate
    order — the same construction `sagejs.optimization.sage_api` uses. A
    non-symbolic objective returns `None`, which leaves each solver to its
    own forward-difference approximation.
    """
    if not _is_symbolic(objective):
        return None
    partials = [
        _symbolic_function(objective.derivative(variable), variables)
        for variable in variables
    ]

    def evaluate(point: Any) -> list[float]:
        return [float(component(point)) for component in partials]

    return evaluate


def _find_optimize(
    problem: Any,
    variables: Any,
    maximize: bool,
    method: str,
    max_iterations: int | None,
    tolerance: float,
    head: str,
) -> Any:
    """Run the local engine and return `[result, variable_names]`.

    `head` is the actual Wolfram head the caller is implementing --
    `"FindMinimum"`, `"FindMaximum"`, `"FindMinValue"`, `"FindMaxValue"`,
    `"FindArgMin"` or `"FindArgMax"` -- so the malformed-`{f, cons}` and
    bad-constraint messages below name the head the caller actually
    invoked, not always `FindMinimum` regardless of who called in.
    """
    module = _findminimum_module()
    entries = _find_variable_entries(variables)
    specs = [_find_spec(entries[index], index, module) for index in range(len(entries))]
    symbols = [spec.variable for spec in specs]

    objective_value = problem
    constraint_values: list[Any] = []
    if isinstance(problem, (list, tuple)):
        parts = list(problem)
        if len(parts) != 2:
            raise ValueError(
                "%s takes either an objective or the pair {f, cons}" % (head,)
            )
        objective_value = parts[0]
        if isinstance(parts[1], (list, tuple)):
            constraint_values = list(parts[1])
        else:
            constraint_values = [parts[1]]

    constraints = [
        _constraint(value, symbols, module, head) for value in constraint_values
    ]
    result = module.findminimum(
        _objective_function(objective_value, symbols),
        specs,
        constraints=constraints if len(constraints) else None,
        gradient=_symbolic_gradient(objective_value, symbols),
        method=method,
        max_iterations=max_iterations,
        tolerance=tolerance,
        maximize=maximize,
    )
    return [result, [spec.name for spec in specs]]


def find_minimum(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    max_iterations: int | None = None,
    tolerance: float = 1e-6,
) -> list[Any]:
    """Search for a local minimum from a starting point, Wolfram `FindMinimum`.

    `problem` is the objective, or the pair `{f, cons}` whose second element
    is the constraint or a List of constraints, read exactly as
    `n_minimize`'s `problem` is (see `_constraint`). A constrained problem
    always runs on `cobyla.cobyla`, the local engine's only constrained
    solver, regardless of `method` or of any variable's own box; see
    `sagejs.optimization.findminimum`'s module docstring for exactly how and
    why.

    `variables` is a bare variable, a List of them, `{x, x0}` giving one
    variable its starting value, or `{x, x0, xmin, xmax}` adding a box; a
    variable given without a starting value begins at `0`. Unlike
    `NMinimize`, this walks downhill from where it is told to start and
    reports the first local minimum it settles in, so the answer depends on
    the starting point.

    Returns `{fmin, {x -> xmin, ...}}`, with each rule carried as a
    two-element list exactly as `NMinimize` returns it (see `_rules`).

    `method` selects among `"Automatic"`, `"QuasiNewton"`,
    `"ConjugateGradient"`, `"Newton"` and `"PrincipalAxis"`. The Wolfram
    frontend lowers `Method -> "Newton"` straight onto this keyword (see
    `LOCAL_OPTIMIZATION_OPTIONS` in `tools/wolfram/frontend.ts`); unlike
    `n_minimize`, there is no `method_options` here to route Wolfram's
    method-with-suboptions form to -- `findminimum` takes no such keyword --
    so the frontend declines `Method -> {"Name", ...}` sub-options for this
    head and its five siblings by name rather than dropping them.
    """
    answer = _find_optimize(
        problem, variables, False, method, max_iterations, tolerance, "FindMinimum"
    )
    return [answer[0].fun, _rules(answer[1], answer[0].x)]


def find_maximum(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    max_iterations: int | None = None,
    tolerance: float = 1e-6,
) -> list[Any]:
    """Search for a local maximum from a starting point, Wolfram `FindMaximum`.

    The maximizing counterpart of `find_minimum`, sharing its engine by
    minimizing `-objective`; see that docstring for the constrained `{f,
    cons}` form, the variable forms, and the `method` vocabulary.
    """
    answer = _find_optimize(
        problem, variables, True, method, max_iterations, tolerance, "FindMaximum"
    )
    return [answer[0].fun, _rules(answer[1], answer[0].x)]


def find_min_value(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    max_iterations: int | None = None,
    tolerance: float = 1e-6,
) -> Any:
    """Return just the local minimum value, Wolfram `FindMinValue`."""
    answer = _find_optimize(
        problem, variables, False, method, max_iterations, tolerance, "FindMinValue"
    )
    return answer[0].fun


def find_max_value(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    max_iterations: int | None = None,
    tolerance: float = 1e-6,
) -> Any:
    """Return just the local maximum value, Wolfram `FindMaxValue`."""
    answer = _find_optimize(
        problem, variables, True, method, max_iterations, tolerance, "FindMaxValue"
    )
    return answer[0].fun


def find_arg_min(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    max_iterations: int | None = None,
    tolerance: float = 1e-6,
) -> list[Any]:
    """Return just the minimizing variable values, Wolfram `FindArgMin`."""
    answer = _find_optimize(
        problem, variables, False, method, max_iterations, tolerance, "FindArgMin"
    )
    return [value for value in answer[0].x]


def find_arg_max(
    problem: Any,
    variables: Any,
    method: str = "Automatic",
    max_iterations: int | None = None,
    tolerance: float = 1e-6,
) -> list[Any]:
    """Return just the maximizing variable values, Wolfram `FindArgMax`."""
    answer = _find_optimize(
        problem, variables, True, method, max_iterations, tolerance, "FindArgMax"
    )
    return [value for value in answer[0].x]


def _fit_data_table(data: Any) -> Any:
    """Rewrite Wolfram `FindFit`'s bare-values data shape into a table.

    `FindFit` documents three shapes for `data`: pairs `{{x1,y1},...}`,
    rows `{{x1,...,xk,f},...}` for several independent variables, and a flat
    list of dependent values `{y1,y2,...}` whose independent variable is
    implicit, `1, 2, 3, ...`. The first two are already the "list of rows"
    table `sage_api.find_fit` expects and are passed through untouched; the
    third is not a list of rows at all -- its first element is a bare
    number, not a `List` -- so it is rewritten here into
    `{{1,y1},{2,y2},...}` before it ever reaches `find_fit`, using Wolfram's
    own one-based indexing for the implicit abscissae. Anything that is not
    a nonempty `List` is passed through as well, so `sage_api.find_fit`'s
    own "data has to be a two dimensional table" error fires with its usual
    wording instead of a second, differently worded one from here.
    """
    if not isinstance(data, (list, tuple)) or not data:
        return data
    if _is_number(data[0]):
        return [[float(index + 1), float(value)] for index, value in enumerate(data)]
    return data


def _fit_parameter_entries(pars: Any) -> list[Any]:
    """Split `FindFit`'s `pars` into one entry per fit parameter.

    Wolfram documents three shapes: a bare parameter, a `List` of
    parameters, and a `List` of `{a, a0}` pairs giving each parameter its
    own starting value. The single-parameter case `{a, a0}` collides at the
    top level with the two-bare-parameters case `{a, b}`, exactly the
    ambiguity `_find_variable_entries` already resolves for `FindMinimum`'s
    variable specifications; it is resolved the same way here, by checking
    whether the second element is a number rather than another parameter.
    """
    if not isinstance(pars, (list, tuple)):
        return [pars]
    entries = list(pars)
    if len(entries) == 2 and _is_symbolic(entries[0]) and _is_number(entries[1]):
        return [entries]
    return entries


def _fit_parameter_spec(entry: Any, index: int) -> tuple[Any, float | None]:
    """Read one `_fit_parameter_entries` entry into `(symbol, start)`."""
    if not isinstance(entry, (list, tuple)):
        return entry, None
    values = list(entry)
    if len(values) == 1:
        return values[0], None
    if len(values) == 2:
        return values[0], float(values[1])
    raise ValueError(
        "FindFit parameter %d has %d elements; expected a bare parameter "
        "or {parameter, start}" % (index, len(values))
    )


def _fit_variable_entries(variables: Any) -> list[Any]:
    """Split `FindFit`'s `vars` into one entry per independent variable.

    A bare symbol names one variable and a `List` names several; unlike
    `pars`, `vars` carries no starting values, so there is no ambiguity to
    resolve here.
    """
    if not isinstance(variables, (list, tuple)):
        return [variables]
    return list(variables)


def find_fit(data: Any, expr: Any, pars: Any, vars: Any) -> list[Any]:
    r"""Fit `expr` to `data` by nonlinear least squares, Wolfram `FindFit`.

    `data` accepts all three shapes Wolfram documents -- pairs
    `{{x1,y1},...}`, rows `{{x1,...,xk,f},...}` for several independent
    variables, and a flat list of dependent values `{y1,y2,...}` against
    the implicit abscissae `1, 2, 3, ...` -- normalized by
    `_fit_data_table`. `pars` is a bare parameter, a `List` of parameters,
    or a `List` of `{a, a0}` pairs giving each an explicit starting value
    (`sage_api.find_fit`'s own default start, `1`, is used for a parameter
    given without one, matching Wolfram's documented default). `vars` is a
    bare independent variable or a `List` of them.

    Returns Wolfram's own answer shape for this one head, unlike every
    other head in this module: a bare `List` of rules `{a -> value, ...}`,
    not the `{fmin, {rules}}` pair `NMinimize` and `FindMinimum` return --
    `FindFit` never reports the residual, only the fitted parameters. Each
    rule is carried as a two-element list, exactly as `_rules` already
    carries one everywhere else here. `sage_api.find_fit` itself returns a
    list of symbolic equations `a == value` (or, with `solution_dict=True`,
    a `{symbol: value}` mapping); this reshapes that mapping, in the order
    `pars` named its parameters, into the two-element-list rules the rest
    of this module already uses.

    `pars` and `vars` are always read explicitly here -- Wolfram source
    supplies both -- so `sage_api.find_fit`'s own deduction from a symbolic
    model's free variables, used when `parameters`/`variables` are omitted,
    is never exercised through this entry point. Every parameter named in
    `pars` must actually occur in `expr`: one that does not has no way to
    be constrained by the data (its residual derivative is zero
    everywhere), so it is refused by name up front rather than silently fit
    with `leastsq` reporting back whatever the starting value happened to
    be.

    Unlike the other twelve numeric heads, the Wolfram frontend declines
    every option `FindFit` documents -- `Method`, `MaxIterations`,
    `Gradient`, `NormFunction`, `Weights`, `FitRegularization`,
    `WorkingPrecision`, `AccuracyGoal`, `PrecisionGoal`, `Compiled`,
    `StepMonitor`, `EvaluationMonitor` -- by name, each with its own reason
    (see `FIND_FIT_OPTIONS` in `tools/wolfram/frontend.ts`), rather than
    lowering any of them here. There is no Python-side `method=` escape
    hatch to offer as a substitute either: `FindFit` has exactly one engine,
    Levenberg-Marquardt, so there is no method to select. `NormFunction ->`
    and `Weights ->` have no workaround for a different reason --
    `sage_api.find_fit` always minimizes the plain sum of squared
    residuals and has no norm or weighting parameter to expose, so
    supporting either would mean adding that capability to the fitting
    engine itself, out of scope here.
    """
    module = _fit_module()
    table = _fit_data_table(data)

    parameter_entries = _fit_parameter_entries(pars)
    parameter_specs = [
        _fit_parameter_spec(entry, index)
        for index, entry in enumerate(parameter_entries)
    ]
    parameters = [spec[0] for spec in parameter_specs]
    parameter_names = [str(symbol) for symbol in parameters]
    initial_guess = [1.0 if spec[1] is None else spec[1] for spec in parameter_specs]

    variables = _fit_variable_entries(vars)

    if _is_symbolic(expr):
        available = {str(symbol) for symbol in expr.variables()}
        for name in parameter_names:
            if name not in available:
                raise ValueError(
                    "FindFit parameter %r does not occur in the model" % (name,)
                )

    fitted = module.find_fit(
        table,
        expr,
        initial_guess=initial_guess,
        parameters=parameters,
        variables=variables,
        solution_dict=True,
    )
    values = [fitted[symbol] for symbol in parameters]
    return _rules(parameter_names, values)


def opacity(value: Any) -> _GraphicsDirective:
    return _GraphicsDirective({"opacity": float(value), "alpha": float(value)})


def thickness(value: Any) -> _GraphicsDirective:
    return _GraphicsDirective({"thickness": float(value)})


def point_size(value: Any) -> _GraphicsDirective:
    return _GraphicsDirective({"size": max(1.0, 100.0 * float(value))})


def rgb_color(red: Any, green: Any, blue: Any, alpha: Any = 1) -> _GraphicsDirective:
    color = (float(red), float(green), float(blue))
    return _GraphicsDirective(
        {
            "color": color,
            "rgbcolor": color,
            "opacity": float(alpha),
            "alpha": float(alpha),
        }
    )


def gray_level(value: Any, alpha: Any = 1) -> _GraphicsDirective:
    component = float(value)
    return rgb_color(component, component, component, alpha)


def hue_color(
    value: Any, saturation: Any = 1, brightness: Any = 1, alpha: Any = 1
) -> _GraphicsDirective:
    color = sage.hue(value, saturation, brightness)
    return _GraphicsDirective(
        {
            "color": color,
            "rgbcolor": color,
            "opacity": float(alpha),
            "alpha": float(alpha),
        }
    )


def directive(*values: Any) -> _GraphicsDirective:
    options = {}
    for value in values:
        if isinstance(value, _GraphicsDirective):
            for name in value.options:
                options[name] = value.options[name]
        elif isinstance(value, str):
            options["color"] = value
            options["rgbcolor"] = value
    return _GraphicsDirective(options)


def _style_graphic(graphic: Any, options: dict[str, Any]) -> Any:
    if not options:
        return graphic
    for primitive in graphic:
        target = primitive
        while target is not None:
            if hasattr(target, "_options"):
                for name in options:
                    target._options[name] = options[name]
            if hasattr(target, "primitive"):
                target = target.primitive
            else:
                target = None
    return graphic


def style(graphic: Any, *directives: Any) -> Any:
    combined = directive(*directives)
    return _style_graphic(graphic, combined.options)


def _copy_style(options: dict[str, Any]) -> dict[str, Any]:
    answer = {}
    for name in options:
        answer[name] = options[name]
    return answer


def _combine_graphics(items: Any, inherited_style: dict[str, Any] | None = None) -> Any:
    if not isinstance(items, (list, tuple)):
        return items
    result = 0
    style = _copy_style(inherited_style if inherited_style is not None else {})
    for item in items:
        if isinstance(item, str):
            style["color"] = item
            style["rgbcolor"] = item
            continue
        if isinstance(item, _GraphicsDirective):
            for name in item.options:
                style[name] = item.options[name]
            continue
        if isinstance(item, (list, tuple)):
            item = _combine_graphics(item, style)
            if item != 0:
                result = result + item
            continue
        if item == 0:
            continue
        item = _style_graphic(item, style)
        result = result + item
    return result


def _option_metadata(record: dict[str, Any], translation: dict[str, Any]) -> Any:
    return {
        "name": str(record["name"]),
        "rule": str(record["rule"]),
        "source": str(record["source"]),
        "source_span": record["source_span"],
        "translation": translation,
    }


def _plot_range_options(value: Any) -> dict[str, Any] | None:
    if value in ("all", "automatic"):
        return {}
    if not isinstance(value, (list, tuple)):
        return None
    values = list(value)
    if len(values) != 2:
        return None
    if isinstance(values[0], (list, tuple)) and isinstance(values[1], (list, tuple)):
        xvalues = list(values[0])
        yvalues = list(values[1])
        if len(xvalues) != 2 or len(yvalues) != 2:
            return None
        return {
            "xmin": xvalues[0],
            "xmax": xvalues[1],
            "ymin": yvalues[0],
            "ymax": yvalues[1],
        }
    return {"ymin": values[0], "ymax": values[1]}


def _translate_options(
    head_name: str,
    records: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[Any], list[Any], list[Any]]:
    keyword_map = {
        "AspectRatio": "aspect_ratio",
        "Axes": "axes",
        "AxesLabel": "axes_labels",
        "Boxed": "frame",
        "Contours": "contours",
        "Filling": "fill",
        "Frame": "frame",
        "ImageSize": "figsize",
        "Joined": "plotjoined",
        "MaxRecursion": "adaptive_recursion",
        "Mesh": "mesh",
        "Opacity": "opacity",
        "PlotLabel": "title",
        "PlotPoints": "plot_points",
        "PlotStyle": "color",
    }
    translated_options = {}
    ordered_options = []
    diagnostics = []
    translation_events = []
    for record in records:
        name = str(record["name"])
        target = keyword_map[name] if name in keyword_map else None
        if name == "PlotRange":
            range_options = _plot_range_options(record["value"])
            if range_options is not None:
                for bound in ("xmin", "xmax", "ymin", "ymax"):
                    if bound in translated_options:
                        del translated_options[bound]
                for bound in range_options:
                    translated_options[bound] = range_options[bound]
                translation = {
                    "option": name,
                    "rule": str(record["rule"]),
                    "classification": "translated",
                    "target": "viewport",
                }
                ordered_options.append(_option_metadata(record, translation))
                translation_events.append(translation)
                continue
        elif target is not None:
            translated_options[target] = record["value"]
            translation = {
                "option": name,
                "rule": str(record["rule"]),
                "classification": "translated",
                "target": target,
            }
            ordered_options.append(_option_metadata(record, translation))
            translation_events.append(translation)
            continue
        translation = {
            "option": name,
            "rule": str(record["rule"]),
            "classification": "unsupported",
            "target": None,
        }
        ordered_options.append(_option_metadata(record, translation))
        translation_events.append(translation)
        diagnostics.append(
            {
                "code": "PLOT_OPTION_IGNORED",
                "severity": "warning",
                "phase": "options",
                "layer_ids": [],
                "message": "A frontend option could not be represented and was ignored.",
                "suggested_repairs": [
                    "Use the suggested Plotly-native alternative when available."
                ],
                "details": {
                    "frontend": "wolfram",
                    "head": head_name,
                    "option": name,
                    "source_span": record["source_span"],
                },
            }
        )
    return translated_options, ordered_options, diagnostics, translation_events


def _with_plot_context(
    graphic: Any,
    head_name: str,
    intent: dict[str, Any],
    ordered_options: list[Any],
    diagnostics: list[Any],
    translation_events: list[Any],
) -> Any:
    source_intent = {}
    for name in intent:
        source_intent[name] = intent[name]
    source_intent["translation_events"] = translation_events
    return graphic.with_plot_spec_context(
        provenance={
            "frontend": "wolfram",
            "source_language": "wolfram",
            "constructor": head_name,
        },
        source_intent=source_intent,
        ordered_options=ordered_options,
        diagnostics=diagnostics,
    )


def _apply_graphics_options(graphic: Any, options: dict[str, Any]) -> None:
    """Apply detached frontend options without passing a mapping boundary."""
    if hasattr(graphic, "_set_extra_kwd"):
        for name in options:
            graphic._set_extra_kwd(name, options[name])
    elif len(options) and hasattr(graphic, "set_extra_kwds"):
        graphic.set_extra_kwds(options)


def graphics(
    items: Any,
    option_records: list[dict[str, Any]] | None = None,
    intent: dict[str, Any] | None = None,
) -> Any:
    """Combine Wolfram two-dimensional graphics primitives."""
    graphic = _combine_graphics(items)
    records = option_records if option_records is not None else []
    translated, ordered, diagnostics, events = _translate_options("Graphics", records)
    # Wolfram `Graphics` defaults to coordinate axes being hidden, unlike the
    # Sage `Graphics` object used as its implementation substrate.  Make the
    # frontend default explicit so omitting `Axes` does not silently acquire
    # Sage semantics.  An explicit `Axes -> True` in `records` wins above.
    if "axes" not in translated:
        translated["axes"] = False
    _apply_graphics_options(graphic, translated)
    if intent is None:
        return graphic
    return _with_plot_context(graphic, "Graphics", intent, ordered, diagnostics, events)


def graphics3d(
    items: Any,
    option_records: list[dict[str, Any]] | None = None,
    intent: dict[str, Any] | None = None,
) -> Any:
    """Combine Wolfram three-dimensional graphics primitives."""
    graphic = _combine_graphics(items)
    records = option_records if option_records is not None else []
    translated, ordered, diagnostics, events = _translate_options("Graphics3D", records)
    _apply_graphics_options(graphic, translated)
    if intent is None:
        return graphic
    return _with_plot_context(
        graphic, "Graphics3D", intent, ordered, diagnostics, events
    )


def _plot_target(name: str) -> Any:
    allowed = (
        "contour_plot",
        "density_plot",
        "implicit_plot3d",
        "list_plot",
        "list_plot3d",
        "parametric_plot",
        "parametric_plot3d",
        "plot",
        "plot3d",
        "plot_vector_field",
        "plot_vector_field3d",
        "polar_plot",
        "region_plot",
        "revolution_plot3d",
        "spherical_plot3d",
        "streamline_plot",
    )
    if name not in allowed:
        raise ValueError("unknown Wolfram plot target " + name)
    return runtime.reflect.get(runtime.global_object, name)


def plot_call(
    target_name: str,
    head_name: str,
    value: Any,
    ranges: list[Any],
    option_records: list[dict[str, Any]],
    intent: dict[str, Any],
) -> Any:
    options, ordered, diagnostics, events = _translate_options(
        head_name, option_records
    )
    if head_name == "ListLinePlot" and "plotjoined" not in options:
        options["plotjoined"] = True
    target = _plot_target(target_name)
    if len(ranges) == 0:
        graphic = target(value, **options)
    elif len(ranges) == 1:
        graphic = target(value, ranges[0], **options)
    elif len(ranges) == 2:
        graphic = target(value, ranges[0], ranges[1], **options)
    elif len(ranges) == 3:
        graphic = target(value, ranges[0], ranges[1], ranges[2], **options)
    else:
        raise ValueError("Wolfram plots support at most three ranges")
    return _with_plot_context(graphic, head_name, intent, ordered, diagnostics, events)


def show_graphics(
    graphics_values: list[Any],
    option_records: list[dict[str, Any]],
    intent: dict[str, Any],
) -> Any:
    if len(graphics_values) == 0:
        raise ValueError("Show requires at least one graphic")
    options, ordered, diagnostics, events = _translate_options("Show", option_records)
    show_target = runtime.reflect.get(runtime.global_object, "show")
    graphic = show_target(graphics_values[0], *graphics_values[1:], **options)
    return _with_plot_context(graphic, "Show", intent, ordered, diagnostics, events)


def wolfram_line(points: Any) -> Any:
    values = list(points)
    if len(values) and len(values[0]) == 3:
        return sage.line3d(values)
    return sage.line(values)


def wolfram_point(points: Any) -> Any:
    values = list(points)
    candidate = values
    if len(values) and not isinstance(values[0], (list, tuple)):
        candidate = [values]
    if len(candidate) and len(candidate[0]) == 3:
        return sage.point3d(candidate)
    return sage.point(candidate)


def wolfram_polygon(points: Any) -> Any:
    values = list(points)
    if len(values) and len(values[0]) == 3:
        return sage.polygon3d(values)
    return sage.polygon(values)


def wolfram_circle(center: Any = (0, 0), radius: Any = 1) -> Any:
    return sage.circle(center, radius)


def wolfram_disk(center: Any = (0, 0), radius: Any = 1) -> Any:
    return sage.disk(center, radius, (0, 6.283185307179586))


def wolfram_rectangle(lower: Any, upper: Any) -> Any:
    return sage.polygon(
        [
            lower,
            (upper[0], lower[1]),
            upper,
            (lower[0], upper[1]),
        ]
    )


def wolfram_arrow(points: Any) -> Any:
    values = list(points)
    if len(values) != 2:
        raise ValueError("Arrow currently requires two endpoints")
    if len(values[0]) == 3:
        return sage.arrow3d(values[0], values[1])
    return sage.arrow(values[0], values[1])


def wolfram_text(value: Any, position: Any) -> Any:
    if len(position) == 3:
        return sage.text3d(value, position)
    return sage.text(value, position)


def wolfram_sphere(center: Any = (0, 0, 0), radius: Any = 1) -> Any:
    return sage.sphere(center, radius)


def _oriented_surface(graphic: Any, start: Any, end: Any) -> Any:
    first = [float(value) for value in start]
    second = [float(value) for value in end]
    vector = [second[index] - first[index] for index in range(3)]
    length = math.sqrt(sum(value * value for value in vector))
    if length == 0:
        raise ValueError("solid endpoints must be distinct")
    cosine = max(-1.0, min(1.0, vector[2] / length))
    angle = math.acos(cosine)
    axis = (-vector[1], vector[0], 0.0)
    if abs(axis[0]) + abs(axis[1]) < 1e-14:
        if vector[2] < 0:
            graphic = graphic.rotateX(math.pi)
    else:
        graphic = graphic.rotate(axis, angle)
    return graphic.translate(first)


def cylinder(bounds: Any = ((0, 0, 0), (0, 0, 1)), radius: Any = 1) -> Any:
    values = list(bounds)
    if len(values) != 2:
        raise ValueError("Cylinder requires two endpoints")
    first = values[0]
    second = values[1]
    length = math.sqrt(
        sum(float(second[index] - first[index]) ** 2 for index in range(3))
    )
    radius_value = float(radius)

    def cylinder_x(u: float, _v: float) -> float:
        return radius_value * math.cos(u)

    def cylinder_y(u: float, _v: float) -> float:
        return radius_value * math.sin(u)

    def cylinder_z(_u: float, v: float) -> float:
        return v

    surface = sage.parametric_plot3d(
        (cylinder_x, cylinder_y, cylinder_z),
        (0, 2 * math.pi),
        (0, length),
        plot_points=(33, 9),
    )
    lower = []
    upper = []
    for index in range(32):
        angle = 2 * math.pi * index / 32.0
        lower.append(
            (float(radius) * math.cos(angle), float(radius) * math.sin(angle), 0)
        )
        upper.append(
            (float(radius) * math.cos(angle), float(radius) * math.sin(angle), length)
        )
    surface += sage.polygon3d(lower)
    surface += sage.polygon3d(upper)
    return _oriented_surface(surface, first, second)


def cone(bounds: Any = ((0, 0, 0), (0, 0, 1)), radius: Any = 1) -> Any:
    values = list(bounds)
    if len(values) != 2:
        raise ValueError("Cone requires two endpoints")
    first = values[0]
    second = values[1]
    length = math.sqrt(
        sum(float(second[index] - first[index]) ** 2 for index in range(3))
    )
    radius_value = float(radius)

    def cone_x(u: float, v: float) -> float:
        return radius_value * (1.0 - v / length) * math.cos(u)

    def cone_y(u: float, v: float) -> float:
        return radius_value * (1.0 - v / length) * math.sin(u)

    def cone_z(_u: float, v: float) -> float:
        return v

    surface = sage.parametric_plot3d(
        (cone_x, cone_y, cone_z),
        (0, 2 * math.pi),
        (0, length),
        plot_points=(33, 9),
    )
    base = []
    for index in range(32):
        angle = 2 * math.pi * index / 32.0
        base.append((radius_value * math.cos(angle), radius_value * math.sin(angle), 0))
    surface += sage.polygon3d(base)
    return _oriented_surface(surface, first, second)


def torus(center: Any = (0, 0, 0), radii: Any = (0.5, 1)) -> Any:
    if isinstance(radii, (list, tuple)):
        if len(radii) != 2:
            raise ValueError("Torus radii must contain inner and outer radii")
        minor = float(radii[0])
        major = float(radii[1])
    else:
        major = float(radii)
        minor = major / 4.0

    def torus_x(u: float, v: float) -> float:
        return (major + minor * math.cos(v)) * math.cos(u)

    def torus_y(u: float, v: float) -> float:
        return (major + minor * math.cos(v)) * math.sin(u)

    def torus_z(_u: float, v: float) -> float:
        return minor * math.sin(v)

    return sage.parametric_plot3d(
        (torus_x, torus_y, torus_z),
        (0, 2 * math.pi),
        (0, 2 * math.pi),
        plot_points=(41, 17),
    ).translate(center)


def cuboid(bounds: Any = ((0, 0, 0), (1, 1, 1))) -> Any:
    values = list(bounds)
    if len(values) != 2:
        raise ValueError("Cuboid requires lower and upper corners")
    lower = values[0]
    upper = values[1]
    widths = [float(upper[index] - lower[index]) for index in range(3)]
    if not (widths[0] == widths[1] and widths[1] == widths[2]):
        raise NotImplementedError(
            "non-cubic Wolfram Cuboid dimensions are not implemented yet"
        )
    center = tuple(
        [(float(lower[index]) + float(upper[index])) / 2.0 for index in range(3)]
    )
    return sage.cube(center, widths[0])


def image_size(value: Any) -> Any:
    """Convert Wolfram pixel dimensions to Sage's inch-based figsize."""
    if isinstance(value, (list, tuple)):
        if len(value) != 2:
            raise ValueError("ImageSize must be a number or a pair")
        return [float(value[0]) / 100.0, float(value[1]) / 100.0]
    return float(value) / 100.0


Graphics = graphics
Graphics3D = graphics3d
PlotCall = plot_call
Show = show_graphics
Line = wolfram_line
Point = wolfram_point
Polygon = wolfram_polygon
Circle = wolfram_circle
Disk = wolfram_disk
Rectangle = wolfram_rectangle
Arrow = wolfram_arrow
Text = wolfram_text
Sphere = wolfram_sphere
Cuboid = cuboid
Cylinder = cylinder
Cone = cone
Torus = torus
ImageSize = image_size
Opacity = opacity
Thickness = thickness
PointSize = point_size
RGBColor = rgb_color
GrayLevel = gray_level
Hue = hue_color
Directive = directive
Style = style
FindMinimum = find_minimum
FindMaximum = find_maximum
FindMinValue = find_min_value
FindMaxValue = find_max_value
FindArgMin = find_arg_min
FindArgMax = find_arg_max
FindFit = find_fit
