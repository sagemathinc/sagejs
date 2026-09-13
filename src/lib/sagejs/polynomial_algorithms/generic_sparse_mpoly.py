"""Internal exact sparse storage; public polynomial parents remain unchanged.

Each arithmetic operation gets a fresh bounded workspace. Stored polynomials
do not retain a live deadline or mutable algorithm budget. All term ordering
and coefficient normalization use the same explicit v2 reference boundary.
"""

from __future__ import annotations

from typing import Any

from sagejs.polynomial_algorithms import groebner_contract as engine
from sagejs.polynomial_algorithms.generic_groebner import GenericGroebnerRing


class SparseContext:
    """A parent-owned internal representation, not a public polynomial ring."""

    def __init__(self, field: Any, variables: int, order: str) -> None:
        workspace = GenericGroebnerRing(variables, field, order)
        self.field = field
        self.variables = workspace.variables
        self.order = workspace.order

    def workspace(self) -> Any:
        return GenericGroebnerRing(self.variables, self.field, self.order)

    def polynomial(self, terms: Any) -> SparsePolynomial:
        return SparsePolynomial(
            self, engine.canonical_polynomial(terms, self.workspace())
        )

    def constant(self, value: Any) -> SparsePolynomial:
        return self.polynomial(((value, (0,) * self.variables),))

    def generator(self, index: int) -> SparsePolynomial:
        if isinstance(index, bool) or not isinstance(index, int):
            raise TypeError("polynomial generator index must be an integer")
        if index < 0 or index >= self.variables:
            raise IndexError("polynomial generator index is out of range")
        exponent = tuple(1 if i == index else 0 for i in range(self.variables))
        return self.polynomial(((self.field.one(), exponent),))


class SparsePolynomial:
    """Immutable canonical terms owned by one internal context.

    The constructor consumes already-normalized internal terms. Ingress must
    use `SparseContext.polynomial`; a mathematically equal foreign context is
    not an implicit embedding or permission to reuse another parent's value.
    """

    def __init__(self, context: SparseContext, terms: Any) -> None:
        self.context = context
        self._terms = tuple(terms)

    def terms(self) -> Any:
        return self._terms

    def equal(self, other: SparsePolynomial) -> bool:
        self._pair(other)
        return self._terms == other._terms

    def _pair(self, other: SparsePolynomial) -> Any:
        if not isinstance(other, SparsePolynomial) or self.context is not other.context:
            raise TypeError("sparse polynomial operands must have the same context")
        return self.context.workspace()

    def add(self, other: SparsePolynomial) -> SparsePolynomial:
        ring = self._pair(other)
        return SparsePolynomial(
            self.context, engine.polynomial_add(self._terms, other._terms, ring)
        )

    def subtract(self, other: SparsePolynomial) -> SparsePolynomial:
        ring = self._pair(other)
        return SparsePolynomial(
            self.context, engine.polynomial_subtract(self._terms, other._terms, ring)
        )

    def multiply(self, other: SparsePolynomial) -> SparsePolynomial:
        ring = self._pair(other)
        return SparsePolynomial(
            self.context, engine.polynomial_multiply(self._terms, other._terms, ring)
        )

    def negate(self) -> SparsePolynomial:
        return SparsePolynomial(
            self.context,
            engine.polynomial_negate(self._terms, self.context.workspace()),
        )

    def power(self, exponent: int) -> SparsePolynomial:
        if isinstance(exponent, bool) or not isinstance(exponent, int):
            raise TypeError("polynomial exponent must be an integer")
        ring = self.context.workspace()
        if exponent < 0 or exponent > ring.budget.max_exponent:
            raise ValueError(
                "polynomial exponent is outside the sparse resource envelope"
            )
        answer = engine.canonical_polynomial(
            ((self.context.field.one(), (0,) * self.context.variables),), ring
        )
        source = self._terms
        while exponent:
            if exponent % 2:
                answer = engine.polynomial_multiply(answer, source, ring)
            exponent //= 2
            if exponent:
                source = engine.polynomial_multiply(source, source, ring)
        return SparsePolynomial(self.context, answer)

    def divide(
        self, divisor: SparsePolynomial
    ) -> tuple[SparsePolynomial, SparsePolynomial]:
        ring = self._pair(divisor)
        if not divisor._terms:
            raise ZeroDivisionError("polynomial division by zero")
        quotients, remainder = engine.normal_form_with_quotients(
            self._terms, (divisor._terms,), ring
        )
        return (
            SparsePolynomial(self.context, quotients[0]),
            SparsePolynomial(self.context, remainder),
        )

    def degree(self, variable: Any = None) -> int:
        if variable is None:
            return max((sum(exponents) for _, exponents in self._terms), default=-1)
        self.context.generator(variable)  # validates the index
        return max((exponents[variable] for _, exponents in self._terms), default=-1)

    def derivative(self, variable: int) -> SparsePolynomial:
        self.context.generator(variable)
        field = self.context.field
        ring = self.context.workspace()
        terms = []
        for coefficient, exponents in self._terms:
            ring.budget.charge()
            degree = exponents[variable]
            if degree:
                powers = tuple(
                    exponent - 1 if i == variable else exponent
                    for i, exponent in enumerate(exponents)
                )
                terms.append(
                    (field.multiply(coefficient, field.coerce(degree)), powers)
                )
        return SparsePolynomial(self.context, engine.canonical_polynomial(terms, ring))

    def evaluate(self, coordinates: Any) -> Any:
        if len(coordinates) != self.context.variables:
            raise ValueError("incorrect number of polynomial evaluation coordinates")
        field = self.context.field
        values = tuple(field.coerce(value) for value in coordinates)
        ring = self.context.workspace()
        answer = field.zero()
        for coefficient, exponents in self._terms:
            term = coefficient
            for value, exponent in zip(values, exponents, strict=True):
                power = field.one()
                factor = value
                while exponent:
                    ring.budget.charge()
                    if exponent % 2:
                        power = field.multiply(power, factor)
                    exponent //= 2
                    if exponent:
                        factor = field.multiply(factor, factor)
                term = field.multiply(term, power)
            answer = field.add(answer, term)
        return answer
