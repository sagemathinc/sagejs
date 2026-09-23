"""Bind genuine compact units into the authentic cubic h=1 success state.

This composer does not alter the shared final driver.  It cold-replays the
existing authentic success, derives the seven-factor pool from qualified
resident relation generators, and proves that the success payload's selected
2 by 7 provenance materializes its exact published units.  The resulting
immutable record retains only compact exponents and hashes; expansion remains
an explicit replay operation.
"""

from __future__ import annotations

from collections.abc import Mapping as MappingABC, Sequence as SequenceABC
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from .class_group_authentic_success import (
    AuthenticSuccessAuthority,
    AuthenticSuccessPublisher,
    CONNECTED_FIELD_ID,
    cold_replay_authentic_success,
)
from .compact_unit_resident_pool import (
    ImmutableResidentKernelPool,
    capture_resident_kernel_pool,
    replay_resident_kernel_pool,
)


SCHEMA = "sagejs.pari-class-group/authentic-compact-success-v1"
_MAX_BYTES = 16 * 1024 * 1024
_RANK = 2
_FACTORS = 7
_ACTIVE = 15
_RELATIONS = 73


class AuthenticCompactSuccessFailure(ValueError):
    """The authentic success and compact factor authorities do not compose."""


@dataclass(frozen=True)
class AuthenticCompactSuccessAuthority:
    expected_sha256: str


@dataclass(frozen=True)
class ImmutableAuthenticCompactSuccess:
    canonical_json: bytes
    sha256: str

    def detached_payload(self) -> dict[str, Any]:
        return json.loads(_canonical(_strict_loads(self.canonical_json)["payload"]))


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
        raise AuthenticCompactSuccessFailure(
            "composition is not canonical JSON"
        ) from error
    if len(answer) > _MAX_BYTES:
        raise AuthenticCompactSuccessFailure("composition exceeds its byte limit")
    return answer


def _strict_loads(raw: bytes | str) -> dict[str, Any]:
    if not isinstance(raw, (bytes, str)) or len(raw) > _MAX_BYTES:
        raise AuthenticCompactSuccessFailure("composition exceeds its byte limit")

    def no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        answer: dict[str, Any] = {}
        for key, value in pairs:
            if key in answer:
                raise AuthenticCompactSuccessFailure(
                    "duplicate composition key: " + key
                )
            answer[key] = value
        return answer

    try:
        value = json.loads(raw, object_pairs_hook=no_duplicates)
    except (TypeError, ValueError, UnicodeError) as error:
        raise AuthenticCompactSuccessFailure(
            "composition is not strict JSON"
        ) from error
    if not isinstance(value, dict):
        raise AuthenticCompactSuccessFailure("composition must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _exact_keys(value: Any, keys: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, MappingABC) or set(value) != keys:
        raise AuthenticCompactSuccessFailure(name + " has the wrong fields")
    return value


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise AuthenticCompactSuccessFailure(name + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise AuthenticCompactSuccessFailure(
            name + " must be an exact integer"
        ) from error
    if str(answer) != str(value):
        raise AuthenticCompactSuccessFailure(name + " is not canonical decimal")
    return answer


def _integers(value: Any, length: int, name: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, SequenceABC)
        or len(value) != length
    ):
        raise AuthenticCompactSuccessFailure(name + " has the wrong shape")
    return [_integer(entry, name + " entry") for entry in value]


def _multiply_cubic(
    left: Sequence[int], right: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int]:
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


def _inverse_cubic_unit(
    element: Sequence[int], tensor: Sequence[int]
) -> tuple[int, int, int]:
    matrix = [sum(element[k] * tensor[9 * k + i] for k in range(3)) for i in range(9)]
    determinant = _determinant3(matrix)
    if determinant not in (-1, 1):
        raise AuthenticCompactSuccessFailure("compact factor is not an integral unit")
    return (
        (matrix[4] * matrix[8] - matrix[7] * matrix[5]) // determinant,
        (matrix[2] * matrix[7] - matrix[1] * matrix[8]) // determinant,
        (matrix[1] * matrix[5] - matrix[2] * matrix[4]) // determinant,
    )


def _power_cubic_unit(
    element: Sequence[int], exponent: int, tensor: Sequence[int]
) -> tuple[int, int, int]:
    base = tuple(element)
    if exponent < 0:
        base = _inverse_cubic_unit(base, tensor)
        exponent = -exponent
    answer = (1, 0, 0)
    while exponent:
        if exponent & 1:
            answer = _multiply_cubic(answer, base, tensor)
        exponent >>= 1
        if exponent:
            base = _multiply_cubic(base, base, tensor)
    return answer


def _materialize(
    coordinates: Sequence[Sequence[int]],
    exponents: Sequence[int],
    tensor: Sequence[int],
) -> list[int]:
    answer: list[int] = []
    for unit in range(_RANK):
        value = (1, 0, 0)
        for factor in range(_FACTORS):
            exponent = exponents[_FACTORS * unit + factor]
            if exponent:
                value = _multiply_cubic(
                    value,
                    _power_cubic_unit(coordinates[factor], exponent, tensor),
                    tensor,
                )
        answer.extend(value)
    return answer


def _publish_success(payload: Mapping[str, Any]):
    try:
        result = AuthenticSuccessPublisher().publish(payload)
        return cold_replay_authentic_success(
            result, AuthenticSuccessAuthority(result.sha256)
        )
    except Exception as error:
        raise AuthenticCompactSuccessFailure(
            "authentic h1 success did not cold-replay"
        ) from error


def _derive_payload(
    success: Mapping[str, Any],
    success_sha256: str,
    resident_pool: ImmutableResidentKernelPool,
) -> dict[str, Any]:
    pool_payload = resident_pool.detached_payload()
    factor_pool = pool_payload["factor_pool"]
    relation_authority = success["authorities"]["relation_unit"]
    compact_exponents = _integers(
        relation_authority["unit_kernel_provenance"]["entries"],
        _RANK * _FACTORS,
        "selected compact provenance",
    )
    live_kernel = _integers(
        success["correspondence"]["hnf_kernel_basis"],
        _ACTIVE * _FACTORS,
        "live HNF kernel",
    )
    retained_map = _integers(
        relation_authority["active_to_retained_relations"]["entries"],
        _ACTIVE * _RELATIONS,
        "active-to-retained relation map",
    )
    expected_factor_map = [
        sum(
            live_kernel[_ACTIVE * factor + column]
            * retained_map[_RELATIONS * column + relation]
            for column in range(_ACTIVE)
        )
        for factor in range(_FACTORS)
        for relation in range(_RELATIONS)
    ]
    actual_factor_map = _integers(
        pool_payload["relation_provenance"]["exponents"],
        _FACTORS * _RELATIONS,
        "resident factor provenance",
    )
    if actual_factor_map != expected_factor_map:
        raise AuthenticCompactSuccessFailure(
            "resident factors are detached from the authentic HNF kernel"
        )
    coordinates = [
        _integers(row, 3, "resident kernel factor")
        for row in factor_pool["coordinates"]
    ]
    if len(coordinates) != _FACTORS:
        raise AuthenticCompactSuccessFailure("resident factor count changed")
    tensor = _integers(
        success["authorities"]["presentation"]["field"]["multiplication_table"],
        27,
        "integral multiplication table",
    )
    materialized = _materialize(coordinates, compact_exponents, tensor)
    expected_units = _integers(
        relation_authority["published_units_integral_basis"]["entries"],
        _RANK * 3,
        "published exact units",
    )
    if materialized != expected_units:
        raise AuthenticCompactSuccessFailure(
            "genuine compact factors do not materialize the published units"
        )
    factor_norms = _integers(factor_pool["norms"], _FACTORS, "factor norms")
    selected_norms = [
        -1
        if sum(
            (factor_norms[factor] == -1) * compact_exponents[_FACTORS * unit + factor]
            for factor in range(_FACTORS)
        )
        % 2
        else 1
        for unit in range(_RANK)
    ]
    regulator = success["authorities"]["regulator"]
    regulator_norms = _integers(
        regulator["envelope"]["payload"]["evidence"]["exact_unit_norms"],
        _RANK,
        "regulator exact unit norms",
    )
    if selected_norms != regulator_norms:
        raise AuthenticCompactSuccessFailure(
            "compact norm signs are detached from regulator authority"
        )
    unit_coordinate_sha256 = _sha256(
        _canonical(
            [
                [str(value) for value in materialized[3 * unit : 3 * (unit + 1)]]
                for unit in range(_RANK)
            ]
        )
    )
    regulator_coordinate_sha256 = regulator["envelope"]["payload"]["evidence"][
        "exact_unit_coordinate_sha256"
    ]
    power_units = _integers(
        relation_authority["published_units_power_basis"]["entries"],
        _RANK * 3,
        "published power-basis units",
    )
    power_coordinate_sha256 = _sha256(
        _canonical(
            [
                [str(value) for value in power_units[3 * unit : 3 * (unit + 1)]]
                for unit in range(_RANK)
            ]
        )
    )
    if power_coordinate_sha256 != regulator_coordinate_sha256:
        raise AuthenticCompactSuccessFailure(
            "compact units are detached from regulator coordinates"
        )
    return {
        "source": {
            "field_id": CONNECTED_FIELD_ID,
            "resident_sha256": success["source"]["resident_sha256"],
            "authentic_success_sha256": success_sha256,
            "resident_kernel_pool_sha256": resident_pool.sha256,
        },
        "class_group": {
            "class_number": success["candidate"]["class_number"],
            "invariant_factors": list(success["candidate"]["invariant_factors"]),
        },
        "compact_units": {
            "rank": str(_RANK),
            "factor_ids": list(factor_pool["relation_ids"]),
            "factor_pool_sha256": pool_payload["factor_pool_sha256"],
            "factor_norms": list(factor_pool["norms"]),
            "exponent_shape": [str(_RANK), str(_FACTORS)],
            "exponents": [str(value) for value in compact_exponents],
            "materialized_unit_shape": [str(_RANK), "3"],
            "materialized_unit_sha256": unit_coordinate_sha256,
            "materialization": "separate-qualified-resident-replay",
            "expanded_units": None,
        },
        "authority_links": {
            "presentation_resident_sha256": success["authorities"]["presentation"][
                "source"
            ]["resident_sha256"],
            "relation_unit_source": dict(relation_authority["source"]),
            "regulator_sha256": regulator["sha256"],
            "regulator_power_unit_sha256": regulator_coordinate_sha256,
        },
        "terminal": {
            "status": "authentic-h1-success-with-genuine-compact-units",
            "phase5_complete": False,
            "public_complete": False,
            "unit_saturation_certified": False,
            "answer_derived_factor_pool": False,
            "expanded_inside_matched_workload": False,
            "internal_unverified_requirements": list(
                success["terminal"]["internal_unverified_requirements"]
            ),
            "public_unverified_requirements": list(
                success["terminal"]["public_unverified_requirements"]
            ),
        },
    }


def compose_authentic_compact_success(
    success_payload: Mapping[str, Any], resident_output: str | Path
) -> ImmutableAuthenticCompactSuccess:
    """Publish the compact tier bound to one authentic h=1 success."""
    success_result = _publish_success(success_payload)
    resident_pool = capture_resident_kernel_pool(resident_output)
    replay_resident_kernel_pool(resident_pool, resident_output)
    detached_success = success_result.detached_payload()
    payload = _derive_payload(detached_success, success_result.sha256, resident_pool)
    payload_raw = _canonical(payload)
    envelope = {
        "schema": SCHEMA,
        "payload": payload,
        "payload_sha256": _sha256(payload_raw),
    }
    raw = _canonical(envelope)
    return ImmutableAuthenticCompactSuccess(raw, _sha256(raw))


def cold_replay_authentic_compact_success(
    raw: bytes | str | ImmutableAuthenticCompactSuccess,
    authority: AuthenticCompactSuccessAuthority,
    success_payload: Mapping[str, Any],
    resident_output: str | Path,
) -> ImmutableAuthenticCompactSuccess:
    """Replay all source bindings and require the retained publication hash."""
    encoded = (
        raw.canonical_json if isinstance(raw, ImmutableAuthenticCompactSuccess) else raw
    )
    envelope = _exact_keys(
        _strict_loads(encoded),
        {"schema", "payload", "payload_sha256"},
        "composition envelope",
    )
    if envelope["schema"] != SCHEMA:
        raise AuthenticCompactSuccessFailure("composition schema changed")
    payload_raw = _canonical(envelope["payload"])
    if envelope["payload_sha256"] != _sha256(payload_raw):
        raise AuthenticCompactSuccessFailure("composition payload hash changed")
    try:
        expected = compose_authentic_compact_success(success_payload, resident_output)
    except AuthenticCompactSuccessFailure:
        raise
    except Exception as error:
        raise AuthenticCompactSuccessFailure(
            "composition source authority did not replay"
        ) from error
    if envelope["payload"] != expected.detached_payload():
        raise AuthenticCompactSuccessFailure("composition no longer replays")
    canonical = _canonical(envelope)
    digest = _sha256(canonical)
    if digest != authority.expected_sha256:
        raise AuthenticCompactSuccessFailure(
            "composition publication is not authorized"
        )
    return ImmutableAuthenticCompactSuccess(canonical, digest)


__all__ = [
    "AuthenticCompactSuccessAuthority",
    "AuthenticCompactSuccessFailure",
    "ImmutableAuthenticCompactSuccess",
    "SCHEMA",
    "cold_replay_authentic_compact_success",
    "compose_authentic_compact_success",
]
