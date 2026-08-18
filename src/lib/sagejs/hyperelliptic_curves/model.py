"""Exact models for genus-2 and genus-3 hyperelliptic curves."""

from __future__ import annotations

from typing import Any, Iterator

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


def _frobenius_module() -> Any:
    return __import__(
        "sagejs.hyperelliptic_curves.frobenius",
        fromlist=["reference_lpolynomial_coefficients"],
    )


def _base_characteristic(base: Any) -> int:
    if getattr(base, "_kind", None) == "QQ":
        return 0
    characteristic = _untyped(getattr(base, "characteristic", None))
    if not callable(characteristic):
        raise TypeError("the hyperelliptic curve base must be QQ or a finite field")
    return int(_untyped(characteristic()))


def _is_finite_field(base: Any) -> bool:
    return getattr(base, "_kind", None) in ["GF", "GF_EXTENSION"]


def _integer_lcm(left: Any, right: Any) -> Any:
    left = sage.ZZ(left)
    right = sage.ZZ(right)
    if left < 0:
        left = -left
    if right < 0:
        right = -right
    if left == 0 or right == 0:
        return sage.ZZ(0)
    first = left
    second = right
    while second != 0:
        first, second = second, first % second
    return left // first * right


def _coerce_polynomial(value: Any) -> Any:
    parent = getattr(value, "parent", None)
    if not callable(parent):
        raise TypeError("f must be a univariate polynomial")
    ring = parent()
    if not hasattr(ring, "base_ring") or not hasattr(ring, "variable_name"):
        raise TypeError("f must be a univariate polynomial")
    return value


def _evaluate_over_base(polynomial: Any, value: Any, base: Any) -> Any:
    answer = base(0)
    for coefficient in reversed(polynomial.list()):
        answer = answer * value + base(coefficient)
    return answer


def _model_genus(f: Any, h: Any, characteristic: int) -> int:
    if characteristic != 2:
        branch = h * h + 4 * f
        degree = branch.degree()
    else:
        degree = max(f.degree(), 2 * h.degree())
    if degree < 5:
        raise ValueError(
            "a genus-2 or genus-3 model must have branch degree at least 5"
        )
    genus = (degree - 1) // 2
    if genus not in [2, 3] or degree not in [2 * genus + 1, 2 * genus + 2]:
        raise NotImplementedError("only genus-2 and genus-3 models are supported")
    return genus


def _validate_smooth_model(f: Any, h: Any, genus: int, characteristic: int) -> None:
    if characteristic != 2:
        branch = h * h + 4 * f
        if branch.gcd(branch.derivative()).degree() != 0:
            raise ValueError("hyperelliptic curve is singular")
        return

    if h.is_zero():
        raise ValueError("a smooth characteristic-2 model requires nonzero h")
    obstruction = f.derivative() ** 2 + f * h.derivative() ** 2
    if h.gcd(obstruction).degree() != 0:
        raise ValueError("hyperelliptic curve is singular")
    model_degree = max(f.degree(), 2 * h.degree())
    if model_degree == 2 * genus + 2 and h.degree() != genus + 1:
        raise ValueError(
            "the characteristic-2 even-degree model is not smooth at infinity"
        )


class HyperellipticCurvePoint(sage.Element):
    """A rational point in the curve's standard weighted coordinates."""

    def __init__(
        self,
        curve: HyperellipticCurve_generic,
        x_value: Any = None,
        y_value: Any = None,
        infinity: bool = False,
        check: bool = True,
    ) -> None:
        self._parent = curve
        self._infinity = infinity
        base = curve.base_ring()
        if infinity:
            self._x = base(1)
            self._y = base(0 if y_value is None else y_value)
            if check and self._y not in curve._infinity_values():
                raise ValueError("point is not at infinity on this curve")
        else:
            self._x = base(x_value)
            self._y = base(y_value)
            if check and not curve._contains_affine(self._x, self._y):
                raise ValueError("point is not on the hyperelliptic curve")
        runtime.object.freeze(self)

    def parent(self) -> HyperellipticCurve_generic:
        return self._parent

    curve = parent

    def is_at_infinity(self) -> bool:
        return self._infinity

    def xy(self) -> Any:
        if self._infinity:
            raise ZeroDivisionError("a point at infinity has no affine coordinates")
        return runtime.math_tuple([self._x, self._y])

    def __getitem__(self, index: int) -> Any:
        if index == 0:
            return self._x
        if index == 1:
            return self._y
        if index == 2:
            return self._parent.base_ring()(0 if self._infinity else 1)
        raise IndexError("hyperelliptic-curve point index out of range")

    def __iter__(self) -> Iterator[Any]:
        yield self[0]
        yield self[1]
        yield self[2]

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, HyperellipticCurvePoint)
            and self._parent is other._parent
            and self._infinity == other._infinity
            and self._x == other._x
            and self._y == other._y
        )

    def __hash__(self) -> int:
        return hash((id(self._parent), self._infinity, repr(self._x), repr(self._y)))

    def __repr__(self) -> str:
        z_value = self._parent.base_ring()(0 if self._infinity else 1)
        return "(" + str(self._x) + " : " + str(self._y) + " : " + str(z_value) + ")"

    __str__ = __repr__
    toString = __repr__


class HyperellipticCurve_generic(sage.Parent):
    """A smooth genus-2 or genus-3 model `y^2 + h*y = f`."""

    def __init__(
        self,
        f: Any,
        h: Any = 0,
        names: Any = None,
        check_squarefree: bool = True,
    ) -> None:
        f = _coerce_polynomial(f)
        ring = f.parent()
        base = ring.base_ring()
        if getattr(base, "_kind", None) != "QQ" and not _is_finite_field(base):
            raise TypeError("the hyperelliptic curve base must be QQ or a finite field")
        h = ring(h)
        characteristic = _base_characteristic(base)
        genus = _model_genus(f, h, characteristic)
        if f.degree() > 2 * genus + 2 or h.degree() > genus + 1:
            raise ValueError(
                "the equation must be a reduced hyperelliptic model of its genus"
            )
        if check_squarefree:
            _validate_smooth_model(f, h, genus, characteristic)

        self._kind = "HyperellipticCurve"
        self._base = base
        self._ring = ring
        self._f = f
        self._h = h
        self._genus = genus
        self._characteristic = characteristic
        self._check_squarefree = check_squarefree
        self._frobenius_cache: dict[str, list[int]] = {}
        self._names = names
        self._construction = {
            "kind": "HyperellipticCurve",
            "f": f,
            "h": h,
            "names": names,
            "check_squarefree": check_squarefree,
        }

    def base_ring(self) -> Any:
        return self._base

    def genus(self) -> int:
        return self._genus

    def hyperelliptic_polynomials(self) -> Any:
        return runtime.math_tuple([self._f, self._h])

    def is_smooth(self) -> bool:
        try:
            _validate_smooth_model(
                self._f,
                self._h,
                self._genus,
                self._characteristic,
            )
            return True
        except ValueError:
            return False

    def change_ring(self, base: Any) -> HyperellipticCurve_generic:
        ring = sage.PolynomialRing(base, self._ring.variable_name())
        return HyperellipticCurve_generic(
            ring(self._f),
            ring(self._h),
            self._names,
            self._check_squarefree,
        )

    base_extend = change_ring

    def _smalljac_integral_model_data(self) -> dict[str, Any]:
        """Return exact coefficient data for a private smalljac adapter.

        If `D` clears every coefficient denominator and `M=g+2`, the change
        `X=D*x`, `Y=D^M*y` gives integral coefficients
        `h_i*D^(M-i)` and `f_i*D^(2M-i)`. Primes dividing `D` are excluded
        from this particular model transformation.
        """
        if self._base is not sage.QQ and getattr(self._base, "_kind", None) != "QQ":
            raise TypeError("smalljac integral model data requires a curve over QQ")
        denominator = sage.ZZ(1)
        for value in self._f.list() + self._h.list():
            denominator = _integer_lcm(denominator, getattr(value, "_denominator", 1))
        y_weight = self._genus + 2

        def scaled_coefficients(polynomial: Any, weight: int) -> list[Any]:
            result = []
            for index, value in enumerate(polynomial.list()):
                scaled = value * denominator ** (weight - index)
                if getattr(scaled, "_denominator", 1) != 1:
                    raise ArithmeticError("failed to clear a model coefficient")
                result.append(sage.ZZ(getattr(scaled, "_numerator", scaled)))
            return result

        return {
            "f_coefficients": scaled_coefficients(self._f, 2 * y_weight),
            "h_coefficients": scaled_coefficients(self._h, y_weight),
            "excluded_denominator": denominator,
            "transform_scale": denominator,
            "y_weight": y_weight,
            "transform": "X=D*x, Y=D^M*y",
        }

    def _contains_affine(self, x_value: Any, y_value: Any) -> bool:
        h_at_x = _evaluate_over_base(self._h, x_value, self._base)
        f_at_x = _evaluate_over_base(self._f, x_value, self._base)
        return y_value * y_value + h_at_x * y_value == f_at_x

    def _infinity_values(self) -> list[Any]:
        if not _is_finite_field(self._base):
            if max(self._f.degree(), 2 * self._h.degree()) % 2 == 1:
                return [self._base(0)]
            raise NotImplementedError(
                "rational points at infinity are currently enumerated over finite fields"
            )
        return _frobenius_module().infinity_values(self)

    def __call__(
        self,
        coordinates: Any = 0,
        y_value: Any = runtime.undefined,
        check: bool = True,
    ) -> HyperellipticCurvePoint:
        if y_value is not runtime.undefined:
            return HyperellipticCurvePoint(self, coordinates, y_value, check=check)
        values = list(coordinates)
        if len(values) == 2:
            return HyperellipticCurvePoint(self, values[0], values[1], check=check)
        if len(values) != 3:
            raise ValueError("hyperelliptic-curve points need two or three coordinates")
        if values[2] == 0:
            return HyperellipticCurvePoint(
                self,
                y_value=values[1],
                infinity=True,
                check=check,
            )
        z_value = self._base(values[2])
        return HyperellipticCurvePoint(
            self,
            self._base(values[0]) / z_value,
            self._base(values[1]) / z_value ** (self._genus + 1),
            check=check,
        )

    def points(self) -> list[HyperellipticCurvePoint]:
        return _frobenius_module().rational_points(self)

    def _lpolynomial_coefficients(self, algorithm: str = "auto") -> list[int]:
        if not self.is_smooth():
            raise ArithmeticError("Frobenius is only defined for a smooth curve")
        selected = _frobenius_module().select_lpolynomial_algorithm(self, algorithm)
        cached = self._frobenius_cache.get(selected)
        if cached is None:
            cached = _frobenius_module().lpolynomial_coefficients(self, selected)
            self._frobenius_cache[selected] = cached
        return list(cached)

    def _reference_lpolynomial_coefficients(self) -> list[int]:
        """Return exact ascending Euler-numerator coefficients.

        This is the stable differential-oracle hook for native integrations;
        it never selects an accelerator.
        """
        return _frobenius_module().reference_lpolynomial_coefficients(self)

    def frobenius_polynomial(self, algorithm: str = "auto") -> Any:
        if not _is_finite_field(self._base):
            raise TypeError("frobenius_polynomial is only defined over a finite field")
        coefficients = self._lpolynomial_coefficients(algorithm)
        return _frobenius_module().frobenius_polynomial(coefficients)

    def local_lpolynomial(self, p: Any = None, algorithm: str = "auto") -> Any:
        if _is_finite_field(self._base):
            raise TypeError(
                "local_lpolynomial(p) is defined for curves over QQ; "
                "use frobenius_polynomial() over a finite field"
            )
        if self._base is not sage.QQ and getattr(self._base, "_kind", None) != "QQ":
            raise TypeError("local_lpolynomial requires a curve over QQ")
        if p is None:
            raise TypeError("local_lpolynomial requires a prime")
        return _frobenius_module().rational_local_lpolynomial(self, p, algorithm)

    def cardinality(
        self,
        extension_degree: Any = 1,
        algorithm: str = "auto",
    ) -> int:
        if not _is_finite_field(self._base):
            raise TypeError("cardinality is only defined over a finite field")
        degree = int(extension_degree)
        if degree < 1 or degree != extension_degree:
            raise ValueError("extension_degree must be a positive integer")
        coefficients = self._lpolynomial_coefficients(algorithm)
        return _frobenius_module().cardinality_from_lpolynomial(
            int(self._base.order()), coefficients, degree
        )

    def count_points(self, n: Any = 1, algorithm: str = "auto") -> list[int]:
        if not _is_finite_field(self._base):
            raise TypeError("count_points is only defined over a finite field")
        count = int(n)
        if count < 1 or count != n:
            raise ValueError("n must be a positive integer")
        coefficients = self._lpolynomial_coefficients(algorithm)
        q_value = int(self._base.order())
        return [
            _frobenius_module().cardinality_from_lpolynomial(
                q_value, coefficients, degree
            )
            for degree in range(1, count + 1)
        ]

    def zeta_function(self, algorithm: str = "auto") -> Any:
        if not _is_finite_field(self._base):
            raise TypeError("zeta_function is only defined over a finite field")
        return _frobenius_module().zeta_function(
            int(self._base.order()), self._lpolynomial_coefficients(algorithm)
        )

    def jacobian(self) -> Any:
        module = __import__(
            "sagejs.hyperelliptic_curves.jacobian",
            fromlist=["HyperellipticJacobian"],
        )
        return module.HyperellipticJacobian(self)

    def __repr__(self) -> str:
        equation = "y^2"
        if not self._h.is_zero():
            equation += " + (" + str(self._h) + ")*y"
        return (
            "Hyperelliptic Curve over "
            + str(self._base)
            + " defined by "
            + equation
            + " = "
            + str(self._f)
        )

    __str__ = __repr__
    toString = __repr__


def HyperellipticCurve(
    f: Any,
    h: Any = 0,
    names: Any = None,
    check_squarefree: bool = True,
) -> HyperellipticCurve_generic:
    """Construct the smooth curve `y^2 + h(x)y = f(x)`."""
    return HyperellipticCurve_generic(f, h, names, check_squarefree)
