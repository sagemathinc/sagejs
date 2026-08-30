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


def _legacy_series_polynomial(polynomial: Any) -> Any:
    """Construct the series family's transitional FLINT polynomial state.

    Canonical univariate polynomial elements own packed host-independent
    coefficients. Series have not migrated yet, so this audited ingress builds
    their private legacy representation without making it observable through
    the polynomial API.
    """
    return polynomial._legacy_polynomial_oracle_input()


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
            raise ValueError("the valuation of zero is infinity")
        return self._shift

    def precision_absolute(self) -> Any:
        return self._precision

    prec = precision_absolute

    def __getitem__(self, exponent: Any) -> Any:
        exponent = runtime.normalize_integer(exponent)
        if runtime.jstype(exponent) != "number" or not runtime.number.isSafeInteger(
            exponent
        ):
            raise TypeError("series exponent must be an integer")
        index = exponent - self._shift
        if index < 0:
            return self._parent.base_ring()(0)
        base = self._parent.base_ring()
        if base._kind == "GF_EXTENSION":
            coefficients = self._parent._polynomial_ring._from_native(
                self._native
            ).coefficients()
            if index >= len(coefficients):
                return base(0)
            return coefficients[index]
        coefficient = runtime.flint_backend().polyCoefficient(
            self._native,
            runtime.integer_bigint(index),
        )
        if base is sage.ZZ:
            return runtime.normalize_integer(coefficient)
        if base is sage.QQ:
            return base(
                runtime.reflect.get(coefficient, "numerator"),
                runtime.reflect.get(coefficient, "denominator"),
            )
        return base(coefficient)

    def padded_list(self, length: Any = None) -> list[Any]:
        if length is None:
            if self._precision is not None:
                length = max(0, self._precision)
            else:
                coefficients = self._parent._polynomial_ring._from_native(
                    self._native
                ).coefficients()
                length = max(0, self._shift + len(coefficients))
        length = int(length)
        if length < 0:
            raise ValueError("series coefficient length must be nonnegative")
        result = [self._parent.base_ring()(0) for _index in range(length)]
        coefficients = self._parent._polynomial_ring._from_native(
            self._native
        ).coefficients()
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
            raise ValueError("series inflation factor must be positive")
        if factor == 1 and (precision is None or precision == self._precision):
            return self
        target_precision = precision
        if target_precision is None and self._precision is not None:
            target_precision = self._precision * factor
        return self._parent._from_native(
            runtime.flint_backend().polyInflate(
                self._native, runtime.integer_bigint(factor)
            ),
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
            runtime.flint_backend().polyAdd(left_native, right_native),
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
            runtime.flint_backend().polySub(left_native, right_native),
            shift,
            _minimum_precision(self._precision, other._precision),
        )

    def _mul_(self, other: SeriesElement) -> SeriesElement:
        if (self._native_is_zero() and self._precision is None) or (
            other._native_is_zero() and other._precision is None
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
            native_value = runtime.flint_backend().polyMul(self._native, other._native)
        else:
            length = max(0, precision - shift)
            native_value = runtime.flint_backend().polyMullow(
                self._native,
                other._native,
                runtime.integer_bigint(length),
            )
        return self._parent._from_native(native_value, shift, precision)

    def _truediv_(self, other: SeriesElement) -> SeriesElement:
        return self._mul_(other.inverse())

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

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
            return self._parent._bigoh(int(self._precision * numeric_exponent))
        shift = int(self._shift * numeric_exponent)
        precision = None
        if self._precision is not None:
            precision = int(self._precision + (numeric_exponent - 1) * self._shift)
        if precision is None:
            native_value = runtime.flint_backend().polyPow(self._native, exponent)
        else:
            native_value = runtime.flint_backend().polyPowTrunc(
                self._native,
                exponent,
                runtime.integer_bigint(max(0, precision - shift)),
            )
        return self._parent._from_native(native_value, shift, precision)

    def inverse(self) -> SeriesElement:
        if self._native_is_zero():
            raise sage.ZeroDivisionError("inverse of zero series")
        relative_precision = None
        if self._precision is not None:
            relative_precision = self._precision - self._shift
        else:
            coefficients = self._parent._polynomial_ring._from_native(
                self._native
            ).coefficients()
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
            or len(
                self._parent._polynomial_ring._from_native(self._native).coefficients()
            )
            != 1
        ):
            precision = relative_precision - self._shift
        target = self._parent._laurent_ring()
        return target._from_native(native_value, -self._shift, precision)

    __invert__ = inverse

    def _eq_(self, other: SeriesElement) -> bool:
        return self._sub_(other)._native_is_zero()

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def _bigoh(self) -> SeriesElement:
        return self._parent._bigoh(self.valuation())

    def __repr__(self) -> str:
        coefficients = self._parent._polynomial_ring._from_native(
            self._native
        ).coefficients()
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
                    monomial += "^" + str(exponent)
                if coefficient == one:
                    term = monomial
                elif self._parent.base_ring() is sage.QQ and coefficient == -one:
                    term = "-" + monomial
                else:
                    term = str(coefficient) + "*" + monomial
            if len(pieces) == 0:
                pieces.append(term)
            elif term.startswith("-"):
                pieces.append(" - " + term[1:])
            else:
                pieces.append(" + " + term)
        text = "".join(pieces)
        if self._precision is not None:
            bigoh = "O(" + variable + "^" + str(self._precision) + ")"
            text += (" + " if text else "") + bigoh
        return text if text else "0"

    __str__ = __repr__
    toString = __repr__


@runtime.sequence_class
@runtime.lightweight_math_class
class GenericSeriesElement(SeriesElement):
    """An exact ordinary-Python series over a non-FLINT coefficient ring."""

    def __init__(
        self,
        parent: GenericSeriesRingParent,
        coefficients: list[Any],
        shift: int,
        precision: Any,
    ) -> None:
        self._parent = parent
        self._precision = precision
        base = parent.base_ring()
        zero = base(0)
        values = [base(value) for value in coefficients]
        if precision is not None:
            values = values[: max(0, int(precision) - int(shift))]
        while len(values) and values[-1] == zero:
            values.pop()
        valuation = 0
        while valuation < len(values) and values[valuation] == zero:
            valuation += 1
        if valuation == len(values):
            self._shift = 0
            self._coefficients = runtime.math_tuple([])
        else:
            self._shift = int(shift) + valuation
            self._coefficients = runtime.math_tuple(values[valuation:])
        if self._shift < 0 and not parent._is_laurent:
            raise ValueError("power-series exponents must be nonnegative")
        runtime.object.freeze(self)

    def _is_zero(self) -> bool:
        return len(self._coefficients) == 0

    def _valuation_for_product(self) -> int:
        if not self._is_zero():
            return self._shift
        if self._precision is not None:
            return self._precision
        return 0

    def valuation(self) -> int:
        if self._is_zero():
            if self._precision is not None:
                return self._precision
            raise ValueError("the valuation of zero is infinity")
        return self._shift

    def precision_absolute(self) -> Any:
        return self._precision

    prec = precision_absolute

    def __getitem__(self, exponent: Any) -> Any:
        exponent = int(exponent)
        index = exponent - self._shift
        if index < 0 or index >= len(self._coefficients):
            return self._parent.base_ring()(0)
        return self._coefficients[index]

    def padded_list(self, length: Any = None) -> list[Any]:
        if length is None:
            if self._precision is not None:
                length = max(0, self._precision)
            else:
                length = max(0, self._shift + len(self._coefficients))
        length = int(length)
        if length < 0:
            raise ValueError("series coefficient length must be nonnegative")
        answer = [self._parent.base_ring()(0) for _index in range(length)]
        for index, coefficient in enumerate(self._coefficients):
            exponent = self._shift + index
            if exponent >= 0 and exponent < length:
                answer[exponent] = coefficient
        return answer

    def add_bigoh(self, precision: Any) -> GenericSeriesElement:
        return self._parent._from_coefficients(
            list(self._coefficients),
            self._shift,
            _minimum_precision(self._precision, int(precision)),
        )

    def _inflate(
        self,
        factor: Any,
        precision: Any = None,
    ) -> GenericSeriesElement:
        factor = int(factor)
        if factor <= 0:
            raise ValueError("series inflation factor must be positive")
        target_precision = precision
        if target_precision is None and self._precision is not None:
            target_precision = self._precision * factor
        if self._is_zero():
            if target_precision is None:
                return self._parent(0)
            return self._parent._bigoh(target_precision)
        length = (len(self._coefficients) - 1) * factor + 1
        values = [self._parent.base_ring()(0) for _index in range(length)]
        for index, coefficient in enumerate(self._coefficients):
            values[index * factor] = coefficient
        return self._parent._from_coefficients(
            values,
            self._shift * factor,
            target_precision,
        )

    def _aligned_coefficients(
        self,
        other: GenericSeriesElement,
    ) -> tuple[int, list[Any], list[Any]]:
        shift = min(self._shift, other._shift)
        stop = max(
            self._shift + len(self._coefficients),
            other._shift + len(other._coefficients),
        )
        length = max(0, stop - shift)
        zero = self._parent.base_ring()(0)
        left = [zero for _index in range(length)]
        right = [zero for _index in range(length)]
        for index, coefficient in enumerate(self._coefficients):
            left[self._shift - shift + index] = coefficient
        for index, coefficient in enumerate(other._coefficients):
            right[other._shift - shift + index] = coefficient
        return shift, left, right

    def _add_(self, other: Any) -> GenericSeriesElement:
        shift, left, right = self._aligned_coefficients(other)
        return self._parent._from_coefficients(
            [left[index] + right[index] for index in range(len(left))],
            shift,
            _minimum_precision(self._precision, other._precision),
        )

    def _sub_(self, other: Any) -> GenericSeriesElement:
        shift, left, right = self._aligned_coefficients(other)
        return self._parent._from_coefficients(
            [left[index] - right[index] for index in range(len(left))],
            shift,
            _minimum_precision(self._precision, other._precision),
        )

    def _mul_(self, other: Any) -> GenericSeriesElement:
        if (self._is_zero() and self._precision is None) or (
            other._is_zero() and other._precision is None
        ):
            return self._parent(0)
        left_valuation = self._valuation_for_product()
        right_valuation = other._valuation_for_product()
        precision = None
        if self._precision is not None:
            precision = self._precision + right_valuation
        if other._precision is not None:
            precision = _minimum_precision(precision, other._precision + left_valuation)
        shift = self._shift + other._shift
        length = len(self._coefficients) + len(other._coefficients) - 1
        if precision is not None:
            length = min(length, max(0, precision - shift))
        zero = self._parent.base_ring()(0)
        values = [zero for _index in range(max(0, length))]
        for left_index, left in enumerate(self._coefficients):
            for right_index, right in enumerate(other._coefficients):
                target = left_index + right_index
                if target >= len(values):
                    break
                values[target] += left * right
        return self._parent._from_coefficients(values, shift, precision)

    def _truediv_(self, other: Any) -> GenericSeriesElement:
        return self._mul_(other.inverse())

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __neg__(self) -> GenericSeriesElement:
        return self._parent._from_coefficients(
            [-value for value in self._coefficients],
            self._shift,
            self._precision,
        )

    def __pow__(self, exponent: int) -> GenericSeriesElement:
        exponent = int(exponent)
        if exponent < 0:
            return self.inverse() ** (-exponent)
        answer = self._parent(1)
        base = self
        while exponent:
            if exponent % 2:
                answer *= base
            exponent //= 2
            if exponent:
                base *= base
        return answer

    def inverse(self) -> GenericSeriesElement:
        if self._is_zero():
            raise sage.ZeroDivisionError("inverse of zero series")
        relative_precision = (
            self._precision - self._shift
            if self._precision is not None
            else self._parent.default_prec()
        )
        leading_inverse = self._coefficients[0] ** -1
        values = [leading_inverse]
        for exponent in range(1, relative_precision):
            total = self._parent.base_ring()(0)
            stop = min(exponent, len(self._coefficients) - 1)
            for index in range(1, stop + 1):
                total += self._coefficients[index] * values[exponent - index]
            values.append(-leading_inverse * total)
        precision = (
            relative_precision - self._shift
            if self._precision is not None or len(self._coefficients) != 1
            else None
        )
        target = self._parent._laurent_ring()
        return target._from_coefficients(values, -self._shift, precision)

    __invert__ = inverse

    def _eq_(self, other: Any) -> bool:
        return self._sub_(other)._is_zero()

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def _bigoh(self) -> GenericSeriesElement:
        return self._parent._bigoh(self.valuation())

    def __repr__(self) -> str:
        variable = self._parent.variable_name()
        base = self._parent.base_ring()
        zero = base(0)
        one = base(1)
        pieces = []
        for index, coefficient in enumerate(self._coefficients):
            if coefficient == zero:
                continue
            exponent = self._shift + index
            if exponent == 0:
                term = str(coefficient)
            else:
                monomial = variable if exponent == 1 else variable + "^" + str(exponent)
                if coefficient == one:
                    term = monomial
                elif coefficient == -one:
                    term = "-" + monomial
                else:
                    text = str(coefficient)
                    if " + " in text or " - " in text[1:]:
                        text = "(" + text + ")"
                    term = text + "*" + monomial
            if len(pieces) == 0:
                pieces.append(term)
            elif term.startswith("-"):
                pieces.append(" - " + term[1:])
            else:
                pieces.append(" + " + term)
        text = "".join(pieces)
        if self._precision is not None:
            bigoh = "O(" + variable + "^" + str(self._precision) + ")"
            text += (" + " if text else "") + bigoh
        return text if text else "0"

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
        sparse: bool = False,
    ) -> None:
        kind = "Laurent" if laurent else "Power"
        self._name = kind + " Series Ring in " + variable + " over " + str(base)
        self._base = base
        self._variable = variable
        self._default_precision = default_precision
        self._is_laurent = laurent
        self._is_sparse = sparse
        self._kind = "LaurentSeriesRing" if laurent else "PowerSeriesRing"
        self._construction = {
            "kind": "laurent_series" if laurent else "power_series",
            "base": base,
            "variable": variable,
            "default_precision": default_precision,
            "sparse": sparse,
        }
        self._polynomial_ring = sage.PolynomialRing(base, variable)

    def base_ring(self) -> sage.Parent:
        return self._base

    def variable_name(self) -> str:
        return self._variable

    def _unitriangular_basis(self, values: Any) -> list[Any]:
        """Reduce an integral series basis without publishing coefficients."""
        if self._base is not sage.ZZ:
            raise TypeError("unitriangular series reduction requires ZZ")
        native_values = []
        precision = None
        for value in values:
            if not isinstance(value, SeriesElement) or value._parent is not self:
                raise TypeError("series basis elements must have the same parent")
            if precision is None:
                precision = value._precision
            elif value._precision != precision:
                raise ValueError("series basis elements must have equal precision")
            native_value = value._native
            if value._shift > 0:
                native_value = runtime.flint_backend().polyShiftLeft(
                    native_value,
                    runtime.integer_bigint(value._shift),
                )
            elif value._shift < 0:
                raise ValueError(
                    "power-series basis elements cannot have negative shift"
                )
            native_values.append(native_value)
        reduced = runtime.flint_backend().zzPolyUnitriangularBasis(native_values)
        return [self._from_native(value, 0, precision) for value in reduced]

    def default_prec(self) -> int:
        return self._default_precision

    def is_sparse(self) -> bool:
        return self._is_sparse

    def is_dense(self) -> bool:
        return not self._is_sparse

    def ngens(self) -> int:
        return 1

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
                _legacy_series_polynomial(self._polynomial_ring(0)),
                0,
                precision,
            )
        if valuation > 0:
            native_value = runtime.flint_backend().polyShiftRight(
                native_value, runtime.integer_bigint(valuation)
            )
            shift += valuation
        if precision is not None:
            length = precision - shift
            if length <= 0:
                return SeriesElement(
                    self,
                    _legacy_series_polynomial(self._polynomial_ring(0)),
                    0,
                    precision,
                )
            native_value = runtime.flint_backend().polyTruncate(
                native_value, runtime.integer_bigint(length)
            )
            valuation = _native_valuation(native_value)
            if valuation < 0:
                return SeriesElement(
                    self,
                    _legacy_series_polynomial(self._polynomial_ring(0)),
                    0,
                    precision,
                )
            if valuation > 0:
                native_value = runtime.flint_backend().polyShiftRight(
                    native_value, runtime.integer_bigint(valuation)
                )
                shift += valuation
        target = self
        if shift < 0 and not self._is_laurent:
            target = self._laurent_ring()
        return SeriesElement(target, native_value, shift, precision)

    def _serialization_coefficients(
        self,
        value: Any,
    ) -> list[Any]:
        """Return the finite coefficient polynomial used by SagePack."""
        return self._polynomial_ring._from_native(value._native).coefficients()

    def _from_serialized_series(
        self,
        coefficients: list[Any],
        shift: Any,
        precision: Any,
    ) -> Any:
        polynomial = self._polynomial_ring._from_coefficients(coefficients)
        return self._from_native(
            _legacy_series_polynomial(polynomial), int(shift), precision
        )

    def _bigoh(self, precision: int) -> Any:
        return SeriesElement(
            self,
            _legacy_series_polynomial(self._polynomial_ring(0)),
            0,
            int(precision),
        )

    def _laurent_ring(self) -> Any:
        if self._is_laurent:
            return self
        return LaurentSeriesRing(
            self._base,
            self._variable,
            self._default_precision,
            None,
            self._is_sparse,
        )

    def __call__(self, value: Any = 0) -> SeriesElement:
        if isinstance(value, GenericSeriesElement):
            raise TypeError("incompatible series rings")
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
                        "a Laurent series does not coerce to a power series"
                    )
                return self._from_native(
                    value._native,
                    value._shift,
                    value._precision,
                )
            raise TypeError("incompatible series rings")
        polynomial = self._polynomial_ring(value)
        return self._from_native(_legacy_series_polynomial(polynomial))

    def gen(self) -> SeriesElement:
        return self._from_native(_legacy_series_polynomial(self._polynomial_ring.gen()))

    def gens(self) -> Any:
        return runtime.math_tuple([self.gen()])

    def objgen(self) -> Any:
        return runtime.math_tuple([self, self.gen()])

    def objgens(self) -> Any:
        return runtime.math_tuple([self, runtime.math_tuple([self.gen()])])

    def _first_ngens(self, count: int) -> list[SeriesElement]:
        if count != 1:
            raise ValueError("a univariate series ring has exactly one generator")
        return [self.gen()]


@runtime.callable_instance_class
class GenericSeriesRingParent(SeriesRingParent):
    """Exact coefficient-list series for rings without a FLINT polynomial ABI."""

    def __init__(
        self,
        base: sage.Parent,
        variable: str,
        default_precision: int,
        laurent: bool,
        sparse: bool = False,
    ) -> None:
        kind = "Laurent" if laurent else "Power"
        self._name = kind + " Series Ring in " + variable + " over " + str(base)
        self._base = base
        self._variable = variable
        self._default_precision = default_precision
        self._is_laurent = laurent
        self._is_sparse = sparse
        self._kind = "LaurentSeriesRing" if laurent else "PowerSeriesRing"
        self._construction = {
            "kind": "laurent_series" if laurent else "power_series",
            "base": base,
            "variable": variable,
            "default_precision": default_precision,
            "sparse": sparse,
        }

    def _from_coefficients(
        self,
        coefficients: list[Any],
        shift: int = 0,
        precision: Any = None,
    ) -> GenericSeriesElement:
        return GenericSeriesElement(self, coefficients, shift, precision)

    def _serialization_coefficients(self, value: Any) -> list[Any]:
        return list(value._coefficients)

    def _from_serialized_series(
        self,
        coefficients: list[Any],
        shift: Any,
        precision: Any,
    ) -> GenericSeriesElement:
        return self._from_coefficients(coefficients, int(shift), precision)

    def _bigoh(self, precision: int) -> GenericSeriesElement:
        return self._from_coefficients([], 0, int(precision))

    def _laurent_ring(self) -> Any:
        if self._is_laurent:
            return self
        return LaurentSeriesRing(
            self._base,
            self._variable,
            self._default_precision,
            None,
            self._is_sparse,
        )

    def __call__(self, value: Any = 0) -> GenericSeriesElement:
        if isinstance(value, GenericSeriesElement):
            if value._parent is self:
                return value
            source = value._parent
            if (
                source.base_ring() is self._base
                and source.variable_name() == self._variable
            ):
                if not self._is_laurent and value._shift < 0:
                    raise TypeError(
                        "a Laurent series does not coerce to a power series"
                    )
                return self._from_coefficients(
                    list(value._coefficients), value._shift, value._precision
                )
            raise TypeError("incompatible series rings")
        if isinstance(value, SeriesElement):
            return self._from_coefficients(value.padded_list(), 0, value.prec())
        if isinstance(value, (list, tuple)):
            return self._from_coefficients(list(value))
        if hasattr(value, "coefficients"):
            return self._from_coefficients(value.coefficients())
        return self._from_coefficients([self._base(value)])

    def gen(self) -> GenericSeriesElement:
        return self._from_coefficients(
            [self._base(0), self._base(1)],
        )

    def _unitriangular_basis(self, values: Any) -> list[Any]:
        raise NotImplementedError(
            "generic exact series do not provide FLINT unitriangular reduction"
        )


ρσ_series_ring_cache = runtime.map()


def _series_ring(
    base: sage.Parent,
    variable: str,
    default_prec: int,
    laurent: bool,
    sparse: bool = False,
) -> SeriesRingParent:
    if not isinstance(variable, str) or not runtime.regexp(
        r"^[A-Za-z_][A-Za-z0-9_]*$"
    ).test(variable):
        raise TypeError("the series variable must be a valid identifier")
    default_prec = int(default_prec)
    if default_prec <= 0:
        raise ValueError("default precision must be positive")
    by_variable = ρσ_series_ring_cache.get(base)
    if by_variable is runtime.undefined:
        by_variable = runtime.map()
        ρσ_series_ring_cache.set(base, by_variable)
    key = (
        variable
        + ("|laurent|" if laurent else "|power|")
        + str(default_prec)
        + ("|sparse" if sparse else "|dense")
    )
    parent = by_variable.get(key)
    if parent is runtime.undefined:
        native = base is sage.ZZ or base is sage.QQ or base._kind in ["GF", "ZMOD"]
        parent_class = SeriesRingParent if native else GenericSeriesRingParent
        parent = parent_class(base, variable, default_prec, laurent, sparse)
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
        raise TypeError("a series ring has exactly one variable")
    return value


def PowerSeriesRing(
    base: sage.Parent,
    variable: Any = None,
    default_prec: int = 20,
    names: Any = None,
    sparse: bool = False,
) -> SeriesRingParent:
    if (
        variable is not None
        and runtime.jstype(variable) == "object"
        and variable[runtime.kwargs_symbol]
    ):
        names = variable.names
        if hasattr(variable, "default_prec"):
            default_prec = variable.default_prec
        if hasattr(variable, "sparse"):
            sparse = variable.sparse
        variable = None
    if names is not None:
        variable = names
    if variable is None:
        raise TypeError("a power-series variable name is required")
    return _series_ring(
        base,
        _series_variable_name(variable),
        default_prec,
        False,
        sparse,
    )


def LaurentSeriesRing(
    base: sage.Parent,
    variable: Any = None,
    default_prec: int = 20,
    names: Any = None,
    sparse: bool = False,
) -> SeriesRingParent:
    if (
        variable is not None
        and runtime.jstype(variable) == "object"
        and variable[runtime.kwargs_symbol]
    ):
        names = variable.names
        if hasattr(variable, "default_prec"):
            default_prec = variable.default_prec
        if hasattr(variable, "sparse"):
            sparse = variable.sparse
        variable = None
    if names is not None:
        variable = names
    if variable is None:
        raise TypeError("a Laurent-series variable name is required")
    return _series_ring(
        base,
        _series_variable_name(variable),
        default_prec,
        True,
        sparse,
    )


_puiseux_module_cache = runtime.undefined


def _puiseux_module() -> Any:
    global _puiseux_module_cache
    if _puiseux_module_cache is runtime.undefined:
        _puiseux_module_cache = __import__(
            "sage.rings.puiseux_series_ring",
            fromlist=["puiseux_series_ring"],
        )
    return _puiseux_module_cache


def PuiseuxSeriesRing(
    base: Any,
    variable: Any = None,
    default_prec: int = 20,
    names: Any = None,
    name: Any = None,
    sparse: bool = False,
) -> Any:
    return _puiseux_module().PuiseuxSeriesRing(
        base, variable, default_prec, names, name, sparse
    )


def big_oh(value: Any) -> Any:
    parent_kind = getattr(getattr(value, "_parent", None), "_kind", None)
    if isinstance(value, (SeriesElement, GenericSeriesElement)) or parent_kind == (
        "PuiseuxSeriesRing"
    ):
        return value._bigoh()
    raise TypeError("O(...) currently requires a power, Laurent, or Puiseux series")


runtime.reflect.set(runtime.global_object, "O", big_oh)


runtime.set_class_repr(
    SeriesElement,
    "<class 'sage.rings.power_series_poly.PowerSeries_poly'>",
)
runtime.set_class_repr(
    GenericSeriesElement,
    "<class 'sage.rings.power_series_poly.PowerSeries_poly'>",
)
