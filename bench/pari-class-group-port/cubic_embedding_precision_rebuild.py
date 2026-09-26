"""PARI 2.17.4 precision rebuild for one authentic totally real cubic.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

This is the narrow `get_roots -> make_M` source cut needed by the frozen
`x^3 - 20018*x + 20034` retry.  It starts with the ordered resident roots,
certifies a dyadic bracket against the exact polynomial, refines that bracket,
and evaluates the integral basis `[1, x, x^2 + 2*x - 13345]` using PARI's
ordinary/inverse Horner choice.  No retry-precision floating value is input.
"""

from sagejs.native import IntegerBuffer, Int64Buffer, native

from .exponential import pari_real_reciprocal
from .short_product import (
    pari_short_product,
    pari_short_square,
    pari_word_integer_real_product,
    pari_word_integer_real_sum,
)


@native
def pari_cubic_dyadic_polynomial_sign(numerator: int, fractional_bits: int) -> int:
    """Sign of `x^3 - 20018*x + 20034` at `x=numerator/2^k`."""
    scaled = numerator * numerator * numerator
    scaled -= (20018 * numerator) << (2 * fractional_bits)
    scaled += 20034 << (3 * fractional_bits)
    if scaled < 0:
        return -1
    if scaled > 0:
        return 1
    return 0


@native
def pari_cubic_refine_root(
    mantissa: int, precision: int, exponent: int, target: int
) -> tuple[int, int, int]:
    """Certify and correctly round one ordered resident root.

    PARI's Uspensky/Newton route ultimately rounds the same simple algebraic
    root.  A fixed dyadic refinement is used here as a source-transparent
    arithmetic-leaf substitution: the exact polynomial certifies every side
    of the bracket, and 128 guard bits make the final rounding unambiguous.
    """
    if mantissa == 0 or precision < 64 or precision > 512:
        raise ValueError("invalid resident cubic root")
    if precision % 64 != 0 or abs(mantissa).bit_length() != precision:
        raise ValueError("invalid resident cubic root precision")
    if target < 64 or target > 4096 or target % 64 != 0:
        raise ValueError("unsupported cubic retry root precision")
    fractional_bits = target + 128
    seed_shift = fractional_bits + exponent + 1 - precision
    if seed_shift < 1:
        raise ValueError("resident cubic root lacks guard precision")
    center = mantissa << seed_shift
    radius = 1 << seed_shift
    lower = center - radius
    upper = center + radius
    lower_sign = pari_cubic_dyadic_polynomial_sign(lower, fractional_bits)
    upper_sign = pari_cubic_dyadic_polynomial_sign(upper, fractional_bits)
    expansions = 0
    while lower_sign == upper_sign:
        radius <<= 1
        lower = center - radius
        upper = center + radius
        lower_sign = pari_cubic_dyadic_polynomial_sign(lower, fractional_bits)
        upper_sign = pari_cubic_dyadic_polynomial_sign(upper, fractional_bits)
        expansions += 1
        if expansions > 64:
            raise ValueError("resident cubic root does not isolate a root")
    if lower_sign == 0 or upper_sign == 0:
        raise ValueError("unexpected rational cubic root")
    while upper - lower > 1:
        middle = (lower + upper) // 2
        middle_sign = pari_cubic_dyadic_polynomial_sign(middle, fractional_bits)
        if middle_sign == 0:
            raise ValueError("unexpected rational cubic root")
        if middle_sign == lower_sign:
            lower = middle
        else:
            upper = middle
    # Convert both certified endpoints to a target-width packed real.  They
    # must select the same rounded value; otherwise the refinement budget was
    # insufficient rather than silently choosing a side.
    shift = fractional_bits - (target - exponent - 1)
    lower_magnitude = abs(lower)
    upper_magnitude = abs(upper)
    lower_rounded = (lower_magnitude + (1 << (shift - 1))) >> shift
    upper_rounded = (upper_magnitude + (1 << (shift - 1))) >> shift
    if lower < 0:
        lower_rounded = -lower_rounded
    if upper < 0:
        upper_rounded = -upper_rounded
    if lower_rounded != upper_rounded:
        raise ValueError("ambiguous cubic root rounding")
    if abs(lower_rounded).bit_length() != target:
        raise ValueError("cubic root exponent changed unexpectedly")
    return lower_rounded, target, exponent


@native
def pari_cubic_integral_basis_value(
    mantissa: int, precision: int, exponent: int
) -> tuple[int, int, int]:
    """Evaluate `x^2 + 2*x - 13345` with `RgX_cxeval` association."""
    if exponent <= 1:
        # Ordinary Horner: (x + 2) * x - 13345.
        sm, sp, se = pari_word_integer_real_sum(2, mantissa, precision, exponent)
        sm, sp, se = pari_short_product(mantissa, precision, exponent, sm, sp, se)
        return pari_word_integer_real_sum(-13345, sm, sp, se)
    # For |x| > 4 make_M supplies ui=1/x.  RgX_cxeval reverses Horner and
    # multiplies by x^degree at the end.
    im, ip, ie = pari_real_reciprocal(mantissa, precision, exponent)
    sm, sp, se = pari_word_integer_real_product(-13345, im, ip, ie)
    sm, sp, se = pari_word_integer_real_sum(2, sm, sp, se)
    sm, sp, se = pari_short_product(im, ip, ie, sm, sp, se)
    sm, sp, se = pari_word_integer_real_sum(1, sm, sp, se)
    qm, qp, qe = pari_short_square(mantissa, precision, exponent)
    return pari_short_product(qm, qp, qe, sm, sp, se)


@native
def pari_cubic_embedding_precision_rebuild(
    resident_m: IntegerBuffer,
    resident_p: IntegerBuffer,
    resident_e: IntegerBuffer,
    target: int,
    root_m: IntegerBuffer,
    root_p: IntegerBuffer,
    root_e: IntegerBuffer,
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    state: Int64Buffer,
) -> int:
    """Rebuild ordered retry roots and `nf_get_M` transactionally.

    Matrix storage is row-major, matching the compiled S-unit consumer.  The
    three root scratch buffers may change on failure; public matrix buffers do
    not change until all roots and basis values have been certified.
    """
    if (
        len(resident_m) < 3
        or len(resident_p) < 3
        or len(resident_e) < 3
        or len(root_m) < 6
        or len(root_p) < 6
        or len(root_e) < 6
        or len(matrix_m) < 9
        or len(matrix_p) < 9
        or len(matrix_e) < 9
        or len(state) < 4
    ):
        raise ValueError("short cubic embedding precision storage")
    state[0] = -1
    state[1] = 0
    state[2] = 0
    state[3] = 0
    for i in range(3):
        rm, rp, re = pari_cubic_refine_root(
            resident_m[i], resident_p[i], resident_e[i], target
        )
        root_m[i] = rm
        root_p[i] = rp
        root_e[i] = re
        state[1] = i + 1
    # Exponents differ, so mantissas alone are not generally comparable.  The
    # frozen isolating intervals are (-142,-141), (1,2), and (140,141).
    if not (
        root_m[0] < 0
        and root_m[1] > 0
        and root_m[2] > 0
        and root_e[0] == 7
        and root_e[1] == 0
        and root_e[2] == 7
    ):
        raise ValueError("rebuilt cubic roots changed source order")
    for row in range(3):
        bm, bp, be = pari_cubic_integral_basis_value(
            root_m[row], root_p[row], root_e[row]
        )
        root_m[row + 3] = bm
        root_p[row + 3] = bp
        root_e[row + 3] = be
    state[2] = 3
    for row in range(3):
        base = 3 * row
        matrix_m[base] = 1
        matrix_p[base] = -1
        matrix_e[base] = 0
        matrix_m[base + 1] = root_m[row]
        matrix_p[base + 1] = root_p[row]
        matrix_e[base + 1] = root_e[row]
        matrix_m[base + 2] = root_m[row + 3]
        matrix_p[base + 2] = root_p[row + 3]
        matrix_e[base + 2] = root_e[row + 3]
    state[0] = 0
    state[3] = target
    return 0
