"""PARI 2.17.4 high-precision real AGM logarithm.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This translates `trans1.c:logagmr_abs` and its positive-real
`agm1r_abs` dependency. Values use the existing packed triple
`(mantissa, precision, exponent)` and all large arithmetic stays in the
source-transparent native call graph.
"""

from math import log2

from sagejs.native import IntegerBuffer, Int64Buffer, checked_float64, native

from .exponential import (
    pari_exp_schedule_sqrt,
    pari_real_reciprocal,
    pari_real_resize,
)
from .logarithm_constant import pari_log2_constant
from .pi_constant import pari_pi_constant
from .real_logarithm import pari_logarithm_series
from .real_division import pari_real_division
from .real_square_root import pari_real_square_root_abs
from .short_product import (
    pari_positive_real_sum,
    pari_short_product,
    pari_signed_real_sum,
    pari_word_integer_real_product,
)


@native
def pari_agm1_real_abs(
    mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Translate `agm1r_abs` for one positive packed real.

    PARI stops once the relative gap has fewer than five trustworthy low
    bits.  The fixed iteration cap is only a fail-closed resource boundary;
    the admitted 153,152-bit corridor converges much earlier.
    """
    if (
        mantissa <= 0
        or precision < 64
        or precision > 154112
        or precision % 64 != 0
        or mantissa.bit_length() != precision
    ):
        raise ValueError("invalid positive AGM input")
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
            raise ValueError("AGM iteration boundary exhausted")
    return pari_real_resize(am, ap, ae, precision)


@native
def pari_real_logarithm_agm_abs(
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
    """Translate `logagmr_abs` at the field-3 retry precision.

    The public gate deliberately admits only the single reviewed 153,088-bit
    target.  The internal guard word remains below the shared 154,112-bit
    packed-arithmetic ceiling.
    """
    if precision != 153088:
        raise ValueError("unsupported high-precision AGM logarithm target")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("AGM logarithm requires a full nonzero mantissa")
    if exponent < -1000000 or exponent > 1000000:
        raise ValueError("AGM logarithm exponent outside reviewed boundary")
    # logagmr_abs is entered only after logr_abs has excluded exact powers of
    # two.  Preserve that precondition instead of silently taking another
    # branch here.
    if magnitude == 1 << (precision - 1):
        raise ValueError("AGM logarithm excludes exact powers of two")

    working = precision + 64
    half_bits = working >> 1
    qm, qp, qe = pari_real_resize(magnitude, precision, exponent, working)
    qe += half_bits - exponent
    rm, rp, re = pari_real_reciprocal(qm, qp, qe)
    re += 2
    gm, gp, ge = pari_agm1_real_abs(rm, rp, re)
    pim, pip, pie = pari_pi_constant(working, pi_cache, a, b, p, q, stack)
    pie -= 1
    ym, yp, ye = pari_real_division(pim, pip, pie, gm, gp, ge)
    lm, lp, le = pari_log2_constant(working, log_cache, a, b, p, q, stack)
    lm, lp, le = pari_word_integer_real_product(exponent - half_bits, lm, lp, le)
    ym, yp, ye = pari_signed_real_sum(ym, yp, ye, lm, lp, le)
    # `affrr_fixlg(y, z)` does not invent low zero words after cancellation:
    # it shortens the preallocated result header when `y` carries fewer words.
    if yp <= precision:
        return ym, yp, ye
    return pari_real_resize(ym, yp, ye, precision)


@native
def pari_high_precision_log_uses_agm(
    mantissa: int, precision: int, exponent: int
) -> int:
    """Return PARI's `logr_abs` AGM-dispatch decision."""
    magnitude = abs(mantissa)
    if precision != 153088 or magnitude.bit_length() != precision:
        raise ValueError("invalid high-precision logarithm dispatch input")
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
def pari_real_logarithm_high_precision_abs(
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
    """Translate the complete real `logr_abs` decision at 153,088 bits."""
    if precision != 153088:
        raise ValueError("unsupported high-precision AGM logarithm target")
    magnitude = abs(mantissa)
    if magnitude.bit_length() != precision:
        raise ValueError("AGM logarithm requires a full nonzero mantissa")
    if exponent < -1000000 or exponent > 1000000:
        raise ValueError("AGM logarithm exponent outside reviewed boundary")
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
    if pari_high_precision_log_uses_agm(magnitude, precision, exponent) != 0:
        return pari_real_logarithm_agm_abs(
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
def pari_high_precision_agm_log_batch(
    mantissas: IntegerBuffer,
    precisions: IntegerBuffer,
    exponents: IntegerBuffer,
    count: int,
    target_precision: int,
    pi_cache: IntegerBuffer,
    log_cache: IntegerBuffer,
    a: IntegerBuffer,
    b: IntegerBuffer,
    p: IntegerBuffer,
    q: IntegerBuffer,
    stack: IntegerBuffer,
    scratch: IntegerBuffer,
    output: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Evaluate a small validated batch and publish it transactionally."""
    if target_precision != 153088:
        raise ValueError("unsupported high-precision AGM logarithm target")
    if count < 1 or count > 8:
        raise ValueError("invalid high-precision AGM logarithm batch")
    if (
        len(mantissas) < count
        or len(precisions) < count
        or len(exponents) < count
        or len(pi_cache) < 3
        or len(log_cache) < 3
        or len(a) < 16385
        or len(b) < 16385
        or len(p) < 16385
        or len(q) < 16385
        or len(stack) < 105
        or len(scratch) < 3 * count
        or len(output) < 3 * count
        or len(state) < 5
    ):
        raise ValueError("high-precision AGM logarithm storage exhausted")
    for index in range(count):
        magnitude = abs(mantissas[index])
        if (
            precisions[index] != target_precision
            or magnitude.bit_length() != target_precision
            or magnitude == 1 << (target_precision - 1)
            or exponents[index] < -1000000
            or exponents[index] > 1000000
        ):
            raise ValueError("invalid high-precision AGM logarithm input")
    agm_count = 0
    for index in range(count):
        agm_count += pari_high_precision_log_uses_agm(
            mantissas[index], precisions[index], exponents[index]
        )
        rm, rp, re = pari_real_logarithm_high_precision_abs(
            mantissas[index],
            precisions[index],
            exponents[index],
            pi_cache,
            log_cache,
            a,
            b,
            p,
            q,
            stack,
        )
        offset = 3 * index
        scratch[offset] = rm
        scratch[offset + 1] = rp
        scratch[offset + 2] = re
    for index in range(3 * count):
        output[index] = scratch[index]
    state[0] = 0
    state[1] = target_precision
    state[2] = count
    state[3] = agm_count
    state[4] = count - agm_count
    return 0


__all__ = [
    "pari_agm1_real_abs",
    "pari_real_logarithm_agm_abs",
    "pari_high_precision_log_uses_agm",
    "pari_real_logarithm_high_precision_abs",
    "pari_high_precision_agm_log_batch",
]
