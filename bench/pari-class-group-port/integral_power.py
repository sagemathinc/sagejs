"""PARI 2.17.4 nonnegative integral `nfpow` preparation and powering.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source: `base3.c:nfpow, nf_to_scalar_or_basis`, `polarit2.c:content,
primitive_part`, and `trans1.c:powiu_sign, upowuu` (64-bit word branch).
Packed columns replace GEN allocation/aliases; the return value records the
scalar/column result tag. Negative, rational and factored inputs and exponents
at least 512 remain outside this explicit domain.
"""

from math import gcd
from sagejs.native import IntegerBuffer, native
from .integral_field_arithmetic import pari_integral_field_binary_power


@native
def pari_small_word_power(p: int, k: int) -> int:
    """The k <= 20 switch of 64-bit upowuu; zero signals overflow."""
    if k < 0 or k > 20 or p < 3 or p >= 18446744073709551616:
        raise ValueError("unsupported small word power")
    if k == 0:
        return 1
    if k == 1:
        return p
    if k == 2:
        if p >= 4294967296:
            return 0
        return p * p
    cutoff = 0
    if k == 3:
        cutoff = 2642245
    elif k == 4:
        cutoff = 65535
    elif k == 5:
        cutoff = 7131
    elif k == 6:
        cutoff = 1625
    elif k == 7:
        cutoff = 565
    elif k == 8:
        cutoff = 255
    elif k == 9:
        cutoff = 138
    elif k == 10:
        cutoff = 84
    elif k == 11:
        cutoff = 56
    elif k == 12:
        cutoff = 40
    elif k == 13:
        cutoff = 30
    elif k == 14:
        cutoff = 23
    elif k == 15:
        cutoff = 19
    elif k == 16:
        cutoff = 15
    elif k == 17:
        cutoff = 13
    elif k == 18:
        cutoff = 11
    elif k == 19:
        cutoff = 10
    else:
        cutoff = 9
    if p > cutoff:
        return 0
    p2 = p * p
    if k == 3:
        return p2 * p
    if k == 4:
        return p2 * p2
    if k == 5:
        return p2 * p2 * p
    if k == 6:
        return p2 * p2 * p2
    if k == 7:
        return p2 * p2 * p2 * p
    if k == 15:
        p3 = p2 * p
        p5 = p3 * p2
        return p5 * p5 * p5
    p4 = p2 * p2
    if k == 8:
        return p4 * p4
    if k == 9:
        return p4 * p4 * p
    if k == 10:
        return p4 * p4 * p2
    if k == 11:
        return p4 * p4 * p2 * p
    if k == 12:
        return p4 * p4 * p4
    if k == 13:
        return p4 * p4 * p4 * p
    if k == 14:
        return p4 * p4 * p4 * p2
    p8 = p4 * p4
    if k == 16:
        return p8 * p8
    if k == 17:
        return p * p8 * p8
    if k == 18:
        return p2 * p8 * p8
    if k == 19:
        return p * p2 * p8 * p8
    return p4 * p8 * p8


@native
def pari_word_power(p: int, k: int) -> int:
    """64-bit upowuu on nonnegative words, including its overflow sentinel.

    upowuu(0,0) is 0 upstream; powiu handles exponent zero before calling it.
    The one recursive tail call is flattened through the <=20 helper.
    """
    if p < 0 or p >= 18446744073709551616 or k < 0 or k >= 512:
        raise ValueError("unsupported word power")
    if p <= 2:
        if p < 2:
            return p
        if k < 64:
            return 1 << k
        return 0
    if k <= 20:
        return pari_small_word_power(p, k)
    if p == 3:
        if k > 40:
            return 0
    elif p == 4:
        if k > 31:
            return 0
        return 1 << (2 * k)
    elif p == 5:
        if k > 27:
            return 0
    elif p == 6:
        if k > 24:
            return 0
    elif p == 7:
        if k > 22:
            return 0
    else:
        return 0
    q = pari_small_word_power(p, k // 2)
    q *= q
    if k % 2 != 0:
        return q * p
    return q


@native
def pari_nonnegative_integer_power(a: int, exponent: int) -> int:
    """powiu/powiu_sign with their word shortcuts and binary branch below 512."""
    if exponent < 0 or exponent >= 512:
        raise ValueError("unsupported nonnegative integer exponent")
    if exponent == 0:
        return 1
    if a == 0:
        return 0
    negative = a < 0 and exponent % 2 != 0
    magnitude = abs(a)
    if magnitude < 18446744073709551616:
        if magnitude == 1:
            result = 1
        elif magnitude == 2:
            result = 1 << exponent
        else:
            result = pari_word_power(magnitude, exponent)
        if result != 0:
            if negative:
                return -result
            return result
    if exponent <= 2:
        if exponent == 2:
            return a * a
        return a
    result = a
    bit = 1
    while bit <= exponent // 2:
        bit *= 2
    bit //= 2
    while bit != 0:
        result *= result
        if (exponent // bit) % 2 != 0:
            result *= a
        bit //= 2
    if negative:
        return -abs(result)
    return abs(result)


@native
def pari_integral_element_power(
    table: IntegerBuffer,
    value: IntegerBuffer,
    n: int,
    exponent: int,
    primitive: IntegerBuffer,
    temporary: IntegerBuffer,
    output: IntegerBuffer,
    diagnostic: IntegerBuffer,
) -> int:
    """Integral nfpow with scalar dispatch and content; return 1 scalar/0 column.

    The input is a prepared basis column. Output always has n coefficients;
    the tag preserves PARI's scalar/column distinction. Diagnostics are the
    column square/multiply counts and order. Extra workspace copies versus GEN
    aliases are explicit. All buffers must be disjoint, with n >= 3.
    """
    if n < 3 or n > 4 or exponent < 0 or exponent >= 512:
        raise ValueError("unsupported integral element power domain")
    if len(output) < n or len(diagnostic) < 3:
        raise ValueError("insufficient integral element power output")
    if exponent == 0:
        for i in range(n):
            output[i] = 0
        output[0] = 1
        for i in range(3):
            diagnostic[i] = 0
        return 1
    if len(value) < n:
        raise ValueError("insufficient integral element power input")
    scalar = True
    for i in range(1, n):
        if value[i] != 0:
            scalar = False
            break
    if scalar:
        result = pari_nonnegative_integer_power(value[0], exponent)
        for i in range(n):
            output[i] = 0
        output[0] = result
        for i in range(3):
            diagnostic[i] = 0
        return 1
    if len(table) < n * n * n or len(primitive) < n or len(temporary) < n:
        raise ValueError("insufficient integral element power workspace")
    # content: backwards integer-column traversal with early gcd-one exit.
    content = value[n - 1]
    for i in range(n - 2, -1, -1):
        content = gcd(content, value[i])
        if content == 1:
            break
    content = abs(content)
    for i in range(n):
        if content == 1:
            primitive[i] = value[i]
        else:
            primitive[i] = value[i] // content
    pari_integral_field_binary_power(
        table, primitive, n, exponent, temporary, output, diagnostic
    )
    if content != 1:
        scale = pari_nonnegative_integer_power(content, exponent)
        for i in range(n):
            output[i] *= scale
    return 0
