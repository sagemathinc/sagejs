r"""Mestre eigenpackets and exact modular $q$-expansions.

For a mass-orthogonal simultaneous Brandt eigenvector, Mestre's identity
recovers the corresponding weight-two cusp form modulo the characteristic of
the supersingular module. The implementation works directly with truncated
power-series coefficient lists, so no Laurent-series cancellation or formatted
finite-field representation is trusted.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

from .modular_polynomial import j_invariant_unit_series


def _global(name: str) -> Any:
    return runtime.reflect.get(runtime.global_object, name)


def _machine_integer(value: Any, label: str) -> int:
    normalized = runtime.normalize_integer(value)
    if runtime.jstype(normalized) != "number" or not runtime.number.isSafeInteger(
        normalized
    ):
        raise TypeError(label + " must be an exact machine integer")
    return runtime.number(normalized)


def _series_inverse(source: list[Any], precision: int, field: Any) -> list[Any]:
    if len(source) == 0 or source[0] != field(1):
        raise ValueError("power-series inversion requires constant coefficient one")
    answer = [field(0) for _index in range(precision)]
    answer[0] = field(1)
    for index in range(1, precision):
        total = field(0)
        stop = min(index, len(source) - 1)
        for source_index in range(1, stop + 1):
            total += source[source_index] * answer[index - source_index]
        answer[index] = -total
    return answer


def _series_product(
    left: list[Any], right: list[Any], precision: int, field: Any
) -> list[Any]:
    answer = [field(0) for _index in range(precision)]
    for left_index, left_value in enumerate(left):
        if left_index >= precision:
            break
        if left_value == field(0):
            continue
        stop = min(len(right), precision - left_index)
        for right_index in range(stop):
            if right[right_index] != field(0):
                answer[left_index + right_index] += left_value * right[right_index]
    return answer


def _rational_to_field(value: Any, field: Any) -> Any:
    rational = sage.QQ(value)
    return field(rational.numerator()) / field(rational.denominator())


class MestreQExpansion:
    """An exact normalized $q$-expansion obtained from Mestre's identity."""

    def __init__(
        self,
        packet: SupersingularEigenpacket,
        coefficients: list[Any],
        relation_denominator: Any,
    ) -> None:
        self._packet = packet
        self._coefficients = tuple(coefficients)
        self._relation_denominator = relation_denominator
        runtime.object.freeze(self)

    def base_field(self) -> Any:
        return self._packet.module().finite_field()

    def precision(self) -> int:
        return len(self._coefficients)

    def coefficient(self, index: Any) -> Any:
        position = _machine_integer(index, "q-expansion index")
        if position < 0 or position >= len(self._coefficients):
            return self.base_field()(0)
        return self._coefficients[position]

    def coefficients(self) -> tuple[Any, ...]:
        return self._coefficients

    def relation_denominator(self) -> Any:
        return self._relation_denominator

    def polynomial(self, variable: str = "q") -> Any:
        """Return the exact truncated polynomial, without the $O(q^n)$ tag."""
        ring = _global("PolynomialRing")(self.base_field(), variable)
        return ring(list(self._coefficients))

    def q_expansion(self) -> MestreQExpansion:
        return self

    def __getitem__(self, index: Any) -> Any:
        return self.coefficient(index)

    def __repr__(self) -> str:
        polynomial = repr(self.polynomial())
        bigoh = "O(q^" + str(len(self._coefficients)) + ")"
        return polynomial + " + " + bigoh if polynomial != "0" else bigoh

    __str__ = __repr__
    toString = __repr__


class SupersingularEigenpacket:
    """A proved rational simultaneous cuspidal Brandt eigenvector."""

    def __init__(
        self,
        module: Any,
        vector: list[Any],
        eigenvalues: list[tuple[int, Any]],
    ) -> None:
        self._module = module
        self._vector = tuple(sage.ZZ(value) for value in vector)
        self._eigenvalues = tuple(
            (index, sage.ZZ(value)) for index, value in eigenvalues
        )
        if not module.is_cuspidal(self._vector):
            raise ArithmeticError("a supersingular eigenpacket is not cuspidal")
        runtime.object.freeze(self)

    def module(self) -> Any:
        return self._module

    def vector(self) -> Any:
        return _global("vector")(sage.ZZ, list(self._vector))

    def eigenvalues(self) -> tuple[tuple[int, Any], ...]:
        return self._eigenvalues

    def eigenvalue(self, index: Any) -> Any:
        ell = _machine_integer(index, "Hecke index")
        for prime, value in self._eigenvalues:
            if prime == ell:
                return value
        raise KeyError(ell)

    def q_expansion(
        self,
        precision: Any = 20,
        *,
        max_series_terms: Any = 10000,
    ) -> MestreQExpansion:
        bound = _machine_integer(precision, "q-expansion precision")
        limit = _machine_integer(max_series_terms, "q-expansion term limit")
        if bound < 2:
            raise ValueError("Mestre q-expansion precision must be at least 2")
        if limit < 2 or bound > limit:
            raise MemoryError(
                "Mestre q-expansion precision "
                + str(bound)
                + " exceeds the explicit term limit "
                + str(limit)
            )
        module = self._module
        field = module.finite_field()
        points = module.supersingular_points()[0]
        masses = module.mass_weights()
        if len(points) != len(self._vector) or len(masses) != len(self._vector):
            raise ArithmeticError("Mestre eigenpacket data have inconsistent lengths")

        weighted = []
        weighted_sum = field(0)
        relation_denominator = field(0)
        for index, value in enumerate(self._vector):
            coefficient = field(value) * _rational_to_field(masses[index], field)
            weighted.append(coefficient)
            weighted_sum += coefficient
            relation_denominator += coefficient * points[index]
        if weighted_sum != field(0):
            raise ArithmeticError(
                "the mass-weighted eigenvector is not an ordinary cusp relation"
            )
        if relation_denominator == field(0):
            raise ArithmeticError("Mestre's normalization denominator vanishes")

        integral_j = j_invariant_unit_series(bound - 1)
        unit_j = [field(value) for value in integral_j]
        rational_sum = [field(0) for _index in range(bound)]
        for point, coefficient in zip(points, weighted, strict=True):
            denominator = list(unit_j[:bound])
            denominator[1] -= point
            inverse = _series_inverse(denominator, bound, field)
            for index in range(bound):
                rational_sum[index] += coefficient * inverse[index]

        derivative_factor = [field(index - 1) * unit_j[index] for index in range(bound)]
        raw = _series_product(derivative_factor, rational_sum, bound, field)
        if raw[0] != field(0):
            raise ArithmeticError("Mestre's expression has a noncuspidal constant term")
        if raw[1] != -relation_denominator:
            raise ArithmeticError("Mestre's leading coefficient failed exact replay")
        inverse_leading = field(1) / raw[1]
        coefficients = [value * inverse_leading for value in raw]
        if coefficients[0] != field(0) or coefficients[1] != field(1):
            raise ArithmeticError("Mestre q-expansion failed normalization")
        for ell, eigenvalue in self._eigenvalues:
            if ell < bound and ell != module.prime():
                if coefficients[ell] != field(eigenvalue):
                    raise ArithmeticError(
                        "Mestre coefficient disagrees with the T_"
                        + str(ell)
                        + " eigenvalue"
                    )
        return MestreQExpansion(self, coefficients, relation_denominator)

    def __repr__(self) -> str:
        return (
            "Rational supersingular eigenpacket at level "
            + str(self._module.prime())
            + " with Hecke data "
            + repr(self._eigenvalues)
        )

    __str__ = __repr__
    toString = __repr__


__all__ = ["MestreQExpansion", "SupersingularEigenpacket"]
