"""No-oracle composition root for the prepared authentic `h = 1` cubic.

The computation boundary in this module reads only the qualified resident
candidate and detached, replayable authorities.  In particular it does not
read a PARI fixture, invoke PARI, or accept retry-precision embeddings or
logarithms.  The latter are rebuilt from the resident 320-bit roots and exact
principal relation generators.

The published result is an internal PARI-correspondence result.  It is not a
public class/unit certificate: unit saturation and the global factor-base
completion proof remain explicit blockers.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import threading
from typing import Any, Mapping, Sequence

from .cubic_embedding_precision_rebuild import (
    pari_cubic_embedding_precision_rebuild,
)
from .cubic_precision_rebuild import pari_cubic_sunit_precision_rebuild
from .presentation_authority import (
    FIELD_ID,
    RELATION_COUNT,
    RESIDENT_SHA256,
    capture_presentation_authority,
    replay_presentation_authority,
)
from .torsion_authority import (
    TorsionReplayAuthority,
    cold_replay_torsion,
    derive_real_cubic_torsion,
    prepared_polynomial_sha256,
)
from .unit_relation_authority import replay_unit_relation_authority


SCHEMA = "sagejs.pari-class-group/prepared-h1-no-oracle-root-v1"
ENVELOPE_SCHEMA = "sagejs.pari-class-group/prepared-h1-no-oracle-envelope-v1"
_MAX_BYTES = 16 * 1024 * 1024
_RETRY_BITS = 2176

_PUBLIC_BLOCKERS = (
    "replayable-unit-saturation-index-one-certificate",
    "factor-base-bound-and-relation-completeness-proof",
)


class PreparedH1RootFailure(ValueError):
    """A source authority or connected replay failed closed."""


@dataclass(frozen=True)
class PreparedH1RootAuthority:
    expected_sha256: str

    def __post_init__(self) -> None:
        _digest(self.expected_sha256, "prepared h1 result authority")


@dataclass(frozen=True)
class ImmutablePreparedH1Root:
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
        raise PreparedH1RootFailure(
            "prepared h1 state is not canonical JSON"
        ) from error
    if len(raw) > _MAX_BYTES:
        raise PreparedH1RootFailure("prepared h1 state exceeds its byte bound")
    return raw


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise PreparedH1RootFailure("prepared h1 state exceeds its byte bound")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise PreparedH1RootFailure("duplicate prepared h1 key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise PreparedH1RootFailure("prepared h1 state is not strict JSON") from error
    if not isinstance(value, dict):
        raise PreparedH1RootFailure("prepared h1 envelope must be an object")
    return value


def _digest(value: Any, name: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise PreparedH1RootFailure(name + " must be a lowercase SHA-256 digest")
    return value


def _integers(value: Any, length: int, name: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != length
    ):
        raise PreparedH1RootFailure(name + " has the wrong bounded shape")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise PreparedH1RootFailure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise PreparedH1RootFailure(name + " contains a non-integer") from error
        if str(integer) != str(entry):
            raise PreparedH1RootFailure(name + " contains a noncanonical integer")
        answer.append(integer)
    return answer


def _qualified_resident(path: str | Path) -> Mapping[str, Any]:
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != RESIDENT_SHA256:
        raise PreparedH1RootFailure("resident candidate is not qualified")
    try:
        value = json.loads(raw)
    except (TypeError, ValueError, UnicodeError) as error:
        raise PreparedH1RootFailure("resident candidate is not JSON") from error
    if not isinstance(value, Mapping):
        raise PreparedH1RootFailure("resident candidate is not a mapping")
    return value


def _determinant(matrix: Sequence[int], size: int) -> int:
    work = list(matrix)
    sign = 1
    divisor = 1
    for column in range(size - 1):
        pivot = next(
            (row for row in range(column, size) if work[size * row + column]), None
        )
        if pivot is None:
            return 0
        if pivot != column:
            for place in range(size):
                left = size * column + place
                right = size * pivot + place
                work[left], work[right] = work[right], work[left]
            sign = -sign
        pivot_value = work[size * column + column]
        for row in range(column + 1, size):
            for place in range(column + 1, size):
                numerator = (
                    work[size * row + place] * pivot_value
                    - work[size * row + column] * work[size * column + place]
                )
                if numerator % divisor:
                    raise PreparedH1RootFailure(
                        "presentation determinant lost exactness"
                    )
                work[size * row + place] = numerator // divisor
            work[size * row + column] = 0
        divisor = pivot_value
    return sign * work[size * (size - 1) + size - 1]


def _regulator_envelope(
    envelope: Mapping[str, Any], expected_sha256: str
) -> Mapping[str, Any]:
    expected = _digest(expected_sha256, "regulator replay authority")
    if _sha256(envelope) != expected:
        raise PreparedH1RootFailure("regulator envelope lacks replay authority")
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise PreparedH1RootFailure("regulator envelope has the wrong fields")
    if envelope["schema"] != "sagejs.pari-class-group.regulator-acceptance-envelope.v1":
        raise PreparedH1RootFailure("unsupported regulator envelope")
    payload = envelope["payload"]
    if (
        not isinstance(payload, Mapping)
        or _sha256(payload) != envelope["payload_sha256"]
    ):
        raise PreparedH1RootFailure("regulator payload hash changed")
    if (
        payload.get("schema")
        != "sagejs.pari-class-group.regulator-acceptance-replay.v1"
    ):
        raise PreparedH1RootFailure("unsupported regulator payload")
    evidence = payload.get("evidence")
    assumptions = payload.get("assumptions")
    if not isinstance(evidence, Mapping) or not isinstance(assumptions, Mapping):
        raise PreparedH1RootFailure("regulator authority is incomplete")
    regulator = evidence.get("regulator")
    rigorous = assumptions.get("rigorous_local_replay")
    if (
        not isinstance(regulator, Mapping)
        or regulator.get("rigorous") is not True
        or regulator.get("full_rank_certified") is not True
        or rigorous
        != {
            "exact_unit_norms": True,
            "selected_lattice_full_rank": True,
            "weighted_log_regulator_enclosed": True,
            "packed_values_contained": True,
        }
    ):
        raise PreparedH1RootFailure("regulator was not independently replayed")
    return payload


def _rebuild_retry(
    resident: Mapping[str, Any],
    presentation: Mapping[str, Any],
    unit_authority: Mapping[str, Any],
) -> tuple[list[int], list[int], list[int]]:
    # `preparation_embedding` is row-major triples for [1, x, b_2] at the
    # three ordered real places.  The x entries are the resident roots.
    prepared = _integers(
        resident.get("preparation_embedding"), 27, "resident embedding"
    )
    roots = [prepared[start : start + 3] for start in (3, 12, 21)]
    resident_m = [entry[0] for entry in roots]
    resident_p = [entry[1] for entry in roots]
    resident_e = [entry[2] for entry in roots]
    matrix = [[0] * 9 for _ in range(3)]
    embedding_state = [0] * 4
    status = pari_cubic_embedding_precision_rebuild(
        resident_m,
        resident_p,
        resident_e,
        _RETRY_BITS,
        [0] * 6,
        [0] * 6,
        [0] * 6,
        matrix[0],
        matrix[1],
        matrix[2],
        embedding_state,
    )
    if status != 0 or embedding_state != [0, 3, 3, _RETRY_BITS]:
        raise PreparedH1RootFailure("neutral cubic embedding rebuild failed")

    generators = [
        value
        for relation in presentation["relations"]
        for value in _integers(relation["alpha"], 3, "principal generator")
    ]
    retained = unit_authority.get("retained_relation_provenance")
    if not isinstance(retained, Mapping) or retained.get("shape") != ["2", "73"]:
        raise PreparedH1RootFailure("unit provenance has the wrong shape")
    transform = _integers(
        retained.get("entries"), 2 * RELATION_COUNT, "unit relation transform"
    )
    atom_logs = [0] * (21 * RELATION_COUNT)
    transformed = [[0] * 42 for _ in range(3)]
    public = [777] * 42
    phases = [0] * 6
    state = [0] * 5
    status = pari_cubic_sunit_precision_rebuild(
        matrix[0],
        matrix[1],
        matrix[2],
        generators,
        transform,
        RELATION_COUNT,
        _RETRY_BITS,
        atom_logs,
        transformed[0],
        transformed[1],
        transformed[2],
        public,
        [0] * 6,
        phases,
        [0] * 3,
        [0] * 3,
        [0] * 512,
        [0] * 512,
        [0] * 512,
        [0] * 512,
        [0] * 128,
        [0] * 4,
        state,
    )
    if status != 0 or state != [0, RELATION_COUNT, 2, 2, _RETRY_BITS]:
        raise PreparedH1RootFailure("exact cubic S-unit precision rebuild failed")
    packed = [public[7 * entry + offset] for entry in range(6) for offset in (1, 2, 3)]
    return packed, phases, embedding_state


def _packed_log_agreement(actual: Sequence[int], expected: Sequence[int]) -> int:
    """Return the minimum shared leading bits after precision normalization.

    The regulator authority deliberately stores the earlier 192-bit accepted
    values, while this root recomputes the retry at 2176 bits.  Floating
    logarithm algorithms need not round identically at those two precisions.
    Exact unit coordinates bind both computations; this additional check
    rejects disagreement beyond 16 low-precision ulp bits.
    """
    shared = 10**9
    for offset in range(0, 18, 3):
        am, ap, ae = actual[offset : offset + 3]
        em, ep, ee = expected[offset : offset + 3]
        if ap < ep or ae != ee or ep < 64:
            raise PreparedH1RootFailure("packed log scales are incompatible")
        shift = ap - ep
        magnitude = abs(am)
        rounded = (magnitude + (1 << (shift - 1))) >> shift if shift else magnitude
        if am < 0:
            rounded = -rounded
        difference = abs(rounded - em)
        agreement = ep if difference == 0 else ep - difference.bit_length()
        if agreement < 176:
            raise PreparedH1RootFailure("rebuilt logs left regulator precision")
        shared = min(shared, agreement)
    return shared


def build_prepared_h1_no_oracle_root(
    resident_output: str | Path,
    unit_relation_authority: Mapping[str, Any],
    regulator_envelope: Mapping[str, Any],
    regulator_envelope_sha256: str,
) -> dict[str, Any]:
    """Build the connected prepared result without retry oracle inputs."""

    try:
        resident = _qualified_resident(resident_output)
        presentation = capture_presentation_authority(resident_output)
        presentation_summary = replay_presentation_authority(presentation)
        unit_summary = replay_unit_relation_authority(
            unit_relation_authority, presentation
        )
        regulator = _regulator_envelope(regulator_envelope, regulator_envelope_sha256)
        full_hnf = _integers(presentation["hnf"]["full_hnf"], 120, "active full HNF")
        hnf = full_hnf[8 * 7 :]
        if abs(_determinant(hnf, 8)) != 1:
            raise PreparedH1RootFailure("qualified presentation is not h = 1")
        packed_logs, phases, embedding_state = _rebuild_retry(
            resident, presentation, unit_relation_authority
        )
        inputs = regulator.get("inputs")
        evidence = regulator.get("evidence")
        if not isinstance(inputs, Mapping) or not isinstance(evidence, Mapping):
            raise PreparedH1RootFailure("regulator replay is malformed")
        resident_logs = inputs.get("resident")
        if not isinstance(resident_logs, Mapping):
            raise PreparedH1RootFailure("regulator packed logs are absent")
        expected_logs = _integers(
            resident_logs.get("packed_logs"), 18, "regulator packed logs"
        )
        common_log_bits = _packed_log_agreement(packed_logs, expected_logs)
        exact_units = unit_relation_authority.get("published_units_power_basis")
        if not isinstance(exact_units, Mapping) or exact_units.get("shape") != [
            "2",
            "3",
        ]:
            raise PreparedH1RootFailure("exact units have the wrong shape")
        units = _integers(exact_units.get("entries"), 6, "exact published units")
        regulator_units = [
            value
            for row in inputs.get("exact_units_power_coordinates", [])
            for value in _integers(row, 3, "regulator exact unit")
        ]
        if units != regulator_units:
            raise PreparedH1RootFailure("exact units changed regulator authority")

        polynomial = _integers(
            presentation["field"]["polynomial"], 4, "prepared polynomial"
        )
        torsion = derive_real_cubic_torsion(polynomial)
        torsion_authority = TorsionReplayAuthority(
            prepared_polynomial_sha256(polynomial), torsion.sha256
        )
        cold_replay_torsion(torsion, torsion_authority)
        torsion_payload = torsion.detached_payload()

        return {
            "schema": SCHEMA,
            "field": {
                "id": FIELD_ID,
                "polynomial_ascending": [str(value) for value in polynomial],
                "resident_sha256": RESIDENT_SHA256,
            },
            "source_authorities": {
                "presentation_sha256": _sha256(presentation),
                "unit_relation_sha256": _sha256(unit_relation_authority),
                "regulator_envelope_sha256": regulator_envelope_sha256,
                "torsion_sha256": torsion.sha256,
            },
            "class_group": {
                "class_number": "1",
                "invariant_factors": [],
                "generator_ideals": [],
                "presentation_rank": "8",
                "presentation_determinant_abs": "1",
                "presentation_active_sha256": presentation_summary["active_sha256"],
            },
            "unit_group_correspondence": {
                "rank": "2",
                "exact_units_power_basis": [
                    [str(value) for value in units[3 * row : 3 * (row + 1)]]
                    for row in range(2)
                ],
                "unit_norms": [str(value) for value in unit_summary["unit_norms"]],
                "retry_precision_bits": str(_RETRY_BITS),
                "rebuilt_packed_logs": [str(value) for value in packed_logs],
                "minimum_regulator_log_agreement_bits": str(common_log_bits),
                "cleanarch_phases": [str(value) for value in phases],
                "regulator": evidence["regulator"],
                "relation_product_linked": True,
                "independent_regulator_replayed": True,
                "unit_saturation_proved": False,
            },
            "torsion": torsion_payload["torsion"],
            "composition": {
                "boundary": "qualified-resident-plus-detached-authorities",
                "fixture_reads": False,
                "external_process_calls": False,
                "retry_embedding_input": False,
                "retry_log_input": False,
                "neutral_embedding_rebuilt": True,
                "embedding_state": [str(value) for value in embedding_state],
                "exact_relation_products_replayed": True,
            },
            "assumptions": {
                "pari_2_17_4_algorithmic_correspondence": True,
                "grh_and_pari_heuristic_bounds_assumed": True,
                "independent_unit_index_one": False,
            },
            "terminal": {
                "status": "prepared-h1-no-oracle-correspondence-complete",
                "internal_correspondence_complete": True,
                "public_class_unit_complete": False,
                "unit_saturation_certified": False,
                "missing_public_evidence": list(_PUBLIC_BLOCKERS),
            },
        }
    except PreparedH1RootFailure:
        raise
    except (ArithmeticError, IndexError, KeyError, TypeError, ValueError) as error:
        raise PreparedH1RootFailure("prepared h1 composition failed closed") from error


def seal_prepared_h1_no_oracle_root(
    payload: Mapping[str, Any],
) -> tuple[ImmutablePreparedH1Root, PreparedH1RootAuthority]:
    raw_payload = _canonical(payload)
    envelope = {
        "schema": ENVELOPE_SCHEMA,
        "payload": payload,
        "payload_sha256": hashlib.sha256(raw_payload).hexdigest(),
    }
    raw = _canonical(envelope)
    result = ImmutablePreparedH1Root(raw, hashlib.sha256(raw).hexdigest())
    return result, PreparedH1RootAuthority(result.sha256)


def cold_replay_prepared_h1_no_oracle_root(
    result: ImmutablePreparedH1Root | bytes | str,
    authority: PreparedH1RootAuthority,
    resident_output: str | Path,
    unit_relation_authority: Mapping[str, Any],
    regulator_envelope: Mapping[str, Any],
    regulator_envelope_sha256: str,
) -> ImmutablePreparedH1Root:
    """Recompute the complete internal payload from its source authorities."""

    if type(authority) is not PreparedH1RootAuthority:
        raise PreparedH1RootFailure("cold replay needs explicit result authority")
    raw = (
        result.canonical_json if isinstance(result, ImmutablePreparedH1Root) else result
    )
    envelope = _strict_loads(raw)
    if set(envelope) != {"schema", "payload", "payload_sha256"}:
        raise PreparedH1RootFailure("prepared h1 envelope has the wrong fields")
    if envelope["schema"] != ENVELOPE_SCHEMA:
        raise PreparedH1RootFailure("unsupported prepared h1 envelope")
    canonical = _canonical(envelope)
    digest = hashlib.sha256(canonical).hexdigest()
    if digest != authority.expected_sha256:
        raise PreparedH1RootFailure("prepared h1 envelope lacks authority")
    if _sha256(envelope["payload"]) != envelope["payload_sha256"]:
        raise PreparedH1RootFailure("prepared h1 payload hash changed")
    replayed = build_prepared_h1_no_oracle_root(
        resident_output,
        unit_relation_authority,
        regulator_envelope,
        regulator_envelope_sha256,
    )
    if _canonical(replayed) != _canonical(envelope["payload"]):
        raise PreparedH1RootFailure("prepared h1 cold replay changed the result")
    return ImmutablePreparedH1Root(canonical, digest)


class PreparedH1RootPublisher:
    """Transactional, idempotent publication of one immutable result."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._published: ImmutablePreparedH1Root | None = None

    def publish(
        self, payload: Mapping[str, Any]
    ) -> tuple[ImmutablePreparedH1Root, PreparedH1RootAuthority]:
        result, authority = seal_prepared_h1_no_oracle_root(payload)
        with self._lock:
            if self._published is None:
                self._published = result
            elif self._published != result:
                raise PreparedH1RootFailure("conflicting prepared h1 publication")
            return self._published, PreparedH1RootAuthority(self._published.sha256)


__all__ = [
    "ImmutablePreparedH1Root",
    "PreparedH1RootAuthority",
    "PreparedH1RootFailure",
    "PreparedH1RootPublisher",
    "build_prepared_h1_no_oracle_root",
    "cold_replay_prepared_h1_no_oracle_root",
    "seal_prepared_h1_no_oracle_root",
]
