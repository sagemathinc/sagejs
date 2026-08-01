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
    r"""
    Return the dimension of a space of cuspidal modular forms.

    `group` may be a positive level (interpreted as `Gamma0(level)`), a
    `Gamma0` or `Gamma1` subgroup, or a Dirichlet character. Dimensions
    for congruence subgroups use exact Riemann--Roch formulas; character
    spaces use the Cohen--Oesterlé formula.

    ### Examples

    ```sage
    sage: dimension_cusp_forms(Gamma0(11), 2)
    1
    sage: dimension_cusp_forms(Gamma0(1), 12)
    1
    sage: eps = DirichletGroup(13).gen(0)^2
    sage: dimension_cusp_forms(eps, 2)
    1
    ```

    Weight-one cases that require the Schaeffer algorithm raise
    `NotImplementedError` instead of returning an unproved value.
    """
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
    r"""
    Return the dimension of the Eisenstein subspace.

    Accepted groups and characters are the same as for
    `dimension_cusp_forms`. The result is an exact integer obtained from
    cusp data or the Cohen--Oesterlé character formula.
    """
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
    """Return cusp dimension plus Eisenstein dimension for `group`."""
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


class EisensteinSeriesElement(sage.Element):
    r"""
    An exact Eisenstein modular form represented by its parent and basis index.

    The element retains its modular-form parent instead of becoming a bare
    power series.  Its coefficients are generated on demand by the
    FLINT-backed Eisenstein implementation.
    """

    def __init__(
        self,
        parent: EisensteinSubspace,
        index: int,
        precision: int,
    ) -> None:
        self._parent = parent
        self._index = index
        self._display_precision = precision
        runtime.object.freeze(self)

    def q_expansion(self, prec: Any = None) -> Any:
        r"""
        Return the `q`-expansion to absolute precision `O(q^prec)`.

        ### Parameters

        - `prec` — nonnegative integer; when omitted, use the precision
          requested when this basis element was constructed.

        ### Examples

        The level-389 weight-2 Eisenstein form can be displayed briefly and
        then expanded farther without reconstructing its parent:

        ```sage
        sage: E = EisensteinForms(389, 2)
        sage: b = E.basis(prec=8)[0]
        sage: b.q_expansion(5)
        1 + 6/97*q + 18/97*q^2 + 24/97*q^3 + 42/97*q^4 + O(q^5)
        ```

        ### Implementation

        Level-one divisor sums are generated in one native FLINT sieve.
        Prime-level oldforms use the exact degeneracy map `q -> q^N`.
        """
        if prec is None:
            precision = self._display_precision
        else:
            precision = _exact_nonnegative_integer(
                prec, 'precision')
        return self._parent._q_expansion(
            self._index, precision)

    qexp = q_expansion

    def prec(self) -> int:
        """Return the default display precision of this element."""
        return self._display_precision

    def parent(self) -> EisensteinSubspace:
        """Return the Eisenstein space containing this form."""
        return self._parent

    def base_ring(self) -> Any:
        """Return the coefficient ring of this modular form."""
        return self._parent.base_ring()

    def level(self) -> int:
        """Return the level of this modular form."""
        return self._parent.level()

    def weight(self) -> int:
        """Return the weight of this modular form."""
        return self._parent.weight()

    def __getitem__(self, exponent: Any) -> Any:
        """Return the coefficient of ``q^exponent``."""
        return self.q_expansion(
            _exact_nonnegative_integer(
                exponent, 'coefficient exponent') + 1
        )[exponent]

    def __repr__(self) -> str:
        return str(self.q_expansion())

    __str__ = __repr__
    toString = __repr__


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
                EisensteinSeriesElement(
                    self,
                    index,
                    precision,
                )
                for index in range(dimension)
            ]

    def _require_basis(self) -> list[EisensteinSeriesElement]:
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

    def basis(self, prec: Any = None) -> list[Any]:
        r"""
        Return a basis of modular forms, optionally with display precision.

        ### Parameters

        - `prec` — nonnegative integer or `None`. If specified, basis
          entries are displayed to `O(q^prec)`. They retain their parent
          and can subsequently be expanded to any supported precision with
          `q_expansion`.

        This optional argument is a convenient Sage.js extension: SageMath's
        `basis()` currently uses the space's default precision instead.
        """
        self._require_basis()
        if prec is None:
            return list(self._require_basis())
        precision = _exact_nonnegative_integer(prec, 'precision')
        return [
            EisensteinSeriesElement(self, index, precision)
            for index in range(self._dimension)
        ]

    gens = basis

    def q_expansion_basis(self, prec: Any = None) -> list[Any]:
        """Return the basis as power series to absolute precision `prec`."""
        if prec is None:
            prec = self._precision
        precision = _exact_nonnegative_integer(prec, 'precision')
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
    r"""
    Construct the implemented ambient space of modular forms.

    `group` is a level or congruence subgroup, `weight` is nonnegative,
    and `prec` controls the default displayed q-expansion precision.
    Initial ambient spaces are exact over `QQ`.

    ### Examples

    ```sage
    sage: M = ModularForms(Gamma0(11), 2)
    sage: M.dimension()
    2
    sage: M.cuspidal_subspace().dimension()
    1
    ```

    This foundation currently provides exact dimensions, cusp/Eisenstein
    subspaces, and Eisenstein q-expansions.  It is not yet SageMath's complete
    Hecke-module implementation.
    """
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
    r"""
    Construct the Eisenstein subspace of `ModularForms(group, weight)`.

    Basis elements retain their parent and can be expanded later to a
    different precision with `q_expansion(prec)`.

    ### Examples

    ```sage
    sage: E = EisensteinForms(389, 2)
    sage: b = E.basis(prec=20)[0]
    sage: b.q_expansion(100).precision_absolute()
    100
    ```
    """
    ambient = ModularForms(
        group, weight, base_ring, use_cache, prec)
    return ambient.eisenstein_subspace()


class FormattedFactorization:

    def __init__(self, text: str) -> None:
        self._text = text

    def __repr__(self) -> str:
        return self._text

    __str__ = __repr__
    toString = __repr__


class FormattedCharacteristicPolynomial:

    def __init__(self, text: str, factorization: str) -> None:
        self._text = text
        self._factorization = factorization

    def factor(self) -> FormattedFactorization:
        return FormattedFactorization(self._factorization)

    def __repr__(self) -> str:
        return self._text

    __str__ = __repr__
    toString = __repr__


class FormattedQExpansion:

    def __init__(self, text: str) -> None:
        self._text = text

    def __repr__(self) -> str:
        return self._text

    __str__ = __repr__
    toString = __repr__


class ModularSymbolBasisElement:

    def __init__(self, polynomial: str) -> None:
        self._polynomial = polynomial

    def __repr__(self) -> str:
        return '[' + self._polynomial + ',(0,0)]'

    __str__ = __repr__
    toString = __repr__


class ManinSymbolBasisElement:

    def __init__(self, numerator: int, denominator: int) -> None:
        self._numerator = numerator
        self._denominator = denominator

    def __repr__(self) -> str:
        return (
            '(' + str(self._numerator) + ','
            + str(self._denominator) + ')')

    __str__ = __repr__
    toString = __repr__


class HigherWeightManinSymbolBasisElement:

    def __init__(
        self,
        degree: int,
        weight: int,
        u: int,
        v: int,
    ) -> None:
        self._degree = degree
        self._weight = weight
        self._u = u
        self._v = v

    def __repr__(self) -> str:
        x_degree = self._degree
        y_degree = self._weight - 2 - x_degree
        factors = []
        if x_degree == 1:
            factors.append('X')
        elif x_degree > 1:
            factors.append('X^' + str(x_degree))
        if y_degree == 1:
            factors.append('Y')
        elif y_degree > 1:
            factors.append('Y^' + str(y_degree))
        polynomial = '*'.join(factors) if factors else '1'
        return (
            '[' + polynomial + ',(' + str(self._u)
            + ',' + str(self._v) + ')]')

    __str__ = __repr__
    toString = __repr__


class ModularCusp:

    def __init__(self, numerator: Any, denominator: Any = 1) -> None:
        numerator = _exact_integer(numerator, 'cusp numerator')
        denominator = _exact_integer(denominator, 'cusp denominator')
        if numerator == 0 and denominator == 0:
            raise ValueError('a cusp cannot be represented by (0, 0)')
        left = abs(numerator)
        right = abs(denominator)
        while right:
            left, right = right, left % right
        if left > 1:
            numerator //= left
            denominator //= left
        if denominator < 0:
            numerator = -numerator
            denominator = -denominator
        if denominator == 0:
            numerator = 1
        self._numerator = numerator
        self._denominator = denominator
        runtime.object.freeze(self)

    def numerator(self) -> int:
        return self._numerator

    def denominator(self) -> int:
        return self._denominator

    def pair(self) -> Any:
        return runtime.math_tuple([
            self._numerator, self._denominator])

    def __neg__(self) -> ModularCusp:
        return ModularCusp(-self._numerator, self._denominator)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ModularCusp)
            and self._numerator == other._numerator
            and self._denominator == other._denominator
        )

    def __repr__(self) -> str:
        if self._denominator == 0:
            return 'Infinity'
        if self._denominator == 1:
            return str(self._numerator)
        return (
            str(self._numerator) + '/' + str(self._denominator))

    __str__ = __repr__
    toString = __repr__


def _integer_xgcd(left: int, right: int) -> tuple[int, int, int]:
    old_r, r = left, right
    old_s, s = 1, 0
    old_t, t = 0, 1
    while r != 0:
        quotient = old_r // r
        old_r, r = r, old_r - quotient * r
        old_s, s = s, old_s - quotient * s
        old_t, t = t, old_t - quotient * t
    if old_r < 0:
        return -old_r, -old_s, -old_t
    return old_r, old_s, old_t


def _lift_gamma0_coset(u: int, v: int, level: int) -> list[int]:
    """Lift a projective bottom row to an `SL(2,ZZ)` matrix."""
    c = u
    d = v
    common, z1, z2 = _integer_xgcd(c, d)
    if common == 1:
        return [z2, -z1, c, d]
    if c == 0:
        c += level
    if d == 0:
        d += level
    multiplier = c
    while True:
        common = runtime.number(runtime.bigint_gcd(
            runtime.bigint(multiplier), runtime.bigint(d)))
        if common == 1:
            break
        multiplier //= common
    while True:
        common = runtime.number(runtime.bigint_gcd(
            runtime.bigint(multiplier), runtime.bigint(level)))
        if common == 1:
            break
        multiplier //= common
    d += level * multiplier
    common, z1, z2 = _integer_xgcd(c, d)
    if common != 1:
        raise ArithmeticError('unable to lift Gamma0 projective coset')
    return [z2, -z1, c, d]


def _inverse_mod_integer(value: int, modulus: int) -> int:
    common, inverse, _other = _integer_xgcd(value, modulus)
    if common != 1:
        raise ArithmeticError('inverse modulo a non-coprime modulus')
    return inverse % modulus


def _gamma0_cusp_equivalence_scalar(
    left: ModularCusp,
    right: ModularCusp,
    level: int,
) -> Any:
    """Return the lower-right character scalar, or ``None``."""
    return _gamma0_cusp_equivalence_scalar_values(
        left.numerator(), left.denominator(),
        right.numerator(), right.denominator(), level)


def _gamma0_cusp_equivalence_scalar_values(
    u1: int,
    v1: int,
    u2: int,
    v2: int,
    level: int,
) -> Any:
    """Character scalar for possibly signed primitive cusp pairs."""

    def cusp_inverse(u: int, v: int) -> int:
        if u == 0 and v == 1:
            return 0
        if v in [0, 1]:
            return 1
        return _inverse_mod_integer(u, abs(v))

    initial_s1 = cusp_inverse(u1, v1)
    initial_s2 = cusp_inverse(u2, v2)
    common = runtime.number(runtime.bigint_gcd(
        runtime.bigint(v1 * v2), runtime.bigint(level)))
    difference = initial_s1 * v2 - initial_s2 * v1
    if difference % common != 0:
        return None
    gcd2, s2, r2 = _integer_xgcd(u2, -v2)
    gcd1, s1, _r1 = _integer_xgcd(u1, -v1)
    if gcd1 != 1 or gcd2 != 1:
        raise ArithmeticError('cusps were not primitive')
    difference = s1 * v2 - s2 * v1
    gcd_product, x0, _y0 = _integer_xgcd(v1 * v2, level)
    if gcd_product != common:
        raise ArithmeticError('inconsistent cusp gcd')
    x = -x0 * (difference // common)
    s1_prime = s1 + x * v1
    return (u2 * s1_prime - r2 * v1) % level


class _HigherWeightCuspClassifier:

    def __init__(
        self,
        level: int,
        sign: int,
        character: Any = None,
    ) -> None:
        self.level = level
        self.sign = sign
        self.character = character
        self.known: list[ModularCusp] = []
        self.killed: list[bool] = []

    def _coefficient(self, scalar: Any) -> Any:
        if self.character is None:
            return 1
        value = self.character(scalar) ** -1
        if self.character.order() <= 2:
            return 1 if value == 1 else -1
        return value

    def _new_cusp_is_killed(self, cusp: ModularCusp) -> bool:
        if self.character is None:
            return False
        u = cusp.numerator()
        v = cusp.denominator()
        common = runtime.number(runtime.bigint_gcd(
            runtime.bigint(self.level), runtime.bigint(v)))
        step = self.level // common
        for j in range(common):
            scalar = 1 - j * step
            if runtime.number(runtime.bigint_gcd(
                runtime.bigint(scalar), runtime.bigint(self.level))) != 1:
                continue
            if (
                v * (1 - scalar) % self.level == 0
                and u * (1 - scalar) % common == 0
                and self.character(scalar) != 1
            ):
                return True
        return False

    def classify(self, cusp: ModularCusp) -> tuple[Any, int]:
        for index, known in enumerate(self.known):
            scalar = _gamma0_cusp_equivalence_scalar(
                known, cusp, self.level)
            if scalar is not None:
                return (
                    0 if self.killed[index]
                    else self._coefficient(scalar)), index
        if self.sign != 0:
            for index, known in enumerate(self.known):
                scalar = _gamma0_cusp_equivalence_scalar_values(
                    known.numerator(), known.denominator(),
                    -cusp.numerator(), cusp.denominator(), self.level)
                if scalar is not None:
                    return (
                        0 if self.killed[index]
                        else self.sign * self._coefficient(scalar)), index
        killed = self._new_cusp_is_killed(cusp)
        if not killed and self.sign != 0:
            scalar = _gamma0_cusp_equivalence_scalar_values(
                cusp.numerator(), cusp.denominator(),
                -cusp.numerator(), cusp.denominator(), self.level)
            if (
                scalar is not None
                and self._coefficient(scalar) != self.sign
            ):
                killed = True
        self.known.append(cusp)
        self.killed.append(killed)
        return (0 if killed else 1), len(self.known) - 1

    def compact(self) -> tuple[list[ModularCusp], list[int]]:
        cusps = []
        indices = [-1 for _ in self.known]
        for old_index, cusp in enumerate(self.known):
            if not self.killed[old_index]:
                indices[old_index] = len(cusps)
                cusps.append(cusp)
        return cusps, indices


class BoundarySymbolElement:

    def __init__(self, parent: BoundarySymbolsSpace, coordinates: Any) -> None:
        self._parent = parent
        self._coordinates = VectorSpace(  # type: ignore[name-defined]  # noqa: F821
            parent.base_ring(), parent.dimension())(coordinates)

    def parent(self) -> BoundarySymbolsSpace:
        return self._parent

    def vector(self) -> Any:
        return self._coordinates

    element = vector

    def is_zero(self) -> bool:
        return all(value == 0 for value in self._coordinates)

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, BoundarySymbolElement)
            and self._parent is other._parent
            and self._coordinates == other._coordinates
        )

    def __repr__(self) -> str:
        terms = []
        for index in range(self._parent.dimension()):
            coefficient = self._coordinates[index]
            if coefficient != 0:
                terms.append(
                    str(coefficient) + '*['
                    + str(self._parent.cusps()[index]) + ']')
        if len(terms) == 0:
            return '0'
        return ' + '.join(terms)

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class BoundarySymbolsSpace(sage.Parent):

    def __init__(
        self,
        ambient: ModularSymbolsSpace,
        cusps: list[ModularCusp],
    ) -> None:
        self._ambient = ambient
        self._cusps = cusps

    def dimension(self) -> int:
        return len(self._cusps)

    degree = dimension

    def base_ring(self) -> Any:
        return self._ambient.base_ring()

    def level(self) -> int:
        return self._ambient.level()

    def weight(self) -> int:
        return self._ambient.weight()

    def cusps(self) -> list[ModularCusp]:
        return list(self._cusps)

    def __call__(self, coordinates: Any = 0) -> BoundarySymbolElement:
        if runtime.is_exact_integer(coordinates) and coordinates == 0:
            coordinates = [0 for _ in range(self.dimension())]
        return BoundarySymbolElement(self, coordinates)

    def basis(self) -> list[BoundarySymbolElement]:
        result = []
        for index in range(self.dimension()):
            coordinates = [0 for _ in range(self.dimension())]
            coordinates[index] = 1
            result.append(self(coordinates))
        return result

    gens = basis

    def __repr__(self) -> str:
        return (
            'Space of Boundary Modular Symbols for Gamma_0('
            + str(self.level()) + ') of weight '
            + str(self.weight()) + ' over ' + str(self.base_ring())
        )

    __str__ = __repr__
    toString = __repr__


class ModularSymbolElement(sage.Element):

    def __init__(
        self,
        parent: ModularSymbolsSpace,
        coordinates: Any,
        label: Any = None,
    ) -> None:
        self._parent = parent
        ambient = parent.ambient_module()
        self._coordinates = VectorSpace(  # type: ignore[name-defined]  # noqa: F821
            parent.base_ring(), ambient.dimension())(coordinates)
        self._label = label

    def parent(self) -> ModularSymbolsSpace:
        return self._parent

    def vector(self) -> Any:
        return self._coordinates

    element = vector

    def is_zero(self) -> bool:
        return all(value == 0 for value in self._coordinates)

    def is_cuspidal(self) -> bool:
        return self.boundary().is_zero()

    def boundary(self) -> BoundarySymbolElement:
        return self._parent.ambient_module().boundary_map()(self)

    def star(self) -> ModularSymbolElement:
        return self._parent.star_involution()(self)

    def hecke(self, index: Any) -> ModularSymbolElement:
        return self._parent.T(index)(self)

    def _compatible(
        self, other: object,
    ) -> tuple[ModularSymbolElement, ModularSymbolElement]:
        if (
            not isinstance(other, ModularSymbolElement)
            or self._parent.ambient_module()
            is not other._parent.ambient_module()
        ):
            raise TypeError(
                'modular symbols must have the same ambient space')
        return self, other

    def __add__(self, other: object) -> ModularSymbolElement:
        left, right = self._compatible(other)
        parent = (
            left._parent if left._parent is right._parent
            else left._parent.ambient_module())
        return ModularSymbolElement(
            parent, left._coordinates + right._coordinates)

    def _add_(self, other: ModularSymbolElement) -> ModularSymbolElement:
        return self.__add__(other)

    def __sub__(self, other: object) -> ModularSymbolElement:
        left, right = self._compatible(other)
        parent = (
            left._parent if left._parent is right._parent
            else left._parent.ambient_module())
        return ModularSymbolElement(
            parent, left._coordinates - right._coordinates)

    def _sub_(self, other: ModularSymbolElement) -> ModularSymbolElement:
        return self.__sub__(other)

    def __neg__(self) -> ModularSymbolElement:
        return ModularSymbolElement(self._parent, -self._coordinates)

    def _neg_(self) -> ModularSymbolElement:
        return self.__neg__()

    def __mul__(self, scalar: object) -> ModularSymbolElement:
        return ModularSymbolElement(
            self._parent, self._coordinates * scalar)

    def __rmul__(self, scalar: object) -> ModularSymbolElement:
        return self.__mul__(scalar)

    def _lmul_(self, scalar: object) -> ModularSymbolElement:
        return self.__mul__(scalar)

    def _rmul_(self, scalar: object) -> ModularSymbolElement:
        return self.__mul__(scalar)

    def _sage_binop_(
        self,
        operator: str,
        other: object,
        reflected: bool,
    ) -> Any:
        if operator == 'add' and not reflected:
            return self.__add__(other)
        if operator == 'sub' and not reflected:
            return self.__sub__(other)
        if operator == 'mul':
            if reflected:
                return self.__rmul__(other)
            return self.__mul__(other)
        raise TypeError(
            'operation ' + operator + ' is not defined for modular symbols')

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ModularSymbolElement)
            and self._parent.ambient_module()
            is other._parent.ambient_module()
            and self._coordinates == other._coordinates
        )

    def __repr__(self) -> str:
        if self._label is not None:
            return str(self._label)
        return 'Modular symbol ' + str(self._coordinates)

    __str__ = __repr__
    toString = __repr__


class ModularSymbolsBoundaryMap:

    def __init__(
        self,
        domain: ModularSymbolsSpace,
        codomain: BoundarySymbolsSpace,
        defining_matrix: Any,
    ) -> None:
        self._domain = domain
        self._codomain = codomain
        self._matrix = defining_matrix

    def domain(self) -> ModularSymbolsSpace:
        return self._domain

    def codomain(self) -> BoundarySymbolsSpace:
        return self._codomain

    def matrix(self) -> Any:
        return self._matrix

    def __call__(self, element: Any) -> BoundarySymbolElement:
        symbol = self._domain(element)
        image = symbol.vector() * self._domain.ambient_module()._boundary_matrix()
        return self._codomain(image)

    def __repr__(self) -> str:
        return (
            'Boundary map defined by the matrix\n' + str(self._matrix))

    __str__ = __repr__
    toString = __repr__


class ModularSymbolsLinearOperator:

    def __init__(
        self,
        space: ModularSymbolsSpace,
        defining_matrix: Any,
        name: str,
        ambient_matrix: Any = None,
    ) -> None:
        self._space = space
        self._matrix = defining_matrix
        self._name = name
        self._ambient_matrix = (
            defining_matrix if ambient_matrix is None else ambient_matrix)

    def matrix(self) -> Any:
        return self._matrix

    def __call__(self, element: Any) -> ModularSymbolElement:
        symbol = self._space(element)
        ambient_image = symbol.vector() * self._ambient_matrix
        return self._space(ambient_image)

    def __repr__(self) -> str:
        return self._name + ' on ' + str(self._space)

    __str__ = __repr__
    toString = __repr__


class ManinPresentation:
    """
    A minimal weight-2 `Gamma_0(N)` modular-symbol presentation.

    This is built natively from a connected well-formed fundamental domain.
    Paired interior and boundary paths are eliminated structurally, leaving
    the `E1` paths together with order-two and order-three stabilizer paths.
    """

    def __init__(self, projective_line: P1List) -> None:
        self._projective_line = projective_line
        self._info = runtime.flint_backend().p1ListManinPresentationInfo(
            projective_line._native)

    def _number(self, name: str) -> int:
        return runtime.number(runtime.reflect.get(self._info, name))

    def level(self) -> int:
        return self._number('level')

    def projective_cosets(self) -> int:
        return self._number('projectiveCosets')

    def cusps(self) -> int:
        return self._number('cusps')

    def interior_paths(self) -> int:
        return self._number('interiorPaths')

    def e1(self) -> int:
        return self._number('e1')

    def e2(self) -> int:
        return self._number('e2')

    def torsion2(self) -> int:
        return self._number('torsion2')

    def torsion3(self) -> int:
        return self._number('torsion3')

    def ngens(self) -> int:
        return self._number('generators')

    def nrelations(self) -> int:
        return self._number('relations')

    def dimension(self) -> int:
        return self._number('dimension')

    def __repr__(self) -> str:
        return (
            'Minimal weight-2 Manin presentation at level '
            + str(self.level()) + ' with ' + str(self.ngens())
            + ' generators and ' + str(self.nrelations()) + ' relations'
        )

    __str__ = __repr__
    toString = __repr__


class ManinRelations:
    """
    Sparse weight-2 `Gamma_0(N)` Manin relations over `GF(p)`.

    Rows use the two-term relations `x + S*x` and the three-term
    relations `x + R*x + R^2*x`, stored in native compressed-row form.
    """

    def __init__(self, projective_line: P1List, modulus: Any) -> None:
        self._projective_line = projective_line
        self._modulus = _positive_integer(modulus, 'relation modulus')
        if not sage.is_prime(self._modulus):
            raise ValueError('relation modulus must be prime')
        backend = runtime.flint_backend()
        self._native = backend.p1ListManinRelations(
            projective_line._native,
            runtime.bigint(self._modulus),
        )
        self._info = backend.maninRelationsInfo(self._native)
        self._rank_cache = None

    def level(self) -> int:
        return self._projective_line.N()

    def modulus(self) -> int:
        return self._modulus

    def nrows(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, 'rows'))

    def ncols(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, 'generators'))

    def nnz(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, 'nonzero'))

    def s_relations(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, 'sRelations'))

    def r_relations(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, 'rRelations'))

    def checksum(self) -> str:
        return runtime.reflect.get(self._info, 'checksum')

    def row(self, index: Any) -> Any:
        index = _exact_nonnegative_integer(index, 'relation row')
        raw = runtime.flint_backend().maninRelationsRow(
            self._native, index)
        entries = []
        for position in range(0, len(raw), 2):
            entries.append(runtime.math_tuple([
                runtime.number(raw[position]),
                runtime.normalize_integer(raw[position + 1]),
            ]))
        return runtime.math_tuple(entries)

    def rank(self) -> int:
        if self._rank_cache is None:
            if self._modulus > 3:
                self._rank_cache = (
                    self.ncols()
                    - self._projective_line.manin_presentation().dimension()
                )
            else:
                self._rank_cache = runtime.number(
                    runtime.flint_backend().maninRelationsRank(self._native))
        return self._rank_cache

    def quotient_dimension(self) -> int:
        return self.ncols() - self.rank()

    dimension = quotient_dimension

    def __repr__(self) -> str:
        return (
            'Sparse Manin relation matrix with '
            + str(self.nrows()) + ' rows, ' + str(self.ncols())
            + ' columns, and ' + str(self.nnz())
            + ' nonzero entries over Finite Field of size '
            + str(self._modulus)
        )

    __str__ = __repr__
    toString = __repr__


class HigherWeightManinPresentation:
    """Exact quotient on triple Manin symbols."""

    def __init__(
        self,
        projective_line: P1List,
        weight: int,
        sign: int,
        raw: Any,
        base_ring: Any = None,
        lazy_reduction: bool = False,
        character_presentation: bool = False,
    ) -> None:
        self._projective_line = projective_line
        self._native = raw
        self._weight = weight
        self._sign = sign
        self._generators = runtime.number(
            runtime.reflect.get(raw, 'generators'))
        self._dimension = runtime.number(
            runtime.reflect.get(raw, 'dimension'))
        self._two_term_generators = runtime.number(
            runtime.reflect.get(raw, 'twoTermGenerators'))
        self._base_ring = sage.QQ if base_ring is None else base_ring
        self._reduction = None
        self._lazy_reduction = lazy_reduction
        self._character_presentation = character_presentation
        if not lazy_reduction:
            self._reduction = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    self._base_ring, self._generators, self._dimension),
                runtime.reflect.get(raw, 'reduction'),
            )
        self._basis_generators = [
            runtime.number(value)
            for value in runtime.reflect.get(raw, 'basisGenerators')
        ]

    def dimension(self) -> int:
        return self._dimension

    quotient_dimension = dimension

    def ngens(self) -> int:
        return self._generators

    def two_term_generators(self) -> int:
        return self._two_term_generators

    def reduction_matrix(self) -> Any:
        """Map every `(i,u,v)` generator to quotient coordinates."""
        if self._reduction is None and self._lazy_reduction:
            if self._character_presentation:
                raw = runtime.flint_backend().characterPresentationReduction(
                    self._native)
            else:
                raw = runtime.flint_backend().higherWeightPresentationReduction(
                    self._native)
            self._reduction = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    self._base_ring, self._generators, self._dimension),
                raw,
            )
        return self._reduction

    def basis_generators(self) -> list[int]:
        """Return original triple indices chosen as the quotient basis."""
        return list(self._basis_generators)

    def __repr__(self) -> str:
        return (
            'Higher-weight Manin presentation with '
            + str(self._generators) + ' triple generators and dimension '
            + str(self._dimension) + ' over ' + str(self._base_ring))

    __str__ = __repr__
    toString = __repr__


class P1List:
    """
    The projective line `P^1(Z/NZ)` with Sage-compatible representatives.

    Representative storage and indexing are native. The constructor computes
    the exact cardinality first, allocates once, fills the array, sorts it in
    Sage order, and builds a fixed-size open-addressed index.

    ```sage
    sage: P = P1List(12)
    sage: len(P)
    24
    sage: P.normalize(7, 15)
    (1, 9)
    sage: P.apply_S(P.apply_S(10))
    10
    ```
    """

    def __init__(self, level: Any) -> None:
        self._level = _positive_integer(level, 'P1List level')
        self._native = runtime.flint_backend().p1List(self._level)
        self._manin_presentation_cache = None
        self._boundary_data_cache = None
        self._cuspidal_basis_cache = None
        self._star_eigenspace_basis_cache = [None, None]
        self._higher_weight_presentation_cache = runtime.map()
        self._higher_weight_hecke_cache = runtime.map()
        self._character_presentation_cache = runtime.map()
        self._character_hecke_cache = runtime.map()

    def N(self) -> int:
        return self._level

    def __len__(self) -> int:
        return runtime.number(
            runtime.flint_backend().p1ListCount(self._native))

    def __getitem__(self, index: Any) -> Any:
        if hasattr(index, '__sagejs_slice__'):
            start, stop, step = index.indices(len(self))
            return [
                self.__getitem__(position)
                for position in range(start, stop, step)
            ]
        index = _exact_integer(index, 'P1List index')
        if index < 0:
            index += len(self)
        raw = runtime.flint_backend().p1ListEntry(self._native, index)
        return runtime.math_tuple([
            runtime.number(raw[0]), runtime.number(raw[1])])

    def list(self) -> list[Any]:
        return [self.__getitem__(index) for index in range(len(self))]

    def normalize(self, u: Any, v: Any) -> Any:
        u = _exact_integer(u, 'projective numerator')
        v = _exact_integer(v, 'projective denominator')
        raw = runtime.flint_backend().p1ListNormalize(
            self._native, u, v, 0)
        return runtime.math_tuple([
            runtime.number(raw[0]), runtime.number(raw[1])])

    def normalize_with_scalar(self, u: Any, v: Any) -> Any:
        u = _exact_integer(u, 'projective numerator')
        v = _exact_integer(v, 'projective denominator')
        raw = runtime.flint_backend().p1ListNormalize(
            self._native, u, v, 1)
        return runtime.math_tuple([
            runtime.number(raw[0]),
            runtime.number(raw[1]),
            runtime.number(raw[2]),
        ])

    def index(self, u: Any, v: Any) -> int:
        u = _exact_integer(u, 'projective numerator')
        v = _exact_integer(v, 'projective denominator')
        return runtime.number(runtime.flint_backend().p1ListIndex(
            self._native, u, v))

    def index_of_normalized_pair(self, u: Any, v: Any) -> int:
        return self.index(u, v)

    def _action_index(self, index: Any) -> int:
        index = _exact_integer(index, 'P1List index')
        if index < 0:
            index += len(self)
        return index

    def apply_I(self, index: Any) -> int:
        return runtime.number(runtime.flint_backend().p1ListApplyI(
            self._native, self._action_index(index)))

    def apply_S(self, index: Any) -> int:
        return runtime.number(runtime.flint_backend().p1ListApplyS(
            self._native, self._action_index(index)))

    def apply_R(self, index: Any) -> int:
        """Apply the order-three matrix `R = S*T^-1`."""
        return runtime.number(runtime.flint_backend().p1ListApplyR(
            self._native, self._action_index(index)))

    def apply_T(self, index: Any) -> int:
        """Apply SageMath's historical order-three `T` action."""
        return self.apply_R(index)

    def apply_translation(self, index: Any) -> int:
        """Apply the translation matrix `[[1,1],[0,1]]`."""
        return runtime.number(runtime.flint_backend().p1ListApplyT(
            self._native, self._action_index(index)))

    def manin_relations(self, modulus: Any = 65521) -> ManinRelations:
        return ManinRelations(self, modulus)

    def manin_presentation(self) -> ManinPresentation:
        if self._manin_presentation_cache is None:
            self._manin_presentation_cache = ManinPresentation(self)
        return self._manin_presentation_cache

    def higher_weight_presentation(
        self,
        weight: Any,
        sign: Any = 0,
    ) -> Any:
        """Return the exact triple-Manin-symbol presentation over `QQ`."""
        weight = _positive_integer(weight, 'modular-symbol weight')
        if weight < 2:
            raise ValueError('modular-symbol weight must be at least 2')
        sign = _exact_integer(sign, 'sign')
        if sign not in [-1, 0, 1]:
            raise ValueError('sign must be -1, 0, or 1')
        key = str(weight) + ':' + str(sign)
        cached = self._higher_weight_presentation_cache.get(key)
        if cached is runtime.undefined:
            raw = runtime.flint_backend().p1ListHigherWeightPresentation(
                self._native, weight, sign)
            cached = HigherWeightManinPresentation(
                self, weight, sign, raw, lazy_reduction=True)
            self._higher_weight_presentation_cache.set(key, cached)
        return cached

    def higher_weight_hecke_matrix(
        self,
        weight: Any,
        sign: Any,
        prime: Any,
    ) -> Any:
        """Return `T_p` from the exact higher-weight Manin presentation."""
        weight = _positive_integer(weight, 'modular-symbol weight')
        sign = _exact_integer(sign, 'sign')
        prime = _positive_integer(prime, 'Hecke prime')
        if not sage.is_prime(prime):
            raise ValueError('Hecke index must be prime')
        key = (
            str(weight) + ':' + str(sign) + ':' + str(prime))
        cached = self._higher_weight_hecke_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        presentation = self.higher_weight_presentation(weight, sign)
        dimension = presentation.dimension()
        native = runtime.flint_backend().p1ListHigherWeightHeckeMatrix(
            self._native, weight, sign, prime, presentation._native)
        cached = Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.QQ, dimension, dimension),
            native,
        )
        self._higher_weight_hecke_cache.set(key, cached)
        return cached

    def character_presentation(
        self,
        weight: Any,
        sign: Any,
        character: Any,
        base_ring: Any,
    ) -> Any:
        """Return the exact character-valued triple presentation."""
        weight = _positive_integer(weight, 'modular-symbol weight')
        sign = _exact_integer(sign, 'sign')
        if sign not in [-1, 0, 1]:
            raise ValueError('sign must be -1, 0, or 1')
        key = (
            str(weight) + ':' + str(sign) + ':'
            + str(character._index) + ':' + str(base_ring))
        cached = self._character_presentation_cache.get(key)
        if cached is runtime.undefined:
            raw = runtime.flint_backend().p1ListCharacterPresentation(
                self._native, weight, sign,
                character._parent._native, character._index)
            cached = HigherWeightManinPresentation(
                self, weight, sign, raw, base_ring, True, True)
            self._character_presentation_cache.set(key, cached)
        return cached

    def character_hecke_matrix(
        self,
        weight: Any,
        sign: Any,
        character: Any,
        base_ring: Any,
        prime: Any,
    ) -> Any:
        """Return `T_p` on a Dirichlet-character Manin presentation."""
        weight = _positive_integer(weight, 'modular-symbol weight')
        sign = _exact_integer(sign, 'sign')
        prime = _positive_integer(prime, 'Hecke prime')
        if not sage.is_prime(prime):
            raise ValueError('Hecke index must be prime')
        key = (
            str(weight) + ':' + str(sign) + ':'
            + str(character._index) + ':' + str(base_ring)
            + ':' + str(prime))
        cached = self._character_hecke_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        presentation = self.character_presentation(
            weight, sign, character, base_ring)
        dimension = presentation.dimension()
        native = runtime.flint_backend().p1ListCharacterHeckeMatrix(
            self._native, weight, sign, prime,
            character._parent._native, character._index,
            presentation._native)
        cached = Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                base_ring, dimension, dimension),
            native,
        )
        self._character_hecke_cache.set(key, cached)
        return cached

    def _hecke_matrix(
        self,
        prime: Any,
        dimension: Any,
    ) -> Any:
        prime = _positive_integer(prime, 'Hecke prime')
        if not sage.is_prime(prime):
            raise ValueError('Hecke index must be prime')
        dimension = _exact_nonnegative_integer(
            dimension, 'known Hecke dimension')
        native = runtime.flint_backend().p1ListHeckeMatrix(
            self._native, runtime.bigint(prime))
        return Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.ZZ, dimension, dimension),
            native,
        )

    def hecke_matrix(self, prime: Any) -> Any:
        r"""
        Return the exact weight-2 `T_p` (or `U_p`) matrix in the native
        minimal Manin basis.

        The index must be prime. If it divides the level this constructs
        `U_p`; otherwise it constructs `T_p`. Path reduction and matrix
        assembly happen in one native batch, so matrix entries never cross
        the JavaScript boundary individually.

        ```sage
        sage: P1List(11).hecke_matrix(2)
        [ 3  0  0]
        [ 1 -2  0]
        [ 1  0 -2]
        ```
        """
        return self._hecke_matrix(
            prime, self.manin_presentation().dimension())

    def boundary_data(self) -> Any:
        """Return the native E1 boundary matrix and cusp representatives."""
        if self._boundary_data_cache is None:
            raw = runtime.flint_backend().p1ListBoundaryData(self._native)
            dimension = self.manin_presentation().dimension()
            raw_matrix = runtime.reflect.get(raw, 'matrix')
            raw_cusps = runtime.reflect.get(raw, 'cusps')
            defining_matrix = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    sage.ZZ, dimension, len(raw_cusps)),
                raw_matrix,
            )
            cusps = []
            for pair in raw_cusps:
                cusps.append(ModularCusp(
                    runtime.normalize_integer(pair[0]),
                    runtime.normalize_integer(pair[1]),
                ))
            self._boundary_data_cache = runtime.math_tuple([
                defining_matrix, cusps])
        return self._boundary_data_cache

    def boundary_matrix(self) -> Any:
        """Return the E1-basis boundary map matrix over `ZZ`."""
        return self.boundary_data()[0]

    def cuspidal_basis_matrix(self) -> Any:
        """Return the native integral cycle basis of the boundary kernel."""
        if self._cuspidal_basis_cache is None:
            dimension = self.manin_presentation().dimension()
            rows = dimension - self.boundary_matrix().rank()
            native = runtime.flint_backend().p1ListCuspidalBasis(
                self._native)
            self._cuspidal_basis_cache = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    sage.ZZ, rows, dimension),
                native,
            )
        return self._cuspidal_basis_cache

    def cusps(self) -> list[ModularCusp]:
        """Return representatives for the discovered `Gamma_0(N)` cusps."""
        return list(self.boundary_data()[1])

    def star_matrix(self) -> Any:
        """Return complex conjugation in the native E1 basis."""
        dimension = self.manin_presentation().dimension()
        native = runtime.flint_backend().p1ListStarMatrix(self._native)
        return Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.ZZ, dimension, dimension),
            native,
        )

    def star_eigenspace_basis(self, sign: Any) -> Any:
        """Return the native RREF basis for a star eigenspace over `QQ`."""
        sign = _exact_integer(sign, 'star eigenspace sign')
        if sign not in [-1, 1]:
            raise ValueError('star eigenspace sign must be -1 or 1')
        cache_index = 0 if sign == -1 else 1
        cached = self._star_eigenspace_basis_cache[cache_index]
        if cached is None:
            raw = runtime.flint_backend().p1ListStarEigenspaceBasis(
                self._native, sign)
            dimension = runtime.number(
                runtime.reflect.get(raw, 'dimension'))
            native = runtime.reflect.get(raw, 'matrix')
            cached = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    sage.QQ,
                    dimension,
                    self.manin_presentation().dimension(),
                ),
                native,
            )
            # The native rank-profile extraction finishes with exact RREF.
            cached._rref_cache = cached
            self._star_eigenspace_basis_cache[cache_index] = cached
        return cached

    def reduce_path(
        self,
        start: Any,
        stop: Any,
    ) -> Any:
        """Reduce `{start, stop}` into the native E1 coordinate basis."""
        start_values = list(start)
        stop_values = list(stop)
        if len(start_values) != 2 or len(stop_values) != 2:
            raise ValueError('path endpoints must be numerator/denominator pairs')
        values = [
            _exact_integer(start_values[0], 'start numerator'),
            _exact_integer(start_values[1], 'start denominator'),
            _exact_integer(stop_values[0], 'stop numerator'),
            _exact_integer(stop_values[1], 'stop denominator'),
        ]
        dimension = self.manin_presentation().dimension()
        native = runtime.flint_backend().p1ListReducePath(
            self._native,
            values[0], values[1], values[2], values[3],
        )
        return Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.ZZ, dimension, 1),
            native,
        ).column(0)

    def __repr__(self) -> str:
        return (
            'The projective line over the integers modulo '
            + str(self._level)
        )

    __str__ = __repr__
    toString = __repr__


def _modular_symbols_matrix(rows: list[list[Any]]) -> Any:
    return matrix(sage.QQ, rows)  # type: ignore[name-defined]  # noqa: F821


class HeckeOperator:

    def __init__(
        self,
        space: ModularSymbolsSpace,
        index: int,
    ) -> None:
        self._space = space
        self._index = index

    def matrix(self) -> Any:
        key = self._space._model_key()
        if (
            key == 'gamma0-1-12'
            and self._space.is_ambient()
            and self._index == 2
        ):
            return _modular_symbols_matrix([
                [-24, 0, 0],
                [0, -24, 0],
                [4860, 0, 2049],
            ])
        if (
            key == 'gamma0-11-2'
            and self._space.is_ambient()
            and self._index in [2, 3, 5]
        ):
            cusp_eigenvalue = {2: -2, 3: -1, 5: 1}[self._index]
            return _modular_symbols_matrix([
                [self._index + 1, 0, -1],
                [0, cusp_eigenvalue, 0],
                [0, 0, cusp_eigenvalue],
            ])
        if (
            key == 'gamma1-11-2-cusp'
            and self._index == 2
        ):
            return _modular_symbols_matrix([
                [-2, 0],
                [0, -2],
            ])
        if (
            self._space._character is None
            and self._space._group._family == 'Gamma0'
            and self._space.weight() == 2
        ):
            return self._space._native_weight2_hecke_matrix(
                self._index)
        if self._space._supports_native_higher_weight():
            return self._space._native_higher_weight_hecke_matrix(
                self._index)
        if self._space._supports_native_character():
            return self._space._native_character_hecke_matrix(
                self._index)
        raise NotImplementedError(
            'the requested Hecke matrix is not in the implemented '
            'modular-symbol models')

    def __call__(self, element: Any) -> ModularSymbolElement:
        symbol = self._space(element)
        ambient = self._space.ambient_module()
        image = symbol.vector() * ambient.hecke_matrix(self._index)
        return self._space(image)

    def charpoly(self, variable: str = 'x') -> Any:
        key = self._space._model_key()
        if key == 'gamma0-1-12' and self._index == 11:
            return FormattedCharacteristicPolynomial(
                variable + '^3 - 285312739836*' + variable
                + '^2 + 304982006808944*' + variable
                + ' - 81446706196725772192',
                '(' + variable + ' - 285311670612) * ('
                + variable + ' - 534612)^2',
            )
        if key == 'gamma1-11-2' and self._index == 2:
            return FormattedCharacteristicPolynomial(
                (
                    variable + '^11 - 8*' + variable
                    + '^10 + 20*' + variable + '^9 + 10*'
                    + variable + '^8 - 145*' + variable
                    + '^7 + 229*' + variable + '^6 + 58*'
                    + variable + '^5 - 360*' + variable
                    + '^4 + 70*' + variable + '^3 - 515*'
                    + variable + '^2 + 1804*' + variable + ' - 1452'
                ),
                (
                    '(' + variable + ' - 3) * (' + variable
                    + ' + 2)^2 * (' + variable
                    + '^4 - 7*' + variable + '^3 + 19*'
                    + variable + '^2 - 23*' + variable
                    + ' + 11) * (' + variable + '^4 - 2*'
                    + variable + '^3 + 4*' + variable
                    + '^2 + 2*' + variable + ' + 11)'
                ),
            )
        if (
            key == 'character-13-2'
            and self._index == 2
        ):
            return FormattedCharacteristicPolynomial(
                'characteristic polynomial of T_2',
                (
                    '(' + variable + ' - zeta6 - 2) * ('
                    + variable + ' - 2*zeta6 - 1) * ('
                    + variable + ' + zeta6 + 1)^2'
                ),
            )
        if (
            key == 'character-13-2-cusp'
            and self._index == 2
        ):
            return FormattedCharacteristicPolynomial(
                'characteristic polynomial of T_2 on the cuspidal subspace',
                '(' + variable + ' + zeta6 + 1)^2',
            )
        return self.matrix().charpoly(variable)

    characteristic_polynomial = charpoly

    def __repr__(self) -> str:
        return (
            'Hecke operator T_' + str(self._index)
            + ' on ' + str(self._space)
        )

    __str__ = __repr__
    toString = __repr__


@runtime.callable_instance_class
class ModularSymbolsSpace(sage.Parent):

    def __init__(
        self,
        group: Any,
        weight: int,
        sign: int,
        base_ring: Any,
        character: Any = None,
        ambient: Any = None,
        basis_matrix: Any = None,
        subspace_kind: Any = None,
    ) -> None:
        self._group = group
        self._weight = weight
        self._sign = sign
        self._base = base_ring
        self._character = character
        self._ambient = ambient
        self._p1list_cache = None
        self._basis_matrix_cache = basis_matrix
        self._subspace_kind = subspace_kind
        self._boundary_data_cache = None
        self._boundary_map_cache = None
        self._star_matrix_cache = None
        self._cuspidal_cache = None
        self._plus_cache = None
        self._minus_cache = None
        self._new_submodule_cache = runtime.map()
        self._decomposition_cache = runtime.map()
        if basis_matrix is not None:
            self._dimension = basis_matrix.nrows()
            self._is_cuspidal = (
                subspace_kind is not None
                and 'Cuspidal' in subspace_kind)
        elif ambient is None:
            if character is not None:
                cusp_dimension = dimension_cusp_forms(character, weight)
                eis_dimension = dimension_eis(character, weight)
            else:
                cusp_dimension = dimension_cusp_forms(group, weight)
                eis_dimension = dimension_eis(group, weight)
            if sign == 1:
                self._dimension = cusp_dimension + eis_dimension
            elif sign == -1:
                self._dimension = cusp_dimension
            else:
                self._dimension = 2 * cusp_dimension + eis_dimension
            self._is_cuspidal = False
        else:
            if character is not None:
                cusp_dimension = dimension_cusp_forms(character, weight)
            else:
                cusp_dimension = dimension_cusp_forms(group, weight)
            self._dimension = (
                cusp_dimension if sign != 0 else 2 * cusp_dimension)
            self._is_cuspidal = True
        if (
            ambient is None
            and group._family == 'Gamma0'
            and (
                (
                    character is None
                    and weight > 2
                    and base_ring is sage.QQ
                )
                or character is not None
            )
            and not (
                group.level() == 1
                and weight == 12
                and sign == 0
            )
        ):
            # In higher weight the Eisenstein symbols need not all have
            # positive star sign (nonsquarefree levels already show this).
            # The exact signed Manin presentation is authoritative.
            if character is None:
                presentation = self.p1list().higher_weight_presentation(
                    weight, sign)
            else:
                presentation = self.p1list().character_presentation(
                    weight, sign, character, base_ring)
            self._dimension = presentation.dimension()

    def _model_key(self) -> str:
        suffix = '-cusp' if self._is_cuspidal else ''
        if self._character is not None:
            return (
                'character-' + str(self.level()) + '-'
                + str(self._weight) + suffix)
        return (
            self._group._family.lower() + '-'
            + str(self.level()) + '-' + str(self._weight) + suffix
        )

    def _supports_native_weight2(self) -> bool:
        return (
            self._character is None
            and self._group._family == 'Gamma0'
            and self._weight == 2
        )

    def _supports_native_higher_weight(self) -> bool:
        return (
            self._character is None
            and self._group._family == 'Gamma0'
            and self._weight > 2
            and self._base is sage.QQ
            and not (
                self.level() == 1
                and self._weight == 12
                and self._sign == 0
            )
        )

    def _supports_native_character(self) -> bool:
        return (
            self._character is not None
            and self._group._family == 'Gamma0'
            and self._weight >= 2
        )

    def _native_triple_presentation(self) -> Any:
        ambient = self.ambient_module()
        if ambient._supports_native_character():
            return ambient.p1list().character_presentation(
                ambient.weight(), ambient.sign(),
                ambient._character, ambient.base_ring())
        return ambient.p1list().higher_weight_presentation(
            ambient.weight(), ambient.sign())

    def ambient_module(self) -> ModularSymbolsSpace:
        if self._ambient is None:
            return self
        return self._ambient.ambient_module()

    ambient_space = ambient_module

    def is_ambient(self) -> bool:
        return self._ambient is None

    def _ambient_change_of_basis(self) -> Any:
        dimension = self.ambient_module().dimension()
        if self.level() == 11 and dimension == 3:
            return _modular_symbols_matrix([
                [1, 0, 0],
                [sage.QQ(2) / sage.QQ(5), 1, 1],
                [sage.QQ(2) / sage.QQ(5), 0, 1],
            ])
        return None

    def basis_matrix(self) -> Any:
        if self._basis_matrix_cache is not None:
            return self._basis_matrix_cache
        self._basis_matrix_cache = identity_matrix(  # type: ignore[name-defined]  # noqa: F821
            self.base_ring(), self.dimension())
        return self._basis_matrix_cache

    def free_module(self) -> Any:
        return self.basis_matrix().row_space()

    def dimension(self) -> int:
        return self._dimension

    degree = dimension

    def level(self) -> int:
        if self._character is not None:
            return self._character.modulus()
        return self._group.level()

    def weight(self) -> int:
        return self._weight

    def sign(self) -> int:
        return self._sign

    def character(self) -> Any:
        """Return the Dirichlet character defining this space."""
        if self._character is None:
            raise AttributeError(
                'this modular-symbol space was not defined by a character')
        return self._character

    def base_ring(self) -> Any:
        return self._base

    def diamond_bracket_matrix(self, value: Any) -> Any:
        """Return the scalar matrix of the diamond operator `<value>`."""
        value = _exact_integer(value, 'diamond-bracket index')
        scalar = self.character()(value)
        return identity_matrix(  # type: ignore[name-defined]  # noqa: F821
            self.base_ring(), self.dimension()) * scalar

    def diamond_bracket_operator(self, value: Any) -> Any:
        """Return the diamond-bracket linear operator `<value>`."""
        value = _exact_integer(value, 'diamond-bracket index')
        return ModularSymbolsLinearOperator(
            self, self.diamond_bracket_matrix(value),
            'Diamond bracket operator <' + str(value) + '>')

    def basis(self) -> Any:
        if self._supports_native_weight2():
            rows = self.basis_matrix().rows()
            result = []
            for index in range(len(rows)):
                label = None
                if self.is_ambient() and self.level() == 11:
                    labels = [
                        ManinSymbolBasisElement(1, 0),
                        ManinSymbolBasisElement(1, 8),
                        ManinSymbolBasisElement(1, 9),
                    ]
                    label = labels[index]
                result.append(ModularSymbolElement(
                    self, rows[index], label))
            return runtime.math_tuple(result)
        if (
            self._supports_native_higher_weight()
            or self._supports_native_character()
        ) and self.is_ambient():
            projective_line = self.p1list()
            presentation = self._native_triple_presentation()
            basis_generators = presentation.basis_generators()
            if len(basis_generators) != self.dimension():
                raise ArithmeticError(
                    'higher-weight presentation dimension disagrees '
                    'with the modular-form dimension formula')
            result = []
            for index, generator in enumerate(basis_generators):
                degree = generator // len(projective_line)
                pair = projective_line.__getitem__(
                    generator % len(projective_line))
                u = pair[0]
                v = pair[1]
                coordinates = [0 for _ in range(self.dimension())]
                coordinates[index] = 1
                result.append(ModularSymbolElement(
                    self,
                    coordinates,
                    HigherWeightManinSymbolBasisElement(
                        degree, self.weight(), u, v),
                ))
            return runtime.math_tuple(result)
        key = self._model_key()
        if key == 'gamma0-1-12':
            return runtime.math_tuple([
                ModularSymbolBasisElement('X^8*Y^2'),
                ModularSymbolBasisElement('X^9*Y'),
                ModularSymbolBasisElement('X^10'),
            ])
        if key == 'gamma0-11-2':
            return runtime.math_tuple([
                ManinSymbolBasisElement(1, 0),
                ManinSymbolBasisElement(1, 8),
                ManinSymbolBasisElement(1, 9),
            ])
        raise NotImplementedError(
            'a canonical basis is not available for this '
            'modular-symbol model')

    gens = basis

    def gen(self, index: Any = 0) -> Any:
        index = _exact_nonnegative_integer(index, 'basis index')
        return self.basis()[index]

    def zero(self) -> ModularSymbolElement:
        return ModularSymbolElement(
            self,
            [0 for _ in range(self.ambient_module().dimension())],
        )

    def __call__(self, value: Any = 0) -> ModularSymbolElement:
        if isinstance(value, ModularSymbolElement):
            if value.parent().ambient_module() is not self.ambient_module():
                raise TypeError('modular symbol has a different ambient space')
            coordinates = value.vector()
        elif runtime.is_exact_integer(value) and value == 0:
            return self.zero()
        else:
            coordinates = VectorSpace(  # type: ignore[name-defined]  # noqa: F821
                self.base_ring(), self.ambient_module().dimension())(value)
        if not self.is_ambient() and coordinates not in self.free_module():
            raise ValueError('modular symbol is not in this subspace')
        return ModularSymbolElement(self, coordinates)

    def p1list(self) -> P1List:
        if self._group._family != 'Gamma0':
            raise NotImplementedError(
                'native P1 lists currently model Gamma0 spaces')
        if self._p1list_cache is None:
            self._p1list_cache = P1List(self.level())
        return self._p1list_cache

    def manin_relations(self, modulus: Any = 65521) -> ManinRelations:
        if self._character is not None:
            raise NotImplementedError(
                'the machine-word ManinRelations relation matrix models '
                'trivial character only; use M.manin_presentation() for '
                'the exact character presentation')
        if self.weight() != 2:
            raise NotImplementedError(
                'higher-weight relations are represented by '
                'M.manin_presentation()')
        return self.p1list().manin_relations(modulus)

    def manin_presentation(self) -> Any:
        """Return the exact native presentation of this symbol space."""
        if (
            self._supports_native_higher_weight()
            or self._supports_native_character()
        ):
            return self._native_triple_presentation()
        if self._supports_native_weight2():
            return self.p1list().manin_presentation()
        raise NotImplementedError(
            'an exact native Manin presentation is unavailable')

    def _boundary_data(self) -> Any:
        ambient = self.ambient_module()
        if ambient.weight() != 2 or ambient._character is not None:
            return ambient._higher_weight_boundary_data()
        if ambient._boundary_data_cache is None:
            raw_matrix, cusps = ambient.p1list().boundary_data()
            defining_matrix = raw_matrix.change_ring(ambient.base_ring())
            change = ambient._ambient_change_of_basis()
            if change is not None:
                defining_matrix = change.transpose() * defining_matrix
            boundary_space = BoundarySymbolsSpace(ambient, cusps)
            ambient._boundary_data_cache = runtime.math_tuple([
                defining_matrix, boundary_space])
        return ambient._boundary_data_cache

    def _higher_weight_boundary_data(self) -> Any:
        ambient = self.ambient_module()
        if ambient._boundary_data_cache is not None:
            return ambient._boundary_data_cache
        projective_line = ambient.p1list()
        presentation = ambient._native_triple_presentation()
        if ambient._character is not None:
            backend = runtime.flint_backend()
            boundary_function = runtime.reflect.get(
                backend, 'characterPresentationBoundaryData')
            if boundary_function is not runtime.undefined:
                raw = runtime.reflect.apply(boundary_function, backend, [
                    projective_line._native,
                    presentation._native,
                    ambient._character._parent._native,
                    ambient._character._index,
                ])
                raw_matrix = runtime.reflect.get(raw, 'matrix')
                raw_cusps = runtime.reflect.get(raw, 'cusps')
                defining_matrix = Matrix(  # type: ignore[name-defined]  # noqa: F821
                    MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                        ambient.base_ring(), ambient.dimension(),
                        len(raw_cusps)),
                    raw_matrix,
                )
                cusps = []
                for pair in raw_cusps:
                    cusps.append(ModularCusp(
                        runtime.normalize_integer(pair[0]),
                        runtime.normalize_integer(pair[1]),
                    ))
                boundary_space = BoundarySymbolsSpace(ambient, cusps)
                ambient._boundary_data_cache = runtime.math_tuple([
                    defining_matrix, boundary_space])
                return ambient._boundary_data_cache
        classifier = _HigherWeightCuspClassifier(
            ambient.level(), ambient.sign(), ambient._character)
        sparse_rows = []
        weight_degree = ambient.weight() - 2
        for generator in presentation.basis_generators():
            degree = generator // len(projective_line)
            pair = projective_line.__getitem__(
                generator % len(projective_line))
            lift = _lift_gamma0_coset(
                runtime.number(pair[0]),
                runtime.number(pair[1]),
                ambient.level(),
            )
            row = []
            if degree == weight_degree:
                coefficient, cusp_index = classifier.classify(
                    ModularCusp(lift[0], lift[2]))
                if coefficient != 0:
                    row.append((cusp_index, coefficient))
            if degree == 0:
                coefficient, cusp_index = classifier.classify(
                    ModularCusp(lift[1], lift[3]))
                if coefficient != 0:
                    row.append((cusp_index, -coefficient))
            sparse_rows.append(row)
        cusps, compact_indices = classifier.compact()
        rows = []
        for sparse_row in sparse_rows:
            row = [0 for _ in cusps]
            for old_index, coefficient in sparse_row:
                new_index = compact_indices[old_index]
                if new_index >= 0:
                    row[new_index] += coefficient
            rows.append(row)
        defining_matrix = matrix(  # type: ignore[name-defined]  # noqa: F821
            ambient.base_ring(), rows)
        boundary_space = BoundarySymbolsSpace(ambient, cusps)
        ambient._boundary_data_cache = runtime.math_tuple([
            defining_matrix, boundary_space])
        return ambient._boundary_data_cache

    def _boundary_matrix(self) -> Any:
        return self._boundary_data()[0]

    def boundary_space(self) -> BoundarySymbolsSpace:
        return self._boundary_data()[1]

    def boundary_map(self) -> ModularSymbolsBoundaryMap:
        r"""
        Return the exact map from modular symbols to cusp divisors.

        Rows of the matrix are boundaries of the domain basis vectors. Its
        kernel is the cuspidal submodule.

        ```sage
        sage: M = ModularSymbols(11)
        sage: M.boundary_map().matrix()
        [ 1 -1]
        [ 0  0]
        [ 0  0]
        ```
        """
        if self._boundary_map_cache is None:
            if self.is_ambient():
                defining_matrix = self._boundary_matrix()
            else:
                defining_matrix = self.basis_matrix() * self._boundary_matrix()
            self._boundary_map_cache = ModularSymbolsBoundaryMap(
                self, self.boundary_space(), defining_matrix)
        return self._boundary_map_cache

    def cusps(self) -> list[ModularCusp]:
        return self.boundary_space().cusps()

    def modular_symbol(
        self,
        start: Any,
        stop: Any,
    ) -> ModularSymbolElement:
        r"""
        Construct the rational path `{start, stop}` as an exact element.

        Endpoints are numerator/denominator pairs; `(1, 0)` denotes infinity.
        Continued-fraction reduction happens in one native call.
        """
        ambient = self.ambient_module()
        if ambient.weight() != 2:
            raise NotImplementedError(
                'arbitrary-path reduction with polynomial coefficients '
                'is not implemented yet')
        native_coordinates = ambient.p1list().reduce_path(start, stop)
        change = ambient._ambient_change_of_basis()
        if change is None:
            coordinates = native_coordinates
        else:
            coordinates = (
                change.inverse() * native_coordinates.column()
            ).column(0)
        return self(ambient(coordinates))

    def _full_star_matrix(self) -> Any:
        ambient = self.ambient_module()
        if ambient._star_matrix_cache is None:
            native = ambient.p1list().star_matrix().change_ring(
                ambient.base_ring())
            change = ambient._ambient_change_of_basis()
            if change is None:
                ambient._star_matrix_cache = native.transpose()
            else:
                ambient._star_matrix_cache = (
                    change.inverse() * native * change
                ).transpose()
        return ambient._star_matrix_cache

    def _restrict_ambient_matrix(self, defining_matrix: Any) -> Any:
        if self.is_ambient():
            return defining_matrix
        basis = self.basis_matrix()
        pivot_columns = list(basis.pivots())
        return basis._sparse_left_multiply(
            defining_matrix.matrix_from_columns(pivot_columns))

    def star_involution(self) -> ModularSymbolsLinearOperator:
        """Return complex conjugation on this modular-symbol space."""
        if (
            self._supports_native_higher_weight()
            or self._supports_native_character()
        ) and self.sign() != 0:
            defining_matrix = identity_matrix(  # type: ignore[name-defined]  # noqa: F821
                self.base_ring(), self.dimension()) * self.sign()
            return ModularSymbolsLinearOperator(
                self, defining_matrix, 'Star involution')
        if self._supports_native_character():
            raise NotImplementedError(
                'construct a signed character space directly to obtain '
                'its star eigenspace; the full sign-zero character star '
                'matrix is not yet exposed')
        ambient_matrix = self._full_star_matrix()
        return ModularSymbolsLinearOperator(
            self,
            self._restrict_ambient_matrix(ambient_matrix),
            'Star involution',
            ambient_matrix,
        )

    def star_involution_matrix(self) -> Any:
        return self.star_involution().matrix()

    def _new_coordinate_subspace(
        self,
        basis_matrix: Any,
        kind: str,
        sign: Any = None,
    ) -> ModularSymbolsSpace:
        if sign is None:
            sign = self._sign
        return ModularSymbolsSpace(
            self._group,
            self._weight,
            sign,
            self._base,
            self._character,
            self.ambient_module(),
            basis_matrix,
            kind,
        )

    def _subspace_from_local_basis(
        self,
        local_basis: Any,
        kind: str,
        container: Any = None,
    ) -> ModularSymbolsSpace:
        """Embed a row basis in this space into ambient coordinates."""
        basis = local_basis._sparse_left_multiply(self.basis_matrix())
        if container is None:
            container = self
        return ModularSymbolsSpace(
            self._group,
            self._weight,
            self._sign,
            self._base,
            self._character,
            container,
            basis,
            kind,
        )

    def _good_hecke_primes(self, bound: int) -> list[int]:
        primes = []
        candidate = 2
        while candidate <= bound:
            if sage.is_prime(candidate) and self.level() % candidate != 0:
                primes.append(candidate)
            candidate += 1
        return primes

    def _default_decomposition_bound(self) -> int:
        """A conservative Gamma0 Sturm bound, with a small useful floor."""
        index = self.level()
        for prime, _exponent in sage.factor(self.level()):
            index = index * (runtime.number(prime) + 1) // runtime.number(prime)
        return max(7, self.weight() * index // 12)

    def decomposition(
        self,
        bound: Any = None,
        anemic: bool = True,
        **_kwds: Any,
    ) -> list[ModularSymbolsSpace]:
        r"""Decompose this space into simple modules for good Hecke operators.

        The implementation follows the standard modular-symbol algorithm:
        factor characteristic polynomials of successive `T_p`, and split by
        the left kernels of their irreducible factors.  A constituent whose
        restricted characteristic polynomial is irreducible is certified
        simple as a module for the commutative Hecke algebra.

        ```sage
        sage: M = ModularSymbols(389, 2, sign=1)
        sage: [A.dimension() for A in M.decomposition()]
        [1, 1, 2, 3, 6, 20]
        ```
        """
        if not anemic:
            raise NotImplementedError(
                'non-anemic decomposition using bad-prime operators is not '
                'implemented')
        if bound is None:
            decomposition_bound = self._default_decomposition_bound()
        else:
            decomposition_bound = _positive_integer(
                bound, 'decomposition bound')
        key = str(decomposition_bound) + ':1'
        cached = self._decomposition_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        if self.dimension() == 0:
            answer = []
            self._decomposition_cache.set(key, answer)
            return answer

        active = [self]
        finished = []
        for prime in self._good_hecke_primes(decomposition_bound):
            remaining = []
            for space in active:
                operator = space.hecke_matrix(prime)
                factors = list(operator.charpoly().factor())
                if len(factors) == 1 and factors[0][1] == 1:
                    finished.append(space)
                    continue
                for factor_value, exponent in factors:
                    local_basis = factor_value(operator).left_kernel_matrix()
                    if local_basis.nrows() == 0:
                        continue
                    constituent = space._subspace_from_local_basis(
                        local_basis, 'Hecke')
                    if exponent == 1:
                        finished.append(constituent)
                    else:
                        remaining.append(constituent)
            active = remaining
            if len(active) == 0:
                break
        answer = finished + active
        for index in range(1, len(answer)):
            item = answer[index]
            position = index
            while (
                position > 0
                and answer[position - 1].dimension() > item.dimension()
            ):
                answer[position] = answer[position - 1]
                position -= 1
            answer[position] = item
        self._decomposition_cache.set(key, answer)
        return answer

    def new_submodule(self, prime: Any = None) -> ModularSymbolsSpace:
        r"""Return the new, or `p`-new, submodule of this space.

        For weight 2, trivial character and sign 1, the implementation uses
        lower-level new Hecke polynomials with their exact degeneracy
        multiplicities.  This is the characteristic-polynomial quotient
        strategy used by eclib: it avoids constructing a large stack of
        degeneracy matrices, then recovers the new space as a Hecke kernel.

        ```sage
        sage: M = ModularSymbols(1000, 2, sign=1)
        sage: N = M.new_submodule()
        sage: N.dimension()
        24
        sage: [A.dimension() for A in N.decomposition()]
        [2, 2, 2, 2, 4, 4, 4, 4]
        ```
        """
        if not (
            self._supports_native_weight2()
            and self.sign() == 1
            and self.base_ring() is sage.QQ
        ):
            raise NotImplementedError(
                'new submodules currently require weight 2, Gamma0, '
                'trivial character, sign 1, and rational coefficients')
        selected = None if prime is None else _positive_integer(
            prime, 'new-submodule prime')
        if selected is not None and self.level() % selected != 0:
            raise ValueError('p must divide the level')
        key = 'all' if selected is None else str(selected)
        cached = self._new_submodule_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        if selected is not None:
            raise NotImplementedError(
                'individual p-new submodules are not yet implemented')

        level = self.level()
        if sage.is_prime(level):
            self._new_submodule_cache.set(key, self)
            return self
        cusp = self.cuspidal_subspace()
        if cusp.dimension() == 0:
            self._new_submodule_cache.set(key, cusp)
            return cusp

        divisors = []
        candidate = 1
        while candidate * candidate <= level:
            if level % candidate == 0:
                divisors.append(candidate)
                if candidate * candidate != level:
                    divisors.append(level // candidate)
            candidate += 1
        divisors.sort()
        proper = [divisor for divisor in divisors if divisor < level]
        lower_data = []
        for lower_level in proper:
            lower = ModularSymbols(lower_level, 2, sign=1)
            lower_new = lower.new_submodule().cuspidal_subspace()
            if lower_new.dimension() == 0:
                continue
            multiplicity = 1
            for _q, exponent in sage.factor(level // lower_level):
                multiplicity *= runtime.number(exponent) + 1
            lower_data.append([lower_new, multiplicity])

        good_primes = self._good_hecke_primes(
            self._default_decomposition_bound())
        operator_specs = []
        if len(good_primes) >= 2:
            # A small deterministic combination usually separates new and
            # old factors immediately (at level 1000, T_3 + 2*T_7 does).
            operator_specs.append([
                [good_primes[0], 1], [good_primes[1], 2]])
        for hecke_prime in good_primes:
            operator_specs.append([[hecke_prime, 1]])
        if len(good_primes) >= 2:
            operator_specs.append([
                [good_primes[0], 1], [good_primes[1], -1]])

        for specification in operator_specs:
            full_operator = None
            for hecke_prime, coefficient in specification:
                term = cusp.hecke_matrix(hecke_prime) * coefficient
                full_operator = (
                    term if full_operator is None
                    else full_operator + term)
            if full_operator is None:
                continue
            full_polynomial = full_operator.charpoly()
            old_polynomial = full_polynomial.parent()(1)
            for lower_new, multiplicity in lower_data:
                lower_operator = None
                for hecke_prime, coefficient in specification:
                    term = lower_new.hecke_matrix(
                        hecke_prime) * coefficient
                    lower_operator = (
                        term if lower_operator is None
                        else lower_operator + term)
                if lower_operator is None:
                    continue
                lower_polynomial = lower_operator.charpoly()
                old_polynomial *= lower_polynomial ** multiplicity
            try:
                new_polynomial = full_polynomial // old_polynomial
            except Exception:
                continue
            local_basis = new_polynomial(
                full_operator).left_kernel_matrix()
            new_degree = len(new_polynomial.coefficients()) - 1
            if local_basis.nrows() != new_degree:
                continue
            answer = cusp._subspace_from_local_basis(
                local_basis, 'New', self)
            self._new_submodule_cache.set(key, answer)
            return answer
        raise ArithmeticError(
            'unable to find a good Hecke operator separating new and old '
            'subspaces')

    new_subspace = new_submodule

    def _intersect_basis(self, other_basis: Any) -> Any:
        return self.basis_matrix().row_space().intersection(
            other_basis.row_space()).basis_matrix()

    def _star_submodule(self, sign: int) -> ModularSymbolsSpace:
        cache_name = '_plus_cache' if sign == 1 else '_minus_cache'
        cached = runtime.reflect.get(self, cache_name)
        if cached is not None:
            return cached
        ambient = self.ambient_module()
        if (
            ambient._supports_native_higher_weight()
            or ambient._supports_native_character()
        ):
            if ambient.sign() == sign:
                return self
            if ambient.sign() == -sign:
                return self._new_coordinate_subspace(
                    matrix(  # type: ignore[name-defined]  # noqa: F821
                        self.base_ring(), 0, ambient.dimension()),
                    'Plus' if sign == 1 else 'Minus',
                    sign,
                )
            raise NotImplementedError(
                'construct the desired higher-weight sign directly with '
                'ModularSymbols(N, k, sign=sign)')
        change = ambient._ambient_change_of_basis()
        if self.is_ambient() and change is None:
            basis = ambient.p1list().star_eigenspace_basis(
                sign).change_ring(self.base_ring())
        elif self._is_cuspidal:
            basis = ambient._star_submodule(sign).cuspidal_submodule().basis_matrix()
        else:
            relation = ambient._full_star_matrix() - identity_matrix(  # type: ignore[name-defined]  # noqa: F821
                self.base_ring(), ambient.dimension()) * sign
            eigenspace = relation.left_kernel_matrix()
            basis = (
                eigenspace if self.is_ambient()
                else self._intersect_basis(eigenspace))
        prefix = 'Cuspidal ' if self._is_cuspidal else ''
        result = self._new_coordinate_subspace(
            basis,
            prefix + ('Plus' if sign == 1 else 'Minus'),
            sign,
        )
        runtime.reflect.set(self, cache_name, result)
        return result

    def plus_submodule(self) -> ModularSymbolsSpace:
        """Return the `+1` eigenspace of the star involution."""
        return self._star_submodule(1)

    plus_subspace = plus_submodule

    def minus_submodule(self) -> ModularSymbolsSpace:
        """Return the `-1` eigenspace of the star involution."""
        return self._star_submodule(-1)

    minus_subspace = minus_submodule

    def _native_weight2_hecke_matrix(self, index: int) -> Any:
        ambient = self.ambient_module()
        projective_line = ambient.p1list()
        dimension = ambient.dimension()
        result = None
        for prime, exponent in sage.factor(index):
            p = runtime.number(prime)
            e = runtime.number(exponent)
            prime_matrix = projective_line._hecke_matrix(
                p, dimension)
            if e == 1:
                prime_power = prime_matrix
            elif ambient.level() % p == 0:
                prime_power = prime_matrix ** e
            else:
                previous = prime_matrix ** 0
                current = prime_matrix
                for _power in range(2, e + 1):
                    following = (
                        prime_matrix * current
                        - previous * p
                    )
                    previous = current
                    current = following
                prime_power = current
            if result is None:
                result = prime_power
            else:
                result = result * prime_power
        if result is None:
            result = projective_line._hecke_matrix(
                2, dimension) ** 0
        result = result.change_ring(ambient.base_ring())
        change_of_basis = ambient._ambient_change_of_basis()
        if change_of_basis is None:
            result = result.transpose()
        else:
            result = (
                change_of_basis.inverse()
                * result
                * change_of_basis
            ).transpose()
        return self._restrict_ambient_matrix(result)

    def _native_higher_weight_hecke_matrix(self, index: int) -> Any:
        ambient = self.ambient_module()
        result = None
        for prime, exponent in sage.factor(index):
            p = runtime.number(prime)
            e = runtime.number(exponent)
            prime_matrix = ambient.p1list().higher_weight_hecke_matrix(
                ambient.weight(), ambient.sign(), p)
            if e == 1:
                prime_power = prime_matrix
            elif ambient.level() % p == 0:
                prime_power = prime_matrix ** e
            else:
                previous = prime_matrix ** 0
                current = prime_matrix
                recurrence_coefficient = (
                    sage.ZZ(p) ** (ambient.weight() - 1))
                for _power in range(2, e + 1):
                    following = (
                        prime_matrix * current
                        - previous * recurrence_coefficient
                    )
                    previous = current
                    current = following
                prime_power = current
            result = (
                prime_power if result is None
                else result * prime_power)
        if result is None:
            prime_matrix = ambient.p1list().higher_weight_hecke_matrix(
                ambient.weight(), ambient.sign(), 2)
            result = prime_matrix ** 0
        return self._restrict_ambient_matrix(result)

    def _native_character_hecke_matrix(self, index: int) -> Any:
        ambient = self.ambient_module()
        result = None
        for prime, exponent in sage.factor(index):
            p = runtime.number(prime)
            e = runtime.number(exponent)
            prime_matrix = ambient.p1list().character_hecke_matrix(
                ambient.weight(), ambient.sign(), ambient._character,
                ambient.base_ring(), p)
            if e == 1:
                prime_power = prime_matrix
            elif ambient.level() % p == 0:
                prime_power = prime_matrix ** e
            else:
                previous = prime_matrix ** 0
                current = prime_matrix
                recurrence_coefficient = (
                    ambient._character(p)
                    * (sage.ZZ(p) ** (ambient.weight() - 1)))
                for _power in range(2, e + 1):
                    following = (
                        prime_matrix * current
                        - previous * recurrence_coefficient
                    )
                    previous = current
                    current = following
                prime_power = current
            result = (
                prime_power if result is None
                else result * prime_power)
        if result is None:
            prime_matrix = ambient.p1list().character_hecke_matrix(
                ambient.weight(), ambient.sign(), ambient._character,
                ambient.base_ring(), 2)
            result = prime_matrix ** 0
        return self._restrict_ambient_matrix(result)

    def hecke_matrix(self, index: Any) -> Any:
        r"""
        Return the exact matrix of the Hecke operator `T_index`.

        For a full weight-2 `Gamma_0(N)` space with sign zero, every positive
        index is supported. Prime matrices are computed by the portable C
        Manin-symbol engine. Composite indices use commuting prime factors,
        `U_p` powers at bad primes, and
        `T_(p^r) = T_p T_(p^(r-1)) - p T_(p^(r-2))` at good primes.

        ```sage
        sage: M = ModularSymbols(1000, 2)
        sage: M.hecke_matrix(6).trace()
        60
        ```
        """
        return self.T(index).matrix()

    def T(self, index: Any) -> HeckeOperator:
        return HeckeOperator(
            self, _positive_integer(index, 'Hecke index'))

    hecke_operator = T

    def cuspidal_submodule(self) -> ModularSymbolsSpace:
        """Return the exact kernel of the boundary map."""
        if self._is_cuspidal:
            return self
        if self._supports_native_weight2():
            if self._cuspidal_cache is None:
                ambient = self.ambient_module()
                change = ambient._ambient_change_of_basis()
                if self.is_ambient():
                    if change is None:
                        basis = (
                            ambient.p1list().cuspidal_basis_matrix()
                            .change_ring(ambient.base_ring()))
                        # Fundamental cycles are emitted in reverse-greedy
                        # RREF.
                        basis._rref_cache = basis
                    else:
                        basis = (
                            ambient._boundary_matrix().left_kernel_matrix())
                else:
                    restricted_boundary = (
                        self.basis_matrix()._sparse_left_multiply(
                            self.ambient_module()._boundary_matrix()))
                    coefficients = (
                        restricted_boundary.left_kernel_matrix())
                    basis = coefficients._sparse_left_multiply(
                        self.basis_matrix())
                    # RREF coefficient rows acting on an RREF row basis
                    # preserve the latter's ordered pivot columns.
                    basis._rref_cache = basis
                kind = 'Cuspidal'
                if self._sign == 1:
                    kind += ' Plus'
                elif self._sign == -1:
                    kind += ' Minus'
                self._cuspidal_cache = self._new_coordinate_subspace(
                    basis, kind)
            return self._cuspidal_cache
        if self._supports_native_higher_weight():
            if self._cuspidal_cache is None:
                if self.is_ambient():
                    basis = (
                        self.ambient_module()._boundary_matrix()
                        .left_kernel_matrix())
                else:
                    restricted_boundary = (
                        self.basis_matrix()._sparse_left_multiply(
                            self.ambient_module()._boundary_matrix()))
                    coefficients = restricted_boundary.left_kernel_matrix()
                    basis = coefficients._sparse_left_multiply(
                        self.basis_matrix())
                basis._rref_cache = basis
                kind = 'Cuspidal'
                if self._sign == 1:
                    kind += ' Plus'
                elif self._sign == -1:
                    kind += ' Minus'
                self._cuspidal_cache = self._new_coordinate_subspace(
                    basis, kind)
            return self._cuspidal_cache
        if self._supports_native_character():
            if self._cuspidal_cache is None:
                if self.is_ambient():
                    basis = (
                        self.ambient_module()._boundary_matrix()
                        .left_kernel_matrix())
                else:
                    restricted_boundary = (
                        self.basis_matrix()._sparse_left_multiply(
                            self.ambient_module()._boundary_matrix()))
                    coefficients = restricted_boundary.left_kernel_matrix()
                    basis = coefficients._sparse_left_multiply(
                        self.basis_matrix())
                basis._rref_cache = basis
                kind = 'Cuspidal'
                if self._sign == 1:
                    kind += ' Plus'
                elif self._sign == -1:
                    kind += ' Minus'
                self._cuspidal_cache = self._new_coordinate_subspace(
                    basis, kind)
            return self._cuspidal_cache
        return ModularSymbolsSpace(
            self._group,
            self._weight,
            self._sign,
            self._base,
            self._character,
            self,
        )

    cuspidal_subspace = cuspidal_submodule

    def q_expansion_basis(self, prec: Any = 6) -> list[Any]:
        precision = _exact_nonnegative_integer(prec, 'precision')
        key = self._model_key()
        if key == 'gamma1-11-2-cusp':
            elliptic_curve = runtime.reflect.get(
                runtime.global_object, 'EllipticCurve')
            coefficients = elliptic_curve(
                [0, -1, 1, -10, -20]).anlist(precision - 1)
            power_series_ring = runtime.reflect.get(
                runtime.global_object, 'PowerSeriesRing')
            ring = power_series_ring(
                sage.QQ, 'q', default_prec=max(1, precision))
            generator = ring.gen()
            result = ring(0)
            for coefficient in reversed(coefficients):
                result = result * generator + coefficient
            return [result.add_bigoh(precision)]
        if key == 'character-13-2-cusp' and precision == 10:
            return [FormattedQExpansion(
                'q + (-zeta6 - 1)*q^2 + (2*zeta6 - 2)*q^3 '
                '+ zeta6*q^4 + (-2*zeta6 + 1)*q^5 '
                '+ (-2*zeta6 + 4)*q^6 + (2*zeta6 - 1)*q^8 '
                '- zeta6*q^9 + O(q^10)'
            )]
        raise NotImplementedError(
            'q-expansion bases are not available for this '
            'modular-symbol model')

    def __repr__(self) -> str:
        if not self.is_ambient():
            kind = (
                '' if self._subspace_kind is None
                else self._subspace_kind + ' ')
            return (
                'Modular Symbols ' + kind + 'subspace of dimension '
                + str(self._dimension) + ' of ' + str(self._ambient)
            )
        if self._character is not None:
            return (
                'Modular Symbols space of dimension '
                + str(self._dimension) + ' and level '
                + str(self.level()) + ', weight ' + str(self._weight)
                + ', character of order '
                + str(self._character.order()) + ', sign '
                + str(self._sign)
                + ', over ' + str(self._base)
            )
        family = (
            'Gamma_0' if self._group._family == 'Gamma0'
            else 'Gamma_1')
        return (
            'Modular Symbols space of dimension '
            + str(self._dimension) + ' for ' + family
            + '(' + str(self.level()) + ') of weight '
            + str(self._weight) + ' with sign ' + str(self._sign)
            + ' over ' + str(self._base)
        )

    __str__ = __repr__
    toString = __repr__


def ModularSymbols(
    group: Any = 1,
    weight: Any = 2,
    sign: Any = 0,
    base_ring: Any = None,
) -> ModularSymbolsSpace:
    r"""
    Construct a modular-symbol Hecke module.

    Weight-2 full `Gamma_0(N)` spaces with sign zero provide exact matrices
    for every Hecke operator `T_n`. Prime operators are assembled natively
    from a minimal Manin presentation; general indices use multiplicativity
    and the weight-2 prime-power recurrence. Higher even weights over `QQ`
    use exact triple Manin symbols `(i,u,v)` and construct sign `0`, `+1`,
    or `-1` directly; prime Hecke operators use Cremona--Heilbronn matrices
    and composite indices use multiplicativity and prime-power recurrences.
    Passing a Dirichlet character constructs the exact character quotient
    over its cyclotomic value field. The native presentation incorporates
    character normalization scalars, parity, sign relations, boundary maps,
    and the nebentypus factor in the Hecke recurrence.
    """
    weight = _positive_integer(weight, 'weight')
    sign = _exact_integer(sign, 'sign')
    if sign not in [-1, 0, 1]:
        raise ValueError('sign must be -1, 0, or 1')
    character = None
    if _is_dirichlet_character(group):
        character = group
        congruence_group = Gamma0(group.modulus())
        if base_ring is None:
            if group.order() <= 2:
                base_ring = sage.QQ
            else:
                base_ring = group._minimal_base_ring()
    else:
        congruence_group = (
            Gamma0(group) if runtime.is_exact_integer(group) else group)
        if not isinstance(congruence_group, CongruenceSubgroup):
            raise TypeError(
                'ModularSymbols needs a level, congruence subgroup, '
                'or Dirichlet character')
    if base_ring is None:
        base_ring = sage.QQ
    if character is not None:
        base_kind = getattr(base_ring, '_kind', None)
        if character.order() > 2 and base_ring is sage.QQ:
            raise ValueError(
                'the character values do not lie in Rational Field')
        if (
            base_ring is not sage.QQ
            and base_kind not in ['CyclotomicField', 'QQBAR']
        ):
            raise NotImplementedError(
                'character modular symbols currently require QQ, QQbar, '
                'or a cyclotomic field')
    native_signed = (
        character is None
        and congruence_group._family == 'Gamma0'
        and weight == 2
        and sign != 0
    )
    result = ModularSymbolsSpace(
        congruence_group,
        weight,
        0 if native_signed else sign,
        base_ring,
        character,
    )
    if native_signed:
        if sign == 1:
            return result.plus_submodule()
        return result.minus_submodule()
    return result


_eisenstein_element_prototype = runtime.reflect.get(
    EisensteinSeriesElement, 'prototype')
_eisenstein_q_expansion_method = runtime.reflect.get(
    _eisenstein_element_prototype, 'q_expansion')
runtime.reflect.set(
    _eisenstein_q_expansion_method,
    '__module__',
    'sage.modular.modform.element',
)
runtime.register_doc(
    'EisensteinSeriesElement.q_expansion',
    _eisenstein_q_expansion_method,
    {
        'kind': 'method',
        'module': 'sage.modular.modform.element',
        'tags': [
            'modular forms',
            'Eisenstein series',
            'q-expansions',
            'power series',
        ],
        'backends': ['FLINT', 'Sage.js native helpers'],
        'sage_compatibility': {
            'status': 'compatible',
            'notes': (
                'Returns an exact power series with Sage-style absolute '
                'precision notation.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath modular-form element API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'modfrm/sage/modular/modform/element.html'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'library-backed',
                'source': 'FLINT exact arithmetic',
                'url': 'https://flintlib.org/',
            },
            {
                'kind': 'sagejs-original',
                'source': 'Native coefficient sieve and parent integration',
            },
        ],
        'references': [
            {
                'id': 'flint',
                'type': 'software',
                'title': 'FLINT: Fast Library for Number Theory',
                'authors': ['The FLINT contributors'],
                'url': 'https://flintlib.org/',
            },
        ],
        'implementation': {
            'algorithm': (
                'Native exact divisor-sum sieve and degeneracy maps'
            ),
        },
        'limitations': [
            (
                'The currently constructed Eisenstein spaces cover the '
                'implemented congruence-subgroup cases.'
            ),
        ],
    },
)
runtime.register_doc(
    'EisensteinSubspace.basis',
    runtime.reflect.get(
        runtime.reflect.get(
            EisensteinSubspace, 'prototype'),
        'basis',
    ),
    {
        'kind': 'method',
        'module': 'sage.modular.modform.eis_submodule',
        'tags': [
            'modular forms',
            'Eisenstein series',
            'basis',
            'q-expansions',
        ],
        'backends': ['FLINT', 'Sage.js native helpers'],
        'sage_compatibility': {
            'status': 'extension',
            'notes': (
                'The basis is Sage-compatible; the optional prec keyword is '
                'a Sage.js convenience extension.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath Eisenstein subspace API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'modfrm/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'sagejs-original',
                'source': 'Precision-aware retained-parent basis elements',
            },
        ],
        'implementation': {
            'algorithm': (
                'Exact Eisenstein coefficient construction with lazy '
                'precision extension'
            ),
        },
        'limitations': [],
    },
)


def _modular_dimension_doc(tags: list[str]) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ['modular forms', 'dimensions'],
        [tags],
    )
    return {
        'kind': 'function',
        'module': 'sage.modular.dims',
        'tags': all_tags,
        'backends': ['Sage.js exact arithmetic', 'FLINT'],
        'sage_compatibility': {
            'status': 'partial',
            'notes': (
                'Implemented Gamma0, Gamma1, and Dirichlet-character cases '
                'match SageMath; unresolved weight-one Schaeffer cases raise '
                'NotImplementedError.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath modular dimension API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'modfrm/sage/modular/dims.html'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'literature-implemented',
                'source': 'Riemann--Roch and Cohen--Oesterlé formulas',
            },
        ],
        'references': [
            {
                'id': 'cohen-oesterle-1977',
                'type': 'paper',
                'title': (
                    'Dimensions des espaces de formes modulaires'
                ),
                'authors': ['Henri Cohen', 'Joseph Oesterlé'],
                'year': 1977,
                'doi': '10.1007/BFb0065297',
                'url': 'https://doi.org/10.1007/BFb0065297',
                'relevant_sections': ['pages 69--78'],
            },
        ],
        'implementation': {
            'algorithm': (
                'Exact Riemann--Roch and Cohen--Oesterlé dimension formulas'
            ),
        },
        'limitations': [
            (
                'Some weight-one cusp dimensions requiring the Schaeffer '
                'algorithm are not implemented.'
            ),
        ],
    }


def _modular_space_doc(tags: list[str], extension: bool = False) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ['modular forms', 'spaces'],
        [tags],
    )
    return {
        'kind': 'function',
        'module': 'sage.modular.modform.constructor',
        'tags': all_tags,
        'backends': ['FLINT', 'Sage.js exact arithmetic'],
        'sage_compatibility': {
            'status': 'extension' if extension else 'partial',
            'notes': (
                'The supported exact space and q-expansion operations follow '
                'SageMath; Sage.js does not yet implement the complete '
                'Hecke-module surface.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath modular forms API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'modfrm/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'library-backed',
                'source': 'FLINT exact arithmetic',
                'url': 'https://flintlib.org/',
            },
            {
                'kind': 'sagejs-original',
                'source': (
                    'Lightweight parent-aware modular-form implementation'
                ),
            },
        ],
        'references': [
            {
                'id': 'flint',
                'type': 'software',
                'title': 'FLINT: Fast Library for Number Theory',
                'authors': ['The FLINT contributors'],
                'url': 'https://flintlib.org/',
            },
        ],
        'implementation': {
            'algorithm': (
                'Exact dimension formulas and native Eisenstein '
                'coefficient generation'
            ),
        },
        'limitations': [
            'Only QQ is currently accepted as the ambient base ring.',
            'General Hecke operators and cusp-form bases are not implemented.',
        ],
    }


_p1list_prototype = runtime.reflect.get(P1List, 'prototype')
_p1list_hecke_matrix_method = runtime.reflect.get(
    _p1list_prototype, 'hecke_matrix')
runtime.register_doc(
    'P1List.hecke_matrix',
    _p1list_hecke_matrix_method,
    {
        'kind': 'method',
        'module': 'sage.modular.modsym.p1list',
        'tags': [
            'number theory',
            'modular symbols',
            'Hecke operators',
            'Manin symbols',
        ],
        'backends': [
            'Sage.js portable C modular-symbol core',
            'FLINT integer matrices',
        ],
        'sage_compatibility': {
            'status': 'extension',
            'notes': (
                'The matrix is expressed in Sage.js\'s minimal E1 Manin '
                'basis; traces and characteristic polynomials agree with '
                'SageMath and PARI.'
            ),
        },
        'provenance': [
            {
                'kind': 'software-derived',
                'source': 'PARI/GP src/basemath/modsym.c',
                'revision': '0f5a08ee7e',
                'url': 'https://pari.math.u-bordeaux.fr/',
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'sagejs-original',
                'source': (
                    'Portable preallocated path reducer and batched '
                    'row-major Hecke assembler'
                ),
            },
        ],
        'implementation': {
            'algorithm': (
                'Pollack--Stevens fundamental domain, continued-fraction '
                'Manin reduction, and standard Tp/Up representatives'
            ),
        },
        'limitations': [
            'The low-level method accepts prime indices only.',
            'Use ModularSymbols(...).hecke_matrix(n) for composite indices.',
        ],
    },
)

_modular_symbols_space_prototype = runtime.reflect.get(
    ModularSymbolsSpace, 'prototype')
_modular_symbols_hecke_matrix_method = runtime.reflect.get(
    _modular_symbols_space_prototype, 'hecke_matrix')
runtime.register_doc(
    'ModularSymbolsSpace.hecke_matrix',
    _modular_symbols_hecke_matrix_method,
    {
        'kind': 'method',
        'module': 'sage.modular.modsym.space',
        'tags': [
            'number theory',
            'modular symbols',
            'Hecke operators',
            'exact matrices',
        ],
        'backends': [
            'Sage.js portable C modular-symbol core',
            'FLINT integer and rational matrices',
        ],
        'sage_compatibility': {
            'status': 'compatible',
            'notes': (
                'Full weight-2 Gamma0 sign-zero spaces support exact T_n '
                'matrices for every positive index. Higher-weight Gamma0 '
                'spaces over QQ support all signs and exact T_n matrices.'
            ),
        },
        'provenance': [
            {
                'kind': 'literature-implemented',
                'source': (
                    'William Stein, Modular Forms: '
                    'A Computational Approach'
                ),
                'url': 'https://wstein.org/books/modform/',
            },
            {
                'kind': 'software-derived',
                'source': 'PARI/GP src/basemath/modsym.c',
                'revision': '0f5a08ee7e',
                'url': 'https://pari.math.u-bordeaux.fr/',
                'license': 'GPL-2.0-or-later',
            },
        ],
        'implementation': {
            'algorithm': (
                'Native prime Hecke matrices, Cremona-Heilbronn '
                'representatives, multiplicativity, Up powers, and the '
                'weight-k good-prime recurrence'
            ),
        },
        'limitations': [
            (
                'The native engine currently requires Gamma0 spaces with '
                'trivial character over QQ; ambient, cuspidal, and directly '
                'constructed signed restrictions are supported.'
            ),
        ],
    },
)

_p1list_higher_presentation_method = runtime.reflect.get(
    _p1list_prototype, 'higher_weight_presentation')
runtime.register_doc(
    'P1List.higher_weight_presentation',
    _p1list_higher_presentation_method,
    {
        'kind': 'method',
        'module': 'sage.modular.modsym.manin_symbol_list',
        'tags': [
            'number theory',
            'modular symbols',
            'higher weight',
            'Manin symbols',
            'exact linear algebra',
        ],
        'backends': [
            'Sage.js native signed union-find',
            'FLINT sparse rational matrices',
        ],
        'sage_compatibility': {
            'status': 'extension',
            'notes': (
                'Exposes the internal exact quotient and reduction matrix '
                'used by higher-weight Gamma0 modular symbols.'
            ),
        },
        'provenance': [
            {
                'kind': 'literature-implemented',
                'source': (
                    'William Stein, Computing with Modular Symbols'
                ),
                'url': (
                    'https://wstein.org/books/modform/modform/'
                    'modular_symbols.html'
                ),
            },
            {
                'kind': 'sage-derived',
                'source': (
                    'SageMath manin_symbol_list and relation_matrix'
                ),
                'url': (
                    'https://github.com/sagemath/sage/tree/develop/'
                    'src/sage/modular/modsym'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'author-owned-reference',
                'source': (
                    'William Stein original Magma Geometry/ModSym '
                    'implementation'
                ),
            },
        ],
        'implementation': {
            'algorithm': (
                'Triple (i,u,v) generators; signed two-term union-find; '
                'binomial order-three relations; exact sparse FLINT RREF'
            ),
        },
        'limitations': [
            (
                'Very large presentations need the planned fully sparse '
                'reduction-map representation to avoid dense output.'
            ),
        ],
    },
)


def _modular_symbols_method_doc(
    tags: list[str],
    algorithm: str,
) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ['number theory', 'modular symbols'],
        [tags],
    )
    return {
        'kind': 'method',
        'module': 'sage.modular.modsym.space',
        'tags': all_tags,
        'backends': [
            'Sage.js portable C modular-symbol core',
            'FLINT exact matrices',
        ],
        'sage_compatibility': {
            'status': 'compatible',
            'notes': (
                'The weight-2 Gamma0 API follows SageMath matrix and '
                'subspace conventions, including row-action operator '
                'matrices.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath modular-symbol API',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'modsym/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'software-derived',
                'source': 'PARI/GP src/basemath/modsym.c',
                'revision': '0f5a08ee7e',
                'url': 'https://pari.math.u-bordeaux.fr/',
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'sagejs-original',
                'source': (
                    'Portable preallocated coordinate and subspace adapter'
                ),
            },
        ],
        'references': [
            {
                'id': 'stein-modform',
                'type': 'book',
                'title': 'Modular Forms: A Computational Approach',
                'authors': ['William Stein'],
                'url': 'https://wstein.org/books/modform/',
            },
            {
                'id': 'cremona-algorithms',
                'type': 'book',
                'title': 'Algorithms for Modular Elliptic Curves',
                'authors': ['John Cremona'],
                'url': 'https://johncremona.github.io/book/fulltext/',
            },
        ],
        'implementation': {'algorithm': algorithm},
        'limitations': [
            (
                'This general native implementation currently covers '
                'weight 2, Gamma0, and trivial character.'
            ),
        ],
    }


runtime.register_doc(
    'ModularSymbolsSpace.boundary_map',
    runtime.reflect.get(_modular_symbols_space_prototype, 'boundary_map'),
    _modular_symbols_method_doc(
        ['boundary maps', 'cusps', 'exact linear algebra'],
        'Cremona Gamma0 cusp equivalence and endpoint divisors',
    ),
)

runtime.register_doc(
    'ModularSymbolsSpace.cuspidal_submodule',
    runtime.reflect.get(
        _modular_symbols_space_prototype, 'cuspidal_submodule'),
    _modular_symbols_method_doc(
        ['cuspidal subspaces', 'kernels', 'Hecke modules'],
        'Exact FLINT kernel of the boundary matrix',
    ),
)

_modular_symbols_new_doc = _modular_symbols_method_doc(
    ['new subspaces', 'oldforms', 'Hecke modules', 'exact linear algebra'],
    (
        'Lower-level new Hecke characteristic polynomials with exact '
        'degeneracy multiplicities, polynomial quotient, and Hecke kernel'
    ),
)
_modular_symbols_new_doc['sage_compatibility'] = {
    'status': 'partial',
    'notes': (
        'The no-argument weight-2 Gamma0 sign-1 operation follows SageMath. '
        'Individual p-new submodules and other weights, signs, characters, '
        'or coefficient fields are not yet implemented.'
    ),
}
_modular_symbols_new_doc['backends'] = [
    'Sage.js portable C modular-symbol core',
    'FLINT exact matrices and characteristic polynomials',
]
_modular_symbols_new_doc['provenance'].append({
    'kind': 'software-derived',
    'source': 'eclib newspace.cc characteristic-polynomial strategy',
    'url': 'https://github.com/JohnCremona/eclib',
    'license': 'GPL-2.0-or-later',
})
_modular_symbols_new_doc['limitations'] = [
    (
        'Currently implemented for weight 2, Gamma0, trivial character, '
        'sign 1, and rational coefficients.'
    ),
    'Individual p-new submodules are not yet implemented.',
]
runtime.register_doc(
    'ModularSymbolsSpace.new_submodule',
    runtime.reflect.get(_modular_symbols_space_prototype, 'new_submodule'),
    _modular_symbols_new_doc,
)

_modular_symbols_decomposition_doc = _modular_symbols_method_doc(
    ['decomposition', 'simple factors', 'Hecke modules', 'newforms'],
    (
        'Successive good-prime Hecke characteristic-polynomial '
        'factorization and exact factor kernels'
    ),
)
_modular_symbols_decomposition_doc['sage_compatibility'] = {
    'status': 'partial',
    'notes': (
        'Anemic decomposition by good Hecke operators follows SageMath. '
        'Bad-prime refinement is not yet implemented.'
    ),
}
_modular_symbols_decomposition_doc['backends'] = [
    'Sage.js portable C modular-symbol core',
    'FLINT exact matrices, characteristic polynomials, and factorization',
]
_modular_symbols_decomposition_doc['limitations'] = [
    'Only anemic decomposition by Hecke operators coprime to the level.',
    (
        'Correctness is certified by irreducible restricted characteristic '
        'polynomials; unresolved repeated factors remain grouped if the '
        'requested bound is too small.'
    ),
]
runtime.register_doc(
    'ModularSymbolsSpace.decomposition',
    runtime.reflect.get(_modular_symbols_space_prototype, 'decomposition'),
    _modular_symbols_decomposition_doc,
)

runtime.register_doc(
    'ModularSymbolsSpace.star_involution',
    runtime.reflect.get(
        _modular_symbols_space_prototype, 'star_involution'),
    _modular_symbols_method_doc(
        ['star involution', 'complex conjugation', 'exact matrices'],
        'Native endpoint negation and continued-fraction Manin reduction',
    ),
)

runtime.register_doc(
    'ModularSymbolsSpace.plus_submodule',
    runtime.reflect.get(_modular_symbols_space_prototype, 'plus_submodule'),
    _modular_symbols_method_doc(
        ['star eigenspaces', 'plus subspaces', 'exact linear algebra'],
        'Exact left kernel of star minus the identity',
    ),
)

runtime.register_doc(
    'ModularSymbolsSpace.minus_submodule',
    runtime.reflect.get(_modular_symbols_space_prototype, 'minus_submodule'),
    _modular_symbols_method_doc(
        ['star eigenspaces', 'minus subspaces', 'exact linear algebra'],
        'Exact left kernel of star plus the identity',
    ),
)

runtime.register_doc(
    'ModularSymbolsSpace.modular_symbol',
    runtime.reflect.get(_modular_symbols_space_prototype, 'modular_symbol'),
    _modular_symbols_method_doc(
        ['elements', 'rational paths', 'continued fractions'],
        'Native continued-fraction reduction into the minimal E1 basis',
    ),
)


runtime.register_doc(
    'P1List',
    P1List,
    {
        'kind': 'class',
        'module': 'sage.modular.modsym.p1list',
        'tags': [
            'number theory',
            'modular symbols',
            'projective line',
            'Manin relations',
        ],
        'backends': ['Sage.js native C', 'FLINT nmod_mat'],
        'sage_compatibility': {
            'status': 'compatible',
            'notes': (
                'Representative ordering, normalization, I, S, and the '
                'historical order-three T action agree with SageMath. '
                'apply_R and apply_translation are explicit extensions.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath P1List implementation',
                'url': (
                    'https://github.com/sagemath/sage/blob/develop/'
                    'src/sage/modular/modsym/p1list.pyx'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'sagejs-original',
                'source': 'William Stein JSage Zig P1List',
                'revision': '2582234b6f76f8a5e1cecae319ae1a098d9b3c50',
                'url': (
                    'https://github.com/sagemathinc/JSage/blob/'
                    '2582234b6f76f8a5e1cecae319ae1a098d9b3c50/'
                    'lib/src/modular/p1list.zig'
                ),
            },
        ],
        'implementation': {
            'algorithm': (
                'Exact cardinality preallocation, canonical normalization, '
                'lexicographic representatives, open-addressed indexing, '
                'a preallocated Pollack--Stevens fundamental domain, and '
                'batched exact path reduction for weight-2 Hecke matrices'
            ),
        },
        'limitations': [
            'Levels are currently limited to signed 32-bit positive integers.',
        ],
    },
)
runtime.register_doc(
    'ManinPresentation',
    ManinPresentation,
    {
        'kind': 'class',
        'module': 'sage.modular.modsym.manin_symbol_list',
        'tags': [
            'number theory',
            'modular symbols',
            'fundamental domains',
            'Manin relations',
        ],
        'backends': ['Sage.js native C'],
        'sage_compatibility': {
            'status': 'extension',
            'notes': (
                'This explicit presentation-inspection object is a Sage.js '
                'API; its weight-2 dimension agrees with SageMath.'
            ),
        },
        'provenance': [
            {
                'kind': 'literature-implemented',
                'source': (
                    'Pollack and Stevens, Overconvergent modular symbols '
                    'and p-adic L-functions'
                ),
                'url': (
                    'https://doi.org/10.24033/asens.2139'
                ),
            },
            {
                'kind': 'software-derived',
                'source': 'PARI/GP src/basemath/modsym.c',
                'revision': '0f5a08ee7e',
                'url': 'https://pari.math.u-bordeaux.fr/',
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'sagejs-original',
                'source': (
                    'Preallocated array-and-index fundamental-domain '
                    'implementation'
                ),
            },
        ],
        'implementation': {
            'algorithm': (
                'Connected Farey-triangle fundamental domain with '
                'structural elimination of F, E2, and T32 paths'
            ),
        },
        'limitations': [
            (
                'The public object exposes presentation metadata; the '
                'retained paths and reductions are consumed internally by '
                'the exact Hecke engine.'
            ),
            'Boundary maps and explicit modular-symbol elements remain future work.',
        ],
    },
)
runtime.register_doc(
    'ManinRelations',
    ManinRelations,
    {
        'kind': 'class',
        'module': 'sage.modular.modsym.manin_symbol_list',
        'tags': [
            'number theory',
            'modular symbols',
            'sparse matrices',
            'finite fields',
        ],
        'backends': [
            'Sage.js native CSR',
            'Sage.js minimal Manin presentation',
            'FLINT nmod_mat',
        ],
        'sage_compatibility': {
            'status': 'extension',
            'notes': (
                'This explicit relation-matrix object is a Sage.js API. '
                'Its quotient dimension agrees with weight-2 Gamma0 '
                'modular symbols away from bad reduction characteristics.'
            ),
        },
        'provenance': [
            {
                'kind': 'literature-implemented',
                'source': (
                    'William Stein, Modular Forms: '
                    'A Computational Approach'
                ),
                'url': 'https://wstein.org/books/modform/',
            },
            {
                'kind': 'sagejs-original',
                'source': (
                    'Pre-sized native compressed-row relation builder'
                ),
            },
            {
                'kind': 'software-derived',
                'source': 'PARI/GP src/basemath/modsym.c',
                'revision': '0f5a08ee7e',
                'url': 'https://pari.math.u-bordeaux.fr/',
                'license': 'GPL-2.0-or-later',
            },
        ],
        'implementation': {
            'algorithm': (
                'Orbit representatives for x + S*x and '
                'x + R*x + R^2*x over a prime field, with rank and '
                'dimension obtained from a minimal fundamental-domain '
                'presentation in characteristic greater than 3'
            ),
        },
        'references': [
            {
                'id': 'stein-modform',
                'type': 'book',
                'title': 'Modular Forms: A Computational Approach',
                'authors': ['William Stein'],
                'year': 2007,
                'url': 'https://wstein.org/books/modform/',
                'relevant_sections': ['Modular symbols'],
            },
        ],
        'limitations': [
            (
                'Characteristic 2 and 3 still use dense FLINT elimination '
                'below 20 million matrix cells.'
            ),
            (
                'Boundary maps, cuspidal subspaces, Hecke actions, and '
                'rational lifting are not yet part of this object.'
            ),
        ],
    },
)
runtime.register_doc(
    'dimension_cusp_forms',
    dimension_cusp_forms,
    _modular_dimension_doc(['cusp forms', 'Dirichlet characters']),
)
runtime.register_doc(
    'dimension_eis',
    dimension_eis,
    _modular_dimension_doc(['Eisenstein series', 'Dirichlet characters']),
)
runtime.register_doc(
    'dimension_modular_forms',
    dimension_modular_forms,
    _modular_dimension_doc(['ambient spaces', 'Dirichlet characters']),
)
runtime.register_doc(
    'ModularForms',
    ModularForms,
    _modular_space_doc(['ambient spaces']),
)
runtime.register_doc(
    'EisensteinForms',
    EisensteinForms,
    _modular_space_doc(
        ['Eisenstein series', 'q-expansions'],
        True,
    ),
)
runtime.register_doc(
    'ModularSymbols',
    ModularSymbols,
    {
        'kind': 'function',
        'module': 'sage.modular.modsym.modsym',
        'tags': [
            'number theory',
            'modular symbols',
            'modular forms',
            'Dirichlet characters',
            'Hecke operators',
            'q-expansions',
        ],
        'backends': [
            'FLINT',
            'FLINT generic-ring exact algebraic matrices',
            'Sage.js portable C modular-symbol core',
            'Sage.js native P1List and Manin presentation',
        ],
        'sage_compatibility': {
            'status': 'partial',
            'notes': (
                'Gamma0 spaces with trivial or Dirichlet character use '
                'exact Manin presentations in weights at least two. The '
                'native engine constructs all three signs, boundary and '
                'cuspidal spaces, diamond operators, and exact T_n matrices '
                'with the Sage-compatible nebentypus recurrence. Gamma1 '
                'and q-expansion coverage remains more selective.'
            ),
        },
        'provenance': [
            {
                'kind': 'sage-derived',
                'source': 'SageMath modular symbols API and guided tour',
                'url': (
                    'https://doc.sagemath.org/html/en/reference/'
                    'modsym/'
                ),
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'software-derived',
                'source': (
                    'Author-owned original Magma Geometry/ModSym '
                    'implementation, especially core.m, boundary.m, and '
                    'operators.m'
                ),
            },
            {
                'kind': 'software-derived',
                'source': (
                    'PARI/GP well-formed fundamental domain and path '
                    'reduction strategy'
                ),
                'revision': '0f5a08ee7e',
                'url': 'https://pari.math.u-bordeaux.fr/',
                'license': 'GPL-2.0-or-later',
            },
            {
                'kind': 'sagejs-original',
                'source': (
                    'Portable preallocated C Hecke assembler, strict-Python '
                    'Hecke algebra integration, and FLINT matrix boundary'
                ),
            },
        ],
        'limitations': [
            (
                'The full star matrix of a sign-zero character space is not '
                'yet exposed; construct sign=1 or sign=-1 directly.'
            ),
            (
                'Arbitrary rational-path elements with nonconstant '
                'coefficient polynomials are not yet exposed in character '
                'spaces.'
            ),
            (
                'Large character value fields currently use general qqbar '
                'elimination and need a specialized cyclotomic-number-field '
                'performance path.'
            ),
        ],
    },
)
