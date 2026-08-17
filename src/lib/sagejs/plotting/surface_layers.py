"""Validated semantic layers for Plotly-native 3D surfaces and meshes.

This module is deliberately independent of Sage's mutable `Graphics3d`
objects.  It validates and materializes geometry once, preserves the original
surface or polygon intent in a `PlotLayer`, and lowers only the bounded
geometry that Plotly can render without guessing.

Rectangular surfaces remain rectangular grids.  Indexed meshes contain only
explicit triangles.  A general polygon is accepted only when it is finite,
planar, strictly convex, and consistently ordered; other polygons need a real
triangulation algorithm and are rejected rather than silently fan-triangulated.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any, cast

from ._json import JSONValue, materialize_object
from .model import PlotLayer, make_layer
from .styles import NormalizedStyle, OptionResult, normalize_color, normalize_opacity

MAX_SURFACE_SAMPLES = 1_000_000
MAX_MESH_VERTICES = 1_000_000
MAX_MESH_TRIANGLES = 2_000_000

_MATERIAL_KEYS = ("ambient", "diffuse", "fresnel", "roughness", "specular")
_SURFACE_STYLE_KEYS = (
    "color",
    "colorbar",
    "light_position",
    "material",
    "opacity",
)
_MESH_STYLE_KEYS = (
    "color",
    "face_colors",
    "flat_shading",
    "light_position",
    "material",
    "opacity",
)


def _sequence(value: Any, name: str) -> list[Any]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise TypeError(name + " must be a sequence")
    return list(value)


def _finite_number(value: Any, name: str) -> float:
    if isinstance(value, bool):
        raise TypeError(name + " must be a finite real number")
    try:
        answer = float(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be a finite real number") from error
    if not math.isfinite(answer):
        raise ValueError(name + " must be finite")
    return answer


def _nonnegative_limit(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(name + " must be a nonnegative integer")
    return value


def _style_mapping(value: Mapping[str, Any] | None) -> dict[str, Any]:
    if value is None:
        return {}
    return dict(value)


def _unknown_keys(
    value: Mapping[str, Any], allowed: Sequence[str], name: str
) -> list[OptionResult]:
    results: list[OptionResult] = []
    for key in value:
        if not isinstance(key, str):
            raise TypeError(name + " must contain only string keys")
        if key not in allowed:
            results.append(
                OptionResult(
                    key,
                    "unsupported",
                    value[key],
                    None,
                    "Unsupported " + name + " option: " + key + ".",
                )
            )
    return results


def _reject_unknown_keys(
    value: Mapping[str, Any], allowed: Sequence[str], name: str
) -> None:
    unknown = _unknown_keys(value, allowed, name)
    if unknown:
        message = unknown[0].to_dict()["message"]
        raise ValueError(str(message))


def _material(value: Any) -> tuple[dict[str, JSONValue], list[OptionResult]]:
    if value is None:
        return {}, []
    if not isinstance(value, Mapping):
        return {}, [
            OptionResult(
                "material",
                "unsupported",
                value,
                None,
                "Material must be a mapping of Plotly lighting coefficients.",
            )
        ]
    answer: dict[str, JSONValue] = {}
    results = _unknown_keys(value, _MATERIAL_KEYS, "material")
    for key in _MATERIAL_KEYS:
        if key in value:
            try:
                numeric = _finite_number(value[key], "material " + key)
            except (TypeError, ValueError):
                numeric = -1
            if 0 <= numeric <= 1:
                answer[key] = numeric
                results.append(
                    OptionResult("material." + key, "supported", value[key], numeric)
                )
            else:
                results.append(
                    OptionResult(
                        "material." + key,
                        "unsupported",
                        value[key],
                        None,
                        "Material " + key + " must be between 0 and 1.",
                    )
                )
    return answer, results


def _light_position(value: Any) -> tuple[dict[str, JSONValue], OptionResult]:
    if value is None:
        return {}, OptionResult("light_position", "supported", value, {})
    try:
        if isinstance(value, Mapping):
            if len(value) == 0:
                return {}, OptionResult("light_position", "supported", value, {})
            _reject_unknown_keys(value, ("x", "y", "z"), "light_position")
            if set(value) != {"x", "y", "z"}:
                raise ValueError("light_position must contain x, y, and z")
            coordinates = [value["x"], value["y"], value["z"]]
        else:
            coordinates = _sequence(value, "light_position")
            if len(coordinates) != 3:
                raise ValueError("light_position must have three coordinates")
        answer: dict[str, JSONValue] = {
            "x": _finite_number(coordinates[0], "light_position x"),
            "y": _finite_number(coordinates[1], "light_position y"),
            "z": _finite_number(coordinates[2], "light_position z"),
        }
        return answer, OptionResult("light_position", "supported", value, answer)
    except (TypeError, ValueError):
        return {}, OptionResult(
            "light_position",
            "unsupported",
            value,
            None,
            "Light position must contain three finite x, y, and z coordinates.",
        )


def _surface_color(value: Any, option: str = "color") -> OptionResult:
    if isinstance(value, str) and value.strip().lower() == "steelblue":
        return OptionResult(option, "supported", value, "steelblue")
    return normalize_color(value, option)


def _bool_option(value: Any, option: str) -> OptionResult:
    if isinstance(value, bool):
        return OptionResult(option, "supported", value, value)
    return OptionResult(
        option,
        "unsupported",
        value,
        None,
        option + " must be a bool.",
    )


def _require_supported_style(style: NormalizedStyle) -> dict[str, JSONValue]:
    if style.status == "unsupported":
        messages: list[str] = []
        for option in style.options:
            if option.status != "unsupported":
                continue
            record = option.to_dict()
            message = record["message"]
            messages.append(str(message) if message is not None else option.option)
        raise ValueError("; ".join(messages))
    return style.value


def normalize_surface_style(
    style: Mapping[str, Any] | None = None,
) -> NormalizedStyle:
    """Return a strict Plotly surface style.

    Unknown keys and invalid values fail closed.  Numeric Sage RGB(A) tuples
    are translated to CSS colors; callers can record that frontend-level
    translation in provenance when needed.
    """
    source = _style_mapping(style)
    options = _unknown_keys(source, _SURFACE_STYLE_KEYS, "surface style")
    color = _surface_color(source.get("color", "steelblue"))
    opacity = normalize_opacity(source.get("opacity", 1))
    colorbar = _bool_option(source.get("colorbar", False), "colorbar")
    light_position, light_result = _light_position(source.get("light_position"))
    material, material_results = _material(source.get("material"))
    options.extend([color, opacity, colorbar, light_result])
    options.extend(material_results)
    color_value = color.value if isinstance(color.value, str) else "steelblue"
    opacity_value = opacity.value if isinstance(opacity.value, (int, float)) else 1.0
    colorbar_value = colorbar.value if isinstance(colorbar.value, bool) else False
    return NormalizedStyle(
        "surface",
        {
            "color": color_value,
            "colorbar": colorbar_value,
            "light_position": light_position,
            "material": material,
            "opacity": opacity_value,
        },
        options,
    )


def normalize_mesh_style(
    style: Mapping[str, Any] | None = None,
    *,
    face_count: int,
) -> NormalizedStyle:
    """Return a strict Plotly triangular-mesh style."""
    source = _style_mapping(style)
    options = _unknown_keys(source, _MESH_STYLE_KEYS, "mesh style")
    face_colors: list[JSONValue] = []
    if "face_colors" in source:
        try:
            values = _sequence(source["face_colors"], "face_colors")
        except TypeError:
            values = []
            options.append(
                OptionResult(
                    "face_colors",
                    "unsupported",
                    source["face_colors"],
                    None,
                    "Face colors must be a sequence.",
                )
            )
        if len(values) not in (0, face_count):
            options.append(
                OptionResult(
                    "face_colors",
                    "unsupported",
                    source["face_colors"],
                    None,
                    "Face colors must contain one color for every face.",
                )
            )
        elif len(values) > 0:
            for index in range(len(values)):
                result = _surface_color(
                    values[index], "face_colors[" + str(index) + "]"
                )
                options.append(result)
                if isinstance(result.value, str):
                    face_colors.append(result.value)
    color = _surface_color(source.get("color", (0, 0, 1)))
    opacity = normalize_opacity(source.get("opacity", 1))
    flat_shading = _bool_option(source.get("flat_shading", True), "flat_shading")
    light_position, light_result = _light_position(source.get("light_position"))
    material, material_results = _material(source.get("material"))
    options.extend([color, opacity, flat_shading, light_result])
    options.extend(material_results)
    color_value = color.value if isinstance(color.value, str) else "#0000ff"
    opacity_value = opacity.value if isinstance(opacity.value, (int, float)) else 1.0
    flat_value = flat_shading.value if isinstance(flat_shading.value, bool) else True
    return NormalizedStyle(
        "mesh3d",
        {
            "color": color_value,
            "face_colors": face_colors,
            "flat_shading": flat_value,
            "light_position": light_position,
            "material": material,
            "opacity": opacity_value,
        },
        options,
    )


def _grid(
    value: Sequence[Sequence[Any]], name: str, max_samples: int
) -> list[list[float]]:
    rows = _sequence(value, name)
    if len(rows) < 2:
        raise ValueError(name + " must have at least two rows")
    output: list[list[float]] = []
    columns: int | None = None
    for row_index in range(len(rows)):
        row = _sequence(rows[row_index], name + " row " + str(row_index))
        if columns is None:
            columns = len(row)
            if columns < 2:
                raise ValueError(name + " must have at least two columns")
            if len(rows) * columns > max_samples:
                raise ValueError(
                    name + " exceeds the surface sample limit of " + str(max_samples)
                )
        elif len(row) != columns:
            raise ValueError(name + " must be rectangular")
        output.append(
            [
                _finite_number(
                    row[column_index],
                    name + "[" + str(row_index) + "][" + str(column_index) + "]",
                )
                for column_index in range(len(row))
            ]
        )
    return output


def _rectangular_geometry(
    x: Sequence[Sequence[Any]],
    y: Sequence[Sequence[Any]],
    z: Sequence[Sequence[Any]],
    max_samples: int,
) -> tuple[list[list[float]], list[list[float]], list[list[float]]]:
    limit = _nonnegative_limit(max_samples, "max_samples")
    xgrid = _grid(x, "x grid", limit)
    ygrid = _grid(y, "y grid", limit)
    zgrid = _grid(z, "z grid", limit)
    shape = (len(xgrid), len(xgrid[0]))
    if (len(ygrid), len(ygrid[0])) != shape or (len(zgrid), len(zgrid[0])) != shape:
        raise ValueError("x, y, and z grids must have the same rectangular shape")
    return xgrid, ygrid, zgrid


def _point(value: Any, name: str) -> list[float]:
    coordinates = _sequence(value, name)
    if len(coordinates) != 3:
        raise ValueError(name + " must have exactly three coordinates")
    return [
        _finite_number(coordinates[0], name + " x"),
        _finite_number(coordinates[1], name + " y"),
        _finite_number(coordinates[2], name + " z"),
    ]


def _vertices(value: Sequence[Sequence[Any]], max_vertices: int) -> list[list[float]]:
    limit = _nonnegative_limit(max_vertices, "max_vertices")
    source = _sequence(value, "vertices")
    if len(source) < 3:
        raise ValueError("a 3D mesh requires at least three vertices")
    if len(source) > limit:
        raise ValueError("mesh exceeds the vertex limit of " + str(limit))
    return [
        _point(source[index], "vertex " + str(index)) for index in range(len(source))
    ]


def _vector(left: Sequence[float], right: Sequence[float]) -> list[float]:
    return [right[index] - left[index] for index in range(3)]


def _cross(left: Sequence[float], right: Sequence[float]) -> list[float]:
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ]


def _dot(left: Sequence[float], right: Sequence[float]) -> float:
    return sum(left[index] * right[index] for index in range(3))


def _norm_squared(value: Sequence[float]) -> float:
    return _dot(value, value)


def _significant_cross(left: Sequence[float], right: Sequence[float]) -> bool:
    scale_squared = max(_norm_squared(left), _norm_squared(right))
    if scale_squared == 0:
        return False
    return _norm_squared(_cross(left, right)) > scale_squared * scale_squared * 1e-24


def _triangle_indices(
    value: Sequence[Sequence[Any]],
    vertices: Sequence[Sequence[float]],
    max_triangles: int,
) -> list[list[int]]:
    limit = _nonnegative_limit(max_triangles, "max_triangles")
    source = _sequence(value, "triangles")
    if len(source) == 0:
        raise ValueError("a 3D mesh requires at least one triangle")
    if len(source) > limit:
        raise ValueError("mesh exceeds the triangle limit of " + str(limit))
    answer: list[list[int]] = []
    for face_index in range(len(source)):
        face = _sequence(source[face_index], "triangle " + str(face_index))
        if len(face) != 3:
            raise ValueError(
                "indexed meshes accept triangles only; triangulate polygonal faces explicitly"
            )
        triangle: list[int] = []
        for item in face:
            if isinstance(item, bool) or not isinstance(item, int):
                raise TypeError("triangle indices must be integers")
            if item < 0 or item >= len(vertices):
                raise IndexError("triangle index is out of range")
            triangle.append(item)
        if len(set(triangle)) != 3:
            raise ValueError("triangle vertices must be distinct")
        left = _vector(vertices[triangle[0]], vertices[triangle[1]])
        right = _vector(vertices[triangle[0]], vertices[triangle[2]])
        if not _significant_cross(left, right):
            raise ValueError("triangle vertices must not be collinear")
        answer.append(triangle)
    return answer


def _bounds(points: Sequence[Sequence[float]]) -> dict[str, JSONValue]:
    minimum = list(points[0])
    maximum = list(points[0])
    for point in points:
        for coordinate in range(3):
            minimum[coordinate] = min(minimum[coordinate], point[coordinate])
            maximum[coordinate] = max(maximum[coordinate], point[coordinate])
    return {
        "x": [minimum[0], maximum[0]],
        "y": [minimum[1], maximum[1]],
        "z": [minimum[2], maximum[2]],
    }


def _scene_metadata(points: Sequence[Sequence[float]]) -> dict[str, JSONValue]:
    bounds = _bounds(points)
    center: list[JSONValue] = []
    extent: list[JSONValue] = []
    degenerate_axes: list[JSONValue] = []
    names = ("x", "y", "z")
    for name in names:
        interval = bounds[name]
        if not isinstance(interval, list):
            raise TypeError("internal scene bounds must be arrays")
        lower_value = interval[0]
        upper_value = interval[1]
        if isinstance(lower_value, bool) or not isinstance(lower_value, (int, float)):
            raise TypeError("internal scene bound must be numeric")
        if isinstance(upper_value, bool) or not isinstance(upper_value, (int, float)):
            raise TypeError("internal scene bound must be numeric")
        lower = float(lower_value)
        upper = float(upper_value)
        center.append((lower + upper) / 2)
        width = upper - lower
        extent.append(width)
        if width == 0:
            degenerate_axes.append(name)
    numeric_extent: list[float] = []
    for value in extent:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError("internal scene extent must be numeric")
        numeric_extent.append(float(value))
    largest = max(numeric_extent)
    aspect = [1.0, 1.0, 1.0]
    if largest > 0:
        # Keep a nonzero Plotly-compatible aspect without crossing JSON's
        # implementation-dependent scientific-notation threshold.
        aspect = [max(value / largest, 0.0001) for value in numeric_extent]
    return {
        "bounds": bounds,
        "camera_target": center,
        "extent": extent,
        "recommended_aspect_ratio": {
            "x": aspect[0],
            "y": aspect[1],
            "z": aspect[2],
        },
        "degenerate_axes": degenerate_axes,
    }


def _merged_metadata(
    value: Mapping[str, Any] | None, generated: Mapping[str, Any]
) -> dict[str, Any]:
    answer = {} if value is None else dict(value)
    for key in generated:
        if key in answer:
            raise ValueError("layer metadata key is reserved: " + key)
        answer[key] = generated[key]
    return answer


def _source_intent(
    value: Mapping[str, Any] | None, constructor: str, representation: str
) -> dict[str, Any]:
    answer: dict[str, Any] = {
        "constructor": constructor,
        "representation": representation,
    }
    if value is not None:
        for key in value:
            if key in answer:
                raise ValueError("source_intent key is reserved: " + key)
            answer[key] = value[key]
    return answer


def rectangular_surface_layer(
    x: Sequence[Sequence[Any]],
    y: Sequence[Sequence[Any]],
    z: Sequence[Sequence[Any]],
    *,
    ordinal: int = 0,
    namespace: str = "layer",
    style: Mapping[str, Any] | None = None,
    visibility: bool = True,
    legend_label: str | None = None,
    source_intent: Mapping[str, Any] | None = None,
    metadata: Mapping[str, Any] | None = None,
    max_samples: int = MAX_SURFACE_SAMPLES,
) -> PlotLayer:
    """Plan one finite rectangular surface as a stable semantic layer."""
    xgrid, ygrid, zgrid = _rectangular_geometry(x, y, z, max_samples)
    points: list[list[float]] = []
    for row_index in range(len(xgrid)):
        for column_index in range(len(xgrid[row_index])):
            points.append(
                [
                    xgrid[row_index][column_index],
                    ygrid[row_index][column_index],
                    zgrid[row_index][column_index],
                ]
            )
    sample_count = len(points)
    rows = len(xgrid)
    columns = len(xgrid[0])
    normalized_style = normalize_surface_style(style)
    style_value = _require_supported_style(normalized_style)
    generated_metadata = {
        "geometry": "rectangular-grid",
        "resource": {
            "sample_count": sample_count,
            "triangle_count": 2 * (rows - 1) * (columns - 1),
        },
        "scene": _scene_metadata(points),
        "semantic": True,
        "style_decisions": normalized_style.to_dict(),
    }
    return make_layer(
        kind="surface",
        data={"x": xgrid, "y": ygrid, "z": zgrid, "shape": [rows, columns]},
        ordinal=ordinal,
        namespace=namespace,
        source_intent=_source_intent(
            source_intent, "Surface3d", "sampled-rectangular-surface"
        ),
        style=style_value,
        visibility=visibility,
        legend={"show": legend_label is not None, "label": legend_label},
        metadata=_merged_metadata(metadata, generated_metadata),
    )


def triangular_mesh_layer(
    vertices: Sequence[Sequence[Any]],
    triangles: Sequence[Sequence[Any]],
    *,
    ordinal: int = 0,
    namespace: str = "layer",
    style: Mapping[str, Any] | None = None,
    visibility: bool = True,
    legend_label: str | None = None,
    source_intent: Mapping[str, Any] | None = None,
    metadata: Mapping[str, Any] | None = None,
    max_vertices: int = MAX_MESH_VERTICES,
    max_triangles: int = MAX_MESH_TRIANGLES,
) -> PlotLayer:
    """Plan one finite indexed triangular mesh as a stable semantic layer."""
    normalized_vertices = _vertices(vertices, max_vertices)
    normalized_triangles = _triangle_indices(
        triangles, normalized_vertices, max_triangles
    )
    normalized_style = normalize_mesh_style(style, face_count=len(normalized_triangles))
    style_value = _require_supported_style(normalized_style)
    generated_metadata = {
        "geometry": "indexed-triangular-mesh",
        "resource": {
            "vertex_count": len(normalized_vertices),
            "triangle_count": len(normalized_triangles),
        },
        "scene": _scene_metadata(normalized_vertices),
        "semantic": True,
        "style_decisions": normalized_style.to_dict(),
    }
    return make_layer(
        kind="mesh",
        data={"vertices": normalized_vertices, "triangles": normalized_triangles},
        ordinal=ordinal,
        namespace=namespace,
        source_intent=_source_intent(
            source_intent, "IndexFaceSet", "indexed-triangular-mesh"
        ),
        style=style_value,
        visibility=visibility,
        legend={"show": legend_label is not None, "label": legend_label},
        metadata=_merged_metadata(metadata, generated_metadata),
    )


def _polygon_projection(points: Sequence[Sequence[float]]) -> tuple[int, list[float]]:
    normal: list[float] | None = None
    origin = points[0]
    for index in range(1, len(points) - 1):
        left = _vector(origin, points[index])
        right = _vector(origin, points[index + 1])
        candidate = _cross(left, right)
        if _significant_cross(left, right):
            normal = candidate
            break
    if normal is None:
        raise ValueError("polygon vertices must not all be collinear")
    extent = max(
        max(abs(point[coordinate] - origin[coordinate]) for point in points)
        for coordinate in range(3)
    )
    tolerance = max(1.0, extent) * math.sqrt(_norm_squared(normal)) * 1e-10
    for point in points:
        if abs(_dot(_vector(origin, point), normal)) > tolerance:
            raise ValueError("polygon vertices must be planar")
    dominant = 0
    for coordinate in range(1, 3):
        if abs(normal[coordinate]) > abs(normal[dominant]):
            dominant = coordinate
    return dominant, normal


def _project(point: Sequence[float], dropped: int) -> list[float]:
    return [point[index] for index in range(3) if index != dropped]


def _strictly_convex(points: Sequence[Sequence[float]], dropped: int) -> None:
    projected = [_project(point, dropped) for point in points]
    span = max(
        max(point[coordinate] for point in projected)
        - min(point[coordinate] for point in projected)
        for coordinate in range(2)
    )
    tolerance = span * span * 1e-12
    direction = 0
    for index in range(len(projected)):
        first = projected[index]
        second = projected[(index + 1) % len(projected)]
        third = projected[(index + 2) % len(projected)]
        turn = (second[0] - first[0]) * (third[1] - second[1]) - (
            second[1] - first[1]
        ) * (third[0] - second[0])
        if abs(turn) <= tolerance:
            raise ValueError("polygon must not contain collinear boundary vertices")
        current = 1 if turn > 0 else -1
        if direction == 0:
            direction = current
        elif direction != current:
            raise ValueError(
                "non-convex or self-intersecting polygons require explicit triangulation"
            )


def polygon_layer(
    points: Sequence[Sequence[Any]],
    *,
    ordinal: int = 0,
    namespace: str = "layer",
    style: Mapping[str, Any] | None = None,
    visibility: bool = True,
    legend_label: str | None = None,
    source_intent: Mapping[str, Any] | None = None,
    metadata: Mapping[str, Any] | None = None,
    max_vertices: int = MAX_MESH_VERTICES,
) -> PlotLayer:
    """Plan a finite, planar, strictly convex polygon.

    The original polygon vertex order remains in the layer while a
    deterministic triangle fan is recorded for Plotly.  Concave, nonplanar,
    collinear-boundary, and self-intersecting inputs fail explicitly.
    """
    vertices = _vertices(points, max_vertices)
    if len({tuple(point) for point in vertices}) != len(vertices):
        raise ValueError("polygon vertices must be distinct")
    dropped, _normal = _polygon_projection(vertices)
    _strictly_convex(vertices, dropped)
    triangles = [[0, index, index + 1] for index in range(1, len(vertices) - 1)]
    normalized_style = normalize_mesh_style(style, face_count=1)
    style_value = _require_supported_style(normalized_style)
    generated_metadata = {
        "geometry": "convex-planar-polygon",
        "resource": {
            "vertex_count": len(vertices),
            "triangle_count": len(triangles),
        },
        "scene": _scene_metadata(vertices),
        "semantic": True,
        "style_decisions": normalized_style.to_dict(),
    }
    return make_layer(
        kind="polygon",
        data={"vertices": vertices, "triangles": triangles},
        ordinal=ordinal,
        namespace=namespace,
        source_intent=_source_intent(source_intent, "polygon3d", "planar-polygon"),
        style=style_value,
        visibility=visibility,
        legend={"show": legend_label is not None, "label": legend_label},
        metadata=_merged_metadata(metadata, generated_metadata),
    )


def _legend(value: Mapping[str, Any]) -> tuple[bool, str | None]:
    _reject_unknown_keys(value, ("label", "show"), "legend")
    show = value.get("show", False)
    label = value.get("label")
    if not isinstance(show, bool):
        raise TypeError("legend show must be a bool")
    if label is not None and not isinstance(label, str):
        raise TypeError("legend label must be a string or None")
    if show and (label is None or label == ""):
        raise ValueError("a shown legend entry requires a nonempty label")
    return show, label


def _apply_shared_trace_style(
    trace: dict[str, JSONValue],
    style: Mapping[str, JSONValue],
    layer: PlotLayer,
) -> None:
    material = style["material"]
    light_position = style["light_position"]
    if isinstance(material, dict) and len(material) > 0:
        trace["lighting"] = material
    if isinstance(light_position, dict) and len(light_position) > 0:
        trace["lightposition"] = light_position
    show, label = _legend(layer.legend)
    trace["showlegend"] = show
    if label is not None:
        trace["name"] = label
    if not layer.visibility:
        trace["visible"] = False


def _lower_surface(layer: PlotLayer) -> dict[str, JSONValue]:
    data: Any = layer.data
    if not isinstance(data, dict):
        raise TypeError("surface layer data must be a mapping")
    _reject_unknown_keys(data, ("shape", "x", "y", "z"), "surface data")
    for key in ("shape", "x", "y", "z"):
        if key not in data:
            raise ValueError("surface layer data is missing " + key)
    xgrid, ygrid, zgrid = _rectangular_geometry(
        cast(Sequence[Sequence[Any]], data["x"]),
        cast(Sequence[Sequence[Any]], data["y"]),
        cast(Sequence[Sequence[Any]], data["z"]),
        MAX_SURFACE_SAMPLES,
    )
    shape = data.get("shape")
    if shape != [len(xgrid), len(xgrid[0])]:
        raise ValueError("surface shape metadata does not match its grids")
    style = _require_supported_style(normalize_surface_style(layer.style))
    trace: dict[str, JSONValue] = {
        "type": "surface",
        "x": cast(JSONValue, xgrid),
        "y": cast(JSONValue, ygrid),
        "z": cast(JSONValue, zgrid),
        "colorscale": [[0, style["color"]], [1, style["color"]]],
        "showscale": bool(style["colorbar"]),
        "opacity": style["opacity"],
    }
    _apply_shared_trace_style(trace, style, layer)
    return trace


def _lower_mesh(layer: PlotLayer) -> dict[str, JSONValue]:
    data: Any = layer.data
    if not isinstance(data, dict):
        raise TypeError("mesh layer data must be a mapping")
    _reject_unknown_keys(data, ("triangles", "vertices"), "mesh data")
    for key in ("triangles", "vertices"):
        if key not in data:
            raise ValueError("mesh layer data is missing " + key)
    vertices = _vertices(
        cast(Sequence[Sequence[Any]], data["vertices"]), MAX_MESH_VERTICES
    )
    triangles = _triangle_indices(
        cast(Sequence[Sequence[Any]], data["triangles"]),
        vertices,
        MAX_MESH_TRIANGLES,
    )
    face_count = 1 if layer.kind == "polygon" else len(triangles)
    style = _require_supported_style(
        normalize_mesh_style(layer.style, face_count=face_count)
    )
    trace: dict[str, JSONValue] = {
        "type": "mesh3d",
        "x": [point[0] for point in vertices],
        "y": [point[1] for point in vertices],
        "z": [point[2] for point in vertices],
        "i": [triangle[0] for triangle in triangles],
        "j": [triangle[1] for triangle in triangles],
        "k": [triangle[2] for triangle in triangles],
        "flatshading": style["flat_shading"],
        "opacity": style["opacity"],
    }
    face_colors = style["face_colors"]
    if isinstance(face_colors, list) and len(face_colors) > 0:
        if layer.kind == "polygon":
            trace["facecolor"] = [face_colors[0] for _triangle in triangles]
        else:
            trace["facecolor"] = face_colors
    else:
        trace["color"] = style["color"]
    _apply_shared_trace_style(trace, style, layer)
    return trace


def lower_3d_geometry_layer(layer: PlotLayer) -> list[dict[str, JSONValue]]:
    """Lower one validated semantic surface, mesh, or polygon to Plotly.

    The list return type matches `GraphicPrimitive3d._plotly_traces` and
    leaves room for a future explicit wireframe companion layer.  Unknown
    layer kinds are rejected instead of being treated as raw Plotly data.
    """
    if not isinstance(layer, PlotLayer):
        raise TypeError("3D geometry lowering requires a PlotLayer")
    if layer.kind == "surface":
        return [_lower_surface(layer)]
    if layer.kind in ("mesh", "polygon"):
        return [_lower_mesh(layer)]
    raise ValueError("unsupported semantic 3D geometry layer kind: " + layer.kind)


def layer_payload(layer: PlotLayer) -> dict[str, JSONValue]:
    """Return the payload shape consumed by `GraphicPrimitive3d` bridges."""
    if not isinstance(layer, PlotLayer):
        raise TypeError("surface payload requires a PlotLayer")
    record = layer.to_dict()
    return {
        "kind": record["kind"],
        "data": record["data"],
        "source_intent": record["source_intent"],
        "style": record["style"],
        "visibility": record["visibility"],
        "legend": record["legend"],
        "metadata": record["metadata"],
    }


def lower_3d_geometry_payload(payload: Mapping[str, Any]) -> list[dict[str, JSONValue]]:
    """Lower a bridge payload after reconstructing and validating a layer."""
    value = cast(dict[str, Any], materialize_object(payload, "$.surface_payload"))
    required = (
        "data",
        "kind",
        "legend",
        "metadata",
        "source_intent",
        "style",
        "visibility",
    )
    _reject_unknown_keys(value, required, "surface payload")
    for key in required:
        if key not in value:
            raise ValueError("surface payload is missing " + key)
    layer = PlotLayer(
        "bridge-0",
        str(value["kind"]),
        value["data"],
        source_intent=value["source_intent"],
        style=value["style"],
        visibility=value["visibility"],
        legend=value["legend"],
        metadata=value["metadata"],
    )
    return lower_3d_geometry_layer(layer)


__all__ = [
    "MAX_MESH_TRIANGLES",
    "MAX_MESH_VERTICES",
    "MAX_SURFACE_SAMPLES",
    "layer_payload",
    "lower_3d_geometry_layer",
    "lower_3d_geometry_payload",
    "normalize_mesh_style",
    "normalize_surface_style",
    "polygon_layer",
    "rectangular_surface_layer",
    "triangular_mesh_layer",
]
