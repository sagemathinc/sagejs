"""Renderer-neutral PlotSpec views of numerical traces."""

from __future__ import annotations

import math
from typing import Any

from sagejs.plotting import (
    AnimationFrame,
    AnimationResourceLimits,
    AnimationTiming,
    PlotAnimation,
    PlotSpec,
    Provenance,
    make_layer,
    stable_frame_id,
)

from .model import NumericalResult


def _root_domain(result: NumericalResult) -> tuple[float, float]:
    bracket = result.problem.bounds.get("bracket")
    if isinstance(bracket, list) and len(bracket) == 2:
        return float(bracket[0]), float(bracket[1])
    candidates: list[float] = []
    points = result.problem.initial_data.get("points")
    if isinstance(points, list):
        candidates.extend(float(value) for value in points)
    if result.value is not None:
        candidates.append(float(result.value))
    if not candidates:
        return -1.0, 1.0
    center = candidates[-1]
    radius = max([abs(value - center) for value in candidates] + [1.0])
    return center - 1.25 * radius, center + 1.25 * radius


def _sample_root_function(
    result: NumericalResult, count: int = 129
) -> tuple[list[float], list[float | None]]:
    lower, upper = _root_domain(result)
    function = result.problem.function
    if function is None:
        raise ValueError("root visualization requires a live callback")
    x_values: list[float] = []
    y_values: list[float | None] = []
    for index in range(count):
        x = lower + (upper - lower) * index / (count - 1)
        x_values.append(x)
        try:
            value = float(function(x))
            y_values.append(value if math.isfinite(value) else None)
        except Exception:
            y_values.append(None)
    return x_values, y_values


def _candidate_value(
    result: NumericalResult, event_data: dict[str, Any] | None = None
) -> float:
    if (
        event_data is not None
        and "candidate" in event_data
        and event_data["candidate"] is not None
    ):
        return float(event_data["candidate"])
    if result.value is None:
        lower, upper = _root_domain(result)
        return lower + 0.5 * (upper - lower)
    return float(result.value)


def _bracket_value(
    result: NumericalResult, event_data: dict[str, Any] | None = None
) -> list[float]:
    if event_data is not None:
        bracket = event_data.get("bracket")
        if isinstance(bracket, list) and len(bracket) == 2:
            return [float(bracket[0]), float(bracket[1])]
    bracket = result.problem.bounds.get("bracket")
    if isinstance(bracket, list) and len(bracket) == 2:
        return [float(bracket[0]), float(bracket[1])]
    candidate = _candidate_value(result, event_data)
    return [candidate, candidate]


def _root_spec(
    result: NumericalResult,
    x_values: list[float],
    y_values: list[float | None],
    event_data: dict[str, Any] | None = None,
) -> PlotSpec:
    function = result.problem.function
    if function is None:
        raise ValueError("root visualization requires a live callback")
    bracket = _bracket_value(result, event_data)
    candidate = _candidate_value(result, event_data)
    bracket_y: list[float | None] = []
    for x in bracket:
        try:
            value = float(function(x))
            bracket_y.append(value if math.isfinite(value) else None)
        except Exception:
            bracket_y.append(None)
    try:
        candidate_y_value = float(function(candidate))
        candidate_y: float | None = (
            candidate_y_value if math.isfinite(candidate_y_value) else None
        )
    except Exception:
        candidate_y = None
    layers = [
        make_layer(
            "line",
            {"x": x_values, "y": y_values},
            ordinal=0,
            source_intent={"operation": "scalar_root", "role": "function"},
            style={"color": "#3366cc", "width": 2},
            legend={"label": "f(x)", "show": True},
        ),
        make_layer(
            "point",
            {"x": bracket, "y": bracket_y},
            ordinal=1,
            source_intent={"operation": "scalar_root", "role": "bracket"},
            style={"color": "#dd8452", "size": 9},
            legend={"label": "bracket", "show": True},
        ),
        make_layer(
            "point",
            {"x": [candidate], "y": [candidate_y]},
            ordinal=2,
            source_intent={"operation": "scalar_root", "role": "candidate"},
            style={"color": "#55a868", "size": 11},
            legend={"label": "candidate", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={"x": {"label": "x"}, "y": {"label": "f(x)"}},
        viewport={"responsive": True},
        provenance=Provenance(
            "sagejs.numerics",
            source_language=str(result.problem.source_intent.get("language", "python")),
            constructor="root_plot",
            metadata={
                "problem_digest": result.problem.digest,
                "method": result.method,
                "truth_level": result.validation.truth_level,
            },
        ),
    )


def root_plot(result: NumericalResult) -> PlotSpec:
    """Return a static semantic function/bracket/candidate PlotSpec."""
    x_values, y_values = _sample_root_function(result)
    return _root_spec(result, x_values, y_values)


def root_animation(result: NumericalResult) -> PlotAnimation:
    """Replay retained root iterations as a bounded PlotSpec animation."""
    x_values, y_values = _sample_root_function(result)
    data_records: list[dict[str, Any]] = []
    for event in result.trace.events:
        if event.kind == "iteration":
            data_records.append(event.data)
    if len(data_records) == 0:
        data_records = [{}, {}]
    elif len(data_records) == 1:
        data_records = [{}, data_records[0]]
    frames: list[AnimationFrame] = []
    for index in range(len(data_records)):
        frames.append(
            AnimationFrame(
                stable_frame_id(index),
                _root_spec(result, x_values, y_values, data_records[index]),
                label="iteration " + str(index),
                metadata={"trace_data": data_records[index]},
            )
        )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=result.problem.trace_policy.max_events,
            max_total_samples=max(1024, len(frames) * 400),
            max_payload_bytes=max(1_000_000, result.problem.trace_policy.max_bytes * 4),
        ),
        metadata={
            "operation": "scalar_root",
            "problem_digest": result.problem.digest,
            "trace_truncated": result.trace.truncated,
        },
    )
