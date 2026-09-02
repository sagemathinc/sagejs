"""Canonical multilingual adapters for the stable numerical domain surface.

The adapters in this module only translate and dispatch.  Numerical kernels
remain owned by their domain packages and are imported lazily by execution.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from typing import Any, NoReturn

from .._json import JSONValue
from .model import (
    FrontendDiagnostic,
    NumericalFrontendIntent,
    OperationRef,
    UnsupportedFrontendError,
    canonical_language,
)
from .portable import (
    attach_intent,
    callback_record,
    portable_value,
    render_callback,
    render_value,
    runtime_value,
    validated_callback,
)
from .registry import OperationAdapter
from .roundtrip import parse_catalog_source


class _Definition:
    def __init__(
        self,
        domain: str,
        name: str,
        operands: Sequence[str],
        *,
        aliases: Mapping[str, Sequence[str]],
        module: str,
        function: str,
        callback: str | None = None,
        outputs: Sequence[str] = ("value", "evidence"),
        options: Sequence[str] = (),
        classification: str = "translated",
        targets: Sequence[str] = (),
        capability_operations: Sequence[str] | None = None,
    ) -> None:
        self.operation = OperationRef(domain, name, 1)
        self.operands = tuple(operands)
        self.aliases = {key: tuple(value) for key, value in aliases.items()}
        self.module = module
        self.function = function
        self.callback = callback
        self.outputs = tuple(outputs)
        self.options = tuple(options)
        self.classification = classification
        self.targets = tuple(targets) if targets else _LANGUAGES
        self.capability_operations = (
            (domain + "." + name,)
            if capability_operations is None
            else tuple(capability_operations)
        )


_LANGUAGES = ("sage", "python-scipy", "matlab", "wolfram")


def _aliases(
    sage: Sequence[str],
    python: Sequence[str],
    matlab: Sequence[str],
    wolfram: Sequence[str],
) -> dict[str, Sequence[str]]:
    aliases = {
        "sage": sage,
        "python-scipy": python,
        "matlab": matlab,
        "wolfram": wolfram,
    }
    return {language: names for language, names in aliases.items() if names}


_DEFINITIONS = (
    _Definition(
        "linear_algebra",
        "linear_solve",
        ("matrix", "right"),
        aliases=_aliases(
            ("solve", "dense_solve"),
            ("numpy.linalg.solve", "scipy.linalg.solve"),
            ("linsolve", "mldivide"),
            ("LinearSolve",),
        ),
        module="sagejs.numerics.linear_algebra",
        function="solve",
        options=(
            "method",
            "assume",
            "tolerance",
            "max_sweeps",
            "max_elapsed_ms",
            "trace",
        ),
    ),
    _Definition(
        "linear_algebra",
        "least_squares",
        ("matrix", "right"),
        aliases=_aliases(
            ("linear_least_squares",),
            ("numpy.linalg.lstsq", "scipy.linalg.lstsq"),
            ("lsqminnorm",),
            ("LeastSquares",),
        ),
        module="sagejs.numerics.linear_algebra",
        function="least_squares",
        options=("tolerance", "max_sweeps", "max_elapsed_ms", "trace"),
    ),
    _Definition(
        "spectral",
        "symmetric_eigen",
        ("matrix",),
        aliases=_aliases(
            ("eigh", "symmetric_eigen"),
            ("numpy.linalg.eigh", "scipy.linalg.eigh"),
            ("eig_symmetric",),
            (),
        ),
        module="sagejs.numerics.spectral",
        function="eigh",
        options=("tolerance", "max_iterations", "max_elapsed_ms", "trace"),
        outputs=("eigenvalues", "eigenvectors", "evidence"),
        targets=("sage", "python-scipy"),
    ),
    _Definition(
        "spectral",
        "general_eigen",
        ("matrix",),
        aliases=_aliases(
            ("eig", "general_eigen"),
            ("numpy.linalg.eig", "scipy.linalg.eig"),
            ("eig_general",),
            (),
        ),
        module="sagejs.numerics.spectral",
        function="eig",
        options=("tolerance", "max_iterations", "max_elapsed_ms", "trace"),
        outputs=("eigenvalues", "eigenvectors", "evidence"),
        classification="extension",
        targets=("sage", "python-scipy"),
    ),
    _Definition(
        "spectral",
        "singular_value_decomposition",
        ("matrix",),
        aliases=_aliases(
            ("svd",),
            ("numpy.linalg.svd", "scipy.linalg.svd"),
            ("svd",),
            (),
        ),
        module="sagejs.numerics.spectral",
        function="svd",
        options=("tolerance", "max_iterations", "max_elapsed_ms", "trace"),
        outputs=("u", "singular_values", "vh", "evidence"),
        targets=("sage", "python-scipy"),
    ),
    _Definition(
        "spectral",
        "fourier_transform",
        ("samples",),
        aliases=_aliases(
            ("fft",),
            ("numpy.fft.fft", "scipy.fft.fft"),
            (),
            (),
        ),
        module="sagejs.numerics.spectral",
        function="fft",
        options=("norm", "max_points", "max_elapsed_ms", "trace"),
    ),
    _Definition(
        "spectral",
        "convolution",
        ("left", "right"),
        aliases=_aliases(
            ("convolve",),
            ("numpy.convolve", "scipy.signal.convolve"),
            ("conv",),
            (),
        ),
        module="sagejs.numerics.spectral",
        function="convolve",
        options=("mode", "method", "max_elapsed_ms", "trace"),
        targets=("sage", "python-scipy", "matlab"),
    ),
    _Definition(
        "approximation",
        "interpolation",
        ("nodes", "values"),
        aliases=_aliases(
            ("interpolate",),
            ("scipy.interpolate.BarycentricInterpolator",),
            (),
            (),
        ),
        module="sagejs.numerics.approximation",
        function="interpolate",
        options=("method", "trace"),
        outputs=("interpolant", "evidence"),
        targets=("sage", "python-scipy"),
        capability_operations=(
            "approximation.polynomial_interpolation",
            "approximation.piecewise_interpolation",
        ),
    ),
    _Definition(
        "approximation",
        "cubic_spline",
        ("nodes", "values"),
        aliases=_aliases(
            ("cubic_spline",),
            ("scipy.interpolate.CubicSpline",),
            (),
            (),
        ),
        module="sagejs.numerics.approximation",
        function="cubic_spline",
        options=("boundary", "extrapolate", "trace"),
        outputs=("spline", "evidence"),
        targets=("sage", "python-scipy"),
    ),
    _Definition(
        "integration",
        "definite_integral",
        ("function", "lower", "upper"),
        aliases=_aliases(
            ("integrate", "numerical_integral"),
            ("scipy.integrate.quad",),
            ("integral",),
            ("NIntegrate",),
        ),
        module="sagejs.numerics.integration",
        function="integrate",
        callback="function",
        options=(
            "method",
            "absolute_tolerance",
            "relative_tolerance",
            "max_evaluations",
            "max_elapsed_ms",
            "trace",
        ),
    ),
    _Definition(
        "optimization",
        "scalar_minimum",
        ("function", "lower", "upper"),
        aliases=_aliases(
            ("minimize_scalar",),
            ("scipy.optimize.minimize_scalar",),
            ("fminbnd",),
            (),
        ),
        module="sagejs.numerics.optimization",
        function="minimize_scalar",
        callback="function",
        options=(
            "method",
            "xtol",
            "rtol",
            "gtol",
            "maxiter",
            "max_evaluations",
            "max_elapsed_ms",
            "trace",
        ),
    ),
    _Definition(
        "optimization",
        "minimize",
        ("function", "x0"),
        aliases=_aliases(
            ("minimize",),
            ("scipy.optimize.minimize",),
            ("fminsearch",),
            (),
        ),
        module="sagejs.numerics.optimization",
        function="minimize",
        callback="function",
        options=(
            "method",
            "xtol",
            "ftol",
            "gtol",
            "maxiter",
            "max_evaluations",
            "trace",
        ),
        targets=("sage", "python-scipy", "matlab"),
    ),
    _Definition(
        "nonlinear_systems",
        "nonlinear_system",
        ("function", "x0"),
        aliases=_aliases(
            ("solve_nonlinear_system",),
            ("scipy.optimize.root",),
            ("fsolve",),
            (),
        ),
        module="sagejs.numerics.optimization",
        function="solve_nonlinear_system",
        callback="function",
        options=("method", "xtol", "ftol", "maxiter", "max_evaluations", "trace"),
        targets=("sage", "python-scipy", "matlab"),
        capability_operations=("optimization.nonlinear_system",),
    ),
    _Definition(
        "least_squares",
        "nonlinear_least_squares",
        ("residuals", "x0"),
        aliases=_aliases(
            ("nonlinear_least_squares",),
            ("scipy.optimize.least_squares",),
            ("lsqnonlin",),
            (),
        ),
        module="sagejs.numerics.optimization",
        function="least_squares",
        callback="residuals",
        options=(
            "method",
            "xtol",
            "ftol",
            "gtol",
            "maxiter",
            "max_evaluations",
            "trace",
        ),
        targets=("sage", "python-scipy", "matlab"),
        capability_operations=("optimization.nonlinear_least_squares",),
    ),
    _Definition(
        "fitting",
        "linear_fit",
        ("xdata", "ydata"),
        aliases=_aliases(
            ("linear_fit",),
            ("numpy.polyfit", "sagejs.linear_fit"),
            ("polyfit",),
            ("LinearModelFit",),
        ),
        module="sagejs.numerics.optimization",
        function="linear_fit",
        options=("max_evaluations", "max_elapsed_ms", "trace"),
        outputs=("parameters", "evidence"),
        targets=("sage", "python-scipy", "matlab"),
        capability_operations=("optimization.linear_fit",),
    ),
    _Definition(
        "ode",
        "initial_value_problem",
        ("function", "t_span", "y0"),
        aliases=_aliases(
            ("solve_ivp",),
            ("scipy.integrate.solve_ivp",),
            ("ode45",),
            (),
        ),
        module="sagejs.numerics.ode",
        function="solve_ivp",
        callback="function",
        options=(
            "method",
            "rtol",
            "atol",
            "max_step",
            "max_evaluations",
            "max_elapsed_ms",
            "trace",
        ),
        outputs=("trajectory", "events", "evidence"),
        targets=("sage", "python-scipy", "matlab"),
    ),
    _Definition(
        "statistics",
        "descriptive_statistics",
        ("data",),
        aliases=_aliases(
            ("describe",),
            ("scipy.stats.describe",),
            ("sagejs_describe",),
            ("SageJSDescribe",),
        ),
        module="sagejs.numerics.statistics",
        function="describe",
        options=("ddof", "nan_policy", "trace"),
        targets=("sage", "python-scipy", "matlab"),
    ),
    _Definition(
        "statistics",
        "one_sample_t_test",
        ("data", "population_mean"),
        aliases=_aliases(
            ("one_sample_t_test",),
            ("scipy.stats.ttest_1samp",),
            (),
            ("OneSampleTTest",),
        ),
        module="sagejs.numerics.statistics",
        function="one_sample_t_test",
        options=("alternative", "confidence", "nan_policy", "trace"),
        targets=("sage", "python-scipy"),
    ),
    _Definition(
        "statistics",
        "two_sample_t_test",
        ("first", "second"),
        aliases=_aliases(
            ("two_sample_t_test",),
            ("scipy.stats.ttest_ind",),
            (),
            ("TwoSampleTTest",),
        ),
        module="sagejs.numerics.statistics",
        function="two_sample_t_test",
        options=("equal_variance", "alternative", "confidence", "nan_policy", "trace"),
        targets=("sage", "python-scipy"),
    ),
    _Definition(
        "statistics",
        "linear_regression",
        ("x", "y"),
        aliases=_aliases(
            ("linear_regression",),
            ("scipy.stats.linregress",),
            (),
            ("LinearModelFitData",),
        ),
        module="sagejs.numerics.statistics",
        function="linear_regression",
        options=("confidence", "alternative", "nan_policy", "trace"),
        outputs=("model", "inference", "evidence"),
        targets=("sage", "python-scipy"),
    ),
    _Definition(
        "sweeps",
        "parameter_sweep",
        ("parameters", "evaluator"),
        aliases=_aliases(
            ("run_parameter_sweep",),
            ("sagejs.run_parameter_sweep",),
            ("arrayfun",),
            ("Map",),
        ),
        module="sagejs.numerics.sweeps",
        function="run_parameter_sweep",
        callback="evaluator",
        options=("seed", "seed_offset", "concurrency", "mode"),
        outputs=("items", "aggregate_evidence"),
        classification="extension",
        targets=("sage", "python-scipy"),
    ),
)

_BY_KEY = {definition.operation.key: definition for definition in _DEFINITIONS}

_OPTION_ALIASES = {
    "AbsTol": "atol",
    "Alternative": "alternative",
    "ConfidenceLevel": "confidence",
    "EqualVariance": "equal_variance",
    "MaxFunctionEvaluations": "max_evaluations",
    "MaxFunEvals": "max_evaluations",
    "MaxIterations": "maxiter",
    "MaxIter": "maxiter",
    "MaxStep": "max_step",
    "Method": "method",
    "NaNPolicy": "nan_policy",
    "Norm": "norm",
    "RelTol": "rtol",
    "TolFun": "ftol",
    "TolX": "xtol",
    "Trace": "trace",
}


class FrontendExecutionResult:
    """Canonical intent plus the domain's complete structured numerical result."""

    def __init__(self, intent: NumericalFrontendIntent, numerical_result: Any) -> None:
        self.frontend_intent = intent
        self.numerical_result = numerical_result

    def __getattr__(self, name: str) -> Any:
        return getattr(self.numerical_result, name)

    @property
    def value(self) -> Any:
        """Return the conventional primary value without discarding evidence.

        Most domains expose one structured `value`. Parameter sweeps instead
        expose ordered item records, so their natural view is the ordered item
        values. Failed or skipped items retain `None` in that projection and
        remain inspectable through `numerical_result`.
        """

        if hasattr(self.numerical_result, "value"):
            return self.numerical_result.value
        if hasattr(self.numerical_result, "items"):
            return [item.value for item in self.numerical_result.items]
        return self.numerical_result

    def to_dict(self) -> dict[str, Any]:
        domain = self.numerical_result
        record = domain.to_dict() if hasattr(domain, "to_dict") else domain
        return {
            "kind": "numerical_frontend_result",
            "frontend_intent": self.frontend_intent.to_dict(),
            "frontend_digest": self.frontend_intent.digest,
            "numerical_result": record,
        }

    def to_code(self, language: str) -> str:
        from .scalar_root import emit_code

        return emit_code(self.frontend_intent, language)

    def to_markdown(self) -> str:
        if hasattr(self.numerical_result, "to_markdown"):
            return self.numerical_result.to_markdown()
        return "Numerical frontend result for `" + self.frontend_intent.operation + "`."


def operation_refs() -> tuple[OperationRef, ...]:
    """Return the stable non-root canonical operation catalog."""

    return tuple(definition.operation for definition in _DEFINITIONS)


def operation_ref(name: str) -> OperationRef:
    """Resolve a unique canonical operation name."""

    matches = [item.operation for item in _DEFINITIONS if item.operation.name == name]
    if len(matches) != 1:
        raise ValueError("unknown or ambiguous canonical numerical operation: " + name)
    return matches[0]


def _unsupported(
    code: str,
    message: str,
    definition: _Definition,
    language: str,
    *,
    option: str | None = None,
    details: Mapping[str, Any] | None = None,
) -> NoReturn:
    raise UnsupportedFrontendError(
        FrontendDiagnostic(
            code,
            message,
            operation=definition.operation.name,
            language=language,
            option=option,
            details=details,
        )
    )


def lower_operation(
    operation: OperationRef | str,
    language: str,
    source_name: str,
    *arguments: Any,
    **options: Any,
) -> NumericalFrontendIntent:
    """Lower one catalog operation without going through an alias lookup."""

    reference = operation_ref(operation) if isinstance(operation, str) else operation
    definition = _BY_KEY.get(reference.key)
    if definition is None:
        raise ValueError("unknown canonical numerical operation: " + reference.key)
    return _lower(definition, language, source_name, arguments, options)


def _lower(
    definition: _Definition,
    language: str,
    source_name: str,
    arguments: Sequence[Any],
    options: Mapping[str, Any],
) -> NumericalFrontendIntent:
    source = canonical_language(language)
    if len(arguments) != len(definition.operands):
        _unsupported(
            "invalid_frontend_arguments",
            source_name
            + " expects "
            + str(len(definition.operands))
            + " numerical arguments",
            definition,
            source,
            details={"received": len(arguments)},
        )
    settings = dict(options)
    expression = settings.pop("expression", None)
    parameters = settings.pop("parameters", None)
    source_text = settings.pop("source_text", None)
    source_span = settings.pop("source_span", None)
    normalized: dict[str, JSONValue] = {}
    for name in settings:
        canonical = _OPTION_ALIASES.get(name, name)
        if definition.operation.name == "definite_integral":
            canonical = {
                "atol": "absolute_tolerance",
                "rtol": "relative_tolerance",
            }.get(canonical, canonical)
        if (
            definition.operation.name
            in (
                "symmetric_eigen",
                "general_eigen",
                "singular_value_decomposition",
            )
            and canonical == "maxiter"
        ):
            canonical = "max_iterations"
        if canonical not in definition.options:
            _unsupported(
                "unsupported_option",
                "unsupported " + source + " option for " + source_name + ": " + name,
                definition,
                source,
                option=name,
                details={"supported": list(definition.options)},
            )
        if canonical in normalized:
            _unsupported(
                "invalid_frontend_arguments",
                "the same canonical option was supplied more than once",
                definition,
                source,
                option=canonical,
            )
        normalized[canonical] = portable_value(settings[name])
    operand_values: dict[str, JSONValue] = {}
    bindings: dict[str, Any] = {}
    for index, name in enumerate(definition.operands):
        value = arguments[index]
        if name == definition.callback:
            callback_parameters = _callback_parameters(
                definition, parameters, arguments
            )
            record, live = callback_record(
                value,
                expression,
                language=source,
                parameters=callback_parameters,
            )
            operand_values[name] = record
            if "callback" in live:
                callback = validated_callback(record, live["callback"])
                if definition.operation.name == "parameter_sweep" and source in (
                    "matlab",
                    "wolfram",
                ):

                    def evaluator(
                        parameter: Any,
                        context: Any,
                        callback: Callable[..., Any] = callback,
                    ) -> Any:
                        del context
                        return callback(parameter)

                    bindings[name] = evaluator
                else:
                    bindings[name] = callback
        else:
            operand_values[name] = portable_value(value)
    return NumericalFrontendIntent(
        definition.operation,
        operands=operand_values,
        options=normalized,
        outputs=definition.outputs,
        source_language=source,
        source_name=source_name,
        classification=definition.classification,
        source_text=None if source_text is None else str(source_text),
        source_span=source_span,
        metadata={
            "numeric_type": "binary64",
            "frontend_surface": "numerical-catalog-v1",
        },
        bindings=bindings,
    )


def _callback_parameters(
    definition: _Definition,
    parameters: Any,
    arguments: Sequence[Any],
) -> tuple[str, ...]:
    expected = _default_callback_parameters(definition, arguments)
    if parameters is not None:
        if isinstance(parameters, str) or not isinstance(parameters, Sequence):
            raise TypeError("callback parameters must be a sequence of names")
        provided = tuple(str(item) for item in parameters)
        if len(provided) != len(expected):
            raise ValueError(
                "callback parameter count does not match the canonical operation"
            )
        return provided
    return expected


def _default_callback_parameters(
    definition: _Definition, arguments: Sequence[Any]
) -> tuple[str, ...]:
    name = definition.operation.name
    if name in ("definite_integral", "scalar_minimum"):
        return ("x",)
    if name == "parameter_sweep":
        return ("parameter",)
    if name == "initial_value_problem":
        y0 = arguments[2]
        size = len(y0) if isinstance(y0, Sequence) else 1
        return ("t",) + tuple("y" + str(index) for index in range(size))
    initial = arguments[1]
    size = len(initial) if isinstance(initial, Sequence) else 1
    return tuple("x" + str(index) for index in range(size))


def _make_lowerer(definition: _Definition, language: str, source_name: str) -> Any:
    def lowerer(*arguments: Any, **options: Any) -> NumericalFrontendIntent:
        if definition.operation.name == "parameter_sweep" and language in (
            "matlab",
            "wolfram",
        ):
            if len(arguments) != 2:
                return _lower(definition, language, source_name, arguments, options)
            arguments = (arguments[1], arguments[0])
        return _lower(definition, language, source_name, arguments, options)

    return lowerer


def _make_emitter(definition: _Definition, language: str) -> Any:
    def emitter(intent: NumericalFrontendIntent) -> str:
        body = _emit_body(definition, intent, language)
        source = attach_intent(body, intent, language)
        # An advertised emitter is also a checked round-trip capability.  Run
        # the bounded source parser now so lossy shapes or literals fail at the
        # outward boundary rather than producing code that cannot substantiate
        # its canonical intent later.
        try:
            _make_parser(definition, language)(source)
        except UnsupportedFrontendError as error:
            _unsupported(
                "unsupported_target",
                "outward "
                + language
                + " code cannot preserve this canonical "
                + definition.operation.name
                + " intent",
                definition,
                language,
                details={"round_trip_diagnostic": error.diagnostic.to_dict()},
            )
        return source

    return emitter


def _make_parser(definition: _Definition, language: str) -> Any:
    def parser(source: str) -> NumericalFrontendIntent:
        aliases = definition.aliases.get(language)
        source_name = definition.operation.name if aliases is None else aliases[0]

        def lower(*arguments: Any, **options: Any) -> NumericalFrontendIntent:
            return _lower(definition, language, source_name, arguments, options)

        return parse_catalog_source(
            source,
            language,
            definition.operation,
            operands=definition.operands,
            callback=definition.callback,
            callback_shape=(
                None
                if definition.callback is None
                else _callback_shape(definition.operation.name)
            ),
            source_name=source_name,
            lower=lower,
            emit_body=lambda intent, target: _emit_body(definition, intent, target),
        )

    return parser


def _make_executor(definition: _Definition) -> Any:
    def executor(intent: NumericalFrontendIntent) -> Any:
        return execute_operation_intent(intent)

    return executor


def operation_adapters() -> tuple[OperationAdapter, ...]:
    """Return fresh adapters for every stable non-root numerical operation."""

    adapters = []
    for definition in _DEFINITIONS:
        lowerers = {}
        emitters = {}
        parsers = {}
        for language in _LANGUAGES:
            aliases = definition.aliases.get(language)
            if aliases is not None:
                lowerers[language] = _make_lowerer(definition, language, aliases[0])
            if language in definition.targets:
                emitters[language] = _make_emitter(definition, language)
                parsers[language] = _make_parser(definition, language)
        adapters.append(
            OperationAdapter(
                definition.operation,
                aliases=definition.aliases,
                lowerers=lowerers,
                emitters=emitters,
                parsers=parsers,
                executor=_make_executor(definition),
                classification=definition.classification,
                capability_operations=definition.capability_operations,
            )
        )
    return tuple(adapters)


def execute_operation_intent(intent: NumericalFrontendIntent) -> Any:
    """Execute a catalog intent through its stable public package function."""

    definition = _BY_KEY.get(intent.operation_ref.key)
    if definition is None:
        raise TypeError("catalog executor received " + intent.operation_ref.key)
    module = __import__(definition.module, fromlist=[definition.function])
    function = getattr(module, definition.function)
    operands = intent.operands
    arguments = []
    for name in definition.operands:
        if name == definition.callback:
            arguments.append(intent.binding(name))
        else:
            arguments.append(runtime_value(operands[name]))
    settings = {name: runtime_value(value) for name, value in intent.options.items()}
    result = function(*arguments, **settings)
    return FrontendExecutionResult(intent, result)


def natural_value(result: Any) -> Any:
    """Project a structured result to the conventional frontend return value."""

    if isinstance(result, FrontendExecutionResult):
        return result.value
    if hasattr(result, "value"):
        return result.value
    if hasattr(result, "items"):
        return [item.value for item in result.items]
    return result


def _emit_body(
    definition: _Definition, intent: NumericalFrontendIntent, language: str
) -> str:
    target = canonical_language(language)
    if intent.options:
        _unsupported(
            "unsupported_option",
            "outward "
            + target
            + " code generation currently preserves only default options for "
            + definition.operation.name,
            definition,
            target,
            details={"options": sorted(intent.options)},
        )
    values = intent.operands
    if target in ("sage", "python-scipy"):
        return _emit_python_like(definition, values, target)
    if target == "matlab":
        return _emit_matlab(definition, values)
    return _emit_wolfram(definition, values)


def _assignment(name: str, value: Any, language: str) -> str:
    return name + " = " + render_value(value, language)


def _callback_source(record: Any, language: str, shape: str) -> str:
    if not isinstance(record, Mapping):
        raise TypeError("canonical callback must be a mapping")
    rendered = render_callback(record, language)
    parameters_value = record.get("parameters", [])
    if not isinstance(parameters_value, Sequence) or isinstance(parameters_value, str):
        raise TypeError("canonical callback parameters must be a sequence")
    parameters = [str(item) for item in parameters_value]
    bodies = rendered if isinstance(rendered, list) else [rendered]
    vector_output = isinstance(rendered, list)
    if shape in ("scalar", "sweep") and len(parameters) != 1:
        raise ValueError(shape + " callback expressions require one parameter")
    if shape == "ode" and len(parameters) < 2:
        raise ValueError("ODE callback expressions require t and state parameters")
    if shape == "vector" and not parameters:
        raise ValueError("vector callback expressions require at least one parameter")
    if shape == "scalar":
        parameter = parameters[0]
        body = bodies[0]
        if language == "wolfram":
            return "Function[{" + parameter + "}, " + body + "]"
        if language == "matlab":
            return "@(" + parameter + ") " + body
        return "lambda " + parameter + ": " + body
    if shape == "sweep":
        parameter = parameters[0]
        body = bodies[0]
        if language == "wolfram":
            return "Function[{" + parameter + "}, " + body + "]"
        if language == "matlab":
            return "@(" + parameter + ") " + body
        return "lambda " + parameter + ", context: " + body
    if shape == "ode":
        state_names = parameters[1:]
        if language in ("sage", "python-scipy"):
            value = "[" + ", ".join(bodies) + "]" if vector_output else bodies[0]
            return (
                "lambda t, y: (lambda "
                + ", ".join(parameters)
                + ": "
                + value
                + ")(t, *y)"
            )
        if language == "matlab":
            value = "[" + "; ".join(bodies) + "]" if vector_output else bodies[0]
            state = ", ".join(
                "y(" + str(index + 1) + ")" for index in range(len(state_names))
            )
            return (
                "@(t, y) feval(@("
                + ", ".join(parameters)
                + ") "
                + value
                + ", t, "
                + state
                + ")"
            )
        value = "{" + ", ".join(bodies) + "}" if vector_output else bodies[0]
        state = ", ".join(
            "y[[" + str(index + 1) + "]]" for index in range(len(state_names))
        )
        return (
            "Function[{t, y}, Function[{"
            + ", ".join(parameters)
            + "}, "
            + value
            + "][t, "
            + state
            + "]]"
        )
    if language in ("sage", "python-scipy"):
        value = "[" + ", ".join(bodies) + "]" if vector_output else bodies[0]
        return "lambda p: (lambda " + ", ".join(parameters) + ": " + value + ")(*p)"
    if language == "matlab":
        value = "[" + "; ".join(bodies) + "]" if vector_output else bodies[0]
        entries = ", ".join(
            "p(" + str(index + 1) + ")" for index in range(len(parameters))
        )
        return (
            "@(p) feval(@("
            + ", ".join(parameters)
            + ") "
            + value
            + ", "
            + entries
            + ")"
        )
    value = "{" + ", ".join(bodies) + "}" if vector_output else bodies[0]
    return (
        "Function[{p}, Function[{" + ", ".join(parameters) + "}, " + value + "] @@ p]"
    )


def _emit_python_like(
    definition: _Definition, values: Mapping[str, Any], language: str
) -> str:
    name = definition.operation.name
    lines = []
    if language == "sage":
        lines.append("from " + definition.module + " import " + definition.function)
        call_name = definition.function
    else:
        imports = {
            "linear_solve": "import numpy as np",
            "least_squares": "import numpy as np",
            "symmetric_eigen": "import numpy as np",
            "general_eigen": "import numpy as np",
            "singular_value_decomposition": "import numpy as np",
            "fourier_transform": "from scipy import fft",
            "convolution": "from scipy import signal",
            "interpolation": "from scipy import interpolate",
            "cubic_spline": "from scipy import interpolate",
            "definite_integral": "from scipy import integrate",
            "scalar_minimum": "from scipy import optimize",
            "minimize": "from scipy import optimize",
            "nonlinear_system": "from scipy import optimize",
            "nonlinear_least_squares": "from scipy import optimize",
            "linear_fit": "from scipy import stats",
            "initial_value_problem": "from scipy import integrate",
            "descriptive_statistics": "from scipy import stats",
            "one_sample_t_test": "from scipy import stats",
            "two_sample_t_test": "from scipy import stats",
            "linear_regression": "from scipy import stats",
            "parameter_sweep": "from sagejs.numerics.sweeps import run_parameter_sweep",
        }
        lines.append("import numpy as np")
        if imports[name] != "import numpy as np":
            lines.append(imports[name])
        call_name = ""
    for operand in definition.operands:
        if operand != definition.callback:
            lines.append(_assignment(operand, values[operand], language))
    if definition.callback is not None:
        shape = _callback_shape(name)
        lines.append(
            definition.callback
            + " = "
            + _callback_source(values[definition.callback], language, shape)
        )
    arguments = ", ".join(definition.operands)
    if language == "sage":
        lines.append("result = " + call_name + "(" + arguments + ")")
        return "\n".join(lines)
    calls = {
        "linear_solve": "np.linalg.solve(matrix, right)",
        "least_squares": "np.linalg.lstsq(matrix, right, rcond=None)[0]",
        "symmetric_eigen": "np.linalg.eigh(matrix)",
        "general_eigen": "np.linalg.eig(matrix)",
        "singular_value_decomposition": "np.linalg.svd(matrix, full_matrices=False)",
        "fourier_transform": "fft.fft(samples)",
        "convolution": "signal.convolve(left, right, mode='full')",
        "interpolation": "interpolate.BarycentricInterpolator(nodes, values)",
        "cubic_spline": "interpolate.CubicSpline(nodes, values)",
        "definite_integral": "integrate.quad(function, lower, upper)[0]",
        "scalar_minimum": "optimize.minimize_scalar(function, bounds=(lower, upper), method='bounded').x",
        "minimize": "optimize.minimize(function, x0, method='Nelder-Mead').x",
        "nonlinear_system": "optimize.root(function, x0).x",
        "nonlinear_least_squares": "optimize.least_squares(residuals, x0).x",
        "linear_fit": "stats.linregress(xdata, ydata)",
        "initial_value_problem": "integrate.solve_ivp(function, t_span, y0)",
        "descriptive_statistics": "stats.describe(data, ddof=1)",
        "one_sample_t_test": "stats.ttest_1samp(data, population_mean)",
        "two_sample_t_test": "stats.ttest_ind(first, second, equal_var=False)",
        "linear_regression": "stats.linregress(x, y)",
        "parameter_sweep": "run_parameter_sweep(parameters, evaluator)",
    }
    lines.append("result = " + calls[name])
    return "\n".join(lines)


def _emit_matlab(definition: _Definition, values: Mapping[str, Any]) -> str:
    name = definition.operation.name
    lines = []
    for operand in definition.operands:
        if operand != definition.callback:
            assignment = _assignment(operand, values[operand], "matlab")
            if (
                name in ("linear_solve", "least_squares")
                and operand == "right"
                and _is_flat_sequence(values[operand])
            ):
                # MATLAB interprets `[a, b]` as a row vector, while both `A \\ b`
                # and `lsqminnorm(A, b)` require a column with one entry per row.
                # Use the nonconjugating transpose so complex right-hand sides
                # preserve their mathematical values.
                assignment += ".'"
            lines.append(assignment + ";")
    if definition.callback is not None:
        lines.append(
            definition.callback
            + " = "
            + _callback_source(
                values[definition.callback], "matlab", _callback_shape(name)
            )
            + ";"
        )
    calls = {
        "linear_solve": "matrix \\ right",
        "least_squares": "lsqminnorm(matrix, right)",
        "symmetric_eigen": "eig(matrix, 'vector')",
        "general_eigen": "eig(matrix, 'vector')",
        "singular_value_decomposition": "svd(matrix, 'econ')",
        "fourier_transform": "fft(samples)",
        "convolution": "conv(left, right, 'full')",
        "interpolation": "@(x) interp1(nodes, values, x, 'linear')",
        "cubic_spline": "spline(nodes, values)",
        "definite_integral": "integral(function, lower, upper)",
        "scalar_minimum": "fminbnd(function, lower, upper)",
        "minimize": "fminsearch(function, x0)",
        "nonlinear_system": "fsolve(function, x0)",
        "nonlinear_least_squares": "lsqnonlin(residuals, x0)",
        "linear_fit": "polyfit(xdata, ydata, 1)",
        "initial_value_problem": "ode45(function, t_span, y0)",
        "descriptive_statistics": "[mean(data), std(data), min(data), max(data)]",
        "one_sample_t_test": "ttest(data, population_mean)",
        "two_sample_t_test": "ttest2(first, second, 'Vartype', 'unequal')",
        "linear_regression": "fitlm(x, y)",
        "parameter_sweep": "arrayfun(evaluator, parameters, 'UniformOutput', false)",
    }
    lines.append("result = " + calls[name] + ";")
    return "\n".join(lines)


def _is_flat_sequence(value: Any) -> bool:
    return (
        isinstance(value, Sequence)
        and not isinstance(value, (str, bytes, bytearray))
        and all(
            not isinstance(item, Sequence) or isinstance(item, (str, bytes, bytearray))
            for item in value
        )
    )


def _emit_wolfram(definition: _Definition, values: Mapping[str, Any]) -> str:
    name = definition.operation.name
    lines = []
    for operand in definition.operands:
        if operand != definition.callback:
            lines.append(_assignment(operand, values[operand], "wolfram") + ";")
    if definition.callback is not None:
        lines.append(
            definition.callback
            + " = "
            + _callback_source(
                values[definition.callback], "wolfram", _callback_shape(name)
            )
            + ";"
        )
    calls = {
        "linear_solve": "LinearSolve[matrix, right]",
        "least_squares": "LeastSquares[matrix, right]",
        "symmetric_eigen": "Eigensystem[(matrix + ConjugateTranspose[matrix]) / 2]",
        "general_eigen": "Eigensystem[matrix]",
        "singular_value_decomposition": "SingularValueDecomposition[matrix]",
        "fourier_transform": "Fourier[samples, FourierParameters -> {0, -1}]",
        "convolution": "ListConvolve[left, right, {1, -1}, 0]",
        "interpolation": "Interpolation[Transpose[{nodes, values}], InterpolationOrder -> 1]",
        "cubic_spline": 'Interpolation[Transpose[{nodes, values}], Method -> "Spline"]',
        "definite_integral": "NIntegrate[function[x], {x, lower, upper}]",
        "scalar_minimum": "x /. Last[NMinimize[{function[x], lower <= x <= upper}, x]]",
        "minimize": "FindMinimum[function[x0], x0]",
        "nonlinear_system": "FindRoot[Thread[function[x0] == 0], x0]",
        "nonlinear_least_squares": "NonlinearModelFit[residuals[x0], x0]",
        "linear_fit": "LinearModelFit[Transpose[{xdata, ydata}], x, x]",
        "initial_value_problem": "NDSolveValue[{y'[t] == function[t, y[t]], y[First[t_span]] == y0}, y, {t, First[t_span], Last[t_span]}]",
        "descriptive_statistics": '<|"Mean" -> Mean[data], "StandardDeviation" -> StandardDeviation[data], "Min" -> Min[data], "Max" -> Max[data]|>',
        "one_sample_t_test": 'LocationTest[data, population_mean, "TestDataTable"]',
        "two_sample_t_test": 'LocationTest[{first, second}, 0, "TestDataTable"]',
        "linear_regression": "LinearModelFit[Transpose[{x, y}], p, p]",
        "parameter_sweep": "Map[evaluator, parameters]",
    }
    lines.append("result = " + calls[name] + ";")
    return "\n".join(lines)


def _callback_shape(name: str) -> str:
    if name in ("definite_integral", "scalar_minimum"):
        return "scalar"
    if name == "initial_value_problem":
        return "ode"
    if name == "parameter_sweep":
        return "sweep"
    return "vector"


def canonical_float(value: Any, name: str) -> float:
    """Validate one frontend scalar without accepting booleans or infinities."""

    if isinstance(value, bool):
        raise TypeError(name + " must be a real number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(name + " must be finite")
    return result


__all__ = [
    "canonical_float",
    "FrontendExecutionResult",
    "execute_operation_intent",
    "lower_operation",
    "natural_value",
    "operation_adapters",
    "operation_ref",
    "operation_refs",
]
