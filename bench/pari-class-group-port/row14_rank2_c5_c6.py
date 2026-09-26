"""Authenticated row-14 rank-two C5/C6 suffix.

This ordinary Python boundary consumes the live seven-column logarithm owner
and the accepted regulator/lattice receipt. It retains the compact C5
arithmetic when mixed-quartic `getfu` returns `LARGE`; neither authenticated
factored units nor exact expanded units are published on that branch.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from .field3_mixed_unit_suffix import (
    pari_cleanarchunit_mixed_quartic,
    pari_field3_prepare_getfu,
)
from .getfu_mixed_quartic import pari_getfu_mixed_quartic
from .log_matrix_transform import pari_log_matrix_transform
from .unit_lattice_reduction import (
    pari_unit_compose_rank_two,
    pari_unit_integer_lattice_rank_two,
    pari_unit_real_lattice_rank_two,
)
from .unit_lattice_selection import pari_unit_lattice_selection


OUTPUT_SCHEMA = "sagejs.pari-class-group/row14-rank2-c5-c6-v1"
ACCEPTED_SCHEMA = "sagejs.pari-class-group/row14-accepted-relation-owner-v1"
ACCEPTED_SHA256 = "9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65"
METADATA_SHA256 = "cca3c14630fc91a407a052bbc7fb2799b5e95bce79f1948fc422ca39cda07684"
UNIT_COLUMNS = 7
PLACES = 3
PRECISION = 192
POISON = 31337


class Row14Rank2Failure(ValueError):
    """The row-14 compact unit suffix failed closed."""


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise Row14Rank2Failure(label + " is not an object")
    return value


def _integers(value: Any, length: int, label: str) -> list[int]:
    if (
        isinstance(value, (str, bytes))
        or not isinstance(value, Sequence)
        or len(value) != length
    ):
        raise Row14Rank2Failure(label + " has the wrong shape")
    result: list[int] = []
    for entry in value:
        if isinstance(entry, bool) or not isinstance(entry, (str, int)):
            raise Row14Rank2Failure(label + " is not integer data")
        number = int(entry)
        if str(number) != str(entry):
            raise Row14Rank2Failure(label + " is not canonical integer data")
        result.append(number)
    return result


def _sha256_cells(values: Sequence[int]) -> str:
    return hashlib.sha256(
        "\n".join(str(value) for value in values).encode()
    ).hexdigest()


def _sha256_json(values: Sequence[int]) -> str:
    return hashlib.sha256(
        json.dumps([str(value) for value in values], separators=(",", ":")).encode()
    ).hexdigest()


def _zeros(length: int) -> list[int]:
    return [0] * length


def _floats(length: int) -> list[float]:
    return [0.0] * length


def _rank2_real_factor(transformed: list[int]) -> tuple[int, list[int]]:
    triples = _zeros(18)
    for row in range(PLACES):
        for column in range(2):
            source = 7 * (column * PLACES + row) + 1
            target = 3 * (row * 2 + column)
            triples[target : target + 3] = transformed[source : source + 3]
    factor = _zeros(4)
    status = pari_unit_real_lattice_rank_two(
        triples,
        PLACES,
        _zeros(6),
        factor,
        _zeros(3),
        _zeros(6),
        _zeros(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(4),
        _zeros(4),
        _floats(2),
        _zeros(2),
        _floats(6),
        _floats(4),
        _zeros(2),
        _zeros(3),
        _zeros(3),
        _floats(3),
        _floats(3),
        _floats(3),
        _zeros(3),
        _zeros(2),
    )
    return status, factor


def _real_lattice(logs: list[int], transform: list[int]) -> tuple[int, list[int]]:
    transformed = _zeros(42)
    pari_log_matrix_transform(
        logs, transform, PLACES, UNIT_COLUMNS, 2, False, transformed
    )
    return _rank2_real_factor(transformed)


def _c5(
    packed_a: list[int], lattice: list[int], regulator: list[int]
) -> dict[str, Any]:
    selected = _zeros(UNIT_COLUMNS)
    selection_state = _zeros(7)
    selection_status = pari_unit_lattice_selection(
        lattice,
        2,
        UNIT_COLUMNS,
        selected,
        selection_state,
        _zeros(2 * UNIT_COLUMNS),
        _zeros(2 * UNIT_COLUMNS),
        _zeros(2),
        _zeros(2 * UNIT_COLUMNS),
        _zeros(2 * UNIT_COLUMNS),
        _zeros(2 * UNIT_COLUMNS),
        _zeros(2),
        _zeros(UNIT_COLUMNS),
        _zeros(15),
    )
    if selection_status != 0 or selection_state[:2] != [0, 0]:
        raise Row14Rank2Failure("seven-column unit lattice selection failed")
    square = UNIT_COLUMNS * UNIT_COLUMNS
    u1 = _zeros(2 * UNIT_COLUMNS)
    integer_state = _zeros(5)
    integer_status = pari_unit_integer_lattice_rank_two(
        lattice,
        UNIT_COLUMNS,
        u1,
        integer_state,
        _zeros(2 * UNIT_COLUMNS),
        _zeros(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(square),
        _zeros(square),
        _floats(UNIT_COLUMNS),
        _zeros(UNIT_COLUMNS),
        _floats(2 * UNIT_COLUMNS),
        _floats(square),
        _zeros(UNIT_COLUMNS),
        _zeros(UNIT_COLUMNS),
        _zeros(UNIT_COLUMNS),
        _floats(UNIT_COLUMNS),
        _floats(UNIT_COLUMNS),
        _floats(UNIT_COLUMNS),
        _zeros(UNIT_COLUMNS),
    )
    if integer_status != 0:
        raise Row14Rank2Failure("seven-column integer unit reduction failed")
    real_status, u2 = _real_lattice(packed_a, u1)
    determinant_u2 = u2[0] * u2[3] - u2[1] * u2[2]
    if real_status != 0 or abs(determinant_u2) != 1:
        raise Row14Rank2Failure("first real unit reduction failed")
    composed = _zeros(2 * UNIT_COLUMNS)
    pari_unit_compose_rank_two(u1, UNIT_COLUMNS, u2, composed)
    au = _zeros(42)
    pari_log_matrix_transform(packed_a, composed, PLACES, UNIT_COLUMNS, 2, False, au)
    clean = _zeros(42)
    clean_state = _zeros(6)
    clean_status = pari_cleanarchunit_mixed_quartic(
        au,
        regulator,
        PRECISION,
        _zeros(3),
        _zeros(1024),
        _zeros(1024),
        _zeros(1024),
        _zeros(1024),
        _zeros(2048),
        _zeros(42),
        clean,
        clean_state,
    )
    if clean_status != 0:
        raise Row14Rank2Failure("row-14 cleanarch failed: " + str(clean_state))
    identity = [1, 0, 0, 1]
    matep, arch, candidate = _zeros(42), _zeros(42), _zeros(42)
    pari_field3_prepare_getfu(
        clean,
        identity,
        matep,
        arch,
        candidate,
        _zeros(18),
        _zeros(18),
        _zeros(18),
        _zeros(18),
    )
    factor_status, factor = _rank2_real_factor(matep)
    if factor_status != 0:
        raise Row14Rank2Failure("getfu real unit reduction failed")
    factor[1], factor[2] = factor[2], factor[1]
    determinant_factor = factor[0] * factor[3] - factor[1] * factor[2]
    if abs(determinant_factor) != 1:
        raise Row14Rank2Failure("getfu factor is not unimodular")
    arch_real, arch_imag, clean_real, clean_imag = (_zeros(18) for _ in range(4))
    pari_field3_prepare_getfu(
        clean,
        factor,
        matep,
        arch,
        candidate,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    return {
        "u1": u1,
        "u2": u2,
        "u": composed,
        "a": clean,
        "factor": factor,
        "candidateA": candidate,
        "archReal": arch_real,
        "archImag": arch_imag,
        "cleanReal": clean_real,
        "cleanImag": clean_imag,
        "state": [
            selection_status,
            integer_status,
            real_status,
            determinant_u2,
            clean_status,
            *clean_state,
            factor_status,
            determinant_factor,
        ],
    }


def _embedding(prepared: Mapping[str, Any]) -> tuple[list[int], list[int]]:
    source = _integers(prepared.get("preparation_embedding"), 48, "prepared embedding")
    real, imaginary = _zeros(36), _zeros(36)
    for basis in range(4):
        for place in range(3):
            source_row = place
            source_at = 3 * (4 * source_row + basis)
            target = 3 * (4 * basis + place)
            real[target : target + 3] = source[source_at : source_at + 3]
            if place == 2:
                imaginary_at = 3 * (4 * 3 + basis)
                imaginary[target : target + 3] = source[imaginary_at : imaginary_at + 3]
            else:
                imaginary[target : target + 3] = [0, -1, 0]
    return real, imaginary


def _c6(c5: Mapping[str, Any], prepared: Mapping[str, Any]) -> dict[str, Any]:
    embedding_real, embedding_imag = _embedding(prepared)
    tensor = _integers(prepared.get("basis_table"), 64, "multiplication tensor")
    poison8, poison_real, poison_imag, poison4 = (
        [POISON] * 8,
        [POISON] * 18,
        [POISON] * 18,
        [POISON] * 4,
    )
    state = _zeros(8)
    work = {
        "exp_real": _zeros(18),
        "exp_imag": _zeros(18),
        "split_matrix": _zeros(48),
        "split_rhs": _zeros(24),
        "solve_work": _zeros(48),
        "solve_rhs": _zeros(24),
        "solved": _zeros(24),
        "rounded": _zeros(8),
        "multiplication": _zeros(16),
        "inverse": _zeros(4),
        "candidate_units": _zeros(8),
        "normalized_factor": _zeros(4),
    }
    status = pari_getfu_mixed_quartic(
        list(c5["archReal"]),
        list(c5["archImag"]),
        list(c5["cleanReal"]),
        list(c5["cleanImag"]),
        list(c5["factor"]),
        embedding_real,
        embedding_imag,
        tensor,
        PRECISION,
        work["exp_real"],
        work["exp_imag"],
        work["split_matrix"],
        work["split_rhs"],
        work["solve_work"],
        work["solve_rhs"],
        work["solved"],
        work["rounded"],
        work["multiplication"],
        work["inverse"],
        work["candidate_units"],
        work["normalized_factor"],
        poison8,
        poison_real,
        poison_imag,
        poison4,
        state,
        _zeros(4),
        _zeros(3),
        _zeros(3),
        _zeros(512),
        _zeros(512),
        _zeros(512),
        _zeros(512),
        _zeros(91),
    )
    if status != 2 or state != [2, 38, 0, 0, 0, 0, 0, 1]:
        raise Row14Rank2Failure("row-14 getfu did not return LARGE: " + str(state))
    if (
        poison8 != [POISON] * 8
        or poison_real != [POISON] * 18
        or poison_imag != [POISON] * 18
        or poison4 != [POISON] * 4
    ):
        raise Row14Rank2Failure("LARGE getfu published an expanded output")
    return {
        "status": status,
        "state": state,
        "embeddingReal": embedding_real,
        "embeddingImag": embedding_imag,
        "tensor": tensor,
        **work,
    }


def compose_row14_rank2_c5_c6(
    accepted: Mapping[str, Any],
    post806: Mapping[str, Any],
    metadata_receipt: Mapping[str, Any],
    ancestry: Mapping[str, Any],
) -> dict[str, Any]:
    """Compute the compact row-14 unit suffix without W0 runtime input."""
    accepted = _mapping(accepted, "accepted owner")
    post806 = _mapping(post806, "post806 output")
    metadata_receipt = _mapping(metadata_receipt, "metadata receipt")
    if accepted.get("schema") != ACCEPTED_SCHEMA:
        raise Row14Rank2Failure("wrong accepted owner schema")
    if post806.get("ownerSha256") != ACCEPTED_SHA256 or post806.get("status") != 0:
        raise Row14Rank2Failure("post806 output is detached from the accepted owner")
    if post806.get("metadataSha256") != METADATA_SHA256:
        raise Row14Rank2Failure("post806 metadata identity changed")
    if post806.get("terminalState") != [0, 0, 7, 0, 2, 806, 0, 0, 2, 0]:
        raise Row14Rank2Failure("post806 terminal state changed")
    metadata = _mapping(metadata_receipt.get("metadata"), "metadata")
    if metadata_receipt.get("metadataSha256") != METADATA_SHA256:
        raise Row14Rank2Failure("wrong row-14 metadata receipt")
    final = _mapping(accepted.get("final"), "accepted final state")
    packed_a = _integers(final.get("c"), 16926, "accepted C")[:147]
    lattice = _integers(post806.get("unitRelations"), 14, "unit relations")
    regulator = _integers(post806.get("regulator"), 3, "regulator")
    if post806.get("unitRelationsSha256") != _sha256_json(lattice):
        raise Row14Rank2Failure("unit relation digest changed")
    ancestry = _mapping(ancestry, "ancestry")
    if ancestry.get("acceptedOwnerSha256") != ACCEPTED_SHA256:
        raise Row14Rank2Failure("unit suffix has the wrong accepted ancestry")
    if ancestry.get("metadataSha256") != METADATA_SHA256:
        raise Row14Rank2Failure("unit suffix has the wrong metadata ancestry")
    post_arithmetic = {
        "ownerSha256": post806.get("ownerSha256"),
        "metadataSha256": post806.get("metadataSha256"),
        "regulator": post806.get("regulator"),
        "unitRelations": [str(value) for value in lattice],
        "unitRelationsSha256": post806.get("unitRelationsSha256"),
        "terminalState": post806.get("terminalState"),
    }
    expected_post_digest = hashlib.sha256(
        json.dumps(post_arithmetic, separators=(",", ":")).encode()
    ).hexdigest()
    if ancestry.get("post806ArithmeticSha256") != expected_post_digest:
        raise Row14Rank2Failure("post806 arithmetic ancestry changed")
    source_digest = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    if ancestry.get("sourceSha256") != source_digest:
        raise Row14Rank2Failure("unit suffix source ancestry changed")
    c5 = _c5(packed_a, lattice, regulator)
    c6 = _c6(c5, _mapping(metadata.get("prepared"), "prepared metadata"))
    compact = {
        "unitTransformShape": [7, 2],
        "unitTransform": [str(x) for x in c5["u"]],
        "archimedeanUnitShape": [3, 2],
        "archimedeanUnits": [str(x) for x in c5["a"]],
        "getfuFactorShape": [2, 2],
        "getfuFactor": [str(x) for x in c5["factor"]],
        "getfuCandidateA": [str(x) for x in c5["candidateA"]],
        "relationLatticeShape": [7, 2],
        "relationLattice": [str(x) for x in lattice],
        "regulator": [str(x) for x in regulator],
    }
    return {
        "schema": OUTPUT_SCHEMA,
        "field": {
            "polynomial": list(accepted.get("field", {}).get("polynomial", [])),
            "degree": 4,
            "signature": [2, 1],
            "unitRank": 2,
        },
        "precision": PRECISION,
        "status": "not_given",
        "reason": "LARGE",
        "materialization": "not_given(LARGE)",
        "matchedFlagZero": True,
        "exactUnitsPublished": False,
        "compactFactoredUnitsRetained": False,
        "correspondenceComplete": False,
        "compact": compact,
        "c5State": c5["state"],
        "c6State": c6["state"],
        "traceSha256": {
            name: _sha256_cells(c6[name])
            for name in ("solved", "rounded", "candidate_units")
        },
        "ancestry": dict(ancestry),
        "provenance": {
            "frozenW0RuntimeInput": False,
            "postcomputeDifferentialOnly": True,
        },
    }


__all__ = ["OUTPUT_SCHEMA", "Row14Rank2Failure", "compose_row14_rank2_c5_c6"]
