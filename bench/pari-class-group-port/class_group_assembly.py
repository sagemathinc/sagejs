"""PARI 2.17.4 cubic `class_group_gen` assembly after `genback`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This narrow composition leaf joins the existing exact Smith transform and
prepared totally-real cubic `nf_cxlog` implementations.  Its packed result is
PARI's `clg2 = [Ur, ga, GD, Ge, M1, M2]`: `Ge` remains the caller's immutable
factored input, while the other five components are resident output buffers.
It deliberately starts after generic ideal arithmetic has produced `W`, `C`,
and the factored `Ge` multipliers.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .class_group_smith_transform import pari_class_group_smith_transform
from .log_matrix_transform import (
    pari_log_entry_product,
    pari_log_entry_sum,
    pari_log_matrix_transform,
)
from .nf_cxlog import pari_prepared_famat_cxlog


@native
def pari_log_matrix_zero(entries: IntegerBuffer, cells: int) -> int:
    """Write `cells` exact logarithmic zeros in seven-word storage."""
    if cells < 0 or len(entries) < 7 * cells:
        raise ValueError("short logarithm zero owner")
    for cell in range(cells):
        base = 7 * cell
        entries[base] = 1
        entries[base + 1] = 0
        entries[base + 2] = -1
        entries[base + 3] = 0
        entries[base + 4] = 0
        entries[base + 5] = -1
        entries[base + 6] = 0
    return cells


@native
def pari_log_matrix_difference(
    left: IntegerBuffer,
    right: IntegerBuffer,
    cells: int,
    output: IntegerBuffer,
) -> int:
    """Compute source-order `gsub(left,right)` on prepared log entries."""
    if cells < 0 or len(left) < 7 * cells or len(right) < 7 * cells:
        raise ValueError("short logarithm difference input")
    if len(output) < 7 * cells:
        raise ValueError("short logarithm difference output")
    for cell in range(cells):
        base = 7 * cell
        bk, br, brp, bre, bi, bip, bie = pari_log_entry_product(
            -1,
            right[base],
            right[base + 1],
            right[base + 2],
            right[base + 3],
            right[base + 4],
            right[base + 5],
            right[base + 6],
        )
        k, rm, rp, re, im, ip, ie = pari_log_entry_sum(
            left[base],
            left[base + 1],
            left[base + 2],
            left[base + 3],
            left[base + 4],
            left[base + 5],
            left[base + 6],
            bk,
            br,
            brp,
            bre,
            bi,
            bip,
            bie,
        )
        output[base] = k
        output[base + 1] = rm
        output[base + 2] = rp
        output[base + 3] = re
        output[base + 4] = im
        output[base + 5] = ip
        output[base + 6] = ie
    return cells


@native
def pari_class_group_assembly(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    relation_hnf: IntegerBuffer,
    relation_logs: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_numerators: IntegerBuffer,
    factor_denominators: IntegerBuffer,
    factor_coordinates: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    dimension: int,
    generator_count: int,
    precision: int,
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
) -> int:
    """Construct the post-`genback` `class_group_gen` assembly.

    `relation_hnf` is PARI's accepted square `W`; `relation_logs` is the first
    `dimension` columns of `C`, each containing three prepared logarithmic
    entries. `factor_*` is immutable packed `Ge` provenance.  All matrices are
    column-major.

    `assembly_state` is status, dimension, active generators, Smith status,
    cxlog status, checked zero-tail coefficients, published `GD` columns, and
    published `ga` columns. Final archimedean outputs publish only after every
    arithmetic stage succeeds.
    """
    n = dimension
    active = generator_count
    places = 3
    log_width = 7
    size = n * n
    if n < 1 or active < 0 or active > n:
        raise ValueError("invalid class-group assembly shape")
    if len(assembly_state) < 8:
        raise ValueError("short class-group assembly state")
    if (
        len(matrix_m) < 9
        or len(matrix_p) < 9
        or len(matrix_e) < 9
        or len(relation_hnf) < size
        or len(relation_logs) < places * n * log_width
        or len(ga) < places * active * log_width
        or len(gd) < places * active * log_width
        or len(generator_arch) < places * n * log_width
        or len(ga_full) < places * n * log_width
        or len(c_m1) < places * active * log_width
        or len(ga_diagonal) < places * active * log_width
        or len(c_m2) < places * n * log_width
        or len(ga_ur) < places * n * log_width
        or len(gd_work) < places * active * log_width
        or len(generator_arch_work) < places * n * log_width
    ):
        raise ValueError("short class-group assembly owner")
    for i in range(8):
        assembly_state[i] = 0
    assembly_state[0] = -1

    smith_status = pari_class_group_smith_transform(
        relation_hnf,
        n,
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
    assembly_state[3] = smith_status
    if smith_status != 0 or smith_state[1] != active:
        return -1

    cx_state[1] = 0
    cx_status = pari_prepared_famat_cxlog(
        matrix_m,
        matrix_p,
        matrix_e,
        factor_offsets,
        factor_kinds,
        factor_numerators,
        factor_denominators,
        factor_coordinates,
        factor_exponents,
        active,
        precision,
        ga,
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
    )
    assembly_state[4] = cx_status
    if cx_status != 0:
        return 1

    # PARI retains a square Ur even though Ga contains only the non-unit Smith
    # columns.  Its omitted tail is legal because the matching Ur coefficients
    # are zero; make that implicit source invariant explicit before padding.
    pari_log_matrix_zero(ga_full, places * n)
    for column_index in range(active):
        for place in range(places):
            source = (column_index * places + place) * log_width
            for word in range(log_width):
                ga_full[source + word] = ga[source + word]
    checked = 0
    for output_column in range(n):
        for row in range(active, n):
            if ur[output_column * n + row] != 0:
                assembly_state[5] = checked
                return -1
            checked += 1

    pari_log_matrix_transform(relation_logs, m1, places, n, active, True, c_m1)
    for column_index in range(active):
        invariant = invariants[column_index]
        for place in range(places):
            source = (column_index * places + place) * log_width
            k, rm, rp, re, im, ip, ie = pari_log_entry_product(
                invariant,
                ga[source],
                ga[source + 1],
                ga[source + 2],
                ga[source + 3],
                ga[source + 4],
                ga[source + 5],
                ga[source + 6],
            )
            ga_diagonal[source] = k
            ga_diagonal[source + 1] = rm
            ga_diagonal[source + 2] = rp
            ga_diagonal[source + 3] = re
            ga_diagonal[source + 4] = im
            ga_diagonal[source + 5] = ip
            ga_diagonal[source + 6] = ie
    pari_log_matrix_difference(c_m1, ga_diagonal, places * active, gd_work)

    pari_log_matrix_transform(relation_logs, m2, places, n, n, True, c_m2)
    pari_log_matrix_transform(ga_full, ur, places, n, n, True, ga_ur)
    pari_log_matrix_difference(c_m2, ga_ur, places * n, generator_arch_work)

    for i in range(places * active * log_width):
        gd[i] = gd_work[i]
    for i in range(places * n * log_width):
        generator_arch[i] = generator_arch_work[i]
    assembly_state[0] = 0
    assembly_state[1] = n
    assembly_state[2] = active
    assembly_state[5] = checked
    assembly_state[6] = active
    assembly_state[7] = n
    return 0
