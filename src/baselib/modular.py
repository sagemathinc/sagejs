# First exact modular-forms layer: congruence subgroups, dimensions, and
# FLINT-backed Eisenstein q-expansions.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _exact_nonnegative_integer(value: Any, name: str) -> int:
    value = runtime.normalize_integer(value)
    if (
        runtime.jstype(value) != 'number'
        or not runtime.number.isSafeInteger(value)
        or value < 0
    ):
        raise ValueError(name + ' must be a nonnegative integer')
    return runtime.number(value)


def _positive_integer(value: Any, name: str) -> int:
    value = _exact_nonnegative_integer(value, name)
    if value == 0:
        raise ValueError(name + ' must be positive')
    return value


def _factor_primes(value: int) -> list[int]:
    result = []
    for prime, _exponent in sage.factor(value):
        result.append(runtime.number(prime))
    return result


def _euler_phi(value: int) -> int:
    result = value
    for prime in _factor_primes(value):
        result = result // prime * (prime - 1)
    return result


class CongruenceSubgroup:

    def __init__(self, family: str, level: int) -> None:
        self._family = family
        self._level = level
        runtime.object.freeze(self)

    def level(self) -> int:
        return self._level

    def index(self) -> int:
        if self._family == 'Gamma0':
            result = self._level
            for prime in _factor_primes(self._level):
                result = result // prime * (prime + 1)
            return result
        if self._level <= 2:
            return Gamma0(self._level).index()
        result = self._level * self._level
        for prime in _factor_primes(self._level):
            result = result // (prime * prime) * (
                prime * prime - 1)
        return result // 2

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, CongruenceSubgroup)
            and self._family == other._family
            and self._level == other._level
        )

    def __repr__(self) -> str:
        if self._level == 1:
            return 'Modular Group SL(2,Z)'
        return (
            'Congruence Subgroup ' + self._family
            + '(' + str(self._level) + ')'
        )

    __str__ = __repr__
    toString = __repr__


_gamma_zero_cache = runtime.map()
_gamma_one_cache = runtime.map()


def _gamma(
    family: str,
    level: Any,
) -> CongruenceSubgroup:
    level = _positive_integer(level, 'congruence subgroup level')
    cache = (
        _gamma_zero_cache
        if family == 'Gamma0'
        else _gamma_one_cache
    )
    group = cache.get(level)
    if group is runtime.undefined:
        group = CongruenceSubgroup(family, level)
        cache.set(level, group)
    return group


def Gamma0(level: Any) -> CongruenceSubgroup:
    return _gamma('Gamma0', level)


def Gamma1(level: Any) -> CongruenceSubgroup:
    return _gamma('Gamma1', level)


def _gamma0_cusps(level: int) -> int:
    result = 0
    for divisor in sage.divisors(level):
        divisor = runtime.number(divisor)
        opposite = level // divisor
        common = runtime.bigint_gcd(
            runtime.integer_bigint(divisor),
            runtime.integer_bigint(opposite),
        )
        result += _euler_phi(runtime.number(common))
    return result


def _gamma0_elliptic_points_order_two(level: int) -> int:
    if level % 4 == 0:
        return 0
    result = 1
    for prime in _factor_primes(level):
        if prime != 2:
            result *= 2 if prime % 4 == 1 else 0
    return result


def _gamma0_elliptic_points_order_three(level: int) -> int:
    if level % 9 == 0:
        return 0
    result = 1
    for prime in _factor_primes(level):
        if prime == 3:
            continue
        result *= 2 if prime % 3 == 1 else 0
    return result


def _gamma0_genus(group: CongruenceSubgroup) -> int:
    level = group.level()
    numerator = (
        12 + group.index()
        - 3 * _gamma0_elliptic_points_order_two(level)
        - 4 * _gamma0_elliptic_points_order_three(level)
        - 6 * _gamma0_cusps(level)
    )
    return numerator // 12


def _gamma1_genus(group: CongruenceSubgroup) -> int:
    level = group.level()
    if level <= 2:
        return _gamma0_genus(Gamma0(level))
    if level < 5:
        raise NotImplementedError(
            'Gamma1 genus is currently implemented for levels 1, 2, '
            'and at least 5')
    cusps = 0
    for divisor in sage.divisors(level):
        divisor = runtime.number(divisor)
        cusps += (
            _euler_phi(divisor)
            * _euler_phi(level // divisor)
        )
    cusps //= 2
    return (12 + group.index() - 6 * cusps) // 12


def _level_one_modular_dimension(weight: int) -> int:
    if weight < 0 or weight % 2 == 1:
        return 0
    if weight == 2:
        return 0
    dimension = weight // 12 + 1
    if weight % 12 == 2:
        dimension -= 1
    return dimension


def dimension_cusp_forms(
    group: Any,
    weight: Any = 2,
) -> int:
    weight = _exact_nonnegative_integer(weight, 'weight')
    if runtime.is_exact_integer(group):
        group = Gamma0(group)
    if not isinstance(group, CongruenceSubgroup):
        raise TypeError(
            'dimension_cusp_forms requires Gamma0 or Gamma1')
    if weight % 2 == 1:
        return 0
    if weight == 2:
        if group._family == 'Gamma0':
            return _gamma0_genus(group)
        return _gamma1_genus(group)
    if group.level() == 1:
        dimension = _level_one_modular_dimension(weight)
        return max(0, dimension - (1 if weight >= 4 else 0))
    raise NotImplementedError(
        'higher-weight cusp dimensions are currently implemented '
        'at level one')


def eisenstein_series_qexp(
    k: Any,
    prec: Any = 10,
    K: Any = None,
    variable: str = 'q',
    normalization: str = 'linear',
    **opts: Any,
) -> Any:
    if 'var' in opts:
        variable = opts['var']
    if 'ρσ_py_var' in opts:
        variable = opts['ρσ_py_var']
    weight = _positive_integer(k, 'weight')
    if weight % 2 == 1:
        raise ValueError('weight must be a positive even integer')
    precision = _exact_nonnegative_integer(prec, 'precision')
    coefficient_ring = sage.QQ if K is None else K
    if normalization not in ('linear', 'constant', 'integral'):
        raise ValueError(
            "normalization must be 'linear', 'constant', or 'integral'")
    power_series_ring = runtime.reflect.get(
        runtime.global_object, 'PowerSeriesRing')
    ring = power_series_ring(
        coefficient_ring, variable, default_prec=max(1, precision))
    native_value = runtime.flint_backend().qqEisensteinSeries(
        weight, precision, normalization)
    if coefficient_ring is sage.QQ:
        return ring._from_native(
            native_value, 0, precision)

    rational_polynomial = sage.PolynomialRing(
        sage.QQ, variable)._from_native(native_value)
    coefficients = rational_polynomial.coefficients()
    generator = ring.gen()
    result = ring(0)
    for coefficient in reversed(coefficients):
        result = (
            result * generator
            + coefficient_ring(coefficient)
        )
    return result.add_bigoh(precision)


def _inflate_series(
    series: Any,
    factor: int,
    precision: int,
) -> Any:
    return series._inflate(factor, precision)


def _eisenstein_basis_qexp(
    level: int,
    weight: int,
    base_ring: Any,
    index: int,
    precision: int,
) -> Any:
    if level == 1:
        return eisenstein_series_qexp(
            weight,
            precision,
            base_ring,
            normalization='constant',
        )
    if weight == 2:
        base = eisenstein_series_qexp(
            2,
            precision,
            base_ring,
            normalization='constant',
        )
        short_precision = (
            0 if precision == 0
            else (precision - 1) // level + 1
        )
        inflated = _inflate_series(
            eisenstein_series_qexp(
                2,
                short_precision,
                base_ring,
                normalization='constant',
            ),
            level,
            precision,
        )
        return (
            (level * inflated - base)
            / (level - 1)
        ).add_bigoh(precision)

    short_precision = (
        0 if precision == 0
        else (precision - 1) // level + 1
    )
    oldform = _inflate_series(
        eisenstein_series_qexp(
            weight,
            short_precision,
            base_ring,
            normalization='constant',
        ),
        level,
        precision,
    )
    if index == 0:
        return oldform
    linear = eisenstein_series_qexp(
        weight,
        precision,
        base_ring,
        normalization='linear',
    )
    bernoulli_number = runtime.reflect.get(
        runtime.global_object, 'bernoulli')
    constant = (
        -bernoulli_number(weight)
        / (2 * weight)
    )
    return (
        linear - constant * oldform
    ).add_bigoh(precision)


class ModularFormsSubspace(sage.Parent):

    def __init__(
        self,
        ambient: ModularFormsSpace,
        kind: str,
        dimension: int,
    ) -> None:
        self._ambient = ambient
        self._subspace_kind = kind
        self._dimension = dimension

    def ambient_space(self) -> ModularFormsSpace:
        return self._ambient

    def dimension(self) -> int:
        return self._dimension

    degree = dimension

    def level(self) -> int:
        return self._ambient.level()

    def weight(self) -> int:
        return self._ambient.weight()

    def group(self) -> CongruenceSubgroup:
        return self._ambient.group()

    def base_ring(self) -> Any:
        return self._ambient.base_ring()

    def __repr__(self) -> str:
        return (
            self._subspace_kind + ' subspace of dimension '
            + str(self._dimension) + ' of ' + str(self._ambient)
        )

    __str__ = __repr__
    toString = __repr__


class EisensteinSubspace(ModularFormsSubspace):

    def __init__(
        self,
        ambient: ModularFormsSpace,
        precision: int,
    ) -> None:
        level = ambient.level()
        weight = ambient.weight()
        if level == 1:
            dimension = 1 if weight >= 4 and weight % 2 == 0 else 0
        elif sage.is_prime(level) and weight == 2:
            dimension = 1
        elif sage.is_prime(level) and weight >= 4 and weight % 2 == 0:
            dimension = 2
        else:
            raise NotImplementedError(
                'Eisenstein spaces currently support level one and '
                'prime Gamma0 level')
        ModularFormsSubspace.__init__(
            self, ambient, 'Eisenstein', dimension)
        self._precision = precision
        self._basis = [
            _eisenstein_basis_qexp(
                level,
                weight,
                ambient.base_ring(),
                index,
                precision,
            )
            for index in range(dimension)
        ]

    def precision(self) -> int:
        return self._precision

    def __len__(self) -> int:
        return self._dimension

    def __getitem__(self, index: int) -> Any:
        return self._basis[index]

    def gen(self, index: int = 0) -> Any:
        return self._basis[index]

    def _first_ngens(self, count: int) -> list[Any]:
        if count > self._dimension:
            raise ValueError('too many Eisenstein generators requested')
        return self._basis[:count]

    def basis(self) -> list[Any]:
        return list(self._basis)

    gens = basis

    def q_expansion_basis(self, prec: Any = None) -> list[Any]:
        if prec is None:
            prec = self._precision
        precision = _exact_nonnegative_integer(prec, 'precision')
        if precision == self._precision:
            return list(self._basis)
        return [
            _eisenstein_basis_qexp(
                self.level(),
                self.weight(),
                self.base_ring(),
                index,
                precision,
            )
            for index in range(self._dimension)
        ]

    def _q_expansion(self, index: int, precision: int) -> Any:
        return _eisenstein_basis_qexp(
            self.level(),
            self.weight(),
            self.base_ring(),
            index,
            precision,
        )


class ModularFormsSpace(sage.Parent):

    def __init__(
        self,
        group: CongruenceSubgroup,
        weight: int,
        base_ring: Any,
        precision: int,
    ) -> None:
        if group._family != 'Gamma0':
            raise NotImplementedError(
                'ModularForms currently supports Gamma0')
        self._group = group
        self._weight = weight
        self._base = base_ring
        self._precision = precision

    def group(self) -> CongruenceSubgroup:
        return self._group

    def level(self) -> int:
        return self._group.level()

    def weight(self) -> int:
        return self._weight

    def base_ring(self) -> Any:
        return self._base

    def dimension(self) -> int:
        cusp_dimension = dimension_cusp_forms(
            self._group, self._weight)
        if self.level() == 1:
            eisenstein_dimension = (
                1 if self._weight >= 4
                and self._weight % 2 == 0 else 0
            )
        elif sage.is_prime(self.level()) and self._weight == 2:
            eisenstein_dimension = 1
        elif (
            sage.is_prime(self.level())
            and self._weight >= 4
            and self._weight % 2 == 0
        ):
            eisenstein_dimension = 2
        else:
            raise NotImplementedError(
                'modular-form dimensions currently support level one '
                'and prime Gamma0 level')
        return cusp_dimension + eisenstein_dimension

    degree = dimension

    def cuspidal_subspace(self) -> ModularFormsSubspace:
        return ModularFormsSubspace(
            self,
            'Cuspidal',
            dimension_cusp_forms(self._group, self._weight),
        )

    cusp_subspace = cuspidal_subspace

    def eisenstein_subspace(self) -> EisensteinSubspace:
        return EisensteinSubspace(self, self._precision)

    def __repr__(self) -> str:
        return (
            'Modular Forms space of dimension '
            + str(self.dimension()) + ' for ' + str(self._group)
            + ' of weight ' + str(self._weight)
            + ' over ' + str(self._base)
        )

    __str__ = __repr__
    toString = __repr__


def ModularForms(
    group: Any = 1,
    weight: Any = 2,
    base_ring: Any = None,
    use_cache: bool = True,
    prec: Any = 6,
) -> ModularFormsSpace:
    del use_cache
    if runtime.is_exact_integer(group):
        group = Gamma0(group)
    if not isinstance(group, CongruenceSubgroup):
        raise TypeError('ModularForms requires a congruence subgroup')
    weight = _exact_nonnegative_integer(weight, 'weight')
    precision = _exact_nonnegative_integer(prec, 'precision')
    if base_ring is None:
        base_ring = sage.QQ
    if base_ring is not sage.QQ:
        raise NotImplementedError(
            'the initial modular-forms spaces are defined over QQ')
    return ModularFormsSpace(
        group, weight, base_ring, precision)


def EisensteinForms(
    group: Any = 1,
    weight: Any = 2,
    base_ring: Any = None,
    use_cache: bool = True,
    prec: Any = 6,
) -> EisensteinSubspace:
    ambient = ModularForms(
        group, weight, base_ring, use_cache, prec)
    return ambient.eisenstein_subspace()
