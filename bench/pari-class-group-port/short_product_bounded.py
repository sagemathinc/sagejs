"""Bounded-control real arithmetic for the class-group admission hot path.

This is the same PARI 2.17.4 short-real arithmetic used by
`short_product.py`, with exact mantissas and explicitly machine-sized
precision, exponent, loop, and indexing metadata.  The caller performs a
nonmutating range preflight and retains the ordinary exact implementation as
its fallback.  Copyright (C) The PARI group. GPL-2.0-or-later, without
warranty.
"""

from sagejs.native import (
    IntegerBuffer,
    checked_int64,
    checked_uint64,
    diagnostic_stage_switch,
    int64,
    integer_buffer_get_int64,
    native,
    native_inline,
    uint64,
)

from .bounded_real_sum_core import (
    _pari_bounded_positive_real_sum_trusted,
    _pari_bounded_signed_real_sum_trusted,
    pari_bounded_word_integer_real_product,
)


@native
def pari_bounded_mulll_words(a: uint64, b: uint64) -> tuple[uint64, uint64]:
    """Return the low/high words of an unsigned product."""
    ua = checked_uint64(a)
    ub = checked_uint64(b)
    mask = checked_uint64(4294967295)
    a0 = ua & mask
    a1 = ua >> 32
    b0 = ub & mask
    b1 = ub >> 32
    t = a0 * b0
    low0 = t & mask
    t = a1 * b0 + (t >> 32)
    middle = t & mask
    high0 = t >> 32
    t = a0 * b1 + middle
    high = a1 * b1 + high0 + (t >> 32)
    low = ((t & mask) << 32) | low0
    return low, high


@native
def pari_bounded_positive_real_sum(
    mx: int,
    px: int64,
    ex: int64,
    my: int,
    py: int64,
    ey: int64,
) -> tuple[int, int64, int64]:
    """Checked boundary for the nonnegative bounded real sum."""
    if mx < 0 or my < 0:
        raise ValueError("positive real sum does not implement subtraction")
    if mx != 0 and my != 0:
        if px < 64 or py < 64 or px > 154112 or py > 154112:
            raise ValueError("positive real sum prototype precision out of range")
        if px % 64 != 0 or py % 64 != 0:
            raise ValueError("positive real sum requires 64-bit words")
        if checked_int64(mx.bit_length()) != px or checked_int64(my.bit_length()) != py:
            raise ValueError("positive real sum requires full mantissas")
    return _pari_bounded_positive_real_sum_trusted(mx, px, ex, my, py, ey)


@native_inline
def pari_bounded_signed_real_sum(
    mx: int,
    px: int64,
    ex: int64,
    my: int,
    py: int64,
    ey: int64,
) -> tuple[int, int64, int64]:
    """Checked boundary for signed bounded-real addition."""
    if mx == 0 or my == 0 or (mx > 0 and my > 0) or (mx < 0 and my < 0):
        m, p, e = pari_bounded_positive_real_sum(abs(mx), px, ex, abs(my), py, ey)
        if mx < 0 or my < 0:
            m = -m
        return m, p, e
    if px < 64 or py < 64 or px > 154112 or py > 154112:
        raise ValueError("signed real sum prototype precision out of range")
    if px % 64 != 0 or py % 64 != 0:
        raise ValueError("signed real sum requires 64-bit words")
    if (
        checked_int64(abs(mx).bit_length()) != px
        or checked_int64(abs(my).bit_length()) != py
    ):
        raise ValueError("signed real sum requires full mantissas")
    return _pari_bounded_signed_real_sum_trusted(mx, px, ex, my, py, ey)


@native
def pari_bounded_word_integer_real_sum(
    integer: int, mantissa: int, precision: int64, exponent: int64
) -> tuple[int, int64, int64]:
    """Add an exact signed one-word integer to a prepared real."""
    if integer == 0:
        return mantissa, precision, exponent
    bits: int64 = checked_int64(abs(integer).bit_length())
    if bits > 64:
        raise ValueError("multiword integer-real sum is not ported")
    gap: int64 = exponent - (bits - 1)
    if mantissa == 0:
        if gap >= 0:
            return mantissa, precision, exponent
        converted_precision: int64 = 64 * ((-gap + 63) // 64)
        return (
            integer << (converted_precision - bits),
            converted_precision,
            checked_int64(bits - 1),
        )
    if gap > 0:
        converted_precision: int64 = precision - 64 * (gap // 64)
        if converted_precision < 64:
            return mantissa, precision, exponent
    else:
        converted_precision: int64 = precision + 64 * ((-gap + 63) // 64)
    converted = integer << (converted_precision - bits)
    return _pari_bounded_signed_real_sum_trusted(
        converted, converted_precision, bits - 1, mantissa, precision, exponent
    )


@native
def _pari_bounded_short_product_trusted(
    mx: int,
    px: int64,
    ex: int64,
    my: int,
    py: int64,
    ey: int64,
) -> tuple[int, int64, int64]:
    """PARI's short product after the caller proves normalized operands."""
    if mx == 0 or my == 0:
        return 0, checked_int64(0), ex + ey
    negative: int64 = 0
    if mx < 0:
        negative = 1
        mx = -mx
    if my < 0:
        negative = 1 - negative
        my = -my
    if px > py:
        mx, my = my, mx
        px, py = py, px
    if px == 64:
        word_a = checked_uint64(mx)
        word_b = checked_uint64(my >> (py - 64))
        word_low, word_high = pari_bounded_mulll_words(word_a, word_b)
        if py > 64:
            c = checked_uint64((my >> (py - 128)) & 18446744073709551615)
            unused, cross = pari_bounded_mulll_words(word_a, c)
            previous = word_low
            word_low = checked_uint64((word_low + cross) & 18446744073709551615)
            if word_low < previous:
                word_high = checked_uint64(word_high + 1)
        exponent: int64 = ex + ey
        if word_high >= 9223372036854775808:
            if word_low & 9223372036854775808:
                word_high = checked_uint64(word_high + 1)
            exponent += 1
        else:
            word_high = checked_uint64((word_high << 1) | (word_low >> 63))
            if word_low & 4611686018427387904:
                word_high = checked_uint64(word_high + 1)
                if word_high == 0:
                    word_high = checked_uint64(9223372036854775808)
                    exponent += 1
        result = int(word_high)
        if negative:
            result = -result
        return result, checked_int64(64), exponent
    # The bounded path substitutes GMP's exact integer multiplication for
    # PARI's small-precision truncated limb loop, then applies the same real
    # normalization and nearest-bit rounding.  This is an arithmetic backend
    # substitution, not a claim that the primitive instruction sequence is
    # identical to PARI's.
    product = mx * my
    bits: int64 = checked_int64(product.bit_length())
    exponent: int64 = ex + ey + bits - px - py + 1
    discard: int64 = bits - px
    result = (product + (1 << (discard - 1))) >> discard
    if checked_int64(result.bit_length()) > px:
        result >>= 1
        exponent += 1
    if negative:
        result = -result
    return result, px, exponent


@native
def pari_bounded_short_product(
    mx: int,
    px: int64,
    ex: int64,
    my: int,
    py: int64,
    ey: int64,
) -> tuple[int, int64, int64]:
    """Checked public boundary for the bounded short product."""
    if mx == 0 or my == 0:
        return _pari_bounded_short_product_trusted(mx, px, ex, my, py, ey)
    if px < 64 or py < 64 or px > 154112 or py > 154112:
        raise ValueError("bounded short-product precision out of range")
    if px % 64 != 0 or py % 64 != 0:
        raise ValueError("short-product prototype requires 64-bit words")
    if (
        checked_int64(abs(mx).bit_length()) != px
        or checked_int64(abs(my).bit_length()) != py
    ):
        raise ValueError("short-product prototype requires full mantissas")
    return _pari_bounded_short_product_trusted(mx, px, ex, my, py, ey)


@native
def pari_bounded_embedding_row(
    mantissas: IntegerBuffer,
    precisions: IntegerBuffer,
    exponents: IntegerBuffer,
    coefficients: IntegerBuffer,
    offset: int64,
    degree: int64,
) -> tuple[int, int64, int64]:
    """Prepared embedding row with checked machine-sized metadata."""
    if degree < 1:
        raise ValueError("embedding row must be nonempty")
    precision: int64 = integer_buffer_get_int64(precisions, offset)
    exponent: int64 = integer_buffer_get_int64(exponents, offset)
    if precision == -1:
        value = mantissas[offset] * coefficients[0]
        exponent = 0
    else:
        value, precision, exponent = pari_bounded_word_integer_real_product(
            coefficients[0], mantissas[offset], precision, exponent
        )
    for j in range(1, degree):
        k: int64 = offset + j
        matrix_precision: int64 = integer_buffer_get_int64(precisions, k)
        if matrix_precision != -1 or mantissas[k] != 0:
            matrix_exponent: int64 = integer_buffer_get_int64(exponents, k)
            if matrix_precision == -1:
                term = mantissas[k] * coefficients[j]
                term_precision: int64 = -1
                term_exponent: int64 = 0
            else:
                term, term_precision, term_exponent = (
                    pari_bounded_word_integer_real_product(
                        coefficients[j],
                        mantissas[k],
                        matrix_precision,
                        matrix_exponent,
                    )
                )
            if precision == -1:
                if term_precision == -1:
                    value += term
                else:
                    value, precision, exponent = pari_bounded_word_integer_real_sum(
                        value, term, term_precision, term_exponent
                    )
            elif term_precision == -1:
                value, precision, exponent = pari_bounded_word_integer_real_sum(
                    term, value, precision, exponent
                )
            else:
                value, precision, exponent = _pari_bounded_signed_real_sum_trusted(
                    value, precision, exponent, term, term_precision, term_exponent
                )
    return value, precision, exponent


@native
def pari_bounded_real_matrix_norm(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coefficients: IntegerBuffer,
    values_m: IntegerBuffer,
    values_p: IntegerBuffer,
    values_e: IntegerBuffer,
    degree: int64,
) -> tuple[int, int64, int64]:
    """All-real prepared matrix norm with bounded scalar metadata."""
    if degree < 1 or degree > 5:
        raise ValueError("unsupported bounded matrix degree")
    diagnostic_stage_switch(1)
    for i in range(degree):
        m, p, e = pari_bounded_embedding_row(
            matrix_m, matrix_p, matrix_e, coefficients, i * degree, degree
        )
        if p == -1:
            raise ValueError("exact integer norm component is not ported")
        values_m[i] = m
        values_p[i] = p
        values_e[i] = e
    diagnostic_stage_switch(2)
    value = values_m[0]
    precision: int64 = checked_int64(values_p[0])
    exponent: int64 = checked_int64(values_e[0])
    for i in range(1, degree):
        value, precision, exponent = _pari_bounded_short_product_trusted(
            value,
            precision,
            exponent,
            values_m[i],
            checked_int64(values_p[i]),
            checked_int64(values_e[i]),
        )
    diagnostic_stage_switch(0)
    return value, precision, exponent


@native
def pari_bounded_real_matrix_norm_fused(
    matrix_m: IntegerBuffer,
    matrix_p: IntegerBuffer,
    matrix_e: IntegerBuffer,
    coefficients: IntegerBuffer,
    degree: int64,
) -> tuple[int, int64, int64]:
    """All-real norm without materializing the short embedding vector.

    The public prepared path has already validated the matrix metadata and the
    returned norm is its only consumer.  Keeping each embedding in exact and
    fixed-width locals avoids exporting it to an `IntegerBuffer` merely to
    import it again for the immediately following product.
    """
    if degree < 1 or degree > 5:
        raise ValueError("unsupported bounded matrix degree")
    diagnostic_stage_switch(1)
    value, precision, exponent = pari_bounded_embedding_row(
        matrix_m, matrix_p, matrix_e, coefficients, checked_int64(0), degree
    )
    if precision == -1:
        raise ValueError("exact integer norm component is not ported")
    for i in range(1, degree):
        diagnostic_stage_switch(2)
        term, term_precision, term_exponent = pari_bounded_embedding_row(
            matrix_m, matrix_p, matrix_e, coefficients, i * degree, degree
        )
        if term_precision == -1:
            raise ValueError("exact integer norm component is not ported")
        diagnostic_stage_switch(3)
        value, precision, exponent = _pari_bounded_short_product_trusted(
            value,
            precision,
            exponent,
            term,
            term_precision,
            term_exponent,
        )
    diagnostic_stage_switch(0)
    return value, precision, exponent


__all__ = [
    "pari_bounded_real_matrix_norm",
    "pari_bounded_real_matrix_norm_fused",
]
