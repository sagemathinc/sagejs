"""Strict Plotly-native style normalization with explicit option outcomes."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from ._json import JSONValue, materialize_json, materialize_object

_STATUSES = ("supported", "translated", "unsupported")
_HEX = "0123456789abcdef"
_NAMED_COLORS: dict[str, str] = {
    "aliceblue": "#f0f8ff",
    "antiquewhite": "#faebd7",
    "aqua": "#00ffff",
    "aquamarine": "#7fffd4",
    "azure": "#f0ffff",
    "beige": "#f5f5dc",
    "bisque": "#ffe4c4",
    "black": "#000000",
    "blanchedalmond": "#ffebcd",
    "blue": "#0000ff",
    "blueviolet": "#8a2be2",
    "brown": "#a52a2a",
    "burlywood": "#deb887",
    "cadetblue": "#5f9ea0",
    "chartreuse": "#7fff00",
    "chocolate": "#d2691e",
    "coral": "#ff7f50",
    "cornflowerblue": "#6495ed",
    "cornsilk": "#fff8dc",
    "crimson": "#dc143c",
    "cyan": "#00ffff",
    "darkblue": "#00008b",
    "darkcyan": "#008b8b",
    "darkgoldenrod": "#b8860b",
    "darkgray": "#a9a9a9",
    "darkgreen": "#006400",
    "darkgrey": "#a9a9a9",
    "darkkhaki": "#bdb76b",
    "darkmagenta": "#8b008b",
    "darkolivegreen": "#556b2f",
    "darkorange": "#ff8c00",
    "darkorchid": "#9932cc",
    "darkred": "#8b0000",
    "darksalmon": "#e9967a",
    "darkseagreen": "#8fbc8f",
    "darkslateblue": "#483d8b",
    "darkslategray": "#2f4f4f",
    "darkslategrey": "#2f4f4f",
    "darkturquoise": "#00ced1",
    "darkviolet": "#9400d3",
    "deeppink": "#ff1493",
    "deepskyblue": "#00bfff",
    "dimgray": "#696969",
    "dimgrey": "#696969",
    "dodgerblue": "#1e90ff",
    "firebrick": "#b22222",
    "floralwhite": "#fffaf0",
    "forestgreen": "#228b22",
    "fuchsia": "#ff00ff",
    "gainsboro": "#dcdcdc",
    "ghostwhite": "#f8f8ff",
    "gold": "#ffd700",
    "goldenrod": "#daa520",
    "gray": "#808080",
    "green": "#008000",
    "greenyellow": "#adff2f",
    "grey": "#808080",
    "honeydew": "#f0fff0",
    "hotpink": "#ff69b4",
    "indianred": "#cd5c5c",
    "indigo": "#4b0082",
    "ivory": "#fffff0",
    "khaki": "#f0e68c",
    "lavender": "#e6e6fa",
    "lavenderblush": "#fff0f5",
    "lawngreen": "#7cfc00",
    "lemonchiffon": "#fffacd",
    "lightblue": "#add8e6",
    "lightcoral": "#f08080",
    "lightcyan": "#e0ffff",
    "lightgoldenrodyellow": "#fafad2",
    "lightgray": "#d3d3d3",
    "lightgreen": "#90ee90",
    "lightgrey": "#d3d3d3",
    "lightpink": "#ffb6c1",
    "lightsalmon": "#ffa07a",
    "lightseagreen": "#20b2aa",
    "lightskyblue": "#87cefa",
    "lightslategray": "#778899",
    "lightslategrey": "#778899",
    "lightsteelblue": "#b0c4de",
    "lightyellow": "#ffffe0",
    "lime": "#00ff00",
    "limegreen": "#32cd32",
    "linen": "#faf0e6",
    "magenta": "#ff00ff",
    "maroon": "#800000",
    "mediumaquamarine": "#66cdaa",
    "mediumblue": "#0000cd",
    "mediumorchid": "#ba55d3",
    "mediumpurple": "#9370db",
    "mediumseagreen": "#3cb371",
    "mediumslateblue": "#7b68ee",
    "mediumspringgreen": "#00fa9a",
    "mediumturquoise": "#48d1cc",
    "mediumvioletred": "#c71585",
    "midnightblue": "#191970",
    "mintcream": "#f5fffa",
    "mistyrose": "#ffe4e1",
    "moccasin": "#ffe4b5",
    "navajowhite": "#ffdead",
    "navy": "#000080",
    "oldlace": "#fdf5e6",
    "olive": "#808000",
    "olivedrab": "#6b8e23",
    "orange": "#ffa500",
    "orangered": "#ff4500",
    "orchid": "#da70d6",
    "palegoldenrod": "#eee8aa",
    "palegreen": "#98fb98",
    "paleturquoise": "#afeeee",
    "palevioletred": "#db7093",
    "papayawhip": "#ffefd5",
    "peachpuff": "#ffdab9",
    "peru": "#cd853f",
    "pink": "#ffc0cb",
    "plum": "#dda0dd",
    "powderblue": "#b0e0e6",
    "purple": "#800080",
    "rebeccapurple": "#663399",
    "red": "#ff0000",
    "rosybrown": "#bc8f8f",
    "royalblue": "#4169e1",
    "saddlebrown": "#8b4513",
    "salmon": "#fa8072",
    "sandybrown": "#f4a460",
    "seagreen": "#2e8b57",
    "seashell": "#fff5ee",
    "sienna": "#a0522d",
    "silver": "#c0c0c0",
    "skyblue": "#87ceeb",
    "slateblue": "#6a5acd",
    "slategray": "#708090",
    "slategrey": "#708090",
    "snow": "#fffafa",
    "springgreen": "#00ff7f",
    "steelblue": "#4682b4",
    "tan": "#d2b48c",
    "teal": "#008080",
    "thistle": "#d8bfd8",
    "tomato": "#ff6347",
    "transparent": "rgba(0,0,0,0)",
    "turquoise": "#40e0d0",
    "violet": "#ee82ee",
    "wheat": "#f5deb3",
    "white": "#ffffff",
    "whitesmoke": "#f5f5f5",
    "yellow": "#ffff00",
    "yellowgreen": "#9acd32",
}


def _safe_input(value: Any) -> JSONValue:
    try:
        return materialize_json(value, "$.style.input")
    except TypeError:
        return "<" + type(value).__name__ + ">"


class OptionResult:
    """The explicit normalization outcome for one style option."""

    def __init__(
        self,
        option: str,
        status: str,
        input_value: Any,
        value: Any = None,
        message: str | None = None,
    ) -> None:
        if not isinstance(option, str) or option == "":
            raise TypeError("style option must be a nonempty string")
        if status not in _STATUSES:
            raise ValueError(
                "style status must be supported, translated, or unsupported"
            )
        if message is not None and (not isinstance(message, str) or message == ""):
            raise TypeError("style result message must be a nonempty string or None")
        self._option = option
        self._status = status
        self._input = _safe_input(input_value)
        self._value = materialize_json(value, "$.style.value")
        self._message = message

    @property
    def option(self) -> str:
        return self._option

    @property
    def status(self) -> str:
        return self._status

    @property
    def value(self) -> JSONValue:
        return materialize_json(self._value, "$.style.value")

    def to_dict(self) -> dict[str, JSONValue]:
        """Return a detached JSON-safe option result."""
        return {
            "option": self._option,
            "status": self._status,
            "input": materialize_json(self._input, "$.style.input"),
            "value": self.value,
            "message": self._message,
        }


class NormalizedStyle:
    """A normalized style plus all supported/translated/unsupported decisions."""

    def __init__(
        self,
        kind: str,
        value: Mapping[str, Any],
        options: Sequence[OptionResult],
    ) -> None:
        if not isinstance(kind, str) or kind == "":
            raise TypeError("style kind must be a nonempty string")
        self._kind = kind
        self._value = materialize_object(value, "$.style")
        self._options = tuple(options)
        status = "supported"
        for option in self._options:
            if not isinstance(option, OptionResult):
                raise TypeError("normalized style options must be OptionResult values")
            if option.status == "unsupported":
                status = "unsupported"
            elif option.status == "translated" and status == "supported":
                status = "translated"
        self._status = status

    @property
    def kind(self) -> str:
        return self._kind

    @property
    def status(self) -> str:
        return self._status

    @property
    def value(self) -> dict[str, JSONValue]:
        return materialize_object(self._value, "$.style")

    @property
    def options(self) -> tuple[OptionResult, ...]:
        return self._options

    def to_dict(self) -> dict[str, JSONValue]:
        """Return a detached JSON-safe style result."""
        return {
            "kind": self._kind,
            "status": self._status,
            "value": self.value,
            "options": [option.to_dict() for option in self._options],
        }


def _supported(option: str, source: Any, value: Any) -> OptionResult:
    return OptionResult(option, "supported", source, value)


def _translated(option: str, source: Any, value: Any, message: str) -> OptionResult:
    return OptionResult(option, "translated", source, value, message)


def _unsupported(option: str, source: Any, message: str) -> OptionResult:
    return OptionResult(option, "unsupported", source, None, message)


def _hex_color(value: str) -> str | None:
    if not value.startswith("#"):
        return None
    digits = value[1:].lower()
    for character in digits:
        if character not in _HEX:
            return None
    if len(digits) == 3:
        return "#" + "".join(character + character for character in digits)
    if len(digits) in (6, 8):
        return "#" + digits
    return None


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    if numeric != numeric or numeric in (float("inf"), float("-inf")):
        return None
    return numeric


def _sequence_color(value: Sequence[Any]) -> str | None:
    if len(value) not in (3, 4):
        return None
    channels: list[float] = []
    for item in value:
        numeric = _number(item)
        if numeric is None:
            return None
        channels.append(numeric)
    rgb = channels[:3]
    normalized = all(0 <= channel <= 1 for channel in rgb)
    if not normalized and not all(0 <= channel <= 255 for channel in rgb):
        return None
    integer_channels = [
        int(round(channel * 255 if normalized else channel)) for channel in rgb
    ]
    if len(channels) == 3:
        hexadecimal: list[str] = []
        for channel in integer_channels:
            hexadecimal.append(_HEX[channel // 16] + _HEX[channel % 16])
        return "#" + "".join(hexadecimal)
    alpha = channels[3]
    if not 0 <= alpha <= 1:
        return None
    return (
        "rgba("
        + ",".join(str(channel) for channel in integer_channels)
        + ","
        + str(alpha)
        + ")"
    )


def _rgb_function_color(value: str) -> str | None:
    prefix = "rgba(" if value.startswith("rgba(") else "rgb("
    if not value.startswith(prefix) or not value.endswith(")"):
        return None
    parts = value[len(prefix) : -1].split(",")
    expected = 4 if prefix == "rgba(" else 3
    if len(parts) != expected:
        return None
    channels: list[float] = []
    for part in parts:
        try:
            numeric = float(part.strip())
        except ValueError:
            return None
        if numeric != numeric or numeric in (float("inf"), float("-inf")):
            return None
        channels.append(numeric)
    if not all(0 <= channel <= 255 for channel in channels[:3]):
        return None
    if len(channels) == 4 and not 0 <= channels[3] <= 1:
        return None
    return prefix + ",".join(str(channel) for channel in channels) + ")"


def normalize_color(value: Any, option: str = "color") -> OptionResult:
    """Normalize one scalar Plotly color without silently stringifying it."""
    if isinstance(value, str):
        stripped = value.strip()
        hexadecimal = _hex_color(stripped)
        if hexadecimal is not None:
            return _supported(option, value, hexadecimal)
        lower = stripped.lower()
        if lower in _NAMED_COLORS:
            return _supported(option, value, lower)
        functional = _rgb_function_color(lower)
        if functional is not None:
            return _supported(option, value, functional)
        return _unsupported(
            option,
            value,
            "Use a CSS color name, #RGB/#RRGGBB/#RRGGBBAA, rgb(), or rgba().",
        )
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        translated = _sequence_color(value)
        if translated is not None:
            return _translated(
                option,
                value,
                translated,
                "Numeric RGB(A) tuples are translated to a CSS color.",
            )
    return _unsupported(option, value, "Color must be a supported scalar CSS color.")


def normalize_opacity(value: Any, option: str = "opacity") -> OptionResult:
    """Normalize opacity to a finite number in the closed interval `[0, 1]`."""
    numeric = _number(value)
    if numeric is not None and 0 <= numeric <= 1:
        return _supported(option, value, numeric)
    if isinstance(value, str) and value.strip().endswith("%"):
        try:
            percent = float(value.strip()[:-1])
        except ValueError:
            percent = -1
        if 0 <= percent <= 100:
            return _translated(
                option,
                value,
                percent / 100,
                "Percentage opacity is translated to Plotly's 0-to-1 scale.",
            )
    return _unsupported(option, value, "Opacity must be between 0 and 1.")


def normalize_line_dash(value: Any, option: str = "dash") -> OptionResult:
    """Normalize Sage and Plotly line-dash names."""
    if not isinstance(value, str):
        return _unsupported(option, value, "Line dash must be a string.")
    style = value.strip().lower()
    if style in ("solid", "dot", "dash", "longdash", "dashdot", "longdashdot"):
        return _supported(option, value, style)
    aliases = {
        "-": "solid",
        "--": "dash",
        ":": "dot",
        "-.": "dashdot",
        "dashed": "dash",
        "dotted": "dot",
    }
    if style in aliases:
        return _translated(
            option,
            value,
            aliases[style],
            "The Sage/Matplotlib dash alias is translated to Plotly.",
        )
    return _unsupported(option, value, "Use a documented Plotly dash name.")


def _positive_number(
    value: Any,
    option: str,
    label: str,
    *,
    allow_zero: bool = False,
) -> OptionResult:
    numeric = _number(value)
    valid = numeric is not None and (numeric >= 0 if allow_zero else numeric > 0)
    if valid:
        return _supported(option, value, numeric)
    if isinstance(value, str) and value.strip().lower().endswith("px"):
        try:
            pixels = float(value.strip()[:-2])
        except ValueError:
            pixels = -1
        valid_pixels = pixels >= 0 if allow_zero else pixels > 0
        if valid_pixels:
            return _translated(
                option,
                value,
                pixels,
                "CSS pixel size is translated to Plotly's numeric " + label + ".",
            )
    comparison = "nonnegative" if allow_zero else "positive"
    return _unsupported(
        option, value, label.capitalize() + " must be " + comparison + "."
    )


def normalize_line_width(value: Any, option: str = "width") -> OptionResult:
    return _positive_number(value, option, "line width")


def normalize_marker_size(value: Any, option: str = "size") -> OptionResult:
    return _positive_number(value, option, "marker size")


def normalize_text_size(value: Any, option: str = "size") -> OptionResult:
    return _positive_number(value, option, "text size")


def normalize_marker_symbol(value: Any, option: str = "symbol") -> OptionResult:
    if not isinstance(value, str):
        return _unsupported(option, value, "Marker symbol must be a string.")
    symbol = value.strip().lower()
    supported = (
        "circle",
        "square",
        "diamond",
        "cross",
        "x",
        "triangle-up",
        "triangle-down",
        "star",
    )
    if symbol in supported:
        return _supported(option, value, symbol)
    aliases = {
        "o": "circle",
        "s": "square",
        "d": "diamond",
        "+": "cross",
        "^": "triangle-up",
        "v": "triangle-down",
    }
    if symbol in aliases:
        return _translated(
            option,
            value,
            aliases[symbol],
            "The Sage/Matplotlib marker alias is translated to Plotly.",
        )
    return _unsupported(option, value, "Use a supported Plotly marker symbol.")


def normalize_fill_mode(value: Any, option: str = "mode") -> OptionResult:
    if isinstance(value, bool):
        return _translated(
            option,
            value,
            "tozeroy" if value else "none",
            "Boolean fill is translated to an explicit Plotly fill mode.",
        )
    if isinstance(value, str):
        mode = value.strip().lower()
        if mode in (
            "none",
            "tozeroy",
            "tozerox",
            "tonexty",
            "tonextx",
            "toself",
            "tonext",
        ):
            return _supported(option, value, mode)
    return _unsupported(option, value, "Use an explicit Plotly fill mode.")


def _string_option(value: Any, option: str, label: str) -> OptionResult:
    if isinstance(value, str) and value.strip() != "":
        return _supported(option, value, value.strip())
    return _unsupported(option, value, label + " must be a nonempty string.")


Normalizer = Callable[[Any, str], OptionResult]


def _normalize_style(
    kind: str,
    options: Mapping[str, Any],
    normalizers: Mapping[str, Normalizer],
) -> NormalizedStyle:
    if not isinstance(options, Mapping):
        raise TypeError(kind + " style must be a mapping")
    output: dict[str, JSONValue] = {}
    results: list[OptionResult] = []
    option_names: list[str] = []
    for option in options:
        if not isinstance(option, str):
            raise TypeError(kind + " style keys must be strings")
        option_names.append(option)
    option_names.sort()
    for option in option_names:
        if option not in normalizers:
            result = _unsupported(
                option,
                options[option],
                "The option is not supported by the normalized " + kind + " style.",
            )
        else:
            result = normalizers[option](options[option], option)
        results.append(result)
        if result.status != "unsupported":
            output[option] = result.value
    return NormalizedStyle(kind, output, results)


def normalize_line_style(options: Mapping[str, Any]) -> NormalizedStyle:
    """Normalize color, opacity, dash, and width for a semantic line."""
    return _normalize_style(
        "line",
        options,
        {
            "color": normalize_color,
            "opacity": normalize_opacity,
            "dash": normalize_line_dash,
            "width": normalize_line_width,
        },
    )


def normalize_marker_style(options: Mapping[str, Any]) -> NormalizedStyle:
    """Normalize a modest Plotly-native marker style."""
    return _normalize_style(
        "marker",
        options,
        {
            "color": normalize_color,
            "opacity": normalize_opacity,
            "size": normalize_marker_size,
            "symbol": normalize_marker_symbol,
        },
    )


def normalize_fill_style(options: Mapping[str, Any]) -> NormalizedStyle:
    """Normalize fill color, opacity, and mode."""
    return _normalize_style(
        "fill",
        options,
        {
            "color": normalize_color,
            "opacity": normalize_opacity,
            "mode": normalize_fill_mode,
        },
    )


def normalize_text_style(options: Mapping[str, Any]) -> NormalizedStyle:
    """Normalize text color, opacity, size, and font family."""
    return _normalize_style(
        "text",
        options,
        {
            "color": normalize_color,
            "opacity": normalize_opacity,
            "size": normalize_text_size,
            "family": lambda value, option: _string_option(
                value, option, "Font family"
            ),
        },
    )


def color_channels(value: Any) -> tuple[float, float, float, float]:
    """Return normalized RGBA channels for a supported scalar color.

    This helper is shared with theme accessibility checks. Unsupported or
    malformed colors raise `ValueError` rather than guessing.
    """
    result = normalize_color(value)
    if result.status == "unsupported" or not isinstance(result.value, str):
        raise ValueError("unsupported color for channel conversion")
    color = result.value
    if color in _NAMED_COLORS:
        color = _NAMED_COLORS[color]
    if color.startswith("#"):
        digits = color[1:]
        red = int(digits[0:2], 16) / 255
        green = int(digits[2:4], 16) / 255
        blue = int(digits[4:6], 16) / 255
        alpha = int(digits[6:8], 16) / 255 if len(digits) == 8 else 1.0
        return red, green, blue, alpha
    prefix = "rgba(" if color.startswith("rgba(") else "rgb("
    if not color.startswith(prefix) or not color.endswith(")"):
        raise ValueError("unsupported color for channel conversion")
    parts = color[len(prefix) : -1].split(",")
    expected = 4 if prefix == "rgba(" else 3
    if len(parts) != expected:
        raise ValueError("malformed rgb color")
    try:
        channels = [float(part) for part in parts]
    except ValueError:
        raise ValueError("malformed rgb color") from None
    if not all(0 <= channel <= 255 for channel in channels[:3]):
        raise ValueError("rgb channels must be between 0 and 255")
    alpha = channels[3] if len(channels) == 4 else 1.0
    if not 0 <= alpha <= 1:
        raise ValueError("alpha channel must be between 0 and 1")
    return channels[0] / 255, channels[1] / 255, channels[2] / 255, alpha
