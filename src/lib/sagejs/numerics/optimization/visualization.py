"""Canonical PlotSpec and PlotAnimation views of optimization evidence."""

from __future__ import annotations

import math
from typing import Any

from sagejs.plotting import (
    AnimationControls,
    AnimationFrame,
    AnimationResourceLimits,
    AnimationTiming,
    Axes2DSettings,
    AxisSettings,
    PlotAnimation,
    PlotSpec,
    Provenance,
    make_layer,
    stable_frame_id,
)

from ._core import OptimizationResult

MAX_FIT_PLOT_OBSERVATIONS = 2_048
MAX_FIT_ANIMATION_OBSERVATIONS = 256
MAX_OPTIMIZATION_ANIMATION_FRAMES = 128
MAX_OPTIMIZATION_ANIMATION_SAMPLES = 1_000_000
MAX_OPTIMIZATION_ANIMATION_BYTES = 16_000_000


AxisRange = list[float] | None
AxisRanges = tuple[AxisRange, AxisRange]


def _finite_axis_range(values: list[float]) -> AxisRange:
    finite = [float(value) for value in values if math.isfinite(float(value))]
    if len(finite) == 0:
        return None
    lower = min(finite)
    upper = max(finite)
    scale = max(abs(lower), abs(upper))
    padding = scale * 0.05 if scale > 0.0 else 1.0
    padded_lower = lower - padding
    padded_upper = upper + padding
    if math.isfinite(padded_lower) and math.isfinite(padded_upper):
        if padded_lower != padded_upper:
            return [padded_lower, padded_upper]
    if lower != upper:
        return [lower, upper]
    return None


def _axes(
    x_label: str,
    y_label: str,
    *,
    equal_aspect: bool = False,
    ranges: AxisRanges | None = None,
) -> dict[str, Any]:
    x_range, y_range = (None, None) if ranges is None else ranges
    return Axes2DSettings(
        AxisSettings(label=x_label, range=x_range, autorange=x_range is None),
        AxisSettings(label=y_label, range=y_range, autorange=y_range is None),
        equal_aspect=equal_aspect,
    ).to_dict()


def _progress_records(result: OptimizationResult) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for event in result.trace.events:
        if event.kind not in ("iteration", "phase"):
            continue
        event_record = event.to_dict()
        data = dict(event.data)
        data["trace_sequence"] = event_record["sequence"]
        data["trace_iteration"] = event_record["iteration"]
        data["trace_kind"] = event.kind
        data["trace_accepted"] = event_record["accepted"]
        records.append(data)
    return records


def _final_record(result: OptimizationResult) -> dict[str, Any]:
    record: dict[str, Any] = {
        "source": "final_result",
        "trace_iteration": result.iterations,
    }
    if isinstance(result.value, list):
        record["point"] = [float(value) for value in result.value]
    elif isinstance(result.value, (int, float)):
        record["candidate"] = float(result.value)
    if result.objective is not None:
        record["objective"] = result.objective
        record["cost"] = result.objective
    payload = result.domain_payload
    if isinstance(payload.get("residual_norm"), (int, float)):
        record["residual_norm"] = float(payload["residual_norm"])
    if isinstance(payload.get("fitted_values"), list):
        record["fitted_values"] = [float(value) for value in payload["fitted_values"]]
    return record


def _story_records(result: OptimizationResult) -> list[dict[str, Any]]:
    records = _progress_records(result)
    final = _final_record(result)
    if len(final) > 2 or len(records) == 0:
        records.append(final)
    return records


def _decimate_records(
    records: list[dict[str, Any]], maximum: int
) -> list[dict[str, Any]]:
    if len(records) <= maximum:
        return list(records)
    if maximum < 2:
        raise ValueError("record budget must retain first and last states")
    selected = [records[0]]
    interior = maximum - 2
    for ordinal in range(1, interior + 1):
        index = (ordinal * (len(records) - 1)) // (interior + 1)
        selected.append(records[index])
    selected.append(records[-1])
    return selected


def _outcome_text(result: OptimizationResult) -> str:
    if result.success:
        return "validated result"
    if result.status == "converged":
        return "solver convergence not supported by independent validation"
    return "stopped: " + result.status.replace("_", " ")


def _diagnostic_codes(result: OptimizationResult) -> list[str]:
    return [item.code for item in result.diagnostics]


def _annotations(result: OptimizationResult, alt_text: str) -> list[dict[str, Any]]:
    color = "#1b5e20" if result.success else "#8b1a1a"
    return [
        {"kind": "alt_text", "text": alt_text},
        {
            "id": "optimization-outcome",
            "text": result.method + ": " + _outcome_text(result),
            "x": 0.01,
            "y": 0.99,
            "xref": "paper",
            "yref": "paper",
            "showarrow": False,
            "xanchor": "left",
            "yanchor": "top",
            "font": {"color": color, "size": 12},
        },
    ]


def _provenance(
    result: OptimizationResult,
    constructor: str,
    alt_text: str,
    **metadata: Any,
) -> Provenance:
    details: dict[str, Any] = {
        "problem_digest": result.problem.digest,
        "operation": result.problem.operation,
        "method": result.method,
        "truth_level": result.validation.truth_level,
        "success": result.success,
        "status": result.status,
        "trace_level": result.problem.trace_policy.level,
        "trace_truncated": result.trace.truncated,
        "diagnostic_codes": _diagnostic_codes(result),
        "alt_text": alt_text,
        "callback_replayed": False,
    }
    details.update(metadata)
    return Provenance(
        "sagejs.numerics.optimization",
        source_language=str(result.problem.source_intent.get("language", "python")),
        constructor=constructor,
        metadata=details,
    )


def _scalar_alt_text(
    result: OptimizationResult,
    path_count: int,
    *,
    show_result: bool,
) -> str:
    interval = result.problem.bounds.get("interval")
    state_word = "state" if path_count == 1 else "states"
    answer = (
        "Bounded scalar optimization on "
        + str(interval)
        + " with "
        + str(path_count)
        + " retained finite objective "
        + state_word
        + "; the objective callback was not "
        "replayed. Interval endpoints are shown on an objective-reference "
        "baseline. "
    )
    if show_result and isinstance(result.value, (int, float)):
        answer += "Returned x=" + str(result.value) + ". "
    answer += "Outcome: " + _outcome_text(result) + "."
    if result.trace.truncated:
        answer += " The trace was deterministically truncated."
    return answer


def _scalar_plot(
    result: OptimizationResult,
    records: list[dict[str, Any]] | None = None,
    *,
    show_result: bool = True,
    axis_ranges: AxisRanges | None = None,
    reference_y_override: float | None = None,
) -> PlotSpec:
    selected = _story_records(result) if records is None else records
    path_x: list[float] = []
    path_y: list[float] = []
    for record in selected:
        candidate = record.get("candidate")
        objective = record.get("objective")
        if isinstance(candidate, (int, float)) and isinstance(objective, (int, float)):
            path_x.append(float(candidate))
            path_y.append(float(objective))
    interval = result.problem.bounds.get("interval")
    interval_x = (
        [float(interval[0]), float(interval[1])]
        if isinstance(interval, list) and len(interval) == 2
        else []
    )
    reference_y = (
        float(reference_y_override)
        if reference_y_override is not None
        else min(path_y)
        if len(path_y) > 0
        else 0.0
    )
    interval_y = [reference_y for _ in interval_x]
    returned_x: list[float] = []
    returned_y: list[float | None] = []
    if show_result and isinstance(result.value, (int, float)):
        returned_x.append(float(result.value))
        returned_y.append(result.objective)
    alt_text = _scalar_alt_text(
        result,
        len(path_x),
        show_result=show_result,
    )
    layers = [
        make_layer(
            "line",
            {"x": path_x, "y": path_y},
            ordinal=0,
            namespace="optimization",
            source_intent={
                "operation": "scalar_minimum",
                "role": "retained_objective_path",
                "evidence": "retained_solver_states",
            },
            style={"color": "#3366cc", "width": 2},
            legend={"label": "retained objective path", "show": True},
        ),
        make_layer(
            "line",
            {"x": interval_x, "y": interval_y},
            ordinal=1,
            namespace="optimization",
            source_intent={
                "operation": "scalar_minimum",
                "role": "finite_interval_reference",
                "placement": "minimum_retained_objective_baseline",
            },
            style={"color": "#7a7a7a", "width": 1, "dash": "dash"},
            legend={"label": "finite interval", "show": True},
        ),
        make_layer(
            "point",
            {"x": interval_x, "y": interval_y},
            ordinal=2,
            namespace="optimization",
            source_intent={
                "operation": "scalar_minimum",
                "role": "finite_interval_bounds",
            },
            style={"color": "#7a7a7a", "size": 8, "symbol": "diamond"},
            legend={"label": "interval bounds", "show": True},
        ),
        make_layer(
            "point",
            {"x": path_x, "y": path_y},
            ordinal=3,
            namespace="optimization",
            source_intent={
                "operation": "scalar_minimum",
                "role": "retained_incumbents",
            },
            style={"color": "#dd8452", "size": 7},
            legend={"label": "retained incumbents", "show": True},
        ),
        make_layer(
            "point",
            {"x": returned_x, "y": returned_y},
            ordinal=4,
            namespace="optimization",
            source_intent={
                "operation": "scalar_minimum",
                "role": "returned_candidate",
                "validation_passed": result.validation.passed,
            },
            style={
                "color": "#55a868" if result.success else "#c44e52",
                "size": 12,
                "symbol": "star",
            },
            legend={"label": "returned candidate", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes("x", "objective", ranges=axis_ranges),
        viewport={"responsive": True},
        annotations=_annotations(result, alt_text),
        provenance=_provenance(
            result,
            "scalar_minimum_plot",
            alt_text,
            retained_objective_state_count=len(path_x),
        ),
    )


def _sample_indices(count: int, maximum: int) -> list[int]:
    if count <= maximum:
        return list(range(count))
    if maximum < 2:
        return [0]
    indices: list[int] = []
    for ordinal in range(maximum):
        index = (ordinal * (count - 1)) // (maximum - 1)
        if len(indices) == 0 or indices[-1] != index:
            indices.append(index)
    return indices


def _fit_data(result: OptimizationResult) -> tuple[list[Any], list[Any], Any]:
    payload = result.domain_payload
    x_values = payload.get("fit_x", result.problem.initial_data.get("fit_x"))
    y_values = payload.get("fit_y", result.problem.initial_data.get("fit_y"))
    fitted_values = payload.get("fitted_values")
    if not isinstance(x_values, list) or not isinstance(y_values, list):
        raise ValueError("fit visualization requires retained fit data")
    return x_values, y_values, fitted_values


def _fit_plot(
    result: OptimizationResult,
    fitted_override: list[float] | None = None,
    axis_ranges: AxisRanges | None = None,
) -> PlotSpec:
    x_values, y_values, retained_fitted = _fit_data(result)
    fitted_source: Any = retained_fitted if fitted_override is None else fitted_override
    fitted_available = isinstance(fitted_source, list) and len(fitted_source) == len(
        x_values
    )
    indices = _sample_indices(len(x_values), MAX_FIT_PLOT_OBSERVATIONS)
    sampled_x = [float(x_values[index]) for index in indices]
    sampled_y = [float(y_values[index]) for index in indices]
    sampled_fitted: list[float | None] = []
    for index in indices:
        if fitted_available:
            value = float(fitted_source[index])
            sampled_fitted.append(value if math.isfinite(value) else None)
        else:
            sampled_fitted.append(None)
    order = sorted(range(len(sampled_x)), key=lambda index: sampled_x[index])
    sorted_x = [sampled_x[index] for index in order]
    sorted_fitted = [sampled_fitted[index] for index in order]
    residual_x: list[float | None] = []
    residual_y: list[float | None] = []
    for index in range(len(sampled_x)):
        residual_x.extend([sampled_x[index], sampled_x[index], None])
        residual_y.extend([sampled_y[index], sampled_fitted[index], None])
    fit_sentence = (
        "The fitted model and residual sticks are shown. "
        if fitted_available
        else "No fitted model is available. "
    )
    alt_text = (
        str(result.problem.operation).replace("_", " ")
        + " with "
        + str(len(x_values))
        + " observations; "
        + str(len(indices))
        + " are displayed. "
        + fit_sentence
        + "Outcome: "
        + _outcome_text(result)
        + "."
    )
    parameter_diagnostics = result.domain_payload.get("parameter_diagnostics")
    if (
        isinstance(parameter_diagnostics, dict)
        and parameter_diagnostics.get("rank_deficient_or_ill_conditioned") is True
    ):
        alt_text += " Parameter estimates are rank-deficient or ill-conditioned."
    layers = [
        make_layer(
            "point",
            {"x": sampled_x, "y": sampled_y},
            ordinal=0,
            namespace="optimization",
            source_intent={
                "operation": result.problem.operation,
                "role": "observations",
            },
            style={"color": "#3366cc", "size": 8},
            legend={"label": "observations", "show": True},
            metadata={"original_count": len(x_values), "displayed_count": len(indices)},
        ),
        make_layer(
            "line",
            {"x": sorted_x, "y": sorted_fitted},
            ordinal=1,
            namespace="optimization",
            source_intent={
                "operation": result.problem.operation,
                "role": "fitted_model",
                "available": fitted_available,
            },
            style={"color": "#55a868", "width": 2},
            legend={"label": "fitted model", "show": True},
        ),
        make_layer(
            "line",
            {"x": residual_x, "y": residual_y},
            ordinal=2,
            namespace="optimization",
            source_intent={
                "operation": result.problem.operation,
                "role": "residual_sticks",
                "available": fitted_available,
            },
            style={"color": "#c44e52", "width": 1},
            legend={"label": "residuals", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes("x", "observed / fitted value", ranges=axis_ranges),
        viewport={"responsive": True},
        annotations=_annotations(result, alt_text),
        provenance=_provenance(
            result,
            "fit_plot",
            alt_text,
            original_observation_count=len(x_values),
            displayed_observation_count=len(indices),
            fitted_values_available=fitted_available,
        ),
    )


def _problem_dimension(result: OptimizationResult) -> int:
    point = result.problem.initial_data.get("point")
    return len(point) if isinstance(point, list) else 0


def _record_point(record: dict[str, Any]) -> list[float] | None:
    point = record.get("point")
    if not isinstance(point, list) or len(point) == 0:
        return None
    return [float(value) for value in point]


def _record_measure(record: dict[str, Any], operation: str) -> tuple[float | None, str]:
    if operation in ("nonlinear_system", "nonlinear_least_squares"):
        names = ("residual_norm", "cost", "objective", "projected_gradient_norm")
    else:
        names = ("objective", "cost", "projected_gradient_norm", "residual_norm")
    for name in names:
        value = record.get(name)
        if isinstance(value, (int, float)):
            return float(value), name
    return None, "progress_measure"


def _animation_axis_ranges(
    result: OptimizationResult,
    records: list[dict[str, Any]],
) -> AxisRanges:
    if result.problem.operation == "scalar_minimum":
        interval = result.problem.bounds.get("interval")
        x_values = (
            [float(interval[0]), float(interval[1])]
            if isinstance(interval, list) and len(interval) == 2
            else []
        )
        y_values: list[float] = []
        for record in records:
            candidate = record.get("candidate")
            if isinstance(candidate, (int, float)):
                x_values.append(float(candidate))
            objective = record.get("objective")
            if isinstance(objective, (int, float)):
                y_values.append(float(objective))
        return _finite_axis_range(x_values), _finite_axis_range(y_values)
    if result.problem.operation in ("linear_fit", "curve_fit"):
        fit_x, fit_y, _ = _fit_data(result)
        x_values = [float(value) for value in fit_x]
        y_values = [float(value) for value in fit_y]
        for record in records:
            fitted = record.get("fitted_values")
            if isinstance(fitted, list):
                y_values.extend(float(value) for value in fitted)
        return _finite_axis_range(x_values), _finite_axis_range(y_values)
    points: list[list[float]] = []
    measures: list[float] = []
    iterations: list[float] = []
    for ordinal, record in enumerate(records):
        point = _record_point(record)
        if point is not None:
            points.append(point)
        measure, _ = _record_measure(record, result.problem.operation)
        if measure is not None:
            measures.append(measure)
        iteration = record.get("trace_iteration")
        iterations.append(
            float(iteration) if isinstance(iteration, (int, float)) else float(ordinal)
        )
    if _problem_dimension(result) == 2 and len(points) > 0:
        x_values = [point[0] for point in points if len(point) >= 2]
        y_values = [point[1] for point in points if len(point) >= 2]
        variables = result.problem.bounds.get("variables")
        if isinstance(variables, list) and len(variables) >= 2:
            for axis, values in ((0, x_values), (1, y_values)):
                bound = variables[axis]
                if isinstance(bound, list):
                    values.extend(
                        float(value)
                        for value in bound
                        if isinstance(value, (int, float))
                    )
        return _finite_axis_range(x_values), _finite_axis_range(y_values)
    return _finite_axis_range(iterations), _finite_axis_range(measures)


def _latest_simplex(records: list[dict[str, Any]]) -> list[list[float]]:
    for record in reversed(records):
        simplex = record.get("simplex")
        if not isinstance(simplex, list):
            continue
        converted = [[float(value) for value in vertex] for vertex in simplex]
        if len(converted) >= 2 and all(len(vertex) >= 2 for vertex in converted):
            return converted
    return []


def _simplex_data(records: list[dict[str, Any]]) -> dict[str, Any]:
    simplex = _latest_simplex(records)
    if len(simplex) == 0:
        return {"x": [], "y": []}
    closed = simplex + [simplex[0]]
    return {
        "x": [vertex[0] for vertex in closed],
        "y": [vertex[1] for vertex in closed],
    }


def _box_bound_data(
    result: OptimizationResult, points: list[list[float]]
) -> dict[str, Any]:
    bounds = result.problem.bounds.get("variables")
    if not isinstance(bounds, list) or len(bounds) < 2:
        return {"x": [], "y": []}
    x_values = [point[0] for point in points if len(point) >= 2]
    y_values = [point[1] for point in points if len(point) >= 2]
    for index, values in ((0, x_values), (1, y_values)):
        item = bounds[index]
        if isinstance(item, list) and len(item) == 2:
            for bound in item:
                if isinstance(bound, (int, float)):
                    values.append(float(bound))
    if len(x_values) == 0:
        x_values = [-1.0, 1.0]
    if len(y_values) == 0:
        y_values = [-1.0, 1.0]
    x_min, x_max = min(x_values), max(x_values)
    y_min, y_max = min(y_values), max(y_values)
    if x_min == x_max:
        x_min -= 1.0
        x_max += 1.0
    if y_min == y_max:
        y_min -= 1.0
        y_max += 1.0
    segment_x: list[float | None] = []
    segment_y: list[float | None] = []
    for bound in bounds[0] if isinstance(bounds[0], list) else []:
        if isinstance(bound, (int, float)):
            segment_x.extend([float(bound), float(bound), None])
            segment_y.extend([y_min, y_max, None])
    for bound in bounds[1] if isinstance(bounds[1], list) else []:
        if isinstance(bound, (int, float)):
            segment_x.extend([x_min, x_max, None])
            segment_y.extend([float(bound), float(bound), None])
    return {"x": segment_x, "y": segment_y}


def _active_bound_point(
    result: OptimizationResult, point: list[float] | None
) -> dict[str, Any]:
    bounds = result.problem.bounds.get("variables")
    if point is None or not isinstance(bounds, list):
        return {"x": [], "y": []}
    active = False
    for index in range(min(len(point), len(bounds))):
        item = bounds[index]
        if not isinstance(item, list) or len(item) != 2:
            continue
        tolerance = 1.0e-10 * max(1.0, abs(point[index]))
        for bound in item:
            if (
                isinstance(bound, (int, float))
                and abs(point[index] - float(bound)) <= tolerance
            ):
                active = True
    return {"x": [point[0]] if active else [], "y": [point[1]] if active else []}


def _path_alt_text(
    result: OptimizationResult,
    mode: str,
    state_count: int,
    *,
    simplex_shown: bool,
    bounds_shown: bool,
) -> str:
    answer = (
        str(result.problem.operation).replace("_", " ")
        + " "
        + mode.replace("_", " ")
        + " with "
        + str(state_count)
        + " retained states. Outcome: "
        + _outcome_text(result)
        + "."
    )
    if simplex_shown:
        answer += " The latest retained Nelder-Mead simplex is shown."
    if bounds_shown:
        answer += " Finite box bounds and any active retained iterate are shown."
    diagnostics = result.domain_payload.get("parameter_diagnostics")
    if (
        isinstance(diagnostics, dict)
        and diagnostics.get("rank_deficient_or_ill_conditioned") is True
    ):
        answer += " Parameter estimates are rank-deficient or ill-conditioned."
    if result.trace.truncated:
        answer += " The trace was deterministically truncated."
    return answer


def _path_plot(
    result: OptimizationResult,
    records: list[dict[str, Any]] | None = None,
    *,
    show_result: bool = True,
    axis_ranges: AxisRanges | None = None,
) -> PlotSpec:
    selected = _story_records(result) if records is None else records
    points: list[list[float]] = []
    measures: list[float | None] = []
    measure_name = "progress_measure"
    iterations: list[float] = []
    for ordinal, record in enumerate(selected):
        point = _record_point(record)
        if point is not None:
            points.append(point)
        measure, name = _record_measure(record, result.problem.operation)
        measures.append(measure)
        if measure is not None:
            measure_name = name
        iteration = record.get("trace_iteration")
        iterations.append(
            float(iteration) if isinstance(iteration, (int, float)) else float(ordinal)
        )
    dimension = _problem_dimension(result)
    parameter_plane = (
        dimension == 2 and len(points) > 0 and all(len(point) >= 2 for point in points)
    )
    layers: list[Any] = []
    simplex_shown = result.method == "nelder-mead" and parameter_plane
    bounds_shown = result.method == "projected-bfgs" and parameter_plane
    if parameter_plane:
        path_data = {
            "x": [point[0] for point in points],
            "y": [point[1] for point in points],
        }
        latest_point = points[-1] if len(points) > 0 else None
        returned_data = (
            {"x": [float(result.value[0])], "y": [float(result.value[1])]}
            if show_result and isinstance(result.value, list) and len(result.value) >= 2
            else {"x": [], "y": []}
        )
        layers.extend(
            [
                make_layer(
                    "line",
                    path_data,
                    ordinal=0,
                    namespace="optimization",
                    source_intent={
                        "operation": result.problem.operation,
                        "role": "parameter_path",
                    },
                    style={"color": "#3366cc", "width": 2},
                    legend={"label": "parameter path", "show": True},
                ),
                make_layer(
                    "point",
                    path_data,
                    ordinal=1,
                    namespace="optimization",
                    source_intent={
                        "operation": result.problem.operation,
                        "role": "retained_iterates",
                    },
                    style={"color": "#dd8452", "size": 7},
                    legend={"label": "retained iterates", "show": True},
                ),
                make_layer(
                    "point",
                    returned_data,
                    ordinal=2,
                    namespace="optimization",
                    source_intent={
                        "operation": result.problem.operation,
                        "role": "returned_point",
                        "validation_passed": result.validation.passed,
                    },
                    style={
                        "color": "#55a868" if result.success else "#c44e52",
                        "size": 12,
                        "symbol": "star",
                    },
                    legend={"label": "returned point", "show": True},
                ),
            ]
        )
        if simplex_shown:
            layers.append(
                make_layer(
                    "line",
                    _simplex_data(selected),
                    ordinal=3,
                    namespace="optimization",
                    source_intent={
                        "operation": result.problem.operation,
                        "role": "simplex",
                    },
                    style={"color": "#8172b2", "width": 1},
                    legend={"label": "current simplex", "show": True},
                )
            )
        if bounds_shown:
            layers.extend(
                [
                    make_layer(
                        "line",
                        _box_bound_data(result, points),
                        ordinal=4,
                        namespace="optimization",
                        source_intent={
                            "operation": result.problem.operation,
                            "role": "finite_box_bounds",
                        },
                        style={"color": "#7a7a7a", "width": 2, "dash": "dash"},
                        legend={"label": "finite box bounds", "show": True},
                    ),
                    make_layer(
                        "point",
                        _active_bound_point(result, latest_point),
                        ordinal=5,
                        namespace="optimization",
                        source_intent={
                            "operation": result.problem.operation,
                            "role": "active_bound_iterate",
                        },
                        style={"color": "#cc0000", "size": 10, "symbol": "x"},
                        legend={"label": "active bound", "show": True},
                    ),
                ]
            )
        axes = _axes(
            "parameter 0",
            "parameter 1",
            equal_aspect=True,
            ranges=axis_ranges,
        )
        mode = "parameter_path"
        state_count = len(points)
    else:
        history_data = {"x": iterations, "y": measures}
        returned_data = (
            {"x": [iterations[-1]], "y": [measures[-1]]}
            if show_result and result.value is not None and len(iterations) > 0
            else {"x": [], "y": []}
        )
        layers.extend(
            [
                make_layer(
                    "line",
                    history_data,
                    ordinal=0,
                    namespace="optimization",
                    source_intent={
                        "operation": result.problem.operation,
                        "role": "convergence_history",
                        "measure": measure_name,
                    },
                    style={"color": "#3366cc", "width": 2},
                    legend={"label": measure_name.replace("_", " "), "show": True},
                ),
                make_layer(
                    "point",
                    history_data,
                    ordinal=1,
                    namespace="optimization",
                    source_intent={
                        "operation": result.problem.operation,
                        "role": "retained_progress",
                        "measure": measure_name,
                    },
                    style={"color": "#dd8452", "size": 7},
                    legend={"label": "retained progress", "show": True},
                ),
                make_layer(
                    "point",
                    returned_data,
                    ordinal=2,
                    namespace="optimization",
                    source_intent={
                        "operation": result.problem.operation,
                        "role": "returned_measure",
                        "validation_passed": result.validation.passed,
                    },
                    style={
                        "color": "#55a868" if result.success else "#c44e52",
                        "size": 12,
                        "symbol": "star",
                    },
                    legend={"label": "returned result", "show": True},
                ),
            ]
        )
        axes = _axes("iteration", measure_name.replace("_", " "), ranges=axis_ranges)
        mode = "convergence_history"
        state_count = len(selected)
    alt_text = _path_alt_text(
        result,
        mode,
        state_count,
        simplex_shown=simplex_shown,
        bounds_shown=bounds_shown,
    )
    return PlotSpec(
        2,
        layers,
        axes_or_scene=axes,
        viewport={"responsive": True},
        annotations=_annotations(result, alt_text),
        provenance=_provenance(
            result,
            "optimization_path_plot",
            alt_text,
            view=mode,
            retained_state_count=state_count,
            simplex_shown=simplex_shown,
            box_bounds_shown=bounds_shown,
        ),
    )


def optimization_plot(result: OptimizationResult) -> PlotSpec:
    """Return an operation-specific accessible canonical PlotSpec."""
    if result.problem.operation == "scalar_minimum":
        return _scalar_plot(result)
    if result.problem.operation in ("linear_fit", "curve_fit"):
        return _fit_plot(result)
    return _path_plot(result)


def optimization_animation(result: OptimizationResult) -> PlotAnimation:
    """Replay bounded retained evidence as a topology-stable PlotAnimation."""
    if result.problem.trace_policy.level == "none":
        raise ValueError(
            "optimization animation requires a retained summary or iteration trace"
        )
    progress = _progress_records(result)
    if len(progress) == 0:
        raise ValueError("optimization animation requires retained progress states")
    original_progress_count = len(progress)
    progress = _decimate_records(progress, MAX_OPTIMIZATION_ANIMATION_FRAMES - 1)
    records = progress + [_final_record(result)]
    if result.problem.operation in ("linear_fit", "curve_fit"):
        fit_x, _, _ = _fit_data(result)
        if len(fit_x) > MAX_FIT_ANIMATION_OBSERVATIONS:
            raise ValueError(
                "fit animation is limited to "
                + str(MAX_FIT_ANIMATION_OBSERVATIONS)
                + " retained observations"
            )
    axis_ranges = _animation_axis_ranges(result, records)
    scalar_reference_y: float | None = None
    if result.problem.operation == "scalar_minimum":
        retained_objectives = [
            float(record["objective"])
            for record in records
            if isinstance(record.get("objective"), (int, float))
        ]
        if len(retained_objectives) > 0:
            scalar_reference_y = min(retained_objectives)
    frames: list[AnimationFrame] = []
    for index in range(len(records)):
        prefix = records[: index + 1]
        final_frame = index == len(records) - 1
        if result.problem.operation == "scalar_minimum":
            state = _scalar_plot(
                result,
                prefix,
                show_result=final_frame,
                axis_ranges=axis_ranges,
                reference_y_override=scalar_reference_y,
            )
        elif result.problem.operation in ("linear_fit", "curve_fit"):
            fitted = records[index].get("fitted_values")
            if not isinstance(fitted, list):
                raise ValueError(
                    "fit animation requires fitted values retained in the numerical trace"
                )
            state = _fit_plot(
                result,
                [float(value) for value in fitted],
                axis_ranges=axis_ranges,
            )
        else:
            state = _path_plot(
                result,
                prefix,
                show_result=final_frame,
                axis_ranges=axis_ranges,
            )
        trace_iteration = records[index].get("trace_iteration")
        label = (
            "returned result"
            if final_frame
            else "iteration "
            + str(trace_iteration if trace_iteration is not None else index)
        )
        frames.append(
            AnimationFrame(
                stable_frame_id(index),
                state,
                label=label,
                metadata={
                    "trace_data": records[index],
                    "returned_result": final_frame,
                },
            )
        )
    final_frame = frames[-1]
    final_state = final_frame.state
    static_alt_text = (
        final_state.alt_text()
        if isinstance(final_state, PlotSpec)
        else "Optimization animation final frame."
    )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        controls=AnimationControls(
            play=True,
            pause=True,
            slider=True,
            from_current=True,
            slider_prefix="Iteration: ",
        ),
        limits=AnimationResourceLimits(
            max_frames=MAX_OPTIMIZATION_ANIMATION_FRAMES,
            max_layers_per_frame=8,
            max_total_samples=MAX_OPTIMIZATION_ANIMATION_SAMPLES,
            max_payload_bytes=MAX_OPTIMIZATION_ANIMATION_BYTES,
            max_duration_ms=60_000,
        ),
        metadata={
            "operation": result.problem.operation,
            "problem_digest": result.problem.digest,
            "trace_truncated": result.trace.truncated,
            "source_progress_states": original_progress_count,
            "retained_progress_states": len(progress),
            "animation_decimated": len(progress) < original_progress_count,
            "callback_replayed": False,
            "fixed_axes": axis_ranges[0] is not None and axis_ranges[1] is not None,
            "static_fallback": {
                "kind": "plot-spec",
                "frame_id": final_frame.id,
                "alt_text": static_alt_text,
            },
        },
    )
