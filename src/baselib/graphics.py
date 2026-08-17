# Sage-compatible two-dimensional graphics objects.
#
# The object model and adaptive sampling design are adapted from SageMath's
# sage.plot package.
#
# Copyright (C) 2006-2026 SageMath contributors
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Callable, Iterator, Sequence

import sagejs.runtime as runtime

_PLOTLY_MIME = "application/vnd.plotly.v1+json"
_PI = 3.141592653589793
_GRAPHICS_OPTION_NAMES = [
    "aspect_ratio",
    "axes",
    "axes_labels",
    "axes_labels_size",
    "axes_pad",
    "base",
    "dpi",
    "fig_tight",
    "figsize",
    "flip_x",
    "flip_y",
    "fontsize",
    "frame",
    "gridlines",
    "gridlinesstyle",
    "hgridlinesstyle",
    "legend_options",
    "scale",
    "show_legend",
    "tick_formatter",
    "ticks",
    "ticks_integer",
    "title",
    "title_pos",
    "transparent",
    "typeset",
    "vgridlinesstyle",
    "xmin",
    "xmax",
    "ymin",
    "ymax",
]


def _native_object() -> Any:
    return runtime.object.create(None)


def _native_record(**values: Any) -> Any:
    answer = _native_object()
    for key in runtime.object.keys(values):
        runtime.reflect.set(answer, key, runtime.reflect.get(values, key))
    return answer


def _copy_options(options: Any) -> dict[str, Any]:
    answer = {}
    items_method = runtime.reflect.get(options, "items")
    if runtime.jstype(items_method) == "function":
        for pair in options.items():
            answer[pair[0]] = pair[1]
        return answer
    for key in runtime.object.keys(options):
        answer[key] = runtime.reflect.get(options, key)
    return answer


def _option_has(options: Any, name: str) -> bool:
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        options,
        [name],
    )


def _option_get(
    options: Any,
    name: str,
    default_value: Any = None,
) -> Any:
    if _option_has(options, name):
        return runtime.reflect.get(options, name)
    return default_value


def _option_pop(
    options: Any,
    name: str,
    default_value: Any = None,
) -> Any:
    if not _option_has(options, name):
        return default_value
    value = runtime.reflect.get(options, name)
    runtime.reflect.deleteProperty(options, name)
    return value


def _option_update(target: Any, source: Any) -> None:
    for name in runtime.object.keys(source):
        runtime.reflect.set(target, name, runtime.reflect.get(source, name))


def _color_value(color: Any) -> str:
    if hasattr(color, "rgb"):
        color = color.rgb()
    if isinstance(color, str):
        return color
    if isinstance(color, (list, tuple)) and len(color) in (3, 4):
        components = []
        for value in color:
            component = float(value)
            component = max(0.0, min(1.0, component))
            components.append(int(runtime.math.round(component * 255)))
        if len(components) == 4:
            return (
                "rgba("
                + str(components[0])
                + ","
                + str(components[1])
                + ","
                + str(components[2])
                + ","
                + str(float(color[3]))
                + ")"
            )
        return (
            "rgb("
            + str(components[0])
            + ","
            + str(components[1])
            + ","
            + str(components[2])
            + ")"
        )
    return str(color)


def _dash_value(linestyle: str) -> str:
    styles = {
        "-": "solid",
        "--": "dash",
        "-.": "dashdot",
        ":": "dot",
        "solid": "solid",
        "dashed": "dash",
        "dashdot": "dashdot",
        "dotted": "dot",
    }
    return _option_get(styles, linestyle, linestyle)


def get_matplotlib_linestyle(linestyle: Any, return_type: str) -> Any:
    r"""Translate between matplotlib's short and long line-style names."""
    long_to_short = {
        "solid": "-",
        "dashed": "--",
        "dotted": ":",
        "dashdot": "-.",
    }
    short_to_long = {
        "-": "solid",
        "--": "dashed",
        ":": "dotted",
        "-.": "dashdot",
    }

    if linestyle is None:
        return None

    if not hasattr(linestyle, "startswith"):
        type_name = str(type(linestyle))[8:-2].split(".")[-1]
        raise AttributeError("'" + type_name + "' object has no attribute 'startswith'")
    style = linestyle
    if style.startswith("default"):
        return get_matplotlib_linestyle(style[len("default") :], "short")
    if style.startswith("steps"):
        for prefix in ("steps-mid", "steps-post", "steps-pre"):
            if style.startswith(prefix):
                return prefix + get_matplotlib_linestyle(style[len(prefix) :], "short")
        return "steps" + get_matplotlib_linestyle(style[len("steps") :], "short")

    if return_type == "short":
        if style in short_to_long:
            return style
        if style in ("", " ", "None"):
            return ""
        if style in long_to_short:
            return long_to_short[style]
        raise ValueError(_invalid_linestyle_message(style))

    if return_type == "long":
        if style in long_to_short:
            return style
        if style in ("", " ", "None"):
            return "None"
        if style in short_to_long:
            return short_to_long[style]
        raise ValueError(_invalid_linestyle_message(style))
    return None


def _invalid_linestyle_message(style: str) -> str:
    return (
        "WARNING: Unrecognized linestyle '"
        + style
        + "'. Possible linestyle options are:\n"
        + "{'solid', 'dashed', 'dotted', dashdot', 'None'}, respectively "
        + "{'-', '--', ':', '-.', ''}"
    )


def _variable_key(value: Any) -> str:
    return str(value)


def _distinct_sorted_variables(values: list[Any]) -> "tuple[Any, ...]":
    unique_names = []
    unique_values = []
    for value in values:
        name = _variable_key(value)
        if name not in unique_names:
            unique_names.append(name)
            unique_values.append(value)
    ordered_names = list(unique_names)
    ordered_names.sort()
    return tuple(unique_values[unique_names.index(name)] for name in ordered_names)


def unify_arguments(
    funcs: Any,
) -> "tuple[tuple[Any, ...], tuple[Any, ...]]":
    r"""Return all variables and the subset free in the supplied functions."""
    ce = runtime.reflect.get(
        runtime.global_object,
        "CallableExpression",
    )

    function_values = list(funcs) if isinstance(funcs, (list, tuple)) else [funcs]
    variables = []
    free_variables = []

    for function_value in function_values:
        function_arguments = ()
        if isinstance(function_value, ce):
            function_arguments = tuple(function_value._arguments_tuple())
            variables += list(function_arguments)

        try:
            argument_names = {
                _variable_key(argument) for argument in function_arguments
            }
            vm = getattr(function_value, "variables")  # noqa: B009
            for variable in vm():
                if _variable_key(variable) not in argument_names:
                    variables.append(variable)
                    free_variables.append(variable)
        except AttributeError:
            pass

    return (
        _distinct_sorted_variables(variables),
        _distinct_sorted_variables(free_variables),
    )


@runtime.callable_instance_class
class FastCallablePlotWrapper:
    r"""Convert numerical callable results to real floats or `NaN`."""

    def __init__(self, ff: Any, imag_tol: float) -> None:
        self._ff = ff
        self._imag_tol = float(imag_tol)

    def __call__(self, *args: Any) -> float:
        try:
            native_number = runtime.reflect.get(runtime.global_object, "Number")
            native_args = runtime.reflect.construct(runtime.array, [])
            for arg in args:
                native_value = runtime.reflect.apply(
                    native_number, runtime.undefined, [arg]
                )
                runtime.reflect.apply(
                    runtime.array.prototype.push,
                    native_args,
                    [native_value],
                )
            value = runtime.reflect.apply(self._ff, runtime.global_object, native_args)
            if runtime.jstype(value) == "number":
                return float(value)
            if runtime.jstype(value) not in ("object", "function"):
                return float(value)

            real_value = runtime.reflect.get(value, "real")
            imaginary_value = runtime.reflect.get(value, "imag")
            if real_value is runtime.undefined or imaginary_value is runtime.undefined:
                return float(value)
            if runtime.jstype(real_value) == "function":
                real_value = runtime.reflect.apply(real_value, value, [])
            if runtime.jstype(imaginary_value) == "function":
                imaginary_value = runtime.reflect.apply(imaginary_value, value, [])
            real_part = float(real_value)
            imaginary_part = float(imaginary_value)
            if abs(imaginary_part) < self._imag_tol:
                return real_part
            if runtime.number.isNaN(real_part) and runtime.number.isNaN(imaginary_part):
                return float("nan")
            raise ValueError("complex fast-callable function result")
        except ValueError:
            return float("nan")


def _grid_fast_callable(
    function_value: Any,
    variables: list[Any],
    imaginary_tolerance: float,
) -> Any:
    value_kind = runtime.jstype(function_value)
    plot_compiler = None
    if value_kind in ("object", "function"):
        plot_compiler = getattr(function_value, "_plot_fast_callable", None)
    if callable(plot_compiler):
        return FastCallablePlotWrapper(
            runtime.reflect.apply(plot_compiler, function_value, [variables]),
            imaginary_tolerance,
        )

    if value_kind in ("object", "function") and hasattr(
        function_value, "_fast_callable_"
    ):
        compiler = runtime.reflect.get(runtime.global_object, "fast_callable")
        if runtime.jstype(compiler) == "function":
            compiled = runtime.reflect.apply(
                compiler,
                runtime.undefined,
                [function_value, variables],
            )
            return FastCallablePlotWrapper(compiled, imaginary_tolerance)

    if value_kind == "function":
        sm = __import__("sagejs._baselib.symbolic", fromlist=["cos"])
        for symbolic_name in (
            "sin cos tan arcsin arccos arctan sinh cosh tanh exp log ln sqrt"
        ).split(" "):
            symbolic_function = getattr(sm, symbolic_name, None)
            if function_value is symbolic_function:
                expression = runtime.reflect.apply(
                    function_value,
                    runtime.undefined,
                    variables,
                )
                expression_compiler = getattr(expression, "_plot_fast_callable", None)
                if callable(expression_compiler):
                    compiled = runtime.reflect.apply(
                        expression_compiler,
                        expression,
                        [variables],
                    )
                    return FastCallablePlotWrapper(compiled, imaginary_tolerance)

    if callable(function_value):
        return function_value

    def constant_function(*_args: Any) -> Any:
        return function_value

    return FastCallablePlotWrapper(constant_function, imaginary_tolerance)


def setup_for_eval_on_grid(
    funcs: Any,
    ranges: Sequence[Any],
    plot_points: Any = None,
    return_vars: bool = False,
    imaginary_tolerance: float = 1e-8,
) -> Any:
    r"""Normalize plot ranges and prepare functions for grid evaluation."""
    range_values = [tuple(value) for value in ranges]
    range_lengths = [len(value) for value in range_values]
    if max(range_lengths) > 3:
        raise ValueError(
            "At least one variable range has more than 3 entries: each should "
            "either have 2 or 3 entries, with one of the forms (xmin, xmax) "
            "or (x, xmin, xmax)"
        )
    if max(range_lengths) != min(range_lengths):
        raise ValueError("Some variable ranges specify variables while others do not")

    explicit_variables = len(range_values[0]) == 3
    if explicit_variables:
        variable_values = [value[0] for value in range_values]
        ranges_without_variables = [value[1:] for value in range_values]
        variable_names = [_variable_key(value) for value in variable_values]
        if len(set(variable_names)) < len(variable_names):
            raise ValueError(
                "range variables should be distinct, but there are duplicates"
            )
    else:
        inferred_variables, _free_variables = unify_arguments(funcs)
        variable_values = list(inferred_variables)
        ranges_without_variables = range_values

    if len(ranges_without_variables) > 1:
        normalized_ranges = []
        for value in ranges_without_variables:
            if value[-2] > value[-1]:
                normalized_ranges.append((value[-1], value[-2]))
            else:
                normalized_ranges.append(value)
        ranges_without_variables = normalized_ranges

    argument_count = len(ranges_without_variables)
    if len(variable_values) < argument_count:
        variable_values += ["_"] * (argument_count - len(variable_values))

    numeric_ranges = [
        [float(endpoint) for endpoint in value] for value in ranges_without_variables
    ]
    if plot_points is None:
        plot_points = 2
    if not isinstance(plot_points, (list, tuple)):
        point_counts = [plot_points] * len(numeric_ranges)
    elif len(plot_points) != argument_count:
        raise ValueError(
            "plot_points must be either an integer or a list of integers, "
            "one for each range"
        )
    else:
        point_counts = list(plot_points)
    point_counts = [int(value) if value >= 2 else 2 for value in point_counts]
    range_steps = [
        abs(value[1] - value[0]) / (count - 1)
        for value, count in zip(numeric_ranges, point_counts, strict=True)
    ]
    if min(range_steps) == 0.0:
        raise ValueError("plot start point and end point must be different")

    funcs_kind = runtime.jstype(funcs)
    has_iterator = False
    if funcs_kind in ("object", "function"):
        has_iterator = (
            runtime.jstype(runtime.reflect.get(funcs, "__iter__")) == "function"
        )
    if isinstance(funcs, (list, tuple)) or has_iterator:
        prepared_funcs = tuple(
            _grid_fast_callable(value, variable_values, imaginary_tolerance)
            for value in funcs
        )
    else:
        prepared_funcs = _grid_fast_callable(
            funcs,
            variable_values,
            imaginary_tolerance,
        )
    range_specs = [
        tuple(value + [range_step])
        for value, range_step in zip(numeric_ranges, range_steps, strict=True)
    ]
    if return_vars:
        returned_variables = (
            variable_values if explicit_variables else tuple(variable_values)
        )
        return prepared_funcs, range_specs, returned_variables
    return prepared_funcs, range_specs


FastCallablePlotWrapper.__module__ = "sage.plot.misc"
runtime.set_class_repr(
    FastCallablePlotWrapper,
    "<class 'sage.plot.misc.FastCallablePlotWrapper'>",
)


def _parse_figsize(figsize: Any) -> tuple[float, float]:
    r"""
    Normalize Sage's figure-size option to `(width, height)` in inches.

    A single positive number is the width and uses Sage/matplotlib's default
    4:3 aspect ratio.  A pair specifies both dimensions explicitly.

    EXAMPLES::

        sage: _parse_figsize([5, 4])
        (5.0, 4.0)
        sage: _parse_figsize(5)
        (5.0, 3.75)
    """
    if isinstance(figsize, (list, tuple)):
        if len(figsize) != 2:
            raise ValueError(
                "figsize should be a positive number or a list of two "
                "positive numbers, not " + str(figsize)
            )
        width = float(figsize[0])
        height = float(figsize[1])
        if width <= 0 or height <= 0:
            raise ValueError(
                "figsize should be positive numbers, not "
                + str(width)
                + " and "
                + str(height)
            )
        return width, height
    width = float(figsize)
    if width <= 0:
        raise ValueError("figsize should be positive, not " + str(width))
    return width, 0.75 * width


def _point_pair(point_value: Any) -> tuple[float, float]:
    if isinstance(point_value, (list, tuple)):
        if len(point_value) != 2:
            raise ValueError("points must have exactly two coordinates")
        return float(point_value[0]), float(point_value[1])
    if hasattr(point_value, "__getitem__"):
        try:
            get_item = point_value.__getitem__
            return float(get_item(0)), float(get_item(1))
        except Exception:
            pass
    raise ValueError("points must have exactly two coordinates")


def _normalize_points(points: Any) -> list[tuple[float, float]]:
    values = list(points)
    if (
        len(values) == 2
        and not isinstance(values[0], (list, tuple))
        and not isinstance(values[1], (list, tuple))
    ):
        values = [values]
    return [_point_pair(value) for value in values]


def _axis_pair(value: Any) -> tuple[Any, Any]:
    if isinstance(value, (list, tuple)) and len(value) == 2:
        return value[0], value[1]
    return value, None


def _apply_axis_ticks(
    axis: Any,
    ticks: Any,
    formatter: Any,
    integer_ticks: bool,
) -> None:
    if isinstance(ticks, (list, tuple)):
        values = [float(value) for value in ticks]
        runtime.reflect.set(axis, "tickmode", "array")
        runtime.reflect.set(axis, "tickvals", values)
        if isinstance(formatter, (list, tuple)):
            if len(formatter) != len(values):
                raise ValueError("tick label list must have the same length as ticks")
            runtime.reflect.set(axis, "ticktext", [str(value) for value in formatter])
        elif callable(formatter):
            runtime.reflect.set(
                axis,
                "ticktext",
                [str(formatter(value)) for value in values],
            )
    elif ticks is not None:
        spacing = float(ticks)
        if spacing <= 0:
            raise ValueError("tick spacing must be positive")
        runtime.reflect.set(axis, "dtick", spacing)
    elif integer_ticks:
        runtime.reflect.set(axis, "dtick", 1)


def _grid_line_style(options: Any) -> Any:
    return _native_record(
        color=_color_value(
            _option_get(options, "color", _option_get(options, "rgbcolor", "#d9d9d9"))
        ),
        width=float(
            _option_get(options, "linewidth", _option_get(options, "thickness", 1))
        ),
        dash=_dash_value(str(_option_get(options, "linestyle", "-"))),
    )


def _legend_position(location: Any) -> Any:
    positions = {
        "upper right": [1.0, 1.0, "right", "top"],
        "upper left": [0.0, 1.0, "left", "top"],
        "lower left": [0.0, 0.0, "left", "bottom"],
        "lower right": [1.0, 0.0, "right", "bottom"],
        "right": [1.0, 0.5, "right", "middle"],
        "center left": [0.0, 0.5, "left", "middle"],
        "center right": [1.0, 0.5, "right", "middle"],
        "lower center": [0.5, 0.0, "center", "bottom"],
        "upper center": [0.5, 1.0, "center", "top"],
        "center": [0.5, 0.5, "center", "middle"],
        "best": [1.0, 1.0, "right", "top"],
    }
    if isinstance(location, (list, tuple)) and len(location) == 2:
        return runtime.math_tuple(
            [float(location[0]), float(location[1]), "left", "bottom"]
        )
    return _option_get(positions, str(location), positions["best"])


def _plot_spec_json_value(value: Any) -> Any:
    """Return ordinary JSON-safe Python data for a renderer value."""
    if value is runtime.undefined:
        return None
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_plot_spec_json_value(item) for item in value]
    if isinstance(value, dict):
        answer = dict()
        for key in value:
            answer.__setitem__(str(key), _plot_spec_json_value(value.__getitem__(key)))
        return answer
    if runtime.jstype(value) == "object":
        answer = dict()
        for key in runtime.object.keys(value):
            answer.__setitem__(
                str(key), _plot_spec_json_value(runtime.reflect.get(value, key))
            )
        return answer
    raise TypeError("Plotly fallback value is not JSON-safe: " + str(value))


def _native_plan_value(value: Any) -> Any:
    """Materialize a strict render plan as native recursive records."""
    if value is runtime.undefined:
        return None
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_native_plan_value(item) for item in value]
    if isinstance(value, dict):
        answer = _native_object()
        for key, item in value.items():
            runtime.reflect.set(answer, str(key), _native_plan_value(item))
        return answer
    if runtime.jstype(value) == "object":
        answer = _native_object()
        for key in runtime.object.keys(value):
            runtime.reflect.set(
                answer,
                str(key),
                _native_plan_value(runtime.reflect.get(value, key)),
            )
        return answer
    raise TypeError("primitive render plan is not JSON-safe: " + str(value))


def _sage_primitive_plan(name: str, options: Any) -> Any:
    """Return a strict Sage primitive plan without leaking internal metadata."""
    public_options = dict()
    for option_name in runtime.object.keys(options):
        if str(option_name)[:7] != "__plot_":
            public_options.__setitem__(
                str(option_name), runtime.reflect.get(options, option_name)
            )
    planning = __import__(
        "sagejs.plotting.sage_primitives2d",
        fromlist=[name],
    )
    planner = getattr(planning, name)
    # Strict library mappings are runtime Python dictionaries. Materialize
    # them recursively before bootstrap code uses native property access.
    return _native_plan_value(planner(public_options))


def _plotly_marker_record(style: Any) -> Any:
    marker = _native_record(
        color=style["color"],
        size=style["size"],
        symbol=style["symbol"],
    )
    edge = style.get("line")
    if edge is not None:
        runtime.reflect.set(
            marker,
            "line",
            _native_record(color=edge["color"], width=edge["width"]),
        )
    return marker


def _plot_spec_layer(
    payload: dict[str, Any],
    ordinal: int,
    source_context: Any = None,
    ordered_options: Any = None,
) -> Any:
    """Materialize one lazy primitive payload as a public `PlotLayer`."""
    plotting = __import__("sagejs.plotting", fromlist=["PlotLayer"])
    materialized = _plot_spec_json_value(payload)
    source_intent = materialized.get("source_intent", runtime.scope_dict({}))
    if source_context is not None:
        context = _plot_spec_json_value(source_context)
        for name in context:
            if name not in source_intent:
                source_intent.__setitem__(name, context.__getitem__(name))
    if ordered_options is not None and len(ordered_options):
        source_intent.__setitem__(
            "ordered_options", _plot_spec_json_value(ordered_options)
        )

    materialized.__setitem__("id", "layer-" + str(ordinal))
    materialized.__setitem__("source_intent", source_intent)
    return plotting.PlotLayer.from_dict(materialized)


def _plot_spec_2d_trace(payload: dict[str, Any]) -> Any:
    """Lower one supported semantic payload to its exact Plotly trace."""
    kind = str(payload["kind"])
    data = payload["data"]
    style = payload["style"]
    legend = payload["legend"]
    metadata = payload["metadata"]
    if kind == "line":
        line_style = _native_record(
            color=style["color"],
            width=style["width"],
            dash=style["dash"],
        )
        if style["shape"] != "linear":
            runtime.reflect.set(line_style, "shape", style["shape"])
        trace = _native_record(
            type="scatter",
            mode=style["mode"],
            x=data["x"],
            y=data["y"],
            line=line_style,
            opacity=style["opacity"],
            showlegend=legend["show"],
        )
        if style["marker"] is not None:
            runtime.reflect.set(trace, "marker", _plotly_marker_record(style["marker"]))
        if legend["label"] is not None:
            runtime.reflect.set(trace, "name", legend["label"])
        if metadata["zorder"] is not None:
            # Plotly zorder controls paint order without changing the trace
            # array, so legend order remains the user's construction order.
            runtime.reflect.set(trace, "zorder", metadata["zorder"])
        return trace
    if kind == "point":
        marker = _native_record(
            color=style["color"],
            size=style["size"],
            symbol=style["symbol"],
        )
        edge = style["edge"]
        if edge is not None:
            runtime.reflect.set(
                marker,
                "line",
                _native_record(color=edge["color"], width=edge["width"]),
            )
        trace = _native_record(
            type="scatter",
            mode="markers",
            x=data["x"],
            y=data["y"],
            marker=marker,
            opacity=style["opacity"],
            showlegend=legend["show"],
        )
        if legend["label"] is not None:
            runtime.reflect.set(trace, "name", legend["label"])
        if metadata["zorder"] is not None:
            runtime.reflect.set(trace, "zorder", metadata["zorder"])
        return trace
    if kind == "polygon":
        xdata = list(data["x"])
        ydata = list(data["y"])
        if style["close_path"] and len(xdata):
            if xdata[-1] != xdata[0] or ydata[-1] != ydata[0]:
                xdata.append(xdata[0])
                ydata.append(ydata[0])
        trace = _native_record(
            type="scatter",
            mode="lines",
            x=xdata,
            y=ydata,
            line=_native_record(
                color=style["line"]["color"],
                width=style["line"]["width"],
                dash=style["line"]["dash"],
            ),
            fill="toself" if style["fill"] else "none",
            opacity=style["opacity"],
            showlegend=legend["show"],
        )
        if style["fill"]:
            runtime.reflect.set(trace, "fillcolor", style["fillcolor"])
        if legend["label"] is not None:
            runtime.reflect.set(trace, "name", legend["label"])
        runtime.reflect.set(trace, "zorder", metadata["zorder"])
        return trace
    if kind == "arrow":
        if style["renderer"] == "annotation":
            if not legend["show"]:
                return None
            return _native_record(
                type="scatter",
                mode="lines",
                x=[None],
                y=[None],
                line=_native_record(color=style["color"], width=style["width"]),
                opacity=style["opacity"],
                showlegend=True,
                name=legend["label"],
            )
        marker_size = max(6.0, style["width"] * 4.0, style["arrowsize"] * 2.0)
        trace = _native_record(
            type="scatter",
            mode="lines+markers",
            x=[data["tail"][0], data["head"][0]],
            y=[data["tail"][1], data["head"][1]],
            line=_native_record(
                color=style["color"],
                width=style["width"],
                dash=style["dash"],
            ),
            marker=_native_record(
                color=style["color"],
                size=[0, marker_size],
                symbol=["circle", "arrow"],
                angleref="previous",
            ),
            opacity=style["opacity"],
            showlegend=legend["show"],
        )
        if legend["label"] is not None:
            runtime.reflect.set(trace, "name", legend["label"])
        runtime.reflect.set(trace, "zorder", metadata["zorder"])
        return trace
    if kind == "text":
        if style["renderer"] == "annotation":
            return None
        return _native_record(
            type="scatter",
            mode="text",
            x=[data["position"][0]],
            y=[data["position"][1]],
            text=[data["text"]],
            textfont=_native_record(
                color=style["color"],
                size=style["font_size"],
            ),
            textposition=style["position"],
            opacity=style["opacity"],
            showlegend=False,
            hoverinfo="skip",
            zorder=metadata["zorder"],
        )
    raise ValueError("unsupported semantic 2D layer kind: " + kind)


class GraphicPrimitive:
    """Base class for a semantic two-dimensional graphics primitive."""

    def __init__(self, options: dict[str, Any]) -> None:
        self._options = _copy_options(options)

    def options(self) -> dict[str, Any]:
        return _copy_options(self._options)

    def set_options(self, options: dict[str, Any]) -> None:
        self._options = _copy_options(options)

    def set_zorder(self, zorder: int) -> None:
        self._options["zorder"] = zorder

    def _plotly_trace(self) -> Any:
        raise NotImplementedError("graphics primitive has no Plotly renderer")

    def _plotly_annotation(self) -> Any:
        return None

    def _plot_spec_payload(self) -> dict[str, Any]:
        """Describe an unmigrated primitive through an honest raw fallback."""
        return {
            "kind": "plotly-trace",
            "data": {"traces": [_plot_spec_json_value(self._plotly_trace())]},
            "source_intent": {
                "representation": "raw-plotly-fallback",
                "primitive": repr(self),
            },
            "style": {},
            "visibility": True,
            "legend": {},
            "metadata": {"semantic": False},
        }

    def _plot_spec_layer(
        self,
        ordinal: int,
        source_context: Any = None,
        ordered_options: Any = None,
    ) -> Any:
        return _plot_spec_layer(
            self._plot_spec_payload(), ordinal, source_context, ordered_options
        )

    def __repr__(self) -> str:
        return "Graphics primitive"

    __str__ = __repr__
    toString = __repr__


class _PlotlyPrimitive(GraphicPrimitive):
    """A renderer trace imported through a public object's Plotly boundary.

    This small adapter lets independently implemented objects, such as graph
    plots, participate in ordinary Sage graphics composition without making
    the semantic graphics layer depend on their implementation modules.
    """

    def __init__(self, trace: Any) -> None:
        GraphicPrimitive.__init__(self, {})
        self._trace = trace

    def _plotly_trace(self) -> Any:
        return self._trace

    def __repr__(self) -> str:
        return "Imported Plotly graphics primitive"

    __str__ = __repr__
    toString = __repr__


def _line_plot_spec_payload(value: Any) -> dict[str, Any]:
    options = value._options
    plan = _sage_primitive_plan("line_render_plan", options)
    line_style = plan["line"]
    marker_plan = plan["marker"]
    marker_style = None
    if marker_plan is not None:
        marker_style = {
            "color": _color_value(marker_plan["color"]),
            "size": marker_plan["size"],
            "symbol": marker_plan["symbol"],
            "line": {
                "color": _color_value(marker_plan["line"]["color"]),
                "width": marker_plan["line"]["width"],
            },
        }
    legend_label = _option_get(options, "legend_label")
    source_intent = {
        "constructor": "line",
        "representation": "normalized-primitive",
    }
    supplied_source_intent = _option_get(options, "__plot_source_intent__")
    if supplied_source_intent is not None:
        for source_name in supplied_source_intent:
            source_intent[source_name] = supplied_source_intent[source_name]
    return {
        "kind": "line",
        "data": {"x": value.xdata, "y": value.ydata},
        "source_intent": source_intent,
        "style": {
            "color": _color_value(line_style["color"]),
            "width": line_style["width"],
            "dash": line_style["dash"],
            "shape": line_style["shape"],
            "mode": plan["mode"],
            "marker": marker_style,
            "opacity": plan["opacity"],
        },
        "visibility": True,
        "legend": {
            "show": legend_label is not None,
            "label": None if legend_label is None else str(legend_label),
        },
        "metadata": {
            "semantic": True,
            "zorder": plan["zorder"],
        },
    }


@runtime.sequence_class
class Line(GraphicPrimitive):
    """A line through a sequence of two-dimensional points."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)

    def __len__(self) -> int:
        return len(self.xdata)

    def __getitem__(self, index: int) -> tuple[float, float]:
        return runtime.math_tuple([self.xdata[index], self.ydata[index]])

    def __repr__(self) -> str:
        return "Line defined by " + str(len(self.xdata)) + " points"

    __str__ = __repr__
    toString = __repr__

    def _plot_spec_payload(self) -> dict[str, Any]:
        return _line_plot_spec_payload(self)

    def _plotly_trace(self) -> Any:
        return _plot_spec_2d_trace(_line_plot_spec_payload(self))


@runtime.sequence_class
class Arrow(Line):
    """A directed line segment between two points."""

    def __repr__(self) -> str:
        return "Arrow from " + str(self[0]) + " to " + str(self[1])

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        return _plot_spec_2d_trace(self._plot_spec_payload())

    def _plot_spec_payload(self) -> dict[str, Any]:
        options = self._options
        plan = _sage_primitive_plan("arrow_render_plan", options)
        legend_label = _option_get(options, "legend_label")
        return {
            "kind": "arrow",
            "data": {
                "tail": [self.xdata[0], self.ydata[0]],
                "head": [self.xdata[1], self.ydata[1]],
            },
            "source_intent": {
                "constructor": "arrow",
                "representation": "normalized-primitive",
            },
            "style": {
                "arrowhead": plan["arrowhead"],
                "arrowside": plan["arrowside"],
                "arrowsize": plan["arrowsize"],
                "color": _color_value(plan["color"]),
                "dash": plan["dash"],
                "head": plan["head"],
                "opacity": plan["opacity"],
                "renderer": plan["renderer"],
                "shorten_each": plan["shorten_each"],
                "startarrowhead": plan["startarrowhead"],
                "width": plan["width"],
            },
            "visibility": True,
            "legend": {
                "show": legend_label is not None,
                "label": None if legend_label is None else str(legend_label),
            },
            "metadata": {"semantic": True, "zorder": plan["zorder"]},
        }

    def _plotly_annotation(self) -> Any:
        payload = self._plot_spec_payload()
        style = payload["style"]
        if style["renderer"] != "annotation":
            return None
        data = payload["data"]
        return _native_record(
            x=data["head"][0],
            y=data["head"][1],
            ax=data["tail"][0],
            ay=data["tail"][1],
            xref="x",
            yref="y",
            axref="x",
            ayref="y",
            text="",
            showarrow=True,
            arrowcolor=style["color"],
            arrowwidth=style["width"],
            arrowhead=style["arrowhead"],
            arrowsize=style["arrowsize"],
            startarrowhead=style["startarrowhead"],
            startarrowsize=style["arrowsize"],
            standoff=style["shorten_each"],
            startstandoff=style["shorten_each"],
            opacity=style["opacity"],
        )


@runtime.sequence_class
class Point(GraphicPrimitive):
    """A set of two-dimensional points."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)

    def __len__(self) -> int:
        return len(self.xdata)

    def __getitem__(self, index: int) -> tuple[float, float]:
        return runtime.math_tuple([self.xdata[index], self.ydata[index]])

    def __repr__(self) -> str:
        return "Point set defined by " + str(len(self.xdata)) + " point(s)"

    __str__ = __repr__
    toString = __repr__

    def _plot_spec_payload(self) -> dict[str, Any]:
        options = self._options
        plan = _sage_primitive_plan("point_render_plan", options)
        edge_plan = plan["edge"]
        edge = None
        if edge_plan is not None:
            edge = {
                "color": _color_value(edge_plan["color"]),
                "width": edge_plan["width"],
            }
        legend_label = _option_get(options, "legend_label")
        return {
            "kind": "point",
            "data": {"x": self.xdata, "y": self.ydata},
            "source_intent": {
                "constructor": "point",
                "representation": "normalized-primitive",
            },
            "style": {
                "color": _color_value(plan["color"]),
                "size": plan["size"],
                "symbol": plan["symbol"],
                "edge": edge,
                "opacity": plan["opacity"],
            },
            "visibility": True,
            "legend": {
                "show": legend_label is not None,
                "label": None if legend_label is None else str(legend_label),
            },
            "metadata": {"semantic": True, "zorder": plan["zorder"]},
        }

    def _plotly_trace(self) -> Any:
        return _plot_spec_2d_trace(self._plot_spec_payload())


@runtime.sequence_class
class Polygon(Line):
    """A filled polygon through a sequence of two-dimensional points."""

    def __repr__(self) -> str:
        return "Polygon defined by " + str(len(self.xdata)) + " points"

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        return _plot_spec_2d_trace(self._plot_spec_payload())

    def _plot_spec_payload(self) -> dict[str, Any]:
        options = self._options
        plan = _sage_primitive_plan("polygon_render_plan", options)
        line_style = plan["line"]
        legend_label = _option_get(options, "legend_label")
        return {
            "kind": "polygon",
            "data": {"x": self.xdata, "y": self.ydata},
            "source_intent": {
                "constructor": "polygon",
                "representation": "normalized-primitive",
            },
            "style": {
                "close_path": plan["close_path"],
                "fill": plan["fill"],
                "fillcolor": (
                    None
                    if plan["fillcolor"] is None
                    else _color_value(plan["fillcolor"])
                ),
                "line": {
                    "color": _color_value(line_style["color"]),
                    "dash": line_style["dash"],
                    "width": line_style["width"],
                },
                "opacity": plan["opacity"],
            },
            "visibility": True,
            "legend": {
                "show": legend_label is not None,
                "label": None if legend_label is None else str(legend_label),
            },
            "metadata": {"semantic": True, "zorder": plan["zorder"]},
        }


@runtime.sequence_class
class Bar(GraphicPrimitive):
    """A vertical bar chart."""

    def __init__(
        self,
        values: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xdata = list(range(len(values)))
        self.ydata = list(values)

    def __len__(self) -> int:
        return len(self.ydata)

    def __getitem__(self, index: int) -> tuple[float, float]:
        return runtime.math_tuple([self.xdata[index], self.ydata[index]])

    def __repr__(self) -> str:
        return "Bar chart defined by " + str(len(self.ydata)) + " values"

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        options = self._options
        color = _option_get(
            options, "rgbcolor", _option_get(options, "color", [0, 0, 1])
        )
        return _native_record(
            type="bar",
            x=self.xdata,
            y=self.ydata,
            marker=_native_record(color=_color_value(color)),
            opacity=float(_option_get(options, "alpha", 1)),
            width=float(_option_get(options, "width", 0.8)),
            showlegend=False,
        )


@runtime.sequence_class
class Histogram(GraphicPrimitive):
    """A Plotly-backed histogram of numeric samples."""

    def __init__(
        self,
        values: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.values = list(values)

    def __len__(self) -> int:
        return len(self.values)

    def __getitem__(self, index: int) -> float:
        return self.values[index]

    def __repr__(self) -> str:
        return "Histogram defined by " + str(len(self.values)) + " values"

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        options = self._options
        color = _option_get(
            options, "rgbcolor", _option_get(options, "color", [0, 0, 1])
        )
        trace = _native_record(
            type="histogram",
            x=self.values,
            marker=_native_record(
                color=_color_value(color),
                line=_native_record(
                    color=_color_value(_option_get(options, "edgecolor", color)),
                    width=float(_option_get(options, "linewidth", 1)),
                ),
            ),
            opacity=float(_option_get(options, "alpha", 1)),
            showlegend=_option_get(options, "label") is not None,
        )
        label = _option_get(options, "label")
        if label is not None:
            runtime.reflect.set(trace, "name", str(label))
        bins_option = _option_get(options, "bins", 10)
        minimum = min(self.values) if len(self.values) else 0.0
        maximum = max(self.values) if len(self.values) else 1.0
        range_option = _option_get(options, "range")
        if isinstance(range_option, (list, tuple)) and len(range_option) == 2:
            minimum = float(range_option[0])
            maximum = float(range_option[1])
        if isinstance(bins_option, (list, tuple)):
            edges = [float(value) for value in bins_option]
            if len(edges) >= 2:
                minimum = edges[0]
                maximum = edges[-1]
                size = (maximum - minimum) / float(len(edges) - 1)
            else:
                size = 0.0
        else:
            bins = int(bins_option)
            size = 0.0
            if bins > 0 and maximum > minimum:
                size = (maximum - minimum) / bins
        if size > 0 and len(self.values):
            runtime.reflect.set(
                trace,
                "xbins",
                _native_record(
                    start=minimum,
                    end=maximum,
                    size=size,
                ),
            )
        if _option_get(options, "normalize", False) or _option_get(
            options, "density", False
        ):
            runtime.reflect.set(trace, "histnorm", "probability density")
        cumulative = _option_get(options, "cumulative", False)
        if cumulative:
            runtime.reflect.set(
                trace,
                "cumulative",
                _native_record(
                    enabled=True,
                    direction=(
                        "decreasing"
                        if isinstance(cumulative, (int, float)) and cumulative < 0
                        else "increasing"
                    ),
                ),
            )
        return trace


class Contour(GraphicPrimitive):
    """A rectangular grid rendered as a Plotly contour trace."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        zdata: Sequence[Sequence[float]],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)
        self.zdata = [list(row) for row in zdata]

    def __repr__(self) -> str:
        return "Contour plot"

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        options = self._options
        contours = _native_record(
            coloring=("fill" if bool(_option_get(options, "fill", True)) else "lines"),
        )
        levels = _option_get(options, "contours")
        if isinstance(levels, (list, tuple)) and len(levels):
            numeric_levels = [float(value) for value in levels]
            runtime.reflect.set(contours, "start", min(numeric_levels))
            runtime.reflect.set(contours, "end", max(numeric_levels))
            if len(numeric_levels) > 1:
                runtime.reflect.set(
                    contours,
                    "size",
                    (max(numeric_levels) - min(numeric_levels))
                    / float(len(numeric_levels) - 1),
                )
            else:
                runtime.reflect.set(contours, "size", 1)
        color = _option_get(options, "color", _option_get(options, "rgbcolor", "blue"))
        trace = _native_record(
            type="contour",
            x=self.xdata,
            y=self.ydata,
            z=self.zdata,
            showscale=bool(_option_get(options, "colorbar", True)),
            autocontour=levels is None,
            contours=contours,
            line=_native_record(
                color=_color_value(color),
                width=float(
                    _option_get(
                        options, "linewidth", _option_get(options, "thickness", 1)
                    )
                ),
                dash=_dash_value(str(_option_get(options, "linestyle", "-"))),
            ),
            opacity=float(_option_get(options, "alpha", 1)),
        )
        if bool(_option_get(options, "fill", True)):
            runtime.reflect.set(
                trace,
                "colorscale",
                _plotly_colorscale(_option_get(options, "cmap", color)),
            )
        legend_label = _option_get(options, "legend_label")
        if legend_label is not None:
            runtime.reflect.set(trace, "showlegend", True)
            runtime.reflect.set(trace, "name", str(legend_label))
        return trace


def _plotly_colorscale(cmap: Any) -> Any:
    if isinstance(cmap, (list, tuple)):
        colors = list(cmap)
        if len(colors) == 0:
            colors = ["black", "white"]
        if len(colors) == 1:
            colors.append(colors[0])
        answer = []
        denominator = float(len(colors) - 1)
        for index in range(len(colors)):
            answer.append(
                [
                    index / denominator,
                    _color_value(colors[index]),
                ]
            )
        return answer
    aliases = {
        "gray": "Greys",
        "grey": "Greys",
        "Greys_r": "Greys",
    }
    return _option_get(aliases, str(cmap), str(cmap))


class Density(GraphicPrimitive):
    """A rectangular scalar grid rendered as a heatmap."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        zdata: Sequence[Sequence[float]],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)
        self.zdata = [list(row) for row in zdata]

    def __repr__(self) -> str:
        rows = len(self.zdata)
        columns = 0 if rows == 0 else len(self.zdata[0])
        return (
            "DensityPlot defined by a "
            + str(rows)
            + " x "
            + str(columns)
            + " data grid"
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        options = self._options
        colorscale = _option_get(options, "colorscale")
        if colorscale is None:
            colorscale = _plotly_colorscale(_option_get(options, "cmap", "Greys"))
        interpolation = _option_get(options, "interpolation", "catrom")
        if interpolation in ("none", "nearest", False):
            smoothing = False
        else:
            smoothing = "best"
        trace = _native_record(
            type="heatmap",
            x=self.xdata,
            y=self.ydata,
            z=self.zdata,
            colorscale=colorscale,
            showscale=bool(_option_get(options, "colorbar", False)),
            opacity=float(_option_get(options, "alpha", 1)),
            zsmooth=smoothing,
            hoverongaps=False,
        )
        if _option_get(options, "vmin") is not None:
            runtime.reflect.set(trace, "zmin", float(_option_get(options, "vmin")))
        if _option_get(options, "vmax") is not None:
            runtime.reflect.set(trace, "zmax", float(_option_get(options, "vmax")))
        return trace


class ComplexPlot(GraphicPrimitive):
    """A domain-colored rectangular grid of complex function values."""

    def __init__(
        self,
        rgb_data: Sequence[Sequence[Sequence[float]]],
        x_range: tuple[float, float],
        y_range: tuple[float, float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.rgb_data = [[list(pixel) for pixel in row] for row in rgb_data]
        self.x_range = x_range
        self.y_range = y_range
        self.ydata = [y_range[0], y_range[1]]
        self.xdata = [x_range[0], x_range[1]]

    def __repr__(self) -> str:
        rows = len(self.rgb_data)
        columns = 0 if rows == 0 else len(self.rgb_data[0])
        return (
            "ComplexPlot defined by a "
            + str(columns)
            + " x "
            + str(rows)
            + " data grid"
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        rows = len(self.rgb_data)
        columns = 0 if rows == 0 else len(self.rgb_data[0])
        xstep = (
            1.0 if columns < 2 else (self.x_range[1] - self.x_range[0]) / (columns - 1)
        )
        ystep = 1.0 if rows < 2 else (self.y_range[1] - self.y_range[0]) / (rows - 1)
        pixels = [
            [
                [
                    int(runtime.math.round(max(0.0, min(1.0, component)) * 255.0))
                    for component in pixel
                ]
                for pixel in row
            ]
            for row in reversed(self.rgb_data)
        ]
        interpolation = str(
            _option_get(self._options, "interpolation", "catrom")
        ).lower()
        return _native_record(
            type="image",
            z=pixels,
            colormodel="rgb",
            x0=self.x_range[0],
            y0=self.y_range[1],
            dx=xstep,
            dy=-ystep,
            zsmooth=(False if interpolation in ("none", "nearest") else "best"),
            opacity=float(_option_get(self._options, "alpha", 1)),
            hoverinfo="skip",
        )


class PlotField(GraphicPrimitive):
    """A sampled two-dimensional vector field."""

    def __init__(
        self,
        xpos_array: Sequence[float],
        ypos_array: Sequence[float],
        xvec_array: Sequence[Any],
        yvec_array: Sequence[Any],
        grid_shape: tuple[int, int],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xpos_array = list(xpos_array)
        self.ypos_array = list(ypos_array)
        self.xvec_array = list(xvec_array)
        self.yvec_array = list(yvec_array)
        self.xdata = self.xpos_array
        self.ydata = self.ypos_array
        self.grid_shape = grid_shape

    def __repr__(self) -> str:
        return (
            "PlotField defined by a "
            + str(self.grid_shape[0])
            + " x "
            + str(self.grid_shape[1])
            + " vector grid"
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        options = self._options
        maximum_length = 0.0
        for index in range(len(self.xvec_array)):
            xvector = self.xvec_array[index]
            yvector = self.yvec_array[index]
            if xvector is None or yvector is None:
                continue
            length = runtime.math.sqrt(xvector * xvector + yvector * yvector)
            if length > maximum_length:
                maximum_length = length

        xcount, ycount = self.grid_shape
        xspacing = 1.0
        yspacing = 1.0
        if xcount > 1:
            xspacing = (max(self.xpos_array) - min(self.xpos_array)) / float(xcount - 1)
        if ycount > 1:
            yspacing = (max(self.ypos_array) - min(self.ypos_array)) / float(ycount - 1)
        spacing = min(abs(xspacing), abs(yspacing))
        scale = 0.0
        if maximum_length > 0:
            scale = 0.75 * spacing / maximum_length
        pivot = str(_option_get(options, "pivot", "tail"))
        if pivot == "middle":
            pivot_offset = 0.5
        elif pivot == "tip":
            pivot_offset = 1.0
        else:
            pivot_offset = 0.0

        xdata = []
        ydata = []
        marker_sizes = []
        marker_symbols = []
        for index in range(len(self.xpos_array)):
            xvector = self.xvec_array[index]
            yvector = self.yvec_array[index]
            if xvector is None or yvector is None:
                continue
            dx = xvector * scale
            dy = yvector * scale
            xstart = self.xpos_array[index] - pivot_offset * dx
            ystart = self.ypos_array[index] - pivot_offset * dy
            xdata.extend([xstart, xstart + dx, None])
            ydata.extend([ystart, ystart + dy, None])
            marker_sizes.extend([0, 8, 0])
            marker_symbols.extend(["circle", "arrow", "circle"])

        color = _option_get(options, "rgbcolor", _option_get(options, "color", "blue"))
        line_style = _native_record(
            color=_color_value(color),
            width=float(_option_get(options, "thickness", 1)),
        )
        head_length = float(_option_get(options, "headlength", 5))
        head_axis_length = float(_option_get(options, "headaxislength", 4.5))
        has_heads = head_length > 1e-8 and head_axis_length != 0
        trace = _native_record(
            type="scatter",
            mode="lines+markers" if has_heads else "lines",
            x=xdata,
            y=ydata,
            line=line_style,
            opacity=float(_option_get(options, "alpha", 1)),
            showlegend=_option_get(options, "legend_label") is not None,
        )
        if has_heads:
            head_width = float(_option_get(options, "headwidth", 3))
            marker_size = max(4.0, 2.5 * head_width)
            marker_sizes = [marker_size if size else 0 for size in marker_sizes]
            runtime.reflect.set(
                trace,
                "marker",
                _native_record(
                    color=_color_value(color),
                    size=marker_sizes,
                    symbol=marker_symbols,
                    angleref="previous",
                ),
            )
        legend_label = _option_get(options, "legend_label")
        if legend_label is not None:
            runtime.reflect.set(trace, "name", str(legend_label))
        return trace


class StreamlinePlot(GraphicPrimitive):
    """A sampled vector field together with integrated streamlines."""

    def __init__(
        self,
        xpos_array: Sequence[float],
        ypos_array: Sequence[float],
        xvec_array: Sequence[Sequence[Any]],
        yvec_array: Sequence[Sequence[Any]],
        paths: Sequence[Sequence[tuple[float, float]]],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xpos_array = list(xpos_array)
        self.ypos_array = list(ypos_array)
        self.xvec_array = [list(row) for row in xvec_array]
        self.yvec_array = [list(row) for row in yvec_array]
        self.paths = [list(path) for path in paths]
        self.xdata = self.xpos_array
        self.ydata = self.ypos_array

    def __repr__(self) -> str:
        return (
            "StreamlinePlot defined by a "
            + str(len(self.xpos_array))
            + " x "
            + str(len(self.ypos_array))
            + " vector grid"
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        options = self._options
        xdata = []
        ydata = []
        marker_sizes = []
        marker_symbols = []
        for path in self.paths:
            middle = len(path) // 2
            for index in range(len(path)):
                xdata.append(path[index][0])
                ydata.append(path[index][1])
                marker_sizes.append(7 if index == middle else 0)
                marker_symbols.append("arrow" if index == middle else "circle")
            xdata.append(None)
            ydata.append(None)
            marker_sizes.append(0)
            marker_symbols.append("circle")
        color = _option_get(options, "rgbcolor", _option_get(options, "color", "blue"))
        trace = _native_record(
            type="scatter",
            mode="lines+markers",
            x=xdata,
            y=ydata,
            line=_native_record(
                color=_color_value(color),
                width=float(_option_get(options, "thickness", 1)),
            ),
            marker=_native_record(
                color=_color_value(color),
                size=marker_sizes,
                symbol=marker_symbols,
                angleref="previous",
            ),
            opacity=float(_option_get(options, "alpha", 1)),
            showlegend=_option_get(options, "legend_label") is not None,
        )
        legend_label = _option_get(options, "legend_label")
        if legend_label is not None:
            runtime.reflect.set(trace, "name", str(legend_label))
        return trace


@runtime.sequence_class
class Text(GraphicPrimitive):
    """A text label positioned in two-dimensional coordinates."""

    def __init__(
        self,
        string: str,
        position: tuple[float, float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.string = string
        self.position = position

    def __len__(self) -> int:
        return 1

    def __getitem__(self, index: int) -> tuple[float, float]:
        if index != 0:
            raise IndexError("text index out of range")
        return self.position

    def __repr__(self) -> str:
        return "Text '" + self.string + "'"

    __str__ = __repr__
    toString = __repr__

    def _plot_spec_payload(self) -> dict[str, Any]:
        options = self._options
        plan = _sage_primitive_plan("text_render_plan", options)
        horizontal_positions = {
            "left": "right",
            "center": "center",
            "right": "left",
        }
        vertical_positions = {
            "top": "bottom",
            "middle": "middle",
            "bottom": "top",
        }
        position = (
            vertical_positions[plan["yanchor"]]
            + " "
            + horizontal_positions[plan["xanchor"]]
        )
        return {
            "kind": "text",
            "data": {"text": self.string, "position": list(self.position)},
            "source_intent": {
                "constructor": "text",
                "representation": "normalized-primitive",
            },
            "style": {
                "background_color": (
                    None
                    if plan["background_color"] is None
                    else _color_value(plan["background_color"])
                ),
                "color": _color_value(plan["color"]),
                "font_size": plan["font_size"],
                "font_style": plan["font_style"],
                "font_weight": plan["font_weight"],
                "opacity": plan["opacity"],
                "position": position,
                "renderer": plan["renderer"],
                "rotation": plan["rotation"],
                "xanchor": plan["xanchor"],
                "xref": plan["xref"],
                "yanchor": plan["yanchor"],
                "yref": plan["yref"],
            },
            "visibility": True,
            "legend": {"show": False, "label": None},
            "metadata": {"semantic": True, "zorder": plan["zorder"]},
        }

    def _plotly_trace(self) -> Any:
        return _plot_spec_2d_trace(self._plot_spec_payload())

    def _plotly_annotation(self) -> Any:
        payload = self._plot_spec_payload()
        style = payload["style"]
        if style["renderer"] != "annotation":
            return None
        data = payload["data"]
        font = _native_record(
            color=style["color"],
            size=style["font_size"],
        )
        if style["font_style"] is not None:
            runtime.reflect.set(font, "style", style["font_style"])
        if style["font_weight"] is not None:
            runtime.reflect.set(font, "weight", style["font_weight"])
        annotation = _native_record(
            x=data["position"][0],
            y=data["position"][1],
            xref=style["xref"],
            yref=style["yref"],
            text=data["text"],
            showarrow=False,
            xanchor=style["xanchor"],
            yanchor=style["yanchor"],
            textangle=style["rotation"],
            font=font,
            opacity=style["opacity"],
        )
        if style["background_color"] is not None:
            runtime.reflect.set(annotation, "bgcolor", style["background_color"])
        return annotation


@runtime.sequence_class
class Graphics:
    """A composable collection of semantic graphics primitives."""

    def __init__(self) -> None:
        self._objects: list[GraphicPrimitive] = []
        self._layer_ordinals: list[int] = []
        self._layer_source_contexts: list[Any] = []
        self._layer_ordered_options: list[Any] = []
        self._next_layer_ordinal = 0
        self._extra_kwds: dict[str, Any] = {}
        self._show_legend = False
        self._legend_opts: dict[str, Any] = {}
        self._fontsize = 10
        self._axes_labels_size = 1.6
        self._plot_spec_provenance: Any = {
            "frontend": "sagejs",
            "source_language": "sage",
            "constructor": "Graphics",
        }
        self._plot_spec_diagnostics: list[Any] = []

    def __len__(self) -> int:
        return len(self._objects)

    def __iter__(self) -> Iterator[GraphicPrimitive]:
        return iter(self._objects)

    def __getitem__(self, index: int) -> GraphicPrimitive:
        return self._objects[index]

    def __repr__(self) -> str:
        count = len(self._objects)
        noun = "primitive" if count == 1 else "primitives"
        return "Graphics object consisting of " + str(count) + " graphics " + noun

    __str__ = __repr__
    toString = __repr__

    def add_primitive(self, primitive: GraphicPrimitive) -> None:
        self._add_primitive_with_ordinal(primitive, None)

    def _add_primitive_with_ordinal(
        self,
        primitive: GraphicPrimitive,
        preferred_ordinal: int | None,
        source_context: Any = None,
        ordered_options: Any = None,
    ) -> None:
        ordinal = preferred_ordinal
        if ordinal is None or ordinal in self._layer_ordinals:
            ordinal = self._next_layer_ordinal
            while ordinal in self._layer_ordinals:
                ordinal += 1
        self._objects.append(primitive)
        self._layer_ordinals.append(ordinal)
        self._layer_source_contexts.append(source_context)
        self._layer_ordered_options.append(
            [] if ordered_options is None else list(ordered_options)
        )
        if ordinal >= self._next_layer_ordinal:
            self._next_layer_ordinal = ordinal + 1
        if _option_get(primitive.options(), "legend_label") is not None:
            self._show_legend = True

    def set_extra_kwds(self, keywords: dict[str, Any]) -> None:
        for key in keywords:
            value = keywords[key]
            if key == "fontsize" and value is not None:
                self._fontsize = int(value)
            elif key == "axes_labels_size" and value is not None:
                self._axes_labels_size = float(value)
            elif key == "legend_options" and value is not None:
                copied_legend_options = _copy_options(value)
                for legend_name in copied_legend_options:
                    self._legend_opts[legend_name] = copied_legend_options[legend_name]
            elif key == "show_legend" and value is not None:
                self._show_legend = bool(value)
            self._extra_kwds[key] = value

    def get_extra_kwds(self) -> dict[str, Any]:
        return _copy_options(self._extra_kwds)

    def with_plot_spec_context(
        self,
        provenance: Any = None,
        source_intent: Any = None,
        ordered_options: Any = None,
        diagnostics: Any = None,
    ) -> Graphics:
        """Return a shallow clone carrying detached frontend PlotSpec context."""
        answer = Graphics()
        for index in range(len(self._objects)):
            context = self._layer_source_contexts[index]
            if source_intent is not None:
                new_context = _plot_spec_json_value(source_intent)
                if context is not None:
                    new_context.__setitem__(
                        "child_context", _plot_spec_json_value(context)
                    )
                context = new_context
            options = list(self._layer_ordered_options[index])
            if ordered_options is not None:
                options += list(ordered_options)
            answer._add_primitive_with_ordinal(
                self._objects[index],
                self._layer_ordinals[index],
                context,
                options,
            )
        answer.set_extra_kwds(self._extra_kwds)
        answer._show_legend = self._show_legend
        answer._legend_opts = _copy_options(self._legend_opts)
        answer._fontsize = self._fontsize
        answer._axes_labels_size = self._axes_labels_size
        answer._plot_spec_provenance = (
            self._plot_spec_provenance
            if provenance is None
            else _plot_spec_json_value(provenance)
        )
        answer._plot_spec_diagnostics = list(self._plot_spec_diagnostics)
        if diagnostics is not None:
            for diagnostic in diagnostics:
                answer._plot_spec_diagnostics.append(_plot_spec_json_value(diagnostic))
        return answer

    def legend(self, show: Any = None) -> bool:
        if show is None:
            return self._show_legend
        self._show_legend = bool(show)
        return self._show_legend

    def set_legend_options(self, **options: Any) -> dict[str, Any]:
        """Update legend display options and return their current values."""
        for name in options:
            self._legend_opts[name] = options[name]
        return _copy_options(self._legend_opts)

    def fontsize(self, size: Any = None) -> int:
        """Get or set the base font size used for ticks and axis labels."""
        if size is None:
            return self._fontsize
        numeric = int(size)
        if numeric <= 0:
            raise ValueError("fontsize must be positive")
        self._fontsize = numeric
        self._extra_kwds["fontsize"] = numeric
        return numeric

    def axes_labels_size(self, size: Any = None) -> float:
        """Get or set the axis-label scale relative to tick labels."""
        if size is None:
            return self._axes_labels_size
        numeric = float(size)
        if numeric <= 0:
            raise ValueError("axes_labels_size must be positive")
        self._axes_labels_size = numeric
        self._extra_kwds["axes_labels_size"] = numeric
        return numeric

    def axes_labels(self, labels: Any = None) -> Any:
        """Get or set the pair of horizontal and vertical axis labels."""
        if labels is None:
            return _option_get(self._extra_kwds, "axes_labels")
        values = list(labels)
        if len(values) != 2:
            raise ValueError("axes_labels must contain exactly two labels")
        normalized = runtime.math_tuple([str(values[0]), str(values[1])])
        self._extra_kwds["axes_labels"] = normalized
        return normalized

    def set_flip(
        self,
        flip_x: Any = None,
        flip_y: Any = None,
    ) -> None:
        """Set horizontal or vertical axis reversal."""
        if flip_x is not None:
            self._extra_kwds["flip_x"] = bool(flip_x)
        if flip_y is not None:
            self._extra_kwds["flip_y"] = bool(flip_y)

    def flip(
        self,
        flip_x: bool = False,
        flip_y: bool = False,
    ) -> None:
        """Toggle horizontal or vertical axis reversal."""
        if flip_x:
            self._extra_kwds["flip_x"] = not bool(
                _option_get(self._extra_kwds, "flip_x", False)
            )
        if flip_y:
            self._extra_kwds["flip_y"] = not bool(
                _option_get(self._extra_kwds, "flip_y", False)
            )

    def set_aspect_ratio(self, ratio: Any) -> None:
        if ratio in ("auto", "automatic"):
            self._extra_kwds["aspect_ratio"] = "automatic"
            return
        numeric_ratio = float(ratio)
        if numeric_ratio <= 0:
            raise ValueError("the aspect ratio must be positive or 'automatic'")
        self._extra_kwds["aspect_ratio"] = numeric_ratio

    def aspect_ratio(self) -> Any:
        return _option_get(self._extra_kwds, "aspect_ratio", "automatic")

    def axes(self, show: Any = runtime.undefined) -> bool:
        if show is runtime.undefined:
            return bool(_option_get(self._extra_kwds, "axes", True))
        self._extra_kwds["axes"] = bool(show)
        return bool(show)

    def _axis_bound(self, name: str, value: Any) -> Any:
        if value is not runtime.undefined:
            self._extra_kwds[name] = float(value)
            return float(value)
        if _option_has(self._extra_kwds, name):
            return _option_get(self._extra_kwds, name)
        axis = "xdata" if name[0] == "x" else "ydata"
        values = []
        for primitive in self._objects:
            data = getattr(primitive, axis, runtime.undefined)
            if data is not runtime.undefined:
                values.extend(data)
            elif isinstance(primitive, Text) and not bool(
                _option_get(primitive._options, "axis_coords", False)
            ):
                values.append(primitive.position[0 if name[0] == "x" else 1])
        if len(values) == 0:
            return 0.0
        answer = values[0]
        if name[1:] == "min":
            for candidate in values[1:]:
                if candidate < answer:
                    answer = candidate
        else:
            for candidate in values[1:]:
                if candidate > answer:
                    answer = candidate
        return answer

    def xmin(self, value: Any = runtime.undefined) -> Any:
        return self._axis_bound("xmin", value)

    def xmax(self, value: Any = runtime.undefined) -> Any:
        return self._axis_bound("xmax", value)

    def ymin(self, value: Any = runtime.undefined) -> Any:
        return self._axis_bound("ymin", value)

    def ymax(self, value: Any = runtime.undefined) -> Any:
        return self._axis_bound("ymax", value)

    def __add__(self, other: object) -> Graphics:
        if other == 0:
            return self
        if not isinstance(other, Graphics):
            raise TypeError("can only add Graphics to Graphics")
        answer = Graphics()
        for index in range(len(self._objects)):
            answer._add_primitive_with_ordinal(
                self._objects[index],
                self._layer_ordinals[index],
                self._layer_source_contexts[index],
                self._layer_ordered_options[index],
            )
        for index in range(len(other._objects)):
            answer._add_primitive_with_ordinal(
                other._objects[index],
                other._layer_ordinals[index],
                other._layer_source_contexts[index],
                other._layer_ordered_options[index],
            )
        answer.set_extra_kwds(self._extra_kwds)
        answer.set_extra_kwds(other._extra_kwds)
        answer._show_legend = self._show_legend or other._show_legend
        answer._legend_opts = _copy_options(self._legend_opts)
        _option_update(answer._legend_opts, other._legend_opts)
        answer._fontsize = other._fontsize
        answer._axes_labels_size = other._axes_labels_size
        if self._plot_spec_provenance == other._plot_spec_provenance:
            answer._plot_spec_provenance = self._plot_spec_provenance
        else:
            answer._plot_spec_provenance = {
                "frontend": "sagejs",
                "constructor": "composition",
                "metadata": {
                    "children": [
                        self._plot_spec_provenance,
                        other._plot_spec_provenance,
                    ]
                },
            }
        answer._plot_spec_diagnostics = list(self._plot_spec_diagnostics)
        answer._plot_spec_diagnostics += list(other._plot_spec_diagnostics)
        if bool(_option_get(self._extra_kwds, "flip_x", False)) or bool(
            _option_get(other._extra_kwds, "flip_x", False)
        ):
            answer._extra_kwds["flip_x"] = True
        if bool(_option_get(self._extra_kwds, "flip_y", False)) or bool(
            _option_get(other._extra_kwds, "flip_y", False)
        ):
            answer._extra_kwds["flip_y"] = True
        return answer

    def __radd__(self, other: object) -> Graphics:
        if other == 0:
            return self
        if isinstance(other, Graphics):
            return other + self
        raise TypeError("can only add Graphics to Graphics")

    def _plotly_layout(self) -> Any:
        options = self._extra_kwds
        xaxis = _native_object()
        yaxis = _native_object()
        font_size = int(_option_get(options, "fontsize", self._fontsize))
        layout = _native_record(
            autosize=True,
            showlegend=bool(_option_get(options, "show_legend", self._show_legend)),
            font=_native_record(size=font_size),
            xaxis=xaxis,
            yaxis=yaxis,
        )
        title = _option_get(options, "title")
        if title is not None:
            title_record = _native_record(text=str(title))
            title_position = _option_get(options, "title_pos")
            if isinstance(title_position, (list, tuple)):
                if len(title_position) != 2:
                    raise ValueError("title_pos must contain two numbers")
                runtime.reflect.set(title_record, "x", float(title_position[0]))
                runtime.reflect.set(title_record, "y", float(title_position[1]))
                runtime.reflect.set(title_record, "xref", "paper")
                runtime.reflect.set(title_record, "yref", "paper")
                runtime.reflect.set(title_record, "xanchor", "center")
            runtime.reflect.set(layout, "title", title_record)

        axes_labels = _option_get(options, "axes_labels")
        if isinstance(axes_labels, (list, tuple)) and len(axes_labels) == 2:
            label_scale = float(
                _option_get(options, "axes_labels_size", self._axes_labels_size)
            )
            runtime.reflect.set(
                xaxis,
                "title",
                _native_record(
                    text=str(axes_labels[0]),
                    font=_native_record(size=font_size * label_scale),
                ),
            )
            runtime.reflect.set(
                yaxis,
                "title",
                _native_record(
                    text=str(axes_labels[1]),
                    font=_native_record(size=font_size * label_scale),
                ),
            )

        if _option_has(options, "xmin") or _option_has(options, "xmax"):
            runtime.reflect.set(
                xaxis,
                "range",
                [
                    (
                        None
                        if _option_get(options, "xmin") is None
                        else float(_option_get(options, "xmin"))
                    ),
                    (
                        None
                        if _option_get(options, "xmax") is None
                        else float(_option_get(options, "xmax"))
                    ),
                ],
            )
        if _option_has(options, "ymin") or _option_has(options, "ymax"):
            runtime.reflect.set(
                yaxis,
                "range",
                [
                    (
                        None
                        if _option_get(options, "ymin") is None
                        else float(_option_get(options, "ymin"))
                    ),
                    (
                        None
                        if _option_get(options, "ymax") is None
                        else float(_option_get(options, "ymax"))
                    ),
                ],
            )

        axes = bool(_option_get(options, "axes", True))
        frame = bool(_option_get(options, "frame", False))
        for axis in (xaxis, yaxis):
            runtime.reflect.set(axis, "visible", axes or frame)
            runtime.reflect.set(axis, "showline", frame)
            runtime.reflect.set(axis, "mirror", frame)
            runtime.reflect.set(axis, "zeroline", axes)
            runtime.reflect.set(axis, "ticks", "outside" if frame else "")

        gridlines = _option_get(options, "gridlines", False)
        xgrid, ygrid = _axis_pair(gridlines)
        if gridlines is True or gridlines in ("automatic", "major", "minor"):
            xgrid = gridlines
            ygrid = gridlines
        for axis, grid_value in [(xaxis, xgrid), (yaxis, ygrid)]:
            enabled = bool(
                grid_value is True or grid_value in ("automatic", "major", "minor")
            )
            runtime.reflect.set(axis, "showgrid", enabled)
            if grid_value == "minor":
                runtime.reflect.set(axis, "minor", _native_record(showgrid=True))

        shapes = []
        grid_style = _copy_options(_option_get(options, "gridlinesstyle", {}))
        vertical_style = _copy_options(grid_style)
        horizontal_style = _copy_options(grid_style)
        _option_update(
            vertical_style,
            _option_get(options, "vgridlinesstyle", {}),
        )
        _option_update(
            horizontal_style,
            _option_get(options, "hgridlinesstyle", {}),
        )
        if isinstance(xgrid, (list, tuple)):
            for value in xgrid:
                coordinate = value[0] if isinstance(value, (list, tuple)) else value
                shapes.append(
                    _native_record(
                        type="line",
                        x0=float(coordinate),
                        x1=float(coordinate),
                        y0=0,
                        y1=1,
                        yref="paper",
                        line=_grid_line_style(vertical_style),
                        layer="below",
                    )
                )
        if isinstance(ygrid, (list, tuple)):
            for value in ygrid:
                coordinate = value[0] if isinstance(value, (list, tuple)) else value
                shapes.append(
                    _native_record(
                        type="line",
                        y0=float(coordinate),
                        y1=float(coordinate),
                        x0=0,
                        x1=1,
                        xref="paper",
                        line=_grid_line_style(horizontal_style),
                        layer="below",
                    )
                )
        if len(shapes):
            runtime.reflect.set(layout, "shapes", shapes)

        scale = str(_option_get(options, "scale", "linear"))
        if scale in ("loglog", "semilogx"):
            runtime.reflect.set(xaxis, "type", "log")
        if scale in ("loglog", "semilogy"):
            runtime.reflect.set(yaxis, "type", "log")

        ticks = _option_get(options, "ticks")
        xticks, yticks = _axis_pair(ticks)
        formatter = _option_get(options, "tick_formatter")
        xformatter, yformatter = _axis_pair(formatter)
        integer_ticks = bool(_option_get(options, "ticks_integer", False))
        _apply_axis_ticks(xaxis, xticks, xformatter, integer_ticks)
        _apply_axis_ticks(yaxis, yticks, yformatter, integer_ticks)

        if bool(_option_get(options, "flip_x", False)):
            if runtime.reflect.has(xaxis, "range"):
                runtime.reflect.set(
                    xaxis, "range", list(reversed(runtime.reflect.get(xaxis, "range")))
                )
            else:
                runtime.reflect.set(xaxis, "autorange", "reversed")
        if bool(_option_get(options, "flip_y", False)):
            if runtime.reflect.has(yaxis, "range"):
                runtime.reflect.set(
                    yaxis, "range", list(reversed(runtime.reflect.get(yaxis, "range")))
                )
            else:
                runtime.reflect.set(yaxis, "autorange", "reversed")

        ratio = _option_get(options, "aspect_ratio", "automatic")
        if ratio not in ("auto", "automatic"):
            runtime.reflect.set(
                yaxis,
                "scaleanchor",
                "x",
            )
            runtime.reflect.set(yaxis, "scaleratio", float(ratio))

        figsize = _option_get(options, "figsize")
        if figsize is not None:
            width, height = _parse_figsize(figsize)
            dpi = float(_option_get(options, "dpi", 100))
            if dpi <= 0:
                raise ValueError("dpi must be positive")
            runtime.reflect.set(layout, "width", int(width * dpi))
            runtime.reflect.set(layout, "height", int(height * dpi))

        if bool(_option_get(options, "transparent", False)):
            runtime.reflect.set(layout, "paper_bgcolor", "rgba(0,0,0,0)")
            runtime.reflect.set(layout, "plot_bgcolor", "rgba(0,0,0,0)")

        legend_options = _copy_options(self._legend_opts)
        supplied_legend_options = _copy_options(
            _option_get(options, "legend_options", {})
        )
        _option_update(
            legend_options,
            supplied_legend_options,
        )
        for option_name in runtime.object.keys(options):
            if option_name[:7] == "legend_":
                legend_options[option_name[7:]] = _option_get(options, option_name)
        if len(runtime.object.keys(legend_options)):
            location = _option_get(legend_options, "loc", "best")
            position = _legend_position(location)
            legend = _native_record(
                x=position[0],
                y=position[1],
                xanchor=position[2],
                yanchor=position[3],
                bgcolor=_color_value(
                    _option_get(legend_options, "back_color", "white")
                ),
                font=_native_record(
                    family=str(
                        _option_get(legend_options, "font_family", "sans-serif")
                    ),
                    size=_option_get(legend_options, "font_size", font_size),
                ),
            )
            legend_title = _option_get(legend_options, "title")
            if legend_title is not None:
                runtime.reflect.set(
                    legend, "title", _native_record(text=str(legend_title))
                )
            if int(_option_get(legend_options, "ncol", 1)) > 1:
                runtime.reflect.set(legend, "orientation", "h")
            runtime.reflect.set(layout, "legend", legend)
        imported_layout = _option_get(options, "__plotly_layout__")
        if imported_layout is not None:
            for imported_name in runtime.object.keys(imported_layout):
                if not _option_has(options, imported_name):
                    runtime.reflect.set(
                        layout,
                        imported_name,
                        runtime.reflect.get(imported_layout, imported_name),
                    )
        return layout

    def plotly(self) -> Any:
        """Return the renderer-neutral Plotly figure description."""
        traces = []
        annotations = []
        for primitive in self._objects:
            trace = primitive._plotly_trace()
            if trace is not None:
                traces.append(trace)
            annotation = primitive._plotly_annotation()
            if annotation is not None:
                annotations.append(annotation)
        layout = self._plotly_layout()
        if len(annotations):
            existing_annotations = runtime.reflect.get(layout, "annotations")
            if existing_annotations is runtime.undefined:
                runtime.reflect.set(layout, "annotations", annotations)
            else:
                runtime.reflect.set(
                    layout,
                    "annotations",
                    list(existing_annotations) + annotations,
                )
        config = _native_record(
            displaylogo=False,
            responsive=True,
        )
        imported_config = _option_get(self._extra_kwds, "__plotly_config__")
        if imported_config is not None:
            _option_update(config, imported_config)
        return _native_record(
            data=traces,
            layout=layout,
            config=config,
        )

    def spec(self) -> Any:
        """Return a stable, JSON-safe semantic description of this plot."""
        plotting = __import__("sagejs.plotting", fromlist=["PlotSpec"])
        plot_spec_class = plotting.PlotSpec

        layers = []
        for index in range(len(self._objects)):
            layers.append(
                self._objects[index]._plot_spec_layer(
                    self._layer_ordinals[index],
                    self._layer_source_contexts[index],
                    self._layer_ordered_options[index],
                )
            )
        layout = _plot_spec_json_value(self._plotly_layout())
        config = {
            "displaylogo": False,
            "responsive": True,
        }
        imported_config = _option_get(self._extra_kwds, "__plotly_config__")
        if imported_config is not None:
            imported_data = _plot_spec_json_value(imported_config)
            for name in imported_data:
                config[name] = imported_data.__getitem__(name)
        viewport = {}
        if "width" in layout:
            viewport["width"] = layout.__getitem__("width")
        if "height" in layout:
            viewport["height"] = layout.__getitem__("height")
        axes = dict()
        axes.__setitem__("coordinate_system", "cartesian")
        axes.__setitem__("xaxis", layout.get("xaxis", dict()))
        axes.__setitem__("yaxis", layout.get("yaxis", dict()))
        overrides = dict()
        overrides.__setitem__("layout", layout)
        overrides.__setitem__("config", _plot_spec_json_value(config))
        record = dict()
        record.__setitem__("schema_version", plotting.PLOTSPEC_SCHEMA_VERSION)
        record.__setitem__("dimension", 2)
        record.__setitem__("layers", layers)
        record.__setitem__("axes_or_scene", axes)
        record.__setitem__("viewport", _plot_spec_json_value(viewport))
        record.__setitem__("theme", "notebook")
        record.__setitem__("annotations", [])
        record.__setitem__("interactions", dict())
        record.__setitem__("animation", dict())
        record.__setitem__(
            "provenance", _plot_spec_json_value(self._plot_spec_provenance)
        )
        record.__setitem__(
            "diagnostics",
            [_plot_spec_json_value(value) for value in self._plot_spec_diagnostics],
        )
        record.__setitem__("plotly_overrides", overrides)
        return plot_spec_class.from_dict(record)

    def _rich_repr_(self) -> Any:
        return _native_record(mime=_PLOTLY_MIME, data=self.plotly())

    def save(
        self,
        filename: Any,
        **options: Any,
    ) -> Graphics:
        """Save through the host graphics hook when one is installed."""
        hook = runtime.reflect.get(
            runtime.global_object, "__sagejs_graphics_save_hook__"
        )
        if hook is runtime.undefined:
            raise NotImplementedError(
                "graphics file export is not available in this host"
            )
        runtime.reflect.apply(
            hook,
            runtime.undefined,
            [self, filename, options],
        )
        return self

    def show(self, **options: Any) -> Graphics:
        if len(options):
            self.set_extra_kwds(options)
        return self


def _graphics_from_plotly(figure: Any) -> Graphics:
    """Convert a renderer-neutral Plotly figure to composable `Graphics`."""
    answer = Graphics()
    data = runtime.reflect.get(figure, "data")
    if data is not runtime.undefined:
        for trace in data:
            answer.add_primitive(_PlotlyPrimitive(trace))
    layout = runtime.reflect.get(figure, "layout")
    if layout is not runtime.undefined:
        answer._extra_kwds["__plotly_layout__"] = layout
    config = runtime.reflect.get(figure, "config")
    if config is not runtime.undefined:
        answer._extra_kwds["__plotly_config__"] = config
    return answer


runtime.reflect.set(
    runtime.global_object,
    "__sagejs_graphics_from_plotly__",
    _graphics_from_plotly,
)


def _graphics_options(options: dict[str, Any]) -> dict[str, Any]:
    answer = {}
    for name in _GRAPHICS_OPTION_NAMES:
        if _option_has(options, name):
            answer[name] = _option_pop(options, name)
    for name in list(runtime.object.keys(options)):
        if name[:7] == "legend_" and name not in ("legend_label", "legend_color"):
            answer[name] = _option_pop(options, name)
    return answer


def line(points: Any, **options: Any) -> Graphics:
    """Return a graphics object containing a line through `points`."""
    options = _copy_options(options)
    normalized = _normalize_points(points)
    defaults = {
        "alpha": 1,
        "rgbcolor": [0, 0, 1],
        "thickness": 1,
        "legend_label": None,
        "legend_color": None,
        "linestyle": "-",
    }
    if _option_has(options, "color") and not _option_has(options, "rgbcolor"):
        options["rgbcolor"] = _option_pop(options, "color")
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    _sage_primitive_plan("line_render_plan", defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Line(
            [value[0] for value in normalized],
            [value[1] for value in normalized],
            defaults,
        )
    )
    return graphic


def hue(
    value: Any,
    saturation: Any = 1,
    brightness: Any = 1,
) -> tuple[float, float, float]:
    """Return an RGB triple from hue, saturation, and brightness."""
    h = float(value) % 1.0
    s = max(0.0, min(1.0, float(saturation)))
    v = max(0.0, min(1.0, float(brightness)))
    scaled = h * 6.0
    sector = int(runtime.math.floor(scaled))
    fraction = scaled - sector
    p = v * (1.0 - s)
    q = v * (1.0 - s * fraction)
    t = v * (1.0 - s * (1.0 - fraction))
    choices = [
        (v, t, p),
        (q, v, p),
        (p, v, t),
        (p, q, v),
        (t, p, v),
        (v, p, q),
    ]
    return runtime.math_tuple(list(choices[sector % 6]))


_NAMED_COLORS = {
    "black": "#000000",
    "silver": "#c0c0c0",
    "gray": "#808080",
    "grey": "#808080",
    "white": "#ffffff",
    "maroon": "#800000",
    "red": "#ff0000",
    "purple": "#800080",
    "fuchsia": "#ff00ff",
    "green": "#008000",
    "lime": "#00ff00",
    "olive": "#808000",
    "yellow": "#ffff00",
    "navy": "#000080",
    "blue": "#0000ff",
    "teal": "#008080",
    "aqua": "#00ffff",
    "orange": "#ffa500",
    "pink": "#ffc0cb",
    "brown": "#a52a2a",
    "cyan": "#00ffff",
    "magenta": "#ff00ff",
    "violet": "#ee82ee",
    "indigo": "#4b0082",
    "gold": "#ffd700",
    "goldenrod": "#daa520",
    "khaki": "#f0e68c",
    "coral": "#ff7f50",
    "salmon": "#fa8072",
    "tomato": "#ff6347",
    "orchid": "#da70d6",
    "plum": "#dda0dd",
    "turquoise": "#40e0d0",
    "steelblue": "#4682b4",
    "royalblue": "#4169e1",
    "skyblue": "#87ceeb",
    "deepskyblue": "#00bfff",
    "forestgreen": "#228b22",
    "seagreen": "#2e8b57",
    "springgreen": "#00ff7f",
    "yellowgreen": "#9acd32",
    "darkred": "#8b0000",
    "darkgreen": "#006400",
    "darkblue": "#00008b",
    "darkorange": "#ff8c00",
    "darkviolet": "#9400d3",
    "lightblue": "#add8e6",
    "lightgreen": "#90ee90",
    "lightgray": "#d3d3d3",
    "lightgrey": "#d3d3d3",
    "transparent": "#000000",
}


def _color_mod_one(value: Any) -> float:
    numeric = float(value)
    if numeric == 1.0:
        return 1.0
    result = numeric % 1.0
    return result + 1.0 if result < 0 else result


def _html_rgb(value: str) -> tuple[float, float, float]:
    text_value = runtime.reflect.apply(
        runtime.reflect.get(runtime.string_class.prototype, "toLowerCase"),
        value,
        [],
    )
    if text_value[0:1] != "#":
        if not _option_has(_NAMED_COLORS, text_value):
            raise ValueError("unknown color '" + text_value + "'")
        text_value = _option_get(_NAMED_COLORS, text_value)
    digits = text_value[1:]
    if len(digits) == 3:
        digits = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2]
    if len(digits) != 6:
        raise ValueError("HTML colors must contain three or six hex digits")
    return runtime.math_tuple(
        [
            int(digits[0:2], 16) / 255.0,
            int(digits[2:4], 16) / 255.0,
            int(digits[4:6], 16) / 255.0,
        ]
    )


def _hls_to_rgb(
    hue_value: float,
    lightness: float,
    saturation: float,
) -> tuple[float, float, float]:
    if saturation == 0:
        return runtime.math_tuple([lightness, lightness, lightness])
    if lightness <= 0.5:
        maximum = lightness * (1.0 + saturation)
    else:
        maximum = lightness + saturation - lightness * saturation
    minimum = 2.0 * lightness - maximum

    def component(offset: float) -> float:
        position = (hue_value + offset) % 1.0
        if position < 1.0 / 6.0:
            return minimum + (maximum - minimum) * position * 6.0
        if position < 0.5:
            return maximum
        if position < 2.0 / 3.0:
            return minimum + (maximum - minimum) * (2.0 / 3.0 - position) * 6.0
        return minimum

    return runtime.math_tuple(
        [component(1.0 / 3.0), component(0), component(-1.0 / 3.0)]
    )


def rgbcolor(value: Any, space: str = "rgb") -> tuple[float, float, float]:
    """Convert a Sage color specification to an RGB triple."""
    if hasattr(value, "rgb"):
        return value.rgb()
    if runtime.jstype(value) == "string":
        return _html_rgb(value)
    values = list(value)
    if len(values) != 3:
        raise ValueError("a color must contain exactly three components")
    components = [_color_mod_one(component) for component in values]
    normalized_space = runtime.reflect.apply(
        runtime.reflect.get(runtime.string_class.prototype, "toLowerCase"),
        space,
        [],
    )
    if normalized_space == "rgb":
        return runtime.math_tuple(components)
    if normalized_space == "hsv":
        return hue(components[0], components[1], components[2])
    if normalized_space == "hls":
        return _hls_to_rgb(components[0], components[1], components[2])
    if normalized_space == "hsl":
        return _hls_to_rgb(components[0], components[2], components[1])
    raise ValueError("space must be one of 'rgb', 'hsv', 'hsl', 'hls'")


@runtime.sequence_class
class Color:
    """A Sage-compatible RGB color with color-space conversions."""

    def __init__(
        self,
        red: Any = "#0000ff",
        green: Any = None,
        blue: Any = None,
        space: str = "rgb",
    ) -> None:
        if green is None and blue is None:
            self._rgb = rgbcolor(red, space)
        else:
            self._rgb = rgbcolor([red, green, blue], space)

    def __repr__(self) -> str:
        return "RGB color " + str(self._rgb)

    __str__ = __repr__
    toString = __repr__

    def __len__(self) -> int:
        return 3

    def __iter__(self) -> Iterator[float]:
        return iter(self._rgb)

    def __getitem__(self, index: int) -> float:
        return self._rgb[index]

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Color) and self._rgb == other._rgb

    def rgb(self) -> tuple[float, float, float]:
        return self._rgb

    def hsv(self) -> tuple[float, float, float]:
        red, green, blue = self._rgb
        maximum = max(red, green, blue)
        minimum = min(red, green, blue)
        difference = maximum - minimum
        saturation = 0.0 if maximum == 0 else difference / maximum
        if difference == 0:
            hue_value = 0.0
        elif maximum == red:
            hue_value = ((green - blue) / difference) % 6.0
        elif maximum == green:
            hue_value = (blue - red) / difference + 2.0
        else:
            hue_value = (red - green) / difference + 4.0
        return runtime.math_tuple([hue_value / 6.0, saturation, maximum])

    def hls(self) -> tuple[float, float, float]:
        hue_value, _saturation, _value = self.hsv()
        maximum = max(self._rgb)
        minimum = min(self._rgb)
        lightness = (maximum + minimum) / 2.0
        difference = maximum - minimum
        if difference == 0:
            saturation = 0.0
        elif lightness <= 0.5:
            saturation = difference / (maximum + minimum)
        else:
            saturation = difference / (2.0 - maximum - minimum)
        return runtime.math_tuple([hue_value, lightness, saturation])

    def hsl(self) -> tuple[float, float, float]:
        hue_value, lightness, saturation = self.hls()
        return runtime.math_tuple([hue_value, saturation, lightness])

    def html_color(self) -> str:
        digits = []
        for component in self._rgb:
            text_value = hex(int(component * 255))[2:]
            digits.append(("0" + text_value)[-2:])
        return "#" + "".join(digits)

    def blend(self, color: Any, fraction: Any = 0.5) -> Color:
        other = rgbcolor(color)
        amount = float(fraction)
        return Color(
            [
                (1.0 - amount) * self._rgb[index] + amount * other[index]
                for index in range(3)
            ]
        )

    def lighter(self, fraction: Any = 1.0 / 3.0) -> Color:
        return self.blend((1, 1, 1), fraction)

    def darker(self, fraction: Any = 1.0 / 3.0) -> Color:
        return self.blend((0, 0, 0), fraction)

    def __add__(self, other: Any) -> Color:
        return self.blend(other)

    __radd__ = __add__

    def __mul__(self, scalar: Any) -> Color:
        return Color([component * float(scalar) for component in self._rgb])

    __rmul__ = __mul__

    def __truediv__(self, scalar: Any) -> Color:
        return Color([component / float(scalar) for component in self._rgb])


class ColorsDict(dict):  # pyright: ignore[reportMissingTypeArgument]
    """Named Sage colors, accessible by key or attribute."""

    def __getattr__(self, name: str) -> Color:
        if name in self:
            return self[name]
        raise AttributeError("unknown color '" + name + "'")


_color_values = {}
for _color_name in _NAMED_COLORS:
    _color_values[_color_name] = Color(_option_get(_NAMED_COLORS, _color_name))
colors = ColorsDict(_color_values)
for _color_name in _NAMED_COLORS:
    colors[_color_name] = _option_get(_color_values, _color_name)
    runtime.reflect.set(runtime.global_object, _color_name, colors[_color_name])


def rainbow(count: int, format: str = "hex") -> list[Any]:
    """Return `count` evenly spaced hues as hex strings or RGB tuples."""
    size = int(count)
    values = [hue(index / float(size)) for index in range(size)]
    if format == "rgbtuple":
        return values
    if format == "hex":
        return [Color(value).html_color() for value in values]
    raise ValueError("format must be 'hex' or 'rgbtuple'")


class Colormaps(dict):  # pyright: ignore[reportMissingTypeArgument]
    """Small portable collection of common Plotly-compatible colormaps."""

    def __getattr__(self, name: str) -> Any:
        if name in self:
            return self[name]
        raise AttributeError("unknown colormap '" + name + "'")


_COLORMAP_VALUES = {
    "gray": ["black", "white"],
    "Greys": ["black", "white"],
    "viridis": ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    "plasma": ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
    "inferno": ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
    "cividis": ["#00224e", "#31446b", "#666970", "#958f78", "#c8b866", "#fee838"],
    "turbo": [
        "#30123b",
        "#4662d7",
        "#28bbec",
        "#3fe43b",
        "#f9e721",
        "#f66b19",
        "#7a0403",
    ],
    "twilight": ["#e2d9e2", "#6276ba", "#221f3b", "#8b173d", "#d08b73", "#e2d9e2"],
    "hsv": [
        "#ff0000",
        "#ffff00",
        "#00ff00",
        "#00ffff",
        "#0000ff",
        "#ff00ff",
        "#ff0000",
    ],
}
colormaps = Colormaps(_COLORMAP_VALUES)
for _colormap_name in _COLORMAP_VALUES:
    colormaps[_colormap_name] = _option_get(_COLORMAP_VALUES, _colormap_name)


def circle(
    center: Any,
    radius: Any,
    **options: Any,
) -> Graphics:
    """Return a circle centered at `center` with the given radius."""
    options = _copy_options(options)
    if not _option_has(options, "aspect_ratio"):
        options["aspect_ratio"] = 1.0
    coordinates = _point_pair(center)
    numeric_radius = float(radius)
    if numeric_radius < 0:
        raise ValueError("circle radius must be nonnegative")
    count = int(_option_pop(options, "plot_points", 75))
    if count < 3:
        raise ValueError("circle plot_points must be at least 3")
    points = []
    for index in range(count + 1):
        angle = 2.0 * runtime.math.PI * index / count
        points.append(
            (
                coordinates[0] + numeric_radius * runtime.math.cos(angle),
                coordinates[1] + numeric_radius * runtime.math.sin(angle),
            )
        )
    if bool(_option_pop(options, "fill", False)):
        return polygon(points[:-1], **options)
    return line(points, **options)


def _ellipse_points(
    center: Any,
    r1: Any,
    r2: Any,
    angle: Any,
    sector: Any,
    count: int,
) -> list[tuple[float, float]]:
    coordinates = _point_pair(center)
    radius1 = float(r1)
    radius2 = float(r2)
    if radius1 <= 0 or radius2 <= 0:
        raise ValueError("ellipse radii must be positive")
    angles = list(sector)
    if len(angles) != 2:
        raise ValueError("the sector must consist of two angles")
    start = float(angles[0])
    end = float(angles[1])
    rotation = float(angle)
    cosine_rotation = runtime.math.cos(rotation)
    sine_rotation = runtime.math.sin(rotation)
    points = []
    for index in range(count + 1):
        parameter = start + (end - start) * index / count
        local_x = radius1 * runtime.math.cos(parameter)
        local_y = radius2 * runtime.math.sin(parameter)
        points.append(
            (
                coordinates[0] + local_x * cosine_rotation - local_y * sine_rotation,
                coordinates[1] + local_x * sine_rotation + local_y * cosine_rotation,
            )
        )
    return points


def ellipse(
    center: Any,
    r1: Any,
    r2: Any,
    angle: Any = 0,
    **options: Any,
) -> Graphics:
    r"""Return an optionally rotated ellipse centered at `(x, y)`."""
    options = _copy_options(options)
    if not _option_has(options, "aspect_ratio"):
        options["aspect_ratio"] = 1.0
    count = int(_option_pop(options, "plot_points", 100))
    if count < 4:
        raise ValueError("ellipse plot_points must be at least 4")
    points = _ellipse_points(center, r1, r2, angle, (0.0, 2.0 * runtime.math.PI), count)
    fill = bool(_option_pop(options, "fill", False))
    if _option_has(options, "rgbcolor"):
        options["color"] = _option_get(options, "rgbcolor")
    elif fill and _option_has(options, "facecolor"):
        options["color"] = _option_pop(options, "facecolor")
    elif not fill and _option_has(options, "edgecolor"):
        options["color"] = _option_pop(options, "edgecolor")
    if fill:
        return polygon(points[:-1], **options)
    return line(points, **options)


def arc(
    center: Any,
    r1: Any,
    r2: Any = None,
    angle: Any = 0.0,
    sector: Any = None,
    **options: Any,
) -> Graphics:
    r"""Return a circular or elliptical arc over an angular sector."""
    options = _copy_options(options)
    if not _option_has(options, "aspect_ratio"):
        options["aspect_ratio"] = 1.0
    if r2 is None:
        r2 = r1
    if sector is None:
        sector = (0.0, 2.0 * runtime.math.PI)
    count = int(_option_pop(options, "plot_points", 75))
    if count < 2:
        raise ValueError("arc plot_points must be at least 2")
    return line(
        _ellipse_points(center, r1, r2, angle, sector, count),
        **options,
    )


def disk(
    center: Any,
    radius: Any,
    angle: Any,
    **options: Any,
) -> Graphics:
    r"""Return a filled or outlined circular/elliptical sector."""
    options = _copy_options(options)
    coordinates = _point_pair(center)
    if isinstance(radius, (list, tuple)):
        if len(radius) != 2:
            raise ValueError("disk radius must be a number or a pair")
        r1 = radius[0]
        r2 = radius[1]
    else:
        r1 = radius
        r2 = radius
    if not _option_has(options, "aspect_ratio"):
        options["aspect_ratio"] = 1.0
    count = int(_option_pop(options, "plot_points", 75))
    arc_points = _ellipse_points(center, r1, r2, 0.0, angle, count)
    fill = bool(_option_pop(options, "fill", True))
    if fill:
        return polygon([coordinates] + arc_points, **options)
    return line(arc_points, **options)


def _bezier_point(
    controls: Sequence[tuple[float, float]],
    parameter: float,
) -> tuple[float, float]:
    points = list(controls)
    while len(points) > 1:
        next_points = []
        for index in range(len(points) - 1):
            next_points.append(
                (
                    (1.0 - parameter) * points[index][0]
                    + parameter * points[index + 1][0],
                    (1.0 - parameter) * points[index][1]
                    + parameter * points[index + 1][1],
                )
            )
        points = next_points
    return points[0]


def bezier_path(path: Any, **options: Any) -> Graphics:
    r"""
    Return the Bézier path described by Sage's list-of-curves format.

    The first curve contains both endpoints. Each later curve inherits its
    first endpoint from the preceding curve and supplies zero, one, or two
    control points followed by its new endpoint.
    """
    curves = [list(curve) for curve in path]
    if len(curves) == 0 or len(curves[0]) < 2:
        raise ValueError("a Bezier path needs an initial curve and endpoints")
    count = int(_option_pop(options, "plot_points", 25))
    if count < 2:
        raise ValueError("Bezier plot_points must be at least 2")
    sampled = []
    previous = None
    for curve_index in range(len(curves)):
        curve = [_point_pair(value) for value in curves[curve_index]]
        if curve_index == 0:
            controls = curve
        else:
            if previous is None:
                raise ValueError("invalid Bezier path")
            controls = [previous] + curve
        if len(controls) < 2 or len(controls) > 4:
            raise ValueError("Bezier curves support zero, one, or two controls")
        for index in range(count + 1):
            if curve_index > 0 and index == 0:
                continue
            sampled.append(_bezier_point(controls, index / count))
        previous = controls[-1]
    if bool(_option_pop(options, "fill", False)):
        return polygon(sampled, **options)
    return line(sampled, **options)


def _hyperbolic_point(value: Any) -> tuple[float, float]:
    if isinstance(value, (list, tuple)):
        return _point_pair(value)
    try:
        return _complex_numeric_parts(value)
    except Exception:
        if hasattr(value, "_plot_complex_callable"):
            evaluator = value._plot_complex_callable([])
            return _complex_numeric_parts(evaluator(0.0, 0.0))
        cdf = runtime.reflect.get(runtime.global_object, "CDF")
        if cdf is runtime.undefined:
            raise
        numeric = runtime.reflect.apply(cdf, runtime.undefined, [value])
        return _complex_numeric_parts(numeric)


def _hyperbolic_geodesic_points(
    start: Any,
    end: Any,
    model: str,
    resolution: int,
) -> list[tuple[float, float]]:
    a = _hyperbolic_point(start)
    b = _hyperbolic_point(end)
    if resolution < 2:
        raise ValueError("resolution must be at least 2")
    normalized_model = str(model).upper()
    if normalized_model not in ("UHP", "PD", "KM"):
        raise ValueError("model must be 'UHP', 'PD', or 'KM'")
    if normalized_model == "UHP":
        if a[1] < 0 or b[1] < 0:
            raise ValueError("UHP points must have nonnegative imaginary part")
        if abs(a[0] - b[0]) < 1e-14:
            return [a, b]
        center_x = (a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]) / (
            2.0 * (a[0] - b[0])
        )
        center_y = 0.0
    elif normalized_model == "KM":
        if a[0] * a[0] + a[1] * a[1] > 1.0 + 1e-12:
            raise ValueError("KM points must lie in the unit disk")
        if b[0] * b[0] + b[1] * b[1] > 1.0 + 1e-12:
            raise ValueError("KM points must lie in the unit disk")
        return [a, b]
    else:
        if a[0] * a[0] + a[1] * a[1] > 1.0 + 1e-12:
            raise ValueError("PD points must lie in the unit disk")
        if b[0] * b[0] + b[1] * b[1] > 1.0 + 1e-12:
            raise ValueError("PD points must lie in the unit disk")
        determinant = a[0] * b[1] - a[1] * b[0]
        if abs(determinant) < 1e-14:
            return [a, b]
        anorm = a[0] * a[0] + a[1] * a[1] + 1.0
        bnorm = b[0] * b[0] + b[1] * b[1] + 1.0
        center_x = (anorm * b[1] - a[1] * bnorm) / (2.0 * determinant)
        center_y = (a[0] * bnorm - anorm * b[0]) / (2.0 * determinant)

    radius = runtime.math.sqrt(
        (a[0] - center_x) * (a[0] - center_x) + (a[1] - center_y) * (a[1] - center_y)
    )
    start_angle = runtime.math.atan2(a[1] - center_y, a[0] - center_x)
    end_angle = runtime.math.atan2(b[1] - center_y, b[0] - center_x)
    delta = end_angle - start_angle
    while delta > _PI:
        delta -= 2.0 * _PI
    while delta < -_PI:
        delta += 2.0 * _PI
    if normalized_model == "PD":
        middle_angle = start_angle + delta / 2.0
        middle_x = center_x + radius * runtime.math.cos(middle_angle)
        middle_y = center_y + radius * runtime.math.sin(middle_angle)
        if middle_x * middle_x + middle_y * middle_y > 1.0 + 1e-10:
            if delta >= 0:
                delta -= 2.0 * _PI
            else:
                delta += 2.0 * _PI
    points = []
    for index in range(resolution + 1):
        angle = start_angle + delta * index / float(resolution)
        points.append(
            runtime.math_tuple(
                [
                    center_x + radius * runtime.math.cos(angle),
                    center_y + radius * runtime.math.sin(angle),
                ]
            )
        )
    return points


def hyperbolic_arc(
    a: Any,
    b: Any,
    model: str = "UHP",
    **options: Any,
) -> Graphics:
    r"""Plot the hyperbolic geodesic from `a` to `b`."""
    options = _copy_options(options)
    resolution = int(_option_pop(options, "resolution", 100))
    points = _hyperbolic_geodesic_points(a, b, model, resolution)
    answer = line(points, **options)
    if str(model).upper() in ("PD", "KM"):
        answer = answer + circle((0, 0), 1, axes=False, color="black")
        answer.set_aspect_ratio(1)
    return answer


def hyperbolic_polygon(
    points: Any,
    model: str = "UHP",
    resolution: int = 100,
    **options: Any,
) -> Graphics:
    r"""Plot a polygon whose sides are hyperbolic geodesics."""
    vertices = list(points)
    if len(vertices) == 0:
        raise ValueError("cannot plot the empty polygon")
    if len(vertices) < 2:
        raise ValueError("a hyperbolic polygon needs at least two vertices")
    sampled = []
    for index in range(len(vertices)):
        edge = _hyperbolic_geodesic_points(
            vertices[index],
            vertices[(index + 1) % len(vertices)],
            model,
            int(resolution),
        )
        if len(sampled):
            sampled.extend(edge[1:])
        else:
            sampled.extend(edge)
    options = _copy_options(options)
    fill = bool(_option_pop(options, "fill", False))
    if fill:
        answer = polygon(sampled, **options)
    else:
        answer = line(sampled, **options)
    if str(model).upper() in ("PD", "KM"):
        answer = answer + circle((0, 0), 1, color="black")
        answer.set_aspect_ratio(1)
    return answer


def hyperbolic_triangle(
    a: Any,
    b: Any,
    c: Any,
    model: str = "UHP",
    **options: Any,
) -> Graphics:
    """Plot a hyperbolic triangle with vertices `a`, `b`, and `c`."""
    return hyperbolic_polygon([a, b, c], model=model, **options)


def hyperbolic_regular_polygon(
    sides: int,
    i_angle: Any,
    center: Any = None,
    **options: Any,
) -> Graphics:
    r"""Plot a regular hyperbolic polygon in the upper-half-plane model."""
    count = int(sides)
    angle = float(i_angle)
    if count <= 2:
        raise ValueError("degenerated polygons (sides<=2) are not supported")
    if angle <= 0 or angle >= _PI:
        raise ValueError("interior angle must be in the interval (0, pi)")
    if _PI * (count - 2) - count * angle <= 0:
        raise ValueError(
            "there exists no hyperbolic regular compact polygon with these parameters"
        )
    if center is None:
        center_point = (0.0, 1.0)
    else:
        center_point = _hyperbolic_point(center)
    if center_point[1] <= 0:
        raise ValueError("center must lie in the upper half plane")
    beta = 2.0 * _PI / count
    cotangent = runtime.math.cos(angle / 2.0) / runtime.math.sin(angle / 2.0)
    radius = runtime.math.acosh(
        cotangent * (1.0 + runtime.math.cos(beta)) / runtime.math.sin(beta)
    )
    initial_y = runtime.math.exp(radius)
    vertices = []
    for index in range(count):
        theta = index * beta
        cosine = runtime.math.cos(theta / 2.0)
        sine = runtime.math.sin(theta / 2.0)
        numerator_real = sine
        numerator_imaginary = cosine * initial_y
        denominator_real = cosine
        denominator_imaginary = -sine * initial_y
        denominator_norm = (
            denominator_real * denominator_real
            + denominator_imaginary * denominator_imaginary
        )
        real_part = (
            numerator_real * denominator_real
            + numerator_imaginary * denominator_imaginary
        ) / denominator_norm
        imaginary_part = (
            numerator_imaginary * denominator_real
            - numerator_real * denominator_imaginary
        ) / denominator_norm
        vertices.append(
            runtime.math_tuple(
                [
                    center_point[0] + center_point[1] * real_part,
                    center_point[1] * imaginary_part,
                ]
            )
        )
    return hyperbolic_polygon(vertices, model="UHP", **options)


def arrow(
    tailpoint: Any,
    headpoint: Any,
    **options: Any,
) -> Graphics:
    """Return a directed line segment from `tailpoint` to `headpoint`."""
    options = _copy_options(options)
    tail = _point_pair(tailpoint)
    head = _point_pair(headpoint)
    defaults = {
        "rgbcolor": [0, 0, 1],
        "width": 2,
        "zorder": 2,
        "head": 1,
        "linestyle": "solid",
        "legend_label": None,
        "legend_color": None,
    }
    if _option_has(options, "color") and not _option_has(options, "rgbcolor"):
        options["rgbcolor"] = _option_pop(options, "color")
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    _sage_primitive_plan("arrow_render_plan", defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Arrow(
            [tail[0], head[0]],
            [tail[1], head[1]],
            defaults,
        )
    )
    return graphic


def point(points: Any, **options: Any) -> Graphics:
    """Return a graphics object containing one or more points."""
    options = _copy_options(options)
    normalized = _normalize_points(points)
    defaults = {
        "alpha": 1,
        "rgbcolor": [0, 0, 1],
        "size": 10,
        "faceted": False,
        "legend_label": None,
        "legend_color": None,
        "marker": "o",
        "markeredgecolor": None,
    }
    if _option_has(options, "color") and not _option_has(options, "rgbcolor"):
        options["rgbcolor"] = _option_pop(options, "color")
    if _option_has(options, "pointsize") and not _option_has(options, "size"):
        options["size"] = _option_pop(options, "pointsize")
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    _sage_primitive_plan("point_render_plan", defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Point(
            [value[0] for value in normalized],
            [value[1] for value in normalized],
            defaults,
        )
    )
    return graphic


points = point


def bar_chart(values: Any, **options: Any) -> Graphics:
    """Return a graphics object containing a vertical bar chart."""
    options = _copy_options(options)
    defaults = {
        "alpha": 1,
        "rgbcolor": [0, 0, 1],
        "width": 0.8,
    }
    if _option_has(options, "color") and not _option_has(options, "rgbcolor"):
        options["rgbcolor"] = _option_pop(options, "color")
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Bar([float(value) for value in values], defaults))
    return graphic


def histogram(datalist: Any, **options: Any) -> Graphics:
    r"""
    Compute and draw a histogram of numerical data.

    Common Sage options include `bins`, `range`, `density`, `cumulative`,
    `color`, `edgecolor`, `alpha`, and `label`.

    ### Examples

    ```sage
    sage: histogram([1, 1, 2, 3], bins=3)
    Graphics object consisting of 1 graphics primitive
    ```
    """
    options = _copy_options(options)
    values = list(datalist)
    if len(values) and isinstance(values[0], (list, tuple)):
        answer = Graphics()
        for dataset in values:
            answer = answer + histogram(dataset, **options)
        return answer
    defaults = {
        "alpha": 1,
        "rgbcolor": [0, 0, 1],
        "edgecolor": "black",
        "bins": 10,
    }
    if _option_has(options, "color") and not _option_has(options, "rgbcolor"):
        options["rgbcolor"] = _option_pop(options, "color")
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Histogram([float(value) for value in values], defaults))
    return graphic


def scatter_plot(datalist: Any, **options: Any) -> Graphics:
    r"""Return a Sage-compatible scatter plot of `(x, y)` points."""
    options = _copy_options(options)
    if _option_has(options, "markersize") and not _option_has(options, "size"):
        options["size"] = _option_pop(options, "markersize")
    if _option_has(options, "facecolor") and not _option_has(options, "color"):
        options["color"] = _option_pop(options, "facecolor")
    if _option_has(options, "edgecolor") and not _option_has(
        options, "markeredgecolor"
    ):
        options["markeredgecolor"] = _option_pop(options, "edgecolor")
    return point(datalist, **options)


def polygon(points: Any, **options: Any) -> Graphics:
    """Return a filled polygon through `points`."""
    options = _copy_options(options)
    normalized = _normalize_points(points)
    defaults = {
        "alpha": 1,
        "rgbcolor": [0, 0, 1],
        "edgecolor": None,
        "fill": True,
        "thickness": None,
        "legend_label": None,
        "legend_color": None,
        "linestyle": "-",
        "aspect_ratio": 1.0,
    }
    if _option_has(options, "color") and not _option_has(options, "rgbcolor"):
        options["rgbcolor"] = _option_pop(options, "color")
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    if _option_get(defaults, "thickness") is None:
        if (
            bool(_option_get(defaults, "fill", True))
            and _option_get(defaults, "edgecolor") is None
        ):
            defaults["thickness"] = 0
        else:
            defaults["thickness"] = 1
    _sage_primitive_plan("polygon_render_plan", defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Polygon(
            [value[0] for value in normalized],
            [value[1] for value in normalized],
            defaults,
        )
    )
    return graphic


def text(
    string: Any,
    position: Any,
    **options: Any,
) -> Graphics:
    """Return a graphics object containing a positioned text label."""
    options = _copy_options(options)
    normalized_position = _point_pair(position)
    defaults = {
        "fontsize": 10,
        "rgbcolor": [0, 0, 1],
        "horizontal_alignment": "center",
        "vertical_alignment": "center",
        "axis_coords": False,
        "clip": False,
    }
    if _option_has(options, "color") and not _option_has(options, "rgbcolor"):
        options["rgbcolor"] = _option_pop(options, "color")
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    _sage_primitive_plan("text_render_plan", defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Text(str(string), normalized_position, defaults))
    return graphic


@runtime.sequence_class
class MultiGraphics:
    """Several graphics drawn at arbitrary positions on one canvas."""

    def __init__(self, graphics_list: Any) -> None:
        self._glist: list[Graphics] = []
        self._positions: list[tuple[float, float, float, float]] = []
        for item in graphics_list:
            if isinstance(item, Graphics):
                self.append(item)
            elif isinstance(item, (list, tuple)) and len(item) == 2:
                self.append(item[0], item[1])
            elif (
                isinstance(item, (list, tuple))
                and len(item) == 5
                and isinstance(item[0], Graphics)
            ):
                # Sage tuple lowering currently flattens the nested position
                # in ``(graphic, (left, bottom, width, height))``.
                self.append(item[0], item[1:])
            else:
                raise TypeError(
                    "a Graphics object or pair (Graphics, position) is expected"
                )

    def __len__(self) -> int:
        return len(self._glist)

    def __iter__(self) -> Iterator[Graphics]:
        return iter(self._glist)

    def __getitem__(self, index: int) -> Graphics:
        return self._glist[index]

    def __setitem__(self, index: int, graphic: Graphics) -> None:
        if not isinstance(graphic, Graphics):
            raise TypeError("a Graphics object is expected")
        self._glist[index] = graphic

    def __repr__(self) -> str:
        count = len(self._glist)
        suffix = "" if count == 1 else "s"
        return "Multigraphics with " + str(count) + " element" + suffix

    __str__ = __repr__
    toString = __repr__

    def append(
        self,
        graphic: Graphics,
        pos: Any = None,
    ) -> None:
        """Append a graphic at `(left, bottom, width, height)`."""
        if not isinstance(graphic, Graphics):
            raise TypeError("a Graphics object is expected")
        if pos is None:
            position = (0.125, 0.11, 0.775, 0.77)
        else:
            values = list(pos)
            if len(values) != 4:
                raise TypeError("pos must be a 4-tuple")
            position = (
                float(values[0]),
                float(values[1]),
                float(values[2]),
                float(values[3]),
            )
        if position[2] <= 0 or position[3] <= 0:
            raise ValueError("graphics position width and height must be positive")
        self._glist.append(graphic)
        self._positions.append(position)

    def position(self, index: int) -> Any:
        """Return `(left, bottom, width, height)` for one element."""
        return tuple(self._positions[index])

    def plotly(self) -> Any:
        """Return a Plotly figure with independently positioned axes."""
        traces = []
        layout = _native_record(
            autosize=True,
            showlegend=False,
            annotations=[],
        )
        annotations = runtime.reflect.get(layout, "annotations")
        for index in range(len(self._glist)):
            graphic = self._glist[index]
            left, bottom, width, height = self._positions[index]
            suffix = "" if index == 0 else str(index + 1)
            xreference = "x" + suffix
            yreference = "y" + suffix
            xlayout_name = "xaxis" + suffix
            ylayout_name = "yaxis" + suffix
            local_layout = graphic._plotly_layout()
            xaxis = runtime.reflect.get(local_layout, "xaxis")
            yaxis = runtime.reflect.get(local_layout, "yaxis")
            runtime.reflect.set(xaxis, "domain", [left, left + width])
            runtime.reflect.set(yaxis, "domain", [bottom, bottom + height])
            runtime.reflect.set(xaxis, "anchor", yreference)
            runtime.reflect.set(yaxis, "anchor", xreference)
            runtime.reflect.set(layout, xlayout_name, xaxis)
            runtime.reflect.set(layout, ylayout_name, yaxis)
            for primitive in graphic:
                trace = primitive._plotly_trace()
                runtime.reflect.set(trace, "xaxis", xreference)
                runtime.reflect.set(trace, "yaxis", yreference)
                traces.append(trace)
            if runtime.reflect.has(local_layout, "title"):
                title = runtime.reflect.get(local_layout, "title")
                annotations.append(
                    _native_record(
                        text=str(runtime.reflect.get(title, "text")),
                        x=left + width / 2.0,
                        y=bottom + height,
                        xref="paper",
                        yref="paper",
                        xanchor="center",
                        yanchor="bottom",
                        showarrow=False,
                    )
                )
            if bool(
                _option_get(
                    graphic.get_extra_kwds(), "show_legend", graphic._show_legend
                )
            ):
                runtime.reflect.set(layout, "showlegend", True)
        return _native_record(
            data=traces,
            layout=layout,
            config=_native_record(displaylogo=False, responsive=True),
        )

    def _rich_repr_(self) -> Any:
        return _native_record(mime=_PLOTLY_MIME, data=self.plotly())

    def save(self, filename: Any, **options: Any) -> MultiGraphics:
        """Save through the host graphics hook when one is installed."""
        hook = runtime.reflect.get(
            runtime.global_object, "__sagejs_graphics_save_hook__"
        )
        if hook is runtime.undefined:
            raise NotImplementedError(
                "graphics file export is not available in this host"
            )
        runtime.reflect.apply(hook, runtime.undefined, [self, filename, options])
        return self


def multi_graphics(graphics_list: Any) -> MultiGraphics:
    r"""
    Draw graphics at arbitrary positions on one common canvas.

    Each entry is either a `Graphics` object at Sage's default full-canvas
    position or `(graphic, (left, bottom, width, height))`, with coordinates
    expressed as fractions of the canvas.

    ### Examples

    ```sage
    sage: g1 = plot(sin(x), (x, -pi, pi))
    sage: g2 = circle((0, 0), 1, color='red')
    sage: multi_graphics([g1, (g2, (0.2, 0.55, 0.3, 0.3))])
    Multigraphics with 2 elements
    ```
    """
    return MultiGraphics(graphics_list)


@runtime.sequence_class
class Animation:
    r"""
    A sequence of two- or three-dimensional graphics frames.

    Sage.js renders animations as native Plotly frames.  Consequently an
    animation remains interactive in notebooks and exported HTML files: it
    has play/pause buttons, a frame slider, and no ImageMagick dependency.

    ### Examples

    ```sage
    sage: a = animate([circle((k, 0), 0.25) for k in range(3)],
    ....:             xmin=-1, xmax=3, ymin=-1, ymax=1)
    sage: a
    Animation with 3 frames
    sage: len(a)
    3
    sage: a[1]
    Graphics object consisting of 1 graphics primitive
    ```
    """

    def __init__(self, frames: Any = None, **options: Any) -> None:
        self._frames = [] if frames is None else list(frames)
        self._kwds = _copy_options(options)

    def __len__(self) -> int:
        return len(self._frames)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._frames)

    def __getitem__(self, index: Any) -> Any:
        if isinstance(index, slice):
            options = self._kwds
            start, stop, step = index.indices(len(self._frames))
            frames = [self._frames[position] for position in range(start, stop, step)]
            return Animation(frames, **options)
        return self._frames[index]

    def __repr__(self) -> str:
        return "Animation with " + str(len(self._frames)) + " frames"

    __str__ = __repr__
    toString = __repr__

    def _combine_kwds(self, other: Animation) -> dict[str, Any]:
        combined = _copy_options(self._kwds)
        _option_update(combined, other._kwds)
        for name in ("xmin", "ymin"):
            values = []
            if _option_has(self._kwds, name):
                values.append(_option_get(self._kwds, name))
            if _option_has(other._kwds, name):
                values.append(_option_get(other._kwds, name))
            if len(values):
                combined[name] = min(values)
        for name in ("xmax", "ymax"):
            values = []
            if _option_has(self._kwds, name):
                values.append(_option_get(self._kwds, name))
            if _option_has(other._kwds, name):
                values.append(_option_get(other._kwds, name))
            if len(values):
                combined[name] = max(values)
        return combined

    def __add__(self, other: Any) -> Animation:
        if not isinstance(other, Animation):
            other = Animation(other)
        common = min(len(self), len(other))
        frames = [self._frames[index] + other._frames[index] for index in range(common)]
        frames += self._frames[common:]
        frames += other._frames[common:]
        options = self._combine_kwds(other)
        return Animation(frames, **options)

    def __mul__(self, other: Any) -> Animation:
        if not isinstance(other, Animation):
            other = Animation(other)
        options = self._combine_kwds(other)
        return Animation(self._frames + other._frames, **options)

    def _graphic(self, frame: Any) -> Any:
        if hasattr(frame, "plotly"):
            graphic = frame
            if len(self._kwds) and hasattr(graphic, "set_extra_kwds"):
                graphic.set_extra_kwds(self._kwds)
            return graphic
        plot_options = _copy_options(self._kwds)
        xmin = _option_pop(plot_options, "xmin", -1)
        xmax = _option_pop(plot_options, "xmax", 1)
        return plot(frame, xmin, xmax, **plot_options)

    def plotly(
        self,
        delay: int = 20,
        iterations: int = 0,
        **options: Any,
    ) -> Any:
        """Return a Plotly animation figure with play/pause controls."""
        if len(self._frames) == 0:
            raise ValueError("an animation must contain at least one frame")
        if delay < 0:
            raise ValueError("delay must be nonnegative")
        if iterations < 0:
            raise ValueError("iterations must be nonnegative")
        if len(options):
            _option_update(self._kwds, options)

        figures = [self._graphic(frame).plotly() for frame in self._frames]
        initial = figures[0]
        duration = int(delay) * 10
        plotly_frames = []
        slider_steps = []
        for index in range(len(figures)):
            name = str(index)
            figure = figures[index]
            plotly_frames.append(
                _native_record(
                    name=name,
                    data=runtime.reflect.get(figure, "data"),
                    layout=runtime.reflect.get(figure, "layout"),
                )
            )
            slider_steps.append(
                _native_record(
                    label=name,
                    method="animate",
                    args=[
                        [name],
                        _native_record(
                            mode="immediate",
                            frame=_native_record(duration=duration, redraw=True),
                            transition=_native_record(duration=0),
                        ),
                    ],
                )
            )

        layout = runtime.reflect.get(initial, "layout")
        runtime.reflect.set(
            layout,
            "updatemenus",
            [
                _native_record(
                    type="buttons",
                    direction="left",
                    x=0,
                    y=0,
                    xanchor="left",
                    yanchor="top",
                    pad=_native_record(t=55, r=10),
                    showactive=False,
                    buttons=[
                        _native_record(
                            label="Play",
                            method="animate",
                            args=[
                                None,
                                _native_record(
                                    mode="immediate",
                                    fromcurrent=True,
                                    frame=_native_record(
                                        duration=duration, redraw=True
                                    ),
                                    transition=_native_record(duration=0),
                                ),
                            ],
                        ),
                        _native_record(
                            label="Pause",
                            method="animate",
                            args=[
                                [None],
                                _native_record(
                                    mode="immediate",
                                    frame=_native_record(duration=0, redraw=False),
                                    transition=_native_record(duration=0),
                                ),
                            ],
                        ),
                    ],
                )
            ],
        )
        runtime.reflect.set(
            layout,
            "sliders",
            [
                _native_record(
                    active=0,
                    currentvalue=_native_record(prefix="Frame: "),
                    pad=_native_record(t=40),
                    steps=slider_steps,
                )
            ],
        )
        return _native_record(
            data=runtime.reflect.get(initial, "data"),
            layout=layout,
            config=runtime.reflect.get(initial, "config"),
            frames=plotly_frames,
            animation=_native_record(
                delay=duration,
                iterations=int(iterations),
            ),
        )

    def _rich_repr_(self) -> Any:
        delay = int(_option_get(self._kwds, "delay", 20))
        iterations = int(_option_get(self._kwds, "iterations", 0))
        return _native_record(
            mime=_PLOTLY_MIME,
            data=self.plotly(delay=delay, iterations=iterations),
        )

    def show(
        self,
        delay: int = 20,
        iterations: int = 0,
        **options: Any,
    ) -> Animation:
        self._kwds["delay"] = int(delay)
        self._kwds["iterations"] = int(iterations)
        _option_update(self._kwds, options)
        return self

    def save(self, filename: Any, **options: Any) -> Animation:
        """Save an animated HTML/JSON file through the host graphics hook."""
        hook = runtime.reflect.get(
            runtime.global_object, "__sagejs_graphics_save_hook__"
        )
        if hook is runtime.undefined:
            raise NotImplementedError(
                "graphics file export is not available in this host"
            )
        runtime.reflect.apply(hook, runtime.undefined, [self, filename, options])
        return self


def animate(frames: Any, **options: Any) -> Animation:
    r"""
    Animate an iterable of Sage graphics or plottable symbolic objects.

    The optional `delay` is measured in hundredths of a second, matching
    SageMath.  `iterations=0` denotes unrestricted interactive replay.
    """
    return Animation(frames, **options)


@runtime.sequence_class
class GraphicsArray:
    """A rectangular array of independently rendered graphics objects."""

    def __init__(self, rows: Any) -> None:
        self._rows = [list(row) for row in rows]
        if len(self._rows) == 0:
            self._columns = 0
        else:
            self._columns = len(self._rows[0])
            for row in self._rows:
                if len(row) != self._columns:
                    raise ValueError("every graphics-array row must have equal length")
                for graphic in row:
                    if not isinstance(graphic, Graphics):
                        raise TypeError("graphics_array entries must be Graphics")

    def __len__(self) -> int:
        return sum(len(row) for row in self._rows)

    def nrows(self) -> int:
        """Return the number of rows in this graphics array."""
        return len(self._rows)

    def ncols(self) -> int:
        """Return the number of columns in this graphics array."""
        return self._columns

    def __iter__(self) -> Iterator[Graphics]:
        for row in self._rows:
            for graphic in row:
                yield graphic

    def __getitem__(self, index: int) -> Graphics:
        if index < 0:
            index += len(self)
        if index < 0 or index >= len(self):
            raise IndexError("graphics array index out of range")
        row = index // self._columns
        column = index % self._columns
        return self._rows[row][column]

    def __repr__(self) -> str:
        return (
            "Graphics Array of size "
            + str(len(self._rows))
            + " x "
            + str(self._columns)
        )

    __str__ = __repr__
    toString = __repr__

    def plotly(self) -> Any:
        """Return the renderer-neutral Plotly subplot description."""
        traces = []
        subplot = 0
        for row in self._rows:
            for graphic in row:
                subplot += 1
                axis_suffix = "" if subplot == 1 else str(subplot)
                for primitive in graphic:
                    trace = primitive._plotly_trace()
                    runtime.reflect.set(trace, "xaxis", "x" + axis_suffix)
                    runtime.reflect.set(trace, "yaxis", "y" + axis_suffix)
                    traces.append(trace)
        layout = _native_record(
            autosize=True,
            showlegend=False,
            grid=_native_record(
                rows=len(self._rows),
                columns=self._columns,
                pattern="independent",
            ),
        )
        return _native_record(
            data=traces,
            layout=layout,
            config=_native_record(
                displaylogo=False,
                responsive=True,
            ),
        )

    def _rich_repr_(self) -> Any:
        return _native_record(mime=_PLOTLY_MIME, data=self.plotly())

    def save(
        self,
        filename: Any,
        **options: Any,
    ) -> GraphicsArray:
        """Save through the host graphics hook when one is installed."""
        hook = runtime.reflect.get(
            runtime.global_object, "__sagejs_graphics_save_hook__"
        )
        if hook is runtime.undefined:
            raise NotImplementedError(
                "graphics file export is not available in this host"
            )
        runtime.reflect.apply(
            hook,
            runtime.undefined,
            [self, filename, options],
        )
        return self


def graphics_array(
    graphics: Any,
    rows: Any = None,
    columns: Any = None,
) -> GraphicsArray:
    r"""
    Arrange several two-dimensional graphics objects in a rectangular grid.

    The input may already be a nested list of rows. For a flat list, specify
    either `rows` or `columns`; omitting both creates one horizontal row.

    ### Examples

    ```sage
    sage: G = graphics_array([plot(sin(x), (x, 0, 2*pi)), circle((0, 0), 1)])
    sage: G.nrows(), G.ncols()
    (1, 2)
    ```
    """
    values = list(graphics)
    if len(values) and isinstance(values[0], (list, tuple)):
        return GraphicsArray(values)
    if rows is None and columns is None:
        rows = 1
        columns = len(values)
    elif rows is None:
        rows = (len(values) + int(columns) - 1) // int(columns)
    elif columns is None:
        columns = (len(values) + int(rows) - 1) // int(rows)
    row_count = int(rows)
    column_count = int(columns)
    if row_count * column_count != len(values):
        raise ValueError("graphics array dimensions do not match entries")
    nested = []
    for row_index in range(row_count):
        start = row_index * column_count
        nested.append(values[start : start + column_count])
    return GraphicsArray(nested)


@runtime.sequence_class
class NumericVector:
    """A minimal dense vector used by the Sage time-series API."""

    def __init__(self, values: Any) -> None:
        self._values = [float(value) for value in values]

    def __len__(self) -> int:
        return len(self._values)

    def __getitem__(self, index: int) -> float:
        return self._values[index]

    def __add__(self, other: Any) -> NumericVector:
        if other == 0:
            return NumericVector(self._values)
        values = list(other)
        if len(values) != len(self._values):
            raise ValueError("vector dimensions do not agree")
        return NumericVector(
            [
                self._values[index] + float(values[index])
                for index in range(len(self._values))
            ]
        )

    __radd__ = __add__

    def __truediv__(self, scalar: Any) -> NumericVector:
        divisor = float(scalar)
        return NumericVector([value / divisor for value in self._values])


@runtime.sequence_class
class TimeSeries:
    """A compact numeric time series with Sage-compatible plotting."""

    def __init__(self, values: Any) -> None:
        self._values = [float(value) for value in values]

    def __len__(self) -> int:
        return len(self._values)

    def __getitem__(self, index: int) -> float:
        return self._values[index]

    def __setitem__(self, index: int, value: Any) -> None:
        self._values[index] = float(value)

    def sums(self) -> TimeSeries:
        total = 0.0
        values = []
        for value in self._values:
            total += value
            values.append(total)
        return TimeSeries(values)

    def diffs(self) -> TimeSeries:
        return TimeSeries(
            [
                self._values[index] - self._values[index - 1]
                for index in range(1, len(self._values))
            ]
        )

    def abs(self) -> TimeSeries:
        return TimeSeries([abs(value) for value in self._values])

    __abs__ = abs

    def vector(self) -> NumericVector:
        return NumericVector(self._values)

    def clip_remove(
        self,
        minimum: Any = None,
        maximum: Any = None,
        **options: Any,
    ) -> TimeSeries:
        if _option_has(options, "min"):
            minimum = _option_get(options, "min")
        if _option_has(options, "max"):
            maximum = _option_get(options, "max")
        lower = None if minimum is None else float(minimum)
        upper = None if maximum is None else float(maximum)
        return TimeSeries(
            [
                value
                for value in self._values
                if (lower is None or value >= lower)
                and (upper is None or value <= upper)
            ]
        )

    def plot(self, **options: Any) -> Graphics:
        return list_plot(self._values, plotjoined=True, **options)

    def plot_histogram(self, **options: Any) -> Graphics:
        options = _copy_options(options)
        graphic = Graphics()
        graphic.set_extra_kwds(_graphics_options(options))
        graphic.add_primitive(Histogram(self._values, options))
        return graphic


class Spline:
    """A natural cubic spline through a sequence of planar points."""

    def __init__(self, points: Any) -> None:
        normalized = _normalize_points(points)
        if len(normalized) < 2:
            raise ValueError("spline requires at least two points")
        normalized.sort()
        self._x = [point_value[0] for point_value in normalized]
        self._a = [point_value[1] for point_value in normalized]
        count = len(normalized)
        h = [self._x[index + 1] - self._x[index] for index in range(count - 1)]
        for width in h:
            if width <= 0:
                raise ValueError("spline x-coordinates must be distinct")
        alpha = [0.0] * count
        for index in range(1, count - 1):
            alpha[index] = 3.0 / h[index] * (
                self._a[index + 1] - self._a[index]
            ) - 3.0 / h[index - 1] * (self._a[index] - self._a[index - 1])
        lower = [1.0] * count
        diagonal = [0.0] * count
        solution = [0.0] * count
        for index in range(1, count - 1):
            lower[index] = (
                2.0 * (self._x[index + 1] - self._x[index - 1])
                - h[index - 1] * diagonal[index - 1]
            )
            diagonal[index] = h[index] / lower[index]
            solution[index] = (
                alpha[index] - h[index - 1] * solution[index - 1]
            ) / lower[index]
        self._b = [0.0] * (count - 1)
        self._c = [0.0] * count
        self._d = [0.0] * (count - 1)
        for index in range(count - 2, -1, -1):
            self._c[index] = solution[index] - diagonal[index] * self._c[index + 1]
            self._b[index] = (self._a[index + 1] - self._a[index]) / h[index] - h[
                index
            ] * (self._c[index + 1] + 2.0 * self._c[index]) / 3.0
            self._d[index] = (self._c[index + 1] - self._c[index]) / (3.0 * h[index])

    def __call__(self, value: Any) -> float:
        x_value = float(value)
        if x_value < self._x[0] or x_value > self._x[-1]:
            raise ValueError("spline value is outside the interpolation range")
        left = 0
        right = len(self._x) - 1
        while left + 1 < right:
            middle = (left + right) // 2
            if self._x[middle] <= x_value:
                left = middle
            else:
                right = middle
        offset = x_value - self._x[left]
        return (
            self._a[left]
            + self._b[left] * offset
            + self._c[left] * offset * offset
            + self._d[left] * offset * offset * offset
        )


def spline(points: Any) -> Spline:
    return Spline(points)


finance = _native_object()
runtime.reflect.set(finance, "TimeSeries", TimeSeries)
stats = _native_object()
runtime.reflect.set(stats, "TimeSeries", TimeSeries)


def _finite_value(value: Any) -> float:
    numeric = float(value)
    native = runtime.number(numeric)
    if not runtime.number.isFinite(native):
        raise ValueError("plot function returned a non-finite value")
    return native


def _complex_numeric_parts(value: Any) -> tuple[float, float]:
    if runtime.jstype(value) == "number":
        return (float(value), 0.0)
    real_value = runtime.reflect.get(value, "real")
    imaginary_value = runtime.reflect.get(value, "imag")
    if runtime.jstype(real_value) == "function":
        real_value = runtime.reflect.apply(real_value, value, [])
    if runtime.jstype(imaginary_value) == "function":
        imaginary_value = runtime.reflect.apply(imaginary_value, value, [])
    real_part = float(real_value)
    imaginary_part = float(imaginary_value)
    real_native = runtime.number(real_part)
    imaginary_native = runtime.number(imaginary_part)
    if not runtime.number.isFinite(real_native) or not runtime.number.isFinite(
        imaginary_native
    ):
        raise ValueError("complex plot function returned a non-finite value")
    return (real_native, imaginary_native)


def _complex_from_parts(
    real: float,
    imaginary: float,
    constructor: Any,
) -> Any:
    return runtime.reflect.apply(constructor, runtime.undefined, [real, imaginary])


def _complex_tree_function(
    name: str,
    value: Any,
    constructor: Any,
) -> Any:
    parts = _complex_numeric_parts(value)
    real = parts[0]
    imaginary = parts[1]
    if name == "Exp":
        scale = runtime.math.exp(real)
        return _complex_from_parts(
            scale * runtime.math.cos(imaginary),
            scale * runtime.math.sin(imaginary),
            constructor,
        )
    if name in ("Ln", "Log"):
        return _complex_from_parts(
            runtime.math.log(runtime.math.hypot(real, imaginary)),
            runtime.math.atan2(imaginary, real),
            constructor,
        )
    if name == "Sqrt":
        magnitude = runtime.math.hypot(real, imaginary)
        output_real = runtime.math.sqrt(max(0.0, (magnitude + real) / 2.0))
        output_imaginary = runtime.math.sqrt(max(0.0, (magnitude - real) / 2.0))
        if imaginary < 0:
            output_imaginary = -output_imaginary
        return _complex_from_parts(output_real, output_imaginary, constructor)
    if name in ("Sin", "Cos", "Tan"):
        sine = _complex_from_parts(
            runtime.math.sin(real) * runtime.math.cosh(imaginary),
            runtime.math.cos(real) * runtime.math.sinh(imaginary),
            constructor,
        )
        cosine = _complex_from_parts(
            runtime.math.cos(real) * runtime.math.cosh(imaginary),
            -runtime.math.sin(real) * runtime.math.sinh(imaginary),
            constructor,
        )
        if name == "Sin":
            return sine
        if name == "Cos":
            return cosine
        return sine / cosine
    if name == "Abs":
        return _complex_from_parts(
            runtime.math.hypot(real, imaginary), 0.0, constructor
        )
    raise NotImplementedError("complex symbolic evaluation does not support " + name)


def _complex_tree_evaluate(
    tree: Any,
    variable_name: str,
    argument: Any,
    constructor: Any,
) -> Any:
    if isinstance(tree, str):
        if tree == variable_name:
            return argument
        constants = {
            "Pi": runtime.math.PI,
            "ExponentialE": runtime.math.E,
        }
        if tree == "ImaginaryUnit":
            return _complex_from_parts(0.0, 1.0, constructor)
        if tree in constants:
            return _complex_from_parts(constants[tree], 0.0, constructor)
        raise ValueError("unknown symbolic variable " + tree)
    if not runtime.array.isArray(tree):
        return _complex_from_parts(float(tree), 0.0, constructor)
    if len(tree) == 0:
        raise ValueError("empty symbolic expression tree")
    head = str(tree[0])
    if head == "Rational" and len(tree) == 3:
        return _complex_from_parts(float(tree[1]) / float(tree[2]), 0.0, constructor)
    operands = [
        _complex_tree_evaluate(tree[index], variable_name, argument, constructor)
        for index in range(1, len(tree))
    ]
    if head == "Add":
        result = _complex_from_parts(0.0, 0.0, constructor)
        for operand in operands:
            result = result + operand
        return result
    if head == "Multiply":
        result = _complex_from_parts(1.0, 0.0, constructor)
        for operand in operands:
            result = result * operand
        return result
    if head == "Negate":
        return -operands[0]
    if head == "Subtract":
        return operands[0] - operands[1]
    if head == "Divide":
        return operands[0] / operands[1]
    if head == "Power":
        exponent_tree = tree[2]
        if runtime.is_exact_integer(exponent_tree):
            return operands[0] ** int(exponent_tree)
        logarithm = _complex_tree_function("Log", operands[0], constructor)
        return _complex_tree_function("Exp", operands[1] * logarithm, constructor)
    if len(operands) == 1:
        return _complex_tree_function(head, operands[0], constructor)
    raise NotImplementedError("complex symbolic evaluation does not support " + head)


def _complex_lightness(
    magnitude: float,
    argument: float,
    contoured: bool,
    tiled: bool,
    contour_type: str,
    contour_base: float,
    dark_rate: float,
    nphases: int,
) -> float:
    if tiled:
        if magnitude < 1e-10:
            return 0.0
        magnitude_remainder = (
            runtime.math.log(magnitude) / runtime.math.log(contour_base)
        ) % 1.0
        argument_remainder = (nphases * argument / (2.0 * runtime.math.PI)) % 1.0
        if magnitude_remainder < 0:
            magnitude_remainder += 1.0
        if argument_remainder < 0:
            argument_remainder += 1.0
        return 0.15 - magnitude_remainder / 4.0 - argument_remainder / 4.0
    if contoured:
        if contour_type == "logarithmic":
            if magnitude < 1e-10:
                return 0.0
            remainder = (
                runtime.math.log(magnitude) / runtime.math.log(contour_base)
            ) % 1.0
        else:
            remainder = (magnitude / contour_base) % 1.0
        if remainder < 0:
            remainder += 1.0
        return 0.15 - remainder / 2.0
    return (
        runtime.math.atan(
            runtime.math.log(runtime.math.pow(magnitude, dark_rate) + 1.0)
        )
        * (4.0 / runtime.math.PI)
        - 1.0
    )


def _complex_hue_rgb(
    argument: float,
    lightness: float,
) -> list[float]:
    if lightness < 0:
        bottom = 0.0
        top = 1.0 + lightness
    else:
        bottom = lightness
        top = 1.0
    hue_value = 3.0 * argument / runtime.math.PI
    if hue_value < 0:
        hue_value += 6.0
    hue_index = int(hue_value)
    if hue_index == 0:
        return [
            top,
            bottom + hue_value * (top - bottom),
            bottom,
        ]
    if hue_index == 1:
        return [
            bottom + (2.0 - hue_value) * (top - bottom),
            top,
            bottom,
        ]
    if hue_index == 2:
        return [
            bottom,
            top,
            bottom + (hue_value - 2.0) * (top - bottom),
        ]
    if hue_index == 3:
        return [
            bottom,
            bottom + (4.0 - hue_value) * (top - bottom),
            top,
        ]
    if hue_index == 4:
        return [
            bottom + (hue_value - 4.0) * (top - bottom),
            bottom,
            top,
        ]
    return [
        top,
        bottom,
        bottom + (6.0 - hue_value) * (top - bottom),
    ]


def complex_to_rgb(
    z_values: Any,
    contoured: bool = False,
    tiled: bool = False,
    contour_type: str = "logarithmic",
    contour_base: Any = None,
    dark_rate: float = 0.5,
    nphases: int = 10,
) -> list[list[list[float]]]:
    r"""
    Convert a rectangular grid of complex values to Sage domain colors.

    Argument determines hue. Magnitude determines lightness, either smoothly
    or through optional logarithmic/linear contours and phase tiles.

    ### Examples

    ```sage
    sage: colors = complex_to_rgb([[0, 1, 10]])[0]
    sage: len(colors), colors[0], len(colors[1])
    (3, [0.0, 0.0, 0], 3)
    ```
    """
    contour_type = str(contour_type).lower()
    if contour_type not in ("linear", "logarithmic"):
        raise ValueError("contour_type must be linear or logarithmic")
    if contour_base is None:
        contour_base_value = 10.0 if contour_type == "linear" else 2.0
    else:
        contour_base_value = float(contour_base)
    if contour_base_value <= 0:
        raise ValueError("contour_base must be positive")
    dark_rate_value = float(dark_rate)
    if dark_rate_value <= 0:
        raise ValueError("dark_rate must be positive")
    phase_count = int(nphases)
    if phase_count <= 0:
        raise ValueError("nphases must be positive")

    rows = [list(row) for row in z_values]
    if len(rows) == 0:
        return []
    column_count = len(rows[0])
    answer = []
    for row in rows:
        if len(row) != column_count:
            raise ValueError("complex value grid must be rectangular")
        output_row = []
        for value in row:
            try:
                parts = _complex_numeric_parts(value)
                magnitude = runtime.math.hypot(parts[0], parts[1])
                argument = runtime.math.atan2(parts[1], parts[0])
                lightness = _complex_lightness(
                    magnitude,
                    argument,
                    bool(contoured),
                    bool(tiled),
                    contour_type,
                    contour_base_value,
                    dark_rate_value,
                    phase_count,
                )
                output_row.append(_complex_hue_rgb(argument, lightness))
            except Exception:
                output_row.append([1.0, 1.0, 1.0])
        answer.append(output_row)
    return answer


def _complex_normalize_colormap(
    colors_value: Any,
    reverse: bool,
) -> list[list[float]]:
    """Normalize an iterable of Sage colors to RGB stops."""
    if len(colors_value) == 0:
        raise ValueError("a colormap must contain at least one color")
    colors = [list(rgbcolor(value)) for value in colors_value]
    if len(colors) == 1:
        colors.append(list(colors[0]))
    if reverse:
        colors.reverse()
    return colors


def _complex_colormap_colors(cmap: Any) -> Any:
    """Return a callable or normalized RGB stops for a colormap."""
    if callable(cmap) and not isinstance(cmap, (list, tuple)):
        return cmap
    if not isinstance(cmap, str):
        return _complex_normalize_colormap(list(cmap), False)
    name = cmap
    reverse = False
    if name.endswith("_r"):
        reverse = True
        name = name[:-2]
    if name == "matplotlib":
        # Sage's special ``matplotlib`` wheel is HSV shifted so that a
        # positive real value is red.  It remains cyclic at the cut.
        return _complex_normalize_colormap(
            [
                "#00ffff",
                "#0000ff",
                "#ff00ff",
                "#ff0000",
                "#ffff00",
                "#00ff00",
                "#00ffff",
            ],
            reverse,
        )
    key = name
    if key not in _COLORMAP_VALUES:
        lowered = name.lower()
        if lowered in _COLORMAP_VALUES:
            key = lowered
        elif name == "Greys" and "Greys" in _COLORMAP_VALUES:
            key = "Greys"
        else:
            raise ValueError("unknown colormap '" + name + "'")
    return _complex_normalize_colormap(
        list(_option_get(_COLORMAP_VALUES, key)), reverse
    )


def _complex_colormap_sample(cmap: Any, position: float) -> list[float]:
    """Sample a normalized colormap or user callable at `position`."""
    normalized = max(0.0, min(1.0, float(position)))
    if callable(cmap) and not isinstance(cmap, (list, tuple)):
        color_value = cmap(normalized)
        values = runtime.list_constructor(color_value)
        if len(values) < 3:
            raise ValueError("a colormap callable must return an RGB color")
        return [float(values[0]), float(values[1]), float(values[2])]
    colors = cmap
    scaled = normalized * float(len(colors) - 1)
    left = min(int(scaled), len(colors) - 2)
    fraction = scaled - float(left)
    return [
        (1.0 - fraction) * float(colors[left][index])
        + fraction * float(colors[left + 1][index])
        for index in range(3)
    ]


def _complex_adjust_colormap_lightness(
    rgb: Any,
    delta: float,
    contoured: bool,
    tiled: bool,
    dark_rate: float,
) -> list[float]:
    """Apply Sage's smooth or HLS contour lightness adjustment."""
    if contoured or tiled:
        hue_value, lightness, saturation = Color(rgb).hls()
        lightness = max(0.0, min(1.0, lightness + float(dark_rate) * delta))
        return list(_hls_to_rgb(hue_value, lightness, saturation))
    if delta >= 0:
        return [(1.0 - delta) * float(component) + delta for component in rgb]
    return [(1.0 + delta) * float(component) for component in rgb]


def complex_to_cmap_rgb(
    z_values: Any,
    cmap: Any = "turbo",
    contoured: bool = False,
    tiled: bool = False,
    contour_type: str = "logarithmic",
    contour_base: Any = None,
    dark_rate: float = 0.5,
    nphases: int = 10,
) -> list[list[list[float]]]:
    r"""Convert complex values to RGB using a Sage-compatible colormap.

    The argument selects a point in the colormap and the magnitude controls
    lightness. Common matplotlib names such as `'viridis'`, `'plasma'`,
    `'inferno'`, `'cividis'`, `'turbo'`, `'twilight'`, and `'hsv'`
    are built in without importing matplotlib.  A list of colors or a callable
    returning an RGB(A) tuple is also accepted.

    ### Examples

    ```sage
    sage: complex_to_cmap_rgb([[0, 1]], cmap='viridis')[0][0]
    [0.0, 0.0, 0.0]
    sage: len(complex_to_cmap_rgb([[1 + I]], cmap='plasma')[0][0])
    3
    ```
    """
    contour_kind = str(contour_type).lower()
    if contour_kind not in ("linear", "logarithmic"):
        raise ValueError("contour_type must be linear or logarithmic")
    if contour_base is None:
        contour_base_value = 10.0 if contour_kind == "linear" else 2.0
    else:
        contour_base_value = float(contour_base)
    if contour_base_value <= 0:
        raise ValueError("contour_base must be positive")
    dark_rate_value = float(dark_rate)
    if dark_rate_value <= 0:
        raise ValueError("dark_rate must be positive")
    phase_count = int(nphases)
    if phase_count <= 0:
        raise ValueError("nphases must be positive")
    color_source = _complex_colormap_colors(cmap)
    rows = [list(row) for row in z_values]
    if len(rows) == 0:
        return []
    column_count = len(rows[0])
    answer = []
    for row in rows:
        if len(row) != column_count:
            raise ValueError("complex value grid must be rectangular")
        output_row = []
        for value in row:
            try:
                real, imaginary = _complex_numeric_parts(value)
                magnitude = runtime.math.hypot(real, imaginary)
                argument = runtime.math.atan2(imaginary, real)
                lightness = _complex_lightness(
                    magnitude,
                    argument,
                    bool(contoured),
                    bool(tiled),
                    contour_kind,
                    contour_base_value,
                    dark_rate_value,
                    phase_count,
                )
                base_color = _complex_colormap_sample(
                    color_source,
                    (argument + runtime.math.PI) / (2.0 * runtime.math.PI),
                )
                output_row.append(
                    _complex_adjust_colormap_lightness(
                        base_color,
                        lightness,
                        bool(contoured),
                        bool(tiled),
                        dark_rate_value,
                    )
                )
            except Exception:
                output_row.append([1.0, 1.0, 1.0])
        answer.append(output_row)
    return answer


def _plot_callable_2d(
    function_value: Any,
    xvariable: Any,
    yvariable: Any,
) -> Any:
    current = function_value
    if hasattr(current, "_plot_fast_callable"):
        variables = [
            variable for variable in [xvariable, yvariable] if variable is not None
        ]
        current = current._plot_fast_callable(variables)
    if callable(current):
        return current
    numeric = float(current)

    def constant(_xvalue: Any, _yvalue: Any) -> float:
        return numeric

    return constant


def _grid_counts_2d(value: Any, default_value: int) -> tuple[int, int]:
    if value is None or value == "automatic":
        xcount = default_value
        ycount = default_value
    elif isinstance(value, (list, tuple)):
        if len(value) != 2:
            raise ValueError("plot_points must have two entries")
        xcount = int(value[0])
        ycount = int(value[1])
    else:
        xcount = int(value)
        ycount = int(value)
    if xcount < 2 or ycount < 2:
        raise ValueError("plot_points must be at least 2")
    return xcount, ycount


def _sample_grid_2d(
    function_value: Any,
    xrange: Any,
    yrange: Any,
    plot_points: Any,
) -> tuple[list[float], list[float], list[list[float]]]:
    xminimum, xmaximum = _plot_range([xrange])
    yminimum, ymaximum = _plot_range([yrange])
    xvariable = _plot_variable([xrange])
    yvariable = _plot_variable([yrange])
    if (xvariable is None or yvariable is None) and hasattr(
        function_value, "variables"
    ):
        symbolic_variables = list(function_value.variables())
        if xvariable is None and yvariable is None:
            if len(symbolic_variables) != 2:
                raise ValueError(
                    "two-variable symbolic plots require explicit variables "
                    "unless the expression has exactly two variables"
                )
            xvariable, yvariable = symbolic_variables
        elif xvariable is None:
            remaining = [
                variable for variable in symbolic_variables if variable != yvariable
            ]
            if len(remaining) != 1:
                raise ValueError("could not infer the x-axis variable")
            xvariable = remaining[0]
        elif yvariable is None:
            remaining = [
                variable for variable in symbolic_variables if variable != xvariable
            ]
            if len(remaining) != 1:
                raise ValueError("could not infer the y-axis variable")
            yvariable = remaining[0]
    current = _plot_callable_2d(function_value, xvariable, yvariable)
    xcount, ycount = _grid_counts_2d(plot_points, 50)
    xstep = (xmaximum - xminimum) / float(xcount - 1)
    ystep = (ymaximum - yminimum) / float(ycount - 1)
    xvalues = [
        xmaximum if index == xcount - 1 else xminimum + index * xstep
        for index in range(xcount)
    ]
    yvalues = [
        ymaximum if index == ycount - 1 else yminimum + index * ystep
        for index in range(ycount)
    ]
    zvalues = []
    for yvalue in yvalues:
        row = []
        for xvalue in xvalues:
            row.append(_finite_value(current(xvalue, yvalue)))
        zvalues.append(row)
    return xvalues, yvalues, zvalues


def _finite_or_none(value: Any) -> Any:
    try:
        numeric = float(value)
    except Exception:
        return None
    native = runtime.number(numeric)
    if not runtime.number.isFinite(native):
        return None
    return native


def _sample_vector_grid_2d(
    functions: Any,
    xrange: Any,
    yrange: Any,
    plot_points: Any,
) -> list[Any]:
    values = list(functions)
    if len(values) != 2:
        raise ValueError("a vector field requires exactly two functions")
    xminimum, xmaximum = _plot_range([xrange])
    yminimum, ymaximum = _plot_range([yrange])
    xvariable = _plot_variable([xrange])
    yvariable = _plot_variable([yrange])
    xfunction = _plot_callable_2d(values[0], xvariable, yvariable)
    yfunction = _plot_callable_2d(values[1], xvariable, yvariable)
    xcount, ycount = _grid_counts_2d(plot_points, 20)
    xstep = (xmaximum - xminimum) / float(xcount - 1)
    ystep = (ymaximum - yminimum) / float(ycount - 1)
    xpos_array = []
    ypos_array = []
    xvec_array = []
    yvec_array = []
    for xindex in range(xcount):
        xvalue = xmaximum if xindex == xcount - 1 else xminimum + xindex * xstep
        for yindex in range(ycount):
            yvalue = ymaximum if yindex == ycount - 1 else yminimum + yindex * ystep
            xpos_array.append(xvalue)
            ypos_array.append(yvalue)
            try:
                xvector = _finite_or_none(xfunction(xvalue, yvalue))
            except Exception:
                xvector = None
            try:
                yvector = _finite_or_none(yfunction(xvalue, yvalue))
            except Exception:
                yvector = None
            if xvector is None or yvector is None:
                xvector = None
                yvector = None
            xvec_array.append(xvector)
            yvec_array.append(yvector)
    return [
        xpos_array,
        ypos_array,
        xvec_array,
        yvec_array,
        runtime.math_tuple([xcount, ycount]),
    ]


def _stream_vector_callables(
    functions: Any,
    xvariable: Any,
    yvariable: Any,
) -> tuple[Any, Any]:
    if isinstance(functions, (list, tuple)):
        values = list(functions)
        if len(values) != 2:
            raise ValueError("a streamline vector field requires exactly two functions")
        return runtime.math_tuple(
            [
                _plot_callable_2d(values[0], xvariable, yvariable),
                _plot_callable_2d(values[1], xvariable, yvariable),
            ]
        )
    slope = _plot_callable_2d(functions, xvariable, yvariable)

    def horizontal(xvalue: Any, yvalue: Any) -> float:
        current = float(slope(xvalue, yvalue))
        return 1.0 / runtime.math.sqrt(current * current + 1.0)

    def vertical(xvalue: Any, yvalue: Any) -> float:
        current = float(slope(xvalue, yvalue))
        return current / runtime.math.sqrt(current * current + 1.0)

    return runtime.math_tuple([horizontal, vertical])


def _stream_direction(
    xfunction: Any,
    yfunction: Any,
    xvalue: float,
    yvalue: float,
) -> Any:
    try:
        xvector = _finite_or_none(xfunction(xvalue, yvalue))
        yvector = _finite_or_none(yfunction(xvalue, yvalue))
    except Exception:
        return None
    if xvector is None or yvector is None:
        return None
    length = runtime.math.sqrt(xvector * xvector + yvector * yvector)
    if length <= 1e-15:
        return None
    return runtime.math_tuple([xvector / length, yvector / length])


def _integrate_streamline_direction(
    seed: tuple[float, float],
    direction_sign: float,
    xfunction: Any,
    yfunction: Any,
    bounds: tuple[float, float, float, float],
    step: float,
    maximum_steps: int,
) -> list[tuple[float, float]]:
    xmin, xmax, ymin, ymax = bounds
    xvalue = seed[0]
    yvalue = seed[1]
    answer = []
    for _index in range(maximum_steps):
        direction = _stream_direction(xfunction, yfunction, xvalue, yvalue)
        if direction is None:
            break
        midpoint_x = xvalue + direction_sign * step * direction[0] / 2.0
        midpoint_y = yvalue + direction_sign * step * direction[1] / 2.0
        middle_direction = _stream_direction(
            xfunction, yfunction, midpoint_x, midpoint_y
        )
        if middle_direction is None:
            break
        candidate_x = xvalue + direction_sign * step * middle_direction[0]
        candidate_y = yvalue + direction_sign * step * middle_direction[1]
        if (
            candidate_x < xmin
            or candidate_x > xmax
            or candidate_y < ymin
            or candidate_y > ymax
        ):
            break
        xvalue = candidate_x
        yvalue = candidate_y
        answer.append(runtime.math_tuple([xvalue, yvalue]))
    return answer


def _evaluate_plot_function(
    func: Callable[[float], Any],
    x_value: float,
) -> tuple[float, float] | None:
    try:
        return x_value, _finite_value(func(x_value))
    except Exception:
        return None


def _adaptive_refinement(
    func: Callable[[float], Any],
    left: tuple[float, float],
    right: tuple[float, float],
    tolerance: float,
    recursion: int,
    level: int = 0,
) -> list[tuple[float, float]]:
    if level >= recursion:
        return []
    midpoint_x = (left[0] + right[0]) / 2.0
    midpoint = _evaluate_plot_function(func, midpoint_x)
    if midpoint is None:
        return []
    linear_midpoint = (left[1] + right[1]) / 2.0
    if abs(linear_midpoint - midpoint[1]) <= tolerance:
        return []
    return (
        _adaptive_refinement(
            func,
            left,
            midpoint,
            tolerance,
            recursion,
            level + 1,
        )
        + [midpoint]
        + _adaptive_refinement(
            func,
            midpoint,
            right,
            tolerance,
            recursion,
            level + 1,
        )
    )


def adaptive_refinement(
    func: Callable[[float], Any],
    point1: Sequence[Any],
    point2: Sequence[Any],
    adaptive_tolerance: float = 0.01,
    adaptive_recursion: int = 5,
    level: int = 0,
    excluded: bool = False,
    imaginary_tolerance: float = 1e-8,
) -> Any:
    """Return adaptive samples through the strict ordinary-Python sampler."""
    sampling = __import__(
        "sagejs.plotting.curve_sampling", fromlist=["adaptive_refinement"]
    )
    return sampling.adaptive_refinement(
        func,
        point1,
        point2,
        adaptive_tolerance,
        adaptive_recursion,
        level,
        excluded=excluded,
        imaginary_tolerance=imaginary_tolerance,
    )


def generate_plot_points(
    func: Callable[[float], Any],
    xrange: Sequence[Any],
    plot_points: int = 5,
    adaptive_tolerance: float = 0.01,
    adaptive_recursion: int = 5,
    randomize: bool = True,
    initial_points: Sequence[Any] | None = None,
    excluded: bool = False,
    imaginary_tolerance: float = 1e-8,
    sample_limit: int = 1000000,
) -> Any:
    """Sample a callable through the strict segmented curve sampler."""
    sampling = __import__(
        "sagejs.plotting.curve_sampling", fromlist=["generate_plot_points"]
    )
    return sampling.generate_plot_points(
        func,
        xrange,
        plot_points,
        adaptive_tolerance,
        adaptive_recursion,
        randomize,
        initial_points,
        excluded=excluded,
        imaginary_tolerance=imaginary_tolerance,
        sample_limit=sample_limit,
    )


def _plot_range(range_args: Sequence[Any]) -> tuple[float, float]:
    if len(range_args) == 0:
        return -1.0, 1.0
    if len(range_args) == 1:
        values = list(range_args[0])
        if len(values) == 2:
            return float(values[0]), float(values[1])
        if len(values) == 3:
            return float(values[1]), float(values[2])
    if len(range_args) == 2:
        return float(range_args[0]), float(range_args[1])
    if len(range_args) == 3:
        return float(range_args[1]), float(range_args[2])
    raise TypeError("invalid plot range")


def _plot_variable(range_args: Sequence[Any]) -> Any:
    if len(range_args) == 1:
        values = list(range_args[0])
        if len(values) == 3:
            return values[0]
    if len(range_args) == 3:
        return range_args[0]
    return None


def _curve_callable(
    function_value: Any,
    variable: Any,
    imaginary_tolerance: float,
) -> tuple[Any, Any]:
    """Return a plot callable and the resolved symbolic variable."""
    resolved_variable = variable
    if runtime.jstype(function_value) == "function":
        return function_value, resolved_variable
    if resolved_variable is None and hasattr(function_value, "variables"):
        variables = list(function_value.variables())
        if len(variables) != 1:
            raise ValueError("plot() needs a variable for this symbolic expression")
        resolved_variable = variables[0]
    variable_values = [] if resolved_variable is None else [resolved_variable]
    return (
        _grid_fast_callable(
            function_value,
            variable_values,
            imaginary_tolerance,
        ),
        resolved_variable,
    )


def _curve_diagnostics(values: Sequence[Any]) -> list[Any]:
    plotting = __import__("sagejs.plotting", fromlist=["Diagnostic"])
    answer = []
    for value in values:
        get_method = runtime.reflect.get(value, "get")
        if runtime.jstype(get_method) == "function":
            code = value.get("code")
            details = value.get("details", {})
        else:
            code = _option_get(value, "code")
            details = _option_get(value, "details", {})
        answer.append(
            plotting.Diagnostic(
                str(code),
                details=details,
            ).to_dict()
        )
    return answer


def plot(
    funcs: Any,
    *range_args: Any,
    **options: Any,
) -> Any:
    r"""
    Plot a callable, symbolic expression, or list of functions on an interval.

    Both `plot(f, xmin, xmax)` and Sage's `plot(f, (x, xmin, xmax))`
    forms are accepted. Adaptive sampling produces a semantic `Graphics`
    object whose rich representation is portable Plotly data.

    ### Examples

    ```sage
    sage: g = plot(sin(x), (x, 0, 2*pi), color='navy')
    sage: len(g)
    1
    ```

    Use `show(g)` in a notebook for rich display, or `g.save(...)` on a
    host with a supported Plotly export route.
    """
    options = _copy_options(options)
    if hasattr(funcs, "plot") and not isinstance(funcs, (int, float, complex)):
        return funcs.plot(*range_args, **options)
    xmin, xmax = _plot_range(range_args)
    plot_variable = _plot_variable(range_args)
    if isinstance(funcs, (list, tuple)):
        functions = list(funcs)
    else:
        functions = [funcs]

    graphics_options = _graphics_options(options)
    curves = __import__("sagejs.plotting.sage_curves", fromlist=["plan_curve"])

    color_name = None
    colors = None
    for candidate in ("color", "rgbcolor"):
        if _option_has(options, candidate):
            color_name = candidate
            supplied_colors = _option_get(options, candidate)
            if (
                isinstance(supplied_colors, (list, tuple))
                and len(supplied_colors)
                and isinstance(supplied_colors[0], (list, tuple, str))
            ):
                colors = list(supplied_colors)
                _option_pop(options, candidate)
            break

    answer = Graphics()
    answer.set_extra_kwds(graphics_options)
    all_diagnostics = []
    sampling_context = None
    for index in range(len(functions)):
        original = functions[index]
        curve_options = _copy_options(options)
        if colors is not None and color_name is not None:
            curve_options[color_name] = colors[index % len(colors)]
        imaginary_tolerance = float(
            _option_get(curve_options, "imaginary_tolerance", 1e-8)
        )
        current, plot_variable = _curve_callable(
            original,
            plot_variable,
            imaginary_tolerance,
        )
        fill = _option_get(curve_options, "fill", False)
        fill_function = None
        if fill not in (False, None, True, "axis", "min", "max") and not isinstance(
            fill, (int, float)
        ):
            fill_function, _fill_variable = _curve_callable(
                fill,
                plot_variable,
                imaginary_tolerance,
            )
        planned = curves.plan_curve(
            current,
            (xmin, xmax),
            curve_options,
            fill_function=fill_function,
        )
        sampling_context = planned.get("sampling")
        source_intent = {
            "constructor": "plot",
            "representation": "sampled-curve-segment",
            "expression": str(original),
            "range": [xmin, xmax],
        }
        for polygon_points in planned.get("fill_polygons"):
            fill_options = _copy_options(planned.get("fill_style"))
            answer = answer + polygon(polygon_points, **fill_options)
        for segment in planned.get("segments"):
            line_options = _copy_options(planned.get("style"))
            line_options["__plot_source_intent__"] = source_intent
            answer = answer + line(segment, **line_options)
        for pole in planned.get("poles"):
            pole_options = {
                "rgbcolor": "gray",
                "linestyle": "--",
                "thickness": 1,
                "__plot_source_intent__": {
                    "constructor": "plot",
                    "representation": "detected-pole",
                    "expression": str(original),
                },
            }
            answer = answer + line(pole, **pole_options)
        all_diagnostics += planned.get("diagnostics")

    if not len(functions):
        normalized = curves.normalize_curve_options(options)
        sampling_context = normalized.get("sampling")
        all_diagnostics.append(
            {"code": "PLOT_DATA_EMPTY", "details": {"function_count": 0}}
        )

    answer.set_extra_kwds(graphics_options)
    provenance = {
        "frontend": "sagejs",
        "source_language": "sage",
        "constructor": "plot",
        "source": {"expressions": [str(value) for value in functions]},
        "ranges": [[xmin, xmax]],
        "sampling": {} if sampling_context is None else sampling_context,
    }
    return answer.with_plot_spec_context(
        provenance=provenance,
        source_intent={"frontend_constructor": "plot"},
        diagnostics=_curve_diagnostics(all_diagnostics),
    )


def parametric_plot(
    functions: Sequence[Any],
    *range_args: Any,
    **options: Any,
) -> Graphics:
    """Plot a two-component parametric plane curve."""
    components = list(functions)
    if len(components) != 2:
        raise ValueError("parametric_plot() requires exactly two components")
    minimum, maximum = _plot_range(range_args)
    variable = _plot_variable(range_args)
    count = int(_option_pop(options, "plot_points", 200))
    if count < 2:
        raise ValueError("plot_points must be at least 2")
    callables = []
    for component in components:
        current = component
        if hasattr(current, "_plot_fast_callable"):
            if variable is None:
                variables = current.variables()
                if len(variables) != 1:
                    raise ValueError("parametric_plot() needs a parameter variable")
                variable = variables[0]
            current = current._plot_fast_callable(variable)
        if callable(current):
            callables.append(current)
        else:
            numeric = float(current)

            def constant(
                _value: Any,
                constant_value: float = numeric,
            ) -> float:
                return constant_value

            callables.append(constant)
    step = (maximum - minimum) / float(count - 1)
    points = []
    for index in range(count):
        value = maximum if index == count - 1 else minimum + index * step
        points.append(
            (_finite_value(callables[0](value)), _finite_value(callables[1](value)))
        )
    return line(points, **options)


def polar_plot(
    funcs: Any,
    *range_args: Any,
    **options: Any,
) -> Graphics:
    r"""
    Plot one or more functions in polar coordinates.

    The input function gives the radius `r` as a function of angle `theta`.
    All adaptive sampling and line options accepted by `plot` are supported.
    """
    radial = plot(funcs, *range_args, **options)
    answer = Graphics()
    for primitive in radial:
        if not isinstance(primitive, Line):
            continue
        points = []
        for index in range(len(primitive.xdata)):
            theta = primitive.xdata[index]
            radius = primitive.ydata[index]
            points.append(
                (radius * runtime.math.cos(theta), radius * runtime.math.sin(theta))
            )
        primitive_options = primitive.options()
        answer = answer + line(points, **primitive_options)
    answer.set_extra_kwds(radial.get_extra_kwds())
    return answer


def contour_plot(
    function_value: Any,
    xrange: Any,
    yrange: Any,
    **options: Any,
) -> Graphics:
    """Plot a sampled scalar function as a filled contour grid."""
    options = _copy_options(options)
    plot_points = _option_pop(options, "plot_points", 50)
    xvalues, yvalues, zvalues = _sample_grid_2d(
        function_value, xrange, yrange, plot_points
    )
    defaults = {
        "fill": True,
        "colorbar": True,
        "cmap": "Viridis",
        "alpha": 1,
    }
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Contour(xvalues, yvalues, zvalues, defaults))
    return graphic


def density_plot(
    function_value: Any,
    xrange: Any,
    yrange: Any,
    **options: Any,
) -> Graphics:
    r"""Plot the values of a function of two variables as a color density."""
    options = _copy_options(options)
    plot_points = _option_pop(options, "plot_points", 25)
    xvalues, yvalues, zvalues = _sample_grid_2d(
        function_value, xrange, yrange, plot_points
    )
    defaults = {
        "cmap": "Greys",
        "interpolation": "catrom",
        "colorbar": False,
        "alpha": 1,
    }
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Density(xvalues, yvalues, zvalues, defaults))
    return graphic


def complex_plot(
    function_value: Any,
    x_range: Any,
    y_range: Any,
    contoured: bool = False,
    tiled: bool = False,
    cmap: Any = None,
    contour_type: str = "logarithmic",
    contour_base: Any = None,
    dark_rate: float = 0.5,
    nphases: int = 10,
    **options: Any,
) -> Graphics:
    r"""
    Plot a complex function using Sage's domain-coloring convention.

    Function argument is represented by hue and magnitude by lightness.
    `contoured=True` adds magnitude contours; `tiled=True` also adds evenly
    spaced phase contours.

    ### Examples

    ```sage
    sage: complex_plot(lambda z: z^5 + z - 1 + 1/z,
    ....:              (-3, 3), (-3, 3))
    Graphics object consisting of 1 graphics primitive
    ```
    """
    xmin, xmax = _plot_range(x_range)
    ymin, ymax = _plot_range(y_range)
    plot_points = _option_pop(options, "plot_points", 100)
    counts = _grid_counts_2d(plot_points, 100)
    xstep = (xmax - xmin) / float(counts[0] - 1)
    ystep = (ymax - ymin) / float(counts[1] - 1)
    xvalues = [
        xmax if index == counts[0] - 1 else xmin + index * xstep
        for index in range(counts[0])
    ]
    yvalues = [
        ymax if index == counts[1] - 1 else ymin + index * ystep
        for index in range(counts[1])
    ]

    variables = []
    if hasattr(function_value, "variables"):
        variables = list(function_value.variables())
        if len(variables) > 1:
            raise ValueError("complex_plot function must have at most one variable")
    cdf_function = runtime.reflect.get(runtime.global_object, "CDF")
    coordinate_evaluator = None

    def missing_evaluator(_value: Any) -> Any:
        raise RuntimeError("complex plot evaluator was not initialized")

    evaluator = missing_evaluator
    if hasattr(function_value, "_plot_complex_callable"):
        coordinate_evaluator = function_value._plot_complex_callable(variables)
    elif hasattr(function_value, "_tree"):
        expression_tree = function_value._tree
        variable_name = "" if len(variables) == 0 else str(variables[0])

        def symbolic_evaluator(value: Any) -> Any:
            return _complex_tree_evaluate(
                expression_tree, variable_name, value, cdf_function
            )

        evaluator = symbolic_evaluator
    elif callable(function_value):
        evaluator = function_value
    else:

        def constant_evaluator(_value: Any) -> Any:
            return function_value

        evaluator = constant_evaluator

    sampled = []
    for yvalue in yvalues:
        row = []
        for xvalue in xvalues:
            try:
                if coordinate_evaluator is not None:
                    row.append(coordinate_evaluator(xvalue, yvalue))
                else:
                    argument = runtime.reflect.apply(
                        cdf_function,
                        runtime.undefined,
                        [xvalue, yvalue],
                    )
                    row.append(evaluator(argument))
            except Exception:
                row.append(None)
        sampled.append(row)
    if cmap is None:
        rgb_data = complex_to_rgb(
            sampled,
            contoured=contoured,
            tiled=tiled,
            contour_type=contour_type,
            contour_base=contour_base,
            dark_rate=dark_rate,
            nphases=nphases,
        )
    else:
        rgb_data = complex_to_cmap_rgb(
            sampled,
            cmap=cmap,
            contoured=contoured,
            tiled=tiled,
            contour_type=contour_type,
            contour_base=contour_base,
            dark_rate=dark_rate,
            nphases=nphases,
        )

    options = _copy_options(options)
    defaults = {
        "interpolation": "catrom",
        "alpha": 1,
        "aspect_ratio": 1,
    }
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    graphics_options["xmin"] = xmin
    graphics_options["xmax"] = xmax
    graphics_options["ymin"] = ymin
    graphics_options["ymax"] = ymax
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(ComplexPlot(rgb_data, (xmin, xmax), (ymin, ymax), defaults))
    return graphic


def implicit_plot(
    function_value: Any,
    xrange: Any,
    yrange: Any,
    **options: Any,
) -> Graphics:
    r"""
    Plot the plane curve where a function is zero or an equality holds.
    """
    if hasattr(function_value, "_plot_zero_set_expression"):
        function_value = function_value._plot_zero_set_expression()
    options = _copy_options(options)
    options["contours"] = [0]
    options["colorbar"] = False
    if not _option_has(options, "fill"):
        options["fill"] = False
    if _option_has(options, "fillcolor") and not _option_has(options, "cmap"):
        fillcolor = _option_get(options, "fillcolor")
        options["cmap"] = [fillcolor, fillcolor]
    return contour_plot(function_value, xrange, yrange, **options)


def region_plot(
    functions: Any,
    xrange: Any,
    yrange: Any,
    **options: Any,
) -> Graphics:
    r"""Plot the region where one or more boolean functions are true."""
    options = _copy_options(options)
    plot_points = _option_pop(options, "plot_points", 100)
    xminimum, xmaximum = _plot_range([xrange])
    yminimum, ymaximum = _plot_range([yrange])
    xvariable = _plot_variable([xrange])
    yvariable = _plot_variable([yrange])
    if isinstance(functions, (list, tuple)):
        function_values = list(functions)
    else:
        function_values = [functions]
    callables = [
        _plot_callable_2d(value, xvariable, yvariable) for value in function_values
    ]
    xcount, ycount = _grid_counts_2d(plot_points, 100)
    xstep = (xmaximum - xminimum) / float(xcount - 1)
    ystep = (ymaximum - yminimum) / float(ycount - 1)
    xvalues = [
        xmaximum if index == xcount - 1 else xminimum + index * xstep
        for index in range(xcount)
    ]
    yvalues = [
        ymaximum if index == ycount - 1 else yminimum + index * ystep
        for index in range(ycount)
    ]
    zvalues = []
    for yvalue in yvalues:
        row = []
        for xvalue in xvalues:
            inside = True
            for current in callables:
                if not bool(current(xvalue, yvalue)):
                    inside = False
                    break
            row.append(1.0 if inside else 0.0)
        zvalues.append(row)
    incolor = _option_pop(options, "incol", "blue")
    outcolor = _option_pop(options, "outcol", "rgba(0,0,0,0)")
    if outcolor is None:
        outcolor = "rgba(0,0,0,0)"
    defaults = {
        "colorscale": [
            [0, _color_value(outcolor)],
            [0.499999, _color_value(outcolor)],
            [0.5, _color_value(incolor)],
            [1, _color_value(incolor)],
        ],
        "interpolation": "nearest",
        "colorbar": False,
        "alpha": 1,
        "aspect_ratio": 1,
    }
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Density(xvalues, yvalues, zvalues, defaults))
    return graphic


def matrix_plot(
    matrix_value: Any,
    xrange: Any = None,
    yrange: Any = None,
    **options: Any,
) -> Graphics:
    r"""Plot a matrix or rectangular array as a color-valued grid."""
    if hasattr(matrix_value, "nrows") and hasattr(matrix_value, "ncols"):
        row_count = int(matrix_value.nrows())
        column_count = int(matrix_value.ncols())
        values = [
            [float(matrix_value[row, column]) for column in range(column_count)]
            for row in range(row_count)
        ]
    else:
        values = [[float(value) for value in row] for row in matrix_value]
        row_count = len(values)
        column_count = 0 if row_count == 0 else len(values[0])
    if xrange is None:
        xvalues = [float(index) for index in range(column_count)]
    else:
        xmin, xmax = _plot_range([xrange])
        xvalues = [
            xmin + (xmax - xmin) * index / max(1, column_count - 1)
            for index in range(column_count)
        ]
    if yrange is None:
        yvalues = [float(index) for index in range(row_count)]
    else:
        ymin, ymax = _plot_range([yrange])
        yvalues = [
            ymin + (ymax - ymin) * index / max(1, row_count - 1)
            for index in range(row_count)
        ]
    defaults = {
        "cmap": "Greys",
        "colorbar": False,
        "interpolation": "nearest",
        "axes": False,
        "frame": True,
        "flip_y": True,
        "ticks_integer": True,
        "aspect_ratio": 1,
    }
    _option_update(defaults, _copy_options(options))
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Density(xvalues, yvalues, values, defaults))
    return graphic


def plot_vector_field(
    functions: Any,
    xrange: Any,
    yrange: Any,
    **options: Any,
) -> Graphics:
    r"""
    Plot a two-dimensional vector field on a rectangular sample grid.

    The two components may be symbolic expressions or callables.  Invalid
    values are omitted, matching Sage's masked-vector behavior.
    """
    defaults = {
        "plot_points": 20,
        "frame": True,
        "pivot": "tail",
        "headwidth": 3,
        "headlength": 5,
        "headaxislength": 4.5,
        "color": "blue",
        "alpha": 1,
    }
    _option_update(defaults, _copy_options(options))
    plot_points = _option_get(defaults, "plot_points", 20)
    sampled = _sample_vector_grid_2d(functions, xrange, yrange, plot_points)
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        PlotField(
            sampled[0],
            sampled[1],
            sampled[2],
            sampled[3],
            sampled[4],
            defaults,
        )
    )
    return graphic


def plot_slope_field(
    function_value: Any,
    xrange: Any,
    yrange: Any,
    **options: Any,
) -> Graphics:
    r"""
    Plot short normalized line segments with slope `function_value`.
    """
    xvariable = _plot_variable([xrange])
    yvariable = _plot_variable([yrange])
    slope = _plot_callable_2d(function_value, xvariable, yvariable)

    def horizontal(xvalue: Any, yvalue: Any) -> float:
        current = float(slope(xvalue, yvalue))
        return 1.0 / runtime.math.sqrt(current * current + 1.0)

    def vertical(xvalue: Any, yvalue: Any) -> float:
        current = float(slope(xvalue, yvalue))
        return current / runtime.math.sqrt(current * current + 1.0)

    slope_options = {
        "headaxislength": 0,
        "headlength": 1e-9,
        "pivot": "middle",
    }
    _option_update(slope_options, _copy_options(options))
    return plot_vector_field((horizontal, vertical), xrange, yrange, **slope_options)


def streamline_plot(
    functions: Any,
    xrange: Any,
    yrange: Any,
    **options: Any,
) -> Graphics:
    r"""
    Plot integral curves of a vector field or first-order slope field.

    Streamlines are integrated in both directions with a deterministic
    midpoint method.  `density` controls seed count and integration step;
    `start_points` supplies explicit seeds.
    """
    defaults = {
        "plot_points": 20,
        "density": 1.0,
        "frame": True,
        "color": "blue",
        "alpha": 1,
    }
    _option_update(defaults, _copy_options(options))
    plot_points = _option_get(defaults, "plot_points", 20)
    xcount, ycount = _grid_counts_2d(plot_points, 20)
    xmin, xmax = _plot_range([xrange])
    ymin, ymax = _plot_range([yrange])
    xvariable = _plot_variable([xrange])
    yvariable = _plot_variable([yrange])
    xfunction, yfunction = _stream_vector_callables(functions, xvariable, yvariable)
    xstep = (xmax - xmin) / float(xcount - 1)
    ystep = (ymax - ymin) / float(ycount - 1)
    xpos_array = [
        xmax if index == xcount - 1 else xmin + index * xstep for index in range(xcount)
    ]
    ypos_array = [
        ymax if index == ycount - 1 else ymin + index * ystep for index in range(ycount)
    ]
    xvec_array = []
    yvec_array = []
    for yvalue in ypos_array:
        xrow = []
        yrow = []
        for xvalue in xpos_array:
            try:
                xvector = _finite_or_none(xfunction(xvalue, yvalue))
            except Exception:
                xvector = None
            try:
                yvector = _finite_or_none(yfunction(xvalue, yvalue))
            except Exception:
                yvector = None
            if xvector is None or yvector is None:
                xvector = None
                yvector = None
            xrow.append(xvector)
            yrow.append(yvector)
        xvec_array.append(xrow)
        yvec_array.append(yrow)

    density = _option_get(defaults, "density", 1.0)
    if isinstance(density, (list, tuple)):
        if len(density) != 2:
            raise ValueError("density must be a number or a pair")
        xdensity = float(density[0])
        ydensity = float(density[1])
    else:
        xdensity = float(density)
        ydensity = float(density)
    if xdensity <= 0 or ydensity <= 0:
        raise ValueError("density must be positive")
    start_points = _option_get(defaults, "start_points")
    seeds = []
    if start_points is not None:
        seeds = [_point_pair(point_value) for point_value in start_points]
    else:
        xseed_count = max(2, int(6 * xdensity + 0.5))
        yseed_count = max(2, int(6 * ydensity + 0.5))
        for index in range(xseed_count):
            coordinate = xmin + ((xmax - xmin) * index / float(xseed_count - 1))
            seeds.append(runtime.math_tuple([coordinate, ymin]))
            seeds.append(runtime.math_tuple([coordinate, ymax]))
        for index in range(1, yseed_count - 1):
            coordinate = ymin + ((ymax - ymin) * index / float(yseed_count - 1))
            seeds.append(runtime.math_tuple([xmin, coordinate]))
            seeds.append(runtime.math_tuple([xmax, coordinate]))

    integration_density = max(xdensity, ydensity)
    step = 0.35 * min(abs(xstep), abs(ystep)) / integration_density
    maximum_steps = int(8 * (xcount + ycount) * integration_density)
    bounds = runtime.math_tuple([xmin, xmax, ymin, ymax])
    paths = []
    for seed in seeds:
        if seed[0] < xmin or seed[0] > xmax or seed[1] < ymin or seed[1] > ymax:
            raise ValueError("start_points must lie inside the plot ranges")
        backward = _integrate_streamline_direction(
            seed, -1.0, xfunction, yfunction, bounds, step, maximum_steps
        )
        forward = _integrate_streamline_direction(
            seed, 1.0, xfunction, yfunction, bounds, step, maximum_steps
        )
        path = list(reversed(backward))
        path.append(runtime.math_tuple([seed[0], seed[1]]))
        path.extend(forward)
        if len(path) > 1:
            paths.append(path)

    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        StreamlinePlot(xpos_array, ypos_array, xvec_array, yvec_array, paths, defaults)
    )
    return graphic


def show(
    value: Any,
    *others: Any,
    **options: Any,
) -> Any:
    r"""
    Return `value` for rich display, combining graphics when requested.

    Multiple graphics are added before display.  Notebook kernels render the
    returned semantic object using Plotly-compatible HTML/data, without
    requiring a Jupyter extension.
    """

    answer = value
    for other in others:
        answer = answer + other
    if len(options) and hasattr(answer, "set_extra_kwds"):
        answer.set_extra_kwds(options)
    return answer


def list_plot(
    data: Any,
    plotjoined: bool = False,
    **options: Any,
) -> Graphics:
    """Plot a sequence of y-values or a sequence of `(x, y)` pairs."""
    options = _copy_options(options)
    values = list(data)
    if len(values) == 0:
        return Graphics()
    if isinstance(values[0], (list, tuple)):
        points = [_point_pair(value) for value in values]
    else:
        points = [(float(index), float(values[index])) for index in range(len(values))]
    if plotjoined:
        return line(points, **options)
    return point(points, **options)


def plot_step_function(
    values: Any,
    vertical_lines: bool = True,
    **options: Any,
) -> Graphics:
    r"""Plot the step function defined by a sequence of `(x, y)` pairs."""
    points = sorted([_point_pair(value) for value in values])
    if len(points) <= 1:
        return line([], **options)
    if vertical_lines:
        path = []
        for index in range(len(points)):
            path.append(points[index])
            if index + 1 < len(points):
                path.append((points[index + 1][0], points[index][1]))
        return line(path, **options)
    answer = Graphics()
    for index in range(len(points) - 1):
        answer = answer + line(
            [points[index], (points[index + 1][0], points[index][1])],
            **options,
        )
    return answer


def plot_loglog(
    funcs: Any,
    *range_args: Any,
    **options: Any,
) -> Graphics:
    """Plot functions with logarithmic horizontal and vertical axes."""
    options["scale"] = "loglog"
    return plot(funcs, *range_args, **options)


def plot_semilogx(
    funcs: Any,
    *range_args: Any,
    **options: Any,
) -> Graphics:
    """Plot functions with a logarithmic horizontal axis."""
    options["scale"] = "semilogx"
    return plot(funcs, *range_args, **options)


def plot_semilogy(
    funcs: Any,
    *range_args: Any,
    **options: Any,
) -> Graphics:
    """Plot functions with a logarithmic vertical axis."""
    options["scale"] = "semilogy"
    return plot(funcs, *range_args, **options)


def list_plot_loglog(
    data: Any,
    plotjoined: bool = False,
    **options: Any,
) -> Graphics:
    """Plot list data with logarithmic horizontal and vertical axes."""
    options["scale"] = "loglog"
    return list_plot(data, plotjoined=plotjoined, **options)


def list_plot_semilogx(
    data: Any,
    plotjoined: bool = False,
    **options: Any,
) -> Graphics:
    """Plot list data with a logarithmic horizontal axis."""
    options["scale"] = "semilogx"
    return list_plot(data, plotjoined=plotjoined, **options)


def list_plot_semilogy(
    data: Any,
    plotjoined: bool = False,
    **options: Any,
) -> Graphics:
    """Plot list data with a logarithmic vertical axis."""
    options["scale"] = "semilogy"
    return list_plot(data, plotjoined=plotjoined, **options)


line2d = line
arrow2d = arrow
point2d = point
polygon2d = polygon


def _graphics_doc(
    tags: list[str],
    compatibility_notes: str,
    limitations: Any = None,
) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ["graphics", "plotting"],
        [tags],
    )
    return {
        "kind": "function",
        "module": "sage.plot",
        "tags": all_tags,
        "backends": ["Plotly", "Sage.js adaptive sampler"],
        "sage_compatibility": {
            "status": "partial",
            "notes": compatibility_notes,
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath plotting API and object model",
                "url": ("https://doc.sagemath.org/html/en/reference/plotting/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "Plotly.js",
                "url": "https://plotly.com/javascript/",
            },
        ],
        "references": [
            {
                "id": "plotly-js",
                "type": "software",
                "title": "Plotly JavaScript Open Source Graphing Library",
                "url": "https://plotly.com/javascript/",
            },
        ],
        "implementation": {
            "algorithm": ("Sage-compatible semantic graphics with Plotly rendering"),
        },
        "limitations": [] if limitations is None else limitations,
    }


runtime.register_doc(
    "plot",
    plot,
    _graphics_doc(
        ["2D graphics", "adaptive sampling"],
        (
            "Core Sage call forms and common options are supported; the "
            "complete Sage plotting option and primitive catalog is larger."
        ),
    ),
)
runtime.register_doc(
    "show",
    show,
    _graphics_doc(
        ["rich display", "Jupyter"],
        (
            "Sage-style graphics composition is supported; display routing "
            "uses portable Plotly MIME/HTML rather than a Sage frontend."
        ),
    ),
)
runtime.register_doc(
    "Color",
    Color,
    _graphics_doc(
        ["2D graphics", "3D graphics", "colors"],
        (
            "Sage RGB, HSV, HLS, and HSL construction and conversion are "
            "supported with portable CSS color output."
        ),
    ),
)

for _doc_name, _doc_function, _doc_tags in [
    ("line", line, ["2D graphics", "lines"]),
    ("line2d", line2d, ["2D graphics", "lines"]),
    ("arrow", arrow, ["2D graphics", "arrows"]),
    ("arrow2d", arrow2d, ["2D graphics", "arrows"]),
    ("point", point, ["2D graphics", "points"]),
    ("points", points, ["2D graphics", "points"]),
    ("point2d", point2d, ["2D graphics", "points"]),
    ("polygon", polygon, ["2D graphics", "polygons"]),
    ("polygon2d", polygon2d, ["2D graphics", "polygons"]),
    ("circle", circle, ["2D graphics", "circles"]),
    ("ellipse", ellipse, ["2D graphics", "ellipses"]),
    ("arc", arc, ["2D graphics", "ellipses"]),
    ("disk", disk, ["2D graphics", "regions"]),
    ("bezier_path", bezier_path, ["2D graphics", "curves"]),
    ("text", text, ["2D graphics", "labels"]),
    ("bar_chart", bar_chart, ["2D graphics", "charts"]),
    ("histogram", histogram, ["2D graphics", "statistics"]),
    ("scatter_plot", scatter_plot, ["2D graphics", "statistics"]),
    ("list_plot", list_plot, ["2D graphics", "data"]),
    ("parametric_plot", parametric_plot, ["2D graphics", "parametric"]),
    ("polar_plot", polar_plot, ["2D graphics", "polar coordinates"]),
    ("contour_plot", contour_plot, ["2D graphics", "contours"]),
    ("density_plot", density_plot, ["2D graphics", "scalar fields"]),
    (
        "complex_plot",
        complex_plot,
        ["2D graphics", "complex analysis", "domain coloring"],
    ),
    (
        "complex_to_rgb",
        complex_to_rgb,
        ["2D graphics", "complex analysis", "domain coloring"],
    ),
    (
        "complex_to_cmap_rgb",
        complex_to_cmap_rgb,
        ["2D graphics", "complex analysis", "domain coloring", "colormaps"],
    ),
    ("implicit_plot", implicit_plot, ["2D graphics", "implicit curves"]),
    ("region_plot", region_plot, ["2D graphics", "regions"]),
    ("matrix_plot", matrix_plot, ["2D graphics", "matrices"]),
    ("plot_vector_field", plot_vector_field, ["2D graphics", "vector fields"]),
    ("plot_slope_field", plot_slope_field, ["2D graphics", "differential equations"]),
    (
        "streamline_plot",
        streamline_plot,
        ["2D graphics", "vector fields", "differential equations"],
    ),
    ("plot_step_function", plot_step_function, ["2D graphics", "data"]),
    ("plot_loglog", plot_loglog, ["2D graphics", "logarithmic axes"]),
    ("plot_semilogx", plot_semilogx, ["2D graphics", "logarithmic axes"]),
    ("plot_semilogy", plot_semilogy, ["2D graphics", "logarithmic axes"]),
    ("list_plot_loglog", list_plot_loglog, ["2D graphics", "logarithmic axes"]),
    ("list_plot_semilogx", list_plot_semilogx, ["2D graphics", "logarithmic axes"]),
    ("list_plot_semilogy", list_plot_semilogy, ["2D graphics", "logarithmic axes"]),
    ("multi_graphics", multi_graphics, ["2D graphics", "composition", "insets"]),
    ("graphics_array", graphics_array, ["2D graphics", "composition"]),
    ("animate", animate, ["2D graphics", "3D graphics", "animation"]),
    ("hyperbolic_arc", hyperbolic_arc, ["2D graphics", "hyperbolic geometry"]),
    ("hyperbolic_polygon", hyperbolic_polygon, ["2D graphics", "hyperbolic geometry"]),
    (
        "hyperbolic_triangle",
        hyperbolic_triangle,
        ["2D graphics", "hyperbolic geometry"],
    ),
    (
        "hyperbolic_regular_polygon",
        hyperbolic_regular_polygon,
        ["2D graphics", "hyperbolic geometry"],
    ),
    ("rgbcolor", rgbcolor, ["2D graphics", "colors"]),
    ("hue", hue, ["2D graphics", "colors"]),
    ("rainbow", rainbow, ["2D graphics", "colors"]),
]:
    runtime.register_doc(
        _doc_name,
        _doc_function,
        _graphics_doc(
            _doc_tags,
            (
                "The Sage call form and core rendering semantics are "
                "supported; remaining specialized options are tracked by "
                "the graphics compatibility corpus."
            ),
        ),
    )
