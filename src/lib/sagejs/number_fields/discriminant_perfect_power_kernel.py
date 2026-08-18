"""Source-transparent maximal perfect-power extraction for exact integers.

The packed kernel receives the complete prime-exponent vector for the input
bit length and repeatedly extracts exact prime roots.  The ordinary adapter
checks the power identity and, when a power was found, verifies that the
returned base is itself primitive before accepting maximal-exponent semantics.
"""

from __future__ import annotations

from typing import Any, Callable

from sagejs.native import (
    IntegerBuffer,
    UInt64Buffer,
    integer_buffer_values,
    is_compiled,
    kernel_integer_zeros,
    kernel_uint64_buffer,
    native,
    uint64,
)


def _packed_integer_power(base: int, exponent: uint64) -> int:
    answer = 1
    current = base
    power: uint64 = exponent
    one: uint64 = 1
    two: uint64 = 2
    while power > 0:
        if power % two == one:
            answer = answer * current
        power = power // two
        if power > 0:
            current = current * current
    return answer


def _packed_integer_nth_root(
    value: int,
    exponent: uint64,
    value_bits: uint64,
) -> int:
    """Return `floor(value^(1/exponent))` for positive exact inputs."""
    one: uint64 = 1
    root_bits: uint64 = one + (value_bits - one) // exponent
    current = 1
    bit_index: uint64 = 0
    while bit_index < root_bits:
        current = current * 2
        bit_index = bit_index + one

    previous_exponent: uint64 = exponent - one
    while True:
        divisor = _packed_integer_power(current, previous_exponent)
        following = (previous_exponent * current + value // divisor) // exponent
        if following >= current:
            break
        current = following

    following = current + 1
    while _packed_integer_power(following, exponent) <= value:
        current = following
        following = current + 1
    while _packed_integer_power(current, exponent) > value:
        current = current - 1
    return current


@native
def packed_perfect_power_data_in_place(
    output: IntegerBuffer,
    prime_exponents: UInt64Buffer,
    number: int,
    number_bits: uint64,
    prime_count: uint64,
) -> bool:
    """Write `[primitive_base, maximal_exponent]` in one exact traversal."""
    if len(output) > 0:
        output[0] = 0
    if len(output) > 1:
        output[1] = 0
    valid = (
        len(output) == 2
        and number != -1
        and number != 0
        and number != 1
        and number_bits >= 2
        and prime_count == len(prime_exponents)
        and prime_count > 0
    )
    if not valid:
        return False

    negative = number < 0
    base = number
    if negative:
        base = -base
    base_bits: uint64 = number_bits
    total_exponent = 1
    index: uint64 = 0
    one: uint64 = 1
    previous_prime: uint64 = 1
    while index < prime_count:
        exponent: uint64 = prime_exponents[index]
        if exponent <= previous_prime:
            return False
        previous_prime = exponent
        if exponent >= base_bits:
            break
        if not (negative and exponent == 2):
            extracting = True
            while extracting and base > 1:
                root = _packed_integer_nth_root(base, exponent, base_bits)
                if _packed_integer_power(root, exponent) != base:
                    extracting = False
                else:
                    base = root
                    base_bits = one + (base_bits - one) // exponent
                    total_exponent = total_exponent * exponent
        index = index + one

    if negative:
        base = -base
    output[0] = base
    output[1] = total_exponent
    return True


ReadablePerfectPower = Callable[[int], tuple[int, int]]


def _small_primes(bound: int) -> list[int]:
    if bound < 2:
        return []
    composite = [False for _index in range(bound + 1)]
    answer = []
    for candidate in range(2, bound + 1):
        if composite[candidate]:
            continue
        answer.append(candidate)
        if candidate * candidate <= bound:
            multiple = candidate * candidate
            while multiple <= bound:
                composite[multiple] = True
                multiple += candidate
    return answer


def validated_perfect_power_data(
    number: int,
    readable_perfect_power: ReadablePerfectPower,
    *,
    kernel: Any = packed_perfect_power_data_in_place,
) -> tuple[int, int] | None:
    """Return validated maximal data, or `None` for readable fallback."""
    value = int(number)
    if value in (-1, 0, 1):
        return value, 1
    bits = abs(value).bit_length()
    primes = _small_primes(bits)
    word_capacity = max(4, (bits + 63) // 64 + 2)
    try:
        output = kernel_integer_zeros(kernel, 2, word_capacity)
        packed_primes = kernel_uint64_buffer(kernel, primes)
        valid = kernel(output, packed_primes, value, bits, len(primes))
    except (ArithmeticError, OverflowError, TypeError, ValueError):
        return None
    if not valid:
        return None
    values = integer_buffer_values(output)
    base = int(values[0])
    exponent = int(values[1])
    if exponent < 1:
        return None
    if value < 0:
        if base >= 0 or exponent % 2 == 0:
            return None
    elif base <= 0:
        return None
    if base**exponent != value:
        return None
    if exponent > 1:
        try:
            _primitive_base, nested_exponent = readable_perfect_power(base)
        except (ArithmeticError, OverflowError, TypeError, ValueError):
            return None
        if int(nested_exponent) != 1:
            return None
    return base, exponent


def compiled_perfect_power_data(
    number: int,
    readable_perfect_power: ReadablePerfectPower,
) -> tuple[int, int] | None:
    """Use the compiled extractor, else request the ordinary fallback."""
    if not is_compiled(packed_perfect_power_data_in_place):
        return None
    return validated_perfect_power_data(number, readable_perfect_power)


__all__ = [
    "compiled_perfect_power_data",
    "packed_perfect_power_data_in_place",
    "validated_perfect_power_data",
]
