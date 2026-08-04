# Sage-compatible exact rational elements.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

# Element and QQ come through the runtime namespace because this module defines
# Rational before the public ``sagejs`` compatibility package can be
# bootstrapped. The converged compiler lowers both names directly.


@runtime.bigint_fields('_numerator', '_denominator')
@runtime.lightweight_math_class
class Rational(runtime.element):
    """An immutable reduced element of the rational field."""

    def __init__(
        self, numerator: Any, denominator: Any = None,
    ) -> None:
        if isinstance(numerator, Rational) and denominator is None:
            self._numerator = numerator._numerator
            self._denominator = numerator._denominator
        else:
            if denominator is None:
                denominator = 1
            numerator = runtime.integer_bigint(numerator)
            denominator = runtime.integer_bigint(denominator)
            if denominator == runtime.bigint(0):
                raise ZeroDivisionError('rational division by zero')
            if denominator < 0:
                numerator = -numerator
                denominator = -denominator
            common = runtime.bigint_gcd(numerator, denominator)
            self._numerator = runtime.bigint_divexact(numerator, common)
            self._denominator = runtime.bigint_divexact(
                denominator, common)

        self._parent = runtime.qq
        runtime.object.freeze(self)

    @staticmethod
    def _from_reduced(numerator: Any, denominator: Any) -> Rational:
        """Construct from a trusted canonical numerator/denominator pair.

        Native FLINT boundaries already return a positive denominator and a
        coprime pair.  Avoiding a second enormous GCD is important when an
        elliptic-curve multiple has coordinates with thousands of digits.
        """
        numerator = runtime.integer_bigint(numerator)
        denominator = runtime.integer_bigint(denominator)
        if denominator <= 0:
            raise ValueError(
                'a reduced rational must have positive denominator')
        answer = runtime.object.create(
            runtime.reflect.get(Rational, 'prototype'))
        runtime.reflect.set(answer, '_numerator', numerator)
        runtime.reflect.set(answer, '_denominator', denominator)
        runtime.reflect.set(answer, '_parent', runtime.qq)
        runtime.object.freeze(answer)
        return answer

    def numerator(self) -> int:
        return runtime.normalize_integer(self._numerator)

    def denominator(self) -> int:
        return runtime.normalize_integer(self._denominator)

    def __float__(self) -> float:
        return float(self._numerator) / float(self._denominator)

    def n(
        self,
        prec: Any = None,
        digits: Any = None,
    ) -> float:
        del prec, digits
        return float(self)

    numerical_approx = n

    def _add_(self, other: Rational) -> Rational:
        left_numerator = self._numerator
        left_denominator = self._denominator
        right_numerator = other._numerator
        right_denominator = other._denominator
        common = runtime.bigint_gcd(
            left_denominator, right_denominator)
        left_quotient = runtime.bigint_divexact(
            left_denominator, common)
        right_quotient = runtime.bigint_divexact(
            right_denominator, common)
        return Rational(
            left_numerator * right_quotient
            + right_numerator * left_quotient,
            left_quotient * right_denominator,
        )

    def _sub_(self, other: Rational) -> Rational:
        left_numerator = self._numerator
        left_denominator = self._denominator
        right_numerator = other._numerator
        right_denominator = other._denominator
        common = runtime.bigint_gcd(
            left_denominator, right_denominator)
        left_quotient = runtime.bigint_divexact(
            left_denominator, common)
        right_quotient = runtime.bigint_divexact(
            right_denominator, common)
        return Rational(
            left_numerator * right_quotient
            - right_numerator * left_quotient,
            left_quotient * right_denominator,
        )

    def _mul_(self, other: Rational) -> Rational:
        left_common = runtime.bigint_gcd(
            self._numerator, other._denominator)
        right_common = runtime.bigint_gcd(
            other._numerator, self._denominator)
        return Rational(
            runtime.bigint_divexact(self._numerator, left_common)
            * runtime.bigint_divexact(other._numerator, right_common),
            runtime.bigint_divexact(self._denominator, right_common)
            * runtime.bigint_divexact(other._denominator, left_common),
        )

    def _truediv_(self, other: Rational) -> Rational:
        if other._numerator == runtime.bigint(0):
            raise ZeroDivisionError('rational division by zero')
        numerator_common = runtime.bigint_gcd(
            self._numerator, other._numerator)
        denominator_common = runtime.bigint_gcd(
            other._denominator, self._denominator)
        return Rational(
            runtime.bigint_divexact(self._numerator, numerator_common)
            * runtime.bigint_divexact(
                other._denominator, denominator_common),
            runtime.bigint_divexact(
                self._denominator, denominator_common)
            * runtime.bigint_divexact(
                other._numerator, numerator_common),
        )

    def _eq_(self, other: Rational) -> bool:
        return (
            self._numerator == other._numerator
            and self._denominator == other._denominator
        )

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('truediv', self, other)

    def _floor_quotient(self, other: Any) -> int:
        other_value = (
            other if isinstance(other, Rational) else runtime.qq(other))
        if other_value._numerator == runtime.bigint(0):
            raise ZeroDivisionError('rational division by zero')
        numerator = self._numerator * other_value._denominator
        denominator = self._denominator * other_value._numerator
        if denominator < 0:
            numerator = -numerator
            denominator = -denominator
        quotient = runtime.native_div(numerator, denominator)
        if runtime.native_mod(numerator, denominator) != 0 and numerator < 0:
            quotient -= runtime.bigint(1)
        return runtime.normalize_integer(quotient)

    def __floordiv__(self, other: object) -> int:
        return self._floor_quotient(other)

    def __mod__(self, other: object) -> Rational:
        other_value = (
            other if isinstance(other, Rational) else runtime.qq(other))
        quotient = Rational(self._floor_quotient(other_value))
        return self._sub_(other_value._mul_(quotient))

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def _compare(self, other: Any) -> int:
        other_value = (
            other if isinstance(other, Rational) else runtime.qq(other))
        difference = (
            self._numerator * other_value._denominator
            - other_value._numerator * self._denominator
        )
        if difference < 0:
            return -1
        if difference > 0:
            return 1
        return 0

    def __lt__(self, other: Any) -> bool:
        return self._compare(other) < 0

    def __le__(self, other: Any) -> bool:
        return self._compare(other) <= 0

    def __gt__(self, other: Any) -> bool:
        return self._compare(other) > 0

    def __ge__(self, other: Any) -> bool:
        return self._compare(other) >= 0

    def __neg__(self) -> Rational:
        return Rational(-self._numerator, self._denominator)

    def __abs__(self) -> Rational:
        if self._numerator < 0:
            return Rational(-self._numerator, self._denominator)
        return self

    def __pow__(self, exponent: int) -> Rational:
        exponent = runtime.integer_bigint(exponent)
        if exponent == runtime.bigint(0):
            return Rational(1, 1)
        if exponent < 0:
            if self._numerator == runtime.bigint(0):
                raise ZeroDivisionError('rational division by zero')
            return Rational(
                self._denominator ** (-exponent),
                self._numerator ** (-exponent),
            )
        return Rational(
            self._numerator ** exponent,
            self._denominator ** exponent,
        )

    def __repr__(self) -> str:
        if self._denominator == runtime.bigint(1):
            return str(self._numerator)
        return str(self._numerator) + '/' + str(self._denominator)

    __str__ = __repr__
    toString = __repr__


runtime.set_class_repr(Rational, "<class 'Rational'>")
