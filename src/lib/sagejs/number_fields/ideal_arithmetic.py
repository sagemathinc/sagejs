"""Exact fractional-ideal arithmetic for maximal number-field orders.

The implementation deliberately works with the canonical rational HNF
lattices already used by :class:`NumberFieldIdeal`.  Colon ideals are
intersections of scalar translates, which gives an especially small and
independently checkable implementation of inversion.  Valuations normalize a
fractional ideal by an exact integer denominator and then divide by a certified
prime ideal until containment stops.
"""

from __future__ import annotations

from typing import Any

import sagejs as sage
import sagejs.runtime as runtime

_nf = __import__("sagejs._baselib.number_fields", fromlist=["number_fields"])
NumberFieldIdeal = _nf.NumberFieldIdeal
_nf_coordinates = _nf._nf_coordinates
_nf_global = _nf._nf_global
_nf_lcm = _nf._nf_lcm

SERIALIZATION_SCHEMA = "sagejs.number-fields.ideal.v1"


def _same_order(left: Any, right: Any) -> None:
    if not isinstance(left, NumberFieldIdeal) or not isinstance(
        right, NumberFieldIdeal
    ):
        raise TypeError("ideal arithmetic requires number-field ideals")
    if left.ring() is not right.ring():
        raise TypeError("ideals must belong to the same order")


def ideal_contains(container: Any, contained: Any) -> bool:
    """Return whether `contained` is a sublattice of `container`."""
    _same_order(container, contained)
    return all(element in container for element in contained.basis())


def ideal_divides(divisor: Any, dividend: Any) -> bool:
    """Return exact integral-ideal divisibility in a maximal order.

    For integral ideals in a Dedekind domain, `divisor | dividend` precisely
    when `dividend` is contained in `divisor`.
    """
    _same_order(divisor, dividend)
    if not divisor.is_integral() or not dividend.is_integral():
        raise ValueError("ideal divisibility is defined here for integral ideals")
    return ideal_contains(divisor, dividend)


def scalar_translate(ideal: Any, scalar: Any) -> Any:
    if ideal.is_zero():
        return NumberFieldIdeal(ideal.ring(), [])
    value = ideal.number_field()(scalar)
    if value.is_zero():
        return NumberFieldIdeal(ideal.ring(), [])
    return NumberFieldIdeal(
        ideal.ring(),
        [
            _nf_coordinates(value * element, ideal.number_field().degree())
            for element in ideal.basis()
        ],
    )


def colon_ideal(numerator: Any, denominator: Any) -> Any:
    """Return `(numerator : denominator)` as an exact fractional ideal."""
    _same_order(numerator, denominator)
    if denominator.is_zero():
        raise ZeroDivisionError("the colon by the zero ideal is not supported")
    if numerator.is_zero():
        return NumberFieldIdeal(numerator.ring(), [])
    answer = None
    for element in denominator.basis():
        translated = scalar_translate(numerator, element.inverse())
        answer = translated if answer is None else answer.intersection(translated)
    if answer is None:
        raise ArithmeticError("a nonzero ideal has no lattice basis")
    # Recheck the defining universal property independently of the
    # intersection implementation.
    if not ideal_contains(numerator, answer * denominator):
        raise ArithmeticError("colon-ideal construction failed its containment check")
    return answer


def ideal_inverse(ideal: Any) -> Any:
    """Return the exact inverse of a nonzero ideal in a maximal order."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("ideal inversion requires a number-field ideal")
    if ideal.is_zero():
        raise ZeroDivisionError("the zero ideal is not invertible")
    order = ideal.ring()
    if not order.is_maximal():
        raise ValueError("ideal inversion currently requires a certified maximal order")
    inverse = colon_ideal(order.ideal(1), ideal)
    if inverse * ideal != order.ideal(1):
        raise ArithmeticError("the colon lattice is not an invertible-ideal inverse")
    return inverse


def ideal_quotient(numerator: Any, denominator: Any) -> Any:
    """Return the multiplicative quotient of two nonzero invertible ideals."""
    _same_order(numerator, denominator)
    if denominator.is_zero():
        raise ZeroDivisionError("ideal division by zero")
    return numerator * ideal_inverse(denominator)


def ideal_power(ideal: Any, exponent: Any) -> Any:
    power = runtime.integer_bigint(exponent)
    if power < 0:
        return ideal_power(ideal_inverse(ideal), -power)
    answer = ideal.ring().ideal(1)
    base = ideal
    while power:
        if power % runtime.bigint(2):
            answer = answer * base
        power //= runtime.bigint(2)
        if power:
            base = base * base
    return answer


def integrality_denominator(ideal: Any) -> Any:
    """Return the least positive integer `d` for which `d*ideal` is integral."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("an integrality denominator requires an ideal")
    if ideal.is_zero():
        return sage.ZZ(1)
    relative = ideal.basis_matrix() * ideal.ring().basis_matrix().inverse()
    denominator = runtime.bigint(1)
    for row in relative.rows():
        for value in row:
            denominator = _nf_lcm(denominator, value._denominator)
    scaled = scalar_translate(ideal, denominator)
    if not scaled.is_integral():
        raise ArithmeticError("failed to clear an ideal's integrality denominator")
    return sage.ZZ(denominator)


def numerator_ideal(ideal: Any) -> Any:
    return scalar_translate(ideal, integrality_denominator(ideal))


def _p_adic_valuation_integer(value: Any, prime: int) -> int:
    integer = runtime.integer_bigint(value)
    if integer < 0:
        integer = -integer
    if integer == 0:
        raise ValueError("the p-adic valuation of zero is infinite")
    answer = 0
    p = runtime.bigint(prime)
    while integer % p == 0:
        integer //= p
        answer += 1
    return answer


def ideal_valuation(ideal: Any, prime_ideal: Any) -> int:
    """Return the exact valuation of a nonzero fractional ideal at `P`."""
    _same_order(ideal, prime_ideal)
    if ideal.is_zero():
        raise ValueError("the valuation of the zero ideal is infinite")
    prime = int(prime_ideal.rational_prime())
    denominator = integrality_denominator(ideal)
    integral = scalar_translate(ideal, denominator)
    valuation = 0
    # Every successful containment removes one exact prime-ideal factor.  The
    # norm gives a strict, deterministic loop bound.
    norm = integral.norm()
    if norm._denominator != 1:
        raise ArithmeticError("an integral ideal has nonintegral norm")
    maximum = 0
    remaining_norm = runtime.integer_bigint(norm._numerator)
    while remaining_norm > 1 and remaining_norm % runtime.bigint(prime) == 0:
        remaining_norm //= runtime.bigint(prime)
        maximum += 1
    maximum += 1
    while ideal_contains(prime_ideal, integral):
        integral = ideal_quotient(integral, prime_ideal)
        if not integral.is_integral():
            raise ArithmeticError("prime-ideal division lost integrality")
        valuation += 1
        if valuation > maximum:
            raise ArithmeticError("ideal valuation exceeded its exact norm bound")
    return valuation - prime_ideal.ramification_index() * _p_adic_valuation_integer(
        denominator, prime
    )


def element_valuation(value: Any, prime_ideal: Any) -> int:
    field = prime_ideal.number_field()
    element = field(value)
    if element.is_zero():
        raise ValueError("the valuation of zero is infinite")
    if element in prime_ideal.ring():
        # For an algebraic integer alpha, `(alpha)` is contained in `P^k`
        # exactly when alpha is an element of `P^k`.  Testing lattice
        # membership while multiplying successive integral powers avoids the
        # colon-ideal inversions used by the fully general fractional-ideal
        # routine below.  The rational norm gives an exact finite loop bound:
        # every factor P contributes `f(P/p) * v_P(alpha)` to v_p(N(alpha)).
        norm = element.norm()
        if norm._denominator != 1:
            raise ArithmeticError("an algebraic integer has nonintegral norm")
        rational_prime = int(prime_ideal.rational_prime())
        norm_valuation = _p_adic_valuation_integer(norm._numerator, rational_prime)
        residue_degree = int(prime_ideal.residue_degree())
        if residue_degree < 1:
            raise ArithmeticError("a prime ideal has invalid residue degree")
        maximum = norm_valuation // residue_degree
        valuation = 0
        powers = prime_ideal._valuation_power_cache
        while len(powers) < maximum:
            powers.append(powers[-1] * prime_ideal)
        while valuation < maximum and element in powers[valuation]:
            valuation += 1
        return valuation
    return ideal_valuation(prime_ideal.ring().ideal(element), prime_ideal)


def factor_integral_ideal(ideal: Any) -> Any:
    """Factor a nonzero integral ideal and exactly reconstruct its lattice."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("ideal factorization requires a number-field ideal")
    if ideal.is_zero():
        raise ValueError("the zero ideal has no finite prime factorization")
    if not ideal.is_integral():
        raise ValueError("factor_integral_ideal requires an integral ideal")
    norm = ideal.norm()
    if norm._denominator != 1:
        raise ArithmeticError("an integral ideal has nonintegral norm")
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    factors: list[list[Any]] = []
    for rational_prime, _norm_exponent in sage.factor(norm._numerator):
        decomposition = prime_module.factor_rational_prime(ideal.ring(), rational_prime)
        for prime_ideal, _ramification in decomposition:
            valuation = ideal_valuation(ideal, prime_ideal)
            if valuation:
                factors.append([prime_ideal, valuation])
    result: Any = sage.Factorization(
        factors,
        unit=ideal.ring().ideal(1),
        cr=False,
        sort=False,
        simplify=False,
    )
    reconstructed = ideal.ring().ideal(1)
    for prime_ideal, exponent in result:
        reconstructed = reconstructed * ideal_power(prime_ideal, exponent)
    if reconstructed != ideal:
        raise ArithmeticError(
            "prime-ideal factors do not reconstruct the input lattice"
        )
    return result


def _encode_rows(rows: list[list[Any]]) -> list[list[list[int]]]:
    return [
        [[int(value._numerator), int(value._denominator)] for value in row]
        for row in rows
    ]


def serialize_ideal(ideal: Any) -> dict[str, Any]:
    """Return the versioned canonical HNF payload for an exact ideal."""
    if not isinstance(ideal, NumberFieldIdeal):
        raise TypeError("only a number-field ideal can be serialized")
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    return {
        "schema": SERIALIZATION_SCHEMA,
        "field_instance": prime_module._identity_token(ideal.number_field()),
        "order_instance": prime_module._identity_token(ideal.ring()),
        "field_order_fingerprint": prime_module._field_order_fingerprint(ideal.ring()),
        "basis": _encode_rows(ideal._basis_rows),
    }


def ideal_from_dict(order: Any, data: dict[str, Any]) -> Any:
    if data.get("schema") != SERIALIZATION_SCHEMA:
        raise ValueError("unsupported ideal serialization schema")
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    if data.get("field_order_fingerprint") != prime_module._field_order_fingerprint(
        order
    ):
        raise ValueError("an ideal has a different exact field/order fingerprint")
    if data.get("field_instance") != prime_module._identity_token(
        order.number_field()
    ) or data.get("order_instance") != prime_module._identity_token(order):
        raise ValueError(
            "an ideal cannot be loaded into another field or order instance"
        )
    rows = [
        [sage.QQ(value[0]) / sage.QQ(value[1]) for value in row]
        for row in data["basis"]
    ]
    return NumberFieldIdeal(order, rows)


__all__ = [
    "colon_ideal",
    "element_valuation",
    "factor_integral_ideal",
    "ideal_contains",
    "ideal_divides",
    "ideal_from_dict",
    "ideal_inverse",
    "ideal_power",
    "ideal_quotient",
    "ideal_valuation",
    "integrality_denominator",
    "numerator_ideal",
    "scalar_translate",
    "serialize_ideal",
]
