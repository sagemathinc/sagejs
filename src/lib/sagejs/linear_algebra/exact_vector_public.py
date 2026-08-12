"""Generated-resource execution for public dense vectors over `ZZ` and `QQ`.

The public `Vector` type owns Sage coercion and mutability semantics.  This
module owns the representation boundary: exact vectors live in generated
`FmpzVector` or `FmpqVector` resources, while host lists are constructed only
for explicit presentation operations such as `.list()`, iteration, and text
formatting.

The current matrix-vector ABI still exchanges canonical serialized byte
regions.  This module adopts such a result directly into a vector resource,
avoiding any intermediate host element list.  A future declaration can pass
the vector resource itself and remove that remaining resource-to-resource
copy without changing the public `Vector` API.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.ffi import flint


def integer_from_values(values: Any) -> flint.FmpzVector:
    """Return a new integer-vector resource containing `values`."""
    packed = runtime.exact_integer_values_to_packed_bytes(values)
    region = flint.FlintByteRegion.from_bytes(packed)
    try:
        return flint.fmpz_vector_from_byte_region(region, len(values))
    finally:
        region.close()


def rational_from_values(values: Any) -> flint.FmpqVector:
    """Return a new rational-vector resource containing coerced `values`."""
    packed = runtime.canonical_rational_values_to_packed_bytes(
        values,
        sage.Rational,
        sage.QQ,
    )
    if packed is runtime.undefined:
        parts = []
        for value in values:
            rational = sage.QQ(value)
            parts.append(rational._numerator)
            parts.append(rational._denominator)
        packed = runtime.exact_integer_values_to_packed_bytes(parts)
    region = flint.FlintByteRegion.from_bytes(packed)
    try:
        return flint.fmpq_vector_from_byte_region(region, len(values))
    finally:
        region.close()


def integer_from_region(
    region: flint.FlintByteRegion,
    length: int,
) -> flint.FmpzVector:
    """Adopt canonical integer bytes into a new vector resource."""
    return flint.fmpz_vector_from_byte_region(region, length)


def rational_from_region(
    region: flint.FlintByteRegion,
    length: int,
) -> flint.FmpqVector:
    """Adopt canonical rational bytes into a new vector resource."""
    return flint.fmpq_vector_from_byte_region(region, length)


def integer_values(resource: flint.FmpzVector, length: int) -> list[Any]:
    """Materialize one integer resource as host Sage integers."""
    region = flint.fmpz_vector_serialize(resource)
    values = runtime.exact_integer_values_from_packed_bytes(
        region.take_bytes(),
        length,
    )
    return [runtime.normalize_integer(value) for value in values]


def rational_values(resource: flint.FmpqVector, length: int) -> list[Any]:
    """Materialize one rational resource as host Sage rationals."""
    region = flint.fmpq_vector_serialize(resource)
    parts = runtime.exact_integer_values_from_packed_bytes(
        region.take_bytes(),
        2 * length,
    )
    return runtime.reduced_rational_values_from_parts(
        parts,
        sage.Rational,
        sage.QQ,
    )


def integer_entry(resource: flint.FmpzVector, index: int) -> Any:
    """Return one canonical integer entry."""
    return runtime.normalize_integer(flint.fmpz_vector_entry(resource, index))


def rational_entry(resource: flint.FmpqVector, index: int) -> Any:
    """Return one canonical rational entry."""
    numerator = flint.fmpq_vector_entry_numerator(resource, index)
    denominator = flint.fmpq_vector_entry_denominator(resource, index)
    return sage.QQ(numerator) / denominator


def integer_set(resource: flint.FmpzVector, index: int, value: Any) -> None:
    """Set one already-coerced integer entry."""
    flint.fmpz_vector_set_entry(resource, index, value)


def rational_set(resource: flint.FmpqVector, index: int, value: Any) -> None:
    """Set one already-coerced rational entry."""
    flint.fmpq_vector_set_entry(
        resource,
        index,
        value._numerator,
        value._denominator,
    )


def add(left: Any, right: Any, rational: bool) -> Any:
    """Return a resource containing `left + right`."""
    if rational:
        return flint.fmpq_vector_add(left, right)
    return flint.fmpz_vector_add(left, right)


def sub(left: Any, right: Any, rational: bool) -> Any:
    """Return a resource containing `left - right`."""
    if rational:
        return flint.fmpq_vector_sub(left, right)
    return flint.fmpz_vector_sub(left, right)


def scalar_mul(resource: Any, scalar: Any, rational: bool) -> Any:
    """Return a resource containing `resource * scalar`."""
    if rational:
        return flint.fmpq_vector_scalar_mul(
            resource,
            scalar._numerator,
            scalar._denominator,
        )
    return flint.fmpz_vector_scalar_mul(resource, scalar)


def dot(left: Any, right: Any, rational: bool) -> Any:
    """Return the exact dot product of two equal-length resources."""
    if not rational:
        return runtime.normalize_integer(flint.fmpz_vector_dot(left, right))
    value = flint.fmpq_vector_dot(left, right)
    try:
        return sage.QQ(flint.fmpq_value_numerator(value)) / (
            flint.fmpq_value_denominator(value)
        )
    finally:
        value.close()


def equal(left: Any, right: Any, rational: bool) -> bool:
    """Return whether two same-base resources have equal entries."""
    if rational:
        return bool(flint.fmpq_vector_equal(left, right))
    return bool(flint.fmpz_vector_equal(left, right))


def serialize_integer(resource: flint.FmpzVector) -> flint.FlintByteRegion:
    """Return canonical serialized integer entries for an FFI bridge."""
    return flint.fmpz_vector_serialize(resource)


def serialize_rational(resource: flint.FmpqVector) -> flint.FlintByteRegion:
    """Return canonical serialized rational entries for an FFI bridge."""
    return flint.fmpq_vector_serialize(resource)
