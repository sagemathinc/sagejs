"""Immutable compact-unit handoff for the PARI class-group experiment.

The matched flag-zero computation may discover units as products of retained
relation generators.  This module records that small exponent matrix and its
source transformations without multiplying the generators together.  Exact
materialization is a separate, explicitly requested replay operation against a
hash-authorized factor pool.

This is an upstream-assumed correspondence result.  It is not a rigorous unit
saturation certificate and must not be promoted to a completed public
`UnitGroupComputation`.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from collections.abc import Sequence as SequenceABC
from typing import Any, Mapping, Sequence


COMPACT_UNIT_SCHEMA = "sagejs.pari-class-group/compact-unit-result-v1"
FACTOR_POOL_SCHEMA = "sagejs.pari-class-group/relation-unit-factor-pool-v1"
_MAX_BYTES = 16 * 1024 * 1024
_MAX_FACTORS = 4096
_MAX_RANK = 64


class CompactUnitFailure(ValueError):
    """A compact result or its detached replay authority is inconsistent."""


@dataclass(frozen=True)
class CompactUnitAuthority:
    field_id: str
    run_id: str
    owner_generation: int
    factor_pool_sha256: str
    source_fixture_sha256: str
    source_trace_sha256: str
    assumptions: tuple[str, ...]
    expected_sha256: str | None = None


@dataclass(frozen=True)
class ImmutableCompactUnitResult:
    canonical_json: bytes
    sha256: str

    def detached_payload(self) -> dict[str, Any]:
        envelope = _strict_loads(self.canonical_json)
        return json.loads(_canonical(envelope["payload"]))


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
        raise CompactUnitFailure("compact unit state is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise CompactUnitFailure("compact unit state exceeds its byte limit")
    return raw


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise CompactUnitFailure("compact unit state exceeds its byte limit")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise CompactUnitFailure("duplicate compact-unit key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise CompactUnitFailure("compact unit state is not strict JSON") from error
    if not isinstance(value, dict):
        raise CompactUnitFailure("compact unit state must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _exact_keys(value: Any, keys: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise CompactUnitFailure(name + " has the wrong fields")
    return value


def _string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > 65536:
        raise CompactUnitFailure(name + " must be a nonempty bounded string")
    return value


def _digest(value: Any, name: str) -> str:
    text = _string(value, name)
    if len(text) != 64 or any(ch not in "0123456789abcdef" for ch in text):
        raise CompactUnitFailure(name + " must be a lowercase SHA-256 digest")
    return text


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise CompactUnitFailure(name + " must be an exact integer")
    if isinstance(value, str):
        if not value or len(value) > 65536:
            raise CompactUnitFailure(name + " must be a canonical decimal integer")
        try:
            answer = int(value)
        except (ValueError, OverflowError) as error:
            raise CompactUnitFailure(name + " must be an exact integer") from error
        if str(answer) != value:
            raise CompactUnitFailure(name + " must be a canonical decimal integer")
        return answer
    if isinstance(value, (float, bytes, bytearray)):
        raise CompactUnitFailure(name + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise CompactUnitFailure(name + " must be an exact integer") from error
    if answer != value:
        raise CompactUnitFailure(name + " must be an exact integer")
    return answer


def _integers(
    value: Any, name: str, length: int | None = None, limit: int = _MAX_FACTORS * 64
) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, SequenceABC)
        or len(value) > limit
        or (length is not None and len(value) != length)
    ):
        raise CompactUnitFailure(name + " has the wrong bounded shape")
    return [_integer(entry, name + " entry") for entry in value]


def _strings(value: Any, name: str, length: int | None = None) -> list[str]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, SequenceABC)
        or len(value) > _MAX_FACTORS
        or (length is not None and len(value) != length)
    ):
        raise CompactUnitFailure(name + " has the wrong bounded shape")
    answer = [_string(entry, name + " entry") for entry in value]
    if len(set(answer)) != len(answer):
        raise CompactUnitFailure(name + " entries must be unique")
    return answer


def _decimals(values: Sequence[int]) -> list[str]:
    return [str(value) for value in values]


def canonical_factor_pool_sha256(
    relation_ids: Sequence[str],
    coordinates: Sequence[Sequence[int]],
    norms: Sequence[int],
) -> str:
    """Hash an exact relation-factor pool without evaluating any unit product."""
    ids = _strings(relation_ids, "factor-pool relation ids")
    if len(ids) == 0 or len(coordinates) != len(ids) or len(norms) != len(ids):
        raise CompactUnitFailure("factor pool has inconsistent dimensions")
    degree: int | None = None
    canonical_coordinates: list[list[str]] = []
    for index, row in enumerate(coordinates):
        cells = _integers(row, f"factor-pool coordinate row {index}", limit=1024)
        if degree is None:
            degree = len(cells)
        if degree == 0 or len(cells) != degree:
            raise CompactUnitFailure("factor-pool coordinates are not rectangular")
        canonical_coordinates.append(_decimals(cells))
    canonical_norms = _integers(norms, "factor-pool norms", len(ids))
    if any(norm not in (-1, 1) for norm in canonical_norms):
        raise CompactUnitFailure("factor-pool norms must be unit signs")
    body = {
        "schema": FACTOR_POOL_SCHEMA,
        "relation_ids": ids,
        "coordinates": canonical_coordinates,
        "norms": _decimals(canonical_norms),
    }
    return _sha256(_canonical(body))


def _validate_payload(payload: Any, authority: CompactUnitAuthority) -> dict[str, Any]:
    value = _exact_keys(
        payload,
        {"source", "compact_units", "archimedean", "materialization", "terminal"},
        "compact-unit payload",
    )
    source = _exact_keys(
        value["source"],
        {
            "field_id",
            "run_id",
            "owner_generation",
            "pari_version",
            "source_fixture_sha256",
            "source_trace_sha256",
            "assumptions",
        },
        "compact-unit source",
    )
    if _string(source["field_id"], "field id") != authority.field_id:
        raise CompactUnitFailure("compact-unit field authority changed")
    if _string(source["run_id"], "run id") != authority.run_id:
        raise CompactUnitFailure("compact-unit run authority changed")
    generation = _integer(source["owner_generation"], "owner generation")
    if generation <= 0 or generation != authority.owner_generation:
        raise CompactUnitFailure("compact-unit owner generation changed")
    if source["pari_version"] != "2.17.4":
        raise CompactUnitFailure("compact-unit PARI version changed")
    if (
        _digest(source["source_fixture_sha256"], "source fixture hash")
        != authority.source_fixture_sha256
    ):
        raise CompactUnitFailure("compact-unit source fixture authority changed")
    if (
        _digest(source["source_trace_sha256"], "source trace hash")
        != authority.source_trace_sha256
    ):
        raise CompactUnitFailure("compact-unit source trace authority changed")
    assumptions = source["assumptions"]
    if (
        not isinstance(assumptions, list)
        or not assumptions
        or assumptions != sorted(set(assumptions))
    ):
        raise CompactUnitFailure("compact-unit assumptions are not canonical")
    for assumption in assumptions:
        _string(assumption, "compact-unit assumption")
    if tuple(assumptions) != authority.assumptions:
        raise CompactUnitFailure("compact-unit assumption authority changed")

    compact = _exact_keys(
        value["compact_units"],
        {
            "rank",
            "relation_ids",
            "factor_pool_sha256",
            "factor_norms",
            "unit_transform_shape",
            "unit_transform",
            "getfu_factor_shape",
            "getfu_factor",
            "exponent_shape",
            "exponents",
            "claimed_norms",
        },
        "compact units",
    )
    rank = _integer(compact["rank"], "unit rank")
    if rank <= 0 or rank > _MAX_RANK:
        raise CompactUnitFailure("unit rank exceeds the compact boundary")
    ids = _strings(compact["relation_ids"], "relation ids")
    factor_count = len(ids)
    if factor_count == 0:
        raise CompactUnitFailure("compact units need retained relation factors")
    if (
        _digest(compact["factor_pool_sha256"], "factor pool hash")
        != authority.factor_pool_sha256
    ):
        raise CompactUnitFailure("factor-pool authority changed")
    factor_norms = _integers(compact["factor_norms"], "factor norms", factor_count)
    if any(norm not in (-1, 1) for norm in factor_norms):
        raise CompactUnitFailure("factor norms must be unit signs")
    if _integers(compact["unit_transform_shape"], "unit transform shape", 2) != [
        factor_count,
        rank,
    ]:
        raise CompactUnitFailure("unit transform has the wrong shape")
    unit_transform = _integers(
        compact["unit_transform"], "unit transform", factor_count * rank
    )
    if _integers(compact["getfu_factor_shape"], "getfu factor shape", 2) != [
        rank,
        rank,
    ]:
        raise CompactUnitFailure("getfu factor has the wrong shape")
    getfu_factor = _integers(compact["getfu_factor"], "getfu factor", rank * rank)
    if (
        rank == 2
        and abs(getfu_factor[0] * getfu_factor[3] - getfu_factor[1] * getfu_factor[2])
        != 1
    ):
        raise CompactUnitFailure("rank-two getfu factor is not unimodular")
    if _integers(compact["exponent_shape"], "unit exponent shape", 2) != [
        rank,
        factor_count,
    ]:
        raise CompactUnitFailure("compact unit exponents have the wrong shape")
    exponents = _integers(compact["exponents"], "unit exponents", rank * factor_count)
    composed = [0] * (rank * factor_count)
    # Both source transforms are column-major.  The public exponent table is
    # row-major by unit so ordinary factored-element consumers can use it.
    for unit in range(rank):
        for factor in range(factor_count):
            total = 0
            for inner in range(rank):
                total += (
                    unit_transform[inner * factor_count + factor]
                    * getfu_factor[unit * rank + inner]
                )
            composed[unit * factor_count + factor] = total
    if exponents != composed:
        raise CompactUnitFailure(
            "compact exponents do not replay from source transforms"
        )
    claimed_norms = _integers(compact["claimed_norms"], "claimed unit norms", rank)
    for unit in range(rank):
        norm = 1
        for factor, factor_norm in enumerate(factor_norms):
            if factor_norm == -1 and exponents[unit * factor_count + factor] % 2:
                norm = -norm
        if claimed_norms[unit] != norm:
            raise CompactUnitFailure("compact unit norm does not replay")

    arch = _exact_keys(
        value["archimedean"],
        {"place_count", "log_shape", "packed_logs", "phases", "regulator_triplet"},
        "compact-unit archimedean evidence",
    )
    places = _integer(arch["place_count"], "archimedean place count")
    if places <= 0 or places > 64:
        raise CompactUnitFailure("archimedean place count is invalid")
    if _integers(arch["log_shape"], "unit log shape", 3) != [rank, places, 3]:
        raise CompactUnitFailure("unit logs have the wrong shape")
    logs = _integers(arch["packed_logs"], "packed unit logs", rank * places * 3)
    for index in range(0, len(logs), 3):
        precision = logs[index + 1]
        if precision < -1 or precision > 8192:
            raise CompactUnitFailure("packed unit log precision is invalid")
    phases = _integers(arch["phases"], "unit phases", rank * places)
    if any(phase not in (0, 1) for phase in phases):
        raise CompactUnitFailure("unit phases must encode zero or pi")
    regulator = _integers(arch["regulator_triplet"], "unit regulator", 3)
    if regulator[0] <= 0:
        raise CompactUnitFailure("unit regulator must be positive")

    materialization = _exact_keys(
        value["materialization"],
        {"status", "expanded_units", "policy"},
        "compact-unit materialization",
    )
    if materialization != {
        "status": "not-requested",
        "expanded_units": None,
        "policy": "separate-hash-authorized-replay",
    }:
        raise CompactUnitFailure("matched compact result eagerly materialized units")
    terminal = _exact_keys(
        value["terminal"],
        {
            "status",
            "correspondence_complete",
            "public_complete",
            "unit_saturation_certified",
        },
        "compact-unit terminal",
    )
    if terminal != {
        "status": "usable-compact-units-published",
        "correspondence_complete": True,
        "public_complete": False,
        "unit_saturation_certified": False,
    }:
        raise CompactUnitFailure("compact-unit terminal claims changed")
    return json.loads(_canonical(value))


def publish_compact_units(
    payload: Mapping[str, Any], authority: CompactUnitAuthority
) -> ImmutableCompactUnitResult:
    """Validate and detach one compact unit result transactionally."""
    detached = _validate_payload(json.loads(_canonical(dict(payload))), authority)
    payload_raw = _canonical(detached)
    envelope = {
        "schema": COMPACT_UNIT_SCHEMA,
        "payload": detached,
        "payload_sha256": _sha256(payload_raw),
    }
    encoded = _canonical(envelope)
    result = ImmutableCompactUnitResult(encoded, _sha256(encoded))
    if (
        authority.expected_sha256 is not None
        and result.sha256 != authority.expected_sha256
    ):
        raise CompactUnitFailure("compact-unit publication hash is not authorized")
    return result


def cold_replay_compact_units(
    raw: bytes | str | ImmutableCompactUnitResult,
    authority: CompactUnitAuthority,
) -> ImmutableCompactUnitResult:
    """Replay a detached compact result with no live relation owner."""
    if authority.expected_sha256 is None:
        raise CompactUnitFailure("cold replay requires a pinned result hash")
    encoded = raw.canonical_json if isinstance(raw, ImmutableCompactUnitResult) else raw
    envelope = _exact_keys(
        _strict_loads(encoded),
        {"schema", "payload", "payload_sha256"},
        "compact envelope",
    )
    if envelope["schema"] != COMPACT_UNIT_SCHEMA:
        raise CompactUnitFailure("wrong compact-unit schema")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise CompactUnitFailure("compact-unit payload hash changed")
    _validate_payload(envelope["payload"], authority)
    canonical = _canonical(envelope)
    digest = _sha256(canonical)
    if digest != authority.expected_sha256:
        raise CompactUnitFailure("compact-unit result hash is not authorized")
    return ImmutableCompactUnitResult(canonical, digest)


def _multiply_cubic(
    left: Sequence[int], right: Sequence[int], multiplication_basis: Sequence[int]
) -> tuple[int, int, int]:
    if len(left) != 3 or len(right) != 3 or len(multiplication_basis) != 27:
        raise CompactUnitFailure("cubic multiplication has the wrong shape")
    matrix = [0] * 9
    for basis in range(3):
        for index in range(9):
            matrix[index] += left[basis] * multiplication_basis[9 * basis + index]
    return (
        sum(matrix[3 * column] * right[column] for column in range(3)),
        sum(matrix[3 * column + 1] * right[column] for column in range(3)),
        sum(matrix[3 * column + 2] * right[column] for column in range(3)),
    )


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5])
        - matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2])
        + matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2])
    )


def _cubic_norm(element: Sequence[int], multiplication_basis: Sequence[int]) -> int:
    matrix = [0] * 9
    for basis in range(3):
        for index in range(9):
            matrix[index] += element[basis] * multiplication_basis[9 * basis + index]
    return _determinant3(matrix)


def _inverse_cubic_unit(
    element: Sequence[int], multiplication_basis: Sequence[int]
) -> tuple[int, int, int]:
    matrix = [0] * 9
    for basis in range(3):
        for index in range(9):
            matrix[index] += element[basis] * multiplication_basis[9 * basis + index]
    determinant = _determinant3(matrix)
    if determinant not in (-1, 1):
        raise CompactUnitFailure("compact factor is not an integral unit")
    # First column of M^{-1}, for column-major M.
    return (
        (matrix[4] * matrix[8] - matrix[7] * matrix[5]) // determinant,
        (matrix[2] * matrix[7] - matrix[1] * matrix[8]) // determinant,
        (matrix[1] * matrix[5] - matrix[2] * matrix[4]) // determinant,
    )


def _power_cubic_unit(
    element: Sequence[int], exponent: int, multiplication_basis: Sequence[int]
) -> tuple[int, int, int]:
    base = tuple(element)
    if exponent < 0:
        base = _inverse_cubic_unit(base, multiplication_basis)
        exponent = -exponent
    answer = (1, 0, 0)
    while exponent:
        if exponent & 1:
            answer = _multiply_cubic(answer, base, multiplication_basis)
        exponent >>= 1
        if exponent:
            base = _multiply_cubic(base, base, multiplication_basis)
    return answer


def materialize_cubic_compact_units(
    result: ImmutableCompactUnitResult,
    factor_pool: Mapping[str, Any],
    multiplication_basis: Sequence[int],
) -> tuple[tuple[int, int, int], ...]:
    """Explicitly expand the cubic units after the matched workload ends.

    The factor pool is separately authenticated.  Neither the compact result
    nor this function caches the expanded output, so publication stays compact
    and immutable.
    """
    payload = result.detached_payload()
    compact = payload["compact_units"]
    pool = _exact_keys(
        factor_pool,
        {"schema", "relation_ids", "coordinates", "norms"},
        "relation factor pool",
    )
    if pool["schema"] != FACTOR_POOL_SCHEMA:
        raise CompactUnitFailure("wrong relation factor-pool schema")
    ids = _strings(pool["relation_ids"], "factor-pool relation ids")
    if ids != compact["relation_ids"]:
        raise CompactUnitFailure("factor-pool relation identities changed")
    coordinates = [
        _integers(row, f"factor-pool coordinate row {index}", 3)
        for index, row in enumerate(pool["coordinates"])
    ]
    norms = _integers(pool["norms"], "factor-pool norms", len(ids))
    digest = canonical_factor_pool_sha256(ids, coordinates, norms)
    if digest != compact["factor_pool_sha256"]:
        raise CompactUnitFailure("relation factor pool does not match its authority")
    tensor = _integers(multiplication_basis, "cubic multiplication basis", 27)
    for factor, (coordinates_row, claimed_norm) in enumerate(zip(coordinates, norms)):
        if _cubic_norm(coordinates_row, tensor) != claimed_norm:
            raise CompactUnitFailure(f"factor {factor} norm does not replay")
    rank, factor_count = _integers(compact["exponent_shape"], "unit exponent shape", 2)
    exponents = _integers(compact["exponents"], "unit exponents", rank * factor_count)
    claimed_norms = _integers(compact["claimed_norms"], "claimed unit norms", rank)
    answer: list[tuple[int, int, int]] = []
    for unit in range(rank):
        value = (1, 0, 0)
        for factor in range(factor_count):
            exponent = exponents[unit * factor_count + factor]
            if exponent:
                value = _multiply_cubic(
                    value,
                    _power_cubic_unit(coordinates[factor], exponent, tensor),
                    tensor,
                )
        if _cubic_norm(value, tensor) != claimed_norms[unit]:
            raise CompactUnitFailure("materialized unit norm does not replay")
        answer.append(value)
    return tuple(answer)


__all__ = [
    "COMPACT_UNIT_SCHEMA",
    "FACTOR_POOL_SCHEMA",
    "CompactUnitAuthority",
    "CompactUnitFailure",
    "ImmutableCompactUnitResult",
    "canonical_factor_pool_sha256",
    "cold_replay_compact_units",
    "materialize_cubic_compact_units",
    "publish_compact_units",
]
