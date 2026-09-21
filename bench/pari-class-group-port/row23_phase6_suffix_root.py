"""One-call resident row-23 post-HNF class-and-unit suffix.

This experimental root deliberately exposes the large analytic catalog owners
and the high-capacity exact ``getfu`` arena at the boundary.  Everything else
is fixed bounded storage owned by the compiled call graph.  The source is
ordinary CPython-parseable Python; the native compiler privately clones its
imported mathematical dependencies.
"""

from sagejs.native import (
    Float64Buffer,
    Int64Buffer,
    IntegerBuffer,
    float64_workspace,
    int64_workspace,
    integer_buffer_view,
    integer_workspace,
    native,
)

from .log_matrix_transform import pari_log_matrix_transform
from .row14_post806_terminal import pari_row14_analytic_inverse_hr
from .row23_analytic_catalog import pari_row23_analytic_degree_catalog
from .row23_post_hnf_acceptance import pari_row23_post_hnf_acceptance
from .row23_rank4_unit_lattice import (
    pari_cleanarchunit_50_quintic,
    pari_prepare_getfu_50_quintic,
    pari_unit_compose_rank_four,
    pari_unit_integer_lattice_rank_four,
    pari_unit_real_lattice_rank_four,
)
from .row23_totally_real_getfu import pari_row23_totally_real_getfu


@native
def pari_row23_phase6_suffix_root(
    polynomial: IntegerBuffer,
    multiplication_basis: IntegerBuffer,
    analytic_primes: IntegerBuffer,
    analytic_prime_count: int,
    discriminant: int,
    roots_of_unity: int,
    catalog_workspace: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    pattern_multiplicities: IntegerBuffer,
    hnf_result_h: IntegerBuffer,
    hnf_result_c: IntegerBuffer,
    embedding_matrix: IntegerBuffer,
    work_arena: IntegerBuffer,
    exact_arena: IntegerBuffer,
    output_units: IntegerBuffer,
    output_norms: IntegerBuffer,
    output_class_number: IntegerBuffer,
    output_invariants: IntegerBuffer,
    root_state: Int64Buffer,
) -> int:
    """Compute row 23 from live HNF owners through exact fundamental units."""

    # Frozen row-23 corridor.  The large owners are boundary-owned so this
    # graph remains below the compiler's one-megabyte local-workspace ceiling.
    if (
        analytic_prime_count != 1230
        or len(polynomial) < 6
        or len(multiplication_basis) < 125
        or len(analytic_primes) < 1230
        or len(catalog_workspace) < 12000
        or len(pattern_offsets) < 1230
        or len(pattern_counts) < 1230
        or len(pattern_degrees) < 6150
        or len(pattern_multiplicities) < 6150
        or len(hnf_result_h) < 1
        or len(hnf_result_c) < 1400
        or len(embedding_matrix) < 75
        or len(work_arena) < 6144
        or len(exact_arena) < 2574
        or len(output_units) < 20
        or len(output_norms) < 4
        or len(output_class_number) < 1
        or len(output_invariants) < 1
        or len(root_state) < 24
    ):
        raise ValueError("short row-23 suffix boundary")
    for i in range(24):
        root_state[i] = 0
    root_state[0] = -1

    catalog_state: IntegerBuffer = integer_workspace(4, 2)
    status = pari_row23_analytic_degree_catalog(
        polynomial,
        multiplication_basis,
        analytic_primes,
        analytic_prime_count,
        catalog_workspace,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        catalog_state,
    )
    root_state[1] = status
    if status != 0:
        return 1
    groups = catalog_state[2]

    # Analytic inverse-hR preparation.
    log_discriminant: Float64Buffer = float64_workspace(1)
    coefficients: Float64Buffer = float64_workspace(7)
    analytic_table: Float64Buffer = float64_workspace(31)
    tail: Float64Buffer = float64_workspace(1)
    logarithms: Float64Buffer = float64_workspace(1230)
    log_inverse_residue: Float64Buffer = float64_workspace(1)
    inverse_residue: IntegerBuffer = integer_workspace(3, 32)
    analytic_exp_cache: IntegerBuffer = integer_workspace(3, 32)
    analytic_pi_cache: IntegerBuffer = integer_workspace(3, 32)
    analytic_a: IntegerBuffer = integer_workspace(64, 32)
    analytic_b: IntegerBuffer = integer_workspace(64, 32)
    analytic_p: IntegerBuffer = integer_workspace(64, 32)
    analytic_q: IntegerBuffer = integer_workspace(64, 32)
    analytic_stack: IntegerBuffer = integer_workspace(128, 32)
    inverse_hr: IntegerBuffer = integer_workspace(3, 32)
    analytic_state: Int64Buffer = int64_workspace(2)
    status = pari_row14_analytic_inverse_hr(
        discriminant,
        5,
        0,
        roots_of_unity,
        log_discriminant,
        analytic_primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        coefficients,
        analytic_table,
        tail,
        logarithms,
        log_inverse_residue,
        inverse_residue,
        analytic_exp_cache,
        analytic_pi_cache,
        analytic_a,
        analytic_b,
        analytic_p,
        analytic_q,
        analytic_stack,
        inverse_hr,
        analytic_state,
    )
    root_state[2] = status
    root_state[3] = groups
    if status != 0:
        return 2

    # Connected post-HNF acceptance.  Every shape is fixed by row 23:
    # places=5, zero columns=9, unit rank=4.
    logs: IntegerBuffer = integer_workspace(135, 32)
    class_number: IntegerBuffer = integer_workspace(1, 32)
    zeta_factor: IntegerBuffer = integer_workspace(3, 32)
    post_hnf_state: Int64Buffer = int64_workspace(3)
    prepared: IntegerBuffer = integer_workspace(150, 32)
    selected: Int64Buffer = int64_workspace(10)
    prep_state: Int64Buffer = int64_workspace(3)
    rank_work: IntegerBuffer = integer_workspace(150, 32)
    rank_occupied: Int64Buffer = int64_workspace(5)
    rank_pivots: Int64Buffer = int64_workspace(10)
    rank_state: Int64Buffer = int64_workspace(3)
    integer_input: IntegerBuffer = integer_workspace(50, 32)
    integer_work: IntegerBuffer = integer_workspace(50, 32)
    integer_occupied: IntegerBuffer = integer_workspace(5, 32)
    integer_pivots: IntegerBuffer = integer_workspace(10, 32)
    integer_best: IntegerBuffer = integer_workspace(10, 32)
    integer_state: IntegerBuffer = integer_workspace(10, 32)
    basis: IntegerBuffer = integer_workspace(75, 32)
    minor: IntegerBuffer = integer_workspace(75, 32)
    det_work: IntegerBuffer = integer_workspace(75, 32)
    det_result: IntegerBuffer = integer_workspace(3, 32)
    det_pivots: Int64Buffer = int64_workspace(5)
    det_state: Int64Buffer = int64_workspace(5)
    inverse_work: IntegerBuffer = integer_workspace(75, 32)
    inverse_rhs: IntegerBuffer = integer_workspace(75, 32)
    inverse: IntegerBuffer = integer_workspace(75, 32)
    inverse_pivots: Int64Buffer = int64_workspace(5)
    inverse_state: Int64Buffer = int64_workspace(3)
    product: IntegerBuffer = integer_workspace(75, 32)
    inverse_slice: IntegerBuffer = integer_workspace(75, 32)
    multiple: IntegerBuffer = integer_workspace(3, 32)
    coordinates: IntegerBuffer = integer_workspace(108, 32)
    multiple_state: Int64Buffer = int64_workspace(4)
    rational_work: IntegerBuffer = integer_workspace(108, 32)
    lattice: IntegerBuffer = integer_workspace(36, 32)
    hnf_work: IntegerBuffer = integer_workspace(36, 32)
    hnf_column: IntegerBuffer = integer_workspace(4, 32)
    hnf_output: IntegerBuffer = integer_workspace(36, 32)
    hnf_state: Int64Buffer = int64_workspace(15)
    regulator: IntegerBuffer = integer_workspace(3, 32)
    relations: IntegerBuffer = integer_workspace(36, 32)
    denominator: IntegerBuffer = integer_workspace(1, 32)
    reconstruction_state: Int64Buffer = int64_workspace(4)
    hnf_row_pivots: Int64Buffer = int64_workspace(4)
    hnf_heights: Int64Buffer = int64_workspace(9)
    acceptance_state: Int64Buffer = int64_workspace(3)
    status = pari_row23_post_hnf_acceptance(
        31,
        1,
        30,
        40,
        5,
        5,
        hnf_result_h,
        hnf_result_c,
        inverse_hr,
        logs,
        class_number,
        zeta_factor,
        post_hnf_state,
        prepared,
        selected,
        prep_state,
        rank_work,
        rank_occupied,
        rank_pivots,
        rank_state,
        integer_input,
        integer_work,
        integer_occupied,
        integer_pivots,
        integer_best,
        integer_state,
        basis,
        minor,
        det_work,
        det_result,
        det_pivots,
        det_state,
        inverse_work,
        inverse_rhs,
        inverse,
        inverse_pivots,
        inverse_state,
        product,
        inverse_slice,
        multiple,
        coordinates,
        multiple_state,
        rational_work,
        lattice,
        hnf_work,
        hnf_column,
        hnf_output,
        hnf_state,
        regulator,
        relations,
        denominator,
        reconstruction_state,
        hnf_row_pivots,
        hnf_heights,
        True,
        acceptance_state,
    )
    root_state[4] = status
    if status != 0:
        return 3
    output_class_number[0] = class_number[0]
    output_invariants[0] = hnf_result_h[0]

    # First (integer) rank-four LLL.
    u1: IntegerBuffer = integer_workspace(36, 32)
    integer_lll_state: IntegerBuffer = integer_workspace(5, 4)
    lll_basis: IntegerBuffer = integer_workspace(36, 32)
    lll_transform: IntegerBuffer = integer_workspace(81, 32)
    lll_gram: IntegerBuffer = integer_workspace(81, 64)
    lll_mu: Float64Buffer = float64_workspace(81)
    lll_mu_exponents: IntegerBuffer = integer_workspace(81, 2)
    lll_r: Float64Buffer = float64_workspace(81)
    lll_r_exponents: IntegerBuffer = integer_workspace(81, 2)
    lll_s: Float64Buffer = float64_workspace(9)
    lll_s_exponents: IntegerBuffer = integer_workspace(9, 2)
    lll_approximate: Float64Buffer = float64_workspace(36)
    lll_float_gram: Float64Buffer = float64_workspace(81)
    lll_alpha: IntegerBuffer = integer_workspace(9, 4)
    lll_column: IntegerBuffer = integer_workspace(9, 32)
    lll_column_exponents: IntegerBuffer = integer_workspace(9, 2)
    lll_normalized: Float64Buffer = float64_workspace(9)
    lll_temporary: Float64Buffer = float64_workspace(9)
    lll_dpe_float_scratch: Float64Buffer = float64_workspace(9)
    lll_integer_scratch: IntegerBuffer = integer_workspace(9, 32)
    status = pari_unit_integer_lattice_rank_four(
        relations,
        9,
        u1,
        integer_lll_state,
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
        lll_dpe_float_scratch,
        lll_integer_scratch,
    )
    root_state[5] = status
    if status != 0:
        return 4

    first_logs: IntegerBuffer = integer_workspace(140, 32)
    status = pari_log_matrix_transform(hnf_result_c, u1, 5, 9, 4, False, first_logs)
    if status != 0:
        return 5
    first_triples: IntegerBuffer = integer_workspace(60, 32)
    for row in range(5):
        for column_index in range(4):
            source = 7 * (column_index * 5 + row) + 1
            target = 3 * (row * 4 + column_index)
            for cell in range(3):
                first_triples[target + cell] = first_logs[source + cell]

    # Reused fixed real-LLL workspace (5 by 4).
    real_integers: IntegerBuffer = integer_workspace(20, 32)
    u2: IntegerBuffer = integer_workspace(16, 32)
    real_basis: IntegerBuffer = integer_workspace(20, 32)
    real_transform: IntegerBuffer = integer_workspace(16, 32)
    real_gram: IntegerBuffer = integer_workspace(16, 64)
    real_mu: Float64Buffer = float64_workspace(16)
    real_mu_exponents: IntegerBuffer = integer_workspace(16, 2)
    real_r: Float64Buffer = float64_workspace(16)
    real_r_exponents: IntegerBuffer = integer_workspace(16, 2)
    real_s: Float64Buffer = float64_workspace(4)
    real_s_exponents: IntegerBuffer = integer_workspace(4, 2)
    real_approximate: Float64Buffer = float64_workspace(20)
    real_float_gram: Float64Buffer = float64_workspace(16)
    real_alpha: IntegerBuffer = integer_workspace(4, 4)
    real_column: IntegerBuffer = integer_workspace(5, 32)
    real_column_exponents: IntegerBuffer = integer_workspace(5, 2)
    real_normalized: Float64Buffer = float64_workspace(5)
    real_temporary: Float64Buffer = float64_workspace(5)
    real_dpe_float_scratch: Float64Buffer = float64_workspace(5)
    real_integer_scratch: IntegerBuffer = integer_workspace(5, 32)
    real_state: IntegerBuffer = integer_workspace(2, 4)
    status = pari_unit_real_lattice_rank_four(
        first_triples,
        5,
        real_integers,
        u2,
        real_basis,
        real_transform,
        real_gram,
        real_mu,
        real_mu_exponents,
        real_r,
        real_r_exponents,
        real_s,
        real_s_exponents,
        real_approximate,
        real_float_gram,
        real_alpha,
        real_column,
        real_column_exponents,
        real_normalized,
        real_temporary,
        real_dpe_float_scratch,
        real_integer_scratch,
        real_state,
    )
    root_state[6] = status
    if status != 0:
        return 6
    unit_transform: IntegerBuffer = integer_workspace(36, 32)
    status = pari_unit_compose_rank_four(u1, 9, u2, unit_transform)
    if status != 0:
        return 7
    unit_logs: IntegerBuffer = integer_workspace(140, 32)
    status = pari_log_matrix_transform(
        hnf_result_c, unit_transform, 5, 9, 4, False, unit_logs
    )
    if status != 0:
        return 8

    clean_scratch: IntegerBuffer = integer_workspace(140, 32)
    clean: IntegerBuffer = integer_workspace(140, 32)
    clean_state: IntegerBuffer = integer_workspace(7, 4)
    clean_pi: IntegerBuffer = integer_workspace(3, 32)
    clean_a: IntegerBuffer = integer_buffer_view(work_arena, 0, 1024)
    clean_b: IntegerBuffer = integer_buffer_view(work_arena, 1024, 1024)
    clean_p: IntegerBuffer = integer_buffer_view(work_arena, 2048, 1024)
    clean_q: IntegerBuffer = integer_buffer_view(work_arena, 3072, 1024)
    clean_stack: IntegerBuffer = integer_buffer_view(work_arena, 4096, 2048)
    status = pari_cleanarchunit_50_quintic(
        unit_logs,
        regulator,
        256,
        clean_pi,
        clean_a,
        clean_b,
        clean_p,
        clean_q,
        clean_stack,
        clean_scratch,
        clean,
        clean_state,
    )
    root_state[7] = status
    if status != 0:
        return 9

    identity: IntegerBuffer = integer_workspace(16, 2)
    for i in range(16):
        identity[i] = 0
    for i in range(4):
        identity[5 * i] = 1
    matep: IntegerBuffer = integer_workspace(140, 32)
    arch: IntegerBuffer = integer_workspace(140, 32)
    candidate: IntegerBuffer = integer_workspace(140, 32)
    arch_real: IntegerBuffer = integer_workspace(60, 32)
    clean_real: IntegerBuffer = integer_workspace(60, 32)
    status = pari_prepare_getfu_50_quintic(
        clean, identity, matep, arch, candidate, arch_real, clean_real
    )
    if status != 0:
        return 10
    private_triples: IntegerBuffer = integer_workspace(60, 32)
    for row in range(5):
        for column_index in range(4):
            source = 7 * (column_index * 5 + row) + 1
            target = 3 * (row * 4 + column_index)
            for cell in range(3):
                private_triples[target + cell] = matep[source + cell]
    status = pari_unit_real_lattice_rank_four(
        private_triples,
        5,
        real_integers,
        u2,
        real_basis,
        real_transform,
        real_gram,
        real_mu,
        real_mu_exponents,
        real_r,
        real_r_exponents,
        real_s,
        real_s_exponents,
        real_approximate,
        real_float_gram,
        real_alpha,
        real_column,
        real_column_exponents,
        real_normalized,
        real_temporary,
        real_dpe_float_scratch,
        real_integer_scratch,
        real_state,
    )
    if status != 0:
        return 11
    factor: IntegerBuffer = integer_workspace(16, 32)
    for column_index in range(4):
        for row in range(4):
            factor[4 * column_index + row] = u2[4 * row + column_index]
    status = pari_prepare_getfu_50_quintic(
        clean, factor, matep, arch, candidate, arch_real, clean_real
    )
    if status != 0:
        return 12

    # One high-capacity arena, sliced without allocation, supplies getfu.
    at = 0
    exponential_rhs: IntegerBuffer = integer_buffer_view(exact_arena, at, 60)
    at += 60
    exponential_imaginary: IntegerBuffer = integer_buffer_view(exact_arena, at, 60)
    at += 60
    solve_work: IntegerBuffer = integer_buffer_view(exact_arena, at, 75)
    at += 75
    solve_rhs: IntegerBuffer = integer_buffer_view(exact_arena, at, 60)
    at += 60
    solved: IntegerBuffer = integer_buffer_view(exact_arena, at, 60)
    at += 60
    rounded: IntegerBuffer = integer_buffer_view(exact_arena, at, 20)
    at += 20
    candidate_units: IntegerBuffer = integer_buffer_view(exact_arena, at, 20)
    at += 20
    candidate_inverses: IntegerBuffer = integer_buffer_view(exact_arena, at, 20)
    at += 20
    multiplication: IntegerBuffer = integer_buffer_view(exact_arena, at, 25)
    at += 25
    inverse: IntegerBuffer = integer_buffer_view(exact_arena, at, 5)
    at += 5
    exp_cache: IntegerBuffer = integer_buffer_view(exact_arena, at, 3)
    at += 3
    pi_cache: IntegerBuffer = integer_buffer_view(exact_arena, at, 3)
    at += 3
    agm_a: IntegerBuffer = integer_buffer_view(exact_arena, at, 512)
    at += 512
    agm_b: IntegerBuffer = integer_buffer_view(exact_arena, at, 512)
    at += 512
    agm_p: IntegerBuffer = integer_buffer_view(exact_arena, at, 512)
    at += 512
    agm_q: IntegerBuffer = integer_buffer_view(exact_arena, at, 512)
    at += 512
    agm_stack: IntegerBuffer = integer_buffer_view(exact_arena, at, 91)
    pivots: Int64Buffer = int64_workspace(5)
    solve_state: Int64Buffer = int64_workspace(5)
    getfu_state: Int64Buffer = int64_workspace(6)
    status = pari_row23_totally_real_getfu(
        candidate,
        embedding_matrix,
        multiplication_basis,
        exponential_rhs,
        exponential_imaginary,
        solve_work,
        solve_rhs,
        solved,
        rounded,
        candidate_units,
        candidate_inverses,
        output_units,
        output_norms,
        multiplication,
        inverse,
        pivots,
        solve_state,
        getfu_state,
        exp_cache,
        pi_cache,
        agm_a,
        agm_b,
        agm_p,
        agm_q,
        agm_stack,
    )
    root_state[8] = status
    root_state[9] = getfu_state[1]
    root_state[10] = getfu_state[3]
    root_state[11] = getfu_state[4]
    if status != 0:
        return 13
    root_state[0] = 0
    return 0


__all__ = ["pari_row23_phase6_suffix_root"]
