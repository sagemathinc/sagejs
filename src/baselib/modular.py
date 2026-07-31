# Exact modular-forms foundations: congruence subgroups, Riemann--Roch and
# Cohen--Oesterle dimensions, and FLINT-backed Eisenstein q-expansions.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime


def _exact_integer(value: Any, name: str) -> int:
    value = runtime.normalize_integer(value)
    if (
        runtime.jstype(value) != 'number'
        or not runtime.number.isSafeInteger(value)
    ):
        raise ValueError(name + ' must be an integer')
    return runtime.number(value)


def _exact_nonnegative_integer(value: Any, name: str) -> int:
    value = _exact_integer(value, name)
    if value < 0:
        raise ValueError(name + ' must be a nonnegative integer')
    return value


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
        if family == 'Gamma0':
            index = level
            for prime in _factor_primes(level):
                index = index // prime * (prime + 1)
            self._index_value = index
            self._projective_index_value = index
            self._nu2_value = (
                _gamma0_elliptic_points_order_two(level)
            )
            self._nu3_value = (
                _gamma0_elliptic_points_order_three(level)
            )
            self._cusps_value = _gamma0_cusps(level)
            self._regular_cusps_value = self._cusps_value
        else:
            index = level * level
            for prime in _factor_primes(level):
                index = index // (prime * prime) * (
                    prime * prime - 1)
            self._index_value = index
            self._projective_index_value = (
                index // 2 if level > 2 else index
            )
            self._nu2_value = 1 if level <= 2 else 0
            self._nu3_value = (
                1 if level == 1 or level == 3 else 0
            )
            self._cusps_value = _gamma1_cusps(level)
            self._regular_cusps_value = (
                2 if level == 4 else self._cusps_value
            )
        self._genus_value = (
            12 + self._projective_index_value
            - 3 * self._nu2_value
            - 4 * self._nu3_value
            - 6 * self._cusps_value
        ) // 12
        runtime.object.freeze(self)

    def level(self) -> int:
        return self._level

    def index(self) -> int:
        return self._index_value

    def projective_index(self) -> int:
        return self._projective_index_value

    def is_even(self) -> bool:
        return self._family == 'Gamma0' or self._level <= 2

    def nu2(self) -> int:
        return self._nu2_value

    def nu3(self) -> int:
        return self._nu3_value

    def ncusps(self) -> int:
        return self._cusps_value

    def nregcusps(self) -> int:
        return self._regular_cusps_value

    def nirregcusps(self) -> int:
        return self.ncusps() - self.nregcusps()

    def genus(self) -> int:
        return self._genus_value

    def dimension_cusp_forms(self, weight: Any = 2) -> int:
        return dimension_cusp_forms(self, weight)

    def dimension_eis(self, weight: Any = 2) -> int:
        return dimension_eis(self, weight)

    def dimension_modular_forms(self, weight: Any = 2) -> int:
        return dimension_modular_forms(self, weight)

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


def _gamma1_cusps(level: int) -> int:
    if level <= 4:
        return [0, 1, 2, 2, 3][level]
    result = 0
    for divisor in sage.divisors(level):
        divisor = runtime.number(divisor)
        result += (
            _euler_phi(divisor)
            * _euler_phi(level // divisor)
        )
    return result // 2


def _is_dirichlet_character(value: Any) -> bool:
    value_type = runtime.jstype(value)
    if value is None or (
        value_type != 'object' and value_type != 'function'
    ):
        return False
    parent = runtime.reflect.get(value, '_parent')
    return (
        parent is not runtime.undefined
        and runtime.reflect.get(parent, '_kind') == 'DirichletGroup'
    )


def _primitive_root_prime(prime: int) -> int:
    factors = _factor_primes(prime - 1)
    candidate = 2
    while candidate < prime:
        primitive = True
        for factor in factors:
            if pow(candidate, (prime - 1) // factor, prime) == 1:
                primitive = False
                break
        if primitive:
            return candidate
        candidate += 1
    raise ArithmeticError('unable to find a primitive root')


def _local_character_argument(
    prime: int,
    exponent: int,
    modulus: int,
    root_order: int,
) -> int:
    generator = _primitive_root_prime(prime)
    local_root = pow(
        generator, (prime - 1) // root_order, prime)
    complement = modulus // (prime ** exponent)
    if complement == 1:
        lifted = local_root
    else:
        inverse = pow(complement % prime, prime - 2, prime)
        multiplier = (
            (local_root - 1) * inverse
        ) % prime
        lifted = 1 + complement * multiplier
    return pow(
        lifted,
        prime ** (exponent - 1),
        modulus,
    )


def CO_delta(
    exponent: Any,
    prime: Any,
    modulus: Any,
    character: Any,
) -> int:
    exponent = _positive_integer(exponent, 'prime exponent')
    prime = _positive_integer(prime, 'prime')
    modulus = _positive_integer(modulus, 'modulus')
    if prime % 4 == 3:
        return 0
    if prime == 2:
        return 1 if exponent == 1 else 0
    argument = _local_character_argument(
        prime, exponent, modulus, 4)
    value = character(argument)
    if value == 1:
        return 2
    if value == -1:
        return -2
    return 0


def CO_nu(
    exponent: Any,
    prime: Any,
    modulus: Any,
    character: Any,
) -> int:
    exponent = _positive_integer(exponent, 'prime exponent')
    prime = _positive_integer(prime, 'prime')
    modulus = _positive_integer(modulus, 'modulus')
    if prime % 3 == 2:
        return 0
    if prime == 3:
        return 1 if exponent == 1 else 0
    argument = _local_character_argument(
        prime, exponent, modulus, 3)
    return 2 if character(argument) == 1 else -1


def _cohen_oesterle_numerator(
    character: Any,
    weight: int,
) -> int:
    modulus = _positive_integer(
        character.modulus(), 'character modulus')
    conductor = _positive_integer(
        character.conductor(), 'character conductor')
    factors = [
        (runtime.number(prime), runtime.number(exponent))
        for prime, exponent in sage.factor(modulus)
    ]

    lambda_product = 1
    delta_product = 1
    nu_product = 1
    for prime, exponent in factors:
        conductor_exponent = 0
        conductor_part = conductor
        while conductor_part % prime == 0:
            conductor_part //= prime
            conductor_exponent += 1
        if 2 * conductor_exponent <= exponent:
            if exponent % 2 == 0:
                local_lambda = (
                    prime ** (exponent // 2)
                    + prime ** (exponent // 2 - 1)
                )
            else:
                local_lambda = (
                    2 * prime ** ((exponent - 1) // 2)
                )
        else:
            local_lambda = (
                2 * prime ** (exponent - conductor_exponent)
            )
        lambda_product *= local_lambda
        delta_product *= CO_delta(
            exponent, prime, modulus, character)
        nu_product *= CO_nu(
            exponent, prime, modulus, character)

    gamma_times_twelve = 0
    if weight % 4 == 2:
        gamma_times_twelve = -3
    elif weight % 4 == 0:
        gamma_times_twelve = 3

    mu_times_twelve = 0
    if weight % 3 == 2:
        mu_times_twelve = -4
    elif weight % 3 == 0:
        mu_times_twelve = 4

    return (
        -6 * lambda_product
        + gamma_times_twelve * delta_product
        + mu_times_twelve * nu_product
    )


def CohenOesterle(character: Any, weight: Any) -> Any:
    if not _is_dirichlet_character(character):
        raise TypeError('CohenOesterle requires a Dirichlet character')
    weight = _exact_integer(weight, 'weight')
    return (
        sage.QQ(_cohen_oesterle_numerator(character, weight))
        / sage.QQ(12)
    )


def _dimension_character_cusp_forms(
    character: Any,
    weight: int,
) -> int:
    modulus = _positive_integer(
        character.modulus(), 'character modulus')
    if character.is_principal():
        return dimension_cusp_forms(Gamma0(modulus), weight)
    if (
        weight <= 0
        or (weight % 2 == 1 and character.is_even())
        or (weight % 2 == 0 and character.is_odd())
    ):
        return 0
    if weight == 1:
        raise NotImplementedError(
            'weight-one cusp dimensions require the '
            'Schaeffer algorithm')
    numerator = (
        Gamma0(modulus).index() * (weight - 1)
        + _cohen_oesterle_numerator(character, weight)
    )
    if numerator % 12 != 0:
        raise ArithmeticError(
            'Cohen-Oesterle dimension is not integral')
    return numerator // 12


def dimension_cusp_forms(
    group: Any,
    weight: Any = 2,
) -> int:
    weight = _exact_integer(weight, 'weight')
    if _is_dirichlet_character(group):
        return _dimension_character_cusp_forms(group, weight)
    if runtime.is_exact_integer(group):
        group = Gamma0(group)
    if not isinstance(group, CongruenceSubgroup):
        raise TypeError(
            'dimension_cusp_forms requires an integer, Gamma0, '
            'Gamma1, or a Dirichlet character')
    if weight <= 0:
        return 0
    if weight % 2 == 0:
        if weight == 2:
            return group.genus()
        return (
            (weight - 1) * (group.genus() - 1)
            + (weight // 4) * group.nu2()
            + (weight // 3) * group.nu3()
            + (weight // 2 - 1) * group.ncusps()
        )
    if group.is_even():
        return 0
    regular_cusps = group.nregcusps()
    irregular_cusps = group.nirregcusps()
    if weight > 1:
        numerator = (
            2 * (weight - 1) * (group.genus() - 1)
            + 2 * (weight // 3) * group.nu3()
            + (weight - 2) * regular_cusps
            + (weight - 1) * irregular_cusps
        )
        return numerator // 2
    if regular_cusps > 2 * group.genus() - 2:
        return 0
    raise NotImplementedError(
        'weight-one cusp dimensions require the '
        'Schaeffer algorithm')


def _dimension_character_eis(
    character: Any,
    weight: int,
) -> int:
    modulus = _positive_integer(
        character.modulus(), 'character modulus')
    if character.is_principal():
        return dimension_eis(Gamma0(modulus), weight)
    if (
        weight <= 0
        or (weight % 2 == 1 and character.is_even())
        or (weight % 2 == 0 and character.is_odd())
    ):
        return 0
    dual_weight = 2 - weight
    numerator = (
        Gamma0(modulus).index() * (dual_weight - 1)
        + _cohen_oesterle_numerator(
            character, dual_weight)
    )
    if numerator % 12 != 0:
        raise ArithmeticError(
            'Cohen-Oesterle Eisenstein dimension is not integral')
    total = -(numerator // 12)
    if weight == 1:
        return total
    return total - _dimension_character_cusp_forms(
        character, weight)


def dimension_eis(
    group: Any,
    weight: Any = 2,
) -> int:
    weight = _exact_integer(weight, 'weight')
    if _is_dirichlet_character(group):
        return _dimension_character_eis(group, weight)
    if runtime.is_exact_integer(group):
        group = Gamma0(group)
    if not isinstance(group, CongruenceSubgroup):
        raise TypeError(
            'dimension_eis requires an integer, Gamma0, Gamma1, '
            'or a Dirichlet character')
    if weight < 0:
        return 0
    if weight == 0:
        return 1
    if weight % 2 == 0:
        if weight == 2:
            return group.ncusps() - 1
        return group.ncusps()
    if group.is_even():
        return 0
    if weight > 1:
        return group.nregcusps()
    return group.nregcusps() // 2


def dimension_modular_forms(
    group: Any,
    weight: Any = 2,
) -> int:
    weight = _exact_integer(weight, 'weight')
    return (
        dimension_cusp_forms(group, weight)
        + dimension_eis(group, weight)
    )


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
        dimension = dimension_eis(ambient.group(), weight)
        ModularFormsSubspace.__init__(
            self, ambient, 'Eisenstein', dimension)
        self._precision = precision
        basis_supported = (
            dimension == 0
            or (
                level == 1
                and weight >= 4
                and weight % 2 == 0
            )
            or (
                sage.is_prime(level)
                and weight >= 2
                and weight % 2 == 0
            )
        )
        self._basis = None
        if basis_supported:
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

    def _require_basis(self) -> list[Any]:
        if self._basis is None:
            raise NotImplementedError(
                'q-expansion bases are currently implemented for '
                'level one and prime Gamma0 level')
        return self._basis

    def precision(self) -> int:
        return self._precision

    def __len__(self) -> int:
        return self._dimension

    def __getitem__(self, index: int) -> Any:
        return self._require_basis()[index]

    def gen(self, index: int = 0) -> Any:
        return self._require_basis()[index]

    def _first_ngens(self, count: int) -> list[Any]:
        if count > self._dimension:
            raise ValueError('too many Eisenstein generators requested')
        return self._require_basis()[:count]

    def basis(self) -> list[Any]:
        return list(self._require_basis())

    gens = basis

    def q_expansion_basis(self, prec: Any = None) -> list[Any]:
        if prec is None:
            prec = self._precision
        precision = _exact_nonnegative_integer(prec, 'precision')
        if precision == self._precision:
            return list(self._require_basis())
        self._require_basis()
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
        return dimension_modular_forms(
            self._group, self._weight)

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
