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

__all__ = [
    "Diagnostic",
    "JSONScalar",
    "JSONValue",
    "PLOTSPEC_SCHEMA_VERSION",
    "PlotLayer",
    "PlotSpec",
    "Provenance",
    "canonical_json",
    "diagnostic_definition",
    "diagnostic_registry",
    "make_layer",
    "materialize_diagnostic",
    "materialize_json",
    "next_layer_id",
    "stable_layer_id",
]
