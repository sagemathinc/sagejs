"""Bounded, semantic, backend-neutral numerical traces."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from ._json import JSONValue, canonical_json, materialize_object
from .diagnostics import NumericalDiagnostic, materialize_diagnostic

TRACE_SCHEMA_VERSION = 1
TRACE_LEVELS = ("none", "summary", "iterations", "evaluations", "debug")


def _optional_counter(value: Any, name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(name + " must be a nonnegative integer or None")
    return value


def _optional_boolean(value: Any, name: str) -> bool | None:
    if value is not None and not isinstance(value, bool):
        raise TypeError(name + " must be a boolean or None")
    return value


class TracePolicy:
    """Hard trace limits independent of a solver's iteration budget."""

    def __init__(
        self,
        level: str = "summary",
        *,
        max_events: int = 256,
        max_bytes: int = 1_000_000,
    ) -> None:
        if level not in TRACE_LEVELS:
            raise ValueError("trace level must be one of " + ", ".join(TRACE_LEVELS))
        if (
            isinstance(max_events, bool)
            or not isinstance(max_events, int)
            or max_events < 2
        ):
            raise ValueError("max_events must be an integer at least 2")
        if (
            isinstance(max_bytes, bool)
            or not isinstance(max_bytes, int)
            or max_bytes < 1024
        ):
            raise ValueError("max_bytes must be an integer at least 1024")
        self._level = level
        self._max_events = max_events
        self._max_bytes = max_bytes

    @property
    def level(self) -> str:
        return self._level

    @property
    def max_events(self) -> int:
        return self._max_events

    @property
    def max_bytes(self) -> int:
        return self._max_bytes

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "level": self._level,
            "max_events": self._max_events,
            "max_bytes": self._max_bytes,
        }


class TraceEvent:
    """One immutable semantic algorithm event."""

    def __init__(
        self,
        sequence: int,
        kind: str,
        *,
        iteration: int | None = None,
        evaluation: int | None = None,
        accepted: bool | None = None,
        data: Mapping[str, Any] | None = None,
        diagnostics: Sequence[NumericalDiagnostic | Mapping[str, Any]] = (),
        important: bool = False,
    ) -> None:
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 0:
            raise ValueError("trace sequence must be a nonnegative integer")
        if not isinstance(kind, str) or kind == "":
            raise TypeError("trace kind must be a nonempty string")
        self._sequence = sequence
        self._kind = kind
        self._iteration = _optional_counter(iteration, "trace iteration")
        self._evaluation = _optional_counter(evaluation, "trace evaluation")
        self._accepted = _optional_boolean(accepted, "trace accepted")
        self._data = materialize_object(data, "$.trace.event.data")
        self._diagnostics = tuple(
            materialize_diagnostic(value) for value in diagnostics
        )
        if not isinstance(important, bool):
            raise TypeError("trace important must be a boolean")
        self._important = important

    @property
    def sequence(self) -> int:
        return self._sequence

    @property
    def kind(self) -> str:
        return self._kind

    @property
    def data(self) -> dict[str, JSONValue]:
        return materialize_object(self._data, "$.trace.event.data")

    @property
    def important(self) -> bool:
        return self._important

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "sequence": self._sequence,
            "kind": self._kind,
            "iteration": self._iteration,
            "evaluation": self._evaluation,
            "accepted": self._accepted,
            "data": self.data,
            "diagnostics": [dict(value) for value in self._diagnostics],
            "important": self._important,
        }


class NumericalTrace:
    """Append-only trace with deterministic head/important/tail retention."""

    def __init__(self, policy: TracePolicy | None = None) -> None:
        if policy is not None and not isinstance(policy, TracePolicy):
            raise TypeError("trace policy must be a TracePolicy")
        self._policy = TracePolicy() if policy is None else policy
        self._events: list[TraceEvent] = []
        self._next_sequence = 0
        self._observed = 0
        self._dropped = 0
        self._truncated = False

    @property
    def policy(self) -> TracePolicy:
        return self._policy

    @property
    def events(self) -> tuple[TraceEvent, ...]:
        return tuple(self._events)

    @property
    def truncated(self) -> bool:
        return self._truncated

    def wants(self, kind: str) -> bool:
        level = self._policy.level
        if level == "none":
            return False
        if level == "summary":
            return kind in ("start", "finish", "failure", "phase", "validation")
        if level == "iterations":
            return kind != "evaluation"
        return True

    def append(
        self,
        kind: str,
        *,
        iteration: int | None = None,
        evaluation: int | None = None,
        accepted: bool | None = None,
        data: Mapping[str, Any] | None = None,
        diagnostics: Sequence[NumericalDiagnostic | Mapping[str, Any]] = (),
        important: bool = False,
        force: bool = False,
    ) -> TraceEvent | None:
        if not isinstance(force, bool):
            raise TypeError("trace force must be a boolean")
        self._observed += 1
        if not force and not self.wants(kind):
            return None
        event = TraceEvent(
            self._next_sequence,
            kind,
            iteration=iteration,
            evaluation=evaluation,
            accepted=accepted,
            data=data,
            diagnostics=diagnostics,
            important=important,
        )
        self._next_sequence += 1
        self._events.append(event)
        self._enforce_budget()
        return event

    def _event_bytes(self) -> int:
        return len(
            canonical_json([event.to_dict() for event in self._events]).encode("utf-8")
        )

    def _remove_retained_event(self, *, allow_endpoints: bool) -> None:
        if not self._events:
            return
        if not allow_endpoints and len(self._events) > 2:
            middle = self._events[1:-1]
            removable = [event for event in middle if not event.important]
            if not removable:
                removable = middle
            remove = removable[len(removable) // 2]
        else:
            # A byte ceiling is absolute: when even the protected head/tail
            # cannot fit, prefer the newest event and then drop it too if it is
            # individually oversized. Important events influence retention but
            # can never override a hard resource budget.
            removable = [event for event in self._events[:-1] if not event.important]
            if not removable:
                removable = [event for event in self._events if not event.important]
            if not removable:
                removable = self._events[:-1] or self._events
            remove = removable[0]
        self._events.remove(remove)
        self._dropped += 1
        self._truncated = True

    def _enforce_budget(self) -> None:
        while len(self._events) > self._policy.max_events:
            self._remove_retained_event(allow_endpoints=False)
        while self._event_bytes() > self._policy.max_bytes and self._events:
            self._remove_retained_event(allow_endpoints=True)

    def to_dict(self) -> dict[str, JSONValue]:
        diagnostics: list[dict[str, JSONValue]] = []
        if self._truncated:
            diagnostics.append(
                NumericalDiagnostic(
                    "trace_truncated",
                    details={"dropped_events": self._dropped},
                ).to_dict()
            )
        return materialize_object(
            {
                "schema_version": TRACE_SCHEMA_VERSION,
                "policy": self._policy.to_dict(),
                "observed_events": self._observed,
                "retained_events": len(self._events),
                "dropped_events": self._dropped,
                "truncated": self._truncated,
                "events": [event.to_dict() for event in self._events],
                "diagnostics": diagnostics,
            },
            "$.trace",
        )

    def to_json(self) -> str:
        return canonical_json(self.to_dict())
