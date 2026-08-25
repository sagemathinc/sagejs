"""Balanced divisor arithmetic for split even-degree Jacobians.

For a smooth even-degree curve `y^2 + h(x)y = f(x)` with two rational
points at infinity, an affine Mumford pair does not determine a divisor
class. This module uses the balanced `(u,v,n)` representation of
Mireles Morales, Galbraith--Harrison--Mireles Morales, and Galbraith. The
integer `n` records the multiplicity at the oriented point `infinity_plus`.

The composition and reduction formulas follow SageMath's split Jacobian
implementation, including the cancellation-degree correction fixed in
SageMath issue 42373. This is ordinary Python reference arithmetic. It does
not share the odd-degree packed/native schema.
"""

from __future__ import annotations

from typing import Any, Mapping

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.hyperelliptic_curves.jacobian import (
    JacobianResourceLimitError,
    MumfordDivisor,
    _exact_quotient,
    _polynomial_monic,
    _polynomial_remainder,
    element_order_from_multiple,
)


def _checked_weight(value: Any) -> int:
    """Return a small exact Python integer weight."""
    if isinstance(value, bool):
        raise TypeError("the split Mumford infinity weight must be an integer")
    if not runtime.is_exact_integer(value) and hasattr(value, "lift"):
        value = value.lift()
    if not runtime.is_exact_integer(value):
        raise TypeError("the split Mumford infinity weight must be an integer")
    integer = int(value)
    if value != integer:
        raise ValueError("the split Mumford infinity weight must be exact")
    return integer


class SplitJacobianStrategy:
    """Exact balanced arithmetic attached to one oriented split parent."""

    def __init__(self, parent: Any, infinity_values: tuple[Any, Any]) -> None:
        self.parent = parent
        self.infinity_values = infinity_values
        self._g_plus: Any = None
        self._g_minus: Any = None

    def validate(self, u_value: Any, v_value: Any, weight: Any) -> int:
        """Validate a canonical balanced triple and return its weight."""
        n_value = _checked_weight(weight)
        parent = self.parent
        if u_value.is_zero() or u_value[u_value.degree()] != parent.base_ring()(1):
            raise ValueError("u must be monic and nonzero")
        degree = int(u_value.degree())
        if degree > parent.dimension():
            raise ValueError("the split Mumford divisor is not reduced")
        if not v_value.is_zero() and v_value.degree() >= degree:
            raise ValueError("v must have degree smaller than u")
        if not _polynomial_remainder(
            v_value * v_value + parent.h() * v_value - parent.f(), u_value
        ).is_zero():
            raise ValueError("u does not divide v^2 + h*v - f")
        maximum = parent.dimension() - degree
        if n_value < 0 or n_value > maximum:
            raise ValueError(
                "the split Mumford infinity weight must lie between 0 and "
                + str(maximum)
            )
        return n_value

    def default_coordinates(self, u_value: Any, v_value: Any) -> tuple[Any, Any, int]:
        """Return the canonical class of the documented two-coordinate input."""
        parent = self.parent
        ring = parent.polynomial_ring()
        u_value = ring(u_value)
        v_value = ring(v_value)
        if u_value.is_zero():
            raise ValueError("a Mumford u-polynomial must be nonzero")
        u_value = _polynomial_monic(u_value)
        v_value = _polynomial_remainder(v_value, u_value)
        if not _polynomial_remainder(
            v_value * v_value + parent.h() * v_value - parent.f(), u_value
        ).is_zero():
            raise ValueError("u does not divide v^2 + h*v - f")
        weight = (parent.dimension() - int(u_value.degree()) + 1) // 2
        return self.canonicalize(u_value, v_value, weight)

    def canonicalize(
        self, u_value: Any, v_value: Any, weight: Any
    ) -> tuple[Any, Any, int]:
        """Reduce and balance a valid semi-reduced split divisor.

        A canonical value has `deg(u) <= g` and
        `0 <= n <= g - deg(u)`. Polynomial reduction strictly decreases
        `deg(u)` whenever `deg(u) > g + 1`; each infinity-composition step
        moves `n` toward that finite interval. The explicit step bounds are a
        corruption defense in addition to these mathematical measures.
        """
        n_value = _checked_weight(weight)
        genus = self.parent.dimension()
        steps = 0
        while u_value.degree() > genus + 1:
            u_value, v_value, n_value = self.reduction_step(u_value, v_value, n_value)
            steps += 1
            if steps > 2 * genus + 4:
                raise ArithmeticError("split Cantor reduction failed to decrease")
        while n_value < 0 or n_value > genus - u_value.degree():
            u_value, v_value, n_value = self.compose_at_infinity(
                u_value,
                v_value,
                n_value,
                plus=n_value >= 0,
            )
            steps += 1
            if steps > 8 * genus + 16:
                raise ArithmeticError("split infinity balancing failed to terminate")
        v_value = _polynomial_remainder(v_value, u_value)
        self.validate(u_value, v_value, n_value)
        return u_value, v_value, n_value

    def compose(
        self,
        u1: Any,
        v1: Any,
        n1: int,
        u2: Any,
        v2: Any,
        n2: int,
    ) -> tuple[Any, Any, int]:
        """Return the canonical balanced Cantor sum."""
        u3, v3, cancellation_degree = self.parent._compose_semireduced(u1, v1, u2, v2)
        n3 = (
            _checked_weight(n1)
            + _checked_weight(n2)
            + cancellation_degree
            - ((self.parent.dimension() + 1) // 2)
        )
        return self.canonicalize(u3, v3, n3)

    def reduction_step(self, u0: Any, v0: Any, n0: int) -> tuple[Any, Any, int]:
        """Apply Algorithm 3.5 of the balanced-divisor construction."""
        parent = self.parent
        genus = parent.dimension()
        u1 = _polynomial_monic(
            _exact_quotient(v0 * v0 + parent.h() * v0 - parent.f(), u0)
        )
        v1 = _polynomial_remainder(-parent.h() - v0, u1)
        degree0 = int(u0.degree())
        degree1 = int(u1.degree())
        alpha_plus, alpha_minus = self.infinity_values
        if v0.degree() <= genus + 1:
            leading = v0[genus + 1]
            if leading == alpha_plus:
                n1 = n0 + degree0 - genus - 1
            elif leading == alpha_minus:
                n1 = n0 + genus + 1 - degree1
            else:
                n1 = n0 + (degree0 - degree1) // 2
        else:
            n1 = n0 + (degree0 - degree1) // 2
        return u1, v1, n1

    def split_g_plus_minus(self) -> tuple[Any, Any]:
        """Return the exact polynomials `G+` and `G-` for infinity reduction."""
        if self._g_plus is not None:
            return self._g_plus, self._g_minus
        parent = self.parent
        genus = parent.dimension()
        degree = genus + 1
        f_value = parent.f()
        h_value = parent.h()
        alpha_plus, alpha_minus = self.infinity_values
        coefficients = [parent.base_ring()(0) for _index in range(degree + 1)]
        coefficients[degree] = alpha_plus
        denominator = 2 * alpha_plus + h_value[degree]
        if denominator == parent.base_ring()(0):
            raise ArithmeticError("the split infinity roots are not distinct")
        for index in range(degree - 1, -1, -1):
            rest = coefficients[degree] * h_value[index]
            for offset in range(index + 1, degree):
                rest += coefficients[offset] * (
                    coefficients[index + degree - offset]
                    + h_value[index + degree - offset]
                )
            coefficients[index] = (f_value[index + degree] - rest) / denominator
        g_plus = parent.polynomial_ring()(coefficients)
        g_minus = -g_plus - h_value
        if g_plus.degree() > genus + 1:
            raise ArithmeticError("G+ has excessive degree")
        remainder = g_plus * g_plus + h_value * g_plus - f_value
        if not remainder.is_zero() and remainder.degree() > genus:
            raise ArithmeticError("G+ does not have the required infinity precision")
        if g_minus[genus + 1] != alpha_minus:
            raise ArithmeticError("G- has the wrong infinity root")
        self._g_plus = g_plus
        self._g_minus = g_minus
        return g_plus, g_minus

    def compose_at_infinity(
        self,
        u0: Any,
        v0: Any,
        n0: int,
        *,
        plus: bool,
    ) -> tuple[Any, Any, int]:
        """Compose with one infinity-supported divisor and reduce once."""
        parent = self.parent
        genus = parent.dimension()
        g_plus, g_minus = self.split_g_plus_minus()
        g_value = g_plus if plus else g_minus
        v1_prime = g_value + _polynomial_remainder(v0 - g_value, u0)
        u1 = _polynomial_monic(
            _exact_quotient(
                v1_prime * v1_prime + parent.h() * v1_prime - parent.f(),
                u0,
            )
        )
        v1 = _polynomial_remainder(-parent.h() - v1_prime, u1)
        if plus:
            n1 = n0 + u0.degree() - genus - 1
        else:
            n1 = n0 + genus + 1 - u1.degree()
        return u1, v1, int(n1)

    def negate(self, u0: Any, v0: Any, n0: int) -> tuple[Any, Any, int]:
        """Return the canonical inverse using balanced Algorithm 3.8."""
        parent = self.parent
        genus = parent.dimension()
        m0 = genus - u0.degree() - n0
        if genus % 2 == 0:
            return (
                u0,
                _polynomial_remainder(-parent.h() - v0, u0),
                int(m0),
            )
        if n0 > 0:
            return (
                u0,
                _polynomial_remainder(-parent.h() - v0, u0),
                int(m0 + 1),
            )
        u1, v1, n1 = self.compose_at_infinity(
            u0,
            -parent.h() - v0,
            n0,
            plus=True,
        )
        n1 = n1 - n0 + m0 + 1
        if n1 != 0:
            raise ArithmeticError("odd-genus split negation failed to balance")
        self.validate(u1, v1, n1)
        return u1, v1, n1

    def point_coordinates(self, point: Any) -> tuple[Any, Any, int]:
        """Return the affine Mumford coordinates and infinity indicator."""
        ring = self.parent.polynomial_ring()
        if point.is_at_infinity():
            weight = 1 if point[1] == self.infinity_values[0] else 0
            return ring(1), ring(0), weight
        x_coordinate, y_coordinate = point.xy()
        return ring.gen() - x_coordinate, ring(y_coordinate), 0

    def conjugate_point(self, point: Any) -> Any:
        """Return the hyperelliptic involution of a checked curve point."""
        curve = self.parent.curve()
        if point.is_at_infinity():
            alpha_plus, alpha_minus = self.infinity_values
            other = alpha_minus if point[1] == alpha_plus else alpha_plus
            return curve([curve.base_ring()(1), other, curve.base_ring()(0)])
        x_coordinate, y_coordinate = point.xy()
        return curve(
            [
                x_coordinate,
                -curve.hyperelliptic_polynomials()[1](x_coordinate) - y_coordinate,
            ]
        )

    def point_difference(self, left: Any, right: Any) -> tuple[Any, Any, int]:
        """Return the canonical class `[left-right]`."""
        genus = self.parent.dimension()
        u1, v1, n1 = self.point_coordinates(left)
        u2, v2, n2 = self.point_coordinates(self.conjugate_point(right))
        u3, v3, cancellation_degree = self.parent._compose_semireduced(u1, v1, u2, v2)
        n3 = (genus + 1) // 2 - 1 + n1 + n2 + cancellation_degree
        return self.canonicalize(u3, v3, n3)


@runtime.lightweight_math_class
class SplitMumfordDivisor(MumfordDivisor):
    """A canonical balanced divisor on a split even-degree Jacobian."""

    def __init__(
        self,
        parent: Any,
        u_value: Any,
        v_value: Any,
        weight: Any,
        check: bool = True,
    ) -> None:
        self._parent = parent
        ring = parent.polynomial_ring()
        u_value = ring(u_value)
        v_value = ring(v_value)
        if u_value.is_zero():
            raise ValueError("a Mumford u-polynomial must be nonzero")
        if u_value[u_value.degree()] != parent.base_ring()(1):
            raise ValueError("u must be monic in canonical split coordinates")
        if not v_value.is_zero() and v_value.degree() >= u_value.degree():
            raise ValueError("v must be reduced in canonical split coordinates")
        n_value = parent._split_strategy.validate(u_value, v_value, weight)
        if check:
            parent._split_strategy.validate(u_value, v_value, n_value)
        self._u = u_value
        self._v = v_value
        self._n = n_value
        self._packed_hash = hash(
            (id(self._parent), str(self._u), str(self._v), self._n)
        )
        runtime.object.freeze(self)

    @property
    def _packed_row(self) -> None:
        """Split reference elements never claim the odd packed schema."""
        return None

    def _materialize(self) -> None:
        return None

    def is_materialized(self) -> bool:
        return True

    def uv(self) -> tuple[Any, Any]:
        raise NotImplementedError(
            "split divisors require mumford_coordinates(), including the "
            "infinity weight"
        )

    def mumford_coordinates(self) -> tuple[Any, Any, int]:
        """Return the complete canonical `(u,v,n)` representation."""
        return self._u, self._v, self._n

    def degree(self) -> int:
        return int(self._u.degree())

    def is_zero(self) -> bool:
        return (
            self._u.is_one()
            and self._v.is_zero()
            and self._n == (self._parent.dimension() + 1) // 2
        )

    def __bool__(self) -> bool:
        return not self.is_zero()

    def __iter__(self) -> Any:
        yield self._u
        yield self._v
        yield self._n

    def __getitem__(self, index: int) -> Any:
        return self.mumford_coordinates()[index]

    def __repr__(self) -> str:
        return "(" + str(self._u) + ", " + str(self._v) + " : " + str(self._n) + ")"

    __str__ = __repr__

    def _eq_(self, other: Any) -> bool:
        return (
            type(other) is type(self)
            and self._parent is other._parent
            and self._u == other._u
            and self._v == other._v
            and self._n == other._n
        )

    def __hash__(self) -> int:
        value = self._packed_hash
        if value is None:
            raise ArithmeticError("a split divisor has no canonical hash")
        return value

    def __reduce__(self) -> tuple[Any, tuple[Any, ...]]:
        return self._parent, ([self._u, self._v, self._n],)

    def __getstate__(self) -> dict[str, Any]:
        """Return portable split prime-field mathematical state."""
        field = self._parent.base_ring()
        prime = int(field.characteristic())
        if int(field.order()) != prime:
            raise NotImplementedError("split divisor state requires a prime field")

        def coefficients(polynomial: Any) -> list[int]:
            return [int(value) for value in polynomial.list()]

        return {
            "version": 2,
            "model_kind": "even-degree-split-two-infinity",
            "prime": prime,
            "variable": self._parent.polynomial_ring().variable_name(),
            "f": coefficients(self._parent.f()),
            "h": coefficients(self._parent.h()),
            "infinity": [int(value) for value in self._parent.infinity_values()],
            "u": coefficients(self._u),
            "v": coefficients(self._v),
            "n": self._n,
        }

    def __setstate__(self, state: Mapping[str, Any]) -> None:
        """Restore and revalidate portable split prime-field state."""
        expected = {
            "version",
            "model_kind",
            "prime",
            "variable",
            "f",
            "h",
            "infinity",
            "u",
            "v",
            "n",
        }
        if not isinstance(state, dict) or set(state) != expected:
            raise ValueError("invalid split Mumford divisor pickle state")
        if state["version"] != 2 or state["model_kind"] != (
            "even-degree-split-two-infinity"
        ):
            raise ValueError("unsupported split Mumford divisor state version")
        finite_fields = __import__(
            "sagejs._baselib.finite_fields",
            fromlist=["GF"],
        )
        model = __import__(
            "sagejs.hyperelliptic_curves.model",
            fromlist=["HyperellipticCurve"],
        )
        field = finite_fields.GF(state["prime"])
        ring = sage.PolynomialRing(field, state["variable"])
        jacobian = model.HyperellipticCurve(
            ring(state["f"]), ring(state["h"])
        ).jacobian()
        if [int(value) for value in jacobian.infinity_values()] != list(
            state["infinity"]
        ):
            raise ValueError("split Mumford infinity orientation changed")
        u_value = ring(state["u"])
        v_value = ring(state["v"])
        n_value = jacobian._split_strategy.validate(u_value, v_value, state["n"])
        self._parent = jacobian
        self._u = u_value
        self._v = v_value
        self._n = n_value
        self._packed_hash = hash(
            (id(self._parent), str(self._u), str(self._v), self._n)
        )
        runtime.object.freeze(self)

    def _negate_reference(self) -> Any:
        u_value, v_value, n_value = self._parent._split_strategy.negate(
            self._u, self._v, self._n
        )
        return self._parent._element(
            u_value,
            v_value,
            False,
            n=n_value,
        )

    def negate(
        self,
        *,
        algorithm: str = "auto",
        diagnostics: bool = False,
    ) -> Any:
        """Return the exact balanced inverse."""
        self._parent._validate_split_algorithm(algorithm)
        value = self._negate_reference()
        if diagnostics:
            return value, self._parent._split_diagnostics("negate", 1)
        return value

    def _add_(self, other: Any) -> Any:
        return self.add(other)

    def add(
        self,
        other: Any,
        *,
        algorithm: str = "auto",
        diagnostics: bool = False,
    ) -> Any:
        """Add two split divisors with the ordinary balanced Cantor law."""
        if type(other) is not type(self) or other._parent is not self._parent:
            raise TypeError("split Jacobian divisors must have the same parent")
        self._parent._validate_split_algorithm(algorithm)
        u_value, v_value, n_value = self._parent._split_strategy.compose(
            self._u,
            self._v,
            self._n,
            other._u,
            other._v,
            other._n,
        )
        value = self._parent._element(
            u_value,
            v_value,
            False,
            n=n_value,
        )
        if diagnostics:
            return value, self._parent._split_diagnostics("add", 2)
        return value

    def double(
        self,
        *,
        algorithm: str = "auto",
        diagnostics: bool = False,
    ) -> Any:
        """Return twice this split divisor."""
        return self.add(self, algorithm=algorithm, diagnostics=diagnostics)

    def subtract(
        self,
        other: Any,
        *,
        algorithm: str = "auto",
        diagnostics: bool = False,
    ) -> Any:
        """Subtract two split divisors."""
        if type(other) is not type(self) or other._parent is not self._parent:
            raise TypeError("split Jacobian divisors must have the same parent")
        self._parent._validate_split_algorithm(algorithm)
        value = self.add(other._negate_reference(), algorithm="reference")
        if diagnostics:
            return value, self._parent._split_diagnostics("subtract", 2)
        return value

    def _scalar_multiple_reference(
        self,
        scalar: Any,
        max_group_operations: Any = None,
    ) -> Any:
        if not runtime.is_exact_integer(scalar) and hasattr(scalar, "lift"):
            scalar = scalar.lift()
        if not runtime.is_exact_integer(scalar):
            raise TypeError("Jacobian divisor multipliers must be integers")
        scalar = int(scalar)
        if scalar < 0:
            return self._negate_reference()._scalar_multiple_reference(
                -scalar, max_group_operations
            )
        required = 0
        budget_scalar = scalar
        while budget_scalar:
            if budget_scalar % 2:
                required += 1
            budget_scalar //= 2
            if budget_scalar:
                required += 1
        if max_group_operations is not None:
            maximum = int(max_group_operations)
            if maximum < 0:
                raise ValueError("max_group_operations must be nonnegative")
            if required > maximum:
                raise JacobianResourceLimitError(
                    "split scalar multiplication exceeds max_group_operations="
                    + str(maximum)
                )
        result = self._parent.zero()
        addend = self
        while scalar:
            if scalar % 2:
                result = result.add(addend, algorithm="reference")
            scalar //= 2
            if scalar:
                addend = addend.add(addend, algorithm="reference")
        return result

    def scalar_multiple(
        self,
        scalar: Any,
        *,
        algorithm: str = "auto",
        max_group_operations: Any = None,
    ) -> Any:
        """Return an exact reference scalar multiple."""
        self._parent._validate_split_algorithm(algorithm)
        return self._scalar_multiple_reference(scalar, max_group_operations)

    def order(
        self,
        multiple: Any = None,
        factorization: list[tuple[Any, int]] | None = None,
        max_trial_divisions: int = 1_000_000,
        algorithm: str = "auto",
    ) -> Any:
        """Return the exact element order through reference arithmetic."""
        self._parent._validate_split_algorithm(algorithm)
        if multiple is None:
            multiple = self._parent.order()
        return element_order_from_multiple(
            self,
            multiple,
            factorization,
            max_trial_divisions,
            scalar_algorithm="reference",
        )

    additive_order = order

    def canonical_height(self, **options: Any) -> Any:
        raise NotImplementedError(
            "canonical heights do not yet support split even-degree Jacobians"
        )


class PreparedSplitJacobianArithmetic:
    """Reference-only prepared facade for a split even-degree parent."""

    def __init__(
        self,
        jacobian: Any,
        *,
        algorithm: str,
        max_batch_items: int,
    ) -> None:
        jacobian._validate_split_algorithm(algorithm)
        self._jacobian = jacobian
        self.max_batch_items = max_batch_items
        self.native_available = False
        self.selected_algorithm = "reference"
        self.model_kind = "even-degree-split-two-infinity"
        self.reason = "split-even-degree-reference-only"
        self.closed = False

    def capability(self) -> dict[str, Any]:
        return {
            "available": False,
            "selected": "reference",
            "reason": self.reason,
            "model_kind": self.model_kind,
            "schema": None,
        }

    def close(self) -> None:
        self.closed = True

    def _items(self, values: Any) -> list[Any]:
        if self.closed:
            raise RuntimeError("the split prepared context is closed")
        answer = list(values)
        if len(answer) > self.max_batch_items:
            raise JacobianResourceLimitError(
                "split batch exceeds max_batch_items=" + str(self.max_batch_items)
            )
        for value in answer:
            if (
                type(value) is not self._jacobian.Element
                or value.parent() is not self._jacobian
            ):
                raise ValueError("every split batch element must use this context")
        return answer

    def add_batch(self, left: Any, right: Any, *, diagnostics: bool = False) -> Any:
        left_values = self._items(left)
        right_values = self._items(right)
        if len(left_values) != len(right_values):
            raise ValueError("split add batches must have equal length")
        values = [
            first.add(second, algorithm="reference")
            for first, second in zip(left_values, right_values, strict=True)
        ]
        if diagnostics:
            return values, self._jacobian._split_diagnostics("add_batch", len(values))
        return values

    def subtract_batch(
        self, left: Any, right: Any, *, diagnostics: bool = False
    ) -> Any:
        left_values = self._items(left)
        right_values = self._items(right)
        if len(left_values) != len(right_values):
            raise ValueError("split subtract batches must have equal length")
        values = [
            first.subtract(second, algorithm="reference")
            for first, second in zip(left_values, right_values, strict=True)
        ]
        if diagnostics:
            return values, self._jacobian._split_diagnostics(
                "subtract_batch", len(values)
            )
        return values

    def negate_batch(self, values: Any, *, diagnostics: bool = False) -> Any:
        items = self._items(values)
        result = [value.negate(algorithm="reference") for value in items]
        if diagnostics:
            return result, self._jacobian._split_diagnostics(
                "negate_batch", len(result)
            )
        return result

    def double_batch(self, values: Any, *, diagnostics: bool = False) -> Any:
        items = self._items(values)
        result = [value.double(algorithm="reference") for value in items]
        if diagnostics:
            return result, self._jacobian._split_diagnostics(
                "double_batch", len(result)
            )
        return result

    def scalar_batch(
        self,
        values: Any,
        scalars: Any,
        *,
        algorithm: str = "auto",
        max_group_operations: Any = None,
    ) -> list[Any]:
        self._jacobian._validate_split_algorithm(algorithm)
        items = self._items(values)
        scalar_values = list(scalars)
        if len(items) != len(scalar_values):
            raise ValueError("split scalar batches must have equal length")
        return [
            value.scalar_multiple(
                scalar,
                algorithm="reference",
                max_group_operations=max_group_operations,
            )
            for value, scalar in zip(items, scalar_values, strict=True)
        ]

    def sum(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
        materialize: bool = False,
    ) -> Any:
        """Return the exact reference sum of a bounded split batch."""
        requested = "auto" if algorithm is None else algorithm
        self._jacobian._validate_split_algorithm(requested)
        items = self._items(elements)
        result = self._jacobian.zero()
        for value in items:
            result = result.add(value, algorithm="reference")
        if diagnostics:
            return result, self._jacobian._split_diagnostics("sum", len(items))
        return result
