"""Certified bounded abelian-group models for finite Jacobians."""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.hyperelliptic_curves.group_structure import (
    GroupOperationBudget,
    JacobianResourceLimitError,
    _cartesian_ranges,
    _linear_combinations,
    _prepared_context,
    basis_from_generators,
    coordinates_in_basis,
    factor_integer_bounded,
    group_element_key,
    scalar_multiples_batched,
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
        inverse_coordinates: Any = None,
        *,
        factorization: Any = None,
        certificate: Any = None,
        max_group_operations: int = 10_000_000,
        max_baby_steps: int = 1_000_000,
        max_memory_bytes: int = 256 * 1024 * 1024,
    ) -> None:
        self._domain = domain
        self._codomain = codomain
        self._generators = tuple(generators)
        self._key_context = _prepared_context(codomain, "auto")
        self._inverse_coordinates: dict[Any, tuple[Any, tuple[Any, ...]]] = {}
        if inverse_coordinates is not None:
            items = (
                inverse_coordinates.items()
                if hasattr(inverse_coordinates, "items")
                else inverse_coordinates
            )
            for divisor, coordinates in items:
                self._inverse_coordinates[
                    group_element_key(divisor, self._key_context)
                ] = (
                    divisor,
                    tuple(coordinates),
                )
        self._factorization = tuple(factorization or ())
        self._certificate = certificate
        self._max_group_operations = max_group_operations
        self._max_baby_steps = max_baby_steps
        self._max_memory_bytes = max_memory_bytes

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
        if not self._generators:
            return self._codomain.zero()
        budget = GroupOperationBudget(
            self._max_group_operations,
            self._max_baby_steps,
            self._max_memory_bytes,
            "auto",
        )
        return budget.linear_combination(value.coordinates(), self._generators)

    def preimage(self, divisor: Any) -> FiniteAbelianGroupElement:
        divisor = self._codomain(divisor)
        key = group_element_key(divisor, self._key_context)
        cached = self._inverse_coordinates.get(key)
        coordinates = None if cached is None else cached[1]
        if cached is not None and cached[0] != divisor:
            coordinates = None
        if coordinates is None:
            budget = GroupOperationBudget(
                self._max_group_operations,
                self._max_baby_steps,
                self._max_memory_bytes,
                "auto",
            )
            coordinates = coordinates_in_basis(
                divisor,
                self._generators,
                self._domain.invariants(),
                self._factorization,
                budget,
            )
            self._inverse_coordinates[key] = (divisor, coordinates)
        return self._domain(coordinates)

    inverse = preimage

    def verify(self) -> bool:
        if len(self._generators) != len(self._domain.invariants()):
            return False
        if self._generators:
            products = scalar_multiples_batched(
                self._generators,
                self._domain.invariants(),
                algorithm="auto",
            )
            if any(not product.is_zero() for product in products):
                return False
        exhaustive_table_verified = False
        if len(self._inverse_coordinates) == int(self._domain.order()):
            expected_coordinates = tuple(
                _cartesian_ranges(
                    [range(int(value)) for value in self._domain.invariants()]
                )
            )
            rows = tuple(
                tuple(int(value) for value in coordinates)
                for _divisor, coordinates in self._inverse_coordinates.values()
            )
            if tuple(sorted(rows)) != tuple(sorted(expected_coordinates)):
                return False
            divisors = tuple(
                divisor for divisor, _coordinates in self._inverse_coordinates.values()
            )
            if self._generators:
                budget = GroupOperationBudget(
                    self._max_group_operations,
                    self._max_baby_steps,
                    self._max_memory_bytes,
                    "auto",
                )
                budget.reserve_table(len(rows))
                rebuilt = _linear_combinations(rows, self._generators, budget)
            else:
                rebuilt = tuple(self._codomain.zero() for _row in rows)
            if rebuilt != divisors:
                return False
            exhaustive_table_verified = True
        else:
            for divisor, coordinates in self._inverse_coordinates.values():
                if self(self._domain(coordinates)) != divisor:
                    return False
        if self._certificate is not None:
            if not self._codomain.verify_group_structure_certificate(
                self._certificate,
                max_group_operations=self._max_group_operations,
                max_baby_steps=self._max_baby_steps,
                max_memory_bytes=self._max_memory_bytes,
            ):
                return False
        elif not exhaustive_table_verified:
            budget = GroupOperationBudget(
                self._max_group_operations,
                self._max_baby_steps,
                self._max_memory_bytes,
                "reference",
            )
            _basis, orders = basis_from_generators(
                self._generators,
                self._domain.invariants(),
                self._factorization,
                budget,
            )
            product = 1
            for order in orders:
                product *= order
            if product != self._domain.order():
                return False
        return True


def _tiny_exhaustive_basis_table(
    jacobian: Any,
    invariant_values: tuple[Any, ...],
    known_order: int,
    *,
    max_elements: int,
    max_candidates: int,
    max_generator_tests: int,
    budget: GroupOperationBudget,
) -> tuple[tuple[Any, ...], list[tuple[Any, tuple[Any, ...]]]]:
    """Derive a basis and every coordinate from a complete tiny group."""
    cached = getattr(jacobian, "_tiny_exhaustive_group_elements", None)
    if isinstance(cached, tuple) and len(cached) == 2 and int(cached[0]) == known_order:
        elements = tuple(cached[1])
        if len(elements) != known_order or any(
            element.parent() is not jacobian for element in elements
        ):
            raise ArithmeticError("the cached tiny exhaustive group is misbound")
    else:
        elements = tuple(jacobian.points(max_elements, max_candidates))
    if len(elements) != known_order:
        raise ArithmeticError("the tiny exhaustive Jacobian has the wrong order")
    if not invariant_values:
        if known_order != 1:
            raise ArithmeticError("a nontrivial group needs invariant generators")
        return (), [(jacobian.zero(), ())]

    reversed_invariants = tuple(reversed(tuple(int(v) for v in invariant_values)))
    tests = 0

    def extend(
        position: int,
        generators: tuple[Any, ...],
        table: list[tuple[Any, tuple[Any, ...]]],
    ) -> tuple[tuple[Any, ...], list[tuple[Any, tuple[Any, ...]]]] | None:
        nonlocal tests
        if position == len(reversed_invariants):
            return generators, table
        order = reversed_invariants[position]
        table_keys = {budget.element_key(divisor) for divisor, _coordinates in table}
        for candidate in elements:
            if budget.element_key(candidate) in table_keys:
                continue
            tests += 1
            if tests > max_generator_tests:
                raise JacobianResourceLimitError(
                    "tiny exhaustive basis exceeds max_generator_tests="
                    + str(max_generator_tests),
                    diagnostics=budget.diagnostics(),
                )
            seen: dict[Any, Any] = {}
            extended = [(divisor, prefix + (sage.ZZ(0),)) for divisor, prefix in table]
            independent = True
            for divisor, _coordinates in table:
                seen[budget.element_key(divisor)] = divisor
            layer = tuple(divisor for divisor, _coordinates in table)
            for scalar in range(1, order):
                layer = budget.add_batch(layer, tuple(candidate for _divisor in table))
                for divisor, (_old_divisor, prefix) in zip(layer, table, strict=True):
                    key = budget.element_key(divisor)
                    previous = seen.get(key)
                    if previous is not None:
                        if previous != divisor:
                            raise ArithmeticError("canonical divisor keys collided")
                        independent = False
                        break
                    seen[key] = divisor
                    extended.append((divisor, prefix + (sage.ZZ(scalar),)))
                if not independent:
                    break
            if independent:
                closing = budget.add(layer[0], candidate)
                if not closing.is_zero():
                    independent = False
            if not independent or len(extended) != len(table) * order:
                continue
            answer = extend(
                position + 1,
                generators + (candidate,),
                extended,
            )
            if answer is not None:
                return answer
        return None

    answer = extend(0, (), [(jacobian.zero(), ())])
    if answer is None:
        raise ArithmeticError("the exhaustive group has no basis of the claimed type")
    reversed_generators, reversed_table = answer
    if len(reversed_table) != known_order:
        raise ArithmeticError("the tiny exhaustive coordinate table has wrong size")
    generators = tuple(reversed(reversed_generators))
    coordinate_table = [
        (divisor, tuple(reversed(coordinates)))
        for divisor, coordinates in reversed_table
    ]
    return generators, coordinate_table


def certified_abelian_group(
    jacobian: Any,
    invariants: Any,
    *,
    factorization: Any = None,
    max_elements: int = 50_000,
    max_candidates: int = 5_000_000,
    max_generator_tests: int = 100_000,
    max_trial_divisions: int = 1_000_000,
    max_random_elements: int = 594,
    max_group_operations: int = 10_000_000,
    max_baby_steps: int = 1_000_000,
    max_memory_bytes: int = 256 * 1024 * 1024,
    seed: Any = None,
) -> tuple[FiniteAbelianGroup, JacobianAbelianMap]:
    """Construct a sampled exact basis and bounded explicit coordinate maps."""
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
    coordinate_table: list[tuple[Any, tuple[Any, ...]]] = [
        (
            jacobian.zero(),
            tuple(sage.ZZ(0) for _value in invariant_values),
        )
    ]
    certificate = None
    exhaustive_table_proved = False
    # For genuinely tiny groups, evaluate every certified basis coordinate in
    # one prepared batch. Re-solving the same vector DLP independently for
    # every enumerated divisor dominates explicit-map construction even for
    # the 32-element rank-three fixture.
    if known_order <= min(max_elements, 64):
        budget = GroupOperationBudget(
            max_group_operations,
            max_baby_steps,
            max_memory_bytes,
            "auto",
        )
        budget.reserve_table(known_order)
        generators, coordinate_table = _tiny_exhaustive_basis_table(
            jacobian,
            invariant_values,
            known_order,
            max_elements=max_elements,
            max_candidates=max_candidates,
            max_generator_tests=max_generator_tests,
            budget=budget,
        )
        exhaustive_table_proved = True
    else:
        result = jacobian._generic_group_basis(
            factors,
            max_random_elements=max_random_elements,
            max_group_operations=max_group_operations,
            max_baby_steps=max_baby_steps,
            max_memory_bytes=max_memory_bytes,
            seed=seed,
            scalar_algorithm="auto",
        )
        if tuple(result["invariants"]) != invariant_values:
            raise ArithmeticError("the certified basis disagrees with the structure")
        generators = tuple(result["generators"])
        certificate = jacobian._group_certificate_from_basis(result)
    homomorphism = JacobianAbelianMap(
        group,
        jacobian,
        generators,
        coordinate_table,
        factorization=factors,
        certificate=certificate,
        max_group_operations=max_group_operations,
        max_baby_steps=max_baby_steps,
        max_memory_bytes=max_memory_bytes,
    )
    # The tiny helper has already built every coordinate by exact group
    # addition, checked that all canonical divisor keys are distinct, proved
    # each generator's exact claimed order, and reached the known group order.
    # Keep `homomorphism.verify()` available as an independent replay, but do
    # not repeat that full replay during construction.
    if not exhaustive_table_proved and not homomorphism.verify():
        raise ArithmeticError("the certified abelian-group map failed verification")
    return group, homomorphism
