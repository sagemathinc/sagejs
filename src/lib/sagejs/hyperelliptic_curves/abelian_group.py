"""Certified bounded abelian-group models for finite Jacobians."""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.hyperelliptic_curves.group_structure import (
    JacobianResourceLimitError,
    factor_integer_bounded,
    validate_factorization,
)


def _gcd(left: Any, right: Any) -> Any:
    while right:
        left, right = right, left % right
    return left if left >= 0 else -left


def _lcm(left: Any, right: Any) -> Any:
    if left == 0 or right == 0:
        return 0
    return left // _gcd(left, right) * right


@runtime.lightweight_math_class
class FiniteAbelianGroupElement(sage.Element):
    """One coordinate vector in a certified finite abelian group."""

    def __init__(self, parent: Any, coordinates: Any) -> None:
        values = tuple(coordinates)
        if len(values) != len(parent._invariants):
            raise ValueError("the coordinate vector has the wrong length")
        self._parent = parent
        self._coordinates = runtime.math_tuple(
            [
                sage.ZZ(value) % parent._invariants[index]
                for index, value in enumerate(values)
            ]
        )

    def parent(self) -> Any:
        return self._parent

    def coordinates(self) -> tuple[Any, ...]:
        return self._coordinates

    def __iter__(self) -> Any:
        yield from self._coordinates

    def __getitem__(self, index: int) -> Any:
        return self._coordinates[index]

    def __repr__(self) -> str:
        return str(self._coordinates)

    __str__ = __repr__

    def __hash__(self) -> int:
        return hash((id(self._parent), self._coordinates))

    def _eq_(self, other: Any) -> bool:
        return (
            isinstance(other, FiniteAbelianGroupElement)
            and other._parent is self._parent
            and other._coordinates == self._coordinates
        )

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __ne__(self, other: object) -> bool:
        return not self == other

    def _add_(self, other: Any) -> Any:
        if (
            not isinstance(other, FiniteAbelianGroupElement)
            or other._parent is not self._parent
        ):
            raise TypeError("abelian-group elements must have the same parent")
        return self._parent(
            [
                self._coordinates[index] + other._coordinates[index]
                for index in range(len(self._coordinates))
            ]
        )

    def __add__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp("add", self, other)

    def __radd__(self, other: Any) -> Any:
        if other == 0:
            return self
        return self.__add__(other)

    def __neg__(self) -> Any:
        return self._parent([-value for value in self._coordinates])

    def __sub__(self, other: Any) -> Any:
        return self + (-other)

    def __rmul__(self, scalar: Any) -> Any:
        if not runtime.is_exact_integer(scalar) and hasattr(scalar, "lift"):
            scalar = scalar.lift()
        if not runtime.is_exact_integer(scalar):
            raise TypeError("abelian-group multipliers must be integers")
        return self._parent([scalar * value for value in self._coordinates])

    def __mul__(self, scalar: Any) -> Any:
        return self.__rmul__(scalar)

    def _sage_binop_(self, operator: str, other: Any, reversed_operands: bool) -> Any:
        if operator == "mul" and runtime.is_exact_integer(other):
            return self.__rmul__(other)
        if isinstance(other, FiniteAbelianGroupElement):
            if operator == "add":
                return self._add_(other)
            if operator == "sub":
                return other._add_(-self) if reversed_operands else self._add_(-other)
        raise TypeError("unsupported finite abelian-group operation " + operator)

    def is_zero(self) -> bool:
        return all(value == 0 for value in self._coordinates)

    def order(self) -> Any:
        answer = 1
        for value, modulus in zip(
            self._coordinates, self._parent._invariants, strict=True
        ):
            answer = _lcm(answer, modulus // _gcd(modulus, value))
        return answer

    additive_order = order


@runtime.callable_instance_class
class FiniteAbelianGroup(sage.Parent):
    """A product of cyclic groups with exact invariant-factor coordinates."""

    Element = FiniteAbelianGroupElement

    def __init__(self, invariants: Any) -> None:
        values = tuple(sage.ZZ(value) for value in invariants)
        previous = 1
        for value in values:
            if value <= 1 or value % previous != 0:
                raise ValueError(
                    "invariant factors must exceed one and divide successively"
                )
            previous = value
        self._invariants = runtime.math_tuple(list(values))
        self._zero: FiniteAbelianGroupElement | None = None
        self._generators: tuple[FiniteAbelianGroupElement, ...] | None = None

    def __repr__(self) -> str:
        return "Finite abelian group with invariants " + str(self._invariants)

    __str__ = __repr__

    def invariants(self) -> tuple[Any, ...]:
        return self._invariants

    def order(self) -> Any:
        answer = 1
        for value in self._invariants:
            answer *= value
        return answer

    cardinality = order

    def __call__(self, coordinates: Any = None) -> FiniteAbelianGroupElement:
        if coordinates is None or coordinates == 0:
            return self.zero()
        if isinstance(coordinates, FiniteAbelianGroupElement):
            if coordinates.parent() is self:
                return coordinates
            coordinates = coordinates.coordinates()
        return FiniteAbelianGroupElement(self, coordinates)

    def zero(self) -> FiniteAbelianGroupElement:
        if self._zero is None:
            self._zero = FiniteAbelianGroupElement(
                self, [0 for _value in self._invariants]
            )
        return self._zero

    def gen(self, index: int = 0) -> FiniteAbelianGroupElement:
        if index < 0 or index >= len(self._invariants):
            raise IndexError("generator index out of range")
        values = [0 for _value in self._invariants]
        values[index] = 1
        return FiniteAbelianGroupElement(self, values)

    def gens(self) -> tuple[FiniteAbelianGroupElement, ...]:
        if self._generators is None:
            self._generators = tuple(
                self.gen(index) for index in range(len(self._invariants))
            )
        return self._generators


class JacobianAbelianMap:
    """A certified homomorphism from invariant coordinates to a Jacobian."""

    def __init__(
        self,
        domain: FiniteAbelianGroup,
        codomain: Any,
        generators: Any,
        inverse_coordinates: dict[Any, tuple[Any, ...]],
    ) -> None:
        self._domain = domain
        self._codomain = codomain
        self._generators = tuple(generators)
        self._inverse_coordinates = dict(inverse_coordinates)

    def __repr__(self) -> str:
        return "Certified abelian-group map into " + str(self._codomain)

    def domain(self) -> FiniteAbelianGroup:
        return self._domain

    def codomain(self) -> Any:
        return self._codomain

    def images(self) -> tuple[Any, ...]:
        return self._generators

    def __call__(self, element: Any) -> Any:
        value = self._domain(element)
        answer = self._codomain.zero()
        for coordinate, generator in zip(
            value.coordinates(), self._generators, strict=True
        ):
            answer += coordinate * generator
        return answer

    def preimage(self, divisor: Any) -> FiniteAbelianGroupElement:
        divisor = self._codomain(divisor)
        coordinates = self._inverse_coordinates.get(divisor)
        if coordinates is None:
            raise ValueError("the divisor is not in the certified coordinate table")
        return self._domain(coordinates)

    inverse = preimage

    def verify(self) -> bool:
        if len(self._generators) != len(self._domain.invariants()):
            return False
        for generator, order in zip(
            self._generators, self._domain.invariants(), strict=True
        ):
            if not (order * generator).is_zero():
                return False
        if len(self._inverse_coordinates) != self._domain.order():
            return False
        for divisor, coordinates in self._inverse_coordinates.items():
            if self(self._domain(coordinates)) != divisor:
                return False
        return True


def _extend_coordinates(
    subgroup: dict[Any, tuple[Any, ...]], generator: Any, order: Any
) -> dict[Any, tuple[Any, ...]] | None:
    answer: dict[Any, tuple[Any, ...]] = {}
    multiple = generator.parent().zero()
    for coordinate in range(int(order)):
        for divisor, old_coordinates in subgroup.items():
            value = divisor + multiple
            if value in answer:
                return None
            answer[value] = old_coordinates + (sage.ZZ(coordinate),)
        multiple += generator
    return answer


def certified_abelian_group(
    jacobian: Any,
    invariants: Any,
    *,
    factorization: Any = None,
    max_elements: int = 50_000,
    max_candidates: int = 5_000_000,
    max_generator_tests: int = 100_000,
    max_trial_divisions: int = 1_000_000,
) -> tuple[FiniteAbelianGroup, JacobianAbelianMap]:
    """Construct generators and both maps by bounded exhaustive certification."""
    invariant_values = tuple(sage.ZZ(value) for value in invariants if value != 1)
    group = FiniteAbelianGroup(invariant_values)
    known_order = jacobian.order()
    if group.order() != known_order:
        raise ArithmeticError("the invariant factors do not multiply to the order")
    factors = (
        factor_integer_bounded(known_order, max_trial_divisions)
        if factorization is None
        else validate_factorization(known_order, factorization)
    )
    elements = jacobian.points(max_elements, max_candidates)
    orders: dict[Any, Any] = {}
    by_order: dict[Any, list[Any]] = {}
    for element in elements:
        order = element.order(
            multiple=known_order,
            factorization=factors,
            algorithm="reference",
        )
        orders[element] = order
        by_order.setdefault(order, []).append(element)

    tests = [0]

    def search(
        index: int,
        generators: tuple[Any, ...],
        subgroup: dict[Any, tuple[Any, ...]],
    ) -> tuple[tuple[Any, ...], dict[Any, tuple[Any, ...]]] | None:
        if index == len(invariant_values):
            if len(subgroup) == known_order:
                return generators, subgroup
            return None
        target_order = invariant_values[index]
        for candidate in by_order.get(target_order, []):
            tests[0] += 1
            if tests[0] > max_generator_tests:
                error = JacobianResourceLimitError(
                    "generator search exceeds max_generator_tests="
                    + str(max_generator_tests)
                )
                error.known_structure = invariant_values
                error.partial_generators = generators
                raise error
            extended = _extend_coordinates(subgroup, candidate, target_order)
            if extended is None:
                continue
            result = search(index + 1, generators + (candidate,), extended)
            if result is not None:
                return result
        return None

    found = search(0, (), {jacobian.zero(): ()})
    if found is None:
        error = JacobianResourceLimitError(
            "no certified generator tuple was found within the bounded enumeration"
        )
        error.known_structure = invariant_values
        error.partial_generators = ()
        raise error
    generators, coordinate_table = found
    homomorphism = JacobianAbelianMap(group, jacobian, generators, coordinate_table)
    if not homomorphism.verify():
        raise ArithmeticError("the certified abelian-group map failed verification")
    return group, homomorphism
