"""Focused arbitrary-precision buffer kernels for Native Kernel validation."""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64


@native
def integer_buffer_length(source: IntegerBuffer) -> uint64:
    """Return the exact logical length of an arbitrary-precision buffer."""
    return len(source)


@native
def fill_integer_powers(
    output: IntegerBuffer,
    count: uint64,
    seed: int,
) -> int:
    """Fill a mutable exact vector with a rapidly growing recurrence."""
    value = seed
    for index in range(count):
        output[index] = value
        value = value * value + index + 1
    return output[-1]


@native
def sum_integer_buffer(source: IntegerBuffer) -> int:
    """Sum every entry without assuming a machine-word representation."""
    answer = 0
    for index in range(len(source)):
        answer += source[index]
    return answer


@native
def write_integer_value(output: IntegerBuffer, value: int) -> int:
    """Write one exact value, exposing explicit packed-capacity failures."""
    output[0] = value
    return output[0]
