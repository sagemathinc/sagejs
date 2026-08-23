"""Neutral prime-source witness for transitive buffer effects."""

from __future__ import annotations

from sagejs.native import PrimeFieldModulus, UInt64Buffer, native, uint64


def read_prime_word(
    source: UInt64Buffer,
    index: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Read one word without mutating its caller-owned buffer."""
    return source[index] % modulus


def accumulate_prime_row(
    source: UInt64Buffer,
    count: uint64,
    modulus: PrimeFieldModulus,
) -> uint64:
    """Exercise a second transitive, read-only helper layer."""
    total: uint64 = 0
    index: uint64 = 0
    while index < count:
        total = (total + read_prime_word(source, index, modulus)) % modulus
        index += 1
    return total


def publish_prime_word(
    output: UInt64Buffer,
    scratch: UInt64Buffer,
    value: uint64,
) -> bool:
    """Mutate two buffers through a helper call."""
    scratch[0] = value
    output[0] = scratch[0]
    return True


@native
def accumulate_prime_words(
    output: UInt64Buffer,
    source: UInt64Buffer,
    scratch: UInt64Buffer,
    count: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Accumulate one bounded source row into caller-owned output."""
    if len(output) == 0 or len(scratch) == 0 or count > len(source):
        return False
    total: uint64 = accumulate_prime_row(source, count, modulus)
    return publish_prime_word(output, scratch, total)
