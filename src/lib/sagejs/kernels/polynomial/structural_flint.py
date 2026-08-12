"""Generated-FLINT structural calculus for canonical polynomial storage.

Exact integer and rational operations borrow sealed resource owners and return
new callee-owned resources.  Prime-field operations use fixed-width packed
coefficient buffers and transactional output.  No wrapper exposes a foreign
pointer or calls the dynamic host after native argument marshalling.
"""

from __future__ import annotations

from sagejs.ffi.flint import (
    FmpqPolynomial,
    FmpqValue,
    FmpzPolynomial,
    fmpq_polynomial_compose,
    fmpq_polynomial_discriminant,
    fmpq_polynomial_integral,
    fmpq_polynomial_resultant,
    fmpq_polynomial_reverse,
    fmpq_polynomial_shift_left,
    fmpq_polynomial_shift_right,
    fmpq_polynomial_truncate,
    fmpz_polynomial_compose,
    fmpz_polynomial_discriminant,
    fmpz_polynomial_integral,
    fmpz_polynomial_resultant,
    fmpz_polynomial_reverse,
    fmpz_polynomial_shift_left,
    fmpz_polynomial_shift_right,
    fmpz_polynomial_truncate,
    nmod_poly_compose,
    nmod_poly_discriminant,
    nmod_poly_integral,
    nmod_poly_resultant,
    nmod_poly_reverse,
    nmod_poly_shift_left,
    nmod_poly_shift_right,
    nmod_poly_truncate,
)
from sagejs.native import UInt64Buffer, native, uint64


@native
def flint_integer_polynomial_compose(
    outer: FmpzPolynomial,
    inner: FmpzPolynomial,
) -> FmpzPolynomial:
    return fmpz_polynomial_compose(outer, inner)


@native
def flint_integer_polynomial_reverse(
    source: FmpzPolynomial,
    length: uint64,
) -> FmpzPolynomial:
    return fmpz_polynomial_reverse(source, length)


@native
def flint_integer_polynomial_shift_left(
    source: FmpzPolynomial,
    amount: uint64,
) -> FmpzPolynomial:
    return fmpz_polynomial_shift_left(source, amount)


@native
def flint_integer_polynomial_shift_right(
    source: FmpzPolynomial,
    amount: uint64,
) -> FmpzPolynomial:
    return fmpz_polynomial_shift_right(source, amount)


@native
def flint_integer_polynomial_truncate(
    source: FmpzPolynomial,
    stop: uint64,
) -> FmpzPolynomial:
    return fmpz_polynomial_truncate(source, stop)


@native
def flint_integer_polynomial_integral(
    source: FmpzPolynomial,
) -> FmpqPolynomial:
    return fmpz_polynomial_integral(source)


@native
def flint_integer_polynomial_resultant(
    left: FmpzPolynomial,
    right: FmpzPolynomial,
) -> int:
    return fmpz_polynomial_resultant(left, right)


@native
def flint_integer_polynomial_discriminant(source: FmpzPolynomial) -> int:
    return fmpz_polynomial_discriminant(source)


@native
def flint_rational_polynomial_compose(
    outer: FmpqPolynomial,
    inner: FmpqPolynomial,
) -> FmpqPolynomial:
    return fmpq_polynomial_compose(outer, inner)


@native
def flint_rational_polynomial_reverse(
    source: FmpqPolynomial,
    length: uint64,
) -> FmpqPolynomial:
    return fmpq_polynomial_reverse(source, length)


@native
def flint_rational_polynomial_shift_left(
    source: FmpqPolynomial,
    amount: uint64,
) -> FmpqPolynomial:
    return fmpq_polynomial_shift_left(source, amount)


@native
def flint_rational_polynomial_shift_right(
    source: FmpqPolynomial,
    amount: uint64,
) -> FmpqPolynomial:
    return fmpq_polynomial_shift_right(source, amount)


@native
def flint_rational_polynomial_truncate(
    source: FmpqPolynomial,
    stop: uint64,
) -> FmpqPolynomial:
    return fmpq_polynomial_truncate(source, stop)


@native
def flint_rational_polynomial_integral(
    source: FmpqPolynomial,
) -> FmpqPolynomial:
    return fmpq_polynomial_integral(source)


@native
def flint_rational_polynomial_resultant(
    left: FmpqPolynomial,
    right: FmpqPolynomial,
) -> FmpqValue:
    return fmpq_polynomial_resultant(left, right)


@native
def flint_rational_polynomial_discriminant(
    source: FmpqPolynomial,
) -> FmpqValue:
    return fmpq_polynomial_discriminant(source)


@native
def flint_prime_polynomial_compose(
    output: UInt64Buffer,
    outer: UInt64Buffer,
    inner: UInt64Buffer,
    output_length: uint64,
    outer_length: uint64,
    inner_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_compose(
        output,
        outer,
        inner,
        output_length,
        outer_length,
        inner_length,
        modulus,
    )


@native
def flint_prime_polynomial_reverse(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    reverse_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_reverse(
        output,
        source,
        output_length,
        source_length,
        reverse_length,
        modulus,
    )


@native
def flint_prime_polynomial_shift_left(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    amount: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_shift_left(
        output,
        source,
        output_length,
        source_length,
        amount,
        modulus,
    )


@native
def flint_prime_polynomial_shift_right(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    amount: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_shift_right(
        output,
        source,
        output_length,
        source_length,
        amount,
        modulus,
    )


@native
def flint_prime_polynomial_truncate(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    stop: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_truncate(
        output,
        source,
        output_length,
        source_length,
        stop,
        modulus,
    )


@native
def flint_prime_polynomial_integral(
    output: UInt64Buffer,
    source: UInt64Buffer,
    output_length: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_integral(
        output,
        source,
        output_length,
        source_length,
        modulus,
    )


@native
def flint_prime_polynomial_resultant(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    one: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_resultant(
        output,
        left,
        right,
        one,
        left_length,
        right_length,
        modulus,
    )


@native
def flint_prime_polynomial_discriminant(
    output: UInt64Buffer,
    source: UInt64Buffer,
    one: uint64,
    source_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_discriminant(output, source, one, source_length, modulus)
