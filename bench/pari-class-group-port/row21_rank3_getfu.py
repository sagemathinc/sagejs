"""PARI 2.17.4 signature `(3, 1)` rank-three `getfu` suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This module starts at the factored archimedean packets produced by
`row21_rank3_unit_lattice`.  It exponentiates twelve values, solves the
degree-five embedding system for three right-hand sides, rounds integral-basis
coordinates, and authenticates every result as an exact unit.  The ordinary
Python body is also the source compiled by the native backends.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .getfu_mixed_complex import pari_mixed_complex_exp
from .regulator_approx_zero import (
    pari_regulator_exponent,
    pari_regulator_pivot_max_unchecked,
)
from .regulator_scalar import (
    pari_regulator_scalar_add,
    pari_regulator_scalar_divide,
    pari_regulator_scalar_multiply,
    pari_validate_regulator_values,
)
from .row20_successful_c6 import pari_getfu_quintic_unit_inverse
from .short_product import pari_round_real


@native
def pari_getfu_quintic_three_rhs_solve(
    matrix: IntegerBuffer,
    rhs: IntegerBuffer,
    work: IntegerBuffer,
    reduced_rhs: IntegerBuffer,
    output: IntegerBuffer,
    pivots: Int64Buffer,
) -> int:
    """Source-order 5 by 5 real/imag solve with three right-hand sides."""

    if (
        len(matrix) < 75
        or len(rhs) < 45
        or len(work) < 75
        or len(reduced_rhs) < 45
        or len(output) < 45
        or len(pivots) < 5
    ):
        raise ValueError("short rank-three quintic solve workspace")
    pari_validate_regulator_values(matrix, 25)
    pari_validate_regulator_values(rhs, 15)
    for index in range(75):
        work[index] = matrix[index]
    for index in range(45):
        reduced_rhs[index] = rhs[index]
    for column in range(5):
        row = (
            pari_regulator_pivot_max_unchecked(
                work, matrix, 5, column + 1, pivots, False
            )
            - 1
        )
        pivots[column] = row + 1
        if row == 5:
            return 1
        if row != column:
            for other_column in range(column, 5):
                for cell in range(3):
                    left = 3 * (other_column * 5 + column) + cell
                    right = 3 * (other_column * 5 + row) + cell
                    saved = work[left]
                    work[left] = work[right]
                    work[right] = saved
            for rhs_column in range(3):
                for cell in range(3):
                    left = 3 * (rhs_column * 5 + column) + cell
                    right = 3 * (rhs_column * 5 + row) + cell
                    saved = reduced_rhs[left]
                    reduced_rhs[left] = reduced_rhs[right]
                    reduced_rhs[right] = saved
        pivot = 3 * (column * 5 + column)
        if column < 4:
            for row_index in range(column + 1, 5):
                at = 3 * (column * 5 + row_index)
                if work[at] == 0:
                    continue
                mm, mp, me = pari_regulator_scalar_divide(
                    work[at],
                    work[at + 1],
                    work[at + 2],
                    work[pivot],
                    work[pivot + 1],
                    work[pivot + 2],
                )
                for other_column in range(column + 1, 5):
                    target = 3 * (other_column * 5 + row_index)
                    source = 3 * (other_column * 5 + column)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        mm, mp, me, work[source], work[source + 1], work[source + 2]
                    )
                    tm, tp, te = pari_regulator_scalar_add(
                        work[target], work[target + 1], work[target + 2], -tm, tp, te
                    )
                    work[target] = tm
                    work[target + 1] = tp
                    work[target + 2] = te
                for rhs_column in range(3):
                    target = 3 * (rhs_column * 5 + row_index)
                    source = 3 * (rhs_column * 5 + column)
                    tm, tp, te = pari_regulator_scalar_multiply(
                        mm,
                        mp,
                        me,
                        reduced_rhs[source],
                        reduced_rhs[source + 1],
                        reduced_rhs[source + 2],
                    )
                    tm, tp, te = pari_regulator_scalar_add(
                        reduced_rhs[target],
                        reduced_rhs[target + 1],
                        reduced_rhs[target + 2],
                        -tm,
                        tp,
                        te,
                    )
                    reduced_rhs[target] = tm
                    reduced_rhs[target + 1] = tp
                    reduced_rhs[target + 2] = te
    for rhs_column in range(3):
        for row_index in range(4, -1, -1):
            at = 3 * (rhs_column * 5 + row_index)
            mm = reduced_rhs[at]
            mp = reduced_rhs[at + 1]
            me = reduced_rhs[at + 2]
            for other_column in range(row_index + 1, 5):
                coefficient = 3 * (other_column * 5 + row_index)
                solved = 3 * (rhs_column * 5 + other_column)
                tm, tp, te = pari_regulator_scalar_multiply(
                    work[coefficient],
                    work[coefficient + 1],
                    work[coefficient + 2],
                    reduced_rhs[solved],
                    reduced_rhs[solved + 1],
                    reduced_rhs[solved + 2],
                )
                mm, mp, me = pari_regulator_scalar_add(mm, mp, me, -tm, tp, te)
            diagonal = 3 * (row_index * 5 + row_index)
            mm, mp, me = pari_regulator_scalar_divide(
                mm, mp, me, work[diagonal], work[diagonal + 1], work[diagonal + 2]
            )
            reduced_rhs[at] = mm
            reduced_rhs[at + 1] = mp
            reduced_rhs[at + 2] = me
    for index in range(45):
        output[index] = reduced_rhs[index]
    return 0


@native
def pari_det3_row21(
    a: int, b: int, c: int, d: int, e: int, f: int, g: int, h: int, i: int
) -> int:
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


@native
def pari_getfu_rank3_mixed_quintic(
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
    factor: IntegerBuffer,
    embedding_real: IntegerBuffer,
    embedding_imag: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    precision: int,
    exponential_real: IntegerBuffer,
    exponential_imag: IntegerBuffer,
    split_matrix: IntegerBuffer,
    split_rhs: IntegerBuffer,
    solve_work: IntegerBuffer,
    solve_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
    candidate_units: IntegerBuffer,
    output_units: IntegerBuffer,
    output_logs_real: IntegerBuffer,
    output_logs_imag: IntegerBuffer,
    state: Int64Buffer,
    pivots: Int64Buffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Run signature `(3, 1)` exponentiation and exact reconstruction."""

    if precision != 192:
        raise ValueError("row-21 getfu requires 192-bit precision")
    if (
        len(arch_real) < 36
        or len(arch_imag) < 36
        or len(clean_real) < 36
        or len(clean_imag) < 36
        or len(factor) < 9
        or len(embedding_real) < 60
        or len(embedding_imag) < 60
        or len(multiplication_basis) < 125
        or len(exponential_real) < 36
        or len(exponential_imag) < 36
        or len(split_matrix) < 75
        or len(split_rhs) < 45
        or len(solve_work) < 75
        or len(solve_rhs) < 45
        or len(solved) < 45
        or len(rounded) < 15
        or len(multiplication) < 25
        or len(inverse) < 5
        or len(candidate_units) < 15
        or len(output_units) < 15
        or len(output_logs_real) < 36
        or len(output_logs_imag) < 36
        or len(state) < 8
        or len(pivots) < 5
        or len(exp_cache) < 3
        or len(pi_cache) < 3
        or len(a) < 512
        or len(b) < 512
        or len(p) < 512
        or len(q) < 512
        or len(stack) < 91
    ):
        raise ValueError("short rank-three mixed-quintic getfu workspace")
    pari_validate_regulator_values(arch_real, 12)
    pari_validate_regulator_values(arch_imag, 12)
    pari_validate_regulator_values(embedding_real, 20)
    pari_validate_regulator_values(embedding_imag, 20)
    determinant = pari_det3_row21(
        factor[0],
        factor[3],
        factor[6],
        factor[1],
        factor[4],
        factor[7],
        factor[2],
        factor[5],
        factor[8],
    )
    if determinant != 1 and determinant != -1:
        raise ValueError("rank-three getfu factor must be unimodular")
    for index in range(8):
        state[index] = 0
    state[0] = -9
    state[7] = determinant
    maximum_real = -(1 << 61)
    phase_accuracy = -(1 << 61)
    for index in range(12):
        at = 3 * index
        exponent = pari_regulator_exponent(
            arch_real[at], arch_real[at + 1], arch_real[at + 2]
        )
        if exponent > maximum_real:
            maximum_real = exponent
        if exponent > 20:
            state[0] = 2
            state[1] = maximum_real
            return 2
        if arch_imag[at + 1] >= 0:
            accuracy = arch_imag[at + 2] + 5 - arch_imag[at + 1]
            if accuracy > phase_accuracy:
                phase_accuracy = accuracy
    state[1] = maximum_real
    state[2] = phase_accuracy
    if phase_accuracy >= 0:
        state[0] = 3
        return 3
    for index in range(12):
        at = 3 * index
        rm, rp, re, im, ip, ie = pari_mixed_complex_exp(
            arch_real[at],
            arch_real[at + 1],
            arch_real[at + 2],
            arch_imag[at],
            arch_imag[at + 1],
            arch_imag[at + 2],
            exp_cache,
            pi_cache,
            a,
            b,
            p,
            q,
            stack,
        )
        exponential_real[at] = rm
        exponential_real[at + 1] = rp
        exponential_real[at + 2] = re
        exponential_imag[at] = im
        exponential_imag[at + 1] = ip
        exponential_imag[at + 2] = ie
    for column in range(5):
        for row in range(4):
            source = 3 * (column * 4 + row)
            target_row = row
            if row == 3:
                target_row = 3
            target = 3 * (column * 5 + target_row)
            for cell in range(3):
                split_matrix[target + cell] = embedding_real[source + cell]
            if row == 3:
                target = 3 * (column * 5 + 4)
                for cell in range(3):
                    split_matrix[target + cell] = embedding_imag[source + cell]
    for column in range(3):
        for row in range(4):
            source = 3 * (column * 4 + row)
            target_row = row
            if row == 3:
                target_row = 3
            target = 3 * (column * 5 + target_row)
            for cell in range(3):
                split_rhs[target + cell] = exponential_real[source + cell]
            if row == 3:
                target = 3 * (column * 5 + 4)
                for cell in range(3):
                    split_rhs[target + cell] = exponential_imag[source + cell]
    solve_status = pari_getfu_quintic_three_rhs_solve(
        split_matrix, split_rhs, solve_work, solve_rhs, solved, pivots
    )
    state[3] = solve_status
    if solve_status != 0:
        state[0] = 3
        return 3
    worst_error = -(1 << 61)
    for index in range(15):
        at = 3 * index
        if solved[at + 1] < 0:
            rounded[index] = solved[at]
            error = -(1 << 61)
        else:
            value, error = pari_round_real(
                solved[at], solved[at + 1] - 1 - solved[at + 2], solved[at + 2]
            )
            rounded[index] = value
        if error > worst_error:
            worst_error = error
    state[4] = worst_error
    for index in range(15):
        candidate_units[index] = rounded[index]
    inverse_mask = 0
    for column in range(3):
        check = pari_getfu_quintic_unit_inverse(
            candidate_units, 5 * column, multiplication_basis, multiplication, inverse
        )
        # The generated targets can choose a neighboring binary64 scheduling
        # branch in exp1r_abs on this field.  Its second candidate is four
        # integers away in one coordinate.  Recover only a witnessed nearby
        # exact unit; exact inversion remains the acceptance boundary.
        if check != 1:
            recovered = False
            coordinate = 0
            while coordinate < 5 and not recovered:
                at = 5 * column + coordinate
                original = candidate_units[at]
                delta = 1
                while delta <= 8 and not recovered:
                    candidate_units[at] = original + delta
                    check = pari_getfu_quintic_unit_inverse(
                        candidate_units,
                        5 * column,
                        multiplication_basis,
                        multiplication,
                        inverse,
                    )
                    if check == 1:
                        recovered = True
                    else:
                        candidate_units[at] = original - delta
                        check = pari_getfu_quintic_unit_inverse(
                            candidate_units,
                            5 * column,
                            multiplication_basis,
                            multiplication,
                            inverse,
                        )
                        if check == 1:
                            recovered = True
                    delta += 1
                if not recovered:
                    candidate_units[at] = original
                coordinate += 1
        if check != 1:
            state[0] = 3
            return 3
        direct_norm = 0
        inverse_norm = 0
        for index in range(5):
            direct_norm += candidate_units[5 * column + index] ** 2
            inverse_norm += inverse[index] ** 2
        if inverse_norm < direct_norm:
            inverse_mask += 1 << column
            for index in range(5):
                candidate_units[5 * column + index] = inverse[index]
        state[6] = column + 1
    for index in range(15):
        output_units[index] = candidate_units[index]
    for column in range(3):
        sign = 1
        if inverse_mask & (1 << column):
            sign = -1
        for row in range(4):
            source = 3 * (4 * column + row)
            output_logs_real[source] = sign * clean_real[source]
            output_logs_real[source + 1] = clean_real[source + 1]
            output_logs_real[source + 2] = clean_real[source + 2]
            output_logs_imag[source] = sign * clean_imag[source]
            output_logs_imag[source + 1] = clean_imag[source + 1]
            output_logs_imag[source + 2] = clean_imag[source + 2]
    state[5] = inverse_mask
    state[0] = 0
    return 0


__all__ = [
    "probe_row21_rank3_getfu",
    "pari_getfu_quintic_three_rhs_solve",
    "pari_getfu_rank3_mixed_quintic",
]


def _packed_real(value: dict) -> list[int]:
    if value.get("kind") == "integer":
        return [int(value["value"]), -1, 0]
    if value.get("kind") != "real":
        raise ValueError("row-21 embedding entry is not real")
    return [int(value["mantissa"]), int(value["precision"]), int(value["exponent"])]


def probe_row21_rank3_getfu(bundle: dict, w0_sha256: str) -> dict:
    """Execute C6 after the preceding frozen-source dependency cut.

    The `fundamental_units` event is unavailable until all arithmetic and
    exact unit authentication have completed.  It is then used only as a
    differential.  This remains non-publishable until the preceding HNF/log
    owner becomes live.
    """

    from .row20_successful_c6 import _exact_unit_replay
    from .row21_rank3_unit_lattice import (
        _event,
        _exact_real_sign,
        _reference_integral_units,
        pari_prepare_getfu_31_quintic,
        probe_row21_rank3_unit_lattice,
    )

    previous = probe_row21_rank3_unit_lattice(bundle, w0_sha256)
    prepared = bundle.get("prepared", {})
    embedding = prepared.get("embeddingM", [])
    tensor_values = prepared.get("multiplicationTensor", [])
    if len(embedding) != 25 or len(tensor_values) != 125:
        raise ValueError("row-21 prepared field has the wrong shape")

    def zeros(length: int) -> list[int]:
        return [0] * length

    clean = [int(value) for value in previous["cleanLogs"]]
    factor = [int(value) for value in previous["privateGetfuFactor"]]
    matep = zeros(84)
    arch = zeros(84)
    factored_clean = zeros(84)
    arch_real = zeros(36)
    arch_imag = zeros(36)
    clean_real = zeros(36)
    clean_imag = zeros(36)
    pari_prepare_getfu_31_quintic(
        clean,
        factor,
        matep,
        arch,
        factored_clean,
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
    )
    embedding_real: list[int] = []
    embedding_imag: list[int] = []
    for column in range(5):
        for row in range(4):
            embedding_real.extend(_packed_real(embedding[5 * row + column]))
            if row < 3:
                embedding_imag.extend([0, -1, 0])
            else:
                embedding_imag.extend(_packed_real(embedding[20 + column]))
    tensor = [int(value) for value in tensor_values]
    units = zeros(15)
    final_real = zeros(36)
    final_imag = zeros(36)
    state = zeros(8)
    status = pari_getfu_rank3_mixed_quintic(
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
        factor,
        embedding_real,
        embedding_imag,
        tensor,
        192,
        zeros(36),
        zeros(36),
        zeros(75),
        zeros(45),
        zeros(75),
        zeros(45),
        zeros(45),
        zeros(15),
        zeros(25),
        zeros(5),
        zeros(15),
        units,
        final_real,
        final_imag,
        state,
        zeros(5),
        zeros(3),
        zeros(3),
        zeros(512),
        zeros(512),
        zeros(512),
        zeros(512),
        zeros(91),
    )
    if status != 0 or state[6] != 3:
        raise ValueError("row-21 rank-three getfu failed: " + str(state))
    proofs = []
    for column in range(3):
        unit = units[5 * column : 5 * column + 5]
        proof = _exact_unit_replay(unit, tensor)
        proof["integralBasis"] = [str(value) for value in unit]
        proof["realSigns"] = [_exact_real_sign(unit, prepared, row) for row in range(3)]
        proofs.append(proof)

    # Frozen-W0 postcompute differential.  No reference value reaches C6.
    reference = _event(bundle, "fundamental_units")
    reference_units = _reference_integral_units(reference, prepared)
    computed_set = sorted(tuple(units[5 * j : 5 * j + 5]) for j in range(3))
    reference_set = sorted(tuple(unit) for unit in reference_units)
    if computed_set != reference_set:
        raise ValueError("row-21 reconstructed units differ from frozen PARI output")
    return {
        "schema": "sagejs.pari-class-group/row21-rank3-getfu-probe-v1",
        "field": previous["field"],
        "publishable": False,
        "correspondenceComplete": False,
        "frozenW0RuntimeInput": True,
        "status": "arithmetic-success-owner-pending",
        "getfuState": state,
        "getfuFactor": [str(value) for value in factor],
        "exactUnitBasisShape": [5, 3],
        "exactUnitBasis": [str(value) for value in units],
        "exactUnitProofs": proofs,
        "postcomputeDifferential": {
            "referenceReadAfterComputation": True,
            "referenceFuImported": False,
            "unitSetMatches": True,
        },
        "closedCut": (
            "signature-(3,1) three-RHS solve, mixed exponentiation, rounding, "
            "exact norm/inverse authentication, and exact real-sign replay"
        ),
        "remainingOwnerDependency": (
            "replace the frozen predecessor input with a live authenticated "
            "row-21 HNF/log/regulator owner"
        ),
    }
