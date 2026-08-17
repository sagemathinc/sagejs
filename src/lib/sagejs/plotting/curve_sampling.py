"""Deterministic, segmented sampling for Sage-compatible plane curves."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

CurvePoint = tuple[float, float]

# This is a hard safety boundary, not a recommended plotting density. Normal
# interactive plots should remain several orders of magnitude smaller.
MAX_CURVE_SAMPLES = 1_000_000


class _SampleBudget:
    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.used = 0

    def consume(self, count: int = 1) -> None:
        self.used += count
        if self.used > self.limit:
            raise ValueError(
                "curve sampling exceeded the safety limit of "
                + str(self.limit)
                + " evaluated points"
            )


def _part(value: Any, name: str) -> Any:
    part = getattr(value, name)
    return part() if callable(part) else part


def _real_float(value: Any, imaginary_tolerance: float) -> float:
    """Coerce a numerical result while rejecting meaningful imaginary parts."""
    try:
        answer = float(value)
    except (TypeError, ValueError):
        if not hasattr(value, "real") or not hasattr(value, "imag"):
            raise
        real_part = float(_part(value, "real"))
        imaginary_part = float(_part(value, "imag"))
        if abs(imaginary_part) >= imaginary_tolerance:
            raise ValueError("plot function returned a non-real value") from None
        answer = real_part
    if not math.isfinite(answer):
        raise ArithmeticError("plot function returned a non-finite value")
    return answer


def _evaluate(
    function: Callable[[float], Any],
    x_value: float,
    imaginary_tolerance: float,
    budget: _SampleBudget,
) -> tuple[CurvePoint | None, str | None]:
    budget.consume()
    try:
        return (
            x_value,
            _real_float(function(x_value), imaginary_tolerance),
        ), None
    except (TypeError, ValueError, OverflowError, ZeroDivisionError):
        return None, "exception"
    except ArithmeticError:
        return None, "nonfinite"


def _adaptive_refinement_with_exclusions(
    function: Callable[[float], Any],
    left: CurvePoint,
    right: CurvePoint,
    adaptive_tolerance: float,
    adaptive_recursion: int,
    imaginary_tolerance: float,
    budget: _SampleBudget,
    level: int = 0,
) -> tuple[list[CurvePoint], list[float]]:
    if level >= adaptive_recursion:
        return [], []
    midpoint_x = (left[0] + right[0]) / 2.0
    midpoint, _failure = _evaluate(function, midpoint_x, imaginary_tolerance, budget)
    if midpoint is None:
        return [], [midpoint_x]
    linear_midpoint = (left[1] + right[1]) / 2.0
    if abs(linear_midpoint - midpoint[1]) <= adaptive_tolerance:
        return [], []
    before, before_excluded = _adaptive_refinement_with_exclusions(
        function,
        left,
        midpoint,
        adaptive_tolerance,
        adaptive_recursion,
        imaginary_tolerance,
        budget,
        level + 1,
    )
    after, after_excluded = _adaptive_refinement_with_exclusions(
        function,
        midpoint,
        right,
        adaptive_tolerance,
        adaptive_recursion,
        imaginary_tolerance,
        budget,
        level + 1,
    )
    return before + [midpoint] + after, before_excluded + after_excluded


def adaptive_refinement(
    function: Callable[[float], Any],
    point1: Sequence[Any],
    point2: Sequence[Any],
    adaptive_tolerance: float = 0.01,
    adaptive_recursion: int = 5,
    level: int = 0,
    *,
    excluded: bool = False,
    imaginary_tolerance: float = 1e-8,
) -> list[tuple[float, Any]]:
    """Return Sage-compatible adaptive points between two known points."""
    left = float(point1[0]), float(point1[1])
    right = float(point2[0]), float(point2[1])
    budget = _SampleBudget(MAX_CURVE_SAMPLES)
    points, excluded_points = _adaptive_refinement_with_exclusions(
        function,
        left,
        right,
        float(adaptive_tolerance),
        int(adaptive_recursion),
        float(imaginary_tolerance),
        budget,
        int(level),
    )
    if not excluded:
        return [(x_value, y_value) for x_value, y_value in points]
    output: list[tuple[float, Any]] = [
        (x_value, y_value) for x_value, y_value in points
    ]
    output.extend((x_value, "NaN") for x_value in excluded_points)
    output.sort(key=lambda point: point[0])
    return output


def generate_plot_points(
    function: Callable[[float], Any],
    xrange: Sequence[Any],
    plot_points: int = 5,
    adaptive_tolerance: float = 0.01,
    adaptive_recursion: int = 5,
    randomize: bool = True,
    initial_points: Sequence[Any] | None = None,
    *,
    excluded: bool = False,
    imaginary_tolerance: float = 1e-8,
    sample_limit: int = MAX_CURVE_SAMPLES,
) -> Any:
    """Sample one curve and optionally return discovered exclusions.

    The returned point list matches Sage's public helper. Segmentation is a
    separate operation because callers need the exclusion locations before
    lowering a curve to renderer traces.
    """
    if len(xrange) != 2:
        raise ValueError("plot range must contain exactly two endpoints")
    minimum = float(xrange[0])
    maximum = float(xrange[1])
    count = int(plot_points)
    recursion = int(adaptive_recursion)
    tolerance = float(adaptive_tolerance)
    imag_tol = float(imaginary_tolerance)
    limit = int(sample_limit)
    if count < 2:
        raise ValueError("plot_points must be at least 2")
    if minimum == maximum:
        raise ValueError("plot start point and end point must be different")
    if recursion < 0:
        raise ValueError("adaptive_recursion must be nonnegative")
    if tolerance < 0:
        raise ValueError("adaptive_tolerance must be nonnegative")
    if imag_tol < 0:
        raise ValueError("imaginary_tolerance must be nonnegative")
    if limit < 2:
        raise ValueError("sample_limit must be at least 2")
    if count > limit:
        raise ValueError(
            "plot_points exceeds the curve sampling safety limit of " + str(limit)
        )

    delta = (maximum - minimum) / float(count - 1)
    x_values = [minimum + delta * index for index in range(count)]
    x_values[-1] = maximum
    if randomize:
        # A local deterministic generator avoids importing the Sage.js
        # runtime's top-level `random` compatibility module when this strict
        # mathematical module is executed by ordinary CPython. Randomization
        # here only breaks sampling-grid aliasing; reproducibility is more
        # useful than ambient process-global entropy.
        state = 0x9E3779B9
        for index in range(1, count - 1):
            state = (1664525 * state + 1013904223) & 0xFFFFFFFF
            unit = state / 4294967296.0
            x_values[index] += delta * (unit - 0.5)
    # Sage only treats a list as initial points, but accepting any ordinary
    # sequence is a harmless extension and is useful to non-Sage frontends.
    if initial_points is not None:
        x_values.extend(float(value) for value in initial_points)
        x_values.sort()

    budget = _SampleBudget(limit)
    data: list[CurvePoint] = []
    excluded_points: list[float] = []
    last_index = len(x_values) - 1
    for index, x_value in enumerate(x_values):
        point, failure = _evaluate(function, x_value, imag_tol, budget)
        if point is not None:
            data.append(point)
            continue
        # Sage moves an exceptional endpoint slightly inward. A numerical NaN
        # remains an exclusion, which preserves symbolic log/sqrt behavior.
        if failure == "exception" and index in (0, last_index):
            direction = 1.0 if index == 0 else -1.0
            for attempt in range(1, 99):
                moved = x_value + direction * delta * attempt / 100.0
                point, _moved_failure = _evaluate(function, moved, imag_tol, budget)
                if point is not None:
                    data.append(point)
                    break
            else:
                excluded_points.append(x_value)
        else:
            excluded_points.append(x_value)

    scaled_tolerance = abs(delta) * tolerance
    index = 0
    while index < len(data) - 1:
        refined, newly_excluded = _adaptive_refinement_with_exclusions(
            function,
            data[index],
            data[index + 1],
            scaled_tolerance,
            recursion,
            imag_tol,
            budget,
        )
        excluded_points.extend(newly_excluded)
        if refined:
            data[index + 1 : index + 1] = refined
            index += len(refined)
        index += 1

    excluded_points = sorted(set(excluded_points))
    if excluded:
        return data, excluded_points
    return data


def _pole_between(left: CurvePoint, right: CurvePoint) -> bool:
    if not ((left[1] < 0 < right[1]) or (right[1] < 0 < left[1])):
        return False
    delta_x = right[0] - left[0]
    if delta_x == 0:
        return True
    slope = abs((right[1] - left[1]) / delta_x)
    return math.atan(slope) >= math.pi / 2.0 - 0.0001


def split_curve_segments(
    data: Sequence[CurvePoint],
    excluded_points: Sequence[float] = (),
    *,
    detect_poles: bool = False,
) -> tuple[list[list[CurvePoint]], list[tuple[CurvePoint, CurvePoint]]]:
    """Split sampled data without drawing across exclusions or detected poles."""
    points = list(data)
    if len(points) < 2:
        return [], []
    exclusions = sorted(float(value) for value in excluded_points)
    segments: list[list[CurvePoint]] = []
    poles: list[tuple[CurvePoint, CurvePoint]] = []
    start = 0
    exclusion_index = 0
    for index in range(len(points) - 1):
        left = points[index]
        right = points[index + 1]
        while (
            exclusion_index < len(exclusions) and exclusions[exclusion_index] < left[0]
        ):
            exclusion_index += 1
        excluded_between = (
            exclusion_index < len(exclusions)
            and left[0] <= exclusions[exclusion_index] <= right[0]
        )
        pole_between = detect_poles and _pole_between(left, right)
        if not excluded_between and not pole_between:
            continue
        candidate = points[start:index]
        if len(candidate) >= 2:
            segments.append(candidate)
        if pole_between:
            poles.append((left, right))
        start = index + 2
        while (
            exclusion_index < len(exclusions)
            and exclusions[exclusion_index] <= right[0]
        ):
            exclusion_index += 1
    candidate = points[start:]
    if len(candidate) >= 2:
        segments.append(candidate)
    return segments, poles


def sample_curve_segments(
    function: Callable[[float], Any],
    xrange: Sequence[Any],
    *,
    plot_points: int = 200,
    adaptive_tolerance: float = 0.01,
    adaptive_recursion: int = 5,
    randomize: bool = True,
    initial_points: Sequence[Any] | None = None,
    exclude: Sequence[Any] | None = None,
    detect_poles: bool = False,
    imaginary_tolerance: float = 1e-8,
    sample_limit: int = MAX_CURVE_SAMPLES,
) -> dict[str, Any]:
    """Return materialized points, exclusions, segments, and pole intervals."""
    explicit_exclusions = [] if exclude is None else [float(value) for value in exclude]
    seeded_points = [] if initial_points is None else list(initial_points)
    if explicit_exclusions:
        minimum = float(xrange[0])
        maximum = float(xrange[1])
        epsilon = 0.001 * (maximum - minimum)
        for value in explicit_exclusions:
            seeded_points.extend([value - epsilon, value + epsilon])
    points, discovered = generate_plot_points(
        function,
        xrange,
        plot_points=plot_points,
        adaptive_tolerance=adaptive_tolerance,
        adaptive_recursion=adaptive_recursion,
        randomize=randomize,
        initial_points=seeded_points if seeded_points else None,
        excluded=True,
        imaginary_tolerance=imaginary_tolerance,
        sample_limit=sample_limit,
    )
    all_exclusions = sorted(set(explicit_exclusions + discovered))
    segments, poles = split_curve_segments(
        points,
        all_exclusions,
        detect_poles=detect_poles,
    )
    return {
        "points": points,
        "excluded": all_exclusions,
        "segments": segments,
        "poles": poles,
        "sampling": {
            "range": [float(xrange[0]), float(xrange[1])],
            "plot_points": int(plot_points),
            "adaptive_tolerance": float(adaptive_tolerance),
            "adaptive_recursion": int(adaptive_recursion),
            "randomize": bool(randomize),
            "initial_points": [float(value) for value in seeded_points],
            "imaginary_tolerance": float(imaginary_tolerance),
            "sample_limit": int(sample_limit),
        },
    }


__all__ = [
    "MAX_CURVE_SAMPLES",
    "adaptive_refinement",
    "generate_plot_points",
    "sample_curve_segments",
    "split_curve_segments",
]
