"""Generated FLINT kernels for word-characteristic extension polynomials.

The resources use FLINT `fq_default` with an internal `fq_nmod`
representation.  The choice is an implementation capability, not public
mathematical state: callers provide and receive complete low-to-high
power-basis coordinate tables.  Larger characteristics retain the ordinary
portable implementation until exact-integer coordinate ingress is available.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    FqContext,
    FqPolynomial,
    fq_polynomial,
    fq_polynomial_add,
    fq_polynomial_coordinate,
    fq_polynomial_degree,
    fq_polynomial_length,
    fq_polynomial_mul,
)
from sagejs.native import UInt64Buffer, native, uint64


@native
def flint_extension_polynomial_from_coordinates(
    context: FqContext,
    coordinates: UInt64Buffer,
    coordinate_length: uint64,
    coefficient_count: uint64,
) -> FqPolynomial:
    """Construct one owned polynomial through one checked bulk boundary."""
    return fq_polynomial(
        context,
        coordinates,
        coordinate_length,
        coefficient_count,
    )


@native
def flint_extension_polynomial_add(
    left: FqPolynomial,
    right: FqPolynomial,
) -> FqPolynomial:
    return fq_polynomial_add(left, right)


@native
def flint_extension_polynomial_multiply(
    left: FqPolynomial,
    right: FqPolynomial,
) -> FqPolynomial:
    return fq_polynomial_mul(left, right)


@native
def flint_extension_polynomial_coordinate_sum(
    polynomial: FqPolynomial,
) -> int:
    """Safely borrow and traverse every stored power-basis coordinate."""
    total = 0
    coefficient_count = fq_polynomial_length(polynomial)
    degree = fq_polynomial_degree(polynomial)
    for coefficient in range(coefficient_count):
        for basis in range(degree):
            total += fq_polynomial_coordinate(polynomial, coefficient, basis)
    return total
