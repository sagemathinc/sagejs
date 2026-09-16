# sagejs: native-bitwise
"""PARI 2.17.4 single-word F2x and square F2m kernel specialization.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.
Source F2x.c and F2v.c, F2x_mul1/sqr/rem/divrem/gcd/deriv/sqrt/valrem
and F2m_ker_sp(deplin=0). Packed nonnegative integers encode coefficients
in ascending bits. Caller domain: polynomial degrees <=8 (products <=8),
and square matrices n<=4. These bounds eliminate high-word operations,
not the source low-word iteration or pivot schedule. Matrix workspace spans
must be disjoint; output beyond the returned nullity remains untouched.
The source's tiny lookup arrays are packed integer constants here, with
identical lookup values but different access costs. XOR/OR explicitly use
uint64 because the native exact-integer frontend lacks those operators.
"""

from sagejs.native import IntegerBuffer, checked_uint64, native


@native
def _f2x_xor(a: int, b: int) -> int:
    x = checked_uint64(a)
    y = checked_uint64(b)
    return int(x ^ y)


@native
def _f2x_or(a: int, b: int) -> int:
    x = checked_uint64(a)
    y = checked_uint64(b)
    return int(x | y)


@native
def pari_f2x_small_degree(a: int) -> int:
    return a.bit_length() - 1


@native
def pari_f2x_small_valuation(a: int) -> int:
    if a == 0:
        return 9223372036854775807
    return (a & -a).bit_length() - 1


@native
def pari_f2x_small_mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    result = 0
    for i in range(32):
        if a & (1 << i):
            result = _f2x_xor(result, b << i)
    return result


@native
def pari_f2x_small_sqr(a: int) -> int:
    result = 0
    table = 113422181812702652413409978531426074880
    if a != 0:
        for i in range(0, 32, 4):
            nibble = (a >> i) & 15
            # Source sq[16], packed as sixteen byte entries.
            value = (table >> (8 * nibble)) & 255
            result = _f2x_or(result, value << (2 * i))
    return result


@native
def pari_f2x_small_sqrt(a: int) -> int:
    """Source assumes a perfect square; odd coefficients are caller-invalid."""
    result = 0
    if a != 0:
        for i in range(0, 64, 8):
            low = (a >> i) & 15
            high = (a >> (i + 4)) & 15
            index = _f2x_or(low, high << 1)
            # Source sq[16], packed as sixteen nibble entries.
            value = (18355225778678027280 >> (4 * index)) & 15
            result = _f2x_or(result, value << (i // 2))
    return result


@native
def pari_f2x_small_rem(a: int, b: int) -> int:
    degree_b = pari_f2x_small_degree(b)
    if degree_b < 0:
        raise ZeroDivisionError("zero F2x divisor")
    if degree_b == 0:
        return 0
    degree_a = pari_f2x_small_degree(a)
    while degree_a >= degree_b:
        a = _f2x_xor(a, b << (degree_a - degree_b))
        degree_a = pari_f2x_small_degree(a)
    return a


@native
def pari_f2x_small_div(a: int, b: int) -> int:
    degree_b = pari_f2x_small_degree(b)
    if degree_b < 0:
        raise ZeroDivisionError("zero F2x divisor")
    if degree_b == 0:
        return a
    result = 0
    degree_a = pari_f2x_small_degree(a)
    while degree_a >= degree_b:
        shift = degree_a - degree_b
        result = _f2x_or(result, 1 << shift)
        a = _f2x_xor(a, b << shift)
        degree_a = pari_f2x_small_degree(a)
    return result


@native
def pari_f2x_small_gcd(a: int, b: int) -> int:
    # Source swaps by GEN word length, not polynomial degree. In one word,
    # only zero/nonzero operands have different lengths.
    if a == 0 and b != 0:
        a, b = b, a
    while b != 0:
        c = pari_f2x_small_rem(a, b)
        a = b
        b = c
    return a


@native
def pari_f2x_small_deriv(a: int) -> int:
    return (a >> 1) & 6148914691236517205


@native
def pari_f2m_small_kernel(
    w: IntegerBuffer, columns: int, n: int, output: int, pivots: int
) -> int:
    """Destroy columns exactly as F2m_ker_sp; pivots are one-based or zero."""
    if (
        n < 0
        or n > 4
        or columns < 0
        or output < 0
        or pivots < 0
        or len(w) < columns + n
        or len(w) < output + n
        or len(w) < pivots + n
    ):
        raise ValueError("invalid small F2m dimensions")
    for k in range(n):
        if w[columns + k] < 0 or w[columns + k] >= (1 << n):
            raise ValueError("invalid small F2m column")
    available = (1 << n) - 1
    count = 0
    for k in range(n):
        unused = w[columns + k] & available
        if unused == 0:
            count += 1
            w[pivots + k] = 0
        else:
            row = pari_f2x_small_valuation(unused)
            available -= 1 << row
            w[pivots + k] = row + 1
            w[columns + k] -= 1 << row
            for i in range(k + 1, n):
                if w[columns + i] & (1 << row):
                    w[columns + i] = _f2x_xor(w[columns + i], w[columns + k])
            w[columns + k] = _f2x_or(w[columns + k], 1 << row)
    at = 0
    for k in range(n):
        if w[pivots + k] == 0:
            value = 1 << k
            for i in range(k):
                if (
                    w[pivots + i] != 0
                    and (w[columns + k] & (1 << (w[pivots + i] - 1))) != 0
                ):
                    value = _f2x_or(value, 1 << i)
            w[output + at] = value
            at += 1
    return count
