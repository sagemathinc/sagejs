"""Bounded PlotSpec and PlotAnimation views of retained spectral evidence."""

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

from .result import SpectralResult

_MAX_PLOT_SAMPLES = 1024
_MAX_ANIMATION_FRAMES = 32
_MAX_FLOAT = 1.7976931348623157e308
_COLORS = ("#3366cc", "#dd8452", "#55a868", "#c44e52")


def _complex_value(value: Any) -> complex:
    if isinstance(value, list) and len(value) == 2:
        return complex(float(value[0]), float(value[1]))
    if isinstance(value, list):
        raise TypeError("complex JSON value must have exactly two components")
    return complex(float(value))


def _sample_indices(count: int, maximum: int = _MAX_PLOT_SAMPLES) -> list[int]:
    if count <= maximum:
        return list(range(count))
    answer: list[int] = []
    for ordinal in range(maximum):
        index = int(round(ordinal * (count - 1) / (maximum - 1)))
        if not answer or answer[-1] != index:
            answer.append(index)
    return answer


def _frame_counts(count: int, maximum: int = _MAX_ANIMATION_FRAMES) -> list[int]:
    if count <= 1:
        return [1, 1]
    if count <= maximum:
        return list(range(1, count + 1))
    answer: list[int] = []
    for ordinal in range(maximum):
        candidate = 1 + int(round(ordinal * (count - 1) / (maximum - 1)))
        if not answer or answer[-1] != candidate:
            answer.append(candidate)
    return answer


def _magnitudes(values: list[complex]) -> tuple[list[float], float, bool]:
    magnitudes = [math.hypot(value.real, value.imag) for value in values]
    if all(math.isfinite(value) for value in magnitudes):
        return magnitudes, 1.0, False
    scale = max(max(abs(value.real), abs(value.imag)) for value in values)
    if scale == 0.0 or not math.isfinite(scale):
        raise ValueError("spectral magnitude visualization requires finite values")
    normalized = [
        math.hypot(value.real / scale, value.imag / scale) for value in values
    ]
    if not all(math.isfinite(value) and value <= _MAX_FLOAT for value in normalized):
        raise ValueError("spectral magnitude visualization is not representable")
    return normalized, scale, True


def _provenance(
    result: SpectralResult,
    constructor: str,
    view: str,
    *,
    source_count: int,
    retained_count: int,
    extra_approximations: list[dict[str, Any]] | None = None,
) -> Provenance:
    approximations: list[dict[str, Any]] = []
    if retained_count < source_count:
        approximations.append(
            {
                "kind": "deterministic_visual_decimation",
                "source_count": source_count,
                "retained_count": retained_count,
                "endpoints_preserved": True,
            }
        )
    if extra_approximations is not None:
        approximations.extend(dict(record) for record in extra_approximations)
    return Provenance(
        "sagejs.numerics.spectral",
        source_language=str(result.problem.source_intent.get("language", "python")),
        constructor=constructor,
        approximations=approximations,
        metadata={
            "problem_digest": result.problem.digest,
            "operation": result.problem.operation,
            "method": result.method,
            "view": view,
            "truth_level": result.validation.truth_level,
            "computed_evidence_only": True,
            "trace_truncated": result.trace.truncated,
        },
    )


def _alt_annotation(text: str) -> list[dict[str, Any]]:
    return [{"kind": "alt_text", "text": text}]


def _validation_check(result: SpectralResult, kind: str) -> dict[str, Any] | None:
    checks = result.validation.to_dict().get("checks")
    if not isinstance(checks, list):
        return None
    for check in checks:
        if isinstance(check, dict) and check.get("kind") == kind:
            return check
    return None


def _eigenvalues(result: SpectralResult) -> list[complex]:
    if not isinstance(result.value, dict):
        raise ValueError("eigensystem visualization requires a returned value")
    if result.problem.operation == "sparse_dominant_eigen":
        value = result.value.get("eigenvalue")
        if value is None:
            raise ValueError("sparse eigensystem has no returned eigenvalue")
        return [_complex_value(value)]
    values = result.value.get("eigenvalues")
    if not isinstance(values, list) or not values:
        raise ValueError("eigensystem visualization requires returned eigenvalues")
    return [_complex_value(value) for value in values]


def _eigenvalue_spec(result: SpectralResult, count: int | None = None) -> PlotSpec:
    values = _eigenvalues(result)
    selected_indices = _sample_indices(len(values))
    if count is not None:
        selected_indices = selected_indices[:count]
    selected = [values[index] for index in selected_indices]
    residual_check = _validation_check(result, "eigenpair_backward_residual")
    residuals = [] if residual_check is None else residual_check.get("values", [])
    residual_data = (
        [residuals[index] for index in selected_indices]
        if isinstance(residuals, list) and len(residuals) == len(values)
        else []
    )
    layer = make_layer(
        "point",
        {
            "x": [value.real for value in selected],
            "y": [value.imag for value in selected],
            "eigenvalue_index": selected_indices,
            "backward_residual": residual_data,
        },
        ordinal=0,
        source_intent={
            "operation": result.problem.operation,
            "role": "validated_eigenvalues",
        },
        style={"color": _COLORS[0], "size": 9},
        legend={"label": "eigenvalues", "show": True},
    )
    basis_text = (
        " The right-eigenvector basis failed conditioning validation."
        if result.status == "validation_failed"
        else ""
    )
    return PlotSpec(
        2,
        [layer],
        axes_or_scene={
            "x": {"label": "real part"},
            "y": {"label": "imaginary part"},
        },
        viewport={"responsive": True, "equal_aspect": True},
        annotations=_alt_annotation(
            "Complex-plane eigensystem view with "
            + str(len(selected))
            + " of "
            + str(len(values))
            + " returned eigenvalues. Backward residual evidence is attached "
            "to the eigenvalue layer. Status " + result.status + "." + basis_text
        ),
        provenance=_provenance(
            result,
            "spectral_plot",
            "eigenvalues",
            source_count=len(values),
            retained_count=len(selected),
        ),
    )


def _singular_values(result: SpectralResult) -> list[float]:
    if not isinstance(result.value, dict):
        raise ValueError("SVD visualization requires returned factors")
    values = result.value.get("singular_values")
    if not isinstance(values, list) or not values:
        raise ValueError("SVD visualization requires returned singular values")
    return [float(value) for value in values]


def _singular_value_spec(result: SpectralResult, count: int | None = None) -> PlotSpec:
    values = _singular_values(result)
    selected_indices = _sample_indices(len(values))
    if count is not None:
        selected_indices = selected_indices[:count]
    selected = [values[index] for index in selected_indices]
    data = {"x": selected_indices, "y": selected}
    condition = result.validation.to_dict().get("condition_estimate")
    condition_text = "unavailable" if condition is None else str(condition)
    layers = [
        make_layer(
            "line",
            data,
            ordinal=0,
            source_intent={
                "operation": "singular_value_decomposition",
                "role": "singular_spectrum",
            },
            style={"color": _COLORS[0], "width": 2},
            legend={"label": "singular values", "show": True},
        ),
        make_layer(
            "point",
            data,
            ordinal=1,
            source_intent={
                "operation": "singular_value_decomposition",
                "role": "singular_directions",
            },
            style={"color": _COLORS[1], "size": 7},
            legend={"label": "singular directions", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "singular-value index"},
            "y": {
                "label": "singular value",
                "scale": "log" if all(value > 0.0 for value in selected) else "linear",
            },
        },
        viewport={"responsive": True},
        annotations=_alt_annotation(
            "Reduced SVD singular spectrum with "
            + str(len(selected))
            + " of "
            + str(len(values))
            + " values, ordered from largest to smallest. Reported condition "
            "estimate " + condition_text + "; status " + result.status + "."
        ),
        provenance=_provenance(
            result,
            "spectral_plot",
            "singular_values",
            source_count=len(values),
            retained_count=len(selected),
        ),
    )


def _transform_values(result: SpectralResult) -> list[complex]:
    if not isinstance(result.value, list) or not result.value:
        raise ValueError("transform visualization requires returned coefficients")
    return [_complex_value(value) for value in result.value]


def _frequency(index: int, size: int) -> float:
    return index / size if index <= size // 2 else (index - size) / size


def _spectrum_spec(result: SpectralResult, count: int | None = None) -> PlotSpec:
    values = _transform_values(result)
    selected_indices = _sample_indices(len(values))
    if count is not None:
        selected_indices = selected_indices[:count]
    selected = [values[index] for index in selected_indices]
    magnitudes, magnitude_scale, magnitude_scaled = _magnitudes(selected)
    data = {
        "x": [_frequency(index, len(values)) for index in selected_indices],
        "y": magnitudes,
        "coefficient_index": selected_indices,
        "phase": [math.atan2(value.imag, value.real) for value in selected],
        "magnitude_scale": magnitude_scale,
    }
    layers = [
        make_layer(
            "line",
            data,
            ordinal=0,
            source_intent={
                "operation": result.problem.operation,
                "role": "frequency_magnitude",
            },
            style={"color": _COLORS[0], "width": 2},
            legend={"label": "DFT magnitude", "show": True},
        ),
        make_layer(
            "point",
            data,
            ordinal=1,
            source_intent={
                "operation": result.problem.operation,
                "role": "frequency_bins",
            },
            style={"color": _COLORS[1], "size": 7},
            legend={"label": "DFT bins", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "frequency (cycles per sample)"},
            "y": {
                "label": (
                    "coefficient magnitude divided by scale"
                    if magnitude_scaled
                    else "coefficient magnitude"
                )
            },
        },
        viewport={"responsive": True},
        annotations=_alt_annotation(
            "Discrete Fourier magnitude spectrum with "
            + str(len(selected))
            + " of "
            + str(len(values))
            + " bins. Frequencies are folded into cycles per sample and phases "
            "are attached to the layers. "
            + (
                "Magnitudes are divided by the finite component scale "
                + str(magnitude_scale)
                + " to remain representable. "
                if magnitude_scaled
                else ""
            )
            + "Status "
            + result.status
            + "."
        ),
        provenance=_provenance(
            result,
            "spectral_plot",
            "spectrum",
            source_count=len(values),
            retained_count=len(selected),
            extra_approximations=(
                [
                    {
                        "kind": "binary64_magnitude_normalization",
                        "scale": magnitude_scale,
                    }
                ]
                if magnitude_scaled
                else None
            ),
        ),
    )


def _fft_aliasing_spec(result: SpectralResult) -> PlotSpec:
    values = _transform_values(result)
    selected_indices = _sample_indices(len(values))
    frequencies = [_frequency(index, len(values)) for index in selected_indices]
    selected = [values[index] for index in selected_indices]
    magnitudes, magnitude_scale, magnitude_scaled = _magnitudes(selected)
    layers = []
    for ordinal, shift in enumerate((-1.0, 0.0, 1.0)):
        layers.append(
            make_layer(
                "point",
                {
                    "x": [frequency + shift for frequency in frequencies],
                    "y": magnitudes,
                    "coefficient_index": selected_indices,
                    "alias_shift_cycles_per_sample": shift,
                    "magnitude_scale": magnitude_scale,
                },
                ordinal=ordinal,
                source_intent={
                    "operation": result.problem.operation,
                    "role": "alias_class_copy",
                    "integer_frequency_shift": int(shift),
                },
                style={"color": _COLORS[ordinal], "size": 6},
                legend={
                    "label": ("base bins" if shift == 0.0 else "integer-shift alias"),
                    "show": True,
                },
            )
        )
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "frequency (cycles per sample)"},
            "y": {
                "label": (
                    "shared DFT magnitude divided by scale"
                    if magnitude_scaled
                    else "shared DFT magnitude"
                )
            },
        },
        viewport={"responsive": True},
        annotations=_alt_annotation(
            "Aliasing explanation for "
            + str(len(values))
            + " DFT bins. Each magnitude is repeated at frequencies separated "
            "by one cycle per sample, because those continuous frequencies have "
            "the same sampled values. A physical sample rate and band-limit are "
            "required to decide which representative is meaningful."
            + (
                " Magnitudes are divided by the finite component scale "
                + str(magnitude_scale)
                + "."
                if magnitude_scaled
                else ""
            )
        ),
        provenance=_provenance(
            result,
            "spectral_plot",
            "aliasing",
            source_count=len(values),
            retained_count=len(selected_indices),
            extra_approximations=(
                [
                    {
                        "kind": "binary64_magnitude_normalization",
                        "scale": magnitude_scale,
                    }
                ]
                if magnitude_scaled
                else None
            ),
        ),
    )


def _convolution_values(result: SpectralResult) -> tuple[list[complex], list[int]]:
    if not isinstance(result.value, list) or not result.value:
        raise ValueError("convolution visualization requires returned coefficients")
    values = [_complex_value(value) for value in result.value]
    returned_slice = result.domain_payload.get("returned_slice")
    start = (
        int(returned_slice[0])
        if isinstance(returned_slice, list) and len(returned_slice) == 2
        else 0
    )
    return values, list(range(start, start + len(values)))


def _convolution_spec(result: SpectralResult, count: int | None = None) -> PlotSpec:
    values, indices = _convolution_values(result)
    selected_positions = _sample_indices(len(values))
    if count is not None:
        selected_positions = selected_positions[:count]
    selected = [values[position] for position in selected_positions]
    selected_indices = [indices[position] for position in selected_positions]
    magnitudes, magnitude_scale, magnitude_scaled = _magnitudes(selected)
    data = {
        "x": selected_indices,
        "y": magnitudes,
        "real": [value.real for value in selected],
        "imaginary": [value.imag for value in selected],
        "magnitude_scale": magnitude_scale,
    }
    layers = [
        make_layer(
            "line",
            data,
            ordinal=0,
            source_intent={"operation": "convolution", "role": "linear_output"},
            style={"color": _COLORS[0], "width": 2},
            legend={"label": "linear-convolution magnitude", "show": True},
        ),
        make_layer(
            "point",
            data,
            ordinal=1,
            source_intent={"operation": "convolution", "role": "coefficients"},
            style={"color": _COLORS[1], "size": 7},
            legend={"label": "coefficients", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "linear output index"},
            "y": {
                "label": (
                    "coefficient magnitude divided by scale"
                    if magnitude_scaled
                    else "coefficient magnitude"
                )
            },
        },
        viewport={"responsive": True},
        annotations=_alt_annotation(
            "Linear-convolution output with "
            + str(len(selected))
            + " of "
            + str(len(values))
            + " returned coefficients. Real and imaginary components are "
            "attached to each layer. "
            + (
                "Magnitudes are divided by the finite component scale "
                + str(magnitude_scale)
                + " to remain representable; "
                if magnitude_scaled
                else ""
            )
            + "status "
            + result.status
            + "."
        ),
        provenance=_provenance(
            result,
            "spectral_plot",
            "coefficients",
            source_count=len(values),
            retained_count=len(selected),
            extra_approximations=(
                [
                    {
                        "kind": "binary64_magnitude_normalization",
                        "scale": magnitude_scale,
                    }
                ]
                if magnitude_scaled
                else None
            ),
        ),
    )


def _convolution_aliasing_spec(result: SpectralResult) -> PlotSpec:
    values, indices = _convolution_values(result)
    selected_positions = _sample_indices(len(values))
    selected_indices = [indices[position] for position in selected_positions]
    selected = [values[position] for position in selected_positions]
    magnitudes, magnitude_scale, magnitude_scaled = _magnitudes(selected)
    metadata = result.problem.to_dict().get("metadata")
    metadata_record = metadata if isinstance(metadata, dict) else {}
    left_value = metadata_record.get("left_length")
    right_value = metadata_record.get("right_length")
    left_length = left_value if isinstance(left_value, int) else 1
    right_length = right_value if isinstance(right_value, int) else 1
    period = max(left_length, right_length)
    wrapped = [index % period for index in selected_indices]
    data = {
        "x": selected_indices,
        "y": wrapped,
        "magnitude": magnitudes,
        "magnitude_scale": magnitude_scale,
        "circular_period": period,
    }
    layers = [
        make_layer(
            "line",
            data,
            ordinal=0,
            source_intent={
                "operation": "convolution",
                "role": "circular_index_mapping",
            },
            style={"color": _COLORS[0], "width": 2},
            legend={"label": "wrapped index", "show": True},
        ),
        make_layer(
            "point",
            data,
            ordinal=1,
            source_intent={
                "operation": "convolution",
                "role": "wraparound_collisions",
            },
            style={"color": _COLORS[3], "size": 7},
            legend={"label": "linear terms before collision", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "linear-convolution index"},
            "y": {"label": "index after circular wrap"},
        },
        viewport={"responsive": True},
        annotations=_alt_annotation(
            "Circular-convolution aliasing map for period "
            + str(period)
            + ". Linear output indices with the same wrapped index would collide. "
            "The Sage.js FFT convolution avoids these collisions by zero-padding "
            "to cover the full linear output length."
        ),
        provenance=_provenance(
            result,
            "spectral_plot",
            "aliasing",
            source_count=len(values),
            retained_count=len(selected_positions),
            extra_approximations=(
                [
                    {
                        "kind": "binary64_magnitude_normalization",
                        "scale": magnitude_scale,
                    }
                ]
                if magnitude_scaled
                else None
            ),
        ),
    )


def _conditioning_spec(result: SpectralResult) -> PlotSpec:
    if result.problem.operation == "singular_value_decomposition" and result.value:
        return _singular_value_spec(result)
    check = _validation_check(result, "eigenbasis_reciprocal_condition")
    if check is None:
        raise ValueError(
            "conditioning visualization requires eigenbasis or singular-value evidence"
        )
    value = float(check.get("value", 0.0))
    threshold = float(check.get("threshold", 0.0))
    positives = [candidate for candidate in (value, threshold) if candidate > 0.0]
    display_floor = min(positives) if positives else 1e-300
    display_value = max(value, display_floor)
    display_threshold = max(threshold, display_floor)
    layers = [
        make_layer(
            "point",
            {"x": [0.0], "y": [display_value], "actual_value": [value]},
            ordinal=0,
            source_intent={
                "operation": result.problem.operation,
                "role": "eigenbasis_reciprocal_condition",
            },
            style={"color": _COLORS[3], "size": 10},
            legend={"label": "basis reciprocal condition", "show": True},
        ),
        make_layer(
            "line",
            {"x": [-0.5, 0.5], "y": [display_threshold, display_threshold]},
            ordinal=1,
            source_intent={
                "operation": result.problem.operation,
                "role": "minimum_accepted_condition",
            },
            style={"color": _COLORS[2], "width": 2, "dash": "dash"},
            legend={"label": "acceptance threshold", "show": True},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "eigenvector basis"},
            "y": {"label": "reciprocal condition", "scale": "log"},
        },
        viewport={"responsive": True},
        annotations=_alt_annotation(
            "Eigenbasis conditioning witness. Reciprocal condition "
            + str(value)
            + " must be at least "
            + str(threshold)
            + ". The check "
            + (
                "passed."
                if check.get("passed") is True
                else "failed, so no eigensystem was returned."
            )
        ),
        provenance=_provenance(
            result,
            "spectral_plot",
            "conditioning",
            source_count=1,
            retained_count=1,
        ),
    )


def _progress_records(result: SpectralResult) -> list[dict[str, Any]]:
    priorities = (
        ("backward_residual", "target"),
        ("residual_norm", "target"),
        ("off_diagonal_norm", None),
        ("lower_triangle_norm", None),
        ("maximum_column_correlation", None),
        ("coupling_norm", None),
        ("block_size", None),
    )
    records: list[dict[str, Any]] = []
    for event in result.trace.events:
        if event.kind not in ("iteration", "phase"):
            continue
        data = event.data
        for metric, target_key in priorities:
            value = data.get(metric)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                target = data.get(target_key) if target_key is not None else None
                records.append(
                    {
                        "sequence": event.sequence,
                        "metric": metric,
                        "value": abs(float(value)),
                        "target": (
                            abs(float(target))
                            if isinstance(target, (int, float))
                            and not isinstance(target, bool)
                            else None
                        ),
                        "phase": str(data.get("phase", event.kind)),
                    }
                )
                break
    return records


def _convergence_spec(
    result: SpectralResult,
    records: list[dict[str, Any]] | None = None,
) -> PlotSpec:
    source_records = _progress_records(result) if records is None else records
    if not source_records:
        raise ValueError(
            "convergence visualization requires retained iteration or phase trace events"
        )
    selected_positions = _sample_indices(len(source_records))
    selected = [source_records[position] for position in selected_positions]
    x_values = selected_positions
    values = [float(record["value"]) for record in selected]
    targets = [record["target"] for record in selected if record["target"] is not None]
    target = float(targets[-1]) if targets else None
    positive = all(value > 0.0 for value in values) and (target is None or target > 0.0)
    if target is None:
        placeholder = min(values) if positive else 0.0
        target_data = {
            "x": [x_values[0], x_values[-1]],
            "y": [placeholder, placeholder],
        }
        target_visible = False
    else:
        target_data = {"x": [x_values[0], x_values[-1]], "y": [target, target]}
        target_visible = True
    data = {
        "x": x_values,
        "y": values,
        "metric": [str(record["metric"]) for record in selected],
        "phase": [str(record["phase"]) for record in selected],
        "trace_sequence": [int(record["sequence"]) for record in selected],
    }
    layers = [
        make_layer(
            "line",
            data,
            ordinal=0,
            source_intent={
                "operation": result.problem.operation,
                "role": "retained_convergence_metric",
            },
            style={"color": _COLORS[0], "width": 2},
            legend={"label": "retained progress metric", "show": True},
        ),
        make_layer(
            "point",
            data,
            ordinal=1,
            source_intent={
                "operation": result.problem.operation,
                "role": "retained_semantic_events",
            },
            style={"color": _COLORS[1], "size": 7},
            legend={"label": "retained trace events", "show": True},
        ),
        make_layer(
            "line",
            target_data,
            ordinal=2,
            source_intent={
                "operation": result.problem.operation,
                "role": "convergence_target",
            },
            style={"color": _COLORS[2], "width": 1, "dash": "dash"},
            visibility=target_visible,
            legend={"label": "target", "show": target_visible},
        ),
    ]
    return PlotSpec(
        2,
        layers,
        axes_or_scene={
            "x": {"label": "retained semantic event"},
            "y": {
                "label": "progress metric",
                "scale": "log" if positive else "linear",
            },
        },
        viewport={"responsive": True},
        annotations=_alt_annotation(
            "Convergence evidence from "
            + str(len(selected))
            + " retained semantic trace events. Metrics and algorithm phases are "
            "attached to the layers; status "
            + result.status
            + (". The trace was truncated." if result.trace.truncated else ".")
        ),
        provenance=_provenance(
            result,
            "spectral_plot",
            "convergence",
            source_count=len(source_records),
            retained_count=len(selected),
        ),
    )


def spectral_plot(result: SpectralResult, *, kind: str = "auto") -> PlotSpec:
    """Return a static spectral view from values, validation, or retained traces."""
    operation = result.problem.operation
    selected = str(kind).lower()
    if selected == "auto":
        if (
            not result.success
            and operation == "general_eigen"
            and _validation_check(result, "eigenbasis_reciprocal_condition") is not None
        ):
            selected = "conditioning"
        elif result.value is not None and operation in (
            "symmetric_eigen",
            "general_eigen",
            "sparse_dominant_eigen",
        ):
            selected = "eigenvalues"
        elif result.value is not None and operation == "singular_value_decomposition":
            selected = "singular_values"
        elif result.value is not None and operation in (
            "fourier_transform",
            "inverse_fourier_transform",
        ):
            selected = "spectrum"
        elif result.value is not None and operation == "convolution":
            selected = "coefficients"
        else:
            selected = "convergence"
    if selected in ("eigenvalue", "eigenvalues", "eigensystem"):
        return _eigenvalue_spec(result)
    if selected in ("singular_value", "singular_values", "svd"):
        return _singular_value_spec(result)
    if selected in ("spectrum", "fft"):
        return _spectrum_spec(result)
    if selected in ("coefficient", "coefficients", "convolution"):
        return _convolution_spec(result)
    if selected == "conditioning":
        return _conditioning_spec(result)
    if selected == "convergence":
        return _convergence_spec(result)
    if selected == "aliasing":
        if operation in ("fourier_transform", "inverse_fourier_transform"):
            return _fft_aliasing_spec(result)
        if operation == "convolution":
            return _convolution_aliasing_spec(result)
        raise ValueError("aliasing visualization requires an FFT or convolution result")
    raise ValueError(
        "spectral plot kind must be auto, eigenvalues, singular_values, spectrum, "
        "coefficients, conditioning, convergence, or aliasing"
    )


def _result_animation_spec(result: SpectralResult, count: int) -> PlotSpec:
    operation = result.problem.operation
    if operation in ("symmetric_eigen", "general_eigen", "sparse_dominant_eigen"):
        return _eigenvalue_spec(result, count=count)
    if operation == "singular_value_decomposition":
        return _singular_value_spec(result, count=count)
    if operation in ("fourier_transform", "inverse_fourier_transform"):
        return _spectrum_spec(result, count=count)
    if operation == "convolution":
        return _convolution_spec(result, count=count)
    raise ValueError("result animation is unavailable for this spectral operation")


def _result_series_count(result: SpectralResult) -> int:
    operation = result.problem.operation
    if operation in ("symmetric_eigen", "general_eigen", "sparse_dominant_eigen"):
        return len(_sample_indices(len(_eigenvalues(result))))
    if operation == "singular_value_decomposition":
        return len(_sample_indices(len(_singular_values(result))))
    if operation in ("fourier_transform", "inverse_fourier_transform"):
        return len(_sample_indices(len(_transform_values(result))))
    if operation == "convolution":
        return len(_sample_indices(len(_convolution_values(result)[0])))
    return 0


def spectral_animation(result: SpectralResult, *, kind: str = "auto") -> PlotAnimation:
    """Return a bounded topology-stable animation of retained spectral evidence."""
    selected = str(kind).lower()
    progress = _progress_records(result)
    if selected == "auto":
        selected = "convergence" if progress else "result"
    frames: list[AnimationFrame] = []
    if selected == "convergence":
        if not progress:
            raise ValueError(
                "convergence animation requires retained iteration or phase trace events"
            )
        counts = _frame_counts(len(progress))
        for ordinal, count in enumerate(counts):
            records = progress[:count]
            frames.append(
                AnimationFrame(
                    stable_frame_id(ordinal),
                    _convergence_spec(result, records),
                    label="retained event " + str(count),
                    metadata={
                        "retained_record_count": count,
                        "trace_sequence": records[-1]["sequence"],
                    },
                )
            )
        static_fallback = _convergence_spec(result).to_dict()
        source_count = len(progress)
    elif selected in ("result", "values", "coefficients", "spectrum"):
        source_count = _result_series_count(result)
        if source_count == 0:
            raise ValueError("result animation requires a returned spectral value")
        counts = _frame_counts(source_count)
        for ordinal, count in enumerate(counts):
            frames.append(
                AnimationFrame(
                    stable_frame_id(ordinal),
                    _result_animation_spec(result, count),
                    label="revealed values " + str(count),
                    metadata={"revealed_value_count": count},
                )
            )
        static_fallback = spectral_plot(result).to_dict()
    else:
        raise ValueError("spectral animation kind must be auto, convergence, or result")
    maximum_frames = max(2, min(_MAX_ANIMATION_FRAMES, len(frames)))
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=300, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=maximum_frames,
            max_layers_per_frame=4,
            max_total_samples=500_000,
            max_payload_bytes=8_000_000,
        ),
        metadata={
            "operation": result.problem.operation,
            "view": selected,
            "problem_digest": result.problem.digest,
            "computed_evidence_only": True,
            "source_record_count": source_count,
            "frame_count": len(frames),
            "decimated": len(frames) < source_count,
            "trace_truncated": result.trace.truncated,
            "static_fallback": static_fallback,
        },
    )


__all__ = ["spectral_animation", "spectral_plot"]
