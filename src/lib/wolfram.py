"""Small runtime used by the experimental Wolfram Language frontend."""

import math
from typing import Any, Callable

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.numerics.frontends import (
    FrontendDiagnostic,
    UnsupportedFrontendError,
    wolfram_find_root_intent,
)
from sagejs.numerics.frontends import (
    create_frontend_registry as _create_numerical_registry,
)
from sagejs.numerics.frontends import (
    emit_code as _emit_numerical_code,
)
from sagejs.numerics.frontends import (
    execute_scalar_root_intent as _execute_numerical_intent,
)


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


class WolframFindRootResult:
    """Natural Wolfram rule display backed by a structured numerical result."""

    def __init__(self, variable: str, numerical_result: Any, intent: Any) -> None:
        self.variable = variable
        self.numerical_result = numerical_result
        self.frontend_intent = intent

    @property
    def value(self) -> Any:
        return self.numerical_result.value

    def to_dict(self) -> Any:
        return {
            "rule": {"variable": self.variable, "value": self.value},
            "numerical_result": self.numerical_result.to_dict(),
            "frontend_intent": self.frontend_intent.to_dict(),
        }

    def __repr__(self) -> str:
        return "{" + self.variable + " -> " + repr(self.value) + "}"


def find_root_intent(
    function: Any,
    variable: str,
    initial: Any,
    options: Any = None,
    *,
    expression: str | None = None,
    source_text: str | None = None,
) -> Any:
    """Return canonical intent for a natural Wolfram `FindRoot` request."""

    settings = {} if options is None else dict(options)
    return wolfram_find_root_intent(
        function,
        variable,
        initial,
        settings,
        expression=expression,
        source_text=source_text,
    )


def find_root(
    function: Any,
    variable: str,
    initial: Any,
    options: Any = None,
) -> WolframFindRootResult:
    """Lower Wolfram `FindRoot` to the canonical scalar-root operation."""

    intent = find_root_intent(function, variable, initial, options)
    result = _execute_numerical_intent(intent)
    return WolframFindRootResult(variable, result, intent)


FindRoot = find_root
FindRootIntent = find_root_intent


def numerical_code(intent: Any, language: str) -> str:
    """Emit canonical numerical intent as Sage, SciPy, MATLAB, or Wolfram."""

    return _emit_numerical_code(intent, language)


def numerical_intent(name: str, *arguments: Any, **options: Any) -> Any:
    """Lower a supported Wolfram numerical call to canonical intent."""

    return _create_numerical_registry().lower("wolfram", name, *arguments, **options)


def numerical_result(name: str, *arguments: Any, **options: Any) -> Any:
    """Execute a Wolfram numerical call and retain all structured evidence."""

    registry = _create_numerical_registry()
    return registry.execute(registry.lower("wolfram", name, *arguments, **options))


def numerical_value(name: str, *arguments: Any, **options: Any) -> Any:
    """Return the conventional Wolfram value view of a structured result."""

    result = numerical_result(name, *arguments, **options)
    _require_numerical_success(name, result)
    return result.value if hasattr(result, "value") else result


def _require_numerical_success(name: str, result: Any) -> None:
    """Reject failed iterates before projecting a Wolfram-style short result."""

    if hasattr(result, "success") and not result.success:
        status = result.status if hasattr(result, "status") else "failed"
        raise RuntimeError(name + " failed: " + str(status))


def _unsupported_vendor_numerical(name: str, reason: str) -> Any:
    """Fail closed when a Wolfram spelling does not preserve Wolfram semantics."""

    raise UnsupportedFrontendError(
        FrontendDiagnostic(
            "unsupported_operation",
            name + " is not yet qualified for the Sage.js Wolfram surface: " + reason,
            language="wolfram",
            details={"surface": "natural-vendor-alias", "source_name": name},
        )
    )


def linear_solve(matrix: Any, right: Any, **options: Any) -> Any:
    return numerical_value("LinearSolve", matrix, right, **options)


def least_squares(matrix: Any, right: Any, **options: Any) -> Any:
    return numerical_value("LeastSquares", matrix, right, **options)


def eigensystem(matrix: Any, **options: Any) -> Any:
    del matrix, options
    return _unsupported_vendor_numerical(
        "Eigensystem", "complex decoding, ordering, and vector orientation differ"
    )


def general_eigensystem(matrix: Any, **options: Any) -> Any:
    del matrix, options
    return _unsupported_vendor_numerical(
        "GeneralEigensystem",
        "complex decoding, ordering, and vector orientation differ",
    )


def singular_value_decomposition(matrix: Any, **options: Any) -> Any:
    del matrix, options
    return _unsupported_vendor_numerical(
        "SingularValueDecomposition", "factor orientation and result form differ"
    )


def fourier(samples: Any, **options: Any) -> Any:
    del samples, options
    return _unsupported_vendor_numerical(
        "Fourier", "default normalization and complex projection differ"
    )


def list_convolve(left: Any, right: Any, **options: Any) -> Any:
    del left, right, options
    return _unsupported_vendor_numerical(
        "ListConvolve", "padding and origin conventions are not preserved"
    )


class WolframInterpolatingFunction:
    """Callable Wolfram-style view over a validated approximation result."""

    def __init__(self, numerical_result: Any) -> None:
        self.numerical_result = numerical_result

    def __call__(self, value: Any) -> Any:
        return self.numerical_result.evaluate(value)

    def to_dict(self) -> Any:
        return self.numerical_result.to_dict()


def interpolation(nodes: Any, values: Any, **options: Any) -> Any:
    del nodes, values, options
    return _unsupported_vendor_numerical(
        "Interpolation", "interpolation defaults and returned function semantics differ"
    )


def cubic_spline_interpolation(nodes: Any, values: Any, **options: Any) -> Any:
    del nodes, values, options
    return _unsupported_vendor_numerical(
        "CubicSplineInterpolation", "endpoint and returned function semantics differ"
    )


def n_integrate(function: Any, lower: Any, upper: Any, **options: Any) -> Any:
    result = numerical_result("NIntegrate", function, lower, upper, **options)
    if not result.success:
        raise RuntimeError("NIntegrate failed: " + result.status)
    return result.value


def n_minimize_scalar(function: Any, lower: Any, upper: Any, **options: Any) -> Any:
    del function, lower, upper, options
    return _unsupported_vendor_numerical(
        "NMinimizeScalar", "this is not a faithful natural Wolfram result convention"
    )


def find_minimum(function: Any, initial: Any, **options: Any) -> Any:
    del function, initial, options
    return _unsupported_vendor_numerical(
        "FindMinimum",
        "source variables, constraints, and rule results are not preserved",
    )


def find_root_system(function: Any, initial: Any, **options: Any) -> Any:
    del function, initial, options
    return _unsupported_vendor_numerical(
        "FindRootSystem", "equation and rule-result semantics are not preserved"
    )


def nonlinear_least_squares(residuals: Any, initial: Any, **options: Any) -> Any:
    del residuals, initial, options
    return _unsupported_vendor_numerical(
        "NonlinearLeastSquares", "model and parameter-rule semantics are not preserved"
    )


def linear_model_fit(x: Any, y: Any, **options: Any) -> Any:
    return numerical_value("LinearModelFitData", x, y, **options)


class WolframNDSolveValue:
    """Callable trajectory view retaining canonical ODE evidence."""

    def __init__(self, numerical_result: Any) -> None:
        self.numerical_result = numerical_result

    def __call__(self, value: Any) -> Any:
        return self.numerical_result.trajectory(value)

    def to_dict(self) -> Any:
        return self.numerical_result.to_dict()


def nd_solve_value(function: Any, t_span: Any, y0: Any, **options: Any) -> Any:
    del function, t_span, y0, options
    return _unsupported_vendor_numerical(
        "NDSolveValue", "equation, event, and interpolating-function semantics differ"
    )


def sagejs_describe(data: Any, **options: Any) -> Any:
    return numerical_value("SageJSDescribe", data, **options)


def one_sample_t_test(data: Any, population_mean: Any = 0, **options: Any) -> Any:
    return numerical_value("OneSampleTTest", data, population_mean, **options)


def two_sample_t_test(first: Any, second: Any, **options: Any) -> Any:
    return numerical_value("TwoSampleTTest", first, second, **options)


def map_numerical(function: Any, parameters: Any, **options: Any) -> Any:
    """Map a callback through the deterministic bounded sweep contract."""

    return numerical_value("Map", function, parameters, **options)


LinearSolve = linear_solve
LeastSquares = least_squares
Eigensystem = eigensystem
GeneralEigensystem = general_eigensystem
SingularValueDecomposition = singular_value_decomposition
Fourier = fourier
ListConvolve = list_convolve
Interpolation = interpolation
CubicSplineInterpolation = cubic_spline_interpolation
NIntegrate = n_integrate
NMinimizeScalar = n_minimize_scalar
FindMinimum = find_minimum
FindRootSystem = find_root_system
NonlinearLeastSquares = nonlinear_least_squares
LinearModelFitData = linear_model_fit
NDSolveValue = nd_solve_value
SageJSDescribe = sagejs_describe
OneSampleTTest = one_sample_t_test
TwoSampleTTest = two_sample_t_test
Map = map_numerical


class _GraphicsDirective:
    def __init__(self, options: dict[str, Any]) -> None:
        self.options = options


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
                "message": (
                    "A frontend option could not be represented and was ignored."
                ),
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
    # Wolfram `Show` is an expression constructor whose value is displayed by
    # the evaluator. Do not call Sage's imperative `show(...)`, which publishes
    # immediately and intentionally returns `None`.
    graphic = graphics_values[0]
    for value in graphics_values[1:]:
        graphic = graphic + value
    if len(options) and hasattr(graphic, "set_extra_kwds"):
        graphic.set_extra_kwds(options)
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
