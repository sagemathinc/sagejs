"""Certified real and complex ball arithmetic loaded on first use.

The public field parents live in the bootstrap arithmetic layer so RIF, CIF,
and their constructors remain immediately visible. Element implementations
and operations live here so interval support does not enlarge the startup
path. Every enclosure is an owned Arb or Acb resource supplied by the native
or WebAssembly FLINT backend.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _global(name: str) -> Any:
    value = runtime.reflect.get(runtime.global_object, name)
    if value is runtime.undefined:
        raise RuntimeError(name + " is not available in this runtime")
    return value


RealNumberElement = _global("RealNumberElement")
ComplexNumberElement = _global("ComplexNumberElement")


def _real_field(precision: int, rnd: str = "RNDN") -> Any:
    return _global("RealField")(precision, rnd=rnd)


def _real_interval_field(precision: int) -> Any:
    return _global("RealIntervalField")(precision)


_REAL_INTERVAL_BINARY = {
    "add": 0,
    "sub": 1,
    "mul": 2,
    "truediv": 3,
    "intersection": 4,
    "union": 5,
}

_REAL_INTERVAL_UNARY = {
    "neg": 0,
    "sqrt": 1,
    "exp": 2,
    "log": 3,
    "sin": 4,
    "cos": 5,
    "tan": 6,
    "abs": 7,
}

_COMPLEX_INTERVAL_UNARY = {
    "neg": 0,
    "sqrt": 1,
    "exp": 2,
    "log": 3,
    "sin": 4,
    "cos": 5,
    "tan": 6,
}


@runtime.lightweight_math_class
class RealIntervalFieldElement(sage.Element):
    """A certified real enclosure backed by an owned Arb value."""

    def __init__(self, parent: Any, native_value: Any) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> RealIntervalFieldElement:
        return RealIntervalFieldElement(self._parent, native_value)

    def _binary(self, operation: str, other: Any) -> RealIntervalFieldElement:
        right = self._parent(other)
        return self._new(
            runtime.flint_backend().realIntervalBinary(
                _REAL_INTERVAL_BINARY[operation],
                self._native,
                right._native,
                self.precision(),
            )
        )

    def _add_(self, other: RealIntervalFieldElement) -> RealIntervalFieldElement:
        return self._binary("add", other)

    def _sub_(self, other: RealIntervalFieldElement) -> RealIntervalFieldElement:
        return self._binary("sub", other)

    def _mul_(self, other: RealIntervalFieldElement) -> RealIntervalFieldElement:
        return self._binary("mul", other)

    def _truediv_(self, other: RealIntervalFieldElement) -> RealIntervalFieldElement:
        return self._binary("truediv", other)

    def _eq_(self, other: RealIntervalFieldElement) -> bool:
        return runtime.flint_backend().realIntervalRelation(
            0, self._native, other._native
        )

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __radd__(self, other: object) -> RealIntervalFieldElement:
        return self._parent(other)._binary("add", self)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __rsub__(self, other: object) -> RealIntervalFieldElement:
        return self._parent(other)._binary("sub", self)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __rmul__(self, other: object) -> RealIntervalFieldElement:
        return self._parent(other)._binary("mul", self)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __rtruediv__(self, other: object) -> RealIntervalFieldElement:
        return self._parent(other)._binary("truediv", self)

    def __pow__(self, exponent: int) -> RealIntervalFieldElement:
        exponent = runtime.integer_bigint(exponent)
        return self._new(
            runtime.flint_backend().realIntervalPowInt(
                self._native, exponent, self.precision()
            )
        )

    def __neg__(self) -> RealIntervalFieldElement:
        return self._unary("neg")

    def __abs__(self) -> RealIntervalFieldElement:
        return self._unary("abs")

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __contains__(self, value: Any) -> bool:
        try:
            candidate = self._parent(value)
        except Exception:
            return False
        return runtime.flint_backend().realIntervalRelation(
            1, self._native, candidate._native
        )

    def _unary(self, operation: str) -> RealIntervalFieldElement:
        return self._new(
            runtime.flint_backend().realIntervalUnary(
                _REAL_INTERVAL_UNARY[operation], self._native, self.precision()
            )
        )

    def precision(self) -> int:
        return self._parent.precision()

    prec = precision

    def lower(self) -> Any:
        return _real_field(self.precision(), rnd="RNDD")._fromNative(
            runtime.flint_backend().realIntervalPart(0, self._native)
        )

    def upper(self) -> Any:
        return _real_field(self.precision(), rnd="RNDU")._fromNative(
            runtime.flint_backend().realIntervalPart(1, self._native)
        )

    def center(self) -> Any:
        return _real_field(self.precision())._fromNative(
            runtime.flint_backend().realIntervalPart(2, self._native)
        )

    def radius(self) -> Any:
        return _real_field(self.precision(), rnd="RNDU")._fromNative(
            runtime.flint_backend().realIntervalPart(3, self._native)
        )

    def absolute_diameter(self) -> Any:
        return _real_field(self.precision(), rnd="RNDU")._fromNative(
            runtime.flint_backend().realIntervalPart(4, self._native)
        )

    def relative_diameter(self) -> Any:
        return _real_field(self.precision(), rnd="RNDU")._fromNative(
            runtime.flint_backend().realIntervalPart(5, self._native)
        )

    def overlaps(self, other: Any) -> bool:
        right = self._parent(other)
        return runtime.flint_backend().realIntervalRelation(
            2, self._native, right._native
        )

    def intersection(self, other: Any) -> RealIntervalFieldElement:
        return self._binary("intersection", other)

    def union(self, other: Any) -> RealIntervalFieldElement:
        right = self._parent(other)
        if not self.overlaps(right):
            raise ValueError("union is only defined for connected real intervals")
        return self._binary("union", right)

    def sqrt(self) -> RealIntervalFieldElement:
        return self._unary("sqrt")

    def exp(self) -> RealIntervalFieldElement:
        return self._unary("exp")

    def log(self) -> RealIntervalFieldElement:
        return self._unary("log")

    def sin(self) -> RealIntervalFieldElement:
        return self._unary("sin")

    def cos(self) -> RealIntervalFieldElement:
        return self._unary("cos")

    def tan(self) -> RealIntervalFieldElement:
        return self._unary("tan")

    def str(self, style: str = "question") -> str:
        style = str(style)
        if style not in ("question", "brackets"):
            raise ValueError("interval style must be 'question' or 'brackets'")
        return runtime.flint_backend().realIntervalToString(
            self._native, 0 if style == "question" else 1
        )

    def __repr__(self) -> str:
        return self.str()

    __str__ = __repr__
    toString = __repr__


@runtime.lightweight_math_class
class ComplexIntervalFieldElement(sage.Element):
    """A certified complex rectangle backed by an owned Acb value."""

    def __init__(self, parent: Any, native_value: Any) -> None:
        self._parent = parent
        self._native = native_value
        runtime.object.freeze(self)

    def _new(self, native_value: Any) -> ComplexIntervalFieldElement:
        return ComplexIntervalFieldElement(self._parent, native_value)

    def _binary(self, operation: int, other: Any) -> ComplexIntervalFieldElement:
        right = self._parent(other)
        return self._new(
            runtime.flint_backend().complexIntervalBinary(
                operation, self._native, right._native, self.precision()
            )
        )

    def _add_(self, other: ComplexIntervalFieldElement) -> ComplexIntervalFieldElement:
        return self._binary(0, other)

    def _sub_(self, other: ComplexIntervalFieldElement) -> ComplexIntervalFieldElement:
        return self._binary(1, other)

    def _mul_(self, other: ComplexIntervalFieldElement) -> ComplexIntervalFieldElement:
        return self._binary(2, other)

    def _truediv_(
        self, other: ComplexIntervalFieldElement
    ) -> ComplexIntervalFieldElement:
        return self._binary(3, other)

    def _eq_(self, other: ComplexIntervalFieldElement) -> bool:
        return runtime.flint_backend().complexIntervalRelation(
            0, self._native, other._native
        )

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __radd__(self, other: object) -> ComplexIntervalFieldElement:
        return self._parent(other)._binary(0, self)

    def __sub__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("sub", self, other)

    def __rsub__(self, other: object) -> ComplexIntervalFieldElement:
        return self._parent(other)._binary(1, self)

    def __mul__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("mul", self, other)

    def __rmul__(self, other: object) -> ComplexIntervalFieldElement:
        return self._parent(other)._binary(2, self)

    def __truediv__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("truediv", self, other)

    def __rtruediv__(self, other: object) -> ComplexIntervalFieldElement:
        return self._parent(other)._binary(3, self)

    def __pow__(self, exponent: int) -> ComplexIntervalFieldElement:
        exponent = runtime.integer_bigint(exponent)
        return self._new(
            runtime.flint_backend().complexIntervalPowInt(
                self._native, exponent, self.precision()
            )
        )

    def __neg__(self) -> ComplexIntervalFieldElement:
        return self._unary("neg")

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __contains__(self, value: Any) -> bool:
        try:
            candidate = self._parent(value)
        except Exception:
            return False
        return runtime.flint_backend().complexIntervalRelation(
            1, self._native, candidate._native
        )

    def _unary(self, operation: str) -> ComplexIntervalFieldElement:
        return self._new(
            runtime.flint_backend().complexIntervalUnary(
                _COMPLEX_INTERVAL_UNARY[operation],
                self._native,
                self.precision(),
            )
        )

    def precision(self) -> int:
        return self._parent.precision()

    prec = precision

    def real(self) -> RealIntervalFieldElement:
        return _real_interval_field(self.precision())._fromNative(
            runtime.flint_backend().complexIntervalPart(0, self._native)
        )

    def imag(self) -> RealIntervalFieldElement:
        return _real_interval_field(self.precision())._fromNative(
            runtime.flint_backend().complexIntervalPart(1, self._native)
        )

    def overlaps(self, other: Any) -> bool:
        right = self._parent(other)
        return runtime.flint_backend().complexIntervalRelation(
            2, self._native, right._native
        )

    def sqrt(self) -> ComplexIntervalFieldElement:
        return self._unary("sqrt")

    def exp(self) -> ComplexIntervalFieldElement:
        return self._unary("exp")

    def log(self) -> ComplexIntervalFieldElement:
        return self._unary("log")

    def sin(self) -> ComplexIntervalFieldElement:
        return self._unary("sin")

    def cos(self) -> ComplexIntervalFieldElement:
        return self._unary("cos")

    def tan(self) -> ComplexIntervalFieldElement:
        return self._unary("tan")

    def str(self, style: str = "question") -> str:
        style = str(style)
        if style not in ("question", "brackets"):
            raise ValueError("interval style must be 'question' or 'brackets'")
        return runtime.flint_backend().complexIntervalToString(
            self._native, 0 if style == "question" else 1
        )

    def __repr__(self) -> str:
        return self.str()

    __str__ = __repr__
    toString = __repr__


def _exact_numerator_denominator(value: Any) -> tuple[Any, Any]:
    if isinstance(value, sage.Rational):
        return value._numerator, value._denominator
    return runtime.integer_bigint(value), runtime.integer_bigint(1)


def _real_interval_exact(field: Any, value: Any) -> RealIntervalFieldElement:
    numerator, denominator = _exact_numerator_denominator(value)
    return RealIntervalFieldElement(
        field,
        runtime.flint_backend().realIntervalFromRational(
            numerator, denominator, field._precision
        ),
    )


def _real_interval_bound(field: Any, value: Any, rounding: str) -> Any:
    if isinstance(value, RealNumberElement):
        return _real_field(field._precision, rnd=rounding)(value)
    return _real_field(field._precision, rnd=rounding)(value)


def real_interval_element(
    field: Any,
    value: Any,
    upper: Any = runtime.undefined,
) -> RealIntervalFieldElement:
    backend = runtime.flint_backend()
    if upper is runtime.undefined and isinstance(value, RealIntervalFieldElement):
        if value._parent is field:
            return value
        return RealIntervalFieldElement(
            field, backend.realIntervalRound(value._native, field._precision)
        )
    if upper is runtime.undefined and isinstance(value, (list, tuple)):
        if len(value) != 2:
            raise ValueError("an interval endpoint pair must have length 2")
        value, upper = value[0], value[1]
    if upper is runtime.undefined and (
        isinstance(value, sage.Rational) or runtime.is_exact_integer(value)
    ):
        return _real_interval_exact(field, value)
    if upper is runtime.undefined:
        lower_value = _real_interval_bound(field, value, "RNDD")
        upper_value = _real_interval_bound(field, value, "RNDU")
    else:
        lower_value = _real_interval_bound(field, value, "RNDD")
        upper_value = _real_interval_bound(field, upper, "RNDU")
    return RealIntervalFieldElement(
        field,
        backend.realIntervalFromBounds(
            lower_value._native, upper_value._native, field._precision
        ),
    )


def complex_interval_element(
    field: Any,
    value: Any,
    imag: Any = runtime.undefined,
) -> ComplexIntervalFieldElement:
    backend = runtime.flint_backend()
    if imag is runtime.undefined and isinstance(value, ComplexIntervalFieldElement):
        if value._parent is field:
            return value
        return ComplexIntervalFieldElement(
            field, backend.complexIntervalRound(value._native, field._precision)
        )
    real_field = _real_interval_field(field._precision)
    if imag is runtime.undefined and isinstance(value, ComplexNumberElement):
        imag = value.imag()
        value = value.real()
    if imag is runtime.undefined and getattr(value, "_tree", None) == "ImaginaryUnit":
        imag = 1
        value = 0
    real_part = real_field(value)
    imaginary_part = real_field(0 if imag is runtime.undefined else imag)
    return ComplexIntervalFieldElement(
        field,
        backend.complexIntervalFromParts(
            real_part._native, imaginary_part._native, field._precision
        ),
    )


def real_interval_from_native(
    field: Any, native_value: Any
) -> RealIntervalFieldElement:
    """Wrap a checked native Arb resource in the given field."""
    if runtime.flint_backend().realIntervalPrecision(native_value) != field._precision:
        raise ValueError("native real interval has the wrong precision")
    return RealIntervalFieldElement(field, native_value)


def complex_interval_from_native(
    field: Any, native_value: Any
) -> ComplexIntervalFieldElement:
    """Wrap a checked native Acb resource in the given field."""
    if (
        runtime.flint_backend().complexIntervalPrecision(native_value)
        != field._precision
    ):
        raise ValueError("native complex interval has the wrong precision")
    return ComplexIntervalFieldElement(field, native_value)
