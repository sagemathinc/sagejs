# Exact univariate power and Laurent series backed by FLINT polynomials.
#
# The native polynomial stores coefficients relative to ``_shift``.  A finite
# ``_precision`` is an absolute exponent, so the element is known modulo
# O(variable^precision).  This makes valuation-sensitive precision propagation
# explicit and keeps all coefficient arithmetic in FLINT.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _minimum_precision(left: Any, right: Any) -> Any:
    if left is None:
        return right
    if right is None:
        return left
    return min(left, right)


def _native_valuation(native_value: Any) -> int:
    return int(runtime.flint_backend().polyValuation(native_value))


@runtime.sequence_class
@runtime.lightweight_math_class
class SeriesElement(sage.Element):

    def __init__(
        self,
        parent: SeriesRingParent,
        native_value: Any,
        shift: int,
        precision: Any,
    ) -> None:
        self._parent = parent
        self._native = native_value
        self._shift = shift
        self._precision = precision
        runtime.object.freeze(self)

    def _native_is_zero(self) -> bool:
        return _native_valuation(self._native) < 0

    def _valuation_for_product(self) -> int:
        if not self._native_is_zero():
            return self._shift
        if self._precision is not None:
            return self._precision
        return 0

    def valuation(self) -> int:
        if self._native_is_zero():
            if self._precision is not None:
                return self._precision
            raise ValueError('the valuation of zero is infinity')
        return self._shift

    def precision_absolute(self) -> Any:
        return self._precision

    prec = precision_absolute

    def __getitem__(self, exponent: Any) -> Any:
        exponent = runtime.normalize_integer(exponent)
        if (
            runtime.jstype(exponent) != 'number'
            or not runtime.number.isSafeInteger(exponent)
        ):
            raise TypeError('series exponent must be an integer')
        index = exponent - self._shift
        if index < 0:
            return self._parent.base_ring()(0)
        coefficients = self._parent._polynomial_ring._from_native(
            self._native).coefficients()
        if index >= len(coefficients):
            return self._parent.base_ring()(0)
        return coefficients[index]

    def padded_list(self, length: Any = None) -> list[Any]:
        if length is None:
            if self._precision is not None:
                length = max(0, self._precision)
            else:
                coefficients = (
                    self._parent._polynomial_ring._from_native(
                        self._native).coefficients()
                )
                length = max(0, self._shift + len(coefficients))
        length = int(length)
        if length < 0:
            raise ValueError('series coefficient length must be nonnegative')
        result = [
            self._parent.base_ring()(0)
            for _index in range(length)
        ]
        coefficients = self._parent._polynomial_ring._from_native(
            self._native).coefficients()
        for index in range(len(coefficients)):
            exponent = self._shift + index
            if exponent >= 0 and exponent < length:
                result[exponent] = coefficients[index]
        return result

    def add_bigoh(self, precision: Any) -> SeriesElement:
        precision = int(precision)
        return self._parent._from_native(
            self._native,
            self._shift,
            _minimum_precision(self._precision, precision),
        )

    def _inflate(
        self,
        factor: Any,
        precision: Any = None,
    ) -> SeriesElement:
        factor = int(factor)
        if factor <= 0:
            raise ValueError('series inflation factor must be positive')
        target_precision = precision
        if target_precision is None and self._precision is not None:
            target_precision = self._precision * factor
        return self._parent._from_native(
            runtime.flint_backend().polyInflate(
                self._native, runtime.integer_bigint(factor)),
            self._shift * factor,
            target_precision,
        )

    def _add_(self, other: SeriesElement) -> SeriesElement:
        shift = min(self._shift, other._shift)
        left_native = self._native
        right_native = other._native
        if self._shift > shift:
            left_native = runtime.flint_backend().polyShiftLeft(
                left_native,
                runtime.integer_bigint(self._shift - shift),
            )
        if other._shift > shift:
            right_native = runtime.flint_backend().polyShiftLeft(
                right_native,
                runtime.integer_bigint(other._shift - shift),
            )
        return self._parent._from_native(
            runtime.flint_backend().polyAdd(
                left_native, right_native),
            shift,
            _minimum_precision(self._precision, other._precision),
        )

    def _sub_(self, other: SeriesElement) -> SeriesElement:
        shift = min(self._shift, other._shift)
        left_native = self._native
        right_native = other._native
        if self._shift > shift:
            left_native = runtime.flint_backend().polyShiftLeft(
                left_native,
                runtime.integer_bigint(self._shift - shift),
            )
        if other._shift > shift:
            right_native = runtime.flint_backend().polyShiftLeft(
                right_native,
                runtime.integer_bigint(other._shift - shift),
            )
        return self._parent._from_native(
            runtime.flint_backend().polySub(
                left_native, right_native),
            shift,
            _minimum_precision(self._precision, other._precision),
        )

    def _mul_(self, other: SeriesElement) -> SeriesElement:
        if (
            (self._native_is_zero() and self._precision is None)
            or (other._native_is_zero() and other._precision is None)
        ):
            return self._parent(0)
        left_valuation = self._valuation_for_product()
        right_valuation = other._valuation_for_product()
        precision = None
        if self._precision is not None:
            precision = self._precision + right_valuation
        if other._precision is not None:
            precision = _minimum_precision(
                precision,
                other._precision + left_valuation,
            )
        shift = self._shift + other._shift
        if precision is None:
            native_value = runtime.flint_backend().polyMul(
                self._native, other._native)
        else:
            length = max(0, precision - shift)
            native_value = runtime.flint_backend().polyMullow(
                self._native,
                other._native,
                runtime.integer_bigint(length),
            )
        return self._parent._from_native(
            native_value, shift, precision)

    def _truediv_(self, other: SeriesElement) -> SeriesElement:
        return self._mul_(other.inverse())

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('truediv', self, other)

    def __neg__(self) -> SeriesElement:
        return self._parent._from_native(
            runtime.flint_backend().polyNeg(self._native),
            self._shift,
            self._precision,
        )

    def __pow__(self, exponent: int) -> SeriesElement:
        exponent = runtime.integer_bigint(exponent)
        if exponent < 0:
            return self.inverse() ** (-exponent)
        if exponent == 0:
            return self._parent(1)
        numeric_exponent = runtime.number(exponent)
        if self._native_is_zero():
            if self._precision is None:
                return self._parent(0)
            return self._parent._bigoh(
                int(self._precision * numeric_exponent))
        shift = int(self._shift * numeric_exponent)
        precision = None
        if self._precision is not None:
            precision = int(
                self._precision
                + (numeric_exponent - 1) * self._shift
            )
        if precision is None:
            native_value = runtime.flint_backend().polyPow(
                self._native, exponent)
        else:
            native_value = runtime.flint_backend().polyPowTrunc(
                self._native,
                exponent,
                runtime.integer_bigint(max(0, precision - shift)),
            )
        return self._parent._from_native(
            native_value, shift, precision)

    def inverse(self) -> SeriesElement:
        if self._native_is_zero():
            raise sage.ZeroDivisionError('inverse of zero series')
        relative_precision = None
        if self._precision is not None:
            relative_precision = self._precision - self._shift
        else:
            coefficients = self._parent._polynomial_ring._from_native(
                self._native).coefficients()
            if len(coefficients) == 1:
                relative_precision = 1
            else:
                relative_precision = self._parent.default_prec()
        native_value = runtime.flint_backend().polyInvSeries(
            self._native,
            runtime.integer_bigint(relative_precision),
        )
        precision = None
        if (
            self._precision is not None
            or len(self._parent._polynomial_ring._from_native(
                self._native).coefficients()) != 1
        ):
            precision = relative_precision - self._shift
        target = self._parent._laurent_ring()
        return target._from_native(
            native_value, -self._shift, precision)

    __invert__ = inverse

    def _eq_(self, other: SeriesElement) -> bool:
        return self._sub_(other)._native_is_zero()

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def _bigoh(self) -> SeriesElement:
        return self._parent._bigoh(self.valuation())

    def __repr__(self) -> str:
        coefficients = self._parent._polynomial_ring._from_native(
            self._native).coefficients()
        variable = self._parent.variable_name()
        one = self._parent.base_ring()(1)
        pieces = []
        for index in range(len(coefficients)):
            coefficient = coefficients[index]
            if coefficient == self._parent.base_ring()(0):
                continue
            exponent = self._shift + index
            if exponent == 0:
                term = str(coefficient)
            else:
                monomial = variable
                if exponent != 1:
                    monomial += '^' + str(exponent)
                if coefficient == one:
                    term = monomial
                elif (
                    self._parent.base_ring() is sage.QQ
                    and coefficient == -one
                ):
                    term = '-' + monomial
                else:
                    term = str(coefficient) + '*' + monomial
            if len(pieces) == 0:
                pieces.append(term)
            elif term.startswith('-'):
                pieces.append(' - ' + term[1:])
            else:
                pieces.append(' + ' + term)
        text = ''.join(pieces)
        if self._precision is not None:
            bigoh = 'O(' + variable + '^' + str(self._precision) + ')'
            text += (' + ' if text else '') + bigoh
        return text if text else '0'

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class SeriesRingParent(sage.Parent):

    def __init__(
        self,
        base: sage.Parent,
        variable: str,
        default_precision: int,
        laurent: bool,
    ) -> None:
        kind = 'Laurent' if laurent else 'Power'
        self._name = (
            kind + ' Series Ring in ' + variable + ' over ' + str(base))
        self._base = base
        self._variable = variable
        self._default_precision = default_precision
        self._is_laurent = laurent
        self._kind = 'LaurentSeriesRing' if laurent else 'PowerSeriesRing'
        self._construction = {
            'kind': 'laurent_series' if laurent else 'power_series',
            'base': base,
            'variable': variable,
            'default_precision': default_precision,
        }
        self._polynomial_ring = sage.PolynomialRing(base, variable)

    def base_ring(self) -> sage.Parent:
        return self._base

    def variable_name(self) -> str:
        return self._variable

    def default_prec(self) -> int:
        return self._default_precision

    def _from_native(
        self,
        native_value: Any,
        shift: int = 0,
        precision: Any = None,
    ) -> SeriesElement:
        valuation = _native_valuation(native_value)
        if valuation < 0:
            return SeriesElement(
                self,
                self._polynomial_ring(0)._native,
                0,
                precision,
            )
        if valuation > 0:
            native_value = runtime.flint_backend().polyShiftRight(
                native_value, runtime.integer_bigint(valuation))
            shift += valuation
        if precision is not None:
            length = precision - shift
            if length <= 0:
                return SeriesElement(
                    self,
                    self._polynomial_ring(0)._native,
                    0,
                    precision,
                )
            native_value = runtime.flint_backend().polyTruncate(
                native_value, runtime.integer_bigint(length))
            valuation = _native_valuation(native_value)
            if valuation < 0:
                return SeriesElement(
                    self,
                    self._polynomial_ring(0)._native,
                    0,
                    precision,
                )
            if valuation > 0:
                native_value = runtime.flint_backend().polyShiftRight(
                    native_value, runtime.integer_bigint(valuation))
                shift += valuation
        target = self
        if shift < 0 and not self._is_laurent:
            target = self._laurent_ring()
        return SeriesElement(target, native_value, shift, precision)

    def _serialization_coefficients(
        self, value: SeriesElement,
    ) -> list[Any]:
        """Return the finite coefficient polynomial used by SagePack."""
        return self._polynomial_ring._from_native(
            value._native).coefficients()

    def _from_serialized_series(
        self,
        coefficients: list[Any],
        shift: Any,
        precision: Any,
    ) -> SeriesElement:
        polynomial = self._polynomial_ring._from_coefficients(coefficients)
        return self._from_native(
            polynomial._native, int(shift), precision)

    def _bigoh(self, precision: int) -> SeriesElement:
        return SeriesElement(
            self,
            self._polynomial_ring(0)._native,
            0,
            int(precision),
        )

    def _laurent_ring(self) -> SeriesRingParent:
        if self._is_laurent:
            return self
        return LaurentSeriesRing(
            self._base,
            self._variable,
            self._default_precision,
        )

    def __call__(self, value: Any = 0) -> SeriesElement:
        if isinstance(value, SeriesElement):
            if value._parent is self:
                return value
            source = value._parent
            if (
                source.base_ring() is self._base
                and source.variable_name() == self._variable
            ):
                if not self._is_laurent and value._shift < 0:
                    raise TypeError(
                        'a Laurent series does not coerce to a power series')
                return self._from_native(
                    value._native,
                    value._shift,
                    value._precision,
                )
            raise TypeError('incompatible series rings')
        polynomial = self._polynomial_ring(value)
        return self._from_native(polynomial._native)

    def gen(self) -> SeriesElement:
        return self._from_native(
            self._polynomial_ring.gen()._native)

    def gens(self) -> Any:
        return runtime.math_tuple([self.gen()])

    def objgen(self) -> Any:
        return runtime.math_tuple([self, self.gen()])

    def objgens(self) -> Any:
        return runtime.math_tuple([
            self, runtime.math_tuple([self.gen()])])

    def _first_ngens(self, count: int) -> list[SeriesElement]:
        if count != 1:
            raise ValueError(
                'a univariate series ring has exactly one generator')
        return [self.gen()]


ρσ_series_ring_cache = runtime.map()


def _series_ring(
    base: sage.Parent,
    variable: str,
    default_prec: int,
    laurent: bool,
) -> SeriesRingParent:
    if base is not sage.QQ and base._kind != 'GF':
        raise TypeError(
            'FLINT series currently support QQ and prime finite fields')
    if (
        not isinstance(variable, str)
        or not runtime.regexp(
            r'^[A-Za-z_][A-Za-z0-9_]*$'
        ).test(variable)
    ):
        raise TypeError('the series variable must be a valid identifier')
    default_prec = int(default_prec)
    if default_prec <= 0:
        raise ValueError('default precision must be positive')
    by_variable = ρσ_series_ring_cache.get(base)
    if by_variable is runtime.undefined:
        by_variable = runtime.map()
        ρσ_series_ring_cache.set(base, by_variable)
    key = (
        variable
        + ('|laurent|' if laurent else '|power|')
        + str(default_prec)
    )
    parent = by_variable.get(key)
    if parent is runtime.undefined:
        parent = SeriesRingParent(
            base, variable, default_prec, laurent)
        by_variable.set(key, parent)
    return parent


def _series_variable_name(value: Any) -> str:
    if (
        isinstance(value, (list, tuple))
        and len(value) == 1
        and isinstance(value[0], str)
    ):
        return value[0]
    if not isinstance(value, str):
        raise TypeError('a series ring has exactly one variable')
    return value


def PowerSeriesRing(
    base: sage.Parent,
    variable: Any = None,
    default_prec: int = 20,
    names: Any = None,
) -> SeriesRingParent:
    if (
        variable is not None
        and runtime.jstype(variable) == 'object'
        and variable[runtime.kwargs_symbol]
    ):
        names = variable.names
        variable = None
    if names is not None:
        variable = names
    if variable is None:
        raise TypeError('a power-series variable name is required')
    return _series_ring(
        base,
        _series_variable_name(variable),
        default_prec,
        False,
    )


def LaurentSeriesRing(
    base: sage.Parent,
    variable: Any = None,
    default_prec: int = 20,
    names: Any = None,
) -> SeriesRingParent:
    if (
        variable is not None
        and runtime.jstype(variable) == 'object'
        and variable[runtime.kwargs_symbol]
    ):
        names = variable.names
        variable = None
    if names is not None:
        variable = names
    if variable is None:
        raise TypeError('a Laurent-series variable name is required')
    return _series_ring(
        base,
        _series_variable_name(variable),
        default_prec,
        True,
    )


def big_oh(value: Any) -> SeriesElement:
    if isinstance(value, SeriesElement):
        return value._bigoh()
    raise TypeError('O(...) currently requires a power or Laurent series')


runtime.reflect.set(runtime.global_object, 'O', big_oh)


runtime.set_class_repr(
    SeriesElement,
    "<class 'sage.rings.power_series_poly.PowerSeries_poly'>",
)
