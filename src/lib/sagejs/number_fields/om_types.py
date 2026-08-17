"""Bounded Ore--MacLane arithmetic and inspectable type certificates.

This module implements a bounded, certified Ore--MacLane slice over `ZZ[x]`.
It includes first-order residual arithmetic over arbitrary small finite residue
fields and same-degree representative optimization.  It deliberately stops,
with an explicit certificate state, when a degree-raising higher type is
required.  No incomplete type is ever reported as a maximality proof.

Polynomials are immutable tuples of integer coefficients in ascending order.
The implementation is ordinary CPython source and has no native/runtime
dependency; it is also suitable for source-transparent Sage.js compilation.

The mathematical conventions follow Guàrdia--Montes--Nart, *Higher Newton
polygons and integral bases*, especially Definitions 3.1, 3.4--3.5 and
Theorem 3.3.  The precision and selector evidence follows Poteaux--Weimann,
*Fast computation of integral bases*, Theorem 3 and Sections 3.1--3.2.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from typing import TypeAlias

Polynomial: TypeAlias = tuple[int, ...]
ResidueElement: TypeAlias = Polynomial
ResidualPolynomial: TypeAlias = tuple[ResidueElement, ...]


class OMDomainError(ValueError):
    """The requested computation lies outside the certified bounded domain."""


class OMResourceError(RuntimeError):
    """A deterministic work bound prevented an otherwise valid computation."""


class ImmutableOMRecord:
    """A dataclass base that remains immutable in CPython and Sage.js."""

    def __post_init__(self) -> None:
        object.__setattr__(self, "_om_record_sealed", True)

    def __setattr__(self, name: str, value: object) -> None:
        if getattr(self, "_om_record_sealed", False):
            raise AttributeError("OM certificate records are immutable")
        object.__setattr__(self, name, value)


def _integer_gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _is_prime(value: int) -> bool:
    if value < 2:
        return False
    if value % 2 == 0:
        return value == 2
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


@dataclass
class RationalValue(ImmutableOMRecord):
    """A normalized exact rational used by valuation certificates."""

    numerator: int
    denominator: int = 1

    def __post_init__(self) -> None:
        if self.denominator == 0:
            raise ZeroDivisionError("a rational denominator must be nonzero")
        numerator = self.numerator
        denominator = self.denominator
        if denominator < 0:
            numerator = -numerator
            denominator = -denominator
        divisor = _integer_gcd(numerator, denominator)
        object.__setattr__(self, "numerator", numerator // divisor)
        object.__setattr__(self, "denominator", denominator // divisor)
        super().__post_init__()

    def __add__(self, other: RationalValue | int) -> RationalValue:
        right = as_rational(other)
        return RationalValue(
            self.numerator * right.denominator + right.numerator * self.denominator,
            self.denominator * right.denominator,
        )

    def __radd__(self, other: RationalValue | int) -> RationalValue:
        return self + other

    def __sub__(self, other: RationalValue | int) -> RationalValue:
        right = as_rational(other)
        return RationalValue(
            self.numerator * right.denominator - right.numerator * self.denominator,
            self.denominator * right.denominator,
        )

    def __rsub__(self, other: RationalValue | int) -> RationalValue:
        return as_rational(other) - self

    def __mul__(self, other: RationalValue | int) -> RationalValue:
        right = as_rational(other)
        return RationalValue(
            self.numerator * right.numerator,
            self.denominator * right.denominator,
        )

    def __rmul__(self, other: RationalValue | int) -> RationalValue:
        return self * other

    def __truediv__(self, other: RationalValue | int) -> RationalValue:
        right = as_rational(other)
        if right.numerator == 0:
            raise ZeroDivisionError("division by zero")
        return RationalValue(
            self.numerator * right.denominator,
            self.denominator * right.numerator,
        )

    def __neg__(self) -> RationalValue:
        return RationalValue(-self.numerator, self.denominator)

    def __lt__(self, other: RationalValue | int) -> bool:
        right = as_rational(other)
        return self.numerator * right.denominator < right.numerator * self.denominator

    def __le__(self, other: RationalValue | int) -> bool:
        right = as_rational(other)
        return self.numerator * right.denominator <= right.numerator * self.denominator

    def __gt__(self, other: RationalValue | int) -> bool:
        return not self <= other

    def __ge__(self, other: RationalValue | int) -> bool:
        return not self < other

    def floor(self) -> int:
        return self.numerator // self.denominator

    def to_pair(self) -> tuple[int, int]:
        return (self.numerator, self.denominator)


def as_rational(value: RationalValue | int) -> RationalValue:
    if isinstance(value, RationalValue):
        return value
    return RationalValue(value)


def normalize_polynomial(coefficients: tuple[int, ...] | list[int]) -> Polynomial:
    """Return the canonical ascending-coefficient representation."""
    values = list(coefficients)
    while len(values) > 1 and values[-1] == 0:
        values.pop()
    if not values:
        values.append(0)
    return tuple(values)


def polynomial_degree(polynomial: Polynomial) -> int:
    polynomial = normalize_polynomial(polynomial)
    if polynomial == (0,):
        return -1
    return len(polynomial) - 1


def polynomial_add(left: Polynomial, right: Polynomial) -> Polynomial:
    size = max(len(left), len(right))
    result = [0] * size
    for index in range(size):
        if index < len(left):
            result[index] += left[index]
        if index < len(right):
            result[index] += right[index]
    return normalize_polynomial(result)


def polynomial_subtract(left: Polynomial, right: Polynomial) -> Polynomial:
    size = max(len(left), len(right))
    result = [0] * size
    for index in range(size):
        if index < len(left):
            result[index] += left[index]
        if index < len(right):
            result[index] -= right[index]
    return normalize_polynomial(result)


def polynomial_multiply(left: Polynomial, right: Polynomial) -> Polynomial:
    if left == (0,) or right == (0,):
        return (0,)
    result = [0] * (len(left) + len(right) - 1)
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            result[left_index + right_index] += left_value * right_value
    return normalize_polynomial(result)


def polynomial_power(polynomial: Polynomial, exponent: int) -> Polynomial:
    if exponent < 0:
        raise ValueError("a polynomial exponent must be nonnegative")
    result: Polynomial = (1,)
    power = normalize_polynomial(polynomial)
    remaining = exponent
    while remaining:
        if remaining % 2:
            result = polynomial_multiply(result, power)
        remaining //= 2
        if remaining:
            power = polynomial_multiply(power, power)
    return result


def polynomial_divmod_monic(
    dividend: Polynomial,
    divisor: Polynomial,
) -> tuple[Polynomial, Polynomial]:
    """Divide in `ZZ[x]`; `divisor` must be monic."""
    divisor = normalize_polynomial(divisor)
    if divisor == (0,):
        raise ZeroDivisionError("polynomial division by zero")
    if divisor[-1] != 1:
        raise OMDomainError("integer phi-adic division requires a monic key")
    remainder = list(normalize_polynomial(dividend))
    divisor_degree = len(divisor) - 1
    if len(remainder) - 1 < divisor_degree:
        return (0,), tuple(remainder)
    quotient = [0] * (len(remainder) - divisor_degree)
    while len(remainder) - 1 >= divisor_degree and remainder != [0]:
        shift = len(remainder) - 1 - divisor_degree
        coefficient = remainder[-1]
        quotient[shift] = coefficient
        for index, value in enumerate(divisor):
            remainder[index + shift] -= coefficient * value
        while len(remainder) > 1 and remainder[-1] == 0:
            remainder.pop()
    return normalize_polynomial(quotient), normalize_polynomial(remainder)


def phi_adic_expansion(
    polynomial: Polynomial, key: Polynomial
) -> tuple[Polynomial, ...]:
    """Return `a_s` with `polynomial = sum(a_s * key**s)` and `deg(a_s)<deg(key)`."""
    key = normalize_polynomial(key)
    if polynomial_degree(key) <= 0 or key[-1] != 1:
        raise OMDomainError("a key polynomial must be monic of positive degree")
    coefficients: list[Polynomial] = []
    quotient = normalize_polynomial(polynomial)
    while quotient != (0,):
        quotient, remainder = polynomial_divmod_monic(quotient, key)
        coefficients.append(remainder)
    if not coefficients:
        coefficients.append((0,))
    return tuple(coefficients)


def phi_quotients(polynomial: Polynomial, key: Polynomial) -> tuple[Polynomial, ...]:
    """Return the successive quotients from the canonical phi expansion."""
    quotients: list[Polynomial] = []
    quotient = normalize_polynomial(polynomial)
    while polynomial_degree(quotient) >= polynomial_degree(key):
        quotient, _remainder = polynomial_divmod_monic(quotient, key)
        quotients.append(quotient)
    return tuple(quotients)


def p_adic_valuation(value: int, prime: int) -> int | None:
    """Return `v_p(value)`, using `None` for infinity."""
    if prime < 2:
        raise ValueError("the prime must be at least two")
    if value == 0:
        return None
    remaining = abs(value)
    valuation = 0
    while remaining % prime == 0:
        remaining //= prime
        valuation += 1
    return valuation


def coefficient_valuation(polynomial: Polynomial, prime: int) -> int | None:
    answer: int | None = None
    for coefficient in polynomial:
        valuation = p_adic_valuation(coefficient, prime)
        if valuation is not None and (answer is None or valuation < answer):
            answer = valuation
    return answer


def gauss_valuation(polynomial: Polynomial, prime: int) -> RationalValue | None:
    valuation = coefficient_valuation(polynomial, prime)
    if valuation is None:
        return None
    return RationalValue(valuation)


def augmented_valuation(
    polynomial: Polynomial,
    prime: int,
    key: Polynomial,
    key_value: RationalValue,
) -> RationalValue | None:
    """Evaluate the first MacLane augmentation `[v_p; key, key_value]`."""
    answer: RationalValue | None = None
    for exponent, coefficient in enumerate(phi_adic_expansion(polynomial, key)):
        base = gauss_valuation(coefficient, prime)
        if base is None:
            continue
        value = base + exponent * key_value
        if answer is None or value < answer:
            answer = value
    return answer


def _mod_polynomial(polynomial: Polynomial, prime: int) -> Polynomial:
    return normalize_polynomial(tuple(value % prime for value in polynomial))


def _residue_normalize(
    value: ResidueElement,
    prime: int,
    modulus: Polynomial,
) -> ResidueElement:
    _quotient, remainder = modular_divmod(value, modulus, prime)
    return _mod_polynomial(remainder, prime)


def _residue_subtract(
    left: ResidueElement,
    right: ResidueElement,
    prime: int,
    modulus: Polynomial,
) -> ResidueElement:
    return _residue_normalize(polynomial_subtract(left, right), prime, modulus)


def _residue_multiply(
    left: ResidueElement,
    right: ResidueElement,
    prime: int,
    modulus: Polynomial,
) -> ResidueElement:
    return _residue_normalize(polynomial_multiply(left, right), prime, modulus)


def _residue_power(
    value: ResidueElement,
    exponent: int,
    prime: int,
    modulus: Polynomial,
) -> ResidueElement:
    if exponent < 0:
        raise ValueError("a residue exponent must be nonnegative")
    result: ResidueElement = (1,)
    power = _residue_normalize(value, prime, modulus)
    remaining = exponent
    while remaining:
        if remaining % 2:
            result = _residue_multiply(result, power, prime, modulus)
        remaining //= 2
        if remaining:
            power = _residue_multiply(power, power, prime, modulus)
    return result


def _residue_inverse(
    value: ResidueElement,
    prime: int,
    modulus: Polynomial,
) -> ResidueElement:
    """Invert by the finite-field identity `a^(q-2)`.

    The modulus has already been certified irreducible by the initial modular
    factorization.  Exponentiation is compact, deterministic, and independent
    from the trial-factorization code used below.
    """
    value = _residue_normalize(value, prime, modulus)
    if value == (0,):
        raise ZeroDivisionError("zero has no residue-field inverse")
    field_size = prime ** polynomial_degree(modulus)
    return _residue_power(value, field_size - 2, prime, modulus)


def _residual_normalize(
    polynomial: ResidualPolynomial,
    prime: int,
    modulus: Polynomial,
) -> ResidualPolynomial:
    values = [
        _residue_normalize(coefficient, prime, modulus) for coefficient in polynomial
    ]
    while len(values) > 1 and values[-1] == (0,):
        values.pop()
    if not values:
        values.append((0,))
    return tuple(values)


def _residual_divmod(
    dividend: ResidualPolynomial,
    divisor: ResidualPolynomial,
    prime: int,
    modulus: Polynomial,
) -> tuple[ResidualPolynomial, ResidualPolynomial]:
    divisor = _residual_normalize(divisor, prime, modulus)
    if divisor == ((0,),):
        raise ZeroDivisionError("residual polynomial division by zero")
    remainder = list(_residual_normalize(dividend, prime, modulus))
    divisor_degree = len(divisor) - 1
    inverse = _residue_inverse(divisor[-1], prime, modulus)
    if len(remainder) - 1 < divisor_degree:
        return ((0,),), tuple(remainder)
    quotient: list[ResidueElement] = [(0,)] * (len(remainder) - divisor_degree)
    while len(remainder) - 1 >= divisor_degree and remainder != [(0,)]:
        shift = len(remainder) - 1 - divisor_degree
        leading = _residue_multiply(remainder[-1], inverse, prime, modulus)
        quotient[shift] = leading
        for index, value in enumerate(divisor):
            product = _residue_multiply(leading, value, prime, modulus)
            remainder[index + shift] = _residue_subtract(
                remainder[index + shift], product, prime, modulus
            )
        while len(remainder) > 1 and remainder[-1] == (0,):
            remainder.pop()
    return _residual_normalize(tuple(quotient), prime, modulus), _residual_normalize(
        tuple(remainder), prime, modulus
    )


def _mod_inverse(value: int, prime: int) -> int:
    value %= prime
    if value == 0:
        raise ZeroDivisionError("zero has no modular inverse")
    old_r, remainder = value, prime
    old_s, coefficient = 1, 0
    while remainder:
        quotient = old_r // remainder
        old_r, remainder = remainder, old_r - quotient * remainder
        old_s, coefficient = coefficient, old_s - quotient * coefficient
    if old_r != 1:
        raise OMDomainError("the modulus is not prime at a required inversion")
    return old_s % prime


def modular_divmod(
    dividend: Polynomial,
    divisor: Polynomial,
    prime: int,
) -> tuple[Polynomial, Polynomial]:
    divisor = _mod_polynomial(divisor, prime)
    if divisor == (0,):
        raise ZeroDivisionError("polynomial division by zero")
    remainder = list(_mod_polynomial(dividend, prime))
    divisor_degree = polynomial_degree(divisor)
    inverse = _mod_inverse(divisor[-1], prime)
    if len(remainder) - 1 < divisor_degree:
        return (0,), tuple(remainder)
    quotient = [0] * (len(remainder) - divisor_degree)
    while len(remainder) - 1 >= divisor_degree and remainder != [0]:
        shift = len(remainder) - 1 - divisor_degree
        leading = remainder[-1] * inverse % prime
        quotient[shift] = leading
        for index, value in enumerate(divisor):
            remainder[index + shift] = (
                remainder[index + shift] - leading * value
            ) % prime
        while len(remainder) > 1 and remainder[-1] == 0:
            remainder.pop()
    return _mod_polynomial(tuple(quotient), prime), _mod_polynomial(
        tuple(remainder), prime
    )


@dataclass
class ModularFactor(ImmutableOMRecord):
    polynomial: Polynomial
    multiplicity: int


@dataclass
class ResidualFactor(ImmutableOMRecord):
    polynomial: ResidualPolynomial
    multiplicity: int


def _monic_polynomials(degree: int, prime: int) -> Iterator[Polynomial]:
    count = prime**degree
    for encoded in range(count):
        coefficients = []
        value = encoded
        for _index in range(degree):
            coefficients.append(value % prime)
            value //= prime
        coefficients.append(1)
        yield tuple(coefficients)


def factor_mod_prime(
    polynomial: Polynomial,
    prime: int,
    *,
    max_enumerated_candidates: int = 200_000,
) -> tuple[ModularFactor, ...]:
    """Deterministically factor a bounded monic polynomial over `F_p`.

    Trial division by increasing monic degree is intentionally used here: it is
    small, independently auditable, and sufficient for differential fixtures.
    Larger residual problems are delegated to the future FLINT-backed lane.
    """
    remaining = _mod_polynomial(polynomial, prime)
    if remaining == (0,) or remaining[-1] != 1:
        raise OMDomainError("bounded modular factorization requires monic input")
    factors: list[ModularFactor] = []
    used = 0
    degree = 1
    while 2 * degree <= polynomial_degree(remaining):
        count = prime**degree
        used += count
        if used > max_enumerated_candidates:
            raise OMResourceError(
                "bounded modular factorization candidate limit exceeded"
            )
        for candidate in _monic_polynomials(degree, prime):
            multiplicity = 0
            while polynomial_degree(remaining) >= degree:
                quotient, remainder = modular_divmod(remaining, candidate, prime)
                if remainder != (0,):
                    break
                remaining = quotient
                multiplicity += 1
            if multiplicity:
                factors.append(ModularFactor(candidate, multiplicity))
        degree += 1
    if polynomial_degree(remaining) > 0:
        factors.append(ModularFactor(remaining, 1))
    return tuple(factors)


def _residue_elements(prime: int, modulus: Polynomial) -> Iterator[ResidueElement]:
    degree = polynomial_degree(modulus)
    for encoded in range(prime**degree):
        coefficients = []
        value = encoded
        for _index in range(degree):
            coefficients.append(value % prime)
            value //= prime
        yield normalize_polynomial(coefficients)


def _monic_residual_polynomials(
    degree: int,
    prime: int,
    modulus: Polynomial,
) -> Iterator[ResidualPolynomial]:
    elements = tuple(_residue_elements(prime, modulus))
    count = len(elements) ** degree
    for encoded in range(count):
        coefficients: list[ResidueElement] = []
        value = encoded
        for _index in range(degree):
            coefficients.append(elements[value % len(elements)])
            value //= len(elements)
        coefficients.append((1,))
        yield tuple(coefficients)


def factor_residual_polynomial(
    polynomial: ResidualPolynomial,
    prime: int,
    modulus: Polynomial,
    *,
    max_enumerated_candidates: int = 200_000,
) -> tuple[ResidualFactor, ...]:
    """Factor a bounded monic polynomial over `F_p[x]/(modulus)`.

    This exhaustive implementation is deliberately bounded.  It makes the
    mathematical residual-extension path executable in ordinary Python while
    larger fields remain an explicit future FLINT `fq` acceleration domain.
    """
    modulus = _mod_polynomial(modulus, prime)
    if polynomial_degree(modulus) <= 0 or modulus[-1] != 1:
        raise OMDomainError("a residual field modulus must be monic")
    remaining = _residual_normalize(polynomial, prime, modulus)
    if remaining == ((0,),) or remaining[-1] != (1,):
        raise OMDomainError("bounded residual factorization requires monic input")
    field_size = prime ** polynomial_degree(modulus)
    factors: list[ResidualFactor] = []
    used = 0
    degree = 1
    while 2 * degree <= len(remaining) - 1:
        count = field_size**degree
        used += count
        if used > max_enumerated_candidates:
            raise OMResourceError(
                "bounded residual factorization candidate limit exceeded"
            )
        for candidate in _monic_residual_polynomials(degree, prime, modulus):
            multiplicity = 0
            while len(remaining) - 1 >= degree:
                quotient, remainder = _residual_divmod(
                    remaining, candidate, prime, modulus
                )
                if remainder != ((0,),):
                    break
                remaining = quotient
                multiplicity += 1
            if multiplicity:
                factors.append(ResidualFactor(candidate, multiplicity))
        degree += 1
    if len(remaining) - 1 > 0:
        leading_inverse = _residue_inverse(remaining[-1], prime, modulus)
        remaining = tuple(
            _residue_multiply(value, leading_inverse, prime, modulus)
            for value in remaining
        )
        factors.append(ResidualFactor(remaining, 1))
    return tuple(factors)


@dataclass
class NewtonPoint(ImmutableOMRecord):
    abscissa: int
    ordinate: int


@dataclass
class NewtonSide(ImmutableOMRecord):
    left: NewtonPoint
    right: NewtonPoint
    slope: RationalValue
    ramification_index: int
    height: int

    def ordinate_at(self, abscissa: int) -> RationalValue:
        if abscissa < self.left.abscissa or abscissa > self.right.abscissa:
            raise ValueError("abscissa lies outside this Newton side")
        return RationalValue(self.left.ordinate) + self.slope * (
            abscissa - self.left.abscissa
        )

    def lattice_length(self) -> int:
        return (self.right.abscissa - self.left.abscissa) // self.ramification_index


def lower_newton_polygon(points: tuple[NewtonPoint, ...]) -> tuple[NewtonSide, ...]:
    """Return all negative-slope sides of the lower convex hull."""
    ordered = sorted(points, key=lambda point: point.abscissa)
    hull: list[NewtonPoint] = []
    for point in ordered:
        while len(hull) >= 2:
            first = hull[-2]
            second = hull[-1]
            cross = (second.abscissa - first.abscissa) * (
                point.ordinate - first.ordinate
            ) - (second.ordinate - first.ordinate) * (point.abscissa - first.abscissa)
            if cross > 0:
                break
            hull.pop()
        hull.append(point)
    sides: list[NewtonSide] = []
    for left, right in zip(hull, hull[1:], strict=False):
        slope = RationalValue(
            right.ordinate - left.ordinate,
            right.abscissa - left.abscissa,
        )
        if slope.numerator < 0:
            sides.append(
                NewtonSide(
                    left,
                    right,
                    slope,
                    slope.denominator,
                    -slope.numerator,
                )
            )
    return tuple(sides)


def newton_polygon(
    polynomial: Polynomial,
    prime: int,
    key: Polynomial,
) -> tuple[NewtonSide, ...]:
    points = []
    for exponent, coefficient in enumerate(phi_adic_expansion(polynomial, key)):
        valuation = coefficient_valuation(coefficient, prime)
        if valuation is not None:
            points.append(NewtonPoint(exponent, valuation))
    if len(points) < 2:
        return ()
    return lower_newton_polygon(tuple(points))


def polygon_index(sides: tuple[NewtonSide, ...]) -> int:
    """Count positive integral lattice ordinates below the principal polygon."""
    total = 0
    for side in sides:
        for abscissa in range(side.left.abscissa + 1, side.right.abscissa + 1):
            ordinate = side.ordinate_at(abscissa).floor()
            if ordinate > 0:
                total += ordinate
    return total


def residual_polynomial(
    expansion: tuple[Polynomial, ...],
    side: NewtonSide,
    prime: int,
    key: Polynomial,
) -> ResidualPolynomial:
    """Compute the first residual polynomial over `F_p[x]/(key mod p)`."""
    modulus = _mod_polynomial(key, prime)
    coefficients: list[ResidueElement] = []
    step = side.ramification_index
    for abscissa in range(side.left.abscissa, side.right.abscissa + 1, step):
        expected = side.ordinate_at(abscissa)
        if expected.denominator != 1:
            raise ArithmeticError("a residual lattice ordinate is not integral")
        coefficient = expansion[abscissa] if abscissa < len(expansion) else (0,)
        valuation = coefficient_valuation(coefficient, prime)
        if valuation is None or valuation != expected.numerator:
            coefficients.append((0,))
            continue
        scale = prime**valuation
        primitive = tuple(value // scale for value in coefficient)
        coefficients.append(_residue_normalize(primitive, prime, modulus))
    return _residual_normalize(tuple(coefficients), prime, modulus)


def representative_from_residual_factor(
    key: Polynomial,
    side: NewtonSide,
    factor: ResidualPolynomial,
    prime: int,
) -> Polynomial:
    """Lift a first residual factor to its canonical next representative.

    For a side of slope `-h/e` and residual factor
    `psi(y)=sum psi_j*y^j`, the lift is
    `sum p^((f-j)h) * lift(psi_j) * key^(j*e)`.  The bounded type builder uses
    this representative automatically only when its degree equals the current
    key degree; degree-raising higher types remain explicit and fail closed.
    """
    factor = _residual_normalize(factor, prime, _mod_polynomial(key, prime))
    residual_degree = len(factor) - 1
    result: Polynomial = (0,)
    for index, coefficient in enumerate(factor):
        scale = prime ** ((residual_degree - index) * side.height)
        lifted = tuple(scale * value for value in coefficient)
        term = polynomial_multiply(
            lifted,
            polynomial_power(key, index * side.ramification_index),
        )
        result = polynomial_add(result, term)
    return normalize_polynomial(result)


@dataclass
class OMLevel(ImmutableOMRecord):
    order: int
    key_polynomial: Polynomial
    key_value: RationalValue
    slope: RationalValue
    residual_field_modulus: Polynomial
    residual_polynomial: ResidualPolynomial
    residual_factor: ResidualPolynomial
    ramification_index: int
    residue_degree: int
    multiplicity: int
    index_contribution: int
    representative_precision: int
    representative_step: int
    optimized_away: bool


def representative_from_level(level: OMLevel, prime: int) -> Polynomial:
    """Reconstruct the canonical next representative recorded by `level`."""
    height = -level.slope.numerator
    if height <= 0:
        raise OMDomainError("a representative requires a negative Newton slope")
    residual_degree = len(level.residual_factor) - 1
    result: Polynomial = (0,)
    for index, coefficient in enumerate(level.residual_factor):
        scale = prime ** ((residual_degree - index) * height)
        lifted = tuple(scale * value for value in coefficient)
        term = polynomial_multiply(
            lifted,
            polynomial_power(level.key_polynomial, index * level.ramification_index),
        )
        result = polynomial_add(result, term)
    return normalize_polynomial(result)


@dataclass
class OMType(ImmutableOMRecord):
    branch_id: str
    parent_id: str
    prime: int
    initial_factor: Polynomial
    initial_multiplicity: int
    levels: tuple[OMLevel, ...]
    branch_degree: int
    complete: bool
    refinement_state: str


@dataclass
class OMTypeTree(ImmutableOMRecord):
    polynomial: Polynomial
    prime: int
    initial_factors: tuple[ModularFactor, ...]
    types: tuple[OMType, ...]
    expected_index_valuation: int
    complete: bool
    precision: int
    max_enumerated_candidates: int
    max_representative_refinements: int
    certificate_id: str

    def incomplete_states(self) -> tuple[str, ...]:
        return tuple(
            branch.refinement_state for branch in self.types if not branch.complete
        )


def _certificate_text(
    polynomial: Polynomial,
    prime: int,
    factors: tuple[ModularFactor, ...],
    types: tuple[OMType, ...],
    index: int,
    max_enumerated_candidates: int,
    max_representative_refinements: int,
) -> str:
    factor_text = ";".join(
        ",".join(str(value) for value in factor.polynomial)
        + "^"
        + str(factor.multiplicity)
        for factor in factors
    )
    type_parts = []
    for branch in types:
        level_parts = []
        for level in branch.levels:
            residual = "/".join(
                ",".join(str(value) for value in coefficient)
                for coefficient in level.residual_polynomial
            )
            factor = "/".join(
                ",".join(str(value) for value in coefficient)
                for coefficient in level.residual_factor
            )
            level_parts.append(
                ",".join(str(value) for value in level.key_polynomial)
                + "@"
                + str(level.slope.numerator)
                + "/"
                + str(level.slope.denominator)
                + "@"
                + residual
                + "@"
                + factor
                + "@"
                + ("optimized" if level.optimized_away else "active")
            )
        type_parts.append(
            branch.branch_id
            + ":"
            + branch.refinement_state
            + ":"
            + str(branch.branch_degree)
            + ":"
            + "~".join(level_parts)
        )
    type_text = ";".join(type_parts)
    return (
        ",".join(str(value) for value in polynomial)
        + "|"
        + str(prime)
        + "|"
        + factor_text
        + "|"
        + type_text
        + "|"
        + str(index)
        + "|"
        + str(max_enumerated_candidates)
        + "|"
        + str(max_representative_refinements)
    )


def stable_certificate_id(text: str) -> str:
    """Return a deterministic non-cryptographic identifier for trace comparison."""
    value = 1_469_598_103_934_665_603
    modulus = 18_446_744_073_709_551_616
    for character in text:
        value ^= ord(character)
        value = value * 1_099_511_628_211 % modulus
    digits = "0123456789abcdef"
    encoded = ""
    for _index in range(16):
        encoded = digits[value % 16] + encoded
        value //= 16
    return "om2-" + encoded


def _analyze_bounded_key(
    polynomial: Polynomial,
    prime: int,
    initial_factor: ModularFactor,
    factor_index: int,
    key: Polynomial,
    prior_levels: tuple[OMLevel, ...],
    maximum_valuation: int,
    *,
    max_enumerated_candidates: int,
    max_representative_refinements: int,
) -> tuple[tuple[OMType, ...], int]:
    """Analyze one initial factor, optimizing same-degree representatives."""
    expansion = phi_adic_expansion(polynomial, key)
    sides = newton_polygon(polynomial, prime, key)
    factor_degree = polynomial_degree(initial_factor.polynomial)
    prefix = "f" + str(factor_index)
    if prior_levels:
        prefix += "o" + str(len(prior_levels) + 1)
    if not sides:
        complete = initial_factor.multiplicity == 1 and not prior_levels
        return (
            (
                OMType(
                    prefix,
                    "root" if not prior_levels else prefix + "-refinement",
                    prime,
                    initial_factor.polynomial,
                    initial_factor.multiplicity,
                    prior_levels,
                    factor_degree,
                    complete,
                    "complete" if complete else "no-negative-side",
                ),
            ),
            0,
        )

    residual_data: list[
        tuple[NewtonSide, ResidualPolynomial, tuple[ResidualFactor, ...]]
    ] = []
    for side in sides:
        residual = residual_polynomial(expansion, side, prime, key)
        factors = factor_residual_polynomial(
            residual,
            prime,
            _mod_polynomial(key, prime),
            max_enumerated_candidates=max_enumerated_candidates,
        )
        residual_data.append((side, residual, factors))

    # An e=f=1 residual factor has another representative of the same degree.
    # Replacing the key is an OM optimization step, not a new index increment.
    # Restricting this automatic step to a unique side/factor prevents an
    # optimization intended for one branch from silently consuming siblings.
    if len(residual_data) == 1:
        side, residual, factors = residual_data[0]
        if (
            len(factors) == 1
            and factors[0].multiplicity > 1
            and side.ramification_index == 1
            and len(factors[0].polynomial) == 2
        ):
            repeated = factors[0]
            representative = representative_from_residual_factor(
                key, side, repeated.polynomial, prime
            )
            if (
                polynomial_degree(representative) == polynomial_degree(key)
                and representative != key
                and len(prior_levels) < max_representative_refinements
            ):
                level = OMLevel(
                    1,
                    key,
                    -side.slope,
                    side.slope,
                    _mod_polynomial(key, prime),
                    residual,
                    repeated.polynomial,
                    side.ramification_index,
                    len(repeated.polynomial) - 1,
                    repeated.multiplicity,
                    0,
                    maximum_valuation + len(prior_levels) + 1,
                    len(prior_levels),
                    True,
                )
                return _analyze_bounded_key(
                    polynomial,
                    prime,
                    initial_factor,
                    factor_index,
                    representative,
                    prior_levels + (level,),
                    maximum_valuation,
                    max_enumerated_candidates=max_enumerated_candidates,
                    max_representative_refinements=max_representative_refinements,
                )
            state = (
                "representative-refinement-bound"
                if len(prior_levels) >= max_representative_refinements
                else "requires-degree-raising-representative"
            )
            branch_degree = (
                factor_degree
                * side.ramification_index
                * (len(repeated.polynomial) - 1)
                * repeated.multiplicity
            )
            level = OMLevel(
                1,
                key,
                -side.slope,
                side.slope,
                _mod_polynomial(key, prime),
                residual,
                repeated.polynomial,
                side.ramification_index,
                len(repeated.polynomial) - 1,
                repeated.multiplicity,
                factor_degree * polygon_index((side,)),
                maximum_valuation + len(prior_levels) + 1,
                len(prior_levels),
                False,
            )
            return (
                (
                    OMType(
                        prefix + "s0r0",
                        prefix,
                        prime,
                        initial_factor.polynomial,
                        initial_factor.multiplicity,
                        prior_levels + (level,),
                        branch_degree,
                        False,
                        state,
                    ),
                ),
                factor_degree * polygon_index(sides),
            )

    branches: list[OMType] = []
    for side_index, (side, residual, residual_factors) in enumerate(residual_data):
        branch_prefix = prefix + "s" + str(side_index)
        for residual_index, residual_factor in enumerate(residual_factors):
            residual_degree = len(residual_factor.polynomial) - 1
            complete = residual_factor.multiplicity == 1
            level = OMLevel(
                1,
                key,
                -side.slope,
                side.slope,
                _mod_polynomial(key, prime),
                residual,
                residual_factor.polynomial,
                side.ramification_index,
                residual_degree,
                residual_factor.multiplicity,
                factor_degree * polygon_index((side,)) if residual_index == 0 else 0,
                maximum_valuation + len(prior_levels) + 1,
                len(prior_levels),
                False,
            )
            branch_degree = (
                factor_degree
                * side.ramification_index
                * residual_degree
                * residual_factor.multiplicity
            )
            branches.append(
                OMType(
                    branch_prefix + "r" + str(residual_index),
                    branch_prefix,
                    prime,
                    initial_factor.polynomial,
                    initial_factor.multiplicity,
                    prior_levels + (level,),
                    branch_degree,
                    complete,
                    "complete"
                    if complete
                    else "requires-degree-raising-representative",
                )
            )
    return tuple(branches), factor_degree * polygon_index(sides)


def build_om_type_tree(
    polynomial: Polynomial,
    prime: int,
    *,
    max_enumerated_candidates: int = 200_000,
    max_representative_refinements: int = 8,
) -> OMTypeTree:
    """Build the bounded residual-extension/optimized-representative tree."""
    if max_enumerated_candidates < 1:
        raise ValueError("the modular factorization bound must be positive")
    if max_representative_refinements < 0:
        raise ValueError("the representative refinement bound must be nonnegative")
    polynomial = normalize_polynomial(polynomial)
    degree = polynomial_degree(polynomial)
    if degree <= 0 or polynomial[-1] != 1:
        raise OMDomainError("OM input must be a monic polynomial of positive degree")
    if not _is_prime(prime):
        raise OMDomainError("OM residue modulus must be a proven prime")
    initial = factor_mod_prime(
        polynomial,
        prime,
        max_enumerated_candidates=max_enumerated_candidates,
    )
    branches: list[OMType] = []
    index = 0
    maximum_valuation = 0
    for coefficient in polynomial:
        valuation = p_adic_valuation(coefficient, prime)
        if valuation is not None:
            maximum_valuation = max(maximum_valuation, valuation)
    for factor_index, factor in enumerate(initial):
        factor_branches, factor_index_contribution = _analyze_bounded_key(
            polynomial,
            prime,
            factor,
            factor_index,
            normalize_polynomial(tuple(int(value) for value in factor.polynomial)),
            (),
            maximum_valuation,
            max_enumerated_candidates=max_enumerated_candidates,
            max_representative_refinements=max_representative_refinements,
        )
        branches.extend(factor_branches)
        index += factor_index_contribution
    branch_tuple = tuple(branches)
    complete_degree = sum(branch.branch_degree for branch in branch_tuple)
    complete = (
        bool(branch_tuple)
        and all(branch.complete for branch in branch_tuple)
        and complete_degree == degree
    )
    precision = maximum_valuation + 1
    for branch in branch_tuple:
        for level in branch.levels:
            precision = max(precision, level.representative_precision)
    text = _certificate_text(
        polynomial,
        prime,
        initial,
        branch_tuple,
        index,
        max_enumerated_candidates,
        max_representative_refinements,
    )
    return OMTypeTree(
        polynomial,
        prime,
        initial,
        branch_tuple,
        index,
        complete,
        precision,
        max_enumerated_candidates,
        max_representative_refinements,
        stable_certificate_id(text),
    )


@dataclass
class TypeTreeValidation(ImmutableOMRecord):
    valid: bool
    complete: bool
    failures: tuple[str, ...]
    recomputed_certificate_id: str


def validate_type_tree(tree: OMTypeTree) -> TypeTreeValidation:
    """Independently recompute a type tree and compare every stable invariant."""
    failures: list[str] = []
    try:
        recomputed = build_om_type_tree(
            tree.polynomial,
            tree.prime,
            max_enumerated_candidates=tree.max_enumerated_candidates,
            max_representative_refinements=tree.max_representative_refinements,
        )
    except (OMDomainError, OMResourceError, ArithmeticError) as error:
        return TypeTreeValidation(False, False, (str(error),), "")
    if tree.initial_factors != recomputed.initial_factors:
        failures.append("initial modular factorization differs")
    if tree.types != recomputed.types:
        failures.append("Newton/residual type branches differ")
    if tree.expected_index_valuation != recomputed.expected_index_valuation:
        failures.append("Ore index contribution differs")
    if tree.precision != recomputed.precision:
        failures.append("representative precision differs")
    if (
        tree.max_enumerated_candidates != recomputed.max_enumerated_candidates
        or tree.max_representative_refinements
        != recomputed.max_representative_refinements
    ):
        failures.append("deterministic work bounds differ")
    if tree.certificate_id != recomputed.certificate_id:
        failures.append("certificate identifier differs")
    if tree.complete != recomputed.complete:
        failures.append("completeness state differs")
    return TypeTreeValidation(
        not failures,
        recomputed.complete,
        tuple(failures),
        recomputed.certificate_id,
    )


__all__ = [
    "ModularFactor",
    "NewtonPoint",
    "NewtonSide",
    "OMDomainError",
    "OMLevel",
    "OMResourceError",
    "OMType",
    "OMTypeTree",
    "ResidualFactor",
    "ResidualPolynomial",
    "ResidueElement",
    "ImmutableOMRecord",
    "Polynomial",
    "RationalValue",
    "TypeTreeValidation",
    "augmented_valuation",
    "build_om_type_tree",
    "coefficient_valuation",
    "factor_mod_prime",
    "factor_residual_polynomial",
    "gauss_valuation",
    "lower_newton_polygon",
    "modular_divmod",
    "newton_polygon",
    "normalize_polynomial",
    "p_adic_valuation",
    "phi_adic_expansion",
    "phi_quotients",
    "polygon_index",
    "polynomial_add",
    "polynomial_degree",
    "polynomial_divmod_monic",
    "polynomial_multiply",
    "polynomial_power",
    "polynomial_subtract",
    "residual_polynomial",
    "representative_from_residual_factor",
    "representative_from_level",
    "stable_certificate_id",
    "validate_type_tree",
]
