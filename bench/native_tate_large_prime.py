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
def tate_jacobi(value: int, modulus: int) -> int:
    """Return the Jacobi symbol using the binary reciprocity algorithm."""
    if modulus <= 0 or modulus % 2 == 0:
        return 0
    value %= modulus
    answer = 1
    while value:
        while value % 2 == 0:
            value //= 2
            residue = modulus % 8
            if residue == 3 or residue == 5:
                answer = -answer
        if value % 4 == 3 and modulus % 4 == 3:
            answer = -answer
        previous = value
        value = modulus % value
        modulus = previous
    if modulus == 1:
        return answer
    return 0


@native
def tate_legendre(value: int, prime: int) -> int:
    return tate_jacobi(value, prime)


@native
def tate_inverse_mod(value: int, prime: int) -> int:
    """Invert a nonzero residue modulo ``prime`` by extended Euclid."""
    old_remainder = prime
    remainder = value % prime
    old_coefficient = 0
    coefficient = 1
    while remainder:
        quotient = old_remainder // remainder
        next_remainder = old_remainder - quotient * remainder
        old_remainder = remainder
        remainder = next_remainder
        next_coefficient = old_coefficient - quotient * coefficient
        old_coefficient = coefficient
        coefficient = next_coefficient
    return old_coefficient % prime


@native
def tate_cubic_multiply_mod(
    left0: int,
    left1: int,
    left2: int,
    right0: int,
    right1: int,
    right2: int,
    cubic_a: int,
    cubic_b: int,
    prime: int,
) -> Tuple[int, int, int]:
    """Multiply modulo ``x^3 + cubic_a*x + cubic_b`` over ``GF(prime)``."""
    product0 = left0 * right0
    product1 = left0 * right1 + left1 * right0
    product2 = left0 * right2 + left1 * right1 + left2 * right0
    product3 = left1 * right2 + left2 * right1
    product4 = left2 * right2
    result0 = (product0 - cubic_b * product3) % prime
    result1 = (product1 - cubic_a * product3 - cubic_b * product4) % prime
    result2 = (product2 - cubic_a * product4) % prime
    return result0, result1, result2


@native
def tate_x_power_mod_cubic(
    exponent: int,
    cubic_a: int,
    cubic_b: int,
    prime: int,
) -> Tuple[int, int, int]:
    """Return the coefficients of ``x^exponent`` modulo a depressed cubic."""
    result0 = 1
    result1 = 0
    result2 = 0
    base0 = 0
    base1 = 1
    base2 = 0
    while exponent > 0:
        if exponent % 2:
            result0, result1, result2 = tate_cubic_multiply_mod(
                result0,
                result1,
                result2,
                base0,
                base1,
                base2,
                cubic_a,
                cubic_b,
                prime,
            )
        exponent //= 2
        if exponent:
            base0, base1, base2 = tate_cubic_multiply_mod(
                base0,
                base1,
                base2,
                base0,
                base1,
                base2,
                cubic_a,
                cubic_b,
                prime,
            )
    return result0, result1, result2


@native
def tate_cubic_root_count(a_value: int, b_value: int, prime: int) -> int:
    """Count roots of ``x^3 + a*x + b`` over the prime field.

    Compute the degree of ``gcd(x^3+a*x+b, x^p-x)``.  Since the first
    polynomial is cubic, modular polynomial arithmetic and the final Euclidean
    step fit in a handful of scalar locals; no container or polynomial
    intrinsic is hidden from the compiler.
    """
    a_value %= prime
    b_value %= prime
    power0, power1, power2 = tate_x_power_mod_cubic(prime, a_value, b_value, prime)
    remainder0 = power0
    remainder1 = (power1 - 1) % prime
    remainder2 = power2

    if remainder2 == 0:
        if remainder1 == 0:
            if remainder0 == 0:
                return 3
            return 0
        inverse = tate_inverse_mod(remainder1, prime)
        root = (-remainder0 * inverse) % prime
        value = (root * root * root + a_value * root + b_value) % prime
        if value == 0:
            return 1
        return 0

    inverse = tate_inverse_mod(remainder2, prime)
    linear = (a_value - inverse * remainder0) % prime
    quadratic = (-inverse * remainder1) % prime
    quotient = (quadratic * inverse) % prime
    constant_remainder = (b_value - quotient * remainder0) % prime
    linear_remainder = (linear - quotient * remainder1) % prime
    if linear_remainder == 0:
        if constant_remainder == 0:
            return 2
        return 0
    inverse = tate_inverse_mod(linear_remainder, prime)
    root = (-constant_remainder * inverse) % prime
    value = (remainder2 * root * root + remainder1 * root + remainder0) % prime
    if value == 0:
        return 1
    return 0


@native
def tate_large_prime_invariants(
    c4: int,
    c6: int,
    discriminant: int,
    prime: int,
) -> Tuple[int, int, int]:
    """Classify a minimal curve from precomputed integral invariants."""
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
            residue = discriminant // tate_power(prime, 6 + j_denominator_valuation)
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
            tate_legendre(-6, prime) * tate_legendre(c6 // tate_power(prime, 2), prime)
        )
        return 2, 4, tamagawa
    if discriminant_valuation == 6:
        p2 = prime * prime
        cubic_linear = c4 // p2
        cubic_constant = c6 // (p2 * prime)
        roots = tate_cubic_root_count(-3 * cubic_linear, -2 * cubic_constant, prime)
        return 2, -1, 1 + roots
    if discriminant_valuation == 8:
        tamagawa = 2 + (
            tate_legendre(-6, prime) * tate_legendre(c6 // tate_power(prime, 4), prime)
        )
        return 2, -4, tamagawa
    if discriminant_valuation == 9:
        return 2, -3, 2
    if discriminant_valuation == 10:
        return 2, -2, 1
    return -1, -999, -1


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
    b8 = a1 * a1 * a6 + 4 * a2 * a6 - a1 * a3 * a4 + a2 * a3 * a3 - a4 * a4
    c4 = b2 * b2 - 24 * b4
    c6 = -b2 * b2 * b2 + 36 * b2 * b4 - 216 * b6
    discriminant = -b2 * b2 * b8 - 8 * b4 * b4 * b4 - 27 * b6 * b6 + 9 * b2 * b4 * b6
    conductor, kodaira, tamagawa = tate_large_prime_invariants(
        c4, c6, discriminant, prime
    )
    return conductor, kodaira, tamagawa


@native
def tate_boundary_probe(
    a1: int,
    a2: int,
    a3: int,
    a4: int,
    a6: int,
    prime: int,
) -> Tuple[int, int, int]:
    """Measure six exact inputs and one small tuple result at the native ABI."""
    if prime < 0:
        return a1 + a2, a3 + a4, a6
    return 0, 1, 1


@native
def tate_invariant_boundary_probe(
    c4: int,
    c6: int,
    discriminant: int,
    prime: int,
) -> Tuple[int, int, int]:
    """Measure four exact inputs and one small tuple result at the native ABI."""
    if prime < 0:
        return c4, c6, discriminant
    return 0, 1, 1


if __name__ == "__main__":
    # 11a1 has multiplicative reduction at 11.
    print(tate_large_prime(0, -1, 1, -10, -20, 11))
