"""Declared-FLINT crossover kernels for packed univariate polynomials."""

from __future__ import annotations

from sagejs.ffi.flint import (
    fmpq_poly_divexact,
    fmpq_poly_factor,
    fmpq_poly_mul,
    fmpz_poly_divexact,
    fmpz_poly_factor,
    fmpz_poly_mul,
    nmod_poly_divexact,
    nmod_poly_factor,
    nmod_poly_gcd,
    nmod_poly_is_irreducible,
    nmod_poly_mul,
    nmod_poly_roots,
)
from sagejs.native import IntegerBuffer, UInt64Buffer, native, uint64


@native
def flint_packed_integer_polynomial_multiply(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: uint64,
) -> bool:
    return fmpz_poly_mul(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        one,
    )


@native
def flint_packed_rational_polynomial_multiply(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: uint64,
) -> bool:
    return fmpq_poly_mul(
        output_numerators,
        output_denominators,
        left_numerators,
        left_denominators,
        right_numerators,
        right_denominators,
        output_length,
        left_length,
        right_length,
        one,
    )


@native
def flint_packed_prime_field_polynomial_multiply(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_mul(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def flint_packed_integer_polynomial_divexact(
    output: IntegerBuffer,
    left: IntegerBuffer,
    right: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: uint64,
) -> bool:
    return fmpz_poly_divexact(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        one,
    )


@native
def flint_packed_rational_polynomial_divexact(
    output_numerators: IntegerBuffer,
    output_denominators: IntegerBuffer,
    left_numerators: IntegerBuffer,
    left_denominators: IntegerBuffer,
    right_numerators: IntegerBuffer,
    right_denominators: IntegerBuffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    one: uint64,
) -> bool:
    return fmpq_poly_divexact(
        output_numerators,
        output_denominators,
        left_numerators,
        left_denominators,
        right_numerators,
        right_denominators,
        output_length,
        left_length,
        right_length,
        one,
    )


@native
def flint_packed_prime_field_polynomial_divexact(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_divexact(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def flint_packed_prime_field_polynomial_gcd(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_gcd(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )


@native
def flint_packed_prime_field_polynomial_is_irreducible(
    source: UInt64Buffer,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_is_irreducible(source, source_length, modulus)


@native
def flint_packed_prime_field_polynomial_factor(
    factor_coefficients: UInt64Buffer,
    offsets: UInt64Buffer,
    exponents: UInt64Buffer,
    factor_count: UInt64Buffer,
    unit_output: UInt64Buffer,
    source: UInt64Buffer,
    factor_coefficients_length: uint64,
    offsets_length: uint64,
    exponents_length: uint64,
    factor_count_length: uint64,
    unit_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_factor(
        factor_coefficients,
        offsets,
        exponents,
        factor_count,
        unit_output,
        source,
        factor_coefficients_length,
        offsets_length,
        exponents_length,
        factor_count_length,
        unit_length,
        source_length,
        modulus,
    )


@native
def flint_packed_prime_field_polynomial_roots(
    root_values: UInt64Buffer,
    multiplicities: UInt64Buffer,
    root_count: UInt64Buffer,
    source: UInt64Buffer,
    root_values_length: uint64,
    multiplicities_length: uint64,
    root_count_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_roots(
        root_values,
        multiplicities,
        root_count,
        source,
        root_values_length,
        multiplicities_length,
        root_count_length,
        source_length,
        modulus,
    )


@native
def flint_packed_integer_polynomial_factor(
    factor_coefficients: IntegerBuffer,
    offsets: UInt64Buffer,
    exponents: UInt64Buffer,
    factor_count: UInt64Buffer,
    unit_numerator: IntegerBuffer,
    unit_denominator: IntegerBuffer,
    source: IntegerBuffer,
    factor_coefficients_length: uint64,
    source_length: uint64,
    one: uint64,
) -> bool:
    return fmpz_poly_factor(
        factor_coefficients,
        offsets,
        exponents,
        factor_count,
        unit_numerator,
        unit_denominator,
        source,
        factor_coefficients_length,
        source_length,
        one,
    )


@native
def flint_packed_rational_polynomial_factor(
    factor_coefficients: IntegerBuffer,
    offsets: UInt64Buffer,
    exponents: UInt64Buffer,
    factor_count: UInt64Buffer,
    unit_numerator: IntegerBuffer,
    unit_denominator: IntegerBuffer,
    source_numerators: IntegerBuffer,
    source_denominators: IntegerBuffer,
    factor_coefficients_length: uint64,
    source_length: uint64,
    one: uint64,
) -> bool:
    return fmpq_poly_factor(
        factor_coefficients,
        offsets,
        exponents,
        factor_count,
        unit_numerator,
        unit_denominator,
        source_numerators,
        source_denominators,
        factor_coefficients_length,
        source_length,
        one,
    )
