"""Public host codecs for generated arbitrary-prime polynomial resources.

The mathematical object is an opaque self-contained FLINT resource on native
hosts, but variable-size data crosses the boundary as one canonical byte
stream.  These helpers deliberately know only that stable byte format.  They
do not expose a foreign pointer, FLINT context, or host package handle.

The resource payload is `SJMP` version 1: an arbitrary-precision prime modulus
followed by canonical low-to-high residues.  Factor and roots aggregate
payloads extend the same unsigned-integer encoding so a complete logical
answer crosses the host boundary once.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

_POLYNOMIAL_MAGIC = [83, 74, 77, 80, 1, 0, 0, 0]
_FACTORIZATION_MAGIC = [83, 74, 70, 80, 77, 1, 0, 0]
_ROOTS_MAGIC = [83, 74, 82, 80, 77, 1, 0, 0]
_BYTE_BASE = runtime.bigint(256)
_MAX_HOST_COUNT = 0xFFFFFFFF


def _byte_array(length: int) -> Any:
    constructor = runtime.reflect.get(runtime.global_object, "Uint8Array")
    return runtime.reflect.construct(constructor, [length])


def _buffer_length(source: Any) -> int:
    return int(runtime.reflect.get(source, "length"))


def _canonical_residue(value: Any, modulus: Any) -> Any:
    residue = runtime.native_mod(runtime.integer_bigint(value), modulus)
    if residue < 0:
        residue = runtime.native_add(residue, modulus)
    return residue


def _unsigned_width(value: Any) -> int:
    width = 1
    remaining = runtime.integer_bigint(value)
    while remaining >= _BYTE_BASE:
        remaining = runtime.native_div(remaining, _BYTE_BASE)
        width += 1
    return width


def _write_u64(output: Any, offset: int, value: int) -> int:
    if value < 0 or value > _MAX_HOST_COUNT:
        raise OverflowError("arbitrary-prime polynomial payload is too large")
    remaining = value
    for byte_index in range(8):
        output[offset + byte_index] = remaining % 256
        remaining //= 256
    return offset + 8


def _write_unsigned(output: Any, offset: int, value: Any) -> int:
    width = _unsigned_width(value)
    offset = _write_u64(output, offset, width)
    remaining = runtime.integer_bigint(value)
    for byte_index in range(width):
        output[offset + byte_index] = runtime.number(
            runtime.native_mod(remaining, _BYTE_BASE)
        )
        remaining = runtime.native_div(remaining, _BYTE_BASE)
    return offset + width


def encode_resource_payload(coefficients: list[Any], modulus: Any) -> Any:
    """Encode one canonical `GF(p)[x]` resource payload in a `Uint8Array`."""
    prime = runtime.integer_bigint(modulus)
    if prime < 2:
        raise ValueError("prime modulus must be at least 2")
    values = [_canonical_residue(value, prime) for value in coefficients]
    while values and values[-1] == 0:
        values.pop()
    if len(values) > _MAX_HOST_COUNT:
        raise OverflowError("arbitrary-prime polynomial is too large")
    length = 24 + _unsigned_width(prime)
    for value in values:
        length += 8 + _unsigned_width(value)
    output = _byte_array(length)
    for index in range(8):
        output[index] = _POLYNOMIAL_MAGIC[index]
    offset = _write_unsigned(output, 8, prime)
    offset = _write_u64(output, offset, len(values))
    for value in values:
        offset = _write_unsigned(output, offset, value)
    if offset != length:
        raise RuntimeError("arbitrary-prime polynomial payload length mismatch")
    return output


def _require_magic(source: Any, magic: list[int], label: str) -> None:
    if _buffer_length(source) < len(magic):
        raise ValueError("truncated " + label + " payload")
    for index in range(len(magic)):
        if int(source[index]) != magic[index]:
            raise ValueError("invalid " + label + " payload")


def _read_u64(source: Any, offset: int, label: str) -> tuple[int, int]:
    if offset < 0 or offset + 8 > _buffer_length(source):
        raise ValueError("truncated " + label + " payload")
    value = 0
    for byte_index in range(7, -1, -1):
        value = 256 * value + int(source[offset + byte_index])
        if value > _MAX_HOST_COUNT:
            raise OverflowError(label + " payload is too large")
    return value, offset + 8


def _read_unsigned(source: Any, offset: int, label: str) -> tuple[Any, int]:
    width, offset = _read_u64(source, offset, label)
    if width == 0 or offset + width > _buffer_length(source):
        raise ValueError("invalid " + label + " integer")
    if width > 1 and int(source[offset + width - 1]) == 0:
        raise ValueError("noncanonical " + label + " integer")
    value = runtime.bigint(0)
    for byte_index in range(width - 1, -1, -1):
        value = runtime.native_add(
            runtime.native_mul(value, _BYTE_BASE),
            runtime.bigint(int(source[offset + byte_index])),
        )
    return value, offset + width


def decode_resource_payload(source: Any) -> tuple[Any, list[Any]]:
    """Decode and validate one trusted or serialized `SJMP` resource stream."""
    label = "arbitrary-prime polynomial"
    _require_magic(source, _POLYNOMIAL_MAGIC, label)
    modulus, offset = _read_unsigned(source, 8, label)
    if modulus < 2:
        raise ValueError("prime modulus must be at least 2")
    count, offset = _read_u64(source, offset, label)
    values = []
    for _index in range(count):
        value, offset = _read_unsigned(source, offset, label)
        if value >= modulus:
            raise ValueError("polynomial coefficient is not a canonical residue")
        values.append(value)
    if offset != _buffer_length(source) or (values and values[-1] == 0):
        raise ValueError("noncanonical arbitrary-prime polynomial payload")
    return modulus, values


def decode_factorization_payload(
    source: Any,
) -> tuple[Any, Any, list[tuple[list[Any], int]]]:
    """Decode one complete factorization copied from a retained FLINT result."""
    label = "arbitrary-prime polynomial factorization"
    _require_magic(source, _FACTORIZATION_MAGIC, label)
    count, metadata_offset = _read_u64(source, 8, label)
    offset = 16 + 16 * count
    if offset > _buffer_length(source):
        raise ValueError("truncated " + label + " payload")
    exponents = []
    coefficient_counts = []
    for index in range(count):
        exponent, _unused = _read_u64(source, metadata_offset + 16 * index, label)
        coefficient_count, _unused = _read_u64(
            source, metadata_offset + 16 * index + 8, label
        )
        if exponent == 0:
            raise ValueError("factorization exponent must be positive")
        exponents.append(exponent)
        coefficient_counts.append(coefficient_count)
    modulus, offset = _read_unsigned(source, offset, label)
    unit, offset = _read_unsigned(source, offset, label)
    if modulus < 2 or unit >= modulus:
        raise ValueError("invalid arbitrary-prime factorization metadata")
    factors = []
    for index in range(count):
        coefficients = []
        for _coefficient in range(coefficient_counts[index]):
            value, offset = _read_unsigned(source, offset, label)
            if value >= modulus:
                raise ValueError("factor coefficient is not a canonical residue")
            coefficients.append(value)
        if not coefficients or coefficients[-1] != 1:
            raise ValueError("factorization contains a nonmonic factor")
        factors.append((coefficients, exponents[index]))
    if offset != _buffer_length(source):
        raise ValueError("factorization payload has trailing bytes")
    return modulus, unit, factors


def decode_roots_payload(source: Any) -> tuple[Any, list[tuple[Any, int]]]:
    """Decode distinct canonical roots and exact multiplicities in one pass."""
    label = "arbitrary-prime polynomial roots"
    _require_magic(source, _ROOTS_MAGIC, label)
    count, metadata_offset = _read_u64(source, 8, label)
    offset = 16 + 8 * count
    if offset > _buffer_length(source):
        raise ValueError("truncated " + label + " payload")
    exponents = []
    for index in range(count):
        exponent, _unused = _read_u64(source, metadata_offset + 8 * index, label)
        if exponent == 0:
            raise ValueError("root multiplicity must be positive")
        exponents.append(exponent)
    modulus, offset = _read_unsigned(source, offset, label)
    if modulus < 2:
        raise ValueError("prime modulus must be at least 2")
    roots = []
    for index in range(count):
        root, offset = _read_unsigned(source, offset, label)
        if root >= modulus:
            raise ValueError("root is not a canonical residue")
        roots.append((root, exponents[index]))
    if offset != _buffer_length(source):
        raise ValueError("roots payload has trailing bytes")
    return modulus, roots


def format_resource_text(raw: str, variable: str) -> str:
    """Normalize FLINT's sentinel-variable output to Sage display syntax."""
    # `fmpz_mod_poly_get_str_pretty` emits canonical nonnegative residues, so
    # its only operators here are `+`, `*`, and `^`.  Plain Python string
    # operations keep this strict module portable and avoid JavaScript regexp
    # semantics at a mathematical boundary.
    return raw.replace("+", " + ").replace("x", variable)
