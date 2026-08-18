"""Exact order-two residual operators for bounded OM type construction.

This module implements the coefficient map of Guàrdia--Montes--Nart,
Definition 2.19, for one active first-order type whose residual factor is
linear.  The linear factor identifies the next residue field with the prior
finite field, while the required `z**t` twist is still computed explicitly.
Unsupported type depth or residue-field towers fail closed.
"""

from __future__ import annotations

from dataclasses import dataclass

from .om_types import (
    ImmutableOMRecord,
    NewtonSide,
    OMDomainError,
    OMLevel,
    Polynomial,
    ResidualPolynomial,
    ResidueElement,
    _residue_inverse,
    _residue_multiply,
    _residue_normalize,
    _residue_power,
    _residue_subtract,
    _residual_normalize,
    coefficient_valuation,
    maclane_integer_valuation,
    phi_adic_expansion,
)


@dataclass
class HigherResidualEvidence(ImmutableOMRecord):
    """Inspectable coefficient evidence for one higher residual side."""

    polynomial: ResidualPolynomial
    component_abscissas: tuple[int, ...]
    twist_exponents: tuple[int, ...]


def _residue_add(
    left: ResidueElement,
    right: ResidueElement,
    prime: int,
    modulus: Polynomial,
) -> ResidueElement:
    return _residue_subtract(
        left,
        _residue_subtract((0,), right, prime, modulus),
        prime,
        modulus,
    )


def _evaluate_residual(
    polynomial: ResidualPolynomial,
    value: ResidueElement,
    prime: int,
    modulus: Polynomial,
) -> ResidueElement:
    answer: ResidueElement = (0,)
    power: ResidueElement = (1,)
    for coefficient in polynomial:
        answer = _residue_add(
            answer,
            _residue_multiply(coefficient, power, prime, modulus),
            prime,
            modulus,
        )
        power = _residue_multiply(power, value, prime, modulus)
    return answer


def _slope_component(
    polynomial: Polynomial,
    prime: int,
    level: OMLevel,
) -> tuple[int, ResidualPolynomial]:
    """Return `s_1(polynomial)` and its first residual polynomial."""
    height = -level.slope.numerator
    ramification = level.ramification_index
    expansion = phi_adic_expansion(polynomial, level.key_polynomial)
    scored: list[tuple[int, int]] = []
    for exponent, coefficient in enumerate(expansion):
        valuation = coefficient_valuation(coefficient, prime)
        if valuation is not None:
            scored.append((ramification * valuation + height * exponent, exponent))
    if not scored:
        raise ArithmeticError("zero has no finite residual component")
    minimum = min(score for score, _exponent in scored)
    component = [exponent for score, exponent in scored if score == minimum]
    left = min(component)
    right = max(component)
    coefficients: list[ResidueElement] = []
    modulus = level.residual_field_modulus
    for exponent in range(left, right + 1, ramification):
        coefficient = expansion[exponent] if exponent < len(expansion) else (0,)
        valuation = coefficient_valuation(coefficient, prime)
        numerator = minimum - height * exponent
        expected_valuation = numerator // ramification
        if (
            numerator % ramification
            or valuation is None
            or valuation != expected_valuation
        ):
            coefficients.append((0,))
            continue
        scale = prime**valuation
        primitive = tuple(value // scale for value in coefficient)
        coefficients.append(_residue_normalize(primitive, prime, modulus))
    return left, _residual_normalize(tuple(coefficients), prime, modulus)


def _bezout_height_coefficient(height: int, ramification: int) -> int:
    if ramification == 1:
        return 0
    previous_remainder, remainder = height, ramification
    previous_coefficient, coefficient = 1, 0
    while remainder:
        quotient = previous_remainder // remainder
        previous_remainder, remainder = (
            remainder,
            previous_remainder - quotient * remainder,
        )
        previous_coefficient, coefficient = (
            coefficient,
            previous_coefficient - quotient * coefficient,
        )
    if previous_remainder != 1:
        raise OMDomainError("a higher type slope must be reduced")
    return previous_coefficient % ramification


def order_two_residual_evidence(
    polynomial: Polynomial,
    prime: int,
    higher_key: Polynomial,
    level: OMLevel,
    side: NewtonSide,
) -> HigherResidualEvidence:
    """Compute the exact second-order residual polynomial on `side`.

    The supported residue extension is linear, but this is not a degree-one
    shortcut: every first residual component is evaluated at the recorded root
    and multiplied by the exact Bézout twist from GMN Definition 2.19.
    """
    if level.optimized_away or level.order != 1:
        raise OMDomainError("order-two residuals require one active first-order type")
    if len(level.residual_factor) != 2:
        raise OMDomainError("order-two residuals require a linear prior factor")
    modulus = level.residual_field_modulus
    leading_inverse = _residue_inverse(level.residual_factor[1], prime, modulus)
    root = _residue_multiply(
        _residue_subtract((0,), level.residual_factor[0], prime, modulus),
        leading_inverse,
        prime,
        modulus,
    )
    if root == (0,):
        raise OMDomainError("the higher residual generator must be nonzero")
    height = -level.slope.numerator
    ramification = level.ramification_index
    bezout = _bezout_height_coefficient(height, ramification)
    key_value = maclane_integer_valuation(higher_key, prime, (level,))
    if key_value is None:
        raise ArithmeticError("a higher key has infinite first-order value")
    expansion = phi_adic_expansion(polynomial, higher_key)
    coefficients: list[ResidueElement] = []
    component_abscissas: list[int] = []
    twists: list[int] = []
    for exponent in range(
        side.left.abscissa,
        side.right.abscissa + 1,
        side.ramification_index,
    ):
        coefficient = expansion[exponent] if exponent < len(expansion) else (0,)
        coefficient_value = maclane_integer_valuation(coefficient, prime, (level,))
        if coefficient_value is None:
            raise ArithmeticError("a higher side coefficient has infinite value")
        ordinate = coefficient_value + exponent * key_value
        expected = side.ordinate_at(exponent)
        if expected.denominator != 1 or ordinate != expected.numerator:
            raise OMDomainError("the requested point is not on the higher side")
        component_left, first_residual = _slope_component(coefficient, prime, level)
        twist_numerator = component_left - bezout * ordinate
        if twist_numerator % ramification:
            raise ArithmeticError("a higher residual twist is not integral")
        twist = twist_numerator // ramification
        value = _evaluate_residual(first_residual, root, prime, modulus)
        root_power = _residue_power(root, abs(twist), prime, modulus)
        if twist < 0:
            root_power = _residue_inverse(root_power, prime, modulus)
        coefficients.append(_residue_multiply(value, root_power, prime, modulus))
        component_abscissas.append(component_left)
        twists.append(twist)
    return HigherResidualEvidence(
        _residual_normalize(tuple(coefficients), prime, modulus),
        tuple(component_abscissas),
        tuple(twists),
    )


__all__ = ["HigherResidualEvidence", "order_two_residual_evidence"]
