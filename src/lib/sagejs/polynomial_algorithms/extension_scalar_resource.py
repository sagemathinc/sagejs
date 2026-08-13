"""Forced generated-resource scalars for word-characteristic finite fields.

This module is an explicit architecture slice, not the public `GF` backend.
`ForcedGeneratedFqField` owns exactly one generated `FqContext`, and each
`ForcedGeneratedFqElement` owns exactly one generated `FqElement`.  Neither
object stores a legacy FLINT/N-API value or a persistent coordinate copy.

Coordinates use the canonical low-to-high power basis
`1, a, ..., a^(degree - 1)`.  Live export crosses the host boundary once as an
`SJFE` version-1 byte region:

```text
offset  size  meaning
0       4     ASCII "SJFE"
4       1     version 1
5       3     zero reserved bytes
8       8     little-endian extension degree
16      8*n   little-endian uint64 coordinates
```

Portable serialization is the immutable pair `(context_descriptor,
coordinates)`.  It contains no resource handle, pointer, backend text, or
context identity.  Equal descriptors constructed independently therefore
serialize identically, while live arithmetic still requires the exact same
field object and ultimately the exact same retained foreign context.

The generated Fq declarations are currently native-only and thread-affine.
Importing this module is portable, but constructing the forced field fails
loudly when the generated FLINT adapter is unavailable.  Public finite fields
continue to use their existing tested backend until the later migration lane.
"""

from __future__ import annotations

from typing import Any, Sequence, TypeAlias

from sagejs.polynomial_algorithms.extension_resource_contract import (
    ContextDescriptor,
    checked_element_coordinates,
    extension_context_descriptor,
)

ElementPayload: TypeAlias = tuple[ContextDescriptor, tuple[int, ...]]

_HASH_MODULUS = 2_147_483_647
_HASH_MULTIPLIER = 257
_HASH_OFFSET = 1_315_423_911


def _exact_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an exact integer")
    if isinstance(value, int):
        return int(value)
    try:
        method = value.__index__
    except AttributeError:
        raise TypeError(name + " must be an exact integer") from None
    answer = method()
    if isinstance(answer, bool) or not isinstance(answer, int):
        raise TypeError(name + " __index__ returned a non-integer")
    return int(answer)


def _buffer_length(source: Any) -> int:
    return len(source)


def _byte(source: Any, index: int) -> int:
    return int(source[index])


def _read_u64(source: Any, offset: int) -> int:
    value = 0
    for byte_index in range(8):
        value += _byte(source, offset + byte_index) << (8 * byte_index)
    return value


def decode_coordinate_bytes(source: Any, expected_degree: Any) -> tuple[int, ...]:
    """Decode and validate one canonical `SJFE` version-1 transfer."""
    degree = _exact_integer(expected_degree, "finite-field degree")
    if degree < 2:
        raise ValueError("finite-extension degree must be at least 2")
    if _buffer_length(source) != 16 + 8 * degree:
        raise ValueError("finite extension element payload has invalid length")
    if [_byte(source, index) for index in range(4)] != [83, 74, 70, 69]:
        raise ValueError("finite extension element payload has invalid magic")
    if _byte(source, 4) != 1:
        raise ValueError("finite extension element payload has unsupported version")
    if [_byte(source, index) for index in range(5, 8)] != [0, 0, 0]:
        raise ValueError("finite extension element payload has invalid reserved bytes")
    if _read_u64(source, 8) != degree:
        raise ValueError("finite extension element payload has incompatible degree")
    return tuple(_read_u64(source, 16 + 8 * index) for index in range(degree))


def canonical_element_payload(
    descriptor: ContextDescriptor,
    coordinates: Sequence[Any],
) -> ElementPayload:
    """Return a checked immutable descriptor-plus-coordinate payload."""
    characteristic, degree, modulus, generator = descriptor
    checked_descriptor = extension_context_descriptor(
        characteristic,
        degree,
        modulus,
        generator,
    )
    checked = checked_element_coordinates(characteristic, degree, coordinates)
    return checked_descriptor, tuple(
        _exact_integer(value, "finite-field element coordinate") for value in checked
    )


def deserialize_element_payload(payload: Any) -> ElementPayload:
    """Validate one portable scalar payload without constructing a resource."""
    if not isinstance(payload, tuple) or len(payload) != 2:
        raise TypeError("serialized finite extension element must be a two-tuple")
    descriptor, coordinates = payload
    if not isinstance(descriptor, tuple) or len(descriptor) != 4:
        raise TypeError("serialized finite-field context descriptor is malformed")
    if not isinstance(coordinates, tuple):
        raise TypeError("serialized finite-field coordinates must be a tuple")
    return canonical_element_payload(descriptor, coordinates)


def stable_element_hash(payload: ElementPayload) -> int:
    """Return a deterministic pointer-independent portable hash.

    The recurrence is deliberately bounded below 2^53 after every
    multiplication.  CPython and Sage.js therefore compute exactly the same
    value without relying on JavaScript bitwise coercions or a host pointer.
    """
    descriptor, coordinates = deserialize_element_payload(payload)
    characteristic, degree, modulus, generator = descriptor
    state = _HASH_OFFSET
    values = [characteristic, degree, len(modulus)]
    values.extend(modulus)
    values.append(len(generator))
    values.extend(ord(character) for character in generator)
    values.append(len(coordinates))
    values.extend(coordinates)
    for value in values:
        state = (state * _HASH_MULTIPLIER + value % _HASH_MODULUS) % _HASH_MODULUS
    return state


class ForcedGeneratedFqField:
    """One explicit generated `GF(p^n)` context, never the public default."""

    def __init__(
        self,
        characteristic: Any,
        degree: Any,
        modulus_coefficients: Sequence[Any],
        generator_name: Any = "a",
    ) -> None:
        descriptor = extension_context_descriptor(
            characteristic,
            degree,
            modulus_coefficients,
            generator_name,
        )
        prime, extension_degree, modulus, _generator = descriptor
        import sagejs.runtime as runtime
        from sagejs.ffi import flint

        packed = runtime.uint64_buffer(modulus)
        self._descriptor = descriptor
        self._resource = flint.fq_context(packed, extension_degree + 1, prime)

    @property
    def descriptor(self) -> ContextDescriptor:
        return self._descriptor

    @property
    def closed(self) -> bool:
        return self._resource.closed

    def close(self) -> None:
        self._resource.close()

    def element(self, coordinates: Sequence[Any]) -> ForcedGeneratedFqElement:
        import sagejs.runtime as runtime
        from sagejs.ffi import flint

        if self.closed:
            raise RuntimeError("finite-field context is closed")
        prime, degree, _modulus, _generator = self._descriptor
        checked = checked_element_coordinates(prime, degree, coordinates)
        packed = runtime.uint64_buffer(checked)
        return ForcedGeneratedFqElement(
            self,
            flint.fq_element(self._resource, packed, degree),
        )

    def zero(self) -> ForcedGeneratedFqElement:
        return self.element([0 for _index in range(self._descriptor[1])])

    def one(self) -> ForcedGeneratedFqElement:
        coordinates = [0 for _index in range(self._descriptor[1])]
        coordinates[0] = 1
        return self.element(coordinates)

    def deserialize(self, payload: Any) -> ForcedGeneratedFqElement:
        descriptor, coordinates = deserialize_element_payload(payload)
        if descriptor != self._descriptor:
            raise TypeError("serialized element belongs to an incompatible field")
        return self.element(coordinates)

    @classmethod
    def reconstruct(
        cls,
        payload: Any,
    ) -> tuple[ForcedGeneratedFqField, ForcedGeneratedFqElement]:
        descriptor, coordinates = deserialize_element_payload(payload)
        characteristic, degree, modulus, generator = descriptor
        field = cls(characteristic, degree, modulus, generator)
        return field, field.element(coordinates)


class ForcedGeneratedFqElement:
    """One immutable mathematical value backed only by one `FqElement`."""

    def __init__(self, field: ForcedGeneratedFqField, resource: Any) -> None:
        self._field = field
        self._resource = resource

    @property
    def field(self) -> ForcedGeneratedFqField:
        return self._field

    @property
    def closed(self) -> bool:
        return self._resource.closed

    def close(self) -> None:
        self._resource.close()

    def copy(self) -> ForcedGeneratedFqElement:
        from sagejs.ffi import flint

        return ForcedGeneratedFqElement(
            self._field,
            flint.fq_element_copy(self._resource),
        )

    def _require_same_field(
        self,
        other: object,
    ) -> ForcedGeneratedFqElement:
        if not isinstance(other, ForcedGeneratedFqElement):
            raise TypeError("finite-field arithmetic requires a generated element")
        if other._field is not self._field:
            raise TypeError("finite-field elements belong to incompatible contexts")
        return other

    def __add__(self, other: object) -> ForcedGeneratedFqElement:
        from sagejs.ffi import flint

        checked = self._require_same_field(other)
        return ForcedGeneratedFqElement(
            self._field,
            flint.fq_element_add(self._resource, checked._resource),
        )

    def __sub__(self, other: object) -> ForcedGeneratedFqElement:
        from sagejs.ffi import flint

        checked = self._require_same_field(other)
        return ForcedGeneratedFqElement(
            self._field,
            flint.fq_element_sub(self._resource, checked._resource),
        )

    def __mul__(self, other: object) -> ForcedGeneratedFqElement:
        from sagejs.ffi import flint

        checked = self._require_same_field(other)
        return ForcedGeneratedFqElement(
            self._field,
            flint.fq_element_mul(self._resource, checked._resource),
        )

    def __truediv__(self, other: object) -> ForcedGeneratedFqElement:
        checked = self._require_same_field(other)
        inverse = checked.inverse()
        try:
            return self * inverse
        finally:
            inverse.close()

    def __neg__(self) -> ForcedGeneratedFqElement:
        from sagejs.ffi import flint

        return ForcedGeneratedFqElement(
            self._field,
            flint.fq_element_neg(self._resource),
        )

    def __pow__(self, exponent: Any) -> ForcedGeneratedFqElement:
        from sagejs.ffi import flint

        exact = _exact_integer(exponent, "finite-field exponent")
        if exact < 0 and self.is_zero():
            raise ZeroDivisionError("cannot raise zero to a negative power")
        return ForcedGeneratedFqElement(
            self._field,
            flint.fq_element_pow(self._resource, exact),
        )

    def inverse(self) -> ForcedGeneratedFqElement:
        from sagejs.ffi import flint

        if self.is_zero():
            raise ZeroDivisionError("cannot invert zero in a finite field")
        return ForcedGeneratedFqElement(
            self._field,
            flint.fq_element_inverse(self._resource),
        )

    def is_zero(self) -> bool:
        from sagejs.ffi import flint

        return bool(flint.fq_element_is_zero(self._resource))

    def is_one(self) -> bool:
        from sagejs.ffi import flint

        return bool(flint.fq_element_is_one(self._resource))

    def coordinates(self) -> tuple[int, ...]:
        from sagejs.ffi import flint

        region = flint.fq_element_coordinate_bytes(self._resource)
        copied = region.take_bytes()
        coordinates = decode_coordinate_bytes(copied, self._field.descriptor[1])
        checked = checked_element_coordinates(
            self._field.descriptor[0],
            self._field.descriptor[1],
            coordinates,
        )
        return tuple(
            _exact_integer(value, "finite-field coordinate") for value in checked
        )

    def serialize(self) -> ElementPayload:
        return canonical_element_payload(self._field.descriptor, self.coordinates())

    def __hash__(self) -> int:
        return stable_element_hash(self.serialize())

    def __eq__(self, other: object) -> bool:
        from sagejs.ffi import flint

        if not isinstance(other, ForcedGeneratedFqElement):
            return False
        if other._field is not self._field:
            return False
        return bool(flint.fq_element_equal(self._resource, other._resource))

    def __repr__(self) -> str:
        return "ForcedGeneratedFqElement(" + repr(self.coordinates()) + ")"
