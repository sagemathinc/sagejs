"""Exact standard-graded Hilbert data from leading monomial ideals."""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_MAX_LCM_STATES = 200000


def _factorial(value: int) -> int:
    answer = 1
    for factor in range(2, value + 1):
        answer *= factor
    return answer


def _divides(left: Any, right: Any) -> bool:
    return all(left[index] <= right[index] for index in range(len(left)))


def _minimal_generators(values: list[Any]) -> list[Any]:
    unique = []
    for value in values:
        value = tuple(value)
        if value not in unique:
            unique.append(value)
    answer = []
    for index, value in enumerate(unique):
        if any(
            other != index and _divides(candidate, value)
            for other, candidate in enumerate(unique)
        ):
            continue
        answer.append(value)
    return answer


def _is_homogeneous(ideal: Any) -> bool:
    return all(generator.is_homogeneous() for generator in ideal.gens())


def _taylor_numerator(generators: list[Any], variables: int) -> list[int]:
    """Return the exact Taylor-resolution numerator by collapsed LCM states."""
    zero = tuple(0 for _index in range(variables))
    states = {zero: 1}
    for generator in generators:
        additions: dict[Any, int] = {}
        for exponents, coefficient in states.items():
            lcm = tuple(
                max(exponents[index], generator[index]) for index in range(variables)
            )
            additions[lcm] = additions.get(lcm, 0) - coefficient
        for exponents, coefficient in additions.items():
            states[exponents] = states.get(exponents, 0) + coefficient
            if states[exponents] == 0:
                del states[exponents]
        if len(states) > _MAX_LCM_STATES:
            raise OverflowError("Hilbert numerator exceeds the 200000 LCM-state limit")
    by_degree: dict[int, int] = {}
    for exponents, coefficient in states.items():
        degree = sum(exponents)
        by_degree[degree] = by_degree.get(degree, 0) + coefficient
    if len(by_degree) == 0:
        return []
    coefficients = [0] * (max(by_degree.keys()) + 1)
    for degree, coefficient in by_degree.items():
        coefficients[degree] = coefficient
    while len(coefficients) and coefficients[-1] == 0:
        coefficients.pop()
    return coefficients


def _divide_one_minus_t(coefficients: list[int]) -> list[int]:
    if len(coefficients) <= 1:
        raise ArithmeticError("Hilbert numerator cancellation is inconsistent")
    quotient = [coefficients[0]]
    for index in range(1, len(coefficients) - 1):
        quotient.append(coefficients[index] + quotient[-1])
    if coefficients[-1] != -quotient[-1]:
        raise ArithmeticError("Hilbert numerator is not divisible by 1-t")
    while len(quotient) and quotient[-1] == 0:
        quotient.pop()
    return quotient


def data(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> dict[str, Any]:
    """Return normalized Hilbert numerator, denominator exponent, and degree."""
    if not _is_homogeneous(ideal):
        raise ValueError(
            "Hilbert data requires a homogeneous ideal in a standard-graded ring"
        )
    ring = ideal.ring()
    leading = _minimal_generators(ideal._leading_exponents(algorithm, proof))
    numerator = _taylor_numerator(leading, ring.ngens())
    if len(numerator) == 0:
        return {
            "numerator": runtime.math_tuple([]),
            "dimension": -1,
            "degree": 0,
            "regularity_threshold": 0,
        }
    dimension = ring.ngens()
    while dimension > 0 and sum(numerator) == 0:
        numerator = _divide_one_minus_t(numerator)
        dimension -= 1
    return {
        "numerator": runtime.math_tuple(numerator),
        "dimension": dimension,
        "degree": sum(numerator),
        "regularity_threshold": max(0, len(numerator) - dimension),
    }


def hilbert_series(
    ideal: Any,
    variable: str = "t",
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    information = data(ideal, algorithm, proof)
    ring = sage.PolynomialRing(sage.QQ, variable)
    if information["dimension"] == -1:
        return ring.fraction_field()(0)
    t = ring.gen()
    numerator = ring(list(information["numerator"]))
    denominator = (ring(1) - t) ** information["dimension"]
    return ring.fraction_field()(numerator, denominator)


def h_vector(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    return data(ideal, algorithm, proof)["numerator"]


def hilbert_polynomial(
    ideal: Any,
    variable: str = "t",
    algorithm: str = "auto",
    proof: Any = None,
) -> Any:
    information = data(ideal, algorithm, proof)
    polynomial_ring = sage.PolynomialRing(sage.QQ, variable)
    dimension = information["dimension"]
    if dimension <= 0:
        return polynomial_ring(0)
    t = polynomial_ring.gen()
    result = polynomial_ring(0)
    factorial = _factorial(dimension - 1)
    for shift, coefficient in enumerate(information["numerator"]):
        term = polynomial_ring(sage.QQ(coefficient) / sage.QQ(factorial))
        for index in range(dimension - 1):
            term *= t - shift + dimension - 1 - index
        result += term
    return result


def degree(
    ideal: Any,
    algorithm: str = "auto",
    proof: Any = None,
) -> int:
    return int(data(ideal, algorithm, proof)["degree"])
