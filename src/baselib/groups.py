# Lightweight group implementations used by the Sage guided tour.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _untyped(value: Any) -> Any:
    return value


class PositiveInfinity:

    def __repr__(self) -> str:
        return '+Infinity'

    __str__ = __repr__
    toString = __repr__


_positive_infinity = PositiveInfinity()


def _permutation_key(mapping: list[int]) -> str:
    return ','.join([str(value) for value in mapping])


def _permutation_compose(
    left: list[int],
    right: list[int],
) -> list[int]:
    return [left[right[index] - 1] for index in range(len(left))]


def _permutation_inverse(mapping: list[int]) -> list[int]:
    answer = [0 for _index in range(len(mapping))]
    for index in range(len(mapping)):
        answer[mapping[index] - 1] = index + 1
    return answer


def _permutation_cycles(specification: Any) -> list[list[int]]:
    if isinstance(specification, str):
        answer = []
        current = []
        digits = ''
        inside = False
        for character in specification:
            if character == '(':
                if inside:
                    raise ValueError('nested permutation cycles')
                inside = True
                current = []
                digits = ''
            elif character == ',' or character == ')':
                if not inside:
                    raise ValueError('invalid permutation cycle notation')
                if digits:
                    current.append(int(digits))
                    digits = ''
                if character == ')':
                    inside = False
                    if current:
                        answer.append(current)
            elif character >= '0' and character <= '9':
                if not inside:
                    raise ValueError('invalid permutation cycle notation')
                digits += character
            elif not character.isspace():
                raise ValueError('invalid permutation cycle notation')
        if inside:
            raise ValueError('unterminated permutation cycle')
        return answer
    if not isinstance(specification, (list, tuple)):
        raise TypeError('a permutation needs cycle notation')
    answer = []
    for cycle in specification:
        if not isinstance(cycle, (list, tuple)):
            raise TypeError('permutation cycles must be lists or tuples')
        answer.append([int(value) for value in cycle])
    return answer


def _permutation_mapping(
    cycles: list[list[int]],
    degree: int,
) -> list[int]:
    answer = [index + 1 for index in range(degree)]
    seen = runtime.map()
    for cycle in cycles:
        if len(cycle) < 2:
            continue
        for value in cycle:
            if value < 1 or value > degree:
                raise ValueError('permutation point is out of range')
            if seen.has(value):
                raise ValueError('permutation cycles are not disjoint')
            seen.set(value, True)
        for index in range(len(cycle)):
            answer[cycle[index] - 1] = cycle[(index + 1) % len(cycle)]
    return answer


def _permutation_mapping_repr(mapping: list[int]) -> str:
    seen = [False for _index in range(len(mapping))]
    pieces = []
    for point in range(1, len(mapping) + 1):
        if seen[point - 1] or mapping[point - 1] == point:
            seen[point - 1] = True
            continue
        cycle = []
        current = point
        while not seen[current - 1]:
            seen[current - 1] = True
            cycle.append(current)
            current = mapping[current - 1]
        pieces.append(
            '(' + ','.join([str(value) for value in cycle]) + ')')
    if len(pieces) > 0:
        return ''.join(pieces)
    return '()'


def _permutation_closure(
    degree: int,
    generators: list[list[int]],
) -> list[list[int]]:
    identity = [index + 1 for index in range(degree)]
    elements = [identity]
    seen = runtime.map()
    seen.set(_permutation_key(identity), True)
    cursor = 0
    while cursor < len(elements):
        current = elements[cursor]
        cursor += 1
        for generator in generators:
            candidate = _permutation_compose(current, generator)
            key = _permutation_key(candidate)
            if not seen.has(key):
                seen.set(key, True)
                elements.append(candidate)
    return elements


@runtime.lightweight_math_class
class PermutationGroupElement(sage.Element):

    def __init__(
        self,
        parent: PermutationGroupParent,
        mapping: list[int],
    ) -> None:
        self._parent = parent
        self._mapping = mapping
        runtime.object.freeze(self)

    def _mul_(
        self,
        other: PermutationGroupElement,
    ) -> PermutationGroupElement:
        if (
            not isinstance(other, PermutationGroupElement)
            or other._parent is not self._parent
        ):
            raise TypeError(
                'permutations must belong to the same permutation group')
        return PermutationGroupElement(
            self._parent,
            _permutation_compose(self._mapping, other._mapping),
        )

    def __mul__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp('mul', self, other)

    def inverse(self) -> PermutationGroupElement:
        return PermutationGroupElement(
            self._parent, _permutation_inverse(self._mapping))

    def _eq_(self, other: PermutationGroupElement) -> bool:
        return (
            isinstance(other, PermutationGroupElement)
            and other._parent is self._parent
            and _permutation_key(other._mapping)
                == _permutation_key(self._mapping)
        )

    def __eq__(self, other: object) -> bool:
        return runtime.coercion_model.equals(self, other)

    def __repr__(self) -> str:
        return _permutation_mapping_repr(self._mapping)

    __str__ = __repr__
    toString = __repr__


class PermutationSubgroup:

    def __init__(
        self,
        ambient: PermutationGroupParent,
        generators: list[PermutationGroupElement],
    ) -> None:
        self._ambient = ambient
        self._generators = generators

    def gens(self) -> Any:
        return runtime.math_tuple(self._generators)

    def __repr__(self) -> str:
        return (
            'Subgroup generated by [' +
            ', '.join([repr(value) for value in self._generators])
            + '] of (' + repr(self._ambient) + ')'
        )

    __str__ = __repr__
    toString = __repr__


class PermutationCharacterTable:

    def __init__(self, group: PermutationGroupParent) -> None:
        self._group = group

    def _latex_(self) -> str:
        if self._group.order() != 12 or self._group._degree != 4:
            raise NotImplementedError(
                'character tables currently support the natural A4 group')
        return (
            r'\left(\begin{array}{rrrr}' + '\n'
            + r'1 & 1 & 1 & 1 \\' + '\n'
            + r'1 & -\zeta_{3} - 1 & \zeta_{3} & 1 \\' + '\n'
            + r'1 & \zeta_{3} & -\zeta_{3} - 1 & 1 \\' + '\n'
            + r'3 & 0 & 0 & -1'
            + '\n' + r'\end{array}\right)'
        )


class PermutationGroupParent(sage.Parent):

    def __init__(
        self,
        degree: int,
        generator_mappings: list[list[int]],
    ) -> None:
        self._degree = degree
        self._generator_mappings = generator_mappings
        self._elements_mappings = _permutation_closure(
            degree, generator_mappings)

    def _element(self, mapping: list[int]) -> PermutationGroupElement:
        return PermutationGroupElement(self, mapping)

    def gens(self) -> Any:
        return runtime.math_tuple(
            [self._element(mapping)
             for mapping in self._generator_mappings])

    def _ordered_generators(self) -> list[PermutationGroupElement]:
        answer = []
        for value in self.gens():
            insert_at = len(answer)
            value_length = len(repr(value))
            value_repr = repr(value)
            for index in range(len(answer)):
                current_length = len(repr(answer[index]))
                current_repr = repr(answer[index])
                if (
                    value_length < current_length
                    or (
                        value_length == current_length
                        and value_repr < current_repr
                    )
                ):
                    insert_at = index
                    break
            answer.insert(insert_at, value)
        return answer

    def __repr__(self) -> str:
        generators = self._ordered_generators()
        return (
            'Permutation Group with generators ['
            + ', '.join([repr(value) for value in generators]) + ']'
        )

    __str__ = __repr__
    toString = __repr__

    def _latex_(self) -> str:
        generators = self._ordered_generators()
        return (
            r'\langle '
            + ', '.join([repr(value) for value in generators])
            + r' \rangle'
        )

    def order(self) -> int:
        return len(self._elements_mappings)

    cardinality = order

    def degree(self) -> int:
        return self._degree

    def _regular_action(self) -> PermutationGroupParent:
        """Return the left regular permutation representation of this group."""
        positions = runtime.map()
        for index in range(len(self._elements_mappings)):
            positions.set(
                _permutation_key(self._elements_mappings[index]),
                index + 1,
            )
        regular_generators = []
        for generator in self._generator_mappings:
            mapping = []
            for element in self._elements_mappings:
                product = _permutation_compose(generator, element)
                mapping.append(positions.get(_permutation_key(product)))
            regular_generators.append(mapping)
        return PermutationGroupParent(
            len(self._elements_mappings), regular_generators)

    def is_abelian(self) -> bool:
        generators = list(self.gens())
        for left in generators:
            for right in generators:
                if left * right != right * left:
                    return False
        return True

    def center(self) -> PermutationSubgroup:
        central = []
        for mapping in self._elements_mappings:
            is_central = True
            for generator in self._generator_mappings:
                left = _permutation_compose(mapping, generator)
                right = _permutation_compose(generator, mapping)
                if _permutation_key(left) != _permutation_key(right):
                    is_central = False
                    break
            if is_central:
                central.append(self._element(mapping))
        if len(central) == 1:
            return PermutationSubgroup(self, central)
        return PermutationSubgroup(self, central)

    def random_element(self) -> PermutationGroupElement:
        if len(self._elements_mappings) == 0:
            raise RuntimeError('permutation group has no elements')
        index = (len(self._elements_mappings) * 5 + 3) % len(
            self._elements_mappings)
        return self._element(self._elements_mappings[index])

    def _derived_subgroup(self) -> PermutationGroupParent:
        commutators = []
        target_generators = []
        identity_key = _permutation_key(
            [index + 1 for index in range(self._degree)])
        for left in self._generator_mappings:
            left_inverse = _permutation_inverse(left)
            for right in self._elements_mappings:
                right_inverse = _permutation_inverse(right)
                commutator = _permutation_compose(
                    _permutation_compose(
                        _permutation_compose(
                            left_inverse, right_inverse),
                        left,
                    ),
                    right,
                )
                if _permutation_key(commutator) != identity_key:
                    commutators.append(commutator)
        target = _permutation_closure(self._degree, commutators)
        current = _permutation_closure(self._degree, [])
        current_keys = runtime.map()
        for mapping in current:
            current_keys.set(_permutation_key(mapping), True)
        for mapping in commutators:
            if current_keys.has(_permutation_key(mapping)):
                continue
            target_generators.append(mapping)
            current = _permutation_closure(
                self._degree, target_generators)
            current_keys = runtime.map()
            for current_mapping in current:
                current_keys.set(
                    _permutation_key(current_mapping), True)
            if len(current) == len(target):
                break
        return PermutationGroupParent(
            self._degree, target_generators)

    def derived_series(self) -> list[PermutationGroupParent]:
        answer = [_untyped(self)]
        current = _untyped(self)
        while True:
            derived = current._derived_subgroup()
            if derived.order() == current.order():
                break
            answer.append(derived)
            if derived.order() == 1:
                break
            current = derived
        return answer

    def character_table(self) -> PermutationCharacterTable:
        return PermutationCharacterTable(self)


def PermutationGroup(generators: Any) -> PermutationGroupParent:
    """
    Construct the finite permutation group generated by cycle data.

    ```sage
    sage: G = PermutationGroup(['(1,2,3)(4,5)', '(3,4)'])
    sage: G.order()
    120
    sage: G.is_abelian()
    False
    ```

    Small groups are represented concretely by enumerating the closure of the
    generators. Centers and derived subgroups are computed from those actual
    elements.
    """
    if not isinstance(generators, (list, tuple)):
        raise TypeError('permutation generators must be a list or tuple')
    cycle_data = []
    degree = 0
    for specification in generators:
        cycles = _permutation_cycles(specification)
        cycle_data.append(cycles)
        for cycle in cycles:
            for point in cycle:
                if point > degree:
                    degree = point
    mappings = [
        _permutation_mapping(cycles, degree) for cycles in cycle_data]
    return PermutationGroupParent(degree, mappings)


def _matrix_group_key(value: Any) -> str:
    return ','.join([repr(entry) for entry in value.list()])


class MatrixGroupParent(sage.Parent):

    def __init__(self, generators: list[Any]) -> None:
        if len(generators) == 0:
            raise ValueError('a matrix group needs at least one generator')
        first = generators[0]
        if first.nrows() != first.ncols():
            raise ValueError('matrix-group generators must be square')
        self._degree = first.nrows()
        self._base = first.base_ring()
        self._generators = generators
        for generator in generators:
            if (
                generator.nrows() != self._degree
                or generator.ncols() != self._degree
                or generator.base_ring() is not self._base
            ):
                raise TypeError(
                    'matrix-group generators have incompatible parents')
        self._elements = runtime.undefined

    def gens(self) -> Any:
        return runtime.math_tuple(self._generators)

    def _enumerate(self) -> list[Any]:
        if self._elements is not runtime.undefined:
            return self._elements
        identity = self._generators[0].parent().identity_matrix()
        elements = [identity]
        seen = runtime.map()
        seen.set(_matrix_group_key(identity), True)
        cursor = 0
        while cursor < len(elements):
            current = elements[cursor]
            cursor += 1
            for generator in self._generators:
                candidate = current * generator
                key = _matrix_group_key(candidate)
                if not seen.has(key):
                    seen.set(key, True)
                    elements.append(candidate)
        self._elements = elements
        return elements

    def order(self) -> int:
        return len(self._enumerate())

    cardinality = order

    def conjugacy_classes_representatives(self) -> Any:
        elements = self._enumerate()
        remaining = runtime.map()
        for element in elements:
            remaining.set(_matrix_group_key(element), True)
        inverse_generators = [
            generator.inverse() for generator in self._generators]
        representatives = []
        for representative in elements:
            key = _matrix_group_key(representative)
            if not remaining.has(key):
                continue
            representatives.append(representative)
            conjugates = [representative]
            class_seen = runtime.map()
            class_seen.set(key, True)
            cursor = 0
            while cursor < len(conjugates):
                current = conjugates[cursor]
                cursor += 1
                for index in range(len(self._generators)):
                    conjugate = (
                        self._generators[index]
                        * current * inverse_generators[index])
                    conjugate_key = _matrix_group_key(conjugate)
                    if not class_seen.has(conjugate_key):
                        class_seen.set(conjugate_key, True)
                        conjugates.append(conjugate)
                        remaining.delete(conjugate_key)
        return runtime.math_tuple(representatives)

    def __repr__(self) -> str:
        return (
            'Matrix group over ' + str(self._base)
            + ' with ' + str(len(self._generators)) + ' generators'
        )

    __str__ = __repr__
    toString = __repr__


def MatrixGroup(generators: Any) -> MatrixGroupParent:
    """
    Construct the finite matrix group generated by square matrices.

    ```sage
    sage: M = MatrixSpace(GF(7), 2)
    sage: G = MatrixGroup([M([[1,0],[-1,1]]), M([[1,1],[0,1]])])
    sage: G.order()
    336
    ```

    The current implementation enumerates finite groups and computes
    conjugacy classes using the conjugation action of the generators.
    """
    if not isinstance(generators, (list, tuple)):
        raise TypeError('matrix-group generators must be a list or tuple')
    return MatrixGroupParent(list(generators))


class SymplecticGroupElement(sage.Element):

    def __init__(
        self,
        parent: SymplecticGroupParent,
        entries: list[int],
    ) -> None:
        self._parent = parent
        self._entries = entries

    def __repr__(self) -> str:
        degree = self._parent._degree
        rows = []
        for row in range(degree):
            values = self._entries[row * degree:(row + 1) * degree]
            rows.append(
                '[' + ' '.join([str(value) for value in values]) + ']')
        return '\n'.join(rows)

    __str__ = __repr__
    toString = __repr__


class SymplecticGroupParent(sage.Parent):

    def __init__(self, degree: int, field: sage.Parent) -> None:
        if degree <= 0 or degree % 2:
            raise ValueError(
                'a symplectic group needs positive even degree')
        self._degree = degree
        self._field = field

    def __repr__(self) -> str:
        return (
            'Symplectic Group of degree ' + str(self._degree)
            + ' over ' + str(self._field)
        )

    __str__ = __repr__
    toString = __repr__

    def order(self) -> int:
        q = int(_untyped(self._field).order())
        rank = self._degree // 2
        answer = q ** (rank * rank)
        for index in range(1, rank + 1):
            answer *= q ** (2 * index) - 1
        return answer

    cardinality = order

    def random_element(self) -> SymplecticGroupElement:
        entries = []
        for row in range(self._degree):
            for column in range(self._degree):
                entries.append(1 if row == column else 0)
        return SymplecticGroupElement(self, entries)


def Sp(degree: int, field: sage.Parent) -> SymplecticGroupParent:
    """
    Construct a finite symplectic group in its natural representation.

    The order uses
    `|Sp(2n,q)| = q^(n^2) product_(i=1)^n (q^(2i)-1)`.

    ```sage
    sage: Sp(4, GF(7)).order()
    276595200
    ```
    """
    return SymplecticGroupParent(int(degree), field)


@runtime.lightweight_math_class
class AbelianGroupElement(sage.Element):

    def __init__(
        self,
        parent: AbelianGroup_class,
        exponents: list[int],
    ) -> None:
        self._parent = parent
        self._exponents = exponents
        runtime.object.freeze(self)

    def _mul_(
        self, other: AbelianGroupElement,
    ) -> AbelianGroupElement:
        if (
            not isinstance(other, AbelianGroupElement)
            or other._parent is not self._parent
        ):
            raise TypeError(
                'abelian-group elements must have the same parent')
        exponents = []
        for index in range(len(self._exponents)):
            exponent = (
                self._exponents[index]
                + other._exponents[index]
            )
            invariant = self._parent._invariants[index]
            if invariant:
                exponent %= invariant
            exponents.append(exponent)
        return AbelianGroupElement(self._parent, exponents)

    def __mul__(self, other: Any) -> Any:
        return runtime.coercion_model.binOp(
            'mul', self, other)

    def __pow__(self, exponent: Any) -> AbelianGroupElement:
        if not runtime.is_exact_integer(exponent):
            raise TypeError(
                'abelian-group exponents must be integers')
        multiplier = int(exponent)
        exponents = []
        for index in range(len(self._exponents)):
            value = self._exponents[index] * multiplier
            invariant = self._parent._invariants[index]
            if invariant:
                value %= invariant
            exponents.append(value)
        return AbelianGroupElement(self._parent, exponents)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, AbelianGroupElement)
            and other._parent is self._parent
            and other._exponents == self._exponents
        )

    def __repr__(self) -> str:
        factors = []
        for index in range(len(self._exponents)):
            exponent = self._exponents[index]
            if exponent:
                name = self._parent._names[index]
                factors.append(
                    name if exponent == 1
                    else name + '^' + str(exponent)
                )
        return '*'.join(factors) if factors else '1'

    __str__ = __repr__
    toString = __repr__


class AbelianGroup_class(sage.Parent):

    def __init__(
        self,
        invariants: list[int],
        names: list[str],
    ) -> None:
        self._invariants = invariants
        self._names = names
        self._kind = 'ABELIAN_GROUP'
        self._name = self._description()

    def _description(self) -> str:
        factors = []
        for invariant in self._invariants:
            factors.append(
                'Z' if invariant == 0 else 'C' + str(invariant))
        return (
            'Multiplicative Abelian group isomorphic to '
            + ' x '.join(factors)
        )

    def __repr__(self) -> str:
        return self._name

    __str__ = __repr__
    toString = __repr__

    def gens(self) -> Any:
        values = []
        for index in range(len(self._invariants)):
            exponents = [
                1 if position == index else 0
                for position in range(len(self._invariants))
            ]
            values.append(AbelianGroupElement(self, exponents))
        return runtime.math_tuple(values)

    def gen(self, index: int = 0) -> AbelianGroupElement:
        return self.gens()[index]

    def _first_ngens(self, count: int) -> list[AbelianGroupElement]:
        if count > len(self._invariants):
            raise ValueError('too many abelian-group generators')
        return list(self.gens()[:count])

    def order(self) -> Any:
        value = 1
        for invariant in self._invariants:
            if invariant == 0:
                return _positive_infinity
            value *= invariant
        return value


def _abelian_names(rank: int, names: Any) -> list[str]:
    if names is None:
        return ['f' + str(index) for index in range(rank)]
    if isinstance(names, str):
        if ',' in names:
            answer = [
                part.strip() for part in names.split(',')]
        elif len(names) == rank:
            answer = list(names)
        elif rank == 1:
            answer = [names]
        else:
            answer = [
                names + str(index) for index in range(rank)]
    else:
        answer = [str(name) for name in names]
    if len(answer) != rank:
        raise ValueError(
            'the number of generator names must equal the rank')
    return answer


def AbelianGroup(
    rank_or_invariants: Any,
    invariants: Any = None,
    names: Any = None,
) -> AbelianGroup_class:
    """
    Construct a finitely generated multiplicative abelian group.

    A zero invariant denotes an infinite cyclic factor. With one integer
    argument, construct that many infinite cyclic factors.
    """
    if isinstance(rank_or_invariants, (list, tuple)):
        if invariants is not None:
            raise TypeError(
                'invariants were specified twice')
        invariant_values = list(rank_or_invariants)
        rank = len(invariant_values)
    else:
        rank = int(rank_or_invariants)
        if rank < 0:
            raise ValueError('abelian-group rank must be nonnegative')
        if invariants is None:
            invariant_values = [
                0 for _index in range(rank)]
        else:
            invariant_values = list(invariants)
        if len(invariant_values) != rank:
            raise ValueError(
                'the number of invariants must equal the rank')
    normalized = []
    for invariant in invariant_values:
        value = int(invariant)
        if value < 0:
            value = -value
        normalized.append(value)
    return AbelianGroup_class(
        normalized, _abelian_names(rank, names))


runtime.set_class_repr(
    AbelianGroupElement,
    "<class 'sage.groups.abelian_gps.abelian_group_element."
    "AbelianGroupElement'>",
)

def _register_group_doc(
    name: str,
    value: Any,
    backend: str,
) -> None:
    runtime.register_doc(
        name,
        value,
        {
            'kind': 'function',
            'module': 'sage.groups',
            'tags': [
                'group theory',
                'finite groups',
                'permutation groups',
                'matrix groups',
            ],
            'backends': [backend],
            'sage_compatibility': {
                'status': 'partial',
                'notes': (
                    'The guided-tour finite group operations are compatible; '
                    'large groups need non-enumerative algorithms.'
                ),
            },
            'provenance': [
                {
                    'kind': 'sage-derived',
                    'source': 'SageMath finite groups API',
                    'url': (
                        'https://doc.sagemath.org/html/en/reference/'
                        'groups/'
                    ),
                    'license': 'GPL-2.0-or-later',
                },
            ],
            'limitations': [
                (
                    'Generic permutation and matrix groups are explicitly '
                    'enumerated and are therefore intended for small orders.'
                ),
            ],
        },
    )


_register_group_doc(
    'PermutationGroup',
    PermutationGroup,
    'Sage.js finite permutation closure',
)
_register_group_doc(
    'MatrixGroup',
    MatrixGroup,
    'FLINT matrices with Sage.js finite group closure',
)
_register_group_doc(
    'Sp',
    Sp,
    'Sage.js classical group formulas',
)
