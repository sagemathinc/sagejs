# Small number fields needed by the Sage-compatible mathematical layer.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


@runtime.lightweight_math_class
class GaussianInteger(sage.Element):
    """An element ``a + b*i`` of the Gaussian integers."""

    def __init__(
        self,
        parent: QuadraticField_class,
        real: Any,
        imag: Any,
    ) -> None:
        self._parent = parent
        self._real = runtime.normalize_integer(
            runtime.integer_bigint(real))
        self._imag = runtime.normalize_integer(
            runtime.integer_bigint(imag))
        runtime.object.freeze(self)

    def __getitem__(self, index: int) -> Any:
        if index == 0:
            return self._real
        if index == 1:
            return self._imag
        raise IndexError('Gaussian integer index out of range')

    def __neg__(self) -> GaussianInteger:
        return GaussianInteger(
            self._parent, -self._real, -self._imag)

    def _mul_(self, other: GaussianInteger) -> GaussianInteger:
        return GaussianInteger(
            self._parent,
            self._real * other._real - self._imag * other._imag,
            self._real * other._imag + self._imag * other._real,
        )

    def _eq_(self, other: GaussianInteger) -> bool:
        return (
            self._real == other._real
            and self._imag == other._imag
        )

    def __mul__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp(
            'mul', self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __repr__(self) -> str:
        if self._imag == 0:
            return str(self._real)
        if self._real == 0:
            return str(self._imag) + '*i'
        sign = '+' if self._imag > 0 else '-'
        return (
            str(self._real) + ' ' + sign + ' ' +
            str(abs(self._imag)) + '*i'
        )

    __str__ = __repr__
    toString = __repr__


class GaussianPrimeIdeal:
    """The principal prime ideal represented by one Gaussian prime."""

    def __init__(self, generator: GaussianInteger) -> None:
        self._generator = generator

    def gens_reduced(self) -> tuple[GaussianInteger]:
        return runtime.math_tuple([self._generator])


@runtime.callable_instance_class
class QuadraticField_class(sage.Parent):
    """The Gaussian quadratic field used by the RH plotting corpus."""

    def __init__(self, discriminant: Any) -> None:
        if discriminant != -1:
            raise NotImplementedError(
                'only QuadraticField(-1) is implemented')
        self._name = 'Number Field in i with defining polynomial x^2 + 1'
        self._kind = 'QuadraticField'
        self._discriminant = -1
        self._generator = GaussianInteger(self, 0, 1)

    def __call__(
        self,
        real: Any = 0,
        imag: Any = 0,
    ) -> GaussianInteger:
        if isinstance(real, GaussianInteger):
            return real
        return GaussianInteger(self, real, imag)

    def gen(self) -> GaussianInteger:
        return self._generator

    def _first_ngens(self, count: int) -> list[GaussianInteger]:
        if count != 1:
            raise ValueError(
                'this quadratic field has exactly one generator')
        return [self.gen()]

    def primes_of_bounded_norm(
        self, bound: Any,
    ) -> list[GaussianPrimeIdeal]:
        limit = runtime.integer_bigint(bound)
        if limit <= 1:
            return []
        coordinate_bound = int(runtime.math.sqrt(runtime.number(limit)))
        generators = []

        # Inert rational primes p == 3 (mod 4) remain Gaussian primes and
        # have ideal norm p^2.
        candidate = runtime.bigint(3)
        while candidate * candidate <= limit:
            if (
                candidate % 4 == 3
                and runtime.flint_backend().isPrime(candidate)
            ):
                generators.append(
                    GaussianInteger(self, candidate, 0))
            candidate += 2

        # Split and ramified primes are represented by every first-quadrant
        # solution a^2+b^2=p.  Ordered pairs give the two conjugate ideals.
        for real in range(1, coordinate_bound + 1):
            for imag in range(1, coordinate_bound + 1):
                norm = real * real + imag * imag
                if norm > limit:
                    break
                if runtime.flint_backend().isPrime(
                    runtime.bigint(norm)
                ):
                    generators.append(
                        GaussianInteger(self, real, imag))
        return [
            GaussianPrimeIdeal(generator)
            for generator in generators
        ]


def QuadraticField(
    discriminant: Any,
    names: Any = None,
) -> QuadraticField_class:
    return QuadraticField_class(discriminant)


runtime.set_class_repr(
    GaussianInteger,
    "<class 'sage.rings.number_field.number_field_element."
    "NumberFieldElement_gaussian'>",
)
