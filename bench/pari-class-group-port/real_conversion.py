"""PARI 2.17.4 affir/rdiviiz value operations for constant construction.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Exact integer quotient computation uses the declared arithmetic backend.
"""

from sagejs.native import native

from .short_product import pari_real_integer_division, pari_real_word_division


@native
def pari_integer_to_real(value: int, precision: int) -> tuple[int, int, int]:
    """Convert an exact integer using affir's leading guard-bit rounding."""
    if precision < 64 or precision > 2432 or precision % 64 != 0:
        raise ValueError("unsupported integer-to-real precision")
    if value == 0:
        return 0, 0, -precision
    magnitude = abs(value)
    bits = magnitude.bit_length()
    exponent = bits - 1
    if bits <= precision:
        magnitude <<= precision - bits
    else:
        shift = bits - precision
        magnitude = (magnitude + (1 << (shift - 1))) >> shift
        if magnitude.bit_length() > precision:
            magnitude >>= 1
            exponent += 1
    if value < 0:
        magnitude = -magnitude
    return magnitude, precision, exponent


@native
def pari_rational_to_real(
    numerator: int, denominator: int, precision: int
) -> tuple[int, int, int]:
    """Follow rdiviiz's word, oversized-integer and scaled-quotient branches."""
    if denominator == 0:
        raise ZeroDivisionError("zero rational denominator")
    if precision < 64 or precision > 2432 or precision % 64 != 0:
        raise ValueError("unsupported rational-to-real precision")
    if numerator == 0:
        return 0, 0, -precision
    numerator_bits = abs(numerator).bit_length()
    denominator_bits = abs(denominator).bit_length()
    if denominator_bits <= 64:
        m, p, e = pari_integer_to_real(numerator, precision)
        if denominator < 0:
            m = -m
        return pari_real_word_division(abs(denominator), m, p, e)
    if (numerator_bits + 63) // 64 > precision // 64 + 1 or (
        denominator_bits + 63
    ) // 64 > precision // 64 + 1:
        m, p, e = pari_integer_to_real(numerator, precision)
        return pari_real_integer_division(denominator, m, p, e)
    shift = precision + denominator_bits - numerator_bits + 1
    scaled = abs(numerator)
    if shift > 0:
        scaled <<= shift
    quotient = scaled // abs(denominator)
    if (numerator < 0) != (denominator < 0):
        quotient = -quotient
    m, p, e = pari_integer_to_real(quotient, precision)
    if shift > 0:
        e -= shift
    return m, p, e
