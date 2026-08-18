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
    NewtonPoint,
    NewtonSide,
    OMDomainError,
    OMLevel,
    Polynomial,
    ResidualPolynomial,
    ResidueElement,
    _residual_normalize,
    _residue_inverse,
    _residue_multiply,
    _residue_normalize,
    _residue_power,
    _residue_subtract,
    coefficient_valuation,
    maclane_integer_valuation,
    normalize_polynomial,
    phi_adic_expansion,
    polynomial_add,
    polynomial_degree,
    polynomial_multiply,
    polynomial_power,
)


@dataclass
class HigherResidualEvidence(ImmutableOMRecord):
    """Inspectable coefficient evidence for one higher residual side."""

    polynomial: ResidualPolynomial
    active_exponents: tuple[int, ...]
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
    active_exponents: list[int] = []
    component_abscissas: list[int] = []
    twists: list[int] = []
    for exponent in range(
        side.left.abscissa,
        side.right.abscissa + 1,
        side.ramification_index,
    ):
        coefficient = expansion[exponent] if exponent < len(expansion) else (0,)
        coefficient_value = maclane_integer_valuation(coefficient, prime, (level,))
        expected = side.ordinate_at(exponent)
        if expected.denominator != 1:
            raise OMDomainError("a higher side ordinate must be integral")
        if coefficient_value is None:
            coefficients.append((0,))
            continue
        ordinate = coefficient_value + exponent * key_value
        if ordinate < expected.numerator:
            raise OMDomainError("the requested point is not on the higher side")
        if ordinate > expected.numerator:
            coefficients.append((0,))
            continue
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
        active_exponents.append(exponent)
        component_abscissas.append(component_left)
        twists.append(twist)
    return HigherResidualEvidence(
        _residual_normalize(tuple(coefficients), prime, modulus),
        tuple(active_exponents),
        tuple(component_abscissas),
        tuple(twists),
    )


def _prime_field_modulus(factor: ResidualPolynomial) -> Polynomial:
    if any(len(coefficient) != 1 for coefficient in factor):
        raise OMDomainError("the next residual field is not a prime-field extension")
    return normalize_polynomial(tuple(coefficient[0] for coefficient in factor))


def _component_side(
    polynomial: Polynomial,
    prime: int,
    level: OMLevel,
    prior_levels: tuple[OMLevel, ...],
) -> NewtonSide:
    expansion = phi_adic_expansion(polynomial, level.key_polynomial)
    key_value = maclane_integer_valuation(level.key_polynomial, prime, prior_levels)
    if key_value is None:
        raise ArithmeticError("a residual key has infinite prior value")
    height = -level.slope.numerator
    ramification = level.ramification_index
    scored: list[tuple[int, int, int]] = []
    for exponent, coefficient in enumerate(expansion):
        coefficient_value = maclane_integer_valuation(coefficient, prime, prior_levels)
        if coefficient_value is not None:
            ordinate = coefficient_value + exponent * key_value
            scored.append(
                (ramification * ordinate + height * exponent, exponent, ordinate)
            )
    if not scored:
        raise ArithmeticError("zero has no finite residual component")
    minimum = min(score for score, _exponent, _ordinate in scored)
    component = [
        (exponent, ordinate) for score, exponent, ordinate in scored if score == minimum
    ]
    left_exponent, left_ordinate = component[0]
    right_exponent, right_ordinate = component[-1]
    return NewtonSide(
        left=NewtonPoint(left_exponent, left_ordinate),
        right=NewtonPoint(right_exponent, right_ordinate),
        slope=level.slope,
        ramification_index=ramification,
        height=height,
    )


def order_three_residual_evidence(
    polynomial: Polynomial,
    prime: int,
    higher_key: Polynomial,
    first_level: OMLevel,
    second_level: OMLevel,
    side: NewtonSide,
) -> HigherResidualEvidence:
    """Compute a third-order residual over one quadratic prime-field extension."""
    if first_level.order != 1 or second_level.order != 2:
        raise OMDomainError("order-three residuals require two active levels")
    modulus = _prime_field_modulus(second_level.residual_factor)
    if polynomial_degree(modulus) != 2:
        raise OMDomainError("the bounded order-three residue extension is quadratic")
    root: ResidueElement = (0, 1)
    height = -second_level.slope.numerator
    ramification = second_level.ramification_index
    bezout = _bezout_height_coefficient(height, ramification)
    key_value = maclane_integer_valuation(
        higher_key, prime, (first_level, second_level)
    )
    if key_value is None:
        raise ArithmeticError("an order-three key has infinite prior value")
    expansion = phi_adic_expansion(polynomial, higher_key)
    coefficients: list[ResidueElement] = []
    active_exponents: list[int] = []
    component_abscissas: list[int] = []
    twists: list[int] = []
    for exponent in range(
        side.left.abscissa,
        side.right.abscissa + 1,
        side.ramification_index,
    ):
        coefficient = expansion[exponent] if exponent < len(expansion) else (0,)
        coefficient_value = maclane_integer_valuation(
            coefficient, prime, (first_level, second_level)
        )
        expected = side.ordinate_at(exponent)
        if expected.denominator != 1:
            raise OMDomainError("an order-three side ordinate must be integral")
        if coefficient_value is None:
            coefficients.append((0,))
            continue
        ordinate = coefficient_value + exponent * key_value
        if ordinate < expected.numerator:
            raise OMDomainError("the requested point is below the order-three side")
        if ordinate > expected.numerator:
            coefficients.append((0,))
            continue
        component = _component_side(
            coefficient,
            prime,
            second_level,
            (first_level,),
        )
        second_residual = order_two_residual_evidence(
            coefficient,
            prime,
            second_level.key_polynomial,
            first_level,
            component,
        )
        component_left = component.left.abscissa
        twist_numerator = component_left - bezout * ordinate
        if twist_numerator % ramification:
            raise ArithmeticError("an order-three residual twist is not integral")
        twist = twist_numerator // ramification
        value = _evaluate_residual(
            second_residual.polynomial,
            root,
            prime,
            modulus,
        )
        root_power = _residue_power(root, abs(twist), prime, modulus)
        if twist < 0:
            root_power = _residue_inverse(root_power, prime, modulus)
        coefficients.append(_residue_multiply(value, root_power, prime, modulus))
        active_exponents.append(exponent)
        component_abscissas.append(component_left)
        twists.append(twist)
    return HigherResidualEvidence(
        _residual_normalize(tuple(coefficients), prime, modulus),
        tuple(active_exponents),
        tuple(component_abscissas),
        tuple(twists),
    )


def order_two_representative(
    prime: int,
    first_level: OMLevel,
    second_level: OMLevel,
) -> Polynomial:
    """Lift a bounded prime-field residual factor by mixed-radix search."""
    factor = second_level.residual_factor
    if any(len(coefficient) != 1 for coefficient in factor):
        raise OMDomainError("the bounded representative requires prime-field data")
    degree = len(factor) - 1
    ramification = second_level.ramification_index
    height = -second_level.slope.numerator
    key = second_level.key_polynomial
    key_value = maclane_integer_valuation(key, prime, (first_level,))
    if key_value is None:
        raise ArithmeticError("a representative key has infinite prior value")
    result = polynomial_power(key, degree * ramification)
    right_ordinate = degree * ramification * key_value
    root_modulus = first_level.residual_field_modulus
    leading_inverse = _residue_inverse(
        first_level.residual_factor[1], prime, root_modulus
    )
    root = _residue_multiply(
        _residue_subtract((0,), first_level.residual_factor[0], prime, root_modulus),
        leading_inverse,
        prime,
        root_modulus,
    )
    first_height = -first_level.slope.numerator
    first_ramification = first_level.ramification_index
    first_bezout = _bezout_height_coefficient(first_height, first_ramification)
    for index, residue_coefficient in enumerate(factor[:-1]):
        target = residue_coefficient[0] % prime
        if target == 0:
            continue
        exponent = index * ramification
        ordinate = right_ordinate + (degree - index) * height
        target_value = ordinate - exponent * key_value
        lifted: Polynomial | None = None
        for monomial_degree in range(polynomial_degree(key)):
            difference = target_value - monomial_degree
            if difference < 0 or difference % first_ramification:
                continue
            prime_exponent = difference // first_ramification
            for unit in range(1, prime):
                candidate = (0,) * monomial_degree + (unit * prime**prime_exponent,)
                component_left, residual = _slope_component(
                    candidate, prime, first_level
                )
                twist_numerator = component_left - first_bezout * ordinate
                if twist_numerator % first_ramification:
                    continue
                twist = twist_numerator // first_ramification
                value = _evaluate_residual(residual, root, prime, root_modulus)
                root_power = _residue_power(root, abs(twist), prime, root_modulus)
                if twist < 0:
                    root_power = _residue_inverse(root_power, prime, root_modulus)
                value = _residue_multiply(value, root_power, prime, root_modulus)
                if value == (target,):
                    lifted = candidate
                    break
            if lifted is not None:
                break
        if lifted is None:
            raise OMDomainError("bounded mixed-radix coefficient lift failed")
        result = polynomial_add(
            result,
            polynomial_multiply(lifted, polynomial_power(key, exponent)),
        )
    return normalize_polynomial(result)


def _order_three_coefficient_value(
    polynomial: Polynomial,
    ordinate: int,
    prime: int,
    first_level: OMLevel,
    second_level: OMLevel,
) -> ResidueElement:
    modulus = _prime_field_modulus(second_level.residual_factor)
    root: ResidueElement = (0, 1)
    component = _component_side(
        polynomial,
        prime,
        second_level,
        (first_level,),
    )
    residual = order_two_residual_evidence(
        polynomial,
        prime,
        second_level.key_polynomial,
        first_level,
        component,
    )
    bezout = _bezout_height_coefficient(
        -second_level.slope.numerator,
        second_level.ramification_index,
    )
    twist_numerator = component.left.abscissa - bezout * ordinate
    if twist_numerator % second_level.ramification_index:
        raise ArithmeticError("an order-three coefficient twist is not integral")
    twist = twist_numerator // second_level.ramification_index
    value = _evaluate_residual(residual.polynomial, root, prime, modulus)
    root_power = _residue_power(root, abs(twist), prime, modulus)
    if twist < 0:
        root_power = _residue_inverse(root_power, prime, modulus)
    return _residue_multiply(value, root_power, prime, modulus)


def order_three_refinement(
    prime: int,
    first_level: OMLevel,
    second_level: OMLevel,
    key: Polynomial,
    side: NewtonSide,
    factor: ResidualPolynomial,
) -> Polynomial:
    """Refine a repeated linear third residual by a mixed-radix lift."""
    modulus = _prime_field_modulus(second_level.residual_factor)
    if len(factor) != 2:
        raise OMDomainError("the bounded order-three refinement must be linear")
    leading_inverse = _residue_inverse(factor[1], prime, modulus)
    target = _residue_multiply(factor[0], leading_inverse, prime, modulus)
    key_value = maclane_integer_valuation(key, prime, (first_level, second_level))
    if key_value is None:
        raise ArithmeticError("a refinement key has infinite prior value")
    target_value = key_value + side.height
    second_key = second_level.key_polynomial
    second_radix = second_level.ramification_index * second_level.residue_degree
    ramification_product = (
        first_level.ramification_index * second_level.ramification_index
    )
    for second_digit in range(second_radix):
        second_power = polynomial_power(second_key, second_digit)
        for first_digit in range(polynomial_degree(second_key)):
            mixed_monomial = polynomial_multiply(
                (0,) * first_digit + (1,), second_power
            )
            for prime_exponent in range(target_value // ramification_product + 2):
                scale = prime**prime_exponent
                for unit in range(1, prime):
                    candidate = tuple(unit * scale * value for value in mixed_monomial)
                    if (
                        maclane_integer_valuation(
                            candidate,
                            prime,
                            (first_level, second_level),
                        )
                        != target_value
                    ):
                        continue
                    if (
                        _order_three_coefficient_value(
                            candidate,
                            target_value,
                            prime,
                            first_level,
                            second_level,
                        )
                        == target
                    ):
                        return normalize_polynomial(polynomial_add(key, candidate))
    raise OMDomainError("bounded order-three mixed-radix refinement failed")


__all__ = [
    "HigherResidualEvidence",
    "order_three_refinement",
    "order_three_residual_evidence",
    "order_two_representative",
    "order_two_residual_evidence",
]
