"""Certified analytic interfaces for number-field class and unit groups.

This module implements the proof boundary used by a Buchmann--Hecke class and
unit computation.  Exact relation dependencies yield candidate units, interval
logarithms yield regulator enclosures, and the Belabas--Friedman prime sum
yields an enclosure for the logarithm of the Dedekind-zeta residue.  Comparing
the two sides of the analytic class-number formula then bounds the missing
finite index.

The interval implementation deliberately stores exact rational endpoints.
Basic interval arithmetic is therefore exact.  Transcendental endpoints use
`mpmath.iv`, whose `libmp` routines round interval endpoints outwards.  Plain
floating-point inputs are never promoted to rigorous balls.

The zeta implementation follows Hecke's BSD-licensed
`src/NumFieldOrd/NfOrd/Zeta.jl`, which implements the explicit estimate of
Belabas and Friedman.  PARI's `buch2.c` is an independent algorithmic oracle;
no PARI or Hecke code is loaded at runtime.
"""

from __future__ import annotations

from typing import Any, Callable, Iterable, Sequence

from mpmath import iv
from mpmath.libmp import to_rational as _mpf_to_rational

_interval_context: Any = iv


class AnalyticCertificationError(ArithmeticError):
    """Raised when data requested as rigorous has no complete proof boundary."""


class AnalyticPrecisionError(AnalyticCertificationError):
    """Raised when interval precision cannot separate the required result."""


class AnalyticResourceError(RuntimeError):
    """Raised before a certified computation exceeds an explicit work cap."""


class UnitLatticeError(ArithmeticError):
    """Raised when purported relation dependencies do not replay exactly."""


def _gcd(left: int, right: int) -> int:
    left = abs(int(left))
    right = abs(int(right))
    while right:
        left, right = right, left % right
    return left


class RationalEndpoint:
    """A normalized exact rational used as an interval endpoint."""

    def __init__(self, numerator: int, denominator: int = 1) -> None:
        numerator = int(numerator)
        denominator = int(denominator)
        if denominator == 0:
            raise ZeroDivisionError("a rational endpoint cannot have denominator zero")
        if denominator < 0:
            numerator = -numerator
            denominator = -denominator
        common = _gcd(numerator, denominator)
        self.numerator = numerator // common
        self.denominator = denominator // common

    def __neg__(self) -> RationalEndpoint:
        return RationalEndpoint(-self.numerator, self.denominator)

    def __add__(self, other: RationalEndpoint) -> RationalEndpoint:
        return RationalEndpoint(
            self.numerator * other.denominator + other.numerator * self.denominator,
            self.denominator * other.denominator,
        )

    def __sub__(self, other: RationalEndpoint) -> RationalEndpoint:
        return self + (-other)

    def __mul__(self, other: RationalEndpoint) -> RationalEndpoint:
        return RationalEndpoint(
            self.numerator * other.numerator,
            self.denominator * other.denominator,
        )

    def __truediv__(self, other: RationalEndpoint) -> RationalEndpoint:
        if other.numerator == 0:
            raise ZeroDivisionError("division by a zero rational endpoint")
        return RationalEndpoint(
            self.numerator * other.denominator,
            self.denominator * other.numerator,
        )

    def __lt__(self, other: RationalEndpoint) -> bool:
        return self.numerator * other.denominator < other.numerator * self.denominator

    def __le__(self, other: RationalEndpoint) -> bool:
        return self.numerator * other.denominator <= other.numerator * self.denominator

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, RationalEndpoint)
            and self.numerator == other.numerator
            and self.denominator == other.denominator
        )

    def __float__(self) -> float:
        return self.numerator / self.denominator

    def __str__(self) -> str:
        if self.denominator == 1:
            return str(self.numerator)
        return str(self.numerator) + "/" + str(self.denominator)

    def __repr__(self) -> str:
        return str(self)

    def floor(self) -> int:
        return self.numerator // self.denominator

    def ceil(self) -> int:
        return -((-self.numerator) // self.denominator)


def _decimal_rational(value: str) -> RationalEndpoint:
    text = value.strip().lower()
    if not text:
        raise ValueError("an empty string is not a real endpoint")
    if "/" in text:
        numerator, denominator = text.split("/", 1)
        return RationalEndpoint(int(numerator), int(denominator))
    sign = -1 if text.startswith("-") else 1
    if text[:1] in ("-", "+"):
        text = text[1:]
    exponent = 0
    if "e" in text:
        text, exponent_text = text.split("e", 1)
        exponent = int(exponent_text)
    if "." in text:
        integer, fractional = text.split(".", 1)
    else:
        integer, fractional = text, ""
    if not integer:
        integer = "0"
    digits = integer + fractional
    if not digits or any(character < "0" or character > "9" for character in digits):
        raise ValueError("invalid decimal endpoint")
    numerator = sign * int(digits)
    decimal_exponent = exponent - len(fractional)
    if decimal_exponent >= 0:
        return RationalEndpoint(numerator * (10**decimal_exponent))
    return RationalEndpoint(numerator, 10 ** (-decimal_exponent))


def _endpoint(value: Any, *, rigorous: bool) -> RationalEndpoint:
    if isinstance(value, RationalEndpoint):
        return value
    if isinstance(value, bool):
        return RationalEndpoint(int(value))
    if isinstance(value, int):
        return RationalEndpoint(value)
    if isinstance(value, str):
        return _decimal_rational(value)
    if isinstance(value, float):
        if rigorous:
            raise AnalyticCertificationError(
                "binary floating-point input cannot define a rigorous endpoint"
            )
        return _decimal_rational(repr(value))
    numerator = getattr(value, "numerator", None)
    denominator = getattr(value, "denominator", None)
    if numerator is not None and denominator is not None:
        return RationalEndpoint(int(numerator), int(denominator))
    if rigorous:
        raise TypeError("a rigorous endpoint must be exact or a decimal string")
    return _decimal_rational(str(value))


class RealBall:
    """A real interval with exact rational endpoints and explicit proof state."""

    def __init__(
        self,
        lower: Any,
        upper: Any = None,
        *,
        precision_bits: int = 53,
        rigorous: bool = True,
        source: str = "exact-rational-endpoints",
    ) -> None:
        if upper is None:
            upper = lower
        if int(precision_bits) < 2:
            raise ValueError("precision_bits must be at least 2")
        self.lower = _endpoint(lower, rigorous=rigorous)
        self.upper = _endpoint(upper, rigorous=rigorous)
        if self.upper < self.lower:
            raise ValueError("a real ball needs lower <= upper")
        self.precision_bits = int(precision_bits)
        self.rigorous = bool(rigorous)
        self.source = str(source)

    @classmethod
    def midpoint_radius(
        cls,
        midpoint: Any,
        radius: Any,
        *,
        precision_bits: int = 53,
        rigorous: bool = True,
        source: str = "midpoint-radius",
    ) -> RealBall:
        center = _endpoint(midpoint, rigorous=rigorous)
        error = _endpoint(radius, rigorous=rigorous)
        if error < RationalEndpoint(0):
            raise ValueError("a ball radius must be nonnegative")
        return cls(
            center - error,
            center + error,
            precision_bits=precision_bits,
            rigorous=rigorous,
            source=source,
        )

    def _binary_state(self, other: RealBall) -> tuple[int, bool, str]:
        return (
            min(self.precision_bits, other.precision_bits),
            self.rigorous and other.rigorous,
            self.source + "; " + other.source,
        )

    @staticmethod
    def _arithmetic_result(
        lower: RationalEndpoint,
        upper: RationalEndpoint,
        *,
        precision_bits: int,
        rigorous: bool,
        source: str,
    ) -> RealBall:
        """Round endpoints outwards to a bounded dyadic denominator.

        Keeping exact rational endpoints does not mean retaining the product
        of every unrelated integer denominator in a long prime sum.  This
        operation is the rational equivalent of an Arb precision boundary:
        it bounds coefficient growth while preserving enclosure.
        """
        scale = 1 << precision_bits
        lower_scaled = (lower.numerator * scale) // lower.denominator
        upper_scaled = -((-upper.numerator * scale) // upper.denominator)
        return RealBall(
            RationalEndpoint(lower_scaled, scale),
            RationalEndpoint(upper_scaled, scale),
            precision_bits=precision_bits,
            rigorous=rigorous,
            source=source,
        )

    def __add__(self, other: RealBall) -> RealBall:
        precision, rigorous, source = self._binary_state(other)
        return self._arithmetic_result(
            self.lower + other.lower,
            self.upper + other.upper,
            precision_bits=precision,
            rigorous=rigorous,
            source=source,
        )

    def __neg__(self) -> RealBall:
        return RealBall(
            -self.upper,
            -self.lower,
            precision_bits=self.precision_bits,
            rigorous=self.rigorous,
            source=self.source,
        )

    def __sub__(self, other: RealBall) -> RealBall:
        return self + (-other)

    def __mul__(self, other: RealBall) -> RealBall:
        products = (
            self.lower * other.lower,
            self.lower * other.upper,
            self.upper * other.lower,
            self.upper * other.upper,
        )
        lower = products[0]
        upper = products[0]
        for product in products[1:]:
            if product < lower:
                lower = product
            if upper < product:
                upper = product
        precision, rigorous, source = self._binary_state(other)
        return self._arithmetic_result(
            lower,
            upper,
            precision_bits=precision,
            rigorous=rigorous,
            source=source,
        )

    def reciprocal(self) -> RealBall:
        zero = RationalEndpoint(0)
        if self.lower <= zero and zero <= self.upper:
            raise ZeroDivisionError("a ball containing zero has no bounded reciprocal")
        left = RationalEndpoint(1) / self.lower
        right = RationalEndpoint(1) / self.upper
        return self._arithmetic_result(
            right if right < left else left,
            left if right < left else right,
            precision_bits=self.precision_bits,
            rigorous=self.rigorous,
            source=self.source,
        )

    def __truediv__(self, other: RealBall) -> RealBall:
        return self * other.reciprocal()

    def __pow__(self, exponent: int) -> RealBall:
        exponent = int(exponent)
        if exponent < 0:
            return (self.reciprocal()) ** (-exponent)
        answer = RealBall(
            1,
            precision_bits=self.precision_bits,
            rigorous=self.rigorous,
            source=self.source,
        )
        base = self
        while exponent:
            if exponent & 1:
                answer = answer * base
            exponent //= 2
            if exponent:
                base = base * base
        return answer

    def absolute_value(self) -> RealBall:
        zero = RationalEndpoint(0)
        if zero <= self.lower:
            return self
        if self.upper <= zero:
            return -self
        negative = -self.lower
        upper = negative if self.upper < negative else self.upper
        return RealBall(
            0,
            upper,
            precision_bits=self.precision_bits,
            rigorous=self.rigorous,
            source=self.source,
        )

    def add_error(self, error: Any) -> RealBall:
        magnitude = _endpoint(error, rigorous=self.rigorous)
        if magnitude < RationalEndpoint(0):
            raise ValueError("an interval error bound must be nonnegative")
        return RealBall(
            self.lower - magnitude,
            self.upper + magnitude,
            precision_bits=self.precision_bits,
            rigorous=self.rigorous,
            source=self.source + "; explicit-error-bound",
        )

    def intersection(self, other: RealBall) -> RealBall:
        """Return the common part of two enclosures of the same real value."""
        lower = other.lower if self.lower < other.lower else self.lower
        upper = self.upper if self.upper < other.upper else other.upper
        if upper < lower:
            raise AnalyticCertificationError(
                "independent certified enclosures are disjoint"
            )
        precision, rigorous, source = self._binary_state(other)
        return RealBall(
            lower,
            upper,
            precision_bits=precision,
            rigorous=rigorous,
            source=source + "; certified-intersection",
        )

    def contains_zero(self) -> bool:
        zero = RationalEndpoint(0)
        return self.lower <= zero and zero <= self.upper

    def is_positive(self) -> bool:
        return RationalEndpoint(0) < self.lower

    def is_negative(self) -> bool:
        return self.upper < RationalEndpoint(0)

    def contains(self, value: Any) -> bool:
        point = _endpoint(value, rigorous=False)
        return self.lower <= point and point <= self.upper

    def width(self) -> RationalEndpoint:
        return self.upper - self.lower

    def radius(self) -> RationalEndpoint:
        return self.width() / RationalEndpoint(2)

    def midpoint(self) -> RationalEndpoint:
        return (self.lower + self.upper) / RationalEndpoint(2)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.real-ball.v1",
            "lower": str(self.lower),
            "upper": str(self.upper),
            "midpoint": str(self.midpoint()),
            "radius": str(self.radius()),
            "precision_bits": self.precision_bits,
            "rigorous": self.rigorous,
            "source": self.source,
        }

    def __repr__(self) -> str:
        return "[" + str(self.lower) + ", " + str(self.upper) + "]"


def _ball(value: Any, *, precision_bits: int, rigorous: bool) -> RealBall:
    if isinstance(value, RealBall):
        return value
    if isinstance(value, dict):
        if "lower" in value and "upper" in value:
            return RealBall(
                value["lower"],
                value["upper"],
                precision_bits=int(value.get("precision_bits", precision_bits)),
                rigorous=bool(value.get("rigorous", rigorous)),
                source=str(value.get("source", "serialized-enclosure")),
            )
        if "midpoint" in value and "radius" in value:
            return RealBall.midpoint_radius(
                value["midpoint"],
                value["radius"],
                precision_bits=int(value.get("precision_bits", precision_bits)),
                rigorous=bool(value.get("rigorous", rigorous)),
                source=str(value.get("source", "serialized-midpoint-radius")),
            )
    return RealBall(
        value,
        precision_bits=precision_bits,
        rigorous=rigorous,
        source="exact-input" if rigorous else "nonrigorous-point-input",
    )


class IntervalBallField:
    """Directed-rounding transcendental operations backed by `mpmath.iv`."""

    def __init__(self, precision_bits: int = 100) -> None:
        precision_bits = int(precision_bits)
        if precision_bits < 16:
            raise ValueError("interval transcendental precision must be at least 16")
        self.precision_bits = precision_bits
        self._integer_logs: dict[int, RealBall] = {}
        self._integer_square_roots: dict[int, RealBall] = {}
        self._log_hits = 0
        self._sqrt_hits = 0
        self._log_evaluations = 0
        self._sqrt_evaluations = 0

    def _from_iv(self, value: Any, source: str) -> RealBall:
        lower_value, upper_value = value._mpi_
        lower_numerator, lower_denominator = _mpf_to_rational(lower_value)
        upper_numerator, upper_denominator = _mpf_to_rational(upper_value)
        return RealBall(
            RationalEndpoint(int(lower_numerator), int(lower_denominator)),
            RationalEndpoint(int(upper_numerator), int(upper_denominator)),
            precision_bits=self.precision_bits,
            rigorous=True,
            source=source + "; mpmath-libmp-directed-rounding",
        )

    def _point(self, value: RationalEndpoint) -> Any:
        return _interval_context.mpf(value.numerator) / _interval_context.mpf(
            value.denominator
        )

    def _monotone(
        self, value: RealBall, operation: Callable[[Any], Any], name: str
    ) -> RealBall:
        previous = _interval_context.prec
        try:
            _interval_context.prec = self.precision_bits
            lower = operation(self._point(value.lower))
            upper = operation(self._point(value.upper))
            lower_numerator, lower_denominator = _mpf_to_rational(lower._mpi_[0])
            upper_numerator, upper_denominator = _mpf_to_rational(upper._mpi_[1])
        finally:
            _interval_context.prec = previous
        return RealBall(
            RationalEndpoint(int(lower_numerator), int(lower_denominator)),
            RationalEndpoint(int(upper_numerator), int(upper_denominator)),
            precision_bits=self.precision_bits,
            rigorous=value.rigorous,
            source=name + "; mpmath-libmp-directed-rounding",
        )

    def log(self, value: RealBall) -> RealBall:
        if not value.is_positive():
            raise ValueError("logarithm requires a provably positive ball")
        self._log_evaluations += 1
        return self._monotone(value, _interval_context.log, "interval-log")

    def sqrt(self, value: RealBall) -> RealBall:
        if value.lower < RationalEndpoint(0):
            raise ValueError("square root requires a nonnegative ball")
        self._sqrt_evaluations += 1
        return self._monotone(value, _interval_context.sqrt, "interval-sqrt")

    def exp(self, value: RealBall) -> RealBall:
        return self._monotone(value, _interval_context.exp, "interval-exp")

    def log_integer(self, value: int) -> RealBall:
        value = int(value)
        cached = self._integer_logs.get(value)
        if cached is not None:
            self._log_hits += 1
            return cached
        result = self.log(RealBall(value, precision_bits=self.precision_bits))
        self._integer_logs[value] = result
        return result

    def sqrt_integer(self, value: int) -> RealBall:
        value = int(value)
        cached = self._integer_square_roots.get(value)
        if cached is not None:
            self._sqrt_hits += 1
            return cached
        result = self.sqrt(RealBall(value, precision_bits=self.precision_bits))
        self._integer_square_roots[value] = result
        return result

    def diagnostics(self) -> dict[str, int]:
        return {
            "log_evaluations": self._log_evaluations,
            "log_cache_hits": self._log_hits,
            "sqrt_evaluations": self._sqrt_evaluations,
            "sqrt_cache_hits": self._sqrt_hits,
        }

    def pi(self) -> RealBall:
        previous = _interval_context.prec
        try:
            _interval_context.prec = self.precision_bits
            value = +_interval_context.pi
            result = self._from_iv(value, "interval-pi")
        finally:
            _interval_context.prec = previous
        return result


def _integer_matrix(
    rows: Sequence[Sequence[Any]], name: str
) -> tuple[tuple[int, ...], ...]:
    converted = []
    width: int | None = None
    for row in rows:
        converted_row = tuple(int(entry) for entry in row)
        if any(
            entry != original
            for entry, original in zip(converted_row, row, strict=False)
        ):
            raise TypeError(name + " entries must be exact integers")
        if width is None:
            width = len(converted_row)
        elif len(converted_row) != width:
            raise ValueError(name + " must be rectangular")
        converted.append(converted_row)
    return tuple(converted)


def _rational_rank(rows: Sequence[Sequence[int]]) -> int:
    if not rows:
        return 0
    width = len(rows[0])
    matrix = [[RationalEndpoint(value) for value in row] for row in rows]
    pivot_row = 0
    for column in range(width):
        pivot = None
        for row in range(pivot_row, len(matrix)):
            if matrix[row][column].numerator != 0:
                pivot = row
                break
        if pivot is None:
            continue
        matrix[pivot_row], matrix[pivot] = matrix[pivot], matrix[pivot_row]
        pivot_value = matrix[pivot_row][column]
        matrix[pivot_row] = [entry / pivot_value for entry in matrix[pivot_row]]
        for row in range(len(matrix)):
            if row == pivot_row:
                continue
            multiplier = matrix[row][column]
            if multiplier.numerator:
                matrix[row] = [
                    matrix[row][index] - multiplier * matrix[pivot_row][index]
                    for index in range(width)
                ]
        pivot_row += 1
        if pivot_row == len(matrix):
            break
    return pivot_row


def _bareiss_determinant(rows: Sequence[Sequence[int]]) -> int:
    size = len(rows)
    if size == 0:
        return 1
    matrix = [list(row) for row in rows]
    sign = 1
    denominator = 1
    for pivot_index in range(size - 1):
        pivot = pivot_index
        while pivot < size and matrix[pivot][pivot_index] == 0:
            pivot += 1
        if pivot == size:
            return 0
        if pivot != pivot_index:
            matrix[pivot_index], matrix[pivot] = matrix[pivot], matrix[pivot_index]
            sign = -sign
        pivot_value = matrix[pivot_index][pivot_index]
        for row in range(pivot_index + 1, size):
            for column in range(pivot_index + 1, size):
                numerator = (
                    matrix[row][column] * pivot_value
                    - matrix[row][pivot_index] * matrix[pivot_index][column]
                )
                if denominator != 1:
                    if numerator % denominator:
                        raise ArithmeticError("Bareiss division was not exact")
                    numerator //= denominator
                matrix[row][column] = numerator
        denominator = pivot_value
        for row in range(pivot_index + 1, size):
            matrix[row][pivot_index] = 0
    return sign * matrix[size - 1][size - 1]


def _column_subsets(width: int, count: int) -> Iterable[tuple[int, ...]]:
    if count == 0:
        yield ()
        return

    def visit(start: int, selected: tuple[int, ...]) -> Iterable[tuple[int, ...]]:
        if len(selected) == count:
            yield selected
            return
        remaining = count - len(selected)
        for column in range(start, width - remaining + 1):
            yield from visit(column + 1, selected + (column,))

    yield from visit(0, ())


def _saturation_index(rows: Sequence[Sequence[int]]) -> int:
    rank = _rational_rank(rows)
    if rank == 0:
        return 1
    if rank != len(rows):
        raise UnitLatticeError("a lattice basis must have independent rows")
    width = len(rows[0])
    divisor = 0
    for columns in _column_subsets(width, rank):
        minor = [[row[column] for column in columns] for row in rows]
        divisor = _gcd(divisor, _bareiss_determinant(minor))
        if divisor == 1:
            return 1
    return abs(divisor)


class UnitLatticeExtractionResult:
    """Exact replay of relation dependencies and their integral kernel index."""

    def __init__(
        self,
        relation_rows: tuple[tuple[int, ...], ...],
        kernel_basis: tuple[tuple[int, ...], ...],
        *,
        relation_rank: int,
        kernel_rank: int,
        saturation_index: int,
        exact_kernel: bool,
        unit_witnesses: tuple[Any, ...],
    ) -> None:
        self.relation_rows = relation_rows
        self.kernel_basis = kernel_basis
        self.relation_rank = relation_rank
        self.kernel_rank = kernel_rank
        self.saturation_index = saturation_index
        self.exact_kernel = exact_kernel
        self.saturated = exact_kernel and saturation_index == 1
        self.unit_witnesses = unit_witnesses
        self.rigorous = True
        self.status = "exact-relation-kernel"
        self.proof_status = (
            "exact-saturated-relation-kernel"
            if self.saturated
            else "exact-relation-dependencies-unsaturated-or-incomplete"
        )

    def verify(self) -> bool:
        replay = extract_unit_lattice(
            self.relation_rows,
            self.kernel_basis,
            expected_rank=self.kernel_rank,
        )
        return (
            replay.relation_rank == self.relation_rank
            and replay.kernel_rank == self.kernel_rank
            and replay.saturation_index == self.saturation_index
            and replay.exact_kernel == self.exact_kernel
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.unit-lattice-extraction.v1",
            "relation_rows": [list(row) for row in self.relation_rows],
            "kernel_basis": [list(row) for row in self.kernel_basis],
            "relation_rank": self.relation_rank,
            "kernel_rank": self.kernel_rank,
            "saturation_index": self.saturation_index,
            "exact_kernel": self.exact_kernel,
            "saturated": self.saturated,
            "rigorous": self.rigorous,
            "status": self.status,
            "proof_status": self.proof_status,
        }


def extract_unit_lattice(
    relation_rows: Sequence[Sequence[Any]],
    kernel_basis: Sequence[Sequence[Any]],
    *,
    relation_witnesses: Sequence[Any] = (),
    combine_witnesses: Callable[[Sequence[Any], Sequence[int]], Any] | None = None,
    expected_rank: int | None = None,
) -> UnitLatticeExtractionResult:
    """Replay an integral left kernel and extract factored unit witnesses.

    `relation_rows` has one factor-base exponent row per principal relation.
    Each row of `kernel_basis` has one coefficient per relation.  The function
    verifies `kernel_basis * relation_rows == 0` exactly.  It also computes the
    gcd of maximal minors, which is the index in the primitive closure.  Thus a
    full-rank basis with index one is the complete integral relation kernel.

    The relation-matrix lane supplies the kernel basis.  This interface does
    not guess an integral kernel from a floating nullspace.
    """
    relations = _integer_matrix(relation_rows, "relation_rows")
    kernel = _integer_matrix(kernel_basis, "kernel_basis")
    relation_count = len(relations)
    relation_width = len(relations[0]) if relations else 0
    if kernel and len(kernel[0]) != relation_count:
        raise UnitLatticeError("kernel vectors must have one entry per relation")
    for vector in kernel:
        for column in range(relation_width):
            if sum(
                vector[index] * relations[index][column]
                for index in range(relation_count)
            ):
                raise UnitLatticeError(
                    "a purported unit dependency is not in the exact kernel"
                )
    relation_rank = _rational_rank(relations)
    kernel_rank = _rational_rank(kernel)
    if kernel_rank != len(kernel):
        raise UnitLatticeError("kernel_basis rows must be independent")
    if expected_rank is not None and kernel_rank != int(expected_rank):
        raise UnitLatticeError("the extracted unit rank does not match expected_rank")
    nullity = relation_count - relation_rank
    exact_kernel = kernel_rank == nullity
    index = _saturation_index(kernel)
    witnesses: list[Any] = []
    if relation_witnesses:
        if len(relation_witnesses) != relation_count:
            raise ValueError("relation_witnesses must align with relation_rows")
        if combine_witnesses is None:
            raise TypeError("combine_witnesses is required for relation witnesses")
        for vector in kernel:
            witnesses.append(combine_witnesses(relation_witnesses, vector))
    return UnitLatticeExtractionResult(
        relations,
        kernel,
        relation_rank=relation_rank,
        kernel_rank=kernel_rank,
        saturation_index=index,
        exact_kernel=exact_kernel,
        unit_witnesses=tuple(witnesses),
    )


class UnitSaturationEvidence:
    """Replayable evidence that a unit subgroup is `p`-maximal or enlarged."""

    def __init__(
        self,
        prime: int,
        saturated: bool,
        *,
        method: str,
        certificate: Any,
        rigorous: bool,
        enlargement_index: int = 1,
        precision_history: Sequence[int] = (),
        decisive_precision_bits: int | None = None,
    ) -> None:
        prime = int(prime)
        if not _is_prime(prime):
            raise ValueError("unit saturation needs a prime")
        if int(enlargement_index) < 1:
            raise ValueError("enlargement_index must be positive")
        self.prime = prime
        self.saturated = bool(saturated)
        self.method = str(method)
        self.certificate = certificate
        self.rigorous = bool(rigorous)
        self.enlargement_index = int(enlargement_index)
        self.precision_history = tuple(int(value) for value in precision_history)
        self.decisive_precision_bits = (
            None if decisive_precision_bits is None else int(decisive_precision_bits)
        )
        if any(value < 16 for value in self.precision_history):
            raise ValueError("saturation precisions must be at least 16 bits")
        if any(
            2 * self.precision_history[index] != self.precision_history[index + 1]
            for index in range(len(self.precision_history) - 1)
        ):
            raise ValueError("saturation precision must double on every retry")
        if self.saturated and self.enlargement_index != 1:
            raise ValueError("p-maximal evidence cannot record an enlargement index")
        if not self.saturated:
            if self.enlargement_index <= 1:
                raise ValueError("an enlargement needs a nontrivial lattice index")
            if self.enlargement_index % self.prime != 0:
                raise ValueError(
                    "a p-saturation enlargement index must be divisible by p"
                )

    def verify(self, lattice: UnitLatticeExtractionResult) -> bool:
        verifier = getattr(self.certificate, "verify", None)
        if (
            not self.rigorous
            or not callable(verifier)
            or not self.precision_history
            or self.decisive_precision_bits != self.precision_history[-1]
        ):
            return False
        return bool(verifier(lattice, self.prime, self.saturated))

    def to_dict(self) -> dict[str, Any]:
        return {
            "prime": self.prime,
            "saturated": self.saturated,
            "method": self.method,
            "rigorous": self.rigorous,
            "enlargement_index": self.enlargement_index,
            "precision_history": list(self.precision_history),
            "decisive_precision_bits": self.decisive_precision_bits,
        }


class UnitSaturationResult:
    """Explicit rigorous/heuristic state for checked saturation primes."""

    def __init__(
        self,
        lattice: UnitLatticeExtractionResult,
        evidence: Sequence[UnitSaturationEvidence],
    ) -> None:
        self.lattice = lattice
        self.evidence = tuple(evidence)
        self.primes_checked = tuple(item.prime for item in self.evidence)
        self.rigorous = bool(self.evidence) and all(
            item.verify(lattice) for item in self.evidence
        )
        self.saturated = self.rigorous and all(item.saturated for item in self.evidence)
        self.status = "rigorous" if self.rigorous else "heuristic-or-unverified"
        self.proof_status = (
            "exact-unit-p-saturation"
            if self.saturated
            else "unit-saturation-incomplete-or-unverified"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.unit-saturation.v1",
            "lattice": self.lattice.to_dict(),
            "evidence": [item.to_dict() for item in self.evidence],
            "primes_checked": list(self.primes_checked),
            "rigorous": self.rigorous,
            "saturated": self.saturated,
            "status": self.status,
            "proof_status": self.proof_status,
        }


def validate_unit_saturation(
    lattice: UnitLatticeExtractionResult,
    evidence: Sequence[UnitSaturationEvidence],
    *,
    required_primes: Sequence[int] = (),
) -> UnitSaturationResult:
    """Validate replayable `p`-saturation certificates without trusting labels."""
    seen: set[int] = set()
    for item in evidence:
        if item.prime in seen:
            raise ValueError("a saturation prime may occur only once")
        seen.add(item.prime)
    required = {int(prime) for prime in required_primes}
    if not required.issubset(seen):
        raise AnalyticCertificationError("required unit saturation primes are missing")
    return UnitSaturationResult(lattice, evidence)


def _determinant_ball(rows: Sequence[Sequence[RealBall]]) -> RealBall:
    size = len(rows)
    if size == 0:
        return RealBall(1)
    if any(len(row) != size for row in rows):
        raise ValueError("a determinant enclosure requires a square matrix")
    precision = min(entry.precision_bits for row in rows for entry in row)
    rigorous = all(entry.rigorous for row in rows for entry in row)
    zero = RealBall(0, precision_bits=precision, rigorous=rigorous)
    states: dict[int, RealBall] = {
        0: RealBall(1, precision_bits=precision, rigorous=rigorous)
    }
    for row_index in range(size):
        next_states: dict[int, RealBall] = {}
        for mask, partial in states.items():
            for column in range(size):
                bit = 1 << column
                if mask & bit:
                    continue
                greater = 0
                for selected in range(column + 1, size):
                    if mask & (1 << selected):
                        greater += 1
                term = partial * rows[row_index][column]
                if greater % 2:
                    term = -term
                new_mask = mask | bit
                next_states[new_mask] = next_states.get(new_mask, zero) + term
        states = next_states
    return states[(1 << size) - 1]


class RegulatorEnclosure:
    """A determinant enclosure tied to a weighted logarithmic unit lattice."""

    def __init__(
        self,
        ball: RealBall,
        unit_rank: int,
        precision_history: Sequence[int],
        *,
        weighted_complex_places: bool,
        determinant_widths: Sequence[RationalEndpoint] = (),
    ) -> None:
        self.ball = ball
        self.unit_rank = int(unit_rank)
        self.precision_history = tuple(int(value) for value in precision_history)
        self.precision_bits = self.precision_history[-1]
        self.weighted_complex_places = bool(weighted_complex_places)
        self.determinant_widths = tuple(determinant_widths)
        self.refinement_attempts = len(self.precision_history)
        self.full_rank_certified = not ball.contains_zero()
        self.rigorous = ball.rigorous and self.full_rank_certified
        self.status = "rigorous-enclosure" if self.rigorous else "unresolved-enclosure"
        self.proof_status = (
            "interval-certified-weighted-log-regulator"
            if self.rigorous
            else "regulator-rank-or-rounding-not-certified"
        )

    @property
    def lower(self) -> RationalEndpoint:
        return self.ball.lower

    @property
    def upper(self) -> RationalEndpoint:
        return self.ball.upper

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.regulator-enclosure.v1",
            "ball": self.ball.to_dict(),
            "unit_rank": self.unit_rank,
            "precision_history": list(self.precision_history),
            "weighted_complex_places": self.weighted_complex_places,
            "determinant_widths": [str(value) for value in self.determinant_widths],
            "refinement_attempts": self.refinement_attempts,
            "full_rank_certified": self.full_rank_certified,
            "rigorous": self.rigorous,
            "status": self.status,
            "proof_status": self.proof_status,
        }


def certified_regulator_enclosure(
    logarithms: Sequence[Sequence[Any]] | Callable[[int], Sequence[Sequence[Any]]],
    unit_rank: int,
    *,
    precision_bits: int = 100,
    absolute_tolerance_bits: int = 64,
    maximum_precision_bits: int = 4096,
    weighted_complex_places: bool = True,
) -> RegulatorEnclosure:
    """Enclose the weighted-log determinant with precision escalation.

    Rows correspond to units.  Columns correspond to the `r1+r2`
    archimedean places, with complex logarithms already multiplied by two.
    The final product-formula column is omitted, matching Hecke and Sage's
    regulator convention.
    """
    unit_rank = int(unit_rank)
    if unit_rank < 0:
        raise ValueError("unit_rank must be nonnegative")
    if not weighted_complex_places:
        raise AnalyticCertificationError(
            "certified regulators require the frozen complex-place factor-two convention"
        )
    precision = int(precision_bits)
    maximum_precision = int(maximum_precision_bits)
    tolerance_bits = int(absolute_tolerance_bits)
    if precision < 16:
        raise ValueError("regulator precision must be at least 16 bits")
    if maximum_precision < precision:
        raise ValueError("maximum_precision_bits is below the initial precision")
    if tolerance_bits < 1:
        raise ValueError("absolute_tolerance_bits must be positive")
    tolerance = RationalEndpoint(1, 2**tolerance_bits)
    history: list[int] = []
    determinant_widths: list[RationalEndpoint] = []
    if unit_rank == 0:
        return RegulatorEnclosure(
            RealBall(1, precision_bits=precision),
            0,
            [precision],
            weighted_complex_places=True,
            determinant_widths=[RationalEndpoint(0)],
        )
    refined_rows: list[list[RealBall]] | None = None
    while precision <= maximum_precision:
        history.append(precision)
        raw_rows: Sequence[Sequence[Any]]
        if callable(logarithms):
            provider: Any = logarithms
            raw_rows = provider(precision)
        else:
            raw_rows = logarithms
        if len(raw_rows) != unit_rank:
            raise ValueError("the logarithm matrix must have one row per free unit")
        rows: list[list[RealBall]] = []
        for raw_row in raw_rows:
            if len(raw_row) < unit_rank:
                raise ValueError("the logarithm matrix has too few archimedean columns")
            row = [
                _ball(raw_row[column], precision_bits=precision, rigorous=True)
                for column in range(unit_rank)
            ]
            if not all(entry.rigorous for entry in row):
                raise AnalyticCertificationError(
                    "a midpoint-only logarithm cannot certify a regulator"
                )
            if any(entry.precision_bits < precision for entry in row):
                raise AnalyticPrecisionError(
                    "a logarithm provider returned less than the requested precision"
                )
            rows.append(row)
        if refined_rows is not None:
            rows = [
                [
                    refined_rows[row][column].intersection(rows[row][column])
                    for column in range(unit_rank)
                ]
                for row in range(unit_rank)
            ]
        refined_rows = rows
        determinant = _determinant_ball(rows).absolute_value()
        determinant_widths.append(determinant.width())
        if not determinant.contains_zero() and determinant.radius() <= tolerance:
            return RegulatorEnclosure(
                determinant,
                unit_rank,
                history,
                weighted_complex_places=True,
                determinant_widths=determinant_widths,
            )
        if not callable(logarithms):
            raise AnalyticPrecisionError(
                "the supplied logarithm balls do not certify rank and tolerance"
            )
        precision *= 2
    raise AnalyticPrecisionError("regulator enclosure exceeded maximum_precision_bits")


def regulator_from_factored_units(
    units: Sequence[Any],
    *,
    unit_rank: int,
    precision_bits: int = 100,
    absolute_tolerance_bits: int = 64,
    maximum_precision_bits: int = 4096,
) -> RegulatorEnclosure:
    """Use factored elements' weighted archimedean-logarithm provider."""

    def logarithms(precision: int) -> Sequence[Sequence[Any]]:
        rows = []
        for unit in units:
            provider = getattr(unit, "archimedean_logarithms", None)
            if not callable(provider):
                raise TypeError("a factored unit needs archimedean_logarithms(prec)")
            rows.append(provider(precision))
        return rows

    return certified_regulator_enclosure(
        logarithms,
        unit_rank,
        precision_bits=precision_bits,
        absolute_tolerance_bits=absolute_tolerance_bits,
        maximum_precision_bits=maximum_precision_bits,
    )


class ZetaLogResidueLimits:
    """Deterministic resource caps for the Belabas--Friedman prime sum."""

    def __init__(
        self,
        *,
        maximum_prime_bound: int = 1_000_000,
        maximum_degree: int = 64,
        splitting_block_size: int = 4096,
        maximum_precision_bits: int = 4096,
    ) -> None:
        if min(maximum_prime_bound, maximum_degree, splitting_block_size) < 2:
            raise ValueError("zeta residue resource limits must be at least two")
        self.maximum_prime_bound = int(maximum_prime_bound)
        self.maximum_degree = int(maximum_degree)
        self.splitting_block_size = int(splitting_block_size)
        self.maximum_precision_bits = int(maximum_precision_bits)


def _is_prime(value: int) -> bool:
    value = int(value)
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


def _primes_below(bound: int) -> list[int]:
    if bound <= 2:
        return []
    sieve = bytearray(b"\x01") * bound
    sieve[0:2] = b"\x00\x00"
    prime = 2
    while prime * prime < bound:
        if sieve[prime]:
            start = prime * prime
            sieve[start:bound:prime] = b"\x00" * (((bound - 1 - start) // prime) + 1)
        prime += 1
    return [value for value in range(2, bound) if sieve[value]]


def _factor_pair(value: Any) -> tuple[int, int]:
    if isinstance(value, dict):
        ramification = int(value.get("e", value.get("ramification_index", 0)))
        residue_degree = int(value.get("f", value.get("residue_degree", 0)))
    else:
        ramification = int(value[0])
        residue_degree = int(value[1])
    if ramification < 1 or residue_degree < 1:
        raise ValueError("splitting factors need positive e and f")
    return ramification, residue_degree


def _splitting_record(
    value: Any, degree: int
) -> tuple[int, tuple[tuple[int, int], ...]]:
    if isinstance(value, dict):
        prime = int(value.get("prime", value.get("p", 0)))
        raw_factors = value.get("factors", ())
    else:
        prime = int(getattr(value, "prime", getattr(value, "p", 0)))
        raw_factors = getattr(value, "factors", ())
    factors = tuple(_factor_pair(factor) for factor in raw_factors)
    if not _is_prime(prime):
        raise ValueError("a splitting record needs a rational prime")
    if sum(e * f for e, f in factors) != degree:
        raise ValueError("splitting record violates the local degree identity")
    return prime, factors


def _same_provider(left: Any, right: Any) -> bool:
    if left is right:
        return True
    left_function = getattr(left, "__func__", None)
    return (
        left_function is not None
        and left_function is getattr(right, "__func__", None)
        and getattr(left, "__self__", None) is getattr(right, "__self__", None)
    )


class _BFPrimePowerPlan:
    """Exact aggregation plan for one Belabas--Friedman cutoff."""

    def __init__(
        self,
        threshold: int,
        terms: Sequence[tuple[int, int, int, int]],
        raw_terms: int,
    ) -> None:
        self.threshold = int(threshold)
        self.terms = tuple(terms)
        self.raw_terms = int(raw_terms)
        self.aggregated_terms = len(self.terms)


def _build_bf_plan(
    threshold: int,
    splitting: dict[int, tuple[tuple[int, int], ...]],
) -> _BFPrimePowerPlan:
    ninth = threshold // 9
    aggregated: dict[tuple[int, int, int], int] = {}
    raw_terms = 0

    def add(sign: int, scale: int, norm: int, exponent: int) -> None:
        nonlocal raw_terms
        raw_terms += 1
        key = (scale, norm, exponent)
        aggregated[key] = aggregated.get(key, 0) + sign

    for prime, factors in splitting.items():
        for exponent in range(1, _max_power_strict(prime, threshold) + 1):
            add(-1, 0, prime, exponent)
        for _ramification, residue_degree in factors:
            norm = prime**residue_degree
            for exponent in range(1, _max_power_strict(norm, threshold) + 1):
                add(1, 0, norm, exponent)
        if prime < ninth:
            for exponent in range(1, _max_power_strict(prime, ninth) + 1):
                add(1, 1, prime, exponent)
            for _ramification, residue_degree in factors:
                norm = prime**residue_degree
                for exponent in range(1, _max_power_strict(norm, ninth) + 1):
                    add(-1, 1, norm, exponent)
    terms = [
        (multiplicity, scale, norm, exponent)
        for (scale, norm, exponent), multiplicity in sorted(aggregated.items())
        if multiplicity
    ]
    return _BFPrimePowerPlan(threshold, terms, raw_terms)


class ZetaLogResidueWorkspace:
    """Reusable exact splitting records and prime-power plans for one field.

    The cache is explicit so proof data cannot leak between fields. Extending
    a cutoff asks the provider only for the uncovered tail, while every new
    block is checked for complete prime coverage and local degree identities.
    """

    def __init__(
        self,
        discriminant: int,
        degree: int,
        splitting_provider: Callable[[int, int], Iterable[Any]],
    ) -> None:
        discriminant = int(discriminant)
        degree = int(degree)
        if abs(discriminant) <= 1:
            raise ValueError("a zeta workspace requires a field discriminant")
        if degree <= 1:
            raise ValueError("a zeta workspace requires degree greater than one")
        if not callable(splitting_provider):
            raise TypeError("splitting_provider must be callable")
        self.discriminant = discriminant
        self.degree = degree
        self.splitting_provider = splitting_provider
        self.covered_stop = 2
        self.provider_calls = 0
        self.records_decoded = 0
        self.splitting_cache_hits = 0
        self.plan_cache_hits = 0
        self.threshold_cache_hits = 0
        self.finite_term_cache_hits = 0
        self._records: dict[int, tuple[tuple[int, int], ...]] = {}
        self._plans: dict[int, _BFPrimePowerPlan] = {}
        self._thresholds: dict[tuple[str, int], tuple[int, RealBall, int]] = {}
        self._finite_terms: dict[tuple[int, int], tuple[RealBall, dict[str, int]]] = {}

    def require_field(
        self,
        discriminant: int,
        degree: int,
        provider: Callable[[int, int], Iterable[Any]],
    ) -> None:
        if self.discriminant != int(discriminant) or self.degree != int(degree):
            raise AnalyticCertificationError(
                "a zeta workspace cannot be reused for a different field"
            )
        if not _same_provider(self.splitting_provider, provider):
            raise AnalyticCertificationError(
                "a zeta workspace cannot use a different splitting provider"
            )

    def splitting_types(
        self, primes: Sequence[int], block_size: int
    ) -> dict[int, tuple[tuple[int, int], ...]]:
        if not primes:
            return {}
        final = primes[-1] + 1
        if final <= self.covered_stop:
            self.splitting_cache_hits += 1
        while self.covered_stop < final:
            start = self.covered_stop
            stop = min(final, start + block_size)
            expected = {prime for prime in primes if start <= prime < stop}
            block: dict[int, tuple[tuple[int, int], ...]] = {}
            self.provider_calls += 1
            for raw_record in self.splitting_provider(start, stop):
                prime, factors = _splitting_record(raw_record, self.degree)
                if prime < start or prime >= stop:
                    raise ValueError(
                        "splitting provider returned a prime outside its block"
                    )
                if prime in block or prime in self._records:
                    raise ValueError("splitting provider returned a duplicate prime")
                block[prime] = factors
                self.records_decoded += 1
            missing = expected - set(block)
            if missing:
                raise AnalyticCertificationError(
                    "splitting provider omitted rational prime " + str(min(missing))
                )
            unexpected = set(block) - expected
            if unexpected:
                raise ValueError(
                    "splitting provider returned a composite or out-of-range entry"
                )
            self._records.update(block)
            self.covered_stop = stop
        return {prime: self._records[prime] for prime in primes}

    def prime_power_plan(
        self,
        threshold: int,
        splitting: dict[int, tuple[tuple[int, int], ...]],
    ) -> _BFPrimePowerPlan:
        cached = self._plans.get(threshold)
        if cached is not None:
            self.plan_cache_hits += 1
            return cached
        plan = _build_bf_plan(threshold, splitting)
        self._plans[threshold] = plan
        return plan

    def threshold(
        self,
        target: RationalEndpoint,
        precision: int,
        maximum: int,
    ) -> tuple[int, RealBall, int]:
        key = (str(target), int(precision))
        cached = self._thresholds.get(key)
        if cached is not None:
            if cached[0] > maximum:
                raise AnalyticResourceError(
                    "cached Belabas--Friedman threshold exceeds maximum_prime_bound"
                )
            self.threshold_cache_hits += 1
            return cached[0], cached[1], 0
        model = _BFErrorModel(
            self.discriminant, self.degree, IntervalBallField(precision)
        )
        threshold, bound = _bf_threshold(model, target, maximum)
        result = (threshold, bound, model.evaluations)
        self._thresholds[key] = result
        return result

    def finite_term(
        self, plan: _BFPrimePowerPlan, precision: int
    ) -> tuple[RealBall, dict[str, int]]:
        key = (plan.threshold, int(precision))
        cached = self._finite_terms.get(key)
        if cached is not None:
            self.finite_term_cache_hits += 1
            return cached[0], {
                "log_evaluations": 0,
                "log_cache_hits": 0,
                "sqrt_evaluations": 0,
                "sqrt_cache_hits": 0,
            }
        field = IntervalBallField(precision)
        result = (_bf_finite_term(plan, field), field.diagnostics())
        self._finite_terms[key] = result
        return result


class _BFErrorModel:
    """Precision-local constants for the explicit residue error bound."""

    def __init__(
        self, discriminant: int, degree: int, field: IntervalBallField
    ) -> None:
        self.degree = int(degree)
        self.field = field
        self.log_discriminant = field.log_integer(abs(int(discriminant)))
        self.sqrt_log_discriminant = field.sqrt(self.log_discriminant)
        self.evaluations = 0

    def bound(self, threshold: int) -> RealBall:
        self.evaluations += 1
        field = self.field
        sqrt_threshold = field.sqrt_integer(threshold)
        log_three_threshold = field.log_integer(3 * threshold)
        log_threshold_ninth = field.log_integer(threshold // 9)
        c1 = RealBall("2.324", precision_bits=field.precision_bits)
        c2 = RealBall("3.88", precision_bits=field.precision_bits)
        c4 = RealBall("4.26", precision_bits=field.precision_bits)
        one = RealBall(1, precision_bits=field.precision_bits)
        two = RealBall(2, precision_bits=field.precision_bits)
        a1 = c1 * self.log_discriminant / (sqrt_threshold * log_three_threshold)
        a2 = one + c2 / log_threshold_ninth
        a3 = one + two / self.sqrt_log_discriminant
        a4 = (
            c4
            * RealBall(self.degree - 1, precision_bits=field.precision_bits)
            / (sqrt_threshold * self.log_discriminant)
        )
        return a1 * (a2 * (a3**2) + a4)


def _bf_threshold(
    model: _BFErrorModel,
    target: RationalEndpoint,
    maximum: int,
) -> tuple[int, RealBall]:
    threshold = 72
    bound = model.bound(threshold)
    while not bound.upper < target:
        threshold *= 2
        threshold += (-threshold) % 9
        if threshold > maximum:
            raise AnalyticResourceError(
                "Belabas--Friedman threshold exceeds maximum_prime_bound"
            )
        bound = model.bound(threshold)
    lower = max(8, (threshold // 2) // 9)
    upper = threshold // 9
    while upper - lower > 1:
        middle = (lower + upper) // 2
        candidate = 9 * middle
        candidate_bound = model.bound(candidate)
        if candidate_bound.upper < target:
            upper = middle
            bound = candidate_bound
        else:
            lower = middle
    threshold = 9 * upper
    bound = model.bound(threshold)
    return threshold, bound


def _max_power_strict(base: int, bound: int) -> int:
    exponent = 0
    power = 1
    while power <= (bound - 1) // base:
        power *= base
        exponent += 1
    return exponent


def _bf_prime_power_summand(
    norm: int,
    exponent: int,
    scale: RealBall,
    field: IntervalBallField,
    log_cache: dict[int, RealBall],
    sqrt_cache: dict[int, RealBall],
) -> RealBall:
    denominator = exponent * (norm**exponent)
    first = scale / RealBall(denominator, precision_bits=field.precision_bits)
    logarithm = log_cache.get(norm)
    if logarithm is None:
        logarithm = field.log_integer(norm)
        log_cache[norm] = logarithm
    if exponent % 2 == 0:
        half_power = RealBall(
            norm ** (exponent // 2), precision_bits=field.precision_bits
        )
    else:
        root = sqrt_cache.get(norm)
        if root is None:
            root = field.sqrt_integer(norm)
            sqrt_cache[norm] = root
        half_power = (
            RealBall(norm ** (exponent // 2), precision_bits=field.precision_bits)
            * root
        )
    return first - logarithm / half_power


def _bf_finite_term(
    plan: _BFPrimePowerPlan,
    field: IntervalBallField,
) -> RealBall:
    threshold = plan.threshold
    ninth = threshold // 9
    sqrt_threshold = field.sqrt_integer(threshold)
    sqrt_ninth = field.sqrt_integer(ninth)
    scale = sqrt_threshold * field.log_integer(threshold)
    scale_ninth = sqrt_ninth * field.log_integer(ninth)
    total = RealBall(0, precision_bits=field.precision_bits)
    log_cache: dict[int, RealBall] = {}
    sqrt_cache: dict[int, RealBall] = {}
    scales = (scale, scale_ninth)
    for multiplicity, scale_index, norm, exponent in plan.terms:
        summand = _bf_prime_power_summand(
            norm,
            exponent,
            scales[scale_index],
            field,
            log_cache,
            sqrt_cache,
        )
        if multiplicity != 1:
            summand = summand * RealBall(
                multiplicity, precision_bits=field.precision_bits
            )
        total = total + summand
    multiplier = RealBall(3, precision_bits=field.precision_bits) / (
        RealBall(2, precision_bits=field.precision_bits)
        * sqrt_threshold
        * field.log_integer(3 * threshold)
    )
    return multiplier * total


class ZetaLogResidueEnclosure:
    """Belabas--Friedman log-residue enclosure with separated tail evidence."""

    def __init__(
        self,
        ball: RealBall,
        finite_term: RealBall,
        tail_bound: RealBall,
        *,
        discriminant: int,
        degree: int,
        threshold: int,
        precision_history: Sequence[int],
        rational_primes: int,
        prime_power_terms: int,
        aggregated_prime_power_terms: int,
        diagnostics: dict[str, Any],
        enclosure_widths: Sequence[RationalEndpoint],
    ) -> None:
        self.ball = ball
        self.finite_term = finite_term
        self.tail_bound = tail_bound
        self.discriminant = int(discriminant)
        self.degree = int(degree)
        self.threshold = int(threshold)
        self.precision_history = tuple(int(value) for value in precision_history)
        self.rational_primes = int(rational_primes)
        self.prime_power_terms = int(prime_power_terms)
        self.aggregated_prime_power_terms = int(aggregated_prime_power_terms)
        self.diagnostics = dict(diagnostics)
        self.enclosure_widths = tuple(enclosure_widths)
        self.refinement_attempts = len(self.precision_history)
        self.rigorous = ball.rigorous and tail_bound.rigorous
        self.status = "rigorous-enclosure" if self.rigorous else "heuristic"
        self.proof_status = (
            "belabas-friedman-complete-tail-and-directed-rounding"
            if self.rigorous
            else "zeta-log-residue-not-certified"
        )

    @property
    def lower(self) -> RationalEndpoint:
        return self.ball.lower

    @property
    def upper(self) -> RationalEndpoint:
        return self.ball.upper

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.zeta-log-residue.v1",
            "ball": self.ball.to_dict(),
            "finite_term": self.finite_term.to_dict(),
            "analytic_tail_bound": self.tail_bound.to_dict(),
            "discriminant": self.discriminant,
            "degree": self.degree,
            "threshold": self.threshold,
            "precision_history": list(self.precision_history),
            "rational_primes": self.rational_primes,
            "prime_power_terms": self.prime_power_terms,
            "aggregated_prime_power_terms": self.aggregated_prime_power_terms,
            "enclosure_widths": [str(value) for value in self.enclosure_widths],
            "refinement_attempts": self.refinement_attempts,
            "diagnostics": dict(self.diagnostics),
            "rigorous": self.rigorous,
            "status": self.status,
            "proof_status": self.proof_status,
        }


def zeta_log_residue_bound(
    discriminant: int,
    degree: int,
    splitting_provider: Callable[[int, int], Iterable[Any]],
    *,
    absolute_error: Any = "0.125",
    precision_bits: int = 128,
    limits: ZetaLogResidueLimits | None = None,
    workspace: ZetaLogResidueWorkspace | None = None,
) -> ZetaLogResidueEnclosure:
    """Rigorously enclose `log(Res_{s=1} zeta_K(s))`.

    The splitting provider must return every exact decomposition type in each
    requested half-open rational-prime interval.  Arithmetic rounding and the
    Belabas--Friedman omitted-prime term are both included in the result.
    """
    discriminant = int(discriminant)
    degree = int(degree)
    if degree <= 1:
        raise ValueError("the Belabas--Friedman method requires degree > 1")
    resource_limits = limits if limits is not None else ZetaLogResidueLimits()
    if degree > resource_limits.maximum_degree:
        raise AnalyticResourceError("number-field degree exceeds the zeta residue cap")
    if abs(discriminant) <= 1:
        raise ValueError("a number-field discriminant must have absolute value > 1")
    requested_error = _endpoint(absolute_error, rigorous=True)
    if requested_error <= RationalEndpoint(0):
        raise ValueError("absolute_error must be positive")
    precision = int(precision_bits)
    if precision < 16:
        raise ValueError("zeta residue precision must be at least 16 bits")
    if resource_limits.maximum_precision_bits < precision:
        raise ValueError("maximum_precision_bits is below the initial precision")
    selected_workspace = (
        ZetaLogResidueWorkspace(discriminant, degree, splitting_provider)
        if workspace is None
        else workspace
    )
    selected_workspace.require_field(discriminant, degree, splitting_provider)
    initial_provider_calls = selected_workspace.provider_calls
    initial_splitting_hits = selected_workspace.splitting_cache_hits
    initial_plan_hits = selected_workspace.plan_cache_hits
    initial_threshold_hits = selected_workspace.threshold_cache_hits
    initial_finite_hits = selected_workspace.finite_term_cache_hits
    history: list[int] = []
    enclosure_widths: list[RationalEndpoint] = []
    accumulated: RealBall | None = None
    primes: list[int] = []
    threshold = 0
    tail = RealBall(0)
    plan = _BFPrimePowerPlan(0, (), 0)
    threshold_evaluations = 0
    interval_diagnostics: dict[str, int] = {}
    while precision <= resource_limits.maximum_precision_bits:
        history.append(precision)
        threshold, tail, evaluations = selected_workspace.threshold(
            requested_error / RationalEndpoint(2),
            precision,
            resource_limits.maximum_prime_bound,
        )
        threshold_evaluations += evaluations
        primes = _primes_below(threshold)
        splitting = selected_workspace.splitting_types(
            primes, resource_limits.splitting_block_size
        )
        plan = selected_workspace.prime_power_plan(threshold, splitting)
        finite, interval_diagnostics = selected_workspace.finite_term(plan, precision)
        answer = finite.add_error(tail.upper)
        accumulated = (
            answer if accumulated is None else accumulated.intersection(answer)
        )
        enclosure_widths.append(accumulated.width())
        if accumulated.radius() <= requested_error:
            diagnostics: dict[str, Any] = {
                "provider_calls": (
                    selected_workspace.provider_calls - initial_provider_calls
                ),
                "splitting_cache_hits": (
                    selected_workspace.splitting_cache_hits - initial_splitting_hits
                ),
                "prime_power_plan_cache_hits": (
                    selected_workspace.plan_cache_hits - initial_plan_hits
                ),
                "threshold_cache_hits": (
                    selected_workspace.threshold_cache_hits - initial_threshold_hits
                ),
                "finite_term_cache_hits": (
                    selected_workspace.finite_term_cache_hits - initial_finite_hits
                ),
                "threshold_bound_evaluations": threshold_evaluations,
                **interval_diagnostics,
            }
            return ZetaLogResidueEnclosure(
                accumulated,
                finite,
                tail,
                discriminant=discriminant,
                degree=degree,
                threshold=threshold,
                precision_history=history,
                rational_primes=len(primes),
                prime_power_terms=plan.raw_terms,
                aggregated_prime_power_terms=plan.aggregated_terms,
                diagnostics=diagnostics,
                enclosure_widths=enclosure_widths,
            )
        precision *= 2
    raise AnalyticPrecisionError(
        "zeta log-residue enclosure exceeded maximum_precision_bits"
    )


class HRIndexValidationResult:
    """A rigorous integer interval for the missing class/unit lattice index."""

    def __init__(
        self,
        log_index_ball: RealBall,
        index_ball: RealBall,
        *,
        lower_index: int,
        upper_index: int,
        rigorous: bool,
        algebraic_log_hr: RealBall,
        analytic_log_residue: RealBall,
    ) -> None:
        self.log_index_ball = log_index_ball
        self.index_ball = index_ball
        self.lower_index = int(lower_index)
        self.upper_index = int(upper_index)
        self.unique_index = (
            self.lower_index if self.lower_index == self.upper_index else None
        )
        self.index_one = self.unique_index == 1 and rigorous
        self.rigorous = bool(rigorous)
        self.algebraic_log_hr = algebraic_log_hr
        self.analytic_log_residue = analytic_log_residue
        self.status = (
            "rigorous-index-bound" if rigorous else "heuristic-index-diagnostic"
        )
        self.proof_status = (
            "rigorous-hr-index-one"
            if self.index_one
            else (
                "rigorous-hr-index-interval"
                if rigorous
                else "hr-index-inputs-not-certified"
            )
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.hr-index-validation.v1",
            "log_index_ball": self.log_index_ball.to_dict(),
            "index_ball": self.index_ball.to_dict(),
            "lower_index": self.lower_index,
            "upper_index": self.upper_index,
            "unique_index": self.unique_index,
            "index_one": self.index_one,
            "rigorous": self.rigorous,
            "status": self.status,
            "proof_status": self.proof_status,
        }


def validate_hr_index(
    *,
    signature: tuple[int, int],
    discriminant: int,
    class_number: int,
    roots_of_unity: int,
    regulator: RegulatorEnclosure | RealBall,
    zeta_log_residue: ZetaLogResidueEnclosure | RealBall,
    precision_bits: int = 128,
) -> HRIndexValidationResult:
    """Compare tentative `h*R` with the analytic formula and bound its index."""
    r1, r2 = int(signature[0]), int(signature[1])
    discriminant = int(discriminant)
    class_number = int(class_number)
    roots_of_unity = int(roots_of_unity)
    if r1 < 0 or r2 < 0 or class_number < 1 or roots_of_unity < 1:
        raise ValueError("signature, class number, and torsion order are invalid")
    if abs(discriminant) <= 1:
        raise ValueError("discriminant must have absolute value > 1")
    regulator_ball = (
        regulator.ball if isinstance(regulator, RegulatorEnclosure) else regulator
    )
    residue_ball = (
        zeta_log_residue.ball
        if isinstance(zeta_log_residue, ZetaLogResidueEnclosure)
        else zeta_log_residue
    )
    if not regulator_ball.is_positive():
        raise AnalyticCertificationError("the regulator ball must be provably positive")
    field = IntervalBallField(int(precision_bits))
    log_two = field.log_integer(2)
    log_prefactor = (
        RealBall(r1, precision_bits=precision_bits) * log_two
        + RealBall(r2, precision_bits=precision_bits)
        * (log_two + field.log(field.pi()))
        - field.log_integer(roots_of_unity)
        - field.log_integer(abs(discriminant))
        / RealBall(2, precision_bits=precision_bits)
    )
    algebraic = (
        log_prefactor + field.log_integer(class_number) + field.log(regulator_ball)
    )
    log_index = algebraic - residue_ball
    index_ball = field.exp(log_index)
    lower_index = max(1, index_ball.lower.ceil())
    upper_index = index_ball.upper.floor()
    if upper_index < lower_index:
        raise AnalyticCertificationError(
            "the algebraic and analytic hR enclosures contain no positive integer index"
        )
    rigorous = regulator_ball.rigorous and residue_ball.rigorous and index_ball.rigorous
    return HRIndexValidationResult(
        log_index,
        index_ball,
        lower_index=lower_index,
        upper_index=upper_index,
        rigorous=rigorous,
        algebraic_log_hr=algebraic,
        analytic_log_residue=residue_ball,
    )


__all__ = [
    "AnalyticCertificationError",
    "AnalyticPrecisionError",
    "AnalyticResourceError",
    "HRIndexValidationResult",
    "IntervalBallField",
    "RationalEndpoint",
    "RealBall",
    "RegulatorEnclosure",
    "UnitLatticeError",
    "UnitLatticeExtractionResult",
    "UnitSaturationEvidence",
    "UnitSaturationResult",
    "ZetaLogResidueEnclosure",
    "ZetaLogResidueLimits",
    "ZetaLogResidueWorkspace",
    "certified_regulator_enclosure",
    "extract_unit_lattice",
    "regulator_from_factored_units",
    "validate_hr_index",
    "validate_unit_saturation",
    "zeta_log_residue_bound",
]
