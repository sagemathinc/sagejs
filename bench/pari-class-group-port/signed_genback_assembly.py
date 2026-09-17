"""Connected PARI 2.17.4 cubic `genback` and class-group assembly.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is a deliberately narrow composition leaf for a two-row relation HNF
with one nontrivial Smith generator.  It obtains the signed relation from the
first column of PARI's real `Uir` output, runs the existing cubic `genback`
translation, adapts its ordered compact principal factors directly to the
prepared `nf_cxlog` ABI, and only then invokes the existing class-group
assembly.  No factor of `Ge` is an input to this function.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .class_group_assembly import pari_class_group_assembly
from .class_group_smith_transform import pari_class_group_smith_transform
from .signed_prime_ideal_reduction import pari_cubic_genback_tape


@native
def pari_signed_genback_class_group_assembly(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    relation_hnf: IntegerBuffer,
    relation_logs: IntegerBuffer,
    prime_ideals: IntegerBuffer,
    prime_count: int,
    multiplication_table: IntegerBuffer,
    candidates: IntegerBuffer,
    candidate_cursor: IntegerBuffer,
    dimension: int,
    generator_count: int,
    precision: int,
    generator_ideal: IntegerBuffer,
    relation_exponents: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_numerators: IntegerBuffer,
    factor_denominators: IntegerBuffer,
    factor_coordinates: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    compact_values: IntegerBuffer,
    compact_metadata: IntegerBuffer,
    term_kinds: IntegerBuffer,
    term_values: IntegerBuffer,
    term_exponents: IntegerBuffer,
    term_metadata: IntegerBuffer,
    base: IntegerBuffer,
    term: IntegerBuffer,
    current: IntegerBuffer,
    matrix_scratch: IntegerBuffer,
    generators: IntegerBuffer,
    hnf_input: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
    hnf_intermediate: IntegerBuffer,
    inverse_basis: IntegerBuffer,
    congruence_row: IntegerBuffer,
    candidate: IntegerBuffer,
    content: IntegerBuffer,
    multiplication_matrix: IntegerBuffer,
    product: IntegerBuffer,
    inverse_numerator: IntegerBuffer,
    inverse_denominator: IntegerBuffer,
    generated_ideal: IntegerBuffer,
    smith: IntegerBuffer,
    left: IntegerBuffer,
    left_inverse: IntegerBuffer,
    right: IntegerBuffer,
    ur: IntegerBuffer,
    y: IntegerBuffer,
    uir: IntegerBuffer,
    x: IntegerBuffer,
    m1: IntegerBuffer,
    m2: IntegerBuffer,
    invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    ga: IntegerBuffer,
    gd: IntegerBuffer,
    generator_arch: IntegerBuffer,
    smith_column: IntegerBuffer,
    smith_product: IntegerBuffer,
    smith_augmented: IntegerBuffer,
    left_inverse_state: Int64Buffer,
    right_inverse_state: Int64Buffer,
    first_division_state: Int64Buffer,
    second_division_state: Int64Buffer,
    smith_state: Int64Buffer,
    cx_state: IntegerBuffer,
    cx_coordinates: IntegerBuffer,
    cx_column: IntegerBuffer,
    cx_accumulator: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    arithmetic_a: IntegerBuffer,
    arithmetic_b: IntegerBuffer,
    arithmetic_p: IntegerBuffer,
    arithmetic_q: IntegerBuffer,
    arithmetic_stack: IntegerBuffer,
    ga_full: IntegerBuffer,
    c_m1: IntegerBuffer,
    ga_diagonal: IntegerBuffer,
    c_m2: IntegerBuffer,
    ga_ur: IntegerBuffer,
    gd_work: IntegerBuffer,
    generator_arch_work: IntegerBuffer,
    assembly_state: Int64Buffer,
    connection_state: Int64Buffer,
) -> int:
    """Construct one cubic class-group generator from its real Smith column.

    The admitted cut is exactly `dimension == prime_count == 2` and
    `generator_count == 1`. Matrices are column-major except the cubic ideal
    and multiplication-table owners, whose row-major layouts are inherited
    from `pari_cubic_genback_tape`.

    `connection_state` records status, nonzero genback terms, compact factor
    count, consumed candidate count, checked Smith-order rows, and the two
    signed `Uir` entries. The final ideal is published only after the
    connected class-group assembly succeeds.
    """
    if len(connection_state) < 7:
        raise ValueError("short genback-assembly state")
    for i in range(7):
        connection_state[i] = 0
    connection_state[0] = -1
    if dimension != 2 or prime_count != 2 or generator_count != 1:
        raise ValueError("unsupported genback-assembly shape")
    if (
        len(generator_ideal) < 9
        or len(generated_ideal) < 9
        or len(relation_exponents) < 2
        or len(factor_offsets) < 2
        or len(compact_metadata) < 1
    ):
        raise ValueError("short genback-assembly output")

    smith_status = pari_class_group_smith_transform(
        relation_hnf,
        dimension,
        smith,
        left,
        left_inverse,
        right,
        ur,
        y,
        uir,
        x,
        m1,
        m2,
        invariants,
        class_number,
        smith_column,
        smith_product,
        smith_augmented,
        left_inverse_state,
        right_inverse_state,
        first_division_state,
        second_division_state,
        smith_state,
    )
    if smith_status != 0 or smith_state[1] != generator_count:
        return -1

    # The first active Smith column is the source relation consumed by
    # buch2.c:genback. Keep its signed entries in original factor-base order.
    relation_exponents[0] = uir[0]
    relation_exponents[1] = uir[1]
    connection_state[5] = relation_exponents[0]
    connection_state[6] = relation_exponents[1]

    # Independently retain the exact Smith order identity Uir*D == W*M1.
    checked_rows = 0
    invariant = invariants[0]
    for row in range(2):
        left_value = relation_exponents[row] * invariant
        right_value = 0
        for inner in range(2):
            right_value += relation_hnf[inner * 2 + row] * m1[inner]
        if left_value != right_value:
            return -1
        checked_rows += 1
    connection_state[4] = checked_rows

    used = pari_cubic_genback_tape(
        prime_ideals,
        relation_exponents,
        prime_count,
        multiplication_table,
        candidates,
        candidate_cursor,
        factor_kinds,
        compact_values,
        factor_exponents,
        compact_metadata,
        term_kinds,
        term_values,
        term_exponents,
        term_metadata,
        base,
        term,
        current,
        matrix_scratch,
        generators,
        hnf_input,
        hnf_work,
        hnf_triangular,
        hnf_moduli,
        hnf_intermediate,
        inverse_basis,
        congruence_row,
        candidate,
        content,
        multiplication_matrix,
        product,
        inverse_numerator,
        inverse_denominator,
        generated_ideal,
    )
    connection_state[1] = used
    count = compact_metadata[0]
    connection_state[2] = count
    connection_state[3] = candidate_cursor[0]
    if (
        count < 0
        or count > len(factor_kinds)
        or count > len(factor_exponents)
        or len(compact_values) < 4 * count
        or len(factor_numerators) < count
        or len(factor_denominators) < count
        or len(factor_coordinates) < 3 * count
    ):
        raise ValueError("short generated factor adapter")
    factor_offsets[0] = 0
    factor_offsets[1] = count
    for factor_index in range(count):
        value = 4 * factor_index
        coordinates = 3 * factor_index
        kind = factor_kinds[factor_index]
        if kind == 0:
            factor_numerators[factor_index] = compact_values[value]
            factor_denominators[factor_index] = compact_values[value + 3]
            factor_coordinates[coordinates] = 0
            factor_coordinates[coordinates + 1] = 0
            factor_coordinates[coordinates + 2] = 0
        elif kind == 1:
            factor_numerators[factor_index] = 0
            factor_denominators[factor_index] = 1
            factor_coordinates[coordinates] = compact_values[value]
            factor_coordinates[coordinates + 1] = compact_values[value + 1]
            factor_coordinates[coordinates + 2] = compact_values[value + 2]
        else:
            raise ValueError("invalid generated factor kind")

    status = pari_class_group_assembly(
        matrix_m,
        matrix_p,
        matrix_e,
        relation_hnf,
        relation_logs,
        factor_offsets,
        factor_kinds,
        factor_numerators,
        factor_denominators,
        factor_coordinates,
        factor_exponents,
        dimension,
        generator_count,
        precision,
        smith,
        left,
        left_inverse,
        right,
        ur,
        y,
        uir,
        x,
        m1,
        m2,
        invariants,
        class_number,
        ga,
        gd,
        generator_arch,
        smith_column,
        smith_product,
        smith_augmented,
        left_inverse_state,
        right_inverse_state,
        first_division_state,
        second_division_state,
        smith_state,
        cx_state,
        cx_coordinates,
        cx_column,
        cx_accumulator,
        log_cache,
        pi_cache,
        arithmetic_a,
        arithmetic_b,
        arithmetic_p,
        arithmetic_q,
        arithmetic_stack,
        ga_full,
        c_m1,
        ga_diagonal,
        c_m2,
        ga_ur,
        gd_work,
        generator_arch_work,
        assembly_state,
    )
    if status != 0:
        return status
    for i in range(9):
        generator_ideal[i] = generated_ideal[i]
    connection_state[0] = 0
    return 0
