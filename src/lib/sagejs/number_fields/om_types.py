"""Bounded Ore--MacLane arithmetic and inspectable type certificates.

This module implements the complete first-order, `p`-regular slice of the
Ore--MacLane algorithm over `ZZ[x]`.  It deliberately stops, with an explicit
certificate state, when higher residual-field arithmetic or representative
refinement is required.  No incomplete type is ever reported as a maximality
proof.

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
    for left, right in zip(hull, hull[1:]):
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


def _evaluate_mod(polynomial: Polynomial, value: int, prime: int) -> int:
    answer = 0
    for coefficient in reversed(polynomial):
        answer = (answer * value + coefficient) % prime
    return answer


def residual_polynomial(
    expansion: tuple[Polynomial, ...],
    side: NewtonSide,
    prime: int,
    key: Polynomial,
) -> Polynomial:
    """Compute a first residual polynomial for a linear residue key.

    Coefficients for nonlinear residue keys live in an extension field.  That
    arithmetic belongs to the FLINT residual-field integration lane and is
    rejected explicitly here.
    """
    if polynomial_degree(key) != 1:
        raise OMDomainError(
            "bounded residual factorization supports linear residue keys only"
        )
    residue_root = (-key[0]) % prime
    coefficients: list[int] = []
    step = side.ramification_index
    for abscissa in range(side.left.abscissa, side.right.abscissa + 1, step):
        expected = side.ordinate_at(abscissa)
        if expected.denominator != 1:
            raise ArithmeticError("a residual lattice ordinate is not integral")
        coefficient = expansion[abscissa] if abscissa < len(expansion) else (0,)
        valuation = coefficient_valuation(coefficient, prime)
        if valuation is None or valuation != expected.numerator:
            coefficients.append(0)
            continue
        scale = prime**valuation
        primitive = tuple(value // scale for value in coefficient)
        coefficients.append(_evaluate_mod(primitive, residue_root, prime))
    return _mod_polynomial(tuple(coefficients), prime)


@dataclass
class OMLevel(ImmutableOMRecord):
    order: int
    key_polynomial: Polynomial
    key_value: RationalValue
    slope: RationalValue
    residual_polynomial: Polynomial
    residual_factor: Polynomial
    ramification_index: int
    residue_degree: int
    multiplicity: int
    index_contribution: int
    representative_precision: int


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
) -> str:
    factor_text = ";".join(
        ",".join(str(value) for value in factor.polynomial)
        + "^"
        + str(factor.multiplicity)
        for factor in factors
    )
    type_text = ";".join(
        branch.branch_id
        + ":"
        + branch.refinement_state
        + ":"
        + str(branch.branch_degree)
        for branch in types
    )
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
    return "om1-" + encoded


def build_first_order_type_tree(
    polynomial: Polynomial,
    prime: int,
    *,
    max_enumerated_candidates: int = 200_000,
) -> OMTypeTree:
    """Build and certify the bounded first-order OM type tree."""
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
        key = factor.polynomial
        lift = normalize_polynomial(tuple(int(value) for value in key))
        expansion = phi_adic_expansion(polynomial, lift)
        sides = newton_polygon(polynomial, prime, lift)
        factor_degree = polynomial_degree(key)
        index += factor_degree * polygon_index(sides)
        if not sides:
            branches.append(
                OMType(
                    "f" + str(factor_index),
                    "root",
                    prime,
                    key,
                    factor.multiplicity,
                    (),
                    factor_degree,
                    factor.multiplicity == 1,
                    "complete" if factor.multiplicity == 1 else "no-negative-side",
                )
            )
            continue
        for side_index, side in enumerate(sides):
            branch_prefix = "f" + str(factor_index) + "s" + str(side_index)
            if factor_degree != 1:
                level = OMLevel(
                    1,
                    lift,
                    -side.slope,
                    side.slope,
                    (0,),
                    (0,),
                    side.ramification_index,
                    factor_degree,
                    factor.multiplicity,
                    factor_degree * polygon_index((side,)),
                    maximum_valuation + 1,
                )
                branches.append(
                    OMType(
                        branch_prefix,
                        "f" + str(factor_index),
                        prime,
                        key,
                        factor.multiplicity,
                        (level,),
                        factor_degree * (side.right.abscissa - side.left.abscissa),
                        False,
                        "residual-extension-unsupported",
                    )
                )
                continue
            residual = residual_polynomial(expansion, side, prime, lift)
            residual_factors = factor_mod_prime(
                residual,
                prime,
                max_enumerated_candidates=max_enumerated_candidates,
            )
            for residual_index, residual_factor in enumerate(residual_factors):
                residual_degree = polynomial_degree(residual_factor.polynomial)
                complete = residual_factor.multiplicity == 1
                level = OMLevel(
                    1,
                    lift,
                    -side.slope,
                    side.slope,
                    residual,
                    residual_factor.polynomial,
                    side.ramification_index,
                    residual_degree,
                    residual_factor.multiplicity,
                    factor_degree * polygon_index((side,)),
                    maximum_valuation + 1,
                )
                branches.append(
                    OMType(
                        branch_prefix + "r" + str(residual_index),
                        branch_prefix,
                        prime,
                        key,
                        factor.multiplicity,
                        (level,),
                        factor_degree * side.ramification_index * residual_degree,
                        complete,
                        "complete"
                        if complete
                        else "requires-higher-order-representative",
                    )
                )
    branch_tuple = tuple(branches)
    complete_degree = sum(branch.branch_degree for branch in branch_tuple)
    complete = (
        bool(branch_tuple)
        and all(branch.complete for branch in branch_tuple)
        and complete_degree == degree
    )
    text = _certificate_text(polynomial, prime, initial, branch_tuple, index)
    return OMTypeTree(
        polynomial,
        prime,
        initial,
        branch_tuple,
        index,
        complete,
        maximum_valuation + 1,
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
        recomputed = build_first_order_type_tree(tree.polynomial, tree.prime)
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
    "ImmutableOMRecord",
    "Polynomial",
    "RationalValue",
    "TypeTreeValidation",
    "augmented_valuation",
    "build_first_order_type_tree",
    "coefficient_valuation",
    "factor_mod_prime",
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
    "stable_certificate_id",
    "validate_type_tree",
]
