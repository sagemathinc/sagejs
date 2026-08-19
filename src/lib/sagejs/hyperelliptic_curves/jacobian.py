"""Mumford arithmetic for odd-degree hyperelliptic Jacobians.

For a curve `y^2 + h(x)y = f(x)` with one point at infinity, a reduced
divisor class is represented by `(u,v)` with `u` monic,
`deg(v) < deg(u) <= g`, and `u | v^2 + h*v - f`. This module implements the
generalized Cantor composition and reduction algorithms in ordinary Python.
"""

from __future__ import annotations

from typing import Any, Mapping

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.hyperelliptic_curves.group_structure import (
    JacobianResourceLimitError,
    element_order_from_multiple,
    factor_integer_bounded,
    invariant_factors_from_elements,
)


def _polynomial_ring(polynomial: Any) -> Any:
    return polynomial.parent()


def _polynomial_monic(polynomial: Any) -> Any:
    if polynomial.is_zero():
        raise ZeroDivisionError("the zero polynomial cannot be made monic")
    leading = polynomial[polynomial.degree()]
    one = _polynomial_ring(polynomial).base_ring()(1)
    if leading == one:
        return polynomial
    return polynomial * (one / leading)


def _exact_quotient(numerator: Any, denominator: Any) -> Any:
    quotient, remainder = _polynomial_quo_rem(numerator, denominator)
    if not remainder.is_zero():
        raise ArithmeticError("expected an exact polynomial quotient")
    return quotient


def _polynomial_quo_rem(numerator: Any, denominator: Any) -> tuple[Any, Any]:
    """Divide dense polynomials over any coefficient field.

    Sage.js's optimized public division currently covers prime fields but not
    every extension-field representation. Keeping this tiny reference loop
    here makes the group law representation-independent.
    """
    if denominator.is_zero():
        raise ZeroDivisionError("polynomial division by zero")
    ring = _polynomial_ring(numerator)
    if _polynomial_ring(denominator) is not ring:
        denominator = ring(denominator)
    try:
        return numerator.quo_rem(denominator)
    except NotImplementedError:
        pass
    quotient = ring(0)
    remainder = numerator
    denominator_degree = denominator.degree()
    denominator_leading = denominator[denominator_degree]
    zero = ring.base_ring()(0)
    while not remainder.is_zero() and remainder.degree() >= denominator_degree:
        shift = remainder.degree() - denominator_degree
        coefficient = remainder[remainder.degree()] / denominator_leading
        term = ring([zero for _index in range(shift)] + [coefficient])
        quotient += term
        remainder -= term * denominator
    return quotient, remainder


def _polynomial_remainder(numerator: Any, denominator: Any) -> Any:
    return _polynomial_quo_rem(numerator, denominator)[1]


def _polynomial_xgcd(left: Any, right: Any) -> tuple[Any, Any, Any]:
    """Return monic `(g,s,t)` with `g = s*left + t*right` over a field."""
    ring = _polynomial_ring(left)
    if _polynomial_ring(right) is not ring:
        right = ring(right)
    old_remainder, remainder = left, right
    old_left, current_left = ring(1), ring(0)
    old_right, current_right = ring(0), ring(1)
    while not remainder.is_zero():
        quotient, next_remainder = _polynomial_quo_rem(old_remainder, remainder)
        old_remainder, remainder = remainder, next_remainder
        old_left, current_left = current_left, old_left - quotient * current_left
        old_right, current_right = current_right, old_right - quotient * current_right
    if old_remainder.is_zero():
        return ring(0), ring(1), ring(0)
    leading = old_remainder[old_remainder.degree()]
    one = ring.base_ring()(1)
    scale = one / leading
    return old_remainder * scale, old_left * scale, old_right * scale


def _coefficient_vectors(values: list[Any], length: int) -> list[list[Any]]:
    vectors: list[list[Any]] = [[]]
    for _position in range(length):
        extended: list[list[Any]] = []
        for vector in vectors:
            for value in values:
                extended.append(vector + [value])
        vectors = extended
    return vectors


def _integer_bit_length(value: Any) -> int:
    bits = 0
    while value:
        value //= 2
        bits += 1
    return bits


@runtime.lightweight_math_class
class MumfordDivisor(sage.Element):
    """A canonical reduced divisor class on an odd-degree Jacobian."""

    def __init__(self, parent: Any, u: Any, v: Any, check: bool = True) -> None:
        self._parent = parent
        ring = parent.polynomial_ring()
        u = ring(u)
        v = ring(v)
        if u.is_zero():
            raise ValueError("a Mumford u-polynomial must be nonzero")
        u = _polynomial_monic(u)
        v = _polynomial_remainder(v, u)
        if (
            check
            and not _polynomial_remainder(
                v * v + parent.h() * v - parent.f(), u
            ).is_zero()
        ):
            raise ValueError("u does not divide v^2 + h*v - f")
        u, v = parent._reduce(u, v)
        if check:
            parent._validate_reduced(u, v)
        self._u = u
        self._v = v

    def parent(self) -> Any:
        return self._parent

    def curve(self) -> Any:
        return self._parent.curve()

    def uv(self) -> tuple[Any, Any]:
        return self._u, self._v

    def degree(self) -> int:
        return self._u.degree()

    def is_zero(self) -> bool:
        return self._u.is_one() and self._v.is_zero()

    def __bool__(self) -> bool:
        return not self.is_zero()

    def __iter__(self) -> Any:
        yield self._u
        yield self._v

    def __getitem__(self, index: int) -> Any:
        return (self._u, self._v)[index]

    def __repr__(self) -> str:
        return "(" + str(self._u) + ", " + str(self._v) + ")"

    __str__ = __repr__

    def _eq_(self, other: Any) -> bool:
        return (
            isinstance(other, MumfordDivisor)
            and self._parent is other._parent
            and self._u == other._u
            and self._v == other._v
        )

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __ne__(self, other: object) -> bool:
        return not self == other

    def __hash__(self) -> int:
        return hash((id(self._parent), str(self._u), str(self._v)))

    def __reduce__(self) -> tuple[Any, tuple[Any, ...]]:
        return self._parent, ([self._u, self._v],)

    def __neg__(self) -> Any:
        u = self._u
        return self._parent._element(
            u,
            _polynomial_remainder(-self._parent.h() - self._v, u),
            False,
        )

    def _neg_(self) -> Any:
        return self.__neg__()

    def _add_(self, other: Any) -> Any:
        if not isinstance(other, MumfordDivisor) or other._parent is not self._parent:
            raise TypeError("Jacobian divisors must have the same parent")
        u, v = self._parent._compose(self._u, self._v, other._u, other._v)
        return self._parent._element(u, v, False)

    def __add__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __radd__(self, other: Any) -> Any:
        if other == 0:
            return self
        return self.__add__(other)

    def __sub__(self, other: Any) -> Any:
        return self + (-other)

    def __mul__(self, scalar: Any) -> Any:
        return self.__rmul__(scalar)

    def __rmul__(self, scalar: Any) -> Any:
        return self.scalar_multiple(scalar)

    def _scalar_multiple_reference(self, scalar: Any) -> Any:
        if not runtime.is_exact_integer(scalar) and hasattr(scalar, "lift"):
            scalar = scalar.lift()
        if not runtime.is_exact_integer(scalar):
            raise TypeError("Jacobian divisor multipliers must be integers")
        if scalar < 0:
            return (-self).__rmul__(-scalar)
        result = self._parent.zero()
        addend = self
        while scalar:
            if scalar % 2:
                result = result + addend
            scalar //= 2
            if scalar:
                addend = addend + addend
        return result

    def scalar_multiple(
        self,
        scalar: Any,
        *,
        algorithm: str = "auto",
        max_group_operations: Any = None,
    ) -> Any:
        """Return `scalar*self`, using the packed genus-3 kernel when available."""
        if algorithm not in ("auto", "native", "reference"):
            raise ValueError("unknown Jacobian scalar algorithm " + repr(algorithm))
        if algorithm != "reference":
            native = __import__(
                "sagejs.hyperelliptic_curves.jacobian_native",
                fromlist=["native_scalar_multiply"],
            )
            try:
                answer = native.native_scalar_multiply(
                    self,
                    scalar,
                    max_group_operations=max_group_operations,
                )
            except RuntimeError as error:
                raise JacobianResourceLimitError(str(error)) from error
            if answer is not None:
                return answer[0]
            if algorithm == "native":
                raise NotImplementedError(
                    "native scalar multiplication requires a supported "
                    "prime-field genus-3 Jacobian and a scalar below 2^128"
                )
        return self._scalar_multiple_reference(scalar)

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
        if isinstance(other, MumfordDivisor) and other._parent is self._parent:
            if operator == "add":
                return self._add_(other)
            if operator == "sub":
                if reversed_operands:
                    return other._add_(-self)
                return self._add_(-other)
        raise TypeError("unsupported Jacobian divisor operation " + operator)

    def order(
        self,
        multiple: Any = None,
        factorization: list[tuple[Any, int]] | None = None,
        max_trial_divisions: int = 1_000_000,
        algorithm: str = "auto",
    ) -> Any:
        """Return this element's order from a known finite group multiple."""
        if algorithm not in ("auto", "native", "reference"):
            raise ValueError("unknown Jacobian order algorithm " + repr(algorithm))
        if multiple is None:
            multiple = self._parent.order()
        if algorithm != "reference":
            native = __import__(
                "sagejs.hyperelliptic_curves.jacobian_native",
                fromlist=["native_element_order"],
            )
            if factorization is not None:
                from sagejs.hyperelliptic_curves.group_structure import (
                    validate_factorization,
                )

                validate_factorization(multiple, factorization)
            try:
                answer = native.native_element_order(self, multiple)
            except RuntimeError as error:
                raise JacobianResourceLimitError(str(error)) from error
            if answer is not None:
                return sage.ZZ(answer[0])
            if algorithm == "native":
                raise NotImplementedError(
                    "native element orders require a supported prime-field "
                    "genus-3 Jacobian"
                )
        return element_order_from_multiple(
            self,
            multiple,
            factorization,
            max_trial_divisions,
            scalar_algorithm=algorithm,
        )

    additive_order = order

    def to_data(self) -> dict[str, Any]:
        """Return a versioned exact prime-field Mumford representation."""
        return self._parent._divisor_data(self)

    def order_certificate(
        self,
        multiple: Any = None,
        factorization: list[tuple[Any, int]] | None = None,
        max_trial_divisions: int = 1_000_000,
        algorithm: str = "auto",
    ) -> dict[str, Any]:
        """Return an independently recheckable exact element-order certificate."""
        if multiple is None:
            multiple = self._parent.order()
        order = self.order(
            multiple,
            factorization,
            max_trial_divisions,
            algorithm,
        )
        order_factors = factor_integer_bounded(order, max_trial_divisions)
        certificate = {
            "schema": "sagejs.hyperelliptic.mumford-order-certificate.v1",
            "divisor": self.to_data(),
            "annihilating_multiple": str(multiple),
            "element_order": str(order),
            "prime_factors": tuple(
                (str(prime), int(exponent)) for prime, exponent in order_factors
            ),
        }
        self._parent.verify_order_certificate(certificate)
        return certificate


@runtime.callable_instance_class
class HyperellipticJacobian(sage.Parent):
    """The Jacobian of an odd-degree genus-2 or genus-3 hyperelliptic curve."""

    Element = MumfordDivisor

    def __init__(self, curve: Any) -> None:
        genus = int(curve.genus())
        if genus not in (2, 3):
            raise NotImplementedError(
                "Mumford Jacobians currently support genus 2 or 3"
            )
        f, h = curve.hyperelliptic_polynomials()
        base = curve.base_ring()
        if hasattr(base, "characteristic") and base.characteristic() == 2:
            raise NotImplementedError(
                "characteristic-2 generalized Jacobian arithmetic has not yet "
                "been validated in this implementation"
            )
        model_degree = max(f.degree(), 2 * h.degree())
        if model_degree != 2 * genus + 1:
            raise NotImplementedError(
                "Jacobian arithmetic currently requires an odd-degree model "
                "with one point at infinity"
            )
        if _polynomial_ring(f) is not _polynomial_ring(h):
            raise ValueError("f and h must belong to the same polynomial ring")
        self._curve = curve
        self._f = f
        self._h = h
        self._genus = genus
        self._ring = _polynomial_ring(f)
        self._zero: MumfordDivisor | None = None
        self._order_cache: dict[int, Any] = {}
        self._points_cache: list[MumfordDivisor] | None = None

    def curve(self) -> Any:
        return self._curve

    def base_ring(self) -> Any:
        return self._curve.base_ring()

    def polynomial_ring(self) -> Any:
        return self._ring

    def dimension(self) -> int:
        return self._genus

    genus = dimension

    def f(self) -> Any:
        return self._f

    def h(self) -> Any:
        return self._h

    def _prime_field_model_data(self) -> dict[str, Any]:
        field = self.base_ring()
        if not hasattr(field, "characteristic") or not hasattr(field, "order"):
            raise NotImplementedError("divisor serialization requires a prime field")
        prime = int(field.characteristic())
        if int(field.order()) != prime:
            raise NotImplementedError("divisor serialization requires a prime field")

        def coefficients(polynomial: Any) -> tuple[str, ...]:
            answer = []
            for value in polynomial.list():
                lifted = value.lift() if hasattr(value, "lift") else value
                answer.append(str(int(lifted) % prime))
            return tuple(answer)

        return {
            "genus": self._genus,
            "prime": str(prime),
            "f_coefficients_ascending": coefficients(self._f),
            "h_coefficients_ascending": coefficients(self._h),
        }

    def _divisor_data(self, divisor: MumfordDivisor) -> dict[str, Any]:
        if divisor.parent() is not self:
            raise ValueError("the divisor belongs to a different Jacobian")
        model = self._prime_field_model_data()
        prime = int(model["prime"])

        def coefficients(polynomial: Any) -> tuple[str, ...]:
            answer = []
            for value in polynomial.list():
                lifted = value.lift() if hasattr(value, "lift") else value
                answer.append(str(int(lifted) % prime))
            return tuple(answer)

        u_value, v_value = divisor.uv()
        return {
            "schema": "sagejs.hyperelliptic.mumford-divisor.v1",
            "curve": model,
            "u_coefficients_ascending": coefficients(u_value),
            "v_coefficients_ascending": coefficients(v_value),
        }

    def divisor_from_data(self, data: Mapping[str, Any]) -> MumfordDivisor:
        """Reconstruct and validate a versioned prime-field Mumford divisor."""
        if not hasattr(data, "get") or not hasattr(data, "__getitem__"):
            raise TypeError("divisor data must be a mapping")
        if data.get("schema") != "sagejs.hyperelliptic.mumford-divisor.v1":
            raise ValueError("unknown Mumford-divisor schema")
        if data.get("curve") != self._prime_field_model_data():
            raise ValueError("the serialized divisor belongs to a different Jacobian")
        prime = int(self.base_ring().characteristic())

        def parse(values: Any) -> list[Any]:
            answer = []
            for value in values:
                text = str(value)
                integer = int(text)
                if str(integer) != text or integer < 0 or integer >= prime:
                    raise ValueError("a serialized coefficient is not canonical")
                answer.append(self.base_ring()(integer))
            return answer

        u_value = self._ring(parse(data["u_coefficients_ascending"]))
        v_value = self._ring(parse(data["v_coefficients_ascending"]))
        return self._element(u_value, v_value, True)

    def verify_order_certificate(self, certificate: Mapping[str, Any]) -> bool:
        """Independently verify a serialized element-order certificate."""
        from sagejs.hyperelliptic_curves.group_structure import validate_factorization

        if not hasattr(certificate, "get") or not hasattr(certificate, "__getitem__"):
            raise TypeError("the certificate must be a mapping")
        if (
            certificate.get("schema")
            != "sagejs.hyperelliptic.mumford-order-certificate.v1"
        ):
            raise ValueError("unknown Mumford order-certificate schema")
        divisor = self.divisor_from_data(certificate["divisor"])
        multiple = int(certificate["annihilating_multiple"])
        order = int(certificate["element_order"])
        if multiple <= 0 or order <= 0 or multiple % order != 0:
            raise ValueError("the certificate has inconsistent positive orders")
        factors = [
            (int(prime), int(exponent))
            for prime, exponent in certificate["prime_factors"]
        ]
        validate_factorization(order, factors)
        if not divisor.scalar_multiple(order, algorithm="reference").is_zero():
            raise ArithmeticError("the claimed element order does not annihilate")
        for prime, _exponent in factors:
            if divisor.scalar_multiple(order // prime, algorithm="reference").is_zero():
                raise ArithmeticError("the claimed element order is not minimal")
        return True

    def __repr__(self) -> str:
        return "Jacobian of " + str(self._curve)

    __str__ = __repr__

    def _element(self, u: Any, v: Any, check: bool) -> MumfordDivisor:
        return MumfordDivisor(self, u, v, check)

    def __call__(self, *args: Any, check: bool = True) -> MumfordDivisor:
        if len(args) == 0 or (len(args) == 1 and args[0] == 0):
            return self.zero()
        if len(args) == 1:
            value = args[0]
            if isinstance(value, MumfordDivisor):
                if value.parent() is self:
                    return value
                u, v = value.uv()
                return MumfordDivisor(self, u, v, check)
            if isinstance(value, tuple):
                return self.point_to_divisor(value, check=check)
            if isinstance(value, list) and len(value) == 2:
                return MumfordDivisor(self, value[0], value[1], check)
            raise ValueError("expected 0, a divisor, [u,v], or an affine curve point")
        if len(args) == 2:
            if not hasattr(args[0], "degree"):
                return self.point_to_divisor(args, check=check)
            return MumfordDivisor(self, args[0], args[1], check)
        raise ValueError("a Jacobian element takes at most two arguments")

    point = __call__

    def zero(self) -> MumfordDivisor:
        if self._zero is None:
            self._zero = self._element(self._ring(1), self._ring(0), False)
        return self._zero

    def __contains__(self, value: object) -> bool:
        return isinstance(value, MumfordDivisor) and value.parent() is self

    def _validate_reduced(self, u: Any, v: Any) -> None:
        if u.is_zero() or u[u.degree()] != self.base_ring()(1):
            raise ValueError("u must be monic and nonzero")
        if u.degree() > self._genus:
            raise ValueError("the Mumford divisor is not reduced")
        if not v.is_zero() and v.degree() >= u.degree():
            raise ValueError("v must have degree smaller than u")
        if not _polynomial_remainder(v * v + self._h * v - self._f, u).is_zero():
            raise ValueError("u does not divide v^2 + h*v - f")

    def _reduce(self, u: Any, v: Any) -> tuple[Any, Any]:
        steps = 0
        while u.degree() > self._genus:
            quotient = _exact_quotient(v * v + self._h * v - self._f, u)
            u = _polynomial_monic(quotient)
            v = _polynomial_remainder(-self._h - v, u)
            steps += 1
            if steps > 2 * self._genus + 2:
                raise ArithmeticError("Cantor reduction failed to decrease the divisor")
        v = _polynomial_remainder(v, u)
        return u, v

    def _compose(self, u1: Any, v1: Any, u2: Any, v2: Any) -> tuple[Any, Any]:
        if u1 == u2 and v1 == v2:
            common, _left, bezout = _polynomial_xgcd(u1, v1 + v1 + self._h)
            u3 = _exact_quotient(u1, common)
            u3 *= u3
            correction = _exact_quotient(
                self._f - self._h * v1 - v1 * v1,
                common,
            )
            v3 = _polynomial_remainder(v1 + bezout * correction, u3)
            return self._reduce(u3, v3)

        common0, _left0, right0 = _polynomial_xgcd(u1, u2)
        difference = v1 - v2
        if common0.is_one():
            u3 = u1 * u2
            v3 = _polynomial_remainder(v2 + right0 * u2 * difference, u3)
            return self._reduce(u3, v3)

        conjugate_sum = v1 + v2 + self._h
        if conjugate_sum.is_zero():
            u3 = _exact_quotient(u1 * u2, common0 * common0)
            v3 = _polynomial_remainder(
                v2 + right0 * difference * _exact_quotient(u2, common0), u3
            )
            return self._reduce(u3, v3)

        common, coefficient0, coefficient1 = _polynomial_xgcd(common0, conjugate_sum)
        u3 = _exact_quotient(u1 * u2, common * common)
        numerator = coefficient0 * right0 * difference * u2 + coefficient1 * (
            self._f - self._h * v2 - v2 * v2
        )
        v3 = _polynomial_remainder(v2 + _exact_quotient(numerator, common), u3)
        return self._reduce(u3, v3)

    def point_to_divisor(self, point: Any, check: bool = True) -> MumfordDivisor:
        if hasattr(point, "is_at_infinity") and point.is_at_infinity():
            return self.zero()
        if hasattr(point, "curve") and point.curve() is not self._curve:
            raise ValueError("the point lies on a different curve")
        if hasattr(point, "xy"):
            x_coordinate, y_coordinate = point.xy()
        else:
            coordinates = tuple(point)
            if len(coordinates) == 3:
                if coordinates[2] == 0:
                    return self.zero()
                if coordinates[2] != 1:
                    raise NotImplementedError("only affine point tuples are supported")
                x_coordinate, y_coordinate = coordinates[0], coordinates[1]
            elif len(coordinates) == 2:
                x_coordinate, y_coordinate = coordinates
            else:
                raise ValueError("a curve point must have two affine coordinates")
        x_coordinate = self.base_ring()(x_coordinate)
        y_coordinate = self.base_ring()(y_coordinate)
        if check and (
            y_coordinate * y_coordinate + self._h(x_coordinate) * y_coordinate
            != self._f(x_coordinate)
        ):
            raise ValueError("the affine point is not on the curve")
        u = self._ring.gen() - x_coordinate
        return MumfordDivisor(self, u, self._ring(y_coordinate), check)

    def _random_affine_point(self, attempts: int) -> Any:
        """Sample an affine point directly over an odd prime field."""
        field = self.base_ring()
        if not hasattr(field, "random_element"):
            return None
        four = field(4)
        two = field(2)
        for _attempt in range(attempts):
            x_coordinate = field.random_element()
            h_value = self._h(x_coordinate)
            discriminant = h_value * h_value + four * self._f(x_coordinate)
            if hasattr(discriminant, "is_square") and discriminant.is_square():
                y_coordinate = (-h_value + discriminant.sqrt()) / two
                return (x_coordinate, y_coordinate)
        return None

    def random_element(self, attempts: int = 100) -> MumfordDivisor:
        if attempts <= 0:
            raise ValueError("attempts must be positive")
        point_method = None
        if hasattr(self._curve, "random_element"):
            point_method = self._curve.random_element
        elif hasattr(self._curve, "random_point"):
            point_method = self._curve.random_point
        if point_method is not None:
            last = self.zero()
            for _attempt in range(attempts):
                answer = self.zero()
                for _index in range(2 * self._genus + 1):
                    point = point_method()
                    answer += self.point_to_divisor(point)
                last = answer
                if not answer.is_zero():
                    return answer
            return last

        if hasattr(self.base_ring(), "random_element"):
            last = self.zero()
            for _attempt in range(attempts):
                answer = self.zero()
                complete = True
                for _index in range(2 * self._genus + 1):
                    point = self._random_affine_point(attempts)
                    if point is None:
                        complete = False
                        break
                    answer += self.point_to_divisor(point)
                last = answer
                if complete and not answer.is_zero():
                    return answer
            if not last.is_zero():
                return last

        points = self.points(max_elements=10_000, max_candidates=1_000_000)
        if len(points) <= 1:
            return self.zero()
        field = self.base_ring()
        for _index in range(attempts):
            position = int(field.random_element()) % len(points)
            if not points[position].is_zero():
                return points[position]
        return self.zero()

    def elements_from_points(
        self,
        points: Any,
        max_elements: int = 64,
    ) -> list[MumfordDivisor]:
        """Build a deterministic divisor sample from an ordered point iterable.

        Both individual point classes and successive partial sums are retained;
        this gives order-candidate filters more coverage than using only the
        Abel--Jacobi image of each curve point.
        """
        if max_elements < 1:
            raise ValueError("max_elements must be positive")
        answer = [self.zero()]
        partial_sum = self.zero()
        for point in points:
            divisor = self.point_to_divisor(point)
            partial_sum += divisor
            for candidate in (divisor, partial_sum):
                if candidate not in answer:
                    answer.append(candidate)
                    if len(answer) >= max_elements:
                        return answer
        return answer

    def random_elements(
        self,
        count: int = 8,
        max_attempts: int = 100,
    ) -> list[MumfordDivisor]:
        """Return at most `count` distinct random elements within a hard budget."""
        if count < 1 or max_attempts < 1:
            raise ValueError("count and max_attempts must be positive")
        answer = [self.zero()]
        attempts = 0
        while len(answer) < count and attempts < max_attempts:
            candidate = self.random_element()
            if candidate not in answer:
                answer.append(candidate)
            attempts += 1
        return answer

    def filter_order_candidates(
        self,
        candidates: Any,
        elements: Any,
        max_candidates: int = 10_000,
        max_elements: int = 256,
        max_scalar_bits: int = 4096,
    ) -> list[Any]:
        """Retain candidate group orders that annihilate every supplied element.

        This is an exact one-sided filter for genus-3 Frobenius completion. A
        surviving candidate is not declared to be the order unless some
        independent argument proves uniqueness and completeness.
        """
        candidate_list = list(candidates)
        element_list = list(elements)
        if len(candidate_list) > max_candidates:
            raise JacobianResourceLimitError(
                "order filtering exceeds max_candidates=" + str(max_candidates)
            )
        if len(element_list) > max_elements:
            raise JacobianResourceLimitError(
                "order filtering exceeds max_elements=" + str(max_elements)
            )
        for candidate in candidate_list:
            if candidate <= 0:
                raise ValueError("candidate orders must be positive")
            if _integer_bit_length(candidate) > max_scalar_bits:
                raise JacobianResourceLimitError(
                    "order filtering exceeds max_scalar_bits=" + str(max_scalar_bits)
                )
        survivors = []
        for candidate in candidate_list:
            valid = True
            for element in element_list:
                if element.parent() is not self:
                    raise ValueError("order-filter elements must lie in this Jacobian")
                if not (candidate * element).is_zero():
                    valid = False
                    break
            if valid:
                survivors.append(candidate)
        return survivors

    def scalar_multiples(
        self,
        elements: Any,
        scalars: Any,
        *,
        algorithm: str = "auto",
        max_group_operations: Any = None,
    ) -> list[MumfordDivisor]:
        """Return a bounded batch of exact scalar multiples."""
        element_list = list(elements)
        if runtime.is_exact_integer(scalars) or hasattr(scalars, "lift"):
            scalar_list = [scalars for _element in element_list]
        else:
            scalar_list = list(scalars)
            if len(scalar_list) != len(element_list):
                raise ValueError("elements and scalars must have the same length")
        answer = []
        for element, scalar in zip(element_list, scalar_list, strict=True):
            if not isinstance(element, MumfordDivisor) or element.parent() is not self:
                raise ValueError("every batch element must lie in this Jacobian")
            answer.append(
                element.scalar_multiple(
                    scalar,
                    algorithm=algorithm,
                    max_group_operations=max_group_operations,
                )
            )
        return answer

    def annihilation_tests(
        self,
        elements: Any,
        multiples: Any,
        *,
        algorithm: str = "auto",
        max_group_operations: Any = None,
    ) -> list[bool]:
        """Test exact annihilation for one or many element/multiple pairs."""
        return [
            value.is_zero()
            for value in self.scalar_multiples(
                elements,
                multiples,
                algorithm=algorithm,
                max_group_operations=max_group_operations,
            )
        ]

    def change_ring(self, base: Any) -> Any:
        return HyperellipticJacobian(self._curve.change_ring(base))

    base_extend = change_ring

    def order(self, extension_degree: int = 1, algorithm: str = "auto") -> Any:
        if extension_degree < 1:
            raise ValueError("extension_degree must be positive")
        if extension_degree not in self._order_cache:
            polynomial = self._curve.frobenius_polynomial(algorithm=algorithm)
            if extension_degree == 1:
                answer = polynomial(1)
            else:
                variable = polynomial.parent().gen()
                answer = polynomial.resultant(variable**extension_degree - 1)
                if answer < 0:
                    answer = -answer
            if answer <= 0:
                raise ArithmeticError(
                    "the Frobenius polynomial gave a nonpositive order"
                )
            self._order_cache[extension_degree] = answer
        return self._order_cache[extension_degree]

    cardinality = order

    def count_points(self, n: int = 1, algorithm: str = "auto") -> Any:
        if n < 1:
            raise ValueError("n must be positive")
        if n == 1:
            return self.order(1, algorithm)
        return [self.order(degree, algorithm) for degree in range(1, n + 1)]

    def points(
        self,
        max_elements: int = 50_000,
        max_candidates: int = 5_000_000,
    ) -> list[MumfordDivisor]:
        """Enumerate every reduced divisor, subject to explicit budgets."""
        field = self.base_ring()
        if not hasattr(field, "order") or not hasattr(field, "__iter__"):
            raise NotImplementedError("Jacobian enumeration requires a finite field")
        known_order = self.order()
        if known_order > max_elements:
            raise JacobianResourceLimitError(
                "Jacobian order exceeds max_elements=" + str(max_elements)
            )
        field_order = field.order()
        candidate_bound = 0
        power = 1
        for _degree in range(self._genus + 1):
            candidate_bound += power
            power *= field_order * field_order
        if candidate_bound > max_candidates:
            raise JacobianResourceLimitError(
                "Mumford enumeration exceeds max_candidates=" + str(max_candidates)
            )
        if self._points_cache is not None:
            return list(self._points_cache)

        values = list(field)
        one = field(1)
        answer: list[MumfordDivisor] = []
        for degree in range(self._genus + 1):
            u_vectors = _coefficient_vectors(values, degree)
            v_vectors = _coefficient_vectors(values, degree)
            for u_vector in u_vectors:
                u = self._ring(u_vector + [one])
                for v_vector in v_vectors:
                    v = self._ring(v_vector)
                    if _polynomial_remainder(
                        v * v + self._h * v - self._f, u
                    ).is_zero():
                        answer.append(self._element(u, v, False))
        if len(answer) != known_order:
            raise ArithmeticError(
                "reduced Mumford enumeration found "
                + str(len(answer))
                + " elements but Frobenius predicts "
                + str(known_order)
            )
        self._points_cache = answer
        return list(answer)

    list = points

    def __iter__(self) -> Any:
        yield from self.points()

    def some_elements(self) -> list[MumfordDivisor]:
        return [self.zero(), self.random_element(), self.random_element()]

    def group_structure(
        self,
        factorization: list[tuple[Any, int]] | None = None,
        max_elements: int = 50_000,
        max_candidates: int = 5_000_000,
        max_trial_divisions: int = 1_000_000,
        algorithm: str = "auto",
    ) -> tuple[Any, ...]:
        if algorithm not in ["auto", "smalljac", "exhaustive"]:
            raise ValueError(
                "unknown Jacobian group-structure algorithm " + repr(algorithm)
            )
        frobenius = __import__(
            "sagejs.hyperelliptic_curves.frobenius",
            fromlist=["smalljac_group_invariants"],
        )
        use_smalljac = frobenius.smalljac_supports_group_structure(self._curve)
        if algorithm == "smalljac" and not use_smalljac:
            raise NotImplementedError(
                "smalljac group structure requires an odd-degree genus-2 curve "
                "over a supported odd prime field"
            )
        if use_smalljac and algorithm != "exhaustive":
            invariants = frobenius.smalljac_group_invariants(self._curve)
            exponent = invariants[-1]
            for element in self.random_elements(count=5, max_attempts=20):
                if not (exponent * element).is_zero():
                    raise ArithmeticError(
                        "a sampled Jacobian element is not killed by the "
                        "smalljac group exponent"
                    )
            return invariants
        order = self.order()
        factors = (
            factor_integer_bounded(order, max_trial_divisions)
            if factorization is None
            else factorization
        )
        elements = self.points(max_elements, max_candidates)
        invariants = invariant_factors_from_elements(
            elements,
            order,
            factors,
            max_trial_divisions,
        )
        if len(invariants) > 2 * self._genus:
            raise ArithmeticError("Jacobian group rank exceeds 2g")
        return invariants

    def abelian_group(
        self,
        factorization: list[tuple[Any, int]] | None = None,
        max_elements: int = 50_000,
        max_candidates: int = 5_000_000,
        max_generator_tests: int = 100_000,
        max_trial_divisions: int = 1_000_000,
    ) -> Any:
        """Return a bounded certified abstract group and explicit map."""
        structure = self.group_structure(
            factorization=factorization,
            max_elements=max_elements,
            max_candidates=max_candidates,
            max_trial_divisions=max_trial_divisions,
            algorithm="auto",
        )
        module = __import__(
            "sagejs.hyperelliptic_curves.abelian_group",
            fromlist=["certified_abelian_group"],
        )
        try:
            return module.certified_abelian_group(
                self,
                structure,
                factorization=factorization,
                max_elements=max_elements,
                max_candidates=max_candidates,
                max_generator_tests=max_generator_tests,
                max_trial_divisions=max_trial_divisions,
            )
        except JacobianResourceLimitError as error:
            if error.known_structure is None:
                error.known_structure = structure
            raise


def Jacobian(curve: Any) -> HyperellipticJacobian:
    """Return the currently supported Jacobian of `curve`."""
    return HyperellipticJacobian(curve)
