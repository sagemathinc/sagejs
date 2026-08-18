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


def _residue_linear_solution(
    values: list[ResidueElement],
    target: ResidueElement,
    prime: int,
    modulus: Polynomial,
) -> tuple[int, ...]:
    """Solve a deterministic finite-field vector lift over the prime field."""
    field_degree = polynomial_degree(modulus)
    matrix = [
        [
            (values[column][row] if row < len(values[column]) else 0) % prime
            for column in range(len(values))
        ]
        + [(target[row] if row < len(target) else 0) % prime]
        for row in range(field_degree)
    ]
    pivots: list[int] = []
    pivot_row = 0
    for column in range(len(values)):
        selected = next(
            (
                row
                for row in range(pivot_row, field_degree)
                if matrix[row][column] % prime
            ),
            None,
        )
        if selected is None:
            continue
        matrix[pivot_row], matrix[selected] = matrix[selected], matrix[pivot_row]
        inverse = pow(matrix[pivot_row][column], prime - 2, prime)
        matrix[pivot_row] = [value * inverse % prime for value in matrix[pivot_row]]
        for row in range(field_degree):
            if row == pivot_row or matrix[row][column] % prime == 0:
                continue
            multiplier = matrix[row][column]
            matrix[row] = [
                (left - multiplier * right) % prime
                for left, right in zip(matrix[row], matrix[pivot_row], strict=True)
            ]
        pivots.append(column)
        pivot_row += 1
        if pivot_row == field_degree:
            break
    if any(
        all(value % prime == 0 for value in row[:-1]) and row[-1] % prime
        for row in matrix
    ):
        raise OMDomainError("the bounded finite-field lift has no solution")
    solution = [0] * len(values)
    for row, column in enumerate(pivots):
        solution[column] = matrix[row][-1]
    return tuple(solution)


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


def next_residue_field(
    prime: int,
    level: OMLevel,
) -> tuple[Polynomial, ResidueElement]:
    """Return the bounded next residue field and its distinguished generator."""
    factor = level.residual_factor
    if len(factor) == 2:
        modulus = level.residual_field_modulus
        leading_inverse = _residue_inverse(factor[1], prime, modulus)
        root = _residue_multiply(
            _residue_subtract((0,), factor[0], prime, modulus),
            leading_inverse,
            prime,
            modulus,
        )
        if root == (0,):
            raise OMDomainError("the next residual generator must be nonzero")
        return modulus, root
    modulus = _prime_field_modulus(factor)
    if polynomial_degree(modulus) != 2:
        raise OMDomainError("the bounded next residue extension must be quadratic")
    return modulus, (0, 1)


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
    """Compute a third-order residual in the bounded recursive domain."""
    if first_level.order != 1 or second_level.order != 2:
        raise OMDomainError("order-three residuals require two active levels")
    return recursive_residual_evidence(
        polynomial,
        prime,
        higher_key,
        (first_level, second_level),
        side,
    )


def recursive_residual_evidence(
    polynomial: Polynomial,
    prime: int,
    higher_key: Polynomial,
    levels: tuple[OMLevel, ...],
    side: NewtonSide,
) -> HigherResidualEvidence:
    """Compute a bounded higher residual by recursively evaluating components."""
    if not levels:
        raise OMDomainError("higher residual evidence requires a prior type")
    if len(levels) == 1:
        return order_two_residual_evidence(
            polynomial, prime, higher_key, levels[0], side
        )
    last = levels[-1]
    modulus, root = next_residue_field(prime, last)
    height = -last.slope.numerator
    ramification = last.ramification_index
    bezout = _bezout_height_coefficient(height, ramification)
    key_value = maclane_integer_valuation(higher_key, prime, levels)
    if key_value is None:
        raise ArithmeticError("a recursive residual key has infinite prior value")
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
        coefficient_value = maclane_integer_valuation(coefficient, prime, levels)
        expected = side.ordinate_at(exponent)
        if expected.denominator != 1:
            raise OMDomainError("a recursive residual ordinate must be integral")
        if coefficient_value is None:
            coefficients.append((0,))
            continue
        ordinate = coefficient_value + exponent * key_value
        if ordinate < expected.numerator:
            raise OMDomainError("a component lies below its recursive residual side")
        if ordinate > expected.numerator:
            coefficients.append((0,))
            continue
        component = _component_side(coefficient, prime, last, levels[:-1])
        lower = recursive_residual_evidence(
            coefficient,
            prime,
            last.key_polynomial,
            levels[:-1],
            component,
        )
        component_left = component.left.abscissa
        twist_numerator = component_left - bezout * ordinate
        if twist_numerator % ramification:
            raise ArithmeticError("a recursive residual twist is not integral")
        twist = twist_numerator // ramification
        value = _evaluate_residual(lower.polynomial, root, prime, modulus)
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
    """Lift a bounded residual factor through the first type's mixed radix."""
    factor = second_level.residual_factor
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
        target = _residue_multiply(
            residue_coefficient,
            second_level.residual_polynomial[-1],
            prime,
            root_modulus,
        )
        if target == (0,):
            continue
        exponent = index * ramification
        ordinate = right_ordinate + (degree - index) * height
        target_value = ordinate - exponent * key_value
        candidates: list[Polynomial] = []
        values: list[ResidueElement] = []
        first_radix = first_level.ramification_index * first_level.residue_degree
        for first_digit in range(first_radix):
            first_power = polynomial_power(first_level.key_polynomial, first_digit)
            for initial_digit in range(polynomial_degree(first_level.key_polynomial)):
                mixed_monomial = polynomial_multiply(
                    (0,) * initial_digit + (1,), first_power
                )
                monomial_value = maclane_integer_valuation(
                    mixed_monomial, prime, (first_level,)
                )
                if monomial_value is None:
                    continue
                difference = target_value - monomial_value
                if difference < 0 or difference % first_ramification:
                    continue
                prime_exponent = difference // first_ramification
                candidate = tuple(
                    prime**prime_exponent * value for value in mixed_monomial
                )
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
                candidates.append(candidate)
                values.append(_residue_multiply(value, root_power, prime, root_modulus))
        solution = _residue_linear_solution(values, target, prime, root_modulus)
        lifted: Polynomial = (0,)
        for scalar, candidate in zip(solution, candidates, strict=True):
            if scalar:
                lifted = polynomial_add(
                    lifted, tuple(scalar * value for value in candidate)
                )
        if lifted == (0,):
            raise OMDomainError("bounded mixed-radix coefficient lift failed")
        result = polynomial_add(
            result,
            polynomial_multiply(lifted, polynomial_power(key, exponent)),
        )
    return normalize_polynomial(result)


def order_three_refinement(
    prime: int,
    first_level: OMLevel,
    second_level: OMLevel,
    key: Polynomial,
    side: NewtonSide,
    factor: ResidualPolynomial,
) -> Polynomial:
    """Refine a repeated linear third residual by a mixed-radix lift."""
    return recursive_linear_refinement(
        prime,
        (first_level, second_level),
        key,
        side,
        factor,
    )


def recursive_linear_refinement(
    prime: int,
    levels: tuple[OMLevel, ...],
    key: Polynomial,
    side: NewtonSide,
    factor: ResidualPolynomial,
) -> Polynomial:
    """Refine one repeated linear higher factor in the bounded mixed radix."""
    if len(levels) < 2 or len(factor) != 2:
        raise OMDomainError("recursive refinement requires a linear higher factor")
    modulus, _root = next_residue_field(prime, levels[-1])
    target = _residue_multiply(
        factor[0],
        _residue_inverse(factor[1], prime, modulus),
        prime,
        modulus,
    )
    key_value = maclane_integer_valuation(key, prime, levels)
    if key_value is None:
        raise ArithmeticError("a recursive refinement key has infinite prior value")
    target_value = key_value + side.height
    products: list[Polynomial] = [
        (0,) * index + (1,)
        for index in range(polynomial_degree(levels[0].key_polynomial))
    ]
    for level in levels:
        expanded: list[Polynomial] = []
        for digit in range(level.ramification_index * level.residue_degree):
            power = polynomial_power(level.key_polynomial, digit)
            for product in products:
                expanded.append(polynomial_multiply(product, power))
        products = expanded
    ramification = 1
    for level in levels:
        ramification *= level.ramification_index
    candidates: list[Polynomial] = []
    values: list[ResidueElement] = []
    last = levels[-1]
    for product in products:
        for prime_exponent in range(target_value // ramification + 2):
            candidate = tuple(prime**prime_exponent * value for value in product)
            if maclane_integer_valuation(candidate, prime, levels) != target_value:
                continue
            component = _component_side(candidate, prime, last, levels[:-1])
            lower = recursive_residual_evidence(
                candidate,
                prime,
                last.key_polynomial,
                levels[:-1],
                component,
            )
            bezout = _bezout_height_coefficient(
                -last.slope.numerator, last.ramification_index
            )
            twist_numerator = component.left.abscissa - bezout * target_value
            if twist_numerator % last.ramification_index:
                continue
            twist = twist_numerator // last.ramification_index
            value = _evaluate_residual(lower.polynomial, _root, prime, modulus)
            root_power = _residue_power(_root, abs(twist), prime, modulus)
            if twist < 0:
                root_power = _residue_inverse(root_power, prime, modulus)
            candidates.append(candidate)
            values.append(_residue_multiply(value, root_power, prime, modulus))
    solution = _residue_linear_solution(values, target, prime, modulus)
    correction: Polynomial = (0,)
    for scalar, candidate in zip(solution, candidates, strict=True):
        if scalar:
            correction = polynomial_add(
                correction, tuple(scalar * value for value in candidate)
            )
    if correction == (0,):
        raise OMDomainError("bounded recursive refinement made no progress")
    return normalize_polynomial(polynomial_add(key, correction))


__all__ = [
    "HigherResidualEvidence",
    "next_residue_field",
    "recursive_linear_refinement",
    "recursive_residual_evidence",
    "order_three_refinement",
    "order_three_residual_evidence",
    "order_two_representative",
    "order_two_residual_evidence",
]
