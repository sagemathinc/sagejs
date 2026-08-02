"""Small runtime used by the experimental Wolfram Language frontend."""

import math
from typing import Any, Callable

import sagejs as sage


def _runtime_type_name(value: Any) -> str:
    name = type(value).__name__
    if name.startswith("ρσ_"):
        return name[3:]
    return name


def head(value: Any) -> str:
    """Return the Wolfram head corresponding to a shared evaluator object."""

    names = {
        "bool": "Boolean",
        "int": "Integer",
        "Integer": "Integer",
        "Rational": "Rational",
        "float": "Real",
        "RealLiteral": "Real",
        "RealNumberElement": "Real",
        "complex": "Complex",
        "ComplexNumberElement": "Complex",
        "str": "String",
        "list": "List",
        "list_constructor": "List",
        "tuple": "List",
        "set": "Set",
        "dict": "Association",
        "ndarray": "NumericArray",
        "PolynomialRingParent": "PolynomialRing",
        "PolynomialElement": "Polynomial",
        "Expression": "SageExpression",
        "Graphics": "Graphics",
        "Graphics3d": "Graphics3D",
    }
    name = _runtime_type_name(value)
    return names[name] if name in names else name


def dimensions(value: Any) -> list[int]:
    if hasattr(value, "shape"):
        return [int(dimension) for dimension in value.shape]
    if not isinstance(value, (list, tuple)):
        return []
    result = [len(value)]
    if value:
        child = dimensions(value[0])
        if all(dimensions(item) == child for item in value):
            result.extend(child)
    return result


def length(value: Any) -> int:
    if hasattr(value, "shape"):
        shape = value.shape
        return int(shape[0]) if len(shape) else 0
    try:
        return len(value)
    except TypeError:
        return 0


def factor_integer(value: Any) -> list[list[Any]]:
    result = []
    for pair in sage.factor(value):
        result.append([pair[0], pair[1]])
    return result


def prime(index: int) -> int:
    if index < 1:
        raise ValueError("Prime index must be positive")
    found = 0
    candidate = 1
    while found < index:
        candidate += 1
        if sage.is_prime(candidate):
            found += 1
    return candidate


def wolfram_range(
    start: int,
    stop: int | None = None,
    step: int = 1,
) -> list[int]:
    if stop is None:
        stop = start
        start = 1
    if step == 0:
        raise ValueError("Range step must not be zero")
    boundary = stop + (1 if step > 0 else -1)
    return list(range(start, boundary, step))


def table(
    function: Callable[[Any], Any],
    start: int,
    stop: int,
    step: int = 1,
) -> list[Any]:
    return [function(value) for value in wolfram_range(start, stop, step)]


FactorInteger = factor_integer
Dimensions = dimensions
Head = head
Length = length
Prime = prime
Range = wolfram_range
Table = table


class _GraphicsDirective:
    def __init__(self, options: dict[str, Any]) -> None:
        self.options = options


def opacity(value: Any) -> _GraphicsDirective:
    return _GraphicsDirective({
        'opacity': float(value), 'alpha': float(value)})


def thickness(value: Any) -> _GraphicsDirective:
    return _GraphicsDirective({'thickness': float(value)})


def point_size(value: Any) -> _GraphicsDirective:
    return _GraphicsDirective({'size': max(1.0, 100.0 * float(value))})


def rgb_color(red: Any, green: Any, blue: Any, alpha: Any = 1) -> _GraphicsDirective:
    color = (float(red), float(green), float(blue))
    return _GraphicsDirective({
        'color': color,
        'rgbcolor': color,
        'opacity': float(alpha),
        'alpha': float(alpha),
    })


def gray_level(value: Any, alpha: Any = 1) -> _GraphicsDirective:
    component = float(value)
    return rgb_color(component, component, component, alpha)


def hue_color(value: Any, saturation: Any = 1, brightness: Any = 1,
              alpha: Any = 1) -> _GraphicsDirective:
    color = sage.hue(value, saturation, brightness)
    return _GraphicsDirective({
        'color': color,
        'rgbcolor': color,
        'opacity': float(alpha),
        'alpha': float(alpha),
    })


def directive(*values: Any) -> _GraphicsDirective:
    options = {}
    for value in values:
        if isinstance(value, _GraphicsDirective):
            for name in value.options:
                options[name] = value.options[name]
        elif isinstance(value, str):
            options['color'] = value
            options['rgbcolor'] = value
    return _GraphicsDirective(options)


def _style_graphic(graphic: Any, options: dict[str, Any]) -> Any:
    if not options:
        return graphic
    for primitive in graphic:
        target = primitive
        while target is not None:
            if hasattr(target, '_options'):
                for name in options:
                    target._options[name] = options[name]
            if hasattr(target, 'primitive'):
                target = target.primitive
            else:
                target = None
    return graphic


def style(graphic: Any, *directives: Any) -> Any:
    combined = directive(*directives)
    return _style_graphic(graphic, combined.options)


def _combine_graphics(items: Any) -> Any:
    result = 0
    style = {}
    for item in items:
        if isinstance(item, str):
            style['color'] = item
            style['rgbcolor'] = item
            continue
        if isinstance(item, _GraphicsDirective):
            for name in item.options:
                style[name] = item.options[name]
            continue
        if isinstance(item, (list, tuple)):
            item = _combine_graphics(item)
        if item == 0:
            continue
        item = _style_graphic(item, style)
        result = result + item
    return result


def graphics(items: Any) -> Any:
    """Combine Wolfram two-dimensional graphics primitives."""
    return _combine_graphics(items)


def graphics3d(items: Any) -> Any:
    """Combine Wolfram three-dimensional graphics primitives."""
    return _combine_graphics(items)


def wolfram_line(points: Any) -> Any:
    values = list(points)
    if len(values) and len(values[0]) == 3:
        return sage.line3d(values)
    return sage.line(values)


def wolfram_point(points: Any) -> Any:
    values = list(points)
    candidate = values
    if len(values) and not isinstance(values[0], (list, tuple)):
        candidate = [values]
    if len(candidate) and len(candidate[0]) == 3:
        return sage.point3d(candidate)
    return sage.point(candidate)


def wolfram_polygon(points: Any) -> Any:
    values = list(points)
    if len(values) and len(values[0]) == 3:
        return sage.polygon3d(values)
    return sage.polygon(values)


def wolfram_circle(center: Any = (0, 0), radius: Any = 1) -> Any:
    return sage.circle(center, radius)


def wolfram_disk(center: Any = (0, 0), radius: Any = 1) -> Any:
    return sage.disk(center, radius, (0, 6.283185307179586))


def wolfram_rectangle(lower: Any, upper: Any) -> Any:
    return sage.polygon([
        lower,
        (upper[0], lower[1]),
        upper,
        (lower[0], upper[1]),
    ])


def wolfram_arrow(points: Any) -> Any:
    values = list(points)
    if len(values) != 2:
        raise ValueError("Arrow currently requires two endpoints")
    if len(values[0]) == 3:
        return sage.arrow3d(values[0], values[1])
    return sage.arrow(values[0], values[1])


def wolfram_text(value: Any, position: Any) -> Any:
    if len(position) == 3:
        return sage.text3d(value, position)
    return sage.text(value, position)


def wolfram_sphere(center: Any = (0, 0, 0), radius: Any = 1) -> Any:
    return sage.sphere(center, radius)


def _oriented_surface(graphic: Any, start: Any, end: Any) -> Any:
    first = [float(value) for value in start]
    second = [float(value) for value in end]
    vector = [second[index] - first[index] for index in range(3)]
    length = math.sqrt(sum(value * value for value in vector))
    if length == 0:
        raise ValueError("solid endpoints must be distinct")
    cosine = max(-1.0, min(1.0, vector[2] / length))
    angle = math.acos(cosine)
    axis = (-vector[1], vector[0], 0.0)
    if abs(axis[0]) + abs(axis[1]) < 1e-14:
        if vector[2] < 0:
            graphic = graphic.rotateX(math.pi)
    else:
        graphic = graphic.rotate(axis, angle)
    return graphic.translate(first)


def cylinder(bounds: Any = ((0, 0, 0), (0, 0, 1)), radius: Any = 1) -> Any:
    values = list(bounds)
    if len(values) != 2:
        raise ValueError("Cylinder requires two endpoints")
    first = values[0]
    second = values[1]
    length = math.sqrt(sum(
        float(second[index] - first[index]) ** 2 for index in range(3)))
    radius_value = float(radius)

    def cylinder_x(u: float, _v: float) -> float:
        return radius_value * math.cos(u)

    def cylinder_y(u: float, _v: float) -> float:
        return radius_value * math.sin(u)

    def cylinder_z(_u: float, v: float) -> float:
        return v

    surface = sage.parametric_plot3d(
        (cylinder_x, cylinder_y, cylinder_z),
        (0, 2 * math.pi),
        (0, length),
        plot_points=(33, 9),
    )
    lower = []
    upper = []
    for index in range(32):
        angle = 2 * math.pi * index / 32.0
        lower.append((float(radius) * math.cos(angle),
                      float(radius) * math.sin(angle), 0))
        upper.append((float(radius) * math.cos(angle),
                      float(radius) * math.sin(angle), length))
    surface += sage.polygon3d(lower)
    surface += sage.polygon3d(upper)
    return _oriented_surface(surface, first, second)


def cone(bounds: Any = ((0, 0, 0), (0, 0, 1)), radius: Any = 1) -> Any:
    values = list(bounds)
    if len(values) != 2:
        raise ValueError("Cone requires two endpoints")
    first = values[0]
    second = values[1]
    length = math.sqrt(sum(
        float(second[index] - first[index]) ** 2 for index in range(3)))
    radius_value = float(radius)

    def cone_x(u: float, v: float) -> float:
        return radius_value * (1.0 - v / length) * math.cos(u)

    def cone_y(u: float, v: float) -> float:
        return radius_value * (1.0 - v / length) * math.sin(u)

    def cone_z(_u: float, v: float) -> float:
        return v

    surface = sage.parametric_plot3d(
        (cone_x, cone_y, cone_z),
        (0, 2 * math.pi),
        (0, length),
        plot_points=(33, 9),
    )
    base = []
    for index in range(32):
        angle = 2 * math.pi * index / 32.0
        base.append((radius_value * math.cos(angle),
                     radius_value * math.sin(angle), 0))
    surface += sage.polygon3d(base)
    return _oriented_surface(surface, first, second)


def torus(center: Any = (0, 0, 0), radii: Any = (1, 0.25)) -> Any:
    if isinstance(radii, (list, tuple)):
        major = float(radii[0])
        minor = float(radii[1])
    else:
        major = float(radii)
        minor = major / 4.0

    def torus_x(u: float, v: float) -> float:
        return (major + minor * math.cos(v)) * math.cos(u)

    def torus_y(u: float, v: float) -> float:
        return (major + minor * math.cos(v)) * math.sin(u)

    def torus_z(_u: float, v: float) -> float:
        return minor * math.sin(v)

    return sage.parametric_plot3d(
        (torus_x, torus_y, torus_z),
        (0, 2 * math.pi),
        (0, 2 * math.pi),
        plot_points=(41, 17),
    ).translate(center)


def cuboid(bounds: Any = ((0, 0, 0), (1, 1, 1))) -> Any:
    values = list(bounds)
    if len(values) != 2:
        raise ValueError("Cuboid requires lower and upper corners")
    lower = values[0]
    upper = values[1]
    widths = [float(upper[index] - lower[index]) for index in range(3)]
    if not (widths[0] == widths[1] and widths[1] == widths[2]):
        raise NotImplementedError(
            "non-cubic Wolfram Cuboid dimensions are not implemented yet")
    center = tuple([
        (float(lower[index]) + float(upper[index])) / 2.0
        for index in range(3)
    ])
    return sage.cube(center, widths[0])


def image_size(value: Any) -> Any:
    """Convert Wolfram pixel dimensions to Sage's inch-based figsize."""
    if isinstance(value, (list, tuple)):
        if len(value) != 2:
            raise ValueError("ImageSize must be a number or a pair")
        return [float(value[0]) / 100.0, float(value[1]) / 100.0]
    return float(value) / 100.0


Graphics = graphics
Graphics3D = graphics3d
Line = wolfram_line
Point = wolfram_point
Polygon = wolfram_polygon
Circle = wolfram_circle
Disk = wolfram_disk
Rectangle = wolfram_rectangle
Arrow = wolfram_arrow
Text = wolfram_text
Sphere = wolfram_sphere
Cuboid = cuboid
Cylinder = cylinder
Cone = cone
Torus = torus
ImageSize = image_size
Opacity = opacity
Thickness = thickness
PointSize = point_size
RGBColor = rgb_color
GrayLevel = gray_level
Hue = hue_color
Directive = directive
Style = style
