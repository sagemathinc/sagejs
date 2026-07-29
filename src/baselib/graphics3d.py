# Sage-compatible three-dimensional graphics objects rendered with Plotly.
#
# The public API and object model follow SageMath's sage.plot.plot3d package.
# This first slice uses deterministic rectangular sampling; the semantic
# objects remain independent of Plotly so other renderers can be added later.
#
# Copyright (C) 2007-2026 SageMath contributors
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Iterator, Sequence

import sagejs.runtime as runtime

_GRAPHICS3D_PLOTLY_MIME = 'application/vnd.plotly.v1+json'
_GRAPHICS3D_OPTION_NAMES = [
    'aspect_ratio',
    'axes',
    'axes_labels',
    'figsize',
    'frame',
    'title',
]
_SPHERE_DEFAULT_CENTER = (0, 0, 0)


def _g3d_native_object() -> Any:
    return runtime.object.create(None)


def _g3d_native_record(**values: Any) -> Any:
    answer = _g3d_native_object()
    for key in runtime.object.keys(values):
        runtime.reflect.set(
            answer, key, runtime.reflect.get(values, key))
    return answer


def _g3d_copy_options(options: Any) -> dict[str, Any]:
    answer = {}
    items_method = runtime.reflect.get(options, 'items')
    if runtime.jstype(items_method) == 'function':
        for pair in options.items():
            answer[pair[0]] = pair[1]
        return answer
    for key in runtime.object.keys(options):
        answer[key] = runtime.reflect.get(options, key)
    return answer


def _g3d_option_has(options: Any, name: str) -> bool:
    return runtime.reflect.apply(
        runtime.object.prototype.hasOwnProperty,
        options,
        [name],
    )


def _g3d_option_get(
    options: Any,
    name: str,
    default_value: Any = None,
) -> Any:
    if _g3d_option_has(options, name):
        return runtime.reflect.get(options, name)
    return default_value


def _g3d_option_pop(
    options: Any,
    name: str,
    default_value: Any = None,
) -> Any:
    if not _g3d_option_has(options, name):
        return default_value
    value = runtime.reflect.get(options, name)
    runtime.reflect.deleteProperty(options, name)
    return value


def _g3d_option_update(target: Any, source: Any) -> None:
    for name in runtime.object.keys(source):
        runtime.reflect.set(
            target, name, runtime.reflect.get(source, name))


def _g3d_color_value(color: Any) -> str:
    if isinstance(color, str):
        return color
    if isinstance(color, (list, tuple)) and len(color) in (3, 4):
        components = []
        for value in color:
            component = max(0.0, min(1.0, float(value)))
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


def _g3d_colorscale(color: Any) -> Any:
    if (
        isinstance(color, (list, tuple))
        and len(color) > 0
        and isinstance(color[0], str)
    ):
        if len(color) == 1:
            colors = [color[0], color[0]]
        else:
            colors = list(color)
        answer = []
        denominator = float(len(colors) - 1)
        for index in range(len(colors)):
            answer.append([
                float(index) / denominator,
                _g3d_color_value(colors[index]),
            ])
        return answer
    normalized = _g3d_color_value(color)
    return [[0, normalized], [1, normalized]]


def _g3d_point(value: Any) -> tuple[float, float, float]:
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError('points must have exactly three coordinates')
    return float(value[0]), float(value[1]), float(value[2])


def _g3d_normalize_points(
    points: Any,
) -> list[tuple[float, float, float]]:
    values = list(points)
    if (
        len(values) == 3
        and not isinstance(values[0], (list, tuple))
        and not isinstance(values[1], (list, tuple))
        and not isinstance(values[2], (list, tuple))
    ):
        values = [values]
    return [_g3d_point(value) for value in values]


def _g3d_graphics_options(
    options: dict[str, Any],
) -> dict[str, Any]:
    answer = {}
    for name in _GRAPHICS3D_OPTION_NAMES:
        if _g3d_option_has(options, name):
            answer[name] = _g3d_option_pop(options, name)
    return answer


def _g3d_range(value: Any) -> tuple[Any, float, float]:
    values = list(value)
    if len(values) == 2:
        variable = None
        minimum = float(values[0])
        maximum = float(values[1])
    elif len(values) == 3:
        variable = values[0]
        minimum = float(values[1])
        maximum = float(values[2])
    else:
        raise ValueError(
            'plot range must contain two endpoints or a variable and two endpoints'
        )
    if maximum <= minimum:
        raise ValueError('plot range must have minimum < maximum')
    return variable, minimum, maximum


def _g3d_plot_points(
    value: Any,
    default_value: int,
    dimensions: int,
) -> list[int]:
    if value in ('automatic', None):
        values = [default_value for _index in range(dimensions)]
    elif isinstance(value, (list, tuple)):
        values = [int(item) for item in value]
        if len(values) != dimensions:
            raise ValueError(
                'plot_points must have one entry for each parameter')
    else:
        values = [int(value) for _index in range(dimensions)]
    for count in values:
        if count < 2:
            raise ValueError('plot_points must be at least 2')
    return values


def _g3d_linspace(
    minimum: float,
    maximum: float,
    count: int,
) -> list[float]:
    delta = (maximum - minimum) / float(count - 1)
    values = [
        minimum + delta * index
        for index in range(count)
    ]
    values[count - 1] = maximum
    return values


def _g3d_finite_value(value: Any) -> float:
    numeric = float(value)
    if not runtime.number.isFinite(numeric):
        raise ValueError('3D plot function returned a non-finite value')
    return numeric


def _g3d_component_callable(
    component: Any,
    variables: Sequence[Any],
) -> Any:
    if hasattr(component, '_plot_fast_callable'):
        return component._plot_fast_callable(list(variables))
    if callable(component):
        return component
    numeric = _g3d_finite_value(component)

    def constant(*_arguments: Any) -> float:
        return numeric

    return constant


def _g3d_variables(
    components: Sequence[Any],
    range_variables: Sequence[Any],
    dimensions: int,
) -> list[Any]:
    specified = [
        variable
        for variable in range_variables
        if variable is not None
    ]
    if len(specified) not in (0, dimensions):
        raise ValueError(
            'specify variables in every 3D plot range or in none of them')
    if len(specified) == dimensions:
        names = [str(variable) for variable in specified]
        if len(set(names)) != dimensions:
            raise ValueError('range variables must be distinct')
        return specified

    discovered = []
    seen = {}
    for component in components:
        if not hasattr(component, 'variables'):
            continue
        for variable in component.variables():
            name = str(variable)
            if name not in seen:
                seen[name] = True
                discovered.append(variable)
    if len(discovered) > dimensions:
        raise ValueError(
            '3D plot expression has more variables than plot ranges')
    return discovered


class GraphicPrimitive3d:
    """Base class for a semantic three-dimensional graphics primitive."""

    def __init__(self, options: dict[str, Any]) -> None:
        self._options = _g3d_copy_options(options)

    def options(self) -> dict[str, Any]:
        return _g3d_copy_options(self._options)

    def _plotly_traces(self) -> list[Any]:
        raise NotImplementedError(
            '3D graphics primitive has no Plotly renderer')

    def __repr__(self) -> str:
        return '3D graphics primitive'

    __str__ = __repr__
    toString = __repr__


@runtime.sequence_class
class Line3d(GraphicPrimitive3d):
    """A line through a sequence of three-dimensional points."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        zdata: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)
        self.zdata = list(zdata)

    def __len__(self) -> int:
        return len(self.xdata)

    def __getitem__(self, index: int) -> tuple[float, float, float]:
        return runtime.math_tuple([
            self.xdata[index],
            self.ydata[index],
            self.zdata[index],
        ])

    def __repr__(self) -> str:
        return '3D line defined by ' + str(len(self.xdata)) + ' points'

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        color = _g3d_option_get(
            options, 'rgbcolor',
            _g3d_option_get(options, 'color', [0, 0, 1]))
        legend_label = _g3d_option_get(options, 'legend_label')
        trace = _g3d_native_record(
            type='scatter3d',
            mode='lines',
            x=self.xdata,
            y=self.ydata,
            z=self.zdata,
            line=_g3d_native_record(
                color=_g3d_color_value(color),
                width=float(_g3d_option_get(options, 'thickness', 2)),
            ),
            opacity=float(_g3d_option_get(options, 'opacity', 1)),
            showlegend=legend_label is not None,
        )
        if legend_label is not None:
            runtime.reflect.set(trace, 'name', str(legend_label))
        return [trace]


@runtime.sequence_class
class Point3d(GraphicPrimitive3d):
    """One or more points in three-dimensional space."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        zdata: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)
        self.zdata = list(zdata)

    def __len__(self) -> int:
        return len(self.xdata)

    def __getitem__(self, index: int) -> tuple[float, float, float]:
        return runtime.math_tuple([
            self.xdata[index],
            self.ydata[index],
            self.zdata[index],
        ])

    def __repr__(self) -> str:
        return (
            '3D point set defined by ' +
            str(len(self.xdata)) + ' point(s)'
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        color = _g3d_option_get(
            options, 'rgbcolor',
            _g3d_option_get(options, 'color', [0, 0, 1]))
        legend_label = _g3d_option_get(options, 'legend_label')
        trace = _g3d_native_record(
            type='scatter3d',
            mode='markers',
            x=self.xdata,
            y=self.ydata,
            z=self.zdata,
            marker=_g3d_native_record(
                color=_g3d_color_value(color),
                size=float(_g3d_option_get(options, 'size', 5)),
                symbol=str(_g3d_option_get(
                    options, 'marker', 'circle')),
            ),
            opacity=float(_g3d_option_get(options, 'opacity', 1)),
            showlegend=legend_label is not None,
        )
        if legend_label is not None:
            runtime.reflect.set(trace, 'name', str(legend_label))
        return [trace]


class Surface3d(GraphicPrimitive3d):
    """A rectangular sampled parametric surface."""

    def __init__(
        self,
        xdata: Sequence[Sequence[float]],
        ydata: Sequence[Sequence[float]],
        zdata: Sequence[Sequence[float]],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.xdata = [list(row) for row in xdata]
        self.ydata = [list(row) for row in ydata]
        self.zdata = [list(row) for row in zdata]

    def __repr__(self) -> str:
        rows = len(self.zdata)
        columns = 0 if rows == 0 else len(self.zdata[0])
        return (
            '3D surface defined by a ' + str(rows) + ' x ' +
            str(columns) + ' grid'
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        color = _g3d_option_get(options, 'color', 'steelblue')
        legend_label = _g3d_option_get(options, 'legend_label')
        trace = _g3d_native_record(
            type='surface',
            x=self.xdata,
            y=self.ydata,
            z=self.zdata,
            colorscale=_g3d_colorscale(color),
            showscale=bool(_g3d_option_get(options, 'colorbar', False)),
            opacity=float(_g3d_option_get(options, 'opacity', 1)),
            showlegend=legend_label is not None,
        )
        if legend_label is not None:
            runtime.reflect.set(trace, 'name', str(legend_label))
        if bool(_g3d_option_get(options, 'mesh', False)):
            runtime.reflect.set(
                trace,
                'contours',
                _g3d_native_record(
                    x=_g3d_native_record(
                        show=True,
                        highlight=False,
                        color=_g3d_color_value(
                            _g3d_option_get(
                                options, 'mesh_color', 'black')),
                    ),
                    y=_g3d_native_record(
                        show=True,
                        highlight=False,
                        color=_g3d_color_value(
                            _g3d_option_get(
                                options, 'mesh_color', 'black')),
                    ),
                ),
            )
        traces = [trace]
        if bool(_g3d_option_get(options, 'dots', False)):
            flat_x = []
            flat_y = []
            flat_z = []
            for row_index in range(len(self.xdata)):
                for column_index in range(len(self.xdata[row_index])):
                    flat_x.append(self.xdata[row_index][column_index])
                    flat_y.append(self.ydata[row_index][column_index])
                    flat_z.append(self.zdata[row_index][column_index])
            traces.append(_g3d_native_record(
                type='scatter3d',
                mode='markers',
                x=flat_x,
                y=flat_y,
                z=flat_z,
                marker=_g3d_native_record(
                    color=_g3d_color_value(
                        _g3d_option_get(
                            options, 'dot_color', 'black')),
                    size=float(_g3d_option_get(
                        options, 'dot_size', 2)),
                ),
                opacity=float(_g3d_option_get(options, 'opacity', 1)),
                showlegend=False,
            ))
        return traces


@runtime.sequence_class
class Graphics3d:
    """A composable collection of semantic 3D graphics primitives."""

    def __init__(self) -> None:
        self._objects: list[GraphicPrimitive3d] = []
        self._extra_kwds: dict[str, Any] = {}
        self._show_legend = False

    def __len__(self) -> int:
        return len(self._objects)

    def __iter__(self) -> Iterator[GraphicPrimitive3d]:
        return iter(self._objects)

    def __getitem__(self, index: int) -> GraphicPrimitive3d:
        return self._objects[index]

    def __repr__(self) -> str:
        return 'Graphics3d Object'

    __str__ = __repr__
    toString = __repr__

    def add_primitive(self, primitive: GraphicPrimitive3d) -> None:
        self._objects.append(primitive)
        if _g3d_option_get(
            primitive.options(), 'legend_label') is not None:
            self._show_legend = True

    def set_extra_kwds(self, keywords: dict[str, Any]) -> None:
        for key in keywords:
            self._extra_kwds[key] = keywords[key]

    def get_extra_kwds(self) -> dict[str, Any]:
        return _g3d_copy_options(self._extra_kwds)

    def __add__(self, other: object) -> Graphics3d:
        if not isinstance(other, Graphics3d):
            raise TypeError('can only add Graphics3d to Graphics3d')
        answer = Graphics3d()
        answer._objects = self._objects + other._objects
        answer.set_extra_kwds(self._extra_kwds)
        answer.set_extra_kwds(other._extra_kwds)
        answer._show_legend = self._show_legend or other._show_legend
        return answer

    def __radd__(self, other: object) -> Graphics3d:
        if other == 0:
            return self
        if isinstance(other, Graphics3d):
            return other + self
        raise TypeError('can only add Graphics3d to Graphics3d')

    def _plotly_layout(self) -> Any:
        options = self._extra_kwds
        xaxis = _g3d_native_object()
        yaxis = _g3d_native_object()
        zaxis = _g3d_native_object()
        scene = _g3d_native_record(
            xaxis=xaxis,
            yaxis=yaxis,
            zaxis=zaxis,
            dragmode='orbit',
        )
        layout = _g3d_native_record(
            autosize=True,
            showlegend=self._show_legend,
            scene=scene,
        )
        title = _g3d_option_get(options, 'title')
        if title is not None:
            runtime.reflect.set(
                layout, 'title', _g3d_native_record(text=str(title)))

        axes_labels = _g3d_option_get(options, 'axes_labels')
        if (
            isinstance(axes_labels, (list, tuple))
            and len(axes_labels) == 3
        ):
            runtime.reflect.set(
                xaxis, 'title',
                _g3d_native_record(text=str(axes_labels[0])))
            runtime.reflect.set(
                yaxis, 'title',
                _g3d_native_record(text=str(axes_labels[1])))
            runtime.reflect.set(
                zaxis, 'title',
                _g3d_native_record(text=str(axes_labels[2])))

        visible = bool(_g3d_option_get(
            options,
            'frame',
            _g3d_option_get(options, 'axes', True),
        ))
        for axis in (xaxis, yaxis, zaxis):
            runtime.reflect.set(axis, 'visible', visible)

        ratio = _g3d_option_get(options, 'aspect_ratio', 'automatic')
        if ratio in ('auto', 'automatic'):
            runtime.reflect.set(scene, 'aspectmode', 'data')
        elif isinstance(ratio, (list, tuple)):
            if len(ratio) != 3:
                raise ValueError(
                    '3D aspect_ratio must have exactly three entries')
            runtime.reflect.set(scene, 'aspectmode', 'manual')
            runtime.reflect.set(
                scene,
                'aspectratio',
                _g3d_native_record(
                    x=float(ratio[0]),
                    y=float(ratio[1]),
                    z=float(ratio[2]),
                ),
            )
        else:
            numeric_ratio = float(ratio)
            runtime.reflect.set(scene, 'aspectmode', 'manual')
            runtime.reflect.set(
                scene,
                'aspectratio',
                _g3d_native_record(
                    x=1,
                    y=1,
                    z=numeric_ratio,
                ),
            )

        figsize = _g3d_option_get(options, 'figsize')
        if isinstance(figsize, (list, tuple)) and len(figsize) == 2:
            runtime.reflect.set(layout, 'width', int(float(figsize[0]) * 80))
            runtime.reflect.set(layout, 'height', int(float(figsize[1]) * 80))
        return layout

    def _rich_repr_(self) -> Any:
        traces = []
        for primitive in self._objects:
            traces += primitive._plotly_traces()
        figure = _g3d_native_record(
            data=traces,
            layout=self._plotly_layout(),
            config=_g3d_native_record(
                displaylogo=False,
                responsive=True,
            ),
        )
        return _g3d_native_record(
            mime=_GRAPHICS3D_PLOTLY_MIME,
            data=figure,
        )


def line3d(points: Any, **options: Any) -> Graphics3d:
    """Return a line through three-dimensional ``points``."""
    options = _g3d_copy_options(options)
    normalized = _g3d_normalize_points(points)
    defaults = {
        'opacity': 1,
        'rgbcolor': [0, 0, 1],
        'thickness': 2,
        'legend_label': None,
    }
    if (
        _g3d_option_has(options, 'alpha')
        and not _g3d_option_has(options, 'opacity')
    ):
        options['opacity'] = _g3d_option_pop(options, 'alpha')
    if (
        _g3d_option_has(options, 'color')
        and not _g3d_option_has(options, 'rgbcolor')
    ):
        options['rgbcolor'] = _g3d_option_pop(options, 'color')
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Line3d(
        [value[0] for value in normalized],
        [value[1] for value in normalized],
        [value[2] for value in normalized],
        defaults,
    ))
    return graphic


def point3d(points: Any, **options: Any) -> Graphics3d:
    """Return one or more points in three-dimensional space."""
    options = _g3d_copy_options(options)
    normalized = _g3d_normalize_points(points)
    defaults = {
        'opacity': 1,
        'rgbcolor': [0, 0, 1],
        'size': 5,
        'legend_label': None,
        'marker': 'circle',
    }
    if (
        _g3d_option_has(options, 'alpha')
        and not _g3d_option_has(options, 'opacity')
    ):
        options['opacity'] = _g3d_option_pop(options, 'alpha')
    if (
        _g3d_option_has(options, 'color')
        and not _g3d_option_has(options, 'rgbcolor')
    ):
        options['rgbcolor'] = _g3d_option_pop(options, 'color')
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Point3d(
        [value[0] for value in normalized],
        [value[1] for value in normalized],
        [value[2] for value in normalized],
        defaults,
    ))
    return graphic


def _g3d_surface(
    components: Sequence[Any],
    urange: Any,
    vrange: Any,
    **options: Any,
) -> Graphics3d:
    options = _g3d_copy_options(options)
    uvariable, umin, umax = _g3d_range(urange)
    vvariable, vmin, vmax = _g3d_range(vrange)
    counts = _g3d_plot_points(
        _g3d_option_pop(options, 'plot_points', 'automatic'),
        40,
        2,
    )
    variables = _g3d_variables(
        components,
        [uvariable, vvariable],
        2,
    )
    functions = [
        _g3d_component_callable(component, variables)
        for component in components
    ]
    uvalues = _g3d_linspace(umin, umax, counts[0])
    vvalues = _g3d_linspace(vmin, vmax, counts[1])
    xdata = []
    ydata = []
    zdata = []
    for vvalue in vvalues:
        xrow = []
        yrow = []
        zrow = []
        for uvalue in uvalues:
            xrow.append(_g3d_finite_value(
                functions[0](uvalue, vvalue)))
            yrow.append(_g3d_finite_value(
                functions[1](uvalue, vvalue)))
            zrow.append(_g3d_finite_value(
                functions[2](uvalue, vvalue)))
        xdata.append(xrow)
        ydata.append(yrow)
        zdata.append(zrow)

    defaults = {
        'color': 'steelblue',
        'opacity': 1,
        'mesh': False,
        'dots': False,
        'legend_label': None,
    }
    if (
        _g3d_option_has(options, 'alpha')
        and not _g3d_option_has(options, 'opacity')
    ):
        options['opacity'] = _g3d_option_pop(options, 'alpha')
    if (
        _g3d_option_has(options, 'rgbcolor')
        and not _g3d_option_has(options, 'color')
    ):
        options['color'] = _g3d_option_pop(options, 'rgbcolor')
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Surface3d(xdata, ydata, zdata, defaults))
    return graphic


def plot3d(
    func: Any,
    urange: Any,
    vrange: Any,
    adaptive: bool = False,
    transformation: Any = None,
    **options: Any,
) -> Graphics3d:
    """Plot a function of two variables as a three-dimensional surface."""
    if adaptive:
        raise NotImplementedError(
            'adaptive plot3d refinement is not implemented yet')
    if transformation is not None:
        raise NotImplementedError(
            'plot3d coordinate transformations are not implemented yet')
    uvariable, _umin, _umax = _g3d_range(urange)
    vvariable, _vmin, _vmax = _g3d_range(vrange)
    variables = _g3d_variables(
        [func],
        [uvariable, vvariable],
        2,
    )
    evaluated = _g3d_component_callable(func, variables)

    def first_coordinate(u: float, _v: float) -> float:
        return u

    def second_coordinate(_u: float, v: float) -> float:
        return v

    return _g3d_surface(
        (
            first_coordinate,
            second_coordinate,
            evaluated
        ),
        urange,
        vrange,
        **options,
    )


def parametric_plot3d(
    functions: Sequence[Any],
    urange: Any,
    vrange: Any = None,
    plot_points: Any = 'automatic',
    **options: Any,
) -> Graphics3d:
    """Plot a parametric space curve or parametric surface."""
    components = list(functions)
    if len(components) != 3:
        raise ValueError(
            'parametric_plot3d requires exactly three components')
    if vrange is not None:
        options['plot_points'] = plot_points
        return _g3d_surface(
            components,
            urange,
            vrange,
            **options,
        )

    variable, minimum, maximum = _g3d_range(urange)
    variables = _g3d_variables(components, [variable], 1)
    callables = [
        _g3d_component_callable(component, variables)
        for component in components
    ]
    count = _g3d_plot_points(plot_points, 75, 1)[0]
    values = _g3d_linspace(minimum, maximum, count)
    points = []
    for value in values:
        points.append((
            _g3d_finite_value(callables[0](value)),
            _g3d_finite_value(callables[1](value)),
            _g3d_finite_value(callables[2](value))
        ))
    return line3d(points, **options)


def sphere(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a sphere of radius ``size`` centered at ``center``."""
    coordinates = _g3d_point(center)
    radius = float(size)
    if radius <= 0:
        raise ValueError('sphere size must be positive')
    counts = _g3d_plot_points(
        _g3d_option_pop(options, 'plot_points', [32, 17]),
        32,
        2,
    )
    uvalues = _g3d_linspace(
        0.0, 2.0 * runtime.math.PI, counts[0])
    vvalues = _g3d_linspace(
        0.0, runtime.math.PI, counts[1])
    xdata = []
    ydata = []
    zdata = []
    for vvalue in vvalues:
        xrow = []
        yrow = []
        zrow = []
        sine_v = runtime.math.sin(vvalue)
        cosine_v = runtime.math.cos(vvalue)
        for uvalue in uvalues:
            xrow.append(
                coordinates[0] +
                radius * runtime.math.cos(uvalue) * sine_v)
            yrow.append(
                coordinates[1] +
                radius * runtime.math.sin(uvalue) * sine_v)
            zrow.append(coordinates[2] + radius * cosine_v)
        xdata.append(xrow)
        ydata.append(yrow)
        zdata.append(zrow)

    options = _g3d_copy_options(options)
    defaults = {
        'color': 'steelblue',
        'opacity': 1,
        'mesh': False,
        'dots': False,
        'legend_label': None,
        'aspect_ratio': [1, 1, 1],
    }
    if (
        _g3d_option_has(options, 'alpha')
        and not _g3d_option_has(options, 'opacity')
    ):
        options['opacity'] = _g3d_option_pop(options, 'alpha')
    if (
        _g3d_option_has(options, 'rgbcolor')
        and not _g3d_option_has(options, 'color')
    ):
        options['color'] = _g3d_option_pop(options, 'rgbcolor')
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Surface3d(xdata, ydata, zdata, defaults))
    return graphic
