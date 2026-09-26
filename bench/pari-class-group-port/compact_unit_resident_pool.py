"""Resident-derived factor authority for the authentic cubic compact units.

The seven factors used by `getfu` are kernel products of principal relation
generators.  They are not independent answers: their exponent vectors are the
composition of the collector cleanup transform and the active HNF transform.
This module reconstructs that composition from the qualified resident run and
expands it only at an explicit replay boundary.

The matched flag-zero workload continues to publish only the small exponent
matrix in :mod:`compact_unit_result`.  Calling
`capture_resident_kernel_pool` is deliberately outside that workload: it
performs potentially large exact products to construct a separately hashed
factor pool suitable for materialization.
"""

from __future__ import annotations

from collections.abc import Mapping as MappingABC, Sequence as SequenceABC
from dataclasses import dataclass
from fractions import Fraction
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from .compact_unit_result import (
    FACTOR_POOL_SCHEMA,
    ImmutableCompactUnitResult,
    canonical_factor_pool_sha256,
    materialize_cubic_compact_units,
)
from .presentation_authority import (
    FIELD_ID,
    RESIDENT_SHA256,
    capture_presentation_authority,
    replay_presentation_authority,
)


SCHEMA = "sagejs.pari-class-group/resident-kernel-factor-pool-v1"
DEGREE = 3
RELATIONS = 73
ACTIVE_COLUMNS = 15
KERNEL_COLUMNS = 7
_MAX_BYTES = 16 * 1024 * 1024


class ResidentKernelPoolFailure(ValueError):
    """Resident unit factors or their exact provenance are inconsistent."""


@dataclass(frozen=True)
class ImmutableResidentKernelPool:
    canonical_json: bytes
    sha256: str

    def detached_payload(self) -> dict[str, Any]:
        envelope = _strict_loads(self.canonical_json)
        return json.loads(_canonical(envelope["payload"]))

    def detached_factor_pool(self) -> dict[str, Any]:
        return dict(self.detached_payload()["factor_pool"])


def _canonical(value: Any) -> bytes:
    try:
        answer = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        ).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as error:
        raise ResidentKernelPoolFailure("kernel pool is not canonical JSON") from error
    if len(answer) > _MAX_BYTES:
        raise ResidentKernelPoolFailure("kernel pool exceeds its byte limit")
    return answer


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise ResidentKernelPoolFailure("kernel pool exceeds its byte limit")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise ResidentKernelPoolFailure("duplicate kernel-pool key: " + key)
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise ResidentKernelPoolFailure("kernel pool is not strict JSON") from error
    if not isinstance(value, dict):
        raise ResidentKernelPoolFailure("kernel pool must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _exact_keys(value: Any, keys: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, MappingABC) or set(value) != keys:
        raise ResidentKernelPoolFailure(name + " has the wrong fields")
    return value


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise ResidentKernelPoolFailure(name + " must be an exact integer")
    if isinstance(value, str):
        if not value or len(value) > 65536:
            raise ResidentKernelPoolFailure(name + " is not a bounded integer")
        try:
            answer = int(value)
        except (ValueError, OverflowError) as error:
            raise ResidentKernelPoolFailure(
                name + " must be an exact integer"
            ) from error
        if str(answer) != value:
            raise ResidentKernelPoolFailure(name + " is not canonical decimal")
        return answer
    if isinstance(value, (bytes, bytearray, float)):
        raise ResidentKernelPoolFailure(name + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise ResidentKernelPoolFailure(name + " must be an exact integer") from error
    if answer != value:
        raise ResidentKernelPoolFailure(name + " must be an exact integer")
    return answer


def _integers(value: Any, length: int, name: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, SequenceABC)
        or len(value) != length
    ):
        raise ResidentKernelPoolFailure(name + " has the wrong shape")
    return [_integer(entry, name + " entry") for entry in value]


def _digest(values: Sequence[int]) -> str:
    return _sha256(_canonical([str(value) for value in values]))


def _multiply_cubic(
    left: Sequence[Any], right: Sequence[Any], tensor: Sequence[int]
) -> tuple[Any, Any, Any]:
    matrix = [sum(left[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)]
    return tuple(
        sum(matrix[3 * column + row] * right[column] for column in range(3))
        for row in range(3)
    )


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5])
        - matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2])
        + matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2])
    )


def _norm_cubic(element: Sequence[int], tensor: Sequence[int]) -> int:
    matrix = [sum(element[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)]
    return _determinant3(matrix)


def _power_cubic(
    element: Sequence[int], exponent: int, tensor: Sequence[int]
) -> tuple[int, int, int]:
    answer = (1, 0, 0)
    base = tuple(element)
    while exponent:
        if exponent & 1:
            answer = _multiply_cubic(answer, base, tensor)
        exponent >>= 1
        if exponent:
            base = _multiply_cubic(base, base, tensor)
    return answer


def _divide_cubic_exact(
    numerator: Sequence[int], denominator: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int]:
    matrix = [
        sum(denominator[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)
    ]
    determinant = _determinant3(matrix)
    if determinant == 0:
        raise ResidentKernelPoolFailure("relation generator product is zero")
    inverse = (
        Fraction(matrix[4] * matrix[8] - matrix[7] * matrix[5], determinant),
        Fraction(matrix[2] * matrix[7] - matrix[1] * matrix[8], determinant),
        Fraction(matrix[1] * matrix[5] - matrix[2] * matrix[4], determinant),
    )
    quotient = _multiply_cubic(numerator, inverse, tensor)
    if any(value.denominator != 1 for value in quotient):
        raise ResidentKernelPoolFailure("kernel product is not integral")
    return tuple(int(value) for value in quotient)


def _relation_product(
    generators: Sequence[Sequence[int]], exponents: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int]:
    positive = (1, 0, 0)
    negative = (1, 0, 0)
    for generator, exponent in zip(generators, exponents):
        if exponent > 0:
            positive = _multiply_cubic(
                positive, _power_cubic(generator, exponent, tensor), tensor
            )
        elif exponent < 0:
            negative = _multiply_cubic(
                negative, _power_cubic(generator, -exponent, tensor), tensor
            )
    return _divide_cubic_exact(positive, negative, tensor)


def _resident_context(resident_output: str | Path) -> dict[str, Any]:
    raw = Path(resident_output).read_bytes()
    if _sha256(raw) != RESIDENT_SHA256:
        raise ResidentKernelPoolFailure("resident artifact is not qualified")
    try:
        resident = json.loads(raw)
    except (TypeError, ValueError, UnicodeError) as error:
        raise ResidentKernelPoolFailure("resident artifact is not JSON") from error
    presentation = capture_presentation_authority(resident_output)
    replay_presentation_authority(presentation)
    cleanup = _integers(
        resident.get("hnf_transform", [])[: RELATIONS * RELATIONS],
        RELATIONS * RELATIONS,
        "cleanup transform",
    )
    active = _integers(
        presentation["hnf"]["transform"],
        ACTIVE_COLUMNS * ACTIVE_COLUMNS,
        "active HNF transform",
    )
    tensor = _integers(
        presentation["field"]["multiplication_table"], DEGREE**3, "field tensor"
    )
    generators = [
        _integers(relation["alpha"], DEGREE, "principal relation generator")
        for relation in presentation["relations"]
    ]
    if len(generators) != RELATIONS:
        raise ResidentKernelPoolFailure("principal relation count changed")
    relation_matrix = _integers(
        presentation["hnf"]["active_relation"], 8 * ACTIVE_COLUMNS, "active relation"
    )
    for kernel in range(KERNEL_COLUMNS):
        for row in range(8):
            if sum(
                relation_matrix[8 * column + row]
                * active[ACTIVE_COLUMNS * kernel + column]
                for column in range(ACTIVE_COLUMNS)
            ):
                raise ResidentKernelPoolFailure(
                    "active HNF column is not in the kernel"
                )
    return {
        "presentation": presentation,
        "cleanup": cleanup,
        "active": active,
        "tensor": tensor,
        "generators": generators,
    }


def _derive_payload(context: Mapping[str, Any]) -> dict[str, Any]:
    cleanup = context["cleanup"]
    active = context["active"]
    tensor = context["tensor"]
    generators = context["generators"]
    exponents: list[int] = []
    coordinates: list[tuple[int, int, int]] = []
    norms: list[int] = []
    for kernel in range(KERNEL_COLUMNS):
        row = [
            sum(
                active[ACTIVE_COLUMNS * kernel + column]
                * cleanup[RELATIONS * column + relation]
                for column in range(ACTIVE_COLUMNS)
            )
            for relation in range(RELATIONS)
        ]
        exponents.extend(row)
        factor = _relation_product(generators, row, tensor)
        norm = _norm_cubic(factor, tensor)
        if norm not in (-1, 1):
            raise ResidentKernelPoolFailure("derived kernel factor is not a unit")
        coordinates.append(factor)
        norms.append(norm)
    ids = [f"hnf-kernel-{index + 1}" for index in range(KERNEL_COLUMNS)]
    factor_pool = {
        "schema": FACTOR_POOL_SCHEMA,
        "relation_ids": ids,
        "coordinates": [[str(value) for value in factor] for factor in coordinates],
        "norms": [str(norm) for norm in norms],
    }
    factor_pool_sha256 = canonical_factor_pool_sha256(ids, coordinates, norms)
    return {
        "source": {
            "field_id": FIELD_ID,
            "resident_sha256": RESIDENT_SHA256,
            "cleanup_transform_sha256": _digest(cleanup),
            "active_hnf_transform_sha256": _digest(active),
            "principal_generators_sha256": _sha256(
                _canonical([[str(value) for value in row] for row in generators])
            ),
        },
        "relation_provenance": {
            "orientation": "factor-by-original-relation",
            "shape": [str(KERNEL_COLUMNS), str(RELATIONS)],
            "exponents": [str(value) for value in exponents],
        },
        "factor_pool": factor_pool,
        "factor_pool_sha256": factor_pool_sha256,
        "terminal": {
            "status": "resident-derived-kernel-factor-pool",
            "answer_derived": False,
            "expanded_inside_matched_workload": False,
        },
    }


def _validate_payload(payload: Any, context: Mapping[str, Any]) -> dict[str, Any]:
    value = _exact_keys(
        payload,
        {
            "source",
            "relation_provenance",
            "factor_pool",
            "factor_pool_sha256",
            "terminal",
        },
        "kernel-pool payload",
    )
    expected = _derive_payload(context)
    if value != expected:
        raise ResidentKernelPoolFailure(
            "kernel pool does not replay from resident presentation authority"
        )
    return dict(value)


def capture_resident_kernel_pool(
    resident_output: str | Path,
) -> ImmutableResidentKernelPool:
    """Construct the genuine seven-factor pool outside the matched workload."""
    context = _resident_context(resident_output)
    payload = _derive_payload(context)
    _validate_payload(payload, context)
    payload_raw = _canonical(payload)
    envelope = {
        "schema": SCHEMA,
        "payload": payload,
        "payload_sha256": _sha256(payload_raw),
    }
    canonical = _canonical(envelope)
    return ImmutableResidentKernelPool(canonical, _sha256(canonical))


def replay_resident_kernel_pool(
    raw: bytes | str | ImmutableResidentKernelPool,
    resident_output: str | Path,
) -> ImmutableResidentKernelPool:
    """Replay a detached pool against the qualified resident computation."""
    encoded = (
        raw.canonical_json if isinstance(raw, ImmutableResidentKernelPool) else raw
    )
    envelope = _exact_keys(
        _strict_loads(encoded),
        {"schema", "payload", "payload_sha256"},
        "kernel-pool envelope",
    )
    if envelope["schema"] != SCHEMA:
        raise ResidentKernelPoolFailure("wrong resident kernel-pool schema")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise ResidentKernelPoolFailure("kernel-pool payload hash changed")
    _validate_payload(envelope["payload"], _resident_context(resident_output))
    canonical = _canonical(envelope)
    return ImmutableResidentKernelPool(canonical, _sha256(canonical))


def materialize_resident_compact_units(
    result: ImmutableCompactUnitResult,
    resident_output: str | Path,
) -> tuple[tuple[int, int, int], ...]:
    """Expand compact units solely from qualified resident authority.

    This deliberately performs the expensive kernel-factor reconstruction
    after compact publication.  No answer-derived factor coordinates or
    caller-supplied multiplication table enter the replay.
    """
    context = _resident_context(resident_output)
    payload = _derive_payload(context)
    _validate_payload(payload, context)
    return materialize_cubic_compact_units(
        result, payload["factor_pool"], context["tensor"]
    )


__all__ = [
    "ImmutableResidentKernelPool",
    "ResidentKernelPoolFailure",
    "SCHEMA",
    "capture_resident_kernel_pool",
    "materialize_resident_compact_units",
    "replay_resident_kernel_pool",
]
