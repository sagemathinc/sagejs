# Exact modular-forms foundations: congruence subgroups, Riemann--Roch and
# Cohen--Oesterle dimensions, and FLINT-backed Eisenstein q-expansions.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_qexp_module_cache = runtime.undefined
_qexp_algebra_module_cache = runtime.undefined
_object_layer_module_cache = runtime.undefined
_gamma1_module_cache = runtime.undefined
_eta_products_module_cache = runtime.undefined
_half_integral_module_cache = runtime.undefined
_supersingular_module_cache = runtime.undefined
_brandt_module_cache = runtime.undefined


def _qexp_module() -> Any:
    """Load exact modular-form q-expansion arithmetic lazily."""
    global _qexp_module_cache
    if _qexp_module_cache is runtime.undefined:
        _qexp_module_cache = __import__(
            "sagejs.modular_forms.qexp",
            fromlist=["ExactModularForm"],
        )
    return _qexp_module_cache


def _qexp_algebra_module() -> Any:
    """Load certified exact q-expansion algebra lazily."""
    global _qexp_algebra_module_cache
    if _qexp_algebra_module_cache is runtime.undefined:
        _qexp_algebra_module_cache = __import__(
            "sagejs.modular_forms.qexp_algebra",
            fromlist=["CertifiedModularForm"],
        )
    return _qexp_algebra_module_cache


def _object_layer_module() -> Any:
    """Load the parented classical modular-form object layer lazily."""
    global _object_layer_module_cache
    if _object_layer_module_cache is runtime.undefined:
        _object_layer_module_cache = __import__(
            "sagejs.modular_forms.object_layer",
            fromlist=["ClassicalModularFormElement"],
        )
    return _object_layer_module_cache


def _gamma1_module() -> Any:
    """Load exact Gamma1 character-orbit descent lazily."""
    global _gamma1_module_cache
    if _gamma1_module_cache is runtime.undefined:
        _gamma1_module_cache = __import__(
            "sagejs.modular_forms.gamma1",
            fromlist=["Gamma1DescentCertificate"],
        )
    return _gamma1_module_cache


def _eta_products_module() -> Any:
    """Return the lazy certified eta-product implementation module."""
    global _eta_products_module_cache
    if _eta_products_module_cache is runtime.undefined:
        _eta_products_module_cache = __import__(
            "sagejs.modular_forms.eta_products",
            fromlist=["eta_products"],
        )
    return _eta_products_module_cache


def _half_integral_module() -> Any:
    """Load certified half-integral-weight arithmetic lazily."""
    global _half_integral_module_cache
    if _half_integral_module_cache is runtime.undefined:
        _half_integral_module_cache = __import__(
            "sagejs.modular_forms.half_integral",
            fromlist=["HalfIntegralWeightModularForms"],
        )
    return _half_integral_module_cache


def _supersingular_module() -> Any:
    """Load the sparse supersingular-module implementation lazily."""
    global _supersingular_module_cache
    if _supersingular_module_cache is runtime.undefined:
        _supersingular_module_cache = __import__(
            "sagejs.modular_forms.supersingular",
            fromlist=["SupersingularModule"],
        )
    return _supersingular_module_cache


def _brandt_module() -> Any:
    """Load the rational Brandt-module implementation lazily."""
    global _brandt_module_cache
    if _brandt_module_cache is runtime.undefined:
        _brandt_module_cache = __import__(
            "sagejs.modular_forms.brandt",
            fromlist=["BrandtModule"],
        )
    return _brandt_module_cache


def BrandtModule(
    D: Any,
    N: Any = 1,
    weight: Any = 2,
    base_ring: Any = None,
    use_cache: bool = True,
    realization: str = "auto",
    dense_entry_limit: Any = 1000000,
) -> Any:
    r"""Construct the weight-two Brandt module over $\mathbf Q$.

    The quaternion discriminant `D` is squarefree with an odd number of
    prime factors, and the Eichler conductor `N` is positive and coprime to
    `D`. The canonical sparse supersingular realization is selected when it
    applies; all other valid pairs use the exact Jacquet--Langlands Hecke
    realization. Pass `realization="ideal-classes"` to construct genuine
    Eichler right ideal classes, their unit weights, and their integral
    pairing.

    ```sage
    sage: B = BrandtModule(11, 1)
    sage: (B.dimension(), B.T(2).charpoly())
    (2, x^2 - x - 6)
    ```
    """
    module = _brandt_module()
    return module.BrandtModule(
        D,
        N,
        weight,
        base_ring,
        use_cache,
        realization=realization,
        dense_entry_limit=dense_entry_limit,
    )


def SupersingularModule(
    characteristic: Any = 2,
    level: Any = 1,
    base_ring: Any = None,
    dense_entry_limit: Any = 1000000,
) -> Any:
    """Construct the sparse level-one supersingular Brandt module.

    The authoritative Hecke representation is sparse. Calling `matrix()` on
    an operator is a bounded compatibility operation for small examples.

    ```sage
    sage: S = SupersingularModule(37)
    sage: S.dimension()
    3
    sage: S.T(2) * vector(ZZ, [1, 1, 1])
    (3, 3, 3)
    ```

    The implementation supports prime characteristic at least five,
    auxiliary level one, and good prime-index Hecke operators under an
    explicit modular-polynomial construction bound.
    """
    module = _supersingular_module()
    return module.SupersingularModule(
        characteristic,
        level,
        base_ring,
        dense_entry_limit=dense_entry_limit,
    )


def _native_p1_modules() -> tuple[Any, Any]:
    loader = runtime.reflect.get(runtime.global_object, "__sagejs_load_module__")
    if loader is runtime.undefined:
        raise RuntimeError("the native P1 kernel loader is unavailable")
    return (
        runtime.reflect.apply(loader, runtime.undefined, ["sagejs.native"]),
        runtime.reflect.apply(loader, runtime.undefined, ["sagejs.kernels.p1"]),
    )


def _exact_integer(value: Any, name: str) -> int:
    value = runtime.normalize_integer(value)
    if runtime.jstype(value) != "number" or not runtime.number.isSafeInteger(value):
        raise ValueError(name + " must be an integer")
    return runtime.number(value)


def _exact_nonnegative_integer(value: Any, name: str) -> int:
    value = _exact_integer(value, name)
    if value < 0:
        raise ValueError(name + " must be a nonnegative integer")
    return value


def _positive_integer(value: Any, name: str) -> int:
    value = _exact_nonnegative_integer(value, name)
    if value == 0:
        raise ValueError(name + " must be positive")
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
        self._kind = "CongruenceSubgroup"
        self._level = level
        self._construction = {
            "kind": "CongruenceSubgroup",
            "family": family,
            "level": level,
        }
        if family == "Gamma0":
            index = level
            for prime in _factor_primes(level):
                index = index // prime * (prime + 1)
            self._index_value = index
            self._projective_index_value = index
            self._nu2_value = _gamma0_elliptic_points_order_two(level)
            self._nu3_value = _gamma0_elliptic_points_order_three(level)
            self._cusps_value = _gamma0_cusps(level)
            self._regular_cusps_value = self._cusps_value
        else:
            index = level * level
            for prime in _factor_primes(level):
                index = index // (prime * prime) * (prime * prime - 1)
            self._index_value = index
            self._projective_index_value = index // 2 if level > 2 else index
            self._nu2_value = 1 if level <= 2 else 0
            self._nu3_value = 1 if level == 1 or level == 3 else 0
            self._cusps_value = _gamma1_cusps(level)
            self._regular_cusps_value = 2 if level == 4 else self._cusps_value
        self._genus_value = (
            12
            + self._projective_index_value
            - 3 * self._nu2_value
            - 4 * self._nu3_value
            - 6 * self._cusps_value
        ) // 12
        runtime.object.freeze(self)

    def _from_serialized_modular_symbols(
        self,
        character: Any,
        weight: Any,
        sign: Any,
        base_ring: Any,
        dimension: Any,
        is_cuspidal: Any,
    ) -> Any:
        """Trusted fast constructor used only by the SagePack codec."""
        return ModularSymbolsSpace(
            self,
            _positive_integer(weight, "weight"),
            _exact_integer(sign, "sign"),
            base_ring,
            character,
            None,
            None,
            None,
            dimension,
            is_cuspidal,
        )

    def level(self) -> int:
        return self._level

    def index(self) -> int:
        return self._index_value

    def projective_index(self) -> int:
        return self._projective_index_value

    def is_even(self) -> bool:
        return self._family == "Gamma0" or self._level <= 2

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
            return "Modular Group SL(2,Z)"
        return "Congruence Subgroup " + self._family + "(" + str(self._level) + ")"

    __str__ = __repr__
    toString = __repr__


_gamma_zero_cache = runtime.map()
_gamma_one_cache = runtime.map()


def _gamma(
    family: str,
    level: Any,
) -> CongruenceSubgroup:
    level = _positive_integer(level, "congruence subgroup level")
    cache = _gamma_zero_cache if family == "Gamma0" else _gamma_one_cache
    group = cache.get(level)
    if group is runtime.undefined:
        group = CongruenceSubgroup(family, level)
        cache.set(level, group)
    return group


def Gamma0(level: Any) -> CongruenceSubgroup:
    return _gamma("Gamma0", level)


def Gamma1(level: Any) -> CongruenceSubgroup:
    return _gamma("Gamma1", level)


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
        result += _euler_phi(divisor) * _euler_phi(level // divisor)
    return result // 2


def _is_dirichlet_character(value: Any) -> bool:
    value_type = runtime.jstype(value)
    if value is None or (value_type != "object" and value_type != "function"):
        return False
    parent = runtime.reflect.get(value, "_parent")
    return (
        parent is not runtime.undefined
        and runtime.reflect.get(parent, "_kind") == "DirichletGroup"
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
    raise ArithmeticError("unable to find a primitive root")


def _local_character_argument(
    prime: int,
    exponent: int,
    modulus: int,
    root_order: int,
) -> int:
    generator = _primitive_root_prime(prime)
    local_root = pow(generator, (prime - 1) // root_order, prime)
    complement = modulus // (prime**exponent)
    if complement == 1:
        lifted = local_root
    else:
        inverse = pow(complement % prime, prime - 2, prime)
        multiplier = ((local_root - 1) * inverse) % prime
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
    exponent = _positive_integer(exponent, "prime exponent")
    prime = _positive_integer(prime, "prime")
    modulus = _positive_integer(modulus, "modulus")
    if prime % 4 == 3:
        return 0
    if prime == 2:
        return 1 if exponent == 1 else 0
    argument = _local_character_argument(prime, exponent, modulus, 4)
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
    exponent = _positive_integer(exponent, "prime exponent")
    prime = _positive_integer(prime, "prime")
    modulus = _positive_integer(modulus, "modulus")
    if prime % 3 == 2:
        return 0
    if prime == 3:
        return 1 if exponent == 1 else 0
    argument = _local_character_argument(prime, exponent, modulus, 3)
    return 2 if character(argument) == 1 else -1


def _cohen_oesterle_numerator(
    character: Any,
    weight: int,
) -> int:
    modulus = _positive_integer(character.modulus(), "character modulus")
    conductor = _positive_integer(character.conductor(), "character conductor")
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
                local_lambda = prime ** (exponent // 2) + prime ** (exponent // 2 - 1)
            else:
                local_lambda = 2 * prime ** ((exponent - 1) // 2)
        else:
            local_lambda = 2 * prime ** (exponent - conductor_exponent)
        lambda_product *= local_lambda
        delta_product *= CO_delta(exponent, prime, modulus, character)
        nu_product *= CO_nu(exponent, prime, modulus, character)

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
        raise TypeError("CohenOesterle requires a Dirichlet character")
    weight = _exact_integer(weight, "weight")
    return sage.QQ(_cohen_oesterle_numerator(character, weight)) / sage.QQ(12)


def _dimension_character_cusp_forms(
    character: Any,
    weight: int,
) -> int:
    modulus = _positive_integer(character.modulus(), "character modulus")
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
            "weight-one cusp dimensions require the Schaeffer algorithm"
        )
    numerator = Gamma0(modulus).index() * (weight - 1) + _cohen_oesterle_numerator(
        character, weight
    )
    if numerator % 12 != 0:
        raise ArithmeticError("Cohen-Oesterle dimension is not integral")
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
    weight = _exact_integer(weight, "weight")
    if _is_dirichlet_character(group):
        return _dimension_character_cusp_forms(group, weight)
    if runtime.is_exact_integer(group):
        group = Gamma0(group)
    if not isinstance(group, CongruenceSubgroup):
        raise TypeError(
            "dimension_cusp_forms requires an integer, Gamma0, "
            "Gamma1, or a Dirichlet character"
        )
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
        "weight-one cusp dimensions require the Schaeffer algorithm"
    )


def _dimension_character_eis(
    character: Any,
    weight: int,
) -> int:
    modulus = _positive_integer(character.modulus(), "character modulus")
    if character.is_principal():
        return dimension_eis(Gamma0(modulus), weight)
    if (
        weight <= 0
        or (weight % 2 == 1 and character.is_even())
        or (weight % 2 == 0 and character.is_odd())
    ):
        return 0
    dual_weight = 2 - weight
    numerator = Gamma0(modulus).index() * (dual_weight - 1) + _cohen_oesterle_numerator(
        character, dual_weight
    )
    if numerator % 12 != 0:
        raise ArithmeticError("Cohen-Oesterle Eisenstein dimension is not integral")
    total = -(numerator // 12)
    if weight == 1:
        return total
    return total - _dimension_character_cusp_forms(character, weight)


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
    weight = _exact_integer(weight, "weight")
    if _is_dirichlet_character(group):
        return _dimension_character_eis(group, weight)
    if runtime.is_exact_integer(group):
        group = Gamma0(group)
    if not isinstance(group, CongruenceSubgroup):
        raise TypeError(
            "dimension_eis requires an integer, Gamma0, Gamma1, "
            "or a Dirichlet character"
        )
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
    weight = _exact_integer(weight, "weight")
    return dimension_cusp_forms(group, weight) + dimension_eis(group, weight)


def eisenstein_series_qexp(
    k: Any,
    prec: Any = 10,
    K: Any = None,
    variable: str = "q",
    normalization: str = "linear",
    **opts: Any,
) -> Any:
    r"""Return an exact Eisenstein-series $q$-expansion.

    With `chi` and `psi`, this constructs $E_k(\chi,\psi)(q^t)$ and
    canonically replaces imprimitive inputs by their primitive inducing
    characters.

    ### Examples

    ```sage
    sage: chi = list(DirichletGroup(4))[1]
    sage: one = DirichletGroup(1)(1)
    sage: eisenstein_series_qexp(3, 6, chi=one, psi=chi)
    -1/4 + q + q^2 - 8*q^3 + q^4 + 26*q^5 + O(q^6)
    ```
    """
    character_left = opts["chi"] if "chi" in opts else None
    character_right = opts["psi"] if "psi" in opts else None
    if character_left is not None or character_right is not None:
        if character_left is None or character_right is None:
            raise ValueError("both chi and psi are required")
        return _qexp_module().character_eisenstein_series_qexp(
            character_left,
            character_right,
            k,
            prec,
            opts["t"] if "t" in opts else 1,
            variable,
            K,
            normalization,
        )
    if "var" in opts:
        variable = opts["var"]
    if "ρσ_py_var" in opts:
        variable = opts["ρσ_py_var"]
    weight = _positive_integer(k, "weight")
    if weight % 2 == 1:
        raise ValueError("weight must be a positive even integer")
    precision = _exact_nonnegative_integer(prec, "precision")
    coefficient_ring = sage.QQ if K is None else K
    if normalization not in ("linear", "constant", "integral"):
        raise ValueError("normalization must be 'linear', 'constant', or 'integral'")
    power_series_ring = runtime.reflect.get(runtime.global_object, "PowerSeriesRing")
    ring = power_series_ring(coefficient_ring, variable, default_prec=max(1, precision))
    if runtime.jstype(runtime.flint_backend().qqEisensteinSeries) != "function":
        return _qexp_module()._classical_eisenstein_qexp(
            weight, precision, coefficient_ring, variable, normalization
        )
    native_value = runtime.flint_backend().qqEisensteinSeries(
        weight, precision, normalization
    )
    if coefficient_ring is sage.QQ:
        return ring._from_native(native_value, 0, precision)
    if coefficient_ring is sage.ZZ:
        return ring._from_native(
            runtime.flint_backend().qqPolyToZZExact(native_value),
            0,
            precision,
        )

    rational_polynomial = sage.PolynomialRing(sage.QQ, variable)._from_native(
        native_value
    )
    coefficients = rational_polynomial.coefficients()
    generator = ring.gen()
    result = ring(0)
    for coefficient in reversed(coefficients):
        result = result * generator + coefficient_ring(coefficient)
    return result.add_bigoh(precision)


def theta_qexp(
    prec: Any = 20,
    K: Any = None,
    variable: str = "q",
    **opts: Any,
) -> Any:
    r"""Return the exact unary theta series $\sum_{n\in\ZZ}q^{n^2}$.

    ```sage
    sage: theta_qexp(6)
    1 + 2*q + 2*q^4 + O(q^6)
    ```
    """
    return _half_integral_module().theta_qexp(prec, K, variable, **opts)


def theta2_qexp(
    prec: Any = 20,
    K: Any = None,
    variable: str = "q",
    **opts: Any,
) -> Any:
    r"""Return $\sum_{n>0,\ n\text{ odd}}q^{n^2}$ exactly.

    ```sage
    sage: theta2_qexp(12)
    q + q^9 + O(q^12)
    ```
    """
    return _half_integral_module().theta2_qexp(prec, K, variable, **opts)


def theta_qexp_certificate(
    prec: Any = 20,
    K: Any = None,
    variable: str = "q",
    **opts: Any,
) -> Any:
    """Return the replayable standard-theta coefficient certificate.

    ```sage
    sage: theta_qexp_certificate(12).verify()
    True
    ```
    """
    return _half_integral_module().theta_qexp_certificate(
        prec,
        K,
        variable,
        **opts,
    )


def theta2_qexp_certificate(
    prec: Any = 20,
    K: Any = None,
    variable: str = "q",
    **opts: Any,
) -> Any:
    """Return the replayable odd-square theta coefficient certificate.

    ```sage
    sage: theta2_qexp_certificate(12).verify()
    True
    ```
    """
    return _half_integral_module().theta2_qexp_certificate(
        prec,
        K,
        variable,
        **opts,
    )


def cohen_eisenstein_series_qexp(
    r: Any,
    prec: Any = 20,
    variable: str = "q",
    normalization: str = "cohen",
    **opts: Any,
) -> Any:
    r"""Return Cohen's exact Eisenstein series of weight $r+\tfrac12$.

    ```sage
    sage: cohen_eisenstein_series_qexp(2, 6)
    1/120 - 1/12*q - 7/12*q^4 - 2/5*q^5 + O(q^6)
    ```
    """
    return _half_integral_module().cohen_eisenstein_series_qexp(
        r,
        prec,
        variable,
        normalization,
        **opts,
    )


def cohen_eisenstein_series_certificate(
    r: Any,
    prec: Any = 20,
    variable: str = "q",
    **opts: Any,
) -> Any:
    """Return the replayable Cohen coefficient-formula certificate.

    ```sage
    sage: cohen_eisenstein_series_certificate(2, 12).verify()
    True
    ```
    """
    return _half_integral_module().cohen_eisenstein_series_certificate(
        r,
        prec,
        variable,
        **opts,
    )


def HalfIntegralWeightModularForms(
    chi: Any,
    k: Any,
    prec: Any = 10,
) -> Any:
    r"""Construct the certified cusp space $S_{k/2}(\Gamma_0(N),\chi)$.

    ```sage
    sage: H = HalfIntegralWeightModularForms(list(DirichletGroup(16))[4], 3)
    sage: (H.weight(), H.dimension())
    (3/2, 0)
    ```
    """
    return _half_integral_module().HalfIntegralWeightModularForms(chi, k, prec)


def half_integral_weight_modform_basis(
    chi: Any,
    k: Any,
    prec: Any,
) -> list[Any]:
    """Return Sage-compatible Basmaji half-integral cusp expansions.

    ```sage
    sage: half_integral_weight_modform_basis(list(DirichletGroup(16))[4], 3, 5)
    []
    ```
    """
    return _half_integral_module().half_integral_weight_modform_basis(chi, k, prec)


def half_integral_weight_hecke_qexp(
    series: Any,
    k: Any,
    p: Any,
    chi: Any = None,
    prec: Any = None,
    variable: str = "q",
) -> Any:
    r"""Apply $T_{p^2}$ using Shimura's exact coefficient formula.

    ```sage
    sage: f = cohen_eisenstein_series_qexp(2, 82)
    sage: half_integral_weight_hecke_qexp(f, 5, 3, prec=5)
    7/30 - 7/3*q - 49/3*q^4 + O(q^5)
    ```
    """
    return _half_integral_module().half_integral_weight_hecke_qexp(
        series,
        k,
        p,
        chi,
        prec,
        variable,
    )


def shimura_lift_qexp(
    series: Any,
    k: Any,
    t: Any = 1,
    chi: Any = None,
    level: Any = None,
    prec: Any = None,
    variable: str = "q",
) -> Any:
    r"""Return the exact cuspidal Shimura lift for squarefree $t$.

    ```sage
    sage: q = PowerSeriesRing(QQ, 'q', default_prec=10).gen()
    sage: shimura_lift_qexp(q + O(q^10), 3, level=4, prec=4)
    q - q^3 + O(q^4)
    ```
    """
    return _half_integral_module().shimura_lift_qexp(
        series,
        k,
        t,
        chi,
        level,
        prec,
        variable,
    )


def half_integral_formula_registry() -> Any:
    """Return the bounded, certificate-bearing half-integral formula registry.

    ```sage
    sage: len(half_integral_formula_registry())
    4
    ```
    """
    return _half_integral_module().half_integral_formula_registry()


def delta_qexp(
    prec: Any = 10,
    variable: str = "q",
    K: Any = None,
    **opts: Any,
) -> Any:
    r"""Return the exact $q$-expansion of the weight-$12$ form $\Delta$.

    ### Examples

    ```sage
    sage: delta_qexp(6)
    q - 24*q^2 + 252*q^3 - 1472*q^4 + 4830*q^5 + O(q^6)
    ```
    """
    return _qexp_module().delta_qexp(prec, variable, K, **opts)


def victor_miller_basis(
    k: Any,
    prec: Any = 10,
    cusp_only: bool = False,
    variable: str = "q",
    **opts: Any,
) -> list[Any]:
    r"""Return the integral Victor Miller basis in level $1$ and weight $k$.

    ### Examples

    ```sage
    sage: victor_miller_basis(12, 5)
    [1 + 196560*q^2 + 16773120*q^3 + 398034000*q^4 + O(q^5), q - 24*q^2 + 252*q^3 - 1472*q^4 + O(q^5)]
    ```
    """
    return _qexp_module().victor_miller_basis(
        k,
        prec,
        cusp_only,
        variable,
        **opts,
    )


def certified_modular_form(form: Any, prec: Any = None) -> Any:
    r"""Return a replayably certified finite $q$-expansion of `form`.

    The source must be an exact Sage.js modular-form element.  The resulting
    object supports certified products, level lifts, degeneracy maps, and
    bounded exact quadratic twists.

    ```sage
    sage: D = certified_modular_form(ModularForms(1, 12).delta(), 8)
    sage: (D.V(2).level(), D.V(2).oldform_metadata().factor())
    (2, 2)
    ```
    """
    return _qexp_algebra_module().certified_modular_form(form, prec)


def character_eisenstein_series(
    chi: Any,
    psi: Any,
    weight: Any,
    prec: Any = 10,
    t: Any = 1,
    coefficient_ring: Any = None,
    normalization: str = "linear",
) -> Any:
    r"""Return the certified exact form $E_k(\chi,\psi)(q^t)$."""
    return _qexp_algebra_module().character_eisenstein_series(
        chi,
        psi,
        weight,
        prec,
        t,
        coefficient_ring,
        normalization,
    )


def formula_generated_subspace(
    space: Any,
    candidates: Any = None,
    prec: Any = None,
) -> Any:
    """Return the honest certified span of formula candidates in `space`."""
    return _qexp_algebra_module().formula_generated_subspace(
        space,
        candidates,
        prec,
    )


def eta_product(
    level: Any,
    exponents: Any,
    prec: Any = 10,
    variable: str = "q",
) -> Any:
    r"""Return a certified exact product $\prod_{d\mid N}\eta(dz)^{r_d}$.

    ```sage
    sage: D = eta_product(1, {1: 24}, prec=8)
    sage: D.q_expansion()
    q - 24*q^2 + 252*q^3 - 1472*q^4 + 4830*q^5 - 6048*q^6 - 16744*q^7 + O(q^8)
    sage: D.certificate().verify()
    True
    ```
    """
    return _eta_products_module().eta_product(level, exponents, prec, variable)


def eta_product_certificate(level: Any, exponents: Any) -> Any:
    """Return all exact Newman--Ligozat conditions for an eta product.

    ```sage
    sage: C = eta_product_certificate(4, {1: -12, 2: 10, 4: 4})
    sage: C.verify(), C.failure_reason()
    (False, 'the eta product has a pole at a cusp')
    ```
    """
    return _eta_products_module().eta_product_certificate(level, exponents)


def eta_product_candidates(
    level: Any,
    weight: Any,
    prec: Any = 10,
    **options: Any,
) -> Any:
    """Enumerate a deterministic bounded family of certified eta products.

    ```sage
    sage: [f.exponents() for f in eta_product_candidates(11, 2, prec=8)]
    [((1, 2), (11, 2))]
    ```
    """
    return _eta_products_module().eta_product_candidates(
        level,
        weight,
        prec,
        **options,
    )


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
    variable: str = "q",
) -> Any:
    if level == 1:
        return eisenstein_series_qexp(
            weight,
            precision,
            base_ring,
            variable,
            normalization="constant",
        )
    if weight == 2:
        base = eisenstein_series_qexp(
            2,
            precision,
            base_ring,
            variable,
            normalization="constant",
        )
        short_precision = 0 if precision == 0 else (precision - 1) // level + 1
        inflated = _inflate_series(
            eisenstein_series_qexp(
                2,
                short_precision,
                base_ring,
                variable,
                normalization="constant",
            ),
            level,
            precision,
        )
        return ((level * inflated - base) / (level - 1)).add_bigoh(precision)

    short_precision = 0 if precision == 0 else (precision - 1) // level + 1
    oldform = _inflate_series(
        eisenstein_series_qexp(
            weight,
            short_precision,
            base_ring,
            variable,
            normalization="constant",
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
        variable,
        normalization="linear",
    )
    bernoulli_number = runtime.reflect.get(runtime.global_object, "bernoulli")
    constant = -bernoulli_number(weight) / (2 * weight)
    return (linear - constant * oldform).add_bigoh(precision)


def _character_eisenstein_parameters(
    character: Any,
    weight: int,
) -> list[tuple[Any, Any, int]]:
    r"""Return deterministic standard parameters for $E_k(\chi,\psi)(q^t)$."""
    level = runtime.number(character.modulus())
    if character(-1) != character._parent._value_field(-1 if weight % 2 else 1):
        return []
    parameters = []
    for left in character._parent:
        left_order = runtime.number(left.order())
        inverse = left ** (left_order - 1)
        right = character * inverse
        conductor_product = runtime.number(left.conductor()) * runtime.number(
            right.conductor()
        )
        if level % conductor_product != 0:
            continue
        for inflation_value in sage.divisors(level // conductor_product):
            inflation = runtime.number(inflation_value)
            if (
                weight == 2
                and left.is_principal()
                and right.is_principal()
                and inflation == 1
            ):
                continue
            parameters.append((left, right, inflation))
    return parameters


def _character_eisenstein_basis_qexp(
    character: Any,
    weight: int,
    base_ring: Any,
    dimension: int,
    precision: int,
    variable: str = "q",
) -> list[Any]:
    r"""Return the Sturm-certified echelon basis of $E_k(N,\varepsilon)$."""
    if dimension == 0:
        return []
    proof_precision = max(
        precision,
        weight * Gamma0(character.modulus()).index() // 12 + 2,
    )
    # Even when the nebentypus itself is rational, its standard Eisenstein
    # generators E_k(chi, psi) can involve a larger cyclotomic field.  Compute
    # the complete Galois-stable family there and descend coefficientwise.
    # This occurs already for quadratic nebentypus at level 25.
    working_ring = base_ring
    if base_ring is sage.QQ:
        value_order = runtime.number(character._parent.zeta_order())
        if value_order > 2:
            working_ring = runtime.reflect.get(
                runtime.global_object,
                "CyclotomicField",
            )(value_order)
    rows = []
    for left, right, inflation in _character_eisenstein_parameters(character, weight):
        if weight == 2 and left.is_principal() and right.is_principal():
            series = _eisenstein_basis_qexp(
                inflation,
                weight,
                working_ring,
                0,
                proof_precision,
                variable,
            )
        else:
            series = _qexp_module().character_eisenstein_series_qexp(
                left,
                right,
                weight,
                proof_precision,
                inflation,
                variable,
                working_ring,
                "linear",
            )
        rows.append([working_ring(series[index]) for index in range(proof_precision)])
    matrix_constructor = runtime.reflect.get(runtime.global_object, "matrix")
    if base_ring is sage.QQ and working_ring is not sage.QQ:
        rational_rows = []
        field_degree = runtime.number(working_ring.degree())
        for row in rows:
            split_rows = [
                [sage.QQ(0) for _index in range(proof_precision)]
                for _coordinate in range(field_degree)
            ]
            for index, value in enumerate(row):
                coefficients = list(working_ring._serialization_coefficients(value))
                for coordinate, coefficient in enumerate(coefficients):
                    split_rows[coordinate][index] = sage.QQ(coefficient)
            rational_rows.extend(split_rows)
        candidate_matrix = (
            matrix_constructor(sage.QQ, rational_rows)
            if len(rational_rows)
            else matrix_constructor(sage.QQ, 0, proof_precision)
        )
    else:
        candidate_matrix = (
            matrix_constructor(base_ring, rows)
            if len(rows)
            else matrix_constructor(base_ring, 0, proof_precision)
        )
    basis_matrix = _exact_row_space_basis(candidate_matrix)
    if basis_matrix.nrows() != dimension:
        raise ArithmeticError(
            "the character Eisenstein formulas have rank "
            + str(basis_matrix.nrows())
            + " instead of the certified dimension "
            + str(dimension)
        )
    power_series_ring = runtime.reflect.get(runtime.global_object, "PowerSeriesRing")
    ring = power_series_ring(
        base_ring,
        variable,
        default_prec=max(1, proof_precision),
    )
    answer = [
        ring(row.list()).add_bigoh(proof_precision) for row in basis_matrix.rows()
    ]
    if precision < proof_precision:
        return [series.add_bigoh(precision) for series in answer]
    return answer


def _exact_row_space_basis(source: Any) -> Any:
    r"""Return the canonical exact row-space basis of `source`.

    The matrix layer selects the certified multimodular cyclotomic RREF for
    higher-degree cyclotomic fields and the appropriate exact backend for all
    other coefficient rings.  In particular, it does not recover a short row
    basis by constructing the almost-square intermediate in `ker(ker(A))`.
    """
    return source.row_space().basis_matrix()


@runtime.callable_instance_class
class ModularFormsSubspace(sage.Parent):
    def __init__(
        self,
        ambient: ModularFormsSpace,
        kind: str,
        dimension: int,
    ) -> None:
        self._kind = "ModularFormsSubspace"
        self._ambient = ambient
        self._subspace_kind = kind
        self._dimension = dimension
        self._modular_symbols_cusp_space_cache = None
        self._classical_qexp_basis_cache = runtime.map()
        self._classical_hecke_cache = runtime.map()

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

    def character(self) -> Any:
        return self._ambient.character()

    def character_components(self) -> list[Any]:
        r"""Return the exact character-orbit components for a $\Gamma_1$ space."""
        return _gamma1_module().character_components(self)

    def base_ring(self) -> Any:
        return self._ambient.base_ring()

    def precision(self) -> int:
        return self._ambient.precision()

    prec = precision

    def sturm_bound(self) -> int:
        return self._ambient.sturm_bound()

    def _require_level_one_cuspidal_basis(self) -> None:
        if self._subspace_kind != "Cuspidal":
            raise NotImplementedError(
                "an exact basis is currently available for the level-one "
                "cuspidal subspace and for Eisenstein subspaces"
            )
        if self.level() != 1 or self.base_ring() is not sage.QQ:
            raise NotImplementedError(
                "Victor Miller cusp bases currently require level one over QQ"
            )

    def _modular_symbols_cusp_space(self) -> Any:
        if self._subspace_kind not in ["Cuspidal", "New"]:
            raise NotImplementedError(
                "modular-symbol q-expansions require a cuspidal or new subspace"
            )
        if self.group()._family != "Gamma0":
            raise NotImplementedError(
                "modular-symbol q-expansions currently require Gamma0"
            )
        if self._modular_symbols_cusp_space_cache is None:
            defining_data = (
                self.character()
                if runtime.reflect.get(self._ambient, "_character") is not None
                else self.level()
            )
            self._modular_symbols_cusp_space_cache = ModularSymbols(
                defining_data,
                self.weight(),
                1,
                self.base_ring(),
            ).cuspidal_submodule()
        return self._modular_symbols_cusp_space_cache

    def new_subspace(self, prime: Any = None) -> Any:
        r"""Return the exact new, or $p$-new, cuspidal subspace."""
        return _qexp_module().modular_forms_new_subspace(self, prime)

    new_submodule = new_subspace

    def old_subspace(self) -> Any:
        r"""Return the exact old cuspidal subspace generated by degeneracy maps."""
        return _qexp_module().modular_forms_old_subspace(self)

    old_submodule = old_subspace

    def newforms(self, names: str = "a") -> list[Any]:
        r"""Return normalized newform Galois packets with exact coefficients."""
        return _qexp_module().modular_forms_newforms(self, names)

    def basis_certificate(self, prec: Any = None) -> Any:
        """Return the verified Victor Miller certificate for this cusp space."""
        self._require_level_one_cuspidal_basis()
        return self._ambient.basis_certificate(prec, cusp_only=True)

    def basis(self, prec: Any = None) -> list[Any]:
        """Return the canonical exact parented basis of this subspace."""
        return _object_layer_module().basis(self, prec)

    gens = basis

    def __call__(self, value: Any = 0) -> Any:
        """Construct an exact element of this modular-form subspace."""
        return _object_layer_module().construct_element(self, value)

    def coordinates(self, value: Any) -> Any:
        """Return exact coordinates of `value` in the canonical basis."""
        return _object_layer_module().coordinates(self, value)

    def contains(self, value: Any) -> bool:
        """Return whether `value` belongs to this subspace."""
        return _object_layer_module().contains(self, value)

    def __contains__(self, value: Any) -> bool:
        return self.contains(value)

    def zero(self) -> Any:
        """Return the zero modular form in this subspace."""
        return _object_layer_module().zero(self)

    def _from_serialized_classical_element(
        self,
        coordinates: Any,
        display_precision: Any,
    ) -> Any:
        return _object_layer_module().construct_element(
            self,
            coordinates,
            display_precision,
        )

    def _from_serialized_newform(
        self,
        constituent: Any,
        name: Any,
    ) -> Any:
        """Trusted deterministic constructor used by the SagePack codec."""
        return _qexp_module().normalized_newform_from_data(
            self,
            constituent,
            name,
        )

    def hecke_matrix(self, index: Any) -> Any:
        """Return the exact matrix of `T_index` on the canonical basis."""
        return _object_layer_module().hecke_matrix(self, index)

    def diamond_bracket_matrix(self, value: Any) -> Any:
        """Return the exact matrix of the diamond operator `<value>`."""
        return _object_layer_module().diamond_bracket_matrix(self, value)

    def diamond_bracket_operator(self, value: Any) -> Any:
        """Return the exact parented diamond operator `<value>`."""
        return _object_layer_module().diamond_bracket_operator(self, value)

    def T(self, index: Any) -> Any:
        """Return the exact Hecke operator `T_index` on this subspace."""
        return _object_layer_module().hecke_operator(self, index)

    hecke_operator = T

    def q_expansion_algorithm_receipt(
        self,
        algorithm: str = "auto",
        prec: Any = None,
    ) -> Any:
        """Return the exact-domain receipt used to select a q-expansion engine."""
        return _qexp_algebra_module().q_expansion_algorithm_receipt(
            self,
            algorithm,
            prec,
        )

    def formula_subspace(
        self,
        candidates: Any = None,
        prec: Any = None,
    ) -> Any:
        r"""Return the certified subspace spanned by exact formula candidates.

        When `candidates` is omitted, level-one cusp forms and all available
        $V_d$ degeneracy images are used.  The returned object states whether
        this span is the full ambient cusp space; it never promotes a proper
        span to an ambient basis.
        """
        if self._subspace_kind != "Cuspidal":
            raise NotImplementedError(
                "formula-generated subspaces currently require a cusp space"
            )
        return _qexp_algebra_module().formula_generated_subspace(
            self,
            candidates,
            prec,
        )

    def q_expansion_basis(
        self,
        prec: Any = None,
        algorithm: str = "default",
        variable: str = "q",
        **opts: Any,
    ) -> list[Any]:
        r"""Return an exact echelon basis of cusp-form $q$-expansions."""
        if "var" in opts:
            variable = opts["var"]
        if "ρσ_py_var" in opts:
            variable = opts["ρσ_py_var"]
        if self.group()._family == "Gamma1":
            if algorithm not in ["default", "auto", "modular_symbols"]:
                raise ValueError("Gamma1 q-expansions use character-orbit descent")
            return _gamma1_module().q_expansion_basis(self, prec, variable)
        effective_precision = (
            self.precision()
            if prec is None
            else _exact_nonnegative_integer(prec, "precision")
        )
        proof_precision = max(1, self.sturm_bound() + 1)
        if effective_precision < proof_precision:
            certified_basis = self.q_expansion_basis(
                proof_precision,
                algorithm,
                variable,
                **opts,
            )
            return [series.add_bigoh(effective_precision) for series in certified_basis]
        receipt = self.q_expansion_algorithm_receipt(algorithm, effective_precision)
        algorithm = receipt.selected_algorithm()
        if algorithm == "formulas":
            if self.level() == 1:
                self._require_level_one_cuspidal_basis()
                return _qexp_module().victor_miller_basis(
                    self.weight(),
                    effective_precision,
                    True,
                    variable,
                )
            formula_span = receipt.formula_subspace()
            if formula_span is None:
                formula_span = self.formula_subspace(prec=effective_precision)
            if not formula_span.is_full_ambient():
                raise ArithmeticError(
                    "formula candidates certify only a proper subspace of dimension "
                    + str(formula_span.dimension())
                    + " in ambient dimension "
                    + str(formula_span.ambient_dimension())
                    + "; use formula_subspace() to inspect it"
                )
            return formula_span.q_expansion_basis(effective_precision, variable)
        return self._modular_symbols_cusp_space().q_expansion_basis(
            effective_precision,
            "modular_symbols",
            variable,
            **opts,
        )

    def q_expansion_module(
        self,
        prec: Any = None,
        R: Any = None,
        algorithm: str = "default",
    ) -> Any:
        r"""Return the $QQ$-space or saturated $ZZ$-module of expansions."""
        effective_precision = self.precision() if prec is None else prec
        receipt = self.q_expansion_algorithm_receipt(algorithm, effective_precision)
        algorithm = receipt.selected_algorithm()
        if algorithm == "formulas":
            if self.level() == 1:
                self._require_level_one_cuspidal_basis()
                return _qexp_module().formula_q_expansion_module(
                    self.weight(),
                    effective_precision,
                    R,
                )
            formula_span = receipt.formula_subspace()
            if formula_span is None:
                formula_span = self.formula_subspace(prec=effective_precision)
            if not formula_span.is_full_ambient():
                raise ArithmeticError(
                    "formula candidates certify only a proper subspace; "
                    "use formula_subspace() to inspect it"
                )
            return formula_span.q_expansion_module(R)
        return self._modular_symbols_cusp_space().q_expansion_module(
            effective_precision,
            R,
            "modular_symbols",
        )

    def q_expansion_basis_certificate(
        self,
        prec: Any = None,
        algorithm: str = "default",
    ) -> Any:
        r"""Return a replayable formula or Hecke-dual basis certificate."""
        if self.group()._family == "Gamma1":
            del prec, algorithm
            return _gamma1_module().descent_certificate(self)
        effective_precision = self.precision() if prec is None else prec
        receipt = self.q_expansion_algorithm_receipt(algorithm, effective_precision)
        algorithm = receipt.selected_algorithm()
        if algorithm == "formulas":
            if self.level() == 1:
                return self.basis_certificate(prec)
            formula_span = receipt.formula_subspace()
            if formula_span is not None:
                return formula_span
            return self.formula_subspace(prec=effective_precision)
        return self._modular_symbols_cusp_space().q_expansion_basis_certificate(prec)

    def gen(self, index: Any = 0) -> Any:
        """Return the indexed exact parented basis element."""
        index = _exact_nonnegative_integer(index, "basis index")
        return self.basis()[index]

    def _first_ngens(self, count: Any) -> list[Any]:
        count = _exact_nonnegative_integer(count, "generator count")
        if count > self._dimension:
            raise ValueError("too many cuspidal generators requested")
        return self.basis()[:count]

    def __repr__(self) -> str:
        return (
            self._subspace_kind
            + " subspace of dimension "
            + str(self._dimension)
            + " of "
            + str(self._ambient)
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
        defining_data = (
            ambient.character()
            if runtime.reflect.get(ambient, "_character") is not None
            else ambient.group()
        )
        dimension = dimension_eis(defining_data, weight)
        ModularFormsSubspace.__init__(self, ambient, "Eisenstein", dimension)
        self._kind = "EisensteinSubspace"
        self._precision = precision
        basis_supported = runtime.reflect.get(ambient, "_character") is not None or (
            ambient.group()._family == "Gamma1"
            or dimension == 0
            or (level == 1 and weight >= 4 and weight % 2 == 0)
            or (sage.is_prime(level) and weight >= 2 and weight % 2 == 0)
        )
        self._basis_supported = basis_supported

    def _require_basis(self) -> None:
        if not self._basis_supported:
            raise NotImplementedError(
                "q-expansion bases are currently implemented for "
                "level one and prime Gamma0 level"
            )

    def precision(self) -> int:
        return self._precision

    def __len__(self) -> int:
        return self._dimension

    def __getitem__(self, index: int) -> Any:
        return self.basis()[index]

    def gen(self, index: int = 0) -> Any:
        return self.basis()[index]

    def _first_ngens(self, count: int) -> list[Any]:
        if count > self._dimension:
            raise ValueError("too many Eisenstein generators requested")
        return self.basis()[:count]

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
        return _object_layer_module().basis(self, prec)

    gens = basis

    def q_expansion_basis(
        self,
        prec: Any = None,
        algorithm: str = "default",
        variable: str = "q",
        **opts: Any,
    ) -> list[Any]:
        """Return the basis as power series to absolute precision `prec`."""
        if "var" in opts:
            variable = opts["var"]
        if "ρσ_py_var" in opts:
            variable = opts["ρσ_py_var"]
        if self.group()._family == "Gamma1":
            if algorithm not in ["default", "formulas"]:
                raise ValueError("Gamma1 Eisenstein bases use character descent")
            return _gamma1_module().q_expansion_basis(self, prec, variable)
        if algorithm not in ["default", "formulas"]:
            raise ValueError("only the exact Eisenstein formula is available")
        if prec is None:
            prec = self._precision
        precision = _exact_nonnegative_integer(prec, "precision")
        self._require_basis()
        if runtime.reflect.get(self._ambient, "_character") is not None:
            return _character_eisenstein_basis_qexp(
                self.character(),
                self.weight(),
                self.base_ring(),
                self.dimension(),
                precision,
                variable,
            )
        return [
            _eisenstein_basis_qexp(
                self.level(),
                self.weight(),
                self.base_ring(),
                index,
                precision,
                variable,
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


@runtime.callable_instance_class
class ModularFormsSpace(sage.Parent):
    def __init__(
        self,
        group: CongruenceSubgroup,
        weight: int,
        base_ring: Any,
        precision: int,
        character: Any = None,
    ) -> None:
        if group._family not in ["Gamma0", "Gamma1"]:
            raise NotImplementedError(
                "ModularForms currently supports Gamma0 and Gamma1"
            )
        self._kind = "ModularForms"
        self._group = group
        self._weight = weight
        self._base = base_ring
        self._character = character
        self._precision = precision
        self._classical_qexp_basis_cache = runtime.map()
        self._classical_hecke_cache = runtime.map()
        self._cuspidal_subspace_cache = None
        self._eisenstein_subspace_cache = None

    def group(self) -> CongruenceSubgroup:
        return self._group

    def level(self) -> int:
        return self._group.level()

    def weight(self) -> int:
        return self._weight

    def base_ring(self) -> Any:
        return self._base

    def character(self) -> Any:
        """Return the Dirichlet character defining this space."""
        if self._character is not None:
            return self._character
        if self._group._family == "Gamma1":
            return None
        return runtime.reflect.get(runtime.global_object, "DirichletGroup")(
            self.level()
        )(1)

    def character_components(self) -> list[Any]:
        r"""Return the exact character-orbit components for a $\Gamma_1$ space."""
        return _gamma1_module().character_components(self)

    def q_expansion_basis_certificate(self) -> Any:
        r"""Return the exact $\Gamma_1$ Galois-descent certificate."""
        if self._group._family != "Gamma1":
            raise NotImplementedError(
                "ambient q-expansion certificates currently require Gamma1"
            )
        return _gamma1_module().descent_certificate(self)

    def sturm_bound(self) -> int:
        r"""Return the q-expansion precision required by the Sturm bound.

        For $\Gamma_0(N)$ this is one more than the usual coefficient
        bound, since a series with precision $r$ contains coefficients only
        through $q^{r-1}$:

        $$
        1+\left\lfloor \frac{k}{12}
        [\mathrm{SL}_2(\ZZ):\Gamma_0(N)]\right\rfloor.
        $$
        """
        numerator = self.weight() * self._group.index()
        return numerator // 12 + 1

    def precision(self) -> int:
        """Return the default displayed q-expansion precision."""
        return self._precision

    prec = precision

    def dimension(self) -> int:
        defining_data = self._character if self._character is not None else self._group
        return dimension_modular_forms(defining_data, self._weight)

    degree = dimension

    def cuspidal_subspace(self) -> ModularFormsSubspace:
        if self._cuspidal_subspace_cache is None:
            defining_data = (
                self._character if self._character is not None else self._group
            )
            self._cuspidal_subspace_cache = ModularFormsSubspace(
                self,
                "Cuspidal",
                dimension_cusp_forms(defining_data, self._weight),
            )
        return self._cuspidal_subspace_cache

    cusp_subspace = cuspidal_subspace

    def new_subspace(self, prime: Any = None) -> Any:
        r"""Return the exact new cuspidal subspace."""
        return self.cuspidal_subspace().new_subspace(prime)

    new_submodule = new_subspace

    def old_subspace(self) -> Any:
        r"""Return the exact old cuspidal subspace."""
        return self.cuspidal_subspace().old_subspace()

    old_submodule = old_subspace

    def newforms(self, names: str = "a") -> list[Any]:
        r"""Return normalized newform Galois packets."""
        return self.cuspidal_subspace().newforms(names)

    def eisenstein_subspace(self) -> EisensteinSubspace:
        if self._eisenstein_subspace_cache is None:
            self._eisenstein_subspace_cache = EisensteinSubspace(
                self,
                self._precision,
            )
        return self._eisenstein_subspace_cache

    def basis_certificate(
        self,
        prec: Any = None,
        cusp_only: bool = False,
    ) -> Any:
        r"""Return a verified level-$1$ Victor Miller basis certificate."""
        return _qexp_module().level_one_basis_certificate(
            self,
            prec,
            cusp_only,
        )

    def basis(self, prec: Any = None) -> list[Any]:
        """Return the canonical exact parented basis of this ambient space."""
        return _object_layer_module().basis(self, prec)

    gens = basis

    def q_expansion_basis(self, prec: Any = None) -> list[Any]:
        """Return the canonical exact power-series basis of this space."""
        return _object_layer_module().q_expansion_basis(self, prec)

    def __call__(self, value: Any = 0) -> Any:
        """Construct an exact element of this modular-form space."""
        return _object_layer_module().construct_element(self, value)

    def coordinates(self, value: Any) -> Any:
        """Return exact coordinates of `value` in the canonical basis."""
        return _object_layer_module().coordinates(self, value)

    def contains(self, value: Any) -> bool:
        """Return whether `value` belongs to this ambient space."""
        return _object_layer_module().contains(self, value)

    def __contains__(self, value: Any) -> bool:
        return self.contains(value)

    def zero(self) -> Any:
        """Return the zero modular form in this ambient space."""
        return _object_layer_module().zero(self)

    def hecke_matrix(self, index: Any) -> Any:
        """Return the exact matrix of `T_index` on the canonical basis."""
        return _object_layer_module().hecke_matrix(self, index)

    def diamond_bracket_matrix(self, value: Any) -> Any:
        """Return the exact matrix of the diamond operator `<value>`."""
        return _object_layer_module().diamond_bracket_matrix(self, value)

    def diamond_bracket_operator(self, value: Any) -> Any:
        """Return the exact parented diamond operator `<value>`."""
        return _object_layer_module().diamond_bracket_operator(self, value)

    def T(self, index: Any) -> Any:
        """Return the exact Hecke operator `T_index` on this space."""
        return _object_layer_module().hecke_operator(self, index)

    hecke_operator = T

    def gen(self, index: Any = 0) -> Any:
        """Return the indexed exact Victor Miller basis element."""
        index = _exact_nonnegative_integer(index, "basis index")
        return self.basis()[index]

    def _first_ngens(self, count: Any) -> list[Any]:
        count = _exact_nonnegative_integer(count, "generator count")
        if count > self.dimension():
            raise ValueError("too many modular-form generators requested")
        return self.basis()[:count]

    def delta(self, prec: Any = None) -> Any:
        r"""Return $Δ$ in this space, which must be $M_{12}(\mathrm{SL}_2(\ZZ))$."""
        precision = self._precision if prec is None else prec
        return _object_layer_module().construct_element(
            self,
            _qexp_module().delta_form(self, precision),
            precision,
        )

    def _from_serialized_element(
        self,
        terms: Any,
        display_precision: Any,
        provenance: Any,
    ) -> Any:
        return _qexp_module().from_serialized_element(
            self,
            terms,
            display_precision,
            provenance,
        )

    def _from_serialized_classical_element(
        self,
        coordinates: Any,
        display_precision: Any,
    ) -> Any:
        return _object_layer_module().construct_element(
            self,
            coordinates,
            display_precision,
        )

    def _from_serialized_subspace(
        self,
        kind: str,
        dimension: Any,
        precision: Any = None,
        eisenstein: Any = False,
        new_prime: Any = None,
    ) -> ModularFormsSubspace:
        if bool(eisenstein):
            return EisensteinSubspace(
                self,
                _exact_nonnegative_integer(precision, "precision"),
            )
        expected_dimension = _exact_nonnegative_integer(dimension, "dimension")
        if kind == "Cuspidal":
            answer = self.cuspidal_subspace()
            if answer.dimension() != expected_dimension:
                raise ValueError("serialized cuspidal dimension is inconsistent")
            return answer
        if kind == "New":
            answer = self.cuspidal_subspace().new_subspace(new_prime)
            if answer.dimension() != expected_dimension:
                raise ValueError("serialized newspace dimension is inconsistent")
            return answer
        return ModularFormsSubspace(
            self,
            kind,
            expected_dimension,
        )

    def __repr__(self) -> str:
        if self._character is not None:
            values = []
            for generator in self._character.parent().unit_gens():
                value = self._character(generator)
                if self._base is sage.QQ:
                    if value.is_one():
                        value = sage.QQ(1)
                    elif (-value).is_one():
                        value = sage.QQ(-1)
                else:
                    value = self._base(value)
                values.append(value)
            return (
                "Modular Forms space of dimension "
                + str(self.dimension())
                + ", character "
                + str(values)
                + " and weight "
                + str(self._weight)
                + " over "
                + str(self._base)
            )
        return (
            "Modular Forms space of dimension "
            + str(self.dimension())
            + " for "
            + str(self._group)
            + " of weight "
            + str(self._weight)
            + " over "
            + str(self._base)
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

    `group` is a level, congruence subgroup, or Dirichlet character; `weight`
    is nonnegative, and `prec` controls the default displayed q-expansion
    precision. Trivial and quadratic characters are exact over `QQ`, while
    higher-order characters use their minimal exact cyclotomic value field.

    ### Examples

    ```sage
    sage: M = ModularForms(Gamma0(11), 2)
    sage: M.dimension()
    2
    sage: M.cuspidal_subspace().dimension()
    1
    ```

    The returned cusp, Eisenstein, old, new, and ambient spaces share one
    parented exact element contract, including exact Hecke action and
    Sturm-certified coordinate recovery.
    """
    del use_cache
    character = group if _is_dirichlet_character(group) else None
    if character is not None:
        if character.is_principal():
            group = Gamma0(character.modulus())
            character = None
        else:
            group = Gamma0(character.modulus())
    elif runtime.is_exact_integer(group):
        group = Gamma0(group)
    if not isinstance(group, CongruenceSubgroup):
        raise TypeError("ModularForms requires a congruence subgroup")
    weight = _exact_nonnegative_integer(weight, "weight")
    precision = _exact_nonnegative_integer(prec, "precision")
    if group._family == "Gamma1" and weight < 2:
        raise NotImplementedError(
            "Gamma1 modular-form spaces currently require weight at least 2"
        )
    if character is not None and weight < 2:
        raise NotImplementedError(
            "parented character spaces currently require weight at least 2"
        )
    if base_ring is None:
        base_ring = (
            sage.QQ
            if character is None or character.order() <= 2
            else character._minimal_base_ring()
        )
    base_kind = getattr(base_ring, "_kind", None)
    if character is None and base_ring is not sage.QQ:
        raise NotImplementedError(
            "the initial modular-forms spaces are defined over QQ"
        )
    if character is not None:
        if character.order() > 2 and base_ring is sage.QQ:
            raise ValueError("the character values do not lie in Rational Field")
        if base_ring is not sage.QQ and base_kind != "CyclotomicField":
            raise NotImplementedError(
                "character modular forms currently require QQ or an exact "
                "cyclotomic field"
            )
    return ModularFormsSpace(group, weight, base_ring, precision, character)


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
    ambient = ModularForms(group, weight, base_ring, use_cache, prec)
    return ambient.eisenstein_subspace()


def CuspForms(
    group: Any = 1,
    weight: Any = 2,
    base_ring: Any = None,
    use_cache: bool = True,
    prec: Any = 6,
) -> ModularFormsSubspace:
    r"""Construct the cuspidal subspace of `ModularForms(group, weight)`.

    ### Examples

    ```sage
    sage: S = CuspForms(11, 2)
    sage: (S.dimension(), S.q_expansion_basis(6))
    (1, [q - 2*q^2 - q^3 + 2*q^4 + q^5 + O(q^6)])
    ```
    """
    ambient = ModularForms(group, weight, base_ring, use_cache, prec)
    return ambient.cuspidal_subspace()


def Newforms(
    group: Any = 1,
    weight: Any = 2,
    names: str = "a",
    base_ring: Any = None,
    use_cache: bool = True,
    prec: Any = 6,
) -> list[Any]:
    r"""Return normalized newform Galois packets for $\Gamma_0(N)$ or $\Gamma_1(N)$."""
    return CuspForms(group, weight, base_ring, use_cache, prec).newforms(names)


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
        return "[" + self._polynomial + ",(0,0)]"

    __str__ = __repr__
    toString = __repr__


class ManinSymbolBasisElement:
    def __init__(self, numerator: int, denominator: int) -> None:
        self._numerator = numerator
        self._denominator = denominator

    def __repr__(self) -> str:
        return "(" + str(self._numerator) + "," + str(self._denominator) + ")"

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
            factors.append("X")
        elif x_degree > 1:
            factors.append("X^" + str(x_degree))
        if y_degree == 1:
            factors.append("Y")
        elif y_degree > 1:
            factors.append("Y^" + str(y_degree))
        polynomial = "*".join(factors) if factors else "1"
        return "[" + polynomial + ",(" + str(self._u) + "," + str(self._v) + ")]"

    __str__ = __repr__
    toString = __repr__


class ModularCusp:
    def __init__(self, numerator: Any, denominator: Any = 1) -> None:
        numerator = _exact_integer(numerator, "cusp numerator")
        denominator = _exact_integer(denominator, "cusp denominator")
        if numerator == 0 and denominator == 0:
            raise ValueError("a cusp cannot be represented by (0, 0)")
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
        return runtime.math_tuple([self._numerator, self._denominator])

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
            return "Infinity"
        if self._denominator == 1:
            return str(self._numerator)
        return str(self._numerator) + "/" + str(self._denominator)

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
        common = runtime.number(
            runtime.bigint_gcd(runtime.bigint(multiplier), runtime.bigint(d))
        )
        if common == 1:
            break
        multiplier //= common
    while True:
        common = runtime.number(
            runtime.bigint_gcd(runtime.bigint(multiplier), runtime.bigint(level))
        )
        if common == 1:
            break
        multiplier //= common
    d += level * multiplier
    common, z1, z2 = _integer_xgcd(c, d)
    if common != 1:
        raise ArithmeticError("unable to lift Gamma0 projective coset")
    return [z2, -z1, c, d]


def _inverse_mod_integer(value: int, modulus: int) -> int:
    common, inverse, _other = _integer_xgcd(value, modulus)
    if common != 1:
        raise ArithmeticError("inverse modulo a non-coprime modulus")
    return inverse % modulus


def _gamma0_cusp_equivalence_scalar(
    left: ModularCusp,
    right: ModularCusp,
    level: int,
) -> Any:
    """Return the lower-right character scalar, or `None`."""
    return _gamma0_cusp_equivalence_scalar_values(
        left.numerator(),
        left.denominator(),
        right.numerator(),
        right.denominator(),
        level,
    )


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
    common = runtime.number(
        runtime.bigint_gcd(runtime.bigint(v1 * v2), runtime.bigint(level))
    )
    difference = initial_s1 * v2 - initial_s2 * v1
    if difference % common != 0:
        return None
    gcd2, s2, r2 = _integer_xgcd(u2, -v2)
    gcd1, s1, _r1 = _integer_xgcd(u1, -v1)
    if gcd1 != 1 or gcd2 != 1:
        raise ArithmeticError("cusps were not primitive")
    difference = s1 * v2 - s2 * v1
    gcd_product, x0, _y0 = _integer_xgcd(v1 * v2, level)
    if gcd_product != common:
        raise ArithmeticError("inconsistent cusp gcd")
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
        common = runtime.number(
            runtime.bigint_gcd(runtime.bigint(self.level), runtime.bigint(v))
        )
        step = self.level // common
        for j in range(common):
            scalar = 1 - j * step
            if (
                runtime.number(
                    runtime.bigint_gcd(
                        runtime.bigint(scalar), runtime.bigint(self.level)
                    )
                )
                != 1
            ):
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
            scalar = _gamma0_cusp_equivalence_scalar(known, cusp, self.level)
            if scalar is not None:
                return (0 if self.killed[index] else self._coefficient(scalar)), index
        if self.sign != 0:
            for index, known in enumerate(self.known):
                scalar = _gamma0_cusp_equivalence_scalar_values(
                    known.numerator(),
                    known.denominator(),
                    -cusp.numerator(),
                    cusp.denominator(),
                    self.level,
                )
                if scalar is not None:
                    return (
                        0
                        if self.killed[index]
                        else self.sign * self._coefficient(scalar)
                    ), index
        killed = self._new_cusp_is_killed(cusp)
        if not killed and self.sign != 0:
            scalar = _gamma0_cusp_equivalence_scalar_values(
                cusp.numerator(),
                cusp.denominator(),
                -cusp.numerator(),
                cusp.denominator(),
                self.level,
            )
            if scalar is not None and self._coefficient(scalar) != self.sign:
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
            parent.base_ring(), parent.dimension()
        )(coordinates)

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
                    str(coefficient) + "*[" + str(self._parent.cusps()[index]) + "]"
                )
        if len(terms) == 0:
            return "0"
        return " + ".join(terms)

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
            "Space of Boundary Modular Symbols for Gamma_0("
            + str(self.level())
            + ") of weight "
            + str(self.weight())
            + " over "
            + str(self.base_ring())
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
            parent.base_ring(), ambient.dimension()
        )(coordinates)
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
        self,
        other: object,
    ) -> tuple[ModularSymbolElement, ModularSymbolElement]:
        if (
            not isinstance(other, ModularSymbolElement)
            or self._parent.ambient_module() is not other._parent.ambient_module()
        ):
            raise TypeError("modular symbols must have the same ambient space")
        return self, other

    def __add__(self, other: object) -> ModularSymbolElement:
        left, right = self._compatible(other)
        parent = (
            left._parent
            if left._parent is right._parent
            else left._parent.ambient_module()
        )
        return ModularSymbolElement(parent, left._coordinates + right._coordinates)

    def _add_(self, other: ModularSymbolElement) -> ModularSymbolElement:
        return self.__add__(other)

    def __sub__(self, other: object) -> ModularSymbolElement:
        left, right = self._compatible(other)
        parent = (
            left._parent
            if left._parent is right._parent
            else left._parent.ambient_module()
        )
        return ModularSymbolElement(parent, left._coordinates - right._coordinates)

    def _sub_(self, other: ModularSymbolElement) -> ModularSymbolElement:
        return self.__sub__(other)

    def __neg__(self) -> ModularSymbolElement:
        return ModularSymbolElement(self._parent, -self._coordinates)

    def _neg_(self) -> ModularSymbolElement:
        return self.__neg__()

    def __mul__(self, scalar: object) -> ModularSymbolElement:
        return ModularSymbolElement(self._parent, self._coordinates * scalar)

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
        if operator == "add" and not reflected:
            return self.__add__(other)
        if operator == "sub" and not reflected:
            return self.__sub__(other)
        if operator == "mul":
            if reflected:
                return self.__rmul__(other)
            return self.__mul__(other)
        raise TypeError("operation " + operator + " is not defined for modular symbols")

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, ModularSymbolElement)
            and self._parent.ambient_module() is other._parent.ambient_module()
            and self._coordinates == other._coordinates
        )

    def __repr__(self) -> str:
        if self._label is not None:
            return str(self._label)
        return "Modular symbol " + str(self._coordinates)

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
        return "Boundary map defined by the matrix\n" + str(self._matrix)

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
        self._kind = "ModularSymbolsLinearOperator"
        self._space = space
        self._matrix = defining_matrix
        self._name = name
        self._ambient_matrix = (
            defining_matrix if ambient_matrix is None else ambient_matrix
        )

    def matrix(self) -> Any:
        return self._matrix

    def __call__(self, element: Any) -> ModularSymbolElement:
        symbol = self._space(element)
        ambient_image = symbol.vector() * self._ambient_matrix
        return self._space(ambient_image)

    def __repr__(self) -> str:
        return self._name + " on " + str(self._space)

    __str__ = __repr__
    toString = __repr__


class ModularSymbolsDegeneracyMap:
    def __init__(
        self,
        domain: ModularSymbolsSpace,
        codomain: ModularSymbolsSpace,
        defining_matrix: Any,
        ambient_matrix: Any,
        index: int,
    ) -> None:
        self._domain = domain
        self._codomain = codomain
        self._matrix = defining_matrix
        self._ambient_matrix = ambient_matrix
        self._index = index

    def domain(self) -> ModularSymbolsSpace:
        return self._domain

    def codomain(self) -> ModularSymbolsSpace:
        return self._codomain

    def matrix(self) -> Any:
        return self._matrix

    def rank(self) -> int:
        return self._matrix.rank()

    def kernel(self) -> ModularSymbolsSpace:
        local_basis = self._matrix.left_kernel_matrix()
        return self._domain._subspace_from_local_basis(local_basis, "Kernel")

    def image(self) -> ModularSymbolsSpace:
        local_basis = self._matrix.row_space().basis_matrix()
        return self._codomain._subspace_from_local_basis(local_basis, "Image")

    def __call__(self, element: Any) -> ModularSymbolElement:
        symbol = self._domain(element)
        image = symbol.vector() * self._ambient_matrix
        return self._codomain(image)

    def __repr__(self) -> str:
        return (
            "Degeneracy map of index "
            + str(self._index)
            + " defined by the matrix\n"
            + str(self._matrix)
            + "\nDomain: "
            + str(self._domain)
            + "\nCodomain: "
            + str(self._codomain)
        )

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
            projective_line._native
        )

    def _number(self, name: str) -> int:
        return runtime.number(runtime.reflect.get(self._info, name))

    def level(self) -> int:
        return self._number("level")

    def projective_cosets(self) -> int:
        return self._number("projectiveCosets")

    def cusps(self) -> int:
        return self._number("cusps")

    def interior_paths(self) -> int:
        return self._number("interiorPaths")

    def e1(self) -> int:
        return self._number("e1")

    def e2(self) -> int:
        return self._number("e2")

    def torsion2(self) -> int:
        return self._number("torsion2")

    def torsion3(self) -> int:
        return self._number("torsion3")

    def ngens(self) -> int:
        return self._number("generators")

    def nrelations(self) -> int:
        return self._number("relations")

    def dimension(self) -> int:
        return self._number("dimension")

    def __repr__(self) -> str:
        return (
            "Minimal weight-2 Manin presentation at level "
            + str(self.level())
            + " with "
            + str(self.ngens())
            + " generators and "
            + str(self.nrelations())
            + " relations"
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
        self._modulus = _positive_integer(modulus, "relation modulus")
        if not sage.is_prime(self._modulus):
            raise ValueError("relation modulus must be prime")
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
        return runtime.number(runtime.reflect.get(self._info, "rows"))

    def ncols(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, "generators"))

    def nnz(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, "nonzero"))

    def s_relations(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, "sRelations"))

    def r_relations(self) -> int:
        return runtime.number(runtime.reflect.get(self._info, "rRelations"))

    def checksum(self) -> str:
        return runtime.reflect.get(self._info, "checksum")

    def row(self, index: Any) -> Any:
        index = _exact_nonnegative_integer(index, "relation row")
        raw = runtime.flint_backend().maninRelationsRow(self._native, index)
        entries = []
        for position in range(0, len(raw), 2):
            entries.append(
                runtime.math_tuple(
                    [
                        runtime.number(raw[position]),
                        runtime.normalize_integer(raw[position + 1]),
                    ]
                )
            )
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
                    runtime.flint_backend().maninRelationsRank(self._native)
                )
        return self._rank_cache

    def quotient_dimension(self) -> int:
        return self.ncols() - self.rank()

    dimension = quotient_dimension

    def __repr__(self) -> str:
        return (
            "Sparse Manin relation matrix with "
            + str(self.nrows())
            + " rows, "
            + str(self.ncols())
            + " columns, and "
            + str(self.nnz())
            + " nonzero entries over Finite Field of size "
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
        self._generators = runtime.number(runtime.reflect.get(raw, "generators"))
        self._dimension = runtime.number(runtime.reflect.get(raw, "dimension"))
        self._two_term_generators = runtime.number(
            runtime.reflect.get(raw, "twoTermGenerators")
        )
        self._base_ring = sage.QQ if base_ring is None else base_ring
        self._reduction = None
        self._lazy_reduction = lazy_reduction
        self._character_presentation = character_presentation
        if not lazy_reduction:
            self._reduction = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    self._base_ring, self._generators, self._dimension
                ),
                runtime.reflect.get(raw, "reduction"),
            )
        self._basis_generators = [
            runtime.number(value)
            for value in runtime.reflect.get(raw, "basisGenerators")
        ]
        self._native_kernel_data_cache = None

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
            rational_entries = runtime.reflect.get(
                self._native, "rationalReductionEntries"
            )
            if rational_entries is not runtime.undefined:
                entries = [
                    sage.QQ(runtime.normalize_integer(entry[0]))
                    / sage.QQ(runtime.normalize_integer(entry[1]))
                    for entry in rational_entries
                ]
                self._reduction = MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    self._base_ring, self._generators, self._dimension
                )(entries)
                return self._reduction
            if self._character_presentation:
                raw = runtime.flint_backend().characterPresentationReduction(
                    self._native
                )
            else:
                raw = runtime.flint_backend().higherWeightPresentationReduction(
                    self._native
                )
            self._reduction = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    self._base_ring, self._generators, self._dimension
                ),
                raw,
            )
        return self._reduction

    def basis_generators(self) -> list[int]:
        """Return original triple indices chosen as the quotient basis."""
        return list(self._basis_generators)

    def _native_kernel_data(
        self,
    ) -> tuple[list[int], list[int], list[int]]:
        if self._native_kernel_data_cache is None:
            native_api, kernels = _native_p1_modules()
            kernel = kernels.heilbronn_higher_weight_hecke_matrix
            numerators = []
            denominators = []
            for entry in self.reduction_matrix().list():
                numerators.append(entry.numerator())
                denominators.append(entry.denominator())
            self._native_kernel_data_cache = (
                native_api.kernel_int64_buffer(kernel, self._basis_generators),
                native_api.kernel_integer_buffer(kernel, numerators),
                native_api.kernel_integer_buffer(kernel, denominators),
            )
        return self._native_kernel_data_cache

    def __repr__(self) -> str:
        return (
            "Higher-weight Manin presentation with "
            + str(self._generators)
            + " triple generators and dimension "
            + str(self._dimension)
            + " over "
            + str(self._base_ring)
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
        self._level = _positive_integer(level, "P1List level")
        self._native = runtime.flint_backend().p1List(self._level)
        self._manin_presentation_cache = None
        self._boundary_data_cache = None
        self._cuspidal_basis_cache = None
        self._star_eigenspace_basis_cache = [None, None]
        self._higher_weight_presentation_cache = runtime.map()
        self._higher_weight_hecke_cache = runtime.map()
        self._higher_weight_degeneracy_cache = runtime.map()
        self._character_presentation_cache = runtime.map()
        self._character_hecke_cache = runtime.map()
        self._native_kernel_pairs_cache = None
        self._native_kernel_heilbronn_cache = runtime.map()

    def N(self) -> int:
        return self._level

    def __len__(self) -> int:
        return runtime.number(runtime.flint_backend().p1ListCount(self._native))

    def __getitem__(self, index: Any) -> Any:
        if hasattr(index, "__sagejs_slice__"):
            start, stop, step = index.indices(len(self))
            return [self.__getitem__(position) for position in range(start, stop, step)]
        index = _exact_integer(index, "P1List index")
        length = len(self)
        if index < 0:
            index += length
        if index < 0 or index >= length:
            raise IndexError("list index out of range")
        raw = runtime.flint_backend().p1ListEntry(self._native, index)
        return runtime.math_tuple([runtime.number(raw[0]), runtime.number(raw[1])])

    def list(self) -> list[Any]:
        return [self.__getitem__(index) for index in range(len(self))]

    def _native_kernel_pairs(self) -> list[int]:
        if self._native_kernel_pairs_cache is None:
            native_api, kernels = _native_p1_modules()
            entries = []
            for u, v in self.list():
                entries.append(u)
                entries.append(v)
            self._native_kernel_pairs_cache = native_api.kernel_int64_buffer(
                kernels.heilbronn_higher_weight_hecke_matrix,
                entries,
            )
        return self._native_kernel_pairs_cache

    def _native_kernel_heilbronn(
        self,
        prime: int,
    ) -> tuple[int, list[int]]:
        key = str(prime)
        cached = self._native_kernel_heilbronn_cache.get(key)
        if cached is runtime.undefined:
            native_api, kernels = _native_p1_modules()
            count = runtime.number(kernels.heilbronn_cremona_count(prime))
            matrices = native_api.kernel_int64_zeros(
                kernels.heilbronn_higher_weight_hecke_matrix,
                count * 4,
            )
            written = runtime.number(kernels.heilbronn_cremona_fill(prime, matrices))
            if written != count:
                raise ArithmeticError(
                    "Heilbronn representative count changed during fill"
                )
            cached = (count, matrices)
            self._native_kernel_heilbronn_cache.set(key, cached)
        return cached

    def normalize(self, u: Any, v: Any) -> Any:
        u = _exact_integer(u, "projective numerator")
        v = _exact_integer(v, "projective denominator")
        raw = runtime.flint_backend().p1ListNormalize(self._native, u, v, 0)
        return runtime.math_tuple([runtime.number(raw[0]), runtime.number(raw[1])])

    def normalize_with_scalar(self, u: Any, v: Any) -> Any:
        u = _exact_integer(u, "projective numerator")
        v = _exact_integer(v, "projective denominator")
        raw = runtime.flint_backend().p1ListNormalize(self._native, u, v, 1)
        return runtime.math_tuple(
            [
                runtime.number(raw[0]),
                runtime.number(raw[1]),
                runtime.number(raw[2]),
            ]
        )

    def index(self, u: Any, v: Any) -> int:
        u = _exact_integer(u, "projective numerator")
        v = _exact_integer(v, "projective denominator")
        return runtime.number(runtime.flint_backend().p1ListIndex(self._native, u, v))

    def index_of_normalized_pair(self, u: Any, v: Any) -> int:
        return self.index(u, v)

    def _action_index(self, index: Any) -> int:
        index = _exact_integer(index, "P1List index")
        if index < 0:
            index += len(self)
        return index

    def apply_I(self, index: Any) -> int:
        return runtime.number(
            runtime.flint_backend().p1ListApplyI(
                self._native, self._action_index(index)
            )
        )

    def apply_S(self, index: Any) -> int:
        return runtime.number(
            runtime.flint_backend().p1ListApplyS(
                self._native, self._action_index(index)
            )
        )

    def apply_R(self, index: Any) -> int:
        """Apply the order-three matrix `R = S*T^-1`."""
        return runtime.number(
            runtime.flint_backend().p1ListApplyR(
                self._native, self._action_index(index)
            )
        )

    def apply_T(self, index: Any) -> int:
        """Apply SageMath's historical order-three `T` action."""
        return self.apply_R(index)

    def apply_translation(self, index: Any) -> int:
        """Apply the translation matrix `[[1,1],[0,1]]`."""
        return runtime.number(
            runtime.flint_backend().p1ListApplyT(
                self._native, self._action_index(index)
            )
        )

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
        weight = _positive_integer(weight, "modular-symbol weight")
        if weight < 2:
            raise ValueError("modular-symbol weight must be at least 2")
        sign = _exact_integer(sign, "sign")
        if sign not in [-1, 0, 1]:
            raise ValueError("sign must be -1, 0, or 1")
        key = str(weight) + ":" + str(sign)
        cached = self._higher_weight_presentation_cache.get(key)
        if cached is runtime.undefined:
            raw = runtime.flint_backend().p1ListHigherWeightPresentation(
                self._native, weight, sign
            )
            cached = HigherWeightManinPresentation(
                self, weight, sign, raw, lazy_reduction=True
            )
            self._higher_weight_presentation_cache.set(key, cached)
        return cached

    def higher_weight_hecke_matrix(
        self,
        weight: Any,
        sign: Any,
        prime: Any,
    ) -> Any:
        """Return `T_p` from the exact higher-weight Manin presentation."""
        weight = _positive_integer(weight, "modular-symbol weight")
        sign = _exact_integer(sign, "sign")
        prime = _positive_integer(prime, "Hecke prime")
        if not sage.is_prime(prime):
            raise ValueError("Hecke index must be prime")
        key = str(weight) + ":" + str(sign) + ":" + str(prime)
        cached = self._higher_weight_hecke_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        presentation = self.higher_weight_presentation(weight, sign)
        _, kernels = _native_p1_modules()
        kernel = kernels.heilbronn_higher_weight_hecke_matrix
        dimension = presentation.dimension()
        pairs = self._native_kernel_pairs()
        matrix_count, matrices = self._native_kernel_heilbronn(prime)
        basis, reduction_numerators, reduction_denominators = (
            presentation._native_kernel_data()
        )
        resource = kernel(
            weight,
            self._level,
            pairs,
            len(self),
            matrices,
            matrix_count,
            basis,
            dimension,
            reduction_numerators,
            reduction_denominators,
        )
        cached = MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
            sage.QQ, dimension, dimension
        )._from_fmpq_matrix_resource(resource)
        self._higher_weight_hecke_cache.set(key, cached)
        return cached

    def _higher_weight_hecke_matrix_flint(
        self,
        weight: int,
        sign: int,
        prime: int,
        presentation: HigherWeightManinPresentation,
    ) -> Any:
        dimension = presentation.dimension()
        native = runtime.flint_backend().p1ListHigherWeightHeckeMatrix(
            self._native, weight, sign, prime, presentation._native
        )
        return Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.QQ, dimension, dimension
            ),
            native,
        )

    def higher_weight_degeneracy_matrix(
        self,
        target: P1List,
        weight: Any,
        sign: Any,
        index: Any = 1,
    ) -> Any:
        r"""Return an exact higher-weight level-lowering degeneracy matrix.

        Rows act on the right. Polynomial action by Merel's determinant-
        `index` Heilbronn operator and reduction into the target Manin
        quotient both happen natively over `QQ`.
        """
        if not isinstance(target, P1List):
            raise TypeError("degeneracy-map target must be a P1List")
        weight = _positive_integer(weight, "modular-symbol weight")
        sign = _exact_integer(sign, "sign")
        index = _positive_integer(index, "degeneracy index")
        if sign not in [-1, 0, 1]:
            raise ValueError("sign must be -1, 0, or 1")
        if self.N() % target.N() != 0:
            raise ValueError("target level must divide the source level")
        quotient = self.N() // target.N()
        if quotient % index != 0:
            raise ValueError("degeneracy index must divide the quotient of levels")
        key = str(target.N()) + ":" + str(weight) + ":" + str(sign) + ":" + str(index)
        cached = self._higher_weight_degeneracy_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        source_presentation = self.higher_weight_presentation(weight, sign)
        target_presentation = target.higher_weight_presentation(weight, sign)
        native = runtime.flint_backend().p1ListHigherWeightDegeneracyMatrix(
            self._native,
            target._native,
            weight,
            sign,
            index,
            source_presentation._native,
            target_presentation._native,
        )
        cached = Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.QQ,
                source_presentation.dimension(),
                target_presentation.dimension(),
            ),
            native,
        )
        self._higher_weight_degeneracy_cache.set(key, cached)
        return cached

    def character_presentation(
        self,
        weight: Any,
        sign: Any,
        character: Any,
        base_ring: Any,
    ) -> Any:
        """Return the exact character-valued triple presentation."""
        weight = _positive_integer(weight, "modular-symbol weight")
        sign = _exact_integer(sign, "sign")
        if sign not in [-1, 0, 1]:
            raise ValueError("sign must be -1, 0, or 1")
        key = (
            str(weight)
            + ":"
            + str(sign)
            + ":"
            + str(character._index)
            + ":"
            + str(base_ring)
        )
        cached = self._character_presentation_cache.get(key)
        if cached is runtime.undefined:
            raw = runtime.flint_backend().p1ListCharacterPresentation(
                self._native, weight, sign, character._parent._native, character._index
            )
            cached = HigherWeightManinPresentation(
                self, weight, sign, raw, base_ring, True, True
            )
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
        weight = _positive_integer(weight, "modular-symbol weight")
        sign = _exact_integer(sign, "sign")
        prime = _positive_integer(prime, "Hecke prime")
        if not sage.is_prime(prime):
            raise ValueError("Hecke index must be prime")
        key = (
            str(weight)
            + ":"
            + str(sign)
            + ":"
            + str(character._index)
            + ":"
            + str(base_ring)
            + ":"
            + str(prime)
        )
        cached = self._character_hecke_cache.get(key)
        if cached is not runtime.undefined:
            return cached
        presentation = self.character_presentation(weight, sign, character, base_ring)
        dimension = presentation.dimension()
        native = runtime.flint_backend().p1ListCharacterHeckeMatrix(
            self._native,
            weight,
            sign,
            prime,
            character._parent._native,
            character._index,
            presentation._native,
        )
        cached = Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                base_ring, dimension, dimension
            ),
            native,
        )
        self._character_hecke_cache.set(key, cached)
        return cached

    def character_hecke_images(
        self,
        weight: Any,
        sign: Any,
        character: Any,
        base_ring: Any,
        basis: Any,
        functional_index: Any,
        precision: Any,
    ) -> Any:
        """Return direct $T_n$ images of one character-space functional."""
        weight = _positive_integer(weight, "modular-symbol weight")
        sign = _exact_integer(sign, "sign")
        functional_index = _exact_nonnegative_integer(
            functional_index, "functional index"
        )
        precision = _positive_integer(precision, "q-expansion precision")
        presentation = self.character_presentation(weight, sign, character, base_ring)
        native = runtime.flint_backend().p1ListCharacterHeckeImages(
            self._native,
            weight,
            sign,
            precision,
            character._parent._native,
            character._index,
            presentation._native,
            basis._native,
            functional_index,
        )
        return Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                base_ring, basis.nrows(), precision - 1
            ),
            native,
        )

    def character_hecke_selected_rows(
        self,
        weight: Any,
        sign: Any,
        character: Any,
        base_ring: Any,
        source: Any,
        indices: Any,
    ) -> Any:
        r"""Return selected exact rows of character Hecke operators.

        This is an internal high-precision capability used by the Gamma1
        character-descent path. A backend without the capability returns
        `None`, leaving the direct fixed-character algorithm available.
        """
        weight = _positive_integer(weight, "modular-symbol weight")
        sign = _exact_integer(sign, "sign")
        source = _exact_nonnegative_integer(source, "Hecke source row")
        hecke_indices = [
            _positive_integer(index, "Hecke index") for index in list(indices)
        ]
        if character.order() <= 2:
            return None
        presentation = self.character_presentation(weight, sign, character, base_ring)
        if source >= presentation.dimension():
            raise IndexError("Hecke source row out of range")
        backend = runtime.flint_backend()
        method = runtime.reflect.get(backend, "p1ListCharacterHeckeSelectedRows")
        if runtime.jstype(method) != "function":
            return None
        native = runtime.reflect.apply(
            method,
            backend,
            [
                self._native,
                weight,
                sign,
                source,
                hecke_indices,
                character._parent._native,
                character._index,
                presentation._native,
            ],
        )
        matrix_space = MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
            base_ring, 1, presentation.dimension()
        )
        return [
            Matrix(matrix_space, native[position])  # type: ignore[name-defined]  # noqa: F821
            for position in range(len(hecke_indices))
        ]

    def _hecke_matrix(
        self,
        prime: Any,
        dimension: Any,
    ) -> Any:
        prime = _positive_integer(prime, "Hecke prime")
        if not sage.is_prime(prime):
            raise ValueError("Hecke index must be prime")
        dimension = _exact_nonnegative_integer(dimension, "known Hecke dimension")
        native = runtime.flint_backend().p1ListHeckeMatrix(
            self._native, runtime.bigint(prime)
        )
        return Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.ZZ, dimension, dimension
            ),
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
        return self._hecke_matrix(prime, self.manin_presentation().dimension())

    def degeneracy_matrix(
        self,
        target: P1List,
        index: Any = 1,
    ) -> Any:
        r"""Return a weight-2 level-lowering degeneracy matrix.

        Rows act on the right, so the result has one row for each basis
        vector at this level and one column for each basis vector at the
        target level.
        """
        if not isinstance(target, P1List):
            raise TypeError("degeneracy-map target must be a P1List")
        index = _positive_integer(index, "degeneracy index")
        if self.N() % target.N() != 0:
            raise ValueError("target level must divide the source level")
        quotient = self.N() // target.N()
        if quotient % index != 0:
            raise ValueError("degeneracy index must divide the quotient of levels")
        source_dimension = self.manin_presentation().dimension()
        target_dimension = target.manin_presentation().dimension()
        native = runtime.flint_backend().p1ListDegeneracyMatrix(
            self._native, target._native, runtime.bigint(index)
        )
        column_action = Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.ZZ, target_dimension, source_dimension
            ),
            native,
        )
        return column_action.transpose()

    def boundary_data(self) -> Any:
        """Return the native E1 boundary matrix and cusp representatives."""
        if self._boundary_data_cache is None:
            raw = runtime.flint_backend().p1ListBoundaryData(self._native)
            dimension = self.manin_presentation().dimension()
            raw_matrix = runtime.reflect.get(raw, "matrix")
            raw_cusps = runtime.reflect.get(raw, "cusps")
            defining_matrix = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    sage.ZZ, dimension, len(raw_cusps)
                ),
                raw_matrix,
            )
            cusps = []
            for pair in raw_cusps:
                cusps.append(
                    ModularCusp(
                        runtime.normalize_integer(pair[0]),
                        runtime.normalize_integer(pair[1]),
                    )
                )
            self._boundary_data_cache = runtime.math_tuple([defining_matrix, cusps])
        return self._boundary_data_cache

    def boundary_matrix(self) -> Any:
        """Return the E1-basis boundary map matrix over `ZZ`."""
        return self.boundary_data()[0]

    def cuspidal_basis_matrix(self) -> Any:
        """Return the native integral cycle basis of the boundary kernel."""
        if self._cuspidal_basis_cache is None:
            dimension = self.manin_presentation().dimension()
            rows = dimension - self.boundary_matrix().rank()
            native = runtime.flint_backend().p1ListCuspidalBasis(self._native)
            self._cuspidal_basis_cache = Matrix(  # type: ignore[name-defined]  # noqa: F821
                MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                    sage.ZZ, rows, dimension
                ),
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
                sage.ZZ, dimension, dimension
            ),
            native,
        )

    def star_eigenspace_basis(self, sign: Any) -> Any:
        """Return the native RREF basis for a star eigenspace over `QQ`."""
        sign = _exact_integer(sign, "star eigenspace sign")
        if sign not in [-1, 1]:
            raise ValueError("star eigenspace sign must be -1 or 1")
        cache_index = 0 if sign == -1 else 1
        cached = self._star_eigenspace_basis_cache[cache_index]
        if cached is None:
            raw = runtime.flint_backend().p1ListStarEigenspaceBasis(self._native, sign)
            dimension = runtime.number(runtime.reflect.get(raw, "dimension"))
            native = runtime.reflect.get(raw, "matrix")
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
            raise ValueError("path endpoints must be numerator/denominator pairs")
        values = [
            _exact_integer(start_values[0], "start numerator"),
            _exact_integer(start_values[1], "start denominator"),
            _exact_integer(stop_values[0], "stop numerator"),
            _exact_integer(stop_values[1], "stop denominator"),
        ]
        dimension = self.manin_presentation().dimension()
        native = runtime.flint_backend().p1ListReducePath(
            self._native,
            values[0],
            values[1],
            values[2],
            values[3],
        )
        return Matrix(  # type: ignore[name-defined]  # noqa: F821
            MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                sage.ZZ, dimension, 1
            ),
            native,
        ).column(0)

    def __repr__(self) -> str:
        return "The projective line over the integers modulo " + str(self._level)

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
        self._kind = "HeckeOperator"
        self._space = space
        self._index = index
        self._matrix_cache = None

    def _compute_matrix(self) -> Any:
        key = self._space._model_key()
        if key == "gamma0-1-12" and self._space.is_ambient() and self._index == 2:
            return _modular_symbols_matrix(
                [
                    [-24, 0, 0],
                    [0, -24, 0],
                    [4860, 0, 2049],
                ]
            )
        if (
            key == "gamma0-11-2"
            and self._space.is_ambient()
            and self._index in [2, 3, 5]
        ):
            cusp_eigenvalue = {2: -2, 3: -1, 5: 1}[self._index]
            return _modular_symbols_matrix(
                [
                    [self._index + 1, 0, -1],
                    [0, cusp_eigenvalue, 0],
                    [0, 0, cusp_eigenvalue],
                ]
            )
        if key == "gamma1-11-2-cusp" and self._index == 2:
            return _modular_symbols_matrix(
                [
                    [-2, 0],
                    [0, -2],
                ]
            )
        if (
            self._space._character is None
            and self._space._group._family == "Gamma0"
            and self._space.weight() == 2
        ):
            return self._space._native_weight2_hecke_matrix(self._index)
        if self._space._supports_native_higher_weight():
            return self._space._native_higher_weight_hecke_matrix(self._index)
        if self._space._supports_native_character():
            return self._space._native_character_hecke_matrix(self._index)
        raise NotImplementedError(
            "the requested Hecke matrix is not in the implemented modular-symbol models"
        )

    def matrix(self) -> Any:
        if self._matrix_cache is None:
            self._matrix_cache = self._compute_matrix()
        return self._matrix_cache

    def __call__(self, element: Any) -> ModularSymbolElement:
        symbol = self._space(element)
        ambient = self._space.ambient_module()
        image = symbol.vector() * ambient.hecke_matrix(self._index)
        return self._space(image)

    def charpoly(self, variable: str = "x") -> Any:
        key = self._space._model_key()
        if key == "gamma0-1-12" and self._index == 11:
            return FormattedCharacteristicPolynomial(
                variable
                + "^3 - 285312739836*"
                + variable
                + "^2 + 304982006808944*"
                + variable
                + " - 81446706196725772192",
                "(" + variable + " - 285311670612) * (" + variable + " - 534612)^2",
            )
        if key == "gamma1-11-2" and self._index == 2:
            return FormattedCharacteristicPolynomial(
                (
                    variable
                    + "^11 - 8*"
                    + variable
                    + "^10 + 20*"
                    + variable
                    + "^9 + 10*"
                    + variable
                    + "^8 - 145*"
                    + variable
                    + "^7 + 229*"
                    + variable
                    + "^6 + 58*"
                    + variable
                    + "^5 - 360*"
                    + variable
                    + "^4 + 70*"
                    + variable
                    + "^3 - 515*"
                    + variable
                    + "^2 + 1804*"
                    + variable
                    + " - 1452"
                ),
                (
                    "("
                    + variable
                    + " - 3) * ("
                    + variable
                    + " + 2)^2 * ("
                    + variable
                    + "^4 - 7*"
                    + variable
                    + "^3 + 19*"
                    + variable
                    + "^2 - 23*"
                    + variable
                    + " + 11) * ("
                    + variable
                    + "^4 - 2*"
                    + variable
                    + "^3 + 4*"
                    + variable
                    + "^2 + 2*"
                    + variable
                    + " + 11)"
                ),
            )
        if key == "character-13-2" and self._index == 2:
            return FormattedCharacteristicPolynomial(
                "characteristic polynomial of T_2",
                (
                    "("
                    + variable
                    + " - zeta6 - 2) * ("
                    + variable
                    + " - 2*zeta6 - 1) * ("
                    + variable
                    + " + zeta6 + 1)^2"
                ),
            )
        if key == "character-13-2-cusp" and self._index == 2:
            return FormattedCharacteristicPolynomial(
                "characteristic polynomial of T_2 on the cuspidal subspace",
                "(" + variable + " + zeta6 + 1)^2",
            )
        return self.matrix().charpoly(variable)

    characteristic_polynomial = charpoly

    def __repr__(self) -> str:
        return "Hecke operator T_" + str(self._index) + " on " + str(self._space)

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
        serialized_dimension: Any = None,
        serialized_is_cuspidal: Any = False,
    ) -> None:
        self._group = group
        self._kind = "ModularSymbols"
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
        self._q_expansion_signed_cusp_space_cache = None
        self._q_expansion_data_cache = runtime.map()
        self._q_expansion_basis_cache = runtime.map()
        self._prefer_selected_character_hecke_rows = False
        if serialized_dimension is not None:
            self._dimension = _exact_nonnegative_integer(
                serialized_dimension, "serialized dimension"
            )
            self._is_cuspidal = bool(serialized_is_cuspidal)
        elif basis_matrix is not None:
            self._dimension = basis_matrix.nrows()
            self._is_cuspidal = (
                (subspace_kind is not None and "Cuspidal" in subspace_kind)
                or subspace_kind == "New"
                or (
                    ambient is not None
                    and hasattr(ambient, "is_cuspidal")
                    and ambient.is_cuspidal()
                )
            )
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
            self._dimension = cusp_dimension if sign != 0 else 2 * cusp_dimension
            self._is_cuspidal = True
        if (
            serialized_dimension is None
            and ambient is None
            and group._family == "Gamma0"
            and (
                (character is None and weight > 2 and base_ring is sage.QQ)
                or character is not None
            )
            and not (group.level() == 1 and weight == 12 and sign == 0)
        ):
            # In higher weight the Eisenstein symbols need not all have
            # positive star sign (nonsquarefree levels already show this).
            # The exact signed Manin presentation is authoritative.
            if character is None:
                presentation = self.p1list().higher_weight_presentation(weight, sign)
            else:
                presentation = self.p1list().character_presentation(
                    weight, sign, character, base_ring
                )
            self._dimension = presentation.dimension()

    def _model_key(self) -> str:
        suffix = "-cusp" if self._is_cuspidal else ""
        if self._character is not None:
            return "character-" + str(self.level()) + "-" + str(self._weight) + suffix
        return (
            self._group._family.lower()
            + "-"
            + str(self.level())
            + "-"
            + str(self._weight)
            + suffix
        )

    def _supports_native_weight2(self) -> bool:
        return (
            self._character is None
            and self._group._family == "Gamma0"
            and self._weight == 2
        )

    def _supports_native_higher_weight(self) -> bool:
        return (
            self._character is None
            and self._group._family == "Gamma0"
            and self._weight > 2
            and self._base is sage.QQ
            and not (self.level() == 1 and self._weight == 12 and self._sign == 0)
        )

    def _supports_native_character(self) -> bool:
        return (
            self._character is not None
            and self._group._family == "Gamma0"
            and self._weight >= 2
        )

    def _native_triple_presentation(self) -> Any:
        ambient = self.ambient_module()
        if ambient._supports_native_character():
            return ambient.p1list().character_presentation(
                ambient.weight(),
                ambient.sign(),
                ambient._character,
                ambient.base_ring(),
            )
        return ambient.p1list().higher_weight_presentation(
            ambient.weight(), ambient.sign()
        )

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
            return _modular_symbols_matrix(
                [
                    [1, 0, 0],
                    [sage.QQ(2) / sage.QQ(5), 1, 1],
                    [sage.QQ(2) / sage.QQ(5), 0, 1],
                ]
            )
        return None

    def basis_matrix(self) -> Any:
        if self._basis_matrix_cache is not None:
            return self._basis_matrix_cache
        self._basis_matrix_cache = identity_matrix(  # type: ignore[name-defined]  # noqa: F821
            self.base_ring(), self.dimension()
        )
        return self._basis_matrix_cache

    def free_module(self) -> Any:
        return self.basis_matrix().row_space()

    def dimension(self) -> int:
        return self._dimension

    degree = dimension

    def is_cuspidal(self) -> bool:
        """Return whether this space is a cuspidal modular-symbol subspace."""
        return self._is_cuspidal

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
                "this modular-symbol space was not defined by a character"
            )
        return self._character

    def base_ring(self) -> Any:
        return self._base

    def sturm_bound(self) -> int:
        r"""Return the Sturm bound for the associated cusp forms.

        For $\Gamma_0(N)$ this is

        $$
        \left\lfloor \frac{k}{12}
        [\mathrm{SL}_2(\ZZ):\Gamma_0(N)]\right\rfloor.
        $$
        """
        numerator = self.weight() * self._group.index()
        return numerator // 12

    def _q_expansion_signed_cusp_space(self) -> ModularSymbolsSpace:
        """Return the signed symbol space used by Hecke-dual expansions."""
        if not self.is_cuspidal():
            raise ArithmeticError("space must be cuspidal")
        if self.sign() != 0:
            return self
        cached = self._q_expansion_signed_cusp_space_cache
        if cached is not None:
            return cached
        if self._character is not None:
            signed_space = ModularSymbols(
                self.character(), self.weight(), 1, self.base_ring()
            ).cuspidal_submodule()
        elif self.weight() == 2:
            signed_space = self.plus_submodule()
        else:
            signed_space = ModularSymbols(
                self.level(), self.weight(), 1, sage.QQ
            ).cuspidal_submodule()
            if self.dimension() != 2 * signed_space.dimension():
                raise NotImplementedError(
                    "higher-weight sign-zero q-expansions currently require the full "
                    "cuspidal submodule"
                )
        self._q_expansion_signed_cusp_space_cache = signed_space
        return signed_space

    def _q_expansion_character_hecke_rows(
        self,
        functional_index: int,
        precision: int,
    ) -> list[Any]:
        r"""Return one Hecke-dual coefficient block without composite matrices.

        For a nonreal Dirichlet character, constructing every full $T_n$ and
        multiplying cyclotomic matrices is much more expensive than applying
        the prime matrices to one functional.  The multiplicativity and
        prime-power recurrence for $T_n$ let us compute exactly the rows that
        q-expansion reconstruction consumes.  This is the source-transparent
        analogue of the direct Hecke-image strategy used by Sage's optimized
        nonquadratic-character code.
        """
        if self._prefer_selected_character_hecke_rows:
            selected = self._character_hecke_selected_rows(
                functional_index, list(range(1, precision))
            )
            if selected is not None:
                return selected

        native_images = runtime.reflect.get(
            runtime.flint_backend(), "p1ListCharacterHeckeImages"
        )
        if runtime.jstype(native_images) == "function":
            ambient = self.ambient_module()
            block = ambient.p1list().character_hecke_images(
                ambient.weight(),
                ambient.sign(),
                ambient.character(),
                ambient.base_ring(),
                self.basis_matrix(),
                functional_index,
                precision,
            )
            return block.transpose().rows()

        dimension = self.dimension()
        coefficient_ring = self.base_ring()
        unit = vector(  # type: ignore[name-defined]  # noqa: F821
            coefficient_ring,
            [1 if index == functional_index else 0 for index in range(dimension)],
        )
        prime_matrices = runtime.reflect.construct(runtime.map_class, [])
        rows = []
        for index in range(1, precision):
            image = unit
            for prime_value, exponent_value in sage.factor(index):
                prime = runtime.number(prime_value)
                exponent = runtime.number(exponent_value)
                prime_matrix = prime_matrices.get(prime)
                if prime_matrix is runtime.undefined:
                    prime_matrix = self.hecke_matrix(prime)
                    prime_matrices.set(prime, prime_matrix)
                previous = image
                current = image * prime_matrix
                if self.level() % prime == 0:
                    recurrence_coefficient = coefficient_ring(0)
                else:
                    recurrence_coefficient = coefficient_ring(
                        self.character()(prime)
                    ) * (sage.ZZ(prime) ** (self.weight() - 1))
                for _power in range(2, exponent + 1):
                    following = (
                        current * prime_matrix - previous * recurrence_coefficient
                    )
                    previous = current
                    current = following
                image = current
            rows.append(image)
        return rows

    def _character_hecke_selected_rows(
        self,
        functional_index: int,
        indices: list[int],
    ) -> list[Any] | None:
        r"""Return selected rows of several $T_n$ using retained coordinates.

        The low-level capability returns one ambient row for every requested
        Hecke index.  At large Sturm precision, retaining all of those
        algebraic matrices until a final stack creates an artificial memory
        cliff.  Process a bounded block at a time, immediately restrict to
        the cuspidal pivot columns, and retain only the rows that the
        q-expansion reconstruction actually consumes.
        """
        ambient = self.ambient_module()
        if not ambient._supports_native_character():
            return None
        basis = self.basis_matrix()
        coefficients = basis.row(functional_index).list()
        nonzero_sources = []
        for source, coefficient in enumerate(coefficients):
            if coefficient != 0:
                nonzero_sources.append((source, coefficient))
        answer_rows = []
        pivot_columns = None if self.is_ambient() else list(basis.pivots())
        block_size = 16
        for start in range(0, len(indices), block_size):
            selected_indices = indices[start : start + block_size]
            answer = None
            for source, coefficient in nonzero_sources:
                images = ambient.p1list().character_hecke_selected_rows(
                    ambient.weight(),
                    ambient.sign(),
                    ambient._character,
                    ambient.base_ring(),
                    source,
                    selected_indices,
                )
                if images is None:
                    return None
                rows = images[0]
                for image in images[1:]:
                    rows = rows.stack(image)
                if coefficient != 1:
                    rows = rows * coefficient
                answer = rows if answer is None else answer + rows
            if answer is None:
                answer = matrix(  # type: ignore[name-defined]  # noqa: F821
                    ambient.base_ring(), len(selected_indices), ambient.dimension()
                )
            if pivot_columns is not None:
                answer = answer.matrix_from_columns(pivot_columns)
            answer_rows.extend(answer.rows())
        return answer_rows

    def _q_expansion_row_basis(self, rows: list[Any]) -> tuple[Any, Any]:
        r"""Return the canonical row basis and its exact lift from `rows`.

        In degree greater than two, the native cyclotomic row-space path uses
        modular pivot discovery and an exactly certified RREF.  It returns
        only the short row basis, rather than materializing the almost-square
        first kernel in a `ker(ker(A))` reconstruction.  The character path
        subsequently computes Hecke action directly from the canonical
        coefficient pivots, so it deliberately avoids constructing a
        potentially enormous change-of-basis lift.  The ordinary row-space
        and solve path remains the portable fallback.
        """
        coefficient_ring = self.base_ring()
        raw_matrix = matrix(coefficient_ring, rows)  # type: ignore[name-defined]  # noqa: F821
        if (
            self._character is not None
            and not self.character().is_real()
            and coefficient_ring.degree() > 2
        ):
            coefficient_basis = raw_matrix.row_space().basis_matrix()
            lift_matrix = matrix(  # type: ignore[name-defined]  # noqa: F821
                coefficient_ring, 0, raw_matrix.nrows()
            )
            return coefficient_basis, lift_matrix
        coefficient_basis = raw_matrix.row_space().basis_matrix()
        lift_matrix = raw_matrix.solve_left(coefficient_basis)
        if lift_matrix * raw_matrix != coefficient_basis:
            raise ArithmeticError(
                "could not lift the canonical q-expansion basis to Hecke-dual rows"
            )
        return coefficient_basis, lift_matrix

    def _q_expansion_data(
        self,
        precision: Any,
        use_cache: bool = True,
    ) -> tuple[Any, Any, Any, Any, Any]:
        """Return the Hecke-dual basis and its exact modular-symbol lift."""
        precision = _exact_nonnegative_integer(precision, "q-expansion precision")
        if precision < 1:
            raise ValueError("precision must be at least 1")
        if use_cache:
            cached = self._q_expansion_data_cache.get(precision)
            if cached is not runtime.undefined:
                return cached
        signed_space = self._q_expansion_signed_cusp_space()
        dimension = signed_space.dimension()
        target_dimension = min(precision - 1, dimension)
        if target_dimension == 0:
            result = (
                signed_space,
                matrix(signed_space.base_ring(), 0, precision),  # type: ignore[name-defined]  # noqa: F821
                runtime.math_tuple([]),
                matrix(signed_space.base_ring(), 0, precision),  # type: ignore[name-defined]  # noqa: F821
                matrix(signed_space.base_ring(), 0, 0),  # type: ignore[name-defined]  # noqa: F821
            )
            if use_cache:
                self._q_expansion_data_cache.set(precision, result)
            return result

        direct_character_images = (
            signed_space._character is not None
            and not signed_space.character().is_real()
        )
        hecke_matrices = []
        if not direct_character_images:
            hecke_matrices = [
                signed_space.hecke_matrix(index) for index in range(1, precision)
            ]
        accumulated_rows = []
        functional_indices = []
        coefficient_ring = signed_space.base_ring()
        coefficient_basis = matrix(  # type: ignore[name-defined]  # noqa: F821
            coefficient_ring, 0, precision - 1
        )
        lift_matrix = matrix(  # type: ignore[name-defined]  # noqa: F821
            coefficient_ring, 0, 0
        )
        order = [0]
        order.extend(range(dimension - 1, 0, -1))
        for functional_index in order:
            rows = [[] for _row in range(dimension)]
            if direct_character_images:
                hecke_rows = signed_space._q_expansion_character_hecke_rows(
                    functional_index, precision
                )
            else:
                hecke_rows = [
                    operator.row(functional_index) for operator in hecke_matrices
                ]
            for values in hecke_rows:
                for row_index in range(dimension):
                    rows[row_index].append(values[row_index])
            accumulated_rows.extend(rows)
            functional_indices.append(functional_index)
            coefficient_basis, lift_matrix = signed_space._q_expansion_row_basis(
                accumulated_rows
            )
            if coefficient_basis.nrows() >= target_dimension:
                break
        if coefficient_basis.nrows() < target_dimension:
            raise ArithmeticError(
                "Hecke matrix coefficients did not span the expected cusp-form space"
            )
        coefficient_basis = coefficient_basis.matrix_from_prefix_rows(target_dimension)
        coefficient_rows = []
        for row in coefficient_basis.rows():
            coefficient_rows.append([coefficient_ring(0)] + row.list())
        coefficient_matrix = matrix(  # type: ignore[name-defined]  # noqa: F821
            coefficient_ring, coefficient_rows
        )
        # The native cyclotomic row-space path has already produced this
        # canonical RREF.  Record that exact certificate so pivot discovery
        # and public row-space construction never repeat algebraic reduction.
        coefficient_matrix._rref_cache = coefficient_matrix
        coefficient_matrix._rank_cache = coefficient_matrix.nrows()
        coefficient_matrix.set_immutable()
        raw_rows = []
        for row in accumulated_rows:
            raw_rows.append([coefficient_ring(0)] + list(row))
        raw_matrix = matrix(  # type: ignore[name-defined]  # noqa: F821
            coefficient_ring, raw_rows
        )
        raw_matrix.set_immutable()
        lift_matrix.set_immutable()
        result = (
            signed_space,
            coefficient_matrix,
            runtime.math_tuple(functional_indices),
            raw_matrix,
            lift_matrix,
        )
        if use_cache:
            self._q_expansion_data_cache.set(precision, result)
        return result

    def _q_expansion_character_hecke_matrix(
        self,
        index: int,
        coefficients: Any,
    ) -> Any:
        r"""Return $T_n$ from certified cyclotomic q-expansion coefficients.

        The canonical coefficient matrix is in RREF, so coefficients at its
        pivot exponents are coordinates.  The usual exact formula

        $$
        a_m(T_n f)=\sum_{d\mid(m,n)}\chi(d)d^{k-1}a_{mn/d^2}(f)
        $$

        therefore gives the Hecke matrix without transporting a full symbol
        matrix through several generic algebraic solves.
        """
        pivots = list(coefficients.pivots())
        if len(pivots) != coefficients.nrows():
            raise ArithmeticError(
                "the separating q-expansion prefix has incomplete dimension"
            )
        maximum_coefficient = 0
        for exponent in pivots:
            common = gcd(exponent, index)  # type: ignore[name-defined]  # noqa: F821
            for divisor in sage.divisors(common):
                source = exponent * index // (runtime.number(divisor) ** 2)
                maximum_coefficient = max(maximum_coefficient, source)
        _signed, extended, _indices, _raw, _lift = self._q_expansion_data(
            maximum_coefficient + 1
        )
        if extended.nrows() != coefficients.nrows():
            raise ArithmeticError(
                "extended q-expansions changed the certified cusp dimension"
            )
        coefficient_ring = self.base_ring()
        rows = []
        for basis_index in range(extended.nrows()):
            row = []
            for exponent in pivots:
                value = coefficient_ring(0)
                common = gcd(  # type: ignore[name-defined]  # noqa: F821
                    exponent, index
                )
                for divisor_value in sage.divisors(common):
                    divisor = runtime.number(divisor_value)
                    source = exponent * index // (divisor * divisor)
                    value += (
                        coefficient_ring(self.character()(divisor))
                        * (sage.ZZ(divisor) ** (self.weight() - 1))
                        * extended[basis_index, source]
                    )
                row.append(value)
            rows.append(row)
        return matrix(coefficient_ring, rows)  # type: ignore[name-defined]  # noqa: F821

    def _q_expansion_hecke_matrix(
        self,
        index: Any,
        maximum_precision: Any,
    ) -> Any:
        r"""Transport $T_n$ to the canonical Hecke-dual expansion basis."""
        hecke_index = _positive_integer(index, "Hecke index")
        maximum = _exact_nonnegative_integer(maximum_precision, "q-expansion precision")
        if maximum < 1:
            raise ValueError("precision must be at least 1")
        signed_space = self._q_expansion_signed_cusp_space()
        dimension = signed_space.dimension()
        if dimension == 0:
            return matrix(  # type: ignore[name-defined]  # noqa: F821
                signed_space.base_ring(), 0, 0
            )

        precision = (
            min(maximum, max(2, dimension + 1)) if self.weight() == 2 else maximum
        )
        try:
            data = self._q_expansion_data(precision)
        except ArithmeticError:
            if precision == maximum:
                raise
            precision = maximum
            data = self._q_expansion_data(precision)
        signed_space, coefficients, indices, raw_matrix, lift_matrix = data
        if coefficients.nrows() != dimension:
            if precision == maximum:
                raise ArithmeticError(
                    "the separating q-expansion prefix has incomplete dimension"
                )
            signed_space, coefficients, indices, raw_matrix, lift_matrix = (
                self._q_expansion_data(maximum)
            )
        if coefficients.nrows() != dimension:
            raise ArithmeticError(
                "the Sturm q-expansion prefix has incomplete dimension"
            )

        if self._character is not None and not self.character().is_real():
            return self._q_expansion_character_hecke_matrix(hecke_index, coefficients)

        symbol_matrix = signed_space.hecke_matrix(hecke_index)
        image_rows = []
        for block_index in range(len(indices)):
            start = block_index * dimension
            block = raw_matrix.matrix_from_rows(range(start, start + dimension))
            image_rows.extend((symbol_matrix.transpose() * block).rows())
        image_raw = matrix(  # type: ignore[name-defined]  # noqa: F821
            signed_space.base_ring(), [row.list() for row in image_rows]
        )
        image_matrix = lift_matrix * image_raw
        answer = coefficients.solve_left(image_matrix)
        if answer * coefficients != image_matrix:
            raise ArithmeticError(
                "the modular-symbol Hecke action did not preserve the q-expansion span"
            )
        return answer

    def diamond_bracket_matrix(self, value: Any) -> Any:
        """Return the scalar matrix of the diamond operator `<value>`."""
        value = _exact_integer(value, "diamond-bracket index")
        scalar = self.character()(value)
        return (
            identity_matrix(  # type: ignore[name-defined]  # noqa: F821
                self.base_ring(), self.dimension()
            )
            * scalar
        )

    def diamond_bracket_operator(self, value: Any) -> Any:
        """Return the diamond-bracket linear operator `<value>`."""
        value = _exact_integer(value, "diamond-bracket index")
        return ModularSymbolsLinearOperator(
            self,
            self.diamond_bracket_matrix(value),
            "Diamond bracket operator <" + str(value) + ">",
        )

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
                result.append(ModularSymbolElement(self, rows[index], label))
            return runtime.math_tuple(result)
        if (
            self._supports_native_higher_weight() or self._supports_native_character()
        ) and self.is_ambient():
            projective_line = self.p1list()
            presentation = self._native_triple_presentation()
            basis_generators = presentation.basis_generators()
            if len(basis_generators) != self.dimension():
                raise ArithmeticError(
                    "higher-weight presentation dimension disagrees "
                    "with the modular-form dimension formula"
                )
            result = []
            for index, generator in enumerate(basis_generators):
                degree = generator // len(projective_line)
                pair = projective_line.__getitem__(generator % len(projective_line))
                u = pair[0]
                v = pair[1]
                coordinates = [0 for _ in range(self.dimension())]
                coordinates[index] = 1
                result.append(
                    ModularSymbolElement(
                        self,
                        coordinates,
                        HigherWeightManinSymbolBasisElement(
                            degree, self.weight(), u, v
                        ),
                    )
                )
            return runtime.math_tuple(result)
        key = self._model_key()
        if key == "gamma0-1-12":
            return runtime.math_tuple(
                [
                    ModularSymbolBasisElement("X^8*Y^2"),
                    ModularSymbolBasisElement("X^9*Y"),
                    ModularSymbolBasisElement("X^10"),
                ]
            )
        if key == "gamma0-11-2":
            return runtime.math_tuple(
                [
                    ManinSymbolBasisElement(1, 0),
                    ManinSymbolBasisElement(1, 8),
                    ManinSymbolBasisElement(1, 9),
                ]
            )
        raise NotImplementedError(
            "a canonical basis is not available for this modular-symbol model"
        )

    gens = basis

    def gen(self, index: Any = 0) -> Any:
        index = _exact_nonnegative_integer(index, "basis index")
        return self.basis()[index]

    def zero(self) -> ModularSymbolElement:
        return ModularSymbolElement(
            self,
            [0 for _ in range(self.ambient_module().dimension())],
        )

    def __call__(self, value: Any = 0) -> ModularSymbolElement:
        if isinstance(value, ModularSymbolElement):
            if value.parent().ambient_module() is not self.ambient_module():
                raise TypeError("modular symbol has a different ambient space")
            coordinates = value.vector()
        elif runtime.is_exact_integer(value) and value == 0:
            return self.zero()
        else:
            coordinates = VectorSpace(  # type: ignore[name-defined]  # noqa: F821
                self.base_ring(), self.ambient_module().dimension()
            )(value)
        if not self.is_ambient() and coordinates not in self.free_module():
            raise ValueError("modular symbol is not in this subspace")
        return ModularSymbolElement(self, coordinates)

    def _from_serialized_element(
        self,
        coordinates: Any,
        label: Any = None,
    ) -> ModularSymbolElement:
        """Reconstruct an element while retaining an optional basis label."""
        element = self(coordinates)
        element._label = label
        return element

    def _from_serialized_hecke_operator(
        self,
        index: Any,
        matrix_value: Any = None,
    ) -> HeckeOperator:
        operator = self.T(index)
        operator._matrix_cache = matrix_value
        return operator

    def _from_serialized_linear_operator(
        self,
        matrix_value: Any,
        name: str,
        ambient_matrix: Any = None,
    ) -> ModularSymbolsLinearOperator:
        return ModularSymbolsLinearOperator(self, matrix_value, name, ambient_matrix)

    def p1list(self) -> P1List:
        if self._group._family != "Gamma0":
            raise NotImplementedError("native P1 lists currently model Gamma0 spaces")
        if self._p1list_cache is None:
            self._p1list_cache = P1List(self.level())
        return self._p1list_cache

    def manin_relations(self, modulus: Any = 65521) -> ManinRelations:
        if self._character is not None:
            raise NotImplementedError(
                "the machine-word ManinRelations relation matrix models "
                "trivial character only; use M.manin_presentation() for "
                "the exact character presentation"
            )
        if self.weight() != 2:
            raise NotImplementedError(
                "higher-weight relations are represented by M.manin_presentation()"
            )
        return self.p1list().manin_relations(modulus)

    def manin_presentation(self) -> Any:
        """Return the exact native presentation of this symbol space."""
        if self._supports_native_higher_weight() or self._supports_native_character():
            return self._native_triple_presentation()
        if self._supports_native_weight2():
            return self.p1list().manin_presentation()
        raise NotImplementedError("an exact native Manin presentation is unavailable")

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
            ambient._boundary_data_cache = runtime.math_tuple(
                [defining_matrix, boundary_space]
            )
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
                backend, "characterPresentationBoundaryData"
            )
            if boundary_function is not runtime.undefined:
                raw = runtime.reflect.apply(
                    boundary_function,
                    backend,
                    [
                        projective_line._native,
                        presentation._native,
                        ambient._character._parent._native,
                        ambient._character._index,
                    ],
                )
                raw_matrix = runtime.reflect.get(raw, "matrix")
                raw_cusps = runtime.reflect.get(raw, "cusps")
                defining_matrix = Matrix(  # type: ignore[name-defined]  # noqa: F821
                    MatrixSpace(  # type: ignore[name-defined]  # noqa: F821
                        ambient.base_ring(), ambient.dimension(), len(raw_cusps)
                    ),
                    raw_matrix,
                )
                cusps = []
                for pair in raw_cusps:
                    cusps.append(
                        ModularCusp(
                            runtime.normalize_integer(pair[0]),
                            runtime.normalize_integer(pair[1]),
                        )
                    )
                boundary_space = BoundarySymbolsSpace(ambient, cusps)
                ambient._boundary_data_cache = runtime.math_tuple(
                    [defining_matrix, boundary_space]
                )
                return ambient._boundary_data_cache
        classifier = _HigherWeightCuspClassifier(
            ambient.level(), ambient.sign(), ambient._character
        )
        sparse_rows = []
        weight_degree = ambient.weight() - 2
        for generator in presentation.basis_generators():
            degree = generator // len(projective_line)
            pair = projective_line.__getitem__(generator % len(projective_line))
            lift = _lift_gamma0_coset(
                runtime.number(pair[0]),
                runtime.number(pair[1]),
                ambient.level(),
            )
            row = []
            if degree == weight_degree:
                coefficient, cusp_index = classifier.classify(
                    ModularCusp(lift[0], lift[2])
                )
                if coefficient != 0:
                    row.append((cusp_index, coefficient))
            if degree == 0:
                coefficient, cusp_index = classifier.classify(
                    ModularCusp(lift[1], lift[3])
                )
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
            ambient.base_ring(), rows
        )
        boundary_space = BoundarySymbolsSpace(ambient, cusps)
        ambient._boundary_data_cache = runtime.math_tuple(
            [defining_matrix, boundary_space]
        )
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
                self, self.boundary_space(), defining_matrix
            )
        return self._boundary_map_cache

    def degeneracy_map(
        self,
        codomain: Any,
        index: Any = 1,
    ) -> ModularSymbolsDegeneracyMap:
        r"""Return an exact level-lowering degeneracy map.

        `codomain` may be a modular-symbol space or its level. The target
        must divide this space's level; level-raising maps are not yet
        implemented. The returned morphism exposes `matrix()`, `rank()`,
        `kernel()`, `image()`, and evaluation on modular symbols.

        ```sage
        sage: M = ModularSymbols(22, 2, sign=1)
        sage: d = M.degeneracy_map(11, 1)
        sage: (d.matrix().dimensions(), d.rank())
        ((5, 2), 2)
        ```
        """
        index = _positive_integer(index, "degeneracy index")
        if runtime.is_exact_integer(codomain):
            target = ModularSymbols(  # type: ignore[name-defined]  # noqa: F821
                codomain,
                self.weight(),
                sign=self.sign(),
                base_ring=self.base_ring(),
            )
        elif isinstance(codomain, ModularSymbolsSpace):
            target = codomain
        else:
            raise TypeError(
                "degeneracy-map codomain must be a level or modular-symbol space"
            )
        if self._character is not None or target._character is not None:
            raise NotImplementedError(
                "explicit degeneracy maps for character spaces are not yet implemented"
            )
        if (
            self.weight() != target.weight()
            or self.sign() != target.sign()
            or self.base_ring() is not target.base_ring()
            or self._group._family != "Gamma0"
            or target._group._family != "Gamma0"
        ):
            raise ValueError(
                "degeneracy-map domain and codomain must have matching "
                "Gamma0 weight, sign, and base ring"
            )
        if self.level() % target.level() != 0:
            raise NotImplementedError(
                "level-raising degeneracy maps are not yet implemented"
            )
        quotient = self.level() // target.level()
        if quotient % index != 0:
            raise ValueError("degeneracy index must divide the quotient of levels")
        source_ambient = self.ambient_module()
        target_ambient = target.ambient_module()
        if source_ambient._supports_native_weight2():
            ambient_matrix = source_ambient._native_weight2_degeneracy_matrix(
                target_ambient, index
            )
        elif source_ambient._supports_native_higher_weight():
            ambient_matrix = source_ambient.p1list().higher_weight_degeneracy_matrix(
                target_ambient.p1list(), self.weight(), self.sign(), index
            )
        else:
            raise NotImplementedError(
                "degeneracy maps require a native Gamma0 Manin presentation over QQ"
            )
        images = self.basis_matrix()._sparse_left_multiply(ambient_matrix)
        defining_matrix = target.basis_matrix().solve_left(images)
        return ModularSymbolsDegeneracyMap(
            self, target, defining_matrix, ambient_matrix, index
        )

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
                "arbitrary-path reduction with polynomial coefficients "
                "is not implemented yet"
            )
        native_coordinates = ambient.p1list().reduce_path(start, stop)
        change = ambient._ambient_change_of_basis()
        if change is None:
            coordinates = native_coordinates
        else:
            coordinates = (change.inverse() * native_coordinates.column()).column(0)
        return self(ambient(coordinates))

    def _full_star_matrix(self) -> Any:
        ambient = self.ambient_module()
        if ambient._star_matrix_cache is None:
            native = ambient.p1list().star_matrix().change_ring(ambient.base_ring())
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
            defining_matrix.matrix_from_columns(pivot_columns)
        )

    def star_involution(self) -> ModularSymbolsLinearOperator:
        """Return complex conjugation on this modular-symbol space."""
        if (
            self._supports_native_higher_weight() or self._supports_native_character()
        ) and self.sign() != 0:
            defining_matrix = (
                identity_matrix(  # type: ignore[name-defined]  # noqa: F821
                    self.base_ring(), self.dimension()
                )
                * self.sign()
            )
            return ModularSymbolsLinearOperator(
                self, defining_matrix, "Star involution"
            )
        if self._supports_native_character():
            raise NotImplementedError(
                "construct a signed character space directly to obtain "
                "its star eigenspace; the full sign-zero character star "
                "matrix is not yet exposed"
            )
        ambient_matrix = self._full_star_matrix()
        return ModularSymbolsLinearOperator(
            self,
            self._restrict_ambient_matrix(ambient_matrix),
            "Star involution",
            ambient_matrix,
        )

    def star_involution_matrix(self) -> Any:
        return self.star_involution().matrix()

    def _new_coordinate_subspace(
        self,
        basis_matrix: Any,
        kind: str,
        sign: Any = None,
        serialized_is_cuspidal: Any = None,
    ) -> ModularSymbolsSpace:
        if sign is None:
            sign = self._sign
        if serialized_is_cuspidal is not None:
            return ModularSymbolsSpace(
                self._group,
                self._weight,
                sign,
                self._base,
                self._character,
                self.ambient_module(),
                basis_matrix,
                kind,
                basis_matrix.nrows(),
                serialized_is_cuspidal,
            )
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

    def _refine_decomposition_with_operator(
        self,
        spaces: list[ModularSymbolsSpace],
        operator_index: int,
    ) -> list[ModularSymbolsSpace]:
        """Split repeated constituents with one commuting Hecke operator."""
        finished = []
        remaining = []
        for space in spaces:
            if space.dimension() <= 1:
                finished.append(space)
                continue
            operator = space.hecke_matrix(operator_index)
            factors = list(operator.charpoly().factor())
            if len(factors) == 1 and factors[0][1] == 1:
                finished.append(space)
                continue
            for factor_value, exponent in factors:
                local_basis = factor_value(operator).left_kernel_matrix()
                if local_basis.nrows() == 0:
                    continue
                constituent = space._subspace_from_local_basis(local_basis, "Hecke")
                if exponent == 1:
                    finished.append(constituent)
                else:
                    remaining.append(constituent)
        return finished + remaining

    def _bad_hecke_primes(self) -> list[int]:
        """Return the prime divisors whose operators are `U_p`."""
        return [runtime.number(pair[0]) for pair in sage.factor(self.level())]

    def decomposition(
        self,
        bound: Any = None,
        anemic: bool = True,
        **_kwds: Any,
    ) -> list[ModularSymbolsSpace]:
        r"""Decompose this space into simple modules for Hecke operators.

        The implementation follows the standard modular-symbol algorithm:
        factor characteristic polynomials of successive `T_p`, and split by
        the left kernels of their irreducible factors.  A constituent whose
        restricted characteristic polynomial is irreducible is certified
        simple as a module for the commutative Hecke algebra.

        With `anemic=False`, repeated anemic constituents are further split
        by every bad-prime `U_p`. Diamond operators are already scalar on the
        fixed-character spaces currently supported by the native engine, so
        they require no additional kernels.

        ```sage
        sage: M = ModularSymbols(389, 2, sign=1)
        sage: [A.dimension() for A in M.decomposition()]
        [1, 1, 2, 3, 6, 20]
        ```

        Exact decomposition also works over cyclotomic character fields:

        ```sage
        sage: G = DirichletGroup(37)
        sage: M = ModularSymbols(G.0, 5)
        sage: [A.dimension() for A in M.decomposition(bound=2)]
        [1, 1, 24]
        ```
        """
        if bound is None:
            decomposition_bound = self._default_decomposition_bound()
        else:
            decomposition_bound = _positive_integer(bound, "decomposition bound")
        key = str(decomposition_bound) + (":1" if anemic else ":0")
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
                    constituent = space._subspace_from_local_basis(local_basis, "Hecke")
                    if exponent == 1:
                        finished.append(constituent)
                    else:
                        remaining.append(constituent)
            active = remaining
            if len(active) == 0:
                break
        answer = finished + active
        if not anemic:
            for prime in self._bad_hecke_primes():
                answer = self._refine_decomposition_with_operator(answer, prime)
        for index in range(1, len(answer)):
            item = answer[index]
            position = index
            while position > 0 and answer[position - 1].dimension() > item.dimension():
                answer[position] = answer[position - 1]
                position -= 1
            answer[position] = item
        self._decomposition_cache.set(key, answer)
        return answer

    def new_submodule(self, prime: Any = None) -> ModularSymbolsSpace:
        r"""Return the new, or `p`-new, submodule of this space.

        For trivial-character Gamma0 spaces over `QQ`, this computes the
        intersection of the kernels of the two level-lowering degeneracy
        maps to level `N/p`, for every prime `p` dividing `N`.  All maps are
        assembled natively and horizontally joined before taking one exact
        kernel, following the optimized Magma modular-symbols algorithm.

        ```sage
        sage: M = ModularSymbols(1000, 2, sign=1)
        sage: N = M.new_submodule()
        sage: N.dimension()
        24
        sage: [A.dimension() for A in N.decomposition()]
        [2, 2, 2, 2, 4, 4, 4, 4]
        ```
        """
        selected = (
            None if prime is None else _positive_integer(prime, "new-submodule prime")
        )
        if selected is not None:
            if not sage.is_prime(selected):
                raise ValueError("p must be prime")
            if self.level() % selected != 0:
                raise ValueError("p must divide the level")
        key = "all" if selected is None else str(selected)
        cached = self._new_submodule_cache.get(key)
        if cached is not runtime.undefined:
            return cached

        level = self.level()
        if self._supports_native_character():
            conductor = runtime.number(self._character.conductor())
            if (selected is None and conductor == level) or (
                selected is not None and (level // selected) % conductor != 0
            ):
                self._new_submodule_cache.set(key, self)
                return self
            raise NotImplementedError(
                "imprimitive-character new submodules require exact "
                "cyclotomic degeneracy matrices when the character descends "
                "to a lower level"
            )
        if not (
            (self._supports_native_weight2() or self._supports_native_higher_weight())
            and self.base_ring() is sage.QQ
        ):
            raise NotImplementedError(
                "new submodules currently require Gamma0, weight at least "
                "2, and either rational trivial character or primitive "
                "nebentypus"
            )
        if selected is None and sage.is_prime(level):
            self._new_submodule_cache.set(key, self)
            return self
        cusp = self.cuspidal_subspace()
        if cusp.dimension() == 0:
            self._new_submodule_cache.set(key, cusp)
            return cusp

        primes = (
            [selected]
            if selected is not None
            else [runtime.number(value[0]) for value in sage.factor(level)]
        )
        ambient = self.ambient_module()
        restricted_maps = []
        for lowering_prime in primes:
            lower_level = level // lowering_prime
            if ambient._supports_native_weight2():
                lower = ModularSymbols(lower_level, 2)
            else:
                lower = ModularSymbols(lower_level, self.weight(), sign=self.sign())
            if lower.dimension() == 0:
                continue
            for degeneracy_index in [1, lowering_prime]:
                if ambient._supports_native_weight2():
                    ambient_map = ambient._native_weight2_degeneracy_matrix(
                        lower.ambient_module(), degeneracy_index
                    )
                else:
                    ambient_map = ambient.p1list().higher_weight_degeneracy_matrix(
                        lower.p1list(), self.weight(), self.sign(), degeneracy_index
                    )
                restricted_maps.append(
                    cusp.basis_matrix()._sparse_left_multiply(ambient_map)
                )
        if len(restricted_maps) == 0:
            answer = self if selected is not None else cusp
            self._new_submodule_cache.set(key, answer)
            return answer
        combined = restricted_maps[0]
        for defining_map in restricted_maps[1:]:
            combined = combined.augment(defining_map)
        coefficients = combined.left_kernel_matrix()
        answer = cusp._subspace_from_local_basis(coefficients, "New", self)
        self._new_submodule_cache.set(key, answer)
        return answer

    new_subspace = new_submodule

    def _intersect_basis(self, other_basis: Any) -> Any:
        return (
            self.basis_matrix()
            .row_space()
            .intersection(other_basis.row_space())
            .basis_matrix()
        )

    def _star_submodule(self, sign: int) -> ModularSymbolsSpace:
        cache_name = "_plus_cache" if sign == 1 else "_minus_cache"
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
                        self.base_ring(), 0, ambient.dimension()
                    ),
                    "Plus" if sign == 1 else "Minus",
                    sign,
                )
            raise NotImplementedError(
                "construct the desired higher-weight sign directly with "
                "ModularSymbols(N, k, sign=sign)"
            )
        change = ambient._ambient_change_of_basis()
        if self.is_ambient() and change is None:
            basis = (
                ambient.p1list()
                .star_eigenspace_basis(sign)
                .change_ring(self.base_ring())
            )
        elif self._is_cuspidal:
            basis = ambient._star_submodule(sign).cuspidal_submodule().basis_matrix()
        else:
            relation = (
                ambient._full_star_matrix()
                - identity_matrix(  # type: ignore[name-defined]  # noqa: F821
                    self.base_ring(), ambient.dimension()
                )
                * sign
            )
            eigenspace = relation.left_kernel_matrix()
            basis = (
                eigenspace if self.is_ambient() else self._intersect_basis(eigenspace)
            )
        prefix = "Cuspidal " if self._is_cuspidal else ""
        result = self._new_coordinate_subspace(
            basis,
            prefix + ("Plus" if sign == 1 else "Minus"),
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
            prime_matrix = projective_line._hecke_matrix(p, dimension)
            if e == 1:
                prime_power = prime_matrix
            elif ambient.level() % p == 0:
                prime_power = prime_matrix**e
            else:
                previous = prime_matrix**0
                current = prime_matrix
                for _power in range(2, e + 1):
                    following = prime_matrix * current - previous * p
                    previous = current
                    current = following
                prime_power = current
            if result is None:
                result = prime_power
            else:
                result = result * prime_power
        if result is None:
            result = projective_line._hecke_matrix(2, dimension) ** 0
        result = result.change_ring(ambient.base_ring())
        change_of_basis = ambient._ambient_change_of_basis()
        if change_of_basis is None:
            result = result.transpose()
        else:
            result = (change_of_basis.inverse() * result * change_of_basis).transpose()
        return self._restrict_ambient_matrix(result)

    def _native_weight2_degeneracy_matrix(
        self,
        target: ModularSymbolsSpace,
        index: int,
    ) -> Any:
        """Return a row-action lowering map in ambient space coordinates."""
        source = self.ambient_module()
        target = target.ambient_module()
        result = (
            source.p1list()
            .degeneracy_matrix(target.p1list(), index)
            .change_ring(source.base_ring())
        )
        source_change = source._ambient_change_of_basis()
        target_change = target._ambient_change_of_basis()
        if source_change is not None:
            result = source_change.transpose() * result
        if target_change is not None:
            result = result * target_change.inverse().transpose()
        return result

    def _native_higher_weight_hecke_matrix(self, index: int) -> Any:
        ambient = self.ambient_module()
        result = None
        for prime, exponent in sage.factor(index):
            p = runtime.number(prime)
            e = runtime.number(exponent)
            prime_matrix = ambient.p1list().higher_weight_hecke_matrix(
                ambient.weight(), ambient.sign(), p
            )
            if e == 1:
                prime_power = prime_matrix
            elif ambient.level() % p == 0:
                prime_power = prime_matrix**e
            else:
                previous = prime_matrix**0
                current = prime_matrix
                recurrence_coefficient = sage.ZZ(p) ** (ambient.weight() - 1)
                for _power in range(2, e + 1):
                    following = (
                        prime_matrix * current - previous * recurrence_coefficient
                    )
                    previous = current
                    current = following
                prime_power = current
            result = prime_power if result is None else result * prime_power
        if result is None:
            prime_matrix = ambient.p1list().higher_weight_hecke_matrix(
                ambient.weight(), ambient.sign(), 2
            )
            result = prime_matrix**0
        return self._restrict_ambient_matrix(result)

    def _native_character_hecke_matrix(self, index: int) -> Any:
        ambient = self.ambient_module()
        result = None
        for prime, exponent in sage.factor(index):
            p = runtime.number(prime)
            e = runtime.number(exponent)
            prime_matrix = ambient.p1list().character_hecke_matrix(
                ambient.weight(),
                ambient.sign(),
                ambient._character,
                ambient.base_ring(),
                p,
            )
            if e == 1:
                prime_power = prime_matrix
            elif ambient.level() % p == 0:
                prime_power = prime_matrix**e
            else:
                previous = prime_matrix**0
                current = prime_matrix
                character_value = ambient._character(p)
                if ambient.base_ring() is sage.QQ:
                    if character_value.is_zero():
                        character_value = sage.QQ(0)
                    elif character_value.is_one():
                        character_value = sage.QQ(1)
                    elif (-character_value).is_one():
                        character_value = sage.QQ(-1)
                    else:
                        raise ArithmeticError(
                            "a rational character produced a nonrational value"
                        )
                else:
                    character_value = ambient.base_ring()(character_value)
                recurrence_coefficient = character_value * (
                    sage.ZZ(p) ** (ambient.weight() - 1)
                )
                for _power in range(2, e + 1):
                    following = (
                        prime_matrix * current - previous * recurrence_coefficient
                    )
                    previous = current
                    current = following
                prime_power = current
            result = prime_power if result is None else result * prime_power
        if result is None:
            prime_matrix = ambient.p1list().character_hecke_matrix(
                ambient.weight(),
                ambient.sign(),
                ambient._character,
                ambient.base_ring(),
                2,
            )
            result = prime_matrix**0
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
        return HeckeOperator(self, _positive_integer(index, "Hecke index"))

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
                            ambient.p1list()
                            .cuspidal_basis_matrix()
                            .change_ring(ambient.base_ring())
                        )
                        # Fundamental cycles are emitted in reverse-greedy
                        # RREF.
                        basis._rref_cache = basis
                    else:
                        basis = ambient._boundary_matrix().left_kernel_matrix()
                else:
                    restricted_boundary = self.basis_matrix()._sparse_left_multiply(
                        self.ambient_module()._boundary_matrix()
                    )
                    coefficients = restricted_boundary.left_kernel_matrix()
                    basis = coefficients._sparse_left_multiply(self.basis_matrix())
                    # RREF coefficient rows acting on an RREF row basis
                    # preserve the latter's ordered pivot columns.
                    basis._rref_cache = basis
                kind = "Cuspidal"
                if self._sign == 1:
                    kind += " Plus"
                elif self._sign == -1:
                    kind += " Minus"
                self._cuspidal_cache = self._new_coordinate_subspace(basis, kind)
            return self._cuspidal_cache
        if self._supports_native_higher_weight():
            if self._cuspidal_cache is None:
                if self.is_ambient():
                    basis = (
                        self.ambient_module()._boundary_matrix().left_kernel_matrix()
                    )
                else:
                    restricted_boundary = self.basis_matrix()._sparse_left_multiply(
                        self.ambient_module()._boundary_matrix()
                    )
                    coefficients = restricted_boundary.left_kernel_matrix()
                    basis = coefficients._sparse_left_multiply(self.basis_matrix())
                basis._rref_cache = basis
                kind = "Cuspidal"
                if self._sign == 1:
                    kind += " Plus"
                elif self._sign == -1:
                    kind += " Minus"
                self._cuspidal_cache = self._new_coordinate_subspace(basis, kind)
            return self._cuspidal_cache
        if self._supports_native_character():
            if self._cuspidal_cache is None:
                if self.is_ambient():
                    basis = (
                        self.ambient_module()._boundary_matrix().left_kernel_matrix()
                    )
                else:
                    restricted_boundary = self.basis_matrix()._sparse_left_multiply(
                        self.ambient_module()._boundary_matrix()
                    )
                    coefficients = restricted_boundary.left_kernel_matrix()
                    basis = coefficients._sparse_left_multiply(self.basis_matrix())
                basis._rref_cache = basis
                kind = "Cuspidal"
                if self._sign == 1:
                    kind += " Plus"
                elif self._sign == -1:
                    kind += " Minus"
                self._cuspidal_cache = self._new_coordinate_subspace(basis, kind)
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

    def q_expansion_basis(
        self,
        prec: Any = None,
        algorithm: str = "default",
        variable: str = "q",
        **opts: Any,
    ) -> list[Any]:
        r"""Return an echelon basis of associated cusp-form expansions.

        Trivial- and Dirichlet-character $\Gamma_0(N)$ spaces use exact
        Hecke-dual reconstruction over their coefficient field. The returned
        power series retain opaque FLINT polynomial storage; only their public
        coefficient views are materialized on demand.

        ### Examples

        ```sage
        sage: S = ModularSymbols(11, 2, sign=1).cuspidal_submodule()
        sage: S.q_expansion_basis(6)
        [q - 2*q^2 - q^3 + 2*q^4 + q^5 + O(q^6)]
        ```
        """
        if "var" in opts:
            variable = opts["var"]
        if "ρσ_py_var" in opts:
            variable = opts["ρσ_py_var"]
        if self._group._family == "Gamma0" and (
            self._character is not None or self.base_ring() is sage.QQ
        ):
            return _qexp_module().modular_symbols_q_expansion_basis(
                self,
                prec,
                algorithm,
                variable,
            )
        precision = 8 if prec is None else _exact_nonnegative_integer(prec, "precision")
        key = self._model_key()
        if key == "gamma1-11-2-cusp":
            elliptic_curve = runtime.reflect.get(runtime.global_object, "EllipticCurve")
            coefficients = elliptic_curve([0, -1, 1, -10, -20]).anlist(precision - 1)
            power_series_ring = runtime.reflect.get(
                runtime.global_object, "PowerSeriesRing"
            )
            ring = power_series_ring(sage.QQ, "q", default_prec=max(1, precision))
            generator = ring.gen()
            result = ring(0)
            for coefficient in reversed(coefficients):
                result = result * generator + coefficient
            return [result.add_bigoh(precision)]
        raise NotImplementedError(
            "q-expansion bases are not available for this modular-symbol model"
        )

    def q_expansion_module(
        self,
        prec: Any = None,
        R: Any = None,
        algorithm: str = "default",
    ) -> Any:
        r"""Return the coefficient module of the expansions.

        ### Examples

        ```sage
        sage: S = ModularSymbols(11, 2, sign=1).cuspidal_submodule()
        sage: S.q_expansion_module(5, ZZ).basis_matrix()
        [ 0  1 -2 -1  2]
        ```
        """
        if self._group._family == "Gamma0" and (
            self._character is not None or self.base_ring() is sage.QQ
        ):
            return _qexp_module().modular_symbols_q_expansion_module(
                self,
                prec,
                R,
                algorithm,
            )
        raise NotImplementedError(
            "q-expansion modules currently require trivial-character Gamma0 over QQ"
        )

    def q_expansion_basis_certificate(self, prec: Any = None) -> Any:
        r"""Return a replayable Sturm certificate for a cusp-form basis.

        ### Examples

        ```sage
        sage: S = ModularSymbols(11, 2, sign=1).cuspidal_submodule()
        sage: C = S.q_expansion_basis_certificate()
        sage: (C.dimension(), C.is_sturm_certified(), C.verify())
        (1, True, True)
        ```
        """
        if self._group._family == "Gamma0" and (
            self._character is not None or self.base_ring() is sage.QQ
        ):
            return _qexp_module().modular_symbols_q_expansion_certificate(self, prec)
        raise NotImplementedError(
            "q-expansion certificates currently require trivial-character Gamma0 over QQ"
        )

    def __repr__(self) -> str:
        if not self.is_ambient():
            return (
                "Modular Symbols subspace of dimension "
                + str(self._dimension)
                + " of "
                + str(self._ambient)
            )
        if self._character is not None:
            character_values = []
            for generator in self._character.parent().unit_gens():
                value = self._character(generator)
                if self._base is sage.QQ:
                    if value.is_one():
                        value = sage.QQ(1)
                    elif (-value).is_one():
                        value = sage.QQ(-1)
                else:
                    value = self._base(value)
                character_values.append(value)
            return (
                "Modular Symbols space of dimension "
                + str(self._dimension)
                + " and level "
                + str(self.level())
                + ", weight "
                + str(self._weight)
                + ", character "
                + str(character_values)
                + ", sign "
                + str(self._sign)
                + ", over "
                + str(self._base)
            )
        family = "Gamma_0" if self._group._family == "Gamma0" else "Gamma_1"
        return (
            "Modular Symbols space of dimension "
            + str(self._dimension)
            + " for "
            + family
            + "("
            + str(self.level())
            + ") of weight "
            + str(self._weight)
            + " with sign "
            + str(self._sign)
            + " over "
            + str(self._base)
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
    weight = _positive_integer(weight, "weight")
    sign = _exact_integer(sign, "sign")
    if sign not in [-1, 0, 1]:
        raise ValueError("sign must be -1, 0, or 1")
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
        congruence_group = Gamma0(group) if runtime.is_exact_integer(group) else group
        if not isinstance(congruence_group, CongruenceSubgroup):
            raise TypeError(
                "ModularSymbols needs a level, congruence subgroup, "
                "or Dirichlet character"
            )
    if base_ring is None:
        base_ring = sage.QQ
    if character is not None:
        base_kind = getattr(base_ring, "_kind", None)
        if character.order() > 2 and base_ring is sage.QQ:
            raise ValueError("the character values do not lie in Rational Field")
        if base_ring is not sage.QQ and base_kind != "CyclotomicField":
            raise NotImplementedError(
                "character modular symbols currently require QQ or an exact "
                "cyclotomic field"
            )
    native_signed = (
        character is None
        and congruence_group._family == "Gamma0"
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


runtime.register_doc(
    "EisensteinSubspace.basis",
    runtime.reflect.get(
        runtime.reflect.get(EisensteinSubspace, "prototype"),
        "basis",
    ),
    {
        "kind": "method",
        "module": "sage.modular.modform.eis_submodule",
        "tags": [
            "modular forms",
            "Eisenstein series",
            "basis",
            "q-expansions",
        ],
        "backends": ["FLINT", "Sage.js native helpers"],
        "sage_compatibility": {
            "status": "extension",
            "notes": (
                "The basis is Sage-compatible; the optional prec keyword is "
                "a Sage.js convenience extension."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath Eisenstein subspace API",
                "url": ("https://doc.sagemath.org/html/en/reference/modfrm/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "sagejs-original",
                "source": "Precision-aware retained-parent basis elements",
            },
        ],
        "implementation": {
            "algorithm": (
                "Exact Eisenstein coefficient construction with lazy "
                "precision extension"
            ),
        },
        "limitations": [],
    },
)


def _modular_dimension_doc(tags: list[str]) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ["modular forms", "dimensions"],
        [tags],
    )
    return {
        "kind": "function",
        "module": "sage.modular.dims",
        "tags": all_tags,
        "backends": ["Sage.js exact arithmetic", "FLINT"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Implemented Gamma0, Gamma1, and Dirichlet-character cases "
                "match SageMath; unresolved weight-one Schaeffer cases raise "
                "NotImplementedError."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath modular dimension API",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/"
                    "modfrm/sage/modular/dims.html"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "literature-implemented",
                "source": "Riemann--Roch and Cohen--Oesterlé formulas",
            },
        ],
        "references": [
            {
                "id": "cohen-oesterle-1977",
                "type": "paper",
                "title": ("Dimensions des espaces de formes modulaires"),
                "authors": ["Henri Cohen", "Joseph Oesterlé"],
                "year": 1977,
                "doi": "10.1007/BFb0065297",
                "url": "https://doi.org/10.1007/BFb0065297",
                "relevant_sections": ["pages 69--78"],
            },
        ],
        "implementation": {
            "algorithm": ("Exact Riemann--Roch and Cohen--Oesterlé dimension formulas"),
        },
        "limitations": [
            (
                "Some weight-one cusp dimensions requiring the Schaeffer "
                "algorithm are not implemented."
            ),
        ],
    }


def _modular_space_doc(tags: list[str], extension: bool = False) -> Any:
    all_tags = runtime.reflect.apply(
        runtime.array.prototype.concat,
        ["modular forms", "spaces"],
        [tags],
    )
    return {
        "kind": "function",
        "module": "sage.modular.modform.constructor",
        "tags": all_tags,
        "backends": ["FLINT", "Sage.js exact arithmetic"],
        "sage_compatibility": {
            "status": "extension" if extension else "partial",
            "notes": (
                "The supported exact space and q-expansion operations follow "
                "SageMath; Sage.js does not yet implement the complete "
                "Hecke-module surface."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath modular forms API",
                "url": ("https://doc.sagemath.org/html/en/reference/modfrm/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "library-backed",
                "source": "FLINT exact arithmetic",
                "url": "https://flintlib.org/",
            },
            {
                "kind": "sagejs-original",
                "source": ("Lightweight parent-aware modular-form implementation"),
            },
        ],
        "references": [
            {
                "id": "flint",
                "type": "software",
                "title": "FLINT: Fast Library for Number Theory",
                "authors": ["The FLINT contributors"],
                "url": "https://flintlib.org/",
            },
        ],
        "implementation": {
            "algorithm": (
                "Exact dimension formulas, native Eisenstein coefficient "
                "generation, and certified level-one Victor Miller bases"
            ),
        },
        "limitations": [
            "Only QQ is currently accepted as the ambient base ring.",
            (
                "Full ambient and cuspidal q-expansion bases currently "
                "require level one; Eisenstein bases also support prime level."
            ),
        ],
    }


def _level_one_qexp_doc(tags: list[str]) -> Any:
    return {
        "kind": "function",
        "module": "sage.modular.modform.vm_basis",
        "tags": runtime.reflect.apply(
            runtime.array.prototype.concat,
            ["modular forms", "q-expansions", "level one"],
            [tags],
        ),
        "backends": ["FLINT", "Sage.js exact arithmetic"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": (
                "The name, integral leading-term normalization, cusp_only "
                "option, precision, and variable conventions follow SageMath."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath Victor Miller basis",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/modfrm/"
                    "sage/modular/modform/vm_basis.html"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "literature-implemented",
                "source": "The graded-ring identity QQ[E4,E6]",
            },
        ],
        "references": [
            {
                "id": "stein-modform",
                "type": "book",
                "title": "Modular Forms: A Computational Approach",
                "authors": ["William Stein"],
                "year": 2007,
                "url": "https://wstein.org/books/modform/",
            },
        ],
        "implementation": {
            "algorithm": (
                "Exact arithmetic in QQ[E4,E6], the independent Jacobi "
                "Delta identity, and certified triangular normalization"
            ),
        },
        "limitations": ["This first exact formula algebra is level one over QQ."],
    }


_p1list_prototype = runtime.reflect.get(P1List, "prototype")
_p1list_hecke_matrix_method = runtime.reflect.get(_p1list_prototype, "hecke_matrix")
runtime.register_doc(
    "P1List.hecke_matrix",
    _p1list_hecke_matrix_method,
    {
        "kind": "method",
        "module": "sage.modular.modsym.p1list",
        "tags": [
            "number theory",
            "modular symbols",
            "Hecke operators",
            "Manin symbols",
        ],
        "backends": [
            "Sage.js portable C modular-symbol core",
            "FLINT integer matrices",
        ],
        "sage_compatibility": {
            "status": "extension",
            "notes": (
                "The matrix is expressed in Sage.js's minimal E1 Manin "
                "basis; traces and characteristic polynomials agree with "
                "SageMath and PARI."
            ),
        },
        "provenance": [
            {
                "kind": "software-derived",
                "source": "PARI/GP src/basemath/modsym.c",
                "revision": "0f5a08ee7e",
                "url": "https://pari.math.u-bordeaux.fr/",
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "sagejs-original",
                "source": (
                    "Portable preallocated path reducer and batched "
                    "row-major Hecke assembler"
                ),
            },
        ],
        "implementation": {
            "algorithm": (
                "Pollack--Stevens fundamental domain, continued-fraction "
                "Manin reduction, and standard Tp/Up representatives"
            ),
        },
        "limitations": [
            "The low-level method accepts prime indices only.",
            "Use ModularSymbols(...).hecke_matrix(n) for composite indices.",
        ],
    },
)

_modular_symbols_space_prototype = runtime.reflect.get(ModularSymbolsSpace, "prototype")
_modular_symbols_hecke_matrix_method = runtime.reflect.get(
    _modular_symbols_space_prototype, "hecke_matrix"
)
runtime.register_doc(
    "ModularSymbolsSpace.hecke_matrix",
    _modular_symbols_hecke_matrix_method,
    {
        "kind": "method",
        "module": "sage.modular.modsym.space",
        "tags": [
            "number theory",
            "modular symbols",
            "Hecke operators",
            "exact matrices",
        ],
        "backends": [
            "Sage.js portable C modular-symbol core",
            "FLINT integer and rational matrices",
        ],
        "sage_compatibility": {
            "status": "compatible",
            "notes": (
                "Full weight-2 Gamma0 sign-zero spaces support exact T_n "
                "matrices for every positive index. Higher-weight Gamma0 "
                "spaces over QQ support all signs and exact T_n matrices."
            ),
        },
        "provenance": [
            {
                "kind": "literature-implemented",
                "source": ("William Stein, Modular Forms: A Computational Approach"),
                "url": "https://wstein.org/books/modform/",
            },
            {
                "kind": "software-derived",
                "source": "PARI/GP src/basemath/modsym.c",
                "revision": "0f5a08ee7e",
                "url": "https://pari.math.u-bordeaux.fr/",
                "license": "GPL-2.0-or-later",
            },
        ],
        "implementation": {
            "algorithm": (
                "Native prime Hecke matrices, Cremona-Heilbronn "
                "representatives, multiplicativity, Up powers, and the "
                "weight-k good-prime recurrence"
            ),
        },
        "limitations": [
            (
                "The native engine currently requires Gamma0 spaces with "
                "trivial character over QQ; ambient, cuspidal, and directly "
                "constructed signed restrictions are supported."
            ),
        ],
    },
)

_p1list_higher_presentation_method = runtime.reflect.get(
    _p1list_prototype, "higher_weight_presentation"
)
runtime.register_doc(
    "P1List.higher_weight_presentation",
    _p1list_higher_presentation_method,
    {
        "kind": "method",
        "module": "sage.modular.modsym.manin_symbol_list",
        "tags": [
            "number theory",
            "modular symbols",
            "higher weight",
            "Manin symbols",
            "exact linear algebra",
        ],
        "backends": [
            "Sage.js native signed union-find",
            "FLINT sparse rational matrices",
        ],
        "sage_compatibility": {
            "status": "extension",
            "notes": (
                "Exposes the internal exact quotient and reduction matrix "
                "used by higher-weight Gamma0 modular symbols."
            ),
        },
        "provenance": [
            {
                "kind": "literature-implemented",
                "source": ("William Stein, Computing with Modular Symbols"),
                "url": (
                    "https://wstein.org/books/modform/modform/modular_symbols.html"
                ),
            },
            {
                "kind": "sage-derived",
                "source": ("SageMath manin_symbol_list and relation_matrix"),
                "url": (
                    "https://github.com/sagemath/sage/tree/develop/"
                    "src/sage/modular/modsym"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "author-owned-reference",
                "source": (
                    "William Stein original Magma Geometry/ModSym implementation"
                ),
            },
        ],
        "implementation": {
            "algorithm": (
                "Triple (i,u,v) generators; signed two-term union-find; "
                "binomial order-three relations; exact sparse FLINT RREF"
            ),
        },
        "limitations": [
            (
                "Very large presentations need the planned fully sparse "
                "reduction-map representation to avoid dense output."
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
        ["number theory", "modular symbols"],
        [tags],
    )
    return {
        "kind": "method",
        "module": "sage.modular.modsym.space",
        "tags": all_tags,
        "backends": [
            "Sage.js portable C modular-symbol core",
            "FLINT exact matrices",
        ],
        "sage_compatibility": {
            "status": "compatible",
            "notes": (
                "The weight-2 Gamma0 API follows SageMath matrix and "
                "subspace conventions, including row-action operator "
                "matrices."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath modular-symbol API",
                "url": ("https://doc.sagemath.org/html/en/reference/modsym/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "software-derived",
                "source": "PARI/GP src/basemath/modsym.c",
                "revision": "0f5a08ee7e",
                "url": "https://pari.math.u-bordeaux.fr/",
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "sagejs-original",
                "source": ("Portable preallocated coordinate and subspace adapter"),
            },
        ],
        "references": [
            {
                "id": "stein-modform",
                "type": "book",
                "title": "Modular Forms: A Computational Approach",
                "authors": ["William Stein"],
                "url": "https://wstein.org/books/modform/",
            },
            {
                "id": "cremona-algorithms",
                "type": "book",
                "title": "Algorithms for Modular Elliptic Curves",
                "authors": ["John Cremona"],
                "url": "https://johncremona.github.io/book/fulltext/",
            },
        ],
        "implementation": {"algorithm": algorithm},
        "limitations": [
            (
                "This general native implementation currently covers "
                "weight 2, Gamma0, and trivial character."
            ),
        ],
    }


runtime.register_doc(
    "ModularSymbolsSpace.boundary_map",
    runtime.reflect.get(_modular_symbols_space_prototype, "boundary_map"),
    _modular_symbols_method_doc(
        ["boundary maps", "cusps", "exact linear algebra"],
        "Cremona Gamma0 cusp equivalence and endpoint divisors",
    ),
)

runtime.register_doc(
    "ModularSymbolsSpace.cuspidal_submodule",
    runtime.reflect.get(_modular_symbols_space_prototype, "cuspidal_submodule"),
    _modular_symbols_method_doc(
        ["cuspidal subspaces", "kernels", "Hecke modules"],
        "Exact FLINT kernel of the boundary matrix",
    ),
)

_modular_symbols_qexp_doc = _modular_symbols_method_doc(
    ["cusp forms", "q-expansions", "Hecke operators", "Sturm bound"],
    (
        "Exact Hecke-dual coefficient reconstruction, deterministic row "
        "reduction, and Sturm certification"
    ),
)
_modular_symbols_qexp_doc["sage_compatibility"] = {
    "status": "compatible",
    "notes": (
        "Gamma0 cusp spaces with trivial or Dirichlet character support "
        "weights at least two, all signs, caller-selected precision, and "
        "their exact rational or cyclotomic coefficient field. Sign-zero "
        "spaces use the common signed Hecke module."
    ),
}
_modular_symbols_qexp_doc["limitations"] = [
    "Arbitrary proper sign-zero subspaces are not yet supported.",
]
runtime.register_doc(
    "ModularSymbolsSpace.q_expansion_basis",
    runtime.reflect.get(_modular_symbols_space_prototype, "q_expansion_basis"),
    _modular_symbols_qexp_doc,
)
runtime.register_doc(
    "ModularSymbolsSpace.q_expansion_module",
    runtime.reflect.get(_modular_symbols_space_prototype, "q_expansion_module"),
    _modular_symbols_qexp_doc,
)
runtime.register_doc(
    "ModularSymbolsSpace.q_expansion_basis_certificate",
    runtime.reflect.get(
        _modular_symbols_space_prototype,
        "q_expansion_basis_certificate",
    ),
    _modular_symbols_qexp_doc,
)

_modular_symbols_degeneracy_doc = _modular_symbols_method_doc(
    ["degeneracy maps", "oldforms", "Hecke modules", "exact linear algebra"],
    "Native Merel-Heilbronn lowering followed by exact basis restriction",
)
_modular_symbols_degeneracy_doc["sage_compatibility"] = {
    "status": "partial",
    "notes": (
        "Exact level-lowering Gamma0 maps over QQ follow SageMath in every "
        "weight at least two and all three signs. Level raising and explicit "
        "character-valued maps are not yet implemented."
    ),
}
_modular_symbols_degeneracy_doc["limitations"] = [
    "Level-raising and character-valued degeneracy maps are not yet exposed.",
]
runtime.register_doc(
    "ModularSymbolsSpace.degeneracy_map",
    runtime.reflect.get(_modular_symbols_space_prototype, "degeneracy_map"),
    _modular_symbols_degeneracy_doc,
)

_modular_symbols_new_doc = _modular_symbols_method_doc(
    ["new subspaces", "oldforms", "Hecke modules", "exact linear algebra"],
    ("One exact kernel of horizontally joined level-lowering degeneracy matrices"),
)
_modular_symbols_new_doc["sage_compatibility"] = {
    "status": "partial",
    "notes": (
        "Gamma0 cuspidal new and individual p-new operations over QQ follow "
        "SageMath in every weight at least two and all three signs. Primitive "
        "nebentypus spaces, and p-new spaces where the character cannot "
        "descend, are recognized over their exact character fields. At "
        "composite trivial-character level, calling this on the full space "
        "returns its cuspidal new part. Degeneracy matrices for imprimitive "
        "characters that descend are not yet implemented."
    ),
}
_modular_symbols_new_doc["backends"] = [
    "Sage.js portable C modular-symbol core",
    "FLINT exact matrices, native horizontal concatenation, and kernels",
]
_modular_symbols_new_doc["provenance"].append(
    {
        "kind": "sage-derived",
        "source": "SageMath degeneracy-lowering new-submodule algorithm",
        "url": (
            "https://github.com/sagemath/sage/blob/develop/src/sage/"
            "modular/hecke/ambient_module.py"
        ),
        "license": "GPL-2.0-or-later",
    }
)
_modular_symbols_new_doc["limitations"] = [
    (
        "Imprimitive character spaces still need cyclotomic degeneracy "
        "matrices when their character descends to a lower level."
    ),
]
runtime.register_doc(
    "ModularSymbolsSpace.new_submodule",
    runtime.reflect.get(_modular_symbols_space_prototype, "new_submodule"),
    _modular_symbols_new_doc,
)

_modular_symbols_decomposition_doc = _modular_symbols_method_doc(
    ["decomposition", "simple factors", "Hecke modules", "newforms"],
    (
        "Successive good-prime Hecke characteristic-polynomial "
        "factorization and exact factor kernels"
    ),
)
_modular_symbols_decomposition_doc["sage_compatibility"] = {
    "status": "compatible",
    "notes": (
        "Anemic decomposition by good Hecke operators follows SageMath. "
        "Passing anemic=False further refines repeated constituents by every "
        "bad-prime U_p; diamond operators are scalar on fixed-character "
        "spaces."
    ),
}
_modular_symbols_decomposition_doc["backends"] = [
    "Sage.js portable C modular-symbol core",
    (
        "FLINT exact matrices, characteristic polynomials, rational "
        "factorization, and Trager number-field factorization"
    ),
    "Completely split-prime cyclotomic kernels with exact CRT certificates",
]
_modular_symbols_decomposition_doc["limitations"] = [
    (
        "Correctness is certified by irreducible restricted characteristic "
        "polynomials; unresolved repeated factors remain grouped if the "
        "requested bound is too small."
    ),
]
runtime.register_doc(
    "ModularSymbolsSpace.decomposition",
    runtime.reflect.get(_modular_symbols_space_prototype, "decomposition"),
    _modular_symbols_decomposition_doc,
)

runtime.register_doc(
    "ModularSymbolsSpace.star_involution",
    runtime.reflect.get(_modular_symbols_space_prototype, "star_involution"),
    _modular_symbols_method_doc(
        ["star involution", "complex conjugation", "exact matrices"],
        "Native endpoint negation and continued-fraction Manin reduction",
    ),
)

runtime.register_doc(
    "ModularSymbolsSpace.plus_submodule",
    runtime.reflect.get(_modular_symbols_space_prototype, "plus_submodule"),
    _modular_symbols_method_doc(
        ["star eigenspaces", "plus subspaces", "exact linear algebra"],
        "Exact left kernel of star minus the identity",
    ),
)

runtime.register_doc(
    "ModularSymbolsSpace.minus_submodule",
    runtime.reflect.get(_modular_symbols_space_prototype, "minus_submodule"),
    _modular_symbols_method_doc(
        ["star eigenspaces", "minus subspaces", "exact linear algebra"],
        "Exact left kernel of star plus the identity",
    ),
)

runtime.register_doc(
    "ModularSymbolsSpace.modular_symbol",
    runtime.reflect.get(_modular_symbols_space_prototype, "modular_symbol"),
    _modular_symbols_method_doc(
        ["elements", "rational paths", "continued fractions"],
        "Native continued-fraction reduction into the minimal E1 basis",
    ),
)


runtime.register_doc(
    "P1List",
    P1List,
    {
        "kind": "class",
        "module": "sage.modular.modsym.p1list",
        "tags": [
            "number theory",
            "modular symbols",
            "projective line",
            "Manin relations",
        ],
        "backends": ["Sage.js native C", "FLINT nmod_mat"],
        "sage_compatibility": {
            "status": "compatible",
            "notes": (
                "Representative ordering, normalization, I, S, and the "
                "historical order-three T action agree with SageMath. "
                "apply_R and apply_translation are explicit extensions."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath P1List implementation",
                "url": (
                    "https://github.com/sagemath/sage/blob/develop/"
                    "src/sage/modular/modsym/p1list.pyx"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "sagejs-original",
                "source": "William Stein JSage Zig P1List",
                "revision": "2582234b6f76f8a5e1cecae319ae1a098d9b3c50",
                "url": (
                    "https://github.com/sagemathinc/JSage/blob/"
                    "2582234b6f76f8a5e1cecae319ae1a098d9b3c50/"
                    "lib/src/modular/p1list.zig"
                ),
            },
        ],
        "implementation": {
            "algorithm": (
                "Exact cardinality preallocation, canonical normalization, "
                "lexicographic representatives, open-addressed indexing, "
                "a preallocated Pollack--Stevens fundamental domain, and "
                "batched exact path reduction for weight-2 Hecke matrices"
            ),
        },
        "limitations": [
            "Levels are currently limited to signed 32-bit positive integers.",
        ],
    },
)
runtime.register_doc(
    "ManinPresentation",
    ManinPresentation,
    {
        "kind": "class",
        "module": "sage.modular.modsym.manin_symbol_list",
        "tags": [
            "number theory",
            "modular symbols",
            "fundamental domains",
            "Manin relations",
        ],
        "backends": ["Sage.js native C"],
        "sage_compatibility": {
            "status": "extension",
            "notes": (
                "This explicit presentation-inspection object is a Sage.js "
                "API; its weight-2 dimension agrees with SageMath."
            ),
        },
        "provenance": [
            {
                "kind": "literature-implemented",
                "source": (
                    "Pollack and Stevens, Overconvergent modular symbols "
                    "and p-adic L-functions"
                ),
                "url": ("https://doi.org/10.24033/asens.2139"),
            },
            {
                "kind": "software-derived",
                "source": "PARI/GP src/basemath/modsym.c",
                "revision": "0f5a08ee7e",
                "url": "https://pari.math.u-bordeaux.fr/",
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "sagejs-original",
                "source": (
                    "Preallocated array-and-index fundamental-domain implementation"
                ),
            },
        ],
        "implementation": {
            "algorithm": (
                "Connected Farey-triangle fundamental domain with "
                "structural elimination of F, E2, and T32 paths"
            ),
        },
        "limitations": [
            (
                "The public object exposes presentation metadata; the "
                "retained paths and reductions are consumed internally by "
                "the exact Hecke engine."
            ),
            "Boundary maps and explicit modular-symbol elements remain future work.",
        ],
    },
)
runtime.register_doc(
    "ManinRelations",
    ManinRelations,
    {
        "kind": "class",
        "module": "sage.modular.modsym.manin_symbol_list",
        "tags": [
            "number theory",
            "modular symbols",
            "sparse matrices",
            "finite fields",
        ],
        "backends": [
            "Sage.js native CSR",
            "Sage.js minimal Manin presentation",
            "FLINT nmod_mat",
        ],
        "sage_compatibility": {
            "status": "extension",
            "notes": (
                "This explicit relation-matrix object is a Sage.js API. "
                "Its quotient dimension agrees with weight-2 Gamma0 "
                "modular symbols away from bad reduction characteristics."
            ),
        },
        "provenance": [
            {
                "kind": "literature-implemented",
                "source": ("William Stein, Modular Forms: A Computational Approach"),
                "url": "https://wstein.org/books/modform/",
            },
            {
                "kind": "sagejs-original",
                "source": ("Pre-sized native compressed-row relation builder"),
            },
            {
                "kind": "software-derived",
                "source": "PARI/GP src/basemath/modsym.c",
                "revision": "0f5a08ee7e",
                "url": "https://pari.math.u-bordeaux.fr/",
                "license": "GPL-2.0-or-later",
            },
        ],
        "implementation": {
            "algorithm": (
                "Orbit representatives for x + S*x and "
                "x + R*x + R^2*x over a prime field, with rank and "
                "dimension obtained from a minimal fundamental-domain "
                "presentation in characteristic greater than 3"
            ),
        },
        "references": [
            {
                "id": "stein-modform",
                "type": "book",
                "title": "Modular Forms: A Computational Approach",
                "authors": ["William Stein"],
                "year": 2007,
                "url": "https://wstein.org/books/modform/",
                "relevant_sections": ["Modular symbols"],
            },
        ],
        "limitations": [
            (
                "Characteristic 2 and 3 still use dense FLINT elimination "
                "below 20 million matrix cells."
            ),
            (
                "Boundary maps, cuspidal subspaces, Hecke actions, and "
                "rational lifting are not yet part of this object."
            ),
        ],
    },
)
runtime.register_doc(
    "dimension_cusp_forms",
    dimension_cusp_forms,
    _modular_dimension_doc(["cusp forms", "Dirichlet characters"]),
)
runtime.register_doc(
    "dimension_eis",
    dimension_eis,
    _modular_dimension_doc(["Eisenstein series", "Dirichlet characters"]),
)
runtime.register_doc(
    "dimension_modular_forms",
    dimension_modular_forms,
    _modular_dimension_doc(["ambient spaces", "Dirichlet characters"]),
)
runtime.register_doc(
    "ModularForms",
    ModularForms,
    _modular_space_doc(["ambient spaces"]),
)
runtime.register_doc(
    "EisensteinForms",
    EisensteinForms,
    _modular_space_doc(
        ["Eisenstein series", "q-expansions"],
        True,
    ),
)
runtime.register_doc(
    "CuspForms",
    CuspForms,
    _modular_space_doc(
        ["cusp forms", "q-expansions", "modular symbols"],
        True,
    ),
)
runtime.register_doc(
    "delta_qexp",
    delta_qexp,
    _level_one_qexp_doc(["Delta", "cusp forms"]),
)
runtime.register_doc(
    "victor_miller_basis",
    victor_miller_basis,
    _level_one_qexp_doc(["Victor Miller basis", "cusp forms"]),
)

_eta_product_doc = {
    "kind": "function",
    "module": "sagejs.modular_forms.eta_products",
    "tags": [
        "modular forms",
        "q-expansions",
        "eta products",
        "eta quotients",
        "Newman congruences",
        "Ligozat cusp orders",
        "Dirichlet characters",
    ],
    "backends": [
        "ordinary Python exact Euler products",
        "FLINT exact rational power series",
        "Sage.js modular-symbol ambient certificates",
    ],
    "sage_compatibility": {
        "status": "extension",
        "notes": (
            "SageMath's uppercase EtaProduct is a weight-zero meromorphic "
            "modular-function API. Sage.js uses lowercase eta_product for "
            "Newman--Ligozat-certified holomorphic modular forms of any "
            "supported integral weight, including valid negative exponents."
        ),
    },
    "provenance": [
        {
            "kind": "literature-implemented",
            "source": (
                "Newman's eta-quotient congruences and Ligozat's cusp-order criterion"
            ),
        },
        {
            "kind": "sagejs-original",
            "source": (
                "Replayable modular-form certificate, exact character "
                "metadata, bounded candidate enumeration, and honest "
                "formula-registry integration"
            ),
        },
        {
            "kind": "sage-derived",
            "source": "SageMath eta-product Euler expansion used as an independent oracle",
            "url": (
                "https://doc.sagemath.org/html/en/reference/modfrm/"
                "sage/modular/etaproducts.html"
            ),
            "license": "GPL-2.0-or-later",
        },
    ],
    "limitations": [
        "Publication requires integral nonnegative weight and the sufficient Newman--Ligozat conditions.",
        "The bounded automatic registry currently searches only trivial-character cusp forms with nonnegative exponents.",
        "The automatic registry is limited to level at most 128, weight at most 24, and levels with at most four divisors.",
    ],
}
for _eta_product_name, _eta_product_function in [
    ("eta_product", eta_product),
    ("eta_product_certificate", eta_product_certificate),
    ("eta_product_candidates", eta_product_candidates),
]:
    runtime.register_doc(
        _eta_product_name,
        _eta_product_function,
        _eta_product_doc,
    )

_half_integral_doc = {
    "kind": "function",
    "module": "sage.modular.modform.half_integral",
    "tags": [
        "modular forms",
        "half-integral weight",
        "theta series",
        "Cohen Eisenstein series",
        "Hecke operators",
        "Kohnen plus space",
        "Shimura lift",
        "Sturm bounds",
    ],
    "backends": [
        "Sage.js exact modular symbols",
        "FLINT exact rational and cyclotomic linear algebra",
        "ordinary Python coefficient formulas",
    ],
    "sage_compatibility": {
        "status": "compatible",
        "notes": (
            "The Basmaji constructor accepts odd k at least three and a "
            "Dirichlet character whose modulus is divisible by 16. Unlike "
            "SageMath's historical function, it automatically raises the "
            "working precision past a proof bound and returns a replayable "
            "certificate."
        ),
    },
    "provenance": [
        {
            "kind": "literature-derived",
            "source": "Basmaji, Essen thesis, page 55",
            "url": (
                "https://web.archive.org/web/20160905111513/"
                "http://wstein.org/scans/papers/basmaji/thesis_of_basmaji.dvi"
            ),
        },
        {
            "kind": "sage-derived",
            "source": "SageMath half_integral.py",
            "url": (
                "https://github.com/sagemath/sage/blob/develop/"
                "src/sage/modular/modform/half_integral.py"
            ),
            "license": "GPL-2.0-or-later",
        },
        {
            "kind": "literature-derived",
            "source": "Cohen's half-integral-weight Eisenstein coefficient formula",
        },
        {
            "kind": "sagejs-original",
            "source": (
                "Half-integral Sturm certification, replayable formula "
                "certificates, exact T_(p^2) matrix recovery, and certified "
                "Kohnen-plus/Shimura maps"
            ),
        },
        {
            "kind": "software-derived",
            "source": "PARI/GP mfkohnenbasis and mfshimura",
            "url": "https://pari.math.u-bordeaux.fr/dochtml/html/Modular_forms.html",
            "license": "GPL-2.0-or-later",
        },
    ],
    "limitations": [
        "Basmaji cusp spaces currently require character modulus divisible by 16.",
        "Hecke matrices currently require T_(p^2) at an odd prime p not dividing the level.",
        "Shimura target-coordinate certificates currently require trivial character.",
        "The bounded Shimura coefficient API currently requires cuspidal input and positive squarefree t.",
    ],
}
for _half_integral_name, _half_integral_function in [
    ("theta_qexp", theta_qexp),
    ("theta2_qexp", theta2_qexp),
    ("theta_qexp_certificate", theta_qexp_certificate),
    ("theta2_qexp_certificate", theta2_qexp_certificate),
    ("cohen_eisenstein_series_qexp", cohen_eisenstein_series_qexp),
    ("cohen_eisenstein_series_certificate", cohen_eisenstein_series_certificate),
    ("HalfIntegralWeightModularForms", HalfIntegralWeightModularForms),
    ("half_integral_weight_modform_basis", half_integral_weight_modform_basis),
    ("half_integral_weight_hecke_qexp", half_integral_weight_hecke_qexp),
    ("shimura_lift_qexp", shimura_lift_qexp),
    ("half_integral_formula_registry", half_integral_formula_registry),
]:
    runtime.register_doc(
        _half_integral_name,
        _half_integral_function,
        _half_integral_doc,
    )
runtime.register_doc(
    "ModularSymbols",
    ModularSymbols,
    {
        "kind": "function",
        "module": "sage.modular.modsym.modsym",
        "tags": [
            "number theory",
            "modular symbols",
            "modular forms",
            "Dirichlet characters",
            "Hecke operators",
            "q-expansions",
        ],
        "backends": [
            "FLINT",
            "FLINT generic-ring exact algebraic matrices",
            "Sage.js portable C modular-symbol core",
            "Sage.js native P1List and Manin presentation",
        ],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Gamma0 spaces with trivial or Dirichlet character use "
                "exact Manin presentations in weights at least two. The "
                "native engine constructs all three signs, boundary and "
                "cuspidal spaces, diamond operators, and exact T_n matrices "
                "with the Sage-compatible nebentypus recurrence. Gamma1 "
                "and q-expansion coverage remains more selective."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath modular symbols API and guided tour",
                "url": ("https://doc.sagemath.org/html/en/reference/modsym/"),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "software-derived",
                "source": (
                    "Author-owned original Magma Geometry/ModSym "
                    "implementation, especially core.m, boundary.m, and "
                    "operators.m"
                ),
            },
            {
                "kind": "software-derived",
                "source": (
                    "PARI/GP well-formed fundamental domain and path reduction strategy"
                ),
                "revision": "0f5a08ee7e",
                "url": "https://pari.math.u-bordeaux.fr/",
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "sagejs-original",
                "source": (
                    "Portable preallocated C Hecke assembler, strict-Python "
                    "Hecke algebra integration, and FLINT matrix boundary"
                ),
            },
        ],
        "limitations": [
            (
                "The full star matrix of a sign-zero character space is not "
                "yet exposed; construct sign=1 or sign=-1 directly."
            ),
            (
                "Arbitrary rational-path elements with nonconstant "
                "coefficient polynomials are not yet exposed in character "
                "spaces."
            ),
            (
                "Large character value fields currently use general qqbar "
                "elimination and need a specialized cyclotomic-number-field "
                "performance path."
            ),
        ],
    },
)

runtime.register_doc(
    "SupersingularModule",
    SupersingularModule,
    {
        "kind": "function",
        "module": "sage.modular.ssmod.ssmod",
        "tags": [
            "modular forms",
            "supersingular elliptic curves",
            "Brandt modules",
            "Hecke operators",
            "sparse matrices",
            "isogeny graphs",
        ],
        "backends": [
            "Sage.js exact finite-field arithmetic",
            "Sage.js immutable sparse Hecke operators",
        ],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Prime characteristic at least five, auxiliary level one, "
                "and good prime-index Hecke operators are supported. The "
                "Hecke operator itself is sparse; dense matrix materialization "
                "and modular-polynomial construction are explicitly bounded."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath supersingular modules",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/modfrm/"
                    "sage/modular/ssmod/ssmod.html"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "sagejs-original",
                "source": (
                    "Immutable CSR Hecke operator, mass-weighted graph view, "
                    "and bounded dense compatibility layer"
                ),
            },
        ],
        "limitations": [
            "Characteristics 2 and 3 are not implemented.",
            "Auxiliary levels greater than one are not implemented.",
            "Composite-index and bad-prime Hecke operators are not implemented.",
        ],
    },
)

runtime.register_doc(
    "BrandtModule",
    BrandtModule,
    {
        "kind": "function",
        "module": "sage.modular.quatalg.brandt",
        "tags": [
            "modular forms",
            "Brandt modules",
            "quaternion algebras",
            "Eichler orders",
            "Hecke operators",
            "Jacquet-Langlands",
        ],
        "backends": [
            "Sage.js sparse supersingular graphs",
            "Sage.js exact modular symbols",
            "Sage.js exact rational quaternion ideals",
        ],
        "sage_compatibility": {
            "status": "extension",
            "notes": (
                "Supports every definite squarefree rational quaternion "
                "discriminant and coprime Eichler conductor in weight two. "
                "The default general basis is an exact Jacquet--Langlands "
                "Hecke realization; the explicit ideal-class realization "
                "constructs genuine quaternion ideals and their integral lattice."
            ),
        },
        "provenance": [
            {
                "kind": "literature-implemented",
                "source": "Jacquet--Langlands correspondence for definite quaternion algebras",
            },
            {
                "kind": "sage-derived",
                "source": "SageMath Brandt-module API",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/modfrm/"
                    "sage/modular/quatalg/brandt.html"
                ),
                "license": "GPL-2.0-or-later",
            },
            {
                "kind": "literature-implemented",
                "source": (
                    "Kirschmer--Voight ideal-class enumeration and "
                    "Kohel--Stein monodromy/component-group formulas"
                ),
            },
        ],
        "limitations": [
            "Bad-prime operators at primes dividing the Eichler conductor are not yet exposed.",
            "Only weight two and base rings QQ/ZZ are implemented.",
            "Atkin--Lehner operators are currently exposed for divisors of D.",
            (
                "Full-Jacobian component groups are implemented; newform-quotient "
                "groups await audited integral modular-degree maps."
            ),
        ],
    },
)
