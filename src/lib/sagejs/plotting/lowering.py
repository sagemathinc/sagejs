"""Pure PlotSpec-to-Plotly lowering.

`lower_plot_spec` is the single public entry point from the semantic plotting
document to Plotly's `{data, layout, config}` figure shape.  It is deterministic
and JSON-safe; it performs no rendering and imports no browser integration.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ._json import JSONValue, materialize_array, materialize_object
from .axes import (
    UnsupportedPresentationError,
    lower_annotations,
    lower_axes_2d,
    lower_scene_3d,
)
from .field_layers import FIELD_LAYER_KINDS, lower_field_layer
from .model import PlotLayer, PlotSpec
from .surface_layers import lower_3d_geometry_layer
from .themes import get_theme

_THEME_NAMES = (
    "notebook",
    "presentation",
    "publication",
    "dark",
    "high-contrast",
)


def _object(value: JSONValue, path: str) -> dict[str, JSONValue]:
    if not isinstance(value, dict):
        raise TypeError(path + " must be a mapping")
    return materialize_object(value, path)


def _array(value: JSONValue, path: str) -> list[JSONValue]:
    if not isinstance(value, list):
        raise TypeError(path + " must be a sequence")
    return materialize_array(value, path)


def _merge_objects(
    base: Mapping[str, Any],
    updates: Mapping[str, Any],
) -> dict[str, JSONValue]:
    """Recursively merge JSON objects, replacing arrays and scalar values."""
    answer = materialize_object(base, "$.merge.base")
    materialized = materialize_object(updates, "$.merge.updates")
    for key in materialized:
        current = answer.get(key)
        replacement = materialized[key]
        if isinstance(current, dict) and isinstance(replacement, dict):
            answer[key] = _merge_objects(current, replacement)
        else:
            answer[key] = replacement
    return answer


def _theme_document(name: str) -> dict[str, JSONValue]:
    if not isinstance(name, str):
        raise TypeError("theme name must be a string")
    if name not in _THEME_NAMES:
        raise ValueError("unknown plot theme: " + name)
    theme = get_theme(name)
    document = theme.to_dict()
    return materialize_object(document, "$.theme")


def _legend_fields(layer: PlotLayer, trace: dict[str, JSONValue]) -> None:
    legend = layer.legend
    show = legend.get("show", False)
    if not isinstance(show, bool):
        raise TypeError("layer legend.show must be a bool")
    trace["showlegend"] = show
    label = legend.get("label")
    if label is not None:
        if not isinstance(label, str):
            raise TypeError("layer legend.label must be a string or None")
        trace["name"] = label


def _semantic_2d_trace(layer: PlotLayer) -> dict[str, JSONValue]:
    data = _object(layer.data, "$.layer.data")
    style = layer.style
    kind = layer.kind
    if kind == "line":
        trace: dict[str, JSONValue] = {
            "type": "scatter",
            "mode": "lines",
            "x": _array(data.get("x"), "$.layer.data.x"),
            "y": _array(data.get("y"), "$.layer.data.y"),
            "line": {
                "color": style.get("color"),
                "width": style.get("width"),
                "dash": style.get("dash"),
            },
            "opacity": style.get("opacity"),
        }
        _legend_fields(layer, trace)
        zorder = layer.metadata.get("zorder")
        if zorder is not None:
            trace["legendrank"] = zorder
    elif kind == "point":
        marker: dict[str, JSONValue] = {
            "color": style.get("color"),
            "size": style.get("size"),
            "symbol": style.get("symbol"),
        }
        edge = style.get("edge")
        if edge is not None:
            edge_object = _object(edge, "$.layer.style.edge")
            marker["line"] = {
                "color": edge_object.get("color"),
                "width": edge_object.get("width"),
            }
        trace = {
            "type": "scatter",
            "mode": "markers",
            "x": _array(data.get("x"), "$.layer.data.x"),
            "y": _array(data.get("y"), "$.layer.data.y"),
            "marker": marker,
            "opacity": style.get("opacity"),
        }
        _legend_fields(layer, trace)
    elif kind == "text":
        position = _array(data.get("position"), "$.layer.data.position")
        if len(position) != 2:
            raise ValueError("2D text position must contain x and y")
        trace = {
            "type": "scatter",
            "mode": "text",
            "x": [position[0]],
            "y": [position[1]],
            "text": [data.get("text")],
            "textfont": {
                "color": style.get("color"),
                "size": style.get("font_size"),
            },
            "textposition": style.get("position"),
            "opacity": style.get("opacity"),
            "showlegend": False,
            "hoverinfo": "skip",
        }
    else:
        raise UnsupportedPresentationError(
            "2D semantic layer kind", kind, ("line", "point", "text")
        )
    if not layer.visibility:
        trace["visible"] = False
    return trace


def _semantic_3d_trace(layer: PlotLayer) -> dict[str, JSONValue]:
    data = _object(layer.data, "$.layer.data")
    style = layer.style
    kind = layer.kind
    if kind == "line":
        trace: dict[str, JSONValue] = {
            "type": "scatter3d",
            "mode": "lines",
            "x": _array(data.get("x"), "$.layer.data.x"),
            "y": _array(data.get("y"), "$.layer.data.y"),
            "z": _array(data.get("z"), "$.layer.data.z"),
            "line": {
                "color": style.get("color"),
                "width": style.get("width"),
            },
            "opacity": style.get("opacity"),
        }
        _legend_fields(layer, trace)
    elif kind == "point":
        trace = {
            "type": "scatter3d",
            "mode": "markers",
            "x": _array(data.get("x"), "$.layer.data.x"),
            "y": _array(data.get("y"), "$.layer.data.y"),
            "z": _array(data.get("z"), "$.layer.data.z"),
            "marker": {
                "color": style.get("color"),
                "size": style.get("size"),
                "symbol": style.get("symbol"),
            },
            "opacity": style.get("opacity"),
        }
        _legend_fields(layer, trace)
    elif kind == "text":
        position = _array(data.get("position"), "$.layer.data.position")
        if len(position) != 3:
            raise ValueError("3D text position must contain x, y, and z")
        trace = {
            "type": "scatter3d",
            "mode": "text",
            "x": [position[0]],
            "y": [position[1]],
            "z": [position[2]],
            "text": [data.get("text")],
            "textfont": {
                "color": style.get("color"),
                "size": style.get("font_size"),
            },
            "opacity": style.get("opacity"),
            "showlegend": False,
        }
    else:
        raise UnsupportedPresentationError(
            "3D semantic layer kind", kind, ("line", "point", "text")
        )
    if not layer.visibility:
        trace["visible"] = False
    return trace


def lower_layer(layer: PlotLayer, dimension: int) -> list[dict[str, JSONValue]]:
    """Lower one layer to one or more detached Plotly traces."""
    if layer.kind == "plotly-trace":
        data = _object(layer.data, "$.layer.data")
        sources = _array(data.get("traces"), "$.layer.data.traces")
        traces: list[dict[str, JSONValue]] = []
        for source in sources:
            trace = _object(source, "$.layer.data.traces[]")
            if not layer.visibility:
                trace["visible"] = False
            traces.append(trace)
        return traces
    if layer.kind in FIELD_LAYER_KINDS:
        if dimension != 2:
            raise ValueError("field layers require a 2D PlotSpec")
        return lower_field_layer(layer)
    if dimension == 2:
        return [_semantic_2d_trace(layer)]
    if dimension == 3:
        if layer.kind in ("surface", "mesh", "polygon"):
            return lower_3d_geometry_layer(layer)
        return [_semantic_3d_trace(layer)]
    raise ValueError("plot dimension must be 2 or 3")


def _apply_trace_defaults(
    trace: Mapping[str, Any],
    defaults: Mapping[str, Any],
) -> dict[str, JSONValue]:
    """Merge portable theme defaults beneath one explicit Plotly trace."""
    answer = materialize_object(trace, "$.trace")
    for field in ("line", "marker"):
        default = defaults.get(field)
        explicit = answer.get(field)
        if isinstance(default, Mapping) and isinstance(explicit, Mapping):
            answer[field] = _merge_objects(default, explicit)
    trace_type = answer.get("type")
    typed_default = defaults.get(trace_type) if isinstance(trace_type, str) else None
    if isinstance(typed_default, Mapping):
        answer = _merge_objects(typed_default, answer)
    return answer


def _presentation_annotations(spec: PlotSpec) -> list[dict[str, JSONValue]]:
    document = spec.to_dict()
    raw = document["annotations"]
    if not isinstance(raw, list):
        raise TypeError("PlotSpec annotations must be a sequence")
    records: list[dict[str, JSONValue]] = []
    ordinal = 0
    for value in raw:
        if not isinstance(value, dict):
            raise TypeError("PlotSpec annotations must be mappings")
        if value.get("kind") == "alt_text":
            continue
        record = materialize_object(value, "$.annotations")
        if "id" not in record:
            record["id"] = "annotation-" + str(ordinal)
        records.append(record)
        ordinal += 1
    return lower_annotations(records)


def lower_plot_spec(spec: PlotSpec) -> dict[str, JSONValue]:
    """Lower one PlotSpec to a detached Plotly figure.

    Theme defaults are merged first, semantic axes and annotations second, and
    explicit Plotly overrides last.  A legacy Graphics PlotSpec containing
    both a complete layout and config override keeps those documents
    authoritative, preserving the existing renderer output byte-for-byte after
    canonical JSON serialization.
    """
    if not isinstance(spec, PlotSpec):
        raise TypeError("lower_plot_spec requires a PlotSpec")
    document = spec.to_dict()
    theme = _theme_document(spec.theme)
    theme_layout = theme.get("layout", {})
    theme_config = theme.get("config", {})
    theme_trace_defaults = theme.get("trace_defaults", {})
    if (
        not isinstance(theme_layout, Mapping)
        or not isinstance(theme_config, Mapping)
        or not isinstance(theme_trace_defaults, Mapping)
    ):
        raise TypeError("theme layout, config, and trace_defaults must be mappings")
    layout = materialize_object(theme_layout, "$.theme.layout")
    config = _merge_objects(
        {"displaylogo": False, "responsive": True},
        theme_config,
    )

    overrides = spec.plotly_overrides
    override_layout = overrides.get("layout")
    override_config = overrides.get("config")
    if override_layout is not None and not isinstance(override_layout, Mapping):
        raise TypeError("PlotSpec layout override must be a mapping")
    if override_config is not None and not isinstance(override_config, Mapping):
        raise TypeError("PlotSpec config override must be a mapping")
    legacy_complete = override_layout is not None and override_config is not None
    if legacy_complete:
        # Legacy Graphics captures its entire native Plotly layout in both
        # override sections. Its axes can contain Plotly fields beyond the
        # portable checked subset, so do not narrow them before replacement.
        layout = materialize_object(override_layout, "$.plotly_overrides.layout")
        config = materialize_object(override_config, "$.plotly_overrides.config")
    else:
        axes = document["axes_or_scene"]
        if not isinstance(axes, Mapping):
            raise TypeError("PlotSpec axes_or_scene must be a mapping")
        if axes:
            semantic_layout = (
                lower_axes_2d(axes) if spec.dimension == 2 else lower_scene_3d(axes)
            )
            layout = _merge_objects(layout, semantic_layout)
        annotations = _presentation_annotations(spec)
        if annotations:
            layout["annotations"] = materialize_array(annotations, "$.annotations")
        if override_layout is not None:
            layout = _merge_objects(layout, override_layout)
        if override_config is not None:
            config = _merge_objects(config, override_config)

    traces: list[JSONValue] = []
    for layer in spec.layers:
        lowered = lower_layer(layer, spec.dimension)
        if legacy_complete:
            traces.extend(lowered)
        else:
            traces.extend(
                _apply_trace_defaults(trace, theme_trace_defaults) for trace in lowered
            )
    return {"data": traces, "layout": layout, "config": config}
