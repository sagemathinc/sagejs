"""Sage frontend planning for sampled two-dimensional curves."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from .curve_sampling import MAX_CURVE_SAMPLES, sample_curve_segments

_SAMPLING_DEFAULTS: dict[str, Any] = {
    "plot_points": 200,
    "adaptive_tolerance": 0.01,
    "adaptive_recursion": 5,
    "randomize": True,
    "initial_points": None,
    "exclude": None,
    "detect_poles": False,
    "imaginary_tolerance": 1e-8,
    "sample_limit": MAX_CURVE_SAMPLES,
}

_STYLE_DEFAULTS: dict[str, Any] = {
    "alpha": 1,
    "rgbcolor": (0, 0, 1),
    "thickness": 1,
    "linestyle": "-",
    "legend_label": None,
}

_KNOWN_LINE_OPTIONS = {
    "alpha",
    "color",
    "rgbcolor",
    "thickness",
    "linestyle",
    "legend_label",
    "legend_color",
    "zorder",
}

_UNSUPPORTED_LINE_OPTIONS = {
    "hue": "use color or rgbcolor",
    "marker": "compose the curve with point() until curve markers are implemented",
    "markeredgecolor": "compose the curve with point() for styled markers",
    "markeredgewidth": "compose the curve with point() for styled markers",
    "markerfacecolor": "compose the curve with point() for styled markers",
    "markersize": "compose the curve with point() for styled markers",
}


def _copy_mapping(values: Mapping[str, Any]) -> dict[str, Any]:
    return {str(name): values[name] for name in values}


def normalize_curve_options(options: Mapping[str, Any]) -> dict[str, Any]:
    """Consume all Sage curve options or reject them explicitly."""
    remaining = _copy_mapping(options)
    sampling = dict(_SAMPLING_DEFAULTS)
    style = dict(_STYLE_DEFAULTS)
    diagnostics: list[dict[str, Any]] = []

    if "color" in remaining and "rgbcolor" in remaining:
        raise ValueError("only one of color or rgbcolor should be specified")
    if "color" in remaining:
        remaining["rgbcolor"] = remaining.pop("color")
    if "label" in remaining and "legend_label" not in remaining:
        remaining["legend_label"] = remaining.pop("label")

    for name in _SAMPLING_DEFAULTS:
        if name in remaining:
            sampling[name] = remaining.pop(name)
    fill = remaining.pop("fill", False)
    fillcolor = remaining.pop("fillcolor", "automatic")
    fillalpha = remaining.pop("fillalpha", 0.5)

    for name in _KNOWN_LINE_OPTIONS:
        if name in remaining:
            style[name] = remaining.pop(name)

    for name, repair in _UNSUPPORTED_LINE_OPTIONS.items():
        if name in remaining:
            raise NotImplementedError(
                "plot option '" + name + "' is not yet supported; " + repair
            )

    if remaining:
        name = sorted(remaining)[0]
        raise RuntimeError("error in plot(): option '" + name + "' not valid")

    legend_color = style.pop("legend_color", None)
    if legend_color is not None:
        diagnostics.append(
            {
                "code": "PLOT_OPTION_IGNORED",
                "details": {
                    "option": "legend_color",
                    "value": str(legend_color),
                    "reason": "Plotly has no per-entry legend text color",
                },
            }
        )
    return {
        "sampling": sampling,
        "style": style,
        "fill": fill,
        "fillcolor": fillcolor,
        "fillalpha": float(fillalpha),
        "diagnostics": diagnostics,
    }


def _fill_base(fill: Any, segments: Sequence[Sequence[tuple[float, float]]]) -> Any:
    if fill is True or fill == "axis":
        return 0.0
    if fill == "min":
        return min(point[1] for segment in segments for point in segment)
    if fill == "max":
        return max(point[1] for segment in segments for point in segment)
    if isinstance(fill, (int, float)) and not isinstance(fill, bool):
        return float(fill)
    return None


def build_fill_polygons(
    segments: Sequence[Sequence[tuple[float, float]]],
    fill: Any,
    *,
    fill_function: Callable[[float], Any] | None = None,
) -> list[list[tuple[float, float]]]:
    """Build one fill polygon per finite curve segment."""
    if fill is False or fill is None:
        return []
    polygons: list[list[tuple[float, float]]] = []
    if callable(fill):
        fill_function = fill
    base = None if fill_function is not None else _fill_base(fill, segments)
    if base is None and fill_function is None:
        raise ValueError(
            "fill must be False, True, 'axis', 'min', 'max', a number, or a function"
        )
    base_value = 0.0 if base is None else float(base)
    for segment_value in segments:
        segment = list(segment_value)
        if len(segment) < 2:
            continue
        if fill_function is not None:
            opposite = [
                (point[0], float(fill_function(point[0])))
                for point in reversed(segment)
            ]
            polygons.append(opposite + segment)
        else:
            polygons.append(
                [(segment[0][0], base_value)] + segment + [(segment[-1][0], base_value)]
            )
    return polygons


def plan_curve(
    function: Callable[[float], Any],
    xrange: Sequence[Any],
    options: Mapping[str, Any],
    *,
    fill_function: Callable[[float], Any] | None = None,
) -> dict[str, Any]:
    """Create renderer-independent sampled curve and fill payloads."""
    normalized = normalize_curve_options(options)
    sampling = normalized["sampling"]
    exclude = sampling["exclude"]
    if exclude is not None and not isinstance(exclude, (list, tuple)):
        raise NotImplementedError(
            "symbolic exclude equations are not yet supported; pass a list of points"
        )
    detect_poles = sampling["detect_poles"]
    if detect_poles not in (False, True, "show"):
        raise ValueError("detect_poles must be False, True, or 'show'")
    sampled = sample_curve_segments(
        function,
        xrange,
        plot_points=int(sampling["plot_points"]),
        adaptive_tolerance=float(sampling["adaptive_tolerance"]),
        adaptive_recursion=int(sampling["adaptive_recursion"]),
        randomize=bool(sampling["randomize"]),
        initial_points=sampling["initial_points"],
        exclude=exclude,
        detect_poles=bool(detect_poles),
        imaginary_tolerance=float(sampling["imaginary_tolerance"]),
        sample_limit=int(sampling["sample_limit"]),
    )
    segments = sampled["segments"]
    polygons = build_fill_polygons(
        segments,
        normalized["fill"],
        fill_function=fill_function,
    )
    diagnostics = list(normalized["diagnostics"])
    if sampled["excluded"]:
        diagnostics.append(
            {
                "code": "PLOT_DATA_PARTIAL_NONFINITE",
                "details": {
                    "excluded_count": len(sampled["excluded"]),
                    "excluded": sampled["excluded"],
                },
            }
        )
    if not segments:
        diagnostics.append(
            {
                "code": (
                    "PLOT_DATA_ALL_NONFINITE"
                    if not sampled["points"] and sampled["excluded"]
                    else "PLOT_DATA_EMPTY"
                ),
                "details": {"sample_count": len(sampled["points"])},
            }
        )
    if len(sampled["points"]) >= 100_000:
        diagnostics.append(
            {
                "code": "PLOT_RESOURCE_EXCESSIVE_SAMPLES",
                "details": {"sample_count": len(sampled["points"])},
            }
        )
    fillcolor = normalized["fillcolor"]
    if fillcolor == "automatic":
        fillcolor = (0.5, 0.5, 0.5)
    return {
        "segments": segments,
        "fill_polygons": polygons,
        "poles": sampled["poles"] if detect_poles == "show" else [],
        "excluded": sampled["excluded"],
        "sampling": sampled["sampling"],
        "style": normalized["style"],
        "fill_style": {
            "rgbcolor": fillcolor,
            "alpha": normalized["fillalpha"],
            "thickness": 0,
            "fill": True,
        },
        "diagnostics": diagnostics,
    }


__all__ = [
    "build_fill_polygons",
    "normalize_curve_options",
    "plan_curve",
]
