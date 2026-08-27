"""Neutral witness for bool-returning prime-source helper calls."""

from __future__ import annotations

from sagejs.native import PrimeFieldModulus, UInt64Buffer, native, uint64


def normalize_and_test(
    values: UInt64Buffer,
    index: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Mutate one caller-owned word and report whether it is nonzero."""
    values[index] = values[index] % modulus
    return values[index] != 0


@native
def normalize_nonzero_batch(
    output: UInt64Buffer,
    values: UInt64Buffer,
    count: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Normalize a bounded row and publish only when every word is nonzero."""
    if len(output) != count or len(values) != count:
        return False
    index: uint64 = 0
    while index < count:
        if not normalize_and_test(values, index, modulus):
            return False
        output[index] = values[index]
        index += 1
    return True
