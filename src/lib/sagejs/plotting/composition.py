"""Deterministic Cartesian panel composition for PlotSpec documents.

Composition is a pure data operation.  It computes Plotly domains and rewrites
Cartesian trace references, but it does not render, start a browser, or depend
on a renderer.  Stable semantic layer IDs become Plotly trace `uid` values
qualified by the stable panel ID.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ._json import JSONValue, materialize_array, materialize_object
from .axes import UnsupportedPresentationError, lower_annotations, lower_axes_2d
from .model import PlotSpec

_DOMAIN_TRACE_TYPES = (
    "funnelarea",
    "icicle",
    "indicator",
    "parcats",
    "parcoords",
    "pie",
    "sankey",
    "sunburst",
    "table",
    "treemap",
)


def _positive_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(name + " must be a positive integer")
    return value


def _nonnegative_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(name + " must be a nonnegative integer")
    return value


def _gap(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(name + " must be a number")
    result = float(value)
    if result < 0 or result >= 1:
        raise ValueError(name + " must be in the interval [0, 1)")
    return result


def _identifier(value: Any, name: str) -> str:
    if not isinstance(value, str) or value == "":
        raise TypeError(name + " must be a nonempty string")
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
    for character in value:
        if character not in allowed:
            raise ValueError(
                name + " may contain only letters, digits, '-', '_', and '.'"
            )
    return value


def stable_panel_id(ordinal: int) -> str:
    """Return the deterministic stable panel ID for `ordinal`."""
    return "panel-" + str(_nonnegative_integer(ordinal, "panel ordinal"))


def qualified_layer_id(panel_id: str, layer_id: str) -> str:
    """Return a globally stable layer ID inside a panel composition."""
    return _identifier(panel_id, "panel ID") + "." + _identifier(layer_id, "layer ID")


class Panel2D:
    """One immutable placement of a detached two-dimensional PlotSpec."""

    def __init__(
        self,
        panel_id: str,
        spec: PlotSpec,
        row: int,
        column: int,
        *,
        row_span: int = 1,
        column_span: int = 1,
        title: str | None = None,
    ) -> None:
        if not isinstance(spec, PlotSpec):
            raise TypeError("panel spec must be a PlotSpec")
        if spec.dimension != 2:
            raise ValueError("panel composition requires two-dimensional PlotSpecs")
        if title is not None and not isinstance(title, str):
            raise TypeError("panel title must be a string or None")
        self._id = _identifier(panel_id, "panel ID")
        self._spec = PlotSpec.from_dict(spec.to_dict())
        self._row = _nonnegative_integer(row, "panel row")
        self._column = _nonnegative_integer(column, "panel column")
        self._row_span = _positive_integer(row_span, "panel row_span")
        self._column_span = _positive_integer(column_span, "panel column_span")
        self._title = title

    @property
    def id(self) -> str:
        return self._id

    @property
    def spec(self) -> PlotSpec:
        return PlotSpec.from_dict(self._spec.to_dict())

    @property
    def row(self) -> int:
        return self._row

    @property
    def column(self) -> int:
        return self._column

    @property
    def row_span(self) -> int:
        return self._row_span

    @property
    def column_span(self) -> int:
        return self._column_span

    @property
    def title(self) -> str | None:
        return self._title

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "id": self._id,
            "row": self._row,
            "column": self._column,
            "row_span": self._row_span,
            "column_span": self._column_span,
            "title": self._title,
            "layer_ids": [
                qualified_layer_id(self._id, layer.id) for layer in self._spec.layers
            ],
            "spec": self._spec.to_dict(),
        }


class PanelComposition2D:
    """A checked row-major grid of non-overlapping 2D panels."""

    def __init__(
        self,
        rows: int,
        columns: int,
        panels: Sequence[Panel2D],
        *,
        horizontal_gap: int | float = 0.08,
        vertical_gap: int | float = 0.10,
    ) -> None:
        self._rows = _positive_integer(rows, "composition rows")
        self._columns = _positive_integer(columns, "composition columns")
        self._horizontal_gap = _gap(horizontal_gap, "horizontal_gap")
        self._vertical_gap = _gap(vertical_gap, "vertical_gap")
        if self._horizontal_gap * (self._columns - 1) >= 1:
            raise ValueError("horizontal gaps leave no room for panels")
        if self._vertical_gap * (self._rows - 1) >= 1:
            raise ValueError("vertical gaps leave no room for panels")
        detached: list[Panel2D] = []
        identifiers: dict[str, bool] = {}
        occupied: dict[str, str] = {}
        for panel in panels:
            if not isinstance(panel, Panel2D):
                raise TypeError("composition panels must be Panel2D instances")
            if panel.id in identifiers:
                raise ValueError("duplicate panel ID: " + panel.id)
            identifiers[panel.id] = True
            if panel.row + panel.row_span > self._rows:
                raise ValueError("panel " + panel.id + " exceeds the row grid")
            if panel.column + panel.column_span > self._columns:
                raise ValueError("panel " + panel.id + " exceeds the column grid")
            for row in range(panel.row, panel.row + panel.row_span):
                for column in range(panel.column, panel.column + panel.column_span):
                    key = str(row) + ":" + str(column)
                    if key in occupied:
                        raise ValueError(
                            "panels " + occupied[key] + " and " + panel.id + " overlap"
                        )
                    occupied[key] = panel.id
            detached.append(
                Panel2D(
                    panel.id,
                    panel.spec,
                    panel.row,
                    panel.column,
                    row_span=panel.row_span,
                    column_span=panel.column_span,
                    title=panel.title,
                )
            )
        detached.sort(key=lambda panel: (panel.row, panel.column, panel.id))
        self._panels = tuple(detached)

    @property
    def rows(self) -> int:
        return self._rows

    @property
    def columns(self) -> int:
        return self._columns

    @property
    def panels(self) -> tuple[Panel2D, ...]:
        return tuple(
            Panel2D(
                panel.id,
                panel.spec,
                panel.row,
                panel.column,
                row_span=panel.row_span,
                column_span=panel.column_span,
                title=panel.title,
            )
            for panel in self._panels
        )

    @property
    def horizontal_gap(self) -> float:
        return self._horizontal_gap

    @property
    def vertical_gap(self) -> float:
        return self._vertical_gap

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "kind": "panel-composition-2d",
            "rows": self._rows,
            "columns": self._columns,
            "horizontal_gap": self._horizontal_gap,
            "vertical_gap": self._vertical_gap,
            "panels": [panel.to_dict() for panel in self._panels],
        }


def _axis_number(index: int) -> str:
    return "" if index == 0 else str(index + 1)


def panel_axis_references(
    composition: PanelComposition2D,
) -> dict[str, dict[str, str]]:
    """Return deterministic Plotly axis keys and trace references per panel."""
    answer: dict[str, dict[str, str]] = {}
    for index, panel in enumerate(composition.panels):
        suffix = _axis_number(index)
        answer[panel.id] = {
            "x_layout": "xaxis" + suffix,
            "y_layout": "yaxis" + suffix,
            "x_trace": "x" + suffix,
            "y_trace": "y" + suffix,
        }
    return answer


def _panel_domains(
    composition: PanelComposition2D,
    panel: Panel2D,
) -> tuple[tuple[float, float], tuple[float, float]]:
    width = (
        1.0 - composition.horizontal_gap * (composition.columns - 1)
    ) / composition.columns
    height = (
        1.0 - composition.vertical_gap * (composition.rows - 1)
    ) / composition.rows
    x0 = panel.column * (width + composition.horizontal_gap)
    x1 = (
        x0
        + panel.column_span * width
        + (panel.column_span - 1) * composition.horizontal_gap
    )
    y1 = 1.0 - panel.row * (height + composition.vertical_gap)
    y0 = y1 - panel.row_span * height - (panel.row_span - 1) * composition.vertical_gap
    return (x0, x1), (y0, y1)


def _panel_axes_document(panel: Panel2D) -> dict[str, JSONValue]:
    document = panel.spec.to_dict()
    overrides = document["plotly_overrides"]
    if isinstance(overrides, dict):
        layout = overrides.get("layout")
        if isinstance(layout, dict):
            xaxis = layout.get("xaxis")
            yaxis = layout.get("yaxis")
            if isinstance(xaxis, dict) and isinstance(yaxis, dict):
                # A legacy Graphics PlotSpec carries its exact axes in the
                # override. Preserve them rather than narrowing their fields.
                return {
                    "xaxis": materialize_object(xaxis, "$.layout.xaxis"),
                    "yaxis": materialize_object(yaxis, "$.layout.yaxis"),
                }
    axes = document["axes_or_scene"]
    if not isinstance(axes, dict):
        raise TypeError("panel axes_or_scene must be a mapping")
    return lower_axes_2d(axes)


def _presentation_annotations(spec: PlotSpec) -> list[dict[str, JSONValue]]:
    document = spec.to_dict()
    raw = document["annotations"]
    if not isinstance(raw, list):
        raise TypeError("PlotSpec annotations must be a sequence")
    presentation: list[dict[str, JSONValue]] = []
    ordinal = 0
    for value in raw:
        if not isinstance(value, dict):
            raise TypeError("PlotSpec annotations must be mappings")
        if value.get("kind") == "alt_text":
            continue
        record = materialize_object(value, "$.annotations")
        if "id" not in record:
            record["id"] = "annotation-" + str(ordinal)
        presentation.append(record)
        ordinal += 1
    return lower_annotations(presentation)


def lower_panel_layout(composition: PanelComposition2D) -> dict[str, JSONValue]:
    """Lower panel axes, domains, titles, and annotations to Plotly layout."""
    references = panel_axis_references(composition)
    layout: dict[str, JSONValue] = {}
    annotations: list[JSONValue] = []
    for panel in composition.panels:
        reference = references[panel.id]
        axes = _panel_axes_document(panel)
        xaxis = materialize_object(axes["xaxis"], "$.layout.xaxis")
        yaxis = materialize_object(axes["yaxis"], "$.layout.yaxis")
        x_domain, y_domain = _panel_domains(composition, panel)
        xaxis["domain"] = materialize_array(x_domain, "$.layout.xaxis.domain")
        xaxis["anchor"] = reference["y_trace"]
        yaxis["domain"] = materialize_array(y_domain, "$.layout.yaxis.domain")
        yaxis["anchor"] = reference["x_trace"]
        layout[reference["x_layout"]] = xaxis
        layout[reference["y_layout"]] = yaxis
        for annotation in _presentation_annotations(panel.spec):
            record = materialize_object(annotation, "$.layout.annotations")
            if record.get("xref") == "x":
                record["xref"] = reference["x_trace"]
            if record.get("yref") == "y":
                record["yref"] = reference["y_trace"]
            annotations.append(record)
        if panel.title is not None:
            annotations.append(
                {
                    "text": panel.title,
                    "x": (x_domain[0] + x_domain[1]) / 2,
                    "y": y_domain[1],
                    "xref": "paper",
                    "yref": "paper",
                    "showarrow": False,
                    "xanchor": "center",
                    "yanchor": "bottom",
                }
            )
    if annotations:
        layout["annotations"] = annotations
    return layout


def bind_panel_traces(
    panel: Panel2D,
    traces: Sequence[Mapping[str, Any]],
    references: Mapping[str, str],
) -> list[dict[str, JSONValue]]:
    """Copy Cartesian traces into a panel and attach stable Plotly `uid`s."""
    layers = panel.spec.layers
    if len(traces) != len(layers):
        raise ValueError(
            "panel trace count must equal its semantic layer count for stable IDs"
        )
    output: list[dict[str, JSONValue]] = []
    for index, source in enumerate(traces):
        trace = materialize_object(source, "$.trace")
        trace_type = trace.get("type", "scatter")
        if trace_type in _DOMAIN_TRACE_TYPES:
            raise UnsupportedPresentationError(
                "panel trace type", trace_type, ("Cartesian x/y traces",)
            )
        for field, local, target in (
            ("xaxis", "x", references["x_trace"]),
            ("yaxis", "y", references["y_trace"]),
        ):
            existing = trace.get(field)
            if existing is not None and existing != local:
                raise UnsupportedPresentationError(
                    "nested panel " + field, existing, (local,)
                )
            trace[field] = target
        trace["uid"] = qualified_layer_id(panel.id, layers[index].id)
        output.append(trace)
    return output


def lower_panel_figure(
    composition: PanelComposition2D,
    traces_by_panel: Mapping[str, Sequence[Mapping[str, Any]]],
) -> dict[str, JSONValue]:
    """Lower already-semantic traces plus panel presentation to one figure."""
    references = panel_axis_references(composition)
    known = {panel.id: True for panel in composition.panels}
    for panel_id in traces_by_panel:
        if panel_id not in known:
            raise KeyError(panel_id)
    data: list[JSONValue] = []
    for panel in composition.panels:
        if panel.id not in traces_by_panel:
            raise KeyError(panel.id)
        data.extend(
            bind_panel_traces(panel, traces_by_panel[panel.id], references[panel.id])
        )
    return {
        "data": data,
        "layout": lower_panel_layout(composition),
        "config": {"displaylogo": False, "responsive": True},
    }
