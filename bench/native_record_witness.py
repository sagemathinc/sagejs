"""Small compiler-owned-record witness used by native compiler tests."""

from __future__ import annotations

from sagejs.native import (
    NativeRecord,
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    prime_mul,
    uint64,
)


class PrimeVector(NativeRecord):
    entries: UInt64Buffer
    length: uint64
    modulus: PrimeFieldModulus


@native
def scaled_sum(vector: PrimeVector, scalar: uint64) -> uint64:
    total = 0
    for index in range(vector.length):
        total += prime_mul(vector.entries[index], scalar, vector.modulus)
    return total


@native
def scale_first(vector: PrimeVector, scalar: uint64) -> uint64:
    """Mutate a borrowed buffer field to exercise staged host copy-back."""
    if vector.length == 0:
        return 0
    vector.entries[0] = prime_mul(
        vector.entries[0], scalar, vector.modulus)
    return vector.entries[0]


@native
def scaled_sum_constructed(
    entries: UInt64Buffer,
    length: uint64,
    modulus: PrimeFieldModulus,
    scalar: uint64,
) -> uint64:
    vector = PrimeVector(entries, length, modulus)
    return scaled_sum(vector, scalar)
