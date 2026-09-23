"""Bind exact cubic torsion to a live internal final-result state.

The binding consumes only two live inputs: the neutral prepared polynomial and
the already composed internal correspondence state.  It recomputes roots of
unity with `torsion_authority`; no PARI oracle, unit fixture, or expected
torsion value is an input to this layer.
"""

from __future__ import annotations

from collections.abc import Mapping as MappingABC, Sequence as SequenceABC
from dataclasses import dataclass
import hashlib
import json
from typing import Any, Mapping, Sequence

from .torsion_authority import (
    ImmutableTorsionResult,
    TorsionReplayAuthority,
    cold_replay_torsion,
    derive_real_cubic_torsion,
    prepared_polynomial_sha256,
)


BINDING_SCHEMA = "sagejs.pari-class-group/final-torsion-binding-v1"
LIVE_SCHEMA = "sagejs.pari-class-group/internal-correspondence-completion-v1"
_MAX_BYTES = 8 * 1024 * 1024


class TorsionBindingFailure(ValueError):
    """The neutral field, live result, or detached binding is inconsistent."""


@dataclass(frozen=True)
class ImmutableTorsionBinding:
    """Canonical torsion-to-final-state binding."""

    canonical_json: bytes
    sha256: str

    def detached_payload(self) -> dict[str, Any]:
        return dict(_strict_loads(self.canonical_json)["payload"])


def _canonical(value: Any) -> bytes:
    try:
        raw = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise TorsionBindingFailure("binding is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise TorsionBindingFailure("binding exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise TorsionBindingFailure("binding exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise TorsionBindingFailure("duplicate binding key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise TorsionBindingFailure("binding is not strict JSON") from error
    if not isinstance(value, dict):
        raise TorsionBindingFailure("binding envelope must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, MappingABC):
        raise TorsionBindingFailure(name + " must be a mapping")
    return value


def _integers(values: Any, length: int, name: str) -> tuple[int, ...]:
    if (
        isinstance(values, (str, bytes))
        or not isinstance(values, SequenceABC)
        or len(values) != length
    ):
        raise TorsionBindingFailure(name + " has the wrong shape")
    answer: list[int] = []
    for value in values:
        if isinstance(value, bool):
            raise TorsionBindingFailure(name + " contains a boolean")
        try:
            integer = int(value)
        except (TypeError, ValueError, OverflowError) as error:
            raise TorsionBindingFailure(name + " contains a non-integer") from error
        if str(integer) != str(value):
            raise TorsionBindingFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return tuple(answer)


def _field_id(polynomial: Sequence[int]) -> str:
    """Render the normalized monic depressed cubic used by this experiment."""

    constant, linear, quadratic, leading = polynomial
    if leading != 1 or quadratic != 0:
        raise TorsionBindingFailure("binding expects a monic depressed cubic")
    pieces = ["x^3"]
    if linear:
        pieces.append(("+" if linear > 0 else "-") + str(abs(linear)) + "*x")
    if constant:
        pieces.append(("+" if constant > 0 else "-") + str(abs(constant)))
    return "".join(pieces)


def _live_view(
    polynomial: tuple[int, ...], live_final_state: Mapping[str, Any]
) -> dict[str, Any]:
    live = _mapping(live_final_state, "live final state")
    if live.get("schema") != LIVE_SCHEMA:
        raise TorsionBindingFailure("wrong live final-state schema")
    field = _mapping(live.get("field"), "live field")
    live_polynomial = _integers(field.get("polynomial_ascending"), 4, "live polynomial")
    if live_polynomial != polynomial or field.get("id") != _field_id(polynomial):
        raise TorsionBindingFailure("neutral polynomial and live field diverged")

    source = _mapping(live.get("source_authorities"), "live source authorities")
    units = _mapping(live.get("unit_group_correspondence"), "live unit correspondence")
    terminal = _mapping(live.get("terminal"), "live terminal state")
    if (
        terminal.get("status") != "pari-correspondence-complete-internal-h1"
        or terminal.get("correspondence_complete") is not True
        or terminal.get("composition_driver_published") is not True
        or terminal.get("public_complete") is not False
        or terminal.get("class_unit_computation_complete") is not False
    ):
        raise TorsionBindingFailure("live result is not at the internal final boundary")

    generator = units.get("torsion_generator_power_coordinates")
    if isinstance(generator, (str, bytes)) or not isinstance(generator, SequenceABC):
        raise TorsionBindingFailure("live torsion generator has the wrong shape")
    digest = _sha256(_canonical(dict(live)))
    return {
        "schema": LIVE_SCHEMA,
        "sha256": digest,
        "field_id": str(field.get("id", "")),
        "torsion_sha256": str(source.get("torsion_sha256", "")),
        "torsion_order": str(units.get("torsion_order", "")),
        "torsion_generator": list(generator),
        "terminal_status": str(terminal.get("status", "")),
        "correspondence_complete": True,
        "public_complete": False,
    }


def _derived_torsion(
    polynomial: tuple[int, ...],
) -> tuple[ImmutableTorsionResult, dict[str, Any]]:
    result = derive_real_cubic_torsion(polynomial)
    authority = TorsionReplayAuthority(
        prepared_polynomial_sha256(polynomial), result.sha256
    )
    replayed = cold_replay_torsion(result, authority)
    return replayed, replayed.detached_payload()


def _compose_payload(
    neutral_polynomial: Sequence[Any], live_final_state: Mapping[str, Any]
) -> dict[str, Any]:
    polynomial = _integers(neutral_polynomial, 4, "neutral polynomial")
    live = _live_view(polynomial, live_final_state)
    torsion_result, torsion_payload = _derived_torsion(polynomial)
    torsion = _mapping(torsion_payload.get("torsion"), "derived torsion")
    if live["torsion_sha256"] != torsion_result.sha256:
        raise TorsionBindingFailure("live result cites a different torsion authority")
    if live["torsion_order"] != torsion.get("order") or live[
        "torsion_generator"
    ] != torsion.get("generator_power_basis"):
        raise TorsionBindingFailure("live result contains different torsion data")
    return {
        "field": {
            "id": _field_id(polynomial),
            "polynomial_ascending": [str(value) for value in polynomial],
            "polynomial_sha256": prepared_polynomial_sha256(polynomial),
        },
        "live_final_state": live,
        "torsion": {
            "authority_sha256": torsion_result.sha256,
            "order": str(torsion["order"]),
            "generator_power_coordinates": list(torsion["generator_power_basis"]),
            "generator_norm": str(torsion["generator_norm"]),
            "maximality": str(torsion_payload["maximality"]["method"]),
        },
        "binding": {
            "status": "exact-torsion-bound-to-live-final-state",
            "oracle_inputs": [],
            "fixture_inputs": [],
        },
    }


def compose_torsion_final_binding(
    neutral_polynomial: Sequence[Any], live_final_state: Mapping[str, Any]
) -> ImmutableTorsionBinding:
    """Recompute torsion and bind it to one live final-state digest."""

    payload = _compose_payload(neutral_polynomial, live_final_state)
    payload_raw = _canonical(payload)
    envelope = {
        "schema": BINDING_SCHEMA,
        "payload": payload,
        "payload_sha256": _sha256(payload_raw),
    }
    canonical_json = _canonical(envelope)
    return ImmutableTorsionBinding(canonical_json, _sha256(canonical_json))


def replay_torsion_final_binding(
    value: ImmutableTorsionBinding | bytes | str,
    neutral_polynomial: Sequence[Any],
    live_final_state: Mapping[str, Any],
) -> ImmutableTorsionBinding:
    """Recompose from live inputs; no expected-answer authority is accepted."""

    raw = value.canonical_json if isinstance(value, ImmutableTorsionBinding) else value
    envelope = _strict_loads(raw)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise TorsionBindingFailure("binding envelope has the wrong fields")
    if envelope["schema"] != BINDING_SCHEMA:
        raise TorsionBindingFailure("wrong binding schema")
    expected = _compose_payload(neutral_polynomial, live_final_state)
    if envelope["payload"] != expected:
        raise TorsionBindingFailure("torsion binding does not recompose")
    payload_raw = _canonical(expected)
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise TorsionBindingFailure("binding payload hash changed")
    canonical_json = _canonical(envelope)
    return ImmutableTorsionBinding(canonical_json, _sha256(canonical_json))
