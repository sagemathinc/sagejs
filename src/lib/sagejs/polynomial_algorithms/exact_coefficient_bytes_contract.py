"""Canonical byte-region contract for exact univariate coefficients.

This module is a storage-neutral reference for the stable SJPZ/SJPQ version 1
wire format.  It deliberately contains no FFI call.  Dynamic hosts can use it
as an oracle, while the generated FLINT adapter should parse the same bytes
directly from a borrowed byte-region resource.

The intended host boundary is:

1. `FlintByteRegion.from_bytes(source)` copies host bytes exactly once into an
   owned foreign byte region.
2. `fmpz_polynomial_from_byte_region(region, offset, length)` or
   `fmpq_polynomial_from_byte_region(region, offset, length)` borrows that
   region, validates the selected range, and constructs a temporary FLINT
   polynomial without routing the stream through an exact integer.
3. The generated wrapper publishes the new resource only after complete
   validation.  Failure leaves no partially initialized result and never
   mutates the borrowed region.
4. Egress returns the existing owned byte-region result; `take_bytes()` makes
   the one required foreign-to-host copy and closes it deterministically.

The byte region is a transport object, not canonical mathematical state.
Resource-to-resource polynomial operations must never serialize through it.
Importing magnitudes into FLINT necessarily initializes the destination
coefficients, but that is not another host-boundary copy.

ABI proposal for the later FFI lane
-----------------------------------

The declaration should use the already generated `FlintByteRegion` resource
and add these two ordinary functions (names may be adjusted consistently):

```python
def fmpz_polynomial_from_byte_region(
    source: FlintByteRegion,
    offset: uint64,
    length: uint64,
) -> FmpzPolynomial: ...

def fmpq_polynomial_from_byte_region(
    source: FlintByteRegion,
    offset: uint64,
    length: uint64,
) -> FmpqPolynomial: ...
```

Their C symbols should accept a read-only borrowed
`sagejs_flint_byte_region_t` plus `uint64_t offset` and `uint64_t length`.
The adapter checks `offset <= region.length` and
`length <= region.length - offset` before parsing, so addition cannot wrap.
Both functions allocate and use `Status(1, exception=ValueError, ...)` for an
invalid canonical stream, invalid range, or a count which cannot fit FLINT's
`slong`.  (This reference decoder distinguishes the last case as
`OverflowError` for diagnostics.)  They are non-consuming: success and failure
leave the byte region reusable.  Node and Wasm use the same declaration.  Wasm
borrows the copied linear-memory region only for the synchronous call and must
not retain its address.

This replaces the current `payload: fmpz_t, byte_length: uint64_t` ABI.  That
ABI converts bytes to hexadecimal, constructs a stream-sized host `BigInt`,
marshals it to `fmpz`, then reconstructs the bytes before FLINT can parse them.
"""

from __future__ import annotations

from typing import Sequence, TypeAlias

IntegerCoefficient: TypeAlias = int
RationalParts: TypeAlias = tuple[int, int]
ExactCoefficient: TypeAlias = IntegerCoefficient | RationalParts

SJPZ_MAGIC = b"SJPZ"
SJPQ_MAGIC = b"SJPQ"
FORMAT_VERSION = 1
ENVELOPE_BYTES = 16
SIGN_BIT = 0x80000000
LENGTH_MASK = 0x7FFFFFFF
MAX_FLINT_LENGTH = (1 << 63) - 1


def _exact_index(value: object, name: str) -> int:
    """Return one exact integer index, rejecting booleans and truncation."""
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    if isinstance(value, int):
        return value
    try:
        index = value.__index__  # type: ignore[attr-defined]
    except AttributeError:
        raise TypeError(name + " must be an integer") from None
    answer = index()
    if isinstance(answer, bool) or not isinstance(answer, int):
        raise TypeError(name + ".__index__() returned non-int")
    return answer


def _checked_byte(source: Sequence[int], index: int) -> int:
    value = source[index]
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 255:
        raise TypeError("exact polynomial byte region must contain bytes")
    return value


def _write_u32(output: bytearray, value: int) -> None:
    for shift in range(0, 32, 8):
        output.append((value >> shift) & 0xFF)


def _write_u64(output: bytearray, value: int) -> None:
    for shift in range(0, 64, 8):
        output.append((value >> shift) & 0xFF)


def _read_u32(source: Sequence[int], offset: int) -> int:
    answer = 0
    for byte in range(4):
        answer |= _checked_byte(source, offset + byte) << (8 * byte)
    return answer


def _read_u64(source: Sequence[int], offset: int) -> int:
    answer = 0
    for byte in range(8):
        answer |= _checked_byte(source, offset + byte) << (8 * byte)
    return answer


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right != 0:
        left, right = right, left % right
    return left


def canonical_rational_parts(numerator: object, denominator: object) -> RationalParts:
    """Normalize a rational pair to coprime parts with positive denominator."""
    top = _exact_index(numerator, "numerator")
    bottom = _exact_index(denominator, "denominator")
    if bottom == 0:
        raise ZeroDivisionError("rational denominator must be nonzero")
    if bottom < 0:
        top = -top
        bottom = -bottom
    divisor = _gcd(top, bottom)
    top //= divisor
    bottom //= divisor
    if top == 0:
        bottom = 1
    return top, bottom


def _encode_signed_magnitude(output: bytearray, value: object) -> None:
    integer = _exact_index(value, "coefficient part")
    negative = integer < 0
    magnitude = -integer if negative else integer
    encoded: list[int] = []
    while magnitude != 0:
        encoded.append(magnitude & 0xFF)
        magnitude >>= 8
    if len(encoded) > LENGTH_MASK:
        raise OverflowError("exact integer magnitude is too large")
    header = len(encoded) | (SIGN_BIT if negative else 0)
    _write_u32(output, header)
    output.extend(encoded)


def encode_integer_polynomial_region(coefficients: Sequence[object]) -> bytes:
    """Encode low-to-high `ZZ[x]` coefficients as canonical SJPZ bytes.

    Trailing zero coefficients are removed.  Consequently both an empty input
    and an all-zero input encode the unique 16-byte zero-polynomial region.
    """
    values = [_exact_index(value, "coefficient") for value in coefficients]
    while values and values[-1] == 0:
        values.pop()
    if len(values) > MAX_FLINT_LENGTH:
        raise OverflowError("integer polynomial is too long for FLINT")
    output = bytearray(SJPZ_MAGIC)
    output.extend([FORMAT_VERSION, 0, 0, 0])
    _write_u64(output, len(values))
    for value in values:
        _encode_signed_magnitude(output, value)
    return bytes(output)


def encode_rational_polynomial_region(
    coefficients: Sequence[tuple[object, object]],
) -> bytes:
    """Encode low-to-high `QQ[x]` parts as canonical SJPQ bytes.

    Input pairs are normalized before encoding.  The wire decoder is stricter:
    it rejects negative denominators, non-reduced pairs, and noncanonical zero
    instead of silently changing untrusted serialized data.
    """
    values = [canonical_rational_parts(top, bottom) for top, bottom in coefficients]
    while values and values[-1][0] == 0:
        values.pop()
    if len(values) > MAX_FLINT_LENGTH:
        raise OverflowError("rational polynomial is too long for FLINT")
    output = bytearray(SJPQ_MAGIC)
    output.extend([FORMAT_VERSION, 0, 0, 0])
    _write_u64(output, len(values))
    for top, bottom in values:
        _encode_signed_magnitude(output, top)
        _encode_signed_magnitude(output, bottom)
    return bytes(output)


def _selected_bounds(
    source: Sequence[int],
    offset: object,
    length: object | None,
) -> tuple[int, int]:
    start = _exact_index(offset, "offset")
    if start < 0 or start > len(source):
        raise ValueError("exact polynomial byte-region offset is out of bounds")
    count = len(source) - start if length is None else _exact_index(length, "length")
    if count < 0 or count > len(source) - start:
        raise ValueError("exact polynomial byte-region length is out of bounds")
    return start, start + count


def _decode_signed_magnitude(
    source: Sequence[int],
    offset: int,
    limit: int,
) -> tuple[int, int]:
    if limit - offset < 4:
        raise ValueError("exact polynomial integer header is truncated")
    header = _read_u32(source, offset)
    offset += 4
    negative = (header & SIGN_BIT) != 0
    length = header & LENGTH_MASK
    if length > limit - offset:
        raise ValueError("exact polynomial integer magnitude is truncated")
    if length == 0:
        if negative:
            raise ValueError("exact polynomial negative zero is not canonical")
        return 0, offset
    if _checked_byte(source, offset + length - 1) == 0:
        raise ValueError("exact polynomial integer magnitude is not minimal")
    magnitude = 0
    for byte in range(length - 1, -1, -1):
        magnitude = (magnitude << 8) | _checked_byte(source, offset + byte)
    return (-magnitude if negative else magnitude), offset + length


def decode_exact_polynomial_region(
    source: Sequence[int],
    rational: bool,
    offset: object = 0,
    length: object | None = None,
) -> tuple[ExactCoefficient, ...]:
    """Validate and decode one selected canonical SJPZ or SJPQ range.

    Bytes before and after the selected range are ignored.  All validation and
    coefficient construction completes in local storage before the tuple is
    returned, mirroring the native adapter's transactional temporary owner.
    """
    start, limit = _selected_bounds(source, offset, length)
    if limit - start < ENVELOPE_BYTES:
        raise ValueError("exact polynomial byte region is truncated")
    magic = SJPQ_MAGIC if rational else SJPZ_MAGIC
    for index in range(4):
        if _checked_byte(source, start + index) != magic[index]:
            raise ValueError("exact polynomial byte-region magic is invalid")
    if _checked_byte(source, start + 4) != FORMAT_VERSION:
        raise ValueError("exact polynomial byte-region version is unsupported")
    for index in range(5, 8):
        if _checked_byte(source, start + index) != 0:
            raise ValueError("exact polynomial byte-region reserved bytes are nonzero")
    coefficient_count = _read_u64(source, start + 8)
    if coefficient_count > MAX_FLINT_LENGTH:
        raise OverflowError("exact polynomial is too long for FLINT")
    minimum = 8 if rational else 4
    if coefficient_count > (limit - start - ENVELOPE_BYTES) // minimum:
        raise ValueError("exact polynomial coefficient stream is truncated")

    cursor = start + ENVELOPE_BYTES
    output: list[ExactCoefficient] = []
    for _index in range(coefficient_count):
        numerator, cursor = _decode_signed_magnitude(source, cursor, limit)
        if rational:
            denominator, cursor = _decode_signed_magnitude(source, cursor, limit)
            if denominator <= 0:
                raise ValueError("exact rational denominator must be positive")
            if _gcd(numerator, denominator) != 1:
                raise ValueError("exact rational coefficient is not reduced")
            output.append((numerator, denominator))
        else:
            output.append(numerator)
    if cursor != limit:
        raise ValueError("exact polynomial byte region has trailing data")
    if output:
        leading = output[-1]
        leading_numerator = leading[0] if isinstance(leading, tuple) else leading
        if leading_numerator == 0:
            raise ValueError("exact polynomial has a trailing zero coefficient")
    return tuple(output)
