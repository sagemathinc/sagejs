"""PARI 2.17.4 totally-real quintic rank-four `getfu` suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The input is the live 5-by-4 logarithmic candidate matrix produced after
`fixarch` and private LLL.  This source exponentiates every real place,
solves four embedding right-hand sides with the shared bounded solver, rounds
integral-basis coordinates, and authenticates each result as an exact unit.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .bounded_getfu_reconstruction import (
    pari_bounded_getfu_multiple_rhs_reconstruct,
)
from .getfu_mixed_complex import pari_mixed_complex_exp
from .row20_successful_c6 import (
    pari_getfu_quintic_unit_inverse,
    pari_minor4_row20,
)
from .regulator_scalar import pari_validate_regulator_values


@native
def pari_row23_totally_real_getfu(
    logarithms: IntegerBuffer,
    embedding_matrix: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    exponential_rhs: IntegerBuffer,
    exponential_imaginary: IntegerBuffer,
    solve_work: IntegerBuffer,
    solve_rhs: IntegerBuffer,
    solved: IntegerBuffer,
    rounded: IntegerBuffer,
    candidate_units: IntegerBuffer,
    candidate_inverses: IntegerBuffer,
    output_units: IntegerBuffer,
    output_norms: IntegerBuffer,
    multiplication: IntegerBuffer,
    inverse: IntegerBuffer,
    pivots: Int64Buffer,
    solve_state: Int64Buffer,
    state: Int64Buffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    agm_a: IntegerBuffer,
    agm_b: IntegerBuffer,
    agm_p: IntegerBuffer,
    agm_q: IntegerBuffer,
    agm_stack: IntegerBuffer,
) -> int:
    """Exponentiate, reconstruct, and verify four totally-real units.

    `state` is status, exponentials completed, solve status, exact units
    checked, inverse mask, and maximum logarithm exponent.  Public units are
    transactional: no output cell changes before all four norm/inverse checks.
    """
    if (
        len(logarithms) < 140
        or len(embedding_matrix) < 75
        or len(multiplication_basis) < 125
        or len(exponential_rhs) < 60
        or len(exponential_imaginary) < 60
        or len(solve_work) < 75
        or len(solve_rhs) < 60
        or len(solved) < 60
        or len(rounded) < 20
        or len(candidate_units) < 20
        or len(candidate_inverses) < 20
        or len(output_units) < 20
        or len(output_norms) < 4
        or len(multiplication) < 25
        or len(inverse) < 5
        or len(pivots) < 5
        or len(solve_state) < 5
        or len(state) < 6
        or len(exp_cache) < 3
        or len(pi_cache) < 3
        or len(agm_a) < 512
        or len(agm_b) < 512
        or len(agm_p) < 512
        or len(agm_q) < 512
        or len(agm_stack) < 91
    ):
        raise ValueError("short row-23 totally-real getfu workspace")
    pari_validate_regulator_values(embedding_matrix, 25)
    for index in range(6):
        state[index] = 0
    state[0] = -9
    state[5] = -(1 << 61)
    for index in range(20):
        packed = 7 * index
        at = 3 * index
        exponent = logarithms[packed + 3]
        if exponent > state[5]:
            state[5] = exponent
        if exponent > 20:
            state[0] = 2
            return 2
        m, p, e, im, ip, ie = pari_mixed_complex_exp(
            logarithms[packed + 1],
            logarithms[packed + 2],
            logarithms[packed + 3],
            logarithms[packed + 4],
            logarithms[packed + 5],
            logarithms[packed + 6],
            exp_cache,
            pi_cache,
            agm_a,
            agm_b,
            agm_p,
            agm_q,
            agm_stack,
        )
        exponential_rhs[at] = m
        exponential_rhs[at + 1] = p
        exponential_rhs[at + 2] = e
        exponential_imaginary[at] = im
        exponential_imaginary[at + 1] = ip
        exponential_imaginary[at + 2] = ie
        if im != 0 and ie >= -32:
            state[0] = 5
            return 5
        state[1] = index + 1
    status = pari_bounded_getfu_multiple_rhs_reconstruct(
        embedding_matrix,
        exponential_rhs,
        5,
        4,
        1,
        2048,
        4096,
        solve_work,
        solve_rhs,
        solved,
        rounded,
        candidate_units,
        pivots,
        solve_state,
    )
    state[2] = status
    if status != 0:
        state[0] = 3
        return 3
    inverse_mask = 0
    for column in range(4):
        check = pari_getfu_quintic_unit_inverse(
            candidate_units,
            5 * column,
            multiplication_basis,
            multiplication,
            inverse,
        )
        if check != 1:
            state[0] = 4
            return 4
        determinant = 0
        for determinant_column in range(5):
            cofactor = pari_minor4_row20(multiplication, determinant_column)
            if determinant_column % 2 == 1:
                cofactor = -cofactor
            determinant += multiplication[5 * determinant_column] * cofactor
        output_norms[column] = determinant
        direct_size = 0
        inverse_size = 0
        for index in range(5):
            direct_size += candidate_units[5 * column + index] ** 2
            inverse_size += inverse[index] ** 2
            candidate_inverses[5 * column + index] = inverse[index]
        if inverse_size < direct_size:
            inverse_mask += 1 << column
        state[3] = column + 1
    for column in range(4):
        use_inverse = inverse_mask & (1 << column)
        for index in range(5):
            source = candidate_units[5 * column + index]
            if use_inverse != 0:
                source = candidate_inverses[5 * column + index]
            output_units[5 * column + index] = source
    state[4] = inverse_mask
    state[0] = 0
    return 0


__all__ = ["pari_row23_totally_real_getfu"]
