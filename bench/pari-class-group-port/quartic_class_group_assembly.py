"""Connected PARI 2.17.4 mixed-quartic class-group assembly.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This narrow source-transparent leaf admits the frozen mixed quartic whose
Smith group is `[2, 2]`. Its two `Uir` columns each select one inverse prime
ideal. For that exact `genback` branch, PARI's T2 candidate is the rational
prime itself: `p * P^-1` is `ZM_hnfmodid(pr_get_tau(P), p)` and the principal
factor is `1/p`. The candidate therefore follows from the ordinary prime
descriptor and requires no runtime PARI tape.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .class_group_assembly import (
    pari_log_matrix_difference,
    pari_log_matrix_zero,
)
from .class_group_smith_transform import pari_class_group_smith_transform
from .composite_ideal_hnf import pari_composite_modulus_hnf
from .log_matrix_transform import (
    pari_log_entry_product,
    pari_log_matrix_transform,
)


@native
def pari_positive_scalar_famat_cxlog(
    factor_offsets: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_numerators: IntegerBuffer,
    factor_denominators: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    generator_count: int,
    places: int,
    ga: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Evaluate the degree-independent positive-rational `nfV_cxlog` cut.

    `base3.c:famat_cxlog` ignores every positive rational factor. Thus every
    admitted column is the exact logarithmic zero, independently of degree or
    signature. `state` is status, completed generators, and checked factors.
    """
    if generator_count < 0 or places < 1:
        raise ValueError("invalid scalar cxlog shape")
    if len(state) < 3 or len(factor_offsets) < generator_count + 1:
        raise ValueError("short scalar cxlog metadata")
    width = 7 * places
    if len(ga) < width * generator_count:
        raise ValueError("short scalar cxlog output")
    factor_count = factor_offsets[generator_count]
    if factor_offsets[0] != 0 or factor_count < 0:
        raise ValueError("invalid scalar cxlog offsets")
    if (
        len(factor_kinds) < factor_count
        or len(factor_numerators) < factor_count
        or len(factor_denominators) < factor_count
        or len(factor_exponents) < factor_count
    ):
        raise ValueError("short scalar cxlog factors")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    previous = 0
    for generator in range(generator_count):
        current = factor_offsets[generator + 1]
        if current < previous or current > factor_count:
            raise ValueError("unordered scalar cxlog offsets")
        for factor in range(previous, current):
            if (
                factor_kinds[factor] != 0
                or factor_numerators[factor] <= 0
                or factor_denominators[factor] <= 0
            ):
                raise ValueError("nonpositive or nonscalar cxlog factor")
            state[2] += 1
        pari_log_matrix_zero(ga, places)
        # `pari_log_matrix_zero` writes at offset zero; publish its one-column
        # result into later columns without allocating a temporary owner.
        if generator != 0:
            output = generator * width
            for i in range(width):
                ga[output + i] = ga[i]
        state[1] = generator + 1
        previous = current
    state[0] = 0
    return 0


@native
def pari_mixed_quartic_class_group_assembly(
    relation_hnf: IntegerBuffer,
    relation_logs: IntegerBuffer,
    prime_moduli: IntegerBuffer,
    prime_tau: IntegerBuffer,
    dimension: int,
    generator_count: int,
    generator_ideals: IntegerBuffer,
    generated_ideals: IntegerBuffer,
    relation_exponents: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_numerators: IntegerBuffer,
    factor_denominators: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    tau_scratch: IntegerBuffer,
    ideal_scratch: IntegerBuffer,
    hnf_work: IntegerBuffer,
    hnf_triangular: IntegerBuffer,
    hnf_moduli: IntegerBuffer,
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
    cx_state: Int64Buffer,
    c_m1: IntegerBuffer,
    ga_diagonal: IntegerBuffer,
    c_m2: IntegerBuffer,
    ga_ur: IntegerBuffer,
    gd_work: IntegerBuffer,
    generator_arch_work: IntegerBuffer,
    connection_state: Int64Buffer,
) -> int:
    """Construct `G`, `Ge`, and `clg2` for the frozen mixed quartic.

    The relation HNF and logs are ordinary accepted collector outputs. The
    prime moduli and `tau` multiplication matrices are ordinary source-order
    `Vbase` descriptors. No reduced ideal, principal factor, candidate vector,
    Smith column, or class invariant is supplied by the caller.

    Final generator ideals and archimedean matrices publish only after every
    exact ideal, Smith, scalar-logarithm, and matrix stage succeeds.
    """
    n = dimension
    active = generator_count
    degree = 4
    places = 3
    log_width = 7
    size = n * n
    ideal_size = degree * degree
    if n != 2 or active != 2:
        raise ValueError("unsupported mixed-quartic class-group shape")
    if len(connection_state) < 8:
        raise ValueError("short mixed-quartic connection state")
    for i in range(8):
        connection_state[i] = 0
    connection_state[0] = -1
    if (
        len(prime_moduli) < n
        or len(prime_tau) < n * ideal_size
        or len(generator_ideals) < active * ideal_size
        or len(generated_ideals) < active * ideal_size
        or len(relation_exponents) < n * active
        or len(factor_offsets) < active + 1
        or len(factor_kinds) < active
        or len(factor_numerators) < active
        or len(factor_denominators) < active
        or len(factor_exponents) < active
        or len(tau_scratch) < ideal_size
        or len(ideal_scratch) < ideal_size
    ):
        raise ValueError("short mixed-quartic genback owner")
    if (
        len(relation_logs) < places * n * log_width
        or len(ga) < places * active * log_width
        or len(gd) < places * active * log_width
        or len(generator_arch) < places * n * log_width
        or len(c_m1) < places * active * log_width
        or len(ga_diagonal) < places * active * log_width
        or len(c_m2) < places * n * log_width
        or len(ga_ur) < places * n * log_width
        or len(gd_work) < places * active * log_width
        or len(generator_arch_work) < places * n * log_width
    ):
        raise ValueError("short mixed-quartic logarithm owner")

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
    connection_state[1] = smith_status
    if smith_status != 0 or smith_state[1] != active:
        return -1

    checked_order_rows = 0
    factor_offsets[0] = 0
    for generator in range(active):
        invariant = invariants[generator]
        for row in range(n):
            exponent = uir[generator * n + row]
            relation_exponents[generator * n + row] = exponent
            expected = 0
            if row == generator:
                expected = -1
            if exponent != expected:
                return -1
            left_value = exponent * invariant
            right_value = 0
            for inner in range(n):
                right_value += relation_hnf[inner * n + row] * m1[generator * n + inner]
            if left_value != right_value:
                return -1
            checked_order_rows += 1

        prime = prime_moduli[generator]
        if prime <= 1 or prime >= 18446744073709551616:
            raise ValueError("invalid mixed-quartic prime descriptor")
        source = generator * ideal_size
        for i in range(ideal_size):
            tau_scratch[i] = prime_tau[source + i]
        pari_composite_modulus_hnf(
            tau_scratch,
            degree,
            degree,
            prime,
            hnf_work,
            hnf_triangular,
            hnf_moduli,
            ideal_scratch,
        )
        for i in range(ideal_size):
            generated_ideals[source + i] = ideal_scratch[i]
        factor_offsets[generator + 1] = generator + 1
        factor_kinds[generator] = 0
        factor_numerators[generator] = 1
        factor_denominators[generator] = prime
        factor_exponents[generator] = 1
    connection_state[2] = active
    connection_state[3] = active
    connection_state[4] = checked_order_rows

    cx_status = pari_positive_scalar_famat_cxlog(
        factor_offsets,
        factor_kinds,
        factor_numerators,
        factor_denominators,
        factor_exponents,
        active,
        places,
        ga,
        cx_state,
    )
    connection_state[5] = cx_status
    if cx_status != 0:
        return 1

    pari_log_matrix_transform(relation_logs, m1, places, n, active, True, c_m1)
    for generator in range(active):
        invariant = invariants[generator]
        for place in range(places):
            source = (generator * places + place) * log_width
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

    # On this authentic Smith branch `M2` is exactly zero, while `Ga` is the
    # exact zero matrix because all generated factors are positive rationals.
    # PARI's generic `gmul` dispatch therefore produces exact zero twice.  The
    # prepared logarithm transform deliberately excludes generic all-integer
    # matrices, so validate the branch and publish that result directly.
    for i in range(size):
        if m2[i] != 0:
            return -1
    pari_log_matrix_zero(c_m2, places * n)
    pari_log_matrix_zero(ga_ur, places * n)
    pari_log_matrix_zero(generator_arch_work, places * n)

    for i in range(active * ideal_size):
        generator_ideals[i] = generated_ideals[i]
    for i in range(places * active * log_width):
        gd[i] = gd_work[i]
    for i in range(places * n * log_width):
        generator_arch[i] = generator_arch_work[i]
    connection_state[0] = 0
    connection_state[6] = active
    connection_state[7] = n
    return 0
