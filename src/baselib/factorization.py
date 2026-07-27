# Factorization structure adapted from SageMath's
# sage.structure.factorization.Factorization.
#
# Copyright (C) 2005-2026 William Stein and SageMath contributors
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only
#
# globals: ρσ_iterator_symbol, ρσ_equals, ρσ_repr, ρσ_operator_mul_exact,
# globals: ρσ_operator_pow_exact, BigInt, Number, Object


def ρσ_sequence_class(cls):
    # Identity fallback for bootstrap compilers which predate sequence-class
    # lowering. The converged compiler consumes this decorator.
    return cls


def ρσ_factor_pair(prime, exponent):
    pair = [prime, exponent]
    pair_repr = def():
        return '(' + ρσ_repr(this[0]) + ', ' + ρσ_repr(this[1]) + ')'
    Object.defineProperties(pair, {
        '__repr__': {'value': pair_repr},
        '__str__': {'value': pair_repr},
    })
    return Object.freeze(pair)


@ρσ_sequence_class
class Factorization:
    """
    A formal product represented by factor-exponent pairs and a unit.

    This is the small, runtime-independent core of Sage's Factorization
    interface. Mathematical parent/coercion support can be layered on later.
    """

    def __init__(self, factors, unit=None, cr=False, sort=True, simplify=True):
        self._factors = []
        for pair in factors:
            if pair.length is not 2:
                raise TypeError('each factor must be a pair')
            exponent = pair[1]
            if jstype(exponent) is not 'number' or not Number.isSafeInteger(exponent):
                raise TypeError('factor exponents must be safe integers')
            if exponent is not 0:
                self._factors.push(ρσ_factor_pair(pair[0], exponent))

        self._unit = 1 if unit is None else unit
        self._cr_value = bool(cr)
        if sort:
            self.sort()
        if simplify:
            self.simplify()

    def __len__(self):
        return self._factors.length

    def __iter__(self):
        return self._factors[ρσ_iterator_symbol]()

    def __getitem__(self, index):
        if jstype(index) is 'bigint':
            index = Number(index)
        if jstype(index) is not 'number' or not Number.isSafeInteger(index):
            raise TypeError('factorization indices must be integers')
        if index < 0:
            index += self._factors.length
        if index < 0 or index >= self._factors.length:
            raise IndexError('factorization index out of range')
        return self._factors[index]

    def __setitem__(self, index, value):
        raise TypeError("'Factorization' object does not support item assignment")

    def __eq__(self, other):
        if not isinstance(other, Factorization):
            return False
        if not ρσ_equals(self._unit, other._unit):
            return False
        if self._factors.length is not other._factors.length:
            return False
        for i in range(self._factors.length):
            if not ρσ_equals(self._factors[i], other._factors[i]):
                return False
        return True

    def __contains__(self, value):
        for pair in self._factors:
            if ρσ_equals(pair, value):
                return True
        return False

    def __neg__(self):
        return self.constructor(
            self._factors, -self._unit, self._cr_value, False, False)

    def __mul__(self, other):
        if not isinstance(other, Factorization):
            return Factorization(
                self._factors.concat([[other, 1]]),
                self._unit, self._cr_value)

        constructor = self.constructor
        if not isinstance(other, constructor):
            constructor = Factorization
        unit = ρσ_operator_mul_exact(self._unit, other._unit)
        return constructor(
            self._factors.concat(other._factors), unit, self._cr_value)

    def __pow__(self, exponent):
        if jstype(exponent) is 'bigint':
            exponent = Number(exponent)
        if jstype(exponent) is not 'number' or not Number.isSafeInteger(exponent):
            raise TypeError('factorization exponents must be integers')
        if exponent < 0:
            raise ValueError(
                'negative powers of factorizations are not implemented yet')

        factors = []
        for pair in self._factors:
            if pair[1] * exponent is not 0:
                factors.push([pair[0], pair[1] * exponent])
        unit_exponent = BigInt(exponent) if jstype(self._unit) is 'bigint' else exponent
        unit = ρσ_operator_pow_exact(self._unit, unit_exponent)
        return self.constructor(
            factors, unit, self._cr_value, False, False)

    def __repr__(self):
        if self._factors.length is 0:
            return ρσ_repr(self._unit)

        separator = ' *\n' if self._cr_value else ' * '
        terms = []
        for pair in self._factors:
            if (jstype(pair[0]) is 'object'
                    and pair[0]._factorization_repr is not undefined):
                prime = pair[0]._factorization_repr()
            else:
                prime = ρσ_repr(pair[0])
            exponent = pair[1]
            if exponent is not 1:
                prime += '^' + exponent
            terms.push(prime)

        one = BigInt(1) if jstype(self._unit) is 'bigint' else 1
        if not ρσ_equals(self._unit, one):
            terms.unshift(ρσ_repr(self._unit))
        return terms.join(separator)

    def unit(self):
        return self._unit

    def _cr(self):
        return self._cr_value

    def _set_cr(self, cr):
        self._cr_value = bool(cr)

    def sort(self, key=None):
        if key is not None:
            self._factors.sort(def(a, b):
                left, right = key(a), key(b)
                return -1 if left < right else (1 if left > right else 0)
            )
            return
        self._factors.sort(def(a, b):
            return -1 if a[0] < b[0] else (1 if a[0] > b[0] else 0)
        )

    def simplify(self):
        simplified = []
        for pair in self._factors:
            found = -1
            for i in range(simplified.length):
                if ρσ_equals(simplified[i][0], pair[0]):
                    found = i
                    break
            if found is -1:
                simplified.push(pair)
            else:
                exponent = simplified[found][1] + pair[1]
                if exponent is 0:
                    simplified.splice(found, 1)
                else:
                    simplified[found] = ρσ_factor_pair(pair[0], exponent)
        self._factors = simplified

    def value(self):
        value = self._unit
        for pair in self._factors:
            prime, exponent = pair
            if jstype(prime) is 'bigint':
                exponent = BigInt(exponent)
            value = ρσ_operator_mul_exact(
                value, ρσ_operator_pow_exact(prime, exponent))
        return value

    def expand(self):
        return self.value()

    def prod(self):
        return self.value()

    def is_integral(self):
        for pair in self._factors:
            if pair[1] < 0:
                return False
        return True

    def radical(self):
        factors = []
        for pair in self._factors:
            if pair[1] <= 0:
                raise ValueError(
                    'all exponents in the factorization must be positive')
            factors.push([pair[0], 1])
        one = BigInt(1) if jstype(self._unit) is 'bigint' else 1
        return self.constructor(factors, one, self._cr_value, False, False)

    def radical_value(self):
        return self.radical().value()


@ρσ_sequence_class
class IntegerFactorization(Factorization):
    """A factorization whose factors and unit are exact integers."""

    def __init__(self, factors, unit=None, cr=False, sort=True, simplify=True):
        converted = []
        for pair in factors:
            prime = pair[0]
            if jstype(prime) is 'number':
                if not Number.isSafeInteger(prime):
                    raise TypeError('integer factors must be exact')
                prime = BigInt(prime)
            if jstype(prime) is not 'bigint':
                raise TypeError('integer factors must be integers')
            converted.push([prime, pair[1]])

        if unit is None:
            unit = BigInt(1)
        elif jstype(unit) is 'number':
            if not Number.isSafeInteger(unit):
                raise TypeError('the unit must be an exact integer')
            unit = BigInt(unit)
        if jstype(unit) is not 'bigint':
            raise TypeError('the unit must be an integer')

        Factorization.__init__(
            self, converted, unit, cr, sort, simplify)
