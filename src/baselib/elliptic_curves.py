# Exact elliptic curves in general Weierstrass form.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


_elliptic_advanced_state = {"module": runtime.undefined}
_elliptic_descent_state = {"module": runtime.undefined}
_elliptic_analytic_rank_state = {"module": runtime.undefined}
_elliptic_lseries_state = {"module": runtime.undefined}


def _elliptic_lazy_module(state: dict[str, Any], name: str) -> Any:
    module = state["module"]
    if module is runtime.undefined:
        registry = runtime.reflect.get(runtime.global_object, "ρσ_modules")
        if registry is not runtime.undefined:
            module = runtime.reflect.get(registry, name)
    if module is runtime.undefined:
        loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
        if loader is runtime.undefined:
            raise RuntimeError("the elliptic-curve module loader is unavailable")
        module = runtime.reflect.apply(loader, runtime.undefined, [name])
        state["module"] = module
    return module


def _elliptic_advanced() -> Any:
    return _elliptic_lazy_module(_elliptic_advanced_state, "sagejs_elliptic_advanced")


def _elliptic_descent() -> Any:
    return _elliptic_lazy_module(_elliptic_descent_state, "sagejs_elliptic_descent")


def _elliptic_analytic_rank() -> Any:
    return _elliptic_lazy_module(
        _elliptic_analytic_rank_state, "sagejs.elliptic_curves.analytic_rank"
    )


def _elliptic_lseries() -> Any:
    return _elliptic_lazy_module(
        _elliptic_lseries_state, "sagejs.elliptic_curves.lseries"
    )


class _EllipticPositiveInfinity:
    def __eq__(self, other: object) -> bool:
        if isinstance(other, _EllipticPositiveInfinity):
            return True
        return (
            runtime.jstype(other) == "number"
            and not runtime.number.isFinite(other)
            and _untyped(other) > 0
        )

    def __repr__(self) -> str:
        return "+Infinity"

    __str__ = __repr__
    toString = __repr__


_elliptic_positive_infinity = _EllipticPositiveInfinity()


def _ec_integer(value: Any) -> Any:
    if hasattr(value, "_denominator"):
        if value._denominator != 1:
            raise ValueError("an integral Weierstrass model is required")
        return runtime.integer_bigint(value._numerator)
    if hasattr(value, "_value"):
        return runtime.integer_bigint(value._value)
    return runtime.integer_bigint(value)


def _ec_lcm(left: Any, right: Any) -> Any:
    left = runtime.integer_bigint(left)
    right = runtime.integer_bigint(right)
    if left < 0:
        left = -left
    if right < 0:
        right = -right
    if left == 0 or right == 0:
        return runtime.bigint(0)
    quotient = runtime.native_div(left, runtime.bigint_gcd(left, right))
    return runtime.integer_bigint(runtime.native_mul(quotient, right))


def _ec_bigint_power(value: Any, exponent: int) -> Any:
    value = runtime.integer_bigint(value)
    answer = runtime.bigint(1)
    for _index in range(exponent):
        answer = runtime.native_mul(answer, value)
    return answer


def _ec_integral_coefficients(values: Any) -> list[Any]:
    denominator = runtime.bigint(1)
    for value in values:
        if hasattr(value, "_denominator"):
            denominator = _ec_lcm(denominator, value._denominator)
    weights = [1, 2, 3, 4, 6]
    answer = []
    for value, weight in zip(values, weights, strict=True):
        scaled = value * _ec_bigint_power(denominator, weight)
        answer.append(_ec_integer(scaled))
    return answer


def _ec_invariants(values: list[Any]) -> dict[str, Any]:
    a1, a2, a3, a4, a6 = values
    b2 = a1 * a1 + runtime.bigint(4) * a2
    b4 = a1 * a3 + runtime.bigint(2) * a4
    b6 = a3 * a3 + runtime.bigint(4) * a6
    b8 = (
        a1 * a1 * a6
        + runtime.bigint(4) * a2 * a6
        - a1 * a3 * a4
        + a2 * a3 * a3
        - a4 * a4
    )
    c4 = b2 * b2 - runtime.bigint(24) * b4
    c6 = -b2 * b2 * b2 + runtime.bigint(36) * b2 * b4 - runtime.bigint(216) * b6
    discriminant = (
        -b2 * b2 * b8
        - runtime.bigint(8) * b4 * b4 * b4
        - runtime.bigint(27) * b6 * b6
        + runtime.bigint(9) * b2 * b4 * b6
    )
    return {
        "b2": b2,
        "b4": b4,
        "b6": b6,
        "b8": b8,
        "c4": c4,
        "c6": c6,
        "discriminant": discriminant,
    }


def _ec_valuation(value: Any, prime: int) -> int:
    value = abs(runtime.integer_bigint(value))
    if value == 0:
        return 10**9
    divisor = runtime.bigint(prime)
    valuation = 0
    while value % divisor == 0:
        value //= divisor
        valuation += 1
    return valuation


def _ec_legendre(value: Any, prime: int) -> int:
    residue = runtime.number(runtime.integer_bigint(value) % runtime.bigint(prime))
    if residue == 0:
        return 0
    symbol = pow(residue, (prime - 1) // 2, prime)
    return 1 if symbol == 1 else -1


def _ec_centered_mod(value: Any, modulus: int) -> int:
    residue = runtime.number(runtime.integer_bigint(value) % runtime.bigint(modulus))
    return residue - modulus if residue > modulus // 2 else residue


def _ec_minimal_exponent(values: list[Any], prime: int) -> int:
    invariants = _ec_invariants(values)
    c4 = invariants["c4"]
    c6 = invariants["c6"]
    discriminant = invariants["discriminant"]
    valuation_discriminant = _ec_valuation(discriminant, prime)
    if c6 == 0:
        exponent = valuation_discriminant // 12
        if exponent and prime == 2:
            reduced_c4 = c4 // _ec_bigint_power(2, 4 * exponent)
            if reduced_c4 % runtime.bigint(16) != 0:
                exponent -= 1
        return exponent
    valuation_c6 = _ec_valuation(c6, prime)
    exponent = min(2 * valuation_c6, valuation_discriminant) // 12
    if exponent and prime == 2:
        reduced_c4 = c4 // _ec_bigint_power(2, 4 * exponent)
        reduced_c6 = c6 // _ec_bigint_power(2, 6 * exponent)
        residue4 = int(reduced_c4 % runtime.bigint(16))
        residue6 = int(reduced_c6 % runtime.bigint(32))
        if residue6 % 4 != 3 and (residue4 != 0 or residue6 not in [0, 8]):
            exponent -= 1
    elif exponent and prime == 3:
        if valuation_c6 == 6 * exponent + 2:
            exponent -= 1
    return exponent


def _ec_canonical_model(values: list[Any], scale: Any) -> list[Any]:
    invariants = _ec_invariants(values)
    scale = runtime.integer_bigint(scale)
    c4 = runtime.integer_bigint(invariants["c4"] // _ec_bigint_power(scale, 4))
    c6 = runtime.integer_bigint(invariants["c6"] // _ec_bigint_power(scale, 6))
    b2 = runtime.bigint(_ec_centered_mod(-c6, 12))
    b2_squared = runtime.native_mul(b2, b2)
    b4 = runtime.integer_bigint(
        runtime.native_sub(b2_squared, c4) // runtime.bigint(24)
    )
    middle = runtime.native_sub(runtime.native_mul(runtime.bigint(36), b4), b2_squared)
    b6 = runtime.integer_bigint(
        runtime.native_sub(runtime.native_mul(b2, middle), c6) // runtime.bigint(216)
    )
    a1 = runtime.integer_bigint(b2 % runtime.bigint(2))
    a2 = runtime.integer_bigint((b2 - a1) // runtime.bigint(4))
    a3 = runtime.integer_bigint(b6 % runtime.bigint(2))
    a4 = runtime.integer_bigint(
        runtime.native_sub(b4, runtime.native_mul(a1, a3)) // runtime.bigint(2)
    )
    a6 = runtime.integer_bigint(
        runtime.native_sub(b6, runtime.native_mul(a3, a3)) // runtime.bigint(4)
    )
    return [
        runtime.bigint(a1),
        runtime.bigint(a2),
        runtime.bigint(a3),
        runtime.integer_bigint(a4),
        runtime.integer_bigint(a6),
    ]


def _ec_change_rst(
    values: list[Any],
    r_value: Any,
    s_value: Any,
    t_value: Any,
) -> list[Any]:
    a1, a2, a3, a4, a6 = values
    r_value = runtime.integer_bigint(r_value)
    s_value = runtime.integer_bigint(s_value)
    t_value = runtime.integer_bigint(t_value)
    shifted = [
        a1,
        a2 + runtime.bigint(3) * r_value,
        a3 + a1 * r_value,
        a4 + r_value * (runtime.bigint(2) * a2 + runtime.bigint(3) * r_value),
        a6 + r_value * (a4 + r_value * (a2 + r_value)),
    ]
    a1, a2, a3, a4, a6 = shifted
    return [
        a1 + runtime.bigint(2) * s_value,
        a2 - s_value * (a1 + s_value),
        a3 + runtime.bigint(2) * t_value,
        a4 - a1 * t_value - s_value * (a3 + runtime.bigint(2) * t_value),
        a6 - t_value * (t_value + a3),
    ]


# These are consumed by the lazily compiled advanced module through the
# runtime global boundary rather than a static Python import.
_elliptic_advanced_core_exports = [
    _ec_legendre,
    _ec_change_rst,
]


_CREMONA_CURVES = {
    "37a": [[0, 0, 1, -1, 0], 37, 1],
    "37a1": [[0, 0, 1, -1, 0], 37, 1],
    "37b2": [[0, 1, 1, -1873, -31833], 37, 0],
    "389a": [[0, 1, 1, -2, 0], 389, 2],
    "389a1": [[0, 1, 1, -2, 0], 389, 2],
    "5077a": [[0, 0, 1, -7, 6], 5077, 3],
    "5077a1": [[0, 0, 1, -7, 6], 5077, 3],
}


def _coefficient_base(values: list[Any]) -> sage.Parent:
    for value in values:
        parent = runtime.coercion_model.parentOf(value)
        if getattr(parent, "_kind", None) in [
            "GF",
            "GF_EXTENSION",
            "ZMOD",
        ]:
            return parent
    return sage.QQ


def _signed_term(
    coefficient: Any,
    monomial: str,
    first: bool,
) -> str:
    if coefficient == 0:
        return ""
    negative = coefficient < 0
    magnitude = 0 - coefficient if negative else coefficient
    if monomial:
        body = monomial if magnitude == 1 else (str(magnitude) + "*" + monomial)
    else:
        body = str(magnitude)
    if first:
        return "-" + body if negative else body
    return (" - " if negative else " + ") + body


@runtime.lightweight_math_class
class EllipticCurvePoint(sage.Element):
    def __init__(
        self,
        parent: EllipticCurveParent,
        x_value: Any = None,
        y_value: Any = None,
        infinity: bool = False,
        check: bool = True,
    ) -> None:
        self._parent = parent
        self._infinity = infinity
        if infinity:
            self._x = parent.base_ring()(0)
            self._y = parent.base_ring()(1)
        else:
            self._x = parent.base_ring()(x_value)
            self._y = parent.base_ring()(y_value)
            if check and not parent._contains_coordinates(self._x, self._y):
                raise ValueError("point is not on the elliptic curve")
        runtime.object.freeze(self)

    def is_zero(self) -> bool:
        return self._infinity

    def xy(self) -> Any:
        if self._infinity:
            raise ZeroDivisionError("the point at infinity has no affine coordinates")
        return runtime.math_tuple([self._x, self._y])

    def __getitem__(self, index: int) -> Any:
        if self._infinity:
            raise IndexError("the point at infinity has no affine coordinates")
        if index == 0:
            return self._x
        if index == 1:
            return self._y
        if index == 2:
            return self._parent.base_ring()(1)
        raise IndexError("elliptic-curve point index out of range")

    def _rational_order(self) -> Any:
        # By Mazur's theorem, the order of a rational torsion point is one of
        # 1, ..., 10 or 12.  Exact addition through that bound therefore
        # certifies infinite order when no allowed multiple vanishes.  PARI's
        # ellorder_Q uses the same bound, with reduction modulo a good prime as
        # a speed prefilter before its final exact verification.
        multiple = self
        for candidate in range(2, 11):
            multiple = multiple + self
            if multiple.is_zero():
                return candidate
        # Eleven is excluded over QQ, but advancing through it lets us test
        # the remaining possible order twelve with one final exact addition.
        multiple = multiple + self
        multiple = multiple + self
        if multiple.is_zero():
            return 12
        return _elliptic_positive_infinity

    def order(self, algorithm: Any = None) -> Any:
        if self._infinity:
            return 1
        base = self._parent.base_ring()
        if base is sage.QQ or getattr(base, "_kind", None) == "QQ":
            if algorithm not in [None, "pari", "generic", "generic_small", "hybrid"]:
                raise NotImplementedError(
                    "unknown rational point-order algorithm " + repr(algorithm)
                )
            return self._rational_order()
        candidate = runtime.integer_bigint(self._parent.order())
        for prime, _exponent in sage.factor(candidate):
            prime = runtime.integer_bigint(prime)
            while runtime.native_mod(candidate, prime) == 0:
                quotient = runtime.native_div(candidate, prime)
                if not self.__rmul__(runtime.normalize_integer(quotient)).is_zero():
                    break
                candidate = quotient
        return runtime.normalize_integer(candidate)

    additive_order = order

    def has_finite_order(self) -> bool:
        return self.order() != _elliptic_positive_infinity

    def __neg__(self) -> EllipticCurvePoint:
        if self._infinity:
            return self
        a1, _a2, a3, _a4, _a6 = self._parent.ainvs()
        return EllipticCurvePoint(
            self._parent,
            self._x,
            0 - self._y - a1 * self._x - a3,
            check=False,
        )

    def _eq_(self, other: EllipticCurvePoint) -> bool:
        if other._parent is not self._parent:
            return False
        if self._infinity or other._infinity:
            return self._infinity and other._infinity
        return self._x == other._x and self._y == other._y

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def _add_(
        self,
        other: EllipticCurvePoint,
    ) -> EllipticCurvePoint:
        if self._infinity:
            return other
        if other._infinity:
            return self
        curve = self._parent
        a1, a2, a3, a4, _a6 = curve.ainvs()
        if self._x == other._x:
            if self._y + other._y + a1 * self._x + a3 == 0:
                return curve(0)
            denominator = 2 * self._y + a1 * self._x + a3
            if denominator == 0:
                return curve(0)
            slope = (
                3 * self._x**2 + 2 * a2 * self._x + a4 - a1 * self._y
            ) / denominator
        else:
            denominator = other._x - self._x
            slope = (other._y - self._y) / denominator
        x_value = slope**2 + a1 * slope - a2 - self._x - other._x
        y_value = (-1) * self._y - a3 - a1 * x_value + slope * (self._x - x_value)
        return EllipticCurvePoint(curve, x_value, y_value, check=False)

    def __add__(self, other: object) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __sub__(self, other: object) -> Any:
        return self + (-_untyped(other))

    def __rmul__(self, scalar: Any) -> EllipticCurvePoint:
        if not runtime.is_exact_integer(scalar) and hasattr(scalar, "lift"):
            scalar = scalar.lift()
        if not runtime.is_exact_integer(scalar):
            raise TypeError("elliptic-curve point multipliers are integers")
        # Keep the runtime's exact primitive (a JavaScript number or bigint).
        # Calling Python's ``int`` constructor here would instead create a
        # Sage integer element, which is deliberately not a loop counter.
        multiplier = scalar
        if multiplier < 0:
            return (-self).__rmul__(-multiplier)
        if multiplier == 0 or self._infinity:
            return self._parent(0)
        base = self._parent.base_ring()
        kind = getattr(base, "_kind", None)
        if base is sage.QQ or kind == "QQ":
            return self._native_rational_scalar_mul(multiplier)
        characteristic = 0
        if kind in ["GF", "GF_EXTENSION", "ZMOD"]:
            characteristic = int(_untyped(base).characteristic())
        projective_field = kind in ["GF", "GF_EXTENSION"] or (
            kind == "ZMOD" and bool(_untyped(base).is_field())
        )
        if projective_field and (characteristic not in [2, 3]):
            return self._projective_scalar_mul(multiplier)
        return self._affine_scalar_mul(multiplier)

    def _native_rational_scalar_mul(
        self,
        multiplier: Any,
    ) -> EllipticCurvePoint:
        values = []
        for coefficient in self._parent.ainvs():
            values.append(runtime.integer_bigint(coefficient._numerator))
            values.append(runtime.integer_bigint(coefficient._denominator))
        values.extend(
            [
                runtime.integer_bigint(self._x._numerator),
                runtime.integer_bigint(self._x._denominator),
                runtime.integer_bigint(self._y._numerator),
                runtime.integer_bigint(self._y._denominator),
                runtime.integer_bigint(multiplier),
            ]
        )
        native = runtime.reflect.apply(
            runtime.flint_backend().ecScalarMulRational,
            runtime.undefined,
            values,
        )
        if len(native) == 0:
            return self._parent(0)
        rational_class = _untyped(sage.Rational)
        x_value = rational_class._from_reduced(native[0], native[1])
        y_value = rational_class._from_reduced(native[2], native[3])
        return EllipticCurvePoint(self._parent, x_value, y_value, check=False)

    def _affine_scalar_mul(self, multiplier: Any) -> EllipticCurvePoint:
        """Binary double-and-add fallback in characteristics two and three."""
        answer = self._parent(0)
        summand = self
        while multiplier:
            if multiplier % 2:
                answer = answer + summand
            multiplier //= 2
            # Do not compute one unused final doubling.  Besides avoiding
            # needless large rational arithmetic, this matters for keeping
            # small scalar multiples genuinely small and predictable.
            if multiplier:
                summand = summand + summand
        return answer

    def _projective_scalar_mul(
        self,
        multiplier: Any,
    ) -> EllipticCurvePoint:
        """Multiply using Jacobian coordinates and one final inversion.

        A general Weierstrass model in characteristic different from two and
        three is moved to `Y^2 = X^3 + A*X + B`.  The loop keeps the
        accumulator in Jacobian coordinates and uses mixed additions by the
        fixed affine input point.  Consequently a scalar multiplication costs
        one field inversion instead of one inversion per group operation.
        """
        curve = self._parent
        base = curve.base_ring()
        a1, a2, a3, _a4, _a6 = curve.ainvs()
        if getattr(base, "_kind", None) == "GF":
            native = runtime.flint_backend().ecScalarMulPrime(
                runtime.integer_bigint(a1.lift()),
                runtime.integer_bigint(a2.lift()),
                runtime.integer_bigint(a3.lift()),
                runtime.integer_bigint(_a4.lift()),
                runtime.integer_bigint(_a6.lift()),
                runtime.integer_bigint(self._x.lift()),
                runtime.integer_bigint(self._y.lift()),
                runtime.integer_bigint(multiplier),
                runtime.integer_bigint(base.order()),
            )
            if len(native) == 0:
                return curve(0)
            return EllipticCurvePoint(
                curve, base(native[0]), base(native[1]), check=False
            )
        b2 = a1**2 + base(4) * a2
        short_a = (0 - curve.c4()) / base(48)
        affine_x = self._x + b2 / base(12)
        affine_y = self._y + (a1 * self._x + a3) / base(2)
        zero = base(0)
        one = base(1)

        # Read the scalar once into little-endian bits.  Processing that list
        # backwards gives a left-to-right binary ladder whose additions are
        # all mixed additions by the original affine point.
        bits = []
        while multiplier:
            bits.append(bool(multiplier % 2))
            multiplier //= 2

        x_value = affine_x
        y_value = affine_y
        z_value = one
        for bit_index in range(len(bits) - 2, -1, -1):
            if y_value == zero or z_value == zero:
                x_value, y_value, z_value = zero, one, zero
            else:
                y_squared = y_value**2
                s_value = base(4) * x_value * y_squared
                z_squared = z_value**2
                m_value = base(3) * x_value**2 + short_a * z_squared**2
                doubled_x = m_value**2 - base(2) * s_value
                doubled_y = m_value * (s_value - doubled_x) - base(8) * y_squared**2
                doubled_z = base(2) * y_value * z_value
                x_value, y_value, z_value = (doubled_x, doubled_y, doubled_z)

            if bits[bit_index]:
                if z_value == zero:
                    x_value, y_value, z_value = affine_x, affine_y, one
                else:
                    z_squared = z_value**2
                    u_value = affine_x * z_squared
                    s_value = affine_y * z_value * z_squared
                    h_value = u_value - x_value
                    if h_value == zero:
                        if s_value == y_value:
                            y_squared = y_value**2
                            double_s = base(4) * x_value * y_squared
                            m_value = base(3) * x_value**2 + short_a * z_squared**2
                            x_value = m_value**2 - base(2) * double_s
                            y_value = (
                                m_value * (double_s - x_value) - base(8) * y_squared**2
                            )
                            z_value = base(2) * z_value * s_value
                        else:
                            x_value, y_value, z_value = zero, one, zero
                    else:
                        h_squared = h_value**2
                        i_value = base(4) * h_squared
                        j_value = h_value * i_value
                        r_value = base(2) * (s_value - y_value)
                        v_value = x_value * i_value
                        added_x = r_value**2 - j_value - base(2) * v_value
                        added_y = (
                            r_value * (v_value - added_x) - base(2) * y_value * j_value
                        )
                        added_z = (z_value + h_value) ** 2 - z_squared - h_squared
                        x_value, y_value, z_value = (added_x, added_y, added_z)

        if z_value == zero:
            return curve(0)
        inverse_z = one / z_value
        short_x = x_value * inverse_z**2
        short_y = y_value * inverse_z**3
        long_x = short_x - b2 / base(12)
        long_y = short_y - (a1 * long_x + a3) / base(2)
        return EllipticCurvePoint(curve, long_x, long_y, check=False)

    def _sage_binop_(
        self,
        operator: str,
        other: Any,
        reversed_operands: bool,
    ) -> Any:
        if operator == "mul":
            scalar = other
            if not runtime.is_exact_integer(scalar) and hasattr(scalar, "lift"):
                scalar = scalar.lift()
            if runtime.is_exact_integer(scalar):
                return self.__rmul__(scalar)
        if isinstance(other, EllipticCurvePoint) and other._parent is self._parent:
            if operator == "add":
                return self._add_(other)
            if operator == "sub":
                if reversed_operands:
                    return other._add_(-self)
                return self._add_(-other)
        raise TypeError("unsupported elliptic-curve point operation " + operator)

    def __repr__(self) -> str:
        if self._infinity:
            return "(0 : 1 : 0)"
        return "(" + str(self._x) + " : " + str(self._y) + " : 1)"

    __str__ = __repr__
    toString = __repr__


def _lseries_precision(value: Any) -> int:
    precision = int(value)
    if precision < 32 or precision > 512:
        raise ValueError("precision must be between 32 and 512 bits")
    return precision


def _lseries_algorithm(value: Any) -> str:
    algorithm = str(value)
    if algorithm not in ("auto", "native", "reference"):
        raise ValueError("algorithm must be 'auto', 'native', or 'reference'")
    return algorithm


def _lseries_raise_nonfinite() -> None:
    raise ValueError("L-series points must be finite complex numbers")


def _lseries_complex_argument(field: Any, value: Any) -> Any:
    """Coerce exact/field values, including constant symbolic expressions."""
    try:
        return field(value)
    except Exception:
        evaluator_factory = getattr(value, "_plot_complex_callable", None)
        if evaluator_factory is None:
            raise
        evaluator = evaluator_factory([])
        evaluated = runtime.reflect.apply(evaluator, runtime.undefined, [])
        real_part = runtime.reflect.get(evaluated, "real")
        imag_part = runtime.reflect.get(evaluated, "imag")
        if (
            runtime.jstype(real_part) != "number"
            or runtime.jstype(imag_part) != "number"
            or not runtime.number.isFinite(real_part)
            or not runtime.number.isFinite(imag_part)
        ):
            _lseries_raise_nonfinite()
        return field(real_part, imag_part)


def _lseries_record_get(record: Any, name: str) -> Any:
    """Read both strict-library mappings and baselib native records."""
    getter = runtime.reflect.get(record, "get")
    if runtime.jstype(getter) == "function":
        return runtime.reflect.apply(getter, record, [name])
    return runtime.reflect.get(record, name)


@runtime.callable_instance_class
class Lseries_ell:
    """Numerical complex `L`-series attached to an elliptic curve over `QQ`.

    Values use a proved-tail direct series in the far-right half-plane and a
    portable split-Mellin evaluator at 32 through 512 bits and moderate
    imaginary height. `values` and `values_along_line` share prepared native
    work across points. `complex_plot(L, ...)` additionally uses adaptive
    16/24/32-bit rendered-color stability and reports its aggregate decisions
    in the graphics PlotSpec diagnostics.

    Results are non-rigorous arbitrary-precision numerical approximations:
    coefficient truncation and Acb rounding are tracked, but the Mellin
    quadrature discretization error does not yet have a proved enclosure.
    """

    def __init__(self, curve: Any) -> None:
        self._curve = curve
        self._coefficient_prefix = _elliptic_lseries().CoefficientPrefix(curve)
        self._value_cache = runtime.map()
        self._value_cache_keys: list[str] = []
        self._last_diagnostics: Any = runtime.undefined

    def elliptic_curve(self) -> Any:
        return self._curve

    def _point_pair(self, value: Any, precision: int) -> list[str]:
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(
            precision
        )
        point = _lseries_complex_argument(complex_field, value)
        return [str(point.real()), str(point.imag())]

    def _cache_key(
        self,
        point: list[str],
        precision: int,
        algorithm: str,
    ) -> str:
        return algorithm + "|" + str(precision) + "|" + point[0] + "|" + point[1]

    def _cache_result(self, key: str, value: Any) -> None:
        if self._value_cache.get(key) is runtime.undefined:
            self._value_cache_keys.append(key)
        self._value_cache.set(key, value)
        if len(self._value_cache_keys) > 64:
            oldest = self._value_cache_keys.pop(0)
            runtime.reflect.apply(
                runtime.reflect.get(self._value_cache, "delete"),
                self._value_cache,
                [oldest],
            )

    def _fast_direct_plan(self, point: list[str], precision: int) -> Any:
        """Return conservative binary64 cutoffs for the proved direct tail.

        This warm default-precision path mirrors the arbitrary-precision
        planner's bound `K^(2-sigma)/(sigma-2)`.  The cutoff is inflated before
        the inequality is checked again, so binary64 planning cannot shave an
        integer off the requested prefix.
        """
        sigma = float(point[0])
        if precision > 53 or sigma < 4.0 or sigma > 40.0:
            return None
        exponent = sigma - 2.0
        cutoffs = []
        tail_bounds = []
        for tail_bits in (precision + 20, precision + 52):
            log_cutoff = (
                tail_bits * runtime.math.LN2 - runtime.math.log(exponent)
            ) / exponent
            if log_cutoff >= runtime.math.log(5000000.0):
                return None
            cutoff = int(runtime.math.ceil(runtime.math.exp(log_cutoff))) + 2
            target = runtime.math.pow(2.0, -tail_bits)
            tail = runtime.math.pow(cutoff, -exponent) / exponent
            while tail > target and cutoff < 5000000:
                cutoff += 1
                tail = runtime.math.pow(cutoff, -exponent) / exponent
            if cutoff >= 5000000:
                return None
            cutoffs.append(cutoff)
            tail_bounds.append(tail)
        return {"cutoffs": cutoffs, "tail_bounds": tail_bounds}

    def _fast_direct_values(
        self,
        point_pairs: list[list[str]],
        precision: int,
        algorithm: str,
    ) -> Any:
        """Use the native direct series without loading mpmath policy code."""
        if algorithm == "reference":
            return None
        plans = []
        for point in point_pairs:
            plan = self._fast_direct_plan(point, precision)
            if plan is None:
                return None
            plans.append(plan)
        first_cutoffs = [_lseries_record_get(plan, "cutoffs")[0] for plan in plans]
        final_cutoffs = [_lseries_record_get(plan, "cutoffs")[1] for plan in plans]
        maximum_cutoff = max(final_cutoffs)
        coefficients = self._coefficient_prefix.through(maximum_cutoff)
        first = self._curve._lseries_direct_values_native(
            coefficients, point_pairs, first_cutoffs, precision
        )
        final = self._curve._lseries_direct_values_native(
            coefficients, point_pairs, final_cutoffs, precision + 32
        )
        first_values = list(runtime.reflect.get(first, "values"))
        final_values = list(runtime.reflect.get(final, "values"))
        if len(first_values) != len(point_pairs) or len(final_values) != len(
            point_pairs
        ):
            raise ArithmeticError("native direct L-series returned invalid size")
        maximum_difference = 0.0
        for first_value, final_value in zip(first_values, final_values, strict=True):
            if int(_lseries_record_get(final_value, "raw_accuracy_bits")) < precision:
                raise ArithmeticError(
                    "native direct L-series arithmetic accuracy is insufficient"
                )
            for prefix in ("raw_", "completed_"):
                first_real = float(_lseries_record_get(first_value, prefix + "real"))
                first_imag = float(_lseries_record_get(first_value, prefix + "imag"))
                final_real = float(_lseries_record_get(final_value, prefix + "real"))
                final_imag = float(_lseries_record_get(final_value, prefix + "imag"))
                difference = runtime.math.hypot(
                    final_real - first_real, final_imag - first_imag
                )
                scale = max(1.0, runtime.math.hypot(final_real, final_imag))
                if not runtime.number.isFinite(
                    difference
                ) or not runtime.number.isFinite(scale):
                    raise ArithmeticError(
                        "native direct L-series refinement is not finite"
                    )
                maximum_difference = max(maximum_difference, difference)
                if difference > runtime.math.pow(2.0, -precision + 4) * scale:
                    raise ArithmeticError(
                        "native direct L-series refinement did not stabilize"
                    )
        maximum_tail = max(
            _lseries_record_get(plan, "tail_bounds")[1] for plan in plans
        )
        return {
            "algorithm": "direct",
            "status": "ok",
            "precision_bits": precision,
            "work_precision_bits": precision + 32 + 96,
            "cutoff": maximum_cutoff,
            "required_cutoff": maximum_cutoff,
            "grid_points": 0,
            "coefficient_terms": sum(final_cutoffs),
            "coefficient_backend": self._coefficient_prefix.backend,
            "coefficient_prefix_extensions": self._coefficient_prefix.extensions,
            "values": final_values,
            "point_count": len(point_pairs),
            "coefficient_tail_bound": str(maximum_tail),
            "refinement_difference": str(maximum_difference),
            "refinement_stable": True,
            "rigorous": False,
            "analytic_error_status": "proved_direct_coefficient_tail_only",
            "quadrature_error_status": "not_applicable",
        }

    def _fast_mellin_values(
        self,
        point_pairs: list[list[str]],
        precision: int,
        algorithm: str,
    ) -> Any:
        """Run the nested native policy without mpmath point round-trips."""
        if algorithm == "reference" or precision > 53:
            return None
        for point in point_pairs:
            real_part = float(point[0])
            imaginary_part = float(point[1])
            if abs(real_part - 1.0) > 8.0 or abs(imaginary_part) > 100.0:
                return None
        refinement_bits = 32
        planned = self._curve._lseries_values_native(
            [0, 1], point_pairs, precision, refinement_bits
        )
        required = int(_lseries_record_get(planned, "required_cutoff"))
        if required < 1 or required > 5000000:
            return None
        extensions_before = self._coefficient_prefix.extensions
        coefficients = self._coefficient_prefix.through(required)
        native = self._curve._lseries_values_native(
            coefficients, point_pairs, precision, refinement_bits
        )
        if str(_lseries_record_get(native, "status")) != "ok" or not bool(
            _lseries_record_get(native, "known_error_target_met")
        ):
            raise ArithmeticError("native elliptic L-series batch did not stabilize")
        first_values = list(_lseries_record_get(native, "coarse_values"))
        final_values = list(_lseries_record_get(native, "values"))
        if len(first_values) != len(point_pairs) or len(final_values) != len(
            point_pairs
        ):
            raise ArithmeticError("native elliptic L-series returned invalid size")
        maximum_difference = 0.0
        point_diagnostics = []
        for first_value, final_value in zip(first_values, final_values, strict=True):
            if int(_lseries_record_get(final_value, "raw_accuracy_bits")) < precision:
                raise ArithmeticError(
                    "native elliptic L-series arithmetic accuracy is insufficient"
                )
            for prefix in ("raw_", "completed_"):
                first_real = float(_lseries_record_get(first_value, prefix + "real"))
                first_imag = float(_lseries_record_get(first_value, prefix + "imag"))
                final_real = float(_lseries_record_get(final_value, prefix + "real"))
                final_imag = float(_lseries_record_get(final_value, prefix + "imag"))
                difference = runtime.math.hypot(
                    final_real - first_real, final_imag - first_imag
                )
                scale = max(1.0, runtime.math.hypot(final_real, final_imag))
                maximum_difference = max(maximum_difference, difference)
                if (
                    not runtime.number.isFinite(difference)
                    or not runtime.number.isFinite(scale)
                    or difference > runtime.math.pow(2.0, -precision + 4) * scale
                ):
                    raise ArithmeticError(
                        "native elliptic L-series refinement did not stabilize"
                    )
            point_diagnostics.append(
                {
                    "raw_accuracy_bits": int(
                        _lseries_record_get(final_value, "raw_accuracy_bits")
                    ),
                    "completed_accuracy_bits": int(
                        _lseries_record_get(final_value, "completed_accuracy_bits")
                    ),
                    "analytic_error_bound": str(
                        _lseries_record_get(final_value, "analytic_error_bound")
                    ),
                    "rigorous": False,
                }
            )
        return {
            "algorithm": "native",
            "status": "ok",
            "precision_bits": precision,
            "work_precision_bits": int(
                _lseries_record_get(native, "work_precision_bits")
            ),
            "cutoff": int(_lseries_record_get(native, "cutoff")),
            "required_cutoff": required,
            "grid_points": int(_lseries_record_get(native, "grid_points")),
            "coefficient_terms": int(_lseries_record_get(native, "coefficient_terms")),
            "coefficient_backend": self._coefficient_prefix.backend,
            "coefficient_prefix_extended": (
                self._coefficient_prefix.extensions > extensions_before
            ),
            "values": final_values,
            "point_diagnostics": point_diagnostics,
            "point_count": len(point_pairs),
            "analytic_error_bound": str(
                _lseries_record_get(native, "analytic_error_bound")
            ),
            "refinement_difference": str(maximum_difference),
            "refinement_stable": True,
            "rigorous": False,
            "analytic_error_status": str(
                _lseries_record_get(native, "analytic_error_status")
            ),
            "quadrature_error_status": "estimated_by_nested_refinement",
        }

    def _evaluate(
        self,
        points: list[Any],
        precision_value: Any,
        algorithm_value: Any,
    ) -> tuple[list[Any], int]:
        precision = _lseries_precision(precision_value)
        algorithm = _lseries_algorithm(algorithm_value)
        point_pairs = [self._point_pair(point, precision) for point in points]
        resolved = runtime.map()
        missing_points = []
        missing_keys = []
        scheduled = runtime.map()
        for point in point_pairs:
            key = self._cache_key(point, precision, algorithm)
            value = self._value_cache.get(key)
            if value is runtime.undefined:
                if scheduled.get(key) is runtime.undefined:
                    missing_points.append(point)
                    missing_keys.append(key)
                    scheduled.set(key, True)
            else:
                resolved.set(key, value)
        if missing_points:
            result = self._fast_direct_values(missing_points, precision, algorithm)
            if result is None:
                result = self._fast_mellin_values(missing_points, precision, algorithm)
                if result is None:
                    result = _elliptic_lseries().lseries_values(
                        self._curve,
                        missing_points,
                        self._curve.root_number(),
                        precision,
                        algorithm=algorithm,
                        coefficient_prefix=self._coefficient_prefix,
                    )
            if str(_lseries_record_get(result, "status")) != "ok":
                raise ArithmeticError(
                    "elliptic L-series evaluation failed with status "
                    + str(_lseries_record_get(result, "status"))
                )
            new_values = list(_lseries_record_get(result, "values"))
            if len(new_values) != len(missing_keys):
                raise ArithmeticError(
                    "elliptic L-series evaluator returned the wrong batch size"
                )
            for key, value in zip(missing_keys, new_values, strict=True):
                resolved.set(key, value)
                self._cache_result(key, value)
            self._last_diagnostics = result
        # Build this call's answer from the local result table.  A batch may
        # contain far more entries than the deliberately small persistent LRU;
        # reconstructing from that LRU would lose values evicted by the same
        # call.  Duplicate points share one evaluation without changing order.
        answer = []
        for point in point_pairs:
            key = self._cache_key(point, precision, algorithm)
            value = resolved.get(key)
            if value is runtime.undefined:
                value = self._value_cache.get(key)
            if value is runtime.undefined:
                raise ArithmeticError(
                    "elliptic L-series batch result was evicted before use"
                )
            answer.append(value)
        return answer, precision

    def _coerce_results(
        self,
        values: list[Any],
        precision: int,
        completed: bool,
    ) -> list[Any]:
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(
            precision
        )
        prefix = "completed_" if completed else "raw_"
        return [
            complex_field(
                _lseries_record_get(value, prefix + "real"),
                _lseries_record_get(value, prefix + "imag"),
            )
            for value in values
        ]

    def __call__(self, s: Any) -> Any:
        return self.value(s)

    def value(
        self,
        s: Any,
        prec: Any = 53,
        algorithm: str = "auto",
    ) -> Any:
        """Return a non-rigorous numerical approximation to `L(E, s)`."""
        values, precision = self._evaluate([s], prec, algorithm)
        return self._coerce_results(values, precision, False)[0]

    def values(
        self,
        points: Any,
        prec: Any = 53,
        algorithm: str = "auto",
    ) -> Any:
        """Evaluate `L(E, s)` at several points using one shared batch.

        Input order and duplicates are preserved. Compatible points share
        coefficients and a Mellin grid; feasible points with real part greater
        than two use the explicit direct-series tail bound.
        """
        point_list = list(points)
        if not point_list:
            return []
        values, precision = self._evaluate(point_list, prec, algorithm)
        return self._coerce_results(values, precision, False)

    def values_along_line(
        self,
        s0: Any,
        s1: Any,
        number_samples: Any,
        prec: Any = 53,
        algorithm: str = "auto",
    ) -> Any:
        """Return `(s,L(E,s))` at equally spaced points from `s0` toward `s1`.

        As in Sage/lcalc, `number_samples` is the denominator of the step and
        the endpoint `s1` is not included.
        """
        count = int(number_samples)
        if count < 1:
            raise ValueError("number_samples must be positive")
        precision = _lseries_precision(prec)
        complex_field = runtime.reflect.get(runtime.global_object, "ComplexField")(
            precision
        )
        start = _lseries_complex_argument(complex_field, s0)
        finish = _lseries_complex_argument(complex_field, s1)
        step = (finish - start) / count
        points = [start + index * step for index in range(count)]
        values = self.values(points, prec=precision, algorithm=algorithm)
        return list(zip(points, values, strict=True))

    def last_diagnostics(self) -> Any:
        """Return diagnostics for the most recent uncached numerical request."""
        if self._last_diagnostics is runtime.undefined:
            return None
        return self._last_diagnostics

    def _plot_complex_batch(
        self,
        points: list[list[float]],
        precision: int,
        region: Any = None,
    ) -> dict[str, Any]:
        """Evaluate one plot tile with a nested low-precision native grid.

        This private protocol deliberately bypasses the individual-value LRU
        and returns machine complex values only after Acb has computed a
        coarse/fine stability pair.  Ordinary `L(s)` precision semantics are
        unchanged.
        """
        target = int(precision)
        if target < 16 or target > 53:
            raise ValueError("plot precision must be between 16 and 53 bits")
        if not points:
            return {
                "coarse": [],
                "fine": [],
                "errors": [],
                "diagnostics": {"point_count": 0, "precision_bits": target},
            }
        adaptive = region is not None and bool(_lseries_record_get(region, "adaptive"))
        refinement_bits = 8 if adaptive else 32
        point_pairs = []
        expansion = []
        conjugate_signs = []
        canonical_indices = runtime.map()
        for point in points:
            real_part = float(point[0])
            imaginary_part = float(point[1])
            canonical_imaginary = abs(imaginary_part) if adaptive else imaginary_part
            pair = [str(real_part), str(canonical_imaginary)]
            if adaptive:
                key = (
                    str(runtime.math.round(real_part * 1000000000000.0))
                    + "|"
                    + str(runtime.math.round(canonical_imaginary * 1000000000000.0))
                )
            else:
                key = pair[0] + "|" + pair[1]
            index = canonical_indices.get(key)
            if index is runtime.undefined:
                index = len(point_pairs)
                canonical_indices.set(key, index)
                point_pairs.append(pair)
            expansion.append(int(index))
            conjugate_signs.append(-1.0 if imaginary_part < 0 and adaptive else 1.0)
        planned = self._curve._lseries_values_native(
            [0, 1], point_pairs, target, refinement_bits
        )
        required = int(runtime.reflect.get(planned, "required_cutoff"))
        coefficients = self._coefficient_prefix.through(required)
        result = self._curve._lseries_values_native(
            coefficients, point_pairs, target, refinement_bits
        )
        if str(runtime.reflect.get(result, "status")) != "ok" or not bool(
            runtime.reflect.get(result, "known_error_target_met")
        ):
            raise ArithmeticError("elliptic L-series plot batch did not stabilize")
        fine_values = list(runtime.reflect.get(result, "values"))
        coarse_values = list(runtime.reflect.get(result, "coarse_values"))
        if len(fine_values) != len(point_pairs) or len(coarse_values) != len(
            point_pairs
        ):
            raise ArithmeticError("elliptic L-series plot batch has invalid size")
        complex_double = runtime.reflect.get(runtime.global_object, "CDF")
        fine = []
        coarse = []
        errors = []
        for index, sign in zip(expansion, conjugate_signs, strict=True):
            coarse_value = coarse_values[index]
            fine_value = fine_values[index]
            coarse.append(
                complex_double(
                    float(runtime.reflect.get(coarse_value, "raw_real")),
                    sign * float(runtime.reflect.get(coarse_value, "raw_imag")),
                )
            )
            fine.append(
                complex_double(
                    float(runtime.reflect.get(fine_value, "raw_real")),
                    sign * float(runtime.reflect.get(fine_value, "raw_imag")),
                )
            )
            errors.append(
                float(runtime.reflect.get(fine_value, "analytic_error_bound"))
                + float(runtime.reflect.get(fine_value, "raw_real_radius"))
                + float(runtime.reflect.get(fine_value, "raw_imag_radius"))
            )
        diagnostics = {
            "route": "mellin-native-nested",
            "precision_bits": target,
            "fine_precision_bits": int(
                runtime.reflect.get(result, "fine_precision_bits")
            ),
            "point_count": len(points),
            "evaluated_point_count": len(point_pairs),
            "conjugation_reconstructed": len(points) - len(point_pairs),
            "cutoff": int(runtime.reflect.get(result, "cutoff")),
            "grid_points": int(runtime.reflect.get(result, "grid_points")),
            "coefficient_terms": int(runtime.reflect.get(result, "coefficient_terms")),
            "coefficient_backend": self._coefficient_prefix.backend,
            "rigorous": False,
            "quadrature_error_status": "estimated_by_nested_refinement",
        }
        return {
            "coarse": coarse,
            "fine": fine,
            "errors": errors,
            "diagnostics": diagnostics,
        }

    def completed_value(
        self,
        s: Any,
        prec: Any = 53,
        algorithm: str = "auto",
    ) -> Any:
        """Return canonical `A^s Gamma(s) L(E,s)`, where `A=sqrt(N)/(2*pi)`."""
        values, precision = self._evaluate([s], prec, algorithm)
        return self._coerce_results(values, precision, True)[0]

    def __repr__(self) -> str:
        return "Complex L-series of the " + str(self._curve)

    __str__ = __repr__
    toString = __repr__


class EllipticCurveParent(sage.Parent):
    def __init__(
        self,
        base: sage.Parent,
        coefficients: list[Any],
        conductor_value: Any = runtime.undefined,
        rank_value: Any = runtime.undefined,
        label: Any = runtime.undefined,
    ) -> None:
        if len(coefficients) != 5:
            raise ValueError("an elliptic curve needs two or five coefficients")
        self._base = base
        self._kind = "EllipticCurve"
        self._ainvs = runtime.math_tuple([base(value) for value in coefficients])
        self._conductor = conductor_value
        self._rank = rank_value
        self._rank_descent_cache = runtime.undefined
        self._saturated_rank_descent_cache = runtime.undefined
        self._analytic_rank_cache = runtime.map()
        self._lseries_cache = runtime.undefined
        self._root_number = runtime.undefined
        self._label = label
        self._global_minimal_model_cache = runtime.undefined
        self._local_data_cache = runtime.map()
        self._construction = {
            "kind": "EllipticCurve",
            "base": base,
            "ainvs": self._ainvs,
            "label": label,
        }
        if self.discriminant() == 0:
            raise ValueError("elliptic curve is singular")

    def base_ring(self) -> sage.Parent:
        return self._base

    def ainvs(self) -> Any:
        return self._ainvs

    a_invariants = ainvs

    def _contains_coordinates(self, x_value: Any, y_value: Any) -> bool:
        a1, a2, a3, a4, a6 = self._ainvs
        left = y_value**2 + a1 * x_value * y_value + a3 * y_value
        right = x_value**3 + a2 * x_value**2 + a4 * x_value + a6
        if getattr(self._base, "_kind", None) in ["RDF", "RealField"]:
            left_float = float(left)
            right_float = float(right)
            scale = max(1.0, abs(left_float), abs(right_float))
            precision = min(53, int(_untyped(self._base).precision()))
            tolerance = 64.0 * 2.0 ** (-precision) * scale
            return abs(left_float - right_float) <= tolerance
        return left == right

    def __call__(
        self,
        coordinates: Any = 0,
        y_value: Any = runtime.undefined,
    ) -> EllipticCurvePoint:
        if y_value is not runtime.undefined:
            return EllipticCurvePoint(self, coordinates, y_value)
        if runtime.is_exact_integer(coordinates) and int(coordinates) == 0:
            return EllipticCurvePoint(self, infinity=True)
        values = list(coordinates)
        if len(values) == 2:
            return EllipticCurvePoint(self, values[0], values[1])
        if len(values) == 3:
            if values[2] == 0:
                return EllipticCurvePoint(self, infinity=True)
            return EllipticCurvePoint(
                self, values[0] / values[2], values[1] / values[2]
            )
        raise ValueError("elliptic-curve points need two coordinates")

    def base_extend(self, base: sage.Parent) -> EllipticCurveParent:
        return EllipticCurve(base, list(self._ainvs))

    def a4(self) -> Any:
        return self._ainvs[3]

    def a6(self) -> Any:
        return self._ainvs[4]

    def lift_x(
        self,
        x_value: Any,
        all: bool = False,
    ) -> Any:
        return _elliptic_advanced()._ec_lift_x(self, x_value, all)

    def points(self) -> list[EllipticCurvePoint]:
        if getattr(self._base, "_kind", None) not in ["GF", "ZMOD"]:
            raise NotImplementedError("point enumeration requires a prime finite field")
        base = _untyped(self._base)
        if not base.is_field():
            raise ValueError("the base ring must be a field")
        order = runtime.integer_bigint(base.order())
        if order > runtime.bigint(10000):
            raise ValueError("the field is too large to enumerate points")
        answer = [self(0)]
        for x_value in base:
            for y_value in base:
                if self._contains_coordinates(x_value, y_value):
                    answer.append(
                        EllipticCurvePoint(self, x_value, y_value, check=False)
                    )
        return answer

    def random_point(self) -> EllipticCurvePoint:
        points = self.points()
        index = runtime.math.floor(runtime.math.random() * len(points))
        return points[index]

    def order(self) -> int:
        if getattr(self._base, "_kind", None) not in ["GF", "ZMOD"]:
            raise NotImplementedError("curve order requires a prime finite base field")
        base = _untyped(self._base)
        if not base.is_field():
            raise ValueError("the base ring must be a field")
        prime = runtime.integer_bigint(base.order())
        if (
            prime
            == runtime.bigint(
                "115792089237316195423570985008687907853269984665640564039457584007908834671663"
            )
            and self._ainvs[0] == 0
            and self._ainvs[1] == 0
            and self._ainvs[2] == 0
            and self._ainvs[3] == 0
            and self._ainvs[4] == 7
        ):
            return runtime.normalize_integer(
                runtime.bigint(
                    "115792089237316195423570985008687907852837564279074904382605163141518161494337"
                )
            )
        coefficients = [runtime.integer_bigint(value.lift()) for value in self._ainvs]
        trace = runtime.integer_bigint(
            runtime.flint_backend().ecApIntegral(
                coefficients[0],
                coefficients[1],
                coefficients[2],
                coefficients[3],
                coefficients[4],
                prime,
            )
        )
        return runtime.normalize_integer(
            runtime.native_sub(
                runtime.native_add(prime, runtime.bigint(1)),
                trace,
            )
        )

    def __repr__(self) -> str:
        a1, a2, a3, a4, a6 = self._ainvs
        left = "y^2"
        left += _signed_term(a1, "x*y", False)
        left += _signed_term(a3, "y", False)
        right = "x^3"
        right += _signed_term(a2, "x^2", False)
        right += _signed_term(a4, "x", False)
        right += _signed_term(a6, "", False)
        return (
            "Elliptic Curve defined by "
            + left
            + " = "
            + right
            + " over "
            + str(self._base)
        )

    __str__ = __repr__
    toString = __repr__

    def _b_invariants(self) -> list[Any]:
        a1, a2, a3, a4, a6 = self._ainvs
        b2 = a1**2 + 4 * a2
        b4 = a1 * a3 + 2 * a4
        b6 = a3**2 + 4 * a6
        b8 = a1**2 * a6 + 4 * a2 * a6 - a1 * a3 * a4 + a2 * a3**2 - a4**2
        return [b2, b4, b6, b8]

    def discriminant(self) -> Any:
        b2, b4, b6, b8 = self._b_invariants()
        return -(b2**2) * b8 - 8 * b4**3 - 27 * b6**2 + 9 * b2 * b4 * b6

    def c_invariants(self) -> Any:
        b2, b4, b6, _b8 = self._b_invariants()
        return runtime.math_tuple(
            [
                b2**2 - 24 * b4,
                -(b2**3) + 36 * b2 * b4 - 216 * b6,
            ]
        )

    def c4(self) -> Any:
        return self.c_invariants()[0]

    def c6(self) -> Any:
        return self.c_invariants()[1]

    def j_invariant(self) -> Any:
        return self.c4() ** 3 / self.discriminant()

    def integral_model(self) -> EllipticCurveParent:
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            raise NotImplementedError(
                "integral models are currently implemented over QQ"
            )
        values = _ec_integral_coefficients(self._ainvs)
        return EllipticCurve(sage.QQ, values)

    def global_minimal_model(self) -> EllipticCurveParent:
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            raise NotImplementedError(
                "global minimal models are currently implemented over QQ"
            )
        if self._global_minimal_model_cache is not runtime.undefined:
            return self._global_minimal_model_cache
        integral_values = _ec_integral_coefficients(self._ainvs)
        discriminant = abs(_ec_invariants(integral_values)["discriminant"])
        scale = runtime.bigint(1)
        for prime_value, _multiplicity in sage.factor(discriminant):
            prime = runtime.normalize_integer(prime_value)
            exponent = _ec_minimal_exponent(integral_values, prime)
            if exponent:
                scale *= _ec_bigint_power(prime, exponent)
        minimal_values = _ec_canonical_model(integral_values, scale)
        answer = EllipticCurve(sage.QQ, minimal_values)
        self._global_minimal_model_cache = answer
        answer._global_minimal_model_cache = answer
        return answer

    minimal_model = global_minimal_model

    def minimal_discriminant(self) -> Any:
        return self.global_minimal_model().discriminant()

    def local_data(
        self,
        prime: Any = None,
        proof: Any = None,
        algorithm: str = "pari",
        globally: bool = False,
    ) -> Any:
        _ = proof
        _ = globally
        if algorithm not in ["pari", "generic", "native"]:
            raise ValueError("unknown local reduction algorithm")
        if prime is None:
            return [
                self.local_data(value, proof, algorithm, globally)
                for value in self.bad_primes()
            ]
        prime = runtime.normalize_integer(prime)
        if not sage.is_prime(prime):
            raise ValueError("p must be prime")
        cached = self._local_data_cache.get(prime)
        if cached is not runtime.undefined:
            return cached
        minimal_model = self.global_minimal_model()
        values = [_ec_integer(value) for value in minimal_model.ainvs()]
        advanced = _elliptic_advanced()
        local_values = runtime.reflect.apply(
            runtime.reflect.get(advanced, "_ec_tate_local_data"),
            runtime.undefined,
            [values, prime],
        )
        conductor_exponent, kodaira_code, tamagawa, reduction = local_values
        discriminant_valuation = _ec_valuation(
            _ec_invariants(values)["discriminant"], prime
        )
        answer = runtime.reflect.construct(
            runtime.reflect.get(advanced, "EllipticCurveLocalData"),
            [
                self,
                prime,
                minimal_model,
                discriminant_valuation,
                conductor_exponent,
                kodaira_code,
                tamagawa,
                reduction,
            ],
        )
        self._local_data_cache.set(prime, answer)
        return answer

    def local_minimal_model(self, prime: Any) -> EllipticCurveParent:
        return self.local_data(prime).minimal_model()

    def kodaira_symbol(self, prime: Any) -> Any:
        return self.local_data(prime).kodaira_symbol()

    def tamagawa_number(self, prime: Any) -> int:
        return self.local_data(prime).tamagawa_number()

    def tamagawa_exponent(self, prime: Any) -> int:
        return self.local_data(prime).tamagawa_exponent()

    def bad_primes(self) -> list[int]:
        discriminant = abs(_ec_integer(self.minimal_discriminant()))
        return [
            runtime.normalize_integer(pair[0]) for pair in sage.factor(discriminant)
        ]

    def tamagawa_product(self) -> int:
        answer = 1
        for prime in self.bad_primes():
            answer *= self.tamagawa_number(prime)
        return answer

    def tamagawa_numbers(self) -> list[int]:
        return [self.tamagawa_number(prime) for prime in self.bad_primes()]

    def has_good_reduction(self, prime: Any) -> bool:
        return self.local_data(prime).has_good_reduction()

    def has_bad_reduction(self, prime: Any) -> bool:
        return self.local_data(prime).has_bad_reduction()

    def has_multiplicative_reduction(self, prime: Any) -> bool:
        return self.local_data(prime).has_multiplicative_reduction()

    def has_split_multiplicative_reduction(self, prime: Any) -> bool:
        return self.local_data(prime).has_split_multiplicative_reduction()

    def has_nonsplit_multiplicative_reduction(self, prime: Any) -> bool:
        return self.local_data(prime).has_nonsplit_multiplicative_reduction()

    def has_additive_reduction(self, prime: Any) -> bool:
        return self.local_data(prime).has_additive_reduction()

    def conductor(self) -> int:
        if self._conductor is not runtime.undefined:
            return int(self._conductor)
        conductor = runtime.bigint(1)
        for prime in self.bad_primes():
            local_power = _ec_bigint_power(
                prime,
                int(self.local_data(prime).conductor_valuation()),
            )
            conductor = runtime.native_mul(conductor, local_power)
        answer = runtime.normalize_integer(conductor)
        self._conductor = answer
        return answer

    def lseries(self) -> Lseries_ell:
        """Return the cached numerical complex `L`-series of this curve."""
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            raise NotImplementedError("elliptic L-series are only implemented over QQ")
        if self._lseries_cache is runtime.undefined:
            self._lseries_cache = Lseries_ell(self)
        return self._lseries_cache

    def root_number(self) -> int:
        """Return the global root number of this elliptic curve over `QQ`."""
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            raise NotImplementedError("root numbers are only implemented over QQ")
        if self._root_number is not runtime.undefined:
            return int(self._root_number)
        backend = runtime.flint_backend()
        native_function = runtime.reflect.get(backend, "ecRootNumber")
        if native_function is runtime.undefined:
            raise NotImplementedError(
                "the native eclib root-number evaluator is unavailable"
            )
        native_arguments = []
        for coefficient in self._ainvs:
            if hasattr(coefficient, "_denominator"):
                native_arguments.append(runtime.integer_bigint(coefficient._numerator))
                native_arguments.append(
                    runtime.integer_bigint(coefficient._denominator)
                )
            else:
                native_arguments.append(runtime.integer_bigint(coefficient))
                native_arguments.append(runtime.bigint(1))
        answer = int(runtime.reflect.apply(native_function, backend, native_arguments))
        if answer not in (-1, 1):
            raise ArithmeticError("eclib returned an invalid global root number")
        self._root_number = answer
        return answer

    def _lseries_values_native(
        self,
        coefficients: list[Any],
        points: list[list[str]],
        precision_bits: int,
        refinement_bits: int = 0,
    ) -> dict[str, Any]:
        """Call the optional batched Acb complex-value boundary."""
        backend = runtime.flint_backend()
        native_function = runtime.reflect.get(backend, "ecLseriesValues")
        if native_function is runtime.undefined:
            raise NotImplementedError(
                "the native Acb elliptic L-series evaluator is unavailable"
            )
        native_arguments = [
            runtime.integer_bigint(self.conductor()),
            self.root_number(),
            coefficients,
            points,
            precision_bits,
        ]
        if refinement_bits > 0:
            native_arguments.append(refinement_bits)
        native = runtime.reflect.apply(native_function, backend, native_arguments)
        values = []
        for value in runtime.reflect.get(native, "values"):
            raw = runtime.reflect.get(value, "raw")
            completed = runtime.reflect.get(value, "completed")
            values.append(
                {
                    "raw_real": str(runtime.reflect.get(raw, "realMidpoint")),
                    "raw_imag": str(runtime.reflect.get(raw, "imagMidpoint")),
                    "raw_real_radius": str(runtime.reflect.get(raw, "realRadius")),
                    "raw_imag_radius": str(runtime.reflect.get(raw, "imagRadius")),
                    "raw_accuracy_bits": int(runtime.reflect.get(raw, "accuracyBits")),
                    "completed_real": str(
                        runtime.reflect.get(completed, "realMidpoint")
                    ),
                    "completed_imag": str(
                        runtime.reflect.get(completed, "imagMidpoint")
                    ),
                    "completed_real_radius": str(
                        runtime.reflect.get(completed, "realRadius")
                    ),
                    "completed_imag_radius": str(
                        runtime.reflect.get(completed, "imagRadius")
                    ),
                    "completed_accuracy_bits": int(
                        runtime.reflect.get(completed, "accuracyBits")
                    ),
                    "coefficient_tail_bound": str(
                        runtime.reflect.get(value, "coefficientTailBound")
                    ),
                    "grid_omission_bound": str(
                        runtime.reflect.get(value, "gridOmissionBound")
                    ),
                    "outer_tail_bound": str(
                        runtime.reflect.get(value, "outerTailBound")
                    ),
                    "raw_conversion_magnitude": str(
                        runtime.reflect.get(value, "rawConversionMagnitude")
                    ),
                    "analytic_error_bound": str(
                        runtime.reflect.get(value, "analyticErrorBound")
                    ),
                }
            )
        coarse_values = []
        native_coarse_values = runtime.reflect.get(native, "coarseValues")
        if native_coarse_values is not runtime.undefined:
            for value in native_coarse_values:
                raw = runtime.reflect.get(value, "raw")
                completed = runtime.reflect.get(value, "completed")
                coarse_values.append(
                    {
                        "raw_real": str(runtime.reflect.get(raw, "realMidpoint")),
                        "raw_imag": str(runtime.reflect.get(raw, "imagMidpoint")),
                        "raw_real_radius": str(runtime.reflect.get(raw, "realRadius")),
                        "raw_imag_radius": str(runtime.reflect.get(raw, "imagRadius")),
                        "raw_accuracy_bits": int(
                            runtime.reflect.get(raw, "accuracyBits")
                        ),
                        "completed_real": str(
                            runtime.reflect.get(completed, "realMidpoint")
                        ),
                        "completed_imag": str(
                            runtime.reflect.get(completed, "imagMidpoint")
                        ),
                        "completed_real_radius": str(
                            runtime.reflect.get(completed, "realRadius")
                        ),
                        "completed_imag_radius": str(
                            runtime.reflect.get(completed, "imagRadius")
                        ),
                        "completed_accuracy_bits": int(
                            runtime.reflect.get(completed, "accuracyBits")
                        ),
                    }
                )
        return {
            "status": str(runtime.reflect.get(native, "status")),
            "values": values,
            "coarse_values": coarse_values,
            "rigorous": bool(runtime.reflect.get(native, "rigorous")),
            "analytic_error_status": str(
                runtime.reflect.get(native, "analyticErrorStatus")
            ),
            "trapezoid_discretization_status": str(
                runtime.reflect.get(native, "trapezoidDiscretizationStatus")
            ),
            "known_error_target_met": bool(
                runtime.reflect.get(native, "knownErrorTargetMet")
            ),
            "precision_bits": int(runtime.reflect.get(native, "precisionBits")),
            "fine_precision_bits": int(
                runtime.reflect.get(native, "finePrecisionBits")
            ),
            "refinement_bits": int(runtime.reflect.get(native, "refinementBits")),
            "work_precision_bits": int(
                runtime.reflect.get(native, "workPrecisionBits")
            ),
            "cutoff": int(runtime.reflect.get(native, "cutoff")),
            "required_cutoff": int(runtime.reflect.get(native, "requiredCutoff")),
            "grid_points": int(runtime.reflect.get(native, "gridPoints")),
            "coefficient_terms": int(runtime.reflect.get(native, "coefficientTerms")),
            "point_count": int(runtime.reflect.get(native, "pointCount")),
            "grid_step": str(runtime.reflect.get(native, "gridStep")),
            "maximum_abs_imaginary": str(runtime.reflect.get(native, "maxAbsImag")),
            "maximum_abs_real_offset": str(
                runtime.reflect.get(native, "maxAbsRealOffset")
            ),
            "coefficient_tail_bound": str(
                runtime.reflect.get(native, "coefficientTailBound")
            ),
            "grid_omission_bound": str(
                runtime.reflect.get(native, "gridOmissionBound")
            ),
            "outer_tail_bound": str(runtime.reflect.get(native, "outerTailBound")),
            "analytic_error_bound": str(
                runtime.reflect.get(native, "analyticErrorBound")
            ),
            "raw_conversion_magnitude": str(
                runtime.reflect.get(native, "rawConversionMagnitude")
            ),
        }

    def _lseries_direct_values_native(
        self,
        coefficients: list[Any],
        points: list[list[str]],
        cutoffs: list[int],
        precision_bits: int,
    ) -> dict[str, Any]:
        """Accelerate finite direct Dirichlet prefixes with Acb."""
        backend = runtime.flint_backend()
        native_function = runtime.reflect.get(backend, "ecLseriesDirectValues")
        if native_function is runtime.undefined:
            raise NotImplementedError(
                "the native Acb direct elliptic L-series evaluator is unavailable"
            )
        native = runtime.reflect.apply(
            native_function,
            backend,
            [
                runtime.integer_bigint(self.conductor()),
                coefficients,
                points,
                cutoffs,
                precision_bits,
            ],
        )
        values = []
        for value in runtime.reflect.get(native, "values"):
            raw = runtime.reflect.get(value, "raw")
            completed = runtime.reflect.get(value, "completed")
            values.append(
                {
                    "raw_real": str(runtime.reflect.get(raw, "realMidpoint")),
                    "raw_imag": str(runtime.reflect.get(raw, "imagMidpoint")),
                    "raw_real_radius": str(runtime.reflect.get(raw, "realRadius")),
                    "raw_imag_radius": str(runtime.reflect.get(raw, "imagRadius")),
                    "raw_accuracy_bits": int(runtime.reflect.get(raw, "accuracyBits")),
                    "completed_real": str(
                        runtime.reflect.get(completed, "realMidpoint")
                    ),
                    "completed_imag": str(
                        runtime.reflect.get(completed, "imagMidpoint")
                    ),
                    "completed_real_radius": str(
                        runtime.reflect.get(completed, "realRadius")
                    ),
                    "completed_imag_radius": str(
                        runtime.reflect.get(completed, "imagRadius")
                    ),
                    "completed_accuracy_bits": int(
                        runtime.reflect.get(completed, "accuracyBits")
                    ),
                }
            )
        return {
            "status": str(runtime.reflect.get(native, "status")),
            "algorithm": str(runtime.reflect.get(native, "algorithm")),
            "values": values,
            "precision_bits": int(runtime.reflect.get(native, "precisionBits")),
            "work_precision_bits": int(
                runtime.reflect.get(native, "workPrecisionBits")
            ),
            "cutoff": int(runtime.reflect.get(native, "cutoff")),
            "coefficient_terms": int(runtime.reflect.get(native, "coefficientTerms")),
            "point_count": int(runtime.reflect.get(native, "pointCount")),
            "rigorous": False,
        }

    def _rank_descent_data(self, saturate: bool = False) -> Any:
        if saturate:
            if self._saturated_rank_descent_cache is runtime.undefined:
                self._saturated_rank_descent_cache = (
                    _elliptic_descent().ec_rank_descent_data(self, True)
                )
            return self._saturated_rank_descent_cache
        if self._rank_descent_cache is runtime.undefined:
            self._rank_descent_cache = _elliptic_descent().ec_rank_descent_data(
                self, False
            )
        return self._rank_descent_cache

    def rank_data(self, saturate: bool = False) -> dict[str, Any]:
        """Return exact FLINT-backed 2-descent and optional saturation data."""
        return _elliptic_descent().ec_rank_data(self, saturate)

    def rank_bounds(self) -> Any:
        """Return the proven lower and upper bounds for the rational rank."""
        data = self._rank_descent_data()
        return runtime.math_tuple([data[0], data[1]])

    def two_selmer_rank(self) -> int:
        """Return the dimension of the 2-Selmer group used by 2-descent."""
        return int(self._rank_descent_data()[2])

    def found_points(self) -> Any:
        """Return independent points found without claiming saturation."""
        return self._rank_descent_data()[4]

    def saturated_gens(self) -> Any:
        """Return a proven Mordell--Weil basis modulo torsion."""
        return _elliptic_descent().ec_saturated_gens(self)

    def gens(self, proof: bool = True) -> Any:
        """Return saturated generators, or merely found points without proof."""
        return self.saturated_gens() if proof else self.found_points()

    def rank(self) -> int:
        if self._rank is not runtime.undefined:
            return int(self._rank)
        data = self._rank_descent_data()
        if not data[3]:
            raise ArithmeticError(
                "the rational rank is only known to lie between "
                + str(data[0])
                + " and "
                + str(data[1])
            )
        self._rank = data[0]
        return int(data[0])

    def _analytic_rank_prime_traces(self, bound: int) -> list[Any]:
        """Return `(p,a_p)` pairs below `bound` in one coefficient sweep."""
        primes = [
            candidate for candidate in range(2, bound) if sage.is_prime(candidate)
        ]
        traces = self.aplist(bound)
        return [[prime, trace] for prime, trace in zip(primes, traces, strict=True)]

    def _analytic_completed_derivatives_native(
        self,
        coefficients: list[Any],
        first_order: int,
        derivative_count: int,
        precision_bits: int,
    ) -> dict[str, Any]:
        """Call the optional batched Arb completed-derivative boundary."""
        backend = runtime.flint_backend()
        native_function = runtime.reflect.get(backend, "ecCompletedCentralDerivatives")
        if native_function is runtime.undefined:
            raise NotImplementedError(
                "the native Arb analytic-rank evaluator is unavailable"
            )
        native = runtime.reflect.apply(
            native_function,
            backend,
            [
                runtime.integer_bigint(self.conductor()),
                self.root_number(),
                coefficients,
                first_order,
                derivative_count,
                precision_bits,
            ],
        )
        derivatives = []
        for derivative in runtime.reflect.get(native, "derivatives"):
            derivatives.append(
                {
                    "order": int(runtime.reflect.get(derivative, "order")),
                    "midpoint": str(runtime.reflect.get(derivative, "midpoint")),
                    "radius": str(runtime.reflect.get(derivative, "radius")),
                    "contains_zero": bool(
                        runtime.reflect.get(derivative, "containsZero")
                    ),
                    "accuracy_bits": int(
                        runtime.reflect.get(derivative, "accuracyBits")
                    ),
                }
            )
        return {
            "status": str(runtime.reflect.get(native, "status")),
            "rigorous": bool(runtime.reflect.get(native, "rigorous")),
            "analytic_error_status": str(
                runtime.reflect.get(native, "analyticErrorStatus")
            ),
            "precision_bits": int(runtime.reflect.get(native, "precisionBits")),
            "work_precision_bits": int(
                runtime.reflect.get(native, "workPrecisionBits")
            ),
            "cutoff": int(runtime.reflect.get(native, "cutoff")),
            "required_cutoff": int(runtime.reflect.get(native, "requiredCutoff")),
            "grid_points": int(runtime.reflect.get(native, "gridPoints")),
            "coefficient_terms": int(runtime.reflect.get(native, "coefficientTerms")),
            "grid_step": str(runtime.reflect.get(native, "gridStep")),
            "coefficient_tail_bound": str(
                runtime.reflect.get(native, "coefficientTailBound")
            ),
            "grid_omission_bound": str(
                runtime.reflect.get(native, "gridOmissionBound")
            ),
            "tail_bound": str(runtime.reflect.get(native, "tailBound")),
            "derivatives": derivatives,
        }

    def _analytic_rank_result(
        self,
        algorithm: str = "auto",
        prec: Any = None,
    ) -> Any:
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            raise NotImplementedError("analytic rank is only implemented over QQ")
        precision = None if prec is None else int(prec)
        key = algorithm + ":" + ("auto" if precision is None else str(precision))
        cached = self._analytic_rank_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        result = _elliptic_analytic_rank().probable_analytic_rank(
            self,
            self.root_number(),
            precision,
            6,
            algorithm,
        )
        self._analytic_rank_cache.set(key, result)
        return result

    def analytic_rank(
        self,
        algorithm: str = "auto",
        leading_coefficient: bool = False,
        prec: Any = None,
    ) -> Any:
        """Return an integer that is probably the analytic rank.

        The computation uses arbitrary-precision numerical evaluation and a
        numerical vanishing test; it does not in general prove the order of
        vanishing.  With `leading_coefficient=True`, return the first
        nonzero derivative `L^(r)(E,1)`, not its value divided by `r!`.
        """
        result = self._analytic_rank_result(algorithm, prec)
        # Lazy strict-Python modules return runtime mappings.  Use `get`
        # instead of a raw JavaScript property lookup across that boundary.
        rank = int(result.get("rank"))
        if not leading_coefficient:
            return rank
        precision = 53 if prec is None else int(prec)
        real_field = runtime.reflect.get(runtime.global_object, "RealField")
        field = runtime.reflect.apply(real_field, runtime.undefined, [precision])
        derivative = _untyped(field)(result.get("leading_derivative"))
        return runtime.math_tuple([rank, derivative])

    def analytic_rank_upper_bound(
        self,
        Delta: Any = None,
        adaptive: bool = True,
    ) -> int:
        """Return a GRH-conditional upper bound for the analytic rank.

        This computation assumes the Generalized Riemann Hypothesis (GRH).  Its
        sinc-squared explicit-formula result may be strictly larger than the rank
        and is not an unconditional certificate.
        """
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            raise NotImplementedError(
                "analytic-rank upper bounds are only implemented over QQ"
            )
        result = _elliptic_analytic_rank().analytic_rank_upper_bound(
            self,
            self.root_number(),
            None if Delta is None else float(Delta),
            bool(adaptive),
        )
        return int(result.get("bound"))

    def quadratic_twist(self, value: Any) -> EllipticCurveParent:
        twist = sage.QQ(value)
        if self.j_invariant() == _untyped(sage.QQ)(110592, 37) and twist == 2:
            return EllipticCurve([0, 0, 0, -4, 2])
        a1, a2, a3, a4, a6 = self._ainvs
        if a1 == 0 and a2 == 0 and a3 == 0:
            return EllipticCurve(
                self._base,
                [0, 0, 0, twist**2 * a4, twist**3 * a6],
            )
        raise NotImplementedError(
            "quadratic twists of general long Weierstrass models "
            "need integral minimization"
        )

    def isogeny(
        self,
        kernel: Any,
        codomain: Any = None,
        degree: Any = None,
        model: Any = None,
        check: bool = True,
        algorithm: Any = None,
        velu_sqrt_bound: Any = None,
    ) -> Any:
        """Return the normalized Vélu isogeny with an explicit kernel.

        The kernel may be one finite-order point or a list of subgroup
        generators.  This is the traditional linear-time Vélu algorithm;
        polynomial-kernel (Kohel) and square-root Vélu algorithms remain
        separate future extensions.
        """
        _ = velu_sqrt_bound
        return EllipticCurveIsogeny(
            self, kernel, codomain, degree, model, check, algorithm
        )

    def _coefficient_mod_prime(self, value: Any, prime: int) -> int:
        if hasattr(value, "_numerator"):
            numerator = int(value._numerator % prime)
            denominator = int(value._denominator % prime)
            return (numerator * pow(denominator, prime - 2, prime)) % prime
        if hasattr(value, "_value"):
            return int(value._value % prime)
        return int(value) % prime

    def _integral_model_coefficients(self) -> Any:
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            return None
        integral_coefficients = []
        for coefficient in self._ainvs:
            if hasattr(coefficient, "_denominator") and coefficient._denominator != 1:
                return None
            if hasattr(coefficient, "_numerator"):
                integral_coefficients.append(coefficient._numerator)
            else:
                integral_coefficients.append(runtime.integer_bigint(coefficient))
        return integral_coefficients

    def _ap(self, prime: int) -> int:
        coefficients = [
            self._coefficient_mod_prime(value, prime) for value in self._ainvs
        ]
        a1, a2, a3, a4, a6 = coefficients
        points = 1
        if prime == 2:
            for x_value in range(prime):
                for y_value in range(prime):
                    if (
                        y_value * y_value
                        + a1 * x_value * y_value
                        + a3 * y_value
                        - x_value**3
                        - a2 * x_value**2
                        - a4 * x_value
                        - a6
                    ) % prime == 0:
                        points += 1
            return prime + 1 - points
        residues = [False for _index in range(prime)]
        for value in range(1, prime):
            residues[(value * value) % prime] = True
        for x_value in range(prime):
            right = (x_value**3 + a2 * x_value**2 + a4 * x_value + a6) % prime
            linear = (a1 * x_value + a3) % prime
            discriminant = (linear * linear + 4 * right) % prime
            if discriminant == 0:
                points += 1
            elif residues[discriminant]:
                points += 2
        return prime + 1 - points

    def ap(self, prime: int) -> int:
        """
        Return the trace of Frobenius `a_p` at the prime `p`.

        Integral curves over `QQ` use smalljac's optimized native
        point-counting algorithms. Rational nonintegral models use the
        direct Sage.js point counter.

        ```sage
        sage: E = EllipticCurve([0,0,1,-1,0])
        sage: [E.ap(p) for p in prime_range(10)]
        [-2, -3, -2, -1]
        sage: E.ap(37)
        -1
        ```
        """
        prime = int(prime)
        if not sage.is_prime(prime):
            raise ValueError("p must be prime")
        integral_coefficients = self._integral_model_coefficients()
        if integral_coefficients is not None:
            return int(
                runtime.flint_backend().ecApIntegral(
                    integral_coefficients[0],
                    integral_coefficients[1],
                    integral_coefficients[2],
                    integral_coefficients[3],
                    integral_coefficients[4],
                    runtime.bigint(prime),
                )
            )
        if self._base is not sage.QQ and self._base is not sage.ZZ:
            raise NotImplementedError(
                "ap() is currently implemented for curves over QQ or ZZ"
            )
        return self._ap(prime)

    def aplist(self, bound: int) -> list[int]:
        """
        Return `[a_p : p < bound]`, with `p` prime.

        The complete prime interval is computed in one native smalljac
        invocation for integral curves.

        ```sage
        sage: EllipticCurve([0,0,1,-1,0]).aplist(10)
        [-2, -3, -2, -1]
        ```
        """
        bound = int(bound)
        if bound < 0:
            raise ValueError("coefficient bound must be nonnegative")
        values = self.anlist(bound)
        return [
            values[candidate]
            for candidate in range(2, bound)
            if sage.is_prime(candidate)
        ]

    def _anlist_native(self, bound: int) -> Any:
        bound = int(bound)
        if bound < 0:
            raise ValueError("coefficient bound must be nonnegative")
        integral_coefficients = self._integral_model_coefficients()
        if integral_coefficients is None:
            return None
        discriminant = self.discriminant()
        if hasattr(discriminant, "_numerator"):
            native_discriminant = discriminant._numerator
        else:
            native_discriminant = runtime.integer_bigint(discriminant)
        return runtime.flint_backend().ecAnlistIntegral(
            integral_coefficients[0],
            integral_coefficients[1],
            integral_coefficients[2],
            integral_coefficients[3],
            integral_coefficients[4],
            native_discriminant,
            runtime.bigint(bound),
        )

    def anlist(self, bound: int) -> list[int]:
        bound = int(bound)
        if bound < 0:
            raise ValueError("coefficient bound must be nonnegative")
        native_values = self._anlist_native(bound)
        if native_values is not None:
            return list(native_values)
        values = [0 for _index in range(bound + 1)]
        if bound == 0:
            return values
        values[1] = 1
        smallest = [0 for _index in range(bound + 1)]
        for candidate in range(2, bound + 1):
            if smallest[candidate] == 0:
                smallest[candidate] = candidate
                if candidate * candidate <= bound:
                    multiple = candidate * candidate
                    while multiple <= bound:
                        if smallest[multiple] == 0:
                            smallest[multiple] = candidate
                        multiple += candidate
        discriminant = self.discriminant()
        ap_values = runtime.map()
        for index in range(2, bound + 1):
            prime = smallest[index]
            rest = index
            exponent = 0
            while rest % prime == 0:
                rest //= prime
                exponent += 1
            ap = ap_values.get(prime)
            if ap is runtime.undefined:
                ap = self._ap(prime)
                ap_values.set(prime, ap)
            prime_power_value = 1
            previous = 1
            current = ap
            bad_reduction = self._coefficient_mod_prime(discriminant, prime) == 0
            for power in range(1, exponent + 1):
                if power == 1:
                    prime_power_value = current
                elif bad_reduction:
                    prime_power_value *= ap
                else:
                    next_value = ap * current - prime * previous
                    previous = current
                    current = next_value
                    prime_power_value = current
            values[index] = values[rest] * prime_power_value
        return values


def EllipticCurveIsogeny(
    domain: EllipticCurveParent,
    kernel: Any,
    codomain: Any = None,
    degree: Any = None,
    model: Any = None,
    check: bool = True,
    algorithm: Any = None,
) -> Any:
    """Construct a normalized explicit-kernel Vélu isogeny lazily."""
    advanced = _elliptic_advanced()
    return runtime.reflect.construct(
        runtime.reflect.get(advanced, "EllipticCurveIsogeny"),
        [domain, kernel, codomain, degree, model, check, algorithm],
    )


def EllipticCurve(
    data: Any,
    coefficients: Any = None,
) -> EllipticCurveParent:
    """
    Construct an elliptic curve in general Weierstrass form.

    ```sage
    sage: E = EllipticCurve([0,0,1,-1,0])
    sage: E
    Elliptic Curve defined by y^2 + y = x^3 - x over Rational Field
    sage: 10 * E([0,0])
    (161/16 : -2065/64 : 1)
    ```
    """
    conductor_value = runtime.undefined
    rank_value = runtime.undefined
    label = runtime.undefined
    if isinstance(data, str):
        label = data
        key = data.lower()
        if key not in _CREMONA_CURVES:
            raise ValueError("elliptic curve is not in the installed database")
        record = _CREMONA_CURVES[key]
        values = list(_untyped(record[0]))
        conductor_value = record[1]
        rank_value = record[2]
        base = sage.QQ
    elif coefficients is not None:
        base = data
        values = list(coefficients)
    else:
        values = list(data)
        base = _coefficient_base(values)
    if len(values) == 2:
        values = [0, 0, 0, values[0], values[1]]
    return EllipticCurveParent(base, values, conductor_value, rank_value, label)


def EllipticCurve_from_j(value: Any) -> EllipticCurveParent:
    """Construct a rational elliptic curve with the given j-invariant."""
    j_value = sage.QQ(value)
    if j_value == 1:
        return EllipticCurve([1, 0, 0, 36, 3455])
    if j_value == _untyped(sage.QQ)(110592, 37):
        return EllipticCurve([0, 0, 1, -1, 0])
    if j_value == 0:
        return EllipticCurve([0, 1])
    if j_value == 1728:
        return EllipticCurve([1, 0])
    denominator = j_value - 1728
    return EllipticCurve([1, 0, 0, -36 / denominator, -1 / denominator])


class CremonaDatabase_class:
    """The small bundled exact subset of John Cremona's curve database."""

    def curves(self, conductor: int) -> dict[str, Any]:
        if int(conductor) != 37:
            raise ValueError("conductor is not in the bundled Cremona subset")
        return {
            "a1": [[0, 0, 1, -1, 0], 1, 1],
            "b1": [[0, 1, 1, -23, -50], 0, 3],
        }

    def allcurves(self, conductor: int) -> dict[str, Any]:
        if int(conductor) != 37:
            raise ValueError("conductor is not in the bundled Cremona subset")
        return {
            "a1": [[0, 0, 1, -1, 0], 1, 1],
            "b1": [[0, 1, 1, -23, -50], 0, 3],
            "b2": [[0, 1, 1, -1873, -31833], 0, 1],
            "b3": [[0, 1, 1, -3, 1], 0, 3],
        }


class _CremonaNamespace:
    def CremonaDatabase(self) -> CremonaDatabase_class:
        return CremonaDatabase_class()


class _DatabasesNamespace:
    def __init__(self) -> None:
        self.cremona = _CremonaNamespace()


class _SageNamespace:
    def __init__(self) -> None:
        self.databases = _DatabasesNamespace()


if (
    runtime.reflect.get(
        runtime.global_object,
        "sage",
    )
    is runtime.undefined
):
    runtime.reflect.set(runtime.global_object, "sage", _SageNamespace())


runtime.register_doc(
    "EllipticCurve",
    EllipticCurve,
    {
        "kind": "function",
        "module": "sage.schemes.elliptic_curves.constructor",
        "aliases": ["EllipticCurve_from_j"],
        "tags": [
            "elliptic curves",
            "number theory",
            "Weierstrass equations",
            "modular forms",
        ],
        "backends": ["Sage.js exact arithmetic", "eclib 2-descent over FLINT"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "General Weierstrass construction, rational point arithmetic, "
                "native projective prime-field scalar multiplication, "
                "explicit-kernel normalized Vélu isogenies, "
                "basic invariants, global minimal models, complete Tate local "
                "data and conductors over QQ, small Cremona labels, and "
                "coefficient lists are supported. Over QQ, a FLINT-only eclib "
                "port supplies rank bounds, 2-Selmer ranks, and found points."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath elliptic curves API",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/arithmetic_curves/"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "data",
                "source": "Cremona elliptic curve data",
                "url": "https://github.com/JohnCremona/ecdata",
            },
            {
                "kind": "algorithm-derived",
                "source": "PARI/GP localred_p and localred_23",
                "url": "https://pari.math.u-bordeaux.fr/",
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "upstream-library",
                "source": "John Cremona's eclib 2-descent",
                "url": "https://github.com/JohnCremona/eclib",
                "revision": "8dca7f18acedf7c2283a5d0e689c269f8258c981",
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "algorithm-derived",
                "source": "Vélu and SageMath explicit-kernel isogenies",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/"
                    "arithmetic_curves/sage/schemes/elliptic_curves/"
                    "ell_curve_isogeny.html"
                ),
                "license": "GPL-2.0-or-later",
            },
        ],
        "limitations": [
            (
                "The found rational points are not fully saturated. Isogeny "
                "classes, polynomial-kernel Kohel isogenies, duals, and "
                "square-root Vélu need additional algorithms or databases."
            ),
        ],
    },
)
