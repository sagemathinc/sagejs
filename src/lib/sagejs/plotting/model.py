"""Versioned semantic plot model shared by Sage.js plotting frontends."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ._json import (
    JSONValue,
    canonical_json,
    materialize_array,
    materialize_json,
    materialize_object,
)
from .diagnostics import Diagnostic, materialize_diagnostic

PLOTSPEC_SCHEMA_VERSION = 1


def _nonempty_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or value == "":
        raise TypeError(name + " must be a nonempty string")
    return value


def _valid_identifier(value: str) -> bool:
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
    for character in value:
        if character not in allowed:
            return False
    return value != ""


def stable_layer_id(ordinal: int, namespace: str = "layer") -> str:
    """Return the deterministic layer ID for an ordinal in `namespace`.

    IDs intentionally depend on semantic layer order rather than style or
    sampled data. An agent can therefore revise a layer without losing its
    handle. Composition code preserves IDs that are unique and allocates a new
    ordinal for collisions.
    """
    if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal < 0:
        raise ValueError("layer ordinal must be a nonnegative integer")
    if not isinstance(namespace, str) or not _valid_identifier(namespace):
        raise ValueError(
            "layer namespace may contain only letters, digits, '-', '_', and '.'"
        )
    return namespace + "-" + str(ordinal)


def next_layer_id(layer_ids: Sequence[str], namespace: str = "layer") -> str:
    """Return the first deterministic ID not present in `layer_ids`."""
    used: dict[str, bool] = {}
    for layer_id in layer_ids:
        used[_nonempty_string(layer_id, "layer ID")] = True
    ordinal = 0
    while stable_layer_id(ordinal, namespace) in used:
        ordinal += 1
    return stable_layer_id(ordinal, namespace)


class Provenance:
    """Portable construction history retained with a plot specification.

    Frontends own evaluation semantics. Generic JSON metadata can preserve
    ordered options, source spans, nested group information, or frontend-only
    directives without teaching the core model a particular language.
    """

    def __init__(
        self,
        frontend: str,
        *,
        source_language: str | None = None,
        constructor: str | None = None,
        source: Any = None,
        ranges: Sequence[Any] | None = None,
        sampling: Mapping[str, Any] | None = None,
        transforms: Sequence[Any] | None = None,
        approximations: Sequence[Any] | None = None,
        translation_events: Sequence[Any] | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> None:
        self._frontend = _nonempty_string(frontend, "provenance frontend")
        if source_language is not None:
            _nonempty_string(source_language, "provenance source_language")
        if constructor is not None:
            _nonempty_string(constructor, "provenance constructor")
        self._source_language = source_language
        self._constructor = constructor
        self._source = materialize_json(source, "$.provenance.source")
        self._ranges = materialize_array(ranges, "$.provenance.ranges")
        self._sampling = materialize_object(sampling, "$.provenance.sampling")
        self._transforms = materialize_array(transforms, "$.provenance.transforms")
        self._approximations = materialize_array(
            approximations, "$.provenance.approximations"
        )
        self._translation_events = materialize_array(
            translation_events, "$.provenance.translation_events"
        )
        self._metadata = materialize_object(metadata, "$.provenance.metadata")

    @property
    def frontend(self) -> str:
        return self._frontend

    @property
    def metadata(self) -> dict[str, JSONValue]:
        return materialize_object(self._metadata, "$.provenance.metadata")

    def to_dict(self) -> dict[str, JSONValue]:
        """Return detached JSON-safe provenance."""
        return {
            "frontend": self._frontend,
            "source_language": self._source_language,
            "constructor": self._constructor,
            "source": materialize_json(self._source, "$.provenance.source"),
            "ranges": materialize_array(self._ranges, "$.provenance.ranges"),
            "sampling": materialize_object(self._sampling, "$.provenance.sampling"),
            "transforms": materialize_array(
                self._transforms, "$.provenance.transforms"
            ),
            "approximations": materialize_array(
                self._approximations, "$.provenance.approximations"
            ),
            "translation_events": materialize_array(
                self._translation_events, "$.provenance.translation_events"
            ),
            "metadata": materialize_object(self._metadata, "$.provenance.metadata"),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "Provenance":
        """Construct provenance from its materialized record."""
        return cls(
            str(value["frontend"]),
            source_language=value.get("source_language"),
            constructor=value.get("constructor"),
            source=value.get("source"),
            ranges=value.get("ranges"),
            sampling=value.get("sampling"),
            transforms=value.get("transforms"),
            approximations=value.get("approximations"),
            translation_events=value.get("translation_events"),
            metadata=value.get("metadata"),
        )


class PlotLayer:
    """One materialized semantic plot layer with a stable ID."""

    def __init__(
        self,
        layer_id: str,
        kind: str,
        data: Any,
        *,
        source_intent: Mapping[str, Any] | None = None,
        style: Mapping[str, Any] | None = None,
        visibility: bool = True,
        legend: Mapping[str, Any] | None = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> None:
        self._id = _nonempty_string(layer_id, "layer ID")
        if not _valid_identifier(self._id):
            raise ValueError(
                "layer ID may contain only letters, digits, '-', '_', and '.'"
            )
        self._kind = _nonempty_string(kind, "layer kind")
        if not isinstance(visibility, bool):
            raise TypeError("layer visibility must be a bool")
        self._source_intent = materialize_object(source_intent, "$.layer.source_intent")
        self._data = materialize_json(data, "$.layer.data")
        self._style = materialize_object(style, "$.layer.style")
        self._visibility = visibility
        self._legend = materialize_object(legend, "$.layer.legend")
        self._metadata = materialize_object(metadata, "$.layer.metadata")

    @property
    def id(self) -> str:
        return self._id

    @property
    def kind(self) -> str:
        return self._kind

    @property
    def source_intent(self) -> dict[str, JSONValue]:
        return materialize_object(self._source_intent, "$.layer.source_intent")

    @property
    def data(self) -> JSONValue:
        return materialize_json(self._data, "$.layer.data")

    @property
    def style(self) -> dict[str, JSONValue]:
        return materialize_object(self._style, "$.layer.style")

    @property
    def visibility(self) -> bool:
        return self._visibility

    @property
    def legend(self) -> dict[str, JSONValue]:
        return materialize_object(self._legend, "$.layer.legend")

    @property
    def metadata(self) -> dict[str, JSONValue]:
        return materialize_object(self._metadata, "$.layer.metadata")

    def to_dict(self) -> dict[str, JSONValue]:
        """Return a detached JSON-safe layer record."""
        return {
            "id": self._id,
            "kind": self._kind,
            "source_intent": self.source_intent,
            "data": self.data,
            "style": self.style,
            "visibility": self._visibility,
            "legend": self.legend,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "PlotLayer":
        """Construct a layer from its materialized record."""
        return cls(
            str(value["id"]),
            str(value["kind"]),
            value["data"],
            source_intent=value.get("source_intent"),
            style=value.get("style"),
            visibility=value.get("visibility", True),
            legend=value.get("legend"),
            metadata=value.get("metadata"),
        )


def make_layer(
    kind: str,
    data: Any,
    *,
    ordinal: int = 0,
    namespace: str = "layer",
    source_intent: Mapping[str, Any] | None = None,
    style: Mapping[str, Any] | None = None,
    visibility: bool = True,
    legend: Mapping[str, Any] | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> PlotLayer:
    """Construct a materialized layer with a deterministic ordinal ID."""
    return PlotLayer(
        stable_layer_id(ordinal, namespace),
        kind,
        data,
        source_intent=source_intent,
        style=style,
        visibility=visibility,
        legend=legend,
        metadata=metadata,
    )


def _materialize_layer(value: PlotLayer | Mapping[str, Any]) -> PlotLayer:
    if isinstance(value, PlotLayer):
        return PlotLayer.from_dict(value.to_dict())
    if isinstance(value, Mapping):
        return PlotLayer.from_dict(value)
    raise TypeError("plot layer must be a PlotLayer or mapping")


def _materialize_provenance(
    value: Provenance | Mapping[str, Any] | None,
) -> dict[str, JSONValue]:
    if value is None:
        return {}
    if isinstance(value, Provenance):
        return value.to_dict()
    if not isinstance(value, Mapping):
        raise TypeError("plot provenance must be Provenance or a mapping")
    if "frontend" in value:
        return Provenance.from_dict(value).to_dict()
    return materialize_object(value, "$.provenance")


class PlotSpec:
    """A versioned, deterministic, renderer-oriented semantic plot document."""

    def __init__(
        self,
        dimension: int,
        layers: Sequence[PlotLayer | Mapping[str, Any]] = (),
        *,
        axes_or_scene: Mapping[str, Any] | None = None,
        viewport: Mapping[str, Any] | None = None,
        theme: str = "notebook",
        annotations: Sequence[Any] | None = None,
        interactions: Mapping[str, Any] | None = None,
        animation: Mapping[str, Any] | None = None,
        provenance: Provenance | Mapping[str, Any] | None = None,
        diagnostics: Sequence[Diagnostic | Mapping[str, Any]] = (),
        plotly_overrides: Mapping[str, Any] | None = None,
    ) -> None:
        if isinstance(dimension, bool) or dimension not in (2, 3):
            raise ValueError("plot dimension must be 2 or 3")
        materialized_layers: list[PlotLayer] = []
        layer_ids: dict[str, bool] = {}
        for value in layers:
            layer = _materialize_layer(value)
            if layer.id in layer_ids:
                raise ValueError("duplicate plot layer ID: " + layer.id)
            layer_ids[layer.id] = True
            materialized_layers.append(layer)
        materialized_diagnostics: list[dict[str, JSONValue]] = []
        for diagnostic in diagnostics:
            record = materialize_diagnostic(diagnostic)
            referenced_layers = record["layer_ids"]
            if not isinstance(referenced_layers, list):
                raise TypeError("diagnostic layer_ids must be a sequence")
            for layer_id in referenced_layers:
                if layer_id not in layer_ids:
                    raise ValueError(
                        "diagnostic references unknown plot layer ID: " + str(layer_id)
                    )
            materialized_diagnostics.append(record)
        self._dimension = dimension
        self._layers = tuple(materialized_layers)
        self._axes_or_scene = materialize_object(axes_or_scene, "$.axes_or_scene")
        self._viewport = materialize_object(viewport, "$.viewport")
        self._theme = _nonempty_string(theme, "plot theme")
        self._annotations = materialize_array(annotations, "$.annotations")
        self._interactions = materialize_object(interactions, "$.interactions")
        self._animation = materialize_object(animation, "$.animation")
        self._provenance = _materialize_provenance(provenance)
        self._diagnostics = tuple(materialized_diagnostics)
        self._plotly_overrides = materialize_object(
            plotly_overrides, "$.plotly_overrides"
        )

    @property
    def schema_version(self) -> int:
        return PLOTSPEC_SCHEMA_VERSION

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def layers(self) -> tuple[PlotLayer, ...]:
        return self._layers

    @property
    def theme(self) -> str:
        return self._theme

    @property
    def provenance(self) -> dict[str, JSONValue]:
        return materialize_object(self._provenance, "$.provenance")

    @property
    def diagnostics(self) -> tuple[Diagnostic, ...]:
        output: list[Diagnostic] = []
        for diagnostic in self._diagnostics:
            output.append(Diagnostic.from_dict(diagnostic))
        return tuple(output)

    @property
    def plotly_overrides(self) -> dict[str, JSONValue]:
        return materialize_object(self._plotly_overrides, "$.plotly_overrides")

    def to_dict(self) -> dict[str, JSONValue]:
        """Return the complete detached materialized PlotSpec document."""
        return {
            "schema_version": PLOTSPEC_SCHEMA_VERSION,
            "dimension": self._dimension,
            "layers": [layer.to_dict() for layer in self._layers],
            "axes_or_scene": materialize_object(self._axes_or_scene, "$.axes_or_scene"),
            "viewport": materialize_object(self._viewport, "$.viewport"),
            "theme": self._theme,
            "annotations": materialize_array(self._annotations, "$.annotations"),
            "interactions": materialize_object(self._interactions, "$.interactions"),
            "animation": materialize_object(self._animation, "$.animation"),
            "provenance": self.provenance,
            "diagnostics": [
                materialize_diagnostic(diagnostic) for diagnostic in self._diagnostics
            ],
            "plotly_overrides": self.plotly_overrides,
        }

    def to_json(self) -> str:
        """Return stable compact UTF-8 JSON text."""
        return canonical_json(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "PlotSpec":
        """Validate and reconstruct a materialized PlotSpec document."""
        if value.get("schema_version") != PLOTSPEC_SCHEMA_VERSION:
            raise ValueError(
                "unsupported PlotSpec schema version: "
                + str(value.get("schema_version"))
            )
        return cls(
            value["dimension"],
            value["layers"],
            axes_or_scene=value.get("axes_or_scene"),
            viewport=value.get("viewport"),
            theme=value.get("theme", "notebook"),
            annotations=value.get("annotations"),
            interactions=value.get("interactions"),
            animation=value.get("animation"),
            provenance=value.get("provenance"),
            diagnostics=value.get("diagnostics", ()),
            plotly_overrides=value.get("plotly_overrides"),
        )

    @classmethod
    def from_json(cls, source: str) -> "PlotSpec":
        """Parse stable PlotSpec JSON text."""
        import json

        value = json.loads(source)
        if not isinstance(value, Mapping):
            raise TypeError("PlotSpec JSON must contain an object")
        return cls.from_dict(value)
