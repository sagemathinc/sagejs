from __future__ import annotations

from ._json import JSONValue, canonical_json
from .diagnostics import Diagnostic
from .inspection import (
    is_coordinate_layer,
    layer_sample_count,
    provided_alt_text,
    semantic_coordinates,
)
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .model import PlotLayer, PlotSpec

_AXES = ("x", "y", "z")


def _checked_limit(value: int | None, name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(name + " must be a nonnegative integer or None")
    return value


def _data_diagnostic(layer: PlotLayer, dimension: int) -> Diagnostic | None:
    if not is_coordinate_layer(layer):
        return None
    coordinates = semantic_coordinates(layer, dimension)
    finite_count = 0
    nonfinite_count = 0
    for axis in coordinates:
        for value in coordinates[axis]:
            if value is None:
                nonfinite_count += 1
            else:
                finite_count += 1
    details: dict[str, JSONValue] = {
        "finite_coordinate_count": finite_count,
        "nonfinite_coordinate_count": nonfinite_count,
        "sample_count": layer_sample_count(layer, dimension),
    }
    if finite_count == 0:
        code = "PLOT_DATA_EMPTY" if nonfinite_count == 0 else "PLOT_DATA_ALL_NONFINITE"
    elif nonfinite_count:
        code = "PLOT_DATA_PARTIAL_NONFINITE"
    else:
        return None
    return Diagnostic(code, layer_ids=[layer.id], details=details)


def _is_log_axis(document: dict[str, JSONValue], axis: str) -> bool:
    records = [
        document.get(axis + "scale"),
        document.get(axis + "_scale"),
        document.get(axis),
        document.get(axis + "axis"),
    ]
    scene = document.get("scene")
    if isinstance(scene, dict):
        records += [scene.get(axis), scene.get(axis + "axis")]
    for record in records:
        values = (
            [record.get("type"), record.get("scale")]
            if isinstance(record, dict)
            else [record]
        )
        for value in values:
            if isinstance(value, str) and value.lower() in ("log", "logarithmic"):
                return True
    return False


def _log_diagnostic(
    spec: PlotSpec,
    layer: PlotLayer,
    log_axes: tuple[str, ...],
) -> Diagnostic | None:
    coordinates = semantic_coordinates(layer, spec.dimension)
    affected: list[str] = []
    count = 0
    for axis in log_axes:
        axis_count = 0
        for value in coordinates[axis]:
            if value is not None and value <= 0:
                axis_count += 1
        if axis_count:
            affected.append(axis)
            count += axis_count
    if not affected:
        return None
    return Diagnostic(
        "PLOT_AXIS_LOG_NONPOSITIVE",
        layer_ids=[layer.id],
        details={"axes": affected, "nonpositive_coordinate_count": count},
    )


def _append_distinct(
    output: list[Diagnostic],
    seen: dict[str, bool],
    diagnostic: Diagnostic | None,
) -> None:
    if diagnostic is None:
        return
    key = canonical_json(diagnostic.to_dict())
    if key not in seen:
        seen[key] = True
        output.append(diagnostic)


def validate_spec(
    spec: PlotSpec,
    *,
    max_samples: int | None = 100000,
    max_payload_bytes: int | None = 5000000,
    require_alt_text: bool = True,
) -> tuple[Diagnostic, ...]:
    sample_limit = _checked_limit(max_samples, "max_samples")
    payload_limit = _checked_limit(max_payload_bytes, "max_payload_bytes")
    if not isinstance(require_alt_text, bool):
        raise TypeError("require_alt_text must be a bool")

    output: list[Diagnostic] = []
    seen: dict[str, bool] = {}
    for diagnostic in spec.diagnostics:
        _append_distinct(output, seen, diagnostic)

    axes_value = spec.to_dict()["axes_or_scene"]
    axes_document = axes_value if isinstance(axes_value, dict) else {}
    log_axes = tuple(
        axis for axis in _AXES[: spec.dimension] if _is_log_axis(axes_document, axis)
    )
    sample_count = 0
    sampled_layer_ids: list[str] = []
    for layer in spec.layers:
        _append_distinct(output, seen, _data_diagnostic(layer, spec.dimension))
        if log_axes and is_coordinate_layer(layer):
            _append_distinct(
                output,
                seen,
                _log_diagnostic(spec, layer, log_axes),
            )
        count = layer_sample_count(layer, spec.dimension)
        sample_count += count
        if count:
            sampled_layer_ids.append(layer.id)

    if sample_limit is not None and sample_count > sample_limit:
        _append_distinct(
            output,
            seen,
            Diagnostic(
                "PLOT_RESOURCE_EXCESSIVE_SAMPLES",
                layer_ids=sampled_layer_ids,
                details={"sample_count": sample_count, "limit": sample_limit},
            ),
        )

    if payload_limit is not None:
        payload_document = spec.to_dict()
        payload_document["diagnostics"] = []
        payload_bytes = len(canonical_json(payload_document).encode("utf-8"))
        if payload_bytes > payload_limit:
            _append_distinct(
                output,
                seen,
                Diagnostic(
                    "PLOT_RESOURCE_EXCESSIVE_PAYLOAD",
                    details={"payload_bytes": payload_bytes, "limit": payload_limit},
                ),
            )

    if require_alt_text and provided_alt_text(spec) is None:
        _append_distinct(
            output,
            seen,
            Diagnostic(
                "PLOT_ALT_TEXT_MISSING",
                details={"generated_alt_text_available": True},
            ),
        )
    return tuple(output)
