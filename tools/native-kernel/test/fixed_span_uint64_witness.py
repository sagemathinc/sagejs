"""Independent contextual-`uint64` source-transparent compiler witness."""

from __future__ import annotations

from sagejs.native import PrimeFieldModulus, UInt64Buffer, native, uint64


def trim_span(
    values: UInt64Buffer,
    offset: uint64,
    length: uint64,
) -> uint64:
    """Return the logical length after deleting trailing zero words."""
    while length > 0 and values[offset + length - 1] == 0:
        length -= 1
    return length


def publish_degree(
    output: UInt64Buffer,
    offset: uint64,
    length: uint64,
) -> uint64:
    """Publish a nonempty span's degree and return one output word."""
    output[offset] = length - 1
    return 1


def translate_index(length: uint64, shift: uint64 = 1) -> uint64:
    """Exercise literals on both sides and a contextual `uint64` default."""
    translated: uint64 = 1 + length
    translated = translated - shift
    return translated


@native
def fixed_span_uint64_witness(
    output: UInt64Buffer,
    modulus: PrimeFieldModulus,
) -> bool:
    """Trim one span and publish its degree through transitive helpers."""
    # The modulus places the public entry point in the prime-source compiler;
    # the helpers intentionally contain no modular operation and exercise the
    # general exact/uint64 compiler instead.
    capacity = len(output)
    capacity //= 1
    length = trim_span(output, 0, capacity)
    if length == 0:
        return False
    offset = translate_index(1, 1)
    return publish_degree(output, offset - 1, length) != 0
