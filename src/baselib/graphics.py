# Sage-compatible two-dimensional graphics objects.
#
# The object model and adaptive sampling design are adapted from SageMath's
# sage.plot package.
#
# Copyright (C) 2006-2026 SageMath contributors
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Callable, Iterator, Sequence

import sagejs.runtime as runtime

_PLOTLY_MIME = 'application/vnd.plotly.v1+json'
_GRAPHICS_OPTION_NAMES = [
    'aspect_ratio',
    'axes',
    'axes_labels',
    'frame',
    'gridlines',
    'scale',
    'title',
    'xmin',
    'xmax',
    'ymin',
    'ymax',
]


def _native_object() -> Any:
    return runtime.object.create(None)


def _native_record(**values: Any) -> Any:
    answer = _native_object()
    for key in runtime.object.keys(values):
        runtime.reflect.set(
            answer, key, runtime.reflect.get(values, key))
    return answer


def _copy_options(options: Any) -> dict[str, Any]:
    answer = {}
    items_method = runtime.reflect.get(options, 'items')
    if runtime.jstype(items_method) == 'function':
        for pair in options.items():
            answer[pair[0]] = pair[1]
        return answer
    for key in runtime.object.keys(options):
        answer[key] = runtime.reflect.get(options, key)
    return answer


def _option_has(options: Any, name: str) -> bool:
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        options,
        [name],
    )


def _option_get(
    options: Any,
    name: str,
    default_value: Any = None,
) -> Any:
    if _option_has(options, name):
        return runtime.reflect.get(options, name)
    return default_value


def _option_pop(
    options: Any,
    name: str,
    default_value: Any = None,
) -> Any:
    if not _option_has(options, name):
        return default_value
    value = runtime.reflect.get(options, name)
    runtime.reflect.deleteProperty(options, name)
    return value


def _option_update(target: Any, source: Any) -> None:
    for name in runtime.object.keys(source):
        runtime.reflect.set(
            target, name, runtime.reflect.get(source, name))


def _color_value(color: Any) -> str:
    if isinstance(color, str):
        return color
    if isinstance(color, (list, tuple)) and len(color) in (3, 4):
        components = []
        for value in color:
            component = float(value)
            component = max(0.0, min(1.0, component))
            components.append(int(runtime.math.round(component * 255)))
        if len(components) == 4:
            return (
                'rgba(' + str(components[0]) + ',' +
                str(components[1]) + ',' + str(components[2]) + ',' +
                str(float(color[3])) + ')'
            )
        return (
            'rgb(' + str(components[0]) + ',' +
            str(components[1]) + ',' + str(components[2]) + ')'
        )
    return str(color)


def _dash_value(linestyle: str) -> str:
    styles = {
        '-': 'solid',
        '--': 'dash',
        '-.': 'dashdot',
        ':': 'dot',
        'solid': 'solid',
        'dashed': 'dash',
        'dashdot': 'dashdot',
        'dotted': 'dot',
    }
    return _option_get(styles, linestyle, linestyle)


def _point_pair(point_value: Any) -> tuple[float, float]:
    if not isinstance(point_value, (list, tuple)) or len(point_value) != 2:
        raise ValueError('points must have exactly two coordinates')
    return float(point_value[0]), float(point_value[1])


def _normalize_points(points: Any) -> list[tuple[float, float]]:
    values = list(points)
    if (
        len(values) == 2
        and not isinstance(values[0], (list, tuple))
        and not isinstance(values[1], (list, tuple))
    ):
        values = [values]
    return [_point_pair(value) for value in values]


class GraphicPrimitive:
    """Base class for a semantic two-dimensional graphics primitive."""

    def __init__(self, options: dict[str, Any]) -> None:
        self._options = _copy_options(options)

    def options(self) -> dict[str, Any]:
        return _copy_options(self._options)

    def set_options(self, options: dict[str, Any]) -> None:
        self._options = _copy_options(options)

    def set_zorder(self, zorder: int) -> None:
        self._options['zorder'] = zorder

    def _plotly_trace(self) -> Any:
        raise NotImplementedError('graphics primitive has no Plotly renderer')

    def __repr__(self) -> str:
        return 'Graphics primitive'

    __str__ = __repr__
    toString = __repr__


@runtime.sequence_class
class Line(GraphicPrimitive):
    """A line through a sequence of two-dimensional points."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)

    def __len__(self) -> int:
        return len(self.xdata)

    def __getitem__(self, index: int) -> tuple[float, float]:
        return runtime.math_tuple(
            [self.xdata[index], self.ydata[index]])

    def __repr__(self) -> str:
        return 'Line defined by ' + str(len(self.xdata)) + ' points'

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        options = self._options
        color = _option_get(
            options, 'rgbcolor', _option_get(options, 'color', [0, 0, 1]))
        line_style = _native_record(
            color=_color_value(color),
            width=float(_option_get(options, 'thickness', 1)),
            dash=_dash_value(str(_option_get(options, 'linestyle', '-'))),
        )
        legend_label = _option_get(options, 'legend_label')
        trace = _native_record(
            type='scatter',
            mode='lines',
            x=self.xdata,
            y=self.ydata,
            line=line_style,
            opacity=float(_option_get(options, 'alpha', 1)),
            showlegend=legend_label is not None,
        )
        if legend_label is not None:
            runtime.reflect.set(trace, 'name', str(legend_label))
        if _option_has(options, 'zorder'):
            runtime.reflect.set(
                trace, 'legendrank', int(_option_get(options, 'zorder')))
        return trace


@runtime.sequence_class
class Point(GraphicPrimitive):
    """A set of two-dimensional points."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)

    def __len__(self) -> int:
        return len(self.xdata)

    def __getitem__(self, index: int) -> tuple[float, float]:
        return runtime.math_tuple(
            [self.xdata[index], self.ydata[index]])

    def __repr__(self) -> str:
        return (
            'Point set defined by ' + str(len(self.xdata)) + ' point(s)'
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_trace(self) -> Any:
        options = self._options
        color = _option_get(
            options, 'rgbcolor', _option_get(options, 'color', [0, 0, 1]))
        marker = _native_record(
            color=_color_value(color),
            size=float(_option_get(options, 'size', 10)),
            symbol=str(_option_get(options, 'marker', 'circle')),
        )
        if _option_has(options, 'markeredgecolor'):
            runtime.reflect.set(
                marker,
                'line',
                _native_record(
                    color=_color_value(
                        _option_get(options, 'markeredgecolor')),
                    width=1,
                ),
            )
        legend_label = _option_get(options, 'legend_label')
        trace = _native_record(
            type='scatter',
            mode='markers',
            x=self.xdata,
            y=self.ydata,
            marker=marker,
            opacity=float(_option_get(options, 'alpha', 1)),
            showlegend=legend_label is not None,
        )
        if legend_label is not None:
            runtime.reflect.set(trace, 'name', str(legend_label))
        return trace


@runtime.sequence_class
class Graphics:
    """A composable collection of semantic graphics primitives."""

    def __init__(self) -> None:
        self._objects: list[GraphicPrimitive] = []
        self._extra_kwds: dict[str, Any] = {}
        self._show_legend = False

    def __len__(self) -> int:
        return len(self._objects)

    def __iter__(self) -> Iterator[GraphicPrimitive]:
        return iter(self._objects)

    def __getitem__(self, index: int) -> GraphicPrimitive:
        return self._objects[index]

    def __repr__(self) -> str:
        count = len(self._objects)
        noun = 'primitive' if count == 1 else 'primitives'
        return (
            'Graphics object consisting of ' + str(count) +
            ' graphics ' + noun
        )

    __str__ = __repr__
    toString = __repr__

    def add_primitive(self, primitive: GraphicPrimitive) -> None:
        self._objects.append(primitive)
        if _option_get(primitive.options(), 'legend_label') is not None:
            self._show_legend = True

    def set_extra_kwds(self, keywords: dict[str, Any]) -> None:
        for key in keywords:
            self._extra_kwds[key] = keywords[key]

    def get_extra_kwds(self) -> dict[str, Any]:
        return _copy_options(self._extra_kwds)

    def legend(self, show: Any = None) -> bool:
        if show is None:
            return self._show_legend
        self._show_legend = bool(show)
        return self._show_legend

    def set_aspect_ratio(self, ratio: Any) -> None:
        if ratio in ('auto', 'automatic'):
            self._extra_kwds['aspect_ratio'] = 'automatic'
            return
        numeric_ratio = float(ratio)
        if numeric_ratio <= 0:
            raise ValueError(
                "the aspect ratio must be positive or 'automatic'")
        self._extra_kwds['aspect_ratio'] = numeric_ratio

    def aspect_ratio(self) -> Any:
        return _option_get(
            self._extra_kwds, 'aspect_ratio', 'automatic')

    def __add__(self, other: object) -> Graphics:
        if not isinstance(other, Graphics):
            raise TypeError('can only add Graphics to Graphics')
        answer = Graphics()
        answer._objects = self._objects + other._objects
        answer.set_extra_kwds(self._extra_kwds)
        answer.set_extra_kwds(other._extra_kwds)
        answer._show_legend = self._show_legend or other._show_legend
        return answer

    def __radd__(self, other: object) -> Graphics:
        if other == 0:
            return self
        if isinstance(other, Graphics):
            return other + self
        raise TypeError('can only add Graphics to Graphics')

    def _plotly_layout(self) -> Any:
        options = self._extra_kwds
        xaxis = _native_object()
        yaxis = _native_object()
        layout = _native_record(
            autosize=True,
            showlegend=self._show_legend,
            xaxis=xaxis,
            yaxis=yaxis,
        )
        title = _option_get(options, 'title')
        if title is not None:
            runtime.reflect.set(
                layout, 'title', _native_record(text=str(title)))

        axes_labels = _option_get(options, 'axes_labels')
        if isinstance(axes_labels, (list, tuple)) and len(axes_labels) == 2:
            runtime.reflect.set(
                xaxis, 'title', _native_record(text=str(axes_labels[0])))
            runtime.reflect.set(
                yaxis, 'title', _native_record(text=str(axes_labels[1])))

        if _option_has(options, 'xmin') or _option_has(options, 'xmax'):
            runtime.reflect.set(
                xaxis,
                'range',
                [
                    (
                        None
                        if _option_get(options, 'xmin') is None
                        else float(_option_get(options, 'xmin'))
                    ),
                    (
                        None
                        if _option_get(options, 'xmax') is None
                        else float(_option_get(options, 'xmax'))
                    ),
                ],
            )
        if _option_has(options, 'ymin') or _option_has(options, 'ymax'):
            runtime.reflect.set(
                yaxis,
                'range',
                [
                    (
                        None
                        if _option_get(options, 'ymin') is None
                        else float(_option_get(options, 'ymin'))
                    ),
                    (
                        None
                        if _option_get(options, 'ymax') is None
                        else float(_option_get(options, 'ymax'))
                    ),
                ],
            )

        axes = bool(_option_get(options, 'axes', True))
        runtime.reflect.set(xaxis, 'visible', axes)
        runtime.reflect.set(yaxis, 'visible', axes)
        if bool(_option_get(options, 'gridlines', False)):
            runtime.reflect.set(xaxis, 'showgrid', True)
            runtime.reflect.set(yaxis, 'showgrid', True)

        scale = str(_option_get(options, 'scale', 'linear'))
        if scale in ('loglog', 'semilogx'):
            runtime.reflect.set(xaxis, 'type', 'log')
        if scale in ('loglog', 'semilogy'):
            runtime.reflect.set(yaxis, 'type', 'log')

        ratio = _option_get(options, 'aspect_ratio', 'automatic')
        if ratio not in ('auto', 'automatic'):
            runtime.reflect.set(
                yaxis,
                'scaleanchor',
                'x',
            )
            runtime.reflect.set(yaxis, 'scaleratio', float(ratio))
        return layout

    def _rich_repr_(self) -> Any:
        traces = [
            primitive._plotly_trace()
            for primitive in self._objects
        ]
        figure = _native_record(
            data=traces,
            layout=self._plotly_layout(),
            config=_native_record(
                displaylogo=False,
                responsive=True,
            ),
        )
        return _native_record(mime=_PLOTLY_MIME, data=figure)


def _graphics_options(options: dict[str, Any]) -> dict[str, Any]:
    answer = {}
    for name in _GRAPHICS_OPTION_NAMES:
        if _option_has(options, name):
            answer[name] = _option_pop(options, name)
    return answer


def line(points: Any, **options: Any) -> Graphics:
    """Return a graphics object containing a line through ``points``."""
    options = _copy_options(options)
    normalized = _normalize_points(points)
    defaults = {
        'alpha': 1,
        'rgbcolor': [0, 0, 1],
        'thickness': 1,
        'legend_label': None,
        'linestyle': '-',
    }
    if _option_has(options, 'color') and not _option_has(options, 'rgbcolor'):
        options['rgbcolor'] = _option_pop(options, 'color')
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Line(
            [value[0] for value in normalized],
            [value[1] for value in normalized],
            defaults,
        )
    )
    return graphic


def point(points: Any, **options: Any) -> Graphics:
    """Return a graphics object containing one or more points."""
    options = _copy_options(options)
    normalized = _normalize_points(points)
    defaults = {
        'alpha': 1,
        'rgbcolor': [0, 0, 1],
        'size': 10,
        'legend_label': None,
        'marker': 'circle',
    }
    if _option_has(options, 'color') and not _option_has(options, 'rgbcolor'):
        options['rgbcolor'] = _option_pop(options, 'color')
    _option_update(defaults, options)
    graphics_options = _graphics_options(defaults)
    graphic = Graphics()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Point(
            [value[0] for value in normalized],
            [value[1] for value in normalized],
            defaults,
        )
    )
    return graphic


def _finite_value(value: Any) -> float:
    numeric = float(value)
    if not runtime.number.isFinite(numeric):
        raise ValueError('plot function returned a non-finite value')
    return numeric


def _evaluate_plot_function(
    func: Callable[[float], Any],
    x_value: float,
) -> tuple[float, float] | None:
    try:
        return x_value, _finite_value(func(x_value))
    except Exception:
        return None


def _adaptive_refinement(
    func: Callable[[float], Any],
    left: tuple[float, float],
    right: tuple[float, float],
    tolerance: float,
    recursion: int,
    level: int = 0,
) -> list[tuple[float, float]]:
    if level >= recursion:
        return []
    midpoint_x = (left[0] + right[0]) / 2.0
    midpoint = _evaluate_plot_function(func, midpoint_x)
    if midpoint is None:
        return []
    linear_midpoint = (left[1] + right[1]) / 2.0
    if abs(linear_midpoint - midpoint[1]) <= tolerance:
        return []
    return (
        _adaptive_refinement(
            func,
            left,
            midpoint,
            tolerance,
            recursion,
            level + 1,
        )
        + [midpoint]
        + _adaptive_refinement(
            func,
            midpoint,
            right,
            tolerance,
            recursion,
            level + 1,
        )
    )


def generate_plot_points(
    func: Callable[[float], Any],
    xrange: Sequence[Any],
    plot_points: int = 5,
    adaptive_tolerance: float = 0.01,
    adaptive_recursion: int = 5,
    randomize: bool = True,
    initial_points: Sequence[Any] | None = None,
) -> list[tuple[float, float]]:
    """Sample a callable using Sage's uniform-plus-adaptive strategy."""
    if len(xrange) != 2:
        raise ValueError('plot range must contain exactly two endpoints')
    xmin = float(xrange[0])
    xmax = float(xrange[1])
    count = int(plot_points)
    if count < 2:
        raise ValueError('plot_points must be at least 2')
    if xmax <= xmin:
        raise ValueError('plot range must have xmin < xmax')

    delta = (xmax - xmin) / float(count - 1)
    x_values = [xmin + delta * index for index in range(count)]
    x_values[count - 1] = xmax
    if randomize:
        for index in range(1, count - 1):
            x_values[index] += delta * (runtime.math.random() - 0.5)
    if initial_points is not None:
        for initial in initial_points:
            numeric_initial = float(initial)
            if xmin <= numeric_initial <= xmax:
                x_values.append(numeric_initial)
        x_values.sort()

    data = []
    for index in range(len(x_values)):
        evaluated = _evaluate_plot_function(func, x_values[index])
        if evaluated is not None:
            data.append(evaluated)
            continue

        # Match Sage's helpful endpoint behavior: move slightly inward when
        # a function is undefined exactly at a boundary.
        if index in (0, len(x_values) - 1):
            direction = 1 if index == 0 else -1
            for attempt in range(1, 99):
                moved = x_values[index] + direction * delta * attempt / 100.0
                evaluated = _evaluate_plot_function(func, moved)
                if evaluated is not None:
                    data.append(evaluated)
                    break

    tolerance = abs(delta * float(adaptive_tolerance))
    recursion = int(adaptive_recursion)
    index = 0
    while index < len(data) - 1:
        refined = _adaptive_refinement(
            func,
            data[index],
            data[index + 1],
            tolerance,
            recursion,
        )
        if len(refined):
            data[index + 1:index + 1] = refined
            index += len(refined)
        index += 1
    return data


def _plot_range(range_args: Sequence[Any]) -> tuple[float, float]:
    if len(range_args) == 0:
        return -1.0, 1.0
    if len(range_args) == 1:
        values = list(range_args[0])
        if len(values) == 2:
            return float(values[0]), float(values[1])
        if len(values) == 3:
            return float(values[1]), float(values[2])
    if len(range_args) == 2:
        return float(range_args[0]), float(range_args[1])
    if len(range_args) == 3:
        return float(range_args[1]), float(range_args[2])
    raise TypeError('invalid plot range')


def _plot_variable(range_args: Sequence[Any]) -> Any:
    if len(range_args) == 1:
        values = list(range_args[0])
        if len(values) == 3:
            return values[0]
    if len(range_args) == 3:
        return range_args[0]
    return None


def plot(
    funcs: Any,
    *range_args: Any,
    **options: Any,
) -> Graphics:
    """Plot a callable, or a list of callables, over a real interval."""
    options = _copy_options(options)
    xmin, xmax = _plot_range(range_args)
    plot_variable = _plot_variable(range_args)
    plot_points = int(_option_pop(options, 'plot_points', 200))
    adaptive_tolerance = float(
        _option_pop(options, 'adaptive_tolerance', 0.01))
    adaptive_recursion = int(
        _option_pop(options, 'adaptive_recursion', 5))
    randomize = bool(_option_pop(options, 'randomize', True))
    initial_points = _option_pop(options, 'initial_points', None)

    if isinstance(funcs, (list, tuple)):
        functions = list(funcs)
    else:
        functions = [funcs]
    answer = Graphics()
    graphics_options = _graphics_options(options)
    answer.set_extra_kwds(graphics_options)
    colors = _option_pop(
        options, 'color', _option_pop(options, 'rgbcolor', None))
    if (
        isinstance(colors, (list, tuple))
        and len(colors)
        and isinstance(colors[0], (list, tuple, str))
    ):
        color_values = list(colors)
    else:
        color_values = [colors]

    for index in range(len(functions)):
        current = functions[index]
        if (
            not callable(current)
            and hasattr(current, '_plot_fast_callable')
        ):
            if plot_variable is None:
                variables = current.variables()
                if len(variables) != 1:
                    raise ValueError(
                        'plot() needs a variable for this symbolic expression')
                plot_variable = variables[0]
            current = current._plot_fast_callable(plot_variable)
        if not callable(current):
            raise TypeError('plot() requires a callable function')
        points = generate_plot_points(
            current,
            (xmin, xmax),
            plot_points=plot_points,
            adaptive_tolerance=adaptive_tolerance,
            adaptive_recursion=adaptive_recursion,
            randomize=randomize,
            initial_points=initial_points,
        )
        line_options = _copy_options(options)
        color_value = color_values[index % len(color_values)]
        if color_value is not None:
            line_options['rgbcolor'] = color_value
        answer = answer + line(points, **line_options)
    answer.set_extra_kwds(graphics_options)
    return answer


def list_plot(
    data: Any,
    plotjoined: bool = False,
    **options: Any,
) -> Graphics:
    """Plot a sequence of y-values or a sequence of ``(x, y)`` pairs."""
    options = _copy_options(options)
    values = list(data)
    if len(values) == 0:
        return Graphics()
    if isinstance(values[0], (list, tuple)):
        points = [_point_pair(value) for value in values]
    else:
        points = [
            (float(index), float(values[index]))
            for index in range(len(values))
        ]
    if plotjoined:
        return line(points, **options)
    return point(points, **options)
