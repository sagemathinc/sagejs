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


def _finite_float(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    converted = float(value)
    return converted if math.isfinite(converted) else None


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


def _retained_root_points(
    result: NumericalResult, through_sequence: int | None = None
) -> tuple[list[float], list[float], bool]:
    """Return only values already retained by the solver trace.

    Visualization is a pure result operation: callbacks may be expensive,
    stateful, unavailable after serialization, or already at their resource
    limit.  Evaluation traces retain signed function values.  Less detailed
    traces retain candidate/residual pairs, which are plotted explicitly as
    residual magnitudes rather than being presented as new evaluations.
    """
    x_values: list[float] = []
    y_values: list[float] = []
    for event in result.trace.events:
        if through_sequence is not None and event.sequence > through_sequence:
            continue
        if event.kind != "evaluation":
            continue
        data = event.data
        if "x" not in data or "value" not in data:
            continue
        x = _finite_float(data["x"])
        value = _finite_float(data["value"])
        if x is not None and value is not None:
            x_values.append(x)
            y_values.append(value)
    if x_values:
        return x_values, y_values, True
    for event in result.trace.events:
        if through_sequence is not None and event.sequence > through_sequence:
            continue
        if event.kind != "iteration":
            continue
        data = event.data
        if "candidate" not in data or "residual" not in data:
            continue
        candidate = _finite_float(data["candidate"])
        residual = _finite_float(data["residual"])
        if candidate is not None and residual is not None:
            x_values.append(candidate)
            y_values.append(abs(residual))
    if x_values:
        return x_values, y_values, False
    candidate = _candidate_value(result)
    residual = result.validation.residual
    if residual is not None and math.isfinite(float(residual)):
        return [candidate], [abs(float(residual))], False
    return [candidate], [0.0], False


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
    y_values: list[float],
    signed_evaluations: bool,
    event_data: dict[str, Any] | None = None,
) -> PlotSpec:
    bracket = _bracket_value(result, event_data)
    candidate = _candidate_value(result, event_data)
    candidate_y: float | None = None
    for index in range(len(x_values) - 1, -1, -1):
        if x_values[index] == candidate:
            candidate_y = y_values[index]
            break
    if candidate_y is None and event_data is not None:
        residual = event_data.get("residual")
        if isinstance(residual, (int, float)) and math.isfinite(float(residual)):
            candidate_y = abs(float(residual))
    layers = [
        make_layer(
            "point",
            {"x": x_values, "y": y_values},
            ordinal=0,
            source_intent={
                "operation": "scalar_root",
                "role": "evaluations" if signed_evaluations else "residual-progress",
            },
            style={"color": "#3366cc", "size": 6},
            legend={
                "label": (
                    "retained f(x) evaluations"
                    if signed_evaluations
                    else "retained residual magnitudes"
                ),
                "show": True,
            },
        ),
        make_layer(
            "line",
            {"x": bracket, "y": [0.0, 0.0]},
            ordinal=1,
            source_intent={"operation": "scalar_root", "role": "bracket"},
            style={"color": "#dd8452", "width": 5},
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
        axes_or_scene={
            "xaxis": {"title": {"text": "x"}},
            "yaxis": {"title": {"text": "f(x)"}},
        },
        viewport={"responsive": True},
        provenance=Provenance(
            "sagejs.numerics",
            source_language=str(result.problem.source_intent.get("language", "python")),
            constructor="root_plot",
            metadata={
                "problem_digest": result.problem.digest,
                "method": result.method,
                "truth_level": result.validation.truth_level,
                "computed_evidence_only": True,
                "callback_reevaluated": False,
            },
        ),
    )


def root_plot(result: NumericalResult) -> PlotSpec:
    """Return a static PlotSpec containing only retained solver evidence."""
    x_values, y_values, signed = _retained_root_points(result)
    records = [event.data for event in result.trace.events if event.kind == "iteration"]
    return _root_spec(
        result, x_values, y_values, signed, records[-1] if records else None
    )


def root_animation(result: NumericalResult) -> PlotAnimation:
    """Replay retained root iterations as a bounded PlotSpec animation."""
    data_records: list[tuple[int | None, dict[str, Any]]] = []
    for event in result.trace.events:
        if event.kind == "iteration":
            data_records.append((event.sequence, event.data))
    if len(data_records) == 0:
        data_records = [(None, {}), (None, {})]
    elif len(data_records) == 1:
        data_records = [(None, {}), data_records[0]]
    if len(data_records) > 64:
        indices = [(index * (len(data_records) - 1)) // 63 for index in range(64)]
        data_records = [data_records[index] for index in dict.fromkeys(indices)]
    frames: list[AnimationFrame] = []
    for index in range(len(data_records)):
        sequence, data = data_records[index]
        x_values, y_values, signed = _retained_root_points(result, sequence)
        frames.append(
            AnimationFrame(
                stable_frame_id(index),
                _root_spec(result, x_values, y_values, signed, data),
                label="iteration " + str(index),
                metadata={"trace_data": data, "interpolated": False},
            )
        )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=min(64, result.problem.trace_policy.max_events),
            max_total_samples=max(1024, len(frames) * 400),
            max_payload_bytes=max(1_000_000, result.problem.trace_policy.max_bytes * 4),
        ),
        metadata={
            "operation": "scalar_root",
            "problem_digest": result.problem.digest,
            "trace_truncated": result.trace.truncated,
            "computed_evidence_only": True,
            "callback_reevaluated": False,
        },
    )
