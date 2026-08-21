"""Exact class and unit arithmetic for maximal quadratic orders.

This module is the portable quadratic engine used by the class-and-unit-group
integration layer.  It deliberately depends only on ordinary Python integer
arithmetic.  Real quadratic units come from the continued-fraction reduction
cycle of the principal form.  Narrow classes are proper cycles of primitive
reduced indefinite forms, and ordinary classes are their quotient by the
orientation class.

The reduction conventions are those of Buchmann--Vollmer, Chapter 6.  PARI's
`Qfb.c` and `buch1.c` were used as algorithmic oracles; no PARI code or runtime
dependency is included here.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import log, sqrt
from typing import Iterator

Matrix2 = tuple[tuple[int, int], tuple[int, int]]

_IDENTITY_MATRIX: Matrix2 = ((1, 0), (0, 1))
# A classical, rigorous rational lower bound.  It is deliberately recorded in
# every certificate whose exact comparison uses the archimedean constant.
_PI_LOWER_NUMERATOR = 103_993
_PI_LOWER_DENOMINATOR = 33_102


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
    while prime * prime <= remaining:
        exponent = 0
        while remaining % prime == 0:
            remaining //= prime
            exponent += 1
        if exponent:
            answer.append((prime, exponent))
        prime = 3 if prime == 2 else prime + 2
    if remaining > 1:
        answer.append((remaining, 1))
    return tuple(answer)


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

    def verify(self) -> bool:
        return (
            self.norm == self.unit.norm
            and self.unit.verify()
            and self.certificate.fundamental_unit == self.unit
            and self.certificate.verify()
        )

    def regulator(self) -> float:
        return self.unit.regulator()


def real_quadratic_fundamental_unit(
    discriminant: int, *, max_steps: int = 1_000_000
) -> RealQuadraticUnitResult:
    """Return the fundamental unit using a complete continued-fraction cycle."""
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
    return RealQuadraticUnitResult(discriminant, unit, unit.norm, certificate)


def _enumerate_reduced_forms(
    discriminant: int,
    max_reduced_forms: int,
) -> tuple[QuadraticForm, ...]:
    if max_reduced_forms < 1:
        raise ValueError("max_reduced_forms must be positive")
    root_floor = _isqrt(discriminant)
    forms: list[QuadraticForm] = []
    for middle in range(1, root_floor + 1):
        numerator = middle * middle - discriminant
        for leading in range(-root_floor, root_floor + 1):
            if leading == 0 or numerator % (4 * leading) != 0:
                continue
            trailing = numerator // (4 * leading)
            form = QuadraticForm(leading, middle, trailing)
            if form.is_primitive() and _is_reduced_indefinite(form, discriminant):
                forms.append(form)
                if len(forms) > max_reduced_forms:
                    raise ValueError(
                        "reduced-form enumeration exceeded max_reduced_forms="
                        + str(max_reduced_forms)
                    )
    return tuple(forms)


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


def _compose_forms(
    left: QuadraticForm,
    right: QuadraticForm,
    discriminant: int,
    max_steps: int,
) -> QuadraticForm:
    """Compose via the exact product lattice, then reduce canonically."""
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
    """Replayable exhaustive reduced-form evidence for a class group."""

    discriminant: int
    narrow: bool
    reduced_forms: tuple[QuadraticForm, ...]
    proper_representatives: tuple[QuadraticForm, ...]
    representatives: tuple[QuadraticForm, ...]
    orientation_class: QuadraticForm
    invariants: tuple[int, ...]
    unit_norm: int
    proof_status: str = "exact-unconditional"
    source: str = "primitive reduced indefinite forms and exact ideal composition"

    def verify(self) -> bool:
        try:
            replay = QuadraticClassGroup(
                self.discriminant,
                narrow=self.narrow,
                max_reduced_forms=max(1, len(self.reduced_forms)),
                max_steps=max(16, 4 * len(self.reduced_forms) + 16),
            )
        except (ValueError, ArithmeticError):
            return False
        return replay.certificate == self


class QuadraticClassGroup:
    """The ordinary or narrow class group of a real quadratic maximal order."""

    def __init__(
        self,
        discriminant: int,
        *,
        narrow: bool = False,
        max_reduced_forms: int = 1_000_000,
        max_steps: int = 1_000_000,
    ) -> None:
        _require_real_fundamental_discriminant(discriminant)
        self.discriminant = discriminant
        self.narrow = narrow
        self.algorithm = "reduced-indefinite-form-cycles"
        self.proof_status = "exact-unconditional"
        self._max_steps = max_steps
        reduced_forms = _enumerate_reduced_forms(discriminant, max_reduced_forms)
        proper_representatives = _sorted_forms(
            [
                _canonical_proper_form(form, discriminant, max_steps)
                for form in reduced_forms
            ]
        )
        principal = _canonical_proper_form(
            _principal_form(discriminant), discriminant, max_steps
        )
        orientation = _canonical_proper_form(
            _principal_form(discriminant).negated(), discriminant, max_steps
        )
        if principal not in proper_representatives:
            raise ArithmeticError(
                "reduced-form enumeration omitted the principal class"
            )
        self._proper_representatives = proper_representatives
        self._orientation_class = orientation
        self._identity_form = principal
        if narrow:
            representatives = proper_representatives
        else:
            representatives = _sorted_forms(
                [
                    _least_form(
                        [
                            form,
                            _compose_forms(form, orientation, discriminant, max_steps),
                        ]
                    )
                    for form in proper_representatives
                ]
            )
            self._identity_form = _least_form([principal, orientation])
        self._representatives = representatives
        self._cache: dict[tuple[int, int, int], QuadraticClassElement] = {}
        invariants, generators = self._compute_structure()
        self._invariants = tuple(invariants)
        self._generators = tuple(self._element(form) for form in generators)
        unit_norm = real_quadratic_fundamental_unit(
            discriminant, max_steps=max_steps
        ).norm
        if (orientation == principal) != (unit_norm == -1):
            raise ArithmeticError("unit norm and the orientation kernel disagree")
        self.certificate = QuadraticClassGroupCertificate(
            discriminant,
            narrow,
            reduced_forms,
            proper_representatives,
            representatives,
            orientation,
            self._invariants,
            unit_norm,
        )

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
        return len(self._representatives)

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
        return [self._element(form) for form in self._representatives]

    def __iter__(self) -> Iterator[QuadraticClassElement]:
        return iter(self.list())

    def __len__(self) -> int:
        return self.order()

    def orientation_kernel(self) -> QuadraticClassElement:
        return self._element(self._orientation_class)

    def _power_form(self, form: QuadraticForm, exponent: int) -> QuadraticForm:
        return (self._element(form) ** exponent).form()

    def _element_order(self, form: QuadraticForm) -> int:
        return self._element(form).order()

    def _subgroup(self, generators: list[QuadraticForm]) -> list[QuadraticForm]:
        answer = [self._identity_form]
        frontier = [self._identity_form]
        while frontier:
            current = frontier.pop()
            for generator in generators:
                candidate = self._multiply(current, generator)
                if candidate not in answer:
                    answer.append(candidate)
                    frontier.append(candidate)
        return answer

    def _primary_basis(
        self, prime: int, exponent: int
    ) -> tuple[list[int], list[QuadraticForm]]:
        primary_order = prime**exponent
        projection_power = self.order() // primary_order
        primary_forms = list(
            _sorted_forms(
                [
                    self._power_form(form, projection_power)
                    for form in self._representatives
                ]
            )
        )
        if len(primary_forms) != primary_order:
            raise ArithmeticError("a primary projection has the wrong order")
        ranks = [0]
        for level in range(1, exponent + 1):
            killed = sum(
                1
                for form in primary_forms
                if self._power_form(form, prime**level) == self._identity_form
            )
            rank = 0
            while killed > 1 and killed % prime == 0:
                killed //= prime
                rank += 1
            if killed != 1:
                raise ArithmeticError("a primary rank is inconsistent")
            ranks.append(rank)
        factors: list[int] = []
        for level in range(1, exponent + 1):
            at_least = ranks[level] - ranks[level - 1]
            next_at_least = ranks[level + 1] - ranks[level] if level < exponent else 0
            factors.extend([prime**level] * (at_least - next_at_least))
        selected: list[QuadraticForm] = []
        subgroup = [self._identity_form]
        for target_order in reversed(factors):
            chosen: QuadraticForm | None = None
            for candidate in primary_forms:
                if self._element_order(candidate) != target_order:
                    continue
                candidate_subgroup = self._subgroup(selected + [candidate])
                if len(candidate_subgroup) == len(subgroup) * target_order:
                    chosen = candidate
                    subgroup = candidate_subgroup
                    break
            if chosen is None:
                raise ArithmeticError("failed to find independent primary generators")
            selected.append(chosen)
        if len(subgroup) != primary_order:
            raise ArithmeticError("primary generators do not span")
        selected.reverse()
        return (factors, selected)

    def _compute_structure(self) -> tuple[list[int], list[QuadraticForm]]:
        if self.order() == 1:
            return ([], [])
        for form in self._representatives:
            if self._element_order(form) == self.order():
                return ([self.order()], [form])
        component_orders: list[list[int]] = []
        component_generators: list[list[QuadraticForm]] = []
        maximum_rank = 0
        for prime, exponent in _prime_factorization(self.order()):
            orders, generators = self._primary_basis(prime, exponent)
            component_orders.append(orders)
            component_generators.append(generators)
            maximum_rank = max(maximum_rank, len(orders))
        invariants: list[int] = []
        generators: list[QuadraticForm] = []
        for position in range(maximum_rank):
            invariant = 1
            generator = self._identity_form
            for index, orders in enumerate(component_orders):
                offset = maximum_rank - len(orders)
                if position >= offset:
                    local_index = position - offset
                    invariant *= orders[local_index]
                    generator = self._multiply(
                        generator, component_generators[index][local_index]
                    )
            invariants.append(invariant)
            generators.append(generator)
        if len(self._subgroup(generators)) != self.order():
            raise ArithmeticError("invariant-factor generators do not span")
        return (invariants, generators)

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
    max_reduced_forms: int = 1_000_000,
    max_steps: int = 1_000_000,
) -> RealQuadraticClassUnitContext:
    """Compute ordinary/narrow classes and units with consistent conventions."""
    units = real_quadratic_fundamental_unit(discriminant, max_steps=max_steps)
    ordinary = QuadraticClassGroup(
        discriminant,
        narrow=False,
        max_reduced_forms=max_reduced_forms,
        max_steps=max_steps,
    )
    narrow = QuadraticClassGroup(
        discriminant,
        narrow=True,
        max_reduced_forms=max_reduced_forms,
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
    max_reduced_forms: int = 1_000_000,
    max_steps: int = 1_000_000,
) -> QuadraticClassGroup:
    """Return the ordinary class group, or the narrow group when requested."""
    return QuadraticClassGroup(
        discriminant,
        narrow=narrow,
        max_reduced_forms=max_reduced_forms,
        max_steps=max_steps,
    )


__all__ = [
    "ContinuedFractionUnitCertificate",
    "MinkowskiTrivialityCertificate",
    "QuadraticClassElement",
    "QuadraticClassGroup",
    "QuadraticClassGroupCertificate",
    "QuadraticForm",
    "QuadraticIdealBasis",
    "QuadraticUnit",
    "RealQuadraticClassUnitContext",
    "RealQuadraticUnitResult",
    "exact_minkowski_triviality",
    "is_fundamental_discriminant",
    "quadratic_minkowski_triviality",
    "real_quadratic_class_group",
    "real_quadratic_class_unit_context",
    "real_quadratic_fundamental_unit",
]
