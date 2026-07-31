# Lightweight group implementations used by the Sage guided tour.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


class PositiveInfinity:

    def __repr__(self) -> str:
        return '+Infinity'

    __str__ = __repr__
    toString = __repr__


_positive_infinity = PositiveInfinity()


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
