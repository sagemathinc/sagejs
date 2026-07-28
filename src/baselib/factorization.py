# Factorization structure adapted from SageMath's
# sage.structure.factorization.Factorization.
#
# Copyright (C) 2005-2026 William Stein and SageMath contributors
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any, Callable, Iterator, Optional, Sequence

import sagejs.runtime as runtime


def ρσ_sequence_class(cls: type[Any]) -> type[Any]:
    # Identity fallback for bootstrap compilers which predate sequence-class
    # lowering. The converged compiler consumes this decorator.
    return cls


def ρσ_factor_pair(prime: Any, exponent: int) -> list[Any]:
    pair = [prime, exponent]

    def pair_repr() -> str:
        return (
            '(' + runtime.repr(pair[0]) + ', ' +
            runtime.repr(pair[1]) + ')'
        )

    runtime.object.defineProperties(pair, {
        '__repr__': {'value': pair_repr},
        '__str__': {'value': pair_repr},
    })
    runtime.object.freeze(pair)
    return pair


@runtime.sequence_class
class Factorization:
    """
    A formal product represented by factor-exponent pairs and a unit.

    This is the small, runtime-independent core of Sage's Factorization
    interface. Mathematical parent/coercion support can be layered on later.
    """

    def __init__(
        self,
        factors: Sequence[Sequence[Any]],
        unit: Any = None,
        cr: bool = False,
        sort: bool = True,
        simplify: bool = True,
    ) -> None:
        self._factors = []
        for pair in factors:
            if len(pair) != 2:
                raise TypeError('each factor must be a pair')
            exponent = pair[1]
            if (
                runtime.jstype(exponent) != 'number'
                or not runtime.number.isSafeInteger(exponent)
            ):
                raise TypeError('factor exponents must be safe integers')
            if exponent != 0:
                self._factors.append(runtime.factor_pair(pair[0], exponent))

        self._unit = 1 if unit is None else unit
        self._cr_value = bool(cr)
        if sort:
            self.sort()
        if simplify:
            self.simplify()

    def __len__(self) -> int:
        return len(self._factors)

    def __iter__(self) -> Iterator[list[Any]]:
        return iter(self._factors)

    def __getitem__(self, index: int) -> list[Any]:
        if runtime.jstype(index) == 'bigint':
            index = int(index)
        if (
            runtime.jstype(index) != 'number'
            or not runtime.number.isSafeInteger(index)
        ):
            raise TypeError('factorization indices must be integers')
        if index < 0:
            index += len(self._factors)
        if index < 0 or index >= len(self._factors):
            raise IndexError('factorization index out of range')
        return self._factors[index]

    def __setitem__(self, index: int, value: object) -> None:
        raise TypeError("'Factorization' object does not support item assignment")

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Factorization):
            return False
        if not runtime.equals(self._unit, other._unit):
            return False
        if len(self._factors) != len(other._factors):
            return False
        for i in range(len(self._factors)):
            if not runtime.equals(self._factors[i], other._factors[i]):
                return False
        return True

    def __contains__(self, value: object) -> bool:
        for pair in self._factors:
            if runtime.equals(pair, value):
                return True
        return False

    def __neg__(self) -> Factorization:
        return type(self)(
            self._factors, -self._unit, self._cr_value, False, False)

    def __mul__(self, other: Any) -> Factorization:
        if not isinstance(other, Factorization):
            return Factorization(
                self._factors + [[other, 1]],
                self._unit, self._cr_value)

        constructor = type(self)
        if not isinstance(other, constructor):
            constructor = Factorization
        unit = runtime.operator_mul_exact(self._unit, other._unit)
        return constructor(
            self._factors + other._factors, unit, self._cr_value)

    def __pow__(self, exponent: int) -> Factorization:
        if runtime.jstype(exponent) == 'bigint':
            exponent = int(exponent)
        if (
            runtime.jstype(exponent) != 'number'
            or not runtime.number.isSafeInteger(exponent)
        ):
            raise TypeError('factorization exponents must be integers')
        if exponent < 0:
            raise ValueError(
                'negative powers of factorizations are not implemented yet')

        factors = []
        for pair in self._factors:
            if pair[1] * exponent != 0:
                factors.append([pair[0], pair[1] * exponent])
        unit_exponent = runtime.bigint(exponent) \
            if runtime.jstype(self._unit) == 'bigint' else exponent
        unit = runtime.operator_pow_exact(self._unit, unit_exponent)
        return type(self)(
            factors, unit, self._cr_value, False, False)

    def __repr__(self) -> str:
        if len(self._factors) == 0:
            return runtime.repr(self._unit)

        separator = ' *\n' if self._cr_value else ' * '
        terms = []
        for pair in self._factors:
            if (
                runtime.jstype(pair[0]) == 'object'
                and hasattr(pair[0], '_factorization_repr')
            ):
                prime = pair[0]._factorization_repr()
            else:
                prime = runtime.repr(pair[0])
            exponent = pair[1]
            if exponent != 1:
                prime += '^' + str(exponent)
            terms.append(prime)

        one = runtime.bigint(1) \
            if runtime.jstype(self._unit) == 'bigint' else 1
        if not runtime.equals(self._unit, one):
            terms.insert(0, runtime.repr(self._unit))
        return str.join(separator, terms)

    def unit(self) -> Any:
        return self._unit

    def _cr(self) -> bool:
        return self._cr_value

    def _set_cr(self, cr: bool) -> None:
        self._cr_value = bool(cr)

    def sort(
        self,
        key: Optional[Callable[[list[Any]], Any]] = None,
    ) -> None:
        if key is None:
            def factor_key(pair: list[Any]) -> Any:
                return pair[0]

            key = factor_key
        self._factors = sorted(self._factors, key=key)

    def simplify(self) -> None:
        simplified = []
        for pair in self._factors:
            found = -1
            for i in range(len(simplified)):
                if runtime.equals(simplified[i][0], pair[0]):
                    found = i
                    break
            if found == -1:
                simplified.append(pair)
            else:
                exponent = simplified[found][1] + pair[1]
                if exponent == 0:
                    del simplified[found]
                else:
                    simplified[found] = runtime.factor_pair(pair[0], exponent)
        self._factors = simplified

    def value(self) -> Any:
        value = self._unit
        for pair in self._factors:
            prime, exponent = pair
            if runtime.jstype(prime) == 'bigint':
                exponent = runtime.bigint(exponent)
            value = runtime.operator_mul_exact(
                value, runtime.operator_pow_exact(prime, exponent))
        return value

    def expand(self) -> Any:
        return self.value()

    def prod(self) -> Any:
        return self.value()

    def is_integral(self) -> bool:
        for pair in self._factors:
            if pair[1] < 0:
                return False
        return True

    def radical(self) -> Factorization:
        factors = []
        for pair in self._factors:
            if pair[1] <= 0:
                raise ValueError(
                    'all exponents in the factorization must be positive')
            factors.append([pair[0], 1])
        one = runtime.bigint(1) \
            if runtime.jstype(self._unit) == 'bigint' else 1
        return type(self)(factors, one, self._cr_value, False, False)

    def radical_value(self) -> Any:
        return self.radical().value()


@runtime.sequence_class
class IntegerFactorization(Factorization):
    """A factorization whose factors and unit are exact integers."""

    def __init__(
        self,
        factors: Sequence[Sequence[Any]],
        unit: Any = None,
        cr: bool = False,
        sort: bool = True,
        simplify: bool = True,
    ) -> None:
        converted = []
        for pair in factors:
            prime = pair[0]
            if runtime.jstype(prime) == 'number':
                if not runtime.number.isSafeInteger(prime):
                    raise TypeError('integer factors must be exact')
                prime = runtime.bigint(prime)
            if runtime.jstype(prime) != 'bigint':
                raise TypeError('integer factors must be integers')
            converted.append([prime, pair[1]])

        if unit is None:
            unit = runtime.bigint(1)
        elif runtime.jstype(unit) == 'number':
            if not runtime.number.isSafeInteger(unit):
                raise TypeError('the unit must be an exact integer')
            unit = runtime.bigint(unit)
        if runtime.jstype(unit) != 'bigint':
            raise TypeError('the unit must be an integer')

        Factorization.__init__(
            self, converted, unit, cr, sort, simplify)
