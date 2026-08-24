"""Independent packed exact-integer transitive-helper compiler witness."""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64


def exact_buffer_polynomial_step(value: int, modulus: int) -> int:
    """Apply one bounded exact step with multiply, division, and remainder."""
    square = value * value + 3
    quotient = square // modulus
    return (quotient * quotient + value) % (modulus * modulus + 1)


def exact_buffer_helper_chain(value: int, modulus: int, rounds: uint64) -> int:
    """Drive an exact helper transitively from a bounded fixed-width loop."""
    index: uint64 = 0
    result = value
    while index < rounds:
        result = exact_buffer_polynomial_step(result, modulus)
        index += 1
    return result


@native
def exact_integer_buffer_batch(
    output: IntegerBuffer,
    rows: IntegerBuffer,
    row_count: uint64,
    rounds: uint64,
) -> int:
    """Evaluate packed exact rows through two transitive helper levels."""
    if len(output) < row_count or len(rows) < 2 * row_count:
        return -1
    row: uint64 = 0
    checksum = 0
    while row < row_count:
        value = rows[2 * row]
        modulus = rows[2 * row + 1]
        result = exact_buffer_helper_chain(value, modulus, rounds)
        output[row] = result
        checksum += result
        row += 1
    return checksum


@native
def exact_integer_buffer_inline_batch(
    output: IntegerBuffer,
    rows: IntegerBuffer,
    row_count: uint64,
) -> int:
    """Evaluate the same four exact steps after source-level inlining."""
    if len(output) < row_count or len(rows) < 2 * row_count:
        return -1
    row: uint64 = 0
    checksum = 0
    while row < row_count:
        result = rows[2 * row]
        modulus = rows[2 * row + 1]

        square = result * result + 3
        quotient = square // modulus
        result = (quotient * quotient + result) % (modulus * modulus + 1)

        square = result * result + 3
        quotient = square // modulus
        result = (quotient * quotient + result) % (modulus * modulus + 1)

        square = result * result + 3
        quotient = square // modulus
        result = (quotient * quotient + result) % (modulus * modulus + 1)

        square = result * result + 3
        quotient = square // modulus
        result = (quotient * quotient + result) % (modulus * modulus + 1)

        output[row] = result
        checksum += result
        row += 1
    return checksum
