# Canonical quotients of exact multivariate polynomial rings.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _resolve_polynomial_proof(value: Any) -> bool:
    proof_module = __import__(
        "sagejs._baselib.proof", fromlist=["resolve_polynomial_proof"]
    )
    return bool(proof_module.resolve_polynomial_proof(value))


@runtime.callable_instance_class
class PolynomialQuotientElement(sage.Element):
    """An element stored as the canonical Gröbner normal form of a lift."""

    def __init__(self, parent: PolynomialQuotientRing, representative: Any) -> None:
        self._parent = parent
        self._representative = parent._reduce(representative)
        runtime.object.freeze(self)

    def lift(self) -> Any:
        """Return the canonical polynomial representative."""
        return self._representative

    def _coerce(self, other: Any) -> PolynomialQuotientElement:
        return self._parent(other)

    def _add_(self, other: PolynomialQuotientElement) -> PolynomialQuotientElement:
        return self._parent(self._representative + other._representative)

    def _sub_(self, other: PolynomialQuotientElement) -> PolynomialQuotientElement:
        return self._parent(self._representative - other._representative)

    def _mul_(self, other: PolynomialQuotientElement) -> PolynomialQuotientElement:
        return self._parent(self._representative * other._representative)

    def __add__(self, other: Any) -> PolynomialQuotientElement:
        other = self._coerce(other)
        return self._add_(other)

    def __radd__(self, other: Any) -> PolynomialQuotientElement:
        return self.__add__(other)

    def __sub__(self, other: Any) -> PolynomialQuotientElement:
        other = self._coerce(other)
        return self._sub_(other)

    def __rsub__(self, other: Any) -> PolynomialQuotientElement:
        return self._parent(other).__sub__(self)

    def __neg__(self) -> PolynomialQuotientElement:
        return self._parent(-self._representative)

    def __mul__(self, other: Any) -> PolynomialQuotientElement:
        other = self._coerce(other)
        return self._mul_(other)

    def __rmul__(self, other: Any) -> PolynomialQuotientElement:
        return self.__mul__(other)

    def __pow__(self, exponent: int) -> PolynomialQuotientElement:
        if not runtime.is_exact_integer(exponent):
            raise TypeError("quotient-ring exponent must be an integer")
        exponent = int(exponent)
        if exponent < 0:
            raise ValueError("negative quotient-ring exponent is not supported")
        answer = self._parent(1)
        base = self
        while exponent:
            if exponent % 2:
                answer = answer._mul_(base)
            exponent //= 2
            if exponent:
                base = base._mul_(base)
        return answer

    def __eq__(self, other: object) -> bool:
        try:
            other_value = self._parent(other)
        except Exception:
            return False
        return self._representative == other_value._representative

    def is_zero(self) -> bool:
        return self._representative == self._parent.cover_ring()(0)

    def __repr__(self) -> str:
        return repr(self._representative)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class PolynomialQuotientRing(sage.Parent):
    """A quotient `K[x_1,...,x_n]/I` with exact canonical representatives."""

    def __init__(
        self,
        cover_ring: Any,
        defining_ideal: Any,
        algorithm: str = "auto",
        proof: Any = None,
    ) -> None:
        if defining_ideal.ring() is not cover_ring:
            raise TypeError("quotient ideal belongs to a different polynomial ring")
        self._cover_ring = cover_ring
        self._ideal = defining_ideal
        self._algorithm = algorithm
        self._proof = _resolve_polynomial_proof(proof)
        self._kind = "POLYNOMIAL_QUOTIENT"
        self._construction = {
            "kind": "polynomial_quotient",
            "cover": cover_ring,
            "ideal": defining_ideal,
            "algorithm": algorithm,
            "proof": self._proof,
        }

        # Quotient elements coerce operands explicitly in their arithmetic.
        # Registering every quotient globally would create competing common
        # parents for unrelated polynomial/scalar operations once two
        # quotients of the same cover ring exist.

    def cover_ring(self) -> Any:
        return self._cover_ring

    ambient_ring = cover_ring

    def base_ring(self) -> Any:
        return self._cover_ring.base_ring()

    def defining_ideal(self) -> Any:
        return self._ideal

    ideal = defining_ideal

    def _reduce(self, value: Any) -> Any:
        return self._ideal.normal_form(
            self._cover_ring(value),
            algorithm=self._algorithm,
            proof=self._proof,
        )

    def __call__(self, value: Any = 0) -> PolynomialQuotientElement:
        if isinstance(value, PolynomialQuotientElement):
            if value._parent is self:
                return value
            raise TypeError("quotient elements have different parents")
        return PolynomialQuotientElement(self, self._cover_ring(value))

    def gen(self, index: int = 0) -> PolynomialQuotientElement:
        return self(self._cover_ring.gen(index))

    def gens(self) -> Any:
        return runtime.math_tuple(
            [self(generator) for generator in self._cover_ring.gens()]
        )

    def ngens(self) -> int:
        return self._cover_ring.ngens()

    def lift(self, value: Any) -> Any:
        return self(value).lift()

    def zero(self) -> PolynomialQuotientElement:
        return self(0)

    def one(self) -> PolynomialQuotientElement:
        return self(1)

    def is_zero(self) -> bool:
        return self._ideal.is_one(algorithm=self._algorithm, proof=self._proof)

    def dimension(self) -> int:
        return self._ideal.dimension(algorithm=self._algorithm, proof=self._proof)

    def vector_space_dimension(self) -> Any:
        return self._ideal.vector_space_dimension(
            algorithm=self._algorithm, proof=self._proof
        )

    def basis(self) -> Any:
        """Return quotient elements represented by standard monomials."""
        return runtime.math_tuple(
            [
                self(value)
                for value in self._ideal.normal_basis(
                    algorithm=self._algorithm, proof=self._proof
                )
            ]
        )

    normal_basis = basis

    def coordinates(self, value: Any) -> Any:
        return self._ideal.quotient_coordinates(
            self.lift(value), algorithm=self._algorithm, proof=self._proof
        )

    coordinate_vector = coordinates

    def multiplication_matrix(self, value: Any) -> Any:
        return self._ideal.multiplication_matrix(
            self.lift(value), algorithm=self._algorithm, proof=self._proof
        )

    def minimal_polynomial(self, value: Any, variable: str = "t") -> Any:
        """Return the minimal polynomial of multiplication by `value`."""
        return self.multiplication_matrix(value).minpoly(variable)

    minpoly = minimal_polynomial

    def fglm(self, order: str = "lex") -> Any:
        return self._ideal.fglm(
            order=order, algorithm=self._algorithm, proof=self._proof
        )

    def __repr__(self) -> str:
        return "Quotient of " + str(self._cover_ring) + " by " + repr(self._ideal)

    __str__ = __repr__
    toString = __repr__
