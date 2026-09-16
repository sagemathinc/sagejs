"""Prepared totally-real cubic `nf_cxlog` from PARI 2.17.4.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the narrow `class_group_gen` famat boundary.  It deliberately does
not reuse relation-scalar semantics: positive rational factors have zero
archimedean component, while a negative rational contributes only the phase of
`-1` when its exponent is odd.
"""

from sagejs.native import IntegerBuffer, native

from .log_embedding import pari_prepared_log_embedding
from .log_matrix_transform import pari_log_entry_product, pari_log_entry_sum
from .pi_constant import pari_pi_constant
from .short_product import pari_prepared_embedding_row


@native
def pari_cxlog_gcd(a: int, b: int) -> int:
    """Nonnegative gcd used by `Q_primpart` on integral basis columns."""
    if a < 0:
        a = -a
    if b < 0:
        b = -b
    while b != 0:
        a, b = b, a % b
    return a


@native
def pari_zero_cxlog(column: IntegerBuffer, places: int) -> int:
    """Write PARI's exact `zerocol` in the resident seven-word encoding."""
    for place in range(places):
        offset = 7 * place
        column[offset] = 1
        column[offset + 1] = 0
        column[offset + 2] = -1
        column[offset + 3] = 0
        column[offset + 4] = 0
        column[offset + 5] = -1
        column[offset + 6] = 0
    return places


@native
def pari_minus_one_cxlog(
    precision: int,
    column: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Write `cxlog_m1` for a totally real cubic: three copies of `i*pi`."""
    pm, pp, pe = pari_pi_constant(precision, pi_cache, a, b, p, q, stack)
    for place in range(3):
        offset = 7 * place
        column[offset] = 2
        column[offset + 1] = 0
        column[offset + 2] = -1
        column[offset + 3] = 0
        column[offset + 4] = pm
        column[offset + 5] = pp
        column[offset + 6] = pe
    return 3


@native
def pari_cxlog_accumulate(
    accumulator: IntegerBuffer,
    column: IntegerBuffer,
    coefficient: int,
    have_value: bool,
) -> int:
    """Apply one source-order `RgC_Rg_mul` then optional `RgV_add`."""
    for place in range(3):
        offset = 7 * place
        k, rm, rp, re, im, ip, ie = pari_log_entry_product(
            coefficient,
            column[offset],
            column[offset + 1],
            column[offset + 2],
            column[offset + 3],
            column[offset + 4],
            column[offset + 5],
            column[offset + 6],
        )
        if have_value:
            k, rm, rp, re, im, ip, ie = pari_log_entry_sum(
                accumulator[offset],
                accumulator[offset + 1],
                accumulator[offset + 2],
                accumulator[offset + 3],
                accumulator[offset + 4],
                accumulator[offset + 5],
                accumulator[offset + 6],
                k,
                rm,
                rp,
                re,
                im,
                ip,
                ie,
            )
        accumulator[offset] = k
        accumulator[offset + 1] = rm
        accumulator[offset + 2] = rp
        accumulator[offset + 3] = re
        accumulator[offset + 4] = im
        accumulator[offset + 5] = ip
        accumulator[offset + 6] = ie
    return 3


@native
def pari_prepared_famat_cxlog(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_numerators: IntegerBuffer,
    factor_denominators: IntegerBuffer,
    factor_coordinates: IntegerBuffer,
    factor_exponents: IntegerBuffer,
    generator_count: int,
    precision: int,
    ga: IntegerBuffer,
    state: IntegerBuffer,
    coordinates: IntegerBuffer,
    column: IntegerBuffer,
    accumulator: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Append atomic `Ga` columns for prepared integral famats.

    This first cut is intentionally restricted to degree three and signature
    `(3, 0)`.  Factor kind 0 is a scalar rational represented by a numerator
    and positive denominator.  Kind 1 is an integral-basis column; its integer
    content is removed here exactly where `ZC_cxlog` calls `Q_primpart`.

    `state` is `[status, completed, failing_generator, failing_factor,
    positive_scalars, parity_skips, minus_one_phases, basis_factors]`.
    Status 1 is PARI's low-precision frontier.  A failing column remains
    entirely unpublished, while earlier completed columns stay resident.
    """
    degree = 3
    places = 3
    width = 21
    if generator_count < 0:
        raise ValueError("negative cxlog generator count")
    if precision < 64 or precision > 384 or precision % 64 != 0:
        raise ValueError("unsupported cxlog precision")
    if len(state) < 8 or len(factor_offsets) < generator_count + 1:
        raise ValueError("short cxlog metadata")
    if (
        len(matrix_m) < degree * degree
        or len(matrix_p) < degree * degree
        or len(matrix_e) < degree * degree
        or len(ga) < generator_count * width
        or len(coordinates) < degree
        or len(column) < width
        or len(accumulator) < width
    ):
        raise ValueError("short cxlog resident storage")
    factor_count = factor_offsets[generator_count]
    if factor_count < 0 or factor_offsets[0] != 0:
        raise ValueError("invalid cxlog factor offsets")
    if (
        len(factor_kinds) < factor_count
        or len(factor_numerators) < factor_count
        or len(factor_denominators) < factor_count
        or len(factor_exponents) < factor_count
        or len(factor_coordinates) < factor_count * degree
    ):
        raise ValueError("short cxlog factor storage")
    previous = 0
    for generator in range(generator_count):
        current = factor_offsets[generator + 1]
        if current < previous or current > factor_count:
            raise ValueError("unordered cxlog factor offsets")
        previous = current
    for factor in range(factor_count):
        kind = factor_kinds[factor]
        if kind != 0 and kind != 1:
            raise ValueError("invalid cxlog factor kind")
        if factor_denominators[factor] <= 0:
            raise ValueError("invalid cxlog scalar denominator")
        if kind == 1:
            base = factor * degree
            if factor_coordinates[base + 1] == 0 and factor_coordinates[base + 2] == 0:
                raise ValueError("basis cxlog factor normalizes to a scalar")
    completed = state[1]
    if completed < 0 or completed > generator_count:
        raise ValueError("invalid completed cxlog prefix")
    state[0] = 0
    state[2] = -1
    state[3] = -1
    for i in range(4, 8):
        state[i] = 0
    for generator in range(completed, generator_count):
        pari_zero_cxlog(accumulator, places)
        have_value = False
        first = factor_offsets[generator]
        last = factor_offsets[generator + 1]
        for factor in range(first, last):
            kind = factor_kinds[factor]
            exponent = factor_exponents[factor]
            coefficient = exponent
            if kind == 0:
                if factor_numerators[factor] > 0:
                    state[4] += 1
                    continue
                if exponent % 2 == 0:
                    state[5] += 1
                    continue
                pari_minus_one_cxlog(precision, column, pi_cache, a, b, p, q, stack)
                coefficient = 1
                state[6] += 1
            else:
                base = factor * degree
                content = 0
                for i in range(degree):
                    content = pari_cxlog_gcd(content, factor_coordinates[base + i])
                if content == 0:
                    state[0] = 1
                    state[2] = generator
                    state[3] = factor
                    return 1
                for i in range(degree):
                    coordinates[i] = factor_coordinates[base + i] // content
                # ZC_cxlog checks low_prec on every real embedding before it
                # computes any logarithm. DEFAULTPREC is 64 bits in PARI 2.17.4.
                for place in range(places):
                    mx, px, ex = pari_prepared_embedding_row(
                        matrix_m,
                        matrix_p,
                        matrix_e,
                        coordinates,
                        place * degree,
                        degree,
                    )
                    if mx == 0 or (px != -1 and px <= 64):
                        state[0] = 1
                        state[2] = generator
                        state[3] = factor
                        return 1
                pari_prepared_log_embedding(
                    matrix_m,
                    matrix_p,
                    matrix_e,
                    coordinates,
                    degree,
                    degree,
                    False,
                    precision,
                    column,
                    log_cache,
                    pi_cache,
                    a,
                    b,
                    p,
                    q,
                    stack,
                )
                state[7] += 1
            pari_cxlog_accumulate(accumulator, column, coefficient, have_value)
            have_value = True
        if not have_value:
            pari_zero_cxlog(accumulator, places)
        output = generator * width
        for i in range(width):
            ga[output + i] = accumulator[i]
        state[1] = generator + 1
    return 0
