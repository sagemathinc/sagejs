"""Stable structured diagnostics for Sage.js numerical computing."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ._json import JSONValue, materialize_object

_SEVERITIES = ("info", "warning", "error")

_DEFINITIONS: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    (
        "backend_fallback",
        "info",
        "planning",
        "The preferred backend was unavailable or outside its validated envelope.",
        ("Inspect the selected fallback and capability record.",),
    ),
    (
        "cancelled",
        "warning",
        "execution",
        "The computation was cancelled before convergence.",
        ("Resume with a larger resource budget if appropriate.",),
    ),
    (
        "callback_error",
        "error",
        "execution",
        "A user callback raised an exception.",
        ("Inspect and test the callback at representative inputs.",),
    ),
    (
        "discontinuity_suspected",
        "warning",
        "validation",
        "A sign change may be caused by a discontinuity rather than a root.",
        (
            "Inspect the function near the returned point or provide a continuous bracket.",
        ),
    ),
    (
        "finite_difference_derivative",
        "info",
        "planning",
        "A derivative was estimated with finite differences.",
        ("Provide an analytic derivative when accuracy or cost matters.",),
    ),
    (
        "invalid_bracket",
        "error",
        "planning",
        "The interval endpoints do not bracket a finite sign change.",
        ("Choose endpoints with finite function values of opposite signs.",),
    ),
    (
        "ill_conditioned",
        "warning",
        "validation",
        "The problem or reported solution is ill-conditioned.",
        ("Rescale, reformulate, or increase precision.",),
    ),
    (
        "loss_of_significance",
        "warning",
        "validation",
        "Floating-point cancellation may have reduced meaningful accuracy.",
        ("Rescale or repeat at higher precision.",),
    ),
    (
        "maximum_evaluations",
        "warning",
        "execution",
        "The function-evaluation budget was exhausted.",
        ("Increase the budget or choose a more suitable method.",),
    ),
    (
        "maximum_elapsed_time",
        "warning",
        "execution",
        "The elapsed-time budget was exhausted.",
        ("Increase the time budget or choose a more suitable method.",),
    ),
    (
        "maximum_iterations",
        "warning",
        "execution",
        "The iteration budget was exhausted.",
        ("Increase the budget, improve initial data, or choose another method.",),
    ),
    (
        "non_replayable_callback",
        "info",
        "provenance",
        "The computation used an opaque live callback that cannot be serialized for replay.",
        ("Provide a stable expression or module/function reference.",),
    ),
    (
        "nonfinite_evaluation",
        "error",
        "execution",
        "The numerical function returned a non-finite value.",
        ("Restrict the domain or repair the callback.",),
    ),
    (
        "stagnation",
        "warning",
        "execution",
        "Iterations stopped making representable progress.",
        ("Rescale, change method, or increase precision.",),
    ),
    (
        "trace_truncated",
        "warning",
        "trace",
        "The semantic trace exceeded its event or byte budget and was deterministically decimated.",
        ("Increase the trace budget or request a less detailed trace level.",),
    ),
    (
        "validation_failed",
        "error",
        "validation",
        "Independent mathematical validation did not support the solver's success claim.",
        ("Inspect residuals and repeat with an independent method.",),
    ),
    (
        "zero_derivative",
        "warning",
        "execution",
        "Newton's method encountered a zero or unusable derivative.",
        ("Choose a different initial point or use a bracketed method.",),
    ),
)


def _registry() -> dict[str, tuple[str, str, str, tuple[str, ...]]]:
    answer: dict[str, tuple[str, str, str, tuple[str, ...]]] = {}
    for code, severity, phase, message, repairs in _DEFINITIONS:
        answer[code] = severity, phase, message, repairs
    return answer


_REGISTRY = _registry()


def diagnostic_registry() -> list[dict[str, JSONValue]]:
    answer: list[dict[str, JSONValue]] = []
    for code in sorted(_REGISTRY):
        severity, phase, message, repairs = _REGISTRY[code]
        answer.append(
            {
                "code": code,
                "severity": severity,
                "phase": phase,
                "message": message,
                "suggested_actions": list(repairs),
            }
        )
    return answer


class NumericalDiagnostic:
    """One versioned diagnostic whose code, not prose, is its identity."""

    def __init__(
        self,
        code: str,
        *,
        severity: str | None = None,
        phase: str | None = None,
        message: str | None = None,
        suggested_actions: Sequence[str] | None = None,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        if code not in _REGISTRY:
            raise ValueError("unknown numerical diagnostic code: " + str(code))
        default_severity, default_phase, default_message, default_actions = _REGISTRY[
            code
        ]
        self._code = code
        self._severity = default_severity if severity is None else severity
        self._phase = default_phase if phase is None else phase
        self._message = default_message if message is None else message
        actions = default_actions if suggested_actions is None else suggested_actions
        if self._severity not in _SEVERITIES:
            raise ValueError("diagnostic severity must be info, warning, or error")
        if not isinstance(self._phase, str) or self._phase == "":
            raise TypeError("diagnostic phase must be a nonempty string")
        if not isinstance(self._message, str) or self._message == "":
            raise TypeError("diagnostic message must be a nonempty string")
        self._suggested_actions = tuple(str(action) for action in actions)
        self._details = materialize_object(details, "$.diagnostic.details")

    @property
    def code(self) -> str:
        return self._code

    @property
    def severity(self) -> str:
        return self._severity

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "code": self._code,
            "severity": self._severity,
            "phase": self._phase,
            "message": self._message,
            "suggested_actions": list(self._suggested_actions),
            "details": materialize_object(self._details, "$.diagnostic.details"),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "NumericalDiagnostic":
        return cls(
            str(value["code"]),
            severity=str(value["severity"]),
            phase=str(value["phase"]),
            message=str(value["message"]),
            suggested_actions=value.get("suggested_actions"),
            details=value.get("details"),
        )


def materialize_diagnostic(
    value: NumericalDiagnostic | Mapping[str, Any],
) -> dict[str, JSONValue]:
    if isinstance(value, NumericalDiagnostic):
        return value.to_dict()
    return NumericalDiagnostic.from_dict(value).to_dict()
