"""Authenticated analytic acceptance for the hard mixed quartic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This experiment assumes PARI 2.17.4's analytic bounds.  It derives the
inverse residue and `h / (hR)` factor from prepared field data, and joins
that owner to terminal HNF and regulator-multiple owners.  No class number,
regulator, denominator, or unit is an input.
"""

from sagejs.native import Float64Buffer, IntegerBuffer, Int64Buffer, native

from .analytic_inverse_hr import pari_analytic_inverse_hr
from .discriminant_log import pari_discriminant_log
from .field3_high_precision_regulator_schedule import (
    pari_field3_regulator_owner_latches,
)
from .live_retry_control import pari_live_retry_transition
from .post_hnf_regulator_inputs import pari_post_hnf_class_factor
from .regulator_reconstruction import pari_regulator_reconstruction


_MODULUS1 = 2305843009213693951
_MODULUS2 = 2305843009213693921


@native
def pari_field3_catalog_latches(
    primes: IntegerBuffer,
    prime_count: int,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    factor_count: int,
) -> tuple[int, int]:
    """Hash the logical prepared prime catalog without trusting spare capacity."""
    if (
        prime_count < 1
        or factor_count < 1
        or len(primes) < prime_count
        or len(offsets) < prime_count
        or len(counts) < prime_count
        or len(degrees) < factor_count
        or len(multiplicities) < factor_count
        or offsets[0] != 0
        or offsets[prime_count - 1] + counts[prime_count - 1] != factor_count
    ):
        raise ValueError("invalid field-3 prepared prime catalog")
    first = prime_count + 17 * factor_count
    second = 3 * prime_count + 19 * factor_count
    logical = 0
    for section in range(5):
        length = prime_count
        if section >= 3:
            length = factor_count
        first = (first * 1000003 + length + section) % _MODULUS1
        second = (second * 1000033 + length + section) % _MODULUS2
        for index in range(length):
            value = multiplicities[index]
            if section == 0:
                value = primes[index]
            elif section == 1:
                value = offsets[index]
            elif section == 2:
                value = counts[index]
            elif section == 3:
                value = degrees[index]
            first = (first * 1000003 + value % _MODULUS1 + logical + 1) % _MODULUS1
            second = (second * 1000033 + value % _MODULUS2 + logical + 1) % _MODULUS2
            logical += 1
    return first, second


@native
def pari_field3_analytic_preparation(
    polynomial: IntegerBuffer,
    discriminant: int,
    real_places: int,
    complex_places: int,
    roots_of_unity: int,
    primes: IntegerBuffer,
    prime_count: int,
    offsets: IntegerBuffer,
    counts: IntegerBuffer,
    degrees: IntegerBuffer,
    multiplicities: IntegerBuffer,
    factor_count: int,
    expected_catalog_latches: Int64Buffer,
    log_discriminant: Float64Buffer,
    coefficients: Float64Buffer,
    table: Float64Buffer,
    tail: Float64Buffer,
    logarithms: Float64Buffer,
    log_inverse_residue: Float64Buffer,
    candidate_inverse_residue: IntegerBuffer,
    exp_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    inverse_hr: IntegerBuffer,
    owner_state: Int64Buffer,
) -> int:
    """Derive and atomically publish field 3's analytic inverse-hR owner.

    `owner_state` is `[bound, processed, catalog1, catalog2,
    inverse_hr_latch, ready]`.  Scratch may change after arithmetic starts;
    `inverse_hr` and `owner_state` publish only after the complete path.
    """
    if (
        len(polynomial) < 5
        or polynomial[0] != -2000042
        or polynomial[1] != -2000022
        or polynomial[2] != 0
        or polynomial[3] != 0
        or polynomial[4] != 1
        or discriminant != 315574182938393724979760
        or real_places != 2
        or complex_places != 1
        or roots_of_unity != 2
    ):
        raise ValueError("wrong field-3 prepared field identity")
    if (
        len(expected_catalog_latches) < 2
        or len(log_discriminant) < 1
        or len(candidate_inverse_residue) < 3
        or len(inverse_hr) < 3
        or len(owner_state) < 6
    ):
        raise ValueError("short field-3 analytic owner")
    catalog1, catalog2 = pari_field3_catalog_latches(
        primes,
        prime_count,
        offsets,
        counts,
        degrees,
        multiplicities,
        factor_count,
    )
    if (
        catalog1 != expected_catalog_latches[0]
        or catalog2 != expected_catalog_latches[1]
    ):
        raise ValueError("field-3 prepared prime catalog integrity failure")
    log_discriminant[0] = pari_discriminant_log(discriminant)
    bound, processed, hm, hp, he = pari_analytic_inverse_hr(
        discriminant,
        real_places,
        complex_places,
        roots_of_unity,
        log_discriminant,
        primes,
        offsets,
        counts,
        degrees,
        multiplicities,
        coefficients,
        table,
        tail,
        logarithms,
        log_inverse_residue,
        candidate_inverse_residue,
        exp_cache,
        pi_cache,
        a,
        b,
        p,
        q,
        stack,
    )
    latch = (hm % _MODULUS1 + 1000003 * hp + 1000033 * (he % _MODULUS1)) % _MODULUS1
    inverse_hr[0] = hm
    inverse_hr[1] = hp
    inverse_hr[2] = he
    owner_state[0] = bound
    owner_state[1] = processed
    owner_state[2] = catalog1
    owner_state[3] = catalog2
    owner_state[4] = latch
    owner_state[5] = 1
    return 0


@native
def pari_field3_analytic_acceptance(
    packed_a: IntegerBuffer,
    expected_c3_latches: Int64Buffer,
    multiple_owner_state: Int64Buffer,
    terminal_hnf: IntegerBuffer,
    terminal_hnf_owner_state: Int64Buffer,
    inverse_hr: IntegerBuffer,
    analytic_owner_state: Int64Buffer,
    current_precision: int,
    getfu_status: int,
    coordinates: IntegerBuffer,
    multiple: IntegerBuffer,
    candidate_class_number: IntegerBuffer,
    candidate_zeta_factor: IntegerBuffer,
    rational_work: IntegerBuffer,
    integer_work: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_column: IntegerBuffer,
    hnf_output: IntegerBuffer,
    hnf_state: Int64Buffer,
    candidate_regulator: IntegerBuffer,
    candidate_relations: IntegerBuffer,
    candidate_denominator: IntegerBuffer,
    reconstruction_state: Int64Buffer,
    hnf_row_pivots: Int64Buffer,
    hnf_heights: Int64Buffer,
    retry_work: Int64Buffer,
    class_number: IntegerBuffer,
    zeta_factor: IntegerBuffer,
    regulator: IntegerBuffer,
    relations: IntegerBuffer,
    denominator: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Run live `compute_R` acceptance and publish only accepted owners.

    The regulator-multiple owner state is `[status, rows, columns, precision,
    c3_latch1, c3_latch2, complete]`. Output state is `[compute_R status,
    retry flag, retry target, getfu terminal flag, published, precision]`.
    A compute_R PRECI restarts Buchall; a later getfu PRECI is terminal.
    """
    size = 26
    if (
        len(expected_c3_latches) < 2
        or len(multiple_owner_state) < 7
        or len(terminal_hnf) < 4
        or len(terminal_hnf_owner_state) < 5
        or len(analytic_owner_state) < 6
        or len(candidate_class_number) < 1
        or len(candidate_zeta_factor) < 3
        or len(candidate_regulator) < 3
        or len(candidate_relations) < size
        or len(candidate_denominator) < 1
        or len(retry_work) < 6
        or len(class_number) < 1
        or len(zeta_factor) < 3
        or len(regulator) < 3
        or len(relations) < size
        or len(denominator) < 1
        or len(state) < 6
    ):
        raise ValueError("short field-3 analytic acceptance owner")
    if (
        current_precision < 64
        or current_precision > 1048576
        or current_precision % 64 != 0
        or (getfu_status != 0 and getfu_status != 3)
    ):
        raise ValueError("invalid field-3 acceptance precision protocol")
    c3_latch1, c3_latch2 = pari_field3_regulator_owner_latches(packed_a, 273)
    if (
        c3_latch1 != expected_c3_latches[0]
        or c3_latch2 != expected_c3_latches[1]
        or multiple_owner_state[0] != 0
        or multiple_owner_state[1] != 2
        or multiple_owner_state[2] != 13
        or multiple_owner_state[3] != current_precision
        or multiple_owner_state[4] != c3_latch1
        or multiple_owner_state[5] != c3_latch2
        or multiple_owner_state[6] != 1
    ):
        raise ValueError("field-3 regulator-multiple provenance failure")
    hnf_latch1 = 4
    hnf_latch2 = 12
    for index in range(4):
        hnf_latch1 = (
            hnf_latch1 * 1000003 + terminal_hnf[index] % _MODULUS1 + index + 1
        ) % _MODULUS1
        hnf_latch2 = (
            hnf_latch2 * 1000033 + terminal_hnf[index] % _MODULUS2 + index + 1
        ) % _MODULUS2
    if (
        terminal_hnf_owner_state[0] != 0
        or terminal_hnf_owner_state[1] != 2
        or terminal_hnf_owner_state[2] != hnf_latch1
        or terminal_hnf_owner_state[3] != hnf_latch2
        or terminal_hnf_owner_state[4] != 1
    ):
        raise ValueError("field-3 terminal-HNF provenance failure")
    latch = (
        inverse_hr[0] % _MODULUS1
        + 1000003 * inverse_hr[1]
        + 1000033 * (inverse_hr[2] % _MODULUS1)
    ) % _MODULUS1
    if analytic_owner_state[5] != 1 or analytic_owner_state[4] != latch:
        raise ValueError("field-3 analytic owner provenance failure")
    pari_post_hnf_class_factor(
        2,
        terminal_hnf,
        inverse_hr,
        candidate_class_number,
        candidate_zeta_factor,
    )
    status = pari_regulator_reconstruction(
        coordinates,
        2,
        13,
        multiple,
        candidate_zeta_factor,
        rational_work,
        integer_work,
        hnf_work,
        hnf_column,
        hnf_output,
        hnf_state,
        candidate_regulator,
        candidate_relations,
        candidate_denominator,
        reconstruction_state,
        hnf_row_pivots,
        hnf_heights,
    )
    state[0] = status
    state[1] = 0
    state[2] = 0
    state[3] = 0
    state[4] = 0
    state[5] = current_precision
    if status == 3:
        pari_live_retry_transition(3, current_precision, 0, 0, 0, retry_work)
        state[1] = 1
        state[2] = retry_work[3]
        return 3
    if status != 0:
        return status
    class_number[0] = candidate_class_number[0]
    for index in range(3):
        zeta_factor[index] = candidate_zeta_factor[index]
        regulator[index] = candidate_regulator[index]
    for index in range(size):
        relations[index] = candidate_relations[index]
    denominator[0] = candidate_denominator[0]
    state[4] = 1
    if getfu_status == 3:
        state[3] = 1
        return 3
    return 0


__all__ = [
    "pari_field3_analytic_acceptance",
    "pari_field3_analytic_preparation",
    "pari_field3_catalog_latches",
]
