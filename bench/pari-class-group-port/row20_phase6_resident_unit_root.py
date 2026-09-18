"""One resident native rank-two unit root for qualification row 20.

This is the ordinary typed-Python orchestration from ``row20_fresh_units``
with every variable-size allocation made explicit at the host boundary.  It
does not read an owner, spawn CPython, or serialize an intermediate value.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native

from .log_matrix_transform import pari_log_matrix_transform
from .row20_successful_c6 import (
    pari_cleanarchunit_mixed_quintic,
    pari_getfu_mixed_quintic,
    pari_prepare_getfu_mixed_quintic,
)
from .unit_lattice_reduction import (
    pari_unit_compose_rank_two,
    pari_unit_integer_lattice_rank_two,
    pari_unit_real_lattice_rank_two,
)


@native
def pari_row20_phase6_resident_unit_root(
    exact_logs: IntegerBuffer,
    relation_lattice: IntegerBuffer,
    regulator: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    multiplication_tensor: IntegerBuffer,
    u1: IntegerBuffer,
    integer_state: IntegerBuffer,
    lll_basis: IntegerBuffer,
    lll_transform: IntegerBuffer,
    lll_gram: IntegerBuffer,
    lll_mu: Float64Buffer,
    lll_mu_exponents: IntegerBuffer,
    lll_r: Float64Buffer,
    lll_r_exponents: IntegerBuffer,
    lll_s: Float64Buffer,
    lll_s_exponents: IntegerBuffer,
    lll_approximate: Float64Buffer,
    lll_float_gram: Float64Buffer,
    lll_alpha: IntegerBuffer,
    lll_column: IntegerBuffer,
    lll_column_exponents: IntegerBuffer,
    lll_normalized: Float64Buffer,
    lll_temporary: Float64Buffer,
    lll_dpe_scratch: Float64Buffer,
    lll_integer_scratch: IntegerBuffer,
    first_logs: IntegerBuffer,
    triples: IntegerBuffer,
    factor: IntegerBuffer,
    real_integers: IntegerBuffer,
    real_form: IntegerBuffer,
    real_state: IntegerBuffer,
    composed: IntegerBuffer,
    transformed_logs: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean: IntegerBuffer,
    clean_state: Int64Buffer,
    matep: IntegerBuffer,
    arch: IntegerBuffer,
    candidate_a: IntegerBuffer,
    arch_real: IntegerBuffer,
    arch_imag: IntegerBuffer,
    clean_real: IntegerBuffer,
    clean_imag: IntegerBuffer,
    embedding_real: IntegerBuffer,
    embedding_imag: IntegerBuffer,
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
    getfu_state: Int64Buffer,
    pivots: Int64Buffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    arithmetic_a: IntegerBuffer,
    arithmetic_b: IntegerBuffer,
    arithmetic_p: IntegerBuffer,
    arithmetic_q: IntegerBuffer,
    arithmetic_stack: IntegerBuffer,
    resident_state: Int64Buffer,
) -> int:
    """Materialize both exact fundamental units in one native call graph."""
    if len(resident_state) < 8:
        raise ValueError("short row-20 resident unit state")
    for i in range(8):
        resident_state[i] = 0
    resident_state[0] = -1

    status = pari_unit_integer_lattice_rank_two(
        relation_lattice,
        7,
        u1,
        integer_state,
        lll_basis,
        lll_transform,
        lll_gram,
        lll_mu,
        lll_mu_exponents,
        lll_r,
        lll_r_exponents,
        lll_s,
        lll_s_exponents,
        lll_approximate,
        lll_float_gram,
        lll_alpha,
        lll_column,
        lll_column_exponents,
        lll_normalized,
        lll_temporary,
        lll_dpe_scratch,
        lll_integer_scratch,
    )
    resident_state[1] = status
    if status != 0:
        resident_state[0] = status
        return status

    pari_log_matrix_transform(exact_logs, u1, 3, 7, 2, False, first_logs)
    for row in range(3):
        for column in range(2):
            source = 7 * (column * 3 + row) + 1
            target = 3 * (row * 2 + column)
            triples[target] = first_logs[source]
            triples[target + 1] = first_logs[source + 1]
            triples[target + 2] = first_logs[source + 2]

    status = pari_unit_real_lattice_rank_two(
        triples,
        3,
        real_integers,
        factor,
        real_form,
        lll_basis,
        lll_transform,
        lll_gram,
        lll_mu,
        lll_mu_exponents,
        lll_r,
        lll_r_exponents,
        lll_s,
        lll_s_exponents,
        lll_approximate,
        lll_float_gram,
        lll_alpha,
        lll_column,
        lll_column_exponents,
        lll_normalized,
        lll_temporary,
        lll_dpe_scratch,
        lll_integer_scratch,
        real_state,
    )
    resident_state[2] = status
    if status != 0:
        resident_state[0] = status
        return status

    pari_unit_compose_rank_two(u1, 7, factor, composed)
    pari_log_matrix_transform(exact_logs, composed, 3, 7, 2, False, transformed_logs)
    status = pari_cleanarchunit_mixed_quintic(
        transformed_logs,
        regulator,
        192,
        pi_cache,
        arithmetic_a,
        arithmetic_b,
        arithmetic_p,
        arithmetic_q,
        arithmetic_stack,
        clean_scratch,
        clean,
        clean_state,
    )
    resident_state[3] = status
    if status != 0:
        resident_state[0] = status
        return status

    factor[0] = 1
    factor[1] = 0
    factor[2] = 0
    factor[3] = 1
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
    for row in range(3):
        for column in range(2):
            source = 7 * (column * 3 + row) + 1
            target = 3 * (row * 2 + column)
            triples[target] = matep[source]
            triples[target + 1] = matep[source + 1]
            triples[target + 2] = matep[source + 2]
    status = pari_unit_real_lattice_rank_two(
        triples,
        3,
        real_integers,
        factor,
        real_form,
        lll_basis,
        lll_transform,
        lll_gram,
        lll_mu,
        lll_mu_exponents,
        lll_r,
        lll_r_exponents,
        lll_s,
        lll_s_exponents,
        lll_approximate,
        lll_float_gram,
        lll_alpha,
        lll_column,
        lll_column_exponents,
        lll_normalized,
        lll_temporary,
        lll_dpe_scratch,
        lll_integer_scratch,
        real_state,
    )
    resident_state[4] = status
    if status != 0:
        resident_state[0] = status
        return status
    saved = factor[1]
    factor[1] = factor[2]
    factor[2] = saved
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

    for column in range(5):
        for row in range(5):
            at = 5 * row + column
            if row == 0 or row % 2 == 1:
                place = 0
                if row == 1:
                    place = 1
                elif row == 3:
                    place = 2
                target = 9 * column + 3 * place
                embedding_real[target] = embedding_m[at]
                embedding_real[target + 1] = embedding_p[at]
                embedding_real[target + 2] = embedding_e[at]
            else:
                place = 1
                if row == 4:
                    place = 2
                target = 9 * column + 3 * place
                embedding_imag[target] = embedding_m[at]
                embedding_imag[target + 1] = embedding_p[at]
                embedding_imag[target + 2] = embedding_e[at]
        # The real place has an exact zero imaginary coordinate.
        target = 9 * column
        embedding_imag[target] = 0
        embedding_imag[target + 1] = -1
        embedding_imag[target + 2] = 0

    status = pari_getfu_mixed_quintic(
        arch_real,
        arch_imag,
        clean_real,
        clean_imag,
        factor,
        embedding_real,
        embedding_imag,
        multiplication_tensor,
        192,
        exponential_real,
        exponential_imag,
        split_matrix,
        split_rhs,
        solve_work,
        solve_rhs,
        solved,
        rounded,
        multiplication,
        inverse,
        candidate_units,
        output_units,
        output_logs_real,
        output_logs_imag,
        getfu_state,
        pivots,
        exp_cache,
        pi_cache,
        arithmetic_a,
        arithmetic_b,
        arithmetic_p,
        arithmetic_q,
        arithmetic_stack,
    )
    resident_state[5] = status
    resident_state[6] = getfu_state[6]
    resident_state[7] = getfu_state[5]
    resident_state[0] = status
    return status


__all__ = ["pari_row20_phase6_resident_unit_root"]
