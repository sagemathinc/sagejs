"""PlotSpec-ready objective, path, residual, and fitted-model views."""

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

from ._core import OptimizationResult


def _provenance(result: OptimizationResult, constructor: str) -> Provenance:
    return Provenance(
        "sagejs.numerics.optimization",
        source_language=str(result.problem.source_intent.get("language", "python")),
        constructor=constructor,
        metadata={
            "problem_digest": result.problem.digest,
            "operation": result.problem.operation,
            "method": result.method,
            "truth_level": result.validation.truth_level,
        },
    )


def _iteration_records(result: OptimizationResult) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for event in result.trace.events:
        if event.kind == "iteration":
            records.append(event.data)
    return records


def _scalar_plot(result: OptimizationResult) -> PlotSpec:
    interval = result.problem.bounds.get("interval")
    function = result.problem.function
    if not isinstance(interval, list) or len(interval) != 2 or function is None:
        raise ValueError("scalar optimization plot requires a live bounded objective")
    lower = float(interval[0])
    upper = float(interval[1])
    x_values: list[float] = []
    y_values: list[float | None] = []
    for index in range(129):
        x_value = lower + (upper - lower) * index / 128.0
        x_values.append(x_value)
        try:
            y_value = float(function(x_value))
            y_values.append(y_value if math.isfinite(y_value) else None)
        except Exception:
            y_values.append(None)
    path_x: list[float] = []
    path_y: list[float] = []
    for record in _iteration_records(result):
        if isinstance(record.get("candidate"), (int, float)) and isinstance(
            record.get("objective"), (int, float)
        ):
            path_x.append(float(record["candidate"]))
            path_y.append(float(record["objective"]))
    if isinstance(result.value, (int, float)) and result.objective is not None:
        path_x.append(float(result.value))
        path_y.append(float(result.objective))
    return PlotSpec(
        2,
        [
            make_layer(
                "line",
                {"x": x_values, "y": y_values},
                ordinal=0,
                source_intent={"operation": "scalar_minimum", "role": "objective"},
                style={"color": "#3366cc", "width": 2},
                legend={"label": "objective", "show": True},
            ),
            make_layer(
                "point",
                {"x": path_x, "y": path_y},
                ordinal=1,
                source_intent={"operation": "scalar_minimum", "role": "path"},
                style={"color": "#dd8452", "size": 8},
                legend={"label": "accepted candidates", "show": True},
            ),
        ],
        axes_or_scene={"x": {"label": "x"}, "y": {"label": "objective"}},
        viewport={"responsive": True},
        provenance=_provenance(result, "scalar_minimum_plot"),
    )


def _fit_plot(result: OptimizationResult) -> PlotSpec:
    payload = result.domain_payload
    x_values = payload.get("fit_x")
    y_values = payload.get("fit_y")
    fitted_values = payload.get("fitted_values")
    if not (
        isinstance(x_values, list)
        and isinstance(y_values, list)
        and isinstance(fitted_values, list)
    ):
        raise ValueError("fit visualization requires retained fit data")
    order = sorted(range(len(x_values)), key=lambda index: float(x_values[index]))
    sorted_x = [float(x_values[index]) for index in order]
    sorted_fitted = [float(fitted_values[index]) for index in order]
    residual_x: list[float | None] = []
    residual_y: list[float | None] = []
    for index in range(len(x_values)):
        residual_x.extend([float(x_values[index]), float(x_values[index]), None])
        residual_y.extend([float(y_values[index]), float(fitted_values[index]), None])
    return PlotSpec(
        2,
        [
            make_layer(
                "point",
                {
                    "x": [float(value) for value in x_values],
                    "y": [float(value) for value in y_values],
                },
                ordinal=0,
                source_intent={
                    "operation": result.problem.operation,
                    "role": "observations",
                },
                style={"color": "#3366cc", "size": 8},
                legend={"label": "observations", "show": True},
            ),
            make_layer(
                "line",
                {"x": sorted_x, "y": sorted_fitted},
                ordinal=1,
                source_intent={
                    "operation": result.problem.operation,
                    "role": "fitted_model",
                },
                style={"color": "#55a868", "width": 2},
                legend={"label": "fitted model", "show": True},
            ),
            make_layer(
                "line",
                {"x": residual_x, "y": residual_y},
                ordinal=2,
                source_intent={
                    "operation": result.problem.operation,
                    "role": "residual_sticks",
                },
                style={"color": "#c44e52", "width": 1},
                legend={"label": "residuals", "show": True},
            ),
        ],
        axes_or_scene={"x": {"label": "x"}, "y": {"label": "y"}},
        viewport={"responsive": True},
        provenance=_provenance(result, "fit_plot"),
    )


def _path_plot(
    result: OptimizationResult, records: list[dict[str, Any]] | None = None
) -> PlotSpec:
    selected = _iteration_records(result) if records is None else records
    points: list[list[float]] = []
    values: list[float] = []
    for record in selected:
        point = record.get("point")
        if isinstance(point, list) and len(point) > 0:
            points.append([float(value) for value in point])
            measure = record.get(
                "objective", record.get("cost", record.get("residual_norm"))
            )
            values.append(float(measure) if isinstance(measure, (int, float)) else 0.0)
    if len(points) == 0 and isinstance(result.value, list):
        points.append([float(value) for value in result.value])
        values.append(float(result.objective or 0.0))
    if len(points) > 0 and len(points[0]) >= 2:
        x_values = [point[0] for point in points]
        y_values = [point[1] for point in points]
        axes = {"x": {"label": "parameter 0"}, "y": {"label": "parameter 1"}}
        data = {"x": x_values, "y": y_values}
        role = "parameter_path"
    else:
        data = {"x": list(range(len(values))), "y": values}
        axes = {"x": {"label": "iteration"}, "y": {"label": "objective / residual"}}
        role = "convergence_history"
    layers = [
        make_layer(
            "line",
            data,
            ordinal=0,
            source_intent={"operation": result.problem.operation, "role": role},
            style={"color": "#3366cc", "width": 2},
            legend={"label": role.replace("_", " "), "show": True},
        ),
        make_layer(
            "point",
            data,
            ordinal=1,
            source_intent={
                "operation": result.problem.operation,
                "role": "accepted_iterates",
            },
            style={"color": "#dd8452", "size": 7},
            legend={"label": "accepted iterates", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene=axes,
        viewport={"responsive": True},
        provenance=_provenance(result, "optimization_path_plot"),
    )


def optimization_plot(result: OptimizationResult) -> PlotSpec:
    """Return the operation-appropriate static semantic PlotSpec."""
    if result.problem.operation == "scalar_minimum":
        return _scalar_plot(result)
    if result.problem.operation in ("linear_fit", "curve_fit"):
        return _fit_plot(result)
    return _path_plot(result)


def optimization_animation(result: OptimizationResult) -> PlotAnimation:
    """Replay retained accepted iterates with topology-stable path frames."""
    records = _iteration_records(result)
    if len(records) == 0:
        records = [{}, {}]
    elif len(records) == 1:
        records = [{}, records[0]]
    frames: list[AnimationFrame] = []
    for index in range(len(records)):
        prefix = records[: index + 1]
        frames.append(
            AnimationFrame(
                stable_frame_id(index),
                _path_plot(result, prefix),
                label="iteration " + str(index),
                metadata={"trace_data": records[index]},
            )
        )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=result.problem.trace_policy.max_events,
            max_total_samples=max(1024, len(frames) * 32),
            max_payload_bytes=max(1_000_000, result.problem.trace_policy.max_bytes * 4),
        ),
        metadata={
            "operation": result.problem.operation,
            "problem_digest": result.problem.digest,
            "trace_truncated": result.trace.truncated,
        },
    )
