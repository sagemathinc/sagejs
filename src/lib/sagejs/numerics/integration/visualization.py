"""Bounded semantic views derived only from retained integration evidence."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from sagejs.plotting import (
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

from .result import IntegrationResult

_MAX_ANIMATION_FRAMES = 128
_MAX_ANIMATION_SAMPLES = 8192
_MAX_ANIMATION_PAYLOAD_BYTES = 8_000_000


def _number(record: Mapping[str, Any], name: str, default: float = 0.0) -> float:
    value = record.get(name)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    converted = float(value)
    return converted if math.isfinite(converted) else default


def _midpoint(left: float, right: float) -> float:
    if left < 0.0 < right:
        return 0.5 * left + 0.5 * right
    return left + 0.5 * (right - left)


def _interval_data(
    records: Sequence[Mapping[str, Any]], display_floor: float
) -> dict[str, list[Any]]:
    x: list[float] = []
    displayed_error: list[float] = []
    local_error: list[float] = []
    left_edges: list[float] = []
    right_edges: list[float] = []
    half_widths: list[float] = []
    depths: list[int] = []
    components: list[int] = []
    ordered = sorted(records, key=lambda value: _number(value, "plot_left"))
    for record in ordered:
        left = _number(record, "plot_left")
        right = _number(record, "plot_right")
        error = max(0.0, _number(record, "error_estimate"))
        x.append(_midpoint(left, right))
        displayed_error.append(max(error, display_floor))
        local_error.append(error)
        left_edges.append(left)
        right_edges.append(right)
        half_widths.append(0.5 * abs(right - left))
        depths.append(int(_number(record, "depth")))
        components.append(int(_number(record, "component")))
    return {
        "x": x,
        "y": displayed_error,
        "local_error": local_error,
        "interval_left": left_edges,
        "interval_right": right_edges,
        "interval_half_width": half_widths,
        "depth": depths,
        "component": components,
    }


def _coordinate_label(records: Sequence[Mapping[str, Any]]) -> str:
    if records and all(
        record.get("plot_coordinate") == "physical_x" for record in records
    ):
        return "x"
    return "transformed t by component"


def _coordinate_domain(
    records: Sequence[Mapping[str, Any]],
) -> tuple[float, float]:
    coordinates: list[float] = []
    for record in records:
        coordinates.extend(
            [_number(record, "plot_left"), _number(record, "plot_right")]
        )
    if not coordinates:
        return 0.0, 1.0
    lower = min(coordinates)
    upper = max(coordinates)
    if lower == upper:
        scale = max(1.0, abs(lower))
        return lower - 0.5 * scale, upper + 0.5 * scale
    return lower, upper


def _display_floor(values: Sequence[float]) -> float:
    positive = [value for value in values if value > 0.0 and math.isfinite(value)]
    if not positive:
        return 1e-300
    return max(1e-300, min(positive) * 0.25)


def _log_axis(
    label: str, values: Sequence[float], *, fixed: bool = False
) -> AxisSettings:
    positive = [value for value in values if value > 0.0 and math.isfinite(value)]
    if not fixed or not positive:
        return AxisSettings(scale="log", label=label)
    lower = math.log10(min(positive))
    upper = math.log10(max(positive))
    if lower == upper:
        lower -= 0.5
        upper += 0.5
    else:
        padding = max(0.15, 0.05 * (upper - lower))
        lower -= padding
        upper += padding
    return AxisSettings(scale="log", range=[lower, upper], autorange=False, label=label)


def _provenance(result: IntegrationResult, constructor: str) -> Provenance:
    return Provenance(
        "sagejs.numerics.integration",
        source_language=str(result.problem.source_intent.get("language", "python")),
        constructor=constructor,
        metadata={
            "problem_digest": result.problem.digest,
            "method": result.method,
            "truth_level": result.validation.truth_level,
            "callback_reevaluated": False,
            "evidence_source": "retained_integration_result",
        },
    )


def _status_text(result: IntegrationResult) -> str:
    if result.stop_reason == "zero_interval":
        return "resolved exactly as a zero-width interval"
    if result.success:
        return "converged with independent validation"
    result_record = result.to_dict()
    payload = result_record.get("domain_payload")
    solver_stop = (
        payload.get("solver_stop_reason") if isinstance(payload, Mapping) else None
    )
    if solver_stop == "converged":
        return (
            "solver converged, but the reported result failed during "
            + result.stop_reason.replace("_", " ")
        )
    return "stopped before convergence: " + result.stop_reason.replace("_", " ")


def _empty_evidence_plot(
    result: IntegrationResult, *, constructor: str, narrative: str
) -> PlotSpec:
    return PlotSpec(
        2,
        [
            make_layer(
                "text",
                {"position": [0.5, 0.5], "text": narrative},
                ordinal=0,
                namespace="integration-evidence",
                source_intent={
                    "operation": "definite_integral",
                    "role": "evidence_unavailable",
                },
                style={"color": "#4c566a", "font_size": 14},
            )
        ],
        axes_or_scene=Axes2DSettings(
            AxisSettings(show_ticks=False, show_tick_labels=False, show_grid=False),
            AxisSettings(show_ticks=False, show_tick_labels=False, show_grid=False),
        ).to_dict(),
        viewport={"responsive": True},
        annotations=[
            {
                "kind": "alt_text",
                "text": "Adaptive quadrature evidence view. " + narrative,
            }
        ],
        provenance=_provenance(result, constructor),
    )


def _partition_plot(result: IntegrationResult) -> PlotSpec:
    intervals = list(result.final_intervals)
    if not intervals:
        return _empty_evidence_plot(
            result,
            constructor="integration_plot",
            narrative=(
                "No complete adaptive partition was retained; "
                + _status_text(result)
                + "."
            ),
        )
    errors = [max(0.0, _number(interval, "error_estimate")) for interval in intervals]
    display_floor = _display_floor(errors)
    data = _interval_data(intervals, display_floor)
    threshold = result.requested_tolerance
    threshold_value = (
        display_floor if threshold is None else max(threshold, display_floor)
    )
    coordinate_label = _coordinate_label(intervals)
    lower, upper = _coordinate_domain(intervals)
    layers = [
        make_layer(
            "line",
            data,
            ordinal=0,
            namespace="integration-partition",
            source_intent={
                "operation": "definite_integral",
                "role": "local_error_allocation",
            },
            style={"color": "#3366cc", "width": 2},
            legend={"label": "local error estimate", "show": True},
        ),
        make_layer(
            "point",
            data,
            ordinal=1,
            namespace="integration-partition",
            source_intent={
                "operation": "definite_integral",
                "role": "active_intervals",
            },
            style={"color": "#55a868", "size": 8},
            legend={"label": "retained interval", "show": True},
        ),
        make_layer(
            "line",
            {"x": [lower, upper], "y": [threshold_value, threshold_value]},
            ordinal=2,
            namespace="integration-partition",
            source_intent={
                "operation": "definite_integral",
                "role": "global_requested_tolerance",
            },
            style={"color": "#dd8452", "width": 1, "dash": "dash"},
            visibility=threshold is not None,
            legend={"label": "global requested tolerance", "show": True},
        ),
    ]
    error_text = (
        "unavailable" if result.error_estimate is None else str(result.error_estimate)
    )
    target_text = "unavailable" if threshold is None else str(threshold)
    return PlotSpec(
        2,
        layers,
        axes_or_scene=Axes2DSettings(
            AxisSettings(label=coordinate_label),
            _log_axis("estimated local absolute error", errors + [threshold_value]),
        ).to_dict(),
        viewport={"responsive": True},
        annotations=[
            {
                "kind": "alt_text",
                "text": (
                    "Adaptive quadrature local-error allocation across "
                    + str(len(intervals))
                    + " retained intervals in "
                    + coordinate_label
                    + ". "
                    + _status_text(result)
                    + "; reported global absolute-error evidence "
                    + error_text
                    + "; requested target "
                    + target_text
                    + ". Zero local estimates are displayed at a documented "
                    + "positive log-scale floor."
                ),
            }
        ],
        provenance=_provenance(result, "integration_plot"),
    )


def _convergence_records(result: IntegrationResult) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for event in result.trace.events:
        event_record = event.to_dict()
        data = event.data
        phase = data.get("phase")
        if event.kind == "phase" and phase != "initial_partition":
            continue
        if event.kind not in ("phase", "iteration", "finish", "failure"):
            continue
        error = data.get("error_estimate")
        target = data.get("requested_tolerance")
        if isinstance(error, bool) or not isinstance(error, (int, float)):
            continue
        if not math.isfinite(float(error)) or float(error) < 0.0:
            continue
        iteration = event_record.get("iteration")
        records.append(
            {
                "sequence": event_record["sequence"],
                "iteration": iteration if isinstance(iteration, int) else 0,
                "kind": event.kind,
                "error": float(error),
                "target": (
                    float(target)
                    if isinstance(target, (int, float))
                    and not isinstance(target, bool)
                    and math.isfinite(float(target))
                    and float(target) >= 0.0
                    else None
                ),
                "active_intervals": data.get("active_intervals"),
            }
        )
    if not records and result.error_estimate is not None:
        records.append(
            {
                "sequence": 0,
                "iteration": result.iterations,
                "kind": "finish" if result.success else "failure",
                "error": max(0.0, result.error_estimate),
                "target": result.requested_tolerance,
                "active_intervals": len(result.final_intervals),
            }
        )
    return records


def integration_convergence_plot(result: IntegrationResult) -> PlotSpec:
    """Show retained global error and tolerance evidence by subdivision count."""
    records = _convergence_records(result)
    if not records:
        return _empty_evidence_plot(
            result,
            constructor="integration_convergence_plot",
            narrative=(
                "No global convergence series was retained; "
                + _status_text(result)
                + "."
            ),
        )
    errors = [float(record["error"]) for record in records]
    targets = [
        float(record["target"])
        for record in records
        if isinstance(record.get("target"), (int, float))
        and not isinstance(record.get("target"), bool)
    ]
    display_floor = _display_floor(errors + targets)
    iterations = [int(record["iteration"]) for record in records]
    displayed_errors = [max(value, display_floor) for value in errors]
    displayed_targets = [
        max(float(record["target"]), display_floor)
        if isinstance(record.get("target"), (int, float))
        and not isinstance(record.get("target"), bool)
        else display_floor
        for record in records
    ]
    target_available = bool(targets)
    data = {
        "x": iterations,
        "y": displayed_errors,
        "global_error_estimate": errors,
        "trace_kind": [str(record["kind"]) for record in records],
        "active_intervals": [record["active_intervals"] for record in records],
    }
    trace_note = (
        " The bounded trace was truncated, so omitted iterations are not interpolated."
        if result.trace.truncated
        else ""
    )
    return PlotSpec(
        2,
        [
            make_layer(
                "line",
                data,
                ordinal=0,
                namespace="integration-convergence",
                source_intent={
                    "operation": "definite_integral",
                    "role": "retained_global_error_history",
                },
                style={"color": "#3366cc", "width": 2},
                legend={"label": "global error estimate", "show": True},
            ),
            make_layer(
                "point",
                data,
                ordinal=1,
                namespace="integration-convergence",
                source_intent={
                    "operation": "definite_integral",
                    "role": "retained_algorithm_states",
                },
                style={"color": "#55a868", "size": 8},
                legend={"label": "retained state", "show": True},
            ),
            make_layer(
                "line",
                {"x": iterations, "y": displayed_targets, "target": displayed_targets},
                ordinal=2,
                namespace="integration-convergence",
                source_intent={
                    "operation": "definite_integral",
                    "role": "requested_tolerance_history",
                },
                style={"color": "#dd8452", "width": 1, "dash": "dash"},
                visibility=target_available,
                legend={"label": "requested tolerance", "show": True},
            ),
        ],
        axes_or_scene=Axes2DSettings(
            AxisSettings(label="completed subdivisions"),
            _log_axis(
                "estimated global absolute error",
                displayed_errors + displayed_targets,
            ),
        ).to_dict(),
        viewport={"responsive": True},
        annotations=[
            {
                "kind": "alt_text",
                "text": (
                    "Adaptive quadrature convergence history with "
                    + str(len(records))
                    + " retained computed states from the initial partition "
                    + "through "
                    + _status_text(result)
                    + ". The line shows estimated global absolute error and the "
                    + "available tolerance line shows the requested stopping target."
                    + trace_note
                ),
            }
        ],
        provenance=_provenance(result, "integration_convergence_plot"),
    )


def integration_plot(result: IntegrationResult, *, view: str = "partition") -> PlotSpec:
    """Return a static semantic view without reevaluating the callback."""
    if view == "partition":
        return _partition_plot(result)
    if view == "convergence":
        return integration_convergence_plot(result)
    raise ValueError("integration plot view must be 'partition' or 'convergence'")


def _decimate_records(
    records: Sequence[dict[str, Any]], maximum: int
) -> list[dict[str, Any]]:
    if len(records) <= maximum:
        return list(records)
    indices = [
        round(index * (len(records) - 1) / (maximum - 1)) for index in range(maximum)
    ]
    return [records[index] for index in indices]


def _iteration_events(result: IntegrationResult) -> list[dict[str, Any]]:
    answer: list[dict[str, Any]] = []
    for event in result.trace.events:
        if event.kind != "iteration":
            continue
        data = event.data
        parent = data.get("parent")
        children = data.get("children")
        if not isinstance(parent, Mapping) or not isinstance(children, list):
            continue
        if len(children) != 2 or not all(
            isinstance(value, Mapping) for value in children
        ):
            continue
        record = event.to_dict()
        parent_record = {str(key): value for key, value in parent.items()}
        child_records = [
            {str(key): value for key, value in child.items()}
            for child in children
            if isinstance(child, Mapping)
        ]
        answer.append(
            {
                "sequence": record["sequence"],
                "iteration": record.get("iteration"),
                "parent": parent_record,
                "children": child_records,
                "error_estimate": data.get("error_estimate"),
                "requested_tolerance": data.get("requested_tolerance"),
                "active_intervals": data.get("active_intervals"),
            }
        )
    return answer


def _refinement_spec(
    result: IntegrationResult,
    *,
    parent_records: Sequence[Mapping[str, Any]],
    child_records: Sequence[Mapping[str, Any]],
    show_children: bool,
    target: float | None,
    narrative: str,
    coordinate_label: str,
    x_domain: tuple[float, float],
    display_floor: float,
    y_values: Sequence[float],
) -> PlotSpec:
    parent_data = _interval_data(parent_records, display_floor)
    child_data = _interval_data(child_records, display_floor)
    target_value = display_floor if target is None else max(target, display_floor)
    lower, upper = x_domain
    padding = max(1e-15, 0.03 * (upper - lower))
    return PlotSpec(
        2,
        [
            make_layer(
                "point",
                parent_data,
                ordinal=0,
                namespace="integration-refinement",
                source_intent={
                    "operation": "definite_integral",
                    "role": "selected_parent_interval",
                },
                style={"color": "#c44e52", "size": 12},
                legend={"label": "selected parent", "show": True},
            ),
            make_layer(
                "point",
                child_data,
                ordinal=1,
                namespace="integration-refinement",
                source_intent={
                    "operation": "definite_integral",
                    "role": "computed_child_intervals",
                },
                style={"color": "#55a868", "size": 10},
                visibility=show_children,
                legend={"label": "computed children", "show": True},
            ),
            make_layer(
                "line",
                {"x": [lower, upper], "y": [target_value, target_value]},
                ordinal=2,
                namespace="integration-refinement",
                source_intent={
                    "operation": "definite_integral",
                    "role": "global_requested_tolerance",
                },
                style={"color": "#dd8452", "width": 1, "dash": "dash"},
                visibility=target is not None,
                legend={"label": "global requested tolerance", "show": True},
            ),
            make_layer(
                "text",
                {
                    "position": [lower + 0.5 * (upper - lower), max(y_values)],
                    "text": narrative,
                },
                ordinal=3,
                namespace="integration-refinement",
                source_intent={
                    "operation": "definite_integral",
                    "role": "refinement_narrative",
                },
                style={"color": "#4c566a", "font_size": 13},
            ),
        ],
        axes_or_scene=Axes2DSettings(
            AxisSettings(
                range=[lower - padding, upper + padding],
                autorange=False,
                label=coordinate_label,
            ),
            _log_axis(
                "estimated local absolute error",
                list(y_values) + [target_value],
                fixed=True,
            ),
        ).to_dict(),
        viewport={"responsive": True},
        annotations=[
            {
                "kind": "alt_text",
                "text": "Adaptive quadrature refinement frame. " + narrative,
            }
        ],
        provenance=_provenance(result, "integration_animation"),
    )


def _retained_partition_state(
    result: IntegrationResult,
    *,
    intervals: Sequence[Mapping[str, Any]],
    narrative: str,
    coordinate_label: str,
    x_domain: tuple[float, float],
    display_floor: float,
    y_values: Sequence[float],
) -> PlotSpec:
    data = _interval_data(intervals, display_floor)
    target = result.requested_tolerance
    target_value = display_floor if target is None else max(target, display_floor)
    lower, upper = x_domain
    padding = max(1e-15, 0.03 * (upper - lower))
    return PlotSpec(
        2,
        [
            make_layer(
                "point",
                data,
                ordinal=0,
                namespace="integration-retained-partition",
                source_intent={
                    "operation": "definite_integral",
                    "role": "retained_final_intervals",
                },
                style={"color": "#55a868", "size": 10},
                legend={"label": "retained interval", "show": True},
            ),
            make_layer(
                "line",
                {"x": [lower, upper], "y": [target_value, target_value]},
                ordinal=1,
                namespace="integration-retained-partition",
                source_intent={
                    "operation": "definite_integral",
                    "role": "global_requested_tolerance",
                },
                style={"color": "#dd8452", "width": 1, "dash": "dash"},
                visibility=target is not None,
                legend={"label": "global requested tolerance", "show": True},
            ),
            make_layer(
                "text",
                {
                    "position": [
                        lower + 0.5 * (upper - lower),
                        max(y_values),
                    ],
                    "text": narrative,
                },
                ordinal=2,
                namespace="integration-retained-partition",
                source_intent={
                    "operation": "definite_integral",
                    "role": "termination_narrative",
                },
                style={"color": "#4c566a", "font_size": 13},
            ),
        ],
        axes_or_scene=Axes2DSettings(
            AxisSettings(
                range=[lower - padding, upper + padding],
                autorange=False,
                label=coordinate_label,
            ),
            _log_axis(
                "estimated local absolute error",
                list(y_values) + [target_value],
                fixed=True,
            ),
        ).to_dict(),
        viewport={"responsive": True},
        annotations=[
            {
                "kind": "alt_text",
                "text": "Adaptive quadrature retained-partition frame. " + narrative,
            }
        ],
        provenance=_provenance(result, "integration_animation"),
    )


def integration_animation(result: IntegrationResult) -> PlotAnimation:
    """Replay retained refinements as bounded, renderer-neutral semantic states.

    Frames contain only states actually computed by the solver.  The visualizer
    neither calls the integrand nor invents interpolated intermediate states.
    """
    retained = _iteration_events(result)
    selected = _decimate_records(retained, _MAX_ANIMATION_FRAMES - 1)
    if not selected:
        intervals = list(result.final_intervals)
        if not intervals:
            first = _empty_evidence_plot(
                result,
                constructor="integration_animation",
                narrative="No complete partition or refinement event was retained.",
            )
            second = _empty_evidence_plot(
                result,
                constructor="integration_animation",
                narrative=_status_text(result) + ".",
            )
        else:
            errors = [
                max(0.0, _number(interval, "error_estimate")) for interval in intervals
            ]
            floor = _display_floor(errors)
            target = result.requested_tolerance
            values = [max(value, floor) for value in errors]
            if target is not None:
                values.append(max(target, floor))
            coordinate = _coordinate_label(intervals)
            domain = _coordinate_domain(intervals)
            first = _retained_partition_state(
                result,
                intervals=intervals,
                narrative="Retained final partition; no subdivision event is available.",
                coordinate_label=coordinate,
                x_domain=domain,
                display_floor=floor,
                y_values=values,
            )
            second = _retained_partition_state(
                result,
                intervals=intervals,
                narrative=_status_text(result) + ".",
                coordinate_label=coordinate,
                x_domain=domain,
                display_floor=floor,
                y_values=values,
            )
        frames = [
            AnimationFrame(
                stable_frame_id(0),
                first,
                label="retained evidence",
                metadata={"computed_state": True, "interpolated": False},
            ),
            AnimationFrame(
                stable_frame_id(1),
                second,
                label="termination",
                metadata={"computed_state": True, "interpolated": False},
            ),
        ]
    else:
        all_records: list[Mapping[str, Any]] = []
        all_values: list[float] = []
        for event in selected:
            parent = event["parent"]
            children = event["children"]
            all_records.append(parent)
            all_records.extend(children)
            all_values.append(max(0.0, _number(parent, "error_estimate")))
            for child in children:
                all_values.append(max(0.0, _number(child, "error_estimate")))
            target = event.get("requested_tolerance")
            if isinstance(target, (int, float)) and not isinstance(target, bool):
                all_values.append(max(0.0, float(target)))
        floor = _display_floor(all_values)
        displayed_values = [max(value, floor) for value in all_values]
        coordinate = _coordinate_label(all_records)
        domain = _coordinate_domain(all_records)
        first_event = selected[0]
        first_iteration = first_event.get("iteration")
        before_narrative = (
            "Before retained subdivision "
            + str(first_iteration)
            + ": the largest-error parent interval is selected."
        )
        first_target = first_event.get("requested_tolerance")
        frames = [
            AnimationFrame(
                stable_frame_id(0),
                _refinement_spec(
                    result,
                    parent_records=[first_event["parent"]],
                    child_records=first_event["children"],
                    show_children=False,
                    target=(
                        float(first_target)
                        if isinstance(first_target, (int, float))
                        and not isinstance(first_target, bool)
                        else None
                    ),
                    narrative=before_narrative,
                    coordinate_label=coordinate,
                    x_domain=domain,
                    display_floor=floor,
                    y_values=displayed_values,
                ),
                label="before subdivision " + str(first_iteration),
                metadata={
                    "trace_sequence": first_event["sequence"],
                    "phase": "selected_parent",
                    "computed_state": True,
                    "interpolated": False,
                },
            )
        ]
        for index, event in enumerate(selected, start=1):
            iteration = event.get("iteration")
            target = event.get("requested_tolerance")
            narrative = (
                "Subdivision "
                + str(iteration)
                + ": replaced the largest-error parent by two computed children; "
                + str(event.get("active_intervals"))
                + " intervals were active afterward."
            )
            frames.append(
                AnimationFrame(
                    stable_frame_id(index),
                    _refinement_spec(
                        result,
                        parent_records=[event["parent"]],
                        child_records=event["children"],
                        show_children=True,
                        target=(
                            float(target)
                            if isinstance(target, (int, float))
                            and not isinstance(target, bool)
                            else None
                        ),
                        narrative=narrative,
                        coordinate_label=coordinate,
                        x_domain=domain,
                        display_floor=floor,
                        y_values=displayed_values,
                    ),
                    label="subdivision " + str(iteration),
                    metadata={
                        "trace_sequence": event["sequence"],
                        "phase": "computed_children",
                        "computed_state": True,
                        "interpolated": False,
                    },
                )
            )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(
            frame_duration_ms=450,
            transition_duration_ms=0,
            easing="linear",
            redraw=True,
        ),
        limits=AnimationResourceLimits(
            max_frames=_MAX_ANIMATION_FRAMES,
            max_panels=1,
            max_layers_per_frame=4,
            max_total_samples=_MAX_ANIMATION_SAMPLES,
            max_payload_bytes=_MAX_ANIMATION_PAYLOAD_BYTES,
            max_duration_ms=_MAX_ANIMATION_FRAMES * 450,
        ),
        metadata={
            "operation": "definite_integral",
            "method": result.method,
            "status": result.stop_reason,
            "callback_reevaluated": False,
            "frame_semantics": "computed_states_only",
            "partition_scope": "selected_parent_and_computed_children",
            "interpolation": "none",
            "trace_truncated": result.trace.truncated,
            "retained_refinement_events": len(retained),
            "rendered_refinement_events": len(selected),
            "visualizer_decimated": len(selected) < len(retained),
            "static_fallback": "result.plot(view='partition') and result.plot(view='convergence')",
        },
    )
