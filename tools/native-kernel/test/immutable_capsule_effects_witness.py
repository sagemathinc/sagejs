"""Neutral prime-source witness for absent effect metadata."""

from __future__ import annotations

from sagejs.native import PrimeFieldModulus, UInt64Buffer, native, uint64


@native
def accumulate_prime_words(
    output: UInt64Buffer,
    source: UInt64Buffer,
    count: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Accumulate one bounded source row into caller-owned output."""
    if len(output) == 0 or count > len(source):
        return False
    total: uint64 = 0
    index: uint64 = 0
    while index < count:
        total = (total + source[index]) % modulus
        index += 1
    output[0] = total
    return True
