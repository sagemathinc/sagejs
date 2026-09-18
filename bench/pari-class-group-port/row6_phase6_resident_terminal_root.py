"""Resident row-6 catalog, analytic, acceptance, regulator, and Smith tail.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This root is deliberately boring: it composes the already reviewed ordinary
Python translations without projecting an intermediate owner through the host.
All storage is supplied by the caller before entry.  Consequently the degree
catalog, analytic inverse-`hR` computation, post-HNF acceptance, regulator
reconstruction, and Smith output execute in one generated native call graph.
"""

from typing import TypedDict

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native, uint64

from .row14_post806_terminal import (
    pari_row14_analytic_inverse_hr,
    pari_row14_post806_terminal,
)
from .row6_prepared_factor_base_root import pari_row6_prime_degree_catalog
from .row6_phase6_resident_unit_private import (
    pari_row6_phase6_resident_unit_private,
)
from .row6_phase6_resident_class_private import (
    pari_row6_phase6_resident_class_private,
)


class Row6UnitManifest(TypedDict):
    columns: uint64
    precision: uint64
    unit_rank: uint64
    expect_large: bool


class Row6ClassManifest(TypedDict):
    rows: uint64
    columns: uint64
    degree: uint64
    kernel_columns: uint64
    class_columns: uint64


@native
def pari_row6_phase6_resident_terminal_root(
    coefficients_exact: IntegerBuffer,
    discriminant: int,
    real_places: int,
    complex_places: int,
    roots_of_unity: int,
    equation_index: int,
    analytic_primes: IntegerBuffer,
    prime_count: int,
    index_prime: int,
    index_ideals: IntegerBuffer,
    index_ranks: IntegerBuffer,
    index_count: int,
    catalog_workspace: IntegerBuffer,
    factor_degrees: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    group_degrees: IntegerBuffer,
    group_counts: IntegerBuffer,
    local_state: IntegerBuffer,
    pattern_offsets: IntegerBuffer,
    pattern_counts: IntegerBuffer,
    pattern_degrees: IntegerBuffer,
    pattern_multiplicities: IntegerBuffer,
    full_offsets: IntegerBuffer,
    full_counts: IntegerBuffer,
    full_degrees: IntegerBuffer,
    catalog_state: IntegerBuffer,
    log_discriminant: Float64Buffer,
    analytic_coefficients: Float64Buffer,
    analytic_table: Float64Buffer,
    analytic_tail: Float64Buffer,
    analytic_logarithms: Float64Buffer,
    log_inverse_residue: Float64Buffer,
    inverse_residue: IntegerBuffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    analytic_a: IntegerBuffer,
    analytic_b: IntegerBuffer,
    analytic_p: IntegerBuffer,
    analytic_q: IntegerBuffer,
    analytic_stack: IntegerBuffer,
    inverse_hr: IntegerBuffer,
    analytic_state: Int64Buffer,
    factor_count: int,
    h_rows: int,
    b_columns: int,
    c_columns: int,
    places: int,
    degree: int,
    h: IntegerBuffer,
    c: IntegerBuffer,
    logs: IntegerBuffer,
    tentative_class_number: IntegerBuffer,
    zeta_factor: IntegerBuffer,
    post_hnf_state: Int64Buffer,
    prepared: IntegerBuffer,
    selected: Int64Buffer,
    prep_state: Int64Buffer,
    rank_work: IntegerBuffer,
    rank_occupied: Int64Buffer,
    rank_pivots: Int64Buffer,
    rank_state: Int64Buffer,
    integer_input: IntegerBuffer,
    integer_work: IntegerBuffer,
    integer_occupied: IntegerBuffer,
    integer_pivots: IntegerBuffer,
    integer_best: IntegerBuffer,
    integer_state: IntegerBuffer,
    basis: IntegerBuffer,
    minor: IntegerBuffer,
    det_work: IntegerBuffer,
    det_result: IntegerBuffer,
    det_pivots: Int64Buffer,
    det_state: Int64Buffer,
    inverse_work: IntegerBuffer,
    inverse_rhs: IntegerBuffer,
    inverse: IntegerBuffer,
    inverse_pivots: Int64Buffer,
    inverse_state: Int64Buffer,
    product: IntegerBuffer,
    inverse_slice: IntegerBuffer,
    multiple: IntegerBuffer,
    coordinates: IntegerBuffer,
    multiple_state: Int64Buffer,
    rational_work: IntegerBuffer,
    lattice: IntegerBuffer,
    regulator_hnf_work: IntegerBuffer,
    regulator_hnf_column: IntegerBuffer,
    regulator_hnf_output: IntegerBuffer,
    regulator_hnf_state: Int64Buffer,
    regulator: IntegerBuffer,
    unit_relations: IntegerBuffer,
    denominator: IntegerBuffer,
    reconstruction_state: Int64Buffer,
    hnf_row_pivots: Int64Buffer,
    hnf_heights: Int64Buffer,
    cache_changed: bool,
    acceptance_state: Int64Buffer,
    factor_base_state: IntegerBuffer,
    preparation_state: Int64Buffer,
    smith_work: IntegerBuffer,
    smith_column: IntegerBuffer,
    invariants: IntegerBuffer,
    class_number: IntegerBuffer,
    smith_state: Int64Buffer,
    terminal_state: Int64Buffer,
    unit_manifest: Row6UnitManifest,
    unit_accepted_arch: IntegerBuffer,
    unit_accepted_signs: Int64Buffer,
    unit_phase_pi: IntegerBuffer,
    unit_preparation_embedding: IntegerBuffer,
    unit_multiplication_basis: IntegerBuffer,
    unit_final_transform: IntegerBuffer,
    unit_bridge_transform: IntegerBuffer,
    unit_getfu_factor: IntegerBuffer,
    unit_clean_logs: IntegerBuffer,
    unit_sign_phases: Int64Buffer,
    unit_c5_state: Int64Buffer,
    unit_c5_trace: Float64Buffer,
    unit_factor_state: Int64Buffer,
    unit_c6_state: Int64Buffer,
    unit_state: Int64Buffer,
    class_manifest: Row6ClassManifest,
    class_raw_relations: IntegerBuffer,
    class_principal_generators: IntegerBuffer,
    class_factor_ideals: IntegerBuffer,
    class_factor_norms: IntegerBuffer,
    class_descriptor_generators: IntegerBuffer,
    class_descriptor_primes: IntegerBuffer,
    class_descriptor_e: IntegerBuffer,
    class_descriptor_f: IntegerBuffer,
    class_descriptor_inert: IntegerBuffer,
    class_multiplication_basis: IntegerBuffer,
    class_raw_to_unit_kernel: IntegerBuffer,
    class_raw_to_presentation: IntegerBuffer,
    class_active_rows: Int64Buffer,
    class_factor_map: IntegerBuffer,
    class_state: Int64Buffer,
    resident_state: Int64Buffer,
) -> int:
    """Execute the connected row-6 post-1,137 native source cut."""
    if len(resident_state) < 14:
        raise ValueError("short row-6 resident terminal state")
    for i in range(14):
        resident_state[i] = 0
    resident_state[0] = -1

    status = pari_row6_prime_degree_catalog(
        coefficients_exact,
        degree,
        equation_index,
        analytic_primes,
        prime_count,
        index_prime,
        index_ideals,
        index_ranks,
        index_count,
        catalog_workspace,
        factor_degrees,
        factor_exponents,
        group_degrees,
        group_counts,
        local_state,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        full_offsets,
        full_counts,
        full_degrees,
        catalog_state,
    )
    resident_state[1] = catalog_state[0]
    if status != 0:
        resident_state[0] = status
        return status

    status = pari_row14_analytic_inverse_hr(
        discriminant,
        real_places,
        complex_places,
        roots_of_unity,
        log_discriminant,
        analytic_primes,
        pattern_offsets,
        pattern_counts,
        pattern_degrees,
        pattern_multiplicities,
        analytic_coefficients,
        analytic_table,
        analytic_tail,
        analytic_logarithms,
        log_inverse_residue,
        inverse_residue,
        exp_cache,
        pi_cache,
        analytic_a,
        analytic_b,
        analytic_p,
        analytic_q,
        analytic_stack,
        inverse_hr,
        analytic_state,
    )
    resident_state[2] = status
    if status != 0:
        resident_state[0] = status
        return status

    status = pari_row14_post806_terminal(
        factor_count,
        h_rows,
        b_columns,
        c_columns,
        places,
        degree,
        h,
        c,
        inverse_hr,
        logs,
        tentative_class_number,
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
        regulator_hnf_work,
        regulator_hnf_column,
        regulator_hnf_output,
        regulator_hnf_state,
        regulator,
        unit_relations,
        denominator,
        reconstruction_state,
        hnf_row_pivots,
        hnf_heights,
        cache_changed,
        acceptance_state,
        factor_base_state,
        preparation_state,
        smith_work,
        smith_column,
        invariants,
        class_number,
        smith_state,
        terminal_state,
    )
    resident_state[3] = status
    if status != 0:
        resident_state[0] = status
        return status

    status = pari_row6_phase6_resident_unit_private(
        unit_manifest,
        unit_accepted_arch,
        unit_accepted_signs,
        unit_phase_pi,
        unit_relations,
        regulator,
        unit_preparation_embedding,
        unit_multiplication_basis,
        unit_final_transform,
        unit_bridge_transform,
        unit_getfu_factor,
        unit_clean_logs,
        unit_sign_phases,
        unit_c5_state,
        unit_c5_trace,
        unit_factor_state,
        unit_c6_state,
        unit_state,
    )
    resident_state[4] = status
    resident_state[5] = smith_state[1]
    resident_state[6] = terminal_state[5]
    resident_state[7] = unit_state[5]
    resident_state[8] = unit_state[6]
    resident_state[9] = unit_state[7]
    if status != 0:
        resident_state[0] = status
        return status

    status = pari_row6_phase6_resident_class_private(
        class_manifest,
        h,
        class_raw_relations,
        class_principal_generators,
        class_factor_ideals,
        class_factor_norms,
        class_descriptor_generators,
        class_descriptor_primes,
        class_descriptor_e,
        class_descriptor_f,
        class_descriptor_inert,
        class_multiplication_basis,
        class_raw_to_unit_kernel,
        class_raw_to_presentation,
        class_active_rows,
        class_factor_map,
        class_state,
    )
    resident_state[10] = status
    resident_state[11] = class_state[1]
    resident_state[12] = class_state[3]
    resident_state[13] = class_state[5]
    resident_state[0] = status
    return status


__all__ = ["pari_row6_phase6_resident_terminal_root"]
