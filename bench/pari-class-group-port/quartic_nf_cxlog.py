"""Mixed-signature quartic `nf_cxlog` and class-group assembly.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the source-transparent PARI 2.17.4 `ZC_cxlog`/`famat_cxlog` cut for
signature `(2, 1)`, followed by the ordinary `class_group_gen` Smith/logarithm
assembly.  Prepared embedding rows are real places, the complex real part,
then the complex imaginary part.  No logarithm is supplied by the caller.
"""

from sagejs.native import (
    IntegerBuffer,
    Int64Buffer,
    checked_float64,
    checked_uint64,
    native,
)

from .class_group_assembly import (
    pari_log_matrix_difference,
    pari_log_matrix_zero,
)
from .class_group_smith_transform import pari_class_group_smith_transform
from .complex_logarithm import pari_real_pair_logarithm
from .exponential import (
    pari_exp_schedule_sqrt,
    pari_leading_word_log2,
    pari_real_resize,
    pari_real_truncate,
)
from .logarithm_constant import pari_log2_constant
from .log_matrix_transform import (
    pari_log_entry_product,
    pari_log_entry_sum,
    pari_log_matrix_transform,
)
from .nf_cxlog import pari_cxlog_gcd
from .pi_constant import pari_pi_constant
from .real_conversion import pari_integer_to_real
from .real_division import pari_real_division
from .real_square_root import pari_real_square_root_abs
from .short_product import (
    pari_prepared_embedding_row,
    pari_real_word_division,
    pari_short_square,
    pari_signed_real_sum,
    pari_short_product,
    pari_word_integer_real_product,
    pari_word_integer_real_sum,
)


@native
def pari_quartic_square(m: int, p: int, e: int) -> tuple[int, int, int]:
    """Prepared real square including PARI's full-product 576-bit branch."""
    if p <= 512:
        return pari_short_square(m, p, e)
    if p > 2496 or p % 64 != 0 or abs(m).bit_length() != p:
        raise ValueError("invalid quartic full square")
    value = abs(m) * abs(m)
    bits = value.bit_length()
    exponent = bits - 1 + 2 * e + 2 - 2 * p
    shift = bits - p
    if shift > 0:
        value = (value + (1 << (shift - 1))) >> shift
    else:
        value <<= -shift
    if value.bit_length() > p:
        value >>= 1
        exponent += 1
    return value, p, exponent


@native
def pari_quartic_logarithm_series(m: int, p: int, e: int) -> tuple[int, int, int]:
    """`logr_aux` through the 448-bit quartic prepared-field frontier."""
    if m == 0:
        raise ValueError("quartic logarithm series requires nonzero input")
    leading = checked_uint64(abs(m) >> (p - 64))
    d = -2.0 * (pari_leading_word_log2(leading) + checked_float64(e - 63))
    if d <= 0.0:
        raise ValueError("quartic logarithm series outside contraction range")
    k = int(2.0 * (checked_float64(p) / d))
    if k % 2 == 0:
        k += 1
    if k >= 3:
        ym, yp, ye = pari_quartic_square(m, p, e)
        accumulated = 0
        increment = int(d)
        length = ((increment + 63) // 64) * 64
        if length > p:
            raise ValueError("quartic logarithm initial precision exceeds allocation")
        sm, sp, se = pari_real_word_division(k, 1 << (length - 1), length, 0)
        sm, sp, se = pari_real_resize(sm, sp, se, length)
        k -= 2
        while k >= 1:
            tm, tp, te = pari_real_truncate(ym, yp, ye, length)
            tm, tp, te = pari_short_product(sm, sp, se, tm, tp, te)
            if k == 1:
                tm, tp, te = pari_word_integer_real_sum(1, tm, tp, te)
                return pari_short_product(m, p, e, tm, tp, te)
            accumulated += increment
            length += (accumulated // 64) * 64
            accumulated %= 64
            if length > p:
                length = p
            sm, sp, se = pari_real_word_division(k, 1 << (length - 1), length, 0)
            sm, sp, se = pari_signed_real_sum(sm, sp, se, tm, tp, te)
            sm, sp, se = pari_real_resize(sm, sp, se, length)
            k -= 2
    return m, p, e


@native
def pari_quartic_real_logarithm(
    mantissa: int,
    precision: int,
    exponent: int,
    cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """PARI's non-AGM real logarithm, extended exactly through 448 bits."""
    if precision < 64 or precision > 448 or precision % 64 != 0:
        raise ValueError("unsupported quartic logarithm precision")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("quartic logarithm requires a full mantissa")
    if exponent < -10000 or exponent > 10000:
        raise ValueError("unsupported quartic logarithm exponent")
    ex = exponent
    leading = magnitude >> (precision - 64)
    if leading > (((1 << 64) - 1) // 3) * 2:
        ex += 1
        tail = ((1 << precision) - 1) - magnitude
    else:
        tail = magnitude - (1 << (precision - 1))
    if tail == 0:
        if ex == 0:
            return 0, 0, -precision
        lm, lp, le = pari_log2_constant(precision, cache, a, b, p, q, stack)
        return pari_word_integer_real_product(ex, lm, lp, le)
    accuracy = precision - tail.bit_length()
    skipped = (accuracy // 64) * 64
    working = precision + 64
    bits = working - skipped
    target = precision
    if ex == 0:
        target -= skipped
    d = -checked_float64(accuracy) / 2.0
    roots = int(d + pari_exp_schedule_sqrt(d * d + checked_float64(bits // 6)))
    if roots > bits - accuracy:
        roots = bits - accuracy
    if checked_float64(roots) < 0.2 * checked_float64(accuracy):
        roots = 0
    else:
        working += ((roots + 63) // 64) * 64
    xm, xp, xe = pari_real_resize(magnitude, precision, exponent, working)
    xe -= ex
    for unused in range(roots):
        xm, xp, xe = pari_real_square_root_abs(xm, xp, xe)
    nm, np, ne = pari_word_integer_real_sum(-1, xm, xp, xe)
    dm, dp, de = pari_word_integer_real_sum(1, xm, xp, xe)
    ym, yp, ye = pari_real_division(nm, np, ne, dm, dp, de)
    ym, yp, ye = pari_quartic_logarithm_series(ym, yp, ye)
    ye += roots + 1
    if ex != 0:
        lm, lp, le = pari_log2_constant(precision + 64, cache, a, b, p, q, stack)
        lm, lp, le = pari_word_integer_real_product(ex, lm, lp, le)
        ym, yp, ye = pari_signed_real_sum(ym, yp, ye, lm, lp, le)
    return pari_real_resize(ym, yp, ye, target)


@native
def pari_prepared_mixed_quartic_log_embedding(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coordinates: IntegerBuffer,
    precision: int,
    output: IntegerBuffer,
    log_cache: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Compute the two real and one weighted complex quartic logarithms."""
    if len(coordinates) < 4 or len(output) < 21:
        raise ValueError("short quartic logarithm embedding storage")
    for place in range(3):
        mx, px, ex = pari_prepared_embedding_row(
            matrix_m, matrix_p, matrix_e, coordinates, place * 4, 4
        )
        if place < 2:
            if px == -1:
                mx, px, ex = pari_integer_to_real(mx, precision)
            lm, lp, le = pari_quartic_real_logarithm(
                mx, px, ex, log_cache, a, b, p, q, stack
            )
            if mx > 0:
                kind, am, ap, ae = 1, 0, -1, 0
            else:
                kind = 2
                am, ap, ae = pari_pi_constant(px, pi_cache, a, b, p, q, stack)
        else:
            my, py, ey = pari_prepared_embedding_row(
                matrix_m, matrix_p, matrix_e, coordinates, 12, 4
            )
            # The complex embedding has one 448-bit accumulated component and
            # one 384-bit component. `precCOMPLEX` selects the common 384-bit
            # window before `garg` and `log(cxnorm)` consume the pair.
            if px > py:
                mx, px, ex = pari_real_truncate(mx, px, ex, py)
            elif py > px:
                my, py, ey = pari_real_truncate(my, py, ey, px)
            kind, lm, lp, le, am, ap, ae = pari_real_pair_logarithm(
                mx,
                px,
                ex,
                my,
                py,
                ey,
                precision,
                log_cache,
                pi_cache,
                a,
                b,
                p,
                q,
                stack,
            )
            if lp != -1:
                le += 1
            else:
                lm *= 2
            if ap != -1:
                ae += 1
        offset = 7 * place
        output[offset] = kind
        output[offset + 1] = lm
        output[offset + 2] = lp
        output[offset + 3] = le
        output[offset + 4] = am
        output[offset + 5] = ap
        output[offset + 6] = ae
    return 3


@native
def pari_mixed_quartic_minus_one_cxlog(
    precision: int,
    column: IntegerBuffer,
    pi_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> int:
    """Write `cxlog_m1`: `i*pi` twice, then `2*i*pi`."""
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
    column[18] += 1
    return 3


@native
def pari_mixed_quartic_cxlog_accumulate(
    accumulator: IntegerBuffer,
    column: IntegerBuffer,
    coefficient: int,
    have_value: bool,
) -> int:
    """Apply source-order `RgC_Rg_mul` and optional `RgV_add`."""
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
def pari_prepared_mixed_quartic_famat_cxlog(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_values: IntegerBuffer,
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
    """Atomically append `(2,1)` quartic famat logarithm columns.

    Factor values have stride five: four integral-basis coordinates and a
    positive denominator. Kind zero is scalar; kind one is a basis column.
    `state` is status, completed, failing generator/factor, positive scalars,
    parity skips, minus-one phases, basis factors, complex-norm checks.
    """
    degree = 4
    real_places = 2
    places = 3
    width = 21
    if generator_count < 0:
        raise ValueError("negative quartic cxlog generator count")
    if precision < 64 or precision > 384 or precision % 64 != 0:
        raise ValueError("unsupported quartic cxlog precision")
    if len(state) < 9 or len(factor_offsets) < generator_count + 1:
        raise ValueError("short quartic cxlog metadata")
    if (
        len(matrix_m) < 16
        or len(matrix_p) < 16
        or len(matrix_e) < 16
        or len(ga) < generator_count * width
        or len(coordinates) < degree
        or len(column) < width
        or len(accumulator) < width
    ):
        raise ValueError("short quartic cxlog resident storage")
    factor_count = factor_offsets[generator_count]
    if factor_count < 0 or factor_offsets[0] != 0:
        raise ValueError("invalid quartic cxlog offsets")
    if (
        len(factor_kinds) < factor_count
        or len(factor_values) < 5 * factor_count
        or len(factor_exponents) < factor_count
    ):
        raise ValueError("short quartic cxlog factors")
    previous = 0
    for generator in range(generator_count):
        current = factor_offsets[generator + 1]
        if current < previous or current > factor_count:
            raise ValueError("unordered quartic cxlog offsets")
        previous = current
    for factor in range(factor_count):
        kind = factor_kinds[factor]
        if kind != 0 and kind != 1:
            raise ValueError("invalid quartic cxlog factor kind")
        base = 5 * factor
        if factor_values[base + 4] <= 0:
            raise ValueError("invalid quartic factor denominator")
        if kind == 1:
            nonscalar = False
            for i in range(1, degree):
                if factor_values[base + i] != 0:
                    nonscalar = True
            if not nonscalar:
                raise ValueError("quartic basis factor normalizes to scalar")
    completed = state[1]
    if completed < 0 or completed > generator_count:
        raise ValueError("invalid completed quartic cxlog prefix")
    state[0] = 0
    state[2] = -1
    state[3] = -1
    for i in range(4, 9):
        state[i] = 0
    for generator in range(completed, generator_count):
        pari_log_matrix_zero(accumulator, places)
        have_value = False
        first = factor_offsets[generator]
        last = factor_offsets[generator + 1]
        for factor in range(first, last):
            kind = factor_kinds[factor]
            exponent = factor_exponents[factor]
            coefficient = exponent
            base = 5 * factor
            if kind == 0:
                if factor_values[base] > 0:
                    state[4] += 1
                    continue
                if exponent % 2 == 0:
                    state[5] += 1
                    continue
                pari_mixed_quartic_minus_one_cxlog(
                    precision, column, pi_cache, a, b, p, q, stack
                )
                coefficient = 1
                state[6] += 1
            else:
                content = 0
                for i in range(degree):
                    content = pari_cxlog_gcd(content, factor_values[base + i])
                if content == 0:
                    state[0] = 1
                    state[2] = generator
                    state[3] = factor
                    return 1
                for i in range(degree):
                    coordinates[i] = factor_values[base + i] // content
                for place in range(real_places):
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
                mx, px, ex = pari_prepared_embedding_row(
                    matrix_m,
                    matrix_p,
                    matrix_e,
                    coordinates,
                    real_places * degree,
                    degree,
                )
                my, py, ey = pari_prepared_embedding_row(
                    matrix_m,
                    matrix_p,
                    matrix_e,
                    coordinates,
                    3 * degree,
                    degree,
                )
                if px == -1 or py == -1:
                    raise ValueError("exact nonzero quartic complex component")
                xm, xp, xe = pari_short_square(mx, px, ex)
                ym, yp, ye = pari_short_square(my, py, ey)
                nm, np, ne = pari_signed_real_sum(xm, xp, xe, ym, yp, ye)
                state[8] += 1
                if nm == 0 or (np != -1 and np <= 64):
                    state[0] = 1
                    state[2] = generator
                    state[3] = factor
                    return 1
                pari_prepared_mixed_quartic_log_embedding(
                    matrix_m,
                    matrix_p,
                    matrix_e,
                    coordinates,
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
            pari_mixed_quartic_cxlog_accumulate(
                accumulator, column, coefficient, have_value
            )
            have_value = True
        if not have_value:
            pari_log_matrix_zero(accumulator, places)
        output = generator * width
        for i in range(width):
            ga[output + i] = accumulator[i]
        state[1] = generator + 1
    return 0


@native
def pari_mixed_quartic_class_group_log_assembly(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    relation_hnf: IntegerBuffer,
    relation_logs: IntegerBuffer,
    factor_offsets: IntegerBuffer,
    factor_kinds: IntegerBuffer,
    factor_values: IntegerBuffer,
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
    """Finish `Ga/GD/ga/clg2` for prepared `(2,1)` quartic `G/Ge`."""
    n = dimension
    active = generator_count
    places = 3
    width = 7
    size = n * n
    if n < 1 or active < 0 or active > n:
        raise ValueError("invalid quartic class-group assembly shape")
    if len(assembly_state) < 8:
        raise ValueError("short quartic class-group assembly state")
    if (
        len(matrix_m) < 16
        or len(matrix_p) < 16
        or len(matrix_e) < 16
        or len(relation_hnf) < size
        or len(relation_logs) < places * n * width
        or len(ga) < places * active * width
        or len(gd) < places * active * width
        or len(generator_arch) < places * n * width
        or len(ga_full) < places * n * width
        or len(c_m1) < places * active * width
        or len(ga_diagonal) < places * active * width
        or len(c_m2) < places * n * width
        or len(ga_ur) < places * n * width
        or len(gd_work) < places * active * width
        or len(generator_arch_work) < places * n * width
    ):
        raise ValueError("short quartic class-group assembly owner")
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
    cx_status = pari_prepared_mixed_quartic_famat_cxlog(
        matrix_m,
        matrix_p,
        matrix_e,
        factor_offsets,
        factor_kinds,
        factor_values,
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
    pari_log_matrix_zero(ga_full, places * n)
    for column_index in range(active):
        for place in range(places):
            source = (column_index * places + place) * width
            for word in range(width):
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
            source = (column_index * places + place) * width
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
    for i in range(places * active * width):
        gd[i] = gd_work[i]
    for i in range(places * n * width):
        generator_arch[i] = generator_arch_work[i]
    assembly_state[0] = 0
    assembly_state[1] = n
    assembly_state[2] = active
    assembly_state[5] = checked
    assembly_state[6] = active
    assembly_state[7] = n
    return 0
