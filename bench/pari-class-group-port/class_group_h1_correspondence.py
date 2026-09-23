"""Upstream-assumed class-correspondence completion for the authentic `h=1` field.

This internal result deliberately separates two statements:

* exact replay proves that 73 principal relations span the complete free group
  on the 66 retained factor-base ideals, so the authenticated presentation is
  trivial; and
* PARI 2.17.4 correspondence assumes that those factor-base ideals generate
  the full ideal class group of the prepared maximal order.

Together they imply class number one under the explicit upstream assumption.
They do not provide Sage.js's public factor-base theorem, class-saturation
record, rigorous analytic enclosure, or class/unit completion certificate.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from threading import Lock
from typing import Any

from .class_group_smith_transform import pari_class_group_smith_transform
from .presentation_authority import (
    FIELD_ID,
    RESIDENT_SHA256,
    SCHEMA as PRESENTATION_SCHEMA,
    PresentationAuthorityFailure,
    capture_presentation_authority,
    replay_presentation_authority,
)


SCHEMA = "sagejs.pari-class-group/h1-class-correspondence-v1"
ASSUMPTION_SCHEMA = "sagejs.pari-class-group/upstream-class-assumptions-v1"
CONNECTED_FIELD_ID = "pari-2.17.4:" + FIELD_ID
_MAX_BYTES = 2 * 1024 * 1024
_ASSUMPTIONS = {
    "schema": ASSUMPTION_SCHEMA,
    "authority": "PARI-2.17.4-buchall-correspondence",
    "prepared_order": "nfinit-maximal-order-state-assumed-correct",
    "global_generation": (
        "the-66-selected-factor-base-ideals-generate-the-full-ideal-class-group"
    ),
    "source_policy": (
        "PARI-2.17.4-factor-bound-honesty-and-analytic-index-policy-assumed-correct"
    ),
    "conditional_basis": "GRH-plus-upstream-undocumented-bounds-and-heuristics",
}
_PUBLIC_GAPS = (
    "certified-maximal-order-authority",
    "proved-factor-base-generation-bound",
    "replayable-global-class-saturation-record",
    "completed-public-proof-stage-and-theorem-payload",
    "rigorous-regulator-enclosure-and-unit-saturation",
)


class H1CorrespondenceFailure(ValueError):
    """The internal class-correspondence witness failed closed."""


class H1CorrespondenceConflict(RuntimeError):
    """A different class-correspondence witness was already published."""


@dataclass(frozen=True)
class H1CorrespondenceAuthority:
    expected_sha256: str


@dataclass(frozen=True)
class ImmutableH1Correspondence:
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
        raise H1CorrespondenceFailure("class witness is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise H1CorrespondenceFailure("class witness exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise H1CorrespondenceFailure("class witness exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise H1CorrespondenceFailure("duplicate class-witness key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise H1CorrespondenceFailure("class witness is not strict JSON") from error
    if not isinstance(value, dict):
        raise H1CorrespondenceFailure("class-witness envelope must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _integers(value: Any, length: int, name: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise H1CorrespondenceFailure(name + " must be an exact sequence")
    if len(value) != length:
        raise H1CorrespondenceFailure(name + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise H1CorrespondenceFailure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise H1CorrespondenceFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise H1CorrespondenceFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _decimals(values: Sequence[int]) -> list[str]:
    return [str(value) for value in values]


def _matrix_product(
    left: Sequence[int], rows: int, inner: int, right: Sequence[int], columns: int
) -> list[int]:
    return [
        sum(left[k * rows + row] * right[column * inner + k] for k in range(inner))
        for column in range(columns)
        for row in range(rows)
    ]


def _identity(size: int) -> list[int]:
    return [int(row == column) for column in range(size) for row in range(size)]


def _smith_witness(presentation_authority: Mapping[str, Any]) -> dict[str, Any]:
    hnf = presentation_authority.get("hnf")
    if not isinstance(hnf, Mapping):
        raise H1CorrespondenceFailure("presentation HNF authority is missing")
    full_hnf = _integers(hnf.get("full_hnf"), 120, "active full HNF")
    presentation = full_hnf[56:]
    outputs = [[0] * 64 for _ in range(10)]
    invariants = [0] * 8
    class_number = [0]
    column = [0] * 8
    product = [0] * 64
    augmented = [0] * 128
    states = [[0] * 5, [0] * 5, [0] * 6, [0] * 6, [0] * 7]
    if (
        pari_class_group_smith_transform(
            presentation,
            8,
            *outputs,
            invariants,
            class_number,
            column,
            product,
            augmented,
            *states,
        )
        != 0
    ):
        raise H1CorrespondenceFailure("exact Smith replay rejected")
    smith, left, left_inverse, right, _, _, _, _, _, _ = outputs
    identity = _identity(8)
    if (
        smith != identity
        or class_number != [1]
        or states[-1][1] != 0
        or _matrix_product(left, 8, 8, left_inverse, 8) != identity
        or _matrix_product(left_inverse, 8, 8, left, 8) != identity
        or _matrix_product(right, 8, 8, product, 8) != identity
        or _matrix_product(product, 8, 8, right, 8) != identity
        or _matrix_product(_matrix_product(left, 8, 8, presentation, 8), 8, 8, right, 8)
        != identity
    ):
        raise H1CorrespondenceFailure("presentation is not exactly trivial")
    return {
        "presentation": _decimals(presentation),
        "diagonal": _decimals(smith),
        "left": _decimals(left),
        "left_inverse": _decimals(left_inverse),
        "right": _decimals(right),
        "right_inverse": _decimals(product),
        "state": _decimals(states[-1]),
    }


def _presentation_digest(presentation_authority: Mapping[str, Any]) -> str:
    return _sha256(_canonical(presentation_authority))


def build_h1_class_correspondence(resident_output: str | Path) -> dict[str, Any]:
    """Build the exact-plus-assumed internal class-completion witness."""
    presentation = capture_presentation_authority(resident_output)
    replay = replay_presentation_authority(presentation)
    smith = _smith_witness(presentation)
    payload = {
        "source": {
            "field_id": CONNECTED_FIELD_ID,
            "pari_version": "2.17.4",
            "resident_sha256": RESIDENT_SHA256,
            "presentation_schema": PRESENTATION_SCHEMA,
            "presentation_sha256": _presentation_digest(presentation),
        },
        "presentation_authority": presentation,
        "presentation_replay": replay,
        "smith_witness": smith,
        "class_group": {
            "class_number": "1",
            "invariant_factors": [],
            "generators": [],
            "generator_order_witnesses": [],
            "generator_order_witnesses_vacuous": True,
            "exact_presentation_saturated": True,
            "global_factor_base_generation": "assumed-from-pinned-upstream-policy",
        },
        "upstream_assumptions": dict(_ASSUMPTIONS),
        "status": {
            "proof_tier": "upstream-assumed-pari-correspondence",
            "class_correspondence_complete": True,
            "class_correspondence_complete_under": ASSUMPTION_SCHEMA,
            "phase5_complete": False,
            "public_class_complete": False,
            "public_class_unit_complete": False,
            "unverified_public_requirements": list(_PUBLIC_GAPS),
        },
    }
    _validate_payload(payload)
    return payload


def _validate_payload_unchecked(payload: Any) -> None:
    required = {
        "source",
        "presentation_authority",
        "presentation_replay",
        "smith_witness",
        "class_group",
        "upstream_assumptions",
        "status",
    }
    if not isinstance(payload, Mapping) or set(payload) != required:
        raise H1CorrespondenceFailure("class witness has the wrong fields")
    source = payload["source"]
    if source != {
        "field_id": CONNECTED_FIELD_ID,
        "pari_version": "2.17.4",
        "resident_sha256": RESIDENT_SHA256,
        "presentation_schema": PRESENTATION_SCHEMA,
        "presentation_sha256": _presentation_digest(payload["presentation_authority"]),
    }:
        raise H1CorrespondenceFailure("class-witness source authority changed")
    try:
        replay = replay_presentation_authority(payload["presentation_authority"])
    except PresentationAuthorityFailure as error:
        raise H1CorrespondenceFailure("presentation authority replay failed") from error
    if payload["presentation_replay"] != replay:
        raise H1CorrespondenceFailure("presentation replay summary changed")
    if (
        replay.get("schema") != PRESENTATION_SCHEMA
        or replay.get("field") != FIELD_ID
        or replay.get("factor_base_size") != 66
        or replay.get("principal_relations") != 73
        or replay.get("active_shape") != [8, 15]
        or replay.get("presentation_shape") != [8, 8]
    ):
        raise H1CorrespondenceFailure("presentation authority has the wrong scope")
    smith = _smith_witness(payload["presentation_authority"])
    if payload["smith_witness"] != smith:
        raise H1CorrespondenceFailure("Smith witness changed")
    if payload["class_group"] != {
        "class_number": "1",
        "invariant_factors": [],
        "generators": [],
        "generator_order_witnesses": [],
        "generator_order_witnesses_vacuous": True,
        "exact_presentation_saturated": True,
        "global_factor_base_generation": "assumed-from-pinned-upstream-policy",
    }:
        raise H1CorrespondenceFailure("trivial class-group witness changed")
    if payload["upstream_assumptions"] != _ASSUMPTIONS:
        raise H1CorrespondenceFailure("upstream assumptions changed")
    if payload["status"] != {
        "proof_tier": "upstream-assumed-pari-correspondence",
        "class_correspondence_complete": True,
        "class_correspondence_complete_under": ASSUMPTION_SCHEMA,
        "phase5_complete": False,
        "public_class_complete": False,
        "public_class_unit_complete": False,
        "unverified_public_requirements": list(_PUBLIC_GAPS),
    }:
        raise H1CorrespondenceFailure("class-completion status changed")


def _validate_payload(payload: Any) -> None:
    try:
        _validate_payload_unchecked(payload)
    except H1CorrespondenceFailure:
        raise
    except (IndexError, KeyError, TypeError, ValueError, ZeroDivisionError) as error:
        raise H1CorrespondenceFailure(
            "class witness is structurally invalid"
        ) from error


class H1CorrespondencePublisher:
    """Publish one immutable internal class correspondence."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._published: ImmutableH1Correspondence | None = None

    def publish(self, payload: Mapping[str, Any]) -> ImmutableH1Correspondence:
        detached = json.loads(_canonical(payload))
        _validate_payload(detached)
        payload_raw = _canonical(detached)
        envelope = {
            "schema": SCHEMA,
            "payload": detached,
            "payload_sha256": _sha256(payload_raw),
        }
        raw = _canonical(envelope)
        result = ImmutableH1Correspondence(raw, _sha256(raw))
        with self._lock:
            if self._published is None:
                self._published = result
            elif self._published != result:
                raise H1CorrespondenceConflict(
                    "a different class correspondence is already published"
                )
            return self._published

    def current(self) -> ImmutableH1Correspondence | None:
        with self._lock:
            return self._published


def cold_replay_h1_class_correspondence(
    raw: bytes | str | ImmutableH1Correspondence,
    authority: H1CorrespondenceAuthority,
) -> ImmutableH1Correspondence:
    """Replay detached evidence under an out-of-band publication hash."""
    encoded = raw.canonical_json if isinstance(raw, ImmutableH1Correspondence) else raw
    envelope = _strict_loads(encoded)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise H1CorrespondenceFailure("class-witness envelope has the wrong fields")
    if envelope["schema"] != SCHEMA:
        raise H1CorrespondenceFailure("class-witness schema changed")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise H1CorrespondenceFailure("class-witness payload hash changed")
    _validate_payload(envelope["payload"])
    canonical = _canonical(envelope)
    digest = _sha256(canonical)
    if digest != authority.expected_sha256:
        raise H1CorrespondenceFailure("class-witness publication is not authorized")
    return ImmutableH1Correspondence(canonical, digest)


__all__ = [
    "ASSUMPTION_SCHEMA",
    "CONNECTED_FIELD_ID",
    "H1CorrespondenceAuthority",
    "H1CorrespondenceConflict",
    "H1CorrespondenceFailure",
    "H1CorrespondencePublisher",
    "ImmutableH1Correspondence",
    "SCHEMA",
    "build_h1_class_correspondence",
    "cold_replay_h1_class_correspondence",
]
