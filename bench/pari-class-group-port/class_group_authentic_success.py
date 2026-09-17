"""Authentic h=1 correspondence after the successful cubic unit retry.

This remains an internal, incomplete result.  It connects the active
relation/HNF and Smith witnesses to the successful `UnitComponentOutput`, and
records the HNF-kernel map that places both reconstructed units in the active
relation lattice.  It does not invent a final-driver completion record.
"""

from __future__ import annotations

from collections.abc import Mapping as MappingABC, Sequence as SequenceABC
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from threading import Lock
from typing import Any, Mapping, Sequence

from .class_group_authentic_final_state import (
    FIELD_ID,
    FIXTURE_SHA256,
    RESIDENT_SHA256,
    _run_relation_and_smith,
)
from .class_group_final_state import (
    AssemblyFailure,
    UnitComponentOutput,
    _validate_linked_units,
    canonical_component_sha256,
    snapshot_final_source_state,
)
from .unit_bridge_cubic import (
    pari_cubic_getfu_factor_rank_two,
    pari_cubic_unit_bridge_prepare,
    pari_cubic_unit_compose_provenance,
    pari_cubic_unit_retry_link,
)
from .unit_component_cubic import make_real_cubic_unit_component
from .unit_reconstruction_signed import pari_getfu_signed_real_cubic


SUCCESS_SCHEMA = "sagejs.pari-class-group/authentic-unit-correspondence-v1"
RUN_ID = "authentic-real-cubic-h1-p2304"
OWNER_GENERATION = 1
CONNECTED_FIELD_ID = "pari-2.17.4:" + FIELD_ID
_MAX_BYTES = 64 * 1024 * 1024
_UNVERIFIED_REQUIREMENTS = (
    "exact-ideal-arithmetic-replay",
    "exact-unit-principality-and-norm-replay",
    "factor-base-authentication",
    "rigorous-regulator-enclosure-and-acceptance",
)


class AuthenticSuccessFailure(ValueError):
    """Authentic successful composition or detached replay failed closed."""


class AuthenticSuccessConflict(RuntimeError):
    """A different authentic success result was already published."""


@dataclass(frozen=True)
class AuthenticSuccessAuthority:
    expected_sha256: str


@dataclass(frozen=True)
class ImmutableAuthenticSuccess:
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
        raise AuthenticSuccessFailure("success result is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise AuthenticSuccessFailure("success result exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise AuthenticSuccessFailure("success result exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise AuthenticSuccessFailure("duplicate success key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise AuthenticSuccessFailure("success result is not strict JSON") from error
    if not isinstance(value, dict):
        raise AuthenticSuccessFailure("success envelope must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _exact_dict(value: Any, fields: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise AuthenticSuccessFailure(name + " has the wrong fields")
    return value


def _integers(value: Any, name: str, length: int | None = None) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, SequenceABC):
        raise AuthenticSuccessFailure(name + " must be an exact sequence")
    if length is not None and len(value) != length:
        raise AuthenticSuccessFailure(name + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise AuthenticSuccessFailure(name + " contains a non-integer")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise AuthenticSuccessFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise AuthenticSuccessFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _column_product(
    left: Sequence[int], rows: int, inner: int, right: Sequence[int], columns: int
) -> list[int]:
    if len(left) != rows * inner or len(right) != inner * columns:
        raise AuthenticSuccessFailure("matrix replay has the wrong shape")
    return [
        sum(left[k * rows + row] * right[column * inner + k] for k in range(inner))
        for column in range(columns)
        for row in range(rows)
    ]


def _identity(size: int) -> list[int]:
    return [int(row == column) for column in range(size) for row in range(size)]


def _read_inputs(
    resident_output: str | Path, fixture_path: str | Path
) -> tuple[dict[str, Any], dict[str, Any]]:
    resident_raw = Path(resident_output).read_bytes()
    fixture_raw = Path(fixture_path).read_bytes()
    if _sha256(resident_raw) != RESIDENT_SHA256:
        raise AuthenticSuccessFailure("resident output is not the qualified artifact")
    if _sha256(fixture_raw) != FIXTURE_SHA256:
        raise AuthenticSuccessFailure("unit fixture is not the qualified artifact")
    resident = _strict_loads(resident_raw)
    fixture_root = _strict_loads(fixture_raw)
    cases = fixture_root.get("cases")
    if not isinstance(cases, list) or len(cases) != 1 or not isinstance(cases[0], dict):
        raise AuthenticSuccessFailure("unit fixture must contain one case")
    fixture = cases[0]
    if fixture.get("polynomial") != FIELD_ID:
        raise AuthenticSuccessFailure("unit fixture field changed")
    if resident.get("hnf_state", [])[:9] != fixture["resident_state"]["hnf_state"]:
        raise AuthenticSuccessFailure("resident HNF state and unit fixture diverged")
    if (
        resident.get("accept_acceptance_state")
        != fixture["resident_state"]["acceptance"]
    ):
        raise AuthenticSuccessFailure("resident acceptance state and fixture diverged")
    if resident.get("hnf_result_c", [])[:147] != fixture["accepted_arch"]:
        raise AuthenticSuccessFailure("accepted unit columns are not resident columns")
    if resident.get("accept_regulator", [])[:3] != fixture["regulator"]:
        raise AuthenticSuccessFailure("accepted regulator and unit fixture diverged")
    return resident, fixture


def _unit_retry(
    fixture: Mapping[str, Any], oracle: Mapping[str, Any]
) -> tuple[list[int], list[int], list[int], list[int], list[int]]:
    def zeros(length: int) -> list[int]:
        return [0] * length

    def floats(length: int) -> list[float]:
        return [0.0] * length

    columns = int(fixture["columns"])
    square = columns * columns
    prepare = [
        _integers(fixture["accepted_arch"], "accepted unit logs"),
        _integers(fixture["relation_lattice"], "unit relation lattice"),
        columns,
        _integers(fixture["regulator"], "accepted regulator", 3),
        zeros(2 * columns),
        zeros(4),
        zeros(2 * columns),
        zeros(42),
        zeros(18),
        zeros(42),
        zeros(18),
        zeros(6),
        zeros(5),
        floats(5),
        zeros(5),
        zeros(2 * columns),
        zeros(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(square),
        zeros(square),
        floats(columns),
        zeros(columns),
        floats(2 * columns),
        floats(square),
        zeros(columns),
        zeros(columns),
        zeros(columns),
        floats(columns),
        floats(columns),
        floats(columns),
        zeros(columns),
        zeros(6),
        zeros(3),
        zeros(6),
        zeros(4),
        zeros(4),
        floats(4),
        zeros(4),
        floats(4),
        zeros(4),
        floats(2),
        zeros(2),
        floats(6),
        floats(4),
        zeros(2),
        zeros(3),
        zeros(3),
        floats(3),
        floats(3),
        floats(3),
        zeros(3),
        zeros(2),
    ]
    if pari_cubic_unit_bridge_prepare(*prepare) != 0:
        raise AuthenticSuccessFailure("resident unit preparation rejected")
    retry_input = _integers(
        [value for triple in oracle["input"] for value in triple],
        "retry input",
        18,
    )
    retry_link = zeros(3)
    if pari_cubic_unit_retry_link(prepare[10], retry_input, retry_link) != 0:
        raise AuthenticSuccessFailure("resident-to-retry linkage rejected")
    factor = [
        retry_input,
        zeros(4),
        zeros(18),
        zeros(6),
        zeros(4),
        zeros(2),
        floats(4),
        zeros(4),
        floats(4),
        zeros(4),
        floats(2),
        zeros(2),
        floats(6),
        floats(4),
        zeros(2),
        zeros(3),
        zeros(2),
        floats(3),
        floats(3),
        zeros(4),
    ]
    if pari_cubic_getfu_factor_rank_two(*factor) != 0:
        raise AuthenticSuccessFailure("retry factor rejected")
    tensor = _integers(
        [value for row in oracle["tensor"] for value in row],
        "multiplication tensor",
        27,
    )
    retry = [
        retry_input,
        _integers(oracle["inputPhases"], "retry input phases", 6),
        factor[1],
        _integers(
            [value for triple in oracle["embedding"] for value in triple],
            "retry embedding",
            27,
        ),
        tensor,
        2048,
        2048,
        zeros(18),
        zeros(18),
        zeros(18),
        zeros(6),
        zeros(18),
        zeros(27),
        zeros(18),
        zeros(18),
        zeros(6),
        zeros(9),
        zeros(3),
        zeros(6),
        zeros(4),
        zeros(6),
        zeros(18),
        zeros(6),
        zeros(4),
        zeros(8),
        zeros(3),
        zeros(320),
        zeros(320),
        zeros(320),
        zeros(320),
        zeros(320),
        zeros(128),
    ]
    if pari_getfu_signed_real_cubic(*retry) != 0 or retry[24][0] != 0:
        raise AuthenticSuccessFailure("p2304 unit retry did not succeed")
    units = retry[20]
    logs = retry[21]
    getfu_factor = retry[23]
    if units != _integers(
        [value for row in oracle["units"] for value in row], "oracle units", 6
    ):
        raise AuthenticSuccessFailure("retry units disagree with PARI")
    if logs != _integers(
        [value for triple in oracle["logs"] for value in triple], "oracle logs", 18
    ):
        raise AuthenticSuccessFailure("retry logs disagree with PARI")
    if getfu_factor != _integers(oracle["factor"], "oracle factor", 4):
        raise AuthenticSuccessFailure("retry factor disagrees with PARI")
    provenance = zeros(2 * columns)
    if (
        pari_cubic_unit_compose_provenance(
            prepare[6], columns, getfu_factor, provenance
        )
        != 0
    ):
        raise AuthenticSuccessFailure("unit provenance composition rejected")
    return units, logs, tensor, provenance, retry_link


def _full_relation_provenance(
    resident: Mapping[str, Any], unit_provenance: Sequence[int]
) -> tuple[list[int], list[int]]:
    transform = _integers(
        resident["hnf_hnf_transform"][:225], "resident HNF transform", 225
    )
    provenance = _integers(unit_provenance, "seven-column unit provenance", 14)
    answer = [0] * 30
    for unit in range(2):
        for relation in range(15):
            answer[15 * unit + relation] = sum(
                provenance[7 * unit + kernel] * transform[15 * kernel + relation]
                for kernel in range(7)
            )
    active = _integers(resident["hnf_matbnew"][:120], "active A", 120)
    for unit in range(2):
        for row in range(8):
            if sum(
                active[8 * column + row] * answer[15 * unit + column]
                for column in range(15)
            ):
                raise AuthenticSuccessFailure("unit provenance is not in ker(A)")
    return transform[: 15 * 7], answer


def _candidate(
    class_state: Mapping[str, Any],
    fixture: Mapping[str, Any],
    resident: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "field_id": CONNECTED_FIELD_ID,
        "class_number": "1",
        "invariant_factors": [],
        "active_relation_shape": ["8", "15"],
        "active_relation_matrix": list(class_state["relation"]["entries"]),
        "presentation_shape": ["8", "8"],
        "presentation_matrix": list(class_state["presentation"]["entries"]),
        "transformed_logs": [str(value) for value in fixture["accepted_arch"]],
        "regulator_triplet": [str(value) for value in fixture["regulator"]],
        "expected_unit_rank": "2",
        "equal_bound_state": [str(value) for value in resident["hnf_state"][:9]],
        "acceptance_state": [
            str(value) for value in resident["accept_acceptance_state"]
        ],
    }


def _component_record(component: UnitComponentOutput) -> dict[str, Any]:
    return {
        "run_id": component.run_id,
        "owner_generation": str(component.owner_generation),
        "terminal_status": component.terminal_status,
        "candidate_sha256": component.candidate_sha256,
        "transforms_sha256": component.transforms_sha256,
        "evidence": json.loads(_canonical(component.evidence)),
    }


def build_authentic_success_payload(
    resident_output: str | Path,
    fixture_path: str | Path,
    unit_oracle: Mapping[str, Any],
) -> dict[str, Any]:
    """Execute live class/unit leaves and join their exact correspondence."""
    if not isinstance(unit_oracle, MappingABC):
        raise AuthenticSuccessFailure("unit oracle is not a mapping")
    resident, fixture = _read_inputs(resident_output, fixture_path)
    class_state = _run_relation_and_smith(resident)
    transforms = {
        key: class_state[key]
        for key in (
            "relation",
            "presentation",
            "relation_to_presentation",
            "presentation_to_relation",
            "smith",
            "states",
        )
    }
    candidate = _candidate(class_state, fixture, resident)
    units, logs, tensor, provenance, retry_link = _unit_retry(fixture, unit_oracle)
    unit_component = make_real_cubic_unit_component(
        RUN_ID,
        OWNER_GENERATION,
        candidate,
        canonical_component_sha256(transforms),
        units,
        logs,
        tensor,
        provenance,
        7,
        retry_link,
        ((0, 7), (7, 7), (21, 7), (28, 7)),
    )
    kernel_basis, full_provenance = _full_relation_provenance(resident, provenance)
    payload = {
        "source": {
            "field_id": CONNECTED_FIELD_ID,
            "resident_sha256": RESIDENT_SHA256,
            "unit_fixture_sha256": FIXTURE_SHA256,
            "pari_version": "2.17.4",
        },
        "candidate": candidate,
        "transforms": transforms,
        "unit_component": _component_record(unit_component),
        "generators": {"entries": []},
        "buchall": class_state["buchall"],
        "correspondence": {
            "status": "active-hnf-kernel-to-successful-unit-component",
            "active_relation_shape": ["8", "15"],
            "hnf_kernel_shape": ["15", "7"],
            "hnf_kernel_basis": [str(value) for value in kernel_basis],
            "unit_kernel_provenance_shape": ["2", "7"],
            "unit_kernel_provenance": [str(value) for value in provenance],
            "active_relation_provenance_shape": ["2", "15"],
            "active_relation_provenance": [str(value) for value in full_provenance],
            "equal_bound_honesty": "equal-bound-source-skip",
            "cleanarch_status": "accepted-by-successful-unit-component",
            "final_driver_status": "not-published",
        },
        "terminal": {
            "status": "authentic-internal-unit-correspondence-published",
            "phase5_complete": False,
            "public_complete": False,
            "unverified_requirements": list(_UNVERIFIED_REQUIREMENTS),
        },
    }
    _validate_payload(payload)
    return payload


def _validate_class_state(payload: Mapping[str, Any]) -> None:
    candidate = payload["candidate"]
    transforms = payload["transforms"]
    relation_record = _exact_dict(
        transforms["relation"],
        {"shape", "entries", "accepted_relation_count"},
        "active relation record",
    )
    presentation_record = _exact_dict(
        transforms["presentation"], {"shape", "entries"}, "presentation record"
    )
    r2p_record = _exact_dict(
        transforms["relation_to_presentation"],
        {"shape", "entries"},
        "R2P record",
    )
    p2r_record = _exact_dict(
        transforms["presentation_to_relation"],
        {"shape", "entries"},
        "P2R record",
    )
    if (
        relation_record["shape"] != ["8", "15"]
        or relation_record["accepted_relation_count"] != "73"
        or presentation_record["shape"] != ["8", "8"]
        or r2p_record["shape"] != ["15", "8"]
        or p2r_record["shape"] != ["8", "15"]
    ):
        raise AuthenticSuccessFailure("class witness shape or count changed")
    relation = _integers(candidate["active_relation_matrix"], "active A", 120)
    presentation = _integers(candidate["presentation_matrix"], "active H", 64)
    if candidate["active_relation_shape"] != ["8", "15"]:
        raise AuthenticSuccessFailure("active relation shape changed")
    if candidate["presentation_shape"] != ["8", "8"]:
        raise AuthenticSuccessFailure("active presentation shape changed")
    if relation_record["entries"] != candidate["active_relation_matrix"]:
        raise AuthenticSuccessFailure("candidate and transform relation diverged")
    if presentation_record["entries"] != candidate["presentation_matrix"]:
        raise AuthenticSuccessFailure("candidate and transform presentation diverged")
    r2p = _integers(r2p_record["entries"], "R2P", 120)
    p2r = _integers(p2r_record["entries"], "P2R", 120)
    if _column_product(relation, 8, 15, r2p, 8) != presentation:
        raise AuthenticSuccessFailure("A*R2P != H")
    if _column_product(presentation, 8, 8, p2r, 15) != relation:
        raise AuthenticSuccessFailure("H*P2R != A")
    smith = _exact_dict(
        transforms["smith"],
        {
            "diagonal",
            "left",
            "left_inverse",
            "right",
            "right_inverse",
            "invariants",
            "class_number",
        },
        "Smith record",
    )
    left = _integers(smith["left"], "Smith U", 64)
    left_inverse = _integers(smith["left_inverse"], "Smith Ui", 64)
    right = _integers(smith["right"], "Smith V", 64)
    right_inverse = _integers(smith["right_inverse"], "Smith Vi", 64)
    identity = _identity(8)
    if (
        _integers(smith["diagonal"], "Smith D", 64) != identity
        or smith["invariants"] != []
        or smith["class_number"] != "1"
        or _column_product(left, 8, 8, left_inverse, 8) != identity
        or _column_product(left_inverse, 8, 8, left, 8) != identity
        or _column_product(right, 8, 8, right_inverse, 8) != identity
        or _column_product(right_inverse, 8, 8, right, 8) != identity
        or _column_product(_column_product(left, 8, 8, presentation, 8), 8, 8, right, 8)
        != identity
    ):
        raise AuthenticSuccessFailure("Smith witnesses changed")
    if transforms["states"] != {
        "witness": ["0", "8", "15", "7", "120", "450", "120", "120"],
        "smith": ["0", "0", "0", "0", "0", "0", "192"],
    }:
        raise AuthenticSuccessFailure("class checker states changed")


def _validate_payload_unchecked(payload: Any) -> None:
    value = _exact_dict(
        payload,
        {
            "source",
            "candidate",
            "transforms",
            "unit_component",
            "generators",
            "buchall",
            "correspondence",
            "terminal",
        },
        "success payload",
    )
    if value["source"] != {
        "field_id": CONNECTED_FIELD_ID,
        "resident_sha256": RESIDENT_SHA256,
        "unit_fixture_sha256": FIXTURE_SHA256,
        "pari_version": "2.17.4",
    }:
        raise AuthenticSuccessFailure("source authority changed")
    candidate = _exact_dict(
        value["candidate"],
        {
            "field_id",
            "class_number",
            "invariant_factors",
            "active_relation_shape",
            "active_relation_matrix",
            "presentation_shape",
            "presentation_matrix",
            "transformed_logs",
            "regulator_triplet",
            "expected_unit_rank",
            "equal_bound_state",
            "acceptance_state",
        },
        "candidate",
    )
    if (
        candidate["field_id"] != CONNECTED_FIELD_ID
        or candidate["class_number"] != "1"
        or candidate["invariant_factors"] != []
        or candidate["expected_unit_rank"] != "2"
        or candidate["equal_bound_state"]
        != ["0", "7", "66", "0", "7", "8", "0", "73", "0"]
        or candidate["acceptance_state"] != ["2", "0", "0"]
    ):
        raise AuthenticSuccessFailure("candidate terminal state changed")
    _integers(candidate["transformed_logs"], "candidate transformed logs", 147)
    regulator = _integers(candidate["regulator_triplet"], "candidate regulator", 3)
    if regulator[0] <= 0 or regulator[1] != 192:
        raise AuthenticSuccessFailure("candidate regulator changed")
    transforms = _exact_dict(
        value["transforms"],
        {
            "relation",
            "presentation",
            "relation_to_presentation",
            "presentation_to_relation",
            "smith",
            "states",
        },
        "transforms",
    )
    _validate_class_state(value)
    if value["generators"] != {"entries": []}:
        raise AuthenticSuccessFailure("trivial class group gained a generator")
    try:
        if snapshot_final_source_state(value["buchall"]) != value["buchall"]:
            raise AuthenticSuccessFailure("Buchall arrays are noncanonical")
    except AssemblyFailure as error:
        raise AuthenticSuccessFailure("Buchall arrays are invalid") from error
    component = _exact_dict(
        value["unit_component"],
        {
            "run_id",
            "owner_generation",
            "terminal_status",
            "candidate_sha256",
            "transforms_sha256",
            "evidence",
        },
        "unit component",
    )
    if (
        component["run_id"] != RUN_ID
        or component["owner_generation"] != str(OWNER_GENERATION)
        or component["terminal_status"] != "getfu-and-cleanarch-complete"
        or component["candidate_sha256"] != canonical_component_sha256(candidate)
        or component["transforms_sha256"] != canonical_component_sha256(transforms)
    ):
        raise AuthenticSuccessFailure("unit component provenance changed")
    try:
        if (
            _validate_linked_units(component["evidence"], candidate)
            != component["evidence"]
        ):
            raise AuthenticSuccessFailure("unit evidence is noncanonical")
    except AssemblyFailure as error:
        raise AuthenticSuccessFailure("unit evidence replay failed") from error
    correspondence = _exact_dict(
        value["correspondence"],
        {
            "status",
            "active_relation_shape",
            "hnf_kernel_shape",
            "hnf_kernel_basis",
            "unit_kernel_provenance_shape",
            "unit_kernel_provenance",
            "active_relation_provenance_shape",
            "active_relation_provenance",
            "equal_bound_honesty",
            "cleanarch_status",
            "final_driver_status",
        },
        "correspondence",
    )
    fixed = {
        "status": "active-hnf-kernel-to-successful-unit-component",
        "active_relation_shape": ["8", "15"],
        "hnf_kernel_shape": ["15", "7"],
        "unit_kernel_provenance_shape": ["2", "7"],
        "active_relation_provenance_shape": ["2", "15"],
        "equal_bound_honesty": "equal-bound-source-skip",
        "cleanarch_status": "accepted-by-successful-unit-component",
        "final_driver_status": "not-published",
    }
    if any(correspondence[name] != wanted for name, wanted in fixed.items()):
        raise AuthenticSuccessFailure("correspondence status or shape changed")
    kernel = _integers(correspondence["hnf_kernel_basis"], "HNF kernel", 105)
    unit_kernel = _integers(
        correspondence["unit_kernel_provenance"], "kernel provenance", 14
    )
    full = _integers(
        correspondence["active_relation_provenance"], "active provenance", 30
    )
    relation = _integers(candidate["active_relation_matrix"], "active A", 120)
    if _column_product(relation, 8, 15, kernel, 7) != [0] * 56:
        raise AuthenticSuccessFailure("published HNF kernel is not in ker(A)")
    expected_full = [
        sum(
            unit_kernel[7 * unit + index] * kernel[15 * index + relation_index]
            for index in range(7)
        )
        for unit in range(2)
        for relation_index in range(15)
    ]
    if full != expected_full:
        raise AuthenticSuccessFailure("active provenance is detached from HNF kernel")
    for unit in range(2):
        for row in range(8):
            if sum(
                relation[8 * column + row] * full[15 * unit + column]
                for column in range(15)
            ):
                raise AuthenticSuccessFailure("unit provenance left ker(A)")
    if value["terminal"] != {
        "status": "authentic-internal-unit-correspondence-published",
        "phase5_complete": False,
        "public_complete": False,
        "unverified_requirements": list(_UNVERIFIED_REQUIREMENTS),
    }:
        raise AuthenticSuccessFailure("terminal claim changed")


def _validate_payload(payload: Any) -> None:
    try:
        _validate_payload_unchecked(payload)
    except AuthenticSuccessFailure:
        raise
    except (IndexError, KeyError, TypeError) as error:
        raise AuthenticSuccessFailure(
            "success payload is structurally invalid"
        ) from error


class AuthenticSuccessPublisher:
    """Publish one authentic correspondence atomically and idempotently."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._published: ImmutableAuthenticSuccess | None = None

    def publish(self, payload: Mapping[str, Any]) -> ImmutableAuthenticSuccess:
        detached = json.loads(_canonical(payload))
        _validate_payload(detached)
        payload_raw = _canonical(detached)
        envelope = {
            "schema": SUCCESS_SCHEMA,
            "payload": detached,
            "payload_sha256": _sha256(payload_raw),
        }
        raw = _canonical(envelope)
        result = ImmutableAuthenticSuccess(raw, _sha256(raw))
        with self._lock:
            if self._published is None:
                self._published = result
            elif self._published != result:
                raise AuthenticSuccessConflict(
                    "a different authentic correspondence is already published"
                )
            return self._published

    def current(self) -> ImmutableAuthenticSuccess | None:
        with self._lock:
            return self._published


def cold_replay_authentic_success(
    raw: bytes | str | ImmutableAuthenticSuccess,
    authority: AuthenticSuccessAuthority,
) -> ImmutableAuthenticSuccess:
    """Replay detached correspondence under an out-of-band publication hash."""
    encoded = raw.canonical_json if isinstance(raw, ImmutableAuthenticSuccess) else raw
    envelope = _strict_loads(encoded)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise AuthenticSuccessFailure("success envelope has the wrong fields")
    if envelope["schema"] != SUCCESS_SCHEMA:
        raise AuthenticSuccessFailure("success schema changed")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise AuthenticSuccessFailure("success payload hash changed")
    _validate_payload(envelope["payload"])
    canonical = _canonical(envelope)
    digest = _sha256(canonical)
    if digest != authority.expected_sha256:
        raise AuthenticSuccessFailure("success publication is not authorized")
    return ImmutableAuthenticSuccess(canonical, digest)


__all__ = [
    "AuthenticSuccessAuthority",
    "AuthenticSuccessConflict",
    "AuthenticSuccessFailure",
    "AuthenticSuccessPublisher",
    "CONNECTED_FIELD_ID",
    "ImmutableAuthenticSuccess",
    "OWNER_GENERATION",
    "RUN_ID",
    "SUCCESS_SCHEMA",
    "build_authentic_success_payload",
    "cold_replay_authentic_success",
]
