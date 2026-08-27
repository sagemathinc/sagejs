"""Fused affine recurrences over a quadratic finite-field representation.

This source-transparent kernel consumes canonical coefficients in the power
basis for `GF(p^2)`, where the monic defining polynomial is
`x^2 + modulus_c1*x + modulus_c0`.  It executes the complete recurrence inside
one isolated target call and materializes only the two output coefficients.

All inputs are bounded to the reviewed unsigned 32-bit domain.  Intermediate
products are reduced before addition, so every native and Wasm target executes
the same exact unsigned 64-bit arithmetic without overflow.
"""

from __future__ import annotations

from sagejs.native import UInt64Buffer, native, uint64


@native
def packed_gf_p2_affine_recurrence(
    output: UInt64Buffer,
    accumulator_c0: uint64,
    accumulator_c1: uint64,
    multiplier_c0: uint64,
    multiplier_c1: uint64,
    increment_c0: uint64,
    increment_c1: uint64,
    count: uint64,
    prime: uint64,
    modulus_c0: uint64,
    modulus_c1: uint64,
) -> uint64:
    """Write the exact fused recurrence result and return a status code.

    Status 0 is success and 1 is an invalid ABI or input.  The reviewed bound
    `prime <= 2^32 - 1` makes each coefficient product strictly smaller than
    `2^64`; additions are reduced one term at a time to avoid overflow.
    """
    zero: uint64 = 0
    one: uint64 = 1
    maximum_prime: uint64 = 4294967295
    maximum_count: uint64 = 4294967295
    if len(output) != 2:
        return one
    if prime < 2 or prime > maximum_prime or count > maximum_count:
        return one
    if (
        accumulator_c0 >= prime
        or accumulator_c1 >= prime
        or multiplier_c0 >= prime
        or multiplier_c1 >= prime
        or increment_c0 >= prime
        or increment_c1 >= prime
        or modulus_c0 >= prime
        or modulus_c1 >= prime
    ):
        return one

    value_c0: uint64 = accumulator_c0
    value_c1: uint64 = accumulator_c1
    index: uint64 = zero
    while index < count:
        quadratic = (value_c1 * multiplier_c1) % prime

        next_c0 = (value_c0 * multiplier_c0) % prime
        correction_c0 = (quadratic * modulus_c0) % prime
        if next_c0 >= correction_c0:
            next_c0 = next_c0 - correction_c0
        else:
            next_c0 = next_c0 + prime - correction_c0
        next_c0 = next_c0 + increment_c0
        if next_c0 >= prime:
            next_c0 = next_c0 - prime

        next_c1 = (value_c0 * multiplier_c1) % prime
        cross = (value_c1 * multiplier_c0) % prime
        next_c1 = next_c1 + cross
        if next_c1 >= prime:
            next_c1 = next_c1 - prime
        correction_c1 = (quadratic * modulus_c1) % prime
        if next_c1 >= correction_c1:
            next_c1 = next_c1 - correction_c1
        else:
            next_c1 = next_c1 + prime - correction_c1
        next_c1 = next_c1 + increment_c1
        if next_c1 >= prime:
            next_c1 = next_c1 - prime

        value_c0 = next_c0
        value_c1 = next_c1
        index = index + one

    output[0] = value_c0
    output[1] = value_c1
    return zero


__all__ = ["packed_gf_p2_affine_recurrence"]
