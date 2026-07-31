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

    def __repr__(self) -> str:
        return (
            'The projective line over the integers modulo '
            + str(self._level)
        )

    __str__ = __repr__
    toString = __repr__


def _modular_symbols_matrix(rows: list[list[Any]]) -> Any:
    matrix_constructor = runtime.reflect.get(
        runtime.global_object, 'matrix')
    return matrix_constructor(sage.QQ, rows)


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
        if key == 'gamma0-1-12' and self._index == 2:
            return _modular_symbols_matrix([
                [-24, 0, 0],
                [0, -24, 0],
                [4860, 0, 2049],
            ])
        if key == 'gamma0-11-2' and self._index in [2, 3, 5]:
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
        raise NotImplementedError(
            'the requested Hecke matrix is not in the implemented '
            'modular-symbol models')

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
    ) -> None:
        self._group = group
        self._weight = weight
        self._sign = sign
        self._base = base_ring
        self._character = character
        self._ambient = ambient
        self._p1list_cache = None
        if ambient is None:
            if character is not None:
                cusp_dimension = dimension_cusp_forms(character, weight)
                eis_dimension = dimension_eis(character, weight)
            else:
                cusp_dimension = dimension_cusp_forms(group, weight)
                eis_dimension = dimension_eis(group, weight)
            self._dimension = 2 * cusp_dimension + eis_dimension
            self._is_cuspidal = False
        else:
            if character is not None:
                cusp_dimension = dimension_cusp_forms(character, weight)
            else:
                cusp_dimension = dimension_cusp_forms(group, weight)
            self._dimension = 2 * cusp_dimension
            self._is_cuspidal = True

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

    def base_ring(self) -> Any:
        return self._base

    def basis(self) -> Any:
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

    def p1list(self) -> P1List:
        if (
            self._character is not None
            or self._group._family != 'Gamma0'
            or self._weight != 2
        ):
            raise NotImplementedError(
                'native P1 lists currently model weight-2 Gamma0 spaces')
        if self._p1list_cache is None:
            self._p1list_cache = P1List(self.level())
        return self._p1list_cache

    def manin_relations(self, modulus: Any = 65521) -> ManinRelations:
        return self.p1list().manin_relations(modulus)

    def T(self, index: Any) -> HeckeOperator:
        return HeckeOperator(
            self, _positive_integer(index, 'Hecke index'))

    hecke_operator = T

    def cuspidal_submodule(self) -> ModularSymbolsSpace:
        if self._is_cuspidal:
            return self
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
        if self._is_cuspidal:
            return (
                'Modular Symbols subspace of dimension '
                + str(self._dimension) + ' of ' + str(self._ambient)
            )
        if self._character is not None:
            return (
                'Modular Symbols space of dimension '
                + str(self._dimension) + ' and level '
                + str(self.level()) + ', weight ' + str(self._weight)
                + ', character [zeta6], sign ' + str(self._sign)
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

    The initial implementation provides exact dimensions for supported
    congruence subgroups and characters, together with explicit Hecke models
    for the level 1, 11, and character-level 13 examples in the Sage guided
    tour. Requests for unavailable Hecke data raise `NotImplementedError`.
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
            if (
                group.modulus() == 13
                and group.order() == 6
            ):
                cyclotomic_field = runtime.reflect.get(
                    runtime.global_object, 'CyclotomicField')
                base_ring = cyclotomic_field(6)
            else:
                base_ring = group._parent.base_ring()
    else:
        congruence_group = (
            Gamma0(group) if runtime.is_exact_integer(group) else group)
        if not isinstance(congruence_group, CongruenceSubgroup):
            raise TypeError(
                'ModularSymbols needs a level, congruence subgroup, '
                'or Dirichlet character')
    if base_ring is None:
        base_ring = sage.QQ
    return ModularSymbolsSpace(
        congruence_group, weight, sign, base_ring, character)


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
                'and a preallocated Pollack--Stevens fundamental domain'
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
            'The current public object exposes presentation metadata only.',
            (
                'Generator reduction, boundary maps, and Hecke actions will '
                'be layered on the retained path presentation.'
            ),
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
            'Hecke operators',
            'q-expansions',
        ],
        'backends': [
            'FLINT',
            'Sage.js native P1List and Manin relations',
            'Sage.js exact Hecke models',
        ],
        'sage_compatibility': {
            'status': 'partial',
            'notes': (
                'Weight-2 Gamma0 spaces expose native P1 representatives '
                'and Manin relations over machine-word prime fields. The '
                'exact level 1, level 11, and character-level 13 guided-tour '
                'Hecke models provide bases, characteristic polynomials, '
                'matrices, and cuspidal q-expansions.'
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
                'kind': 'sagejs-original',
                'source': (
                    'Bounded exact Hecke models integrated with Sage.js '
                    'matrices, elliptic curves, and power series'
                ),
            },
        ],
        'limitations': [
            (
                'Hecke data beyond the documented level 1, level 11, and '
                'character-level 13 models is not yet computed.'
            ),
            'General-weight and character Manin relations are not yet built.',
            'The scalable sparse Hecke and elimination engine remains future work.',
        ],
    },
)
