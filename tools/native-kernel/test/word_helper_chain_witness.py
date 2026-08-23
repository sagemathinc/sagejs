"""Independent fixed-width transitive helper compiler witness."""

from __future__ import annotations

from sagejs.native import PrimeFieldModulus, UInt64Buffer, native, uint64


def clear_fixed_span(storage: UInt64Buffer, offset: uint64) -> uint64:
    """Clear a fixed-width span without exact-integer intermediates."""
    index: uint64 = 0
    while index < 16:
        storage[offset + index] = 0
        index += 1
    return index - index


def copy_fixed_span(
    storage: UInt64Buffer,
    target: uint64,
    source: uint64,
    length: uint64,
) -> uint64:
    """Chain through a mutating helper, then copy a bounded logical span."""
    cleared = clear_fixed_span(storage, target)
    index: uint64 = 0
    while index < length:
        storage[target + index] = storage[source + index]
        index += 1
    return length + cleared


@native
def transitive_word_helper_witness(
    storage: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    """Exercise fixed-width helpers from a prime-field public kernel."""
    target: uint64 = 0
    source: uint64 = 16
    span: uint64 = 4
    length = copy_fixed_span(storage, target, source, span)
    return length == 4
