"""Immutable final composition of live class-and-unit authority payloads.

The composer performs no mathematical computation and owns no fixture or
expected digest.  Its inputs are the immutable outputs of the live class
assembly, no-oracle unit/regulator completion, genuine compact-unit binding,
and exact torsion derivation.  It publishes only after their overlapping
field, resident, class, unit, regulator, honesty, and retry identities agree.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
import hashlib
import json
from threading import Lock
from typing import Any

from .authentic_compact_success import (
    AuthenticCompactSuccessAuthority,
    ImmutableAuthenticCompactSuccess,
)
from .class_group_live_result_assembly import (
    ImmutableLiveClassResult,
    LiveClassResultAuthority,
)
from .no_oracle_unit_regulator_completion import NoOracleCompletionAuthority
from .torsion_authority import (
    ImmutableTorsionResult,
    TorsionReplayAuthority,
    cold_replay_torsion,
)


SCHEMA = "sagejs.pari-class-group/final-internal-completion-v1"
ENVELOPE_SCHEMA = "sagejs.pari-class-group/final-internal-completion-envelope-v1"
FIELD_ID = "x^3-20018*x+20034"
_MAX_BYTES = 64 * 1024 * 1024


class FinalCompletionFailure(ValueError):
    """An authority, cross-owner identity, or terminal claim failed closed."""


class FinalCompletionConflict(RuntimeError):
    """A distinct final internal result was already published."""


@dataclass(frozen=True)
class FinalCompletionAuthority:
    expected_sha256: str

    def __post_init__(self) -> None:
        _digest(self.expected_sha256, "final completion authority")


@dataclass(frozen=True)
class ImmutableFinalCompletion:
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
        raise FinalCompletionFailure("completion is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise FinalCompletionFailure("completion exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise FinalCompletionFailure("completion exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise FinalCompletionFailure("duplicate completion key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise FinalCompletionFailure("completion is not strict JSON") from error
    if not isinstance(value, dict):
        raise FinalCompletionFailure("completion envelope must be an object")
    return value


def _digest(value: Any, name: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise FinalCompletionFailure(name + " is not a SHA-256 digest")
    return value


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise FinalCompletionFailure(name + " must be a mapping")
    return value


def _integers(value: Any, count: int, name: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != count
    ):
        raise FinalCompletionFailure(name + " has the wrong shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise FinalCompletionFailure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise FinalCompletionFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise FinalCompletionFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _open_envelope(
    raw: bytes,
    expected_sha256: str,
    envelope_schema: str,
    payload_schema: str | None,
    name: str,
) -> dict[str, Any]:
    if hashlib.sha256(raw).hexdigest() != _digest(expected_sha256, name + " authority"):
        raise FinalCompletionFailure(name + " lacks immutable authority")
    envelope = _strict_loads(raw)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise FinalCompletionFailure(name + " envelope has the wrong fields")
    if envelope["schema"] != envelope_schema:
        raise FinalCompletionFailure(name + " envelope schema changed")
    payload = _mapping(envelope["payload"], name + " payload")
    if envelope["payload_sha256"] != _sha256(payload):
        raise FinalCompletionFailure(name + " payload hash changed")
    if payload_schema is not None and payload.get("schema") != payload_schema:
        raise FinalCompletionFailure(name + " payload schema changed")
    return dict(payload)


def _open_sources(
    live_class: ImmutableLiveClassResult,
    live_class_authority: LiveClassResultAuthority,
    unit_completion: bytes,
    unit_authority: NoOracleCompletionAuthority,
    compact_units: ImmutableAuthenticCompactSuccess,
    compact_authority: AuthenticCompactSuccessAuthority,
    torsion: ImmutableTorsionResult,
    torsion_authority: TorsionReplayAuthority,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    if (
        type(live_class) is not ImmutableLiveClassResult
        or type(live_class_authority) is not LiveClassResultAuthority
    ):
        raise FinalCompletionFailure("class input is not a live immutable authority")
    if (
        not isinstance(unit_completion, bytes)
        or type(unit_authority) is not NoOracleCompletionAuthority
    ):
        raise FinalCompletionFailure("unit input is not a live immutable authority")
    if (
        type(compact_units) is not ImmutableAuthenticCompactSuccess
        or type(compact_authority) is not AuthenticCompactSuccessAuthority
    ):
        raise FinalCompletionFailure("compact input is not an immutable authority")
    if (
        type(torsion) is not ImmutableTorsionResult
        or type(torsion_authority) is not TorsionReplayAuthority
    ):
        raise FinalCompletionFailure("torsion input is not an immutable authority")
    class_payload = _open_envelope(
        live_class.canonical_json,
        live_class_authority.expected_sha256,
        "sagejs.pari-class-group/live-class-result-assembly-v1",
        None,
        "live class",
    )
    unit_payload = _open_envelope(
        unit_completion,
        unit_authority.envelope_sha256,
        "sagejs.pari-class-group/no-oracle-unit-regulator-envelope-v1",
        "sagejs.pari-class-group/no-oracle-unit-regulator-completion-v1",
        "live unit completion",
    )
    compact_payload = _open_envelope(
        compact_units.canonical_json,
        compact_authority.expected_sha256,
        "sagejs.pari-class-group/authentic-compact-success-v1",
        None,
        "compact unit",
    )
    try:
        torsion_payload = cold_replay_torsion(
            torsion, torsion_authority
        ).detached_payload()
    except Exception as error:
        raise FinalCompletionFailure("torsion authority did not replay") from error
    return class_payload, unit_payload, compact_payload, torsion_payload


def build_final_internal_completion(
    live_class: ImmutableLiveClassResult,
    live_class_authority: LiveClassResultAuthority,
    unit_completion: bytes,
    unit_authority: NoOracleCompletionAuthority,
    compact_units: ImmutableAuthenticCompactSuccess,
    compact_authority: AuthenticCompactSuccessAuthority,
    torsion: ImmutableTorsionResult,
    torsion_authority: TorsionReplayAuthority,
) -> dict[str, Any]:
    """Join live immutable owners without reading an oracle or filesystem."""
    class_payload, unit_payload, compact_payload, torsion_payload = _open_sources(
        live_class,
        live_class_authority,
        unit_completion,
        unit_authority,
        compact_units,
        compact_authority,
        torsion,
        torsion_authority,
    )
    class_source = _mapping(class_payload.get("source"), "class source")
    class_group = _mapping(class_payload.get("class_group"), "class group")
    cleanarch = _mapping(class_payload.get("cleanarch"), "class cleanarch")
    class_terminal = _mapping(class_payload.get("terminal"), "class terminal")
    unit_field = _mapping(unit_payload.get("field"), "unit field")
    units = _mapping(
        unit_payload.get("unit_group_correspondence"), "unit correspondence"
    )
    unit_terminal = _mapping(unit_payload.get("terminal"), "unit terminal")
    compact_source = _mapping(compact_payload.get("source"), "compact source")
    compact_group = _mapping(compact_payload.get("class_group"), "compact class group")
    compact = _mapping(compact_payload.get("compact_units"), "compact units")
    compact_links = _mapping(
        compact_payload.get("authority_links"), "compact authority links"
    )
    compact_terminal = _mapping(compact_payload.get("terminal"), "compact terminal")
    torsion_field = _mapping(torsion_payload.get("field"), "torsion field")
    torsion_group = _mapping(torsion_payload.get("torsion"), "torsion group")

    resident = class_source.get("resident_sha256")
    if resident != unit_payload.get("authorities", {}).get(
        "resident_sha256"
    ) or resident != compact_source.get("resident_sha256"):
        raise FinalCompletionFailure("live owners belong to different residents")
    polynomial = _integers(unit_field.get("polynomial_ascending"), 4, "unit polynomial")
    if (
        unit_field.get("id") != FIELD_ID
        or _integers(torsion_field.get("polynomial_ascending"), 4, "torsion polynomial")
        != polynomial
        or polynomial != [20034, -20018, 0, 1]
    ):
        raise FinalCompletionFailure("live owners belong to different fields")
    if (
        class_group.get("class_number") != "1"
        or class_group.get("invariant_factors") != []
        or class_group.get("generators") != []
        or compact_group != {"class_number": "1", "invariant_factors": []}
    ):
        raise FinalCompletionFailure("live class quotient changed")
    if (
        cleanarch.get("status") != "accepted"
        or cleanarch.get("honesty_status") != "equal-bound-source-skip"
        or class_terminal.get("atomic_publication") is not True
        or class_terminal.get("unit_group_included") is not False
    ):
        raise FinalCompletionFailure("live honesty/class publication is incomplete")
    exact_units = units.get("exact_units_power_coordinates")
    if not isinstance(exact_units, list) or len(exact_units) != 2:
        raise FinalCompletionFailure("live unit rank changed")
    canonical_units = [
        [str(value) for value in _integers(row, 3, "exact unit")] for row in exact_units
    ]
    packed_logs = _integers(units.get("rebuilt_packed_logs"), 18, "retry logs")
    if any(packed_logs[index] != 2176 for index in range(1, 18, 3)):
        raise FinalCompletionFailure("live retry did not reach p2176")
    regulator = _mapping(units.get("regulator_enclosure"), "regulator enclosure")
    if (
        regulator.get("rigorous") is not True
        or regulator.get("full_rank_certified") is not True
    ):
        raise FinalCompletionFailure("live regulator is not rigorous and full-rank")
    if (
        unit_terminal.get("correspondence_complete") is not True
        or unit_terminal.get("no_pari_or_answer_oracle") is not True
        or unit_terminal.get("public_complete") is not False
        or unit_terminal.get("unit_saturation_certified") is not False
    ):
        raise FinalCompletionFailure("live unit terminal claim changed")
    if (
        compact.get("rank") != "2"
        or compact.get("exponent_shape") != ["2", "7"]
        or len(_integers(compact.get("exponents"), 14, "compact exponents")) != 14
        or compact.get("expanded_units") is not None
        or compact.get("materialization") != "separate-qualified-resident-replay"
        or compact_terminal.get("public_complete") is not False
        or compact_terminal.get("unit_saturation_certified") is not False
    ):
        raise FinalCompletionFailure("genuine compact unit authority changed")
    if compact_links.get("regulator_power_unit_sha256") != _sha256(canonical_units):
        raise FinalCompletionFailure("compact units left live regulator coordinates")
    if (
        torsion_group.get("order") != "2"
        or torsion_group.get("generator_power_basis") != ["-1", "0", "0"]
        or torsion_group.get("generator_norm") != "-1"
    ):
        raise FinalCompletionFailure("exact torsion authority changed")

    return {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "polynomial_ascending": [str(value) for value in polynomial],
        },
        "source_authorities": {
            "live_class_sha256": live_class.sha256,
            "live_unit_sha256": unit_authority.envelope_sha256,
            "compact_units_sha256": compact_units.sha256,
            "torsion_sha256": torsion.sha256,
            "resident_sha256": resident,
        },
        "class_group": {
            "class_number": "1",
            "invariant_factors": [],
            "generator_ideals": [],
        },
        "unit_group": {
            "rank": "2",
            "exact_units_power_coordinates": canonical_units,
            "compact_factor_ids": list(compact.get("factor_ids", [])),
            "compact_exponent_shape": ["2", "7"],
            "compact_exponents": list(compact["exponents"]),
            "torsion_order": "2",
            "torsion_generator_power_coordinates": ["-1", "0", "0"],
            "regulator_enclosure": dict(regulator),
        },
        "policy": {
            "honesty": "equal-bound-source-skip",
            "honesty_complete": True,
            "precision_retry": "completed-no-oracle-p2176",
            "retry_precision_bits": "2176",
            "retry_complete": True,
        },
        "terminal": {
            "status": "live-class-unit-correspondence-complete",
            "atomic_publication": True,
            "correspondence_complete": True,
            "public": False,
            "public_complete": False,
            "unit_saturation_certified": False,
            "standard_public_adapter_eligible": False,
            "missing_public_evidence": list(unit_terminal["missing_public_evidence"]),
        },
    }


def _seal(payload: Mapping[str, Any]) -> ImmutableFinalCompletion:
    envelope = {
        "schema": ENVELOPE_SCHEMA,
        "payload": payload,
        "payload_sha256": _sha256(payload),
    }
    raw = _canonical(envelope)
    return ImmutableFinalCompletion(raw, hashlib.sha256(raw).hexdigest())


class FinalCompletionPublisher:
    """Publish exactly one fully validated internal completion atomically."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._published: ImmutableFinalCompletion | None = None

    def publish(self, *authorities: Any) -> ImmutableFinalCompletion:
        candidate = _seal(build_final_internal_completion(*authorities))
        with self._lock:
            if self._published is None:
                self._published = candidate
            elif self._published != candidate:
                raise FinalCompletionConflict("a different final result is published")
            return self._published

    def current(self) -> ImmutableFinalCompletion | None:
        with self._lock:
            return self._published


def cold_replay_final_internal_completion(
    result: ImmutableFinalCompletion,
    authority: FinalCompletionAuthority,
    *sources: Any,
) -> ImmutableFinalCompletion:
    """Recompose from live authorities and reject detached/rehashed mutations."""
    if (
        type(result) is not ImmutableFinalCompletion
        or type(authority) is not FinalCompletionAuthority
    ):
        raise TypeError("final replay requires immutable result and authority")
    envelope = _strict_loads(result.canonical_json)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise FinalCompletionFailure("final envelope has the wrong fields")
    if envelope["schema"] != ENVELOPE_SCHEMA:
        raise FinalCompletionFailure("final envelope schema changed")
    expected = build_final_internal_completion(*sources)
    if envelope["payload"] != expected or envelope["payload_sha256"] != _sha256(
        expected
    ):
        raise FinalCompletionFailure("final result is detached from live authorities")
    canonical = _canonical(envelope)
    digest = hashlib.sha256(canonical).hexdigest()
    if digest != result.sha256 or digest != authority.expected_sha256:
        raise FinalCompletionFailure("final publication lacks immutable authority")
    return ImmutableFinalCompletion(canonical, digest)


__all__ = [
    "ENVELOPE_SCHEMA",
    "FinalCompletionAuthority",
    "FinalCompletionConflict",
    "FinalCompletionFailure",
    "FinalCompletionPublisher",
    "ImmutableFinalCompletion",
    "SCHEMA",
    "build_final_internal_completion",
    "cold_replay_final_internal_completion",
]
