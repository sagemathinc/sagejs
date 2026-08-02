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


def _g3d_parse_figsize(figsize: Any) -> tuple[float, float]:
    """Normalize Sage's ``figsize`` value to dimensions in inches."""
    if isinstance(figsize, (list, tuple)):
        if len(figsize) != 2:
            raise ValueError(
                'figsize should be a positive number or a list of two '
                'positive numbers, not ' + str(figsize))
        width = float(figsize[0])
        height = float(figsize[1])
        if width <= 0 or height <= 0:
            raise ValueError(
                'figsize should be positive numbers, not ' +
                str(width) + ' and ' + str(height))
        return width, height
    width = float(figsize)
    if width <= 0:
        raise ValueError('figsize should be positive, not ' + str(width))
    return width, 0.75 * width


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


class Mesh3d(GraphicPrimitive3d):
    """An indexed collection of polygonal faces in three-space."""

    def __init__(
        self,
        vertices: Sequence[tuple[float, float, float]],
        faces: Sequence[Sequence[int]],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.vertices = list(vertices)
        self.faces = [list(face) for face in faces]

    def __repr__(self) -> str:
        return (
            '3D mesh with ' + str(len(self.vertices)) + ' vertices and ' +
            str(len(self.faces)) + ' faces'
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        xdata = [point[0] for point in self.vertices]
        ydata = [point[1] for point in self.vertices]
        zdata = [point[2] for point in self.vertices]
        triangles_i = []
        triangles_j = []
        triangles_k = []
        face_indices = []
        for face_index in range(len(self.faces)):
            face = self.faces[face_index]
            if len(face) < 3:
                continue
            for index in range(1, len(face) - 1):
                triangles_i.append(int(face[0]))
                triangles_j.append(int(face[index]))
                triangles_k.append(int(face[index + 1]))
                face_indices.append(face_index)
        options = self._options
        color = _g3d_option_get(
            options, 'color',
            _g3d_option_get(options, 'rgbcolor', [0, 0, 1]))
        trace = _g3d_native_record(
            type='mesh3d',
            x=xdata,
            y=ydata,
            z=zdata,
            i=triangles_i,
            j=triangles_j,
            k=triangles_k,
            flatshading=bool(
                _g3d_option_get(options, 'threejs_flat_shading', True)),
            opacity=float(_g3d_option_get(options, 'opacity', 1)),
            showlegend=_g3d_option_get(options, 'legend_label') is not None,
        )
        is_face_colors = (
            isinstance(color, (list, tuple))
            and len(color) > 0
            and isinstance(color[0], (str, list, tuple))
        )
        if is_face_colors:
            colors = list(color)
            runtime.reflect.set(
                trace,
                'facecolor',
                [
                    _g3d_color_value(colors[index % len(colors)])
                    for index in face_indices
                ],
            )
        else:
            runtime.reflect.set(trace, 'color', _g3d_color_value(color))
        legend_label = _g3d_option_get(options, 'legend_label')
        if legend_label is not None:
            runtime.reflect.set(trace, 'name', str(legend_label))
        return [trace]


class Text3d(GraphicPrimitive3d):
    """A text label positioned in three-dimensional coordinates."""

    def __init__(
        self,
        string: str,
        position: tuple[float, float, float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.string = str(string)
        self.position = position

    def __repr__(self) -> str:
        return '3D text "' + self.string + '"'

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        color = _g3d_option_get(options, 'color', [0, 0, 1])
        return [_g3d_native_record(
            type='scatter3d',
            mode='text',
            x=[self.position[0]],
            y=[self.position[1]],
            z=[self.position[2]],
            text=[self.string],
            textfont=_g3d_native_record(
                color=_g3d_color_value(color),
                size=float(_g3d_option_get(options, 'fontsize', 14)),
            ),
            opacity=float(_g3d_option_get(options, 'opacity', 1)),
            showlegend=False,
        )]


class Arrowhead3d(GraphicPrimitive3d):
    """A Plotly cone used as the head of a three-dimensional arrow."""

    def __init__(
        self,
        start: tuple[float, float, float],
        end: tuple[float, float, float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.start = start
        self.end = end

    def _plotly_traces(self) -> list[Any]:
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        dz = self.end[2] - self.start[2]
        length = runtime.math.sqrt(dx * dx + dy * dy + dz * dz)
        if length <= 0:
            return []
        options = self._options
        color = _g3d_option_get(
            options, 'color',
            _g3d_option_get(options, 'rgbcolor', [0, 0, 1]))
        head_length = _g3d_option_get(options, 'head_len')
        if head_length is None:
            head_length = 0.25 * length
        return [_g3d_native_record(
            type='cone',
            x=[self.end[0]],
            y=[self.end[1]],
            z=[self.end[2]],
            u=[dx / length],
            v=[dy / length],
            w=[dz / length],
            anchor='tip',
            sizemode='absolute',
            sizeref=float(head_length),
            colorscale=_g3d_colorscale(color),
            showscale=False,
            opacity=float(_g3d_option_get(options, 'opacity', 1)),
            showlegend=False,
        )]


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


class Isosurface3d(GraphicPrimitive3d):
    """A scalar field sampled on a rectangular three-dimensional grid."""

    def __init__(
        self,
        xdata: Sequence[float],
        ydata: Sequence[float],
        zdata: Sequence[float],
        values: Sequence[float],
        level: float,
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.xdata = list(xdata)
        self.ydata = list(ydata)
        self.zdata = list(zdata)
        self.values = list(values)
        self.level = level

    def __repr__(self) -> str:
        return (
            '3D implicit surface sampled at ' +
            str(len(self.values)) + ' points'
        )

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        tolerance = float(
            _g3d_option_get(options, 'plot_tolerance', 1e-9))
        color = _g3d_option_get(options, 'color', 'steelblue')
        return [_g3d_native_record(
            type='isosurface',
            x=self.xdata,
            y=self.ydata,
            z=self.zdata,
            value=self.values,
            isomin=self.level - tolerance,
            isomax=self.level + tolerance,
            surface=_g3d_native_record(count=1, fill=1),
            caps=_g3d_native_record(
                x=_g3d_native_record(show=False),
                y=_g3d_native_record(show=False),
                z=_g3d_native_record(show=False),
            ),
            colorscale=_g3d_colorscale(color),
            showscale=bool(
                _g3d_option_get(options, 'colorbar', False)),
            opacity=float(
                _g3d_option_get(options, 'opacity', 1)),
            showlegend=False,
        )]


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
        if figsize is not None:
            width, height = _g3d_parse_figsize(figsize)
            runtime.reflect.set(layout, 'width', int(width * 100))
            runtime.reflect.set(layout, 'height', int(height * 100))
        return layout

    def plotly(self) -> Any:
        """Return the renderer-neutral Plotly figure description."""
        traces = []
        for primitive in self._objects:
            traces += primitive._plotly_traces()
        return _g3d_native_record(
            data=traces,
            layout=self._plotly_layout(),
            config=_g3d_native_record(
                displaylogo=False,
                responsive=True,
            ),
        )

    def _rich_repr_(self) -> Any:
        return _g3d_native_record(
            mime=_GRAPHICS3D_PLOTLY_MIME,
            data=self.plotly(),
        )

    def save(
        self,
        filename: Any,
        **options: Any,
    ) -> Graphics3d:
        """Save through the host graphics hook when one is installed."""
        hook = runtime.reflect.get(
            runtime.global_object, '__sagejs_graphics_save_hook__')
        if hook is runtime.undefined:
            raise NotImplementedError(
                'graphics file export is not available in this host')
        runtime.reflect.apply(
            hook,
            runtime.undefined,
            [self, filename, options],
        )
        return self


def line3d(points: Any, **options: Any) -> Graphics3d:
    """Return a line through three-dimensional ``points``."""
    options = _g3d_copy_options(options)
    normalized = _g3d_normalize_points(points)
    arrow_head = bool(_g3d_option_pop(options, 'arrow_head', False))
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
    if arrow_head and len(normalized) >= 2:
        graphic.add_primitive(Arrowhead3d(
            normalized[-2], normalized[-1], defaults))
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


def _g3d_mesh(
    faces: Any,
    points: Any,
    **options: Any,
) -> Graphics3d:
    normalized = [_g3d_point(point_value) for point_value in points]
    normalized_faces = [
        [int(index) for index in face] for face in faces
    ]
    if len(normalized) == 0:
        raise ValueError('a 3D mesh requires at least one vertex')
    for face in normalized_faces:
        if len(face) < 3:
            raise ValueError('each 3D mesh face needs at least three vertices')
        for index in face:
            if index < 0 or index >= len(normalized):
                raise IndexError('3D mesh face index is out of range')
    options = _g3d_copy_options(options)
    defaults = {
        'color': [0, 0, 1],
        'opacity': 1,
        'legend_label': None,
        'threejs_flat_shading': True,
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
    graphic.add_primitive(Mesh3d(
        normalized, normalized_faces, defaults))
    return graphic


def polygon3d(points: Any, **options: Any) -> Graphics3d:
    """Draw a single polygon with vertices in three-dimensional space."""
    normalized = list(points)
    return _g3d_mesh(
        [list(range(len(normalized)))], normalized, **options)


def polygons3d(
    faces: Any,
    points: Any,
    **options: Any,
) -> Graphics3d:
    """Draw an indexed union of polygons in three-dimensional space."""
    return _g3d_mesh(faces, points, **options)


def text3d(
    string: Any,
    position: Any,
    **options: Any,
) -> Graphics3d:
    """Display text at a point in three-dimensional space."""
    defaults = {
        'color': [0, 0, 1],
        'opacity': 1,
        'fontsize': 14,
    }
    options = _g3d_copy_options(options)
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
        Text3d(str(string), _g3d_point(position), defaults))
    return graphic


def arrow3d(
    start: Any,
    end: Any,
    width: Any = 1,
    radius: Any = None,
    head_radius: Any = None,
    head_len: Any = None,
    **options: Any,
) -> Graphics3d:
    """Draw an arrow from ``start`` to ``end`` in three dimensions."""
    start_point = _g3d_point(start)
    end_point = _g3d_point(end)
    if start_point == end_point:
        raise ValueError('an arrow must have distinct start and end points')
    options = _g3d_copy_options(options)
    if not _g3d_option_has(options, 'thickness'):
        options['thickness'] = float(width)
    if radius is not None:
        options['radius'] = float(radius)
    if head_radius is not None:
        options['head_radius'] = float(head_radius)
    if head_len is not None:
        options['head_len'] = float(head_len)
    graphic = line3d([start_point, end_point], **options)
    head_options = _g3d_copy_options(options)
    if (
        _g3d_option_has(head_options, 'rgbcolor')
        and not _g3d_option_has(head_options, 'color')
    ):
        head_options['color'] = _g3d_option_get(head_options, 'rgbcolor')
    graphic.add_primitive(
        Arrowhead3d(start_point, end_point, head_options))
    return graphic


def frame3d(
    lower_left: Any,
    upper_right: Any,
    **options: Any,
) -> Graphics3d:
    """Draw the twelve edges of an axis-aligned three-dimensional frame."""
    lower = _g3d_point(lower_left)
    upper = _g3d_point(upper_right)
    vertices = []
    for xvalue in (lower[0], upper[0]):
        for yvalue in (lower[1], upper[1]):
            for zvalue in (lower[2], upper[2]):
                vertices.append(runtime.math_tuple(
                    [xvalue, yvalue, zvalue]))
    edges = [
        [0, 1], [0, 2], [0, 4],
        [1, 3], [1, 5], [2, 3],
        [2, 6], [3, 7], [4, 5],
        [4, 6], [5, 7], [6, 7],
    ]
    answer = Graphics3d()
    for edge in edges:
        answer = answer + line3d(
            [vertices[edge[0]], vertices[edge[1]]], **options)
    return answer


def _solid_mesh(
    vertices: Any,
    faces: Any,
    center: Any,
    size: Any,
    **options: Any,
) -> Graphics3d:
    center_point = _g3d_point(center)
    scale = float(size)
    if scale <= 0:
        raise ValueError('solid size must be positive')
    transformed = [
        runtime.math_tuple([
            center_point[0] + scale * float(vertex[0]),
            center_point[1] + scale * float(vertex[1]),
            center_point[2] + scale * float(vertex[2]),
        ])
        for vertex in vertices
    ]
    if not _g3d_option_has(options, 'aspect_ratio'):
        options['aspect_ratio'] = [1, 1, 1]
    return _g3d_mesh(faces, transformed, **options)


def tetrahedron(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a regular tetrahedron centered at ``center``."""
    square_root_two = runtime.math.sqrt(2.0)
    square_root_six = runtime.math.sqrt(6.0)
    vertices = [
        [0, 0, 1],
        [2 * square_root_two / 3, 0, -1 / 3],
        [-square_root_two / 3, square_root_six / 3, -1 / 3],
        [-square_root_two / 3, -square_root_six / 3, -1 / 3],
    ]
    faces = [[0, 1, 2], [1, 3, 2], [0, 2, 3], [0, 3, 1]]
    return _solid_mesh(vertices, faces, center, size, **options)


def cube(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    color: Any = None,
    frame_thickness: Any = 0,
    frame_color: Any = None,
    **options: Any,
) -> Graphics3d:
    """Return a cube centered at ``center`` with side length ``size``."""
    vertices = [
        [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5],
        [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5],
        [0.5, -0.5, -0.5], [0.5, -0.5, 0.5],
        [0.5, 0.5, -0.5], [0.5, 0.5, 0.5],
    ]
    faces = [
        [0, 1, 3, 2], [4, 6, 7, 5],
        [0, 4, 5, 1], [2, 3, 7, 6],
        [0, 2, 6, 4], [1, 5, 7, 3],
    ]
    if color is not None:
        options['color'] = color
    answer = _solid_mesh(vertices, faces, center, size, **options)
    if float(frame_thickness) > 0:
        coordinates = _g3d_point(center)
        half = float(size) / 2.0
        actual_frame_color = 'black'
        if frame_color is not None:
            actual_frame_color = frame_color
        frame_lower = runtime.math_tuple([
            coordinates[0] - half,
            coordinates[1] - half,
            coordinates[2] - half,
        ])
        frame_upper = runtime.math_tuple([
            coordinates[0] + half,
            coordinates[1] + half,
            coordinates[2] + half,
        ])
        answer = answer + frame3d(
            frame_lower,
            frame_upper,
            thickness=float(frame_thickness),
            color=actual_frame_color,
        )
    return answer


def octahedron(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a regular octahedron centered at ``center``."""
    vertices = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1],
    ]
    faces = [
        [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
        [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
    ]
    return _solid_mesh(vertices, faces, center, size, **options)


def _icosahedron_geometry() -> Any:
    golden_ratio = (1.0 + runtime.math.sqrt(5.0)) / 2.0
    normalization = runtime.math.sqrt(1.0 + golden_ratio * golden_ratio)
    raw_vertices = [
        [-1, golden_ratio, 0], [1, golden_ratio, 0],
        [-1, -golden_ratio, 0], [1, -golden_ratio, 0],
        [0, -1, golden_ratio], [0, 1, golden_ratio],
        [0, -1, -golden_ratio], [0, 1, -golden_ratio],
        [golden_ratio, 0, -1], [golden_ratio, 0, 1],
        [-golden_ratio, 0, -1], [-golden_ratio, 0, 1],
    ]
    vertices = [
        [
            vertex[0] / normalization,
            vertex[1] / normalization,
            vertex[2] / normalization,
        ]
        for vertex in raw_vertices
    ]
    faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ]
    return [vertices, faces]


def icosahedron(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a regular icosahedron centered at ``center``."""
    geometry = _icosahedron_geometry()
    return _solid_mesh(
        geometry[0], geometry[1], center, size, **options)


def _cross_product(left: Any, right: Any) -> list[float]:
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ]


def _dot_product(left: Any, right: Any) -> float:
    return (
        left[0] * right[0] + left[1] * right[1] +
        left[2] * right[2]
    )


def dodecahedron(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a regular dodecahedron centered at ``center``."""
    geometry = _icosahedron_geometry()
    ico_vertices = geometry[0]
    ico_faces = geometry[1]
    vertices = []
    for face in ico_faces:
        centroid = [
            sum(ico_vertices[index][coordinate] for index in face) / 3.0
            for coordinate in range(3)
        ]
        length = runtime.math.sqrt(_dot_product(centroid, centroid))
        vertices.append([
            centroid[0] / length,
            centroid[1] / length,
            centroid[2] / length,
        ])
    faces = []
    for vertex_index in range(len(ico_vertices)):
        adjacent = [
            face_index
            for face_index in range(len(ico_faces))
            if vertex_index in ico_faces[face_index]
        ]
        normal = ico_vertices[vertex_index]
        reference = [1, 0, 0] if abs(normal[0]) < 0.9 else [0, 1, 0]
        tangent = _cross_product(normal, reference)
        tangent_length = runtime.math.sqrt(_dot_product(tangent, tangent))
        tangent = [value / tangent_length for value in tangent]
        second_tangent = _cross_product(normal, tangent)

        def face_angle(
            face_index: int,
            first_direction: Any = tangent,
            second_direction: Any = second_tangent,
        ) -> float:
            point_value = vertices[face_index]
            return runtime.math.atan2(
                _dot_product(point_value, second_direction),
                _dot_product(point_value, first_direction),
            )

        faces.append(sorted(adjacent, key=face_angle))
    return _solid_mesh(vertices, faces, center, size, **options)


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


def implicit_plot3d(
    function_value: Any,
    xrange: Any,
    yrange: Any,
    zrange: Any,
    **options: Any,
) -> Graphics3d:
    r"""
    Plot an implicit surface in three variables.

    The first argument may be an expression interpreted as `f = 0` or a
    symbolic equality, which is reduced to `left - right = 0`. Each range
    has Sage form `(variable, minimum, maximum)` or a three-item list.

    ### Examples

    ```sage
    sage: var('x,y,z')
    (x, y, z)
    sage: implicit_plot3d(x^2+y^2+z^2 == 1,
    ....:     (x,-2,2), (y,-2,2), (z,-2,2))
    Graphics3d Object
    ```

    The current renderer samples a deterministic rectangular grid and emits a
    Plotly isosurface.  It does not yet implement Sage's adaptive marching
    cubes refinements.
    """
    if hasattr(function_value, '_plot_zero_set_expression'):
        function_value = (
            function_value._plot_zero_set_expression())
    xvariable, xmin, xmax = _g3d_range(xrange)
    yvariable, ymin, ymax = _g3d_range(yrange)
    zvariable, zmin, zmax = _g3d_range(zrange)
    variables = _g3d_variables(
        [function_value],
        [xvariable, yvariable, zvariable],
        3,
    )
    evaluated = _g3d_component_callable(
        function_value, variables)
    counts = _g3d_plot_points(
        _g3d_option_pop(options, 'plot_points', 'automatic'),
        20,
        3,
    )
    xvalues = _g3d_linspace(xmin, xmax, counts[0])
    yvalues = _g3d_linspace(ymin, ymax, counts[1])
    zvalues = _g3d_linspace(zmin, zmax, counts[2])
    sampled_x = []
    sampled_y = []
    sampled_z = []
    sampled_values = []
    for zvalue in zvalues:
        for yvalue in yvalues:
            for xvalue in xvalues:
                sampled_x.append(xvalue)
                sampled_y.append(yvalue)
                sampled_z.append(zvalue)
                sampled_values.append(_g3d_finite_value(
                    evaluated(xvalue, yvalue, zvalue)))
    options = _g3d_copy_options(options)
    defaults = {
        'color': 'steelblue',
        'opacity': 1,
        'colorbar': False,
        'plot_tolerance': 1e-9,
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
    graphic.add_primitive(Isosurface3d(
        sampled_x,
        sampled_y,
        sampled_z,
        sampled_values,
        0.0,
        defaults,
    ))
    return graphic


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


runtime.register_doc(
    'implicit_plot3d',
    implicit_plot3d,
    {
        'kind': 'function',
        'module': 'sage.plot.plot3d.implicit_plot3d',
        'tags': [
            'graphics',
            '3D graphics',
            'implicit surfaces',
            'symbolic equations',
        ],
        'backends': ['Plotly', 'Sage.js rectangular sampler'],
        'sage_compatibility': {
            'status': 'partial',
            'notes': (
                'Sage expressions, equalities, ranges, and common options '
                'are supported; adaptive meshing is not yet implemented.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath 3D plotting API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'plot3d/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'library-backed',
                'source': 'Plotly.js isosurface rendering',
                'url': 'https://plotly.com/javascript/3d-isosurface-plots/',
            },
        ],
        'references': [
            {
                'id': 'plotly-js-isosurface',
                'type': 'software',
                'title': 'Plotly.js 3D Isosurface Plots',
                'url': (
                    'https://plotly.com/javascript/'
                    '3d-isosurface-plots/'
                ),
            },
        ],
        'implementation': {
            'algorithm': (
                'Rectangular scalar-field sampling and Plotly isosurface'
            ),
        },
        'limitations': [
            'Adaptive marching-cubes refinement is not implemented.',
        ],
    },
)


def _graphics3d_doc(tags: list[str], notes: str) -> Any:
    return {
        'kind': 'function',
        'module': 'sage.plot.plot3d',
        'tags': ['graphics', '3D graphics'] + tags,
        'backends': ['Plotly', 'Sage.js rectangular sampler'],
        'sage_compatibility': {
            'status': 'partial',
            'notes': notes,
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath 3D plotting API and object model',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/plot3d/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'library-backed',
                'source': 'Plotly.js',
                'url': 'https://plotly.com/javascript/3d-charts/',
            },
        ],
        'implementation': {
            'algorithm': 'Semantic 3D primitives with Plotly rendering',
        },
        'limitations': [],
    }


for _doc_name, _doc_function, _doc_tags in [
    ('line3d', line3d, ['lines']),
    ('point3d', point3d, ['points']),
    ('polygon3d', polygon3d, ['polygons', 'meshes']),
    ('polygons3d', polygons3d, ['polygons', 'meshes']),
    ('text3d', text3d, ['text']),
    ('arrow3d', arrow3d, ['arrows']),
    ('frame3d', frame3d, ['frames']),
    ('tetrahedron', tetrahedron, ['shapes', 'platonic solids']),
    ('cube', cube, ['shapes', 'platonic solids']),
    ('octahedron', octahedron, ['shapes', 'platonic solids']),
    ('dodecahedron', dodecahedron, ['shapes', 'platonic solids']),
    ('icosahedron', icosahedron, ['shapes', 'platonic solids']),
    ('plot3d', plot3d, ['surfaces']),
    ('parametric_plot3d', parametric_plot3d, ['parametric plots']),
    ('sphere', sphere, ['shapes']),
]:
    runtime.register_doc(
        _doc_name,
        _doc_function,
        _graphics3d_doc(
            _doc_tags,
            (
                'The Sage call form and core rendering semantics are '
                'supported; remaining specialized options are tracked by '
                'the graphics compatibility corpus.'
            ),
        ),
    )
