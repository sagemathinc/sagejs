"""Exact checks for a packed imaginary-quadratic form/class map.

The ordinary Python body is the dynamic oracle for the source-transparent
native kernel. Rows are ordered by the reduced form `(a, b, c)`. Full rows
carry the form, inverse, integral ideal basis, and coordinates; compact core
rows carry `(a, b)` and coordinates, with the other values derived exactly.
The caller owns the buffers and checks their element types before packing.
"""

from __future__ import annotations

from typing import Any, Iterator

from sagejs.native import (
    Int64Buffer,
    UInt64Buffer,
    is_compiled,
    kernel_int64_buffer,
    kernel_uint64_zeros,
    native,
    uint64,
)


def _pack_exact_int64(kernel: Any, values: list[int]) -> Any:
    """Reject coercions while packing; keep the ordinary Python fallback."""
    factory = getattr(kernel, "packExactInt64Buffer", None)
    if callable(factory):
        return factory(values)
    if any(
        type(value) is not int or value < -(1 << 63) or value >= (1 << 63)
        for value in values
    ):
        raise ValueError("the packed imaginary class map has a malformed integer")
    return kernel_int64_buffer(kernel, values)


class PackedImaginaryForms:
    """Read-only reduced-form sequence backed by already verified rows."""

    def __init__(
        self, rows: list[int], stride: int, count: int, discriminant: int | None = None
    ) -> None:
        self._rows = rows
        self._stride = stride
        self._count = count
        self._discriminant = discriminant

    def __len__(self) -> int:
        return self._count

    def __iter__(self) -> Iterator[tuple[int, int, int]]:
        for index in range(self._count):
            offset = index * self._stride
            a, b = self._rows[offset], self._rows[offset + 1]
            yield (
                a,
                b,
                self._rows[offset + 2]
                if self._discriminant is None
                else (b * b - self._discriminant) // (4 * a),
            )


class PackedImaginaryCoordinates:
    """Exact read-only coordinate lookup over verified sorted form rows."""

    def __init__(
        self, rows: list[int], stride: int, count: int, discriminant: int | None = None
    ) -> None:
        self._rows = rows
        self._stride = stride
        self._count = count
        self._discriminant = discriminant

    def __len__(self) -> int:
        return self._count

    def _offset(self, key: object) -> int:
        if type(key) is not str:
            return -1
        parts = key.split(",")
        if len(parts) != 3:
            return -1
        try:
            sought_a, sought_b, sought_c = int(parts[0]), int(parts[1]), int(parts[2])
        except ValueError:
            return -1
        low, high = 0, self._count
        while low < high:
            middle = (low + high) // 2
            offset = middle * self._stride
            a, b = self._rows[offset], self._rows[offset + 1]
            if a < sought_a or (a == sought_a and b < sought_b):
                low = middle + 1
            else:
                high = middle
        if low >= self._count:
            return -1
        offset = low * self._stride
        a, b = self._rows[offset], self._rows[offset + 1]
        c = (
            self._rows[offset + 2]
            if self._discriminant is None
            else (b * b - self._discriminant) // (4 * a)
        )
        if (a, b, c) != (sought_a, sought_b, sought_c):
            return -1
        if key != str(a) + "," + str(b) + "," + str(c):
            return -1
        return offset

    def __contains__(self, key: object) -> bool:
        return self._offset(key) >= 0

    def get(self, key: object, default: Any = None) -> Any:
        offset = self._offset(key)
        if offset < 0:
            return default
        coordinate_offset = 11 if self._discriminant is None else 2
        return tuple(self._rows[offset + coordinate_offset : offset + self._stride])


def validate_packed_imaginary_map(
    rows: list[int],
    certificate_forms: list[int],
    invariants: list[int],
    count: int,
    discriminant: int,
    linear: int,
    compact: bool = False,
) -> (
    tuple[
        list[tuple[int, int, int]] | PackedImaginaryForms,
        dict[str, tuple[int, ...]] | PackedImaginaryCoordinates,
    ]
    | None
):
    """Use the isolated kernel if installed, preserving the Python fallback.

    The host packer rejects Boolean, string, and out-of-range values before
    they can be coerced into signed integer storage.
    """
    kernel = verify_packed_imaginary_map
    if not is_compiled(kernel):
        return None
    packed_rows = _pack_exact_int64(kernel, rows)
    packed_certificate = _pack_exact_int64(kernel, certificate_forms)
    packed_invariants = _pack_exact_int64(kernel, invariants)
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
    core = len(rows) == count * (2 + len(invariants))
    stride = (2 if core else 11) + len(invariants)
    if compact:
        import sagejs.runtime as runtime

        # Compact publication takes ownership of the verified flat map. The
        # kernel and this freeze run synchronously, so no writer can change a
        # checked row between them. Keeping the decorated array avoids a
        # second O(class number) copy, while freezing protects every later
        # ideal-class lookup from mutations through the original result.
        verified_rows = runtime.object.freeze(rows)
        return (
            PackedImaginaryForms(
                verified_rows, stride, count, discriminant if core else None
            ),
            PackedImaginaryCoordinates(
                verified_rows, stride, count, discriminant if core else None
            ),
        )
    forms = []
    coordinates = {}
    for index in range(count):
        offset = index * stride
        a, b = rows[offset], rows[offset + 1]
        c = (b * b - discriminant) // (4 * a) if core else rows[offset + 2]
        forms.append((a, b, c))
        coordinates[str(a) + "," + str(b) + "," + str(c)] = tuple(
            rows[offset + (2 if core else 11) : offset + stride]
        )
    return forms, coordinates


@native
def verify_packed_imaginary_map(
    rows: Int64Buffer,
    certificate_forms: Int64Buffer,
    invariant_factors: Int64Buffer,
    seen_coordinates: UInt64Buffer,
    discriminant: int,
    linear: int,
) -> int:
    """Return zero exactly when all full or core entries describe a bijective map.

    This verifies reduced primitive forms, sorted uniqueness, certificate
    agreement, supplied full-row inverse forms and ideal representatives,
    derived core-row ideals, and coordinate bijectivity. The ambient result
    schema and generator records are checked by the public Python wrapper.
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
    core = len(rows) == (2 + rank) * count
    stride = 11 + rank
    coordinate_offset = 11
    if core:
        stride = 2 + rank
        coordinate_offset = 2
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
        if core:
            if a <= zero or a > 258_200 or b < -258_200 or b > 258_200:
                return one
            numerator = b * b - discriminant
            denominator = 4 * a
            if numerator % denominator != zero:
                return one
            c = numerator // denominator
        else:
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
        if (linear - b) % 2 != zero:
            return one
        if not core:
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
            ):
                return one
        ordinal = zero
        multiplier = one
        position = zero
        while position < rank:
            value = rows[offset + coordinate_offset + position]
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
