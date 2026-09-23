"""Atomic live class-result assembly for the authentic `h = 1` cubic.

This class-only boundary consumes two live authenticated owners: the qualified
resident computation and an immutable `H1CorrespondencePublisher` result.  It
reruns the final class `cleanarch` leaf, reconstructs the exact `buchall`
arrays, and publishes only after every cross-owner identity succeeds.  Unit
assembly, Phase 5, and public completeness are deliberately outside this
component.
"""

from __future__ import annotations

from collections.abc import Mapping as MappingABC
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from threading import Lock
from typing import Any, Mapping

from .class_group_smith_transform import pari_class_group_smith_transform
from .class_group_final_driver_status import (
    pari_equal_bound_cleanarch_driver_status,
)
from .class_group_final_state import snapshot_final_source_state
from .class_group_h1_correspondence import (
    ASSUMPTION_SCHEMA,
    CONNECTED_FIELD_ID,
    H1CorrespondenceAuthority,
    ImmutableH1Correspondence,
    cold_replay_h1_class_correspondence,
)
from .log_matrix_transform import pari_log_matrix_transform
from .presentation_authority import RESIDENT_SHA256
from .relation_hnf_witness import pari_relation_hnf_witness


SCHEMA = "sagejs.pari-class-group/live-class-result-assembly-v1"
_MAX_BYTES = 32 * 1024 * 1024
_EXPECTED_NATIVE_STATE = [0, 1, 1, 48, 48, 7, 7, 73, 8, 0]
_PUBLIC_GAPS = (
    "certified-maximal-order-authority",
    "proved-factor-base-generation-bound",
    "replayable-global-class-saturation-record",
    "completed-public-proof-stage-and-theorem-payload",
    "unit-group-assembly-and-unit-saturation",
)


class LiveClassAssemblyFailure(ValueError):
    """A live owner or assembled class result failed closed."""


class LiveClassAssemblyConflict(RuntimeError):
    """A different live class result was already published."""


@dataclass(frozen=True)
class LiveClassResultAuthority:
    expected_sha256: str


@dataclass(frozen=True)
class ImmutableLiveClassResult:
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
        raise LiveClassAssemblyFailure("class result is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise LiveClassAssemblyFailure("class result exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise LiveClassAssemblyFailure("class result exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise LiveClassAssemblyFailure("duplicate class-result key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise LiveClassAssemblyFailure("class result is not strict JSON") from error
    if not isinstance(value, dict):
        raise LiveClassAssemblyFailure("class-result envelope must be an object")
    return value


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_value(value: Any) -> str:
    return _sha256_bytes(_canonical(value))


def _read_resident(resident_output: str | Path) -> dict[str, Any]:
    raw = Path(resident_output).read_bytes()
    if _sha256_bytes(raw) != RESIDENT_SHA256:
        raise LiveClassAssemblyFailure("resident owner is not the qualified artifact")
    try:
        value = json.loads(raw)
    except (TypeError, ValueError, UnicodeError) as error:
        raise LiveClassAssemblyFailure("resident owner is not JSON") from error
    if not isinstance(value, dict):
        raise LiveClassAssemblyFailure("resident owner must be an object")
    return value


def _integers(value: Any, length: int, name: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, list):
        raise LiveClassAssemblyFailure(name + " must be an exact list")
    if len(value) < length:
        raise LiveClassAssemblyFailure(name + " has the wrong length")
    answer: list[int] = []
    for entry in value[:length]:
        if isinstance(entry, bool):
            raise LiveClassAssemblyFailure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise LiveClassAssemblyFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise LiveClassAssemblyFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _decimals(values: list[int]) -> list[str]:
    return [str(value) for value in values]


def _identity(size: int) -> list[int]:
    return [int(row == column) for column in range(size) for row in range(size)]


def _run_live_buchall(resident: Mapping[str, Any]) -> dict[str, Any]:
    """Reconstruct the class-only `buchall` result from resident owners."""
    rows = 8
    columns = 15
    relation = _integers(resident.get("hnf_matbnew"), 120, "active relation")
    full_hnf = _integers(resident.get("hnf_full_h"), 120, "active full HNF")
    transform = _integers(resident.get("hnf_hnf_transform"), 225, "HNF transform")
    transform_inverse = [0] * 225
    augmented = [0] * 450
    inverse_state = [0] * 5
    relation_to_presentation = [0] * 120
    presentation_to_relation = [0] * 120
    witness_state = [0] * 8
    if (
        pari_relation_hnf_witness(
            relation,
            rows,
            columns,
            full_hnf,
            transform,
            transform_inverse,
            augmented,
            inverse_state,
            relation_to_presentation,
            presentation_to_relation,
            witness_state,
        )
        != 0
    ):
        raise LiveClassAssemblyFailure("live relation/HNF witness rejected")
    presentation = full_hnf[(columns - rows) * rows :]
    outputs = [[0] * 64 for _ in range(10)]
    invariants = [0] * rows
    class_number = [0]
    column = [0] * rows
    right_inverse = [0] * 64
    smith_augmented = [0] * 128
    states = [[0] * 5, [0] * 5, [0] * 6, [0] * 6, [0] * 7]
    if (
        pari_class_group_smith_transform(
            presentation,
            rows,
            *outputs,
            invariants,
            class_number,
            column,
            right_inverse,
            smith_augmented,
            *states,
        )
        != 0
    ):
        raise LiveClassAssemblyFailure("live Smith transform rejected")
    smith, left, left_inverse, right, ur, _, _, _, m1, m2 = outputs
    if smith != _identity(rows) or class_number != [1] or states[-1][1] != 0:
        raise LiveClassAssemblyFailure("live Smith quotient is not h=1")
    relation_logs = _integers(
        resident.get("hnf_result_c"), 3 * rows * 7, "active relation logs"
    )
    generator_arch = [0] * (3 * rows * 7)
    pari_log_matrix_transform(relation_logs, m2, 3, rows, rows, True, generator_arch)
    buchall = snapshot_final_source_state(
        {
            "Ur": {"shape": [rows, rows], "entries": ur},
            "M1": {"shape": [rows, 0], "entries": []},
            "M2": {"shape": [rows, rows], "entries": m2},
            "Ga": {"shape": [0, 3, 7], "entries": []},
            "Ge": {"shape": [0, 0], "entries": []},
            "GD": {"shape": [0, 3, 7], "entries": []},
            "ga": {"shape": [rows, 3, 7], "entries": generator_arch},
            "clg2": {"components": ["Ur", "ga", "GD", "Ge", "M1", "M2"]},
        }
    )
    return {
        "relation": {
            "shape": ["8", "15"],
            "entries": _decimals(relation),
            "accepted_relation_count": "73",
        },
        "presentation": {"shape": ["8", "8"], "entries": _decimals(presentation)},
        "smith": {
            "diagonal": _decimals(smith),
            "left": _decimals(left),
            "left_inverse": _decimals(left_inverse),
            "right": _decimals(right),
            "right_inverse": _decimals(right_inverse),
            "invariants": [],
            "class_number": "1",
        },
        "generators": {"entries": []},
        "buchall": buchall,
        "states": {
            "witness": _decimals(witness_state),
            "smith": _decimals(states[-1]),
        },
    }


def _replay_correspondence_owner(
    correspondence: ImmutableH1Correspondence,
    authority: H1CorrespondenceAuthority,
) -> dict[str, Any]:
    try:
        replayed = cold_replay_h1_class_correspondence(correspondence, authority)
    except (TypeError, ValueError) as error:
        raise LiveClassAssemblyFailure(
            "class-correspondence owner failed cold replay"
        ) from error
    return replayed.detached_payload()


def _cross_check_class_owners(
    class_state: Mapping[str, Any], correspondence: Mapping[str, Any]
) -> None:
    if correspondence.get("source", {}).get("field_id") != CONNECTED_FIELD_ID:
        raise LiveClassAssemblyFailure("class-correspondence field changed")
    if correspondence.get("source", {}).get("resident_sha256") != RESIDENT_SHA256:
        raise LiveClassAssemblyFailure(
            "class correspondence is stale for resident owner"
        )
    if correspondence.get("class_group") != {
        "class_number": "1",
        "invariant_factors": [],
        "generators": [],
        "generator_order_witnesses": [],
        "generator_order_witnesses_vacuous": True,
        "exact_presentation_saturated": True,
        "global_factor_base_generation": "assumed-from-pinned-upstream-policy",
    }:
        raise LiveClassAssemblyFailure("class-correspondence result changed")
    status = correspondence.get("status")
    if (
        not isinstance(status, MappingABC)
        or status.get("class_correspondence_complete") is not True
        or status.get("class_correspondence_complete_under") != ASSUMPTION_SCHEMA
        or status.get("phase5_complete") is not False
        or status.get("public_class_complete") is not False
    ):
        raise LiveClassAssemblyFailure("class-correspondence status changed")
    smith = correspondence.get("smith_witness")
    if not isinstance(smith, MappingABC):
        raise LiveClassAssemblyFailure("class-correspondence Smith owner is absent")
    live_smith = class_state.get("smith")
    if not isinstance(live_smith, MappingABC):
        raise LiveClassAssemblyFailure("live Smith state is absent")
    comparisons = {
        "presentation": class_state.get("presentation", {}).get("entries"),
        "diagonal": live_smith.get("diagonal"),
        "left": live_smith.get("left"),
        "left_inverse": live_smith.get("left_inverse"),
        "right": live_smith.get("right"),
        "right_inverse": live_smith.get("right_inverse"),
    }
    for name, value in comparisons.items():
        if smith.get(name) != value:
            raise LiveClassAssemblyFailure(
                "live class state disagrees with Smith owner: " + name
            )
    if (
        live_smith.get("class_number") != "1"
        or live_smith.get("invariants") != []
        or class_state.get("generators") != {"entries": []}
        or class_state.get("relation", {}).get("accepted_relation_count") != "73"
    ):
        raise LiveClassAssemblyFailure("live h=1 class result changed")


def _run_live_cleanarch(resident: Mapping[str, Any]) -> dict[str, Any]:
    try:
        columns = 7
        precision = int(resident["precision"])
        source = [int(value) for value in resident["hnf_result_c"][: 21 * columns]]
        prep_base_state = [int(value) for value in resident["prep_base_state"][:7]]
        prep_state = [int(value) for value in resident["prep_state"][:8]]
        hnf_state = [int(value) for value in resident["hnf_state"][:9]]
        acceptance = [int(value) for value in resident["accept_acceptance_state"][:3]]
    except (IndexError, KeyError, TypeError, ValueError) as error:
        raise LiveClassAssemblyFailure(
            "resident cleanarch owner is incomplete"
        ) from error
    size = 21 * columns
    zero = lambda length: [0] * length
    scratch = zero(size)
    output = zero(size)
    clean_state = zero(4)
    driver_state = zero(10)
    result = pari_equal_bound_cleanarch_driver_status(
        prep_base_state,
        prep_state,
        hnf_state,
        acceptance,
        source,
        columns,
        precision,
        zero(3),
        zero(512),
        zero(512),
        zero(512),
        zero(512),
        zero(1024),
        scratch,
        output,
        clean_state,
        driver_state,
    )
    if (
        result != 0
        or driver_state != _EXPECTED_NATIVE_STATE
        or clean_state[:3] != [0, columns, columns]
    ):
        raise LiveClassAssemblyFailure("live class cleanarch did not publish")
    return {
        "status": "accepted",
        "honesty_status": "equal-bound-source-skip",
        "source_columns": str(columns),
        "published_columns": str(clean_state[2]),
        "source_sha256": _sha256_value([str(value) for value in source]),
        "cleaned_sha256": _sha256_value([str(value) for value in output]),
        "cleaned_entries": [str(value) for value in output],
        "clean_state": [str(value) for value in clean_state],
        "driver_state": [str(value) for value in driver_state],
    }


def build_live_class_result_payload(
    resident_output: str | Path,
    correspondence: ImmutableH1Correspondence,
    correspondence_authority: H1CorrespondenceAuthority,
) -> dict[str, Any]:
    """Build, but do not publish, the live internal class-only result."""
    resident = _read_resident(resident_output)
    correspondence_payload = _replay_correspondence_owner(
        correspondence, correspondence_authority
    )
    try:
        class_state = _run_live_buchall(resident)
    except (IndexError, KeyError, TypeError, ValueError) as error:
        raise LiveClassAssemblyFailure("live Buchall assembly rejected") from error
    _cross_check_class_owners(class_state, correspondence_payload)
    buchall = snapshot_final_source_state(class_state["buchall"])
    cleanarch = _run_live_cleanarch(resident)
    payload = {
        "source": {
            "field_id": CONNECTED_FIELD_ID,
            "resident_sha256": RESIDENT_SHA256,
            "class_correspondence_sha256": correspondence.sha256,
            "presentation_sha256": correspondence_payload["source"][
                "presentation_sha256"
            ],
        },
        "class_group": dict(correspondence_payload["class_group"]),
        "cleanarch": cleanarch,
        "buchall": buchall,
        "terminal": {
            "status": "buchall-class-result-assembled",
            "atomic_publication": True,
            "class_result_complete_under_upstream_assumption": True,
            "class_correspondence_assumption_schema": ASSUMPTION_SCHEMA,
            "unit_group_included": False,
            "phase5_complete": False,
            "public_class_complete": False,
            "public_class_unit_complete": False,
            "unverified_public_requirements": list(_PUBLIC_GAPS),
        },
    }
    _validate_payload(payload, correspondence_payload, correspondence.sha256)
    return payload


def _validate_payload(
    payload: Any,
    correspondence_payload: Mapping[str, Any],
    correspondence_sha256: str,
) -> None:
    if not isinstance(payload, MappingABC) or set(payload) != {
        "source",
        "class_group",
        "cleanarch",
        "buchall",
        "terminal",
    }:
        raise LiveClassAssemblyFailure("class-result payload has the wrong fields")
    source = payload["source"]
    expected_source = {
        "field_id": CONNECTED_FIELD_ID,
        "resident_sha256": RESIDENT_SHA256,
        "class_correspondence_sha256": correspondence_sha256,
        "presentation_sha256": correspondence_payload["source"]["presentation_sha256"],
    }
    if not isinstance(source, MappingABC) or dict(source) != expected_source:
        raise LiveClassAssemblyFailure("class-result source owner changed")
    if payload["class_group"] != correspondence_payload["class_group"]:
        raise LiveClassAssemblyFailure("published class group is detached")
    cleanarch = payload["cleanarch"]
    if (
        not isinstance(cleanarch, MappingABC)
        or set(cleanarch)
        != {
            "status",
            "honesty_status",
            "source_columns",
            "published_columns",
            "source_sha256",
            "cleaned_sha256",
            "cleaned_entries",
            "clean_state",
            "driver_state",
        }
        or cleanarch["status"] != "accepted"
        or cleanarch["honesty_status"] != "equal-bound-source-skip"
        or cleanarch["source_columns"] != "7"
        or cleanarch["published_columns"] != "7"
        or cleanarch["cleaned_sha256"] != _sha256_value(cleanarch["cleaned_entries"])
        or cleanarch["clean_state"][:3] != ["0", "7", "7"]
        or cleanarch["driver_state"] != [str(value) for value in _EXPECTED_NATIVE_STATE]
    ):
        raise LiveClassAssemblyFailure("published cleanarch state changed")
    try:
        if snapshot_final_source_state(payload["buchall"]) != payload["buchall"]:
            raise LiveClassAssemblyFailure("published Buchall state is noncanonical")
    except ValueError as error:
        raise LiveClassAssemblyFailure("published Buchall state is invalid") from error
    terminal = payload["terminal"]
    if terminal != {
        "status": "buchall-class-result-assembled",
        "atomic_publication": True,
        "class_result_complete_under_upstream_assumption": True,
        "class_correspondence_assumption_schema": ASSUMPTION_SCHEMA,
        "unit_group_included": False,
        "phase5_complete": False,
        "public_class_complete": False,
        "public_class_unit_complete": False,
        "unverified_public_requirements": list(_PUBLIC_GAPS),
    }:
        raise LiveClassAssemblyFailure("class-result terminal claim changed")


def _seal(payload: Mapping[str, Any]) -> ImmutableLiveClassResult:
    payload_raw = _canonical(payload)
    envelope = {
        "schema": SCHEMA,
        "payload": payload,
        "payload_sha256": _sha256_bytes(payload_raw),
    }
    raw = _canonical(envelope)
    return ImmutableLiveClassResult(raw, _sha256_bytes(raw))


class LiveClassResultPublisher:
    """Validate all live owners before atomically publishing one class result."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._published: ImmutableLiveClassResult | None = None

    def publish(
        self,
        resident_output: str | Path,
        correspondence: ImmutableH1Correspondence,
        correspondence_authority: H1CorrespondenceAuthority,
    ) -> ImmutableLiveClassResult:
        payload = build_live_class_result_payload(
            resident_output, correspondence, correspondence_authority
        )
        candidate = _seal(payload)
        with self._lock:
            if self._published is None:
                self._published = candidate
            elif self._published != candidate:
                raise LiveClassAssemblyConflict(
                    "a different live class result is already published"
                )
            return self._published

    def current(self) -> ImmutableLiveClassResult | None:
        with self._lock:
            return self._published


def cold_replay_live_class_result(
    raw: bytes | str | ImmutableLiveClassResult,
    authority: LiveClassResultAuthority,
    resident_output: str | Path,
    correspondence: ImmutableH1Correspondence,
    correspondence_authority: H1CorrespondenceAuthority,
) -> ImmutableLiveClassResult:
    """Recompute from live owners and reject detached or rehashed mutations."""
    encoded = raw.canonical_json if isinstance(raw, ImmutableLiveClassResult) else raw
    envelope = _strict_loads(encoded)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise LiveClassAssemblyFailure("class-result envelope has the wrong fields")
    if envelope["schema"] != SCHEMA:
        raise LiveClassAssemblyFailure("class-result schema changed")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256_bytes(payload_raw):
        raise LiveClassAssemblyFailure("class-result payload hash changed")
    expected = build_live_class_result_payload(
        resident_output, correspondence, correspondence_authority
    )
    if envelope["payload"] != expected:
        raise LiveClassAssemblyFailure("class result is detached from live owners")
    canonical = _canonical(envelope)
    digest = _sha256_bytes(canonical)
    if digest != authority.expected_sha256:
        raise LiveClassAssemblyFailure("class-result publication is not authorized")
    return ImmutableLiveClassResult(canonical, digest)


__all__ = [
    "ImmutableLiveClassResult",
    "LiveClassAssemblyConflict",
    "LiveClassAssemblyFailure",
    "LiveClassResultAuthority",
    "LiveClassResultPublisher",
    "SCHEMA",
    "build_live_class_result_payload",
    "cold_replay_live_class_result",
]
