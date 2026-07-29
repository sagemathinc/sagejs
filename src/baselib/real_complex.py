# Sage-compatible arbitrary-precision real and complex fields backed by FLINT.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Callable

import sagejs as sage
import sagejs.runtime as runtime


def _field_precision(precision: Any = runtime.undefined) -> int:
    if precision is runtime.undefined:
        precision = 53
    precision = runtime.normalize_integer(precision)
    if (
        runtime.jstype(precision) != 'number'
        or not runtime.number.isSafeInteger(precision)
        or precision < 2
    ):
        raise ValueError('precision must be at least 2')
    return precision


@runtime.lightweight_math_class
class RealNumberElement(sage.Element):

    def __init__(self, parent: RealField_class, native_value: Any) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> RealNumberElement:
        return RealNumberElement(self._parent, native_value)

    def _add_(self, other: RealNumberElement) -> RealNumberElement:
        return self._new(
            runtime.flint_backend().realAdd(
                self._native, other._native))

    def _sub_(self, other: RealNumberElement) -> RealNumberElement:
        return self._new(
            runtime.flint_backend().realSub(
                self._native, other._native))

    def _mul_(self, other: RealNumberElement) -> RealNumberElement:
        return self._new(
            runtime.flint_backend().realMul(
                self._native, other._native))

    def _truediv_(self, other: RealNumberElement) -> RealNumberElement:
        return self._new(
            runtime.flint_backend().realDiv(
                self._native, other._native))

    def _eq_(self, other: RealNumberElement) -> bool:
        return runtime.flint_backend().realEqual(
            self._native, other._native)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('truediv', self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __lt__(self, other: Any) -> bool:
        return float(self) < float(other)

    def __le__(self, other: Any) -> bool:
        return float(self) <= float(other)

    def __gt__(self, other: Any) -> bool:
        return float(self) > float(other)

    def __ge__(self, other: Any) -> bool:
        return float(self) >= float(other)

    def __neg__(self) -> RealNumberElement:
        return self._new(
            runtime.flint_backend().realNeg(self._native))

    def __pow__(self, exponent: int) -> RealNumberElement:
        exponent = runtime.integer_bigint(exponent)
        return self._new(
            runtime.flint_backend().realPowInt(
                self._native, exponent))

    def precision(self) -> int:
        return self._parent.precision()

    def __repr__(self) -> str:
        return runtime.flint_backend().realToString(self._native)

    def __float__(self) -> float:
        return runtime.flint_backend().realToDouble(self._native)

    __str__ = __repr__
    toString = __repr__


@runtime.lightweight_math_class
class RealLiteral(RealNumberElement):

    def __init__(
        self,
        parent: RealField_class,
        native_value: Any,
        literal: str,
    ) -> None:
        self._parent = parent
        self._native = native_value
        self.literal = literal
        self.base = 10
        runtime.object.freeze(self)

    def __neg__(self) -> RealLiteral:
        literal = (
            self.literal[1:]
            if self.literal[0] == '-'
            else '-' + self.literal
        )
        return create_real_literal(literal)


@runtime.lightweight_math_class
class ComplexNumberElement(sage.Element):

    def __init__(
        self, parent: ComplexField_class, native_value: Any,
    ) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> ComplexNumberElement:
        return ComplexNumberElement(self._parent, native_value)

    def _add_(
        self, other: ComplexNumberElement,
    ) -> ComplexNumberElement:
        return self._new(
            runtime.flint_backend().complexAdd(
                self._native, other._native))

    def _sub_(
        self, other: ComplexNumberElement,
    ) -> ComplexNumberElement:
        return self._new(
            runtime.flint_backend().complexSub(
                self._native, other._native))

    def _mul_(
        self, other: ComplexNumberElement,
    ) -> ComplexNumberElement:
        return self._new(
            runtime.flint_backend().complexMul(
                self._native, other._native))

    def _truediv_(
        self, other: ComplexNumberElement,
    ) -> ComplexNumberElement:
        return self._new(
            runtime.flint_backend().complexDiv(
                self._native, other._native))

    def _eq_(self, other: ComplexNumberElement) -> bool:
        return runtime.flint_backend().complexEqual(
            self._native, other._native)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('add', self, other)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('sub', self, other)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp('truediv', self, other)

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __neg__(self) -> ComplexNumberElement:
        return self._new(
            runtime.flint_backend().complexNeg(self._native))

    def __pow__(self, exponent: int) -> ComplexNumberElement:
        exponent = runtime.integer_bigint(exponent)
        return self._new(
            runtime.flint_backend().complexPowInt(
                self._native, exponent))

    def precision(self) -> int:
        return self._parent.precision()

    def real(self) -> Any:
        if self._parent._kind == 'ComplexDoubleField':
            return runtime.flint_backend().complexRealDouble(self._native)
        return RealField(self._parent.precision())._fromNative(
            runtime.flint_backend().complexReal(self._native))

    def imag(self) -> Any:
        if self._parent._kind == 'ComplexDoubleField':
            return runtime.flint_backend().complexImagDouble(self._native)
        return RealField(self._parent.precision())._fromNative(
            runtime.flint_backend().complexImag(self._native))

    def __repr__(self) -> str:
        return runtime.flint_backend().complexToString(self._native)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class RealDoubleField_class(sage.Parent):

    def __init__(self) -> None:
        self._name = 'Real Double Field'
        self._kind = 'RDF'

    def __call__(self, value: Any = 0) -> float:
        if isinstance(value, sage.Rational):
            return (
                runtime.number(value._numerator)
                / runtime.number(value._denominator)
            )
        return runtime.number(value)

    def precision(self) -> int:
        return 53

    prec = precision


@runtime.callable_instance_class
class RealField_class(sage.Parent):

    def __init__(self, precision: int) -> None:
        self._name = (
            'Real Field with ' + runtime.string(precision) +
            ' bits of precision')
        self._kind = 'RealField'
        self._precision = precision

    def __call__(self, value: Any = 0) -> RealNumberElement:
        return _real_field_element(self, value)

    def _fromNative(self, native_value: Any) -> RealNumberElement:
        if (
            runtime.flint_backend().realPrecision(native_value)
            != self._precision
        ):
            raise ValueError(
                'native real has the wrong precision for ' + str(self))
        return RealNumberElement(self, native_value)

    def precision(self) -> int:
        return self._precision

    prec = precision


@runtime.callable_instance_class
class ComplexField_class(sage.Parent):

    def __init__(self, precision: int) -> None:
        self._name = (
            'Complex Field with ' + runtime.string(precision) +
            ' bits of precision')
        self._kind = 'ComplexField'
        self._precision = precision

    def __call__(
        self,
        value: Any = 0,
        imag: Any = runtime.undefined,
    ) -> ComplexNumberElement:
        return _complex_field_element(self, value, imag)

    def _fromNative(self, native_value: Any) -> ComplexNumberElement:
        if (
            runtime.flint_backend().complexPrecision(native_value)
            != self._precision
        ):
            raise ValueError(
                'native complex has the wrong precision for ' + str(self))
        return ComplexNumberElement(self, native_value)

    def precision(self) -> int:
        return self._precision

    prec = precision


@runtime.callable_instance_class
class ComplexDoubleField_class(ComplexField_class):

    def __init__(self) -> None:
        self._name = 'Complex Double Field'
        self._kind = 'ComplexDoubleField'
        self._precision = 53


_real_fields = runtime.map()
_complex_fields = runtime.map()
RDF = RealDoubleField_class()
runtime.coercion_model.register(sage.ZZ, RDF, RDF)
runtime.coercion_model.register(sage.QQ, RDF, RDF)


def _real_from_exact(
    field: RealField_class, value: Any,
) -> RealNumberElement:
    backend = runtime.flint_backend()
    if isinstance(value, sage.Rational):
        return RealNumberElement(
            field,
            backend.realFromRational(
                value._numerator,
                value._denominator,
                field._precision,
            ),
        )
    return RealNumberElement(
        field,
        backend.realFromBigInt(
            runtime.integer_bigint(value), field._precision),
    )


def _real_field_element(
    field: RealField_class, value: Any,
) -> RealNumberElement:
    backend = runtime.flint_backend()
    if isinstance(value, RealLiteral):
        return RealNumberElement(
            field,
            backend.realFromString(value.literal, field._precision),
        )
    if isinstance(value, RealNumberElement):
        if value._parent is field:
            return value
        return RealNumberElement(
            field,
            backend.realRound(value._native, field._precision),
        )
    if (
        isinstance(value, sage.Rational)
        or runtime.is_exact_integer(value)
    ):
        return _real_from_exact(field, value)
    if (
        runtime.jstype(value) == 'number'
        or runtime.jstype(value) == 'string'
    ):
        return RealNumberElement(
            field,
            backend.realFromString(str(value), field._precision),
        )
    raise TypeError('unable to convert value to ' + str(field))


def _real_coercion(
    field: RealField_class,
) -> Callable[[Any], RealNumberElement]:
    def convert(value: Any) -> RealNumberElement:
        return _real_field_element(field, value)

    return convert


def _register_real_complex_maps(
    real_field: RealField_class,
    complex_field: ComplexField_class,
) -> None:
    if real_field._precision >= complex_field._precision:
        runtime.coercion_model.register(
            real_field,
            complex_field,
            _complex_coercion(complex_field),
        )


def _register_real_field(field: RealField_class) -> None:
    conversion = _real_coercion(field)
    runtime.coercion_model.register(sage.ZZ, field, conversion)
    runtime.coercion_model.register(sage.QQ, field, conversion)
    runtime.coercion_model.register(RDF, field, conversion)
    for other in _real_fields.values():
        if other is field:
            continue
        if other._precision >= field._precision:
            runtime.coercion_model.register(
                other, field, _real_coercion(field))
        if field._precision >= other._precision:
            runtime.coercion_model.register(
                field, other, _real_coercion(other))
    for complex_field in _complex_fields.values():
        _register_real_complex_maps(field, complex_field)


def RealField(
    precision: Any = runtime.undefined,
) -> RealField_class:
    precision = _field_precision(precision)
    field = _real_fields.get(precision)
    if field is not runtime.undefined:
        return field
    field = RealField_class(precision)
    _real_fields.set(precision, field)
    _register_real_field(field)
    return field


def create_real_literal(text: str) -> RealLiteral:
    text = str(text).replace(runtime.regexp('_', 'g'), '')
    precision = 53
    if len(text) > 15:
        exponent_index = max(
            runtime.string_find(text, 'e'),
            runtime.string_find(text, 'E'),
        )
        mantissa = (
            text
            if exponent_index == -1
            else text[:exponent_index]
        )
        significant = mantissa.replace(
            runtime.regexp(r'^[-0.]*'), '')
        significant_digits = (
            len(significant)
            - (
                0
                if runtime.string_find(significant, '.') == -1
                else 1
            )
        )
        bits = int(3.321928094887363 * significant_digits) + 1
        precision = max(bits, 53)
    field = RealField(precision)
    return RealLiteral(
        field,
        runtime.flint_backend().realFromString(text, precision),
        text,
    )


def _complex_field_element(
    field: ComplexField_class,
    value: Any,
    imag: Any = runtime.undefined,
) -> ComplexNumberElement:
    backend = runtime.flint_backend()
    if (
        imag is runtime.undefined
        and isinstance(value, ComplexNumberElement)
    ):
        if value._parent is field:
            return value
        return ComplexNumberElement(
            field,
            backend.complexRound(value._native, field._precision),
        )
    real_field = RealField(field._precision)
    real_part = real_field(value)
    imag_part = real_field(0 if imag is runtime.undefined else imag)
    return ComplexNumberElement(
        field,
        backend.complexFromReals(
            real_part._native, imag_part._native),
    )


def _complex_coercion(
    field: ComplexField_class,
) -> Callable[[Any], ComplexNumberElement]:
    def convert(value: Any) -> ComplexNumberElement:
        return _complex_field_element(field, value)

    return convert


def _register_complex_field(field: ComplexField_class) -> None:
    conversion = _complex_coercion(field)
    runtime.coercion_model.register(sage.ZZ, field, conversion)
    runtime.coercion_model.register(sage.QQ, field, conversion)
    runtime.coercion_model.register(RDF, field, conversion)
    for real_field in _real_fields.values():
        _register_real_complex_maps(real_field, field)
    for other in _complex_fields.values():
        if other is field:
            continue
        if other._precision >= field._precision:
            runtime.coercion_model.register(
                other, field, _complex_coercion(field))
        if field._precision >= other._precision:
            runtime.coercion_model.register(
                field, other, _complex_coercion(other))


def ComplexField(
    precision: Any = runtime.undefined,
) -> ComplexField_class:
    precision = _field_precision(precision)
    field = _complex_fields.get(precision)
    if field is not runtime.undefined:
        return field
    field = ComplexField_class(precision)
    _complex_fields.set(precision, field)
    _register_complex_field(field)
    return field


RR = RealField(53)
CC = ComplexField(53)
CDF = ComplexDoubleField_class()
_cdf_conversion = _complex_coercion(CDF)
runtime.coercion_model.register(sage.ZZ, CDF, _cdf_conversion)
runtime.coercion_model.register(sage.QQ, CDF, _cdf_conversion)
runtime.coercion_model.register(RDF, CDF, _cdf_conversion)

_zeta_zero_cache = []


def zeta_zeros(
    count: Any = runtime.undefined,
) -> list[float]:
    if count is runtime.undefined:
        dataset_function = runtime.reflect.get(
            runtime.global_object, 'odlyzko_zeta_zeros')
        dataset = runtime.reflect.apply(
            dataset_function, runtime.undefined, [])
        return dataset[:]
    count = runtime.normalize_integer(count)
    if (
        runtime.jstype(count) != 'number'
        or not runtime.number.isSafeInteger(count)
        or count < 0
    ):
        raise ValueError('zeta-zero count must be a nonnegative integer')
    if count > len(_zeta_zero_cache):
        values = runtime.flint_backend().zetaZeros(count, 53)
        _zeta_zero_cache.clear()
        _zeta_zero_cache.extend(values)
    return _zeta_zero_cache[:count]


def Ei(value: Any) -> ComplexNumberElement:
    complex_value = (
        value
        if isinstance(value, ComplexNumberElement)
        else CC(value)
    )
    return complex_value._parent._fromNative(
        runtime.flint_backend().complexEi(complex_value._native))


def Li(value: Any) -> float:
    """Numerically evaluate the logarithmic integral ``li(value)``."""
    real_value = float(value)
    if real_value <= 0:
        raise ValueError('Li() currently requires a positive real argument')
    return Ei(CDF(runtime.math.log(real_value))).real()


def ComplexNumber(
    real: Any = 0,
    imag: Any = runtime.undefined,
) -> ComplexNumberElement:
    return CC(real, imag)


runtime.set_class_repr(
    RealNumberElement, "<class 'RealNumber'>")
runtime.set_class_repr(
    RealDoubleField_class, "<class 'RealDoubleField_class'>")
runtime.set_class_repr(
    RealLiteral, "<class 'RealLiteral'>")
runtime.set_class_repr(
    ComplexNumberElement, "<class 'ComplexNumber'>")
runtime.set_class_repr(
    ComplexDoubleField_class, "<class 'ComplexDoubleField_class'>")
runtime.set_class_repr(
    RealField_class,
    "<class 'sage.rings.real_mpfr.RealField_class'>")
runtime.set_class_repr(
    ComplexField_class,
    "<class 'sage.rings.complex_mpfr." +
    "ComplexField_class_with_category'>")
