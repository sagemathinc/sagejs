"""Semantic PlotSpec layers for sampled scalar and vector fields.

This module owns a small Plotly-native lowering boundary for field layers.  It
does not mutate `Graphics` and can therefore be integrated incrementally: the
central PlotSpec lowerer only needs to delegate the six layer kinds listed in
`FIELD_LAYER_KINDS` to `lower_field_layer`.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from typing import Any, cast

from ._json import JSONValue, materialize_object
from .diagnostics import Diagnostic
from .grid_sampling import (
    MAX_GRID_SAMPLES,
    deterministic_levels,
    sample_scalar_grid,
    sample_vector_grid,
)
from .model import PlotLayer, PlotSpec, Provenance, make_layer
from .styles import (
    OptionResult,
    normalize_color,
    normalize_line_dash,
    normalize_line_width,
    normalize_opacity,
)

FIELD_LAYER_KINDS = (
    "contour-field",
    "density-field",
    "implicit-field",
    "region-field",
    "vector-field",
    "slope-field",
)

_COLORSCALES: dict[str, str] = {
    "cividis": "Cividis",
    "gray": "Greys",
    "grey": "Greys",
    "grayscale": "Greys",
    "hsv": "HSV",
    "inferno": "Inferno",
    "jet": "Jet",
    "magma": "Magma",
    "plasma": "Plasma",
    "rainbow": "Rainbow",
    "rdbu": "RdBu",
    "viridis": "Viridis",
    "winter": "ice",
}


def _option_records(values: Sequence[OptionResult]) -> list[dict[str, JSONValue]]:
    return [value.to_dict() for value in values]


def _unsupported(option: str, value: Any, message: str) -> OptionResult:
    return OptionResult(option, "unsupported", value, None, message)


def _supported(option: str, value: Any, normalized: Any = None) -> OptionResult:
    if normalized is None:
        normalized = value
    return OptionResult(option, "supported", value, normalized)


def _translated(option: str, value: Any, normalized: Any, message: str) -> OptionResult:
    return OptionResult(option, "translated", value, normalized, message)


def _colorscale(value: Any) -> OptionResult:
    if isinstance(value, str):
        normalized = _COLORSCALES.get(value.strip().lower())
        if normalized is None:
            return _unsupported(
                "cmap",
                value,
                "Unsupported color map; use one of " + ", ".join(sorted(_COLORSCALES)),
            )
        if normalized == value:
            return _supported("cmap", value, normalized)
        return _translated(
            "cmap",
            value,
            normalized,
            "Sage color map name translated to the corresponding Plotly color scale.",
        )
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        source = list(value)
        if len(source) < 2:
            return _unsupported(
                "cmap", value, "A color scale needs at least two colors."
            )
        colors: list[str] = []
        translated = False
        for index, color in enumerate(source):
            result = normalize_color(color, "cmap[" + str(index) + "]")
            if result.status == "unsupported" or not isinstance(result.value, str):
                return _unsupported(
                    "cmap", value, "Every color scale entry must be a supported color."
                )
            colors.append(result.value)
            translated = translated or result.status == "translated"
        scale: list[list[JSONValue]] = []
        for index, color in enumerate(colors):
            scale.append([index / (len(colors) - 1), color])
        if translated:
            return _translated(
                "cmap",
                value,
                scale,
                "Sage colors were normalized to a Plotly piecewise color scale.",
            )
        return _supported("cmap", value, scale)
    return _unsupported("cmap", value, "cmap must be a known name or a color sequence.")


def _bool_result(option: str, value: Any) -> OptionResult:
    if isinstance(value, bool):
        return _supported(option, value)
    return _unsupported(option, value, option + " must be a bool.")


def _positive_number(option: str, value: Any) -> OptionResult:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return _unsupported(option, value, option + " must be a positive number.")
    numeric = float(value)
    if not math.isfinite(numeric) or numeric <= 0:
        return _unsupported(
            option, value, option + " must be a positive finite number."
        )
    return _supported(option, value, numeric)


def _option_status(results: Sequence[OptionResult]) -> str:
    status = "supported"
    for result in results:
        if result.status == "unsupported":
            return "unsupported"
        if result.status == "translated":
            status = "translated"
    return status


def _reject_unsupported(results: Sequence[OptionResult]) -> None:
    messages: list[str] = []
    for result in results:
        if result.status != "unsupported":
            continue
        record = result.to_dict()
        message = record.get("message")
        messages.append(str(message) if message is not None else result.option)
    if messages:
        raise NotImplementedError("; ".join(messages))


def _unknown_options(
    options: Mapping[str, Any], allowed: Sequence[str]
) -> list[OptionResult]:
    allowed_names = set(allowed)
    results: list[OptionResult] = []
    for name in sorted(options):
        if name not in allowed_names:
            results.append(
                _unsupported(
                    name,
                    options[name],
                    "Plot option '" + name + "' has no field-layer representation.",
                )
            )
    return results


def _classify_remaining_inputs(
    source: Mapping[str, Any], results: list[OptionResult]
) -> None:
    classified = {result.option for result in results}
    for name in sorted(source):
        if name in classified:
            continue
        value = source[name]
        normalized: Any = value
        if callable(value):
            normalized = "<callable>"
        results.append(_supported(name, value, normalized))


def normalize_scalar_field_options(
    kind: str,
    options: Mapping[str, Any] | None = None,
    *,
    reject_unsupported: bool = True,
) -> dict[str, Any]:
    """Normalize scalar-field options and classify every supplied key."""
    if not isinstance(reject_unsupported, bool):
        raise TypeError("reject_unsupported must be a bool")
    if kind not in ("contour", "density", "implicit", "region"):
        raise ValueError("unknown scalar field kind: " + kind)
    source = {} if options is None else dict(options)
    working = dict(source)
    results: list[OptionResult] = []
    if kind == "implicit":
        for alias, target in (
            ("color", "cmap"),
            ("linewidth", "linewidths"),
            ("linestyle", "linestyles"),
        ):
            if alias not in working:
                continue
            if target in working:
                results.append(
                    _unsupported(
                        alias,
                        working[alias],
                        "Do not specify both '" + alias + "' and '" + target + "'.",
                    )
                )
                continue
            alias_value = working.pop(alias)
            target_value = (
                [alias_value, alias_value] if alias == "color" else alias_value
            )
            working[target] = target_value
            results.append(
                _translated(
                    alias,
                    alias_value,
                    target_value,
                    "Sage implicit-plot alias translated to '" + target + "'.",
                )
            )
    defaults: dict[str, dict[str, Any]] = {
        "contour": {
            "plot_points": 100,
            "max_samples": MAX_GRID_SAMPLES,
            "fill": True,
            "contours": None,
            "cmap": "gray",
            "colorbar": False,
            "labels": False,
            "linewidths": 1,
            "linestyles": "solid",
            "legend_label": None,
            "frame": True,
            "axes": False,
            "aspect_ratio": 1,
            "region": None,
        },
        "density": {
            "plot_points": 25,
            "max_samples": MAX_GRID_SAMPLES,
            "cmap": "gray",
            "interpolation": "catrom",
            "colorbar": False,
            "legend_label": None,
            "frame": True,
            "axes": False,
            "aspect_ratio": "automatic",
        },
        "implicit": {
            "plot_points": 150,
            "max_samples": MAX_GRID_SAMPLES,
            "fill": False,
            "cmap": ["blue", "blue"],
            "colorbar": False,
            "linewidths": 1,
            "linestyles": "solid",
            "legend_label": None,
            "frame": True,
            "axes": False,
            "aspect_ratio": 1,
        },
        "region": {
            "plot_points": 100,
            "max_samples": MAX_GRID_SAMPLES,
            "incol": "blue",
            "outcol": None,
            "bordercol": None,
            "borderstyle": "solid",
            "borderwidth": 1,
            "alpha": 1,
            "legend_label": None,
            "frame": False,
            "axes": True,
            "aspect_ratio": 1,
        },
    }
    values = dict(defaults[kind])
    results.extend(_unknown_options(working, tuple(values)))
    for name in values:
        if name in working:
            values[name] = working[name]
    if kind in ("contour", "implicit", "density"):
        cmap = _colorscale(values["cmap"])
        values["colorscale"] = cmap.value
        results.append(cmap)
    if kind in ("contour", "implicit"):
        fill = _bool_result("fill", values["fill"])
        colorbar = _bool_result("colorbar", values["colorbar"])
        width = normalize_line_width(values["linewidths"], "linewidths")
        dash = normalize_line_dash(values["linestyles"], "linestyles")
        values["fill"] = fill.value
        values["colorbar"] = colorbar.value
        values["line_width"] = width.value
        values["line_dash"] = dash.value
        results.extend((fill, colorbar, width, dash))
        if kind == "contour":
            labels = _bool_result("labels", values["labels"])
            values["labels"] = labels.value
            results.append(labels)
        if kind == "contour" and values["region"] is not None:
            results.append(
                _unsupported(
                    "region",
                    values["region"],
                    "The contour_plot region mask is not in this bounded slice; compose with region_plot instead.",
                )
            )
    if kind == "density":
        interpolation = values["interpolation"]
        interpolation_map: dict[str, JSONValue] = {
            "catrom": "best",
            "nearest": False,
            "bilinear": "fast",
        }
        if interpolation in interpolation_map:
            values["zsmooth"] = interpolation_map[interpolation]
            results.append(
                _translated(
                    "interpolation",
                    interpolation,
                    values["zsmooth"],
                    "Matplotlib interpolation translated to Plotly heatmap smoothing.",
                )
            )
        else:
            results.append(
                _unsupported(
                    "interpolation",
                    interpolation,
                    "Supported density interpolation values are catrom, nearest, and bilinear.",
                )
            )
        colorbar = _bool_result("colorbar", values["colorbar"])
        values["colorbar"] = colorbar.value
        results.append(colorbar)
    if kind == "region":
        for name in ("incol", "bordercol"):
            color_value = values[name]
            if color_value is None and name == "bordercol":
                results.append(_supported(name, None))
                continue
            result = normalize_color(color_value, name)
            values[name] = result.value
            results.append(result)
        out_value = values["outcol"]
        if out_value is None:
            values["outcol"] = "rgba(0,0,0,0)"
            results.append(_supported("outcol", None, values["outcol"]))
        else:
            out_result = normalize_color(out_value, "outcol")
            values["outcol"] = out_result.value
            results.append(out_result)
        opacity = normalize_opacity(values["alpha"], "alpha")
        width = normalize_line_width(values["borderwidth"], "borderwidth")
        dash = normalize_line_dash(values["borderstyle"], "borderstyle")
        values["alpha"] = opacity.value
        values["borderwidth"] = width.value
        values["borderstyle"] = dash.value
        results.extend((opacity, width, dash))
    for name in ("frame", "axes"):
        if name in values:
            result = _bool_result(name, values[name])
            values[name] = result.value
            if result.status == "supported":
                result = _translated(
                    name,
                    values[name],
                    values[name],
                    "Sage frame/axes intent translated to Plotly ticks and zero lines.",
                )
            results.append(result)
    aspect = values.get("aspect_ratio")
    if aspect not in (1, "automatic"):
        results.append(
            _unsupported(
                "aspect_ratio",
                aspect,
                "Field aspect_ratio supports 1 or 'automatic'.",
            )
        )
    elif "aspect_ratio" in source:
        results.append(_supported("aspect_ratio", aspect))
    _classify_remaining_inputs(source, results)
    if reject_unsupported:
        _reject_unsupported(results)
    return {
        "status": _option_status(results),
        "value": values,
        "options": _option_records(results),
    }


def normalize_vector_field_options(
    options: Mapping[str, Any] | None = None,
    *,
    slope: bool = False,
    reject_unsupported: bool = True,
) -> dict[str, Any]:
    """Normalize the bounded Plotly vector-field style and sampling options."""
    if not isinstance(reject_unsupported, bool):
        raise TypeError("reject_unsupported must be a bool")
    source = {} if options is None else dict(options)
    values: dict[str, Any] = {
        "plot_points": 20,
        "max_samples": MAX_GRID_SAMPLES,
        "color": "blue",
        "width": 1,
        "pivot": "middle" if slope else "tail",
        "scale": 0.8,
        "headlength": 1e-9 if slope else 0.25,
        "headwidth": 0 if slope else 0.18,
        "frame": True,
        "legend_label": None,
    }
    results = _unknown_options(source, tuple(values))
    for name in values:
        if name in source:
            values[name] = source[name]
    color = normalize_color(values["color"], "color")
    width = normalize_line_width(values["width"], "width")
    scale = _positive_number("scale", values["scale"])
    head_length = _positive_number("headlength", values["headlength"])
    if slope and values["headwidth"] == 0:
        head_width = _supported("headwidth", 0, 0.0)
    else:
        head_width = _positive_number("headwidth", values["headwidth"])
    frame = _bool_result("frame", values["frame"])
    if frame.status == "supported":
        frame = _translated(
            "frame",
            values["frame"],
            values["frame"],
            "Sage frame intent translated to Plotly Cartesian ticks.",
        )
    pivot = values["pivot"]
    if pivot not in ("tail", "middle", "tip"):
        pivot_result = _unsupported(
            "pivot", pivot, "pivot must be tail, middle, or tip."
        )
    else:
        pivot_result = _supported("pivot", pivot)
    values.update(
        {
            "color": color.value,
            "width": width.value,
            "scale": scale.value,
            "headlength": head_length.value,
            "headwidth": head_width.value,
            "frame": frame.value,
        }
    )
    results.extend((color, width, scale, head_length, head_width, frame, pivot_result))
    results.append(
        _translated(
            "renderer",
            "matplotlib.quiver",
            "plotly.scatter-arrow-segments",
            "Quiver arrows are materialized as deterministic Plotly line segments.",
        )
    )
    _classify_remaining_inputs(source, results)
    if reject_unsupported:
        _reject_unsupported(results)
    return {
        "status": _option_status(results),
        "value": values,
        "options": _option_records(results),
    }


def _source_name(function: Any) -> str:
    name = getattr(function, "__name__", None)
    if isinstance(name, str) and name:
        return name
    return "callable"


def _metadata(
    sampled: Mapping[str, Any],
    decisions: Mapping[str, Any],
    presentation: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "bounds": sampled["ranges"],
        "resource": {"sample_count": sampled["sample_count"]},
        "sampling": sampled["sampling"],
        "style_decisions": decisions,
        "presentation": dict(presentation),
    }


def _scalar_style(kind: str, values: Mapping[str, Any]) -> dict[str, Any]:
    if kind == "density":
        return {
            "colorscale": values["colorscale"],
            "colorbar": values["colorbar"],
            "zsmooth": values["zsmooth"],
        }
    if kind == "region":
        return {
            "incol": values["incol"],
            "outcol": values["outcol"],
            "bordercol": values["bordercol"],
            "borderstyle": values["borderstyle"],
            "borderwidth": values["borderwidth"],
            "alpha": values["alpha"],
        }
    return {
        "colorscale": values["colorscale"],
        "colorbar": values["colorbar"],
        "fill": values["fill"],
        "labels": values.get("labels", False),
        "line_width": values["line_width"],
        "line_dash": values["line_dash"],
    }


def _presentation(values: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "aspect_ratio": values.get("aspect_ratio", "automatic"),
        "axes": values.get("axes", True),
        "frame": values.get("frame", True),
    }


def _uniform_levels(levels: Sequence[Any]) -> bool:
    if len(levels) < 3:
        return True
    step = float(levels[1]) - float(levels[0])
    for index in range(2, len(levels)):
        candidate = float(levels[index]) - float(levels[index - 1])
        tolerance = max(1e-15, 1e-12 * max(abs(candidate), abs(step)))
        if abs(candidate - step) > tolerance:
            return False
    return True


def _scalar_layer(
    function: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    kind: str,
    options: Mapping[str, Any] | None,
    ordinal: int = 0,
    namespace: str = "sage.field",
) -> PlotLayer:
    normalized = normalize_scalar_field_options(kind, options)
    values = normalized["value"]
    sampled = sample_scalar_grid(
        function,
        xrange,
        yrange,
        plot_points=values["plot_points"],
        max_samples=values["max_samples"],
    )
    data = dict(sampled)
    if kind in ("contour", "implicit"):
        data["levels"] = (
            [0.0]
            if kind == "implicit"
            else deterministic_levels(sampled, values["contours"])
        )
        if values["fill"] and not _uniform_levels(data["levels"]):
            raise NotImplementedError(
                "Plotly filled contours require uniformly spaced levels; use fill=False for exact nonuniform levels"
            )
    source_intent = {
        "frontend": "sage",
        "constructor": kind + "_plot",
        "expression": _source_name(function),
        "ranges": [sampled["ranges"]["x"], sampled["ranges"]["y"]],
        "sampling": {
            "plot_points": values["plot_points"],
            "max_samples": values["max_samples"],
        },
    }
    legend_label = values.get("legend_label")
    return make_layer(
        kind + "-field",
        data,
        ordinal=ordinal,
        namespace=namespace,
        source_intent=source_intent,
        style=_scalar_style(kind, values),
        legend={"show": legend_label is not None, "label": legend_label},
        metadata=_metadata(sampled, normalized, _presentation(values)),
    )


def contour_field_layer(
    function: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    options: Mapping[str, Any] | None = None,
    ordinal: int = 0,
    namespace: str = "sage.field",
) -> PlotLayer:
    """Return a sampled contour layer with deterministic levels."""
    return _scalar_layer(
        function,
        xrange,
        yrange,
        kind="contour",
        options=options,
        ordinal=ordinal,
        namespace=namespace,
    )


def density_field_layer(
    function: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    options: Mapping[str, Any] | None = None,
    ordinal: int = 0,
    namespace: str = "sage.field",
) -> PlotLayer:
    """Return a sampled density/heatmap layer."""
    return _scalar_layer(
        function,
        xrange,
        yrange,
        kind="density",
        options=options,
        ordinal=ordinal,
        namespace=namespace,
    )


def implicit_field_layer(
    function: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    options: Mapping[str, Any] | None = None,
    ordinal: int = 0,
    namespace: str = "sage.field",
) -> PlotLayer:
    """Return an implicit zero-contour layer."""
    return _scalar_layer(
        function,
        xrange,
        yrange,
        kind="implicit",
        options=options,
        ordinal=ordinal,
        namespace=namespace,
    )


def _region_membership(
    functions: Sequence[Callable[[float, float], Any]],
) -> Callable[[float, float], float]:
    def membership(x: float, y: float) -> float:
        for function in functions:
            value = function(x, y)
            if not bool(value):
                return 1.0
        return -1.0

    return membership


def region_field_layer(
    functions: Callable[[float, float], Any] | Sequence[Callable[[float, float], Any]],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    options: Mapping[str, Any] | None = None,
    ordinal: int = 0,
    namespace: str = "sage.field",
) -> PlotLayer:
    """Return the intersection of callable predicates using Sage truthiness."""
    if callable(functions):
        function_list = [functions]
    elif isinstance(functions, Sequence) and not isinstance(
        functions, (str, bytes, bytearray)
    ):
        function_list = list(functions)
    else:
        raise TypeError("region must be a callable or a sequence of callables")
    if not function_list:
        raise ValueError("region must contain at least one condition")
    if any(not callable(function) for function in function_list):
        raise NotImplementedError(
            "symbolic region relations are not yet wired into this strict sampler; pass callables"
        )
    layer = _scalar_layer(
        _region_membership(function_list),
        xrange,
        yrange,
        kind="region",
        options=options,
        ordinal=ordinal,
        namespace=namespace,
    )
    source_intent = layer.source_intent
    source_intent.pop("expression", None)
    source_intent["expressions"] = [
        _source_name(function) for function in function_list
    ]
    return layer.revise(source_intent=source_intent)


def vector_field_layer(
    functions: Sequence[Callable[[float, float], Any]],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    options: Mapping[str, Any] | None = None,
    ordinal: int = 0,
    namespace: str = "sage.field",
) -> PlotLayer:
    """Return a sampled vector field retaining raw components and masks."""
    normalized = normalize_vector_field_options(options)
    values = normalized["value"]
    sampled = sample_vector_grid(
        functions,
        xrange,
        yrange,
        plot_points=values["plot_points"],
        max_samples=values["max_samples"],
    )
    legend_label = values.get("legend_label")
    return make_layer(
        "vector-field",
        sampled,
        ordinal=ordinal,
        namespace=namespace,
        source_intent={
            "frontend": "sage",
            "constructor": "plot_vector_field",
            "expressions": [_source_name(function) for function in functions],
            "ranges": [sampled["ranges"]["x"], sampled["ranges"]["y"]],
            "sampling": {"plot_points": values["plot_points"]},
        },
        style={
            "color": values["color"],
            "width": values["width"],
            "pivot": values["pivot"],
            "scale": values["scale"],
            "headlength": values["headlength"],
            "headwidth": values["headwidth"],
        },
        legend={"show": legend_label is not None, "label": legend_label},
        metadata=_metadata(sampled, normalized, _presentation(values)),
    )


def slope_field_layer(
    function: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    options: Mapping[str, Any] | None = None,
    ordinal: int = 0,
    namespace: str = "sage.field",
) -> PlotLayer:
    """Return unit vectors `(1, slope) / hypot(1, slope)` on a grid."""
    if not callable(function):
        raise NotImplementedError(
            "symbolic slope evaluation is not yet wired into this strict sampler; pass a callable"
        )

    def horizontal(x: float, y: float) -> float:
        slope = float(function(x, y))
        return 1.0 / math.hypot(1.0, slope)

    def vertical(x: float, y: float) -> float:
        slope = float(function(x, y))
        return slope / math.hypot(1.0, slope)

    normalized = normalize_vector_field_options(options, slope=True)
    values = normalized["value"]
    sampled = sample_vector_grid(
        (horizontal, vertical),
        xrange,
        yrange,
        plot_points=values["plot_points"],
        max_samples=values["max_samples"],
    )
    legend_label = values.get("legend_label")
    return make_layer(
        "slope-field",
        sampled,
        ordinal=ordinal,
        namespace=namespace,
        source_intent={
            "frontend": "sage",
            "constructor": "plot_slope_field",
            "expression": _source_name(function),
            "ranges": [sampled["ranges"]["x"], sampled["ranges"]["y"]],
            "sampling": {"plot_points": values["plot_points"]},
        },
        style={
            "color": values["color"],
            "width": values["width"],
            "pivot": values["pivot"],
            "scale": values["scale"],
            "headlength": values["headlength"],
            "headwidth": values["headwidth"],
        },
        legend={"show": legend_label is not None, "label": legend_label},
        metadata=_metadata(sampled, normalized, _presentation(values)),
    )


def _legend(layer: PlotLayer, trace: dict[str, JSONValue]) -> None:
    legend = layer.legend
    trace["showlegend"] = bool(legend.get("show", False))
    label = legend.get("label")
    if label is not None:
        trace["name"] = str(label)


def _scalar_trace(layer: PlotLayer) -> dict[str, JSONValue]:
    data = cast(dict[str, Any], materialize_object(layer.data, "$.field.data"))
    style = cast(dict[str, Any], layer.style)
    trace: dict[str, JSONValue] = {
        "x": data["x"],
        "y": data["y"],
        "z": data["z"],
        "colorscale": style.get("colorscale"),
        "showscale": style.get("colorbar", False),
        "hoverongaps": False,
    }
    if layer.kind == "density-field":
        trace.update({"type": "heatmap", "zsmooth": style.get("zsmooth")})
    elif layer.kind == "region-field":
        trace.update(
            {
                "type": "contour",
                "autocontour": False,
                "colorscale": [
                    [0.0, style.get("incol")],
                    [0.499999, style.get("incol")],
                    [0.5, style.get("outcol")],
                    [1.0, style.get("outcol")],
                ],
                "contours": {
                    "start": -1e-20,
                    "end": 1e-20,
                    "size": 1e-20,
                    "coloring": "fill",
                    "showlines": False,
                },
                "opacity": style.get("alpha"),
            }
        )
    else:
        levels = data.get("levels", [])
        contours: dict[str, JSONValue] = {
            "coloring": "fill" if style.get("fill") else "lines",
            "showlabels": style.get("labels", False),
        }
        if isinstance(levels, list) and levels:
            contours["start"] = levels[0]
            contours["end"] = levels[-1]
            if len(levels) > 1:
                step = float(levels[1]) - float(levels[0])
                if _uniform_levels(levels):
                    contours["size"] = step
        trace.update(
            {
                "type": "contour",
                "autocontour": False,
                "contours": contours,
                "line": {
                    "width": style.get("line_width"),
                    "dash": style.get("line_dash"),
                },
            }
        )
    _legend(layer, trace)
    if not layer.visibility:
        trace["visible"] = False
    return trace


def _arrow_segments(layer: PlotLayer) -> dict[str, JSONValue]:
    data = cast(dict[str, Any], materialize_object(layer.data, "$.field.data"))
    x_values = data["x"]
    y_values = data["y"]
    u_values = data["u"]
    v_values = data["v"]
    if not all(
        isinstance(value, list) for value in (x_values, y_values, u_values, v_values)
    ):
        raise TypeError("vector field coordinates and components must be arrays")
    style = cast(dict[str, Any], layer.style)
    maximum = float(data.get("maximum_magnitude", 0.0))
    spacing = data["spacing"]
    if not isinstance(spacing, list) or len(spacing) != 2:
        raise TypeError("vector field spacing must contain x and y")
    extent = min(float(spacing[0]), float(spacing[1])) * float(style["scale"])
    xs: list[JSONValue] = []
    ys: list[JSONValue] = []
    pivot = style["pivot"]
    head_length = float(style["headlength"])
    head_width = float(style["headwidth"])
    for y_index, y in enumerate(y_values):
        u_row = u_values[y_index]
        v_row = v_values[y_index]
        if not isinstance(u_row, list) or not isinstance(v_row, list):
            raise TypeError("vector field component rows must be arrays")
        for x_index, x in enumerate(x_values):
            u = u_row[x_index]
            v = v_row[x_index]
            if u is None or v is None:
                continue
            magnitude = math.hypot(float(u), float(v))
            if magnitude == 0 or maximum == 0:
                continue
            dx = float(u) / maximum * extent
            dy = float(v) / maximum * extent
            if pivot == "middle":
                x0, y0 = float(x) - dx / 2, float(y) - dy / 2
            elif pivot == "tip":
                x0, y0 = float(x) - dx, float(y) - dy
            else:
                x0, y0 = float(x), float(y)
            x1, y1 = x0 + dx, y0 + dy
            xs.extend((x0, x1, None))
            ys.extend((y0, y1, None))
            if head_width > 0 and head_length > 0:
                unit_x, unit_y = float(u) / magnitude, float(v) / magnitude
                back_x = x1 - dx * head_length
                back_y = y1 - dy * head_length
                arrow_length = math.hypot(dx, dy)
                side_x = -unit_y * arrow_length * head_width
                side_y = unit_x * arrow_length * head_width
                xs.extend((back_x + side_x, x1, back_x - side_x, None))
                ys.extend((back_y + side_y, y1, back_y - side_y, None))
    trace: dict[str, JSONValue] = {
        "type": "scatter",
        "mode": "lines",
        "x": xs,
        "y": ys,
        "line": {"color": style["color"], "width": style["width"]},
        "hoverinfo": "skip",
    }
    _legend(layer, trace)
    if not layer.visibility:
        trace["visible"] = False
    return trace


def lower_field_layer(layer: PlotLayer) -> list[dict[str, JSONValue]]:
    """Lower one validated field layer to deterministic Plotly traces."""
    if layer.kind not in FIELD_LAYER_KINDS:
        raise ValueError("not a supported field layer: " + layer.kind)
    if layer.kind in ("vector-field", "slope-field"):
        return [_arrow_segments(layer)]
    if layer.kind in ("contour-field", "implicit-field") and not layer.style.get(
        "fill"
    ):
        data = cast(dict[str, Any], materialize_object(layer.data, "$.field.data"))
        levels = data.get("levels", [])
        if isinstance(levels, list) and len(levels) > 1 and not _uniform_levels(levels):
            traces: list[dict[str, JSONValue]] = []
            for index, level in enumerate(levels):
                one_level_data = dict(data)
                one_level_data["levels"] = [level]
                trace = _scalar_trace(layer.revise(data=one_level_data))
                if index > 0:
                    trace["showlegend"] = False
                traces.append(trace)
            return traces
    traces = [_scalar_trace(layer)]
    if layer.kind == "region-field" and layer.style.get("bordercol") is not None:
        data = materialize_object(layer.data, "$.field.data")
        border: dict[str, JSONValue] = {
            "type": "contour",
            "x": data["x"],
            "y": data["y"],
            "z": data["z"],
            "autocontour": False,
            "contours": {
                "start": 0,
                "end": 0,
                "coloring": "lines",
                "showlabels": False,
            },
            "line": {
                "color": layer.style["bordercol"],
                "width": layer.style["borderwidth"],
                "dash": layer.style["borderstyle"],
            },
            "showscale": False,
            "showlegend": False,
            "hoverinfo": "skip",
        }
        traces.append(border)
    return traces


def field_plot_spec(layer: PlotLayer) -> PlotSpec:
    """Wrap one field layer in a Sage-provenanced two-dimensional PlotSpec."""
    metadata = layer.metadata
    bounds = metadata.get("bounds")
    if not isinstance(bounds, dict):
        raise TypeError("field layer bounds must be a mapping")
    x_range = bounds.get("x")
    y_range = bounds.get("y")
    axes: dict[str, Any] = {
        "coordinate_system": "cartesian",
        "xaxis": {"range": x_range, "autorange": False},
        "yaxis": {"range": y_range, "autorange": False},
    }
    presentation = metadata.get("presentation")
    aspect = (
        presentation.get("aspect_ratio")
        if isinstance(presentation, dict)
        else "automatic"
    )
    if aspect == 1:
        axes["yaxis"]["scaleanchor"] = "x"
        axes["yaxis"]["scaleratio"] = 1
    if isinstance(presentation, dict):
        frame = bool(presentation.get("frame", True))
        coordinate_axes = bool(presentation.get("axes", False))
        for name in ("xaxis", "yaxis"):
            axes[name].update(
                {
                    "ticks": "outside" if frame else "",
                    "showticklabels": frame or coordinate_axes,
                    "showgrid": False,
                    "zeroline": coordinate_axes,
                }
            )
    diagnostics: list[Diagnostic] = []
    sampling = metadata.get("sampling")
    if isinstance(sampling, dict):
        masked = sampling.get("masked_count", 0)
        finite = sampling.get("finite_count", 0)
        if isinstance(masked, int) and masked > 0:
            code = (
                "PLOT_DATA_ALL_NONFINITE"
                if finite == 0
                else "PLOT_DATA_PARTIAL_NONFINITE"
            )
            resource = metadata.get("resource")
            sample_count = (
                resource.get("sample_count", 0) if isinstance(resource, dict) else 0
            )
            diagnostics.append(
                Diagnostic(
                    code,
                    layer_ids=(layer.id,),
                    details={
                        "masked_count": masked,
                        "sample_count": sample_count,
                    },
                )
            )
    decisions = metadata.get("style_decisions")
    if isinstance(decisions, dict) and decisions.get("status") == "translated":
        diagnostics.append(
            Diagnostic(
                "PLOT_OPTION_TRANSLATED",
                layer_ids=(layer.id,),
                details={"options": decisions.get("options", [])},
            )
        )
    resource = metadata.get("resource")
    if isinstance(resource, dict):
        sample_count = resource.get("sample_count", 0)
        if isinstance(sample_count, int) and sample_count >= 100_000:
            diagnostics.append(
                Diagnostic(
                    "PLOT_RESOURCE_EXCESSIVE_SAMPLES",
                    layer_ids=(layer.id,),
                    details={"sample_count": sample_count},
                )
            )
    source_sampling = layer.source_intent.get("sampling", {})
    if not isinstance(source_sampling, Mapping):
        raise TypeError("field layer source sampling must be a mapping")
    return PlotSpec(
        2,
        (layer,),
        axes_or_scene=axes,
        provenance=Provenance(
            "sage",
            source_language="sage",
            constructor=str(layer.source_intent.get("constructor", "field")),
            source=layer.source_intent,
            ranges=[x_range, y_range],
            sampling=source_sampling,
            translation_events=("Plotly-native field lowering",),
        ),
        diagnostics=diagnostics,
    )


__all__ = [
    "FIELD_LAYER_KINDS",
    "contour_field_layer",
    "density_field_layer",
    "field_plot_spec",
    "implicit_field_layer",
    "lower_field_layer",
    "normalize_scalar_field_options",
    "normalize_vector_field_options",
    "region_field_layer",
    "slope_field_layer",
    "vector_field_layer",
]
