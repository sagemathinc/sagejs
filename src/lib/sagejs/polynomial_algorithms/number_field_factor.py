"""Bounded Trager norm factorization using the public exact K[x] substrate.

Independent implementation of Trager (1976), Theorem 2.2. A squarefree norm
and complete irreducible rational factorization justify the recovered gcds.
The norm is a fraction-free determinant of multiplication in the power basis.
No floating-point roots or private univariate arithmetic representation is used.
"""

from __future__ import annotations

from time import monotonic
from typing import Any

import sagejs as sage

MAX_NORM_DEGREE = 64
MAX_FIELD_DEGREE = 16
MAX_SHIFTS = 32
MAX_SECONDS = 120
MAX_RATIONAL_BITS = 65536


def _check(started: float) -> None:
    if monotonic() - started > MAX_SECONDS:
        raise RuntimeError("number-field factorization time limit exceeded")


def _compose(value: Any, argument: Any) -> Any:
    answer = argument.parent()(0)
    for coefficient in reversed(value.list()):
        answer = answer * argument + coefficient
    return answer


def _exact_divide(left: Any, right: Any) -> Any:
    q, r = left.quo_rem(right)
    if r != 0:
        raise ArithmeticError("norm determinant division was not exact")
    for coefficient in q.list():
        if (
            max(
                int(coefficient.numerator()).bit_length(),
                int(coefficient.denominator()).bit_length(),
            )
            > MAX_RATIONAL_BITS
        ):
            raise ValueError("norm intermediate coefficient exceeds 65536 bits")
    return q


def norm(value: Any, started: Any = None) -> Any:
    """Compute det(multiplication by value) over QQ[x], exactly."""
    if started is None:
        started = monotonic()
    parent = value.parent()
    field = parent.base_ring()
    degree = int(field.degree())
    if degree > MAX_FIELD_DEGREE or degree * max(0, value.degree()) > MAX_NORM_DEGREE:
        raise ValueError(
            "number-field norm requires field degree <= 16 and norm degree <= 64"
        )
    rational = sage.PolynomialRing(sage.QQ, parent.variable_name())
    coefficients = value.list()
    powers = [field.gen() ** j for j in range(degree)]
    columns = []
    for power in powers:
        _check(started)
        coordinates = [(coefficient * power).list() for coefficient in coefficients]
        columns.append(
            [rational([row[i] for row in coordinates]) for i in range(degree)]
        )
    matrix = [[columns[j][i] for j in range(degree)] for i in range(degree)]
    previous, sign = rational(1), 1
    for k in range(degree - 1):
        _check(started)
        pivot = next((i for i in range(k, degree) if matrix[i][k] != 0), None)
        if pivot is None:
            return rational(0)
        if pivot != k:
            matrix[k], matrix[pivot] = matrix[pivot], matrix[k]
            sign = -sign
        diagonal = matrix[k][k]
        for i in range(k + 1, degree):
            for j in range(k + 1, degree):
                matrix[i][j] = _exact_divide(
                    matrix[i][j] * diagonal - matrix[i][k] * matrix[k][j], previous
                )
            matrix[i][k] = rational(0)
        previous = diagonal
    return sign * matrix[-1][-1]


def factor_with_evidence(value: Any) -> Any:
    """Return exact factors and the separating norm witnesses.

    A bounded search that does not find a squarefree norm fails explicitly;
    it never returns an unproved residual factor.
    """
    parent = value.parent()
    field = parent.base_ring()
    if parent.ngens() != 1 or field._kind != "NumberField":
        raise TypeError("Trager factorization requires simple number-field K[x]")
    if value == 0:
        raise ArithmeticError("factorization of zero is undefined")
    if (
        field.degree() > MAX_FIELD_DEGREE
        or field.degree() * value.degree() > MAX_NORM_DEGREE
    ):
        raise ValueError("number-field factorization norm-degree limit exceeded")
    started = monotonic()
    squarefree = value.squarefree_decomposition()
    factors, evidence = [], []
    x, a = parent.gen(), field.gen()
    for part, multiplicity in squarefree:
        for shift in range(MAX_SHIFTS):
            _check(started)
            shifted = _compose(part, x - shift * a)
            norm_value = norm(shifted, started)
            if norm_value.degree() != field.degree() * part.degree():
                raise ArithmeticError("norm degree mismatch")
            if norm_value.gcd(norm_value.derivative()).degree() == 0:
                break
        else:
            raise RuntimeError("no squarefree norm within 32 deterministic shifts")
        rational_factors = norm_value.factor()
        if rational_factors.value() != norm_value:
            raise ArithmeticError("rational norm factorization is incomplete")
        recovered, witnesses = parent(1), []
        for rational_factor, exponent in rational_factors:
            _check(started)
            if exponent != 1 or not rational_factor.is_irreducible():
                raise ArithmeticError(
                    "norm factor must be squarefree and irreducible over QQ"
                )
            lifted = parent(rational_factor.list())
            piece = shifted.gcd(lifted)
            if piece.degree() <= 0:
                raise ArithmeticError("norm factor did not recover a nonconstant gcd")
            result = _compose(piece, x + shift * a)
            recovered *= result
            factors.append((result, multiplicity))
            witnesses.append(rational_factor)
        if recovered != part:
            raise ArithmeticError(
                "recovered factors do not exhaust the squarefree part"
            )
        evidence.append(
            {"shift": shift, "norm": norm_value, "rational_factors": tuple(witnesses)}
        )
    answer: Any = sage.Factorization(factors, squarefree.unit(), False, False, False)
    if answer.value() != value:
        raise ArithmeticError("number-field factorization recomposition failed")
    return answer, tuple(evidence)


def factor(value: Any) -> Any:
    return factor_with_evidence(value)[0]


def is_irreducible(value: Any) -> bool:
    if value.degree() < 1:
        return False
    records = list(factor(value))
    return len(records) == 1 and records[0][1] == 1
