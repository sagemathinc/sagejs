"""Real logarithm columns for the authentic field-3 retry.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the real-place part of PARI 2.17.4's `get_log_embed` after the
153,088-bit retry.  It deliberately retains the source distinction between
the initial scalar relations and later integral-basis columns.  Nonscalar
values therefore keep the guard-word precision produced by `nfnewprec` and
`make_M`; they are not rounded to the nominal retry precision before `log`.
"""

from math import log2

from sagejs.native import Int64Buffer, IntegerBuffer, checked_float64, native

from .exponential import (
    pari_exp_schedule_sqrt,
    pari_real_reciprocal,
    pari_real_resize,
)
from .field3_high_precision_embeddings import pari_field3_high_precision_embeddings
from .logarithm_constant import pari_log2_constant
from .pi_constant import pari_pi_constant
from .real_conversion import pari_integer_to_real
from .real_division import pari_real_division
from .real_logarithm import pari_logarithm_series
from .real_square_root import pari_real_square_root_abs
from .short_product import (
    pari_positive_real_sum,
    pari_prepared_embedding_row,
    pari_short_product,
    pari_signed_real_sum,
    pari_word_integer_real_product,
)


@native
def pari_field3_log_uses_agm(mantissa: int, precision: int) -> int:
    """Return `logr_abs`'s dispatch for the admitted retry precisions."""
    magnitude = abs(mantissa)
    if (
        precision < 153088
        or precision > 153216
        or precision % 64 != 0
        or magnitude.bit_length() != precision
    ):
        raise ValueError("invalid field-3 logarithm dispatch input")
    leading = magnitude >> (precision - 64)
    if leading > (((1 << 64) - 1) // 3) * 2:
        tail = ((1 << precision) - 1) - magnitude
    else:
        tail = magnitude - (1 << (precision - 1))
    if tail == 0:
        return 0
    accuracy = precision - tail.bit_length()
    working = precision + 64
    remaining = working - (accuracy // 64) * 64
    words = (working + 191) // 64
    if checked_float64(remaining) > (
        24.0 * checked_float64(accuracy) * log2(checked_float64(words))
    ):
        return 1
    return 0


@native
def pari_field3_agm1_abs(
    mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """`agm1r_abs` on the field-3 retry's guard-word corridor."""
    if (
        mantissa <= 0
        or precision < 153152
        or precision > 153280
        or precision % 64 != 0
        or mantissa.bit_length() != precision
    ):
        raise ValueError("invalid field-3 AGM input")
    one = 1 << (precision - 1)
    am, ap, ae = pari_positive_real_sum(
        one, precision, 0, mantissa, precision, exponent
    )
    ae -= 1
    bm, bp, be = pari_real_square_root_abs(mantissa, precision, exponent)
    limit = 5 - precision
    iterations = 0
    while True:
        dm, dp, de = pari_signed_real_sum(am, ap, ae, -bm, bp, be)
        if dm == 0 or de - be < limit:
            break
        old_m = am
        old_p = ap
        old_e = ae
        am, ap, ae = pari_positive_real_sum(am, ap, ae, bm, bp, be)
        ae -= 1
        bm, bp, be = pari_short_product(old_m, old_p, old_e, bm, bp, be)
        bm, bp, be = pari_real_square_root_abs(bm, bp, be)
        iterations += 1
        if iterations > 32:
            raise ValueError("field-3 AGM iteration boundary exhausted")
    return pari_real_resize(am, ap, ae, precision)


@native
def pari_field3_log_agm_abs(
    mantissa: int,
    precision: int,
    exponent: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """`logagmr_abs` without discarding `make_M`'s guard words."""
    magnitude = abs(mantissa)
    if (
        precision < 153088
        or precision > 153216
        or precision % 64 != 0
        or magnitude.bit_length() != precision
        or exponent < -1000000
        or exponent > 1000000
        or magnitude == 1 << (precision - 1)
    ):
        raise ValueError("invalid field-3 AGM logarithm input")
    working = precision + 64
    half_bits = working >> 1
    qm, qp, qe = pari_real_resize(magnitude, precision, exponent, working)
    qe += half_bits - exponent
    rm, rp, re = pari_real_reciprocal(qm, qp, qe)
    re += 2
    gm, gp, ge = pari_field3_agm1_abs(rm, rp, re)
    pim, pip, pie = pari_pi_constant(working, pi_cache, a, b, p, q, stack)
    pie -= 1
    ym, yp, ye = pari_real_division(pim, pip, pie, gm, gp, ge)
    lm, lp, le = pari_log2_constant(working, log_cache, a, b, p, q, stack)
    lm, lp, le = pari_word_integer_real_product(exponent - half_bits, lm, lp, le)
    ym, yp, ye = pari_signed_real_sum(ym, yp, ye, lm, lp, le)
    if yp <= precision:
        return ym, yp, ye
    return pari_real_resize(ym, yp, ye, precision)


@native
def pari_field3_real_log_abs(
    mantissa: int,
    precision: int,
    exponent: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
) -> tuple[int, int, int]:
    """Translate `logr_abs` for all real values admitted by this owner."""
    magnitude = abs(mantissa)
    if (
        precision < 153088
        or precision > 153216
        or precision % 64 != 0
        or magnitude.bit_length() != precision
        or exponent < -1000000
        or exponent > 1000000
    ):
        raise ValueError("invalid field-3 real logarithm input")
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
        lm, lp, le = pari_log2_constant(precision, log_cache, a, b, p, q, stack)
        return pari_word_integer_real_product(ex, lm, lp, le)
    if pari_field3_log_uses_agm(magnitude, precision) != 0:
        return pari_field3_log_agm_abs(
            magnitude,
            precision,
            exponent,
            pi_cache,
            log_cache,
            a,
            b,
            p,
            q,
            stack,
        )

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
    nm, np, ne = pari_signed_real_sum(-(1 << (xp - 1)), xp, 0, xm, xp, xe)
    dm, dp, de = pari_positive_real_sum(1 << (xp - 1), xp, 0, xm, xp, xe)
    ym, yp, ye = pari_real_division(nm, np, ne, dm, dp, de)
    ym, yp, ye = pari_logarithm_series(ym, yp, ye)
    ye += roots + 1
    if ex != 0:
        lm, lp, le = pari_log2_constant(precision + 64, log_cache, a, b, p, q, stack)
        lm, lp, le = pari_word_integer_real_product(ex, lm, lp, le)
        ym, yp, ye = pari_signed_real_sum(ym, yp, ye, lm, lp, le)
    return pari_real_resize(ym, yp, ye, target)


@native
def pari_field3_real_log_columns(
    polynomial: IntegerBuffer,
    signature: Int64Buffer,
    basis: IntegerBuffer,
    basis_denominator: int,
    multiplication_tensor: IntegerBuffer,
    principal_generators: IntegerBuffer,
    relation_metadata: IntegerBuffer,
    relation_records: IntegerBuffer,
    target: int,
    count: int,
    embedding_scratch: IntegerBuffer,
    root_m: IntegerBuffer,
    root_p: IntegerBuffer,
    root_e: IntegerBuffer,
    embedding_m: IntegerBuffer,
    embedding_p: IntegerBuffer,
    embedding_e: IntegerBuffer,
    embedding_state: Int64Buffer,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    coordinates: IntegerBuffer,
    scratch: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Publish two real logarithm triples per source-order relation column.

    Validation and the complete embedding rebuild precede log scratch writes.
    Public `output` and `state` are committed only after all selected columns
    finish, so arithmetic failures cannot publish a mixed-prefix owner.
    """
    if target != 153088:
        raise ValueError("unsupported field-3 real-log target")
    if count < 27 or count > 301:
        raise ValueError("invalid field-3 real-log prefix")
    if (
        len(principal_generators) < 1204
        or len(relation_metadata) < 903
        or len(relation_records) < 86688
        or len(pi_cache) < 3
        or len(log_cache) < 3
        or len(a) < 16385
        or len(b) < 16385
        or len(p) < 16385
        or len(q) < 16385
        or len(stack) < 105
        or len(coordinates) < 4
        or len(scratch) < 6 * count
        or len(output) < 6 * count
        or len(state) < 8
    ):
        raise ValueError("short field-3 real-log owner or workspace")
    for column in range(301):
        if (
            relation_metadata[3 * column] != column + 1
            or relation_metadata[3 * column + 1] != 0
            or relation_metadata[3 * column + 2] != 0
        ):
            raise ValueError("wrong field-3 source column order")
    for column in range(26):
        if (
            principal_generators[4 * column] <= 1
            or principal_generators[4 * column + 1] != 0
            or principal_generators[4 * column + 2] != 0
            or principal_generators[4 * column + 3] != 0
        ):
            raise ValueError("wrong field-3 scalar-prefix owner")
    if relation_records[0] != 4:
        raise ValueError("wrong field-3 relation owner")

    pari_field3_high_precision_embeddings(
        polynomial,
        signature,
        basis,
        basis_denominator,
        multiplication_tensor,
        target,
        embedding_scratch,
        root_m,
        root_p,
        root_e,
        embedding_m,
        embedding_p,
        embedding_e,
        embedding_state,
    )

    agm_count = 0
    for column in range(count):
        scalar = column < 26
        vm = 0
        vp = -1
        ve = 0
        if scalar:
            vm, vp, ve = pari_integer_to_real(principal_generators[4 * column], target)
            dispatch = pari_field3_log_uses_agm(vm, vp)
            agm_count += 2 * dispatch
            lm, lp, le = pari_field3_real_log_abs(
                vm, vp, ve, pi_cache, log_cache, a, b, p, q, stack
            )
            for place in range(2):
                offset = 6 * column + 3 * place
                scratch[offset] = lm
                scratch[offset + 1] = lp
                scratch[offset + 2] = le
            continue
        else:
            for index in range(4):
                coordinates[index] = principal_generators[4 * column + index]
        for place in range(2):
            if not scalar:
                vm, vp, ve = pari_prepared_embedding_row(
                    embedding_m,
                    embedding_p,
                    embedding_e,
                    coordinates,
                    4 * place,
                    4,
                )
            agm_count += pari_field3_log_uses_agm(vm, vp)
            lm, lp, le = pari_field3_real_log_abs(
                vm, vp, ve, pi_cache, log_cache, a, b, p, q, stack
            )
            offset = 6 * column + 3 * place
            scratch[offset] = lm
            scratch[offset + 1] = lp
            scratch[offset + 2] = le
    for index in range(6 * count):
        output[index] = scratch[index]
    state[0] = 0
    state[1] = target
    state[2] = count
    state[3] = 26
    state[4] = count - 26
    state[5] = 2 * count
    state[6] = agm_count
    state[7] = 2 * count - agm_count
    return 0


__all__ = ["pari_field3_real_log_columns"]
