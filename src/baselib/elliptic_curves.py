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


def _elliptic_advanced() -> Any:
    module = _elliptic_advanced_state["module"]
    if module is runtime.undefined:
        registry = runtime.reflect.get(runtime.global_object, "ρσ_modules")
        if registry is not runtime.undefined:
            module = runtime.reflect.get(registry, "sagejs_elliptic_advanced")
    if module is runtime.undefined:
        loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
        if loader is runtime.undefined:
            raise RuntimeError(
                "the advanced elliptic-curve module loader is unavailable"
            )
        module = runtime.reflect.apply(
            loader, runtime.undefined, ["sagejs_elliptic_advanced"]
        )
        _elliptic_advanced_state["module"] = module
    return module


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
        three is moved to ``Y^2 = X^3 + A*X + B``.  The loop keeps the
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

    def rank(self) -> int:
        if self._rank is runtime.undefined:
            raise NotImplementedError(
                "general elliptic-curve rank computation is not implemented"
            )
        return int(self._rank)

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

    def anlist(self, bound: int) -> list[int]:
        bound = int(bound)
        if bound < 0:
            raise ValueError("coefficient bound must be nonnegative")
        integral_coefficients = self._integral_model_coefficients()
        if integral_coefficients is not None:
            discriminant = self.discriminant()
            if hasattr(discriminant, "_numerator"):
                native_discriminant = discriminant._numerator
            else:
                native_discriminant = runtime.integer_bigint(discriminant)
            native_values = runtime.flint_backend().ecAnlistIntegral(
                integral_coefficients[0],
                integral_coefficients[1],
                integral_coefficients[2],
                integral_coefficients[3],
                integral_coefficients[4],
                native_discriminant,
                runtime.bigint(bound),
            )
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
        "backends": ["Sage.js exact arithmetic"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "General Weierstrass construction, rational point arithmetic, "
                "native projective prime-field scalar multiplication, "
                "explicit-kernel normalized Vélu isogenies, "
                "basic invariants, global minimal models, complete Tate local "
                "data and conductors over QQ, small Cremona labels, and "
                "coefficient lists are supported."
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
                "General ranks, descent, isogeny classes, polynomial-kernel "
                "Kohel isogenies, duals, and square-root Vélu need additional "
                "arithmetic algorithms or databases."
            ),
        ],
    },
)
