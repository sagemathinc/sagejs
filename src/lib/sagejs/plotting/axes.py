"""Immutable Plotly-native presentation settings for PlotSpec documents.

The records in this module deliberately model the portable subset of Plotly's
layout schema that Sage.js owns.  Values such as logarithmic ranges therefore
retain Plotly semantics: a log-axis range contains base-10 exponents, not data
coordinates.  Unsupported settings fail explicitly; frontends that choose to
continue can attach the diagnostic returned by `unsupported_option_diagnostic`.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any, cast

from ._json import JSONValue, materialize_array, materialize_object
from .diagnostics import Diagnostic

_AXIS_SCALES = ("linear", "log")
_TICK_MODES = ("auto", "linear", "array")
_AUTORANGE_VALUES = ("reversed", "min", "max", "min reversed", "max reversed")
_ORIENTATIONS = ("v", "h")
_ANCHORS = ("auto", "left", "center", "right", "top", "middle", "bottom")
_TRACE_ORDERS = ("normal", "reversed", "grouped", "grouped+reversed")


class UnsupportedPresentationError(ValueError):
    """A requested presentation setting has no supported portable lowering."""

    def __init__(self, option: str, value: Any, supported: Sequence[str]) -> None:
        self.option = option
        self.value = value
        self.supported = tuple(supported)
        super().__init__(
            "unsupported plot presentation option "
            + option
            + "="
            + repr(value)
            + "; supported values are "
            + ", ".join(self.supported)
        )


def unsupported_option_diagnostic(
    option: str,
    value: Any,
    *,
    reason: str,
) -> Diagnostic:
    """Return a registered diagnostic for a frontend's unsupported option."""
    if not isinstance(option, str) or option == "":
        raise TypeError("option must be a nonempty string")
    if not isinstance(reason, str) or reason == "":
        raise TypeError("reason must be a nonempty string")
    details = materialize_object(
        {"option": option, "value": value, "reason": reason},
        "$.diagnostic.details",
    )
    return Diagnostic("PLOT_OPTION_IGNORED", details=details)


def _finite_number(value: Any, name: str) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(name + " must be a finite number")
    if not math.isfinite(float(value)):
        raise ValueError(name + " must be finite")
    return value


def _optional_string(value: str | None, name: str) -> str | None:
    if value is not None and not isinstance(value, str):
        raise TypeError(name + " must be a string or None")
    return value


def _choice(value: str, name: str, supported: Sequence[str]) -> str:
    if not isinstance(value, str):
        raise TypeError(name + " must be a string")
    if value not in supported:
        raise UnsupportedPresentationError(name, value, supported)
    return value


def _range(value: Sequence[Any] | None) -> tuple[int | float, int | float] | None:
    if value is None:
        return None
    if isinstance(value, (str, bytes, bytearray)) or len(value) != 2:
        raise ValueError("axis range must contain exactly two finite numbers")
    lower = _finite_number(value[0], "axis range lower bound")
    upper = _finite_number(value[1], "axis range upper bound")
    if lower == upper:
        raise ValueError("axis range bounds must be distinct")
    return lower, upper


def _autorange(value: bool | str) -> bool | str:
    if isinstance(value, bool):
        return value
    return _choice(value, "autorange", _AUTORANGE_VALUES)


class AxisSettings:
    """A detached portable subset of a Plotly Cartesian or scene axis.

    `range` is passed to Plotly unchanged.  In particular, ranges on a `log`
    axis are base-10 exponents.  Descending bounds are allowed because Plotly
    uses them to reverse an axis.
    """

    def __init__(
        self,
        *,
        scale: str = "linear",
        range: Sequence[Any] | None = None,
        autorange: bool | str = True,
        label: str | None = None,
        tick_mode: str = "auto",
        tick_values: Sequence[Any] | None = None,
        tick_labels: Sequence[str] | None = None,
        tick_start: int | float | None = None,
        tick_step: int | float | None = None,
        tick_format: str | None = None,
        tick_angle: int | float = 0,
        show_ticks: bool = True,
        show_tick_labels: bool = True,
        show_grid: bool = True,
        grid_color: str | None = None,
        grid_width: int | float | None = None,
        zero_line: bool = True,
    ) -> None:
        self._scale = _choice(scale, "axis scale", _AXIS_SCALES)
        self._range = _range(range)
        self._autorange = _autorange(autorange)
        if self._range is not None and self._autorange is not False:
            raise ValueError("an explicit axis range requires autorange=False")
        self._label = _optional_string(label, "axis label")
        self._tick_mode = _choice(tick_mode, "axis tick mode", _TICK_MODES)
        values = materialize_array(tick_values, "$.axis.tick_values")
        for value in values:
            _finite_number(value, "axis tick value")
        labels = [] if tick_labels is None else list(tick_labels)
        for value in labels:
            if not isinstance(value, str):
                raise TypeError("axis tick labels must be strings")
        if self._tick_mode == "array":
            if len(values) == 0:
                raise ValueError("array tick mode requires tick_values")
            if labels and len(labels) != len(values):
                raise ValueError("tick_labels must have the same length as tick_values")
        elif values or labels:
            raise ValueError("tick_values and tick_labels require array tick mode")
        if self._tick_mode == "linear" and tick_step is None:
            raise ValueError("linear tick mode requires tick_step")
        if self._tick_mode != "linear" and (
            tick_start is not None or tick_step is not None
        ):
            raise ValueError("tick_start and tick_step require linear tick mode")
        self._tick_values = tuple(values)
        self._tick_labels = tuple(labels)
        self._tick_start = (
            None
            if tick_start is None
            else _finite_number(tick_start, "axis tick_start")
        )
        self._tick_step = (
            None if tick_step is None else _finite_number(tick_step, "axis tick_step")
        )
        if self._tick_step == 0:
            raise ValueError("axis tick_step must be nonzero")
        self._tick_format = _optional_string(tick_format, "axis tick_format")
        self._tick_angle = _finite_number(tick_angle, "axis tick_angle")
        for value, name in (
            (show_ticks, "show_ticks"),
            (show_tick_labels, "show_tick_labels"),
            (show_grid, "show_grid"),
            (zero_line, "zero_line"),
        ):
            if not isinstance(value, bool):
                raise TypeError(name + " must be a bool")
        self._show_ticks = show_ticks
        self._show_tick_labels = show_tick_labels
        self._show_grid = show_grid
        self._grid_color = _optional_string(grid_color, "axis grid_color")
        self._grid_width = (
            None
            if grid_width is None
            else _finite_number(grid_width, "axis grid_width")
        )
        if self._grid_width is not None and self._grid_width < 0:
            raise ValueError("axis grid_width must be nonnegative")
        self._zero_line = zero_line

    def to_dict(self) -> dict[str, JSONValue]:
        """Return a detached Plotly-native axis layout object."""
        answer: dict[str, JSONValue] = {
            "type": self._scale,
            "autorange": self._autorange,
            "tickmode": self._tick_mode,
            "ticks": "outside" if self._show_ticks else "",
            "showticklabels": self._show_tick_labels,
            "showgrid": self._show_grid,
            "zeroline": self._zero_line,
            "tickangle": self._tick_angle,
        }
        if self._range is not None:
            answer["range"] = list(self._range)
        if self._label is not None:
            answer["title"] = {"text": self._label}
        if self._tick_mode == "array":
            answer["tickvals"] = list(self._tick_values)
            if self._tick_labels:
                answer["ticktext"] = list(self._tick_labels)
        if self._tick_start is not None:
            answer["tick0"] = self._tick_start
        if self._tick_step is not None:
            answer["dtick"] = self._tick_step
        if self._tick_format is not None:
            answer["tickformat"] = self._tick_format
        if self._grid_color is not None:
            answer["gridcolor"] = self._grid_color
        if self._grid_width is not None:
            answer["gridwidth"] = self._grid_width
        return answer

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "AxisSettings":
        """Reconstruct settings from the supported Plotly axis subset."""
        document = materialize_object(value, "$.axis")
        raw = cast(dict[str, Any], document)
        known = {
            "type",
            "range",
            "autorange",
            "title",
            "tickmode",
            "tickvals",
            "ticktext",
            "tick0",
            "dtick",
            "tickformat",
            "tickangle",
            "ticks",
            "showticklabels",
            "showgrid",
            "gridcolor",
            "gridwidth",
            "zeroline",
        }
        unknown = sorted(key for key in document if key not in known)
        if unknown:
            raise UnsupportedPresentationError("axis field", unknown[0], sorted(known))
        title = raw.get("title")
        label: str | None = None
        if isinstance(title, str):
            label = title
        elif isinstance(title, dict):
            title_text = title.get("text")
            if title_text is not None and not isinstance(title_text, str):
                raise TypeError("axis title.text must be a string")
            label = title_text
        elif title is not None:
            raise TypeError("axis title must be a string or mapping")
        ticks = raw.get("ticks", "outside")
        if ticks not in ("", "outside"):
            raise UnsupportedPresentationError("axis ticks", ticks, ("", "outside"))
        return cls(
            scale=raw.get("type", "linear"),
            range=raw.get("range"),
            autorange=raw.get("autorange", True),
            label=label,
            tick_mode=raw.get("tickmode", "auto"),
            tick_values=raw.get("tickvals"),
            tick_labels=raw.get("ticktext"),
            tick_start=raw.get("tick0"),
            tick_step=raw.get("dtick"),
            tick_format=raw.get("tickformat"),
            tick_angle=raw.get("tickangle", 0),
            show_ticks=ticks == "outside",
            show_tick_labels=raw.get("showticklabels", True),
            show_grid=raw.get("showgrid", True),
            grid_color=raw.get("gridcolor"),
            grid_width=raw.get("gridwidth"),
            zero_line=raw.get("zeroline", True),
        )


def _axis(value: AxisSettings | Mapping[str, Any] | None) -> AxisSettings:
    if value is None:
        return AxisSettings()
    if isinstance(value, AxisSettings):
        return AxisSettings.from_dict(value.to_dict())
    if isinstance(value, Mapping):
        return AxisSettings.from_dict(value)
    raise TypeError("axis settings must be AxisSettings or a mapping")


class Axes2DSettings:
    """Two Plotly-native Cartesian axes stored as a PlotSpec axes document."""

    def __init__(
        self,
        x: AxisSettings | Mapping[str, Any] | None = None,
        y: AxisSettings | Mapping[str, Any] | None = None,
        *,
        equal_aspect: bool = False,
    ) -> None:
        if not isinstance(equal_aspect, bool):
            raise TypeError("equal_aspect must be a bool")
        self._x = _axis(x)
        self._y = _axis(y)
        self._equal_aspect = equal_aspect

    def to_dict(self) -> dict[str, JSONValue]:
        """Return the canonical `PlotSpec.axes_or_scene` document."""
        xaxis = self._x.to_dict()
        yaxis = self._y.to_dict()
        if self._equal_aspect:
            yaxis["scaleanchor"] = "x"
            yaxis["scaleratio"] = 1
        return {
            "coordinate_system": "cartesian",
            "xaxis": xaxis,
            "yaxis": yaxis,
        }


class Scene3DSettings:
    """Portable Plotly 3D scene axes and aspect settings."""

    def __init__(
        self,
        x: AxisSettings | Mapping[str, Any] | None = None,
        y: AxisSettings | Mapping[str, Any] | None = None,
        z: AxisSettings | Mapping[str, Any] | None = None,
        *,
        aspect_mode: str = "auto",
        aspect_ratio: Mapping[str, Any] | None = None,
        camera: Mapping[str, Any] | None = None,
    ) -> None:
        self._x = _axis(x)
        self._y = _axis(y)
        self._z = _axis(z)
        self._aspect_mode = _choice(
            aspect_mode,
            "scene aspect_mode",
            ("auto", "cube", "data", "manual"),
        )
        ratio = materialize_object(aspect_ratio, "$.scene.aspect_ratio")
        if self._aspect_mode == "manual":
            if sorted(ratio) != ["x", "y", "z"]:
                raise ValueError("manual scene aspect_ratio requires x, y, and z")
            for name in ("x", "y", "z"):
                numeric = _finite_number(ratio[name], "scene aspect_ratio." + name)
                if numeric <= 0:
                    raise ValueError("scene aspect ratios must be positive")
        elif ratio:
            raise ValueError("aspect_ratio requires aspect_mode='manual'")
        self._aspect_ratio = ratio
        self._camera = materialize_object(camera, "$.scene.camera")

    def to_dict(self) -> dict[str, JSONValue]:
        scene: dict[str, JSONValue] = {
            "xaxis": self._x.to_dict(),
            "yaxis": self._y.to_dict(),
            "zaxis": self._z.to_dict(),
            "aspectmode": self._aspect_mode,
        }
        if self._aspect_ratio:
            scene["aspectratio"] = materialize_object(
                self._aspect_ratio, "$.scene.aspect_ratio"
            )
        if self._camera:
            scene["camera"] = materialize_object(self._camera, "$.scene.camera")
        return {"coordinate_system": "cartesian", "scene": scene}


class LegendSettings:
    """Portable Plotly legend settings."""

    def __init__(
        self,
        *,
        visible: bool = True,
        title: str | None = None,
        orientation: str = "v",
        x: int | float | None = None,
        y: int | float | None = None,
        x_anchor: str = "auto",
        y_anchor: str = "auto",
        trace_order: str = "normal",
        group_gap: int | float = 10,
    ) -> None:
        if not isinstance(visible, bool):
            raise TypeError("legend visible must be a bool")
        self._visible = visible
        self._title = _optional_string(title, "legend title")
        self._orientation = _choice(orientation, "legend orientation", _ORIENTATIONS)
        self._x = None if x is None else _finite_number(x, "legend x")
        self._y = None if y is None else _finite_number(y, "legend y")
        self._x_anchor = _choice(
            x_anchor, "legend x_anchor", ("auto", "left", "center", "right")
        )
        self._y_anchor = _choice(
            y_anchor, "legend y_anchor", ("auto", "top", "middle", "bottom")
        )
        self._trace_order = _choice(trace_order, "legend trace_order", _TRACE_ORDERS)
        self._group_gap = _finite_number(group_gap, "legend group_gap")
        if self._group_gap < 0:
            raise ValueError("legend group_gap must be nonnegative")

    def to_dict(self) -> dict[str, JSONValue]:
        answer: dict[str, JSONValue] = {
            "visible": self._visible,
            "orientation": self._orientation,
            "xanchor": self._x_anchor,
            "yanchor": self._y_anchor,
            "traceorder": self._trace_order,
            "tracegroupgap": self._group_gap,
        }
        if self._title is not None:
            answer["title"] = {"text": self._title}
        if self._x is not None:
            answer["x"] = self._x
        if self._y is not None:
            answer["y"] = self._y
        return answer


class AnnotationSettings:
    """One stable Plotly annotation using data or paper coordinates."""

    def __init__(
        self,
        annotation_id: str,
        text: str,
        x: int | float,
        y: int | float,
        *,
        x_reference: str = "x",
        y_reference: str = "y",
        show_arrow: bool = False,
        x_anchor: str = "auto",
        y_anchor: str = "auto",
        angle: int | float = 0,
        x_shift: int | float = 0,
        y_shift: int | float = 0,
        font: Mapping[str, Any] | None = None,
    ) -> None:
        if not isinstance(annotation_id, str) or annotation_id == "":
            raise TypeError("annotation ID must be a nonempty string")
        if not isinstance(text, str):
            raise TypeError("annotation text must be a string")
        for reference, name, supported in (
            (x_reference, "x_reference", ("x", "paper")),
            (y_reference, "y_reference", ("y", "paper")),
        ):
            if not isinstance(reference, str) or reference == "":
                raise TypeError("annotation " + name + " must be a nonempty string")
            if reference not in supported:
                raise UnsupportedPresentationError(
                    "annotation " + name, reference, supported
                )
        if not isinstance(show_arrow, bool):
            raise TypeError("annotation show_arrow must be a bool")
        self._id = annotation_id
        self._text = text
        self._x = _finite_number(x, "annotation x")
        self._y = _finite_number(y, "annotation y")
        self._xref = x_reference
        self._yref = y_reference
        self._show_arrow = show_arrow
        self._x_anchor = _choice(x_anchor, "annotation x_anchor", _ANCHORS[:4])
        self._y_anchor = _choice(
            y_anchor, "annotation y_anchor", ("auto", "top", "middle", "bottom")
        )
        self._angle = _finite_number(angle, "annotation angle")
        self._x_shift = _finite_number(x_shift, "annotation x_shift")
        self._y_shift = _finite_number(y_shift, "annotation y_shift")
        self._font = materialize_object(font, "$.annotation.font")

    @property
    def id(self) -> str:
        return self._id

    def to_dict(self) -> dict[str, JSONValue]:
        answer: dict[str, JSONValue] = {
            "id": self._id,
            "text": self._text,
            "x": self._x,
            "y": self._y,
            "xref": self._xref,
            "yref": self._yref,
            "showarrow": self._show_arrow,
            "xanchor": self._x_anchor,
            "yanchor": self._y_anchor,
            "textangle": self._angle,
            "xshift": self._x_shift,
            "yshift": self._y_shift,
        }
        if self._font:
            answer["font"] = materialize_object(self._font, "$.annotation.font")
        return answer


def lower_axes_2d(value: Axes2DSettings | Mapping[str, Any]) -> dict[str, JSONValue]:
    """Lower a canonical PlotSpec axes document to Plotly layout fields."""
    document = (
        value.to_dict()
        if isinstance(value, Axes2DSettings)
        else materialize_object(value, "$.axes_or_scene")
    )
    allowed = ("coordinate_system", "xaxis", "yaxis")
    unknown = sorted(key for key in document if key not in allowed)
    if unknown:
        raise UnsupportedPresentationError("axes field", unknown[0], allowed)
    if document.get("coordinate_system", "cartesian") != "cartesian":
        raise UnsupportedPresentationError(
            "coordinate_system", document.get("coordinate_system"), ("cartesian",)
        )
    xaxis = document.get("xaxis", {})
    yaxis = document.get("yaxis", {})
    if not isinstance(xaxis, Mapping) or not isinstance(yaxis, Mapping):
        raise TypeError("xaxis and yaxis must be mappings")
    # Round-trip through the checked subset, while preserving equal-aspect
    # fields which are owned by `Axes2DSettings` rather than `AxisSettings`.
    y_scaleanchor = yaxis.get("scaleanchor")
    y_scaleratio = yaxis.get("scaleratio")
    y_base = {
        key: yaxis[key] for key in yaxis if key not in ("scaleanchor", "scaleratio")
    }
    result: dict[str, JSONValue] = {
        "xaxis": AxisSettings.from_dict(xaxis).to_dict(),
        "yaxis": AxisSettings.from_dict(y_base).to_dict(),
    }
    lowered_y = result["yaxis"]
    if not isinstance(lowered_y, dict):
        raise TypeError("internal yaxis lowering error")
    if y_scaleanchor is not None or y_scaleratio is not None:
        if y_scaleanchor != "x" or y_scaleratio != 1:
            raise UnsupportedPresentationError(
                "axis aspect", [y_scaleanchor, y_scaleratio], ("['x', 1]",)
            )
        lowered_y["scaleanchor"] = "x"
        lowered_y["scaleratio"] = 1
    return result


def lower_scene_3d(value: Scene3DSettings | Mapping[str, Any]) -> dict[str, JSONValue]:
    """Lower a canonical PlotSpec scene document to Plotly's `scene` field."""
    document = (
        value.to_dict()
        if isinstance(value, Scene3DSettings)
        else materialize_object(value, "$.axes_or_scene")
    )
    allowed = ("coordinate_system", "scene")
    unknown = sorted(key for key in document if key not in allowed)
    if unknown:
        raise UnsupportedPresentationError("scene field", unknown[0], allowed)
    if document.get("coordinate_system", "cartesian") != "cartesian":
        raise UnsupportedPresentationError(
            "coordinate_system", document.get("coordinate_system"), ("cartesian",)
        )
    scene = document.get("scene", {})
    if not isinstance(scene, Mapping):
        raise TypeError("scene must be a mapping")
    raw_scene = cast(Mapping[str, Any], scene)
    settings = Scene3DSettings(
        raw_scene.get("xaxis"),
        raw_scene.get("yaxis"),
        raw_scene.get("zaxis"),
        aspect_mode=raw_scene.get("aspectmode", "auto"),
        aspect_ratio=raw_scene.get("aspectratio"),
        camera=raw_scene.get("camera"),
    )
    lowered = settings.to_dict()["scene"]
    if not isinstance(lowered, dict):
        raise TypeError("internal scene lowering error")
    return {"scene": lowered}


def lower_legend(value: LegendSettings | Mapping[str, Any]) -> dict[str, JSONValue]:
    """Return detached Plotly layout fields for a checked legend."""
    if isinstance(value, LegendSettings):
        legend = value.to_dict()
    else:
        document = materialize_object(value, "$.legend")
        raw_legend = cast(dict[str, Any], document)
        title = raw_legend.get("title")
        title_text: str | None = None
        if isinstance(title, str):
            title_text = title
        elif isinstance(title, dict):
            text = title.get("text")
            if text is not None and not isinstance(text, str):
                raise TypeError("legend title.text must be a string")
            title_text = text
        elif title is not None:
            raise TypeError("legend title must be a string or mapping")
        known = {
            "visible",
            "title",
            "orientation",
            "x",
            "y",
            "xanchor",
            "yanchor",
            "traceorder",
            "tracegroupgap",
        }
        unknown = sorted(key for key in document if key not in known)
        if unknown:
            raise UnsupportedPresentationError(
                "legend field", unknown[0], sorted(known)
            )
        legend = LegendSettings(
            visible=raw_legend.get("visible", True),
            title=title_text,
            orientation=raw_legend.get("orientation", "v"),
            x=raw_legend.get("x"),
            y=raw_legend.get("y"),
            x_anchor=raw_legend.get("xanchor", "auto"),
            y_anchor=raw_legend.get("yanchor", "auto"),
            trace_order=raw_legend.get("traceorder", "normal"),
            group_gap=raw_legend.get("tracegroupgap", 10),
        ).to_dict()
    return {
        "showlegend": legend["visible"],
        "legend": {key: legend[key] for key in legend if key != "visible"},
    }


def lower_annotations(
    values: Sequence[AnnotationSettings | Mapping[str, Any]],
) -> list[dict[str, JSONValue]]:
    """Lower checked annotations, removing semantic IDs from Plotly records."""
    output: list[dict[str, JSONValue]] = []
    seen: dict[str, bool] = {}
    for value in values:
        if isinstance(value, AnnotationSettings):
            record = value.to_dict()
        elif isinstance(value, Mapping):
            record = materialize_object(value, "$.annotation")
            raw_annotation = cast(dict[str, Any], record)
            # Reconstruction validates every field represented by the class.
            known = {
                "id",
                "text",
                "x",
                "y",
                "xref",
                "yref",
                "showarrow",
                "xanchor",
                "yanchor",
                "textangle",
                "xshift",
                "yshift",
                "font",
            }
            unknown = sorted(key for key in record if key not in known)
            if unknown:
                raise UnsupportedPresentationError(
                    "annotation field", unknown[0], sorted(known)
                )
            record = AnnotationSettings(
                str(raw_annotation.get("id", "")),
                raw_annotation.get("text", ""),
                raw_annotation.get("x", 0),
                raw_annotation.get("y", 0),
                x_reference=raw_annotation.get("xref", "x"),
                y_reference=raw_annotation.get("yref", "y"),
                show_arrow=raw_annotation.get("showarrow", False),
                x_anchor=raw_annotation.get("xanchor", "auto"),
                y_anchor=raw_annotation.get("yanchor", "auto"),
                angle=raw_annotation.get("textangle", 0),
                x_shift=raw_annotation.get("xshift", 0),
                y_shift=raw_annotation.get("yshift", 0),
                font=raw_annotation.get("font"),
            ).to_dict()
        else:
            raise TypeError("annotations must be AnnotationSettings or mappings")
        annotation_id = record["id"]
        if not isinstance(annotation_id, str):
            raise TypeError("annotation ID must be a string")
        if annotation_id in seen:
            raise ValueError("duplicate annotation ID: " + annotation_id)
        seen[annotation_id] = True
        output.append({key: record[key] for key in record if key != "id"})
    return output
