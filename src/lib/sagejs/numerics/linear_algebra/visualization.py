"""Structured explanations and bounded PlotSpec views for linear algebra."""

from __future__ import annotations

import math
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

from ..model import NumericalResult

_FACTOR_PHASES = (
    "partial_pivot_lu",
    "householder_qr",
    "cholesky_factorization",
)


def _axes(x_label: str, y_label: str) -> dict[str, Any]:
    return Axes2DSettings(
        AxisSettings(label=x_label),
        AxisSettings(label=y_label),
    ).to_dict()


def _result_record(result: NumericalResult) -> dict[str, Any]:
    if result.problem.domain != "linear_algebra":
        raise ValueError(
            "linear-algebra visualization requires a linear-algebra result"
        )
    return result.to_dict()


def _domain_payload(record: dict[str, Any]) -> dict[str, Any]:
    value = record.get("domain_payload")
    return value if isinstance(value, dict) else {}


def _finite(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    return numeric if math.isfinite(numeric) else None


def _number_text(value: Any) -> str:
    numeric = _finite(value)
    if numeric is None:
        return "unavailable"
    return str(numeric)


def _spectral_record(record: dict[str, Any]) -> dict[str, Any] | None:
    payload = _domain_payload(record)
    nested = payload.get("rank_diagnostics")
    if isinstance(nested, dict) and isinstance(nested.get("singular_values"), list):
        return nested
    if isinstance(payload.get("singular_values"), list):
        return payload
    return None


def _factorization_record(record: dict[str, Any]) -> dict[str, Any] | None:
    payload = _domain_payload(record)
    factorization = payload.get("factorization")
    return factorization if isinstance(factorization, dict) else None


def _factorization_summary(record: dict[str, Any]) -> dict[str, Any] | None:
    factorization = _factorization_record(record)
    if factorization is None:
        return None
    names = (
        "kind",
        "identity",
        "factorized_operand",
        "swaps",
        "diagonal_pivots",
        "rank_estimate",
        "pivot_threshold",
        "rank_threshold",
    )
    return {name: factorization[name] for name in names if name in factorization}


def _shape_record(result: NumericalResult) -> list[int]:
    problem = result.problem.to_dict()
    variables = problem.get("variables")
    if isinstance(variables, list) and len(variables) != 0:
        first = variables[0]
        shape = first.get("shape") if isinstance(first, dict) else None
        if isinstance(shape, list):
            output: list[int] = []
            for value in shape:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    return []
                output.append(int(value))
            return output
    return []


def _guidance(failure_code: str | None) -> list[str]:
    if failure_code == "rank_deficient":
        return [
            "Inspect the recorded numerical-rank threshold and singular-value profile.",
            "Rescale or reformulate the problem; use an SVD/pseudoinverse method when rank-deficient support is required.",
        ]
    if failure_code == "not_positive_definite":
        return [
            "Inspect the failed leading-minor pivot.",
            "Use a general factorization if the matrix is symmetric but indefinite.",
        ]
    if failure_code == "not_symmetric":
        return ["Compare the recorded mismatching transpose entries or use LU/QR."]
    if failure_code in ("dimension_mismatch", "matrix_not_square"):
        return ["Repair the recorded coefficient/right-side shapes before retrying."]
    if failure_code == "maximum_elapsed_time":
        return ["Increase `max_elapsed_ms` or reduce the dense problem size."]
    if failure_code == "cancelled":
        return ["Resume only if the caller still wants the computation."]
    if failure_code == "nonfinite_intermediate":
        return [
            "Rescale the problem or use a numeric type with a wider exponent range."
        ]
    if failure_code is not None:
        return ["Inspect the failed validation check and structured failure details."]
    return []


def linear_algebra_explanation(result: NumericalResult) -> dict[str, Any]:
    """Return a JSON-safe pedagogical explanation of a linear-algebra result."""
    record = _result_record(result)
    payload = _domain_payload(record)
    validation = record.get("validation")
    validation_record = validation if isinstance(validation, dict) else {}
    checks = validation_record.get("checks")
    check_records = checks if isinstance(checks, list) else []
    spectral = _spectral_record(record)
    failure_code_value = payload.get("failure_code")
    failure_code = failure_code_value if isinstance(failure_code_value, str) else None
    outcome = "succeeded" if result.success else "failed"
    operation_text = result.problem.operation.replace("_", " ")
    summary = (
        operation_text
        + " "
        + outcome
        + " with "
        + result.method
        + "; validation "
        + ("passed" if result.validation.passed else "did not pass")
        + "."
    )
    if failure_code is not None:
        summary += " Classified failure: " + failure_code + "."
    conditioning: dict[str, Any] | None = None
    if spectral is not None:
        conditioning = {
            "rank": spectral.get("rank"),
            "rank_threshold": spectral.get("rank_threshold"),
            "condition_2": spectral.get("condition_2"),
            "condition_kind": spectral.get("condition_kind"),
            "singular_values": spectral.get("singular_values", []),
            "converged": spectral.get("converged"),
            "sweeps": spectral.get("sweeps"),
        }
    trace_record = result.trace.to_dict()
    trace_policy = trace_record.get("policy")
    trace_level = trace_policy.get("level") if isinstance(trace_policy, dict) else None
    independent_validation = result.validation.truth_level == "validated_approximate"
    return {
        "schema_version": 1,
        "domain": "linear_algebra",
        "operation": result.problem.operation,
        "shape": _shape_record(result),
        "summary": summary,
        "outcome": {
            "success": result.success,
            "status": result.status,
            "failure_code": failure_code,
            "failure_details": payload.get("failure_details"),
        },
        "selection": {
            "method": result.method,
            "backend": result.backend,
            "reason": result.plan_record.to_dict().get("selection_reason"),
        },
        "validation": {
            "truth_level": result.validation.truth_level,
            "passed": result.validation.passed,
            "residual": result.residual,
            "checks": check_records,
            "independent": independent_validation,
            "evidence_kind": (
                "independent_postcheck"
                if independent_validation
                else "algorithm_diagnostic"
            ),
        },
        "conditioning": conditioning,
        "factorization": _factorization_summary(record),
        "trace": {
            "level": trace_level,
            "retained_events": trace_record["retained_events"],
            "dropped_events": trace_record["dropped_events"],
            "truncated": trace_record["truncated"],
        },
        "guidance": _guidance(failure_code),
    }


def describe_linear_algebra(result: NumericalResult) -> str:
    """Return a concise accessible natural-language result explanation."""
    explanation = linear_algebra_explanation(result)
    lines = [str(explanation["summary"])]
    conditioning = explanation.get("conditioning")
    if isinstance(conditioning, dict):
        lines.append(
            "Estimated rank "
            + str(conditioning.get("rank"))
            + "; condition "
            + str(conditioning.get("condition_kind"))
            + " ("
            + _number_text(conditioning.get("condition_2"))
            + ")."
        )
    validation = explanation["validation"]
    if isinstance(validation, dict) and validation.get("residual") is not None:
        lines.append(
            "Independent residual: " + _number_text(validation["residual"]) + "."
        )
    guidance = explanation["guidance"]
    if isinstance(guidance, list):
        for item in guidance:
            lines.append("Next: " + str(item))
    return "\n".join(lines)


def _provenance(result: NumericalResult, constructor: str, view: str) -> Provenance:
    return Provenance(
        "sagejs.numerics.linear_algebra",
        source_language=str(result.problem.source_intent.get("language", "python")),
        constructor=constructor,
        metadata={
            "problem_digest": result.problem.digest,
            "operation": result.problem.operation,
            "method": result.method,
            "status": result.status,
            "truth_level": result.validation.truth_level,
            "view": view,
        },
    )


def _line_and_points(
    x_values: list[float],
    y_values: list[float],
    *,
    source_role: str,
    label: str,
) -> list[Any]:
    data = {"x": x_values, "y": y_values}
    source = {"operation": "linear_algebra", "role": source_role}
    return [
        make_layer(
            "line",
            data,
            ordinal=0,
            source_intent=source,
            style={"color": "#3366cc", "width": 2},
            legend={"label": label, "show": True},
        ),
        make_layer(
            "point",
            data,
            ordinal=1,
            source_intent=source,
            style={"color": "#3366cc", "size": 8},
            legend={"label": label + " samples", "show": False},
        ),
    ]


def _conditioning_plot(result: NumericalResult, record: dict[str, Any]) -> PlotSpec:
    spectral = _spectral_record(record)
    if spectral is None:
        raise ValueError("conditioning view requires retained rank diagnostics")
    raw_values = spectral.get("singular_values")
    if not isinstance(raw_values, list):
        raise ValueError("conditioning view requires singular values")
    values = [0.0 if _finite(value) is None else float(value) for value in raw_values]
    largest = max(values, default=0.0)
    relative = [value / largest if largest != 0.0 else 0.0 for value in values]
    threshold = _finite(spectral.get("rank_threshold"))
    relative_threshold = (
        threshold / largest if threshold is not None and largest != 0.0 else 0.0
    )
    x_values = [float(index + 1) for index in range(len(relative))]
    layers = _line_and_points(
        x_values,
        relative,
        source_role="relative_singular_values",
        label="relative singular value",
    )
    layers.append(
        make_layer(
            "line",
            {
                "x": ([1.0, float(len(relative))] if len(relative) != 0 else []),
                "y": (
                    [relative_threshold, relative_threshold]
                    if len(relative) != 0
                    else []
                ),
            },
            ordinal=2,
            source_intent={"operation": "linear_algebra", "role": "rank_threshold"},
            style={"color": "#c44e52", "width": 2, "dash": "dash"},
            legend={"label": "rank threshold", "show": True},
        )
    )
    rank = spectral.get("rank")
    condition_kind = spectral.get("condition_kind")
    alt_text = (
        "Relative singular-value profile for "
        + result.problem.operation.replace("_", " ")
        + ". Estimated rank "
        + str(rank)
        + " of "
        + str(len(relative))
        + "; condition is "
        + str(condition_kind)
        + ". The red line is the numerical-rank threshold."
    )
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes("singular-value index", "sigma / sigma_max"),
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": alt_text}],
        provenance=_provenance(result, "linear_algebra_plot", "conditioning"),
    )


def _matrix_diagonal(record: dict[str, Any]) -> list[float]:
    shape = record.get("shape")
    entries = record.get("entries")
    if not isinstance(shape, list) or len(shape) != 2 or not isinstance(entries, list):
        return []
    rows = int(shape[0])
    columns = int(shape[1])
    diagonal: list[float] = []
    for index in range(min(rows, columns)):
        value = _finite(entries[index * columns + index])
        diagonal.append(0.0 if value is None else abs(value))
    return diagonal


def _factor_values(record: dict[str, Any]) -> tuple[str, list[float], float]:
    factor = _factorization_record(record)
    if factor is None:
        raise ValueError("factorization view requires a retained factorization")
    kind = str(factor.get("kind", "factorization"))
    matrix: dict[str, Any] | None = None
    for name in ("upper", "r", "lower"):
        candidate = factor.get(name)
        if isinstance(candidate, dict):
            matrix = candidate
            break
    if matrix is None:
        raise ValueError("factorization view requires a triangular factor")
    values = _matrix_diagonal(matrix)
    threshold = _finite(factor.get("pivot_threshold"))
    if threshold is None:
        threshold = _finite(factor.get("rank_threshold"))
    return kind, values, 0.0 if threshold is None else threshold


def _factorization_plot(result: NumericalResult, record: dict[str, Any]) -> PlotSpec:
    kind, values, threshold = _factor_values(record)
    scale = max(values, default=0.0)
    relative = [value / scale if scale != 0.0 else 0.0 for value in values]
    relative_threshold = threshold / scale if scale != 0.0 else 0.0
    if not math.isfinite(relative_threshold):
        relative_threshold = 1e300
    x_values = [float(index + 1) for index in range(len(values))]
    layers = _line_and_points(
        x_values,
        relative,
        source_role="factor_diagonal",
        label="relative factor diagonal",
    )
    layers.append(
        make_layer(
            "line",
            {
                "x": ([1.0, float(len(values))] if len(values) != 0 else []),
                "y": (
                    [relative_threshold, relative_threshold] if len(values) != 0 else []
                ),
            },
            ordinal=2,
            source_intent={"operation": "linear_algebra", "role": "factor_threshold"},
            style={"color": "#c44e52", "width": 2, "dash": "dash"},
            legend={"label": "usable-pivot threshold", "show": True},
        )
    )
    alt_text = (
        kind
        + " factorization diagonal profile with "
        + str(len(values))
        + " steps. Blue values are normalized diagonal magnitudes; the red line is the recorded usable-pivot threshold. Independent reconstruction validation "
        + ("passed." if result.validation.passed else "did not pass.")
    )
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes("factorization step", "relative diagonal magnitude"),
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": alt_text}],
        provenance=_provenance(result, "linear_algebra_plot", "factorization"),
    )


def _validation_metric(check: dict[str, Any]) -> tuple[float, float | None]:
    threshold = _finite(check.get("threshold"))
    for name in (
        "relative_error_infinity",
        "error_infinity",
        "backward_error_infinity",
        "scaled_normal_residual",
        "relative_orthogonal_component",
        "residual_infinity",
    ):
        value = _finite(check.get(name))
        if value is not None:
            return value, threshold
    return (1.0 if check.get("passed") is True else 0.0), None


def _validation_plot(result: NumericalResult, record: dict[str, Any]) -> PlotSpec:
    validation = record.get("validation")
    checks_value = validation.get("checks") if isinstance(validation, dict) else None
    checks = checks_value if isinstance(checks_value, list) else []
    values: list[float] = []
    labels: list[str] = []
    for index, value in enumerate(checks):
        if not isinstance(value, dict):
            continue
        metric, threshold = _validation_metric(value)
        if threshold is not None and threshold > 0.0:
            ratio = metric / threshold
            values.append(ratio if math.isfinite(ratio) else 1e300)
        else:
            values.append(metric)
        labels.append(str(value.get("kind", "check-" + str(index + 1))))
    if len(values) == 0:
        values = [1.0 if result.validation.passed else 0.0]
        labels = ["operation_completed"]
    x_values = [float(index + 1) for index in range(len(values))]
    layers = _line_and_points(
        x_values,
        values,
        source_role="validation_ratio",
        label="error / threshold",
    )
    alt_text = (
        "Independent validation profile for "
        + result.problem.operation.replace("_", " ")
        + ". "
        + str(len(values))
        + " checks are shown in order: "
        + ", ".join(labels)
        + ". Validation "
        + ("passed." if result.validation.passed else "did not pass.")
    )
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes(
            "validation check index", "error / threshold (or pass indicator)"
        ),
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": alt_text}],
        provenance=_provenance(result, "linear_algebra_plot", "validation"),
        plotly_overrides={
            "layout": {"xaxis": {"tickvals": x_values, "ticktext": labels}}
        },
    )


def _trace_series(
    result: NumericalResult, view: str
) -> tuple[list[dict[str, Any]], str, str]:
    factor_records: list[dict[str, Any]] = []
    refinement_records: list[dict[str, Any]] = []
    jacobi_records: list[dict[str, Any]] = []
    for event in result.trace.events:
        data = event.data
        phase = data.get("phase")
        if phase in _FACTOR_PHASES:
            factor_records.append(data)
        elif phase == "iterative_refinement":
            refinement_records.append(data)
        elif phase == "jacobi_singular_values":
            jacobi_records.append(data)
    if view == "factorization":
        return factor_records, "factorization step", "relative pivot magnitude"
    records = refinement_records if len(refinement_records) != 0 else jacobi_records
    return records, "iteration", "relative convergence metric"


def _trace_xy(
    records: list[dict[str, Any]], view: str, normalizer: float | None = None
) -> tuple[list[float], list[float]]:
    raw: list[float] = []
    for record in records:
        if view == "factorization":
            value = _finite(record.get("pivot_magnitude"))
            if value is None:
                value = _finite(record.get("diagonal_magnitude"))
        elif record.get("phase") == "iterative_refinement":
            value = _finite(record.get("backward_error_after"))
        else:
            value = _finite(record.get("largest_column_correlation"))
        raw.append(0.0 if value is None else abs(value))
    scale = max(raw, default=0.0) if normalizer is None else normalizer
    values = [value / scale if scale != 0.0 else 0.0 for value in raw]
    return [float(index + 1) for index in range(len(values))], values


def _convergence_plot(result: NumericalResult) -> PlotSpec:
    records, x_label, y_label = _trace_series(result, "convergence")
    if len(records) == 0:
        raise ValueError(
            "convergence view requires retained iterative trace events; rerun with trace='iterations'"
        )
    x_values, y_values = _trace_xy(records, "convergence")
    layers = _line_and_points(
        x_values,
        y_values,
        source_role="convergence_history",
        label="relative convergence metric",
    )
    phases = sorted({str(record.get("phase")) for record in records})
    alt_text = (
        "Convergence history from "
        + str(len(records))
        + " retained bounded trace events. Phases: "
        + ", ".join(phases)
        + ". Values are normalized to the largest retained metric."
    )
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes(x_label, y_label),
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": alt_text}],
        provenance=_provenance(result, "linear_algebra_plot", "convergence"),
    )


def linear_algebra_plot(result: NumericalResult, view: str = "auto") -> PlotSpec:
    """Build an accessible static PlotSpec from result evidence."""
    record = _result_record(result)
    allowed = ("auto", "factorization", "conditioning", "convergence", "validation")
    if view not in allowed:
        raise ValueError("view must be one of " + ", ".join(allowed))
    selected = view
    if selected == "auto":
        if _spectral_record(record) is not None:
            selected = "conditioning"
        elif _factorization_record(record) is not None:
            selected = "factorization"
        else:
            selected = "validation"
    if selected == "conditioning":
        return _conditioning_plot(result, record)
    if selected == "factorization":
        return _factorization_plot(result, record)
    if selected == "convergence":
        return _convergence_plot(result)
    return _validation_plot(result, record)


def _bounded_record_indices(count: int, maximum: int) -> list[int]:
    if count <= maximum:
        return list(range(count))
    if maximum == 1:
        return [count - 1]
    indices: list[int] = []
    for ordinal in range(maximum):
        index = round(ordinal * (count - 1) / (maximum - 1))
        if len(indices) == 0 or index != indices[-1]:
            indices.append(index)
    return indices


def _progress_spec(
    result: NumericalResult,
    records: list[dict[str, Any]],
    view: str,
    x_label: str,
    y_label: str,
    normalizer: float,
) -> PlotSpec:
    x_values, y_values = _trace_xy(records, view, normalizer)
    layers = _line_and_points(
        x_values,
        y_values,
        source_role=view + "_progress",
        label="relative progress metric",
    )
    alt_text = (
        view.capitalize()
        + " progress after "
        + str(len(records))
        + " retained steps. Values use one normalization across all frames."
    )
    return PlotSpec(
        2,
        layers,
        axes_or_scene=_axes(x_label, y_label),
        viewport={"responsive": True},
        annotations=[{"kind": "alt_text", "text": alt_text}],
        provenance=_provenance(result, "linear_algebra_animation", view),
    )


def linear_algebra_animation(
    result: NumericalResult,
    view: str = "auto",
    *,
    max_frames: int = 64,
) -> PlotAnimation:
    """Replay retained factorization or convergence events within hard limits."""
    _result_record(result)
    if (
        isinstance(max_frames, bool)
        or not isinstance(max_frames, int)
        or max_frames < 2
    ):
        raise ValueError("max_frames must be an integer at least 2")
    if view not in ("auto", "factorization", "convergence"):
        raise ValueError("animation view must be auto, factorization, or convergence")
    factor_records, factor_x, factor_y = _trace_series(result, "factorization")
    convergence_records, convergence_x, convergence_y = _trace_series(
        result, "convergence"
    )
    selected = view
    if selected == "auto":
        selected = "factorization" if len(factor_records) != 0 else "convergence"
    if selected == "factorization":
        records, x_label, y_label = factor_records, factor_x, factor_y
    else:
        records, x_label, y_label = convergence_records, convergence_x, convergence_y
    if len(records) == 0:
        raise ValueError(
            selected
            + " animation requires retained trace events; rerun with trace='iterations'"
        )
    retained_limit = max(2, result.trace.policy.max_events)
    frame_limit = min(max_frames, retained_limit, 500)
    selected_indices = _bounded_record_indices(len(records), frame_limit)
    _, complete_values = _trace_xy(records, selected)
    raw_maximum = 0.0
    if len(complete_values) != 0:
        unnormalized: list[float] = []
        for record in records:
            _, single = _trace_xy([record], selected, 1.0)
            unnormalized.append(single[0] if len(single) != 0 else 0.0)
        raw_maximum = max(unnormalized, default=0.0)
    prefixes: list[list[dict[str, Any]]] = []
    for index in selected_indices:
        prefixes.append(records[: index + 1])
    if len(prefixes) == 1:
        prefixes.append(list(prefixes[0]))
        selected_indices.append(selected_indices[0])
    frames: list[AnimationFrame] = []
    for index, prefix in enumerate(prefixes):
        frames.append(
            AnimationFrame(
                stable_frame_id(index),
                _progress_spec(
                    result,
                    prefix,
                    selected,
                    x_label,
                    y_label,
                    raw_maximum,
                ),
                label="step " + str(selected_indices[index] + 1),
                metadata={
                    "view": selected,
                    "retained_step_count": len(prefix),
                    "trace_truncated": result.trace.truncated,
                },
            )
        )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=frame_limit,
            max_total_samples=max(1024, frame_limit * frame_limit * 4),
            max_payload_bytes=max(1_000_000, result.trace.policy.max_bytes * 4),
        ),
        metadata={
            "domain": "linear_algebra",
            "operation": result.problem.operation,
            "problem_digest": result.problem.digest,
            "view": selected,
            "source": "retained_bounded_numerical_trace",
            "trace_truncated": result.trace.truncated,
            "requested_max_frames": max_frames,
        },
    )


__all__ = [
    "describe_linear_algebra",
    "linear_algebra_animation",
    "linear_algebra_explanation",
    "linear_algebra_plot",
]
