"""Canonical scalar-root lowering, execution, code generation, and parsing."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from typing import Any, NoReturn

from ..model import NumericalProblem
from ..roots import find_root
from .expressions import expression_record, render_expression
from .model import (
    FrontendDiagnostic,
    NumericalFrontendIntent,
    OperationRef,
    UnsupportedFrontendError,
    canonical_language,
    opaque_callback_record,
)
from .portable import validated_callback
from .registry import FrontendRegistry, OperationAdapter

SCALAR_ROOT = OperationRef("roots", "scalar_root", 1)
_MACHINE_RTOL = 8.881784197001252e-16
_DEFAULT_OPTIONS: dict[str, Any] = {
    "method": "auto",
    "xtol": 1e-12,
    "rtol": _MACHINE_RTOL,
    "ftol": 1e-12,
    "max_iterations": 100,
    "max_evaluations": 256,
    "max_elapsed_ms": 30000,
    "trace": "iterations",
    "max_trace_events": 256,
    "max_trace_bytes": 1000000,
}
_METHODS = ("auto", "bisection", "brent", "newton", "secant")


def _unsupported(
    code: str,
    message: str,
    *,
    language: str,
    option: str | None = None,
    details: Mapping[str, Any] | None = None,
) -> NoReturn:
    raise UnsupportedFrontendError(
        FrontendDiagnostic(
            code,
            message,
            operation=SCALAR_ROOT.name,
            language=language,
            option=option,
            details=details,
        )
    )


def _flat_initial(initial: Any, language: str) -> list[float]:
    if hasattr(initial, "tolist"):
        initial = initial.tolist()
    if (
        isinstance(initial, (list, tuple))
        and len(initial) == 1
        and isinstance(initial[0], (list, tuple))
    ):
        initial = initial[0]
    values = list(initial) if isinstance(initial, (list, tuple)) else [initial]
    if len(values) not in (1, 2):
        _unsupported(
            "invalid_frontend_arguments",
            "scalar root initial data must contain one point or two bracket endpoints",
            language=language,
            details={"initial_count": len(values)},
        )
    result = []
    for value in values:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            _unsupported(
                "invalid_frontend_arguments",
                "scalar root initial data must be real numbers",
                language=language,
                details={"value_type": type(value).__name__},
            )
        numeric = float(value)
        if not math.isfinite(numeric):
            _unsupported(
                "invalid_frontend_arguments",
                "scalar root initial data must be finite",
                language=language,
            )
        result.append(numeric)
    if len(result) == 2 and result[0] >= result[1]:
        _unsupported(
            "invalid_frontend_arguments",
            "scalar root bracket endpoints must be strictly increasing",
            language=language,
            details={"bracket": result},
        )
    return result


def _canonical_options(
    options: Mapping[str, Any] | None,
    language: str,
) -> dict[str, Any]:
    answer = dict(_DEFAULT_OPTIONS)
    if options is None:
        return answer
    aliases = {
        "AccuracyGoal": "accuracy_goal",
        "MaxFunEvals": "max_evaluations",
        "MaxIterations": "max_iterations",
        "MaxIter": "max_iterations",
        "Method": "method",
        "PrecisionGoal": "precision_goal",
        "TolFun": "ftol",
        "TolX": "xtol",
        "Trace": "trace",
        "ftol": "ftol",
        "max_elapsed_ms": "max_elapsed_ms",
        "max_evaluations": "max_evaluations",
        "max_iterations": "max_iterations",
        "max_trace_bytes": "max_trace_bytes",
        "max_trace_events": "max_trace_events",
        "method": "method",
        "rtol": "rtol",
        "trace": "trace",
        "xtol": "xtol",
    }
    for source_name in options:
        name = aliases.get(source_name)
        if name is None:
            _unsupported(
                "unsupported_option",
                "unsupported " + language + " scalar-root option: " + source_name,
                language=language,
                option=source_name,
            )
        value = options[source_name]
        if name == "accuracy_goal":
            value = 10.0 ** (-int(value))
            name = "xtol"
        elif name == "precision_goal":
            value = 10.0 ** (-int(value))
            name = "ftol"
        answer[name] = value
    method = str(answer["method"]).strip().lower()
    method_aliases = {
        "brentq": "brent",
        "brent-dekker": "brent",
        "automatic": "auto",
    }
    method = method_aliases.get(method, method)
    if method not in _METHODS:
        _unsupported(
            "unsupported_option",
            "unsupported scalar-root method: " + method,
            language=language,
            option="method",
            details={"supported": list(_METHODS)},
        )
    answer["method"] = method
    for name in ("xtol", "rtol", "ftol"):
        numeric = float(answer[name])
        if numeric < 0 or (name == "xtol" and numeric == 0):
            _unsupported(
                "invalid_frontend_arguments",
                name + " must be nonnegative and xtol must be positive",
                language=language,
                option=name,
            )
        answer[name] = numeric
    if float(answer["rtol"]) < _MACHINE_RTOL:
        _unsupported(
            "invalid_frontend_arguments",
            "binary64 rtol must be at least four machine epsilons",
            language=language,
            option="rtol",
        )
    for name in (
        "max_iterations",
        "max_evaluations",
        "max_elapsed_ms",
        "max_trace_events",
        "max_trace_bytes",
    ):
        value = int(answer[name])
        if value <= 0:
            _unsupported(
                "invalid_frontend_arguments",
                name + " must be positive",
                language=language,
                option=name,
            )
        answer[name] = value
    answer["trace"] = str(answer["trace"])
    return answer


def scalar_root_intent(
    function: Any,
    initial: Any,
    *,
    source_language: str,
    source_name: str,
    options: Mapping[str, Any] | None = None,
    expression: str | None = None,
    variable: str = "x",
    source_text: str | None = None,
    source_span: Mapping[str, Any] | None = None,
) -> NumericalFrontendIntent:
    """Lower a natural scalar-root request into the canonical operation."""

    language = canonical_language(source_language)
    if not callable(function) and expression is None:
        _unsupported(
            "invalid_frontend_arguments",
            "scalar root lowering requires a callable or replayable expression",
            language=language,
        )
    values = _flat_initial(initial, language)
    canonical_options = _canonical_options(options, language)
    method = canonical_options["method"]
    if method == "auto":
        canonical_options["method"] = "brent" if len(values) == 2 else "newton"
    if canonical_options["method"] in ("bisection", "brent") and len(values) != 2:
        _unsupported(
            "invalid_frontend_arguments",
            str(canonical_options["method"]) + " requires two bracket endpoints",
            language=language,
            option="method",
        )
    if canonical_options["method"] == "secant" and len(values) != 2:
        _unsupported(
            "invalid_frontend_arguments",
            "secant requires two initial points",
            language=language,
            option="method",
        )
    function_value = (
        opaque_callback_record([variable])
        if expression is None
        else expression_record(expression, language=language, parameters=[variable])
    )
    bracket = (
        values
        if len(values) == 2
        and canonical_options["method"]
        in (
            "bisection",
            "brent",
        )
        else []
    )
    points = values if not bracket else list(bracket)
    bindings = (
        {"function": validated_callback(function_value, function)}
        if callable(function)
        else {}
    )
    return NumericalFrontendIntent(
        SCALAR_ROOT,
        operands={
            "function": function_value,
            "variable": variable,
            "bracket": bracket,
            "initial_points": points,
        },
        options=canonical_options,
        outputs=("value", "evidence"),
        source_language=language,
        source_name=source_name,
        classification="translated",
        source_text=source_text,
        source_span=source_span,
        metadata={"numeric_type": "binary64"},
        bindings=bindings,
    )


def matlab_fzero_intent(
    function: Any,
    initial: Any,
    options: Mapping[str, Any] | None = None,
    *,
    expression: str | None = None,
    variable: str = "x",
    source_text: str | None = None,
    source_span: Mapping[str, Any] | None = None,
) -> NumericalFrontendIntent:
    """Lower MATLAB `fzero` arguments without executing the solver."""

    return scalar_root_intent(
        function,
        initial,
        source_language="matlab",
        source_name="fzero",
        options=options,
        expression=expression,
        variable=variable,
        source_text=source_text,
        source_span=source_span,
    )


def wolfram_find_root_intent(
    function: Any,
    variable: str,
    initial: Any,
    options: Mapping[str, Any] | None = None,
    *,
    expression: str | None = None,
    source_text: str | None = None,
    source_span: Mapping[str, Any] | None = None,
) -> NumericalFrontendIntent:
    """Lower Wolfram `FindRoot` arguments without executing the solver."""

    return scalar_root_intent(
        function,
        initial,
        source_language="wolfram",
        source_name="FindRoot",
        options=options,
        expression=expression,
        variable=variable,
        source_text=source_text,
        source_span=source_span,
    )


def execute_scalar_root_intent(intent: NumericalFrontendIntent) -> Any:
    """Execute canonical root intent through the shared P1 solver."""

    if intent.operation_ref.key != SCALAR_ROOT.key:
        raise TypeError("scalar-root executor received " + intent.operation_ref.key)
    operands = intent.operands
    options = intent.options
    function = intent.binding("function")
    bracket = operands["bracket"]
    points = operands["initial_points"]
    source = intent.to_dict()["source"]
    function_value = operands["function"]
    expression = None
    if (
        isinstance(function_value, Mapping)
        and function_value.get("kind") == "expression"
    ):
        expression = render_expression(function_value, intent.source_language)
    common: dict[str, Any] = {
        "method": str(options["method"]),
        "xtol": float(options["xtol"]),
        "rtol": float(options["rtol"]),
        "ftol": float(options["ftol"]),
        "maxiter": int(options["max_iterations"]),
        "max_evaluations": int(options["max_evaluations"]),
        "max_elapsed_ms": int(options["max_elapsed_ms"]),
        "trace": str(options["trace"]),
        "max_trace_events": int(options["max_trace_events"]),
        "max_trace_bytes": int(options["max_trace_bytes"]),
        "expression": expression,
        "variable": str(operands["variable"]),
        "source_language": intent.source_language,
        "source": {
            "frontend_intent": intent.to_dict(),
            "frontend_digest": intent.digest,
            "original": source,
        },
    }
    if isinstance(bracket, list) and len(bracket) == 2:
        return find_root(function, float(bracket[0]), float(bracket[1]), **common)
    if not isinstance(points, list) or not points:
        raise ValueError("canonical scalar root intent has no initial data")
    common["x0"] = float(points[0])
    if len(points) > 1:
        common["x1"] = float(points[1])
    return find_root(function, **common)


def intent_from_root_problem(
    problem: NumericalProblem, method: str | None = None
) -> NumericalFrontendIntent:
    """Adapt an existing P1 problem without changing its domain package."""

    if problem.operation != SCALAR_ROOT.name or problem.domain != SCALAR_ROOT.domain:
        raise TypeError("problem is not a scalar-root problem")
    bracket = problem.bounds.get("bracket")
    points = problem.initial_data.get("points")
    initial = bracket if isinstance(bracket, list) and bracket else points
    function_value = problem.function_record
    expression = function_value.get("expression")
    variable = str(function_value.get("variable", "x"))
    source = problem.source_intent
    language = str(source.get("language", "sage"))
    options = {
        "method": problem.method if method is None else method,
        "xtol": problem.tolerances["xtol"],
        "rtol": problem.tolerances["rtol"],
        "ftol": problem.tolerances["ftol"],
        "max_iterations": problem.resource_budget.max_iterations,
        "max_evaluations": problem.resource_budget.max_evaluations,
        "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        "trace": problem.trace_policy.level,
        "max_trace_events": problem.trace_policy.max_events,
        "max_trace_bytes": problem.trace_policy.max_bytes,
    }
    return scalar_root_intent(
        problem.function,
        initial,
        source_language=language,
        source_name="find_root",
        options=options,
        expression=None if expression is None else str(expression),
        variable=variable,
    )


def _root_parts(
    intent: NumericalFrontendIntent, language: str
) -> tuple[str, str, list[Any], dict[str, Any]]:
    operands = intent.operands
    function_value = operands.get("function")
    if not isinstance(function_value, Mapping):
        raise TypeError("canonical root function must be a mapping")
    expression = render_expression(function_value, language)
    variable = str(operands["variable"])
    bracket = operands["bracket"]
    points = operands["initial_points"]
    initial = bracket if isinstance(bracket, list) and bracket else points
    if not isinstance(initial, list):
        raise TypeError("canonical root initial data must be a list")
    return expression, variable, initial, intent.options


def _emit_sage(intent: NumericalFrontendIntent) -> str:
    expression, variable, initial, options = _root_parts(intent, "sage")
    arguments = ", ".join(_number(value) for value in initial)
    if len(initial) == 1:
        arguments = "x0=" + arguments
    return (
        "from sagejs.numerics import find_root\n"
        + "result = find_root(lambda "
        + variable
        + ": "
        + expression
        + ", "
        + arguments
        + ', method="'
        + str(options["method"])
        + '", xtol='
        + _number(options["xtol"])
        + ", rtol="
        + _number(options["rtol"])
        + ", ftol="
        + _number(options["ftol"])
        + ", maxiter="
        + str(options["max_iterations"])
        + ")"
    )


def _emit_python_scipy(intent: NumericalFrontendIntent) -> str:
    expression, variable, initial, options = _root_parts(intent, "python-scipy")
    method = str(options["method"])
    methods = {
        "bisection": "bisect",
        "brent": "brentq",
        "newton": "newton",
        "secant": "secant",
    }
    target_method = methods.get(method)
    if target_method is None:
        _unsupported(
            "unsupported_option",
            "SciPy code generation requires a resolved scalar-root method",
            language="python-scipy",
            option="method",
        )
    common = (
        'method="'
        + str(target_method)
        + '", xtol='
        + _number(options["xtol"])
        + ", rtol="
        + _number(options["rtol"])
        + ", maxiter="
        + str(options["max_iterations"])
    )
    if method in ("bisection", "brent"):
        initial_text = (
            "bracket=(" + ", ".join(_number(value) for value in initial) + ")"
        )
    else:
        initial_text = "x0=" + _number(initial[0])
        if method == "secant":
            initial_text += ", x1=" + _number(initial[1])
    return (
        "import numpy as np\nfrom scipy import optimize\n"
        + "result = optimize.root_scalar(lambda "
        + variable
        + ": "
        + expression
        + ", "
        + initial_text
        + ", "
        + common
        + ")"
    )


def _emit_matlab(intent: NumericalFrontendIntent) -> str:
    expression, variable, initial, options = _root_parts(intent, "matlab")
    method = str(options["method"])
    if method not in ("brent", "newton"):
        _unsupported(
            "unsupported_option",
            "MATLAB fzero cannot preserve the requested " + method + " method",
            language="matlab",
            option="method",
            details={"supported_canonical_methods": ["brent", "newton"]},
        )
    initial_text = (
        "[" + " ".join(_number(value) for value in initial) + "]"
        if len(initial) == 2
        else _number(initial[0])
    )
    return (
        "options = optimset('TolX', "
        + _number(options["xtol"])
        + ", 'MaxIter', "
        + str(options["max_iterations"])
        + ", 'MaxFunEvals', "
        + str(options["max_evaluations"])
        + ");\nresult = fzero(@("
        + variable
        + ") "
        + expression
        + ", "
        + initial_text
        + ", options);"
    )


def _emit_wolfram(intent: NumericalFrontendIntent) -> str:
    expression, variable, initial, options = _root_parts(intent, "wolfram")
    methods = {"brent": "Brent", "newton": "Newton", "secant": "Secant"}
    method = str(options["method"])
    target_method = methods.get(method)
    if target_method is None:
        _unsupported(
            "unsupported_option",
            "Wolfram code generation requires a resolved scalar-root method",
            language="wolfram",
            option="method",
        )
    specification = (
        "{" + variable + ", " + ", ".join(_number(value) for value in initial) + "}"
    )
    accuracy = _decimal_goal(float(options["xtol"]), "xtol", "wolfram")
    precision = _decimal_goal(float(options["ftol"]), "ftol", "wolfram")
    return (
        "result = FindRoot["
        + expression
        + " == 0, "
        + specification
        + ', Method -> "'
        + str(target_method)
        + '", AccuracyGoal -> '
        + str(accuracy)
        + ", PrecisionGoal -> "
        + str(precision)
        + ", MaxIterations -> "
        + str(options["max_iterations"])
        + "]"
    )


def _number(value: Any) -> str:
    numeric = float(value)
    integer = int(numeric)
    if numeric == integer and abs(numeric) < 1e16:
        return str(integer)
    return repr(numeric)


def _decimal_goal(value: float, option: str, language: str) -> int:
    if value <= 0:
        _unsupported(
            "unsupported_option",
            "Wolfram decimal goals require positive tolerances",
            language=language,
            option=option,
        )
    goal = int(round(-math.log10(value)))
    target = 10.0 ** (-goal)
    if abs(value - target) > abs(target) * 1e-12:
        _unsupported(
            "unsupported_option",
            "Wolfram code generation cannot exactly express " + option,
            language=language,
            option=option,
            details={"value": value},
        )
    return goal


def _parse_failure(language: str, message: str, source: str) -> Any:
    _unsupported(
        "parse_failure",
        message,
        language=language,
        details={"source": source},
    )


def _parse_sage(source: str) -> NumericalFrontendIntent:
    pattern = re.compile(
        r"result\s*=\s*find_root\(lambda\s+(\w+)\s*:\s*(.*?),\s*(?:(x0)=)?([^,]+)(?:,\s*([^,]+))?,\s*method=\"([^\"]+)\",\s*xtol=([^,]+),\s*rtol=([^,]+),\s*ftol=([^,]+),\s*maxiter=(\d+)\)\s*$",
        re.DOTALL,
    )
    match = pattern.search(source)
    if match is None:
        _parse_failure("sage", "source is not emitted Sage scalar-root code", source)
    assert match is not None
    first = float(match.group(4).strip())
    second = match.group(5)
    initial = [first] if match.group(3) else [first, float(str(second).strip())]
    return scalar_root_intent(
        None,
        initial,
        source_language="sage",
        source_name="find_root",
        options={
            "method": match.group(6),
            "xtol": float(match.group(7)),
            "rtol": float(match.group(8)),
            "ftol": float(match.group(9)),
            "max_iterations": int(match.group(10)),
        },
        expression=match.group(2).strip(),
        variable=match.group(1),
        source_text=source,
    )


def _parse_python_scipy(source: str) -> NumericalFrontendIntent:
    pattern = re.compile(
        r"result\s*=\s*optimize\.root_scalar\(lambda\s+(\w+)\s*:\s*(.*?),\s*(bracket=\(([^)]+)\)|x0=([^,]+)(?:,\s*x1=([^,]+))?),\s*method=\"([^\"]+)\",\s*xtol=([^,]+),\s*rtol=([^,]+),\s*maxiter=(\d+)\)\s*$",
        re.DOTALL,
    )
    match = pattern.search(source)
    if match is None:
        _parse_failure(
            "python-scipy", "source is not emitted SciPy scalar-root code", source
        )
    assert match is not None
    if match.group(4) is not None:
        initial = [float(value.strip()) for value in match.group(4).split(",")]
    else:
        initial = [float(match.group(5))]
        if match.group(6) is not None:
            initial.append(float(match.group(6)))
    methods = {
        "bisect": "bisection",
        "brentq": "brent",
        "newton": "newton",
        "secant": "secant",
    }
    return scalar_root_intent(
        None,
        initial,
        source_language="python-scipy",
        source_name="scipy.optimize.root_scalar",
        options={
            "method": methods[match.group(7)],
            "xtol": float(match.group(8)),
            "rtol": float(match.group(9)),
            "max_iterations": int(match.group(10)),
        },
        expression=match.group(2).strip(),
        variable=match.group(1),
        source_text=source,
    )


def _parse_matlab(source: str) -> NumericalFrontendIntent:
    pattern = re.compile(
        r"optimset\('TolX',\s*([^,]+),\s*'MaxIter',\s*(\d+),\s*'MaxFunEvals',\s*(\d+)\);\s*result\s*=\s*fzero\(@\((\w+)\)\s*(.*?),\s*(\[[^\]]+\]|[^,]+),\s*options\);\s*$",
        re.DOTALL,
    )
    match = pattern.search(source)
    if match is None:
        _parse_failure(
            "matlab", "source is not emitted MATLAB scalar-root code", source
        )
    assert match is not None
    raw_initial = match.group(6).strip()
    initial = (
        [float(value) for value in raw_initial[1:-1].split()]
        if raw_initial.startswith("[")
        else [float(raw_initial)]
    )
    return scalar_root_intent(
        None,
        initial,
        source_language="matlab",
        source_name="fzero",
        options={
            "method": "brent" if len(initial) == 2 else "newton",
            "xtol": float(match.group(1)),
            "max_iterations": int(match.group(2)),
            "max_evaluations": int(match.group(3)),
        },
        expression=match.group(5).strip(),
        variable=match.group(4),
        source_text=source,
    )


def _parse_wolfram(source: str) -> NumericalFrontendIntent:
    pattern = re.compile(
        r"result\s*=\s*FindRoot\[(.*?)\s*==\s*0,\s*\{(\w+),\s*([^}]+)\},\s*Method\s*->\s*\"([^\"]+)\",\s*AccuracyGoal\s*->\s*(\d+),\s*PrecisionGoal\s*->\s*(\d+),\s*MaxIterations\s*->\s*(\d+)\]\s*$",
        re.DOTALL,
    )
    match = pattern.search(source)
    if match is None:
        _parse_failure(
            "wolfram", "source is not emitted Wolfram scalar-root code", source
        )
    assert match is not None
    initial = [float(value.strip()) for value in match.group(3).split(",")]
    methods = {"Brent": "brent", "Newton": "newton", "Secant": "secant"}
    return scalar_root_intent(
        None,
        initial,
        source_language="wolfram",
        source_name="FindRoot",
        options={
            "method": methods[match.group(4)],
            "AccuracyGoal": int(match.group(5)),
            "PrecisionGoal": int(match.group(6)),
            "MaxIterations": int(match.group(7)),
        },
        expression=match.group(1).strip(),
        variable=match.group(2),
        source_text=source,
    )


def _lower_sage_root(
    function: Any, initial: Any, **options: Any
) -> NumericalFrontendIntent:
    return scalar_root_intent(
        function,
        initial,
        source_language="sage",
        source_name="find_root",
        **options,
    )


def _lower_python_scipy_root(
    function: Any, initial: Any, **options: Any
) -> NumericalFrontendIntent:
    return scalar_root_intent(
        function,
        initial,
        source_language="python-scipy",
        source_name="scipy.optimize.root_scalar",
        **options,
    )


def scalar_root_adapter() -> OperationAdapter:
    """Return a fresh adapter suitable for a caller-owned registry."""

    return OperationAdapter(
        SCALAR_ROOT,
        aliases={
            "sage": ("find_root", "numerical_root"),
            "python-scipy": ("root_scalar", "scipy.optimize.root_scalar"),
            "matlab": ("fzero",),
            "wolfram": ("FindRoot",),
        },
        lowerers={
            "sage": _lower_sage_root,
            "python-scipy": _lower_python_scipy_root,
            "matlab": matlab_fzero_intent,
            "wolfram": wolfram_find_root_intent,
        },
        emitters={
            "sage": _emit_sage,
            "python-scipy": _emit_python_scipy,
            "matlab": _emit_matlab,
            "wolfram": _emit_wolfram,
        },
        parsers={
            "sage": _parse_sage,
            "python-scipy": _parse_python_scipy,
            "matlab": _parse_matlab,
            "wolfram": _parse_wolfram,
        },
        executor=execute_scalar_root_intent,
    )


def create_frontend_registry(
    adapters: Sequence[OperationAdapter] = (),
) -> FrontendRegistry:
    """Create the complete lazy built-in registry plus optional adapters."""

    from .operations import operation_adapters

    registry = FrontendRegistry((scalar_root_adapter(),) + operation_adapters())
    for adapter in adapters:
        registry.register(adapter)
    return registry


def emit_code(intent: NumericalFrontendIntent, language: str) -> str:
    """Emit outward source through the complete built-in registry."""

    return create_frontend_registry().emit(intent, language)


def parse_code(
    source: str, language: str, operation: OperationRef = SCALAR_ROOT
) -> NumericalFrontendIntent:
    """Parse source emitted by the matching operation adapter where supported."""

    return create_frontend_registry().parse(source, language, operation)


__all__ = [
    "SCALAR_ROOT",
    "create_frontend_registry",
    "emit_code",
    "execute_scalar_root_intent",
    "intent_from_root_problem",
    "matlab_fzero_intent",
    "parse_code",
    "scalar_root_adapter",
    "scalar_root_intent",
    "wolfram_find_root_intent",
]
