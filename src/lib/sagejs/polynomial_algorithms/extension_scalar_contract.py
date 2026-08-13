"""Portable value contract for word-characteristic finite-extension scalars.

Live generated resources use one bulk `SJFE` version-1 coordinate transfer:

```text
offset  size  meaning
0       4     ASCII "SJFE"
4       1     version 1
5       3     zero reserved bytes
8       8     little-endian extension degree
16      8*n   little-endian uint64 coordinates
```

This module deliberately has no runtime or FFI dependency. CPython can use it
to validate portable descriptor-plus-coordinate payloads without constructing
or observing a foreign resource.
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
    multiplication. CPython and Sage.js therefore compute exactly the same
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
