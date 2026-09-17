"""Exact presentation authority for the authentic real-cubic computation.

This module turns the resident collector output into detached mathematical
evidence.  It does not call PARI.  Replay reconstructs every factor-base ideal
from its prime descriptor, checks every retained principal relation, reruns the
translated relation-HNF pipeline, and authenticates the active 8-by-15
presentation input and its trailing 8-by-8 HNF.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from .hnfspec_complete import pari_hnfspec_complete
from .prime_ideal_hnf import pari_prime_ideal_hnf
from .relation_hnf_witness import pari_relation_hnf_witness
from .signed_prime_ideal_reduction import (
    pari_cubic_ideal_hnf_multiply,
    pari_cubic_mul_matrix,
)


SCHEMA = "sagejs.pari-class-group/presentation-authority-v1"
FIELD_ID = "x^3-20018*x+20034"
RESIDENT_SHA256 = "a705f625bf6f47a25b62dd3ff8485abf1c8af5ec0f12d15ee5cbb89cf6195e0b"
DEGREE = 3
FACTOR_BASE_SIZE = 66
RELATION_COUNT = 73
ACTIVE_ROWS = 8
ACTIVE_COLUMNS = 15
LOG_ROWS = 3
SUBFACTOR_COUNT = 4
_MAX_BYTES = 4 * 1024 * 1024


class PresentationAuthorityFailure(ValueError):
    """Detached exact presentation evidence failed closed."""


def _integers(value: Any, length: int, name: str) -> list[int]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise PresentationAuthorityFailure(name + " must be an integer sequence")
    if len(value) != length:
        raise PresentationAuthorityFailure(name + " has the wrong length")
    answer: list[int] = []
    for entry in value:
        if isinstance(entry, bool):
            raise PresentationAuthorityFailure(name + " contains a boolean")
        try:
            integer = int(entry)
        except (TypeError, ValueError, OverflowError) as error:
            raise PresentationAuthorityFailure(
                name + " contains a non-integer"
            ) from error
        if str(integer) != str(entry):
            raise PresentationAuthorityFailure(
                name + " contains a noncanonical integer"
            )
        answer.append(integer)
    return answer


def _decimal(values: Sequence[int]) -> list[str]:
    return [str(value) for value in values]


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
        raise PresentationAuthorityFailure("authority is not canonical JSON") from error
    if len(raw) > _MAX_BYTES:
        raise PresentationAuthorityFailure("authority exceeds its byte bound")
    return raw


def _sha256(value: Any) -> str:
    return hashlib.sha256(_canonical(value)).hexdigest()


def _determinant3(matrix: Sequence[int]) -> int:
    return (
        matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
        - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
        + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6])
    )


def _adjugate3(matrix: Sequence[int]) -> list[int]:
    return [
        matrix[4] * matrix[8] - matrix[5] * matrix[7],
        matrix[2] * matrix[7] - matrix[1] * matrix[8],
        matrix[1] * matrix[5] - matrix[2] * matrix[4],
        matrix[5] * matrix[6] - matrix[3] * matrix[8],
        matrix[0] * matrix[8] - matrix[2] * matrix[6],
        matrix[2] * matrix[3] - matrix[0] * matrix[5],
        matrix[3] * matrix[7] - matrix[4] * matrix[6],
        matrix[1] * matrix[6] - matrix[0] * matrix[7],
        matrix[0] * matrix[4] - matrix[1] * matrix[3],
    ]


def _matrix3_product(left: Sequence[int], right: Sequence[int]) -> list[int]:
    return [
        sum(left[3 * row + k] * right[3 * k + column] for k in range(3))
        for row in range(3)
        for column in range(3)
    ]


def _same_integral_lattice(left: Sequence[int], right: Sequence[int]) -> bool:
    """Test equality of two full-rank column lattices over `ZZ`."""
    determinant = _determinant3(left)
    if determinant == 0 or abs(determinant) != abs(_determinant3(right)):
        return False
    numerator = _matrix3_product(_adjugate3(left), right)
    return all(entry % determinant == 0 for entry in numerator)


def _multiply_ideals(
    left: Sequence[int], right: Sequence[int], multiplication_table: Sequence[int]
) -> list[int]:
    generators = [0] * 27
    hnf_input = [0] * 18
    hnf_work = [0] * 30
    hnf_triangular = [0] * 12
    hnf_moduli = [0] * 3
    intermediate = [0] * 9
    output = [0] * 9
    pari_cubic_ideal_hnf_multiply(
        list(left),
        list(right),
        list(multiplication_table),
        generators,
        hnf_input,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        intermediate,
        output,
    )
    return output


def _replay_relation_hnf(
    original: Sequence[int],
    initial_permutation: Sequence[int],
    logs: Sequence[int],
) -> tuple[list[int], list[int], list[int], list[int], list[int], list[int]]:
    rows = FACTOR_BASE_SIZE
    columns = RELATION_COUNT
    size = rows * columns
    log_size = 7 * LOG_ROWS * columns
    zeros = lambda length: [0] * length
    matbnew = zeros(size)
    assembly_state = zeros(6)
    full_h = zeros(size)
    hnf_transform = zeros(columns * columns)
    final_state = zeros(7)
    state = zeros(9)
    transformed_workspace = zeros(log_size)
    result_c = zeros(log_size)
    status = pari_hnfspec_complete(
        list(original),
        rows,
        columns,
        list(initial_permutation),
        SUBFACTOR_COUNT,
        list(logs),
        LOG_ROWS,
        zeros(size),
        zeros(SUBFACTOR_COUNT * columns),
        zeros(columns * columns),
        zeros(columns),
        zeros(1),
        zeros(13),
        zeros((rows - SUBFACTOR_COUNT) * columns),
        zeros(SUBFACTOR_COUNT * columns),
        zeros(size),
        zeros(10),
        zeros(size),
        zeros(columns),
        zeros(rows),
        zeros(rows),
        zeros(rows + 1),
        zeros(10),
        zeros(rows),
        matbnew,
        zeros(size),
        zeros(size),
        assembly_state,
        transformed_workspace,
        full_h,
        hnf_transform,
        zeros(columns * columns),
        zeros(columns + 1),
        zeros(11),
        zeros(size),
        zeros(size),
        zeros(log_size),
        zeros(rows),
        zeros(size),
        zeros(size),
        zeros(rows * (columns + rows)),
        result_c,
        final_state,
        state,
        zeros(160000),
        zeros(32),
        zeros(8),
        zeros(8),
    )
    if status != 0 or assembly_state != [8, 0, 15, 8, 58, 0]:
        raise PresentationAuthorityFailure(
            "relation-HNF replay did not reach the active cut"
        )
    return (
        matbnew[:120],
        full_h[:120],
        hnf_transform[:225],
        result_c,
        final_state,
        state,
    )


def capture_presentation_authority(resident_output: str | Path) -> dict[str, Any]:
    """Capture all exact inputs needed for replay from the qualified artifact."""
    raw = Path(resident_output).read_bytes()
    if hashlib.sha256(raw).hexdigest() != RESIDENT_SHA256:
        raise PresentationAuthorityFailure("resident artifact is not qualified")
    try:
        resident = json.loads(raw)
    except (TypeError, ValueError, UnicodeError) as error:
        raise PresentationAuthorityFailure("resident artifact is not JSON") from error
    if resident.get("prep_base_state", [None] * 3)[2] != "66":
        raise PresentationAuthorityFailure("resident factor-base size changed")
    if resident.get("relation_state", [None])[0] != "73":
        raise PresentationAuthorityFailure("resident relation count changed")

    table = _integers(resident["basis_table"], 27, "multiplication table")
    selected = _integers(
        resident["prep_selected_indices"][:FACTOR_BASE_SIZE],
        FACTOR_BASE_SIZE,
        "selected catalog indices",
    )
    catalog_count = len(resident["prep_kummer_catalog_primes"])
    catalog_primes = _integers(
        resident["prep_kummer_catalog_primes"], catalog_count, "catalog primes"
    )
    catalog_f = _integers(resident["prep_kummer_catalog_f"], catalog_count, "catalog f")
    catalog_inert = _integers(
        resident["prep_kummer_catalog_inert"], catalog_count, "catalog inert flags"
    )
    catalog_generators = _integers(
        resident["prep_kummer_catalog_generators"],
        DEGREE * catalog_count,
        "catalog generators",
    )
    packet_ideals = _integers(
        resident["packet_ideals"][: FACTOR_BASE_SIZE * 9],
        FACTOR_BASE_SIZE * 9,
        "factor-base HNFs",
    )
    packet_norms = _integers(
        resident["packet_norms"][:FACTOR_BASE_SIZE],
        FACTOR_BASE_SIZE,
        "factor-base norms",
    )
    relation_primes = _integers(
        resident["relation_primes"][:FACTOR_BASE_SIZE],
        FACTOR_BASE_SIZE,
        "factor-base rational primes",
    )
    factors: list[dict[str, Any]] = []
    for position, index in enumerate(selected):
        if index < 0 or index >= catalog_count:
            raise PresentationAuthorityFailure("selected catalog index is out of range")
        prime = catalog_primes[index]
        if relation_primes[position] != prime:
            raise PresentationAuthorityFailure(
                "factor-base order is detached from catalog order"
            )
        factors.append(
            {
                "id": str(position + 1),
                "prime": str(prime),
                "f": str(catalog_f[index]),
                "inert": str(catalog_inert[index]),
                "generator": _decimal(
                    catalog_generators[DEGREE * index : DEGREE * (index + 1)]
                ),
                "hnf": _decimal(packet_ideals[9 * position : 9 * (position + 1)]),
                "norm": str(packet_norms[position]),
            }
        )

    relation_records = _integers(
        resident["relation_records"][: FACTOR_BASE_SIZE * RELATION_COUNT],
        FACTOR_BASE_SIZE * RELATION_COUNT,
        "relation records",
    )
    generators = _integers(
        resident["generators"][: DEGREE * RELATION_COUNT],
        DEGREE * RELATION_COUNT,
        "principal generators",
    )
    metadata = _integers(
        resident["relation_metadata"][: 3 * RELATION_COUNT],
        3 * RELATION_COUNT,
        "relation metadata",
    )
    for column in range(RELATION_COUNT):
        if metadata[3 * column] != column + 1:
            raise PresentationAuthorityFailure(
                "principal generator is detached from its relation row"
            )
    relations = [
        {
            "id": str(column + 1),
            "exponents": _decimal(
                relation_records[
                    FACTOR_BASE_SIZE * column : FACTOR_BASE_SIZE * (column + 1)
                ]
            ),
            "alpha": _decimal(generators[DEGREE * column : DEGREE * (column + 1)]),
        }
        for column in range(RELATION_COUNT)
    ]
    log_size = 7 * LOG_ROWS * RELATION_COUNT
    payload = {
        "schema": SCHEMA,
        "field": {
            "id": FIELD_ID,
            "polynomial": _decimal(
                _integers(resident["prep_polynomial"], 4, "field polynomial")
            ),
            "multiplication_table": _decimal(table),
        },
        "factor_base": factors,
        "relations": relations,
        "hnf": {
            "initial_permutation": _decimal(
                _integers(
                    resident["search_ideals"][:FACTOR_BASE_SIZE],
                    FACTOR_BASE_SIZE,
                    "initial HNF permutation",
                )
            ),
            "logs": _decimal(
                _integers(
                    resident["log_embeddings"][:log_size], log_size, "relation logs"
                )
            ),
            "active_relation": _decimal(
                _integers(resident["hnf_matbnew"][:120], 120, "active relation matrix")
            ),
            "full_hnf": _decimal(
                _integers(resident["hnf_full_h"][:120], 120, "active full HNF")
            ),
            "transform": _decimal(
                _integers(
                    resident["hnf_hnf_transform"][:225], 225, "active HNF transform"
                )
            ),
            "transformed_logs": _decimal(
                _integers(
                    resident["hnf_result_c"][:log_size],
                    log_size,
                    "transformed relation logs",
                )
            ),
        },
        "source": {"resident_sha256": RESIDENT_SHA256},
    }
    replay_presentation_authority(payload)
    return payload


def _replay_presentation_authority_unchecked(
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Replay detached factor-base, principal-relation, and HNF evidence."""
    if not isinstance(payload, Mapping) or set(payload) != {
        "schema",
        "field",
        "factor_base",
        "relations",
        "hnf",
        "source",
    }:
        raise PresentationAuthorityFailure("authority has the wrong top-level fields")
    if payload["schema"] != SCHEMA or payload["source"] != {
        "resident_sha256": RESIDENT_SHA256
    }:
        raise PresentationAuthorityFailure("authority identity changed")
    field = payload["field"]
    if not isinstance(field, Mapping) or set(field) != {
        "id",
        "polynomial",
        "multiplication_table",
    }:
        raise PresentationAuthorityFailure("field authority has the wrong fields")
    if field["id"] != FIELD_ID or _integers(field["polynomial"], 4, "polynomial") != [
        20034,
        -20018,
        0,
        1,
    ]:
        raise PresentationAuthorityFailure("field identity changed")
    table = _integers(field["multiplication_table"], 27, "multiplication table")

    factor_records = payload["factor_base"]
    if not isinstance(factor_records, list) or len(factor_records) != FACTOR_BASE_SIZE:
        raise PresentationAuthorityFailure("factor base has the wrong size")
    factor_ideals: list[list[int]] = []
    for position, record in enumerate(factor_records):
        required = {"id", "prime", "f", "inert", "generator", "hnf", "norm"}
        if not isinstance(record, Mapping) or set(record) != required:
            raise PresentationAuthorityFailure("factor descriptor has the wrong fields")
        if record["id"] != str(position + 1):
            raise PresentationAuthorityFailure("factor descriptor order changed")
        prime, f, inert, norm = _integers(
            [record["prime"], record["f"], record["inert"], record["norm"]],
            4,
            "factor scalars",
        )
        generator = _integers(record["generator"], 3, "factor generator")
        expected = _integers(record["hnf"], 9, "factor HNF")
        output = [0] * 9
        pari_prime_ideal_hnf(
            table,
            generator,
            3,
            prime,
            inert,
            [0] * 9,
            [0] * 9,
            [0] * 3,
            output,
        )
        if output != expected or norm != prime**f:
            raise PresentationAuthorityFailure(
                "factor descriptor does not reconstruct its ideal"
            )
        factor_ideals.append(output)

    relation_records = payload["relations"]
    if (
        not isinstance(relation_records, list)
        or len(relation_records) != RELATION_COUNT
    ):
        raise PresentationAuthorityFailure("relation authority has the wrong size")
    original: list[int] = []
    identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    for column, record in enumerate(relation_records):
        if not isinstance(record, Mapping) or set(record) != {
            "id",
            "exponents",
            "alpha",
        }:
            raise PresentationAuthorityFailure("relation witness has the wrong fields")
        if record["id"] != str(column + 1):
            raise PresentationAuthorityFailure("relation witness order changed")
        exponents = _integers(
            record["exponents"], FACTOR_BASE_SIZE, "relation exponents"
        )
        if any(exponent < 0 or exponent > 8 for exponent in exponents):
            raise PresentationAuthorityFailure(
                "relation exponent is outside the captured domain"
            )
        alpha = _integers(record["alpha"], 3, "principal generator")
        product = identity
        for factor, exponent in zip(factor_ideals, exponents):
            for _ in range(exponent):
                product = _multiply_ideals(product, factor, table)
        principal = [0] * 9
        pari_cubic_mul_matrix(table, alpha, principal)
        if not _same_integral_lattice(principal, product):
            raise PresentationAuthorityFailure(
                "principal relation failed at column " + str(column + 1)
            )
        original.extend(exponents)

    hnf = payload["hnf"]
    if not isinstance(hnf, Mapping) or set(hnf) != {
        "initial_permutation",
        "logs",
        "active_relation",
        "full_hnf",
        "transform",
        "transformed_logs",
    }:
        raise PresentationAuthorityFailure("HNF authority has the wrong fields")
    permutation = _integers(
        hnf["initial_permutation"], FACTOR_BASE_SIZE, "initial permutation"
    )
    logs = _integers(hnf["logs"], 7 * LOG_ROWS * RELATION_COUNT, "relation logs")
    active = _integers(hnf["active_relation"], 120, "active relation matrix")
    full_hnf = _integers(hnf["full_hnf"], 120, "active full HNF")
    transform = _integers(hnf["transform"], 225, "active HNF transform")
    transformed_logs = _integers(
        hnf["transformed_logs"], 7 * LOG_ROWS * RELATION_COUNT, "transformed logs"
    )
    (
        replayed_active,
        replayed_hnf,
        replayed_transform,
        replayed_logs,
        final_state,
        state,
    ) = _replay_relation_hnf(original, permutation, logs)
    if (replayed_active, replayed_hnf, replayed_transform, replayed_logs) != (
        active,
        full_hnf,
        transform,
        transformed_logs,
    ):
        raise PresentationAuthorityFailure(
            "active presentation is detached from relation replay"
        )

    inverse = [0] * 225
    augmented = [0] * 450
    inverse_state = [0] * 5
    r2p = [0] * 120
    p2r = [0] * 120
    witness_state = [0] * 8
    if (
        pari_relation_hnf_witness(
            active,
            ACTIVE_ROWS,
            ACTIVE_COLUMNS,
            full_hnf,
            transform,
            inverse,
            augmented,
            inverse_state,
            r2p,
            p2r,
            witness_state,
        )
        != 0
    ):
        raise PresentationAuthorityFailure("active relation-to-HNF witness rejected")
    summary = {
        "schema": SCHEMA,
        "field": FIELD_ID,
        "factor_base_size": FACTOR_BASE_SIZE,
        "principal_relations": RELATION_COUNT,
        "active_shape": [ACTIVE_ROWS, ACTIVE_COLUMNS],
        "presentation_shape": [ACTIVE_ROWS, ACTIVE_ROWS],
        "factor_base_sha256": _sha256(factor_records),
        "relations_sha256": _sha256(relation_records),
        "active_sha256": _sha256(hnf),
        "witness_state": witness_state,
        "hnf_final_state": final_state,
        "hnf_state": state,
    }
    return summary


def replay_presentation_authority(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Replay detached evidence and normalize every malformed-input failure."""
    try:
        return _replay_presentation_authority_unchecked(payload)
    except PresentationAuthorityFailure:
        raise
    except (IndexError, KeyError, TypeError, ValueError, ZeroDivisionError) as error:
        raise PresentationAuthorityFailure(
            "presentation replay rejected malformed evidence"
        ) from error


__all__ = [
    "FIELD_ID",
    "RESIDENT_SHA256",
    "SCHEMA",
    "PresentationAuthorityFailure",
    "capture_presentation_authority",
    "replay_presentation_authority",
]
