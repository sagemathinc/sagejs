"""Mumford arithmetic for odd-degree hyperelliptic Jacobians.

For a curve `y^2 + h(x)y = f(x)` with one point at infinity, a reduced
divisor class is represented by `(u,v)` with `u` monic,
`deg(v) < deg(u) <= g`, and `u | v^2 + h*v - f`. This module implements the
generalized Cantor composition and reduction algorithms in ordinary Python.
"""

from __future__ import annotations

import time
from typing import Any, Mapping

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.hyperelliptic_curves.group_structure import (
    GroupOperationBudget,
    JacobianResourceLimitError,
    basis_from_generators,
    element_order_from_multiple,
    factor_integer_bounded,
    invariant_factors_from_elements,
    validate_factorization,
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


def _coefficient_vector_iterator(values: list[Any], length: int) -> Any:
    if length == 0:
        yield []
        return
    prefix = [values[0] for _index in range(length)]

    def visit(position: int) -> Any:
        if position == length:
            yield list(prefix)
            return
        for value in values:
            prefix[position] = value
            yield from visit(position + 1)

    yield from visit(0)


def _polynomial_modular_power(base: Any, exponent: int, modulus: Any) -> Any:
    ring = modulus.parent()
    answer = ring(1)
    value = _polynomial_remainder(base, modulus)
    while exponent:
        if exponent % 2:
            answer = _polynomial_remainder(answer * value, modulus)
        exponent //= 2
        if exponent:
            value = _polynomial_remainder(value * value, modulus)
    return answer


def _polynomial_modular_inverse(value: Any, modulus: Any) -> Any:
    gcd, coefficient, _other = _polynomial_xgcd(value, modulus)
    if not gcd.is_one():
        raise ZeroDivisionError("a quotient-ring element is not invertible")
    return _polynomial_remainder(coefficient, modulus)


def _integer_to_quotient_polynomial(
    value: int, degree: int, prime: int, ring: Any
) -> Any:
    field = ring.base_ring()
    coefficients = []
    for _index in range(degree):
        coefficients.append(field(value % prime))
        value //= prime
    return ring(coefficients)


def _quotient_square_roots(value: Any, modulus: Any, prime: int) -> list[Any]:
    """Return both square roots in the finite field `F_p[x]/modulus`."""
    ring = modulus.parent()
    degree = modulus.degree()
    field_order = prime**degree
    source = _polynomial_remainder(value, modulus)
    if source.is_zero():
        return [ring(0)]
    one = ring(1)
    if _polynomial_modular_power(source, (field_order - 1) // 2, modulus) != one:
        return []
    if field_order % 4 == 3:
        root = _polynomial_modular_power(source, (field_order + 1) // 4, modulus)
    else:
        odd = field_order - 1
        twos = 0
        while odd % 2 == 0:
            odd //= 2
            twos += 1
        nonresidue = None
        # Multiplication by Q-2 permutes 1,...,Q-1 for odd Q and makes the
        # search visit nonconstant representatives immediately in extensions.
        for counter in range(1, field_order):
            encoded = (counter * (field_order - 2)) % field_order
            candidate = _integer_to_quotient_polynomial(encoded, degree, prime, ring)
            if (
                not candidate.is_zero()
                and _polynomial_modular_power(
                    candidate, (field_order - 1) // 2, modulus
                )
                != one
            ):
                nonresidue = candidate
                break
        if nonresidue is None:
            raise ArithmeticError("failed to find a quotient-field nonresidue")
        root = _polynomial_modular_power(source, (odd + 1) // 2, modulus)
        residue_power = _polynomial_modular_power(source, odd, modulus)
        nonresidue_power = _polynomial_modular_power(nonresidue, odd, modulus)
        level = twos
        while residue_power != one:
            probe = residue_power
            index = 0
            while probe != one and index < level:
                probe = _polynomial_remainder(probe * probe, modulus)
                index += 1
            if index == level:
                raise ArithmeticError("finite-field square-root iteration failed")
            multiplier = _polynomial_modular_power(
                nonresidue_power, 1 << (level - index - 1), modulus
            )
            root = _polynomial_remainder(root * multiplier, modulus)
            multiplier_square = _polynomial_remainder(multiplier * multiplier, modulus)
            residue_power = _polynomial_remainder(
                residue_power * multiplier_square, modulus
            )
            nonresidue_power = multiplier_square
            level = index
    negative = _polynomial_remainder(-root, modulus)
    if negative == root:
        return [root]
    return [root, negative]


class _ResidueSampler:
    """Small deterministic-or-random prime-field residue source."""

    def __init__(self, field: Any, seed: Any = None) -> None:
        self._field = field
        self._prime = int(field.characteristic())
        self._deterministic = seed is not None
        self._state = int(seed) & ((1 << 64) - 1) if seed is not None else 0

    def residue(self) -> Any:
        if not self._deterministic:
            return self._field.random_element()
        self._state = (6364136223846793005 * self._state + 1442695040888963407) & (
            (1 << 64) - 1
        )
        return self._field(self._state % self._prime)

    def index(self, stop: int) -> int:
        if stop <= 0:
            raise ValueError("a random index needs a positive upper bound")
        value = self.residue()
        lifted = value.lift() if hasattr(value, "lift") else value
        return int(lifted) % stop


def _integer_bit_length(value: Any) -> int:
    bits = 0
    while value:
        value //= 2
        bits += 1
    return bits


def _product_integers(values: Any) -> int:
    answer = 1
    for value in values:
        answer *= int(value)
    return answer


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
        self._group_basis_cache: dict[str, Any] | None = None
        self._group_structure_diagnostics_cache: dict[str, Any] | None = None

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

    def _model_data_equal(self, data: Any) -> bool:
        if not hasattr(data, "get"):
            return False
        expected = self._prime_field_model_data()
        try:
            return (
                not isinstance(data.get("genus"), bool)
                and isinstance(data.get("genus"), int)
                and int(data.get("genus")) == int(expected["genus"])
                and str(data.get("prime")) == str(expected["prime"])
                and tuple(data.get("f_coefficients_ascending"))
                == tuple(expected["f_coefficients_ascending"])
                and tuple(data.get("h_coefficients_ascending"))
                == tuple(expected["h_coefficients_ascending"])
            )
        except (TypeError, ValueError):
            return False

    def divisor_from_data(self, data: Mapping[str, Any]) -> MumfordDivisor:
        """Reconstruct and validate a versioned prime-field Mumford divisor."""
        if not hasattr(data, "get") or not hasattr(data, "__getitem__"):
            raise TypeError("divisor data must be a mapping")
        if data.get("schema") != "sagejs.hyperelliptic.mumford-divisor.v1":
            raise ValueError("unknown Mumford-divisor schema")
        if not self._model_data_equal(data.get("curve")):
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

        def canonical_integer(value: Any, name: str) -> int:
            text = str(value)
            integer = int(text)
            if str(integer) != text:
                raise ValueError(name + " is not a canonical decimal integer")
            return integer

        divisor = self.divisor_from_data(certificate["divisor"])
        multiple = canonical_integer(
            certificate["annihilating_multiple"], "annihilating multiple"
        )
        order = canonical_integer(certificate["element_order"], "element order")
        if multiple <= 0 or order <= 0 or multiple % order != 0:
            raise ValueError("the certificate has inconsistent positive orders")
        factors = [
            (
                canonical_integer(prime, "factor prime"),
                canonical_integer(exponent, "factor exponent"),
            )
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

    def lift_u(self, u: Any, all: bool = False) -> Any:
        """Lift a monic `u` to reduced Mumford divisors exactly.

        Over odd prime fields this factors `u`, solves the completed-square
        congruence in each residue field, Hensel-lifts repeated factors, and
        combines the roots by polynomial CRT. The implementation is also used
        by covering random samples and complete small-group enumeration.
        """
        field = self.base_ring()
        if not hasattr(field, "characteristic") or not hasattr(field, "order"):
            raise NotImplementedError("lift_u requires a finite prime field")
        prime = int(field.characteristic())
        if prime == 2 or int(field.order()) != prime:
            raise NotImplementedError("lift_u currently requires an odd prime field")
        u_value = self._ring(u)
        if u_value.is_zero():
            raise ValueError("u must be nonzero")
        u_value = _polynomial_monic(u_value)
        if u_value.degree() > self._genus:
            raise ValueError("u has degree larger than the genus")
        if u_value.is_one():
            result = [self.zero()]
            return result if all else result[0]

        completed = self._h * self._h + field(4) * self._f
        raw_factors = list(u_value.factor())
        local_data: list[tuple[Any, list[Any]]] = []
        for factor, raw_exponent in raw_factors:
            exponent = int(raw_exponent)
            factor = _polynomial_monic(self._ring(factor))
            roots = _quotient_square_roots(completed, factor, prime)
            if not roots:
                if all:
                    return []
                raise IndexError("u has no Mumford lift")
            modulus = factor
            lifted_roots = list(roots)
            for _level in range(1, exponent):
                next_modulus = modulus * factor
                next_roots = []
                for root in lifted_roots:
                    numerator = completed - root * root
                    quotient = _exact_quotient(numerator, modulus)
                    denominator = _polynomial_remainder(field(2) * root, factor)
                    try:
                        inverse = _polynomial_modular_inverse(denominator, factor)
                    except ZeroDivisionError:
                        continue
                    correction = _polynomial_remainder(quotient * inverse, factor)
                    candidate = _polynomial_remainder(
                        root + modulus * correction, next_modulus
                    )
                    if _polynomial_remainder(
                        candidate * candidate - completed, next_modulus
                    ).is_zero():
                        next_roots.append(candidate)
                lifted_roots = next_roots
                modulus = next_modulus
                if not lifted_roots:
                    if all:
                        return []
                    raise IndexError("u has no repeated-factor Mumford lift")
            local_data.append((modulus, lifted_roots))

        combined: list[tuple[Any, Any]] = [(self._ring(0), self._ring(1))]
        for modulus, roots in local_data:
            next_combined: list[tuple[Any, Any]] = []
            for current, current_modulus in combined:
                inverse = _polynomial_modular_inverse(current_modulus, modulus)
                for root in roots:
                    correction = _polynomial_remainder(
                        (root - current) * inverse, modulus
                    )
                    product = current_modulus * modulus
                    value = _polynomial_remainder(
                        current + current_modulus * correction, product
                    )
                    next_combined.append((value, product))
            combined = next_combined

        inverse_two = field(1) / field(2)
        answer: list[MumfordDivisor] = []
        for root, modulus in combined:
            if modulus != u_value:
                raise ArithmeticError("lift_u CRT modulus does not equal u")
            v_value = _polynomial_remainder((root - self._h) * inverse_two, u_value)
            divisor = self._element(u_value, v_value, True)
            if divisor not in answer:
                answer.append(divisor)
        if not answer:
            if all:
                return []
            raise IndexError("u has no Mumford lift")
        return answer if all else answer[0]

    def _sample_fast(self, sampler: _ResidueSampler, attempts: int = 100) -> Any:
        field = self.base_ring()
        two = field(2)
        four = field(4)
        divisors = []
        for _index in range(2 * self._genus + 1):
            point = None
            for _attempt in range(attempts):
                x_coordinate = sampler.residue()
                h_value = self._h(x_coordinate)
                discriminant = h_value * h_value + four * self._f(x_coordinate)
                if discriminant.is_square():
                    root = discriminant.sqrt()
                    y_coordinate = (-h_value + root) / two
                    point = (x_coordinate, y_coordinate)
                    break
            if point is not None:
                divisors.append(self.point_to_divisor(point))
        if not divisors:
            return self.zero()
        native = __import__(
            "sagejs.hyperelliptic_curves.jacobian_native",
            fromlist=["native_sum"],
        )
        try:
            native_answer = native.native_sum(divisors)
        except RuntimeError as error:
            raise JacobianResourceLimitError(str(error)) from error
        if native_answer is not None:
            return native_answer[0]
        answer = self.zero()
        for divisor in divisors:
            answer += divisor
        return answer

    def _sample_covering(self, sampler: _ResidueSampler) -> Any:
        """Sample with support on every reduced divisor.

        Choosing `v` first and then a divisor `u` of `v^2+h*v-f` is dual to
        choosing `u` and lifting it. Every canonical `(u,v)` therefore has
        nonzero probability, while this form needs only one polynomial
        factorization per attempt.
        """
        coefficients = [sampler.residue() for _index in range(self._genus)]
        v_value = self._ring(coefficients)
        relation = v_value * v_value + self._h * v_value - self._f
        candidates = []
        for candidate in relation.divisors():
            if candidate.is_zero():
                continue
            candidate = _polynomial_monic(candidate)
            if candidate.degree() <= self._genus:
                divisor = self._element(candidate, v_value, True)
                if divisor not in candidates:
                    candidates.append(divisor)
        if not candidates:
            raise ArithmeticError("covering Mumford sampling found no divisor")
        return candidates[sampler.index(len(candidates))]

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

    def random_element(
        self,
        attempts: int = 100,
        *,
        fast: bool = True,
        seed: Any = None,
    ) -> MumfordDivisor:
        """Return a random divisor using a fast or full-support sampler.

        The fast rational-point-sum sampler need not cover the whole group.
        With `fast=False`, the factor-and-lift sampler gives every reduced
        divisor nonzero probability on supported odd prime fields.
        """
        if attempts <= 0:
            raise ValueError("attempts must be positive")
        field = self.base_ring()
        if (
            hasattr(field, "characteristic")
            and hasattr(field, "order")
            and int(field.characteristic()) == int(field.order())
            and int(field.characteristic()) != 2
        ):
            sampler = _ResidueSampler(field, seed)
            if fast:
                return self._sample_fast(sampler, attempts)
            return self._sample_covering(sampler)
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
        *,
        fast: bool = True,
        seed: Any = None,
    ) -> list[MumfordDivisor]:
        """Return at most `count` distinct random elements within a hard budget."""
        if count < 1 or max_attempts < 1:
            raise ValueError("count and max_attempts must be positive")
        answer = [self.zero()]
        attempts = 0
        while len(answer) < count and attempts < max_attempts:
            candidate_seed = None if seed is None else int(seed) + attempts
            candidate = self.random_element(fast=fast, seed=candidate_seed)
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
        prime_field_lifts = (
            hasattr(field, "characteristic")
            and int(field.characteristic()) == int(field_order)
            and int(field.characteristic()) != 2
        )
        candidate_bound = 0
        power = 1
        for _degree in range(self._genus + 1):
            candidate_bound += power
            power *= field_order if prime_field_lifts else field_order * field_order
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
            for u_vector in _coefficient_vector_iterator(values, degree):
                u = self._ring(u_vector + [one])
                if prime_field_lifts:
                    for divisor in self.lift_u(u, all=True):
                        if divisor not in answer:
                            answer.append(divisor)
                else:
                    for v_vector in _coefficient_vector_iterator(values, degree):
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

    def _generic_group_basis(
        self,
        factors: list[tuple[Any, int]],
        *,
        max_random_elements: int,
        max_group_operations: int,
        max_baby_steps: int,
        max_memory_bytes: int,
        seed: Any,
        scalar_algorithm: str,
    ) -> dict[str, Any]:
        if self._group_basis_cache is not None:
            return self._group_basis_cache
        known_order = int(self.order())
        if known_order == 1:
            result = {
                "invariants": (),
                "generators": (),
                "orders": (),
                "factorization": tuple(factors),
                "diagnostics": {
                    "algorithm": "basis",
                    "samples": 0,
                    "fast_samples": 0,
                    "covering_samples": 0,
                    "generated_subgroup_order": 1,
                    "group_operations": 0,
                    "baby_steps": 0,
                    "peak_table_entries": 0,
                },
            }
            self._group_basis_cache = result
            return result
        if max_random_elements <= 0:
            raise ValueError("max_random_elements must be positive")
        budget = GroupOperationBudget(
            max_group_operations,
            max_baby_steps,
            max_memory_bytes,
            scalar_algorithm,
        )
        field = self.base_ring()
        if (
            not hasattr(field, "characteristic")
            or not hasattr(field, "order")
            or int(field.characteristic()) != int(field.order())
        ):
            raise NotImplementedError(
                "generic Jacobian basis sampling currently requires a prime field"
            )
        sampler = _ResidueSampler(field, seed)
        native_module = __import__(
            "sagejs.hyperelliptic_curves.jacobian_native",
            fromlist=["native_scalar_supported"],
        )
        scalar_backend = (
            "native-genus3"
            if scalar_algorithm != "reference"
            and native_module.native_scalar_supported(self)
            else "ordinary-python"
        )
        started = time.perf_counter()
        sampling_seconds = 0.0
        order_seconds = 0.0
        basis_seconds = 0.0
        verification_seconds = 0.0
        samples: list[Any] = []
        sample_orders: list[int] = []
        fast_limit = max(1, max_random_elements // 2)
        fast_count = 0
        covering_count = 0
        generated_basis: tuple[Any, ...] = ()
        generated_orders: tuple[int, ...] = ()

        for sample_index in range(max_random_elements):
            fast = sample_index < fast_limit
            stage_started = time.perf_counter()
            candidate = (
                self._sample_fast(sampler) if fast else self._sample_covering(sampler)
            )
            sampling_seconds += time.perf_counter() - stage_started
            if fast:
                fast_count += 1
            else:
                covering_count += 1
            if candidate.is_zero() or candidate in samples:
                continue
            stage_started = time.perf_counter()
            order = int(
                candidate.order(
                    multiple=known_order,
                    factorization=factors,
                    algorithm=scalar_algorithm,
                )
            )
            order_seconds += time.perf_counter() - stage_started
            if order <= 0 or known_order % order != 0:
                raise ArithmeticError("a sampled element has an inconsistent order")
            samples.append(candidate)
            sample_orders.append(order)
            if order == known_order:
                generated_basis = (candidate,)
                generated_orders = (known_order,)
            else:
                try:
                    stage_started = time.perf_counter()
                    generated_basis, generated_orders = basis_from_generators(
                        samples, sample_orders, factors, budget
                    )
                    basis_seconds += time.perf_counter() - stage_started
                except JacobianResourceLimitError as error:
                    error.partial_generators = generated_basis
                    error.diagnostics = budget.diagnostics()
                    raise
            subgroup_order = 1
            for value in generated_orders:
                subgroup_order *= int(value)
            if subgroup_order == known_order:
                break
        else:
            partial = tuple(reversed(generated_basis))
            partial_structure = tuple(reversed(generated_orders))
            diagnostics: dict[str, Any] = budget.diagnostics()
            diagnostics.update(
                {
                    "samples": len(samples),
                    "fast_samples": fast_count,
                    "covering_samples": covering_count,
                    "scalar_backend": scalar_backend,
                    "generated_subgroup_order": (
                        1
                        if not generated_orders
                        else _product_integers(generated_orders)
                    ),
                    "sampling_seconds": sampling_seconds,
                    "element_order_seconds": order_seconds,
                    "basis_seconds": basis_seconds,
                    "verification_seconds": verification_seconds,
                    "total_seconds": time.perf_counter() - started,
                }
            )
            raise JacobianResourceLimitError(
                "generic Jacobian basis search exceeds max_random_elements="
                + str(max_random_elements),
                known_structure=partial_structure,
                partial_generators=partial,
                diagnostics=diagnostics,
            )

        invariants = tuple(reversed(tuple(int(value) for value in generated_orders)))
        generators = tuple(reversed(generated_basis))
        if len(invariants) > 2 * self._genus:
            raise ArithmeticError("Jacobian group rank exceeds 2g")
        product = _product_integers(invariants)
        if product != known_order:
            raise ArithmeticError("the sampled basis does not have full group order")
        previous = 1
        for invariant in invariants:
            if invariant <= 1 or invariant % previous != 0:
                raise ArithmeticError("sampled invariant factors are not canonical")
            previous = invariant
        for generator, invariant in zip(generators, invariants, strict=True):
            stage_started = time.perf_counter()
            actual = int(
                generator.order(
                    multiple=known_order,
                    factorization=factors,
                    algorithm=scalar_algorithm,
                )
            )
            verification_seconds += time.perf_counter() - stage_started
            if actual != invariant:
                raise ArithmeticError("a sampled basis generator has the wrong order")

        diagnostics: dict[str, Any] = budget.diagnostics()
        diagnostics.update(
            {
                "algorithm": "basis",
                "samples": len(samples),
                "fast_samples": fast_count,
                "covering_samples": covering_count,
                "generated_subgroup_order": known_order,
                "scalar_backend": scalar_backend,
                "sampling_seconds": sampling_seconds,
                "element_order_seconds": order_seconds,
                "basis_seconds": basis_seconds,
                "verification_seconds": verification_seconds,
                "total_seconds": time.perf_counter() - started,
            }
        )
        result = {
            "invariants": invariants,
            "generators": generators,
            "orders": invariants,
            "factorization": tuple(factors),
            "diagnostics": diagnostics,
        }
        self._group_basis_cache = result
        self._group_structure_diagnostics_cache = diagnostics
        return result

    def _group_certificate_from_basis(
        self, result: Mapping[str, Any]
    ) -> dict[str, Any]:
        factors = list(result["factorization"])
        known_order = int(self.order())
        generators = tuple(result["generators"])
        invariants = tuple(int(value) for value in result["invariants"])
        element_certificates = tuple(
            generator.order_certificate(
                multiple=known_order,
                factorization=factors,
                algorithm="reference",
            )
            for generator in generators
        )
        diagnostics = result["diagnostics"]
        primary_components = []
        for prime, exponent in factors:
            primary_order = int(prime) ** int(exponent)
            primary_components.append(
                {
                    "prime": str(prime),
                    "ambient_order": str(primary_order),
                    "generated_order": str(primary_order),
                }
            )
        certificate = {
            "schema": "sagejs.hyperelliptic.jacobian-group-certificate.v1",
            "curve": self._prime_field_model_data(),
            "group_order": str(known_order),
            "factorization": tuple(
                (str(prime), int(exponent)) for prime, exponent in factors
            ),
            "invariant_factors": tuple(str(value) for value in invariants),
            "generators": tuple(generator.to_data() for generator in generators),
            "element_order_certificates": element_certificates,
            "algorithms": {
                "basis": "sutherland-primary-basis.v1",
                "group_law": "generalized-cantor-odd-degree.v1",
                "scalar_backend": str(
                    diagnostics.get("scalar_backend", "ordinary-python")
                ),
            },
            "resources": {
                name: str(int(diagnostics.get(name, 0)))
                for name in (
                    "samples",
                    "fast_samples",
                    "covering_samples",
                    "group_operations",
                    "baby_steps",
                    "peak_table_entries",
                )
            },
            "proof": {
                "method": "sutherland-primary-basis",
                "generated_subgroup_order": str(known_order),
                "rank_bound": 2 * self._genus,
                "primary_components": tuple(primary_components),
            },
        }
        self.verify_group_structure_certificate(certificate)
        return certificate

    def verify_group_structure_certificate(
        self,
        certificate: Mapping[str, Any],
        *,
        max_group_operations: int = 10_000_000,
        max_baby_steps: int = 1_000_000,
        max_memory_bytes: int = 256 * 1024 * 1024,
    ) -> bool:
        """Independently verify a serialized Jacobian group certificate."""
        if not hasattr(certificate, "get") or not hasattr(certificate, "__getitem__"):
            raise TypeError("the group certificate must be a mapping")
        if (
            certificate.get("schema")
            != "sagejs.hyperelliptic.jacobian-group-certificate.v1"
        ):
            raise ValueError("unknown Jacobian group-certificate schema")
        if not self._model_data_equal(certificate.get("curve")):
            raise ValueError("the group certificate belongs to a different Jacobian")

        def canonical_integer(value: Any, name: str) -> int:
            text = str(value)
            integer = int(text)
            if str(integer) != text:
                raise ValueError(name + " is not a canonical decimal integer")
            return integer

        known_order = canonical_integer(certificate["group_order"], "group_order")
        if known_order != int(self.order()):
            raise ArithmeticError("the certificate group order is incorrect")
        factors = [
            (
                canonical_integer(prime, "factorization prime"),
                canonical_integer(exponent, "factorization exponent"),
            )
            for prime, exponent in certificate["factorization"]
        ]
        validate_factorization(known_order, factors)
        invariants = tuple(
            canonical_integer(value, "invariant factor")
            for value in certificate["invariant_factors"]
        )
        if _product_integers(invariants) != known_order:
            raise ArithmeticError("certificate invariants do not multiply to the order")
        previous = 1
        for value in invariants:
            if value <= 1 or value % previous != 0:
                raise ArithmeticError("certificate invariants are not canonical")
            previous = value
        if len(invariants) > 2 * self._genus:
            raise ArithmeticError("certificate rank exceeds 2g")
        generators = tuple(
            self.divisor_from_data(data) for data in certificate["generators"]
        )
        if len(generators) != len(invariants):
            raise ArithmeticError("certificate generator count does not match rank")
        element_certificates = tuple(certificate["element_order_certificates"])
        if len(element_certificates) != len(generators):
            raise ArithmeticError("certificate element-order proof count is wrong")
        for generator, invariant, element_certificate in zip(
            generators, invariants, element_certificates, strict=True
        ):
            self.verify_order_certificate(element_certificate)
            if self.divisor_from_data(element_certificate["divisor"]) != generator:
                raise ArithmeticError("an element-order proof has the wrong divisor")
            if (
                canonical_integer(element_certificate["element_order"], "element order")
                != invariant
            ):
                raise ArithmeticError("an element-order proof has the wrong order")

        budget = GroupOperationBudget(
            max_group_operations,
            max_baby_steps,
            max_memory_bytes,
            "reference",
        )
        _rebuilt_basis, rebuilt_orders = basis_from_generators(
            generators, invariants, factors, budget
        )
        if _product_integers(rebuilt_orders) != known_order:
            raise ArithmeticError("certificate generators are not independent")
        rebuilt_invariants = tuple(reversed(rebuilt_orders))
        if rebuilt_invariants != invariants:
            raise ArithmeticError("certificate basis has different invariants")
        proof: Any = certificate.get("proof")
        if proof is None or not hasattr(proof, "get"):
            raise ValueError("certificate proof metadata is missing")
        if proof.get("method") != "sutherland-primary-basis":
            raise ValueError("unknown group-certificate proof method")
        if (
            canonical_integer(
                proof.get("generated_subgroup_order"), "generated subgroup order"
            )
            != known_order
        ):
            raise ArithmeticError("certificate proof has the wrong subgroup order")
        if canonical_integer(proof.get("rank_bound"), "rank bound") != 2 * self._genus:
            raise ArithmeticError("certificate proof has the wrong rank bound")
        components = tuple(proof.get("primary_components", ()))
        if len(components) != len(factors):
            raise ArithmeticError("certificate primary-component count is wrong")
        for component, (prime, exponent) in zip(components, factors, strict=True):
            if not hasattr(component, "get"):
                raise ValueError("certificate primary-component data is malformed")
            expected_primary_order = prime**exponent
            if canonical_integer(component.get("prime"), "primary prime") != prime:
                raise ArithmeticError("certificate primary component has wrong prime")
            if (
                canonical_integer(
                    component.get("ambient_order"), "primary ambient order"
                )
                != expected_primary_order
                or canonical_integer(
                    component.get("generated_order"), "primary generated order"
                )
                != expected_primary_order
            ):
                raise ArithmeticError("certificate primary component is incomplete")
        algorithms: Any = certificate.get("algorithms")
        if algorithms is None or not hasattr(algorithms, "get"):
            raise ValueError("certificate algorithm metadata is missing")
        if algorithms.get("basis") != "sutherland-primary-basis.v1":
            raise ValueError("unknown certificate basis algorithm")
        if algorithms.get("group_law") != "generalized-cantor-odd-degree.v1":
            raise ValueError("unknown certificate group-law algorithm")
        if algorithms.get("scalar_backend") not in (
            "ordinary-python",
            "native-genus3",
        ):
            raise ValueError("unknown certificate scalar backend")
        resources: Any = certificate.get("resources")
        if resources is None or not hasattr(resources, "get"):
            raise ValueError("certificate resource accounting is missing")
        for name in (
            "samples",
            "fast_samples",
            "covering_samples",
            "group_operations",
            "baby_steps",
            "peak_table_entries",
        ):
            if canonical_integer(resources.get(name), "resource " + name) < 0:
                raise ValueError("certificate resource counters must be nonnegative")
        return True

    def group_structure_diagnostics(self) -> dict[str, Any]:
        """Return a copy of the most recent sampled structure diagnostics."""
        if self._group_structure_diagnostics_cache is None:
            return {}
        return dict(self._group_structure_diagnostics_cache)

    def group_structure(
        self,
        factorization: list[tuple[Any, int]] | None = None,
        max_elements: int = 50_000,
        max_candidates: int = 5_000_000,
        max_trial_divisions: int = 1_000_000,
        algorithm: str = "auto",
        max_random_elements: int = 594,
        max_group_operations: int = 10_000_000,
        max_baby_steps: int = 1_000_000,
        max_memory_bytes: int = 256 * 1024 * 1024,
        seed: Any = None,
        certificate: bool = False,
    ) -> Any:
        if algorithm not in ["auto", "basis", "smalljac", "exhaustive"]:
            raise ValueError(
                "unknown Jacobian group-structure algorithm " + repr(algorithm)
            )
        order = int(self.order())
        factors = (
            factor_integer_bounded(order, max_trial_divisions)
            if factorization is None
            else validate_factorization(order, factorization)
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
        if use_smalljac and algorithm in ("auto", "smalljac"):
            invariants = frobenius.smalljac_group_invariants(self._curve)
            exponent = invariants[-1]
            for element in self.random_elements(count=5, max_attempts=20):
                if not (exponent * element).is_zero():
                    raise ArithmeticError(
                        "a sampled Jacobian element is not killed by the "
                        "smalljac group exponent"
                    )
            if not certificate:
                return invariants
            result = self._generic_group_basis(
                factors,
                max_random_elements=max_random_elements,
                max_group_operations=max_group_operations,
                max_baby_steps=max_baby_steps,
                max_memory_bytes=max_memory_bytes,
                seed=seed,
                scalar_algorithm="auto",
            )
            if tuple(int(value) for value in invariants) != tuple(
                int(value) for value in result["invariants"]
            ):
                raise ArithmeticError(
                    "smalljac and the certified sampled basis disagree"
                )
            return invariants, self._group_certificate_from_basis(result)
        if algorithm != "exhaustive":
            squarefree = all(int(exponent) == 1 for _prime, exponent in factors)
            if algorithm == "auto" and squarefree and not certificate:
                invariants = () if order == 1 else (sage.ZZ(order),)
                self._group_structure_diagnostics_cache = {
                    "algorithm": "squarefree-order",
                    "samples": 0,
                    "generated_subgroup_order": 1,
                }
                return invariants
            field = self.base_ring()
            prime_basis_supported = (
                hasattr(field, "characteristic")
                and hasattr(field, "order")
                and int(field.characteristic()) == int(field.order())
                and int(field.characteristic()) != 2
            )
            if algorithm != "auto" or prime_basis_supported:
                result = self._generic_group_basis(
                    factors,
                    max_random_elements=max_random_elements,
                    max_group_operations=max_group_operations,
                    max_baby_steps=max_baby_steps,
                    max_memory_bytes=max_memory_bytes,
                    seed=seed,
                    scalar_algorithm="auto",
                )
                invariants = runtime.math_tuple(list(result["invariants"]))
                if certificate:
                    return invariants, self._group_certificate_from_basis(result)
                return invariants
        elements = self.points(max_elements, max_candidates)
        invariants = invariant_factors_from_elements(
            elements,
            order,
            factors,
            max_trial_divisions,
        )
        if len(invariants) > 2 * self._genus:
            raise ArithmeticError("Jacobian group rank exceeds 2g")
        if not certificate:
            return invariants
        result = self._generic_group_basis(
            factors,
            max_random_elements=max_random_elements,
            max_group_operations=max_group_operations,
            max_baby_steps=max_baby_steps,
            max_memory_bytes=max_memory_bytes,
            seed=seed,
            scalar_algorithm="auto",
        )
        if tuple(int(value) for value in invariants) != tuple(
            int(value) for value in result["invariants"]
        ):
            raise ArithmeticError(
                "exhaustive enumeration and the certified sampled basis disagree"
            )
        return invariants, self._group_certificate_from_basis(result)

    def group_structure_certificate(self, **options: Any) -> dict[str, Any]:
        """Return an independently verifiable exact group certificate."""
        options["certificate"] = True
        _structure, certificate = self.group_structure(**options)
        return certificate

    def abelian_group(
        self,
        factorization: list[tuple[Any, int]] | None = None,
        max_elements: int = 50_000,
        max_candidates: int = 5_000_000,
        max_generator_tests: int = 100_000,
        max_trial_divisions: int = 1_000_000,
        algorithm: str = "auto",
        max_random_elements: int = 594,
        max_group_operations: int = 10_000_000,
        max_baby_steps: int = 1_000_000,
        max_memory_bytes: int = 256 * 1024 * 1024,
        seed: Any = None,
    ) -> Any:
        """Return a certified abstract group and explicit bounded-DLP map."""
        structure = self.group_structure(
            factorization=factorization,
            max_elements=max_elements,
            max_candidates=max_candidates,
            max_trial_divisions=max_trial_divisions,
            algorithm=algorithm,
            max_random_elements=max_random_elements,
            max_group_operations=max_group_operations,
            max_baby_steps=max_baby_steps,
            max_memory_bytes=max_memory_bytes,
            seed=seed,
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
                max_random_elements=max_random_elements,
                max_group_operations=max_group_operations,
                max_baby_steps=max_baby_steps,
                max_memory_bytes=max_memory_bytes,
                seed=seed,
            )
        except JacobianResourceLimitError as error:
            if error.known_structure is None:
                error.known_structure = structure
            raise


def Jacobian(curve: Any) -> HyperellipticJacobian:
    """Return the currently supported Jacobian of `curve`."""
    return HyperellipticJacobian(curve)
