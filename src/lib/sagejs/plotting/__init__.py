"""Semantic plotting documents shared by Sage.js frontends and renderers."""

from ._json import JSONScalar, JSONValue, canonical_json, materialize_json
from .diagnostics import (
    Diagnostic,
    diagnostic_definition,
    diagnostic_registry,
    materialize_diagnostic,
)
from .model import (
    PLOTSPEC_SCHEMA_VERSION,
    PlotLayer,
    PlotSpec,
    Provenance,
    make_layer,
    next_layer_id,
    stable_layer_id,
)
from .styles import (
    NormalizedStyle,
    OptionResult,
    color_channels,
    normalize_color,
    normalize_fill_style,
    normalize_line_style,
    normalize_marker_style,
    normalize_text_style,
)
from .themes import (
    PlotTheme,
    contrast_ratio,
    get_theme,
    theme_contrast,
    theme_names,
    theme_registry,
)

__all__ = [
    "Diagnostic",
    "JSONScalar",
    "JSONValue",
    "PLOTSPEC_SCHEMA_VERSION",
    "NormalizedStyle",
    "OptionResult",
    "PlotLayer",
    "PlotSpec",
    "PlotTheme",
    "Provenance",
    "canonical_json",
    "color_channels",
    "contrast_ratio",
    "diagnostic_definition",
    "diagnostic_registry",
    "make_layer",
    "materialize_diagnostic",
    "materialize_json",
    "next_layer_id",
    "normalize_color",
    "normalize_fill_style",
    "normalize_line_style",
    "normalize_marker_style",
    "normalize_text_style",
    "stable_layer_id",
    "get_theme",
    "theme_contrast",
    "theme_names",
    "theme_registry",
]
