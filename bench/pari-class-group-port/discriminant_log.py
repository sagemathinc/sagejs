"""PARI 2.17.4 integer `dbllog2` path used by `Buchall_param`.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Translate rootpol.c `mydbllog2i` for the pinned 64-bit PARI representation.
This is its approximation, not a new correctly-rounded logarithm algorithm.
"""

from math import log2

from sagejs.native import checked_uint64, native, uint64


@native
def pari_integer_log_words(high: uint64, following: uint64, exponent: uint64) -> float:
    """Preserve unsigned-word-to-double rounding and source operation order."""
    leading = float(high)
    if exponent == 0:
        return log2(leading)
    leading += float(following) * (1.0 / (4294967296.0 * 4294967296.0))
    return log2(leading) + float(exponent)


@native
def pari_discriminant_log(discriminant: int) -> float:
    """Compute `dbllog2(abs(D)) * M_LN2` for a nonzero discriminant.

    Only the top two 64-bit words participate, including when D has thousands
    of bits. The zero-integer log convention is outside the field domain.
    """
    magnitude = abs(discriminant)
    if magnitude == 0:
        raise ValueError("zero number-field discriminant")
    words = (magnitude.bit_length() + 63) // 64
    exponent = (words - 1) * 64
    high = checked_uint64(magnitude >> exponent)
    following = checked_uint64(0)
    if words > 1:
        following = checked_uint64(
            (magnitude >> (exponent - 64)) & 18446744073709551615
        )
    return (
        pari_integer_log_words(high, following, checked_uint64(exponent))
        * 0.69314718055994530942
    )
