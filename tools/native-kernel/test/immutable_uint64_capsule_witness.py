"""Neutral source-transparent witness for immutable uint64 kernel leases."""

from __future__ import annotations

from sagejs.native import UInt64Buffer, native, uint64


@native
def immutable_uint64_checksum(
    output: UInt64Buffer,
    source: UInt64Buffer,
    count: uint64,
) -> bool:
    """Accumulate a bounded read-only input span into `output[0]`."""
    if len(output) == 0 or count > len(source):
        return False
    total: uint64 = 0
    index: uint64 = 0
    while index < count:
        total += source[index]
        index += 1
    output[0] = total
    return True


@native
def immutable_uint64_mutation_probe(
    source: UInt64Buffer,
    value: uint64,
) -> bool:
    """Exercise rejection when an immutable lease reaches a writable slot."""
    if len(source) == 0:
        return False
    source[0] = value
    return True
