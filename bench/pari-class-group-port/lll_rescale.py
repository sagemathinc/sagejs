"""PARI 2.17.4 polarit2.c integer/real rescaling for LLL blocks.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Rational entries and all-inexact-zero matrices are outside this boundary.
"""

from sagejs.native import IntegerBuffer, native
from .lll_binary import pari_lll_binary


@native
def pari_lll_rescale(matrix: IntegerBuffer, output: IntegerBuffer) -> int:
    """RgM_rescale_to_int for a flat collection of integer/real triples."""
    if len(matrix) % 3 != 0 or len(output) < len(matrix) // 3:
        raise ValueError("rescaling storage mismatch")
    count = len(matrix) // 3
    exact = 1
    minimum = 1 << 61
    nonzero = 0
    for i in range(count):
        m, p, e = matrix[3 * i], matrix[3 * i + 1], matrix[3 * i + 2]
        if p < -1 or (p > 0 and p % 64 != 0) or (p == 0 and m != 0):
            raise ValueError("invalid integer/real rescaling triple")
        if p != -1:
            exact = 0
        if m != 0:
            nonzero = 1
            if p == -1:
                exponent = abs(m).bit_length() - 1
            else:
                magnitude = abs(m)
                trailing = 0
                while magnitude % 2 == 0:
                    trailing += 1
                    magnitude //= 2
                exponent = e + 1 - p + trailing
            if exponent < minimum:
                minimum = exponent
    if exact:
        for i in range(count):
            output[i] = matrix[3 * i]
        return 0
    if not nonzero:
        raise ValueError("all-inexact-zero rescaling is outside this boundary")
    for i in range(count):
        m, p, e = matrix[3 * i], matrix[3 * i + 1], matrix[3 * i + 2]
        if m == 0:
            output[i] = 0
        else:
            shift = -minimum
            if p != -1:
                shift += e + 1 - p
            if shift >= 0:
                output[i] = m << shift
            else:
                # grndtoi/diviiround: nearest integer, ties toward +infinity.
                output[i] = (m + (1 << (-shift - 1))) >> -shift
    return 0


@native
def pari_lll_binary_block(
    matrix: IntegerBuffer, integers: IntegerBuffer
) -> tuple[int, int, int, int]:
    """lllfp's rescale-to-integer boundary followed by its 2x2 shortcut."""
    if len(matrix) != 12 or len(integers) < 4:
        raise ValueError("binary real LLL requires a 2x2 block")
    pari_lll_rescale(matrix, integers)
    return pari_lll_binary(integers[0], integers[1], integers[2], integers[3])
