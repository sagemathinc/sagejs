"""Exact class and unit arithmetic for maximal quadratic orders.

This module is the portable quadratic engine used by the class-and-unit-group
integration layer.  It deliberately depends only on ordinary Python integer
arithmetic.  Real quadratic units come from the continued-fraction reduction
cycle of the principal form.  Narrow classes are proper cycles of primitive
reduced indefinite forms, and ordinary classes are their quotient by the
orientation class.

The reduction conventions are those of Buchmann--Vollmer, Chapter 6.  PARI's
`Qfb.c` and `buch1.c` were used as algorithmic oracles; no PARI code or runtime
dependency is included here.  Reduced-form scans are deliberately capability
bounded.  Class numbers and invariant factors stream those forms instead of
retaining the full class table; the public adapter can route larger fields to
the shared Buchmann--Hecke relation engine.  Class composition uses exact
bigint NUCOMP/NUDUPL, with the product-lattice construction retained as a
differential oracle.
"""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dataclass_field
from math import log, sqrt
from typing import Any, Iterator

Matrix2 = tuple[tuple[int, int], tuple[int, int]]

_IDENTITY_MATRIX: Matrix2 = ((1, 0), (0, 1))
# A classical, rigorous rational lower bound.  It is deliberately recorded in
# every certificate whose exact comparison uses the archimedean constant.
_PI_LOWER_NUMERATOR = 103_993
_PI_LOWER_DENOMINATOR = 33_102
_DEFAULT_MAX_ENUMERATION_CHECKS = 5_000_000
# The largest same-host pilot case, |D| = 1,000,000,007, took 0.011 seconds for
# full cyclic structure with the native certified form enumerator.  Requests
# beyond this measured range route to the non-materializing relation engine.
IMAGINARY_QUADRATIC_FORM_THRESHOLD = 1_000_000_007
_QUADRATIC_ALGORITHMS = ("auto", "quadratic-forms", "minkowski", "buchmann-hecke")


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _isqrt(value: int) -> int:
    if value < 0:
        raise ValueError("integer square root needs a nonnegative value")
    if value < 2:
        return value
    estimate = 1 << ((value.bit_length() + 1) // 2)
    while True:
        next_estimate = (estimate + value // estimate) // 2
        if next_estimate >= estimate:
            return estimate
        estimate = next_estimate


def _factorial(value: int) -> int:
    answer = 1
    for factor in range(2, value + 1):
        answer *= factor
    return answer


def _matrix_multiply(left: Matrix2, right: Matrix2) -> Matrix2:
    return (
        (
            left[0][0] * right[0][0] + left[0][1] * right[1][0],
            left[0][0] * right[0][1] + left[0][1] * right[1][1],
        ),
        (
            left[1][0] * right[0][0] + left[1][1] * right[1][0],
            left[1][0] * right[0][1] + left[1][1] * right[1][1],
        ),
    )


def _matrix_inverse(matrix: Matrix2) -> Matrix2:
    determinant = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]
    if determinant != 1:
        raise ArithmeticError("a continued-fraction transform left SL(2, ZZ)")
    return (
        (matrix[1][1], -matrix[0][1]),
        (-matrix[1][0], matrix[0][0]),
    )


def _prime_factorization(value: int) -> tuple[tuple[int, int], ...]:
    if value < 1:
        raise ValueError("factorization needs a positive integer")
    answer: list[tuple[int, int]] = []
    remaining = value
    prime = 2
    if remaining < 2**64 and _is_prime_below_2_64(remaining):
        return ((remaining, 1),)
    while prime * prime <= remaining:
        exponent = 0
        while remaining % prime == 0:
            remaining //= prime
            exponent += 1
        if exponent:
            answer.append((prime, exponent))
            if remaining < 2**64 and _is_prime_below_2_64(remaining):
                answer.append((remaining, 1))
                return tuple(answer)
        prime = 3 if prime == 2 else prime + 2
    if remaining > 1:
        answer.append((remaining, 1))
    return tuple(answer)


def _is_prime_below_2_64(value: int) -> bool:
    """Deterministically test primality for an unsigned 64-bit integer."""
    if value < 2:
        return False
    for prime in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if value % prime == 0:
            return value == prime
    odd_part = value - 1
    shifts = 0
    while odd_part % 2 == 0:
        odd_part //= 2
        shifts += 1
    # Jim Sinclair's seven-base deterministic Miller--Rabin set for n < 2^64.
    for witness in (2, 325, 9_375, 28_178, 450_775, 9_780_504, 1_795_265_022):
        if witness % value == 0:
            continue
        residue = pow(witness, odd_part, value)
        if residue in (1, value - 1):
            continue
        for _index in range(shifts - 1):
            residue = residue * residue % value
            if residue == value - 1:
                break
        else:
            return False
    return True


def _quadratic_algorithm(algorithm: str, operation: str) -> str:
    if algorithm not in _QUADRATIC_ALGORITHMS:
        raise ValueError(
            "algorithm must be 'auto', 'quadratic-forms', 'minkowski', "
            "or 'buchmann-hecke'"
        )
    if algorithm in ("minkowski", "buchmann-hecke"):
        raise NotImplementedError(
            "algorithm='"
            + algorithm
            + "' is not available for exact real quadratic "
            + operation
        )
    return "quadratic-forms"


def _is_squarefree(value: int) -> bool:
    return all(exponent == 1 for _prime, exponent in _prime_factorization(abs(value)))


def is_fundamental_discriminant(discriminant: int) -> bool:
    """Return whether `discriminant` is a quadratic-field discriminant."""
    if discriminant == 0 or discriminant == 1:
        return False
    if discriminant % 4 == 1:
        return _is_squarefree(discriminant)
    if discriminant % 4 != 0:
        return False
    radicand = discriminant // 4
    return radicand % 4 in (2, 3) and _is_squarefree(radicand)


def _require_real_fundamental_discriminant(discriminant: int) -> None:
    if discriminant <= 0 or not is_fundamental_discriminant(discriminant):
        raise ValueError("a positive fundamental quadratic discriminant is required")
    if _isqrt(discriminant) ** 2 == discriminant:
        raise ValueError("a real quadratic discriminant cannot be a square")


@dataclass(frozen=True)
class MinkowskiTrivialityCertificate:
    """An integer inequality proving that the Minkowski bound is below `2`."""

    discriminant: int
    degree: int
    real_places: int
    complex_places: int
    threshold: int
    left_square: int
    right_square: int
    pi_lower_numerator: int
    pi_lower_denominator: int
    proof_status: str = "exact-unconditional"

    @property
    def proves_triviality(self) -> bool:
        return self.left_square < self.right_square

    @property
    def exact_inequality(self) -> str:
        if self.degree == 2 and self.complex_places == 0:
            return (
                "sqrt(" + str(abs(self.discriminant)) + ")/2 < " + str(self.threshold)
            )
        return (
            str(self.left_square)
            + " < "
            + str(self.right_square)
            + " (squared exact Minkowski comparison)"
        )

    def verify(self) -> bool:
        replay = exact_minkowski_triviality(
            self.discriminant,
            degree=self.degree,
            real_places=self.real_places,
            complex_places=self.complex_places,
            threshold=self.threshold,
        )
        return replay == self


def exact_minkowski_triviality(
    discriminant: int,
    *,
    degree: int,
    real_places: int,
    complex_places: int,
    threshold: int = 2,
) -> MinkowskiTrivialityCertificate:
    """Compare a Minkowski bound with an integer using no floating point.

    The usual bound is
    `(4/pi)^r2 * n! / n^n * sqrt(abs(D))`.  Substitution of the recorded
    rigorous lower bound for `pi` makes the comparison conservative when
    complex places occur.  A true result therefore proves that the actual
    Minkowski bound is strictly below `threshold`.
    """
    if degree < 1 or real_places < 0 or complex_places < 0:
        raise ValueError("degree and signature entries must be nonnegative")
    if real_places + 2 * complex_places != degree:
        raise ValueError("the signature does not have the requested degree")
    if discriminant == 0 or threshold < 1:
        raise ValueError("a nonzero discriminant and positive threshold are required")
    constant_numerator = (
        (4**complex_places)
        * _factorial(degree)
        * (_PI_LOWER_DENOMINATOR**complex_places)
    )
    constant_denominator = (degree**degree) * (_PI_LOWER_NUMERATOR**complex_places)
    left_square = constant_numerator**2 * abs(discriminant)
    right_square = (threshold * constant_denominator) ** 2
    return MinkowskiTrivialityCertificate(
        discriminant,
        degree,
        real_places,
        complex_places,
        threshold,
        left_square,
        right_square,
        _PI_LOWER_NUMERATOR,
        _PI_LOWER_DENOMINATOR,
    )


def quadratic_minkowski_triviality(
    discriminant: int,
) -> MinkowskiTrivialityCertificate:
    """Return the exact empty-factor-base test for a quadratic field."""
    if not is_fundamental_discriminant(discriminant):
        raise ValueError("a fundamental quadratic discriminant is required")
    signature = (2, 0) if discriminant > 0 else (0, 1)
    return exact_minkowski_triviality(
        discriminant,
        degree=2,
        real_places=signature[0],
        complex_places=signature[1],
    )


@dataclass(frozen=True)
class QuadraticForm:
    """A primitive integral binary quadratic form `(a, b, c)`."""

    a: int
    b: int
    c: int

    def coefficients(self) -> tuple[int, int, int]:
        return (self.a, self.b, self.c)

    def discriminant(self) -> int:
        return self.b * self.b - 4 * self.a * self.c

    def is_primitive(self) -> bool:
        return _gcd(_gcd(abs(self.a), abs(self.b)), abs(self.c)) == 1

    def negated(self) -> QuadraticForm:
        return QuadraticForm(-self.a, -self.b, -self.c)

    def conjugate(self) -> QuadraticForm:
        return QuadraticForm(self.a, -self.b, self.c)


def _form_key(form: QuadraticForm) -> tuple[int, int, int]:
    return form.coefficients()


def _least_form(forms: list[QuadraticForm]) -> QuadraticForm:
    if not forms:
        raise ValueError("cannot select a form from an empty list")
    answer = forms[0]
    for form in forms[1:]:
        if _form_key(form) < _form_key(answer):
            answer = form
    return answer


def _unique_forms(forms: list[QuadraticForm]) -> list[QuadraticForm]:
    answer: list[QuadraticForm] = []
    for form in forms:
        if form not in answer:
            answer.append(form)
    return answer


def _sorted_forms(forms: list[QuadraticForm]) -> tuple[QuadraticForm, ...]:
    return tuple(sorted(_unique_forms(forms), key=_form_key))


def _principal_form(discriminant: int) -> QuadraticForm:
    parity = discriminant % 2
    return QuadraticForm(1, parity, (parity * parity - discriminant) // 4)


def _is_reduced_indefinite(form: QuadraticForm, discriminant: int) -> bool:
    return form.b > 0 and form.a * form.c < 0 and (form.a - form.c) ** 2 < discriminant


def _rho_step(
    form: QuadraticForm, discriminant: int
) -> tuple[QuadraticForm, Matrix2, int]:
    """Perform one exact continued-fraction `rho` step."""
    if form.discriminant() != discriminant:
        raise ValueError("the form has the wrong discriminant")
    c_absolute = abs(form.c)
    if c_absolute == 0:
        raise ArithmeticError("a nonsquare real discriminant produced c=0")
    root_floor = _isqrt(discriminant)
    sign = 1 if form.c > 0 else -1
    if c_absolute >= root_floor:
        quotient = (c_absolute + form.b) // (2 * c_absolute)
    else:
        # Since sqrt(D) is irrational, replacing it by floor(sqrt(D))
        # does not alter this floor quotient.
        quotient = (root_floor + form.b) // (2 * c_absolute)
    shift = sign * quotient
    answer = QuadraticForm(
        form.c,
        -form.b + 2 * shift * form.c,
        form.a - form.b * shift + form.c * shift * shift,
    )
    if answer.discriminant() != discriminant:
        raise ArithmeticError("continued-fraction reduction changed discriminant")
    return (answer, ((0, -1), (1, shift)), shift)


def _reduce_indefinite(
    form: QuadraticForm,
    discriminant: int,
    max_steps: int,
) -> tuple[QuadraticForm, Matrix2, tuple[QuadraticForm, ...], tuple[int, ...]]:
    if max_steps < 1:
        raise ValueError("max_steps must be positive")
    current = form
    transform = _IDENTITY_MATRIX
    forms: list[QuadraticForm] = []
    quotients: list[int] = []
    while not _is_reduced_indefinite(current, discriminant):
        if len(forms) >= max_steps:
            raise ValueError("continued-fraction reduction exceeded max_steps")
        current, step, quotient = _rho_step(current, discriminant)
        transform = _matrix_multiply(transform, step)
        forms.append(current)
        quotients.append(quotient)
    return (current, transform, tuple(forms), tuple(quotients))


def _proper_cycle(
    form: QuadraticForm, discriminant: int, max_steps: int
) -> tuple[QuadraticForm, ...]:
    reduced, _transform, _forms, _quotients = _reduce_indefinite(
        form, discriminant, max_steps
    )
    answer = [reduced]
    current, _step, _quotient = _rho_step(reduced, discriminant)
    while current != reduced:
        if len(answer) >= max_steps:
            raise ValueError("continued-fraction cycle exceeded max_steps")
        if current in answer:
            raise ArithmeticError("continued-fraction cycle repeated before its origin")
        answer.append(current)
        current, _step, _quotient = _rho_step(current, discriminant)
    return tuple(answer)


def _canonical_proper_form(
    form: QuadraticForm, discriminant: int, max_steps: int
) -> QuadraticForm:
    cycle = _proper_cycle(form, discriminant, max_steps)
    positive = [candidate for candidate in cycle if candidate.a > 0]
    return _least_form(positive if positive else list(cycle))


def _is_canonical_proper_form(
    form: QuadraticForm, discriminant: int, max_steps: int
) -> bool:
    """Test canonicality while retaining only one `rho`-cycle element.

    A negative-leading reduced form cannot be the chosen representative.  For
    a positive-leading form, encountering any smaller positive form proves it
    noncanonical and stops the walk early.  Only the unique minimum traverses
    its complete cycle.  This avoids building a cycle tuple for every streamed
    class-number candidate.
    """
    if form.a <= 0:
        return False
    current, _step, _quotient = _rho_step(form, discriminant)
    steps = 1
    while current != form:
        if steps >= max_steps:
            raise ValueError("continued-fraction cycle exceeded max_steps")
        if current.a > 0 and _form_key(current) < _form_key(form):
            return False
        current, _step, _quotient = _rho_step(current, discriminant)
        steps += 1
    return True


@dataclass(frozen=True)
class QuadraticUnit:
    """The exact unit `(x + y*sqrt(D))/2` in a maximal quadratic order."""

    discriminant: int
    x: int
    y: int
    norm: int

    def verify(self) -> bool:
        return (
            self.norm in (-1, 1)
            and self.x > 0
            and self.y > 0
            and (self.x - (self.discriminant % 2) * self.y) % 2 == 0
            and self.x * self.x - self.discriminant * self.y * self.y == 4 * self.norm
        )

    def square(self) -> QuadraticUnit:
        return QuadraticUnit(
            self.discriminant,
            (self.x * self.x + self.discriminant * self.y * self.y) // 2,
            self.x * self.y,
            1,
        )

    def approximate(self) -> float:
        return (self.x + self.y * sqrt(self.discriminant)) / 2.0

    def regulator(self) -> float:
        return log(self.approximate())

    def coefficients(self) -> tuple[int, int, int]:
        """Return `(x, y, denominator)` for `(x + y*sqrt(D))/2`."""
        return (self.x, self.y, 2)


@dataclass(frozen=True)
class ContinuedFractionUnitCertificate:
    """Replay data for a principal-form continued-fraction cycle."""

    discriminant: int
    principal_form: QuadraticForm
    first_reduced_form: QuadraticForm
    reduction_forms: tuple[QuadraticForm, ...]
    cycle_forms: tuple[QuadraticForm, ...]
    reduction_quotients: tuple[int, ...]
    cycle_quotients: tuple[int, ...]
    stabilizer: Matrix2
    totally_positive_unit: QuadraticUnit
    fundamental_unit: QuadraticUnit
    proof_status: str = "exact-unconditional"
    minimality_theorem: str = (
        "one complete principal reduced-form cycle gives the least totally "
        "positive unit; its integral square root exists exactly when a "
        "negative-norm unit exists"
    )

    def verify(self) -> bool:
        try:
            replay = real_quadratic_fundamental_unit(
                self.discriminant,
                max_steps=max(
                    1,
                    len(self.reduction_forms) + len(self.cycle_forms) + 1,
                ),
            )
        except (ValueError, ArithmeticError):
            return False
        return replay.certificate == self


@dataclass(frozen=True)
class RealQuadraticUnitResult:
    """A fundamental unit and its exact minimality certificate."""

    discriminant: int
    unit: QuadraticUnit
    norm: int
    certificate: ContinuedFractionUnitCertificate
    algorithm: str = "principal-form-continued-fraction"
    proof_status: str = "exact-unconditional"
    requested_algorithm: str = "auto"

    def verify(self) -> bool:
        return (
            self.norm == self.unit.norm
            and self.unit.verify()
            and self.certificate.fundamental_unit == self.unit
            and self.certificate.verify()
        )

    def regulator(self) -> float:
        return self.unit.regulator()


class RealQuadraticFieldUnitGroupResult:
    """Public-field transport of a continued-fraction quadratic unit result."""

    def __init__(
        self,
        field: Any,
        arithmetic: RealQuadraticUnitResult,
        generator: Any,
        torsion: Any,
        certificate: Any,
    ) -> None:
        self.field = field
        self.arithmetic = arithmetic
        self.torsion = torsion
        self.generators = (generator,)
        self.certificates = (certificate,)
        self.unit_rank = 1
        self.complete = True
        self.reason = (
            "one complete principal reduced-form cycle proves a fundamental unit"
        )
        self.search_bound = len(arithmetic.certificate.reduction_forms) + len(
            arithmetic.certificate.cycle_forms
        )
        self.candidates_checked = self.search_bound
        self.completion_certificate = arithmetic.certificate
        self.proof_status = "exact-unconditional"
        self.index_bound = 1
        self.algorithm = arithmetic.algorithm

    def regulator(self, prec: int = 53) -> Any:
        from sagejs.number_fields.class_unit_analytic import (
            regulator_from_factored_units,
        )
        from sagejs.number_fields.factored_elements import FactoredNumberFieldElement

        precision = int(prec)
        if precision < 16:
            raise ValueError("regulator precision must be at least 16 bits")
        factored = FactoredNumberFieldElement.from_element(
            self.field, self.generators[0]
        )
        result = regulator_from_factored_units(
            (factored,),
            unit_rank=1,
            precision_bits=max(100, precision),
            absolute_tolerance_bits=max(32, precision - 8),
            maximum_precision_bits=max(4096, 2 * precision),
        )
        return result

    def verify_completion(self) -> bool:
        return (
            self.arithmetic.verify()
            and self.certificates[0].verify(self.field)
            and self.torsion.complete
            and self.torsion.verify()
        )


def real_quadratic_fundamental_unit(
    discriminant: int,
    *,
    algorithm: str = "auto",
    max_steps: int = 1_000_000,
) -> RealQuadraticUnitResult:
    """Return the fundamental unit using a complete continued-fraction cycle."""
    _quadratic_algorithm(algorithm, "unit computation")
    _require_real_fundamental_discriminant(discriminant)
    principal = _principal_form(discriminant)
    reduced, reduction_transform, reduction_forms, reduction_quotients = (
        _reduce_indefinite(principal, discriminant, max_steps)
    )
    current = reduced
    cycle_transform = _IDENTITY_MATRIX
    cycle_forms: list[QuadraticForm] = []
    cycle_quotients: list[int] = []
    while True:
        if len(reduction_forms) + len(cycle_forms) >= max_steps:
            raise ValueError("principal continued-fraction cycle exceeded max_steps")
        current, step, quotient = _rho_step(current, discriminant)
        cycle_transform = _matrix_multiply(cycle_transform, step)
        cycle_forms.append(current)
        cycle_quotients.append(quotient)
        if current == reduced:
            break
    stabilizer = _matrix_multiply(
        _matrix_multiply(reduction_transform, cycle_transform),
        _matrix_inverse(reduction_transform),
    )
    parity = discriminant % 2
    y_value = stabilizer[1][0]
    x_value = 2 * stabilizer[0][0] + parity * y_value
    if x_value < 0:
        x_value = -x_value
        y_value = -y_value
    if y_value < 0:
        y_value = -y_value
    totally_positive = QuadraticUnit(discriminant, x_value, y_value, 1)
    if not totally_positive.verify():
        raise ArithmeticError("the principal-cycle stabilizer is not a Pell unit")

    negative_x = _isqrt(x_value - 2)
    negative_y_square = (x_value + 2) // discriminant
    negative_y = _isqrt(negative_y_square)
    if (
        negative_x * negative_x == x_value - 2
        and discriminant * negative_y_square == x_value + 2
        and negative_y * negative_y == negative_y_square
    ):
        unit = QuadraticUnit(discriminant, negative_x, negative_y, -1)
        if unit.square() != totally_positive:
            raise ArithmeticError("negative-norm square-root recovery failed")
    else:
        unit = totally_positive
    if not unit.verify():
        raise ArithmeticError("continued fractions produced an invalid unit")
    certificate = ContinuedFractionUnitCertificate(
        discriminant,
        principal,
        reduced,
        reduction_forms,
        tuple(cycle_forms),
        reduction_quotients,
        tuple(cycle_quotients),
        stabilizer,
        totally_positive,
        unit,
    )
    return RealQuadraticUnitResult(
        discriminant,
        unit,
        unit.norm,
        certificate,
        requested_algorithm=algorithm,
    )


def real_quadratic_field_unit_group(
    field: Any,
    *,
    algorithm: str = "auto",
    max_steps: int = 1_000_000,
) -> RealQuadraticFieldUnitGroupResult:
    """Transport the exact continued-fraction result into a public field."""
    from sagejs.number_fields import units as unit_support

    if field.degree() != 2 or unit_support.exact_signature(field) != (2, 0):
        raise ValueError("this algorithm requires a real quadratic field")
    discriminant = int(field.discriminant())
    arithmetic = real_quadratic_fundamental_unit(
        discriminant, algorithm=algorithm, max_steps=max_steps
    )
    _squarefree, square_root = unit_support._quadratic_square_root_element(field)
    sqrt_discriminant = square_root if discriminant % 4 == 1 else field(2) * square_root
    generator = (
        field(arithmetic.unit.x) + field(arithmetic.unit.y) * sqrt_discriminant
    ) / 2
    verified, norm = unit_support.exact_norm_is_unit(field, generator)
    certificate = unit_support.UnitCertificate(generator, norm, True, verified)
    if norm != arithmetic.norm or not certificate.verify(field):
        raise ArithmeticError("quadratic unit transport failed exact verification")
    torsion = unit_support.roots_of_unity(field)
    result = RealQuadraticFieldUnitGroupResult(
        field, arithmetic, generator, torsion, certificate
    )
    if not result.verify_completion():
        raise ArithmeticError("quadratic unit completion certificate replay failed")
    return result


@dataclass(frozen=True)
class QuadraticClassGroupPlan:
    """Preflight cost and capability data for exhaustive form enumeration."""

    discriminant: int
    requested_algorithm: str
    algorithm: str
    root_floor: int
    enumeration_checks: int
    max_enumeration_checks: int
    max_reduced_forms: int
    max_steps: int
    materializes_all_reduced_forms: bool = True
    exact_integer_storage: bool = True
    proof_status: str = "exact-unconditional"

    @property
    def supported(self) -> bool:
        return self.enumeration_checks <= self.max_enumeration_checks

    def require_supported(self) -> None:
        if not self.supported:
            raise ValueError(
                "quadratic-forms needs "
                + str(self.enumeration_checks)
                + " candidate checks, exceeding max_enumeration_checks="
                + str(self.max_enumeration_checks)
                + "; use a future buchmann-hecke backend or raise the explicit cap"
            )


def _real_quadratic_enumeration_bound(discriminant: int) -> int:
    """Return a safe divisor-trial bound for reduced-form enumeration.

    A reduced indefinite form has `b^2 - D = 4*a*c`, with `0 < b <
    sqrt(D)`.  Fundamental discriminants force `b` to have the parity of
    `D`.  For each such `b`, the divisor enumerator tests at most
    `floor(sqrt((D-b^2)/4))` positive divisors.  Replacing every summand by
    the first (largest) one gives this constant-time, conservative preflight
    bound.  It is substantially tighter than scanning every signed `a` in a
    square of side `2*sqrt(D)`.
    """
    root_floor = _isqrt(discriminant)
    if discriminant % 2:
        middle_count = (root_floor + 1) // 2
        first_middle = 1
    else:
        middle_count = root_floor // 2
        first_middle = 2
    largest_cofactor = max(0, (discriminant - first_middle * first_middle) // 4)
    return middle_count * _isqrt(largest_cofactor)


@dataclass(frozen=True)
class QuadraticClassRoutingPlan:
    """Inspectable public routing decision for one quadratic class request."""

    discriminant: int
    narrow: bool
    requested_algorithm: str
    backend: str
    reason: str
    benchmark_threshold: int | None
    enumeration_checks: int | None
    max_enumeration_checks: int | None
    materializes_all_reduced_forms: bool
    supported: bool = True
    proof_status: str = "exact-unconditional"
    benchmark_source: str = (
        "bench/compare-quadratic-class-groups.cjs and "
        "website/performance/quadratic-class-groups-pilot.json"
    )

    def diagnostics(self) -> dict[str, Any]:
        return {
            "discriminant": self.discriminant,
            "narrow": self.narrow,
            "requested_algorithm": self.requested_algorithm,
            "backend": self.backend,
            "reason": self.reason,
            "benchmark_threshold": self.benchmark_threshold,
            "enumeration_checks": self.enumeration_checks,
            "max_enumeration_checks": self.max_enumeration_checks,
            "materializes_all_reduced_forms": self.materializes_all_reduced_forms,
            "supported": self.supported,
            "proof_status": self.proof_status,
            "benchmark_source": self.benchmark_source,
        }

    def require_supported(self) -> None:
        if not self.supported:
            raise ValueError(
                self.reason
                + "; use algorithm='auto' or 'buchmann-hecke', or raise the "
                "explicit real quadratic forms cap"
            )


def real_quadratic_class_group_plan(
    discriminant: int,
    *,
    algorithm: str = "auto",
    max_reduced_forms: int = 1_000_000,
    max_enumeration_checks: int = _DEFAULT_MAX_ENUMERATION_CHECKS,
    max_steps: int = 1_000_000,
) -> QuadraticClassGroupPlan:
    """Return an exact preflight plan without enumerating or factoring `D`."""
    selected = _quadratic_algorithm(algorithm, "class groups")
    if discriminant <= 0:
        raise ValueError("a positive discriminant is required")
    if max_reduced_forms < 1:
        raise ValueError("max_reduced_forms must be positive")
    if max_enumeration_checks < 1:
        raise ValueError("max_enumeration_checks must be positive")
    if max_steps < 1:
        raise ValueError("max_steps must be positive")
    root_floor = _isqrt(discriminant)
    return QuadraticClassGroupPlan(
        discriminant,
        algorithm,
        selected,
        root_floor,
        _real_quadratic_enumeration_bound(discriminant),
        max_enumeration_checks,
        max_reduced_forms,
        max_steps,
    )


def _iter_reduced_forms(
    discriminant: int,
    max_reduced_forms: int,
    max_enumeration_checks: int,
) -> Iterator[QuadraticForm]:
    """Yield every primitive reduced indefinite form with bounded work.

    Writing `n = (D-b^2)/4`, the opposite-sign coefficients satisfy
    `abs(a) * abs(c) = n`.  Enumerating positive divisors of `n` avoids the
    previous rectangular scan over all signed leading coefficients.  The
    iterator keeps only the current factor pair, so class-number callers do
    not materialize the reduced forms.
    """
    if max_reduced_forms < 1:
        raise ValueError("max_reduced_forms must be positive")
    root_floor = _isqrt(discriminant)
    enumeration_bound = _real_quadratic_enumeration_bound(discriminant)
    if enumeration_bound > max_enumeration_checks:
        raise ValueError(
            "reduced-form enumeration exceeded max_enumeration_checks="
            + str(max_enumeration_checks)
        )
    candidate_checks = 0
    reduced_forms = 0
    first_middle = 1 if discriminant % 2 else 2
    for middle in range(first_middle, root_floor + 1, 2):
        difference = discriminant - middle * middle
        if difference <= 0 or difference % 4:
            continue
        product = difference // 4
        divisor = 1
        while divisor * divisor <= product:
            candidate_checks += 1
            if candidate_checks > max_enumeration_checks:
                raise ValueError(
                    "reduced-form enumeration exceeded max_enumeration_checks="
                    + str(max_enumeration_checks)
                )
            if product % divisor == 0:
                paired = product // divisor
                factors = (divisor,) if divisor == paired else (divisor, paired)
                for leading_absolute in factors:
                    trailing_absolute = product // leading_absolute
                    if (leading_absolute + trailing_absolute) ** 2 >= discriminant:
                        continue
                    for sign in (1, -1):
                        leading = sign * leading_absolute
                        trailing = -sign * trailing_absolute
                        form = QuadraticForm(leading, middle, trailing)
                        if form.is_primitive():
                            reduced_forms += 1
                            if reduced_forms > max_reduced_forms:
                                raise ValueError(
                                    "reduced-form enumeration exceeded "
                                    "max_reduced_forms=" + str(max_reduced_forms)
                                )
                            yield form
            divisor += 1


def _enumerate_reduced_forms(
    discriminant: int,
    max_reduced_forms: int,
    max_enumeration_checks: int,
) -> tuple[QuadraticForm, ...]:
    return tuple(
        _iter_reduced_forms(discriminant, max_reduced_forms, max_enumeration_checks)
    )


def _extended_gcd(left: int, right: int) -> tuple[int, int, int]:
    old_remainder, remainder = left, right
    old_left, left_coefficient = 1, 0
    old_right, right_coefficient = 0, 1
    while remainder:
        quotient = old_remainder // remainder
        old_remainder, remainder = (
            remainder,
            old_remainder - quotient * remainder,
        )
        old_left, left_coefficient = (
            left_coefficient,
            old_left - quotient * left_coefficient,
        )
        old_right, right_coefficient = (
            right_coefficient,
            old_right - quotient * right_coefficient,
        )
    if old_remainder < 0:
        return (-old_remainder, -old_left, -old_right)
    return (old_remainder, old_left, old_right)


def _exact_quotient(numerator: int, denominator: int, name: str) -> int:
    if denominator == 0 or numerator % denominator:
        raise ArithmeticError(name + " is not an exact integer")
    return numerator // denominator


def _symmetric_residue(value: int, modulus: int) -> int:
    if modulus <= 0:
        raise ArithmeticError("a compact-composition modulus must be positive")
    answer = value % modulus
    alternate = answer - modulus
    return alternate if abs(alternate) < abs(answer) else answer


def _partial_euclid(
    bound: int, denominator: int, remainder: int
) -> tuple[int, int, int, int, int]:
    """Stop the extended Euclidean algorithm once `abs(remainder) <= bound`.

    The returned tuple is `(steps, d, v3, v, v2)` in the notation of Shanks'
    NUCOMP algorithm.  Python integers make this independent of machine-word
    width.  Floor division is a valid Euclidean quotient here; every identity
    used by reconstruction is checked by the exact divisions that follow.
    """
    v = 0
    v2 = 1
    steps = 0
    d = denominator
    v3 = remainder
    while abs(v3) > bound:
        quotient, next_remainder = divmod(d, v3)
        v, v2 = v2, v - quotient * v2
        d, v3 = v3, next_remainder
        steps += 1
    return (steps, d, v3, v, v2)


@dataclass(frozen=True)
class CompactCompositionTrace:
    """Exact bounds and reconstruction data for one NUCOMP/NUDUPL product."""

    discriminant: int
    squaring: bool
    cutoff: int
    partial_euclid_steps: int
    terminal_remainder: int
    classical_leading_product: int
    raw_leading: int
    exact_integer_storage: bool = True
    algorithm: str = "Shanks NUCOMP/NUDUPL"

    @property
    def compact_branch(self) -> bool:
        return self.partial_euclid_steps > 0

    def verify_bound(self) -> bool:
        return (
            self.cutoff >= 0
            and abs(self.terminal_remainder) <= self.cutoff
            and self.classical_leading_product > 0
            and self.raw_leading > 0
        )


def _compact_cutoff(discriminant: int) -> int:
    """Return `floor((abs(D)/4)^(1/4))` using exact integer arithmetic."""
    return _isqrt(_isqrt(abs(discriminant) // 4))


def _nudupl_raw(
    form: QuadraticForm, discriminant: int
) -> tuple[QuadraticForm, CompactCompositionTrace]:
    """Return the exact unreduced NUDUPL square of a primitive form."""
    leading = form.a
    middle = form.b
    gcd, u, _unused = _extended_gcd(middle, leading)
    a = leading
    b = middle
    if gcd != 1:
        a = _exact_quotient(a, gcd, "NUDUPL leading quotient")
        b = _exact_quotient(b, gcd, "NUDUPL middle quotient")
    residue = _symmetric_residue(-u * form.c, a)
    cutoff = _compact_cutoff(discriminant)
    steps, d, v3, v, v2 = _partial_euclid(cutoff, a, residue)
    a2 = d * d
    c2 = v3 * v3
    if steps == 0:
        g = _exact_quotient(v3 * b + form.c, d, "NUDUPL g")
        b2 = form.b
        v2 = gcd
        raw_leading = a2
    else:
        if steps % 2:
            v = -v
            d = -d
        e = _exact_quotient(form.c * v + b * d, a, "NUDUPL e")
        g = _exact_quotient(e * v2 - b, v, "NUDUPL compact g")
        b2 = e * v2 + v * g
        if gcd != 1:
            b2 *= gcd
            v *= gcd
            v2 *= gcd
        raw_leading = a2 + e * v
    raw_middle = b2 + (d + v3) ** 2 - a2 - c2
    raw_trailing = c2 + g * v2
    raw = QuadraticForm(raw_leading, raw_middle, raw_trailing)
    if raw.discriminant() != discriminant or not raw.is_primitive():
        raise ArithmeticError("NUDUPL reconstruction failed")
    trace = CompactCompositionTrace(
        discriminant,
        True,
        cutoff,
        steps,
        v3,
        abs(form.a * form.a),
        abs(raw_leading),
    )
    return (raw, trace)


def _nucomp_raw(
    left: QuadraticForm, right: QuadraticForm, discriminant: int
) -> tuple[QuadraticForm, CompactCompositionTrace]:
    """Return the exact unreduced Shanks NUCOMP product."""
    if left == right:
        return _nudupl_raw(left, discriminant)
    x, y = left, right
    if abs(x.a) < abs(y.a):
        x, y = y, x
    if x.a <= 0 or y.a <= 0:
        raise ValueError("NUCOMP expects positive-leading proper representatives")
    s = (x.b + y.b) // 2
    n = y.b - s
    a1 = x.a
    a2 = y.a
    d, u, v = _extended_gcd(a2, a1)
    if d == 1:
        residue = -u * n
        d1 = d
    elif s % d == 0:
        residue = -u * n
        d1 = d
        a1 = _exact_quotient(a1, d1, "NUCOMP a1 content quotient")
        a2 = _exact_quotient(a2, d1, "NUCOMP a2 content quotient")
        s = _exact_quotient(s, d1, "NUCOMP middle content quotient")
    else:
        d1, u1, _unused = _extended_gcd(s, d)
        if d1 != 1:
            a1 = _exact_quotient(a1, d1, "NUCOMP secondary a1 quotient")
            a2 = _exact_quotient(a2, d1, "NUCOMP secondary a2 quotient")
            s = _exact_quotient(s, d1, "NUCOMP secondary middle quotient")
            d = _exact_quotient(d, d1, "NUCOMP gcd quotient")
        p1 = x.c % d
        p2 = y.c % d
        correction = (-u1 * (u * p1 + v * p2)) % d
        residue = correction * _exact_quotient(a1, d, "NUCOMP residue a1")
        residue -= u * _exact_quotient(n, d, "NUCOMP residue n")
    residue = _symmetric_residue(residue, a1)
    cutoff = _compact_cutoff(discriminant)
    steps, d, v3, v, v2 = _partial_euclid(cutoff, a1, residue)
    if steps == 0:
        g = _exact_quotient(v3 * s + y.c, d, "NUCOMP g")
        b = a2
        b2 = y.b
        v2 = d1
        raw_leading = d * b
    else:
        if steps % 2:
            v3 = -v3
            v2 = -v2
        b = _exact_quotient(a2 * d + n * v, a1, "NUCOMP b")
        e = _exact_quotient(s * d + y.c * v, a1, "NUCOMP e")
        q3 = e * v2
        q4 = q3 - s
        b2 = q3 + q4
        g = _exact_quotient(q4, v, "NUCOMP compact g")
        if d1 != 1:
            v2 *= d1
            v *= d1
            b2 *= d1
        raw_leading = d * b + e * v
    q1 = b * v3
    q2 = q1 + n
    raw_middle = b2 + (q1 + q2 if steps else 2 * q1)
    raw_trailing = v3 * _exact_quotient(q2, d, "NUCOMP trailing quotient") + g * v2
    raw = QuadraticForm(raw_leading, raw_middle, raw_trailing)
    if raw.discriminant() != discriminant or not raw.is_primitive():
        raise ArithmeticError("NUCOMP reconstruction failed")
    trace = CompactCompositionTrace(
        discriminant,
        False,
        cutoff,
        steps,
        v3,
        abs(left.a * right.a),
        abs(raw_leading),
    )
    return (raw, trace)


def compose_quadratic_forms_lattice(
    left: QuadraticForm,
    right: QuadraticForm,
    discriminant: int,
    max_steps: int,
) -> QuadraticForm:
    """Compose via the exact product lattice as a differential oracle."""
    parity = discriminant % 2
    theta_norm = (parity * parity - discriminant) // 4
    left_t = (-left.b - parity) // 2
    right_t = (-right.b - parity) // 2
    vectors = (
        (left.a * right.a, 0),
        (left.a * right_t, left.a),
        (right.a * left_t, right.a),
        (left_t * right_t - theta_norm, left_t + right_t + parity),
    )
    projection_gcd = 0
    lifted_x = 0
    for x_value, y_value in vectors:
        next_gcd, old_coefficient, new_coefficient = _extended_gcd(
            projection_gcd, y_value
        )
        lifted_x = old_coefficient * lifted_x + new_coefficient * x_value
        projection_gcd = next_gcd
    if projection_gcd == 0:
        raise ArithmeticError("a quadratic ideal product has rank below two")
    lattice_index = 0
    for left_index in range(len(vectors)):
        for right_index in range(left_index):
            determinant = abs(
                vectors[left_index][0] * vectors[right_index][1]
                - vectors[right_index][0] * vectors[left_index][1]
            )
            lattice_index = _gcd(lattice_index, determinant)
    scale_square = projection_gcd * projection_gcd
    if lattice_index % scale_square != 0 or lifted_x % projection_gcd != 0:
        raise ArithmeticError("a quadratic ideal product did not normalize integrally")
    leading = lattice_index // scale_square
    t_value = (lifted_x // projection_gcd) % leading
    middle = -2 * t_value - parity
    numerator = middle * middle - discriminant
    if numerator % (4 * leading) != 0:
        raise ArithmeticError("a quadratic ideal product has invalid norm")
    raw = QuadraticForm(leading, middle, numerator // (4 * leading))
    return _canonical_proper_form(raw, discriminant, max_steps)


def compose_quadratic_forms(
    left: QuadraticForm,
    right: QuadraticForm,
    *,
    max_steps: int = 1_000_000,
    with_trace: bool = False,
) -> Any:
    """Compose positive-leading real quadratic forms by NUCOMP/NUDUPL.

    The same ordinary Python bigint body is used on every platform.  A trace
    records the exact fourth-root cutoff and terminal partial-Euclidean
    remainder; requesting it is intended for certificates and benchmarks.
    """
    discriminant = left.discriminant()
    if right.discriminant() != discriminant or discriminant <= 0:
        raise ValueError("NUCOMP requires real forms of one discriminant")
    if not left.is_primitive() or not right.is_primitive():
        raise ValueError("NUCOMP requires primitive forms")
    raw, trace = _nucomp_raw(left, right, discriminant)
    result = _canonical_proper_form(raw, discriminant, max_steps)
    if not trace.verify_bound():
        raise ArithmeticError("NUCOMP compact bound verification failed")
    return (result, trace) if with_trace else result


def square_quadratic_form(
    form: QuadraticForm, *, max_steps: int = 1_000_000, with_trace: bool = False
) -> Any:
    """Square one positive-leading real quadratic form by exact NUDUPL."""
    return compose_quadratic_forms(
        form, form, max_steps=max_steps, with_trace=with_trace
    )


def _compose_forms(
    left: QuadraticForm,
    right: QuadraticForm,
    discriminant: int,
    max_steps: int,
) -> QuadraticForm:
    if left.discriminant() != discriminant or right.discriminant() != discriminant:
        raise ValueError("the forms have the wrong discriminant")
    return compose_quadratic_forms(left, right, max_steps=max_steps)


@dataclass(frozen=True)
class QuadraticIdealBasis:
    """The exact basis `[a, (-b + sqrt(D))/2]` attached to a form."""

    discriminant: int
    a: int
    b: int

    def doubled_coefficients(self) -> tuple[tuple[int, int], tuple[int, int]]:
        """Return `(constant, sqrt(D))` coefficients after multiplying by `2`."""
        return ((2 * self.a, 0), (-self.b, 1))

    def norm(self) -> int:
        return self.a


def quadratic_form_from_ideal_lattice(
    discriminant: int,
    rows: tuple[tuple[int, int], tuple[int, int]],
) -> QuadraticForm:
    """Map a primitive integral ideal lattice to its canonical quadratic form.

    The row coordinates are relative to `[1, omega]`, where
    `omega = (D % 2 + sqrt(D))/2`.  Public number-field adapters should first
    transport their maximal-order basis to this presentation-independent basis.
    """
    if not is_fundamental_discriminant(discriminant):
        raise ValueError("a fundamental quadratic discriminant is required")
    if len(rows) != 2 or any(len(row) != 2 for row in rows):
        raise ValueError("a quadratic ideal lattice needs a 2 by 2 basis")
    row0 = (int(rows[0][0]), int(rows[0][1]))
    row1 = (int(rows[1][0]), int(rows[1][1]))
    content = _gcd(_gcd(row0[0], row0[1]), _gcd(row1[0], row1[1]))
    if content != 1:
        raise ValueError("the integral ideal lattice must be primitive")
    determinant = row0[0] * row1[1] - row1[0] * row0[1]
    leading = abs(determinant)
    if leading == 0:
        raise ValueError("the zero ideal has no quadratic form")
    projection_gcd, left_coefficient, right_coefficient = _extended_gcd(
        row0[1], row1[1]
    )
    if projection_gcd != 1:
        raise ValueError("a primitive quadratic ideal has no primitive projection")
    first = left_coefficient * row0[0] + right_coefficient * row1[0]
    parity = discriminant % 2
    residue = (-first) % leading
    middle = 2 * residue - parity
    numerator = middle * middle - discriminant
    if numerator % (4 * leading) != 0:
        raise ValueError("the lattice is not an ideal of the quadratic order")
    form = QuadraticForm(leading, middle, numerator // (4 * leading))
    if not form.is_primitive():
        raise ValueError("the ideal lattice produced an imprimitive form")
    return form


class MinkowskiTrivialClassElement:
    """The unique ideal class certified by an empty Minkowski factor base."""

    def __init__(self, parent: MinkowskiTrivialClassGroup) -> None:
        self._parent = parent

    def parent(self) -> MinkowskiTrivialClassGroup:
        return self._parent

    def form(self) -> QuadraticForm:
        return _principal_form(self._parent.discriminant)

    def ideal_basis(self) -> QuadraticIdealBasis:
        form = self.form()
        return QuadraticIdealBasis(self._parent.discriminant, form.a, form.b)

    ideal = ideal_basis

    def is_one(self) -> bool:
        return True

    is_principal = is_one

    def order(self) -> int:
        return 1

    additive_order = order

    def __mul__(self, other: object) -> MinkowskiTrivialClassElement:
        if not isinstance(other, MinkowskiTrivialClassElement):
            return NotImplemented
        if other._parent is not self._parent:
            raise TypeError("ideal classes must have the same parent")
        return self

    def __invert__(self) -> MinkowskiTrivialClassElement:
        return self

    inverse = __invert__

    def __pow__(self, exponent: int) -> MinkowskiTrivialClassElement:
        int(exponent)
        return self

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, MinkowskiTrivialClassElement)
            and other._parent is self._parent
        )

    def __hash__(self) -> int:
        return hash(id(self._parent))

    def __repr__(self) -> str:
        return "trivial quadratic ideal class (exact Minkowski bound)"


class MinkowskiTrivialClassGroup:
    """A trivial quadratic class group proved before any form enumeration."""

    def __init__(self, discriminant: int) -> None:
        certificate = quadratic_minkowski_triviality(discriminant)
        if not certificate.proves_triviality:
            raise ValueError("the exact Minkowski bound does not prove triviality")
        self.discriminant = discriminant
        self.narrow = False
        self.algorithm = "minkowski"
        self.proof_status = "exact-unconditional"
        self.certificate = certificate
        self._one = MinkowskiTrivialClassElement(self)

    def order(self) -> int:
        return 1

    cardinality = order

    def invariants(self) -> tuple[int, ...]:
        return ()

    def one(self) -> MinkowskiTrivialClassElement:
        return self._one

    def gens(self) -> tuple[MinkowskiTrivialClassElement, ...]:
        return ()

    def gen(self, index: int = 0) -> MinkowskiTrivialClassElement:
        raise IndexError("the trivial class group has no generators")

    def list(self) -> list[MinkowskiTrivialClassElement]:
        return [self._one]

    def __iter__(self) -> Iterator[MinkowskiTrivialClassElement]:
        return iter(self.list())

    def __call__(self, form: object) -> MinkowskiTrivialClassElement:
        if isinstance(form, tuple):
            form = QuadraticForm(*form)
        if isinstance(form, QuadraticForm) and form.discriminant() != self.discriminant:
            raise ValueError("the form must have the group discriminant")
        return self._one

    def verify(self) -> bool:
        return self.certificate.verify()

    def __repr__(self) -> str:
        return "Trivial class group certified by " + self.certificate.exact_inequality


class QuadraticClassElement:
    """An ordinary or narrow ideal class with a canonical form representative."""

    def __init__(self, parent: QuadraticClassGroup, form: QuadraticForm) -> None:
        self._parent = parent
        self._form = parent._canonical(form)

    def parent(self) -> QuadraticClassGroup:
        return self._parent

    def form(self) -> QuadraticForm:
        return self._form

    def ideal_basis(self) -> QuadraticIdealBasis:
        return QuadraticIdealBasis(
            self._parent.discriminant, self._form.a, self._form.b
        )

    ideal = ideal_basis

    def is_one(self) -> bool:
        return self._form == self._parent._identity_form

    is_principal = is_one

    def _mul_(self, other: object) -> QuadraticClassElement:
        if not isinstance(other, QuadraticClassElement):
            raise TypeError("an ideal class can only multiply another ideal class")
        if other._parent is not self._parent:
            raise TypeError("ideal classes must have the same parent")
        return self._parent._element(self._parent._multiply(self._form, other._form))

    def __mul__(self, other: object) -> QuadraticClassElement:
        return self._mul_(other)

    def inverse(self) -> QuadraticClassElement:
        return self._parent._element(self._form.conjugate())

    def __invert__(self) -> QuadraticClassElement:
        return self.inverse()

    def __pow__(self, exponent: int) -> QuadraticClassElement:
        if exponent < 0:
            return self.inverse() ** (-exponent)
        answer = self._parent.one()
        base = self
        power = exponent
        while power:
            if power % 2:
                answer = answer * base
            power //= 2
            if power:
                base = base * base
        return answer

    def order(self) -> int:
        order = self._parent.order()
        for prime, _exponent in _prime_factorization(order):
            while order % prime == 0 and (self ** (order // prime)).is_one():
                order //= prime
        return order

    additive_order = order

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, QuadraticClassElement)
            and other._parent is self._parent
            and other._form == self._form
        )

    def __hash__(self) -> int:
        return hash((id(self._parent), self._form.coefficients()))

    def __repr__(self) -> str:
        kind = "narrow" if self._parent.narrow else "ordinary"
        return kind + " quadratic ideal class " + str(self._form.coefficients())


@dataclass(frozen=True)
class QuadraticClassGroupCertificate:
    """Replayable streaming structure evidence with lazy enumeration views."""

    discriminant: int
    narrow: bool
    reduced_forms_checked: int
    proper_cycles: int
    structure: QuadraticClassStructureCertificate
    orientation_class: QuadraticForm
    invariants: tuple[int, ...]
    unit_norm: int
    plan: QuadraticClassGroupPlan
    _group: Any = dataclass_field(compare=False, repr=False)
    proof_status: str = "exact-unconditional"
    source: str = "streamed reduced forms, bounded BSGS, exact SNF, and NUCOMP"

    @property
    def reduced_forms(self) -> tuple[QuadraticForm, ...]:
        return self._group._materialized_class_data()[0]

    @property
    def proper_representatives(self) -> tuple[QuadraticForm, ...]:
        return self._group._materialized_class_data()[1]

    @property
    def representatives(self) -> tuple[QuadraticForm, ...]:
        return self._group._materialized_class_data()[2]

    def verify(self) -> bool:
        if not self.structure.verify():
            return False
        try:
            replay = QuadraticClassGroup(
                self.discriminant,
                narrow=self.narrow,
                algorithm=self.plan.requested_algorithm,
                max_reduced_forms=self.plan.max_reduced_forms,
                max_enumeration_checks=self.plan.max_enumeration_checks,
                max_steps=self.plan.max_steps,
            )
        except (ValueError, ArithmeticError):
            return False
        return replay.certificate == self


@dataclass(frozen=True)
class QuadraticClassNumberCertificate:
    """Replayable streaming cycle count for a real quadratic class number."""

    discriminant: int
    narrow: bool
    reduced_forms_checked: int
    proper_cycles: int
    class_number: int
    unit_norm: int
    plan: QuadraticClassGroupPlan
    proof_status: str = "exact-unconditional"
    source: str = "streamed primitive reduced indefinite forms and complete rho cycles"

    def verify(self) -> bool:
        try:
            replay = real_quadratic_class_number(
                self.discriminant,
                narrow=self.narrow,
                algorithm=self.plan.requested_algorithm,
                max_reduced_forms=self.plan.max_reduced_forms,
                max_enumeration_checks=self.plan.max_enumeration_checks,
                max_steps=self.plan.max_steps,
            )
        except (ValueError, ArithmeticError):
            return False
        return replay.certificate == self


class RealQuadraticClassNumberResult:
    """A non-materializing ordinary or narrow real quadratic class number."""

    def __init__(
        self,
        discriminant: int,
        narrow: bool,
        class_number: int,
        certificate: QuadraticClassNumberCertificate,
    ) -> None:
        self.discriminant = int(discriminant)
        self.narrow = bool(narrow)
        self._class_number = int(class_number)
        self.certificate = certificate
        self.plan = certificate.plan
        self.algorithm = "quadratic-form-cycle-count"
        self.proof_status = "exact-unconditional"
        self.materializes_all_reduced_forms = False

    def order(self) -> int:
        return self._class_number

    cardinality = order
    class_number = order

    def verify(self) -> bool:
        return self.certificate.verify()

    def __repr__(self) -> str:
        kind = "narrow " if self.narrow else ""
        return (
            "Exact "
            + kind
            + "real quadratic class number "
            + str(self._class_number)
            + " for discriminant "
            + str(self.discriminant)
            + " (streaming cycle count)"
        )


def _class_form_product(
    left: QuadraticForm,
    right: QuadraticForm,
    discriminant: int,
    narrow: bool,
    orientation: QuadraticForm,
    max_steps: int,
) -> QuadraticForm:
    proper = _compose_forms(left, right, discriminant, max_steps)
    if narrow:
        return proper
    paired = _compose_forms(proper, orientation, discriminant, max_steps)
    return _least_form([proper, paired])


def _class_form_power(
    form: QuadraticForm,
    exponent: int,
    identity: QuadraticForm,
    discriminant: int,
    narrow: bool,
    orientation: QuadraticForm,
    max_steps: int,
) -> QuadraticForm:
    if exponent < 0:
        return _class_form_power(
            form.conjugate(),
            -exponent,
            identity,
            discriminant,
            narrow,
            orientation,
            max_steps,
        )
    answer = identity
    base = form
    power = exponent
    while power:
        if power % 2:
            answer = _class_form_product(
                answer,
                base,
                discriminant,
                narrow,
                orientation,
                max_steps,
            )
        power //= 2
        if power:
            base = _class_form_product(
                base,
                base,
                discriminant,
                narrow,
                orientation,
                max_steps,
            )
    return answer


def _split_mixed_radices(
    relative_orders: tuple[int, ...], target: int
) -> tuple[list[tuple[int, int, int]], list[tuple[int, int, int]]]:
    """Split mixed-radix exponents into balanced baby and giant factors."""
    baby: list[tuple[int, int, int]] = []
    giant: list[tuple[int, int, int]] = []
    capacity = 1
    for index, radix in enumerate(relative_orders):
        if capacity * radix <= target:
            baby.append((index, 1, radix))
            capacity *= radix
            continue
        if capacity < target:
            low_radix = min(radix, max(1, target // capacity))
            baby.append((index, 1, low_radix))
            capacity *= low_radix
            high_radix = (radix + low_radix - 1) // low_radix
            if high_radix > 1:
                giant.append((index, low_radix, high_radix))
        else:
            giant.append((index, 1, radix))
    return (baby, giant)


def _mixed_products(
    generators: tuple[QuadraticForm, ...],
    factors: list[tuple[int, int, int]],
    identity: QuadraticForm,
    discriminant: int,
    narrow: bool,
    orientation: QuadraticForm,
    max_steps: int,
    maximum: int,
) -> list[tuple[QuadraticForm, tuple[int, ...]]]:
    states = [(identity, (0,) * len(generators))]
    for index, step, radix in factors:
        if len(states) * radix > maximum:
            raise ValueError("quadratic structure BSGS exceeds max_bsgs_table")
        factor = _class_form_power(
            generators[index],
            step,
            identity,
            discriminant,
            narrow,
            orientation,
            max_steps,
        )
        additions = []
        power = identity
        for digit in range(radix):
            additions.append((power, digit * step))
            power = _class_form_product(
                power,
                factor,
                discriminant,
                narrow,
                orientation,
                max_steps,
            )
        expanded: list[tuple[QuadraticForm, tuple[int, ...]]] = []
        for state, coordinates in states:
            for power, exponent in additions:
                values = list(coordinates)
                values[index] += exponent
                expanded.append(
                    (
                        _class_form_product(
                            state,
                            power,
                            discriminant,
                            narrow,
                            orientation,
                            max_steps,
                        ),
                        tuple(values),
                    )
                )
        states = expanded
    return states


def _subgroup_discrete_log_bsgs(
    target: QuadraticForm,
    generators: tuple[QuadraticForm, ...],
    relative_orders: tuple[int, ...],
    identity: QuadraticForm,
    discriminant: int,
    narrow: bool,
    orientation: QuadraticForm,
    max_steps: int,
    max_bsgs_table: int,
) -> tuple[tuple[int, ...] | None, int]:
    subgroup_order = 1
    for value in relative_orders:
        subgroup_order *= value
    if subgroup_order == 1:
        return ((() if target == identity else None), 1)
    target_size = _isqrt(subgroup_order) + 1
    baby_factors, giant_factors = _split_mixed_radices(relative_orders, target_size)
    baby = _mixed_products(
        generators,
        baby_factors,
        identity,
        discriminant,
        narrow,
        orientation,
        max_steps,
        max_bsgs_table,
    )
    giant = _mixed_products(
        generators,
        giant_factors,
        identity,
        discriminant,
        narrow,
        orientation,
        max_steps,
        max_bsgs_table,
    )
    table = {_form_key(form): coordinates for form, coordinates in baby}
    for giant_form, giant_coordinates in giant:
        needed = _class_form_product(
            target,
            giant_form.conjugate(),
            discriminant,
            narrow,
            orientation,
            max_steps,
        )
        baby_coordinates = table.get(_form_key(needed))
        if baby_coordinates is None:
            continue
        coordinates = tuple(
            left + right
            for left, right in zip(baby_coordinates, giant_coordinates, strict=True)
        )
        reconstruction = identity
        for generator, exponent in zip(generators, coordinates, strict=True):
            reconstruction = _class_form_product(
                reconstruction,
                _class_form_power(
                    generator,
                    exponent,
                    identity,
                    discriminant,
                    narrow,
                    orientation,
                    max_steps,
                ),
                discriminant,
                narrow,
                orientation,
                max_steps,
            )
        if reconstruction == target:
            return (coordinates, max(len(baby), len(giant)))
    return (None, max(len(baby), len(giant)))


@dataclass(frozen=True)
class QuadraticClassStructureCertificate:
    """Replayable polycyclic relations for a non-materializing class structure."""

    discriminant: int
    narrow: bool
    class_number: int
    reduced_forms_checked: int
    forms_scanned: int
    generators: tuple[QuadraticForm, ...]
    relative_orders: tuple[int, ...]
    power_relations: tuple[tuple[int, ...], ...]
    invariants: tuple[int, ...]
    invariant_generators: tuple[QuadraticForm, ...]
    max_bsgs_table: int
    largest_bsgs_table: int
    max_steps: int
    requested_algorithm: str
    max_reduced_forms: int
    max_enumeration_checks: int
    proof_status: str = "exact-unconditional"
    source: str = "streamed reduced forms, bounded BSGS, and exact relation SNF"

    @property
    def materializes_all_classes(self) -> bool:
        return False

    def verify(self) -> bool:
        try:
            replay = real_quadratic_class_invariants(
                self.discriminant,
                narrow=self.narrow,
                algorithm=self.requested_algorithm,
                max_reduced_forms=self.max_reduced_forms,
                max_enumeration_checks=self.max_enumeration_checks,
                max_bsgs_table=self.max_bsgs_table,
                max_steps=self.max_steps,
            )
        except (ValueError, ArithmeticError):
            return False
        return replay.certificate == self


class RealQuadraticClassStructureResult:
    """Invariant factors and generators without a table of every class."""

    def __init__(
        self,
        certificate: QuadraticClassStructureCertificate,
    ) -> None:
        self.certificate = certificate
        self.discriminant = certificate.discriminant
        self.narrow = certificate.narrow
        self._invariants = certificate.invariants
        self._generators = certificate.invariant_generators
        self.proof_status = certificate.proof_status
        self.algorithm = "streaming-forms-bsgs-snf"
        self.materializes_all_classes = False

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def generator_forms(self) -> tuple[QuadraticForm, ...]:
        return self._generators

    def order(self) -> int:
        answer = 1
        for value in self._invariants:
            answer *= value
        return answer

    cardinality = order

    def verify(self) -> bool:
        return self.certificate.verify()


def real_quadratic_class_number(
    discriminant: int,
    *,
    narrow: bool = False,
    algorithm: str = "auto",
    max_reduced_forms: int = 1_000_000,
    max_enumeration_checks: int = _DEFAULT_MAX_ENUMERATION_CHECKS,
    max_steps: int = 1_000_000,
) -> RealQuadraticClassNumberResult:
    """Count real quadratic classes without constructing their presentation.

    Each proper equivalence class is one complete `rho` cycle.  Exactly one
    positive member of that cycle is its lexicographically least canonical
    representative, so the narrow class number is obtained by streaming all
    reduced forms and counting those canonical members.  The ordinary class
    number is the quotient by the orientation kernel, whose order is `1` in
    the presence of a norm `-1` unit and `2` otherwise.
    """
    _require_real_fundamental_discriminant(discriminant)
    base_plan = real_quadratic_class_group_plan(
        discriminant,
        algorithm=algorithm,
        max_reduced_forms=max_reduced_forms,
        max_enumeration_checks=max_enumeration_checks,
        max_steps=max_steps,
    )
    base_plan.require_supported()
    plan = QuadraticClassGroupPlan(
        base_plan.discriminant,
        base_plan.requested_algorithm,
        base_plan.algorithm,
        base_plan.root_floor,
        base_plan.enumeration_checks,
        base_plan.max_enumeration_checks,
        base_plan.max_reduced_forms,
        base_plan.max_steps,
        False,
        base_plan.exact_integer_storage,
        base_plan.proof_status,
    )
    reduced_forms_checked = 0
    proper_cycles = 0
    for form in _iter_reduced_forms(
        discriminant, max_reduced_forms, max_enumeration_checks
    ):
        reduced_forms_checked += 1
        if _is_canonical_proper_form(form, discriminant, max_steps):
            proper_cycles += 1
    if proper_cycles < 1:
        raise ArithmeticError("reduced-form enumeration omitted the principal cycle")
    unit_norm = real_quadratic_fundamental_unit(discriminant, max_steps=max_steps).norm
    orientation_order = 1 if unit_norm == -1 else 2
    if proper_cycles % orientation_order:
        raise ArithmeticError(
            "the orientation kernel does not divide the narrow class number"
        )
    class_number = proper_cycles if narrow else proper_cycles // orientation_order
    certificate = QuadraticClassNumberCertificate(
        discriminant,
        narrow,
        reduced_forms_checked,
        proper_cycles,
        class_number,
        unit_norm,
        plan,
    )
    return RealQuadraticClassNumberResult(
        discriminant, narrow, class_number, certificate
    )


def real_quadratic_class_invariants(
    discriminant: int,
    *,
    narrow: bool = False,
    algorithm: str = "auto",
    max_reduced_forms: int = 1_000_000,
    max_enumeration_checks: int = _DEFAULT_MAX_ENUMERATION_CHECKS,
    max_steps: int = 1_000_000,
    max_bsgs_table: int = 100_000,
) -> RealQuadraticClassStructureResult:
    """Compute invariant factors without retaining every ideal class.

    The exact class number bounds a polycyclic generator search.  Membership
    and power relations use balanced mixed-radix baby-step giant-step tables,
    so retained class forms are bounded by `max_bsgs_table`, not by the class
    number.  Exact SNF of the resulting logarithmic-size triangular relation
    matrix gives invariant factors and generator transforms.
    """
    if max_bsgs_table < 1:
        raise ValueError("max_bsgs_table must be positive")
    count = real_quadratic_class_number(
        discriminant,
        narrow=narrow,
        algorithm=algorithm,
        max_reduced_forms=max_reduced_forms,
        max_enumeration_checks=max_enumeration_checks,
        max_steps=max_steps,
    )
    class_number = count.order()
    principal = _canonical_proper_form(
        _principal_form(discriminant), discriminant, max_steps
    )
    orientation = _canonical_proper_form(
        _principal_form(discriminant).negated(), discriminant, max_steps
    )
    identity = principal if narrow else _least_form([principal, orientation])
    generators: list[QuadraticForm] = []
    relative_orders: list[int] = []
    power_relations: list[tuple[int, ...]] = []
    subgroup_order = 1
    forms_scanned = 0
    largest_bsgs_table = 1
    for form in _iter_reduced_forms(
        discriminant, max_reduced_forms, max_enumeration_checks
    ):
        if not _is_canonical_proper_form(form, discriminant, max_steps):
            continue
        candidate = form
        if not narrow:
            candidate = _least_form(
                [
                    form,
                    _compose_forms(form, orientation, discriminant, max_steps),
                ]
            )
            if candidate != form:
                continue
        forms_scanned += 1
        remaining = class_number // subgroup_order
        relation, table_size = _subgroup_discrete_log_bsgs(
            candidate,
            tuple(generators),
            tuple(relative_orders),
            identity,
            discriminant,
            narrow,
            orientation,
            max_steps,
            max_bsgs_table,
        )
        largest_bsgs_table = max(largest_bsgs_table, table_size)
        if relation is not None:
            continue
        relative_order = remaining
        for prime, _exponent in _prime_factorization(remaining):
            while relative_order % prime == 0:
                power = _class_form_power(
                    candidate,
                    relative_order // prime,
                    identity,
                    discriminant,
                    narrow,
                    orientation,
                    max_steps,
                )
                power_relation, table_size = _subgroup_discrete_log_bsgs(
                    power,
                    tuple(generators),
                    tuple(relative_orders),
                    identity,
                    discriminant,
                    narrow,
                    orientation,
                    max_steps,
                    max_bsgs_table,
                )
                largest_bsgs_table = max(largest_bsgs_table, table_size)
                if power_relation is None:
                    break
                relative_order //= prime
        relation, table_size = _subgroup_discrete_log_bsgs(
            _class_form_power(
                candidate,
                relative_order,
                identity,
                discriminant,
                narrow,
                orientation,
                max_steps,
            ),
            tuple(generators),
            tuple(relative_orders),
            identity,
            discriminant,
            narrow,
            orientation,
            max_steps,
            max_bsgs_table,
        )
        largest_bsgs_table = max(largest_bsgs_table, table_size)
        if relation is None or relative_order < 2:
            raise ArithmeticError("quadratic BSGS failed to certify a power relation")
        generators.append(candidate)
        relative_orders.append(relative_order)
        power_relations.append(relation)
        subgroup_order *= relative_order
        if subgroup_order == class_number:
            break
    if subgroup_order != class_number:
        raise ArithmeticError(
            "streamed quadratic forms did not generate the class group"
        )
    dimension = len(generators)
    rows = []
    for index, relative_order in enumerate(relative_orders):
        row = [0] * dimension
        for position, exponent in enumerate(power_relations[index]):
            row[position] = -exponent
        row[index] = relative_order
        rows.append(row)
    matrix_module = __import__(
        "sagejs.number_fields.class_group_matrix",
        fromlist=["extract_relation_presentation"],
    )
    presentation = matrix_module.extract_relation_presentation(
        rows, dimension, require_full_rank=True
    )
    if presentation.order != class_number:
        raise ArithmeticError("quadratic structure presentation has wrong order")
    invariant_generators = []
    for transform in presentation.generator_transforms:
        result = identity
        for generator, exponent in zip(generators, transform, strict=True):
            result = _class_form_product(
                result,
                _class_form_power(
                    generator,
                    int(exponent),
                    identity,
                    discriminant,
                    narrow,
                    orientation,
                    max_steps,
                ),
                discriminant,
                narrow,
                orientation,
                max_steps,
            )
        invariant_generators.append(result)
    for invariant, generator in zip(
        presentation.invariants, invariant_generators, strict=True
    ):
        if (
            _class_form_power(
                generator,
                invariant,
                identity,
                discriminant,
                narrow,
                orientation,
                max_steps,
            )
            != identity
        ):
            raise ArithmeticError("quadratic invariant generator has wrong order")
        for prime, _exponent in _prime_factorization(invariant):
            if (
                _class_form_power(
                    generator,
                    invariant // prime,
                    identity,
                    discriminant,
                    narrow,
                    orientation,
                    max_steps,
                )
                == identity
            ):
                raise ArithmeticError(
                    "quadratic invariant generator order is not exact"
                )
    certificate = QuadraticClassStructureCertificate(
        discriminant,
        narrow,
        class_number,
        count.certificate.reduced_forms_checked,
        forms_scanned,
        tuple(generators),
        tuple(relative_orders),
        tuple(power_relations),
        tuple(presentation.invariants),
        tuple(invariant_generators),
        max_bsgs_table,
        largest_bsgs_table,
        max_steps,
        algorithm,
        max_reduced_forms,
        max_enumeration_checks,
    )
    return RealQuadraticClassStructureResult(certificate)


class QuadraticClassGroup:
    """The ordinary or narrow class group of a real quadratic maximal order."""

    def __init__(
        self,
        discriminant: int,
        *,
        narrow: bool = False,
        algorithm: str = "auto",
        max_reduced_forms: int = 1_000_000,
        max_enumeration_checks: int = _DEFAULT_MAX_ENUMERATION_CHECKS,
        max_steps: int = 1_000_000,
    ) -> None:
        self.plan = real_quadratic_class_group_plan(
            discriminant,
            algorithm=algorithm,
            max_reduced_forms=max_reduced_forms,
            max_enumeration_checks=max_enumeration_checks,
            max_steps=max_steps,
        )
        self.plan.require_supported()
        self.plan = QuadraticClassGroupPlan(
            self.plan.discriminant,
            self.plan.requested_algorithm,
            self.plan.algorithm,
            self.plan.root_floor,
            self.plan.enumeration_checks,
            self.plan.max_enumeration_checks,
            self.plan.max_reduced_forms,
            self.plan.max_steps,
            False,
            self.plan.exact_integer_storage,
            self.plan.proof_status,
        )
        _require_real_fundamental_discriminant(discriminant)
        self.discriminant = discriminant
        self.narrow = narrow
        self.algorithm = self.plan.algorithm
        self.proof_status = "exact-unconditional"
        self._max_steps = max_steps
        self.materializes_all_classes = False
        self._reduced_forms: tuple[QuadraticForm, ...] | None = None
        self._proper_representatives: tuple[QuadraticForm, ...] | None = None
        self._representatives: tuple[QuadraticForm, ...] | None = None
        principal = _canonical_proper_form(
            _principal_form(discriminant), discriminant, max_steps
        )
        orientation = _canonical_proper_form(
            _principal_form(discriminant).negated(), discriminant, max_steps
        )
        self._orientation_class = orientation
        self._identity_form = principal
        if not narrow:
            self._identity_form = _least_form([principal, orientation])
        self._cache: dict[tuple[int, int, int], QuadraticClassElement] = {}
        structure = real_quadratic_class_invariants(
            discriminant,
            narrow=narrow,
            algorithm=algorithm,
            max_reduced_forms=max_reduced_forms,
            max_enumeration_checks=max_enumeration_checks,
            max_steps=max_steps,
        )
        self._class_number = structure.order()
        self._invariants = structure.invariants()
        self._generators = tuple(
            self._element(form) for form in structure.generator_forms()
        )
        unit_norm = real_quadratic_fundamental_unit(
            discriminant, max_steps=max_steps
        ).norm
        if (orientation == principal) != (unit_norm == -1):
            raise ArithmeticError("unit norm and the orientation kernel disagree")
        self.certificate = QuadraticClassGroupCertificate(
            discriminant,
            narrow,
            structure.certificate.reduced_forms_checked,
            (
                self._class_number
                if narrow
                else self._class_number * (1 if unit_norm == -1 else 2)
            ),
            structure.certificate,
            orientation,
            self._invariants,
            unit_norm,
            self.plan,
            self,
        )

    def _materialized_class_data(
        self,
    ) -> tuple[
        tuple[QuadraticForm, ...],
        tuple[QuadraticForm, ...],
        tuple[QuadraticForm, ...],
    ]:
        if (
            self._reduced_forms is not None
            and self._proper_representatives is not None
            and self._representatives is not None
        ):
            return (
                self._reduced_forms,
                self._proper_representatives,
                self._representatives,
            )
        reduced_forms = _enumerate_reduced_forms(
            self.discriminant,
            self.plan.max_reduced_forms,
            self.plan.max_enumeration_checks,
        )
        proper_representatives = _sorted_forms(
            [
                _canonical_proper_form(form, self.discriminant, self._max_steps)
                for form in reduced_forms
            ]
        )
        if self._identity_form not in proper_representatives:
            raise ArithmeticError(
                "reduced-form enumeration omitted the principal class"
            )
        if self.narrow:
            representatives = proper_representatives
        else:
            representatives = _sorted_forms(
                [
                    _least_form(
                        [
                            form,
                            _compose_forms(
                                form,
                                self._orientation_class,
                                self.discriminant,
                                self._max_steps,
                            ),
                        ]
                    )
                    for form in proper_representatives
                ]
            )
        if len(representatives) != self._class_number:
            raise ArithmeticError("lazy class enumeration has the wrong order")
        self._reduced_forms = reduced_forms
        self._proper_representatives = proper_representatives
        self._representatives = representatives
        return (reduced_forms, proper_representatives, representatives)

    def _canonical(self, form: QuadraticForm) -> QuadraticForm:
        proper = _canonical_proper_form(form, self.discriminant, self._max_steps)
        if self.narrow:
            return proper
        paired = _compose_forms(
            proper, self._orientation_class, self.discriminant, self._max_steps
        )
        return _least_form([proper, paired])

    def _multiply(self, left: QuadraticForm, right: QuadraticForm) -> QuadraticForm:
        return self._canonical(
            _compose_forms(left, right, self.discriminant, self._max_steps)
        )

    def _element(self, form: QuadraticForm) -> QuadraticClassElement:
        canonical = self._canonical(form)
        key = _form_key(canonical)
        cached = self._cache.get(key)
        if cached is None:
            cached = QuadraticClassElement(self, canonical)
            self._cache[key] = cached
        return cached

    def __call__(
        self, form: QuadraticForm | tuple[int, int, int]
    ) -> QuadraticClassElement:
        if isinstance(form, tuple):
            form = QuadraticForm(*form)
        if form.discriminant() != self.discriminant or not form.is_primitive():
            raise ValueError("the form must be primitive with the group discriminant")
        return self._element(form)

    def one(self) -> QuadraticClassElement:
        return self._element(self._identity_form)

    def order(self) -> int:
        return self._class_number

    cardinality = order

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def gens(self) -> tuple[QuadraticClassElement, ...]:
        return self._generators

    def gen(self, index: int = 0) -> QuadraticClassElement:
        return self._generators[index]

    def ngens(self) -> int:
        return len(self._generators)

    def list(self) -> list[QuadraticClassElement]:
        representatives = self._materialized_class_data()[2]
        return [self._element(form) for form in representatives]

    def __iter__(self) -> Iterator[QuadraticClassElement]:
        return iter(self.list())

    def __len__(self) -> int:
        return self.order()

    def orientation_kernel(self) -> QuadraticClassElement:
        return self._element(self._orientation_class)

    def verify(self) -> bool:
        return self.certificate.verify()

    def __repr__(self) -> str:
        kind = "Narrow class group" if self.narrow else "Class group"
        return (
            kind
            + " of order "
            + str(self.order())
            + " with invariants "
            + str(self.invariants())
            + " for discriminant "
            + str(self.discriminant)
        )


@dataclass(frozen=True)
class RealQuadraticClassUnitContext:
    """Shared exact results for later public number-field integration."""

    discriminant: int
    units: RealQuadraticUnitResult
    ordinary_class_group: QuadraticClassGroup
    narrow_class_group: QuadraticClassGroup
    minkowski: MinkowskiTrivialityCertificate
    proof_status: str = "exact-unconditional"

    def verify(self) -> bool:
        return (
            self.units.verify()
            and self.ordinary_class_group.verify()
            and self.narrow_class_group.verify()
            and self.minkowski.verify()
            and self.ordinary_class_group.order() * (1 if self.units.norm == -1 else 2)
            == self.narrow_class_group.order()
        )


def real_quadratic_class_unit_context(
    discriminant: int,
    *,
    algorithm: str = "auto",
    max_reduced_forms: int = 1_000_000,
    max_enumeration_checks: int = _DEFAULT_MAX_ENUMERATION_CHECKS,
    max_steps: int = 1_000_000,
) -> RealQuadraticClassUnitContext:
    """Compute ordinary/narrow classes and units with consistent conventions."""
    units = real_quadratic_fundamental_unit(
        discriminant, algorithm=algorithm, max_steps=max_steps
    )
    ordinary = QuadraticClassGroup(
        discriminant,
        narrow=False,
        algorithm=algorithm,
        max_reduced_forms=max_reduced_forms,
        max_enumeration_checks=max_enumeration_checks,
        max_steps=max_steps,
    )
    narrow = QuadraticClassGroup(
        discriminant,
        narrow=True,
        algorithm=algorithm,
        max_reduced_forms=max_reduced_forms,
        max_enumeration_checks=max_enumeration_checks,
        max_steps=max_steps,
    )
    return RealQuadraticClassUnitContext(
        discriminant,
        units,
        ordinary,
        narrow,
        quadratic_minkowski_triviality(discriminant),
    )


def real_quadratic_class_group(
    discriminant: int,
    *,
    narrow: bool = False,
    algorithm: str = "auto",
    max_reduced_forms: int = 1_000_000,
    max_enumeration_checks: int = _DEFAULT_MAX_ENUMERATION_CHECKS,
    max_steps: int = 1_000_000,
) -> QuadraticClassGroup:
    """Return the ordinary class group, or the narrow group when requested."""
    return QuadraticClassGroup(
        discriminant,
        narrow=narrow,
        algorithm=algorithm,
        max_reduced_forms=max_reduced_forms,
        max_enumeration_checks=max_enumeration_checks,
        max_steps=max_steps,
    )


__all__ = [
    "ContinuedFractionUnitCertificate",
    "MinkowskiTrivialityCertificate",
    "MinkowskiTrivialClassElement",
    "MinkowskiTrivialClassGroup",
    "QuadraticClassElement",
    "QuadraticClassGroup",
    "QuadraticClassGroupCertificate",
    "QuadraticClassNumberCertificate",
    "QuadraticClassGroupPlan",
    "QuadraticClassRoutingPlan",
    "QuadraticForm",
    "QuadraticIdealBasis",
    "QuadraticUnit",
    "RealQuadraticClassUnitContext",
    "RealQuadraticClassNumberResult",
    "RealQuadraticFieldUnitGroupResult",
    "RealQuadraticUnitResult",
    "exact_minkowski_triviality",
    "is_fundamental_discriminant",
    "IMAGINARY_QUADRATIC_FORM_THRESHOLD",
    "quadratic_minkowski_triviality",
    "quadratic_form_from_ideal_lattice",
    "real_quadratic_class_group",
    "real_quadratic_class_group_plan",
    "real_quadratic_class_number",
    "real_quadratic_class_unit_context",
    "real_quadratic_fundamental_unit",
    "real_quadratic_field_unit_group",
]
