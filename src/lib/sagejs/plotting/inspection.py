from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any, TypeGuard

from ._json import JSONValue, materialize_json

if TYPE_CHECKING:
    from .model import PlotLayer, PlotSpec

_AXES = ("x", "y", "z")
_COORDINATE_KINDS = ("line", "point", "text")


def layer_by_id(spec: PlotSpec, layer_id: str) -> PlotLayer:
    if not isinstance(layer_id, str) or layer_id == "":
        raise TypeError("layer ID must be a nonempty string")
    for layer in spec.layers:
        if layer.id == layer_id:
            return layer
    raise KeyError(layer_id)


def select_layers(
    spec: PlotSpec,
    layer_ids: str | Sequence[str] | None = None,
    *,
    kind: str | None = None,
    visible: bool | None = None,
) -> tuple[PlotLayer, ...]:
    if kind is not None and (not isinstance(kind, str) or kind == ""):
        raise TypeError("layer kind must be a nonempty string")
    if visible is not None and not isinstance(visible, bool):
        raise TypeError("visible selector must be a bool")

    requested: dict[str, bool] | None = None
    if layer_ids is not None:
        values = [layer_ids] if isinstance(layer_ids, str) else list(layer_ids)
        requested = {}
        for layer_id in values:
            if not isinstance(layer_id, str) or layer_id == "":
                raise TypeError("layer IDs must be nonempty strings")
            requested[layer_id] = True
        known = {layer.id: True for layer in spec.layers}
        for layer_id in requested:
            if layer_id not in known:
                raise KeyError(layer_id)

    answer: list[PlotLayer] = []
    for layer in spec.layers:
        if requested is not None and layer.id not in requested:
            continue
        if kind is not None and layer.kind != kind:
            continue
        if visible is not None and layer.visibility != visible:
            continue
        answer.append(layer)
    return tuple(answer)


def layer_data(spec: PlotSpec, layer_id: str) -> JSONValue:
    return materialize_json(layer_by_id(spec, layer_id).data, "$.layer.data")


def _is_number(value: Any) -> TypeGuard[int | float]:
    return not isinstance(value, bool) and isinstance(value, (int, float))


def _coordinate_entries(value: JSONValue) -> list[float | None]:
    entries: list[float | None] = []
    if value is None:
        entries.append(None)
    elif _is_number(value):
        numeric = float(value)
        entries.append(numeric if math.isfinite(numeric) else None)
    elif isinstance(value, list):
        for item in value:
            entries.extend(_coordinate_entries(item))
    return entries


def _point_entries(
    value: JSONValue,
    dimension: int,
) -> dict[str, list[float | None]]:
    coordinates: dict[str, list[float | None]] = {
        axis: [] for axis in _AXES[:dimension]
    }
    if not isinstance(value, list):
        return coordinates
    candidates: list[JSONValue]
    if len(value) >= dimension and all(
        item is None or _is_number(item) for item in value[:dimension]
    ):
        candidates = [value]
    else:
        candidates = value
    for point in candidates:
        if not isinstance(point, list) or len(point) < dimension:
            continue
        for index, axis in enumerate(_AXES[:dimension]):
            coordinate = point[index]
            if coordinate is None:
                coordinates[axis].append(None)
            elif _is_number(coordinate):
                numeric = float(coordinate)
                coordinates[axis].append(numeric if math.isfinite(numeric) else None)
    return coordinates


def is_coordinate_layer(layer: PlotLayer) -> bool:
    return layer.kind.lower() in _COORDINATE_KINDS


def semantic_coordinates(
    layer: PlotLayer,
    dimension: int,
) -> dict[str, list[float | None]]:
    axes = _AXES[:dimension]
    answer: dict[str, list[float | None]] = {axis: [] for axis in axes}
    if not is_coordinate_layer(layer):
        return answer
    data = layer.data
    if isinstance(data, dict):
        found_direct = False
        for axis in axes:
            if axis in data:
                found_direct = True
                answer[axis] = _coordinate_entries(data[axis])
        if found_direct:
            return answer
        for key in ("points", "position"):
            if key in data:
                return _point_entries(data[key], dimension)
        return answer
    return _point_entries(data, dimension)


def layer_sample_count(layer: PlotLayer, dimension: int) -> int:
    coordinates = semantic_coordinates(layer, dimension)
    count = 0
    for axis in coordinates:
        count = max(count, len(coordinates[axis]))
    return count


def semantic_bounds(
    spec: PlotSpec,
    layer_id: str | None = None,
) -> dict[str, JSONValue]:
    layers = spec.layers if layer_id is None else (layer_by_id(spec, layer_id),)
    values: dict[str, list[float]] = {axis: [] for axis in _AXES[: spec.dimension]}
    for layer in layers:
        coordinates = semantic_coordinates(layer, spec.dimension)
        for axis in values:
            for coordinate in coordinates[axis]:
                if coordinate is not None and math.isfinite(coordinate):
                    values[axis].append(coordinate)
    answer: dict[str, JSONValue] = {}
    for axis in values:
        if values[axis]:
            answer[axis] = [min(values[axis]), max(values[axis])]
    return answer


def provided_alt_text(spec: PlotSpec) -> str | None:
    document = spec.to_dict()
    annotations = document["annotations"]
    if isinstance(annotations, list):
        for annotation in annotations:
            if not isinstance(annotation, dict):
                continue
            if annotation.get("kind") != "alt_text":
                continue
            text = annotation.get("text")
            if isinstance(text, str) and text.strip() != "":
                return text.strip()
    provenance = document["provenance"]
    if isinstance(provenance, dict):
        metadata = provenance.get("metadata")
        if isinstance(metadata, dict):
            text = metadata.get("alt_text")
            if isinstance(text, str) and text.strip() != "":
                return text.strip()
    return None


def structured_description(spec: PlotSpec) -> dict[str, JSONValue]:
    kind_counts: dict[str, int] = {}
    for layer in spec.layers:
        kind_counts[layer.kind] = kind_counts.get(layer.kind, 0) + 1
    frontend: JSONValue = None
    provenance = spec.provenance
    if isinstance(provenance.get("frontend"), str):
        frontend = provenance["frontend"]
    return {
        "dimension": spec.dimension,
        "layer_count": len(spec.layers),
        "kinds": {key: kind_counts[key] for key in sorted(kind_counts)},
        "bounds": semantic_bounds(spec),
        "theme": spec.theme,
        "frontend": frontend,
        "layer_ids": [layer.id for layer in spec.layers],
    }


def _number_text(value: JSONValue) -> str:
    if isinstance(value, float) and value == int(value):
        return str(int(value))
    return str(value)


def _kind_phrase(kinds: Mapping[str, JSONValue]) -> str:
    phrases: list[str] = []
    for kind in sorted(kinds):
        count = kinds[kind]
        if not isinstance(count, int):
            continue
        noun = kind if count == 1 else kind + " layers"
        phrases.append(str(count) + " " + noun)
    if len(phrases) == 0:
        return "no layers"
    if len(phrases) == 1:
        return phrases[0]
    return ", ".join(phrases[:-1]) + " and " + phrases[-1]


def natural_description(spec: PlotSpec) -> str:
    description = structured_description(spec)
    layer_count = description["layer_count"]
    if layer_count == 0:
        return (
            "Empty "
            + str(spec.dimension)
            + "D plot using the "
            + spec.theme
            + " theme."
        )
    text = (
        str(spec.dimension)
        + "D plot with "
        + str(layer_count)
        + (" layer" if layer_count == 1 else " layers")
        + ": "
        + _kind_phrase(
            description["kinds"] if isinstance(description["kinds"], dict) else {}
        )
        + "."
    )
    bounds = description["bounds"]
    if isinstance(bounds, dict) and bounds:
        ranges: list[str] = []
        for axis in _AXES[: spec.dimension]:
            interval = bounds.get(axis)
            if isinstance(interval, list) and len(interval) == 2:
                ranges.append(
                    axis
                    + " from "
                    + _number_text(interval[0])
                    + " to "
                    + _number_text(interval[1])
                )
        if ranges:
            text += " Bounds: " + "; ".join(ranges) + "."
    frontend = description["frontend"]
    if isinstance(frontend, str):
        text += " Source frontend: " + frontend + "."
    return text


def alternative_text(spec: PlotSpec) -> str:
    provided = provided_alt_text(spec)
    return natural_description(spec) if provided is None else provided
