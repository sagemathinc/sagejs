"""Packed split-aware polynomial prefactorization over composite integers.

The readable oracle in `discriminant_components` performs Euclidean polynomial
gcd over `ZZ/qZZ` and stops whenever a leading coefficient exposes a proper
factor of `q`.  This module retains that algorithm as ordinary CPython source
while allowing the same dense exact-integer loops to cross the source-
transparent native boundary.

Only the outcome needed by discriminant prefactorization is returned: a proper
factor, a completed no-split gcd, or an unresolved nonunit.  No composite
modulus is ever treated as a field, and no opaque gcd polynomial becomes
certificate evidence.
"""

from __future__ import annotations

from sagejs.native import IntegerBuffer, native, uint64

PREFACTOR_INVALID = 0
PREFACTOR_NO_SPLIT = 1
PREFACTOR_SPLIT = 2
PREFACTOR_UNRESOLVED = 3


def _packed_gcd(left: int, right: int) -> int:
    first = left
    if first < 0:
        first = -first
    second = right
    if second < 0:
        second = -second
    while second != 0:
        remainder = first % second
        first = second
        second = remainder
    return first


def _packed_inverse_or_zero(value: int, modulus: int) -> int:
    old_remainder = modulus
    remainder = value % modulus
    old_coefficient = 0
    coefficient = 1
    while remainder != 0:
        quotient = old_remainder // remainder
        next_remainder = old_remainder - quotient * remainder
        next_coefficient = old_coefficient - quotient * coefficient
        old_remainder = remainder
        remainder = next_remainder
        old_coefficient = coefficient
        coefficient = next_coefficient
    if old_remainder != 1:
        return 0
    return old_coefficient % modulus


def _packed_length(values: IntegerBuffer, offset: int, capacity: int) -> int:
    length = capacity
    while length > 0 and values[offset + length - 1] == 0:
        length -= 1
    return length


@native
def packed_composite_polynomial_split_hint_in_place(
    control: IntegerBuffer,
    workspace: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    modulus: int,
    left_length: uint64,
    right_length: uint64,
    capacity: uint64,
) -> bool:
    """Find the first exact modulus split in one Euclidean traversal.

    `control[0]` receives a `PREFACTOR_*` status and `control[1]` receives the
    proper divisor only for `PREFACTOR_SPLIT`.  False means malformed storage;
    bounded-buffer overflow is reported by the generated adapter and handled
    by the ordinary caller fallback.
    """
    valid = (
        modulus > 1
        and capacity > 0
        and left_length > 0
        and right_length > 0
        and left_length <= capacity
        and right_length <= capacity
        and len(control) == 2
        and len(workspace) == 3 * capacity
        and len(left) == left_length
        and len(right) == right_length
    )
    if len(control) > 0:
        control[0] = 0  # PREFACTOR_INVALID
    if len(control) > 1:
        control[1] = 0
    index = 0
    while index < len(workspace):
        workspace[index] = 0
        index += 1
    if not valid:
        return False

    first_offset = 0
    second_offset = capacity
    remainder_offset = 2 * capacity
    index = 0
    while index < capacity:
        if index < left_length:
            workspace[first_offset + index] = left[index] % modulus
        if index < right_length:
            workspace[second_offset + index] = right[index] % modulus
        index += 1
    first_length = _packed_length(workspace, first_offset, capacity)
    second_length = _packed_length(workspace, second_offset, capacity)

    while second_length > 0:
        divisor = _packed_gcd(workspace[second_offset + second_length - 1], modulus)
        if divisor != 1:
            if divisor > 1 and divisor < modulus:
                control[0] = 2  # PREFACTOR_SPLIT
                control[1] = divisor
                return True
            if divisor == modulus:
                content = 0
                index = 0
                while index < second_length:
                    content = _packed_gcd(content, workspace[second_offset + index])
                    index += 1
                divisor = _packed_gcd(content, modulus)
                if divisor > 1 and divisor < modulus:
                    control[0] = 2  # PREFACTOR_SPLIT
                    control[1] = divisor
                    return True
            control[0] = 3  # PREFACTOR_UNRESOLVED
            return True
        inverse = _packed_inverse_or_zero(
            workspace[second_offset + second_length - 1], modulus
        )
        if inverse == 0:
            control[0] = 3  # PREFACTOR_UNRESOLVED
            return True

        index = 0
        while index < capacity:
            workspace[remainder_offset + index] = 0
            if index < first_length:
                workspace[remainder_offset + index] = workspace[first_offset + index]
            index += 1
        remainder_length = _packed_length(workspace, remainder_offset, capacity)
        while remainder_length >= second_length and remainder_length > 0:
            shift = remainder_length - second_length
            scalar = (
                workspace[remainder_offset + remainder_length - 1] * inverse
            ) % modulus
            index = 0
            while index < second_length:
                location = remainder_offset + shift + index
                workspace[location] = (
                    workspace[location] - scalar * workspace[second_offset + index]
                ) % modulus
                index += 1
            remainder_length = _packed_length(
                workspace, remainder_offset, remainder_length
            )

        index = 0
        while index < capacity:
            workspace[first_offset + index] = workspace[second_offset + index]
            workspace[second_offset + index] = workspace[remainder_offset + index]
            index += 1
        first_length = second_length
        second_length = remainder_length

    if first_length == 0:
        control[0] = 3  # PREFACTOR_UNRESOLVED
        return True
    divisor = _packed_gcd(workspace[first_offset + first_length - 1], modulus)
    if divisor != 1:
        if divisor > 1 and divisor < modulus:
            control[0] = 2  # PREFACTOR_SPLIT
            control[1] = divisor
            return True
        if divisor == modulus:
            content = 0
            index = 0
            while index < first_length:
                content = _packed_gcd(content, workspace[first_offset + index])
                index += 1
            divisor = _packed_gcd(content, modulus)
            if divisor > 1 and divisor < modulus:
                control[0] = 2  # PREFACTOR_SPLIT
                control[1] = divisor
                return True
        control[0] = 3  # PREFACTOR_UNRESOLVED
        return True
    control[0] = 1  # PREFACTOR_NO_SPLIT
    return True


__all__ = [
    "PREFACTOR_INVALID",
    "PREFACTOR_NO_SPLIT",
    "PREFACTOR_SPLIT",
    "PREFACTOR_UNRESOLVED",
    "packed_composite_polynomial_split_hint_in_place",
]
