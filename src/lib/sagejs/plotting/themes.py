"""Deterministic accessible Plotly-native themes shared by 2D and 3D plots."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ._json import JSONValue, canonical_json, materialize_object
from .styles import color_channels

THEME_SCHEMA_VERSION = 1


class PlotTheme:
    """An immutable-by-interface, copy-safe Plotly theme document."""

    def __init__(
        self,
        name: str,
        *,
        tokens: Mapping[str, Any],
        layout: Mapping[str, Any],
        config: Mapping[str, Any],
        trace_defaults: Mapping[str, Any],
    ) -> None:
        if not isinstance(name, str) or name == "":
            raise TypeError("theme name must be a nonempty string")
        self._name = name
        self._tokens = materialize_object(tokens, "$.theme.tokens")
        self._layout = materialize_object(layout, "$.theme.layout")
        self._config = materialize_object(config, "$.theme.config")
        self._trace_defaults = materialize_object(
            trace_defaults, "$.theme.trace_defaults"
        )

    @property
    def name(self) -> str:
        return self._name

    @property
    def tokens(self) -> dict[str, JSONValue]:
        return materialize_object(self._tokens, "$.theme.tokens")

    @property
    def layout(self) -> dict[str, JSONValue]:
        return materialize_object(self._layout, "$.theme.layout")

    @property
    def config(self) -> dict[str, JSONValue]:
        return materialize_object(self._config, "$.theme.config")

    @property
    def trace_defaults(self) -> dict[str, JSONValue]:
        return materialize_object(self._trace_defaults, "$.theme.trace_defaults")

    def to_dict(self) -> dict[str, JSONValue]:
        """Return a detached JSON-safe theme document."""
        return {
            "schema_version": THEME_SCHEMA_VERSION,
            "name": self._name,
            "tokens": self.tokens,
            "layout": self.layout,
            "config": self.config,
            "trace_defaults": self.trace_defaults,
        }

    def to_json(self) -> str:
        """Return stable compact JSON text."""
        return canonical_json(self.to_dict())


def _axis(color: str, grid: str, *, automargin: bool = True) -> dict[str, JSONValue]:
    answer: dict[str, JSONValue] = {
        "color": color,
        "gridcolor": grid,
        "linecolor": color,
        "zerolinecolor": grid,
    }
    if automargin:
        answer["automargin"] = True
    return answer


def _theme(
    name: str,
    colorway: Sequence[str],
    *,
    paper: str,
    plot: str,
    foreground: str,
    grid: str,
    axis: str,
    font_family: str,
    font_size: int,
    line_width: float,
    marker_size: float,
    margins: tuple[int, int, int, int],
    legend_orientation: str,
    hover_background: str,
    camera_eye: tuple[float, float, float],
    lighting: Mapping[str, float],
    material: Mapping[str, Any],
) -> PlotTheme:
    palette = list(colorway)
    left, right, top, bottom = margins
    axis_defaults = _axis(axis, grid)
    scene_axes = {
        "xaxis": _axis(axis, grid, automargin=False),
        "yaxis": _axis(axis, grid, automargin=False),
        "zaxis": _axis(axis, grid, automargin=False),
    }
    scene: dict[str, Any] = {
        "bgcolor": plot,
        "aspectmode": "data",
        "camera": {
            "center": {"x": 0, "y": 0, "z": 0},
            "eye": {"x": camera_eye[0], "y": camera_eye[1], "z": camera_eye[2]},
            "up": {"x": 0, "y": 0, "z": 1},
        },
    }
    scene.update(scene_axes)
    tokens: dict[str, Any] = {
        "colorway": palette,
        "paper_background": paper,
        "plot_background": plot,
        "foreground": foreground,
        "grid": grid,
        "axis": axis,
        "font_family": font_family,
        "font_size": font_size,
        "line_width": line_width,
        "marker_size": marker_size,
    }
    layout: dict[str, Any] = {
        "autosize": True,
        "colorway": palette,
        "paper_bgcolor": paper,
        "plot_bgcolor": plot,
        "font": {"family": font_family, "size": font_size, "color": foreground},
        "margin": {"l": left, "r": right, "t": top, "b": bottom, "pad": 4},
        "xaxis": axis_defaults,
        "yaxis": _axis(axis, grid),
        "legend": {
            "orientation": legend_orientation,
            "bgcolor": paper,
            "bordercolor": grid,
            "borderwidth": 1,
            "font": {"color": foreground, "size": font_size},
            "itemclick": "toggle",
            "itemdoubleclick": "toggleothers",
        },
        "hoverlabel": {
            "bgcolor": hover_background,
            "bordercolor": axis,
            "font": {"family": font_family, "size": font_size, "color": foreground},
            "namelength": 48,
        },
        "scene": scene,
    }
    config: dict[str, Any] = {
        "responsive": True,
        "displaylogo": False,
        "displayModeBar": True,
        "scrollZoom": True,
        "doubleClick": "reset+autosize",
    }
    trace_defaults: dict[str, Any] = {
        "line": {"width": line_width},
        "marker": {"size": marker_size},
        "surface": {
            "lighting": dict(lighting),
            "lightposition": {"x": 100, "y": 200, "z": 300},
        },
        "mesh3d": {"lighting": dict(lighting), **dict(material)},
    }
    return PlotTheme(
        name,
        tokens=tokens,
        layout=layout,
        config=config,
        trace_defaults=trace_defaults,
    )


_LIGHTING = {
    "ambient": 0.65,
    "diffuse": 0.75,
    "specular": 0.2,
    "roughness": 0.7,
    "fresnel": 0.1,
}
_MATERIAL = {"flatshading": False, "opacity": 1.0}
_LIGHT_PALETTE = (
    "#0072b2",
    "#d55e00",
    "#007f5f",
    "#a64d79",
    "#6a3d9a",
    "#8c6d1f",
    "#006d77",
    "#444444",
)
_DARK_PALETTE = (
    "#56b4e9",
    "#f0a33a",
    "#4ecb9c",
    "#e78ac3",
    "#cab2d6",
    "#ffd166",
    "#8dd3c7",
    "#ffffff",
)
_HIGH_CONTRAST_PALETTE = (
    "#000000",
    "#005a9c",
    "#9c2f00",
    "#00633f",
    "#7a1f5c",
    "#5b2c83",
    "#704f00",
    "#164e63",
)

_THEMES = (
    _theme(
        "notebook",
        _LIGHT_PALETTE,
        paper="#ffffff",
        plot="#f8fafc",
        foreground="#1f2937",
        grid="#d7dee8",
        axis="#64748b",
        font_family="Inter, system-ui, sans-serif",
        font_size=14,
        line_width=2.0,
        marker_size=8.0,
        margins=(64, 32, 48, 56),
        legend_orientation="v",
        hover_background="#ffffff",
        camera_eye=(1.45, 1.45, 1.2),
        lighting=_LIGHTING,
        material=_MATERIAL,
    ),
    _theme(
        "presentation",
        _LIGHT_PALETTE,
        paper="#ffffff",
        plot="#f8fafc",
        foreground="#111827",
        grid="#cbd5e1",
        axis="#475569",
        font_family="Inter, system-ui, sans-serif",
        font_size=20,
        line_width=3.0,
        marker_size=11.0,
        margins=(78, 42, 64, 70),
        legend_orientation="h",
        hover_background="#ffffff",
        camera_eye=(1.5, 1.5, 1.25),
        lighting=_LIGHTING,
        material=_MATERIAL,
    ),
    _theme(
        "publication",
        _HIGH_CONTRAST_PALETTE,
        paper="#ffffff",
        plot="#ffffff",
        foreground="#000000",
        grid="#d4d4d4",
        axis="#333333",
        font_family="STIX Two Text, Georgia, serif",
        font_size=12,
        line_width=1.5,
        marker_size=6.0,
        margins=(58, 24, 36, 50),
        legend_orientation="v",
        hover_background="#ffffff",
        camera_eye=(1.35, 1.35, 1.15),
        lighting=_LIGHTING,
        material=_MATERIAL,
    ),
    _theme(
        "dark",
        _DARK_PALETTE,
        paper="#0b1020",
        plot="#111827",
        foreground="#f8fafc",
        grid="#334155",
        axis="#cbd5e1",
        font_family="Inter, system-ui, sans-serif",
        font_size=14,
        line_width=2.2,
        marker_size=8.5,
        margins=(64, 32, 48, 56),
        legend_orientation="v",
        hover_background="#1e293b",
        camera_eye=(1.45, 1.45, 1.2),
        lighting={
            "ambient": 0.8,
            "diffuse": 0.65,
            "specular": 0.15,
            "roughness": 0.8,
            "fresnel": 0.15,
        },
        material=_MATERIAL,
    ),
    _theme(
        "high-contrast",
        _HIGH_CONTRAST_PALETTE,
        paper="#ffffff",
        plot="#ffffff",
        foreground="#000000",
        grid="#666666",
        axis="#000000",
        font_family="Atkinson Hyperlegible, Arial, sans-serif",
        font_size=16,
        line_width=2.8,
        marker_size=10.0,
        margins=(72, 40, 54, 64),
        legend_orientation="v",
        hover_background="#ffffff",
        camera_eye=(1.5, 1.5, 1.25),
        lighting={
            "ambient": 0.75,
            "diffuse": 0.8,
            "specular": 0.1,
            "roughness": 0.85,
            "fresnel": 0.05,
        },
        material={"flatshading": False, "opacity": 1.0},
    ),
)


def theme_names() -> tuple[str, ...]:
    """Return the five canonical theme names in product order."""
    return tuple(theme.name for theme in _THEMES)


def get_theme(name: str = "notebook") -> PlotTheme:
    """Return a fresh immutable theme object by canonical name."""
    if not isinstance(name, str):
        raise TypeError("theme name must be a string")
    for theme in _THEMES:
        if theme.name == name:
            return PlotTheme(
                theme.name,
                tokens=theme.tokens,
                layout=theme.layout,
                config=theme.config,
                trace_defaults=theme.trace_defaults,
            )
    raise ValueError("unknown plot theme: " + name)


def theme_registry() -> list[dict[str, JSONValue]]:
    """Return the detached deterministic five-theme registry."""
    return [theme.to_dict() for theme in _THEMES]


def _linear_channel(channel: float) -> float:
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def _composite(
    foreground: tuple[float, float, float, float],
    background: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    red, green, blue, alpha = foreground
    back_red, back_green, back_blue, back_alpha = background
    output_alpha = alpha + back_alpha * (1 - alpha)
    if output_alpha == 0:
        return 0.0, 0.0, 0.0, 0.0
    return (
        (red * alpha + back_red * back_alpha * (1 - alpha)) / output_alpha,
        (green * alpha + back_green * back_alpha * (1 - alpha)) / output_alpha,
        (blue * alpha + back_blue * back_alpha * (1 - alpha)) / output_alpha,
        output_alpha,
    )


def relative_luminance(color: Any, background: Any = "#ffffff") -> float:
    """Return WCAG relative luminance after alpha compositing."""
    foreground_channels = color_channels(color)
    background_channels = color_channels(background)
    composited = _composite(foreground_channels, background_channels)
    return (
        0.2126 * _linear_channel(composited[0])
        + 0.7152 * _linear_channel(composited[1])
        + 0.0722 * _linear_channel(composited[2])
    )


def contrast_ratio(foreground: Any, background: Any) -> float:
    """Return the WCAG contrast ratio in the closed interval `[1, 21]`."""
    foreground_luminance = relative_luminance(foreground, background)
    background_luminance = relative_luminance(background)
    lighter = max(foreground_luminance, background_luminance)
    darker = min(foreground_luminance, background_luminance)
    return (lighter + 0.05) / (darker + 0.05)


def theme_contrast(name: str = "notebook") -> dict[str, JSONValue]:
    """Return stable WCAG-like theme contrast metrics for validation."""
    theme = get_theme(name)
    tokens = theme.tokens
    colorway = tokens["colorway"]
    if not isinstance(colorway, list):
        raise TypeError("theme colorway must be a sequence")
    plot = tokens["plot_background"]
    paper = tokens["paper_background"]
    foreground = tokens["foreground"]
    axis = tokens["axis"]
    grid = tokens["grid"]
    return {
        "foreground_on_paper": contrast_ratio(foreground, paper),
        "foreground_on_plot": contrast_ratio(foreground, plot),
        "axis_on_plot": contrast_ratio(axis, plot),
        "grid_on_plot": contrast_ratio(grid, plot),
        "categorical_on_plot": [contrast_ratio(color, plot) for color in colorway],
    }
