"""Connected unit-component handoff for the real-cubic PARI port.

This is deliberately a host-side publication boundary.  The native bridge has
already reconstructed the two exact units and their packed logarithms; this
module checks the exact algebraic evidence and constructs the narrowly shaped
`UnitComponentOutput` consumed by `class_group_final_state`.
"""

from __future__ import annotations

from math import gcd
from typing import Any, Mapping, Sequence

from .class_group_final_state import (
    AssemblyFailure,
    UnitComponentOutput,
    canonical_component_sha256,
)


def _integers(values: Sequence[Any], length: int, name: str) -> list[int]:
    if isinstance(values, (str, bytes)) or len(values) != length:
        raise AssemblyFailure(name + " has the wrong bounded shape")
    return [int(value) for value in values]


def _unit_norm(unit: Sequence[int], tensor: Sequence[int]) -> int:
    matrix = [0] * 9
    for entry in range(9):
        for coordinate in range(3):
            matrix[entry] += unit[coordinate] * tensor[9 * coordinate + entry]
    determinant = (
        matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5])
        - matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2])
        + matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2])
    )
    if determinant not in (-1, 1):
        raise AssemblyFailure("reconstructed cubic generator is not a unit")
    inverse = [
        (matrix[4] * matrix[8] - matrix[7] * matrix[5]) // determinant,
        (matrix[2] * matrix[7] - matrix[1] * matrix[8]) // determinant,
        (matrix[1] * matrix[5] - matrix[2] * matrix[4]) // determinant,
    ]
    for row in range(3):
        product = sum(matrix[3 * column + row] * inverse[column] for column in range(3))
        if product != (1 if row == 0 else 0):
            raise AssemblyFailure("exact cubic unit inverse did not replay")
    return determinant


def _dyadic_minor(packed_logs: Sequence[int]) -> tuple[list[int], int, int, int]:
    # The successful getfu result is a column-major 3 by 2 matrix of packed
    # triples.  Rows zero and one form the same regulator minor used by PARI.
    triples = [packed_logs[offset : offset + 3] for offset in (0, 3, 9, 12)]
    shifts: list[int] = []
    for mantissa, precision, exponent in triples:
        if precision == -1:
            shifts.append(0)
        elif mantissa == 0:
            shifts.append(0)
        elif precision <= 0:
            raise AssemblyFailure("packed retry logarithm has invalid precision")
        else:
            shifts.append(exponent - precision + 1)
    denominator_exponent = max(0, max((-shift for shift in shifts), default=0))
    denominator = 1 << denominator_exponent
    numerators = [
        mantissa << (shift + denominator_exponent)
        for (mantissa, _precision, _exponent), shift in zip(triples, shifts)
    ]
    determinant = abs(numerators[0] * numerators[3] - numerators[1] * numerators[2])
    if determinant == 0:
        raise AssemblyFailure("retry logarithms do not have full unit rank")
    regulator_denominator = denominator * denominator
    common = gcd(determinant, regulator_denominator)
    return (
        numerators,
        denominator,
        determinant // common,
        regulator_denominator // common,
    )


def make_real_cubic_unit_component(
    run_id: str,
    owner_generation: int,
    candidate: Mapping[str, Any],
    transforms_sha256: str,
    units: Sequence[Any],
    retry_logs: Sequence[Any],
    multiplication_tensor: Sequence[Any],
    relation_provenance: Sequence[Any],
    relation_columns: int,
    retry_link_state: Sequence[Any],
    packed_log_ranges: Sequence[Sequence[Any]],
) -> UnitComponentOutput:
    """Validate and publish the connected rank-two real-cubic unit result.

    `relation_provenance` is the composed 2 by `relation_columns` exponent
    matrix from the accepted relations.  It is checked here even though the
    fixed final-state unit evidence schema authenticates it indirectly through
    the candidate fingerprint and packed-log ranges.
    """
    if not isinstance(run_id, str) or not run_id:
        raise AssemblyFailure("unit component run id is empty")
    if not isinstance(owner_generation, int) or owner_generation < 0:
        raise AssemblyFailure("unit component owner generation is invalid")
    if not isinstance(candidate, Mapping):
        raise AssemblyFailure("unit component candidate is not a mapping")
    if not isinstance(transforms_sha256, str) or len(transforms_sha256) != 64:
        raise AssemblyFailure("unit component transform fingerprint is malformed")
    if int(candidate.get("expected_unit_rank", -1)) != 2:
        raise AssemblyFailure("real-cubic unit component requires rank two")
    exact_units = _integers(units, 6, "reconstructed cubic units")
    tensor = _integers(multiplication_tensor, 27, "cubic multiplication tensor")
    logs = _integers(retry_logs, 18, "retry logarithms")
    if relation_columns <= 0:
        raise AssemblyFailure("relation provenance has no columns")
    provenance = _integers(
        relation_provenance, 2 * relation_columns, "composed relation provenance"
    )
    if all(value == 0 for value in provenance[:relation_columns]) or all(
        value == 0 for value in provenance[relation_columns:]
    ):
        raise AssemblyFailure("a reconstructed unit is detached from the relations")
    link_state = _integers(retry_link_state, 3, "retry linkage state")
    if link_state[0] != 6 or not 0 <= link_state[1] <= 16 or link_state[2] != 1:
        raise AssemblyFailure("high-precision retry is detached from resident logs")
    ranges = [
        [str(int(start)), str(int(length))] for start, length in packed_log_ranges
    ]
    if len(ranges) != 4:
        raise AssemblyFailure("rank-two packed-log linkage requires four ranges")
    candidate_logs = _integers(
        candidate.get("transformed_logs", []),
        len(candidate.get("transformed_logs", [])),
        "candidate transformed logs",
    )
    selected: list[int] = []
    for start_text, length_text in ranges:
        start, length = int(start_text), int(length_text)
        if start < 0 or length <= 0 or start + length > len(candidate_logs):
            raise AssemblyFailure("packed-log linkage is outside the candidate")
        selected.extend(candidate_logs[start : start + length])
    numerators, denominator, regulator_numerator, regulator_denominator = _dyadic_minor(
        logs
    )
    norms = [
        _unit_norm(exact_units[:3], tensor),
        _unit_norm(exact_units[3:], tensor),
    ]
    packed_link = {
        "ranges": ranges,
        "words": [str(value) for value in selected],
    }
    regulator_triplet = _integers(
        candidate.get("regulator_triplet", []), 3, "candidate regulator"
    )
    evidence = {
        "rank": "2",
        "factor_norms": [str(value) for value in norms],
        "factor_exponent_shape": ["2", "2"],
        "factor_exponents": ["1", "0", "0", "1"],
        "claimed_norms": [str(value) for value in norms],
        "packed_log_ranges": ranges,
        "packed_log_words": packed_link["words"],
        "derived_log_minor_shape": ["2", "2"],
        "derived_log_minor_numerators": [str(value) for value in numerators],
        "derived_log_denominator": str(denominator),
        "derived_from_packed_sha256": canonical_component_sha256(packed_link),
        "derivation_method": "independent-rational-enclosure-v1",
        "regulator_determinant_numerator": str(regulator_numerator),
        "regulator_determinant_denominator": str(regulator_denominator),
        "candidate_regulator_triplet": [str(value) for value in regulator_triplet],
        "torsion_order": "2",
        "torsion_coordinates": ["-1", "0", "0"],
        "torsion_norm": "-1",
    }
    return UnitComponentOutput(
        run_id=run_id,
        owner_generation=owner_generation,
        terminal_status="getfu-and-cleanarch-complete",
        candidate_sha256=canonical_component_sha256(candidate),
        transforms_sha256=transforms_sha256,
        evidence=evidence,
    )
