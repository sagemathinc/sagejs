"""Strict host adapter for the direct native number-field order resource.

The native boundary returns one deterministic byte string.  Decoding remains
ordinary Python so the transfer format is independently inspectable and no
FLINT pointer enters the mathematical orchestration layer.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.maximal_order_contracts import OrderBasis

RESOURCE_COMPLETE = 0
RESOURCE_FALLBACK_ARBITRARY_PRIME = 1
RESOURCE_FALLBACK_NATIVE_FAILURE = 2


def _byte(payload: Any, index: int) -> int:
    value = int(payload[index])
    if value < 0 or value > 255:
        raise ValueError("number-field order payload contains a non-byte value")
    return value


def _unsigned(payload: Any, offset: int, width: int) -> int:
    answer = 0
    for index in range(width):
        answer += _byte(payload, offset + index) << (8 * index)
    return answer


def _integer(payload: Any, offset: int) -> tuple[int, int]:
    header = _unsigned(payload, offset, 4)
    length = header & 0x7FFFFFFF
    negative = header >= 0x80000000
    offset += 4
    if length > len(payload) - offset:
        raise ValueError("truncated number-field order integer")
    value = _unsigned(payload, offset, length)
    if negative:
        value = -value
    return value, offset + length


class NativeOrderResourceResult:
    """Decoded immutable result of the direct native order boundary."""

    def __init__(
        self,
        status: int,
        supplied_primes: int,
        resolved_primes: int,
        native_primes: int,
        unramified_primes: int,
        basis: OrderBasis,
        index: int,
        equation_discriminant: int,
        order_discriminant: int,
        fallback_prime: int,
    ) -> None:
        if status not in (
            RESOURCE_COMPLETE,
            RESOURCE_FALLBACK_ARBITRARY_PRIME,
            RESOURCE_FALLBACK_NATIVE_FAILURE,
        ):
            raise ValueError("unknown native number-field order status")
        counts = (
            supplied_primes,
            resolved_primes,
            native_primes,
            unramified_primes,
        )
        if any(value < 0 for value in counts):
            raise ValueError("native number-field order counts must be nonnegative")
        if resolved_primes > supplied_primes:
            raise ValueError("resolved-prime count exceeds supplied-prime count")
        if status == RESOURCE_COMPLETE and resolved_primes != supplied_primes:
            raise ValueError("a complete native order left unresolved primes")
        if status == RESOURCE_FALLBACK_ARBITRARY_PRIME and fallback_prime < 2:
            raise ValueError("arbitrary-prime fallback omitted its exact prime")
        if status != RESOURCE_FALLBACK_ARBITRARY_PRIME and fallback_prime != 0:
            raise ValueError("a non-fallback native order carried a fallback prime")
        if index <= 0:
            raise ValueError("native order index must be positive")
        if order_discriminant * index * index != equation_discriminant:
            raise ValueError("native order discriminant/index evidence is inconsistent")
        self.status = status
        self.supplied_primes = supplied_primes
        self.resolved_primes = resolved_primes
        self.native_primes = native_primes
        self.unramified_primes = unramified_primes
        self.basis = basis
        self.index = index
        self.equation_discriminant = equation_discriminant
        self.order_discriminant = order_discriminant
        self.fallback_prime = fallback_prime

    @property
    def complete(self) -> bool:
        return self.status == RESOURCE_COMPLETE

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/native-order-result-v1",
            "status": self.status,
            "supplied_primes": self.supplied_primes,
            "resolved_primes": self.resolved_primes,
            "native_primes": self.native_primes,
            "unramified_primes": self.unramified_primes,
            "basis": self.basis.to_dict(),
            "index": self.index,
            "equation_discriminant": self.equation_discriminant,
            "order_discriminant": self.order_discriminant,
            "fallback_prime": self.fallback_prime,
        }


def decode_order_resource(payload: Any) -> NativeOrderResourceResult:
    """Decode and independently validate one native order payload."""
    if len(payload) < 64:
        raise ValueError("truncated number-field order resource")
    magic = [83, 74, 78, 70, 79, 1, 0, 0]
    if [_byte(payload, index) for index in range(8)] != magic:
        raise ValueError("unsupported number-field order resource schema")
    degree = _unsigned(payload, 8, 8)
    status = _unsigned(payload, 16, 8)
    supplied = _unsigned(payload, 24, 8)
    resolved = _unsigned(payload, 32, 8)
    native = _unsigned(payload, 40, 8)
    unramified = _unsigned(payload, 48, 8)
    count = _unsigned(payload, 56, 8)
    if degree == 0 or degree > 1_000_000:
        raise ValueError("invalid number-field order resource degree")
    expected = 5 + degree * degree
    if count != expected:
        raise ValueError("number-field order resource entry count is inconsistent")
    values: list[int] = []
    offset = 64
    for _index in range(count):
        value, offset = _integer(payload, offset)
        values.append(value)
    if offset != len(payload):
        raise ValueError("number-field order resource has trailing bytes")
    denominator = values[0]
    index = values[1]
    equation_discriminant = values[2]
    order_discriminant = values[3]
    fallback_prime = values[4]
    numerator = []
    for row in range(degree):
        start = 5 + row * degree
        numerator.append(values[start : start + degree])
    basis = OrderBasis(numerator, denominator, canonical=True)
    return NativeOrderResourceResult(
        status,
        supplied,
        resolved,
        native,
        unramified,
        basis,
        index,
        equation_discriminant,
        order_discriminant,
        fallback_prime,
    )


def native_order_from_polynomial(
    coefficients_low_to_high: list[int],
    certified_prime_hints: list[int],
) -> NativeOrderResourceResult:
    """Run the optional direct native boundary and close every resource.

    Prime hints must already have independent primality certificates.  This
    boundary verifies primality again, but that native check is not used as the
    global maximality proof.  A nonzero result status is returned to the caller
    for strict-Python fallback and is never interpreted as a completed order.
    """
    if len(coefficients_low_to_high) < 2:
        raise ValueError("an integral defining polynomial must have positive degree")
    coefficients = [int(value) for value in coefficients_low_to_high]
    if coefficients[-1] != 1:
        raise ValueError("the direct order boundary requires a monic polynomial")
    primes = [int(value) for value in certified_prime_hints]
    if any(prime < 2 for prime in primes):
        raise ValueError("certified prime hints must be at least two")

    flint = __import__("sagejs.ffi.flint", fromlist=["flint"])
    polynomial = flint.fmpz_polynomial(len(coefficients))
    hints = flint.fmpz_matrix(len(primes), 1)
    try:
        for index, coefficient in enumerate(coefficients):
            flint.fmpz_polynomial_set_coefficient(polynomial, index, coefficient)
        flint.fmpz_polynomial_seal(polynomial)
        for row, prime in enumerate(primes):
            flint.fmpz_matrix_set_entry(hints, row, 0, prime)
        resource = flint.number_field_order_from_polynomial_resource(polynomial, hints)
        try:
            # The validated compact payload is the authoritative transfer and
            # includes the status.  Reading the same field through a scalar
            # FFI accessor would add a redundant host crossing.
            payload = resource.copy_bytes()
            return decode_order_resource(payload)
        finally:
            resource.close()
    finally:
        hints.close()
        polynomial.close()
