"""Structured explanations and renderer-neutral approximation views."""

from __future__ import annotations

import typing
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

from .._json import materialize_json
from ._common import interval_geometry

if typing.TYPE_CHECKING:
    from ._common import ApproximationResult

EXPLANATION_SCHEMA = "sagejs.numerics.approximation.explanation/v1"
MAX_STATIC_PLOT_SAMPLES = 4097
MAX_ANIMATION_PLOT_SAMPLES = 257
MAX_APPROXIMATION_ANIMATION_FRAMES = 64
MAX_APPROXIMATION_ANIMATION_SCALARS = 200_000
MAX_APPROXIMATION_ANIMATION_BYTES = 8 * 1024 * 1024


def _axes(x_label: str, y_label: str) -> dict[str, Any]:
    return Axes2DSettings(
        AxisSettings(label=x_label),
        AxisSettings(label=y_label),
    ).to_dict()


def _bounded_integer(value: Any, name: str, lower: int, upper: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(name + " must be an integer")
    if value < lower or value > upper:
        raise ValueError(name + " must be between " + str(lower) + " and " + str(upper))
    return value


def _method_summary(kind: str, method: str, success: bool) -> str:
    if not success:
        return (
            "The "
            + method
            + " construction stopped without a validated approximation; inspect "
            "the stop reason, diagnostics, and retained semantic trace."
        )
    if kind == "barycentric_polynomial":
        return (
            "The second barycentric form represents the global interpolating "
            "polynomial on scaled nodes without a Vandermonde expansion."
        )
    if kind == "piecewise_linear":
        return (
            "Each query uses one local line segment; first derivatives are not "
            "invented at knots whose one-sided slopes differ."
        )
    if kind == "cubic_spline":
        return (
            "A piecewise cubic power basis satisfies the requested endpoint "
            "system and is independently checked for value, C1, and C2 continuity."
        )
    if kind == "chebyshev_series":
        return (
            "A direct normalized DCT-II constructs Chebyshev coefficients and "
            "independent holdout samples provide heuristic error evidence."
        )
    if kind == "finite_difference":
        return (
            "Fornberg weights act on coarse and halved stencils; defining moments "
            "and step-halving or analytic-reference evidence decide acceptance."
        )
    return "The approximation result has no domain-specific construction narrative."


def _construction_record(model: Mapping[str, Any]) -> dict[str, Any]:
    kind = str(model.get("kind", "none"))
    if kind == "barycentric_polynomial":
        return {
            "representation": "second-barycentric-form",
            "sample_count": len(model.get("nodes", [])),
            "coordinate_system": "affine-scaled-to-minus-one-one",
            "weight_normalization": model.get("weight_normalization"),
        }
    if kind == "piecewise_linear":
        return {
            "representation": "piecewise-linear",
            "sample_count": len(model.get("nodes", [])),
            "segment_count": len(model.get("slopes", [])),
            "extrapolation": model.get("extrapolation"),
        }
    if kind == "cubic_spline":
        return {
            "representation": "piecewise-cubic-power-basis",
            "sample_count": len(model.get("nodes", [])),
            "segment_count": len(model.get("coefficients", [])),
            "boundary_condition": model.get("boundary_condition"),
            "periodic": model.get("periodic"),
        }
    if kind == "chebyshev_series":
        return {
            "representation": "Chebyshev-T-series",
            "degree": model.get("degree"),
            "sample_count": len(model.get("nodes", [])),
            "coefficient_tail": model.get("coefficient_tail"),
            "tail_role": "convergence-indicator-not-uniform-bound",
        }
    if kind == "finite_difference":
        return {
            "representation": "Fornberg-weighted-stencil",
            "stencil": model.get("stencil"),
            "stencil_size": len(model.get("offsets", [])),
            "derivative_order": model.get("derivative_order"),
            "truncation_order": model.get("truncation_order"),
            "accepted_step": model.get("step"),
        }
    return {"representation": "none"}


def approximation_explanation(result: ApproximationResult) -> dict[str, Any]:
    """Return a detached, domain-owned explanation document."""
    record = result.to_dict()
    model = result.value
    kind = str(model.get("kind", "none"))
    validation = result.validation.to_dict()
    trace_record = result.trace.to_dict()
    domain_payload = record.get("domain_payload")
    if not isinstance(domain_payload, dict):
        domain_payload = {}
    diagnostics = [diagnostic.to_dict() for diagnostic in result.diagnostics]
    guidance: list[str] = []
    if result.success:
        guidance.append(
            "Read validation.checks before interpreting the approximation as accepted."
        )
        if result.validation.truth_level == "heuristic":
            guidance.append(
                "Heuristic error evidence is diagnostic and is not a rigorous enclosure."
            )
    else:
        guidance.append(
            "No curve or scalar in this result should be treated as a validated answer."
        )
        guidance.append(
            "Use stop_reason and diagnostics to distinguish input, callback, budget, "
            "conditioning, and validation failures."
        )
    answer = {
        "schema": EXPLANATION_SCHEMA,
        "operation": result.problem.operation,
        "method": result.method,
        "model_kind": kind,
        "summary": _method_summary(kind, result.method, result.success),
        "outcome": {
            "success": result.success,
            "status": result.status,
            "stop_reason": domain_payload.get("stop_reason"),
            "truth_level": result.validation.truth_level,
            "validation_passed": result.validation.passed,
        },
        "construction": _construction_record(model),
        "numerical_indicators": {
            "condition_estimate": model.get("condition_estimate"),
            "error_estimate": model.get("error_estimate"),
            "roundoff_floor": model.get("roundoff_floor"),
            "coefficient_tail": model.get("coefficient_tail"),
        },
        "validation": validation,
        "diagnostics": diagnostics,
        "resources": {
            "iterations": result.iterations,
            "evaluations": result.evaluations,
            "budget": result.problem.resource_budget.to_dict(),
            "trace_policy": result.problem.trace_policy.to_dict(),
            "trace_observed_events": trace_record.get("observed_events"),
            "trace_retained_events": trace_record.get("retained_events"),
            "trace_dropped_events": trace_record.get("dropped_events"),
            "trace_truncated": trace_record.get("truncated"),
        },
        "semantic_trace": trace_record,
        "guidance": guidance,
    }
    detached = materialize_json(answer)
    if not isinstance(detached, dict):
        raise TypeError("approximation explanation must be an object")
    return detached


def format_approximation_explanation(result: ApproximationResult) -> str:
    """Render the structured explanation as concise plain text."""
    explanation = approximation_explanation(result)
    outcome = explanation["outcome"]
    resources = explanation["resources"]
    if not isinstance(outcome, dict) or not isinstance(resources, dict):
        raise TypeError("invalid approximation explanation")
    lines = [
        str(explanation["method"])
        + " "
        + str(explanation["operation"]).replace("_", " "),
        str(explanation["summary"]),
        "status: " + str(outcome["status"]),
        "validation: "
        + str(outcome["truth_level"])
        + ("; passed" if bool(outcome["validation_passed"]) else "; not passed"),
        "iterations/evaluations: "
        + str(resources["iterations"])
        + "/"
        + str(resources["evaluations"]),
    ]
    stop_reason = outcome.get("stop_reason")
    if stop_reason is not None:
        lines.append("stop reason: " + str(stop_reason))
    validation = explanation["validation"]
    if isinstance(validation, dict) and validation.get("residual") is not None:
        lines.append("residual: " + str(validation["residual"]))
    indicators = explanation["numerical_indicators"]
    if isinstance(indicators, dict):
        if indicators.get("condition_estimate") is not None:
            lines.append(
                "conditioning indicator: " + str(indicators["condition_estimate"])
            )
        if indicators.get("error_estimate") is not None:
            lines.append("estimated error: " + str(indicators["error_estimate"]))
    for diagnostic in explanation["diagnostics"]:
        if isinstance(diagnostic, dict):
            lines.append("diagnostic: " + str(diagnostic.get("code")))
    return "\n".join(lines)


def _plot_interval(result: ApproximationResult) -> tuple[float, float]:
    interval = result.problem.bounds.get("interval")
    if not isinstance(interval, list) or len(interval) != 2:
        raise ValueError("approximation has no finite plotting interval")
    lower = float(interval[0])
    upper = float(interval[1])
    interval_geometry(lower, upper)
    return lower, upper


def _plot_grid(result: ApproximationResult, samples: int) -> list[float]:
    lower, upper = _plot_interval(result)
    midpoint, radius = interval_geometry(lower, upper)
    return [
        midpoint + radius * (-1.0 + 2.0 * index / (samples - 1))
        for index in range(samples)
    ]


def _series_values(
    result: ApproximationResult,
    x_values: Sequence[float],
    coefficient_count: int | None,
) -> list[float]:
    if coefficient_count is None:
        return [result.evaluate(value) for value in x_values]
    from .chebyshev import evaluate_chebyshev

    model = result.value
    raw_coefficients = model.get("coefficients")
    if not isinstance(raw_coefficients, list):
        raise TypeError("invalid Chebyshev approximation model")
    partial = dict(model)
    partial["coefficients"] = list(raw_coefficients[:coefficient_count])
    partial["degree"] = coefficient_count - 1
    return [evaluate_chebyshev(partial, value) for value in x_values]


def _alt_text(result: ApproximationResult, stage: Mapping[str, Any] | None) -> str:
    kind = str(result.value.get("kind", "none"))
    if not result.success:
        explanation = approximation_explanation(result)
        outcome = explanation["outcome"]
        stop_reason = outcome.get("stop_reason") if isinstance(outcome, dict) else None
        return (
            "Failed "
            + result.problem.operation.replace("_", " ")
            + " using "
            + result.method
            + "; status "
            + result.status
            + ("; stop reason " + str(stop_reason) if stop_reason is not None else "")
        )
    suffix = ""
    if stage is not None and stage.get("label") is not None:
        suffix = "; animation stage " + str(stage["label"])
    return (
        result.problem.operation.replace("_", " ")
        + " shown as "
        + kind.replace("_", " ")
        + " with construction samples"
        + suffix
    )


def _provenance(
    result: ApproximationResult,
    constructor: str,
    samples: int,
    stage: Mapping[str, Any] | None,
) -> Provenance:
    return Provenance(
        "sagejs.numerics.approximation",
        source_language=str(result.problem.source_intent.get("language", "python")),
        constructor=constructor,
        sampling={"plot_samples": samples},
        approximations=[
            {
                "operation": result.problem.operation,
                "method": result.method,
                "truth_level": result.validation.truth_level,
                "validation_passed": result.validation.passed,
            }
        ],
        metadata={
            "problem_digest": result.problem.digest,
            "status": result.status,
            "trace_truncated": result.trace.truncated,
            "stage": stage,
            "numerical_diagnostics": [
                diagnostic.code for diagnostic in result.diagnostics
            ],
        },
    )


def _failure_spec(
    result: ApproximationResult,
    samples: int,
    stage: Mapping[str, Any] | None,
    constructor: str,
) -> PlotSpec:
    explanation = approximation_explanation(result)
    outcome = explanation["outcome"]
    stop_reason = outcome.get("stop_reason") if isinstance(outcome, dict) else None
    message = "planned " + result.method
    if stage is None or stage.get("failure_visible", True):
        message = "status: " + result.status
        if stop_reason is not None:
            message += "; stop: " + str(stop_reason)
    return PlotSpec(
        2,
        [
            make_layer(
                "text",
                {"position": [0.0, 0.0], "text": message},
                ordinal=0,
                namespace="approximation",
                source_intent={
                    "operation": result.problem.operation,
                    "role": "failure-explanation",
                },
                style={
                    "color": "#a23b3b",
                    "font_size": 16,
                    "position": "middle center",
                },
            )
        ],
        axes_or_scene=_axes("", ""),
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": _alt_text(result, stage)}],
        provenance=_provenance(result, constructor, samples, stage),
    )


def _finite_difference_spec(
    result: ApproximationResult,
    samples: int,
    stage: Mapping[str, Any] | None,
    constructor: str,
) -> PlotSpec:
    model = result.value
    use_coarse = stage is not None and stage.get("finite_difference_step") == "coarse"
    prefix = "coarse_" if use_coarse else ""
    points = model.get(prefix + "sample_points")
    values = model.get(prefix + "sample_values")
    weights = model.get(prefix + "weights")
    if (
        not isinstance(points, list)
        or not isinstance(values, list)
        or not isinstance(weights, list)
    ):
        raise TypeError("finite-difference result lacks detached stencil samples")
    lower = min(float(value) for value in points)
    upper = max(float(value) for value in points)
    if lower == upper:
        lower -= 1.0
        upper += 1.0
    layers = [
        make_layer(
            "line",
            {"x": [lower, upper], "y": [0.0, 0.0]},
            ordinal=0,
            namespace="approximation",
            source_intent={
                "operation": result.problem.operation,
                "role": "zero-reference",
            },
            style={"color": "#888888", "width": 1, "dash": "dot"},
            legend={"label": "zero", "show": False},
        ),
        make_layer(
            "point",
            {"x": points, "y": values},
            ordinal=1,
            namespace="approximation",
            source_intent={
                "operation": result.problem.operation,
                "role": "stencil-samples",
            },
            style={"color": "#dd8452", "size": 9, "symbol": "circle"},
            legend={"label": "function samples", "show": True},
            metadata={
                "weights": weights,
                "step": model.get("coarse_step") if use_coarse else model.get("step"),
            },
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes("x", "f(x)"),
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": _alt_text(result, stage)}],
        provenance=_provenance(result, constructor, samples, stage),
    )


def _curve_spec(
    result: ApproximationResult,
    samples: int,
    stage: Mapping[str, Any] | None,
    constructor: str,
) -> PlotSpec:
    model = result.value
    nodes = model.get("nodes")
    values = model.get("values")
    if not isinstance(nodes, list) or not isinstance(values, list):
        raise TypeError("approximation result lacks detached construction samples")
    x_values = _plot_grid(result, samples)
    coefficient_count_value = None if stage is None else stage.get("coefficient_count")
    coefficient_count = (
        int(coefficient_count_value) if coefficient_count_value is not None else None
    )
    y_values: list[float | None] = list(
        _series_values(result, x_values, coefficient_count)
    )
    visible_nodes = len(nodes)
    if stage is not None and stage.get("visible_nodes") is not None:
        visible_nodes = int(stage["visible_nodes"])
    visible_segments = None if stage is None else stage.get("visible_segments")
    if visible_segments is not None:
        segment_count = int(visible_segments)
        cutoff = float(nodes[min(segment_count, len(nodes) - 1)])
        y_values = [
            y_values[index] if x_values[index] <= cutoff else None
            for index in range(len(x_values))
        ]
        visible_nodes = min(len(nodes), segment_count + 1)
    layers = [
        make_layer(
            "line",
            {"x": x_values, "y": y_values},
            ordinal=0,
            namespace="approximation",
            source_intent={
                "operation": result.problem.operation,
                "role": "approximant",
            },
            style={"color": "#3366cc", "width": 2, "dash": "solid"},
            legend={"label": "approximant", "show": True},
        ),
        make_layer(
            "point",
            {"x": nodes[:visible_nodes], "y": values[:visible_nodes]},
            ordinal=1,
            namespace="approximation",
            source_intent={
                "operation": result.problem.operation,
                "role": "construction-samples",
            },
            style={"color": "#dd8452", "size": 8, "symbol": "circle"},
            legend={"label": "samples", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes("x", "approximation"),
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": _alt_text(result, stage)}],
        provenance=_provenance(result, constructor, samples, stage),
    )


def _stage_spec(
    result: ApproximationResult,
    samples: int,
    stage: Mapping[str, Any] | None,
    constructor: str,
) -> PlotSpec:
    if not result.success:
        return _failure_spec(result, samples, stage, constructor)
    if result.value.get("kind") == "finite_difference":
        return _finite_difference_spec(result, samples, stage, constructor)
    return _curve_spec(result, samples, stage, constructor)


def approximation_plot_spec(
    result: ApproximationResult, samples: int = 201
) -> PlotSpec:
    """Return a bounded canonical PlotSpec without renderer coupling."""
    count = _bounded_integer(samples, "plot samples", 2, MAX_STATIC_PLOT_SAMPLES)
    return _stage_spec(result, count, None, "ApproximationResult.to_plot_spec")


def _bounded_progress(total: int, maximum: int, *, start: int = 1) -> list[int]:
    if total < start:
        return [start, start]
    count = total - start + 1
    if count == 1:
        return [start, start]
    if count <= maximum:
        return list(range(start, total + 1))
    answer: list[int] = []
    for index in range(maximum):
        value = start + round(index * (total - start) / (maximum - 1))
        if not answer or value != answer[-1]:
            answer.append(value)
    return answer


def _animation_stages(
    result: ApproximationResult, maximum_frames: int
) -> list[dict[str, Any]]:
    model = result.value
    kind = str(model.get("kind", "none"))
    if not result.success:
        return [
            {"label": "planned " + result.method, "failure_visible": False},
            {"label": "stopped: " + result.status, "failure_visible": True},
        ]
    if kind in ("barycentric_polynomial", "piecewise_linear"):
        nodes = model.get("nodes")
        if not isinstance(nodes, list):
            raise TypeError("interpolation animation requires nodes")
        return [
            {
                "label": "samples " + str(count) + "/" + str(len(nodes)),
                "visible_nodes": count,
            }
            for count in _bounded_progress(len(nodes), maximum_frames)
        ]
    if kind == "cubic_spline":
        coefficients = model.get("coefficients")
        if not isinstance(coefficients, list):
            raise TypeError("spline animation requires coefficients")
        return [
            {
                "label": "segments " + str(count) + "/" + str(len(coefficients)),
                "visible_segments": count,
            }
            for count in _bounded_progress(len(coefficients), maximum_frames)
        ]
    if kind == "chebyshev_series":
        coefficients = model.get("coefficients")
        if not isinstance(coefficients, list):
            raise TypeError("Chebyshev animation requires coefficients")
        counts = _bounded_progress(len(coefficients), maximum_frames)
        return [
            {
                "label": "coefficients " + str(count) + "/" + str(len(coefficients)),
                "coefficient_count": count,
            }
            for count in counts
        ]
    if kind == "finite_difference":
        return [
            {"label": "coarse stencil", "finite_difference_step": "coarse"},
            {"label": "halved stencil", "finite_difference_step": "fine"},
        ]
    return [{"label": "constructed"}, {"label": "validated"}]


def approximation_animation(
    result: ApproximationResult,
    *,
    samples: int = 129,
    max_frames: int = 32,
) -> PlotAnimation:
    """Return a bounded semantic construction/failure animation."""
    sample_count = _bounded_integer(
        samples, "animation plot samples", 2, MAX_ANIMATION_PLOT_SAMPLES
    )
    frame_limit = _bounded_integer(
        max_frames,
        "animation max_frames",
        2,
        MAX_APPROXIMATION_ANIMATION_FRAMES,
    )
    stages = _animation_stages(result, frame_limit)
    if len(stages) > frame_limit:
        raise ValueError("approximation animation stage selection exceeded max_frames")
    frames: list[AnimationFrame] = []
    for index in range(len(stages)):
        stage = stages[index]
        frames.append(
            AnimationFrame(
                stable_frame_id(index),
                _stage_spec(
                    result,
                    sample_count,
                    stage,
                    "ApproximationResult.to_animation",
                ),
                label=str(stage["label"]),
                metadata={
                    "stage": stage,
                    "trace_truncated": result.trace.truncated,
                    "retained_trace_events": len(result.trace.events),
                },
            )
        )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=MAX_APPROXIMATION_ANIMATION_FRAMES,
            max_layers_per_frame=4,
            max_total_samples=MAX_APPROXIMATION_ANIMATION_SCALARS,
            max_payload_bytes=MAX_APPROXIMATION_ANIMATION_BYTES,
            max_duration_ms=MAX_APPROXIMATION_ANIMATION_FRAMES * 350,
        ),
        metadata={
            "operation": result.problem.operation,
            "method": result.method,
            "status": result.status,
            "problem_digest": result.problem.digest,
            "trace_truncated": result.trace.truncated,
            "presentation_limits": {
                "plot_samples": sample_count,
                "requested_max_frames": frame_limit,
                "hard_max_frames": MAX_APPROXIMATION_ANIMATION_FRAMES,
                "hard_max_total_samples": MAX_APPROXIMATION_ANIMATION_SCALARS,
                "hard_max_payload_bytes": MAX_APPROXIMATION_ANIMATION_BYTES,
            },
        },
    )
