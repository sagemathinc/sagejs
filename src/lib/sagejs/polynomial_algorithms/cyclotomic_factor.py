"""Exact portable cyclotomic factorization by Trager's norm reduction.

Squarefree parts are shifted until their field norm is squarefree. Rational
irreducible norm factors then recover the irreducible factors over the declared
cyclotomic field by gcd. No floating-point root grouping or guessed precision
is used, and there is no arbitrary finite separating-shift cutoff.
"""

from typing import Any

import sagejs.runtime as runtime
from sagejs.polynomial_algorithms.extension_field_roots import (
    _monic_gcd,
    _quo_rem,
    _trim,
)


def _multiply(a: list[Any], b: list[Any], zero: Any) -> list[Any]:
    if not a or not b:
        return []
    result = [zero for _ in range(len(a) + len(b) - 1)]
    for i, x in enumerate(a):
        if x != zero:
            for j, y in enumerate(b):
                if y != zero:
                    result[i + j] += x * y
    return _trim(result)


def _shift(a: list[Any], c: Any, zero: Any) -> list[Any]:
    """Return the coefficients of `a(x+c)` by Horner composition."""
    result: list[Any] = []
    for coefficient in reversed(a):
        result = _multiply(result, [c, c**0], zero)
        if result:
            result[0] += coefficient
        else:
            result = [coefficient]
        _trim(result)
    return result


def _divide(a: list[Any], b: list[Any], zero: Any) -> list[Any]:
    quotient, remainder = _quo_rem(a, b, zero)
    if remainder:
        raise ArithmeticError("cyclotomic factor recovery division was not exact")
    return quotient


def _squarefree(a: list[Any], zero: Any) -> list[tuple[list[Any], int]]:
    derivative = [i * a[i] for i in range(1, len(a))]
    repeated = _monic_gcd(a, derivative, zero)
    remaining = _divide(a, repeated, zero)
    answer = []
    multiplicity = 1
    while len(remaining) > 1:
        overlap = _monic_gcd(remaining, repeated, zero)
        factor = _divide(remaining, overlap, zero)
        if len(factor) > 1:
            answer.append((factor, multiplicity))
        remaining = overlap
        repeated = _divide(repeated, overlap, zero)
        multiplicity += 1
    if len(repeated) != 1:
        raise ArithmeticError("incomplete characteristic-zero squarefree split")
    return answer


def _coprime(a: int, b: int) -> bool:
    while b:
        a, b = b, a % b
    return a == 1


def _conjugates(a: list[Any], field: Any) -> list[tuple[list[Any], Any]]:
    coordinates = [field._serialization_coefficients(c) for c in a]
    order = int(field._order)
    zero = field(0)
    generator = field.gen()
    result = []
    for exponent in range(1, order + 1):
        if not _coprime(exponent, order):
            continue
        image = generator**exponent
        conjugate = []
        for row in coordinates:
            value = zero
            for c in reversed(row):
                value = value * image + field(c)
            conjugate.append(value)
        result.append((conjugate, image))
    return result


def _irreducible_parts(a: list[Any], field: Any, rational_ring: Any) -> list[list[Any]]:
    if len(a) == 2:
        return [a]
    zero, one = field(0), field(1)
    conjugates = _conjugates(a, field)
    attempt = 0
    while True:
        shift = 0 if attempt == 0 else (attempt + 1) // 2 * (1 if attempt % 2 else -1)
        norm = [one]
        for conjugate, generator in conjugates:
            norm = _multiply(norm, _shift(conjugate, -shift * generator, zero), zero)
        rational_coefficients = []
        for coefficient in norm:
            coordinates = field._serialization_coefficients(coefficient)
            if any(c != 0 for c in coordinates[1:]):
                raise ArithmeticError("cyclotomic norm is not rational")
            rational_coefficients.append(coordinates[0] if coordinates else 0)
        rational_norm = rational_ring(rational_coefficients)
        if rational_norm.degree() != (len(a) - 1) * int(field.degree()):
            raise ArithmeticError("cyclotomic norm has incorrect degree")
        if rational_norm.gcd(rational_norm.derivative()).degree() == 0:
            break
        attempt += 1

    remaining = a
    answer = []
    for factor, exponent in rational_norm.factor():
        if exponent != 1:
            raise ArithmeticError("separating norm was not squarefree")
        shifted = _shift([field(c) for c in factor.list()], shift * field.gen(), zero)
        recovered = _monic_gcd(remaining, shifted, zero)
        if len(recovered) > 1:
            answer.append(recovered)
            remaining = _divide(remaining, recovered, zero)
    if len(remaining) != 1:
        raise ArithmeticError("rational norm factors did not exhaust the polynomial")
    return answer


def factor_cyclotomic(polynomial: Any) -> Any:
    """Return a complete exact factorization over the polynomial's parent field.

    Irreducibility follows from the squarefree separating norm and rational
    irreducibility, not just from multiplying the factors back together.
    Zero is rejected; constants retain their exact unit, including denominators.
    """
    parent = polynomial.parent()
    field = parent.base_ring()
    if parent.ngens() != 1 or field._kind != "CyclotomicField":
        raise TypeError("expected a univariate polynomial over a cyclotomic field")
    a = _trim(list(polynomial.coefficients()))
    if not a:
        raise ArithmeticError("factorization of 0 is not defined")
    unit = a[-1]
    a = [c / unit for c in a]
    zero = field(0)
    public = runtime.global_object
    rational_ring = runtime.reflect.get(public, "PolynomialRing")(
        runtime.reflect.get(public, "QQ"), "t"
    )
    x = parent.gen()
    factors = []
    for squarefree, multiplicity in _squarefree(a, zero):
        for coefficients in _irreducible_parts(squarefree, field, rational_ring):
            result = parent(0)
            for coefficient in reversed(coefficients):
                result = result * x + coefficient
            factors.append((result, multiplicity))
    answer = runtime.reflect.get(public, "Factorization")(
        factors, unit, False, False, False
    )
    if parent(answer.value()) != polynomial:
        raise ArithmeticError("cyclotomic factorization failed exact reconstruction")
    return answer
