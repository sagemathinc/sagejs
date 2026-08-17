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

_GRAPHICS3D_PLOTLY_MIME = "application/vnd.plotly.v1+json"
_GRAPHICS3D_OPTION_NAMES = [
    "aspect_ratio",
    "axes",
    "axes_labels",
    "figsize",
    "frame",
    "projection",
    "title",
    "viewpoint",
    "zoom",
]
_SPHERE_DEFAULT_CENTER = (0, 0, 0)


def _g3d_native_object() -> Any:
    return runtime.object.create(None)


def _g3d_native_record(**values: Any) -> Any:
    answer = _g3d_native_object()
    for key in runtime.object.keys(values):
        runtime.reflect.set(answer, key, runtime.reflect.get(values, key))
    return answer


def _g3d_copy_options(options: Any) -> dict[str, Any]:
    answer = {}
    items_method = runtime.reflect.get(options, "items")
    if runtime.jstype(items_method) == "function":
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
        runtime.reflect.set(target, name, runtime.reflect.get(source, name))


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
                "rgba("
                + str(components[0])
                + ","
                + str(components[1])
                + ","
                + str(components[2])
                + ","
                + str(float(color[3]))
                + ")"
            )
        return (
            "rgb("
            + str(components[0])
            + ","
            + str(components[1])
            + ","
            + str(components[2])
            + ")"
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
            answer.append(
                [
                    float(index) / denominator,
                    _g3d_color_value(colors[index]),
                ]
            )
        return answer
    normalized = _g3d_color_value(color)
    return [[0, normalized], [1, normalized]]


def _g3d_parse_figsize(figsize: Any) -> tuple[float, float]:
    """Normalize Sage's `figsize` value to dimensions in inches."""
    if isinstance(figsize, (list, tuple)):
        if len(figsize) != 2:
            raise ValueError(
                "figsize should be a positive number or a list of two "
                "positive numbers, not " + str(figsize)
            )
        width = float(figsize[0])
        height = float(figsize[1])
        if width <= 0 or height <= 0:
            raise ValueError(
                "figsize should be positive numbers, not "
                + str(width)
                + " and "
                + str(height)
            )
        return width, height
    width = float(figsize)
    if width <= 0:
        raise ValueError("figsize should be positive, not " + str(width))
    return width, 0.75 * width


def _g3d_point(value: Any) -> tuple[float, float, float]:
    if isinstance(value, (list, tuple)):
        coordinates = list(value)
    elif hasattr(value, "__iter__"):
        coordinates = list(value)
    else:
        raise ValueError("points must have exactly three coordinates")
    if len(coordinates) != 3:
        raise ValueError("points must have exactly three coordinates")
    return (float(coordinates[0]), float(coordinates[1]), float(coordinates[2]))


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
            "plot range must contain two endpoints or a variable and two endpoints"
        )
    if maximum <= minimum:
        raise ValueError("plot range must have minimum < maximum")
    return variable, minimum, maximum


def _g3d_plot_points(
    value: Any,
    default_value: int,
    dimensions: int,
) -> list[int]:
    if value in ("automatic", None):
        values = [default_value for _index in range(dimensions)]
    elif isinstance(value, (list, tuple)):
        values = [int(item) for item in value]
        if len(values) != dimensions:
            raise ValueError("plot_points must have one entry for each parameter")
    else:
        values = [int(value) for _index in range(dimensions)]
    for count in values:
        if count < 2:
            raise ValueError("plot_points must be at least 2")
    return values


def _g3d_linspace(
    minimum: float,
    maximum: float,
    count: int,
) -> list[float]:
    delta = (maximum - minimum) / float(count - 1)
    values = [minimum + delta * index for index in range(count)]
    values[count - 1] = maximum
    return values


def _g3d_finite_value(value: Any) -> float:
    numeric = float(value)
    native = runtime.number(numeric)
    if not runtime.number.isFinite(native):
        raise ValueError("3D plot function returned a non-finite value")
    return native


def _g3d_sin(value: Any) -> Any:
    if (
        runtime.jstype(value) == "number"
        or runtime.native_get(value, "__sagejs_float__") is True
    ):
        return runtime.math.sin(runtime.number(value))
    function_value = runtime.reflect.get(runtime.global_object, "sin")
    return runtime.reflect.apply(function_value, runtime.undefined, [value])


def _g3d_cos(value: Any) -> Any:
    if (
        runtime.jstype(value) == "number"
        or runtime.native_get(value, "__sagejs_float__") is True
    ):
        return runtime.math.cos(runtime.number(value))
    function_value = runtime.reflect.get(runtime.global_object, "cos")
    return runtime.reflect.apply(function_value, runtime.undefined, [value])


def _g3d_component_callable(
    component: Any,
    variables: Sequence[Any],
) -> Any:
    if hasattr(component, "_plot_fast_callable"):
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
    specified = [variable for variable in range_variables if variable is not None]
    if len(specified) not in (0, dimensions):
        raise ValueError("specify variables in every 3D plot range or in none of them")
    if len(specified) == dimensions:
        names = [str(variable) for variable in specified]
        if len(set(names)) != dimensions:
            raise ValueError("range variables must be distinct")
        return specified

    discovered = []
    seen = {}
    for component in components:
        if not hasattr(component, "variables"):
            continue
        for variable in component.variables():
            name = str(variable)
            if name not in seen:
                seen[name] = True
                discovered.append(variable)
    if len(discovered) > dimensions:
        raise ValueError("3D plot expression has more variables than plot ranges")
    return discovered


class _Coordinates:
    """A Sage-compatible coordinate transformation for `plot3d`."""

    coordinate_names = ("x", "y", "z")
    coordinate_name = "Coordinates"

    def __init__(self, dep_var: Any, indep_vars: Any) -> None:
        self.dep_var = str(dep_var)
        self.indep_vars = [str(value) for value in indep_vars]
        if len(self.indep_vars) != 2:
            raise ValueError(
                "a coordinate transformation needs two independent variables"
            )
        supplied = set(self.indep_vars + [self.dep_var])
        expected = set(self.coordinate_names)
        if supplied != expected:
            difference = list(supplied.symmetric_difference(expected))
            raise ValueError(
                "variables were specified incorrectly for this coordinate "
                "system; incorrect variables were " + str(difference)
            )

    def to_cartesian(
        self,
        function_value: Any,
        params: Any = None,
    ) -> Any:
        if callable(function_value):

            def component(index: int) -> Any:
                def transformed(uvalue: Any, vvalue: Any) -> float:
                    function_result = runtime.reflect.apply(
                        function_value,
                        runtime.undefined,
                        [uvalue, vvalue],
                    )
                    coordinates = {
                        self.dep_var: float(function_result),
                        self.indep_vars[0]: float(uvalue),
                        self.indep_vars[1]: float(vvalue),
                    }
                    transform_method = runtime.reflect.get(self, "transform")
                    return float(transform_method(**coordinates)[index])

                return transformed

            return runtime.math_tuple([component(0), component(1), component(2)])
        if params is None or len(params) != 2:
            raise ValueError("symbolic coordinate transforms require two parameters")
        coordinates = {
            self.dep_var: function_value,
            self.indep_vars[0]: params[0],
            self.indep_vars[1]: params[1],
        }
        transform_method = runtime.reflect.get(self, "transform")
        return transform_method(**coordinates)

    def __repr__(self) -> str:
        return (
            self.coordinate_name
            + " coordinate transform ("
            + self.dep_var
            + " in terms of "
            + ", ".join(self.indep_vars)
            + ")"
        )

    __str__ = __repr__
    toString = __repr__


class Spherical(_Coordinates):
    """Spherical coordinates using azimuth and polar inclination."""

    coordinate_names = ("radius", "azimuth", "inclination")
    coordinate_name = "Spherical"

    def transform(
        self,
        radius: Any = None,
        azimuth: Any = None,
        inclination: Any = None,
    ) -> Any:
        return runtime.math_tuple(
            [
                radius * _g3d_sin(inclination) * _g3d_cos(azimuth),
                radius * _g3d_sin(inclination) * _g3d_sin(azimuth),
                radius * _g3d_cos(inclination),
            ]
        )


class SphericalElevation(_Coordinates):
    """Spherical coordinates using azimuth and elevation."""

    coordinate_names = ("radius", "azimuth", "elevation")
    coordinate_name = "SphericalElevation"

    def transform(
        self,
        radius: Any = None,
        azimuth: Any = None,
        elevation: Any = None,
    ) -> Any:
        return runtime.math_tuple(
            [
                radius * _g3d_cos(elevation) * _g3d_cos(azimuth),
                radius * _g3d_cos(elevation) * _g3d_sin(azimuth),
                radius * _g3d_sin(elevation),
            ]
        )


class Cylindrical(_Coordinates):
    """Cylindrical coordinates using radius, azimuth, and height."""

    coordinate_names = ("radius", "azimuth", "height")
    coordinate_name = "Cylindrical"

    def transform(
        self,
        radius: Any = None,
        azimuth: Any = None,
        height: Any = None,
    ) -> Any:
        return runtime.math_tuple(
            [
                radius * _g3d_cos(azimuth),
                radius * _g3d_sin(azimuth),
                height,
            ]
        )


def _g3d_plot_spec_json_value(value: Any) -> Any:
    """Return ordinary JSON-safe Python data for a renderer value."""
    if value is runtime.undefined:
        return None
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_g3d_plot_spec_json_value(item) for item in value]
    if isinstance(value, dict):
        answer = dict()
        for key in value:
            answer.__setitem__(
                str(key), _g3d_plot_spec_json_value(value.__getitem__(key))
            )
        return answer
    if runtime.jstype(value) == "object":
        answer = dict()
        for key in runtime.object.keys(value):
            answer.__setitem__(
                str(key),
                _g3d_plot_spec_json_value(runtime.reflect.get(value, key)),
            )
        return answer
    raise TypeError("Plotly fallback value is not JSON-safe: " + str(value))


def _g3d_plot_spec_layer(
    payload: dict[str, Any],
    ordinal: int,
    source_context: Any = None,
    ordered_options: Any = None,
) -> Any:
    """Materialize one lazy primitive payload as a public `PlotLayer`."""
    plotting = __import__("sagejs.plotting", fromlist=["PlotLayer"])
    materialized = _g3d_plot_spec_json_value(payload)
    source_intent = materialized.get("source_intent", runtime.scope_dict({}))
    if source_context is not None:
        context = _g3d_plot_spec_json_value(source_context)
        for name in context:
            if name not in source_intent:
                source_intent.__setitem__(name, context.__getitem__(name))
    if ordered_options is not None and len(ordered_options):
        source_intent.__setitem__(
            "ordered_options", _g3d_plot_spec_json_value(ordered_options)
        )

    materialized.__setitem__("id", "layer-" + str(ordinal))
    materialized.__setitem__("source_intent", source_intent)
    return plotting.PlotLayer.from_dict(materialized)


def _g3d_semantic_source_intent(
    primitive: str,
    source_context: Any = None,
    ordered_options: Any = None,
) -> dict[str, Any]:
    """Merge frontend intent before constructing a large semantic layer."""
    answer = {"sage_primitive": primitive}
    if source_context is not None:
        context = _g3d_plot_spec_json_value(source_context)
        for name in context:
            if name not in ("constructor", "representation") and name not in answer:
                answer[name] = context.__getitem__(name)
    if ordered_options is not None and len(ordered_options):
        answer["ordered_options"] = _g3d_plot_spec_json_value(ordered_options)
    return answer


def _g3d_plot_spec_traces(payload: dict[str, Any]) -> list[Any]:
    """Lower one supported semantic payload to its exact Plotly traces."""
    kind = str(payload["kind"])
    data = payload["data"]
    style = payload["style"]
    legend = payload["legend"]
    if kind == "line":
        trace = _g3d_native_record(
            type="scatter3d",
            mode="lines",
            x=data["x"],
            y=data["y"],
            z=data["z"],
            line=_g3d_native_record(
                color=style["color"],
                width=style["width"],
            ),
            opacity=style["opacity"],
            showlegend=legend["show"],
        )
        if legend["label"] is not None:
            runtime.reflect.set(trace, "name", legend["label"])
        return [trace]
    if kind == "point":
        trace = _g3d_native_record(
            type="scatter3d",
            mode="markers",
            x=data["x"],
            y=data["y"],
            z=data["z"],
            marker=_g3d_native_record(
                color=style["color"],
                size=style["size"],
                symbol=style["symbol"],
            ),
            opacity=style["opacity"],
            showlegend=legend["show"],
        )
        if legend["label"] is not None:
            runtime.reflect.set(trace, "name", legend["label"])
        return [trace]
    if kind == "text":
        return [
            _g3d_native_record(
                type="scatter3d",
                mode="text",
                x=[data["position"][0]],
                y=[data["position"][1]],
                z=[data["position"][2]],
                text=[data["text"]],
                textfont=_g3d_native_record(
                    color=style["color"],
                    size=style["font_size"],
                ),
                opacity=style["opacity"],
                showlegend=False,
            )
        ]
    raise ValueError("unsupported semantic 3D layer kind: " + kind)


class GraphicPrimitive3d:
    """Base class for a semantic three-dimensional graphics primitive."""

    def __init__(self, options: dict[str, Any]) -> None:
        self._options = _g3d_copy_options(options)

    def options(self) -> dict[str, Any]:
        return _g3d_copy_options(self._options)

    def _plotly_traces(self) -> list[Any]:
        raise NotImplementedError("3D graphics primitive has no Plotly renderer")

    def _plot_spec_payload(self) -> dict[str, Any]:
        """Describe an unmigrated primitive through an honest raw fallback."""
        return {
            "kind": "plotly-trace",
            "data": {
                "traces": _g3d_plot_spec_json_value(self._plotly_traces()),
            },
            "source_intent": {
                "representation": "raw-plotly-fallback",
                "primitive": repr(self),
            },
            "style": {},
            "visibility": True,
            "legend": {},
            "metadata": {"semantic": False},
        }

    def _raw_plot_spec_payload(self, reason: str) -> dict[str, Any]:
        """Describe an unsupported semantic case without losing its traces."""
        return {
            "kind": "plotly-trace",
            "data": {
                "traces": _g3d_plot_spec_json_value(self._plotly_traces()),
            },
            "source_intent": {
                "representation": "raw-plotly-fallback",
                "primitive": repr(self),
                "reason": reason,
            },
            "style": {},
            "visibility": True,
            "legend": {},
            "metadata": {"semantic": False, "fallback_reason": reason},
        }

    def _plot_spec_layer(
        self,
        ordinal: int,
        source_context: Any = None,
        ordered_options: Any = None,
    ) -> Any:
        return _g3d_plot_spec_layer(
            self._plot_spec_payload(), ordinal, source_context, ordered_options
        )

    def __repr__(self) -> str:
        return "3D graphics primitive"

    __str__ = __repr__
    toString = __repr__


def _g3d_translated_values(values: Any, offset: float) -> Any:
    """Translate a flat or rectangular Plotly coordinate collection."""
    if isinstance(values, (list, tuple)):
        return [_g3d_translated_values(value, offset) for value in values]
    if values is None:
        return None
    return float(values) + offset


def _g3d_transform_coordinates(
    xvalues: Any,
    yvalues: Any,
    zvalues: Any,
    matrix: Any,
    offset: Any,
) -> tuple[Any, Any, Any]:
    """Apply one affine transform to parallel Plotly coordinate arrays."""
    if isinstance(xvalues, (list, tuple)):
        transformed_x = []
        transformed_y = []
        transformed_z = []
        for index in range(len(xvalues)):
            xpart, ypart, zpart = _g3d_transform_coordinates(
                xvalues[index], yvalues[index], zvalues[index], matrix, offset
            )
            transformed_x.append(xpart)
            transformed_y.append(ypart)
            transformed_z.append(zpart)
        return transformed_x, transformed_y, transformed_z
    if xvalues is None or yvalues is None or zvalues is None:
        return runtime.math_tuple([None, None, None])
    xvalue = float(xvalues)
    yvalue = float(yvalues)
    zvalue = float(zvalues)
    return runtime.math_tuple(
        [
            matrix[0][0] * xvalue
            + matrix[0][1] * yvalue
            + matrix[0][2] * zvalue
            + offset[0],
            matrix[1][0] * xvalue
            + matrix[1][1] * yvalue
            + matrix[1][2] * zvalue
            + offset[1],
            matrix[2][0] * xvalue
            + matrix[2][1] * yvalue
            + matrix[2][2] * zvalue
            + offset[2],
        ]
    )


def _g3d_transform_plot_spec_payload(
    payload: dict[str, Any],
    matrix: Any,
    offset: Any,
    operation: str,
) -> dict[str, Any] | None:
    """Transform a migrated point, line, or text semantic payload."""
    kind = str(payload["kind"])
    if kind not in ("line", "point", "text"):
        return None
    data = payload["data"]
    if kind in ("line", "point"):
        coordinates = _g3d_transform_coordinates(
            data["x"], data["y"], data["z"], matrix, offset
        )
        transformed_data = {
            "x": coordinates[0],
            "y": coordinates[1],
            "z": coordinates[2],
        }
    else:
        position = data["position"]
        coordinates = _g3d_transform_coordinates(
            position[0], position[1], position[2], matrix, offset
        )
        transformed_data = {
            "text": data["text"],
            "position": list(coordinates),
        }
    return {
        "kind": kind,
        "data": transformed_data,
        "source_intent": {
            "operation": operation,
            "input": payload["source_intent"],
            "matrix": matrix,
            "offset": list(offset),
        },
        "style": payload["style"],
        "visibility": payload["visibility"],
        "legend": payload["legend"],
        "metadata": payload["metadata"],
    }


def _g3d_flatten_numeric(values: Any) -> list[float]:
    if isinstance(values, (list, tuple)):
        result = []
        for value in values:
            result += _g3d_flatten_numeric(value)
        return result
    if values is None:
        return []
    return [float(values)]


def _g3d_camera(options: Any) -> Any:
    """Translate Sage's Three.js camera options to a Plotly camera."""
    projection = str(_g3d_option_get(options, "projection", "perspective")).lower()
    if projection not in ("perspective", "orthographic"):
        raise ValueError("projection must be 'perspective' or 'orthographic'")

    zoom = float(_g3d_option_get(options, "zoom", 1))
    if zoom <= 0:
        raise ValueError("zoom must be positive")

    viewpoint = _g3d_option_get(options, "viewpoint")
    if viewpoint is None or viewpoint is False:
        eye = [1.25 / zoom, 1.25 / zoom, 1.25 / zoom]
    else:
        values = list(viewpoint)
        if len(values) != 2:
            raise ValueError("viewpoint must be of the form [[x, y, z], angle]")
        axis = _g3d_point(values[0])
        length = runtime.math.sqrt(
            axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]
        )
        if length == 0:
            raise ValueError("viewpoint axis must be nonzero")
        unit = [value / length for value in axis]
        # Sage's Three.js renderer applies the inverse axis-angle quaternion
        # to a camera on the positive z axis.  Rodrigues' formula with the
        # negative angle gives the same orientation without renderer state.
        angle = -float(values[1]) * runtime.math.PI / 180
        sine = runtime.math.sin(angle)
        cosine = runtime.math.cos(angle)
        distance = runtime.math.sqrt(3 * 1.25 * 1.25) / zoom
        vector = [0.0, 0.0, distance]
        cross = [
            unit[1] * vector[2] - unit[2] * vector[1],
            unit[2] * vector[0] - unit[0] * vector[2],
            unit[0] * vector[1] - unit[1] * vector[0],
        ]
        dot = sum(unit[index] * vector[index] for index in range(3))
        eye = [
            vector[index] * cosine
            + cross[index] * sine
            + unit[index] * dot * (1 - cosine)
            for index in range(3)
        ]

    return _g3d_native_record(
        eye=_g3d_native_record(x=eye[0], y=eye[1], z=eye[2]),
        projection=_g3d_native_record(type=projection),
    )


class TransformedPrimitive3d(GraphicPrimitive3d):
    """A renderer-independent affine transform of a 3D primitive."""

    def __init__(
        self,
        primitive: GraphicPrimitive3d,
        matrix: Any,
        offset: Any,
    ) -> None:
        GraphicPrimitive3d.__init__(self, primitive.options())
        self.primitive = primitive
        self.matrix = matrix
        self.offset = offset

    def __repr__(self) -> str:
        return "Transformed " + repr(self.primitive)

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        traces = self.primitive._plotly_traces()
        for trace in traces:
            if (
                runtime.reflect.has(trace, "x")
                and runtime.reflect.has(trace, "y")
                and runtime.reflect.has(trace, "z")
            ):
                transformed = _g3d_transform_coordinates(
                    runtime.reflect.get(trace, "x"),
                    runtime.reflect.get(trace, "y"),
                    runtime.reflect.get(trace, "z"),
                    self.matrix,
                    self.offset,
                )
                runtime.reflect.set(trace, "x", transformed[0])
                runtime.reflect.set(trace, "y", transformed[1])
                runtime.reflect.set(trace, "z", transformed[2])
            if (
                runtime.reflect.has(trace, "u")
                and runtime.reflect.has(trace, "v")
                and runtime.reflect.has(trace, "w")
            ):
                transformed_vectors = _g3d_transform_coordinates(
                    runtime.reflect.get(trace, "u"),
                    runtime.reflect.get(trace, "v"),
                    runtime.reflect.get(trace, "w"),
                    self.matrix,
                    (0, 0, 0),
                )
                runtime.reflect.set(trace, "u", transformed_vectors[0])
                runtime.reflect.set(trace, "v", transformed_vectors[1])
                runtime.reflect.set(trace, "w", transformed_vectors[2])
        return traces

    def _plot_spec_payload(self) -> dict[str, Any]:
        transformed = _g3d_transform_plot_spec_payload(
            self.primitive._plot_spec_payload(),
            self.matrix,
            self.offset,
            "affine-transform",
        )
        if transformed is not None:
            return transformed
        return self._raw_plot_spec_payload("affine-transform-not-representable")


class TranslatedPrimitive3d(GraphicPrimitive3d):
    """A renderer-independent translation of a 3D primitive."""

    def __init__(
        self,
        primitive: GraphicPrimitive3d,
        offset: tuple[float, float, float],
    ) -> None:
        GraphicPrimitive3d.__init__(self, primitive.options())
        self.primitive = primitive
        self.offset = offset

    def __repr__(self) -> str:
        return "Translated " + repr(self.primitive)

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        traces = self.primitive._plotly_traces()
        coordinate_names = ["x", "y", "z"]
        for trace in traces:
            for index in range(3):
                name = coordinate_names[index]
                if runtime.reflect.has(trace, name):
                    runtime.reflect.set(
                        trace,
                        name,
                        _g3d_translated_values(
                            runtime.reflect.get(trace, name),
                            self.offset[index],
                        ),
                    )
        return traces

    def _plot_spec_payload(self) -> dict[str, Any]:
        transformed = _g3d_transform_plot_spec_payload(
            self.primitive._plot_spec_payload(),
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            self.offset,
            "translate",
        )
        if transformed is not None:
            return transformed
        return self._raw_plot_spec_payload("translation-not-representable")


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
        return runtime.math_tuple(
            [
                self.xdata[index],
                self.ydata[index],
                self.zdata[index],
            ]
        )

    def __repr__(self) -> str:
        return "3D line defined by " + str(len(self.xdata)) + " points"

    __str__ = __repr__
    toString = __repr__

    def _plot_spec_payload(self) -> dict[str, Any]:
        options = self._options
        color = _g3d_option_get(
            options, "rgbcolor", _g3d_option_get(options, "color", [0, 0, 1])
        )
        legend_label = _g3d_option_get(options, "legend_label")
        return {
            "kind": "line",
            "data": {"x": self.xdata, "y": self.ydata, "z": self.zdata},
            "source_intent": {
                "constructor": "line3d",
                "representation": "normalized-primitive",
            },
            "style": {
                "color": _g3d_color_value(color),
                "width": float(_g3d_option_get(options, "thickness", 2)),
                "opacity": float(_g3d_option_get(options, "opacity", 1)),
            },
            "visibility": True,
            "legend": {
                "show": legend_label is not None,
                "label": None if legend_label is None else str(legend_label),
            },
            "metadata": {"semantic": True},
        }

    def _plotly_traces(self) -> list[Any]:
        return _g3d_plot_spec_traces(self._plot_spec_payload())


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
        return runtime.math_tuple(
            [
                self.xdata[index],
                self.ydata[index],
                self.zdata[index],
            ]
        )

    def __repr__(self) -> str:
        return "3D point set defined by " + str(len(self.xdata)) + " point(s)"

    __str__ = __repr__
    toString = __repr__

    def _plot_spec_payload(self) -> dict[str, Any]:
        options = self._options
        color = _g3d_option_get(
            options, "rgbcolor", _g3d_option_get(options, "color", [0, 0, 1])
        )
        legend_label = _g3d_option_get(options, "legend_label")
        return {
            "kind": "point",
            "data": {"x": self.xdata, "y": self.ydata, "z": self.zdata},
            "source_intent": {
                "constructor": "point3d",
                "representation": "normalized-primitive",
            },
            "style": {
                "color": _g3d_color_value(color),
                "size": float(_g3d_option_get(options, "size", 5)),
                "symbol": str(_g3d_option_get(options, "marker", "circle")),
                "opacity": float(_g3d_option_get(options, "opacity", 1)),
            },
            "visibility": True,
            "legend": {
                "show": legend_label is not None,
                "label": None if legend_label is None else str(legend_label),
            },
            "metadata": {"semantic": True},
        }

    def _plotly_traces(self) -> list[Any]:
        return _g3d_plot_spec_traces(self._plot_spec_payload())


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
            "3D mesh with "
            + str(len(self.vertices))
            + " vertices and "
            + str(len(self.faces))
            + " faces"
        )

    __str__ = __repr__
    toString = __repr__

    def _wireframe_coordinates(self) -> Any:
        """Return depth-separated line segments for all distinct edges."""
        vertex_count = len(self.vertices)
        normals = [[0.0, 0.0, 0.0] for _index in range(vertex_count)]
        edges = {}
        for face in self.faces:
            if len(face) < 3:
                continue
            origin_index = int(face[0])
            origin = self.vertices[origin_index]
            for index in range(1, len(face) - 1):
                left_index = int(face[index])
                right_index = int(face[index + 1])
                left = self.vertices[left_index]
                right = self.vertices[right_index]
                tangent_left = [
                    left[coordinate] - origin[coordinate] for coordinate in range(3)
                ]
                tangent_right = [
                    right[coordinate] - origin[coordinate] for coordinate in range(3)
                ]
                normal = _cross_product(tangent_left, tangent_right)
                for vertex_index in (origin_index, left_index, right_index):
                    for coordinate in range(3):
                        normals[vertex_index][coordinate] += normal[coordinate]
            for index in range(len(face)):
                left_index = int(face[index])
                right_index = int(face[(index + 1) % len(face)])
                lower = min(left_index, right_index)
                upper = max(left_index, right_index)
                key = str(lower) + ":" + str(upper)
                if key not in edges:
                    edges[key] = [left_index, right_index]

        minimum = list(self.vertices[0])
        maximum = list(self.vertices[0])
        for vertex in self.vertices:
            for coordinate in range(3):
                minimum[coordinate] = min(minimum[coordinate], vertex[coordinate])
                maximum[coordinate] = max(maximum[coordinate], vertex[coordinate])
        diagonal = runtime.math.sqrt(
            sum((maximum[index] - minimum[index]) ** 2 for index in range(3))
        )
        relative_offset = float(_g3d_option_get(self._options, "mesh_offset", 0.0001))
        offset = relative_offset * (diagonal if diagonal > 0 else 1)
        for vertex_index in range(vertex_count):
            normal_length = runtime.math.sqrt(
                _dot_product(normals[vertex_index], normals[vertex_index])
            )
            if normal_length <= 1e-15:
                normals[vertex_index] = [0, 0, 1]
            else:
                normals[vertex_index] = [
                    value / normal_length for value in normals[vertex_index]
                ]

        mesh_x = []
        mesh_y = []
        mesh_z = []
        for sign in (-1, 1):
            for key in edges:
                edge = edges[key]
                for vertex_index in edge:
                    vertex = self.vertices[vertex_index]
                    normal = normals[vertex_index]
                    mesh_x.append(vertex[0] + sign * offset * normal[0])
                    mesh_y.append(vertex[1] + sign * offset * normal[1])
                    mesh_z.append(vertex[2] + sign * offset * normal[2])
                mesh_x.append(None)
                mesh_y.append(None)
                mesh_z.append(None)
        return runtime.math_tuple([mesh_x, mesh_y, mesh_z])

    def _plot_spec_semantic_layer(
        self,
        ordinal: int,
        source_context: Any = None,
        ordered_options: Any = None,
    ) -> Any:
        """Return a validated layer and fallback reason without recopying it."""
        if bool(_g3d_option_get(self._options, "mesh", False)):
            return runtime.math_tuple([None, "wireframe-companion-trace"])

        all_triangles = len(self.faces) > 0
        for face in self.faces:
            if len(face) != 3:
                all_triangles = False
        single_polygon = len(self.faces) == 1 and len(self.faces[0]) >= 3
        if not all_triangles and not single_polygon:
            return runtime.math_tuple(
                [None, "multi-face-polygonal-mesh-requires-explicit-triangulation"]
            )

        surface_layers = __import__(
            "sagejs.plotting.surface_layers",
            fromlist=[
                "MAX_MESH_TRIANGLES",
                "MAX_MESH_VERTICES",
                "layer_payload",
                "lower_3d_geometry_payload",
                "polygon_layer",
                "triangular_mesh_layer",
            ],
        )
        if len(self.vertices) > surface_layers.MAX_MESH_VERTICES:
            raise ValueError(
                "mesh exceeds the vertex limit of "
                + str(surface_layers.MAX_MESH_VERTICES)
            )
        if all_triangles and len(self.faces) > surface_layers.MAX_MESH_TRIANGLES:
            raise ValueError(
                "mesh exceeds the triangle limit of "
                + str(surface_layers.MAX_MESH_TRIANGLES)
            )

        options = self._options
        color = _g3d_option_get(
            options, "color", _g3d_option_get(options, "rgbcolor", [0, 0, 1])
        )
        face_colors = []
        is_face_colors = (
            isinstance(color, (list, tuple))
            and len(color) > 0
            and isinstance(color[0], (str, list, tuple))
        )
        if is_face_colors:
            colors = list(color)
            if all_triangles:
                for face_index in range(len(self.faces)):
                    face_colors.append(colors[face_index % len(colors)])
            else:
                face_colors.append(colors[0])
        style = {
            "color": [0, 0, 1] if is_face_colors else color,
            "face_colors": face_colors,
            "flat_shading": bool(
                _g3d_option_get(options, "threejs_flat_shading", True)
            ),
            "opacity": float(_g3d_option_get(options, "opacity", 1)),
        }
        legend_label = _g3d_option_get(options, "legend_label")
        try:
            if all_triangles:
                layer = surface_layers.triangular_mesh_layer(
                    self.vertices,
                    self.faces,
                    ordinal=ordinal,
                    style=style,
                    legend_label=(None if legend_label is None else str(legend_label)),
                    source_intent=_g3d_semantic_source_intent(
                        "Mesh3d", source_context, ordered_options
                    ),
                )
            else:
                points = [self.vertices[index] for index in self.faces[0]]
                layer = surface_layers.polygon_layer(
                    points,
                    ordinal=ordinal,
                    style=style,
                    legend_label=(None if legend_label is None else str(legend_label)),
                    source_intent=_g3d_semantic_source_intent(
                        "Mesh3d", source_context, ordered_options
                    ),
                )
            payload = surface_layers.layer_payload(layer, reuse_validated_layer=True)
            surface_layers.lower_3d_geometry_payload(payload)
            return runtime.math_tuple([payload, None])
        except TypeError:
            return runtime.math_tuple(
                [None, "mesh-geometry-or-style-not-losslessly-representable"]
            )
        except ValueError:
            return runtime.math_tuple(
                [None, "mesh-geometry-or-style-not-losslessly-representable"]
            )
        except IndexError:
            return runtime.math_tuple(
                [None, "mesh-geometry-or-style-not-losslessly-representable"]
            )

    def _plot_spec_payload(self) -> dict[str, Any]:
        """Return a guarded semantic mesh or an exact raw Plotly fallback."""
        layer, reason = self._plot_spec_semantic_layer(0)
        if layer is None:
            return self._raw_plot_spec_payload(reason)
        surface_layers = __import__(
            "sagejs.plotting.surface_layers", fromlist=["layer_payload"]
        )
        return surface_layers.layer_payload(layer)

    def _plot_spec_layer(
        self,
        ordinal: int,
        source_context: Any = None,
        ordered_options: Any = None,
    ) -> Any:
        layer, reason = self._plot_spec_semantic_layer(
            ordinal, source_context, ordered_options
        )
        if layer is not None:
            return layer
        return _g3d_plot_spec_layer(
            self._raw_plot_spec_payload(reason),
            ordinal,
            source_context,
            ordered_options,
        )

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
            options, "color", _g3d_option_get(options, "rgbcolor", [0, 0, 1])
        )
        trace = _g3d_native_record(
            type="mesh3d",
            x=xdata,
            y=ydata,
            z=zdata,
            i=triangles_i,
            j=triangles_j,
            k=triangles_k,
            flatshading=bool(_g3d_option_get(options, "threejs_flat_shading", True)),
            opacity=float(_g3d_option_get(options, "opacity", 1)),
            showlegend=_g3d_option_get(options, "legend_label") is not None,
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
                "facecolor",
                [
                    _g3d_color_value(colors[index % len(colors)])
                    for index in face_indices
                ],
            )
        else:
            runtime.reflect.set(trace, "color", _g3d_color_value(color))
        legend_label = _g3d_option_get(options, "legend_label")
        if legend_label is not None:
            runtime.reflect.set(trace, "name", str(legend_label))
        traces = [trace]
        if bool(_g3d_option_get(options, "mesh", False)):
            wireframe = self._wireframe_coordinates()
            traces.append(
                _g3d_native_record(
                    type="scatter3d",
                    mode="lines",
                    x=wireframe[0],
                    y=wireframe[1],
                    z=wireframe[2],
                    line=_g3d_native_record(
                        color=_g3d_color_value(
                            _g3d_option_get(options, "mesh_color", "black")
                        ),
                        width=float(
                            _g3d_option_get(
                                options,
                                "mesh_thickness",
                                _g3d_option_get(options, "thickness", 1),
                            )
                        ),
                    ),
                    opacity=float(_g3d_option_get(options, "opacity", 1)),
                    hoverinfo="skip",
                    showlegend=False,
                )
            )
        return traces


class ScatteredSurface3d(GraphicPrimitive3d):
    """A surface triangulated from scattered `(x, y, z)` samples."""

    def __init__(
        self,
        points: Sequence[tuple[float, float, float]],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.points = list(points)

    def __repr__(self) -> str:
        return "3D surface triangulated from " + str(len(self.points)) + " points"

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        color = _g3d_option_get(options, "color", "steelblue")
        return [
            _g3d_native_record(
                type="mesh3d",
                x=[point[0] for point in self.points],
                y=[point[1] for point in self.points],
                z=[point[2] for point in self.points],
                alphahull=-1,
                delaunayaxis="z",
                color=_g3d_color_value(color),
                opacity=float(_g3d_option_get(options, "opacity", 1)),
                flatshading=False,
                showlegend=False,
            )
        ]


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

    def _plot_spec_payload(self) -> dict[str, Any]:
        options = self._options
        color = _g3d_option_get(options, "color", [0, 0, 1])
        return {
            "kind": "text",
            "data": {"text": self.string, "position": list(self.position)},
            "source_intent": {
                "constructor": "text3d",
                "representation": "normalized-primitive",
            },
            "style": {
                "color": _g3d_color_value(color),
                "font_size": float(_g3d_option_get(options, "fontsize", 14)),
                "opacity": float(_g3d_option_get(options, "opacity", 1)),
            },
            "visibility": True,
            "legend": {"show": False, "label": None},
            "metadata": {"semantic": True},
        }

    def _plotly_traces(self) -> list[Any]:
        return _g3d_plot_spec_traces(self._plot_spec_payload())


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
            options, "color", _g3d_option_get(options, "rgbcolor", [0, 0, 1])
        )
        head_length = _g3d_option_get(options, "head_len")
        if head_length is None:
            head_length = 0.25 * length
        return [
            _g3d_native_record(
                type="cone",
                x=[self.end[0]],
                y=[self.end[1]],
                z=[self.end[2]],
                u=[dx / length],
                v=[dy / length],
                w=[dz / length],
                anchor="tip",
                sizemode="absolute",
                sizeref=float(head_length),
                colorscale=_g3d_colorscale(color),
                showscale=False,
                opacity=float(_g3d_option_get(options, "opacity", 1)),
                showlegend=False,
            )
        ]


class VectorField3d(GraphicPrimitive3d):
    """A sampled three-dimensional vector field rendered as Plotly cones."""

    def __init__(
        self,
        points: Sequence[tuple[float, float, float]],
        vectors: Sequence[tuple[float, float, float]],
        magnitudes: Sequence[float],
        options: dict[str, Any],
    ) -> None:
        GraphicPrimitive3d.__init__(self, options)
        self.points = list(points)
        self.vectors = list(vectors)
        self.magnitudes = list(magnitudes)

    def __repr__(self) -> str:
        return "3D vector field with " + str(len(self.points)) + " vectors"

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        colors = _g3d_option_get(options, "colors", "jet")
        if isinstance(colors, str) and colors.lower() in {
            "blackbody",
            "bluered",
            "blues",
            "cividis",
            "earth",
            "electric",
            "greens",
            "greys",
            "hot",
            "jet",
            "picnic",
            "portland",
            "rainbow",
            "rdbu",
            "reds",
            "viridis",
            "ylgnbu",
            "ylorrd",
        }:
            colorscale = colors
        else:
            colorscale = _g3d_colorscale(colors)
        anchor = (
            "center"
            if bool(_g3d_option_get(options, "center_arrows", False))
            else "tail"
        )
        return [
            _g3d_native_record(
                type="cone",
                x=[point[0] for point in self.points],
                y=[point[1] for point in self.points],
                z=[point[2] for point in self.points],
                u=[vector[0] for vector in self.vectors],
                v=[vector[1] for vector in self.vectors],
                w=[vector[2] for vector in self.vectors],
                anchor=anchor,
                sizemode="raw",
                sizeref=float(_g3d_option_get(options, "scale", 1)),
                colorscale=colorscale,
                showscale=bool(_g3d_option_get(options, "colorbar", False)),
                opacity=float(_g3d_option_get(options, "opacity", 1)),
                showlegend=False,
            )
        ]


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
        return "3D surface defined by a " + str(rows) + " x " + str(columns) + " grid"

    __str__ = __repr__
    toString = __repr__

    def _wireframe_coordinates(self) -> Any:
        """Return a two-sided, depth-separated copy of the sample grid."""
        row_count = len(self.xdata)
        column_count = 0 if row_count == 0 else len(self.xdata[0])
        mesh_x = []
        mesh_y = []
        mesh_z = []
        if row_count == 0 or column_count == 0:
            return runtime.math_tuple([mesh_x, mesh_y, mesh_z])

        minimum = [self.xdata[0][0], self.ydata[0][0], self.zdata[0][0]]
        maximum = list(minimum)
        for row_index in range(row_count):
            for column_index in range(column_count):
                point = [
                    self.xdata[row_index][column_index],
                    self.ydata[row_index][column_index],
                    self.zdata[row_index][column_index],
                ]
                for coordinate in range(3):
                    minimum[coordinate] = min(minimum[coordinate], point[coordinate])
                    maximum[coordinate] = max(maximum[coordinate], point[coordinate])
        diagonal = runtime.math.sqrt(
            sum((maximum[index] - minimum[index]) ** 2 for index in range(3))
        )
        relative_offset = float(_g3d_option_get(self._options, "mesh_offset", 0.0001))
        offset = relative_offset * (diagonal if diagonal > 0 else 1)

        offset_x = []
        offset_y = []
        offset_z = []
        for row_index in range(row_count):
            xrow = []
            yrow = []
            zrow = []
            before_row = max(0, row_index - 1)
            after_row = min(row_count - 1, row_index + 1)
            for column_index in range(column_count):
                before_column = max(0, column_index - 1)
                after_column = min(column_count - 1, column_index + 1)
                tangent_u = [
                    self.xdata[row_index][after_column]
                    - self.xdata[row_index][before_column],
                    self.ydata[row_index][after_column]
                    - self.ydata[row_index][before_column],
                    self.zdata[row_index][after_column]
                    - self.zdata[row_index][before_column],
                ]
                tangent_v = [
                    self.xdata[after_row][column_index]
                    - self.xdata[before_row][column_index],
                    self.ydata[after_row][column_index]
                    - self.ydata[before_row][column_index],
                    self.zdata[after_row][column_index]
                    - self.zdata[before_row][column_index],
                ]
                normal = _cross_product(tangent_u, tangent_v)
                normal_length = runtime.math.sqrt(_dot_product(normal, normal))
                if normal_length <= 1e-15:
                    normal = [0, 0, 1]
                    normal_length = 1
                xrow.append(offset * normal[0] / normal_length)
                yrow.append(offset * normal[1] / normal_length)
                zrow.append(offset * normal[2] / normal_length)
            offset_x.append(xrow)
            offset_y.append(yrow)
            offset_z.append(zrow)

        # Plotly renders each WebGL trace with its own depth buffer behavior.
        # Drawing the grid exactly on the surface can therefore erase every
        # line through z-fighting.  Put the same tiny grid on both sides of
        # the surface so it remains visible from either camera direction.
        for sign in (-1, 1):
            for row_index in range(row_count):
                for column_index in range(column_count):
                    mesh_x.append(
                        self.xdata[row_index][column_index]
                        + sign * offset_x[row_index][column_index]
                    )
                    mesh_y.append(
                        self.ydata[row_index][column_index]
                        + sign * offset_y[row_index][column_index]
                    )
                    mesh_z.append(
                        self.zdata[row_index][column_index]
                        + sign * offset_z[row_index][column_index]
                    )
                mesh_x.append(None)
                mesh_y.append(None)
                mesh_z.append(None)
            for column_index in range(column_count):
                for row_index in range(row_count):
                    mesh_x.append(
                        self.xdata[row_index][column_index]
                        + sign * offset_x[row_index][column_index]
                    )
                    mesh_y.append(
                        self.ydata[row_index][column_index]
                        + sign * offset_y[row_index][column_index]
                    )
                    mesh_z.append(
                        self.zdata[row_index][column_index]
                        + sign * offset_z[row_index][column_index]
                    )
                mesh_x.append(None)
                mesh_y.append(None)
                mesh_z.append(None)
        return runtime.math_tuple([mesh_x, mesh_y, mesh_z])

    def _plot_spec_semantic_layer(
        self,
        ordinal: int,
        source_context: Any = None,
        ordered_options: Any = None,
    ) -> Any:
        """Return a validated layer and fallback reason without recopying it."""
        if bool(_g3d_option_get(self._options, "mesh", False)):
            return runtime.math_tuple([None, "wireframe-companion-trace"])
        if bool(_g3d_option_get(self._options, "dots", False)):
            return runtime.math_tuple([None, "dot-companion-trace"])

        surface_layers = __import__(
            "sagejs.plotting.surface_layers",
            fromlist=[
                "MAX_SURFACE_SAMPLES",
                "layer_payload",
                "lower_3d_geometry_payload",
                "rectangular_surface_layer",
            ],
        )
        row_count = len(self.xdata)
        column_count = 0 if row_count == 0 else len(self.xdata[0])
        sample_count = row_count * column_count
        if sample_count > surface_layers.MAX_SURFACE_SAMPLES:
            raise ValueError(
                "surface exceeds the sample limit of "
                + str(surface_layers.MAX_SURFACE_SAMPLES)
            )

        options = self._options
        color = _g3d_option_get(options, "color", "steelblue")
        style = {
            "color": color,
            "colorbar": bool(_g3d_option_get(options, "colorbar", False)),
            "opacity": float(_g3d_option_get(options, "opacity", 1)),
        }
        legend_label = _g3d_option_get(options, "legend_label")
        try:
            layer = surface_layers.rectangular_surface_layer(
                self.xdata,
                self.ydata,
                self.zdata,
                ordinal=ordinal,
                style=style,
                legend_label=None if legend_label is None else str(legend_label),
                source_intent=_g3d_semantic_source_intent(
                    "Surface3d", source_context, ordered_options
                ),
            )
            payload = surface_layers.layer_payload(layer, reuse_validated_layer=True)
            surface_layers.lower_3d_geometry_payload(payload)
            return runtime.math_tuple([payload, None])
        except TypeError:
            return runtime.math_tuple(
                [None, "surface-geometry-or-style-not-losslessly-representable"]
            )
        except ValueError:
            return runtime.math_tuple(
                [None, "surface-geometry-or-style-not-losslessly-representable"]
            )
        except IndexError:
            return runtime.math_tuple(
                [None, "surface-geometry-or-style-not-losslessly-representable"]
            )

    def _plot_spec_payload(self) -> dict[str, Any]:
        """Return a semantic grid only when no companion trace is required."""
        layer, reason = self._plot_spec_semantic_layer(0)
        if layer is None:
            return self._raw_plot_spec_payload(reason)
        surface_layers = __import__(
            "sagejs.plotting.surface_layers", fromlist=["layer_payload"]
        )
        return surface_layers.layer_payload(layer)

    def _plot_spec_layer(
        self,
        ordinal: int,
        source_context: Any = None,
        ordered_options: Any = None,
    ) -> Any:
        layer, reason = self._plot_spec_semantic_layer(
            ordinal, source_context, ordered_options
        )
        if layer is not None:
            return layer
        return _g3d_plot_spec_layer(
            self._raw_plot_spec_payload(reason),
            ordinal,
            source_context,
            ordered_options,
        )

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        color = _g3d_option_get(options, "color", "steelblue")
        legend_label = _g3d_option_get(options, "legend_label")
        trace = _g3d_native_record(
            type="surface",
            x=self.xdata,
            y=self.ydata,
            z=self.zdata,
            colorscale=_g3d_colorscale(color),
            showscale=bool(_g3d_option_get(options, "colorbar", False)),
            opacity=float(_g3d_option_get(options, "opacity", 1)),
            showlegend=legend_label is not None,
        )
        if legend_label is not None:
            runtime.reflect.set(trace, "name", str(legend_label))
        traces = [trace]
        if bool(_g3d_option_get(options, "mesh", False)):
            wireframe = self._wireframe_coordinates()
            mesh_x = wireframe[0]
            mesh_y = wireframe[1]
            mesh_z = wireframe[2]
            traces.append(
                _g3d_native_record(
                    type="scatter3d",
                    mode="lines",
                    x=mesh_x,
                    y=mesh_y,
                    z=mesh_z,
                    line=_g3d_native_record(
                        color=_g3d_color_value(
                            _g3d_option_get(options, "mesh_color", "black")
                        ),
                        width=float(
                            _g3d_option_get(
                                options,
                                "mesh_thickness",
                                _g3d_option_get(options, "thickness", 1),
                            )
                        ),
                    ),
                    opacity=float(_g3d_option_get(options, "opacity", 1)),
                    hoverinfo="skip",
                    showlegend=False,
                )
            )
        if bool(_g3d_option_get(options, "dots", False)):
            flat_x = []
            flat_y = []
            flat_z = []
            for row_index in range(len(self.xdata)):
                for column_index in range(len(self.xdata[row_index])):
                    flat_x.append(self.xdata[row_index][column_index])
                    flat_y.append(self.ydata[row_index][column_index])
                    flat_z.append(self.zdata[row_index][column_index])
            traces.append(
                _g3d_native_record(
                    type="scatter3d",
                    mode="markers",
                    x=flat_x,
                    y=flat_y,
                    z=flat_z,
                    marker=_g3d_native_record(
                        color=_g3d_color_value(
                            _g3d_option_get(options, "dot_color", "black")
                        ),
                        size=float(_g3d_option_get(options, "dot_size", 2)),
                    ),
                    opacity=float(_g3d_option_get(options, "opacity", 1)),
                    showlegend=False,
                )
            )
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
        return "3D implicit surface sampled at " + str(len(self.values)) + " points"

    __str__ = __repr__
    toString = __repr__

    def _plotly_traces(self) -> list[Any]:
        options = self._options
        tolerance = float(_g3d_option_get(options, "plot_tolerance", 1e-9))
        color = _g3d_option_get(options, "color", "steelblue")
        return [
            _g3d_native_record(
                type="isosurface",
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
                showscale=bool(_g3d_option_get(options, "colorbar", False)),
                opacity=float(_g3d_option_get(options, "opacity", 1)),
                showlegend=False,
            )
        ]


@runtime.sequence_class
class Graphics3d:
    """A composable collection of semantic 3D graphics primitives."""

    def __init__(self) -> None:
        self._objects: list[GraphicPrimitive3d] = []
        self._layer_ordinals: list[int] = []
        self._layer_source_contexts: list[Any] = []
        self._layer_ordered_options: list[Any] = []
        self._next_layer_ordinal = 0
        self._extra_kwds: dict[str, Any] = {}
        self._show_legend = False
        self._plot_spec_provenance: Any = {
            "frontend": "sagejs",
            "source_language": "sage",
            "constructor": "Graphics3d",
        }
        self._plot_spec_diagnostics: list[Any] = []

    def __len__(self) -> int:
        return len(self._objects)

    def __iter__(self) -> Iterator[GraphicPrimitive3d]:
        return iter(self._objects)

    def __getitem__(self, index: int) -> GraphicPrimitive3d:
        return self._objects[index]

    def __repr__(self) -> str:
        return "Graphics3d Object"

    __str__ = __repr__
    toString = __repr__

    def add_primitive(self, primitive: GraphicPrimitive3d) -> None:
        self._add_primitive_with_ordinal(primitive, None)

    def _add_primitive_with_ordinal(
        self,
        primitive: GraphicPrimitive3d,
        preferred_ordinal: int | None,
        source_context: Any = None,
        ordered_options: Any = None,
    ) -> None:
        ordinal = preferred_ordinal
        if ordinal is None or ordinal in self._layer_ordinals:
            ordinal = self._next_layer_ordinal
            while ordinal in self._layer_ordinals:
                ordinal += 1
        self._objects.append(primitive)
        self._layer_ordinals.append(ordinal)
        self._layer_source_contexts.append(source_context)
        self._layer_ordered_options.append(
            [] if ordered_options is None else list(ordered_options)
        )
        if ordinal >= self._next_layer_ordinal:
            self._next_layer_ordinal = ordinal + 1
        if _g3d_option_get(primitive.options(), "legend_label") is not None:
            self._show_legend = True

    def set_extra_kwds(self, keywords: dict[str, Any]) -> None:
        for key in keywords:
            self._extra_kwds[key] = keywords[key]

    def _set_extra_kwd(self, name: str, value: Any) -> None:
        """Set one frontend option across strict-module call boundaries."""
        self.set_extra_kwds({name: value})

    def get_extra_kwds(self) -> dict[str, Any]:
        return _g3d_copy_options(self._extra_kwds)

    def with_plot_spec_context(
        self,
        provenance: Any = None,
        source_intent: Any = None,
        ordered_options: Any = None,
        diagnostics: Any = None,
    ) -> Graphics3d:
        """Return a shallow clone carrying detached frontend PlotSpec context."""
        answer = Graphics3d()
        for index in range(len(self._objects)):
            context = self._layer_source_contexts[index]
            if source_intent is not None:
                new_context = _g3d_plot_spec_json_value(source_intent)
                if context is not None:
                    new_context.__setitem__(
                        "child_context", _g3d_plot_spec_json_value(context)
                    )
                context = new_context
            options = list(self._layer_ordered_options[index])
            if ordered_options is not None:
                options += list(ordered_options)
            answer._add_primitive_with_ordinal(
                self._objects[index],
                self._layer_ordinals[index],
                context,
                options,
            )
        answer.set_extra_kwds(self._extra_kwds)
        answer._show_legend = self._show_legend
        answer._plot_spec_provenance = (
            self._plot_spec_provenance
            if provenance is None
            else _g3d_plot_spec_json_value(provenance)
        )
        answer._plot_spec_diagnostics = list(self._plot_spec_diagnostics)
        if diagnostics is not None:
            for diagnostic in diagnostics:
                answer._plot_spec_diagnostics.append(
                    _g3d_plot_spec_json_value(diagnostic)
                )
        return answer

    def __add__(self, other: object) -> Graphics3d:
        if not isinstance(other, Graphics3d):
            raise TypeError("can only add Graphics3d to Graphics3d")
        answer = Graphics3d()
        for index in range(len(self._objects)):
            answer._add_primitive_with_ordinal(
                self._objects[index],
                self._layer_ordinals[index],
                self._layer_source_contexts[index],
                self._layer_ordered_options[index],
            )
        for index in range(len(other._objects)):
            answer._add_primitive_with_ordinal(
                other._objects[index],
                other._layer_ordinals[index],
                other._layer_source_contexts[index],
                other._layer_ordered_options[index],
            )
        answer.set_extra_kwds(self._extra_kwds)
        answer.set_extra_kwds(other._extra_kwds)
        answer._show_legend = self._show_legend or other._show_legend
        if self._plot_spec_provenance == other._plot_spec_provenance:
            answer._plot_spec_provenance = self._plot_spec_provenance
        else:
            answer._plot_spec_provenance = {
                "frontend": "sagejs",
                "constructor": "composition",
                "metadata": {
                    "children": [
                        self._plot_spec_provenance,
                        other._plot_spec_provenance,
                    ]
                },
            }
        answer._plot_spec_diagnostics = list(self._plot_spec_diagnostics)
        answer._plot_spec_diagnostics += list(other._plot_spec_diagnostics)
        return answer

    def __radd__(self, other: object) -> Graphics3d:
        if other == 0:
            return self
        if isinstance(other, Graphics3d):
            return other + self
        raise TypeError("can only add Graphics3d to Graphics3d")

    def translate(self, *offset: Any) -> Graphics3d:
        r"""
        Return a copy translated by a three-dimensional vector.

        The vector may be supplied either as one iterable or as three
        positional coordinates.  Translation applies to every primitive in
        a composite graphic, including surfaces, meshes and their visible
        wireframes.

        EXAMPLES::

            sage: shifted = icosahedron().translate((0, 0, 0.5))
            sage: shifted
            Graphics3d Object
            sage: line3d([(0, 0, 0), (1, 2, 3)]).translate(4, 5, 6)
            Graphics3d Object
        """
        if len(offset) == 1:
            vector_value = offset[0]
        else:
            vector_value = offset
        vector = _g3d_point(vector_value)
        answer = Graphics3d()
        answer.set_extra_kwds(self._extra_kwds)
        answer._show_legend = self._show_legend
        for index in range(len(self._objects)):
            answer._add_primitive_with_ordinal(
                TranslatedPrimitive3d(self._objects[index], vector),
                self._layer_ordinals[index],
                self._layer_source_contexts[index],
                self._layer_ordered_options[index],
            )
        answer._plot_spec_provenance = self._plot_spec_provenance
        answer._plot_spec_diagnostics = list(self._plot_spec_diagnostics)
        return answer

    def transform(self, **options: Any) -> Graphics3d:
        r"""Apply Sage's scale, rotation, and translation transformation."""
        scale_value = _g3d_option_get(options, "scale", (1, 1, 1))
        if isinstance(scale_value, (list, tuple)):
            if len(scale_value) == 1:
                uniform_scale = float(scale_value[0])
                scale = [uniform_scale, uniform_scale, uniform_scale]
            elif len(scale_value) == 3:
                scale = [
                    float(scale_value[0]),
                    float(scale_value[1]),
                    float(scale_value[2]),
                ]
            else:
                raise ValueError("scale must be a number or three coordinates")
        else:
            uniform_scale = float(scale_value)
            scale = [uniform_scale, uniform_scale, uniform_scale]

        matrix = [
            [scale[0], 0.0, 0.0],
            [0.0, scale[1], 0.0],
            [0.0, 0.0, scale[2]],
        ]
        rotation = _g3d_option_get(options, "rot")
        if rotation is not None:
            if not isinstance(rotation, (list, tuple)) or len(rotation) != 4:
                raise ValueError("rot must contain an axis and an angle")
            axis_x = float(rotation[0])
            axis_y = float(rotation[1])
            axis_z = float(rotation[2])
            length = runtime.math.sqrt(
                axis_x * axis_x + axis_y * axis_y + axis_z * axis_z
            )
            if length == 0:
                raise ValueError("rotation axis must be nonzero")
            axis_x /= length
            axis_y /= length
            axis_z /= length
            angle = float(rotation[3])
            cosine = runtime.math.cos(angle)
            sine = runtime.math.sin(angle)
            complement = 1.0 - cosine
            rotation_matrix = [
                [
                    cosine + axis_x * axis_x * complement,
                    axis_x * axis_y * complement - axis_z * sine,
                    axis_x * axis_z * complement + axis_y * sine,
                ],
                [
                    axis_y * axis_x * complement + axis_z * sine,
                    cosine + axis_y * axis_y * complement,
                    axis_y * axis_z * complement - axis_x * sine,
                ],
                [
                    axis_z * axis_x * complement - axis_y * sine,
                    axis_z * axis_y * complement + axis_x * sine,
                    cosine + axis_z * axis_z * complement,
                ],
            ]
            matrix = [
                [
                    sum(
                        rotation_matrix[row][inner] * matrix[inner][column]
                        for inner in range(3)
                    )
                    for column in range(3)
                ]
                for row in range(3)
            ]

        translation = _g3d_option_get(
            options, "trans", _g3d_option_get(options, "translation", (0, 0, 0))
        )
        offset = _g3d_point(translation)
        answer = Graphics3d()
        answer.set_extra_kwds(self._extra_kwds)
        answer._show_legend = self._show_legend
        for index in range(len(self._objects)):
            answer._add_primitive_with_ordinal(
                TransformedPrimitive3d(self._objects[index], matrix, offset),
                self._layer_ordinals[index],
                self._layer_source_contexts[index],
                self._layer_ordered_options[index],
            )
        answer._plot_spec_provenance = self._plot_spec_provenance
        answer._plot_spec_diagnostics = list(self._plot_spec_diagnostics)
        return answer

    def scale(self, *factors: Any) -> Graphics3d:
        """Scale uniformly or independently in the three coordinates."""
        if len(factors) == 1:
            scale_value = factors[0]
        else:
            scale_value = factors
        return self.transform(scale=scale_value)

    def rotate(self, axis: Any, theta: Any) -> Graphics3d:
        """Rotate by `theta` radians about `axis`."""
        vector = _g3d_point(axis)
        return self.transform(rot=(vector[0], vector[1], vector[2], theta))

    def rotateX(self, theta: Any) -> Graphics3d:
        return self.rotate((1, 0, 0), theta)

    def rotateY(self, theta: Any) -> Graphics3d:
        return self.rotate((0, 1, 0), theta)

    def rotateZ(self, theta: Any) -> Graphics3d:
        return self.rotate((0, 0, 1), theta)

    def bounding_box(self) -> Any:
        """Return lower and upper corners containing all rendered vertices."""
        coordinates = [[], [], []]
        for primitive in self._objects:
            for trace in primitive._plotly_traces():
                for index, name in enumerate(("x", "y", "z")):
                    if runtime.reflect.has(trace, name):
                        coordinates[index] += _g3d_flatten_numeric(
                            runtime.reflect.get(trace, name)
                        )
        if any(len(values) == 0 for values in coordinates):
            return runtime.math_tuple(
                [
                    runtime.math_tuple([0.0, 0.0, 0.0]),
                    runtime.math_tuple([0.0, 0.0, 0.0]),
                ]
            )
        return runtime.math_tuple(
            [
                runtime.math_tuple([min(values) for values in coordinates]),
                runtime.math_tuple([max(values) for values in coordinates]),
            ]
        )

    def show(self, **options: Any) -> Graphics3d:
        """Apply display options and return this rich-display object."""
        self.set_extra_kwds(_g3d_graphics_options(options))
        return self

    def _plotly_layout(self) -> Any:
        options = self._extra_kwds
        xaxis = _g3d_native_object()
        yaxis = _g3d_native_object()
        zaxis = _g3d_native_object()
        scene = _g3d_native_record(
            xaxis=xaxis,
            yaxis=yaxis,
            zaxis=zaxis,
            dragmode="orbit",
            camera=_g3d_camera(options),
        )
        layout = _g3d_native_record(
            autosize=True,
            showlegend=self._show_legend,
            scene=scene,
        )
        title = _g3d_option_get(options, "title")
        if title is not None:
            runtime.reflect.set(layout, "title", _g3d_native_record(text=str(title)))

        axes_labels = _g3d_option_get(options, "axes_labels")
        if isinstance(axes_labels, (list, tuple)) and len(axes_labels) == 3:
            runtime.reflect.set(
                xaxis, "title", _g3d_native_record(text=str(axes_labels[0]))
            )
            runtime.reflect.set(
                yaxis, "title", _g3d_native_record(text=str(axes_labels[1]))
            )
            runtime.reflect.set(
                zaxis, "title", _g3d_native_record(text=str(axes_labels[2]))
            )

        visible = bool(
            _g3d_option_get(
                options,
                "frame",
                _g3d_option_get(options, "axes", True),
            )
        )
        for axis in (xaxis, yaxis, zaxis):
            runtime.reflect.set(axis, "visible", visible)

        ratio = _g3d_option_get(options, "aspect_ratio", "automatic")
        if ratio in ("auto", "automatic"):
            runtime.reflect.set(scene, "aspectmode", "data")
        elif isinstance(ratio, (list, tuple)):
            if len(ratio) != 3:
                raise ValueError("3D aspect_ratio must have exactly three entries")
            factors = [float(value) for value in ratio]
            if any(value <= 0 for value in factors):
                raise ValueError("3D aspect_ratio entries must be positive")
            if factors[0] == factors[1] == factors[2]:
                # Sage's ratio measures display units per coordinate unit.
                # Plotly's ``data`` mode has precisely that interpretation;
                # a manual (1,1,1) instead forces the whole bounding box into
                # a cube and visibly distorts objects in unequal ranges.
                runtime.reflect.set(scene, "aspectmode", "data")
            else:
                bounds = self.bounding_box()
                spans = [
                    float(bounds[1][index] - bounds[0][index]) for index in range(3)
                ]
                positive_spans = [value for value in spans if value > 0]
                fallback_span = min(positive_spans) if len(positive_spans) else 1.0
                lengths = [
                    (spans[index] if spans[index] > 0 else fallback_span)
                    * factors[index]
                    for index in range(3)
                ]
                scale = max(lengths)
                runtime.reflect.set(scene, "aspectmode", "manual")
                runtime.reflect.set(
                    scene,
                    "aspectratio",
                    _g3d_native_record(
                        x=lengths[0] / scale,
                        y=lengths[1] / scale,
                        z=lengths[2] / scale,
                    ),
                )
        else:
            numeric_ratio = float(ratio)
            if numeric_ratio <= 0:
                raise ValueError("3D aspect_ratio must be positive")
            bounds = self.bounding_box()
            spans = [float(bounds[1][index] - bounds[0][index]) for index in range(3)]
            positive_spans = [value for value in spans if value > 0]
            fallback_span = min(positive_spans) if len(positive_spans) else 1.0
            lengths = [
                spans[0] if spans[0] > 0 else fallback_span,
                spans[1] if spans[1] > 0 else fallback_span,
                (spans[2] if spans[2] > 0 else fallback_span) * numeric_ratio,
            ]
            scale = max(lengths)
            runtime.reflect.set(scene, "aspectmode", "manual")
            runtime.reflect.set(
                scene,
                "aspectratio",
                _g3d_native_record(
                    x=lengths[0] / scale,
                    y=lengths[1] / scale,
                    z=lengths[2] / scale,
                ),
            )

        figsize = _g3d_option_get(options, "figsize")
        if figsize is not None:
            width, height = _g3d_parse_figsize(figsize)
            runtime.reflect.set(layout, "width", int(width * 100))
            runtime.reflect.set(layout, "height", int(height * 100))
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

    def spec(self) -> Any:
        """Return a stable, JSON-safe semantic description of this plot."""
        plotting = __import__("sagejs.plotting", fromlist=["PlotSpec"])
        plot_spec_class = plotting.PlotSpec

        layers = []
        for index in range(len(self._objects)):
            layers.append(
                self._objects[index]._plot_spec_layer(
                    self._layer_ordinals[index],
                    self._layer_source_contexts[index],
                    self._layer_ordered_options[index],
                )
            )
        layout = _g3d_plot_spec_json_value(self._plotly_layout())
        viewport = {}
        if "width" in layout:
            viewport["width"] = layout.__getitem__("width")
        if "height" in layout:
            viewport["height"] = layout.__getitem__("height")
        scene = dict()
        scene.__setitem__("coordinate_system", "cartesian")
        scene.__setitem__("scene", layout.get("scene", dict()))
        overrides = dict()
        overrides.__setitem__("layout", layout)
        overrides.__setitem__(
            "config",
            _g3d_plot_spec_json_value({"displaylogo": False, "responsive": True}),
        )
        record = dict()
        record.__setitem__("schema_version", plotting.PLOTSPEC_SCHEMA_VERSION)
        record.__setitem__("dimension", 3)
        record.__setitem__("layers", layers)
        record.__setitem__("axes_or_scene", scene)
        record.__setitem__("viewport", _g3d_plot_spec_json_value(viewport))
        record.__setitem__("theme", "notebook")
        record.__setitem__("annotations", [])
        record.__setitem__("interactions", dict())
        record.__setitem__("animation", dict())
        record.__setitem__(
            "provenance", _g3d_plot_spec_json_value(self._plot_spec_provenance)
        )
        record.__setitem__(
            "diagnostics",
            [_g3d_plot_spec_json_value(value) for value in self._plot_spec_diagnostics],
        )
        record.__setitem__("plotly_overrides", overrides)
        return plot_spec_class.from_dict(record)

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
            runtime.global_object, "__sagejs_graphics_save_hook__"
        )
        if hook is runtime.undefined:
            raise NotImplementedError(
                "graphics file export is not available in this host"
            )
        runtime.reflect.apply(
            hook,
            runtime.undefined,
            [self, filename, options],
        )
        return self


def line3d(points: Any, **options: Any) -> Graphics3d:
    """Return a line through three-dimensional `points`."""
    options = _g3d_copy_options(options)
    normalized = _g3d_normalize_points(points)
    arrow_head = bool(_g3d_option_pop(options, "arrow_head", False))
    defaults = {
        "opacity": 1,
        "rgbcolor": [0, 0, 1],
        "thickness": 2,
        "legend_label": None,
    }
    if _g3d_option_has(options, "alpha") and not _g3d_option_has(options, "opacity"):
        options["opacity"] = _g3d_option_pop(options, "alpha")
    if _g3d_option_has(options, "color") and not _g3d_option_has(options, "rgbcolor"):
        options["rgbcolor"] = _g3d_option_pop(options, "color")
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Line3d(
            [value[0] for value in normalized],
            [value[1] for value in normalized],
            [value[2] for value in normalized],
            defaults,
        )
    )
    if arrow_head and len(normalized) >= 2:
        graphic.add_primitive(Arrowhead3d(normalized[-2], normalized[-1], defaults))
    return graphic


def point3d(points: Any, **options: Any) -> Graphics3d:
    """Return one or more points in three-dimensional space."""
    options = _g3d_copy_options(options)
    normalized = _g3d_normalize_points(points)
    defaults = {
        "opacity": 1,
        "rgbcolor": [0, 0, 1],
        "size": 5,
        "legend_label": None,
        "marker": "circle",
    }
    if _g3d_option_has(options, "alpha") and not _g3d_option_has(options, "opacity"):
        options["opacity"] = _g3d_option_pop(options, "alpha")
    if _g3d_option_has(options, "color") and not _g3d_option_has(options, "rgbcolor"):
        options["rgbcolor"] = _g3d_option_pop(options, "color")
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Point3d(
            [value[0] for value in normalized],
            [value[1] for value in normalized],
            [value[2] for value in normalized],
            defaults,
        )
    )
    return graphic


def _g3d_mesh(
    faces: Any,
    points: Any,
    **options: Any,
) -> Graphics3d:
    normalized = [_g3d_point(point_value) for point_value in points]
    normalized_faces = [[int(index) for index in face] for face in faces]
    if len(normalized) == 0:
        raise ValueError("a 3D mesh requires at least one vertex")
    for face in normalized_faces:
        if len(face) < 3:
            raise ValueError("each 3D mesh face needs at least three vertices")
        for index in face:
            if index < 0 or index >= len(normalized):
                raise IndexError("3D mesh face index is out of range")
    options = _g3d_copy_options(options)
    defaults = {
        "color": [0, 0, 1],
        "opacity": 1,
        "legend_label": None,
        "threejs_flat_shading": True,
    }
    if _g3d_option_has(options, "alpha") and not _g3d_option_has(options, "opacity"):
        options["opacity"] = _g3d_option_pop(options, "alpha")
    if _g3d_option_has(options, "rgbcolor") and not _g3d_option_has(options, "color"):
        options["color"] = _g3d_option_pop(options, "rgbcolor")
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Mesh3d(normalized, normalized_faces, defaults))
    return graphic


class IndexFaceSet(Graphics3d):
    r"""A Sage-compatible indexed collection of polygonal faces.

    Faces may be specified either by indices into `point_list` or directly as
    lists of three-dimensional points.  The latter form automatically shares
    equal vertices, matching Sage's constructor.

    ### Examples

    ```sage
    sage: S = IndexFaceSet([[(1,0,0), (0,1,0), (0,0,1)]])
    sage: S.index_faces()
    [[0, 1, 2]]
    sage: S.vertex_list()
    [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    ```
    """

    def __init__(
        self,
        faces: Any,
        point_list: Any = None,
        enclosed: bool = False,
        texture_list: Any = None,
        **options: Any,
    ) -> None:
        face_values = [list(face) for face in faces]
        if point_list is None:
            vertices = []
            indexed_faces = []
            point_indices = {}
            for face in face_values:
                indexed_face = []
                for point_value in face:
                    point = _g3d_point(point_value)
                    key = str(point[0]) + ":" + str(point[1]) + ":" + str(point[2])
                    if key not in point_indices:
                        point_indices[key] = len(vertices)
                        vertices.append(point)
                    indexed_face.append(point_indices[key])
                indexed_faces.append(indexed_face)
        else:
            vertices = [_g3d_point(point) for point in point_list]
            indexed_faces = [[int(index) for index in face] for face in face_values]
        actual_options = _g3d_copy_options(options)
        self._texture_list = None
        if texture_list is not None:
            textures = list(texture_list)
            if len(textures) != len(indexed_faces):
                raise ValueError("texture_list must contain one texture for every face")
            face_colors = []
            for texture in textures:
                color = texture
                if hasattr(texture, "color"):
                    color = texture.color
                    if callable(color):
                        color = color()
                elif hasattr(texture, "rgbcolor"):
                    color = texture.rgbcolor
                    if callable(color):
                        color = color()
                face_colors.append(color)
            actual_options["color"] = face_colors
            self._texture_list = face_colors
        built = _g3d_mesh(indexed_faces, vertices, **actual_options)
        Graphics3d.__init__(self)
        self.set_extra_kwds(built.get_extra_kwds())
        for primitive in built:
            self.add_primitive(primitive)
        mesh = built[0]
        if not isinstance(mesh, Mesh3d):
            raise RuntimeError("IndexFaceSet did not produce a mesh")
        self._mesh = mesh
        self._enclosed = bool(enclosed)

    def index_faces(self) -> list[list[int]]:
        """Return faces as lists of indices into `vertex_list()`."""
        return [list(face) for face in self._mesh.faces]

    def face_list(self, render_params: Any = None) -> Any:
        """Return every face as a list of three-dimensional vertices."""
        if render_params is not None:
            raise NotImplementedError(
                "transformed IndexFaceSet render parameters are unsupported"
            )
        return [
            [self._mesh.vertices[index] for index in face] for face in self._mesh.faces
        ]

    def vertex_list(self) -> Any:
        """Return the shared list of vertices."""
        return list(self._mesh.vertices)

    def faces(self) -> Any:
        return iter(self.face_list())

    def vertices(self) -> Any:
        return iter(self.vertex_list())

    def edge_list(self) -> Any:
        """Return each unoriented mesh edge exactly once."""
        edges = {}
        for face in self._mesh.faces:
            for position in range(len(face)):
                left = int(face[position])
                right = int(face[(position + 1) % len(face)])
                lower = min(left, right)
                upper = max(left, right)
                key = str(lower) + ":" + str(upper)
                if key not in edges:
                    edges[key] = runtime.math_tuple(
                        [
                            self._mesh.vertices[left],
                            self._mesh.vertices[right],
                        ]
                    )
        return [edges[key] for key in edges]

    def edges(self) -> Any:
        return iter(self.edge_list())

    def is_enclosed(self) -> bool:
        return self._enclosed

    def has_local_colors(self) -> bool:
        return self._texture_list is not None


def polygon3d(points: Any, **options: Any) -> Graphics3d:
    """Draw a single polygon with vertices in three-dimensional space."""
    normalized = list(points)
    return _g3d_mesh([list(range(len(normalized)))], normalized, **options)


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
        "color": [0, 0, 1],
        "opacity": 1,
        "fontsize": 14,
    }
    options = _g3d_copy_options(options)
    if _g3d_option_has(options, "alpha") and not _g3d_option_has(options, "opacity"):
        options["opacity"] = _g3d_option_pop(options, "alpha")
    if _g3d_option_has(options, "rgbcolor") and not _g3d_option_has(options, "color"):
        options["color"] = _g3d_option_pop(options, "rgbcolor")
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Text3d(str(string), _g3d_point(position), defaults))
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
    """Draw an arrow from `start` to `end` in three dimensions."""
    start_point = _g3d_point(start)
    end_point = _g3d_point(end)
    if start_point == end_point:
        raise ValueError("an arrow must have distinct start and end points")
    options = _g3d_copy_options(options)
    if not _g3d_option_has(options, "thickness"):
        options["thickness"] = float(width)
    if radius is not None:
        options["radius"] = float(radius)
    if head_radius is not None:
        options["head_radius"] = float(head_radius)
    if head_len is not None:
        options["head_len"] = float(head_len)
    graphic = line3d([start_point, end_point], **options)
    head_options = _g3d_copy_options(options)
    if _g3d_option_has(head_options, "rgbcolor") and not _g3d_option_has(
        head_options, "color"
    ):
        head_options["color"] = _g3d_option_get(head_options, "rgbcolor")
    graphic.add_primitive(Arrowhead3d(start_point, end_point, head_options))
    return graphic


def bezier3d(path: Any, **options: Any) -> Graphics3d:
    r"""
    Draw a three-dimensional Bézier path.

    The first curve contains both endpoints. Later curves inherit their
    starting point from the previous curve. Each curve may have zero, one,
    or two control points, matching Sage's `bezier3d` path convention.

    ### Examples

    ```sage
    sage: path = [[(0,0,0), (.5,.1,.2), (.75,3,-1), (1,1,0)],
    ....:         [(.5,1,.2), (1,.5,0)], [(.7,.2,.5)]]
    sage: bezier3d(path, color='green')
    Graphics3d Object
    ```
    """
    curves = [list(curve) for curve in path]
    if len(curves) == 0 or len(curves[0]) < 2:
        raise ValueError("the first bezier3d curve requires at least two points")
    plot_points = int(_g3d_option_pop(options, "plot_points", 40))
    if plot_points < 2:
        raise ValueError("plot_points must be at least 2")
    normalized = [
        [_g3d_point(point_value) for point_value in curve] for curve in curves
    ]

    def cubic_point(
        start: tuple[float, float, float],
        control1: tuple[float, float, float],
        control2: tuple[float, float, float],
        end: tuple[float, float, float],
        parameter: float,
    ) -> tuple[float, float, float]:
        complement = 1.0 - parameter
        coefficients = (
            complement * complement * complement,
            3.0 * parameter * complement * complement,
            3.0 * parameter * parameter * complement,
            parameter * parameter * parameter,
        )
        values = [
            coefficients[0] * start[index]
            + coefficients[1] * control1[index]
            + coefficients[2] * control2[index]
            + coefficients[3] * end[index]
            for index in range(3)
        ]
        return (values[0], values[1], values[2])

    result = Graphics3d()
    previous = normalized[0][0]
    for index in range(len(normalized)):
        curve = normalized[index]
        if index == 0:
            start = curve[0]
            controls = curve[1:-1]
            end = curve[-1]
        else:
            if len(curve) == 0:
                raise ValueError("a bezier3d curve may not be empty")
            start = previous
            controls = curve[:-1]
            end = curve[-1]
        if len(controls) == 0:
            segment = line3d([start, end], **options)
        else:
            if len(controls) > 2:
                raise ValueError("a bezier3d curve has at most two control points")
            control1 = controls[0]
            control2 = controls[-1]
            points = [
                tuple(cubic_point(start, control1, control2, end, parameter))
                for parameter in _g3d_linspace(0.0, 1.0, plot_points)
            ]
            segment = line3d(points, **options)
        result = result + segment
        previous = end
    return result


def plot_vector_field3d(
    functions: Sequence[Any],
    xrange: Any,
    yrange: Any,
    zrange: Any,
    plot_points: Any = 5,
    colors: Any = "jet",
    center_arrows: bool = False,
    **options: Any,
) -> Graphics3d:
    r"""
    Plot a sampled vector field in three-dimensional space.

    Vectors are normalized by the largest sampled norm, as in Sage. A single
    Plotly cone trace keeps even fairly dense fields responsive. Set
    `center_arrows=True` to center each arrow at its sample point.

    ### Examples

    ```sage
    sage: x, y, z = var('x y z')
    sage: plot_vector_field3d((x*cos(z), -y*cos(z), sin(z)),
    ....:     (x,0,pi), (y,0,pi), (z,0,pi), plot_points=4)
    Graphics3d Object
    ```
    """
    components = list(functions)
    if len(components) != 3:
        raise ValueError("plot_vector_field3d requires exactly three components")
    parsed_ranges = [_g3d_range(xrange), _g3d_range(yrange), _g3d_range(zrange)]
    variables = _g3d_variables(
        components,
        [range_value[0] for range_value in parsed_ranges],
        3,
    )
    callables = [
        _g3d_component_callable(component, variables) for component in components
    ]
    counts = _g3d_plot_points(plot_points, 5, 3)
    coordinates = [
        _g3d_linspace(
            parsed_ranges[index][1],
            parsed_ranges[index][2],
            counts[index],
        )
        for index in range(3)
    ]
    points = []
    vectors = []
    magnitudes = []
    maximum = 0.0
    for xvalue in coordinates[0]:
        for yvalue in coordinates[1]:
            for zvalue in coordinates[2]:
                point_value = (xvalue, yvalue, zvalue)
                vector_value = (
                    _g3d_finite_value(callables[0](*point_value)),
                    _g3d_finite_value(callables[1](*point_value)),
                    _g3d_finite_value(callables[2](*point_value)),
                )
                magnitude = runtime.math.sqrt(
                    vector_value[0] * vector_value[0]
                    + vector_value[1] * vector_value[1]
                    + vector_value[2] * vector_value[2]
                )
                points.append(point_value)
                vectors.append(vector_value)
                magnitudes.append(magnitude)
                maximum = max(maximum, magnitude)
    if maximum > 0:
        scaled_vectors = [
            (vector[0] / maximum, vector[1] / maximum, vector[2] / maximum)
            for vector in vectors
        ]
        scaled_magnitudes = [value / maximum for value in magnitudes]
    else:
        scaled_vectors = vectors
        scaled_magnitudes = magnitudes

    options = _g3d_copy_options(options)
    defaults = {
        "colors": colors,
        "center_arrows": bool(center_arrows),
        "opacity": 1,
        "scale": 1,
        "colorbar": False,
        "aspect_ratio": [1, 1, 1],
    }
    if _g3d_option_has(options, "alpha") and not _g3d_option_has(options, "opacity"):
        options["opacity"] = _g3d_option_pop(options, "alpha")
    if _g3d_option_has(options, "color"):
        defaults["colors"] = _g3d_option_pop(options, "color")
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        VectorField3d(points, scaled_vectors, scaled_magnitudes, defaults)
    )
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
                vertices.append(runtime.math_tuple([xvalue, yvalue, zvalue]))
    edges = [
        [0, 1],
        [0, 2],
        [0, 4],
        [1, 3],
        [1, 5],
        [2, 3],
        [2, 6],
        [3, 7],
        [4, 5],
        [4, 6],
        [5, 7],
        [6, 7],
    ]
    answer = Graphics3d()
    for edge in edges:
        answer = answer + line3d([vertices[edge[0]], vertices[edge[1]]], **options)
    return answer


def frame_labels(
    lower_left: Any,
    upper_right: Any,
    label_lower_left: Any,
    label_upper_right: Any,
    eps: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Draw Sage-style endpoint and midpoint labels around a 3D frame."""
    lower = _g3d_point(lower_left)
    upper = _g3d_point(upper_right)
    label_lower = _g3d_point(label_lower_left)
    label_upper = _g3d_point(label_upper_right)
    if any(label_upper[index] <= label_lower[index] for index in range(3)):
        raise ValueError(
            "ensure the upper right labels are above and to the right of "
            "the lower left labels"
        )
    distance = float(eps)
    color = _g3d_option_get(options, "color", (0.3, 0.3, 0.3))
    text_options = _g3d_copy_options(options)
    text_options["color"] = color
    answer = Graphics3d()
    for index in range(3):
        midpoint = (label_lower[index] + label_upper[index]) / 2.0
        values = [label_lower[index], midpoint, label_upper[index]]
        for position_index in range(3):
            fraction = position_index / 2.0
            xvalue = lower[0] + fraction * (upper[0] - lower[0])
            yvalue = lower[1] + fraction * (upper[1] - lower[1])
            zvalue = lower[2] + fraction * (upper[2] - lower[2])
            if index == 0:
                position = (xvalue, lower[1] - distance, lower[2])
            elif index == 1:
                position = (upper[0] + distance, yvalue, lower[2])
            else:
                position = (lower[0] - distance, lower[1], zvalue)
            answer += text3d(str(values[position_index]), position, **text_options)
    return answer


def ruler(
    start: Any,
    end: Any,
    ticks: int = 4,
    sub_ticks: int = 4,
    absolute: bool = False,
    snap: bool = False,
    **options: Any,
) -> Graphics3d:
    """Draw a three-dimensional ruler with labeled major and minor ticks."""
    if ticks <= 0 or sub_ticks <= 0:
        raise ValueError("ticks and sub_ticks must be positive")
    start_point = list(_g3d_point(start))
    end_point = list(_g3d_point(end))
    direction = [end_point[index] - start_point[index] for index in range(3)]
    distance = runtime.math.sqrt(sum(value * value for value in direction))
    if distance == 0:
        raise ValueError("a ruler must have distinct start and end points")
    direction = [value / distance for value in direction]
    one_tick = distance / float(ticks) * 1.414
    unit = 10 ** runtime.math.floor(
        runtime.math.log(distance / float(ticks)) / runtime.math.log(10)
    )
    if unit * 5 < one_tick:
        unit *= 5
    elif unit * 2 < one_tick:
        unit *= 2
    if direction[0] != 0:
        tick_vector = _cross_product(direction, (0, 0, -distance / 30.0))
    elif direction[1] != 0:
        tick_vector = _cross_product(direction, (0, 0, distance / 30.0))
    else:
        tick_vector = (distance / 30.0, 0, 0)
    if snap:
        for index in range(3):
            start_point[index] = unit * runtime.math.floor(
                start_point[index] / unit + 1e-5
            )
            end_point[index] = unit * runtime.math.ceil(end_point[index] / unit - 1e-5)
        direction = [end_point[index] - start_point[index] for index in range(3)]
        distance = runtime.math.sqrt(sum(value * value for value in direction))
        direction = [value / distance for value in direction]
    first_tick = 0.0
    offset = 0.0
    if absolute:
        nonzero = sum(1 for value in direction if abs(value) > 1e-12)
        if nonzero != 1:
            raise ValueError("absolute rulers only valid for axis-aligned paths")
        axis = max(range(3), key=lambda index: abs(direction[index]))
        offset = start_point[axis]
        first_tick = unit * runtime.math.ceil(offset / unit - 1e-5) - offset
    answer = line3d([start_point, end_point], **options)
    current_distance = first_tick
    while current_distance <= distance + unit / float(sub_ticks + 1):
        base = [
            start_point[index] + direction[index] * current_distance
            for index in range(3)
        ]
        tick_end = [base[index] + tick_vector[index] for index in range(3)]
        answer += line3d([base, tick_end], **options)
        label_position = [base[index] - tick_vector[index] for index in range(3)]
        answer += text3d(str(current_distance + offset), label_position, **options)
        for minor_index in range(1, sub_ticks):
            minor_distance = current_distance + unit * minor_index / sub_ticks
            if minor_distance >= distance:
                break
            minor_base = [
                start_point[index] + direction[index] * minor_distance
                for index in range(3)
            ]
            minor_end = [
                minor_base[index] + tick_vector[index] / 2.0 for index in range(3)
            ]
            answer += line3d([minor_base, minor_end], **options)
        current_distance += unit
    return answer


def ruler_frame(
    lower_left: Any,
    upper_right: Any,
    ticks: int = 4,
    sub_ticks: int = 4,
    **options: Any,
) -> Graphics3d:
    """Draw three axis-aligned rulers from the lower frame corner."""
    lower = _g3d_point(lower_left)
    upper = _g3d_point(upper_right)
    return (
        ruler(
            lower,
            (upper[0], lower[1], lower[2]),
            ticks=ticks,
            sub_ticks=sub_ticks,
            absolute=True,
            **options,
        )
        + ruler(
            lower,
            (lower[0], upper[1], lower[2]),
            ticks=ticks,
            sub_ticks=sub_ticks,
            absolute=True,
            **options,
        )
        + ruler(
            lower,
            (lower[0], lower[1], upper[2]),
            ticks=ticks,
            sub_ticks=sub_ticks,
            absolute=True,
            **options,
        )
    )


def axes(
    scale: Any = 1,
    radius: Any = None,
    **options: Any,
) -> Graphics3d:
    """Create the three positive coordinate axes as 3D arrows."""
    length = float(scale)
    head_size = length / 100.0 if radius is None else float(radius)
    return (
        arrow3d((0, 0, 0), (length, 0, 0), head_len=head_size, **options)
        + arrow3d((0, 0, 0), (0, length, 0), head_len=head_size, **options)
        + arrow3d((0, 0, 0), (0, 0, length), head_len=head_size, **options)
    )


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
        raise ValueError("solid size must be positive")
    transformed = [
        runtime.math_tuple(
            [
                center_point[0] + scale * float(vertex[0]),
                center_point[1] + scale * float(vertex[1]),
                center_point[2] + scale * float(vertex[2]),
            ]
        )
        for vertex in vertices
    ]
    if not _g3d_option_has(options, "aspect_ratio"):
        options["aspect_ratio"] = [1, 1, 1]
    return _g3d_mesh(faces, transformed, **options)


def tetrahedron(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a regular tetrahedron centered at `center`."""
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
    """Return a cube centered at `center` with side length `size`."""
    vertices = [
        [-0.5, -0.5, -0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, -0.5],
        [-0.5, 0.5, 0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
    ]
    faces = [
        [0, 1, 3, 2],
        [4, 6, 7, 5],
        [0, 4, 5, 1],
        [2, 3, 7, 6],
        [0, 2, 6, 4],
        [1, 5, 7, 3],
    ]
    if color is not None:
        options["color"] = color
    answer = _solid_mesh(vertices, faces, center, size, **options)
    if float(frame_thickness) > 0:
        coordinates = _g3d_point(center)
        half = float(size) / 2.0
        actual_frame_color = "black"
        if frame_color is not None:
            actual_frame_color = frame_color
        frame_lower = runtime.math_tuple(
            [
                coordinates[0] - half,
                coordinates[1] - half,
                coordinates[2] - half,
            ]
        )
        frame_upper = runtime.math_tuple(
            [
                coordinates[0] + half,
                coordinates[1] + half,
                coordinates[2] + half,
            ]
        )
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
    """Return a regular octahedron centered at `center`."""
    vertices = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
    ]
    faces = [
        [0, 2, 4],
        [2, 1, 4],
        [1, 3, 4],
        [3, 0, 4],
        [2, 0, 5],
        [1, 2, 5],
        [3, 1, 5],
        [0, 3, 5],
    ]
    return _solid_mesh(vertices, faces, center, size, **options)


def _icosahedron_geometry() -> Any:
    golden_ratio = (1.0 + runtime.math.sqrt(5.0)) / 2.0
    normalization = runtime.math.sqrt(1.0 + golden_ratio * golden_ratio)
    raw_vertices = [
        [-1, golden_ratio, 0],
        [1, golden_ratio, 0],
        [-1, -golden_ratio, 0],
        [1, -golden_ratio, 0],
        [0, -1, golden_ratio],
        [0, 1, golden_ratio],
        [0, -1, -golden_ratio],
        [0, 1, -golden_ratio],
        [golden_ratio, 0, -1],
        [golden_ratio, 0, 1],
        [-golden_ratio, 0, -1],
        [-golden_ratio, 0, 1],
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
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],
        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],
        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],
        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1],
    ]
    return [vertices, faces]


def icosahedron(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a regular icosahedron centered at `center`."""
    geometry = _icosahedron_geometry()
    return _solid_mesh(geometry[0], geometry[1], center, size, **options)


def _cross_product(left: Any, right: Any) -> list[float]:
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ]


def _dot_product(left: Any, right: Any) -> float:
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]


def dodecahedron(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a regular dodecahedron centered at `center`."""
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
        vertices.append(
            [
                centroid[0] / length,
                centroid[1] / length,
                centroid[2] / length,
            ]
        )
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
        _g3d_option_pop(options, "plot_points", "automatic"),
        40,
        2,
    )
    variables = _g3d_variables(
        components,
        [uvariable, vvariable],
        2,
    )
    functions = [
        _g3d_component_callable(component, variables) for component in components
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
            xrow.append(_g3d_finite_value(functions[0](uvalue, vvalue)))
            yrow.append(_g3d_finite_value(functions[1](uvalue, vvalue)))
            zrow.append(_g3d_finite_value(functions[2](uvalue, vvalue)))
        xdata.append(xrow)
        ydata.append(yrow)
        zdata.append(zrow)

    defaults = {
        "color": "steelblue",
        "opacity": 1,
        "mesh": False,
        "dots": False,
        "legend_label": None,
    }
    if _g3d_option_has(options, "alpha") and not _g3d_option_has(options, "opacity"):
        options["opacity"] = _g3d_option_pop(options, "alpha")
    if _g3d_option_has(options, "rgbcolor") and not _g3d_option_has(options, "color"):
        options["color"] = _g3d_option_pop(options, "rgbcolor")
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Surface3d(xdata, ydata, zdata, defaults))
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
        raise NotImplementedError("adaptive plot3d refinement is not implemented yet")
    uvariable, _umin, _umax = _g3d_range(urange)
    vvariable, _vmin, _vmax = _g3d_range(vrange)
    variables = _g3d_variables(
        [func],
        [uvariable, vvariable],
        2,
    )
    evaluated = _g3d_component_callable(func, variables)

    if transformation is not None:
        if not hasattr(transformation, "to_cartesian"):
            raise TypeError("transformation must be a Sage coordinate transformation")
        transformed = transformation.to_cartesian(evaluated, variables)
        return _g3d_surface(transformed, urange, vrange, **options)

    def first_coordinate(u: float, _v: float) -> float:
        return u

    def second_coordinate(_u: float, v: float) -> float:
        return v

    return _g3d_surface(
        (first_coordinate, second_coordinate, evaluated),
        urange,
        vrange,
        **options,
    )


def spherical_plot3d(
    function_value: Any,
    urange: Any,
    vrange: Any,
    **options: Any,
) -> Graphics3d:
    """Plot a radial function in spherical coordinates."""
    transformation = Spherical("radius", ["azimuth", "inclination"])
    return plot3d(
        function_value,
        urange,
        vrange,
        transformation=transformation,
        **options,
    )


def cylindrical_plot3d(
    function_value: Any,
    urange: Any,
    vrange: Any,
    **options: Any,
) -> Graphics3d:
    """Plot a radial function in cylindrical coordinates."""
    transformation = Cylindrical("radius", ["azimuth", "height"])
    return plot3d(
        function_value,
        urange,
        vrange,
        transformation=transformation,
        **options,
    )


def list_plot3d(
    values: Any,
    interpolation_type: str = "default",
    point_list: Any = None,
    **options: Any,
) -> Graphics3d:
    r"""
    Plot a matrix, rectangular array, or list of `(x, y, z)` samples.

    Rectangular data preserves its exact grid.  Scattered samples use
    Plotly's planar Delaunay triangulation; one or two samples become a point
    or line exactly as in Sage.  The `default` and `linear` interpolation
    modes are currently supported; higher-order Clough--Tocher and spline
    interpolation report that they are not implemented instead of silently
    returning a different surface.
    """
    is_matrix = hasattr(values, "nrows") and hasattr(values, "ncols")
    if is_matrix:
        row_count = int(values.nrows())
        column_count = int(values.ncols())
        rows = [
            [float(values[row, column]) for column in range(column_count)]
            for row in range(row_count)
        ]
    else:
        rows = list(values)
        if len(rows) == 0:
            return Graphics3d()
        is_points = bool(point_list) or isinstance(rows[0], tuple)
        if is_points:
            points = [_g3d_point(point_value) for point_value in rows]
            if len(points) == 1:
                return point3d(points[0], **options)
            if len(points) == 2:
                return line3d(points, **options)
            for left_index in range(len(points)):
                for right_index in range(left_index + 1, len(points)):
                    if (
                        points[left_index][0] == points[right_index][0]
                        and points[left_index][1] == points[right_index][1]
                        and points[left_index][2] != points[right_index][2]
                    ):
                        raise ValueError(
                            "points with same x,y coordinates and different "
                            "z coordinates were given. Interpolation cannot "
                            "handle this."
                        )
            if interpolation_type not in ("default", "linear", "clough", "spline"):
                raise ValueError("unknown interpolation type")
            if interpolation_type in ("clough", "spline"):
                raise NotImplementedError(
                    interpolation_type + " list_plot3d interpolation is not "
                    "implemented yet"
                )
            defaults = {
                "color": "steelblue",
                "opacity": 1,
            }
            actual_options = _g3d_copy_options(options)
            if _g3d_option_has(actual_options, "alpha") and not _g3d_option_has(
                actual_options, "opacity"
            ):
                actual_options["opacity"] = _g3d_option_pop(actual_options, "alpha")
            if _g3d_option_has(actual_options, "rgbcolor") and not _g3d_option_has(
                actual_options, "color"
            ):
                actual_options["color"] = _g3d_option_pop(actual_options, "rgbcolor")
            _g3d_option_update(defaults, actual_options)
            graphics_options = _g3d_graphics_options(defaults)
            graphic = Graphics3d()
            graphic.set_extra_kwds(graphics_options)
            graphic.add_primitive(ScatteredSurface3d(points, defaults))
            return graphic
        rows = [list(row) for row in rows]
        row_count = len(rows)
        column_count = len(rows[0])
        for row in rows:
            if len(row) != column_count:
                raise ValueError("all rows must have the same length")
        rows = [[float(value) for value in row] for row in rows]
    if interpolation_type not in ("default", "linear"):
        if interpolation_type in ("clough", "spline"):
            raise NotImplementedError(
                interpolation_type + " list_plot3d interpolation is not implemented yet"
            )
        raise ValueError("unknown interpolation type")
    if row_count == 0 or column_count == 0:
        return Graphics3d()
    if row_count == 1 and column_count == 1:
        return point3d((0, 0, rows[0][0]), **options)
    xdata = [
        [float(row) for _column in range(column_count)] for row in range(row_count)
    ]
    ydata = [
        [float(column) for column in range(column_count)] for _row in range(row_count)
    ]
    defaults = {
        "color": "steelblue",
        "opacity": 1,
        "mesh": False,
        "dots": False,
        "legend_label": None,
    }
    actual_options = _g3d_copy_options(options)
    if _g3d_option_has(actual_options, "alpha") and not _g3d_option_has(
        actual_options, "opacity"
    ):
        actual_options["opacity"] = _g3d_option_pop(actual_options, "alpha")
    if _g3d_option_has(actual_options, "rgbcolor") and not _g3d_option_has(
        actual_options, "color"
    ):
        actual_options["color"] = _g3d_option_pop(actual_options, "rgbcolor")
    _g3d_option_update(defaults, actual_options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Surface3d(xdata, ydata, rows, defaults))
    return graphic


def revolution_plot3d(
    curve: Any,
    trange: Any,
    phirange: Any = None,
    parallel_axis: str = "z",
    axis: Any = None,
    print_vector: bool = False,
    show_curve: bool = False,
    **options: Any,
) -> Graphics3d:
    r"""Revolve a function or parametric curve around a coordinate axis."""
    if parallel_axis not in ("x", "y", "z"):
        raise ValueError("parallel_axis must be either 'x', 'y', or 'z'")
    tvariable, _tmin, _tmax = _g3d_range(trange)
    axis_values = [0, 0] if axis is None else list(axis)
    if len(axis_values) != 2:
        raise ValueError("axis must contain exactly two coordinates")
    first_axis_coordinate = float(axis_values[0])
    second_axis_coordinate = float(axis_values[1])
    if phirange is None:
        actual_phirange = runtime.math_tuple([0.0, 2.0 * runtime.math.PI])
    else:
        phi_values = list(phirange)
        if len(phi_values) not in (2, 3):
            raise ValueError(
                "phirange must contain two endpoints or a variable and two endpoints"
            )
        actual_phirange = phirange
    _phivariable, phimin, phimax = _g3d_range(actual_phirange)
    surface_trange = runtime.math_tuple([_tmin, _tmax])
    surface_phirange = runtime.math_tuple([phimin, phimax])
    if isinstance(curve, (list, tuple)):
        components = list(curve)
        if len(components) == 2:
            components = [components[0], 0, components[1]]
        elif len(components) != 3:
            raise ValueError("curve must have two or three components")
    else:

        def curve_parameter(value: Any) -> Any:
            return value

        components = [curve_parameter, 0, curve]
    variables = [] if tvariable is None else [tvariable]
    callables = [
        _g3d_component_callable(component, variables) for component in components
    ]

    def revolved_coordinate(index: int) -> Any:
        def evaluated(tvalue: Any, phi: Any) -> float:
            xvalue = float(callables[0](tvalue))
            yvalue = float(callables[1](tvalue))
            zvalue = float(callables[2](tvalue))
            cosine = runtime.math.cos(float(phi))
            sine = runtime.math.sin(float(phi))
            if parallel_axis == "z":
                dx = xvalue - first_axis_coordinate
                dy = yvalue - second_axis_coordinate
                transformed = [
                    dx * cosine - dy * sine + first_axis_coordinate,
                    dx * sine + dy * cosine + second_axis_coordinate,
                    zvalue,
                ]
            elif parallel_axis == "x":
                dy = yvalue - first_axis_coordinate
                dz = zvalue - second_axis_coordinate
                transformed = [
                    xvalue,
                    dy * cosine - dz * sine + first_axis_coordinate,
                    dy * sine + dz * cosine + second_axis_coordinate,
                ]
            else:
                dx = xvalue - first_axis_coordinate
                dz = zvalue - second_axis_coordinate
                transformed = [
                    dx * cosine - dz * sine + first_axis_coordinate,
                    yvalue,
                    dx * sine + dz * cosine + second_axis_coordinate,
                ]
            return transformed[index]

        return evaluated

    parametrization = [
        revolved_coordinate(0),
        revolved_coordinate(1),
        revolved_coordinate(2),
    ]
    if print_vector:
        print(
            "surface of revolution around the "
            + parallel_axis
            + "-parallel axis through "
            + str(tuple(axis_values))
        )
    answer = _g3d_surface(parametrization, surface_trange, surface_phirange, **options)
    if show_curve:
        answer = answer + parametric_plot3d(
            components,
            trange,
            thickness=2,
            rgbcolor=(1, 0, 0),
        )
    return answer


def parametric_plot3d(
    functions: Sequence[Any],
    urange: Any,
    vrange: Any = None,
    plot_points: Any = "automatic",
    **options: Any,
) -> Graphics3d:
    """Plot a parametric space curve or parametric surface."""
    components = list(functions)
    if len(components) != 3:
        raise ValueError("parametric_plot3d requires exactly three components")
    if vrange is not None:
        options["plot_points"] = plot_points
        return _g3d_surface(
            components,
            urange,
            vrange,
            **options,
        )

    variable, minimum, maximum = _g3d_range(urange)
    variables = _g3d_variables(components, [variable], 1)
    callables = [
        _g3d_component_callable(component, variables) for component in components
    ]
    count = _g3d_plot_points(plot_points, 75, 1)[0]
    values = _g3d_linspace(minimum, maximum, count)
    points = []
    for value in values:
        points.append(
            (
                _g3d_finite_value(callables[0](value)),
                _g3d_finite_value(callables[1](value)),
                _g3d_finite_value(callables[2](value)),
            )
        )
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
    if hasattr(function_value, "_plot_zero_set_expression"):
        function_value = function_value._plot_zero_set_expression()
    xvariable, xmin, xmax = _g3d_range(xrange)
    yvariable, ymin, ymax = _g3d_range(yrange)
    zvariable, zmin, zmax = _g3d_range(zrange)
    variables = _g3d_variables(
        [function_value],
        [xvariable, yvariable, zvariable],
        3,
    )
    evaluated = _g3d_component_callable(function_value, variables)
    counts = _g3d_plot_points(
        _g3d_option_pop(options, "plot_points", "automatic"),
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
                sampled_values.append(
                    _g3d_finite_value(evaluated(xvalue, yvalue, zvalue))
                )
    options = _g3d_copy_options(options)
    defaults = {
        "color": "steelblue",
        "opacity": 1,
        "colorbar": False,
        "plot_tolerance": 1e-9,
    }
    if _g3d_option_has(options, "alpha") and not _g3d_option_has(options, "opacity"):
        options["opacity"] = _g3d_option_pop(options, "alpha")
    if _g3d_option_has(options, "rgbcolor") and not _g3d_option_has(options, "color"):
        options["color"] = _g3d_option_pop(options, "rgbcolor")
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(
        Isosurface3d(
            sampled_x,
            sampled_y,
            sampled_z,
            sampled_values,
            0.0,
            defaults,
        )
    )
    return graphic


def sphere(
    center: Any = _SPHERE_DEFAULT_CENTER,
    size: Any = 1,
    **options: Any,
) -> Graphics3d:
    """Return a sphere of radius `size` centered at `center`."""
    coordinates = _g3d_point(center)
    radius = float(size)
    if radius <= 0:
        raise ValueError("sphere size must be positive")
    counts = _g3d_plot_points(
        _g3d_option_pop(options, "plot_points", [32, 17]),
        32,
        2,
    )
    uvalues = _g3d_linspace(0.0, 2.0 * runtime.math.PI, counts[0])
    vvalues = _g3d_linspace(0.0, runtime.math.PI, counts[1])
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
            xrow.append(coordinates[0] + radius * runtime.math.cos(uvalue) * sine_v)
            yrow.append(coordinates[1] + radius * runtime.math.sin(uvalue) * sine_v)
            zrow.append(coordinates[2] + radius * cosine_v)
        xdata.append(xrow)
        ydata.append(yrow)
        zdata.append(zrow)

    options = _g3d_copy_options(options)
    defaults = {
        "color": "steelblue",
        "opacity": 1,
        "mesh": False,
        "dots": False,
        "legend_label": None,
        "aspect_ratio": [1, 1, 1],
    }
    if _g3d_option_has(options, "alpha") and not _g3d_option_has(options, "opacity"):
        options["opacity"] = _g3d_option_pop(options, "alpha")
    if _g3d_option_has(options, "rgbcolor") and not _g3d_option_has(options, "color"):
        options["color"] = _g3d_option_pop(options, "rgbcolor")
    _g3d_option_update(defaults, options)
    graphics_options = _g3d_graphics_options(defaults)
    graphic = Graphics3d()
    graphic.set_extra_kwds(graphics_options)
    graphic.add_primitive(Surface3d(xdata, ydata, zdata, defaults))
    return graphic


runtime.register_doc(
    "implicit_plot3d",
    implicit_plot3d,
    {
        "kind": "function",
        "module": "sage.plot.plot3d.implicit_plot3d",
        "tags": [
            "graphics",
            "3D graphics",
            "implicit surfaces",
            "symbolic equations",
        ],
        "backends": ["Plotly", "Sage.js rectangular sampler"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Sage expressions, equalities, ranges, and common options "
                "are supported; adaptive meshing is not yet implemented."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath 3D plotting API",
                "url": ("https://doc.sagemath.org/html/en/reference/plot3d/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "Plotly.js isosurface rendering",
                "url": "https://plotly.com/javascript/3d-isosurface-plots/",
            },
        ],
        "references": [
            {
                "id": "plotly-js-isosurface",
                "type": "software",
                "title": "Plotly.js 3D Isosurface Plots",
                "url": ("https://plotly.com/javascript/3d-isosurface-plots/"),
            },
        ],
        "implementation": {
            "algorithm": ("Rectangular scalar-field sampling and Plotly isosurface"),
        },
        "limitations": [
            "Adaptive marching-cubes refinement is not implemented.",
        ],
    },
)


def _graphics3d_doc(tags: list[str], notes: str) -> Any:
    return {
        "kind": "function",
        "module": "sage.plot.plot3d",
        "tags": ["graphics", "3D graphics"] + tags,
        "backends": ["Plotly", "Sage.js rectangular sampler"],
        "sage_compatibility": {
            "status": "partial",
            "notes": notes,
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath 3D plotting API and object model",
                "url": ("https://doc.sagemath.org/html/en/reference/plot3d/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "Plotly.js",
                "url": "https://plotly.com/javascript/3d-charts/",
            },
        ],
        "implementation": {
            "algorithm": "Semantic 3D primitives with Plotly rendering",
        },
        "limitations": [],
    }


for _doc_name, _doc_function, _doc_tags in [
    ("IndexFaceSet", IndexFaceSet, ["polygons", "meshes", "data structures"]),
    ("line3d", line3d, ["lines"]),
    ("point3d", point3d, ["points"]),
    ("polygon3d", polygon3d, ["polygons", "meshes"]),
    ("polygons3d", polygons3d, ["polygons", "meshes"]),
    ("text3d", text3d, ["text"]),
    ("arrow3d", arrow3d, ["arrows"]),
    ("bezier3d", bezier3d, ["curves", "Bézier paths"]),
    ("plot_vector_field3d", plot_vector_field3d, ["vector fields"]),
    ("frame3d", frame3d, ["frames"]),
    ("frame_labels", frame_labels, ["frames", "labels"]),
    ("ruler", ruler, ["frames", "rulers"]),
    ("ruler_frame", ruler_frame, ["frames", "rulers"]),
    ("axes", axes, ["axes", "arrows"]),
    ("tetrahedron", tetrahedron, ["shapes", "platonic solids"]),
    ("cube", cube, ["shapes", "platonic solids"]),
    ("octahedron", octahedron, ["shapes", "platonic solids"]),
    ("dodecahedron", dodecahedron, ["shapes", "platonic solids"]),
    ("icosahedron", icosahedron, ["shapes", "platonic solids"]),
    ("plot3d", plot3d, ["surfaces"]),
    ("spherical_plot3d", spherical_plot3d, ["surfaces", "coordinate transforms"]),
    ("cylindrical_plot3d", cylindrical_plot3d, ["surfaces", "coordinate transforms"]),
    ("list_plot3d", list_plot3d, ["surfaces", "data plots", "interpolation"]),
    ("revolution_plot3d", revolution_plot3d, ["surfaces", "surfaces of revolution"]),
    ("parametric_plot3d", parametric_plot3d, ["parametric plots"]),
    ("sphere", sphere, ["shapes"]),
]:
    runtime.register_doc(
        _doc_name,
        _doc_function,
        _graphics3d_doc(
            _doc_tags,
            (
                "The Sage call form and core rendering semantics are "
                "supported; remaining specialized options are tracked by "
                "the graphics compatibility corpus."
            ),
        ),
    )
