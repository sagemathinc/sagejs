"""Packed exact reduction of rational Mumford rows at many primes.

The public rational divisors and every good reduction prime are validated by
`torsion.py`.  This module contains only the source-transparent arithmetic
loop which maps canonical numerator/denominator pairs to fixed eight-word
prime-field Mumford rows.  Its ordinary Python body is the dynamic oracle for
the isolated native kernel.
"""

from __future__ import annotations

from sagejs.native import (
    IntegerBuffer,
    UInt64Buffer,
    native,
    uint64,
)

PACKED_MUMFORD_ROW_WORDS = 8
PACKED_RATIONAL_COEFFICIENTS = 7


@native
def _inverse_mod_word(value: int, modulus: int) -> int:
    """Return `value^-1 mod modulus` for a checked word-size prime."""
    result: int = 1
    base = value
    exponent = modulus - 2
    while exponent:
        if exponent % 2:
            result = (result * base) % modulus
        base = (base * base) % modulus
        exponent //= 2
    return result


@native
def reduce_rational_mumford_many_primes(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    degrees: UInt64Buffer,
    numerators: IntegerBuffer,
    denominators: IntegerBuffer,
    primes: UInt64Buffer,
    divisor_count: uint64,
    prime_count: uint64,
) -> bool:
    """Reduce all packed rational rows at all primes in one traversal.

    Output rows use `(degree,u0,u1,u2,u3,v0,v1,v2)`, ordered first by
    prime and then by divisor.  A zero status means that a source denominator
    is divisible by that prime.  Host-side validation checks dimensions,
    primality, model smoothness, and the exact reference replay boundary.
    """
    if len(degrees) != divisor_count:
        return False
    if len(numerators) != divisor_count * 7:
        return False
    if len(denominators) != divisor_count * 7:
        return False
    if len(primes) != prime_count:
        return False
    pair_count = divisor_count * prime_count
    if len(statuses) != pair_count:
        return False
    if len(output) != pair_count * 8:
        return False

    prime_index: uint64 = 0
    while prime_index < prime_count:
        modulus: uint64 = primes[prime_index]
        if modulus < 3 or modulus % 2 == 0:
            return False
        divisor_index: uint64 = 0
        while divisor_index < divisor_count:
            pair_index = prime_index * divisor_count + divisor_index
            row_offset = pair_index * 8
            source_offset = divisor_index * 7
            degree = degrees[divisor_index]
            if degree > 3:
                return False
            output[row_offset] = degree
            coefficient_index: uint64 = 0
            integral = True
            while coefficient_index < 7:
                denominator = denominators[source_offset + coefficient_index]
                denominator_residue = denominator % modulus
                if denominator_residue == 0:
                    integral = False
                    output[row_offset + coefficient_index + 1] = 0
                else:
                    numerator = numerators[source_offset + coefficient_index]
                    numerator_residue = numerator % modulus
                    inverse = _inverse_mod_word(denominator_residue, modulus)
                    output[row_offset + coefficient_index + 1] = (
                        numerator_residue * inverse
                    ) % modulus
                coefficient_index += 1
            if integral:
                statuses[pair_index] = 1
            else:
                statuses[pair_index] = 0
            divisor_index += 1
        prime_index += 1
    return True


__all__ = [
    "PACKED_MUMFORD_ROW_WORDS",
    "PACKED_RATIONAL_COEFFICIENTS",
    "reduce_rational_mumford_many_primes",
]
