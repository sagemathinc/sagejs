"""Source-transparent typed Tate reduction at primes greater than three.

This is a compiler research workload, not a second production
implementation.  Its mathematical branches mirror ``_ec_tate_large_prime``
and it remains executable by ordinary CPython.  The scalar coefficient
signature deliberately avoids teaching the compiler an algorithm-specific
Tate intrinsic while its native result uses ``0`` for the good-reduction
branch's otherwise optional reduction marker.
"""

from __future__ import annotations

from typing import Tuple

from sagejs.native import native


@native
def tate_power(base: int, exponent: int) -> int:
    answer = 1
    while exponent > 0:
        if exponent % 2:
            answer *= base
        exponent //= 2
        if exponent:
            base *= base
    return answer


@native
def tate_valuation(value: int, prime: int) -> int:
    if value < 0:
        value = -value
    if value == 0:
        # Match the production valuation sentinel.  Tate only compares this
        # with finite discriminant valuations, so no arithmetic result can
        # depend on the particular sufficiently large value.
        return 1000000000
    answer = 0
    while value % prime == 0:
        value //= prime
        answer += 1
    return answer


@native
def tate_powmod(base: int, exponent: int, modulus: int) -> int:
    answer = 1
    base %= modulus
    while exponent > 0:
        if exponent % 2:
            answer = (answer * base) % modulus
        exponent //= 2
        if exponent:
            base = (base * base) % modulus
    return answer


@native
def tate_legendre(value: int, prime: int) -> int:
    residue = value % prime
    if residue == 0:
        return 0
    symbol = tate_powmod(residue, (prime - 1) // 2, prime)
    if symbol == prime - 1:
        return -1
    return symbol


@native
def tate_cubic_root_count(a_value: int, b_value: int, prime: int) -> int:
    """Count roots of ``x^3 + a*x + b`` over the prime field.

    The production implementation uses polynomial gcd.  This transparent
    scalar loop is preferable for the first compiler experiment because it
    needs no list or polynomial representation intrinsic.  The benchmark
    corpus uses modest primes, so this does not distort its intended role as
    a control-flow and exact-arithmetic workload.
    """
    roots = 0
    x_value = 0
    while x_value < prime:
        value = x_value * x_value * x_value + a_value * x_value + b_value
        if value % prime == 0:
            roots += 1
        x_value += 1
    return roots


@native
def tate_large_prime(
    a1: int,
    a2: int,
    a3: int,
    a4: int,
    a6: int,
    prime: int,
) -> Tuple[int, int, int]:
    """Return ``(f, Kodaira code, c_p)`` for ``p > 3``."""
    b2 = a1 * a1 + 4 * a2
    b4 = a1 * a3 + 2 * a4
    b6 = a3 * a3 + 4 * a6
    b8 = (
        a1 * a1 * a6
        + 4 * a2 * a6
        - a1 * a3 * a4
        + a2 * a3 * a3
        - a4 * a4
    )
    c4 = b2 * b2 - 24 * b4
    c6 = -b2 * b2 * b2 + 36 * b2 * b4 - 216 * b6
    discriminant = (
        -b2 * b2 * b8
        - 8 * b4 * b4 * b4
        - 27 * b6 * b6
        + 9 * b2 * b4 * b6
    )
    discriminant_valuation = tate_valuation(discriminant, prime)
    if discriminant_valuation == 0:
        return 0, 1, 1

    c4_valuation = tate_valuation(c4, prime)
    j_denominator_valuation = discriminant_valuation - 3 * c4_valuation
    if j_denominator_valuation < 0:
        j_denominator_valuation = 0
    if j_denominator_valuation > 0:
        difference = discriminant_valuation - j_denominator_valuation
        if difference == 0:
            split = tate_legendre(-c6, prime) == 1
            if split:
                return 1, 4 + j_denominator_valuation, discriminant_valuation
            if discriminant_valuation % 2:
                return 1, 4 + j_denominator_valuation, 1
            return 1, 4 + j_denominator_valuation, 2
        if difference == 6:
            residue = discriminant // tate_power(
                prime, 6 + j_denominator_valuation)
            if j_denominator_valuation % 2:
                residue *= c6 // tate_power(prime, 3)
            tamagawa = 3 + tate_legendre(residue, prime)
            return 2, -4 - j_denominator_valuation, tamagawa
        return -1, -999, -1

    if discriminant_valuation == 2:
        return 2, 2, 1
    if discriminant_valuation == 3:
        return 2, 3, 2
    if discriminant_valuation == 4:
        tamagawa = 2 + (
            tate_legendre(-6, prime)
            * tate_legendre(c6 // tate_power(prime, 2), prime)
        )
        return 2, 4, tamagawa
    if discriminant_valuation == 6:
        p2 = prime * prime
        cubic_linear = c4 // p2
        cubic_constant = c6 // (p2 * prime)
        roots = tate_cubic_root_count(
            -3 * cubic_linear, -2 * cubic_constant, prime)
        return 2, -1, 1 + roots
    if discriminant_valuation == 8:
        tamagawa = 2 + (
            tate_legendre(-6, prime)
            * tate_legendre(c6 // tate_power(prime, 4), prime)
        )
        return 2, -4, tamagawa
    if discriminant_valuation == 9:
        return 2, -3, 2
    if discriminant_valuation == 10:
        return 2, -2, 1
    return -1, -999, -1


if __name__ == '__main__':
    # 11a1 has multiplicative reduction at 11.
    print(tate_large_prime(0, -1, 1, -10, -20, 11))
