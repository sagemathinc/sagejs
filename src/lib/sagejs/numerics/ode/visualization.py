"""Renderer-neutral trajectory, phase, step, and error views for ODE results."""

from __future__ import annotations

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

from .model import OdeResult

_COLORS = ("#3366cc", "#dd8452", "#55a868", "#c44e52", "#8172b3", "#937860")


def _provenance(result: OdeResult, constructor: str, kind: str) -> Provenance:
    return Provenance(
        "sagejs.numerics.ode",
        source_language=str(result.problem.source_intent.get("language", "python")),
        constructor=constructor,
        approximations=[
            {
                "kind": "numerical_trajectory",
                "method": result.method,
                "local_error_not_global_bound": True,
            }
        ],
        metadata={
            "problem_digest": result.problem.digest,
            "method": result.method,
            "view": kind,
            "truth_level": result.validation.truth_level,
            "trace_truncated": result.trace.truncated,
        },
    )


def _event_points(
    result: OdeResult, through: float | None = None
) -> tuple[list[float], list[list[float]]]:
    direction = (
        1.0
        if result.trajectory.final_time >= result.trajectory.internal_times[0]
        else -1.0
    )
    times: list[float] = []
    states: list[list[float]] = []
    for event in result.events:
        if through is None or direction * (event.time - through) <= 0:
            times.append(event.time)
            states.append(list(event.state))
    return times, states


def _trajectory_spec(
    result: OdeResult,
    count: int | None = None,
) -> PlotSpec:
    times = list(result.trajectory.internal_times)
    states = [list(state) for state in result.trajectory.internal_states]
    if count is not None:
        times = times[:count]
        states = states[:count]
    layers = []
    dimension = len(states[0])
    for component in range(dimension):
        layers.append(
            make_layer(
                "line",
                {"x": times, "y": [state[component] for state in states]},
                ordinal=component,
                source_intent={
                    "operation": "initial_value_problem",
                    "role": "trajectory_component",
                    "component": component,
                },
                style={"color": _COLORS[component % len(_COLORS)], "width": 2},
                legend={"label": "y[" + str(component) + "]", "show": True},
            )
        )
    through = times[-1]
    event_times, event_states = _event_points(result, through)
    layers.append(
        make_layer(
            "point",
            {
                "x": event_times,
                "y": [state[0] for state in event_states],
            },
            ordinal=dimension,
            source_intent={
                "operation": "initial_value_problem",
                "role": "located_events",
            },
            style={"color": "#c44e52", "size": 10},
            legend={"label": "events", "show": True},
        )
    )
    return PlotSpec(
        2,
        layers,
        axes_or_scene={"x": {"label": "t"}, "y": {"label": "state"}},
        viewport={"responsive": True},
        provenance=_provenance(result, "ode_plot", "trajectory"),
    )


def _phase_spec(result: OdeResult, count: int | None = None) -> PlotSpec:
    states = [list(state) for state in result.trajectory.internal_states]
    times = list(result.trajectory.internal_times)
    if len(states[0]) < 2:
        raise ValueError("a phase portrait requires at least two state components")
    if count is not None:
        states = states[:count]
        times = times[:count]
    _, event_states = _event_points(result, times[-1])
    layers = [
        make_layer(
            "line",
            {"x": [state[0] for state in states], "y": [state[1] for state in states]},
            ordinal=0,
            source_intent={
                "operation": "initial_value_problem",
                "role": "phase_trajectory",
            },
            style={"color": _COLORS[0], "width": 2},
            legend={"label": "phase trajectory", "show": True},
        ),
        make_layer(
            "point",
            {
                "x": [state[0] for state in event_states],
                "y": [state[1] for state in event_states],
            },
            ordinal=1,
            source_intent={
                "operation": "initial_value_problem",
                "role": "located_events",
            },
            style={"color": "#c44e52", "size": 10},
            legend={"label": "events", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={"x": {"label": "y[0]"}, "y": {"label": "y[1]"}},
        viewport={"responsive": True, "equal_aspect": True},
        provenance=_provenance(result, "ode_plot", "phase"),
    )


def _step_records(result: OdeResult) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for event in result.trace.events:
        if event.kind != "step":
            continue
        data = event.data
        records.append(
            {
                "time": data.get("t_end", data.get("t_start")),
                "step": data.get("step_size", data.get("attempted_step")),
                "error_norm": data.get("error_norm"),
                "accepted": data.get("t_end") is not None,
            }
        )
    return records


def _step_spec(result: OdeResult, count: int | None = None) -> PlotSpec:
    records = _step_records(result)
    if count is not None:
        records = records[:count]
    accepted = [record for record in records if record["accepted"]]
    rejected = [record for record in records if not record["accepted"]]
    layers = [
        make_layer(
            "point",
            {
                "x": [record["time"] for record in accepted],
                "y": [abs(float(record["step"])) for record in accepted],
            },
            ordinal=0,
            source_intent={
                "operation": "initial_value_problem",
                "role": "accepted_step_sizes",
            },
            style={"color": "#55a868", "size": 7},
            legend={"label": "accepted", "show": True},
        ),
        make_layer(
            "point",
            {
                "x": [record["time"] for record in rejected],
                "y": [abs(float(record["step"])) for record in rejected],
            },
            ordinal=1,
            source_intent={
                "operation": "initial_value_problem",
                "role": "rejected_step_sizes",
            },
            style={"color": "#c44e52", "size": 7},
            legend={"label": "rejected", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "t"},
            "y": {"label": "|step size|", "scale": "log"},
        },
        viewport={"responsive": True},
        provenance=_provenance(result, "ode_plot", "step_size"),
    )


def _error_spec(result: OdeResult, count: int | None = None) -> PlotSpec:
    records = [
        record for record in _step_records(result) if record["error_norm"] is not None
    ]
    if count is not None:
        records = records[:count]
    layers = [
        make_layer(
            "point",
            {
                "x": [record["time"] for record in records],
                "y": [record["error_norm"] for record in records],
            },
            ordinal=0,
            source_intent={
                "operation": "initial_value_problem",
                "role": "local_error_norm",
            },
            style={"color": _COLORS[1], "size": 7},
            legend={"label": "weighted RMS estimate", "show": True},
        ),
        make_layer(
            "line",
            {
                "x": [
                    result.trajectory.internal_times[0],
                    result.trajectory.final_time,
                ],
                "y": [1.0, 1.0],
            },
            ordinal=1,
            source_intent={
                "operation": "initial_value_problem",
                "role": "acceptance_threshold",
            },
            style={"color": "#c44e52", "width": 1},
            legend={"label": "acceptance threshold", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "t"},
            "y": {"label": "local error norm", "scale": "log"},
        },
        viewport={"responsive": True},
        provenance=_provenance(result, "ode_plot", "local_error"),
    )


def ode_plot(result: OdeResult, *, kind: str = "trajectory") -> PlotSpec:
    """Return a static semantic ODE view without renderer-specific objects."""
    selected = str(kind).lower()
    if selected == "trajectory":
        return _trajectory_spec(result)
    if selected in ("phase", "phase_portrait"):
        return _phase_spec(result)
    if selected in ("step", "step_size"):
        return _step_spec(result)
    if selected in ("error", "local_error"):
        return _error_spec(result)
    raise ValueError(
        "ODE plot kind must be trajectory, phase, step_size, or local_error"
    )


def _frame_indices(count: int, maximum: int = 64) -> list[int]:
    if count <= 1:
        return [1, 1]
    if count == 2:
        return [1, 2]
    if count <= maximum:
        return list(range(2, count + 1))
    answer: list[int] = []
    for index in range(maximum):
        candidate = 2 + int(round(index * (count - 2) / (maximum - 1)))
        if not answer or answer[-1] != candidate:
            answer.append(candidate)
    return answer


def ode_animation(result: OdeResult, *, kind: str = "trajectory") -> PlotAnimation:
    """Replay computed knots or trace records in a bounded PlotSpec animation."""
    selected = str(kind).lower()
    if selected not in (
        "trajectory",
        "phase",
        "phase_portrait",
        "step",
        "step_size",
        "error",
        "local_error",
        "event",
        "events",
    ):
        raise ValueError(
            "ODE animations support trajectory, phase, step_size, local_error, or event views"
        )
    maximum_frames = max(2, min(64, result.problem.trace_policy.max_events))
    trace_view = selected in ("step", "step_size", "error", "local_error")
    if selected in ("error", "local_error"):
        source_records = [
            record
            for record in _step_records(result)
            if record["error_norm"] is not None
        ]
    elif trace_view:
        source_records = _step_records(result)
    else:
        source_records = []
    source_count = (
        len(source_records) if trace_view else len(result.trajectory.internal_times)
    )
    indices = _frame_indices(source_count, maximum=maximum_frames)
    frames: list[AnimationFrame] = []
    for ordinal, count in enumerate(indices):
        if selected in ("trajectory", "event", "events"):
            spec = _trajectory_spec(result, count=count)
        elif selected in ("phase", "phase_portrait"):
            spec = _phase_spec(result, count=count)
        elif selected in ("step", "step_size"):
            spec = _step_spec(result, count=count)
        else:
            spec = _error_spec(result, count=count)
        if trace_view and source_records:
            label_time = source_records[min(count, len(source_records)) - 1]["time"]
        else:
            label_time = result.trajectory.internal_times[
                min(count, len(result.trajectory.internal_times)) - 1
            ]
        frames.append(
            AnimationFrame(
                stable_frame_id(ordinal),
                spec,
                label="t = " + str(label_time),
                metadata={
                    "computed_record_count": min(count, source_count),
                    "interpolated": False,
                },
            )
        )
    dimension = len(result.trajectory.internal_states[0])
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=250, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=maximum_frames,
            max_layers_per_frame=max(4, dimension + 1),
            max_total_samples=max(4096, 64 * 65 * max(2, dimension)),
            max_payload_bytes=max(1_000_000, result.problem.trace_policy.max_bytes * 8),
        ),
        metadata={
            "operation": "initial_value_problem",
            "view": selected,
            "problem_digest": result.problem.digest,
            "computed_records_only": True,
            "source_record_count": source_count,
            "frame_count": len(frames),
            "decimated": len(frames) < max(2, source_count - 1),
            "trace_truncated": result.trace.truncated,
            "static_fallback": result.plot(
                "trajectory"
                if selected in ("event", "events")
                else "phase"
                if selected == "phase_portrait"
                else selected
            ).to_dict(),
        },
    )
