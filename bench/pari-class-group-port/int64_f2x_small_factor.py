# sagejs: native-bitwise
"""Bounded packed-F2 factor degrees for the translated `get_fs` corridor.

Copyright (C) The PARI group. GPL-2.0-or-later, without warranty.

The degree-two-through-four domain contains exactly eight monic irreducibles:
two linear, one quadratic, two cubic, and three quartic polynomials.  Trial
division by that complete ordered list gives the same degree/exponent vectors
needed by PARI's `get_fs`, while keeping every packed polynomial in `uint64`.
"""

from sagejs.native import Int64Buffer, checked_int64, int64, native, uint64


@native
def uint64_f2x_degree_nonzero(polynomial: uint64) -> uint64:
    """Return the degree of a nonzero packed binary polynomial."""
    if polynomial == 0:
        raise ValueError("zero packed binary polynomial")
    degree: uint64 = 0
    value: uint64 = polynomial
    while value > 1:
        value >>= 1
        degree += 1
    return degree


@native
def uint64_f2x_rem(dividend: uint64, divisor: uint64) -> uint64:
    """Return the packed polynomial remainder over F2."""
    if divisor == 0:
        raise ZeroDivisionError("zero packed binary divisor")
    divisor_degree: uint64 = uint64_f2x_degree_nonzero(divisor)
    while dividend != 0:
        dividend_degree: uint64 = uint64_f2x_degree_nonzero(dividend)
        if dividend_degree < divisor_degree:
            break
        dividend = dividend ^ (divisor << (dividend_degree - divisor_degree))
    return dividend


@native
def uint64_f2x_div_exact(dividend: uint64, divisor: uint64) -> uint64:
    """Return an exact packed quotient over F2, rejecting a remainder."""
    if divisor == 0:
        raise ZeroDivisionError("zero packed binary divisor")
    divisor_degree: uint64 = uint64_f2x_degree_nonzero(divisor)
    quotient: uint64 = 0
    while dividend != 0:
        dividend_degree: uint64 = uint64_f2x_degree_nonzero(dividend)
        if dividend_degree < divisor_degree:
            break
        shift: uint64 = dividend_degree - divisor_degree
        quotient |= 1 << shift
        dividend = dividend ^ (divisor << shift)
    if dividend != 0:
        raise ValueError("nonexact packed binary division")
    return quotient


@native
def int64_pari_f2x_small_degfact(
    polynomial: uint64,
    factor_degrees: Int64Buffer,
    factor_exponents: Int64Buffer,
) -> int64:
    """Return distinct factor degrees and multiplicities for degree 2--4."""
    if polynomial < 4 or polynomial >= 32:
        raise ValueError("binary small factor degree frontier")
    factor_degrees_length: int64 = checked_int64(len(factor_degrees))
    factor_exponents_length: int64 = checked_int64(len(factor_exponents))
    if factor_degrees_length < 4 or factor_exponents_length < 4:
        raise ValueError("short bounded binary factor storage")
    remaining: uint64 = polynomial
    count: int64 = 0
    _range_candidates: int64 = 8
    index: int64 = 0
    for index in range(_range_candidates):
        candidate: uint64 = 2
        degree: int64 = 1
        if index == 1:
            candidate = 3
        elif index == 2:
            candidate = 7
            degree = 2
        elif index == 3:
            candidate = 11
            degree = 3
        elif index == 4:
            candidate = 13
            degree = 3
        elif index == 5:
            candidate = 19
            degree = 4
        elif index == 6:
            candidate = 25
            degree = 4
        elif index == 7:
            candidate = 31
            degree = 4
        exponent: int64 = 0
        while remaining != 1 and uint64_f2x_rem(remaining, candidate) == 0:
            remaining = uint64_f2x_div_exact(remaining, candidate)
            exponent += 1
        if exponent != 0:
            factor_degrees[count] = degree
            factor_exponents[count] = exponent
            count += 1
    if remaining != 1:
        raise ValueError("incomplete bounded binary factor list")
    return count
