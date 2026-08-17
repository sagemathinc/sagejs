"""NumPy-backed operations for the experimental MATLAB frontend."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import sagejs.runtime as runtime

ALL = object()


def _runtime_type_name(value: Any) -> str:
    name = type(value).__name__
    if name.startswith("ρσ_"):
        return name[3:]
    return name


def size(value: Any) -> tuple[int, ...]:
    """Return MATLAB-style dimensions without copying a shared object."""

    if _runtime_type_name(value) == "MatlabHandleList":
        return (1, len(value))
    if hasattr(value, "shape"):
        return tuple(int(dimension) for dimension in value.shape)
    if isinstance(value, (list, tuple, str)):
        return (1, len(value))
    return (1, 1)


def numel(value: Any) -> int:
    result = 1
    for dimension in size(value):
        result *= dimension
    return result


def class_name(value: Any) -> str:
    """Describe a shared object using MATLAB names where they are exact."""

    name = _runtime_type_name(value)
    if name == "bool":
        return "logical"
    if name in {"float", "RealLiteral", "RealNumberElement"}:
        return "double"
    if name == "str":
        return "char"
    if name in {"list", "list_constructor", "tuple"}:
        return "cell"
    if name == "ndarray":
        dtype = getattr(value, "dtype", None)
        return str(getattr(dtype, "name", "ndarray"))
    adapted = {
        "int": "sage.Integer",
        "Integer": "sage.Integer",
        "Rational": "sage.Rational",
        "complex": "sage.Complex",
        "PythonComplex": "sage.Complex",
        "ComplexNumberElement": "sage.Complex",
        "dict": "sage.Dictionary",
        "set": "sage.Set",
        "PolynomialRingParent": "sage.PolynomialRing",
        "PolynomialElement": "sage.Polynomial",
        "Expression": "sage.SymbolicExpression",
        "Graphics": "sage.Graphics",
        "Graphics3d": "sage.Graphics3d",
    }
    return adapted[name] if name in adapted else name


def colon(start: float, stop: float, step: float = 1) -> list[float]:
    if step == 0:
        raise ValueError("colon step must not be zero")
    count = int((stop - start) / step)
    if count < 0:
        return []
    return [start + index * step for index in range(count + 1)]


def mtimes(left: Any, right: Any) -> Any:
    if hasattr(left, "shape") and hasattr(right, "shape"):
        return left @ right
    return left * right


def times(left: Any, right: Any) -> Any:
    return left * right


def mrdivide(left: Any, right: Any) -> Any:
    return left / right


def rdivide(left: Any, right: Any) -> Any:
    return left / right


def mldivide(left: Any, right: Any) -> Any:
    raise NotImplementedError("MATLAB matrix left division is not implemented")


def ldivide(left: Any, right: Any) -> Any:
    return right / left


def mpower(value: Any, exponent: int) -> Any:
    if not hasattr(value, "shape"):
        return value**exponent
    if exponent < 0:
        raise NotImplementedError("negative matrix powers are not implemented")
    if exponent == 0:
        size = value.shape[0]
        return np.array(
            [
                [1 if row == column else 0 for column in range(size)]
                for row in range(size)
            ]
        )
    result = value
    for _index in range(1, exponent):
        result = result @ value
    return result


def power(left: Any, right: Any) -> Any:
    return left**right


def _integer_index(value: Any) -> int:
    index = int(value)
    if index != value:
        raise TypeError("MATLAB indices must be integers")
    if index < 1:
        raise IndexError("MATLAB indices start at 1")
    return index


def _linear_indices(value: Any, index_value: Any) -> tuple[int, ...]:
    index = _integer_index(index_value) - 1
    indices = []
    for dimension in value.shape:
        size = int(dimension)
        indices.append(index % size)
        index //= size
    if index:
        raise IndexError("MATLAB linear index is out of bounds")
    return tuple(indices)


def _selector_positions(
    value: Any,
    dimension: int,
) -> tuple[list[int], bool]:
    if value is ALL:
        return list(range(dimension)), False
    if hasattr(value, "tolist"):
        entries = value.tolist()
        if not isinstance(entries, list):
            entries = [entries]
            scalar = True
        else:
            scalar = False
    else:
        entries = [value]
        scalar = True
    positions = [_integer_index(entry) - 1 for entry in entries]
    for position in positions:
        if position >= dimension:
            raise IndexError("MATLAB index is out of bounds")
    return positions, scalar


def _select_nested(
    values: Any,
    selectors: list[tuple[list[int], bool]],
    depth: int = 0,
) -> Any:
    if depth == len(selectors):
        return values
    positions = selectors[depth][0]
    scalar = selectors[depth][1]
    selected = [
        _select_nested(values[position], selectors, depth + 1) for position in positions
    ]
    if scalar:
        return selected[0]
    return selected


def _scalar_indices(
    value: Any,
    items: tuple[Any, ...],
) -> tuple[int, ...]:
    if len(items) == 1:
        return _linear_indices(value, items[0])
    if len(items) != len(value.shape):
        raise NotImplementedError(
            "indexed access currently requires one selector per dimension"
        )
    indices = []
    for dimension, item in zip(value.shape, items, strict=True):
        if item is ALL or hasattr(item, "tolist"):
            raise NotImplementedError(
                "indexed assignment currently requires scalar indices"
            )
        positions, _scalar = _selector_positions(item, int(dimension))
        indices.append(positions[0])
    return tuple(indices)


def call_or_index(value: Any, *items: Any) -> Any:
    if callable(value):
        return value(*items)
    if _runtime_type_name(value) == "MatlabHandleList":
        if len(items) != 1:
            raise NotImplementedError(
                "MATLAB handle vectors currently support one scalar index"
            )
        return value[_integer_index(items[0]) - 1]
    if isinstance(value, (list, tuple, str)):
        if len(items) != 1 or items[0] is ALL or hasattr(items[0], "tolist"):
            raise NotImplementedError(
                "shared sequences currently support one scalar MATLAB index"
            )
        return value[_integer_index(items[0]) - 1]
    if len(items) == 1 and items[0] is not ALL and not hasattr(items[0], "tolist"):
        return value.item(*_linear_indices(value, items[0]))
    if len(items) != len(value.shape):
        raise NotImplementedError(
            "indexed access currently requires one selector per dimension"
        )
    selectors = [
        _selector_positions(item, int(dimension))
        for dimension, item in zip(value.shape, items, strict=True)
    ]
    if all(selector[1] for selector in selectors):
        indices = tuple(selector[0][0] for selector in selectors)
        return value.item(*indices)
    return _select_nested(value.tolist(), selectors)


def set_index(
    value: Any,
    new_value: Any,
    *items: Any,
) -> Any:
    value.__setitem__(_scalar_indices(value, items), new_value)
    return new_value


_PLOTLY_MIME = "application/vnd.plotly.v1+json"
_MATLAB_COLORS = {
    "r": "#d62728",
    "g": "#2ca02c",
    "b": "#1f77b4",
    "c": "#17becf",
    "m": "#e377c2",
    "y": "#bcbd22",
    "k": "#111111",
    "w": "#ffffff",
}
_COLOR_ORDER = [
    "#0072BD",
    "#D95319",
    "#EDB120",
    "#7E2F8E",
    "#77AC30",
    "#4DBEEE",
    "#A2142F",
]
_LINE_DASH = {
    "-": "solid",
    "--": "dash",
    "-.": "dashdot",
    ":": "dot",
    "none": "solid",
}
_MARKERS = {
    "+": "cross-thin",
    "o": "circle",
    "*": "asterisk",
    ".": "circle",
    "x": "x-thin",
    "s": "square",
    "d": "diamond",
    "^": "triangle-up",
    "v": "triangle-down",
    ">": "triangle-right",
    "<": "triangle-left",
    "p": "pentagon",
    "h": "hexagon",
    "|": "line-ns",
    "_": "line-ew",
    "none": None,
}


def _native_json(value: Any) -> Any:
    if isinstance(value, dict):
        answer = runtime.object.create(None)
        for key in value:
            runtime.reflect.set(answer, str(key), _native_json(value[key]))
        return answer
    if isinstance(value, (list, tuple)):
        return [_native_json(item) for item in value]
    return value


def _rich_display(data: Any) -> Any:
    answer = runtime.object.create(None)
    runtime.reflect.set(answer, "mime", _PLOTLY_MIME)
    runtime.reflect.set(answer, "data", _native_json(data))
    return answer


def _plain_data(value: Any) -> Any:
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, tuple):
        value = list(value)
    if isinstance(value, list):
        return [_plain_data(item) for item in value]
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        numeric = float(value)
        if not math.isfinite(numeric):
            return None
        return numeric
    if hasattr(value, "item"):
        return _plain_data(value.item())
    numeric = float(value)
    if not math.isfinite(numeric):
        return None
    return numeric


def _columns(value: Any) -> list[list[Any]]:
    values = _plain_data(value)
    if not isinstance(values, list):
        raise TypeError("MATLAB plot data must be a vector or matrix")
    if len(values) == 0:
        return [[]]
    if not isinstance(values[0], list):
        return [values]
    rows = values
    width = len(rows[0])
    if width == 0:
        return [[]]
    for row in rows:
        if not isinstance(row, list) or len(row) != width:
            raise ValueError("MATLAB plot matrices must be rectangular")
    if len(rows) == 1:
        return [rows[0]]
    if width == 1:
        return [[row[0] for row in rows]]
    return [[row[column] for row in rows] for column in range(width)]


def _xy_columns(x_value: Any, y_value: Any) -> list[tuple[list[Any], list[Any]]]:
    x_columns = _columns(x_value)
    y_columns = _columns(y_value)
    if len(x_columns) == len(y_columns):
        pairs = list(zip(x_columns, y_columns, strict=True))
    elif len(x_columns) == 1:
        pairs = [(x_columns[0], column) for column in y_columns]
    elif len(y_columns) == 1:
        pairs = [(column, y_columns[0]) for column in x_columns]
    else:
        raise ValueError("MATLAB X and Y matrices must have compatible columns")
    for x_data, y_data in pairs:
        if len(x_data) != len(y_data):
            raise ValueError("MATLAB X and Y data must have the same length")
    return pairs


def _y_columns(y_value: Any) -> list[tuple[list[Any], list[Any]]]:
    answer = []
    for y_data in _columns(y_value):
        answer.append((list(range(1, len(y_data) + 1)), y_data))
    return answer


def _on_off(value: Any, name: str) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value).lower()
    if normalized == "on":
        return True
    if normalized == "off":
        return False
    raise ValueError(name + " must be 'on' or 'off'")


def _color(value: Any) -> str:
    if isinstance(value, str):
        return _MATLAB_COLORS.get(value.lower(), value)
    values = _plain_data(value)
    if not isinstance(values, list) or len(values) != 3:
        raise ValueError("Color must be a name, short color code, or RGB triple")
    components = []
    for component in values:
        numeric = float(component)
        if numeric < 0 or numeric > 1:
            raise ValueError("RGB components must be between 0 and 1")
        components.append(int(round(numeric * 255)))
    return "rgb(" + ",".join(str(component) for component in components) + ")"


def _limit(value: Any, name: str) -> list[float] | None:
    if isinstance(value, str) and value.lower() == "auto":
        return None
    values = _columns(value)
    if len(values) != 1 or len(values[0]) != 2:
        raise ValueError(name + " must contain exactly two numbers or be 'auto'")
    lower = float(values[0][0])
    upper = float(values[0][1])
    if not math.isfinite(lower) or not math.isfinite(upper) or lower >= upper:
        raise ValueError(name + " must contain finite increasing limits")
    return [lower, upper]


def _property_key(name: Any) -> str:
    if not isinstance(name, str) or name == "":
        raise TypeError("MATLAB property names must be nonempty strings")
    return name.replace("_", "").lower()


def _line_spec(value: str) -> dict[str, Any] | None:
    if value == "":
        return None
    remaining = value
    style: dict[str, Any] = {}
    for token in ("--", "-.", ":", "-"):
        if token in remaining:
            style["LineStyle"] = token
            remaining = remaining.replace(token, "", 1)
            break
    for token in _MATLAB_COLORS:
        if token in remaining:
            style["Color"] = token
            remaining = remaining.replace(token, "", 1)
            break
    for token in _MARKERS:
        if token != "none" and token in remaining:
            style["Marker"] = token
            remaining = remaining.replace(token, "", 1)
            break
    if remaining != "":
        return None
    if "Marker" in style and "LineStyle" not in style:
        style["LineStyle"] = "none"
    return style


class MatlabGraphicsHandle:
    """Base class for session-owned live MATLAB graphics handles."""

    def __init__(self, session: MatlabGraphicsSession, handle_id: str) -> None:
        self._session = session
        self._handle_id = handle_id
        self._alive = True

    def _require_live(self) -> None:
        if not self._alive:
            raise RuntimeError("stale MATLAB graphics handle " + self._handle_id)

    def _delete(self) -> None:
        self._alive = False

    def spec(self) -> Any:
        self._require_live()
        return self._figure().spec()

    def plotly(self) -> Any:
        self._require_live()
        return self._figure().plotly()

    def _rich_repr_(self) -> Any:
        self._require_live()
        return _rich_display(self.plotly())

    def _figure(self) -> MatlabFigure:
        raise NotImplementedError("graphics handle has no parent figure")

    def _get_property(self, name: str) -> Any:
        key = _property_key(name)
        if key == "type":
            return type(self).__name__
        if key in ("id", "handleid"):
            return self._handle_id
        if key in ("valid", "isvalid"):
            return self._alive
        self._require_live()
        raise AttributeError("unknown MATLAB graphics property '" + name + "'")

    def _set_property(self, name: str, value: Any) -> Any:
        self._require_live()
        raise AttributeError("MATLAB graphics property '" + name + "' is read-only")


class MatlabLineHandle(MatlabGraphicsHandle):
    """A stable handle to one semantic line layer."""

    def __init__(
        self,
        session: MatlabGraphicsSession,
        handle_id: str,
        parent: MatlabAxesHandle,
        x_data: list[Any],
        y_data: list[Any],
        color: str,
    ) -> None:
        MatlabGraphicsHandle.__init__(self, session, handle_id)
        self._parent = parent
        self._x_data = list(x_data)
        self._y_data = list(y_data)
        self._color = color
        self._line_style = "-"
        self._line_width = 1.5
        self._marker = "none"
        self._marker_size = 6.0
        self._display_name: str | None = None
        self._visible = True

    def __repr__(self) -> str:
        return "MATLAB Line handle " + self._handle_id

    __str__ = __repr__
    toString = __repr__

    def _figure(self) -> MatlabFigure:
        return self._parent._figure()

    def _get_property(self, name: str) -> Any:
        key = _property_key(name)
        values = {
            "xdata": self._x_data,
            "ydata": self._y_data,
            "color": self._color,
            "linestyle": self._line_style,
            "linewidth": self._line_width,
            "marker": self._marker,
            "markersize": self._marker_size,
            "displayname": self._display_name,
            "visible": "on" if self._visible else "off",
            "parent": self._parent,
        }
        if key in values:
            self._require_live()
            return values[key]
        return MatlabGraphicsHandle._get_property(self, name)

    def _set_property(self, name: str, value: Any) -> Any:
        self._require_live()
        key = _property_key(name)
        if key in ("xdata", "ydata"):
            data = _columns(value)
            if len(data) != 1:
                raise ValueError(name + " must be a vector")
            if key == "xdata":
                if len(data[0]) != len(self._y_data):
                    raise ValueError("XData and YData must have the same length")
                self._x_data = data[0]
            else:
                if len(data[0]) != len(self._x_data):
                    raise ValueError("XData and YData must have the same length")
                self._y_data = data[0]
        elif key == "color":
            self._color = _color(value)
        elif key == "linestyle":
            normalized = str(value).lower()
            if normalized not in _LINE_DASH:
                raise ValueError("unsupported MATLAB LineStyle '" + str(value) + "'")
            self._line_style = normalized
        elif key == "linewidth":
            numeric = float(value)
            if numeric <= 0:
                raise ValueError("LineWidth must be positive")
            self._line_width = numeric
        elif key == "marker":
            normalized = str(value).lower()
            if normalized not in _MARKERS:
                raise ValueError("unsupported MATLAB Marker '" + str(value) + "'")
            self._marker = normalized
        elif key == "markersize":
            numeric = float(value)
            if numeric <= 0:
                raise ValueError("MarkerSize must be positive")
            self._marker_size = numeric
        elif key == "displayname":
            self._display_name = str(value)
        elif key == "visible":
            self._visible = _on_off(value, "Visible")
        else:
            return MatlabGraphicsHandle._set_property(self, name, value)
        self._figure()._touch()
        return value

    def _style(self) -> dict[str, Any]:
        return {
            "color": self._color,
            "width": self._line_width,
            "dash": (
                "none" if self._line_style == "none" else _LINE_DASH[self._line_style]
            ),
            "opacity": 1.0,
            "marker": _MARKERS[self._marker],
            "marker_size": self._marker_size,
        }

    def _trace(self, show_legend: bool) -> dict[str, Any]:
        marker = _MARKERS[self._marker]
        has_line = self._line_style != "none"
        mode = "lines" if has_line or marker is None else "markers"
        if has_line and marker is not None:
            mode = "lines+markers"
        trace: dict[str, Any] = {
            "type": "scatter",
            "mode": mode,
            "uid": self._handle_id,
            "x": list(self._x_data),
            "y": list(self._y_data),
            "visible": self._visible,
            "line": {
                "color": self._color,
                "width": self._line_width if has_line else 0,
                "dash": _LINE_DASH[self._line_style],
            },
            "showlegend": show_legend and self._visible,
        }
        if marker is not None:
            trace["marker"] = {
                "color": self._color,
                "size": self._marker_size,
                "symbol": marker,
            }
        if self._display_name is not None:
            trace["name"] = self._display_name
        return trace


class MatlabAxesHandle(MatlabGraphicsHandle):
    """Session-local axes state and its ordered live line children."""

    def __init__(
        self,
        session: MatlabGraphicsSession,
        handle_id: str,
        parent: MatlabFigure,
    ) -> None:
        MatlabGraphicsHandle.__init__(self, session, handle_id)
        self._parent = parent
        self._lines: list[MatlabLineHandle] = []
        self._hold = False
        self._xlabel = ""
        self._ylabel = ""
        self._title = ""
        self._xlim: list[float] | None = None
        self._ylim: list[float] | None = None
        self._grid = False
        self._legend_visible = False
        self._color_index = 0

    def __repr__(self) -> str:
        return "MATLAB Axes handle " + self._handle_id

    __str__ = __repr__
    toString = __repr__

    def _figure(self) -> MatlabFigure:
        return self._parent

    def _reset_for_plot(self) -> None:
        for line_handle in self._lines:
            line_handle._delete()
        self._lines = []
        self._xlabel = ""
        self._ylabel = ""
        self._title = ""
        self._xlim = None
        self._ylim = None
        self._grid = False
        self._legend_visible = False
        self._color_index = 0

    def _get_property(self, name: str) -> Any:
        key = _property_key(name)
        values = {
            "xlim": self._xlim,
            "ylim": self._ylim,
            "xlabel": self._xlabel,
            "ylabel": self._ylabel,
            "title": self._title,
            "xgrid": "on" if self._grid else "off",
            "ygrid": "on" if self._grid else "off",
            "nextplot": "add" if self._hold else "replace",
            "children": list(self._lines),
            "parent": self._parent,
        }
        if key in values:
            self._require_live()
            return values[key]
        return MatlabGraphicsHandle._get_property(self, name)

    def _set_property(self, name: str, value: Any) -> Any:
        self._require_live()
        key = _property_key(name)
        if key == "xlim":
            self._xlim = _limit(value, "XLim")
        elif key == "ylim":
            self._ylim = _limit(value, "YLim")
        elif key == "xlabel":
            self._xlabel = str(value)
        elif key == "ylabel":
            self._ylabel = str(value)
        elif key == "title":
            self._title = str(value)
        elif key in ("xgrid", "ygrid"):
            self._grid = _on_off(value, name)
        elif key == "nextplot":
            normalized = str(value).lower()
            if normalized not in ("add", "replace"):
                raise ValueError("NextPlot must be 'add' or 'replace'")
            self._hold = normalized == "add"
        else:
            return MatlabGraphicsHandle._set_property(self, name, value)
        self._parent._touch()
        return value


class MatlabFigure(MatlabGraphicsHandle):
    """One session-local MATLAB figure with stable axes and layer IDs."""

    def __init__(
        self,
        session: MatlabGraphicsSession,
        handle_id: str,
        number: int,
    ) -> None:
        MatlabGraphicsHandle.__init__(self, session, handle_id)
        self._number = number
        self._name = ""
        self._visible = True
        self._axes: list[MatlabAxesHandle] = []
        self._current_axes: MatlabAxesHandle | None = None
        self._revision = 0

    def __repr__(self) -> str:
        return "MATLAB Figure " + str(self._number)

    __str__ = __repr__
    toString = __repr__

    def _figure(self) -> MatlabFigure:
        return self

    def _touch(self) -> None:
        self._revision += 1

    def _get_property(self, name: str) -> Any:
        key = _property_key(name)
        values = {
            "number": self._number,
            "name": self._name,
            "visible": "on" if self._visible else "off",
            "currentaxes": self._current_axes,
            "children": list(self._axes),
        }
        if key in values:
            self._require_live()
            return values[key]
        return MatlabGraphicsHandle._get_property(self, name)

    def _set_property(self, name: str, value: Any) -> Any:
        self._require_live()
        key = _property_key(name)
        if key == "name":
            self._name = str(value)
        elif key == "visible":
            self._visible = _on_off(value, "Visible")
        else:
            return MatlabGraphicsHandle._set_property(self, name, value)
        self._touch()
        return value

    def _layout(self) -> dict[str, Any]:
        axes_handle = self._current_axes
        xaxis: dict[str, Any] = {"showgrid": False, "automargin": True}
        yaxis: dict[str, Any] = {"showgrid": False, "automargin": True}
        layout: dict[str, Any] = {
            "template": "plotly_white",
            "hovermode": "closest",
            "showlegend": False,
            "xaxis": xaxis,
            "yaxis": yaxis,
            "margin": {"l": 64, "r": 28, "t": 54, "b": 58},
        }
        if axes_handle is None:
            return layout
        xaxis["showgrid"] = axes_handle._grid
        yaxis["showgrid"] = axes_handle._grid
        if axes_handle._xlabel:
            xaxis["title"] = {"text": axes_handle._xlabel}
        if axes_handle._ylabel:
            yaxis["title"] = {"text": axes_handle._ylabel}
        if axes_handle._xlim is not None:
            xaxis["range"] = list(axes_handle._xlim)
        if axes_handle._ylim is not None:
            yaxis["range"] = list(axes_handle._ylim)
        if axes_handle._title:
            layout["title"] = {"text": axes_handle._title, "x": 0.5}
        if self._name and "title" not in layout:
            layout["title"] = {"text": self._name, "x": 0.5}
        layout["showlegend"] = any(
            axes_value._legend_visible for axes_value in self._axes
        )
        return layout

    def plotly(self) -> Any:
        self._require_live()
        traces = []
        for axes_handle in self._axes:
            axes_handle._require_live()
            for line_handle in axes_handle._lines:
                line_handle._require_live()
                traces.append(line_handle._trace(axes_handle._legend_visible))
        return {
            "data": traces,
            "layout": self._layout(),
            "config": {"displaylogo": False, "responsive": True},
        }

    def spec(self) -> Any:
        self._require_live()
        plotting = __import__(
            "sagejs.plotting",
            fromlist=["PlotLayer", "PlotSpec", "Provenance"],
        )
        layers = []
        for axes_handle in self._axes:
            for line_handle in axes_handle._lines:
                layers.append(
                    plotting.PlotLayer(
                        layer_id=line_handle._handle_id,
                        kind="line",
                        data={
                            "x": list(line_handle._x_data),
                            "y": list(line_handle._y_data),
                        },
                        source_intent={
                            "constructor": "plot",
                            "representation": "normalized-primitive",
                        },
                        style=line_handle._style(),
                        visibility=line_handle._visible,
                        legend={
                            "show": axes_handle._legend_visible,
                            "label": line_handle._display_name,
                        },
                        metadata={
                            "semantic": True,
                            "matlab_handle": line_handle._handle_id,
                            "matlab_axes": axes_handle._handle_id,
                        },
                    )
                )
        layout = self._layout()
        current_axes = self._current_axes
        axes_record = {
            "coordinate_system": "cartesian",
            "xaxis": layout["xaxis"],
            "yaxis": layout["yaxis"],
        }
        return plotting.PlotSpec(
            dimension=2,
            layers=layers,
            axes_or_scene=axes_record,
            provenance=plotting.Provenance(
                frontend="matlab",
                source_language="matlab",
                constructor="plot",
                metadata={
                    "figure_id": self._handle_id,
                    "axes_id": (
                        None if current_axes is None else current_axes._handle_id
                    ),
                    "hold": False if current_axes is None else current_axes._hold,
                    "revision": self._revision,
                },
            ),
            plotly_overrides={
                "layout": layout,
                "config": {"displaylogo": False, "responsive": True},
            },
        )


class MatlabHandleList:
    """MATLAB-style vector of line handles with figure-rich display."""

    def __init__(self, values: list[MatlabLineHandle]) -> None:
        self._values = list(values)

    def __len__(self) -> int:
        return len(self._values)

    def __getitem__(self, index: int) -> MatlabLineHandle:
        return self._values[index]

    def __iter__(self) -> Any:
        return iter(self._values)

    def __repr__(self) -> str:
        return "MATLAB Line handle vector with " + str(len(self._values)) + " entries"

    __str__ = __repr__
    toString = __repr__

    def _first(self) -> MatlabLineHandle:
        if len(self._values) == 0:
            raise RuntimeError("empty MATLAB graphics handle vector")
        self._values[0]._require_live()
        return self._values[0]

    def spec(self) -> Any:
        return self._first().spec()

    def plotly(self) -> Any:
        return self._first().plotly()

    def _rich_repr_(self) -> Any:
        return self._first()._rich_repr_()


class MatlabGraphicsSession:
    """Persistent MATLAB graphics state scoped to one Sage.js worker."""

    def __init__(self) -> None:
        self._figures: dict[int, MatlabFigure] = {}
        self._current_figure: MatlabFigure | None = None
        self._next_figure_number = 1
        self._next_figure_ordinal = 0
        self._next_axes_ordinal = 0
        self._next_line_ordinal = 0

    def _new_figure(self, number: int | None = None) -> MatlabFigure:
        if number is None:
            number = self._next_figure_number
            while number in self._figures:
                number += 1
        if number < 1:
            raise ValueError("MATLAB figure numbers must be positive integers")
        self._next_figure_number = max(self._next_figure_number, number + 1)
        handle_id = "matlab.figure-" + str(self._next_figure_ordinal)
        self._next_figure_ordinal += 1
        figure_handle = MatlabFigure(self, handle_id, number)
        self._figures[number] = figure_handle
        self._current_figure = figure_handle
        return figure_handle

    def figure(self, *arguments: Any) -> MatlabFigure:
        number: int | None = None
        options = list(arguments)
        if len(options) and isinstance(options[0], MatlabFigure):
            figure_handle = options.pop(0)
            figure_handle._require_live()
            self._current_figure = figure_handle
        elif len(options) and not isinstance(options[0], str):
            numeric = int(options.pop(0))
            if numeric in self._figures:
                figure_handle = self._figures[numeric]
                figure_handle._require_live()
                self._current_figure = figure_handle
            else:
                figure_handle = self._new_figure(numeric)
        else:
            figure_handle = self._new_figure(number)
        if len(options) % 2:
            raise ValueError("figure properties must be quoted name/value pairs")
        for index in range(0, len(options), 2):
            figure_handle._set_property(str(options[index]), options[index + 1])
        return figure_handle

    def gcf(self) -> MatlabFigure:
        if self._current_figure is None or not self._current_figure._alive:
            return self._new_figure()
        return self._current_figure

    def axes(self, *arguments: Any) -> MatlabAxesHandle:
        if len(arguments) == 1 and isinstance(arguments[0], MatlabAxesHandle):
            axes_handle = arguments[0]
            axes_handle._require_live()
            self._current_figure = axes_handle._parent
            axes_handle._parent._current_axes = axes_handle
            return axes_handle
        if len(arguments):
            raise NotImplementedError(
                "axes properties and positioned panels are not implemented; "
                "create axes() and set supported properties on its handle"
            )
        figure_handle = self.gcf()
        if len(figure_handle._axes):
            raise NotImplementedError(
                "multiple axes in one figure require shared positioned-panel "
                "PlotSpec support; select gca() or create a separate figure()"
            )
        handle_id = "matlab.axes-" + str(self._next_axes_ordinal)
        self._next_axes_ordinal += 1
        axes_handle = MatlabAxesHandle(self, handle_id, figure_handle)
        figure_handle._axes.append(axes_handle)
        figure_handle._current_axes = axes_handle
        figure_handle._touch()
        return axes_handle

    def gca(self) -> MatlabAxesHandle:
        figure_handle = self.gcf()
        axes_handle = figure_handle._current_axes
        if axes_handle is None or not axes_handle._alive:
            return self.axes()
        return axes_handle

    def _new_line(
        self,
        axes_handle: MatlabAxesHandle,
        x_data: list[Any],
        y_data: list[Any],
    ) -> MatlabLineHandle:
        handle_id = "matlab.line-" + str(self._next_line_ordinal)
        color = _COLOR_ORDER[axes_handle._color_index % len(_COLOR_ORDER)]
        axes_handle._color_index += 1
        self._next_line_ordinal += 1
        line_handle = MatlabLineHandle(
            self,
            handle_id,
            axes_handle,
            x_data,
            y_data,
            color,
        )
        axes_handle._lines.append(line_handle)
        return line_handle

    def plot(self, *arguments: Any) -> Any:
        if len(arguments) == 0:
            raise TypeError("plot requires Y data or X and Y data")
        property_start = len(arguments)
        properties: list[tuple[str, Any]] = []
        while property_start >= 2 and isinstance(arguments[property_start - 2], str):
            name = str(arguments[property_start - 2])
            key = _property_key(name)
            if key not in (
                "color",
                "linestyle",
                "linewidth",
                "marker",
                "markersize",
                "displayname",
                "visible",
            ):
                break
            properties.insert(0, (name, arguments[property_start - 1]))
            property_start -= 2
        series_arguments = list(arguments[:property_start])
        series: list[tuple[list[Any], list[Any], dict[str, Any]]] = []
        index = 0
        while index < len(series_arguments):
            first = series_arguments[index]
            if isinstance(first, str):
                raise ValueError(
                    "unexpected plot string '" + first + "'; expected numeric data"
                )
            if index + 1 < len(series_arguments) and not isinstance(
                series_arguments[index + 1], str
            ):
                pairs = _xy_columns(first, series_arguments[index + 1])
                index += 2
            else:
                pairs = _y_columns(first)
                index += 1
            line_style: dict[str, Any] = {}
            if index < len(series_arguments) and isinstance(
                series_arguments[index], str
            ):
                parsed = _line_spec(str(series_arguments[index]))
                if parsed is None:
                    raise ValueError(
                        "unsupported MATLAB LineSpec '"
                        + str(series_arguments[index])
                        + "'"
                    )
                line_style = parsed
                index += 1
            for x_data, y_data in pairs:
                series.append((x_data, y_data, line_style))
        axes_handle = self.gca()
        axes_handle._require_live()
        if not axes_handle._hold:
            axes_handle._reset_for_plot()
        handles = []
        for x_data, y_data, line_style in series:
            line_handle = self._new_line(axes_handle, x_data, y_data)
            for name, value in line_style.items():
                line_handle._set_property(name, value)
            for name, value in properties:
                line_handle._set_property(name, value)
            handles.append(line_handle)
        axes_handle._parent._touch()
        if len(handles) == 1:
            return handles[0]
        return MatlabHandleList(handles)

    def _delete_figure(self, figure_handle: MatlabFigure) -> None:
        figure_handle._require_live()
        for axes_handle in list(figure_handle._axes):
            self._delete_axes(axes_handle)
        if figure_handle._number in self._figures:
            del self._figures[figure_handle._number]
        figure_handle._delete()
        if self._current_figure is figure_handle:
            self._current_figure = None
            for number in sorted(self._figures, reverse=True):
                candidate = self._figures[number]
                if candidate._alive:
                    self._current_figure = candidate
                    break

    def _delete_axes(self, axes_handle: MatlabAxesHandle) -> None:
        axes_handle._require_live()
        for line_handle in list(axes_handle._lines):
            self._delete_line(line_handle)
        parent = axes_handle._parent
        parent._axes = [value for value in parent._axes if value is not axes_handle]
        axes_handle._delete()
        if parent._current_axes is axes_handle:
            parent._current_axes = parent._axes[-1] if len(parent._axes) else None
        parent._touch()

    def _delete_line(self, line_handle: MatlabLineHandle) -> None:
        line_handle._require_live()
        parent = line_handle._parent
        parent._lines = [value for value in parent._lines if value is not line_handle]
        line_handle._delete()
        parent._parent._touch()


_GRAPHICS_SESSION = MatlabGraphicsSession()


def figure(*arguments: Any) -> MatlabFigure:
    return _GRAPHICS_SESSION.figure(*arguments)


def gcf() -> MatlabFigure:
    return _GRAPHICS_SESSION.gcf()


def axes(*arguments: Any) -> MatlabAxesHandle:
    return _GRAPHICS_SESSION.axes(*arguments)


def gca() -> MatlabAxesHandle:
    return _GRAPHICS_SESSION.gca()


def plot(*arguments: Any) -> Any:
    return _GRAPHICS_SESSION.plot(*arguments)


def plotspec(handle: Any = None) -> Any:
    target = gcf() if handle is None else handle
    if not hasattr(target, "spec"):
        raise TypeError("plotspec requires a MATLAB graphics handle")
    return target.spec()


def plotly(handle: Any = None) -> Any:
    target = gcf() if handle is None else handle
    if not hasattr(target, "plotly"):
        raise TypeError("plotly requires a MATLAB graphics handle")
    return target.plotly()


def hold(*arguments: Any) -> None:
    axes_handle = gca()
    values = list(arguments)
    if len(values) and isinstance(values[0], MatlabAxesHandle):
        axes_handle = values.pop(0)
        axes_handle._require_live()
    if len(values) > 1:
        raise TypeError("hold accepts an optional axes handle and one state")
    axes_handle._hold = (
        not axes_handle._hold if len(values) == 0 else _on_off(values[0], "hold")
    )
    axes_handle._parent._touch()


def ishold(value: Any = None) -> bool:
    axes_handle = gca() if value is None else value
    if not isinstance(axes_handle, MatlabAxesHandle):
        raise TypeError("ishold expects an axes handle")
    axes_handle._require_live()
    return axes_handle._hold


def _target_axes(arguments: tuple[Any, ...], operation: str) -> tuple[Any, list[Any]]:
    values = list(arguments)
    axes_handle = gca()
    if len(values) and isinstance(values[0], MatlabAxesHandle):
        axes_handle = values.pop(0)
        axes_handle._require_live()
    if len(values) == 0:
        raise TypeError(operation + " requires a value")
    return axes_handle, values


def xlabel(*arguments: Any) -> MatlabAxesHandle:
    axes_handle, values = _target_axes(arguments, "xlabel")
    if len(values) != 1:
        raise TypeError("xlabel accepts one label")
    axes_handle._set_property("XLabel", values[0])
    return axes_handle


def ylabel(*arguments: Any) -> MatlabAxesHandle:
    axes_handle, values = _target_axes(arguments, "ylabel")
    if len(values) != 1:
        raise TypeError("ylabel accepts one label")
    axes_handle._set_property("YLabel", values[0])
    return axes_handle


def title(*arguments: Any) -> MatlabAxesHandle:
    axes_handle, values = _target_axes(arguments, "title")
    if len(values) != 1:
        raise TypeError("title accepts one title")
    axes_handle._set_property("Title", values[0])
    return axes_handle


def xlim(*arguments: Any) -> Any:
    axes_handle = gca()
    values = list(arguments)
    if len(values) and isinstance(values[0], MatlabAxesHandle):
        axes_handle = values.pop(0)
        axes_handle._require_live()
    if len(values) == 0:
        return axes_handle._xlim
    if len(values) != 1:
        raise TypeError("xlim accepts one limits vector")
    axes_handle._set_property("XLim", values[0])
    return list(axes_handle._xlim) if axes_handle._xlim is not None else None


def ylim(*arguments: Any) -> Any:
    axes_handle = gca()
    values = list(arguments)
    if len(values) and isinstance(values[0], MatlabAxesHandle):
        axes_handle = values.pop(0)
        axes_handle._require_live()
    if len(values) == 0:
        return axes_handle._ylim
    if len(values) != 1:
        raise TypeError("ylim accepts one limits vector")
    axes_handle._set_property("YLim", values[0])
    return list(axes_handle._ylim) if axes_handle._ylim is not None else None


def grid(*arguments: Any) -> None:
    axes_handle = gca()
    values = list(arguments)
    if len(values) and isinstance(values[0], MatlabAxesHandle):
        axes_handle = values.pop(0)
        axes_handle._require_live()
    if len(values) > 1:
        raise TypeError("grid accepts an optional axes handle and one state")
    state = not axes_handle._grid if len(values) == 0 else _on_off(values[0], "grid")
    axes_handle._grid = state
    axes_handle._parent._touch()


def legend(*arguments: Any) -> MatlabAxesHandle:
    axes_handle = gca()
    values = list(arguments)
    if len(values) and isinstance(values[0], MatlabAxesHandle):
        axes_handle = values.pop(0)
        axes_handle._require_live()
    if len(values) == 1 and str(values[0]).lower() in ("off", "hide"):
        axes_handle._legend_visible = False
    else:
        if len(values) == 1 and str(values[0]).lower() in ("on", "show"):
            values = []
        if len(values) > len(axes_handle._lines):
            raise ValueError("legend has more labels than plotted lines")
        for index in range(len(values)):
            axes_handle._lines[index]._display_name = str(values[index])
        for index in range(len(axes_handle._lines)):
            if axes_handle._lines[index]._display_name is None:
                axes_handle._lines[index]._display_name = "data" + str(index + 1)
        axes_handle._legend_visible = True
    axes_handle._parent._touch()
    return axes_handle


def get_property(handle: Any, name: str) -> Any:
    if not isinstance(handle, MatlabGraphicsHandle):
        raise TypeError("property access requires a MATLAB graphics handle")
    return handle._get_property(name)


def set_property(handle: Any, name: str, value: Any) -> Any:
    if not isinstance(handle, MatlabGraphicsHandle):
        raise TypeError("property assignment requires a MATLAB graphics handle")
    return handle._set_property(name, value)


def get(handle: Any, name: Any = None) -> Any:
    if isinstance(handle, MatlabHandleList):
        return [get(value, name) for value in handle]
    if name is None:
        if not isinstance(handle, MatlabGraphicsHandle):
            raise TypeError("get requires a MATLAB graphics handle")
        return {
            "Type": handle._get_property("Type"),
            "HandleId": handle._get_property("HandleId"),
            "Valid": handle._get_property("Valid"),
        }
    return get_property(handle, str(name))


def set(handle: Any, *property_values: Any) -> Any:
    if len(property_values) % 2:
        raise ValueError("set requires quoted property/value pairs")
    if isinstance(handle, MatlabHandleList):
        for value in handle:
            set(value, *property_values)
        return handle
    if not isinstance(handle, MatlabGraphicsHandle):
        raise TypeError("set requires a MATLAB graphics handle")
    for index in range(0, len(property_values), 2):
        set_property(
            handle,
            str(property_values[index]),
            property_values[index + 1],
        )
    return handle


def delete(handle: Any) -> None:
    if isinstance(handle, MatlabHandleList):
        for value in list(handle):
            if value._alive:
                delete(value)
        return
    if isinstance(handle, MatlabLineHandle):
        _GRAPHICS_SESSION._delete_line(handle)
        return
    if isinstance(handle, MatlabAxesHandle):
        _GRAPHICS_SESSION._delete_axes(handle)
        return
    if isinstance(handle, MatlabFigure):
        _GRAPHICS_SESSION._delete_figure(handle)
        return
    raise TypeError("delete requires a MATLAB graphics handle")


def subplot(*_arguments: Any) -> Any:
    raise NotImplementedError(
        "subplot requires shared multi-panel PlotSpec support; "
        "use separate figure() calls for now"
    )


def surf(*_arguments: Any) -> Any:
    raise NotImplementedError(
        "surf requires the shared semantic surface/3D PlotSpec layer; "
        "use a supported 2D plot until that layer is available"
    )
