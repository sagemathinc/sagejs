"""Sage-compatible option plans for Plotly-native 2D primitives.

This module is deliberately renderer-independent.  It validates the public
Sage option vocabulary and converts it to small ordinary-Python plans that the
bootstrap graphics renderer can lower without silently dropping an option.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

_COMMON_OPTIONS = frozenset(
    {
        "alpha",
        "hue",
        "legend_color",
        "legend_label",
        "rgbcolor",
        "zorder",
    }
)

_ALLOWED_OPTIONS = {
    "line": _COMMON_OPTIONS
    | frozenset(
        {
            "linestyle",
            "marker",
            "markeredgecolor",
            "markeredgewidth",
            "markerfacecolor",
            "markersize",
            "thickness",
        }
    ),
    "point": _COMMON_OPTIONS
    | frozenset({"faceted", "marker", "markeredgecolor", "size"}),
    "polygon": _COMMON_OPTIONS
    | frozenset({"edgecolor", "fill", "linestyle", "thickness"}),
    "arrow": _COMMON_OPTIONS
    | frozenset(
        {"arrowshorten", "arrowsize", "head", "linestyle", "thickness", "width"}
    ),
    "text": frozenset(
        {
            "alpha",
            "axis_coords",
            "background_color",
            "bounding_box",
            "clip",
            "fontsize",
            "fontstyle",
            "fontweight",
            "horizontal_alignment",
            "hue",
            "rgbcolor",
            "rotation",
            "vertical_alignment",
            "zorder",
        }
    ),
}

_MARKERS: dict[Any, str | None] = {
    None: None,
    "None": None,
    "none": None,
    "": None,
    " ": None,
    ",": "square",
    ".": "circle",
    "_": "line-ew",
    "|": "line-ns",
    "o": "circle",
    "p": "pentagon",
    "s": "square",
    "x": "x",
    "+": "cross",
    "*": "star",
    "D": "diamond",
    "d": "diamond-tall",
    "H": "hexagon",
    "h": "hexagon2",
    "<": "triangle-left",
    ">": "triangle-right",
    "^": "triangle-up",
    "v": "triangle-down",
    "1": "triangle-down-open",
    "2": "triangle-up-open",
    "3": "triangle-left-open",
    "4": "triangle-right-open",
    0: "line-ew",
    1: "line-ew",
    2: "line-ns",
    3: "line-ns",
    4: "triangle-left-open",
    5: "triangle-right-open",
    6: "triangle-up-open",
    7: "triangle-down-open",
}

_DASHES = {
    "-": "solid",
    "solid": "solid",
    "--": "dash",
    "dashed": "dash",
    ":": "dot",
    "dotted": "dot",
    "-.": "dashdot",
    "dashdot": "dashdot",
    "dash dot": "dashdot",
}

_NO_LINE = frozenset({None, "None", "none", "", " "})

_RELATIVE_FONT_SIZES = {
    "xx-small": 5.79,
    "x-small": 6.94,
    "small": 8.33,
    "medium": 10.0,
    "large": 12.0,
    "x-large": 14.4,
    "xx-large": 17.28,
    "smaller": 8.33,
    "larger": 12.0,
}


def allowed_options(kind: str) -> tuple[str, ...]:
    """Return the stable, sorted Sage option vocabulary for `kind`."""
    if kind not in _ALLOWED_OPTIONS:
        raise ValueError("unknown Sage 2D primitive kind: " + str(kind))
    return tuple(sorted(_ALLOWED_OPTIONS[kind]))


def validate_options(kind: str, options: Mapping[str, Any]) -> dict[str, Any]:
    """Copy and validate primitive `options`.

    Display-level options must be extracted before this function is called.
    Unlike several upstream Sage primitives, Sage.js never prints a warning
    and then discards an unknown renderer option.
    """
    allowed = allowed_options(kind)
    unknown = sorted(str(name) for name in options if name not in allowed)
    if unknown:
        plural = "s" if len(unknown) != 1 else ""
        raise ValueError(
            "unsupported Sage " + kind + " option" + plural + ": " + ", ".join(unknown)
        )
    answer = dict(options)
    legend_color = answer.get("legend_color")
    if legend_color is not None:
        raise NotImplementedError(
            "per-item legend_color is not supported by the Plotly renderer"
        )
    return answer


def hue_rgb(value: Any) -> tuple[float, float, float]:
    """Return Sage's fully saturated hue color as an RGB triple."""
    hue = float(value) % 1.0
    scaled = hue * 6.0
    sector = int(scaled)
    fraction = scaled - sector
    if sector == 0:
        return (1.0, fraction, 0.0)
    if sector == 1:
        return (1.0 - fraction, 1.0, 0.0)
    if sector == 2:
        return (0.0, 1.0, fraction)
    if sector == 3:
        return (0.0, 1.0 - fraction, 1.0)
    if sector == 4:
        return (fraction, 0.0, 1.0)
    return (1.0, 0.0, 1.0 - fraction)


def normalized_color(options: Mapping[str, Any], default: Any) -> Any:
    """Resolve Sage's mutually exclusive `hue` and `rgbcolor` options."""
    if "hue" in options:
        return hue_rgb(options["hue"])
    return options.get("rgbcolor", default)


def _opacity(options: Mapping[str, Any]) -> float:
    alpha = float(options.get("alpha", 1))
    if alpha < 0 or alpha > 1:
        raise ValueError("alpha must be between 0 and 1")
    return alpha


def _nonnegative(value: Any, name: str) -> float:
    answer = float(value)
    if answer < 0:
        raise ValueError(name + " must be nonnegative")
    return answer


def _zorder(
    options: Mapping[str, Any], default: int, *, truncate: bool = False
) -> int | float:
    value = float(options.get("zorder", default))
    return int(value) if truncate else value


def marker_symbol(marker: Any) -> str | None:
    """Translate a Sage/matplotlib marker to a Plotly marker symbol."""
    if marker in _MARKERS:
        return _MARKERS[marker]
    if isinstance(marker, str) and marker.startswith("$") and marker.endswith("$"):
        raise NotImplementedError(
            "TeX path markers are not supported by the Plotly renderer"
        )
    raise ValueError("unsupported Sage marker: " + repr(marker))


def _line_style(value: Any) -> tuple[bool, str, str]:
    if value in _NO_LINE:
        return (False, "solid", "linear")
    text = str(value)
    shape = "linear"
    for prefix, plotly_shape in (
        ("steps-mid", "hvh"),
        ("steps-post", "hv"),
        ("steps-pre", "vh"),
        ("steps", "vh"),
    ):
        if text.startswith(prefix):
            shape = plotly_shape
            text = text[len(prefix) :]
            if text == "":
                text = "-"
            break
    if text not in _DASHES:
        raise ValueError("unsupported Sage linestyle: " + repr(value))
    return (True, _DASHES[text], shape)


def line_render_plan(options: Mapping[str, Any]) -> dict[str, Any]:
    """Return a complete Plotly plan for a Sage line primitive."""
    values = validate_options("line", options)
    has_line, dash, shape = _line_style(values.get("linestyle", "-"))
    symbol = marker_symbol(values.get("marker"))
    modes: list[str] = []
    if has_line:
        modes.append("lines")
    if symbol is not None:
        modes.append("markers")
    color = normalized_color(values, (0.0, 0.0, 1.0))
    marker_color = values.get("markerfacecolor", color)
    marker_edge = values.get("markeredgecolor", color)
    return {
        "mode": "+".join(modes) if modes else "none",
        "line": {
            "color": color,
            "dash": dash,
            "shape": shape,
            "width": _nonnegative(values.get("thickness", 1), "thickness"),
        },
        "marker": (
            None
            if symbol is None
            else {
                "color": marker_color,
                "line": {
                    "color": marker_edge,
                    "width": _nonnegative(
                        values.get("markeredgewidth", 1), "markeredgewidth"
                    ),
                },
                "size": _nonnegative(values.get("markersize", 6), "markersize"),
                "symbol": symbol,
            }
        ),
        "opacity": _opacity(values),
        "zorder": _zorder(values, 2),
    }


def point_render_plan(options: Mapping[str, Any]) -> dict[str, Any]:
    """Return a complete Plotly marker plan for Sage points."""
    values = validate_options("point", options)
    symbol = marker_symbol(values.get("marker", "o"))
    if symbol is None:
        raise ValueError("a point marker cannot be empty")
    edge = values.get("markeredgecolor")
    color = normalized_color(values, (0.0, 0.0, 1.0))
    if edge is None and bool(values.get("faceted", False)):
        edge = color
    return {
        "color": color,
        "edge": None if edge is None else {"color": edge, "width": 1.0},
        # Plotly's marker size is a diameter in CSS pixels whereas Sage's size
        # is an area in points squared.  Keeping the public numeric value here
        # is an intentional Plotly-native translation that preserves Sage.js's
        # established, readable default rather than making points too small.
        "size": _nonnegative(int(values.get("size", 10)), "size"),
        "symbol": symbol,
        "opacity": _opacity(values),
        "zorder": _zorder(values, 0, truncate=True),
    }


def polygon_render_plan(options: Mapping[str, Any]) -> dict[str, Any]:
    """Return fill and outline semantics for a Sage polygon."""
    values = validate_options("polygon", options)
    has_line, dash, shape = _line_style(values.get("linestyle", "-"))
    if not has_line or shape != "linear":
        raise ValueError("polygon linestyle must draw a non-step outline")
    fill = bool(values.get("fill", True))
    color = normalized_color(values, (0.0, 0.0, 1.0))
    edge = values.get("edgecolor") if fill else color
    if edge is None:
        edge = color
    default_thickness = 0 if fill and values.get("edgecolor") is None else 1
    return {
        "close_path": True,
        "fill": fill,
        "fillcolor": color if fill else None,
        "line": {
            "color": edge,
            "dash": dash,
            "width": _nonnegative(
                values.get("thickness", default_thickness), "thickness"
            ),
        },
        "opacity": _opacity(values),
        "zorder": _zorder(values, 1, truncate=True),
    }


def arrow_render_plan(options: Mapping[str, Any]) -> dict[str, Any]:
    """Return a Plotly annotation plan for a straight Sage arrow."""
    values = validate_options("arrow", options)
    if "thickness" in values:
        raise NotImplementedError(
            "Sage accepts but ignores arrow thickness; use width for the shaft"
        )
    head = values.get("head", 1)
    if isinstance(head, bool) or head not in (0, 1, 2):
        raise KeyError("head parameter must be one of 0 (start), 1 (end) or 2 (both)")
    has_line, dash, shape = _line_style(values.get("linestyle", "solid"))
    if not has_line or shape != "linear":
        raise ValueError("arrow linestyle must draw a non-step shaft")
    shorten = _nonnegative(values.get("arrowshorten", 0), "arrowshorten")
    renderer = "trace" if head == 1 and shorten == 0 else "annotation"
    if renderer == "annotation" and dash != "solid":
        raise NotImplementedError(
            "two-ended or shortened dashed arrows are not supported by Plotly annotations"
        )
    if (
        renderer == "annotation"
        and "zorder" in values
        and float(values["zorder"]) != 2.0
    ):
        raise NotImplementedError(
            "non-default arrow zorder is not supported by Plotly annotations"
        )
    size = _nonnegative(values.get("arrowsize", 5), "arrowsize")
    return {
        "arrowhead": 2 if head in (1, 2) else 0,
        "arrowside": {0: "start", 1: "end", 2: "end+start"}[head],
        "arrowsize": size / 5.0,
        "color": normalized_color(values, (0.0, 0.0, 1.0)),
        "dash": dash,
        "head": head,
        "shorten_each": shorten / 2.0,
        "startarrowhead": 2 if head in (0, 2) else 0,
        "width": _nonnegative(values.get("width", 2), "width"),
        "opacity": _opacity(values),
        "renderer": renderer,
        "zorder": _zorder(values, 2),
    }


def _rotation(value: Any) -> float:
    if value is None or value == "horizontal":
        return 0.0
    if value == "vertical":
        return 90.0
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("unsupported Sage text rotation: " + repr(value)) from error


def _font_size(value: Any) -> float:
    if isinstance(value, str):
        if value not in _RELATIVE_FONT_SIZES:
            raise ValueError("unsupported relative Sage font size: " + repr(value))
        return _RELATIVE_FONT_SIZES[value]
    size = float(int(value))
    if size <= 0:
        raise ValueError("fontsize must be positive")
    return size


def text_render_plan(options: Mapping[str, Any]) -> dict[str, Any]:
    """Return an annotation-capable plan for Sage text."""
    values = validate_options("text", options)
    horizontal = str(values.get("horizontal_alignment", "center"))
    vertical = str(values.get("vertical_alignment", "center"))
    if horizontal not in ("left", "center", "right"):
        raise ValueError("unsupported horizontal_alignment: " + repr(horizontal))
    if vertical not in ("top", "center", "bottom"):
        raise ValueError("unsupported vertical_alignment: " + repr(vertical))
    if bool(values.get("clip", False)):
        raise NotImplementedError(
            "clip=True for text is not supported by Plotly annotations"
        )
    if values.get("bounding_box") is not None:
        raise NotImplementedError(
            "text bounding_box is not supported by the Plotly renderer; "
            "use background_color for a solid background"
        )
    rotation = _rotation(values.get("rotation"))
    font_style = values.get("fontstyle")
    if font_style not in (None, "normal", "italic", "oblique"):
        raise ValueError("unsupported Sage fontstyle: " + repr(font_style))
    requires_annotation = (
        bool(values.get("axis_coords", False))
        or any(
            name in values for name in ("background_color", "fontstyle", "fontweight")
        )
        or rotation != 0.0
    )
    if requires_annotation and "zorder" in values and float(values["zorder"]) != 3.0:
        raise NotImplementedError(
            "styled annotation text cannot preserve a non-default zorder in Plotly"
        )
    return {
        "background_color": values.get("background_color"),
        "color": normalized_color(values, (0.0, 0.0, 1.0)),
        "font_size": _font_size(values.get("fontsize", 10)),
        "font_style": font_style,
        "font_weight": values.get("fontweight"),
        "renderer": "annotation" if requires_annotation else "trace",
        "rotation": rotation,
        "opacity": _opacity(values),
        "xanchor": horizontal,
        "xref": "paper" if bool(values.get("axis_coords", False)) else "x",
        "yanchor": "middle" if vertical == "center" else vertical,
        "yref": "paper" if bool(values.get("axis_coords", False)) else "y",
        "zorder": _zorder(values, 3),
    }


__all__ = [
    "allowed_options",
    "arrow_render_plan",
    "hue_rgb",
    "line_render_plan",
    "marker_symbol",
    "normalized_color",
    "point_render_plan",
    "polygon_render_plan",
    "text_render_plan",
    "validate_options",
]
