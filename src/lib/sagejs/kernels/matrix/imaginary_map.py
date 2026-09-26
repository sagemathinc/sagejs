"""Exact checks for a packed imaginary-quadratic form/class map.

The ordinary Python body is the dynamic oracle for the source-transparent
native kernel.  Rows are ordered by the reduced form `(a, b, c)` and contain
the form, inverse, integral ideal basis, and invariant-factor coordinates.
The caller owns the buffers and checks their element types before packing.
"""

from __future__ import annotations

from sagejs.native import (
    IntegerBuffer,
    UInt64Buffer,
    is_compiled,
    kernel_integer_buffer,
    kernel_uint64_zeros,
    native,
    uint64,
)


def validate_packed_imaginary_map(
    rows: list[int],
    certificate_forms: list[int],
    invariants: list[int],
    count: int,
    discriminant: int,
    linear: int,
) -> tuple[list[tuple[int, int, int]], dict[str, tuple[int, ...]]] | None:
    """Use the isolated kernel if installed, preserving the Python fallback.

    Type checks precede buffer packing because numeric buffers coerce Boolean
    and string values before the source-transparent validator sees them.
    """
    kernel = verify_packed_imaginary_map
    if not is_compiled(kernel):
        return None
    if (
        any(type(value) is not int for value in rows)
        or any(type(value) is not int for value in certificate_forms)
        or any(type(value) is not int for value in invariants)
    ):
        raise ValueError("the packed imaginary class map has a malformed integer")
    packed_rows = kernel_integer_buffer(kernel, rows)
    packed_certificate = kernel_integer_buffer(kernel, certificate_forms)
    packed_invariants = kernel_integer_buffer(kernel, invariants)
    seen = kernel_uint64_zeros(kernel, count)
    if (
        kernel(
            packed_rows,
            packed_certificate,
            packed_invariants,
            seen,
            discriminant,
            linear,
        )
        != 0
    ):
        raise ValueError("the packed imaginary class map is invalid")
    stride = 11 + len(invariants)
    forms = []
    coordinates = {}
    for index in range(count):
        offset = index * stride
        a, b, c = rows[offset], rows[offset + 1], rows[offset + 2]
        forms.append((a, b, c))
        coordinates[str(a) + "," + str(b) + "," + str(c)] = tuple(
            rows[offset + 11 : offset + stride]
        )
    return forms, coordinates


@native
def verify_packed_imaginary_map(
    rows: IntegerBuffer,
    certificate_forms: IntegerBuffer,
    invariant_factors: IntegerBuffer,
    seen_coordinates: UInt64Buffer,
    discriminant: int,
    linear: int,
) -> int:
    """Return zero exactly when all packed entries describe a bijective map.

    This verifies reduced primitive forms, sorted uniqueness, certificate
    agreement, inverse forms, integral ideal representatives, and coordinate
    bijectivity.  The ambient result schema and generator records are checked
    separately by the public Python wrapper.
    """
    zero = 0
    one = 1
    u_zero: uint64 = 0
    u_one: uint64 = 1
    if discriminant >= zero or discriminant < -200_000_000_000:
        return one
    if discriminant % 4 != 0 and discriminant % 4 != 1:
        return one
    if (discriminant % 4 == 1 and linear != -1) or (
        discriminant % 4 == 0 and linear != 0
    ):
        return one
    rank = len(invariant_factors)
    count = len(seen_coordinates)
    stride = 11 + rank
    if (
        count == zero
        or len(certificate_forms) != 3 * count
        or len(rows) != stride * count
    ):
        return one
    product = one
    position = zero
    while position < rank:
        factor = invariant_factors[position]
        if factor <= one or product > count // factor:
            return one
        product = product * factor
        position = position + one
    if product != count:
        return one
    position = zero
    while position < count:
        seen_coordinates[position] = u_zero
        position = position + one
    previous_a = zero
    previous_b = zero
    index = zero
    while index < count:
        offset = index * stride
        a = rows[offset]
        b = rows[offset + one]
        c = rows[offset + 2]
        absolute_b = b
        if absolute_b < zero:
            absolute_b = -absolute_b
        if a <= zero or a > 258_200 or absolute_b > a or a > c or c > 200_000_000_000:
            return one
        if (absolute_b == a or a == c) and b < zero:
            return one
        if b * b - 4 * a * c != discriminant:
            return one
        left = a
        right = absolute_b
        while right != zero:
            remainder = left % right
            left = right
            right = remainder
        right = c
        while right != zero:
            remainder = left % right
            left = right
            right = remainder
        if left != one:
            return one
        if index > zero and (a < previous_a or (a == previous_a and b <= previous_b)):
            return one
        previous_a = a
        previous_b = b
        certificate_offset = 3 * index
        if (
            certificate_forms[certificate_offset] != a
            or certificate_forms[certificate_offset + one] != b
            or certificate_forms[certificate_offset + 2] != c
        ):
            return one
        inverse_b = -b
        if b == zero or absolute_b == a or a == c:
            inverse_b = b
        if (
            rows[offset + 3] != a
            or rows[offset + 4] != inverse_b
            or rows[offset + 5] != c
        ):
            return one
        if (
            rows[offset + 6] != a
            or rows[offset + 7] != a
            or rows[offset + 8] != zero
            or rows[offset + 9] != (linear - b) // 2
            or rows[offset + 10] != one
            or (linear - b) % 2 != zero
        ):
            return one
        ordinal = zero
        multiplier = one
        position = zero
        while position < rank:
            value = rows[offset + 11 + position]
            factor = invariant_factors[position]
            if value < zero or value >= factor:
                return one
            ordinal = ordinal + multiplier * value
            multiplier = multiplier * factor
            position = position + one
        if ordinal >= count or seen_coordinates[ordinal] != u_zero:
            return one
        seen_coordinates[ordinal] = u_one
        if index == zero:
            if a != one or b != -linear or c != (linear * linear - discriminant) // 4:
                return one
            if ordinal != zero:
                return one
        index = index + one
    return zero
