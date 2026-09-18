"""Fresh row-20 rank-two units from same-run HNF/acceptance owners.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the C3--C6 orchestration already audited in
``row20_successful_c6.py``, with the retained-W0 comparison boundary removed.
Its inputs are only the live compact logarithms, accepted relation lattice and
regulator, plus authenticated normalized prepared-NF data.
"""

from typing import Any

from .row20_successful_c6 import (
    Row20Failure,
    _exact_unit_replay,
    _floats,
    _real_lll,
    _zeros,
    pari_cleanarchunit_mixed_quintic,
    pari_getfu_mixed_quintic,
    pari_log_matrix_transform,
    pari_prepare_getfu_mixed_quintic,
    pari_unit_compose_rank_two,
    pari_unit_integer_lattice_rank_two,
)

PLACES = 3
RELATIONS = 14
KERNEL = 7
DEGREE = 5


def _power_basis(unit: list[int], prepared: dict[str, Any]) -> list[dict[str, str]]:
    basis = [int(value) for value in prepared["prep_zk"]]
    denominator = int(prepared["prep_zkden"])
    output: list[dict[str, str]] = []
    for row in range(DEGREE):
        numerator = sum(
            unit[column] * basis[DEGREE * column + row] for column in range(DEGREE)
        )
        common = denominator
        a, b = abs(numerator), common
        while b:
            a, b = b, a % b
        numerator //= a
        common //= a
        output.append({"numerator": str(numerator), "denominator": str(common)})
    return output


def _embedding(prepared: dict[str, Any]) -> tuple[list[int], list[int]]:
    mantissas = [int(value) for value in prepared["admission_matrix_m"]]
    precisions = [int(value) for value in prepared["admission_matrix_p"]]
    exponents = [int(value) for value in prepared["admission_matrix_e"]]
    real: list[int] = []
    imaginary: list[int] = []
    for column in range(DEGREE):
        for row in range(DEGREE):
            at = DEGREE * row + column
            if row == 0 or row % 2 == 1:
                real.extend([mantissas[at], precisions[at], exponents[at]])
            else:
                imaginary.extend([mantissas[at], precisions[at], exponents[at]])
        # One exact zero imaginary triple for the real place precedes the two
        # complex imaginary rows in the per-column getfu layout.
        imaginary[-6:-6] = [0, -1, 0]
    return real, imaginary


def compose_fresh_row20_units(
    exact_logs: list[int],
    relation_lattice: list[int],
    regulator: list[int],
    prepared: dict[str, Any],
) -> dict[str, Any]:
    """Materialize two exact units without consulting retained answers."""
    if len(exact_logs) != RELATIONS * PLACES * 7:
        raise Row20Failure("fresh exact-log owner has the wrong shape")
    if len(relation_lattice) != RELATIONS or len(regulator) != 3:
        raise Row20Failure("fresh acceptance owner has the wrong shape")
    tensor = [int(value) for value in prepared["basis_table"]]
    if len(tensor) != DEGREE**3:
        raise Row20Failure("fresh multiplication tensor has the wrong shape")

    packed_a = exact_logs[: KERNEL * PLACES * 7]
    u1 = _zeros(2 * KERNEL)
    integer_state = _zeros(5)
    status = pari_unit_integer_lattice_rank_two(
        relation_lattice,
        KERNEL,
        u1,
        integer_state,
        _zeros(2 * KERNEL),
        _zeros(KERNEL * KERNEL),
        _zeros(KERNEL * KERNEL),
        _floats(KERNEL * KERNEL),
        _zeros(KERNEL * KERNEL),
        _floats(KERNEL * KERNEL),
        _zeros(KERNEL * KERNEL),
        _floats(KERNEL),
        _zeros(KERNEL),
        _floats(2 * KERNEL),
        _floats(KERNEL * KERNEL),
        _zeros(KERNEL),
        _zeros(KERNEL),
        _zeros(KERNEL),
        _floats(KERNEL),
        _floats(KERNEL),
        _floats(KERNEL),
        _zeros(KERNEL),
    )
    if status != 0 or integer_state[:4] != [5, 5, 2, 0]:
        raise Row20Failure("fresh integer LLL changed")
    first_logs = _zeros(42)
    pari_log_matrix_transform(packed_a, u1, PLACES, KERNEL, 2, False, first_logs)
    triples = _zeros(18)
    for row in range(PLACES):
        for column in range(2):
            source = 7 * (column * PLACES + row) + 1
            target = 3 * (row * 2 + column)
            triples[target : target + 3] = first_logs[source : source + 3]
    u2 = _real_lll(triples)
    composed = _zeros(14)
    pari_unit_compose_rank_two(u1, KERNEL, u2, composed)
    au = _zeros(42)
    pari_log_matrix_transform(packed_a, composed, PLACES, KERNEL, 2, False, au)
    clean = _zeros(42)
    clean_state = _zeros(6)
    status = pari_cleanarchunit_mixed_quintic(
        au,
        regulator,
        192,
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
    if status != 0:
        raise Row20Failure("fresh cleanarch failed: " + str(clean_state))

    matep, arch, candidate_a = _zeros(42), _zeros(42), _zeros(42)
    arch_real, arch_imag = _zeros(18), _zeros(18)
    clean_real, clean_imag = _zeros(18), _zeros(18)
    pari_prepare_getfu_mixed_quintic(
        clean,
        [1, 0, 0, 1],
        matep,
        arch,
        candidate_a,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    for row in range(PLACES):
        for column in range(2):
            source = 7 * (column * PLACES + row) + 1
            target = 3 * (row * 2 + column)
            triples[target : target + 3] = matep[source : source + 3]
    factor = _real_lll(triples)
    factor[1], factor[2] = factor[2], factor[1]
    pari_prepare_getfu_mixed_quintic(
        clean,
        factor,
        matep,
        arch,
        candidate_a,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )

    embedding_real, embedding_imag = _embedding(prepared)
    units, final_real, final_imag = _zeros(10), _zeros(18), _zeros(18)
    c6_state = _zeros(8)
    status = pari_getfu_mixed_quintic(
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
        factor,
        embedding_real,
        embedding_imag,
        tensor,
        192,
        _zeros(18),
        _zeros(18),
        _zeros(75),
        _zeros(30),
        _zeros(75),
        _zeros(30),
        _zeros(30),
        _zeros(10),
        _zeros(25),
        _zeros(5),
        _zeros(10),
        units,
        final_real,
        final_imag,
        c6_state,
        _zeros(5),
        _zeros(3),
        _zeros(3),
        _zeros(512),
        _zeros(512),
        _zeros(512),
        _zeros(512),
        _zeros(91),
    )
    if status != 0 or c6_state[6] != 2:
        raise Row20Failure("fresh getfu changed: " + str(c6_state))

    proofs: list[dict[str, Any]] = []
    for column in range(2):
        unit = units[DEGREE * column : DEGREE * (column + 1)]
        proof = _exact_unit_replay(unit, tensor)
        proof["integralBasis"] = [str(value) for value in unit]
        proof["powerBasis"] = _power_basis(unit, prepared)
        proof["sevenRawGeneratorExponents"] = [
            str(composed[KERNEL * column + row]) for row in range(KERNEL)
        ]
        proofs.append(proof)
    return {
        "schema": "sagejs.pari-class-group/row20-fresh-unit-owner-v1",
        "status": "success",
        "exactUnitsPublished": True,
        "unitTransform": [str(value) for value in composed],
        "getfuFactor": [str(value) for value in factor],
        "exactUnitBasis": [str(value) for value in units],
        "exactUnitProofs": proofs,
        "integerLllState": integer_state,
        "cleanarchState": clean_state,
        "getfuState": c6_state,
        "normalizedArchimedean": [str(value) for value in candidate_a],
    }


__all__ = ["compose_fresh_row20_units"]
