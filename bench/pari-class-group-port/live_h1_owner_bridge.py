"""Live resident-owner bridge for the authentic real-cubic `h = 1` suffix.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This joins three already translated leaves without serialization: unit-lattice
preparation, the pre-`getfu` factor, and the equal-bound/cleanarch final-driver
status.  It publishes compact unit provenance, not expanded fundamental units.
"""

from sagejs.native import Float64Buffer, Int64Buffer, IntegerBuffer, native

from .class_group_final_driver_status import (
    pari_equal_bound_cleanarch_driver_status,
)
from .unit_bridge_cubic import (
    pari_cubic_getfu_factor_rank_two,
    pari_cubic_unit_bridge_prepare,
    pari_cubic_unit_compose_provenance,
)


@native
def pari_live_h1_owner_bridge(
    accepted_arch: IntegerBuffer,
    relation_lattice: IntegerBuffer,
    expected_regulator: IntegerBuffer,
    prep_base_state: IntegerBuffer,
    prep_state: Int64Buffer,
    hnf_state: Int64Buffer,
    acceptance_state: Int64Buffer,
    attempt_state: Int64Buffer,
    class_number: IntegerBuffer,
    columns: int,
    precision: int,
    unit_transform: IntegerBuffer,
    getfu_factor: IntegerBuffer,
    compact_provenance: IntegerBuffer,
    cleaned_arch: IntegerBuffer,
    bridge_state: Int64Buffer,
    u1: IntegerBuffer,
    u2: IntegerBuffer,
    first_arch: IntegerBuffer,
    p_triples: IntegerBuffer,
    au: IntegerBuffer,
    clean_logs: IntegerBuffer,
    signs: Int64Buffer,
    unit_state: Int64Buffer,
    unit_trace: Float64Buffer,
    integer_state: IntegerBuffer,
    integer_basis: IntegerBuffer,
    integer_transform: IntegerBuffer,
    integer_gram: IntegerBuffer,
    integer_mu: Float64Buffer,
    integer_mu_exponents: IntegerBuffer,
    integer_r: Float64Buffer,
    integer_r_exponents: IntegerBuffer,
    integer_s: Float64Buffer,
    integer_s_exponents: IntegerBuffer,
    integer_approximate: Float64Buffer,
    integer_float_gram: Float64Buffer,
    integer_alpha: IntegerBuffer,
    integer_column: IntegerBuffer,
    integer_column_exponents: IntegerBuffer,
    integer_normalized: Float64Buffer,
    integer_temporary: Float64Buffer,
    integer_dpe_scratch: Float64Buffer,
    integer_scratch: IntegerBuffer,
    real_integers: IntegerBuffer,
    real_form: IntegerBuffer,
    real_basis: IntegerBuffer,
    real_transform: IntegerBuffer,
    real_gram: IntegerBuffer,
    real_mu: Float64Buffer,
    real_mu_exponents: IntegerBuffer,
    real_r: Float64Buffer,
    real_r_exponents: IntegerBuffer,
    real_s: Float64Buffer,
    real_s_exponents: IntegerBuffer,
    real_approximate: Float64Buffer,
    real_float_gram: Float64Buffer,
    real_alpha: IntegerBuffer,
    real_column: IntegerBuffer,
    real_column_exponents: IntegerBuffer,
    real_normalized: Float64Buffer,
    real_temporary: Float64Buffer,
    real_dpe_scratch: Float64Buffer,
    real_scratch: IntegerBuffer,
    real_state: IntegerBuffer,
    factor_matep: IntegerBuffer,
    factor_basis: IntegerBuffer,
    factor_transform: IntegerBuffer,
    factor_state: Int64Buffer,
    factor_mu: Float64Buffer,
    factor_mu_exponents: IntegerBuffer,
    factor_r: Float64Buffer,
    factor_r_exponents: IntegerBuffer,
    factor_s: Float64Buffer,
    factor_s_exponents: IntegerBuffer,
    factor_approximate: Float64Buffer,
    factor_float_gram: Float64Buffer,
    factor_alpha: IntegerBuffer,
    factor_column: IntegerBuffer,
    factor_column_exponents: IntegerBuffer,
    factor_normalized: Float64Buffer,
    factor_temporary: Float64Buffer,
    factor_exact_gram: IntegerBuffer,
    clean_pi_cache: IntegerBuffer,
    clean_a: IntegerBuffer,
    clean_b: IntegerBuffer,
    clean_p: IntegerBuffer,
    clean_q: IntegerBuffer,
    clean_stack: IntegerBuffer,
    clean_scratch: IntegerBuffer,
    clean_state: Int64Buffer,
    driver_state: Int64Buffer,
) -> int:
    """Publish the live compact-unit and final-driver handoff.

    `bridge_state` is status, unit-prepare status, factor status, provenance
    status, driver status, columns, class number, invariant count, accepted
    relation count, HNF rank, KCZ, KCZ2, unit rank, compact-factor count,
    cleaned columns, and public-complete.  Outputs are transactional.
    """
    if (
        columns != 7
        or precision != 192
        or len(bridge_state) < 16
        or len(attempt_state) < 4
        or len(class_number) < 1
        or len(unit_transform) < 2 * columns
        or len(getfu_factor) < 4
        or len(compact_provenance) < 2 * columns
        or len(cleaned_arch) < 21 * columns
    ):
        raise ValueError("short live h1 owner bridge input")
    for i in range(16):
        bridge_state[i] = 0
    bridge_state[0] = -1
    if (
        attempt_state[0] != 4
        or attempt_state[1] != 0
        or attempt_state[2] != 0
        or attempt_state[3] != 1
        or class_number[0] != 1
    ):
        bridge_state[0] = 1
        return 1

    status = pari_cubic_unit_bridge_prepare(
        accepted_arch,
        relation_lattice,
        columns,
        expected_regulator,
        u1,
        u2,
        unit_transform,
        first_arch,
        p_triples,
        au,
        clean_logs,
        signs,
        unit_state,
        unit_trace,
        integer_state,
        integer_basis,
        integer_transform,
        integer_gram,
        integer_mu,
        integer_mu_exponents,
        integer_r,
        integer_r_exponents,
        integer_s,
        integer_s_exponents,
        integer_approximate,
        integer_float_gram,
        integer_alpha,
        integer_column,
        integer_column_exponents,
        integer_normalized,
        integer_temporary,
        integer_dpe_scratch,
        integer_scratch,
        real_integers,
        real_form,
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
        real_dpe_scratch,
        real_scratch,
        real_state,
    )
    bridge_state[1] = status
    if status != 0:
        bridge_state[0] = 2
        return 2
    status = pari_cubic_getfu_factor_rank_two(
        clean_logs,
        getfu_factor,
        factor_matep,
        factor_basis,
        factor_transform,
        factor_state,
        factor_mu,
        factor_mu_exponents,
        factor_r,
        factor_r_exponents,
        factor_s,
        factor_s_exponents,
        factor_approximate,
        factor_float_gram,
        factor_alpha,
        factor_column,
        factor_column_exponents,
        factor_normalized,
        factor_temporary,
        factor_exact_gram,
    )
    bridge_state[2] = status
    if status != 0:
        bridge_state[0] = 3
        return 3
    status = pari_cubic_unit_compose_provenance(
        unit_transform, columns, getfu_factor, compact_provenance
    )
    bridge_state[3] = status
    if status != 0:
        bridge_state[0] = 4
        return 4
    status = pari_equal_bound_cleanarch_driver_status(
        prep_base_state,
        prep_state,
        hnf_state,
        acceptance_state,
        accepted_arch,
        columns,
        precision,
        clean_pi_cache,
        clean_a,
        clean_b,
        clean_p,
        clean_q,
        clean_stack,
        clean_scratch,
        cleaned_arch,
        clean_state,
        driver_state,
    )
    bridge_state[4] = status
    if status != 0:
        bridge_state[0] = 5
        return 5
    bridge_state[5] = columns
    bridge_state[6] = class_number[0]
    bridge_state[7] = attempt_state[2]
    bridge_state[8] = hnf_state[7]
    bridge_state[9] = hnf_state[5]
    bridge_state[10] = prep_base_state[3]
    bridge_state[11] = prep_base_state[4]
    bridge_state[12] = 2
    bridge_state[13] = columns
    bridge_state[14] = clean_state[2]
    bridge_state[15] = 0
    bridge_state[0] = 0
    return 0
