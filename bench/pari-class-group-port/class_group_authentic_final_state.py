"""Authentic h=1 composition at the resident `fupb_PRECI` frontier.

This is not a completed class/unit result.  It executes the existing ordinary
Python relation/HNF, Smith, logarithm, and cubic-unit bridge leaves on the
qualified resident artifact, then atomically publishes their immutable joined
state.  The unit slot is explicitly pending; a later precision retry can feed
the unchanged connected-final-state component API.
"""

from __future__ import annotations

from collections.abc import Sequence as SequenceABC
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from threading import Lock
from typing import Any, Mapping, Sequence

from .class_group_final_state import snapshot_final_source_state
from .class_group_smith_transform import pari_class_group_smith_transform
from .log_matrix_transform import pari_log_matrix_transform
from .relation_hnf_witness import pari_relation_hnf_witness
from .unit_bridge_cubic import (
    pari_cubic_getfu_factor_rank_two,
    pari_cubic_unit_bridge_prepare,
    pari_cubic_unit_compose_provenance,
)
from .unit_reconstruction_signed import pari_getfu_signed_real_cubic


FRONTIER_SCHEMA = "sagejs.pari-class-group/authentic-final-frontier-v1"
RESIDENT_SHA256 = "a705f625bf6f47a25b62dd3ff8485abf1c8af5ec0f12d15ee5cbb89cf6195e0b"
FIXTURE_SHA256 = "83ce9a256e29b06530e8de2846d274e093f2021c4a547496ccf8122b310061e7"
FIELD_ID = "x^3-20018*x+20034"
_MAX_BYTES = 8 * 1024 * 1024
_REQUIREMENTS = (
    "precision-retry-p2304-unit-component",
    "exact-ideal-arithmetic-replay",
    "exact-unit-principality-and-norm-replay",
    "factor-base-authentication",
    "rigorous-regulator-enclosure-and-acceptance",
)


class FrontierFailure(ValueError):
    """Authentic frontier input or detached replay failed closed."""


class FrontierConflict(RuntimeError):
    """A different authentic frontier was already published."""


@dataclass(frozen=True)
class FrontierReplayAuthority:
    expected_sha256: str


@dataclass(frozen=True)
class ImmutableAuthenticFrontier:
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
        raise FrontierFailure("frontier is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise FrontierFailure("frontier exceeds its byte bound")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise FrontierFailure("frontier exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise FrontierFailure("duplicate frontier key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise FrontierFailure("frontier is not strict JSON") from error
    if not isinstance(value, dict):
        raise FrontierFailure("frontier envelope must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _exact_dict(value: Any, fields: set[str], name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise FrontierFailure(name + " has the wrong fields")
    return value


def _integers(value: Sequence[Any], name: str, length: int | None = None) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, SequenceABC):
        raise FrontierFailure(name + " must be an exact sequence")
    if length is not None and len(value) != length:
        raise FrontierFailure(name + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise FrontierFailure(name + " contains a non-integer")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise FrontierFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise FrontierFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _decimals(value: Sequence[int]) -> list[str]:
    return [str(entry) for entry in value]


def _matrix_product(
    left: Sequence[int], rows: int, inner: int, right: Sequence[int], columns: int
) -> list[int]:
    if rows * inner * columns > 1_000_000:
        raise FrontierFailure("frontier matrix replay exceeds its work bound")
    return [
        sum(left[k * rows + row] * right[column * inner + k] for k in range(inner))
        for column in range(columns)
        for row in range(rows)
    ]


def _identity(size: int) -> list[int]:
    return [int(row == column) for column in range(size) for row in range(size)]


def _run_relation_and_smith(resident: Mapping[str, Any]) -> dict[str, Any]:
    rows = 8
    columns = 15
    relation = _integers(resident["hnf_matbnew"][: rows * columns], "active A", 120)
    full_hnf = _integers(resident["hnf_full_h"][: rows * columns], "full HNF", 120)
    transform = _integers(
        resident["hnf_hnf_transform"][: columns * columns], "HNF V", 225
    )
    transform_inverse = [0] * (columns * columns)
    augmented = [0] * (2 * columns * columns)
    inverse_state = [0] * 5
    r2p = [0] * (rows * columns)
    p2r = [0] * (rows * columns)
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
            r2p,
            p2r,
            witness_state,
        )
        != 0
    ):
        raise FrontierFailure("authentic relation/HNF witness rejected")
    zero_columns = columns - rows
    presentation = full_hnf[zero_columns * rows :]

    outputs = [[0] * (rows * rows) for _ in range(10)]
    invariants = [0] * rows
    class_number = [0]
    column = [0] * rows
    product = [0] * (rows * rows)
    smith_augmented = [0] * (2 * rows * rows)
    smith_states = [[0] * 5, [0] * 5, [0] * 6, [0] * 6, [0] * 7]
    if (
        pari_class_group_smith_transform(
            presentation,
            rows,
            *outputs,
            invariants,
            class_number,
            column,
            product,
            smith_augmented,
            *smith_states,
        )
        != 0
    ):
        raise FrontierFailure("authentic Smith transform rejected")
    smith, left, left_inverse, right, ur, _, _, _, m1, m2 = outputs
    smith_state = smith_states[-1]
    if smith_state[1] != 0 or class_number != [1] or smith != _identity(rows):
        raise FrontierFailure("authentic h=1 Smith quotient is not trivial")

    relation_logs = _integers(
        resident["hnf_result_c"][: 3 * rows * 7], "active relation logs", 168
    )
    generator_arch = [0] * (3 * rows * 7)
    pari_log_matrix_transform(relation_logs, m2, 3, rows, rows, True, generator_arch)
    source_state = snapshot_final_source_state(
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
        "relation_to_presentation": {
            "shape": ["15", "8"],
            "entries": _decimals(r2p),
        },
        "presentation_to_relation": {
            "shape": ["8", "15"],
            "entries": _decimals(p2r),
        },
        "smith": {
            "diagonal": _decimals(smith),
            "left": _decimals(left),
            "left_inverse": _decimals(left_inverse),
            "right": _decimals(right),
            "right_inverse": _decimals(product),
            "invariants": [],
            "class_number": "1",
        },
        "generators": {"entries": []},
        "buchall": source_state,
        "states": {
            "witness": _decimals(witness_state),
            "smith": _decimals(smith_state),
        },
    }


def _run_unit_frontier(fixture: Mapping[str, Any]) -> dict[str, Any]:
    def zeros(length: int) -> list[int]:
        return [0] * length

    def floats(length: int) -> list[float]:
        return [0.0] * length

    columns = int(fixture["columns"])
    square = columns * columns
    accepted_arch = _integers(fixture["accepted_arch"], "accepted unit logs")
    relation_lattice = _integers(fixture["relation_lattice"], "unit relation lattice")
    regulator = _integers(fixture["regulator"], "accepted regulator", 3)
    prepare = [
        accepted_arch,
        relation_lattice,
        columns,
        regulator,
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
        raise FrontierFailure("authentic cubic unit prepare rejected")
    clean_logs = prepare[10]
    phases = prepare[11]
    unit_transform = prepare[6]
    factor = [
        clean_logs,
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
        raise FrontierFailure("authentic rank-two getfu factor rejected")
    getfu_factor = factor[1]
    getfu = [
        clean_logs,
        phases,
        getfu_factor,
        _integers(fixture["embedding"], "unit embedding"),
        _integers(fixture["multiplication_basis"], "multiplication basis"),
        int(fixture["precision"]),
        int(fixture["phase_precision"]),
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
        zeros(64),
        zeros(64),
        zeros(64),
        zeros(64),
        zeros(64),
        zeros(128),
    ]
    if pari_getfu_signed_real_cubic(*getfu) != 3 or getfu[24][0] != 3:
        raise FrontierFailure("authentic unit bridge did not stop at PRECI")
    provenance = zeros(2 * columns)
    if (
        pari_cubic_unit_compose_provenance(
            unit_transform, columns, getfu_factor, provenance
        )
        != 0
    ):
        raise FrontierFailure("authentic unit provenance composition rejected")
    return {
        "status": "fupb_PRECI",
        "unit_component": None,
        "precision": str(fixture["precision"]),
        "phase_precision": str(fixture["phase_precision"]),
        "required_precision": {
            "packed_logs": "2176",
            "embedding": "2240",
            "working_capacity": "2304",
        },
        "accepted_arch_sha256": _sha256(_canonical(_decimals(accepted_arch))),
        "unit_transform": _decimals(unit_transform),
        "clean_logs": _decimals(clean_logs),
        "phases": _decimals(phases),
        "getfu_factor": _decimals(getfu_factor),
        "relation_provenance": _decimals(provenance),
        "prepare_state": _decimals(prepare[12]),
        "factor_state": _decimals(factor[5]),
        "getfu_state": _decimals(getfu[24]),
    }


def build_authentic_frontier_payload(
    resident_output: str | Path, fixture_path: str | Path
) -> dict[str, Any]:
    """Execute the authentic leaves and return an un-published payload."""
    resident_raw = Path(resident_output).read_bytes()
    fixture_raw = Path(fixture_path).read_bytes()
    if _sha256(resident_raw) != RESIDENT_SHA256:
        raise FrontierFailure("resident output is not the qualified artifact")
    if _sha256(fixture_raw) != FIXTURE_SHA256:
        raise FrontierFailure("unit fixture is not the qualified artifact")
    resident = _strict_loads(resident_raw)
    fixture_root = _strict_loads(fixture_raw)
    cases = fixture_root.get("cases")
    if not isinstance(cases, list) or len(cases) != 1 or not isinstance(cases[0], dict):
        raise FrontierFailure("unit fixture must contain its one authentic case")
    fixture = cases[0]
    if fixture.get("polynomial") != FIELD_ID:
        raise FrontierFailure("unit fixture field changed")
    if resident.get("relation_state", [None])[0] != "73":
        raise FrontierFailure("resident relation frontier changed")
    if resident.get("class_number", [None])[0] != "1":
        raise FrontierFailure("resident class number changed")
    payload = {
        "source": {
            "field_id": FIELD_ID,
            "resident_sha256": RESIDENT_SHA256,
            "unit_fixture_sha256": FIXTURE_SHA256,
        },
        "class_state": _run_relation_and_smith(resident),
        "unit_frontier": _run_unit_frontier(fixture),
        "terminal": {
            "status": "awaiting-unit-precision-retry",
            "phase5_complete": False,
            "public_complete": False,
            "unverified_requirements": list(_REQUIREMENTS),
        },
    }
    _validate_payload(payload)
    return payload


def _validate_payload_unchecked(payload: Any) -> None:
    if not isinstance(payload, dict) or set(payload) != {
        "source",
        "class_state",
        "unit_frontier",
        "terminal",
    }:
        raise FrontierFailure("frontier payload has the wrong fields")
    source = payload["source"]
    if source != {
        "field_id": FIELD_ID,
        "resident_sha256": RESIDENT_SHA256,
        "unit_fixture_sha256": FIXTURE_SHA256,
    }:
        raise FrontierFailure("frontier source authority changed")
    class_state = payload["class_state"]
    if not isinstance(class_state, dict) or set(class_state) != {
        "relation",
        "presentation",
        "relation_to_presentation",
        "presentation_to_relation",
        "smith",
        "generators",
        "buchall",
        "states",
    }:
        raise FrontierFailure("frontier class state has the wrong fields")
    relation_record = _exact_dict(
        class_state["relation"],
        {"shape", "entries", "accepted_relation_count"},
        "detached A",
    )
    presentation_record = _exact_dict(
        class_state["presentation"], {"shape", "entries"}, "detached H"
    )
    r2p_record = _exact_dict(
        class_state["relation_to_presentation"],
        {"shape", "entries"},
        "detached R2P",
    )
    p2r_record = _exact_dict(
        class_state["presentation_to_relation"],
        {"shape", "entries"},
        "detached P2R",
    )
    relation = _integers(relation_record["entries"], "detached A", 120)
    presentation = _integers(presentation_record["entries"], "detached H", 64)
    r2p = _integers(r2p_record["entries"], "detached R2P", 120)
    p2r = _integers(p2r_record["entries"], "detached P2R", 120)
    if relation_record["shape"] != ["8", "15"]:
        raise FrontierFailure("detached A shape changed")
    if relation_record["accepted_relation_count"] != "73":
        raise FrontierFailure("detached accepted relation count changed")
    if presentation_record["shape"] != ["8", "8"]:
        raise FrontierFailure("detached H shape changed")
    if r2p_record["shape"] != ["15", "8"]:
        raise FrontierFailure("detached R2P shape changed")
    if p2r_record["shape"] != ["8", "15"]:
        raise FrontierFailure("detached P2R shape changed")
    if _matrix_product(relation, 8, 15, r2p, 8) != presentation:
        raise FrontierFailure("detached A*R2P != H")
    if _matrix_product(presentation, 8, 8, p2r, 15) != relation:
        raise FrontierFailure("detached H*P2R != A")
    smith = _exact_dict(
        class_state["smith"],
        {
            "diagonal",
            "left",
            "left_inverse",
            "right",
            "right_inverse",
            "invariants",
            "class_number",
        },
        "detached Smith state",
    )
    left = _integers(smith["left"], "detached U", 64)
    left_inverse = _integers(smith["left_inverse"], "detached Ui", 64)
    right = _integers(smith["right"], "detached V", 64)
    right_inverse = _integers(smith["right_inverse"], "detached Vi", 64)
    diagonal = _integers(smith["diagonal"], "detached D", 64)
    identity = _identity(8)
    if (
        diagonal != identity
        or smith["invariants"] != []
        or smith["class_number"] != "1"
    ):
        raise FrontierFailure("detached Smith quotient is not h=1")
    if (
        _matrix_product(left, 8, 8, left_inverse, 8) != identity
        or _matrix_product(left_inverse, 8, 8, left, 8) != identity
        or _matrix_product(right, 8, 8, right_inverse, 8) != identity
        or _matrix_product(right_inverse, 8, 8, right, 8) != identity
        or _matrix_product(_matrix_product(left, 8, 8, presentation, 8), 8, 8, right, 8)
        != identity
    ):
        raise FrontierFailure("detached Smith witnesses changed")
    if class_state["generators"] != {"entries": []}:
        raise FrontierFailure("trivial class group gained a generator")
    if class_state["states"] != {
        "witness": ["0", "8", "15", "7", "120", "450", "120", "120"],
        "smith": ["0", "0", "0", "0", "0", "0", "192"],
    }:
        raise FrontierFailure("live checker states changed")
    try:
        if (
            snapshot_final_source_state(class_state["buchall"])
            != class_state["buchall"]
        ):
            raise FrontierFailure("detached buchall arrays are noncanonical")
    except ValueError as error:
        raise FrontierFailure("detached buchall arrays are invalid") from error
    unit = _exact_dict(
        payload["unit_frontier"],
        {
            "status",
            "unit_component",
            "precision",
            "phase_precision",
            "required_precision",
            "accepted_arch_sha256",
            "unit_transform",
            "clean_logs",
            "phases",
            "getfu_factor",
            "relation_provenance",
            "prepare_state",
            "factor_state",
            "getfu_state",
        },
        "unit frontier",
    )
    if unit["status"] != "fupb_PRECI":
        raise FrontierFailure("unit frontier status changed")
    if unit["unit_component"] is not None:
        raise FrontierFailure("PRECI frontier claimed a completed unit component")
    if unit["getfu_state"][0] != "3":
        raise FrontierFailure("PRECI getfu state changed")
    if unit.get("required_precision") != {
        "packed_logs": "2176",
        "embedding": "2240",
        "working_capacity": "2304",
    }:
        raise FrontierFailure("unit retry precision changed")
    if unit.get("precision") != "192" or unit.get("phase_precision") != "256":
        raise FrontierFailure("unit input precision changed")
    if unit.get("accepted_arch_sha256") != (
        "fcd451437e9158005775c79e278e0a37d90963437e7d8866747a36e707321413"
    ):
        raise FrontierFailure("accepted unit logarithms changed")
    unit_transform = _integers(
        unit.get("unit_transform"), "detached unit transform", 14
    )
    _integers(unit.get("clean_logs"), "detached clean unit logs", 18)
    _integers(unit.get("phases"), "detached unit phases", 6)
    getfu_factor = _integers(unit.get("getfu_factor"), "detached getfu factor", 4)
    provenance = _integers(
        unit.get("relation_provenance"), "detached unit provenance", 14
    )
    replayed_provenance = [0] * 14
    if (
        pari_cubic_unit_compose_provenance(
            unit_transform, 7, getfu_factor, replayed_provenance
        )
        != 0
        or replayed_provenance != provenance
    ):
        raise FrontierFailure("detached unit provenance is not linked")
    _integers(unit.get("prepare_state"), "detached prepare state", 5)
    _integers(unit.get("factor_state"), "detached factor state", 2)
    _integers(unit.get("getfu_state"), "detached getfu state", 8)
    terminal = payload["terminal"]
    if terminal != {
        "status": "awaiting-unit-precision-retry",
        "phase5_complete": False,
        "public_complete": False,
        "unverified_requirements": list(_REQUIREMENTS),
    }:
        raise FrontierFailure("frontier terminal claim changed")


def _validate_payload(payload: Any) -> None:
    try:
        _validate_payload_unchecked(payload)
    except FrontierFailure:
        raise
    except (IndexError, KeyError, TypeError) as error:
        raise FrontierFailure("frontier payload is structurally invalid") from error


class AuthenticFrontierPublisher:
    """Publish one authentic pending frontier atomically and idempotently."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._published: ImmutableAuthenticFrontier | None = None

    def publish(self, payload: Mapping[str, Any]) -> ImmutableAuthenticFrontier:
        detached = json.loads(_canonical(payload))
        _validate_payload(detached)
        payload_raw = _canonical(detached)
        envelope = {
            "schema": FRONTIER_SCHEMA,
            "payload": detached,
            "payload_sha256": _sha256(payload_raw),
        }
        raw = _canonical(envelope)
        result = ImmutableAuthenticFrontier(raw, _sha256(raw))
        with self._lock:
            if self._published is None:
                self._published = result
            elif self._published != result:
                raise FrontierConflict("a different authentic frontier is published")
            return self._published

    def current(self) -> ImmutableAuthenticFrontier | None:
        with self._lock:
            return self._published


def cold_replay_authentic_frontier(
    raw: bytes | str | ImmutableAuthenticFrontier,
    authority: FrontierReplayAuthority,
) -> ImmutableAuthenticFrontier:
    """Replay detached pending state under an out-of-band publication hash."""
    encoded = raw.canonical_json if isinstance(raw, ImmutableAuthenticFrontier) else raw
    envelope = _strict_loads(encoded)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise FrontierFailure("frontier envelope has the wrong fields")
    if envelope["schema"] != FRONTIER_SCHEMA:
        raise FrontierFailure("frontier schema changed")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise FrontierFailure("frontier payload hash changed")
    _validate_payload(envelope["payload"])
    canonical = _canonical(envelope)
    digest = _sha256(canonical)
    if digest != authority.expected_sha256:
        raise FrontierFailure("frontier publication is not authorized")
    return ImmutableAuthenticFrontier(canonical, digest)


__all__ = [
    "AuthenticFrontierPublisher",
    "FIXTURE_SHA256",
    "FIELD_ID",
    "FRONTIER_SCHEMA",
    "FrontierConflict",
    "FrontierFailure",
    "FrontierReplayAuthority",
    "ImmutableAuthenticFrontier",
    "RESIDENT_SHA256",
    "build_authentic_frontier_payload",
    "cold_replay_authentic_frontier",
]
