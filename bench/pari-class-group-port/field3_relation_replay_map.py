"""Exact relation replay and class-coordinate map for the live field-3 quartic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This module is deliberately an ordinary-Python exact materialization tier.  It
consumes the retained owners from the accepted PARI-shaped relation run; the
48 streaming fingerprints are never used as mathematical evidence.  The
large 301-by-288 source matrix is reduced to its canonical row-HNF before the
general `RelationPresentation` constructor is invoked.  This keeps the
presentation below the campaign's memory ceiling without changing its row
lattice.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


ROWS = 288
COLUMNS = 301
DEGREE = 4


class Field3RelationReplayError(ArithmeticError):
    """The exact retained relation material failed replay."""


def _integers(owner: Mapping[str, Any], name: str, length: int) -> tuple[int, ...]:
    value = owner.get(name)
    if not isinstance(value, list) or len(value) != length:
        raise Field3RelationReplayError(name + " has the wrong logical length")
    answer: list[int] = []
    for entry in value:
        if (
            not isinstance(entry, str)
            or not entry
            or (entry[0] == "-" and not entry[1:].isdigit())
            or (entry[0] != "-" and not entry.isdigit())
        ):
            raise Field3RelationReplayError(name + " is not canonical decimal data")
        answer.append(int(entry))
    return tuple(answer)


def _determinant4(matrix: Sequence[int]) -> int:
    if len(matrix) != 16:
        raise Field3RelationReplayError("a quartic lattice has the wrong shape")
    answer = 0
    for column in range(4):
        minor: list[int] = []
        for row in range(1, 4):
            for other in range(4):
                if other != column:
                    minor.append(int(matrix[4 * row + other]))
        value = (
            minor[0] * (minor[4] * minor[8] - minor[5] * minor[7])
            - minor[1] * (minor[3] * minor[8] - minor[5] * minor[6])
            + minor[2] * (minor[3] * minor[7] - minor[4] * minor[6])
        )
        answer += (-1 if column & 1 else 1) * int(matrix[column]) * value
    return answer


def _quartic_hnf(matrix: Sequence[int]) -> tuple[int, ...]:
    """Return the canonical column HNF of one full-rank quartic lattice."""
    from .quartic_signed_genback import pari_quartic_composite_hnf

    source = [int(value) for value in matrix]
    determinant = abs(_determinant4(source))
    if determinant == 0:
        raise Field3RelationReplayError("a quartic lattice is singular")
    output = [0] * 16
    pari_quartic_composite_hnf(
        source,
        4,
        determinant,
        [0] * 52,
        [0] * 20,
        [0] * 4,
        output,
    )
    return tuple(output)


def _quartic_product(
    left: Sequence[int], right: Sequence[int], table: Sequence[int]
) -> tuple[int, ...]:
    from .quartic_signed_genback import pari_quartic_ideal_hnf_multiply

    output = [0] * 16
    pari_quartic_ideal_hnf_multiply(
        list(left),
        list(right),
        list(table),
        [0] * 64,
        [0] * 32,
        [0] * 52,
        [0] * 20,
        [0] * 4,
        [0] * 16,
        output,
    )
    return tuple(output)


def _principal_hnf(element: Sequence[int], table: Sequence[int]) -> tuple[int, ...]:
    from .quartic_signed_genback import pari_quartic_mul_matrix

    if len(element) != DEGREE:
        raise Field3RelationReplayError("a principal generator has the wrong degree")
    matrix = [0] * 16
    pari_quartic_mul_matrix(list(table), list(element), matrix)
    return _quartic_hnf(matrix)


def _rows(records: Sequence[int]) -> tuple[tuple[int, ...], ...]:
    return tuple(
        tuple(int(value) for value in records[ROWS * column : ROWS * (column + 1)])
        for column in range(COLUMNS)
    )


def replay_field3_principal_relations(
    owners: Mapping[str, Any],
    basis_table: Sequence[Any],
    *,
    verify_principal_relations: bool = True,
) -> dict[str, Any]:
    """Replay all 301 principal relations against all 288 exact ideal HNFs."""
    table = tuple(int(value) for value in basis_table)
    if len(table) != DEGREE**3:
        raise Field3RelationReplayError("the integral-basis table has the wrong shape")
    records = _integers(owners, "relationRecords", ROWS * COLUMNS)
    generators = _integers(owners, "principalGenerators", DEGREE * COLUMNS)
    packets = _integers(owners, "packetIdeals", DEGREE * DEGREE * ROWS)
    norms = _integers(owners, "packetNorms", ROWS)
    packet_ids = _integers(owners, "packetIds", ROWS)
    metadata = _integers(owners, "relationMetadata", 3 * COLUMNS)
    relation_rows = _rows(records)
    factor_base = tuple(
        tuple(packets[16 * index : 16 * (index + 1)]) for index in range(ROWS)
    )
    for index, (packet, norm) in enumerate(zip(factor_base, norms, strict=True)):
        if packet_ids[index] != index + 1:
            raise Field3RelationReplayError("factor-base packet order changed")
        if abs(_determinant4(packet)) != norm or (
            verify_principal_relations and _quartic_hnf(packet) != packet
        ):
            raise Field3RelationReplayError("factor-base ideal failed exact HNF replay")

    identity = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    nonzero = 0
    maximum_support = 0
    for column, row in enumerate(relation_rows):
        if metadata[3 * column : 3 * column + 3] != (column + 1, 0, 0):
            raise Field3RelationReplayError("relation provenance order changed")
        if any(exponent < 0 or exponent > 7 for exponent in row):
            raise Field3RelationReplayError(
                "relation exponent left its retained domain"
            )
        support = sum(exponent != 0 for exponent in row)
        nonzero += support
        maximum_support = max(maximum_support, support)
        if verify_principal_relations:
            product = identity
            for ideal, exponent in zip(factor_base, row, strict=True):
                for _ in range(exponent):
                    product = _quartic_product(product, ideal, table)
            alpha = generators[DEGREE * column : DEGREE * (column + 1)]
            if product != _principal_hnf(alpha, table):
                raise Field3RelationReplayError(
                    "principal ideal replay failed at relation " + str(column + 1)
                )
    return {
        "rows": relation_rows,
        "factor_base": factor_base,
        "principal_generators": tuple(
            generators[DEGREE * column : DEGREE * (column + 1)]
            for column in range(COLUMNS)
        ),
        "basis_table": table,
        "nonzero_relation_entries": nonzero,
        "maximum_relation_support": maximum_support,
    }


def _f2_inverse(matrix: Sequence[Sequence[int]]) -> tuple[tuple[int, int], ...]:
    if len(matrix) != 2 or any(len(row) != 2 for row in matrix):
        raise Field3RelationReplayError("the suffix alignment has the wrong shape")
    a, b = (int(value) & 1 for value in matrix[0])
    c, d = (int(value) & 1 for value in matrix[1])
    if (a * d - b * c) & 1 != 1:
        raise Field3RelationReplayError("the suffix alignment is singular over F2")
    return ((d, b), (c, a))


def _row_times_f2(
    row: Sequence[int], matrix: Sequence[Sequence[int]]
) -> tuple[int, int]:
    return (
        (int(row[0]) * int(matrix[0][0]) + int(row[1]) * int(matrix[1][0])) & 1,
        (int(row[0]) * int(matrix[0][1]) + int(row[1]) * int(matrix[1][1])) & 1,
    )


def exact_field3_arbitrary_ideal_receipt(
    owners: Mapping[str, Any], basis_table: Sequence[Any]
) -> dict[str, Any]:
    """Return one exact principal-quotient witness independent of SNF code."""
    replay = replay_field3_principal_relations(owners, basis_table)
    permutation = _integers(owners, "outerPermutation", ROWS)
    selected = permutation[0] - 1
    if selected < 0 or selected >= ROWS:
        raise Field3RelationReplayError("the arbitrary-ideal packet is invalid")
    beta = (1, 1, 0, 0)
    principal = _principal_hnf(beta, replay["basis_table"])
    representative = replay["factor_base"][selected]
    arbitrary = _quartic_product(representative, principal, replay["basis_table"])
    if arbitrary != _quartic_product(
        representative,
        _principal_hnf(beta, replay["basis_table"]),
        replay["basis_table"],
    ):
        raise Field3RelationReplayError("the principal quotient witness failed replay")
    return {
        "packet_index": selected + 1,
        "ambient_support": ((selected, 1),),
        "representative": representative,
        "ideal": arbitrary,
        "quotient_generator": beta,
        "principal_ideal": principal,
        "relations": COLUMNS,
        "factor_base_size": ROWS,
        "nonzero_relation_entries": replay["nonzero_relation_entries"],
        "maximum_relation_support": replay["maximum_relation_support"],
    }


def materialize_field3_relation_map(
    owners: Mapping[str, Any], basis_table: Sequence[Any]
) -> dict[str, Any]:
    """Build the full quotient presentation and one exact arbitrary-ideal map."""
    replay = replay_field3_principal_relations(owners, basis_table)
    permutation = _integers(owners, "outerPermutation", ROWS)
    return materialize_field3_relation_map_from_decoded(
        replay["rows"],
        replay["factor_base"],
        permutation,
        replay["basis_table"],
        nonzero_relation_entries=replay["nonzero_relation_entries"],
        maximum_relation_support=replay["maximum_relation_support"],
    )


def materialize_field3_relation_map_from_decoded(
    rows: Sequence[Sequence[int]],
    factor_base: Sequence[Sequence[int]],
    permutation: Sequence[int],
    basis_table: Sequence[int],
    *,
    nonzero_relation_entries: int,
    maximum_relation_support: int,
) -> dict[str, Any]:
    """Materialize the map after an independent exact owner replay.

    The focused checker invokes this narrow entry in Sage.js only after the
    byte-identical owner snapshot has passed `replay_field3_principal_relations`
    under CPython.  Keeping decoding and 1,703 ideal products outside the JS
    call isolates the intended FLINT-backed presentation boundary.
    """
    from sagejs.number_fields.class_group_matrix import (
        exact_relation_hnf_basis,
        extract_relation_presentation,
    )

    if len(rows) != COLUMNS or any(len(row) != ROWS for row in rows):
        raise Field3RelationReplayError("decoded relation matrix has the wrong shape")
    if len(factor_base) != ROWS or any(len(ideal) != 16 for ideal in factor_base):
        raise Field3RelationReplayError("decoded factor base has the wrong shape")
    if len(permutation) != ROWS or len(basis_table) != 64:
        raise Field3RelationReplayError("decoded field authority has the wrong shape")
    # The canonical basis has exactly the same Z-row lattice as all 301 live
    # relations.  Presenting it avoids materializing a 301-square transform
    # whose coefficients are irrelevant to class coordinates.
    canonical_basis = exact_relation_hnf_basis(rows, ROWS)
    if len(canonical_basis) != ROWS:
        raise Field3RelationReplayError("the full relation lattice lost rank")
    presentation = extract_relation_presentation(
        canonical_basis, ROWS, backend="flint", require_full_rank=True
    )
    if not presentation.verify() or presentation.invariants != (2, 2):
        raise Field3RelationReplayError("the full relation presentation changed")
    if presentation.order != 4:
        raise Field3RelationReplayError("the class number is not four")

    selected = (int(permutation[0]) - 1, int(permutation[1]) - 1)
    if min(selected) < 0 or max(selected) >= ROWS or selected[0] == selected[1]:
        raise Field3RelationReplayError("the published suffix selection is invalid")
    alignment_rows: list[tuple[int, int]] = []
    for index in selected:
        ambient = [0] * ROWS
        ambient[index] = 1
        coordinates = tuple(presentation.class_coordinates(ambient))
        if len(coordinates) != 2:
            raise Field3RelationReplayError("the full quotient is not rank two")
        alignment_rows.append((coordinates[0] & 1, coordinates[1] & 1))
    alignment = tuple(alignment_rows)
    inverse = _f2_inverse(alignment)

    # This ideal is not merely a retained packet: multiply the first suffix
    # prime ideal by a non-rational principal ideal.  Its discrete logarithm
    # is the packet's ambient basis vector, and beta is an exact witness for
    # the quotient by that representative.
    beta = (1, 1, 0, 0)
    principal = _principal_hnf(beta, basis_table)
    representative = factor_base[selected[0]]
    arbitrary_ideal = _quartic_product(representative, principal, basis_table)
    if arbitrary_ideal != _quartic_product(
        representative, _principal_hnf(beta, basis_table), basis_table
    ):
        raise Field3RelationReplayError("the arbitrary-ideal quotient witness failed")
    ambient = [0] * ROWS
    ambient[selected[0]] = 1
    full_coordinates = tuple(presentation.class_coordinates(ambient))
    suffix_coordinates = _row_times_f2(full_coordinates, inverse)
    if _row_times_f2(suffix_coordinates, alignment) != tuple(
        value & 1 for value in full_coordinates
    ):
        raise Field3RelationReplayError("the suffix-coordinate map failed replay")
    zero = tuple(presentation.class_coordinates([0] * ROWS))
    if zero != (0, 0):
        raise Field3RelationReplayError("a principal ideal has nonzero class")

    return {
        "presentation": presentation,
        "canonical_basis": canonical_basis,
        "relation_rows": rows,
        "selected_packet_indices": (selected[0] + 1, selected[1] + 1),
        "alignment": alignment,
        "alignment_inverse": inverse,
        "arbitrary_ideal": arbitrary_ideal,
        "representative": representative,
        "quotient_generator": beta,
        "full_coordinates": full_coordinates,
        "suffix_coordinates": suffix_coordinates,
        "principal_coordinates": zero,
        "nonzero_relation_entries": int(nonzero_relation_entries),
        "maximum_relation_support": int(maximum_relation_support),
    }


__all__ = [
    "Field3RelationReplayError",
    "exact_field3_arbitrary_ideal_receipt",
    "materialize_field3_relation_map",
    "materialize_field3_relation_map_from_decoded",
    "replay_field3_principal_relations",
]
