"""Deterministic, bounded sampling for rectangular two-dimensional fields.

The functions in this module are renderer independent.  Coordinates include
both range endpoints, scalar matrices use `z[y_index][x_index]`, and every
failed or non-finite evaluation is represented by both `None` and an
explicit finite mask.  This keeps holes visible to PlotSpec consumers instead
of converting them to plausible numeric values.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

MAX_GRID_SAMPLES = 1_000_000
DEFAULT_LEVEL_COUNT = 10


def _finite_float(value: Any, name: str) -> float:
    if isinstance(value, bool):
        raise TypeError(name + " must be a finite real number")
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be a finite real number") from error
    if not math.isfinite(numeric):
        raise ValueError(name + " must be finite")
    return numeric


def _range(value: Sequence[Any], name: str) -> tuple[str | None, float, float]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise TypeError(name + " must be a two- or three-item sequence")
    parts = list(value)
    variable: str | None = None
    if len(parts) == 2:
        lower_value, upper_value = parts
    elif len(parts) == 3:
        variable = str(parts[0])
        lower_value, upper_value = parts[1], parts[2]
    else:
        raise ValueError(
            name + " must contain (minimum, maximum) or (variable, minimum, maximum)"
        )
    lower = _finite_float(lower_value, name + " minimum")
    upper = _finite_float(upper_value, name + " maximum")
    if upper <= lower:
        raise ValueError(name + " maximum must be greater than its minimum")
    return variable, lower, upper


def normalize_plot_points(
    plot_points: Any,
    *,
    max_samples: int = MAX_GRID_SAMPLES,
) -> tuple[int, int]:
    """Return `(x_count, y_count)` after enforcing the sample budget."""
    if isinstance(max_samples, bool) or not isinstance(max_samples, int):
        raise TypeError("max_samples must be an integer")
    if max_samples < 4:
        raise ValueError("max_samples must permit at least a 2 by 2 grid")
    if isinstance(plot_points, bool):
        raise TypeError("plot_points must be an integer or a pair of integers")
    if isinstance(plot_points, int):
        x_count = plot_points
        y_count = plot_points
    elif isinstance(plot_points, Sequence) and not isinstance(
        plot_points, (str, bytes, bytearray)
    ):
        values = list(plot_points)
        if len(values) != 2:
            raise ValueError("plot_points must contain exactly two integers")
        if any(
            isinstance(value, bool) or not isinstance(value, int) for value in values
        ):
            raise TypeError("plot_points must contain integers")
        x_count, y_count = values
    else:
        raise TypeError("plot_points must be an integer or a pair of integers")
    if x_count < 2 or y_count < 2:
        raise ValueError("plot_points must be at least 2 in each direction")
    if x_count * y_count > max_samples:
        raise ValueError(
            "rectangular grid requests "
            + str(x_count * y_count)
            + " samples, exceeding max_samples="
            + str(max_samples)
        )
    return x_count, y_count


def _coordinates(lower: float, upper: float, count: int) -> list[float]:
    step = (upper - lower) / (count - 1)
    values = [lower + step * index for index in range(count)]
    values[-1] = upper
    return values


def rectangular_grid(
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    plot_points: Any,
    max_samples: int = MAX_GRID_SAMPLES,
) -> dict[str, Any]:
    """Build a JSON-safe rectangular coordinate grid including endpoints."""
    x_variable, x_min, x_max = _range(xrange, "xrange")
    y_variable, y_min, y_max = _range(yrange, "yrange")
    x_count, y_count = normalize_plot_points(plot_points, max_samples=max_samples)
    x_values = _coordinates(x_min, x_max, x_count)
    y_values = _coordinates(y_min, y_max, y_count)
    return {
        "x": x_values,
        "y": y_values,
        "shape": [y_count, x_count],
        "ranges": {"x": [x_min, x_max], "y": [y_min, y_max]},
        "range_variables": {"x": x_variable, "y": y_variable},
        "spacing": [
            (x_max - x_min) / (x_count - 1),
            (y_max - y_min) / (y_count - 1),
        ],
        "sample_count": x_count * y_count,
    }


def _real_sample(value: Any) -> tuple[float | None, str | None]:
    if isinstance(value, bool):
        return (1.0 if value else 0.0), None
    if isinstance(value, complex):
        if value.imag != 0:
            return None, "complex"
        value = value.real
    try:
        numeric = float(value)
    except (TypeError, ValueError, OverflowError):
        return None, "non-numeric"
    if not math.isfinite(numeric):
        return None, "non-finite"
    return numeric, None


def _evaluate(
    function: Callable[[float, float], Any], x: float, y: float
) -> tuple[float | None, str | None]:
    try:
        value = function(x, y)
    except Exception as error:
        return None, "evaluation-error:" + type(error).__name__
    return _real_sample(value)


def _sampling_summary(
    reasons: dict[str, int],
    finite_count: int,
    sample_count: int,
) -> dict[str, Any]:
    return {
        "finite_count": finite_count,
        "masked_count": sample_count - finite_count,
        "masked_reasons": {name: reasons[name] for name in sorted(reasons)},
    }


def sample_scalar_grid(
    function: Callable[[float, float], Any],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    plot_points: Any = 100,
    max_samples: int = MAX_GRID_SAMPLES,
) -> dict[str, Any]:
    """Sample one scalar function with explicit finite and failure masks."""
    if not callable(function):
        raise NotImplementedError(
            "symbolic field evaluation is not yet wired into this strict sampler; pass a callable"
        )
    grid = rectangular_grid(
        xrange, yrange, plot_points=plot_points, max_samples=max_samples
    )
    raw_values: list[list[Any]] | None = None
    try:
        raw_values = [[function(x, y) for x in grid["x"]] for y in grid["y"]]
    except Exception:
        # Retrying point by point is slower, but preserves all remaining holes
        # and their exception classes. Mathematical plotting callables are
        # expected to be pure, as they are in Sage's numerical evaluators.
        raw_values = None
    if raw_values is not None:
        numeric_values: list[list[float]] | None = None
        try:
            numeric_values = [[float(value) for value in row] for row in raw_values]
        except (TypeError, ValueError, OverflowError):
            numeric_values = None
        if numeric_values is not None and all(
            math.isfinite(value) for row in numeric_values for value in row
        ):
            finite_values = [value for row in numeric_values for value in row]
            answer = dict(grid)
            answer.update(
                {
                    "z": numeric_values,
                    "finite_mask": [[True] * len(grid["x"]) for _y in grid["y"]],
                    "value_bounds": [min(finite_values), max(finite_values)],
                    "sampling": _sampling_summary(
                        {}, grid["sample_count"], grid["sample_count"]
                    ),
                }
            )
            return answer
    values: list[list[float | None]] = []
    finite_mask: list[list[bool]] = []
    reasons: dict[str, int] = {}
    finite_values: list[float] = []
    for y in grid["y"]:
        row: list[float | None] = []
        mask_row: list[bool] = []
        for x_index, x in enumerate(grid["x"]):
            if raw_values is None:
                sample, reason = _evaluate(function, x, y)
            else:
                sample, reason = _real_sample(raw_values[len(values)][x_index])
            row.append(sample)
            finite = sample is not None
            mask_row.append(finite)
            if sample is not None:
                finite_values.append(sample)
            elif reason is not None:
                reasons[reason] = reasons.get(reason, 0) + 1
        values.append(row)
        finite_mask.append(mask_row)
    bounds: list[float] | None = None
    if finite_values:
        bounds = [min(finite_values), max(finite_values)]
    answer = dict(grid)
    answer.update(
        {
            "z": values,
            "finite_mask": finite_mask,
            "value_bounds": bounds,
            "sampling": _sampling_summary(
                reasons, len(finite_values), grid["sample_count"]
            ),
        }
    )
    return answer


def sample_vector_grid(
    functions: Sequence[Callable[[float, float], Any]],
    xrange: Sequence[Any],
    yrange: Sequence[Any],
    *,
    plot_points: Any = 20,
    max_samples: int = MAX_GRID_SAMPLES,
) -> dict[str, Any]:
    """Sample a two-component field on the shared rectangular grid."""
    if not isinstance(functions, Sequence) or isinstance(
        functions, (str, bytes, bytearray)
    ):
        raise TypeError("vector field must contain two callables")
    components = list(functions)
    if len(components) != 2:
        raise ValueError("vector field must contain exactly two components")
    if not callable(components[0]) or not callable(components[1]):
        raise NotImplementedError(
            "symbolic field evaluation is not yet wired into this strict sampler; pass two callables"
        )
    grid = rectangular_grid(
        xrange, yrange, plot_points=plot_points, max_samples=max_samples
    )
    raw_pairs: list[list[tuple[Any, Any]]] | None = None
    try:
        raw_pairs = [
            [(components[0](x, y), components[1](x, y)) for x in grid["x"]]
            for y in grid["y"]
        ]
    except Exception:
        raw_pairs = None
    if raw_pairs is not None:
        numeric_pairs: list[list[tuple[float, float]]] | None = None
        try:
            numeric_pairs = [
                [(float(pair[0]), float(pair[1])) for pair in row] for row in raw_pairs
            ]
        except (TypeError, ValueError, OverflowError):
            numeric_pairs = None
        if numeric_pairs is not None and all(
            math.isfinite(pair[0]) and math.isfinite(pair[1])
            for row in numeric_pairs
            for pair in row
        ):
            fast_u_values = [[pair[0] for pair in row] for row in numeric_pairs]
            fast_v_values = [[pair[1] for pair in row] for row in numeric_pairs]
            fast_magnitudes = [
                [math.hypot(pair[0], pair[1]) for pair in row] for row in numeric_pairs
            ]
            maximum_magnitude = max(
                magnitude for row in fast_magnitudes for magnitude in row
            )
            answer = dict(grid)
            answer.update(
                {
                    "u": fast_u_values,
                    "v": fast_v_values,
                    "magnitude": fast_magnitudes,
                    "finite_mask": [[True] * len(grid["x"]) for _y in grid["y"]],
                    "maximum_magnitude": maximum_magnitude,
                    "sampling": _sampling_summary(
                        {}, grid["sample_count"], grid["sample_count"]
                    ),
                }
            )
            return answer
    u_values: list[list[float | None]] = []
    v_values: list[list[float | None]] = []
    magnitudes: list[list[float | None]] = []
    finite_mask: list[list[bool]] = []
    reasons: dict[str, int] = {}
    finite_count = 0
    maximum_magnitude = 0.0
    for y_index, y in enumerate(grid["y"]):
        u_row: list[float | None] = []
        v_row: list[float | None] = []
        magnitude_row: list[float | None] = []
        mask_row: list[bool] = []
        for x_index, x in enumerate(grid["x"]):
            if raw_pairs is None:
                u, u_reason = _evaluate(components[0], x, y)
                v, v_reason = _evaluate(components[1], x, y)
            else:
                pair = raw_pairs[y_index][x_index]
                u, u_reason = _real_sample(pair[0])
                v, v_reason = _real_sample(pair[1])
            finite = u is not None and v is not None
            if u is not None and v is not None:
                magnitude = math.hypot(u, v)
                finite_count += 1
                maximum_magnitude = max(maximum_magnitude, magnitude)
            else:
                magnitude = None
                if u_reason is not None:
                    key = "u:" + u_reason
                    reasons[key] = reasons.get(key, 0) + 1
                if v_reason is not None:
                    key = "v:" + v_reason
                    reasons[key] = reasons.get(key, 0) + 1
            u_row.append(u if finite else None)
            v_row.append(v if finite else None)
            magnitude_row.append(magnitude)
            mask_row.append(finite)
        u_values.append(u_row)
        v_values.append(v_row)
        magnitudes.append(magnitude_row)
        finite_mask.append(mask_row)
    answer = dict(grid)
    answer.update(
        {
            "u": u_values,
            "v": v_values,
            "magnitude": magnitudes,
            "finite_mask": finite_mask,
            "maximum_magnitude": maximum_magnitude,
            "sampling": _sampling_summary(reasons, finite_count, grid["sample_count"]),
        }
    )
    return answer


def deterministic_levels(
    sampled: dict[str, Any],
    contours: Any = None,
    *,
    default_count: int = DEFAULT_LEVEL_COUNT,
) -> list[float]:
    """Materialize ordered contour levels without renderer heuristics.

    An integer is interpreted as the exact number of levels, including both
    finite extrema.  This is an intentional Plotly-native translation of
    Matplotlib's locator-dependent "approximately N levels" behavior.
    """
    if isinstance(default_count, bool) or not isinstance(default_count, int):
        raise TypeError("default_count must be an integer")
    if default_count < 1:
        raise ValueError("default_count must be positive")
    if contours is None:
        count = default_count
    elif isinstance(contours, bool):
        raise TypeError("contours must be a positive integer or a sequence")
    elif isinstance(contours, int):
        if contours < 1:
            raise ValueError("contours must be positive")
        count = contours
    elif isinstance(contours, Sequence) and not isinstance(
        contours, (str, bytes, bytearray)
    ):
        levels = [_finite_float(value, "contour level") for value in contours]
        if not levels:
            raise ValueError("contour level sequence must not be empty")
        for index in range(1, len(levels)):
            if levels[index] <= levels[index - 1]:
                raise ValueError("contour levels must be strictly increasing")
        return levels
    else:
        raise TypeError("contours must be a positive integer or a sequence")
    bounds = sampled.get("value_bounds")
    if bounds is None:
        return []
    lower, upper = bounds
    if lower == upper or count == 1:
        return [float(lower if count != 1 else (lower + upper) / 2)]
    return _coordinates(float(lower), float(upper), count)


__all__ = [
    "DEFAULT_LEVEL_COUNT",
    "MAX_GRID_SAMPLES",
    "deterministic_levels",
    "normalize_plot_points",
    "rectangular_grid",
    "sample_scalar_grid",
    "sample_vector_grid",
]
