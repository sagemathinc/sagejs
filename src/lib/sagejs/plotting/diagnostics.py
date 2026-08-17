"""Stable structured diagnostics for semantic plot specifications.

Diagnostic codes are an append-only public interface. A retired check keeps
its code reserved; a different meaning receives a new code.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ._json import JSONValue, materialize_object

_SEVERITIES = ("info", "warning", "error")

_DEFINITIONS: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    (
        "PLOT_DATA_EMPTY",
        "warning",
        "data",
        "The plot layer has no data to render.",
        ("Provide data or adjust the sampling domain.",),
    ),
    (
        "PLOT_DATA_ALL_NONFINITE",
        "warning",
        "data",
        "Every sampled value in the plot layer is non-finite.",
        ("Check the expression, domain, and numerical coercions.",),
    ),
    (
        "PLOT_DATA_PARTIAL_NONFINITE",
        "info",
        "data",
        "Some sampled values are non-finite and render as gaps.",
        ("Inspect discontinuities or restrict the domain if the gaps are unintended.",),
    ),
    (
        "PLOT_AXIS_LOG_NONPOSITIVE",
        "warning",
        "axes",
        "A logarithmic axis received non-positive data.",
        ("Remove non-positive values or choose a linear scale.",),
    ),
    (
        "PLOT_LAYER_OUTSIDE_VIEW",
        "warning",
        "viewport",
        "The plot layer lies outside the visible viewport.",
        ("Expand the viewport or revise the layer coordinates.",),
    ),
    (
        "PLOT_LAYER_EFFECTIVELY_INVISIBLE",
        "warning",
        "style",
        "The plot layer is present but effectively invisible.",
        ("Increase opacity, marker size, or line width.",),
    ),
    (
        "PLOT_STYLE_LOW_CONTRAST",
        "warning",
        "style",
        "Foreground and background colors have low contrast.",
        ("Choose a higher-contrast color or theme.",),
    ),
    (
        "PLOT_STYLE_COLOR_COLLISION",
        "info",
        "style",
        "Distinct plot layers use colors that are difficult to distinguish.",
        ("Use a categorical palette with more separation.",),
    ),
    (
        "PLOT_LEGEND_MISSING_LABEL",
        "info",
        "legend",
        "A visible legend entry has no useful label.",
        ("Assign a concise legend label or hide the entry.",),
    ),
    (
        "PLOT_LEGEND_DUPLICATE_LABEL",
        "info",
        "legend",
        "More than one plot layer uses the same legend label.",
        ("Use distinct labels or group the layers intentionally.",),
    ),
    (
        "PLOT_TEXT_OVERLAP_RISK",
        "info",
        "text",
        "Text labels are likely to overlap.",
        ("Move, shorten, or selectively hide labels.",),
    ),
    (
        "PLOT_RESOURCE_EXCESSIVE_SAMPLES",
        "warning",
        "resource",
        "The plot uses an excessive number of samples.",
        ("Request a lower-cost preview or reduce the sampling density.",),
    ),
    (
        "PLOT_RESOURCE_EXCESSIVE_PAYLOAD",
        "warning",
        "resource",
        "The serialized plot payload is excessively large.",
        ("Downsample, simplify geometry, or rasterize an appropriate layer.",),
    ),
    (
        "PLOT_3D_DEGENERATE_BOUNDS",
        "warning",
        "scene",
        "The 3D scene has a degenerate spatial extent.",
        ("Expand a zero-width bound or use a lower-dimensional plot.",),
    ),
    (
        "PLOT_3D_EXTREME_ASPECT",
        "info",
        "scene",
        "The 3D scene has an extreme aspect ratio.",
        ("Choose a manual aspect ratio or rescale the coordinates.",),
    ),
    (
        "PLOT_3D_CAMERA_OCCLUSION_RISK",
        "info",
        "scene",
        "The current 3D camera may hide meaningful structure.",
        ("Rotate the scene or choose a camera preset.",),
    ),
    (
        "PLOT_OPTION_TRANSLATED",
        "info",
        "options",
        "A frontend option was translated to Plotly-native behavior.",
        ("Inspect the diagnostic details for the exact translation.",),
    ),
    (
        "PLOT_OPTION_IGNORED",
        "warning",
        "options",
        "A frontend option could not be represented and was ignored.",
        ("Use the suggested Plotly-native alternative when available.",),
    ),
    (
        "PLOT_ALT_TEXT_MISSING",
        "info",
        "accessibility",
        "The plot has no useful alternative text.",
        ("Generate or provide a concise semantic plot description.",),
    ),
    (
        "PLOT_EXPORT_RASTERIZED_WEBGL",
        "info",
        "export",
        "WebGL content will be rasterized in a vector export.",
        (
            "Use HTML for interactive vector-like output or accept embedded raster content.",
        ),
    ),
)


def _definition_map() -> dict[str, tuple[str, str, str, tuple[str, ...]]]:
    answer: dict[str, tuple[str, str, str, tuple[str, ...]]] = {}
    for code, severity, phase, message, repairs in _DEFINITIONS:
        answer[code] = severity, phase, message, repairs
    return answer


_REGISTRY = _definition_map()


def diagnostic_registry() -> list[dict[str, JSONValue]]:
    """Return a detached registry ordered by stable diagnostic code."""
    output: list[dict[str, JSONValue]] = []
    for code in sorted(_REGISTRY):
        severity, phase, message, repairs = _REGISTRY[code]
        output.append(
            {
                "code": code,
                "severity": severity,
                "phase": phase,
                "message": message,
                "suggested_repairs": list(repairs),
            }
        )
    return output


def diagnostic_definition(code: str) -> dict[str, JSONValue]:
    """Return the registered definition for `code`."""
    if code not in _REGISTRY:
        raise ValueError("unknown plot diagnostic code: " + str(code))
    severity, phase, message, repairs = _REGISTRY[code]
    return {
        "code": code,
        "severity": severity,
        "phase": phase,
        "message": message,
        "suggested_repairs": list(repairs),
    }


def _string_list(values: Sequence[str] | None, name: str) -> tuple[str, ...]:
    if values is None:
        return ()
    answer: list[str] = []
    for value in values:
        if not isinstance(value, str) or value == "":
            raise TypeError(name + " must contain nonempty strings")
        answer.append(value)
    return tuple(answer)


class Diagnostic:
    """One structured plot diagnostic with a stable registered code."""

    def __init__(
        self,
        code: str,
        *,
        severity: str | None = None,
        phase: str | None = None,
        layer_ids: Sequence[str] | None = None,
        message: str | None = None,
        suggested_repairs: Sequence[str] | None = None,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        if code not in _REGISTRY:
            raise ValueError("unknown plot diagnostic code: " + str(code))
        default_severity, default_phase, default_message, default_repairs = _REGISTRY[
            code
        ]
        resolved_severity = default_severity if severity is None else severity
        resolved_phase = default_phase if phase is None else phase
        resolved_message = default_message if message is None else message
        repairs = default_repairs if suggested_repairs is None else suggested_repairs
        if resolved_severity not in _SEVERITIES:
            raise ValueError("diagnostic severity must be info, warning, or error")
        if not isinstance(resolved_phase, str) or resolved_phase == "":
            raise TypeError("diagnostic phase must be a nonempty string")
        if not isinstance(resolved_message, str) or resolved_message == "":
            raise TypeError("diagnostic message must be a nonempty string")
        if not isinstance(repairs, Sequence):
            raise TypeError("diagnostic suggested_repairs must be a sequence")
        self._code = code
        self._severity = resolved_severity
        self._phase = resolved_phase
        self._layer_ids = _string_list(layer_ids, "diagnostic layer_ids")
        self._message = resolved_message
        self._suggested_repairs = _string_list(repairs, "diagnostic suggested_repairs")
        self._details = materialize_object(details, "$.diagnostic.details")

    @property
    def code(self) -> str:
        return self._code

    @property
    def severity(self) -> str:
        return self._severity

    @property
    def phase(self) -> str:
        return self._phase

    @property
    def layer_ids(self) -> tuple[str, ...]:
        return self._layer_ids

    @property
    def message(self) -> str:
        return self._message

    @property
    def suggested_repairs(self) -> tuple[str, ...]:
        return self._suggested_repairs

    @property
    def details(self) -> dict[str, JSONValue]:
        return materialize_object(self._details, "$.diagnostic.details")

    def to_dict(self) -> dict[str, JSONValue]:
        """Return a detached JSON-safe diagnostic record."""
        return {
            "code": self._code,
            "severity": self._severity,
            "phase": self._phase,
            "layer_ids": list(self._layer_ids),
            "message": self._message,
            "suggested_repairs": list(self._suggested_repairs),
            "details": materialize_object(self._details, "$.diagnostic.details"),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "Diagnostic":
        """Construct a diagnostic from its materialized record."""
        return cls(
            str(value["code"]),
            severity=str(value["severity"]),
            phase=str(value["phase"]),
            layer_ids=value["layer_ids"],
            message=str(value["message"]),
            suggested_repairs=value["suggested_repairs"],
            details=value["details"],
        )


def materialize_diagnostic(
    value: Diagnostic | Mapping[str, Any],
) -> dict[str, JSONValue]:
    """Return one checked diagnostic record."""
    if isinstance(value, Diagnostic):
        return value.to_dict()
    if not isinstance(value, Mapping):
        raise TypeError("diagnostic must be a Diagnostic or mapping")
    return Diagnostic.from_dict(value).to_dict()
