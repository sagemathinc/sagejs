"""Certified reference heights on odd-degree genus-2 Jacobians over `QQ`.

The production envelope in this module is intentionally explicit.

* Exact Flynn quartic Kummer duplication supports every checked
  odd-degree genus-2 Mumford divisor over `QQ`, including generalized
  equations `y^2 + h*y = f`.
* A factorization-free modular-gcd finite local-correction engine and a
  normalized outward-rounded real-ball correction iteration implement the
  practical Müller--Stoll path for primitive integral classical quintics.
* An automatic, conservative, proved height-difference enclosure is supplied
  for primitive integral classical quintics `y^2=f(x)`.  It combines Stoll's
  root-partition bound at infinity with an audited coefficient bound for the
  classical Flynn duplication quartics.
* Other checked odd-degree models retain a source-transparent repeated-
  doubling reference path. A caller-supplied absolute bound is retained as
  an explicit unverified assumption and never promoted to rigorous output.

Generalized `h` models use exact direct Kummer quartics but remain a clearly
labelled numerical reference; a supplied global height-difference assumption
produces only a conditional enclosure. Even-degree transformations are not
inferred.

The production real-place iterator projectively normalizes after every step,
so it retains four bounded-size balls rather than exponentially growing exact
coordinates.  The exact path remains available as a deliberately guarded
small-step differential oracle.
"""

from __future__ import annotations

from time import perf_counter
from typing import Any, cast

from sagejs.hyperelliptic_curves.genus2_kummer import (
    KummerCoordinates,
    classical_duplication_l1_bound,
    classical_duplication_specialized_terms,
    divisor_provenance,
    exact_divisor_capability,
    exact_model_capability,
    kummer_coordinates,
)
from sagejs.hyperelliptic_curves.genus2_kummer_height_kernel import (
    dyadic_kummer_height_recurrence,
    dyadic_kummer_height_recurrence_batch,
    dyadic_log_interval_batch,
    exact_kummer_small_step_batch,
    modular_kummer_height_recurrence,
    modular_kummer_height_recurrence_batch,
)
from sagejs.native import (
    integer_buffer_values,
    is_compiled,
    kernel_integer_buffer,
    kernel_integer_zeros,
    kernel_uint64_buffer,
)
from sagejs.number_fields.class_unit_analytic import IntervalBallField, RealBall

try:
    import sagejs.runtime as _runtime
except ImportError:
    _runtime = None


def _host_buffer_length(value: int) -> int:
    if _runtime is None:
        return int(value)
    return _runtime.number(value)


def _copy_data(value: Any) -> Any:
    """Return a defensive copy of a JSON-like diagnostic record."""
    if isinstance(value, _FrozenDict):
        return {key: _copy_data(entry) for key, entry in value.items()}
    if isinstance(value, _EncodedFrozenDict):
        return {key: _copy_data(entry) for key, entry in value.items()}
    if isinstance(value, dict):
        return {key: _copy_data(entry) for key, entry in value.items()}
    if isinstance(value, tuple):
        return tuple(_copy_data(entry) for entry in value)
    if isinstance(value, list):
        return [_copy_data(entry) for entry in value]
    return value


def _same_ball(left: RealBall, right: RealBall) -> bool:
    return (
        left.lower == right.lower
        and left.upper == right.upper
        and left.rigorous == right.rigorous
        and left.precision_bits == right.precision_bits
    )


def _enclosure_width_bits(value: RealBall) -> int:
    """Return the largest `b` with interval width at most `2^-b`."""
    width = value.width()
    numerator = int(width.numerator)
    denominator = int(width.denominator)
    if numerator == 0:
        return value.precision_bits
    if numerator > denominator:
        return -1
    bits = 0
    while 2 * numerator <= denominator:
        numerator *= 2
        bits += 1
    return bits


class _SealedRecord:
    """Reject ordinary mutation after construction, including private fields."""

    def __setattr__(self, name: str, value: Any) -> None:
        if getattr(self, "_record_sealed", False):
            raise AttributeError(type(self).__name__ + " is immutable")
        object.__setattr__(self, name, value)

    def _seal(self) -> None:
        object.__setattr__(self, "_record_sealed", True)


class _FrozenDict(_SealedRecord):
    """Small source-transparent immutable mapping for private proof records."""

    def __init__(self, data: dict[str, Any]) -> None:
        self._items = tuple((key, _freeze_data(value)) for key, value in data.items())
        self._seal()

    def __getitem__(self, key: str) -> Any:
        for stored_key, value in self._items:
            if stored_key == key:
                return value
        raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default

    def __setitem__(self, key: str, value: Any) -> None:
        raise TypeError("an immutable proof record cannot be modified")

    def __delitem__(self, key: str) -> None:
        raise TypeError("an immutable proof record cannot be modified")

    def __eq__(self, other: object) -> bool:
        if isinstance(other, _FrozenDict):
            return self._items == other._items
        if isinstance(other, dict):
            return _copy_data(self) == other
        return False

    def items(self) -> tuple[tuple[str, Any], ...]:
        return self._items


class _EncodedFrozenDict(_SealedRecord):
    """Immutable dictionary backed by detached tuple/scalar-only data."""

    def __init__(self, encoded_items: tuple[Any, ...]) -> None:
        self._encoded_items = encoded_items
        self._seal()

    def __getitem__(self, key: str) -> Any:
        for stored_key, value in self._encoded_items:
            if stored_key == key:
                return _decode_data(value)
        raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default

    def items(self) -> tuple[tuple[str, Any], ...]:
        return tuple((key, _decode_data(value)) for key, value in self._encoded_items)


def _encode_data(
    value: Any,
    _encoded_type: Any = _EncodedFrozenDict,
    _frozen_type: Any = _FrozenDict,
) -> Any:
    """Detach JSON-like data into recursively immutable primitive tuples."""

    def encode(entry: Any) -> Any:
        if isinstance(entry, _encoded_type):
            return ("dict", entry._encoded_items)
        if isinstance(entry, _frozen_type):
            return (
                "dict",
                tuple((key, encode(item)) for key, item in entry.items()),
            )
        if isinstance(entry, dict):
            return (
                "dict",
                tuple((key, encode(item)) for key, item in entry.items()),
            )
        if isinstance(entry, (tuple, list)):
            return ("tuple", tuple(encode(item) for item in entry))
        return ("scalar", entry)

    return encode(value)


def _decode_data(value: Any) -> Any:
    def decode(entry: Any) -> Any:
        kind, payload = entry
        if kind == "dict":
            return {key: decode(item) for key, item in payload}
        if kind == "tuple":
            return tuple(decode(item) for item in payload)
        return payload

    return decode(value)


def _ball_data(
    value: RealBall, _data_encoder: Any = _encode_data
) -> tuple[Any, Any, int, bool, Any]:
    """Store a ball as immutable exact endpoints and proof metadata."""
    return (
        (int(value.lower.numerator), int(value.lower.denominator)),
        (int(value.upper.numerator), int(value.upper.denominator)),
        int(value.precision_bits),
        bool(value.rigorous),
        _data_encoder(value.source),
    )


def _ball_from_data(
    data: tuple[Any, Any, int, bool, Any],
    _ball_type: Any = RealBall,
    _data_decoder: Any = _decode_data,
) -> RealBall:
    return _ball_type(
        str(data[0][0]) + "/" + str(data[0][1]),
        str(data[1][0]) + "/" + str(data[1][1]),
        precision_bits=data[2],
        rigorous=data[3],
        source=_data_decoder(data[4]),
    )


def _closed_ball_property(data_attribute: str) -> Any:
    """Return a property whose decoder cannot be replaced through globals."""
    ball_decoder = _ball_from_data

    def decode_ball(value: Any) -> RealBall:
        return ball_decoder(getattr(value, data_attribute))

    return property(decode_ball)


def _closed_ball_matrix_property() -> Any:
    ball_decoder = _ball_from_data

    def decode_matrix(value: Any) -> tuple[tuple[RealBall, ...], ...]:
        return tuple(
            tuple(ball_decoder(entry) for entry in row) for row in value._matrix_data
        )

    return property(decode_matrix)


def _closed_ball_matrix_getitem() -> Any:
    ball_decoder = _ball_from_data

    def decode_row(value: Any, index: int) -> tuple[RealBall, ...]:
        return tuple(ball_decoder(entry) for entry in value._matrix_data[index])

    return decode_row


def _freeze_data(value: Any) -> Any:
    if isinstance(value, (_FrozenDict, _EncodedFrozenDict)):
        return value
    if isinstance(value, dict):
        return _FrozenDict(value)
    if isinstance(value, (tuple, list)):
        return tuple(_freeze_data(entry) for entry in value)
    return value


class Genus2HeightCapabilityError(NotImplementedError):
    """The requested rigorous height operation is outside its envelope."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self._diagnostics = _copy_data(diagnostics)

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))


class Genus2HeightResourceLimitError(RuntimeError):
    """Exact Kummer iteration would exceed its configured bit budget."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self._diagnostics = _copy_data(diagnostics)

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))


class Genus2HeightResolutionError(ArithmeticError):
    """A regulator or torsion claim was not certified by the available data."""

    def __init__(self, message: str, diagnostics: dict[str, Any]) -> None:
        super().__init__(message)
        self._diagnostics = _copy_data(diagnostics)

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))


def _gcd(left: int, right: int) -> int:
    left = abs(int(left))
    right = abs(int(right))
    while right:
        left, right = right, left % right
    return left


def _rational_pair(value: Any) -> tuple[int, int]:
    numerator_method = getattr(value, "numerator", None)
    denominator_method = getattr(value, "denominator", None)
    if callable(numerator_method) and callable(denominator_method):
        return int(str(numerator_method())), int(str(denominator_method()))
    if isinstance(value, int) and not isinstance(value, bool):
        return int(value), 1
    raise TypeError("an exact height bound must be rational")


def _exact_ball(value: Any, precision: int, source: str) -> RealBall:
    if isinstance(value, RealBall):
        if not value.rigorous:
            raise ValueError("a supplied bound must have certified exact endpoints")
        if value.lower < RealBall(0).lower:
            raise ValueError("a supplied absolute height bound must be nonnegative")
        return value
    numerator, denominator = _rational_pair(value)
    if denominator <= 0 or numerator < 0:
        raise ValueError("a supplied absolute height bound must be nonnegative")
    return RealBall(
        value,
        precision_bits=precision,
        rigorous=True,
        source=source,
    )


def _zero_ball(precision: int, source: str = "exact-zero") -> RealBall:
    return RealBall(0, precision_bits=precision, rigorous=True, source=source)


def _one_ball(precision: int, source: str = "exact-one") -> RealBall:
    return RealBall(1, precision_bits=precision, rigorous=True, source=source)


def _integer_coefficients(polynomial: Any, length: int) -> tuple[int, ...] | None:
    answer: list[int] = []
    zero = polynomial.parent().base_ring()(0)
    for index in range(length):
        value = polynomial[index] if index <= polynomial.degree() else zero
        numerator, denominator = _rational_pair(value)
        if denominator != 1:
            return None
        answer.append(numerator)
    return tuple(answer)


def _coefficient_size_bits_upper(polynomial: Any, length: int) -> int:
    """Return a cheap upper bound for numerator/denominator coefficient bits."""
    answer = 1
    zero = polynomial.parent().base_ring()(0)
    for index in range(length):
        value = polynomial[index] if index <= polynomial.degree() else zero
        numerator, denominator = _rational_pair(value)
        answer = max(
            answer,
            4 * len(str(abs(numerator))),
            4 * len(str(abs(denominator))),
        )
    return answer


def _coordinate_size_bits_upper(point: KummerCoordinates) -> int:
    """Return a decimal-length upper bound for primitive coordinate bits."""
    return max(
        1,
        max(4 * len(str(abs(value))) for value in point.coordinates()),
    )


def _ceil_div(numerator: int, denominator: int) -> int:
    """Return the exact ceiling of an integer quotient."""
    return -((-numerator) // denominator)


def _dyadic_multiply(
    left: tuple[int, int], right: tuple[int, int], scale: int
) -> tuple[int, int]:
    """Multiply two outward dyadic intervals with common denominator `scale`."""
    products = (
        left[0] * right[0],
        left[0] * right[1],
        left[1] * right[0],
        left[1] * right[1],
    )
    return min(products) // scale, _ceil_div(max(products), scale)


def _dyadic_power(value: tuple[int, int], exponent: int, scale: int) -> tuple[int, int]:
    """Raise a dyadic interval to a nonnegative integer power."""
    exponent = int(exponent)
    if exponent < 0:
        raise ValueError("a dyadic interval power must be nonnegative")
    answer = (scale, scale)
    base = value
    while exponent:
        if exponent & 1:
            answer = _dyadic_multiply(answer, base, scale)
        exponent //= 2
        if exponent:
            base = _dyadic_multiply(base, base, scale)
    return answer


def _dyadic_divide_positive(
    numerator: tuple[int, int], denominator: tuple[int, int], scale: int
) -> tuple[int, int]:
    """Divide by a strictly positive dyadic interval, rounding outwards."""
    denominator_lower, denominator_upper = denominator
    if denominator_lower <= 0:
        raise ZeroDivisionError("the dyadic denominator is not separated from zero")
    lower, upper = numerator
    if lower >= 0:
        return (
            (lower * scale) // denominator_upper,
            _ceil_div(upper * scale, denominator_lower),
        )
    if upper <= 0:
        return (
            (lower * scale) // denominator_lower,
            _ceil_div(upper * scale, denominator_upper),
        )
    return (
        (lower * scale) // denominator_lower,
        _ceil_div(upper * scale, denominator_lower),
    )


def _dyadic_max_absolute(
    values: tuple[tuple[int, int], ...],
) -> tuple[int, int]:
    """Enclose the maximum absolute value of dyadic numerator intervals."""
    absolute: list[tuple[int, int]] = []
    for lower, upper in values:
        if lower >= 0:
            absolute.append((lower, upper))
        elif upper <= 0:
            absolute.append((-upper, -lower))
        else:
            absolute.append((0, max(-lower, upper)))
    return (
        max(value[0] for value in absolute),
        max(value[1] for value in absolute),
    )


def _specialized_duplication_dyadic(
    coordinates: tuple[
        tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]
    ],
    terms: tuple[tuple[tuple[int, int, int, int, int], ...], ...],
    *,
    scale: int,
) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]]:
    """Evaluate specialized Flynn quartics on fixed-scale dyadic intervals."""

    powers: list[tuple[tuple[int, int], ...]] = []
    one = (scale, scale)
    for coordinate in coordinates:
        row = [one]
        for _exponent in range(4):
            row.append(_dyadic_multiply(row[-1], coordinate, scale))
        powers.append(tuple(row))

    output: list[tuple[int, int]] = []
    for table in terms:
        total = (0, 0)
        for coefficient, exponent1, exponent2, exponent3, exponent4 in table:
            value = (coefficient * scale, coefficient * scale)
            for index, exponent in enumerate(
                (exponent1, exponent2, exponent3, exponent4)
            ):
                if exponent:
                    value = _dyadic_multiply(value, powers[index][exponent], scale)
            total = (total[0] + value[0], total[1] + value[1])
        output.append(total)
    return cast(
        tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]],
        tuple(output),
    )


def _validated_specialized_terms(
    jacobian: Any,
    supplied: tuple[tuple[tuple[int, int, int, int, int], ...], ...] | None,
) -> tuple[tuple[tuple[int, int, int, int, int], ...], ...]:
    """Return the exact model tables, rejecting injected cached quartics."""
    expected = classical_duplication_specialized_terms(jacobian)
    if supplied is not None and supplied != expected:
        raise Genus2HeightCapabilityError(
            "specialized Flynn tables do not match the exact Jacobian model",
            {
                "specialized_quartics": "rejected-model-table-mismatch",
                "expected_term_counts": tuple(len(table) for table in expected),
                "supplied_term_counts": tuple(len(table) for table in supplied),
            },
        )
    return expected


def _flatten_specialized_terms(
    terms: tuple[tuple[tuple[int, int, int, int, int], ...], ...],
) -> tuple[list[int], list[int], list[int], int]:
    """Return sparse coefficients, exponents, row counts, and coefficient bits."""
    coefficients: list[int] = []
    exponents: list[int] = []
    term_counts: list[int] = []
    coefficient_bits = 1
    for table in terms:
        term_counts.append(len(table))
        for term in table:
            coefficient_bits = max(coefficient_bits, abs(term[0]).bit_length())
            coefficients.append(term[0])
            exponents.extend(term[1:])
    return coefficients, exponents, term_counts, coefficient_bits


def _validated_context_specialized_terms(context: Any) -> Any:
    """Replay specialization from the live model before trusting a context."""
    expected = classical_duplication_specialized_terms(context.jacobian)
    if context._classical_duplication_terms != expected:
        raise Genus2HeightCapabilityError(
            "cached Flynn tables do not match the exact Jacobian model",
            {"specialized_quartics": "rejected-mutated-height-context"},
        )
    return expected


def _scaled_tail_steps(bound: RealBall, target_bits: int) -> int:
    """Return `n` with `width(bound)/4^n <= 2^-target_bits`."""
    target_bits = int(target_bits)
    if target_bits < 0:
        raise ValueError("target height accuracy must be nonnegative")
    width = bound.width()
    numerator = int(width.numerator)
    denominator = int(width.denominator)
    steps = 0
    while numerator * (2**target_bits) > denominator * (4**steps):
        steps += 1
    return steps


class AutomaticHeightBounds(_SealedRecord):
    """A proved two-sided bound for the naive/canonical height correction."""

    def __init__(
        self,
        correction_lower: RealBall,
        correction_upper: RealBall,
        diagnostics: dict[str, Any],
        _ball_encoder: Any = _ball_data,
    ) -> None:
        self._correction_lower_data = _ball_encoder(correction_lower)
        self._correction_upper_data = _ball_encoder(correction_upper)
        self._diagnostics = _freeze_data(diagnostics)
        self._seal()

    correction_lower = _closed_ball_property("_correction_lower_data")
    correction_upper = _closed_ball_property("_correction_upper_data")

    @property
    def _correction_lower(self) -> RealBall:
        return self.correction_lower

    @property
    def _correction_upper(self) -> RealBall:
        return self.correction_upper

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))

    def copy(self) -> AutomaticHeightBounds:
        # A copy carries theorem data, not an authentication token.  The
        # closed proof-state wrapper below replays that data against the exact
        # live model before it can support a rigorous calculation.
        return type(self)(
            self.correction_lower,
            self.correction_upper,
            self.diagnostics,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-height-bounds.v1",
            "meaning": "correction_lower <= h_K(P)-hhat(P) <= correction_upper",
            "correction_lower": self._correction_lower.to_dict(),
            "correction_upper": self._correction_upper.to_dict(),
            "diagnostics": self.diagnostics,
        }

    def __repr__(self) -> str:
        return (
            "AutomaticHeightBounds(lower="
            + repr(self.correction_lower)
            + ", upper="
            + repr(self.correction_upper)
            + ")"
        )


class FiniteHeightCorrectionResult(_SealedRecord):
    """Certified factorization-free finite local-height correction."""

    def __init__(
        self,
        ball: RealBall,
        partial_sum: RealBall,
        tail_bound: RealBall,
        steps: int,
        diagnostics: dict[str, Any],
        _ball_encoder: Any = _ball_data,
    ) -> None:
        self._ball_data = _ball_encoder(ball)
        self._partial_sum_data = _ball_encoder(partial_sum)
        self._tail_bound_data = _ball_encoder(tail_bound)
        self._steps = int(steps)
        self._diagnostics = _freeze_data(diagnostics)
        self._rigorous = True
        self._seal()

    ball = _closed_ball_property("_ball_data")
    partial_sum = _closed_ball_property("_partial_sum_data")
    tail_bound = _closed_ball_property("_tail_bound_data")

    @property
    def _ball(self) -> RealBall:
        return self.ball

    @property
    def _partial_sum(self) -> RealBall:
        return self.partial_sum

    @property
    def _tail_bound(self) -> RealBall:
        return self.tail_bound

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))

    @property
    def steps(self) -> int:
        return self._steps

    @property
    def rigorous(self) -> bool:
        return self._rigorous

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-finite-height-correction.v1",
            "meaning": "sum_p mu_p(P)*log(p)",
            "algorithm": "mueller-stoll-proposition-14.1-factorization-free",
            "rigorous": True,
            "steps": self._steps,
            "enclosure": self._ball.to_dict(),
            "partial_sum": self._partial_sum.to_dict(),
            "tail_bound": self._tail_bound.to_dict(),
            "diagnostics": self.diagnostics,
        }

    def __repr__(self) -> str:
        return "FiniteHeightCorrectionResult(" + repr(self.ball) + ")"


class ArchimedeanHeightCorrectionResult(_SealedRecord):
    """Certified normalized real-place Kummer correction.

    The stored interval encloses `mu_infinity(P)`.  Every iterate is
    projectively normalized, so coordinate sizes remain bounded independently
    of the number of duplication steps.
    """

    def __init__(
        self,
        ball: RealBall,
        partial_sum: RealBall,
        tail_bound: RealBall,
        steps: int,
        diagnostics: dict[str, Any],
        _ball_encoder: Any = _ball_data,
    ) -> None:
        self._ball_data = _ball_encoder(ball)
        self._partial_sum_data = _ball_encoder(partial_sum)
        self._tail_bound_data = _ball_encoder(tail_bound)
        self._steps = int(steps)
        self._diagnostics = _freeze_data(diagnostics)
        self._seal()

    ball = _closed_ball_property("_ball_data")
    partial_sum = _closed_ball_property("_partial_sum_data")
    tail_bound = _closed_ball_property("_tail_bound_data")

    @property
    def steps(self) -> int:
        return self._steps

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))

    @property
    def rigorous(self) -> bool:
        return self.ball.rigorous

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-archimedean-height-correction.v1",
            "meaning": "mu_infinity(P)",
            "algorithm": "normalized-certified-real-kummer-iteration",
            "rigorous": self.rigorous,
            "steps": self.steps,
            "enclosure": self.ball.to_dict(),
            "partial_sum": self.partial_sum.to_dict(),
            "tail_bound": self.tail_bound.to_dict(),
            "diagnostics": self.diagnostics,
        }

    def __repr__(self) -> str:
        return "ArchimedeanHeightCorrectionResult(" + repr(self.ball) + ")"


def automatic_height_bounds(
    jacobian: Any, *, precision: int = 100
) -> AutomaticHeightBounds:
    """Return automatic certified bounds for a primitive integral quintic.

    The upper bound is Stoll's equation (7.1) / Mueller--Stoll Section 10
    root-partition bound, evaluated without approximate roots.  Cauchy's root
    radius and the discriminant identity give a proved lower bound for every
    cross-pair resultant.  All transcendental operations use outward-rounded
    interval logarithms.

    For the other direction, the checked-in sparse Flynn quartics are
    specialized to this exact model. The maximum L1 coefficient norm is
    computed without approximation. Telescoping then proves
    `h_K(P)-hhat(P) >= -log(A_delta)/3`.
    """
    precision = int(precision)
    if precision < 16:
        raise ValueError("height precision must be at least 16 bits")
    capability = exact_model_capability(jacobian)
    capability.require()
    f_value = jacobian.f()
    h_value = jacobian.h()
    diagnostics = dict(capability.diagnostics)
    diagnostics.update(
        {
            "schema": "sagejs.hyperelliptic.genus2-auto-height-bound.v1",
            "precision_bits": precision,
            "archimedean_method": ("stoll-root-partition-bound-with-cauchy-separation"),
            "duplication_coefficient_method": ("flynn-appendix-c-l1-monomial-audit"),
        }
    )
    if not h_value.is_zero():
        diagnostics["automatic_bound"] = "unsupported-generalized-h"
        raise Genus2HeightCapabilityError(
            "automatic certified height bounds currently require h=0",
            diagnostics,
        )
    if int(f_value.degree()) != 5:
        diagnostics["automatic_bound"] = "unsupported-nonquintic"
        raise Genus2HeightCapabilityError(
            "automatic certified height bounds currently require degree(f)=5",
            diagnostics,
        )
    coefficients = _integer_coefficients(f_value, 6)
    if coefficients is None:
        diagnostics["automatic_bound"] = "unsupported-rational-denominators"
        raise Genus2HeightCapabilityError(
            "automatic certified height bounds require an integral model",
            diagnostics,
        )
    content = 0
    for coefficient in coefficients:
        content = _gcd(content, coefficient)
    if content != 1:
        diagnostics["content"] = str(content)
        diagnostics["automatic_bound"] = "unsupported-nonprimitive-model"
        raise Genus2HeightCapabilityError(
            "automatic certified height bounds require primitive f",
            diagnostics,
        )
    discriminant = int(str(f_value.discriminant()))
    if discriminant == 0:
        diagnostics["automatic_bound"] = "singular-model"
        raise Genus2HeightCapabilityError(
            "a canonical height requires a squarefree quintic", diagnostics
        )

    field = IntervalBallField(precision)
    coefficient_height = max(abs(value) for value in coefficients)
    leading = abs(coefficients[5])
    root_radius = 1 + coefficient_height
    # Five finite roots give ten pairwise differences.  The discriminant
    # identity and the upper bound 2R on the other nine differences imply the
    # following lower bound on each individual separation.
    log_separation = (
        field.log_integer(abs(discriminant)) / RealBall(2)
        - field.log_integer(leading) * RealBall(4)
        - field.log_integer(2 * root_radius) * RealBall(9)
    )
    # Each 3+2 partition has six cross differences and leading coefficient^3.
    log_pair_resultant_lower = field.log_integer(leading) * RealBall(
        3
    ) + log_separation * RealBall(6)
    # Every coefficient of either root-product factor is bounded by S.
    symmetric_bound = 8 * max(1, leading) * root_radius**3
    log_symmetric_bound = field.log_integer(symmetric_bound)
    # Inspection of equation (7.1) gives |a_i| <= 64*S^6/|R| and
    # sqrt(sum_j |b_j|) <= 6*S^2.  There are ten 3+2 partitions.
    log_a_bound = (
        field.log_integer(64)
        + log_symmetric_bound * RealBall(6)
        - log_pair_resultant_lower
    )
    log_sqrt_b_bound = field.log_integer(6) + log_symmetric_bound * RealBall(2)
    log_infinite_bound = (
        field.log_integer(10) + log_a_bound + log_sqrt_b_bound
    ) * RealBall(2)
    discriminant_bound = _mueller_stoll_discriminant_bound(f_value)
    upper_raw = field.log_integer(discriminant_bound) / RealBall(
        3
    ) + log_infinite_bound / RealBall(3)
    zero = _zero_ball(precision)
    upper = RealBall(
        zero.lower if upper_raw.lower < zero.lower else upper_raw.lower,
        zero.upper if upper_raw.upper < zero.upper else upper_raw.upper,
        precision_bits=precision,
        rigorous=True,
        source=(
            "Mueller--Stoll/Stoll root-partition height bound; "
            "Cauchy-discriminant separation; outward interval logs"
        ),
    )

    duplication_l1_bound = classical_duplication_l1_bound(jacobian)
    lower_magnitude = field.log_integer(duplication_l1_bound) / RealBall(3)
    lower = -lower_magnitude
    diagnostics.update(
        {
            "automatic_bound": "certified",
            "coefficient_height": str(coefficient_height),
            "leading_coefficient_abs": str(leading),
            "discriminant_abs": str(abs(discriminant)),
            "mueller_stoll_discriminant_bound": str(discriminant_bound),
            "cauchy_root_radius": str(root_radius),
            "root_pair_count": 10,
            "cross_differences_per_partition": 6,
            "duplication_l1_bound": str(duplication_l1_bound),
            "duplication_l1_audit": "exact-specialized-sparse-term-sum",
            "references": (
                "Stoll, On the height constant for curves of genus two, "
                "Acta Arith. 90 (1999), Eq. 7.1",
                "Flynn, The group law on the Jacobian of a curve of genus 2, Appendix C",
                "Mueller--Stoll, Canonical Heights on Genus Two Jacobians, Sections 10 and 17",
            ),
        }
    )
    return AutomaticHeightBounds(lower, upper, diagnostics)


def _common_content(values: tuple[int, int, int, int]) -> int:
    common = 0
    for value in values:
        common = _gcd(common, value)
    return common


def _specialized_duplication_mod(
    coordinates: tuple[int, int, int, int],
    terms: tuple[tuple[tuple[int, int, int, int, int], ...], ...],
    modulus: int,
) -> tuple[int, int, int, int]:
    """Evaluate specialized Flynn quartics modulo one positive modulus."""
    powers: list[tuple[int, ...]] = []
    for coordinate in coordinates:
        reduced = coordinate % modulus
        row = [1, reduced]
        for _exponent in range(2, 5):
            row.append((row[-1] * reduced) % modulus)
        powers.append(tuple(row))
    output: list[int] = []
    for table in terms:
        total = 0
        for coefficient, exponent1, exponent2, exponent3, exponent4 in table:
            value = coefficient % modulus
            for index, exponent in enumerate(
                (exponent1, exponent2, exponent3, exponent4)
            ):
                if exponent:
                    value = (value * powers[index][exponent]) % modulus
            total = (total + value) % modulus
        output.append(total)
    return cast(tuple[int, int, int, int], tuple(output))


def _specialized_duplication_exact(
    coordinates: tuple[int, int, int, int],
    terms: tuple[tuple[tuple[int, int, int, int, int], ...], ...],
) -> tuple[int, int, int, int]:
    """Evaluate specialized Flynn quartics over exact Python integers."""
    powers: list[tuple[int, ...]] = []
    for coordinate in coordinates:
        row = [1, coordinate]
        for _exponent in range(2, 5):
            row.append(row[-1] * coordinate)
        powers.append(tuple(row))
    output: list[int] = []
    for table in terms:
        total = 0
        for coefficient, exponent1, exponent2, exponent3, exponent4 in table:
            value = coefficient
            for index, exponent in enumerate(
                (exponent1, exponent2, exponent3, exponent4)
            ):
                if exponent:
                    value *= powers[index][exponent]
            total += value
        output.append(total)
    return cast(tuple[int, int, int, int], tuple(output))


def _finite_correction_steps(discriminant_bound: int, precision: int) -> int:
    # log(D) < bit_length(D), so this integer test conservatively enforces
    # log(D)/(3*4^steps) <= 2^-precision without a floating comparison.
    steps = 0
    target = discriminant_bound.bit_length() * (2**precision)
    scale = 3
    while scale < target:
        scale *= 4
        steps += 1
    return steps


def _mueller_stoll_discriminant_bound(polynomial: Any) -> int:
    """Return `D=16*lc(f)^2*|disc(f)|` for `F(X,Z)=Z*f_hom`."""
    coefficients = _integer_coefficients(polynomial, 6)
    if coefficients is None or coefficients[5] == 0:
        raise Genus2HeightCapabilityError(
            "the Mueller--Stoll finite bound requires an integral quintic",
            {"finite_correction": "unsupported-discriminant-bound-model"},
        )
    return (
        16
        * coefficients[5]
        * coefficients[5]
        * abs(int(str(polynomial.discriminant())))
    )


def factorization_free_finite_correction(
    divisor: Any,
    *,
    precision: int = 80,
    steps: int | None = None,
    specialized_terms: tuple[tuple[tuple[int, int, int, int, int], ...], ...]
    | None = None,
) -> FiniteHeightCorrectionResult:
    """Certify the finite height correction without factoring a discriminant.

    This is the modular gcd algorithm preceding Müller--Stoll Proposition
    14.1. For a primitive integral quintic, the raw duplication content at
    every stage divides `D=16*lc(f)^2*abs(disc(f))`, the discriminant of the
    associated binary sextic `Z*f_hom(X,Z)`. Working modulo `D^(m+2)` keeps all
    intermediate integers polynomial in the requested accuracy. The omitted
    tail is enclosed by `log(D)/(3*4^m)`.
    """
    capability = exact_divisor_capability(divisor)
    capability.require()
    jacobian = divisor.parent()
    f_value = jacobian.f()
    h_value = jacobian.h()
    diagnostics = dict(capability.diagnostics)
    if not h_value.is_zero() or int(f_value.degree()) != 5:
        diagnostics["finite_correction"] = "unsupported-nonclassical-model"
        raise Genus2HeightCapabilityError(
            "factorization-free finite correction requires h=0 and degree(f)=5",
            diagnostics,
        )
    coefficients = _integer_coefficients(f_value, 6)
    if coefficients is None:
        diagnostics["finite_correction"] = "unsupported-rational-denominators"
        raise Genus2HeightCapabilityError(
            "factorization-free finite correction requires an integral model",
            diagnostics,
        )
    precision = int(precision)
    if precision < 16:
        raise ValueError("finite-correction precision must be at least 16 bits")
    discriminant = abs(int(str(f_value.discriminant())))
    if discriminant == 0:
        raise Genus2HeightCapabilityError(
            "finite correction requires a squarefree quintic", diagnostics
        )
    discriminant_bound = _mueller_stoll_discriminant_bound(f_value)
    if steps is None:
        steps = _finite_correction_steps(discriminant_bound, precision)
    else:
        steps = int(steps)
        if steps < 0:
            raise ValueError("finite-correction steps must be nonnegative")

    field = IntervalBallField(precision)
    coordinates = kummer_coordinates(divisor).coordinates()
    specialized_terms = _validated_specialized_terms(jacobian, specialized_terms)
    partial = _zero_ball(precision, "empty-finite-correction-sum")
    gcd_integers: list[int] = []
    modulus = discriminant_bound ** (steps + 2)
    recurrence_backend = "dynamic-python"
    if is_compiled(modular_kummer_height_recurrence):
        recurrence_backend = "native-integer-buffer"
        coefficients, exponents, term_counts, _coefficient_bits = (
            _flatten_specialized_terms(specialized_terms)
        )
        packed_coefficients = kernel_integer_buffer(
            modular_kummer_height_recurrence, coefficients
        )
        packed_exponents = kernel_uint64_buffer(
            modular_kummer_height_recurrence, exponents
        )
        packed_counts = kernel_uint64_buffer(
            modular_kummer_height_recurrence, term_counts
        )
        packed_output = kernel_integer_zeros(
            modular_kummer_height_recurrence,
            _host_buffer_length(steps),
            _host_buffer_length(max(2, (discriminant_bound.bit_length() + 63) // 64)),
        )
        status = modular_kummer_height_recurrence(
            packed_output,
            packed_coefficients,
            packed_exponents,
            packed_counts,
            coordinates[0],
            coordinates[1],
            coordinates[2],
            coordinates[3],
            discriminant_bound,
            modulus,
            steps,
        )
        if status == -1:
            raise RuntimeError("invalid packed modular Kummer recurrence plan")
        if status == -2:
            raise ArithmeticError("modular Kummer duplication lost all precision")
        if status != steps:
            raise RuntimeError("incomplete packed modular Kummer recurrence")
        gcd_integers = [int(value) for value in integer_buffer_values(packed_output)]
    else:
        for _index in range(steps):
            raw = _specialized_duplication_mod(coordinates, specialized_terms, modulus)
            content = _common_content(raw)
            common = _gcd(discriminant_bound, content)
            if common == 0:
                raise ArithmeticError("modular Kummer duplication lost all precision")
            gcd_integers.append(common)
            coordinates = cast(
                tuple[int, int, int, int],
                tuple(int(value // common) for value in raw),
            )

    for index, common in enumerate(gcd_integers):
        if common > 1:
            partial = partial + field.log_integer(common) / RealBall(
                4 ** (index + 1), precision_bits=precision
            )

    tail = field.log_integer(discriminant_bound) / RealBall(
        3 * 4**steps, precision_bits=precision
    )
    ball = RealBall(
        partial.lower,
        (partial + tail).upper,
        precision_bits=precision,
        rigorous=True,
        source=("Mueller--Stoll factorization-free modular gcd finite correction"),
    )
    diagnostics.update(
        {
            "finite_correction": "certified",
            "discriminant_bound_D": str(discriminant_bound),
            "modulus_exponent": steps + 2,
            "raw_duplication_gcds": tuple(str(value) for value in gcd_integers),
            "recurrence_backend": recurrence_backend,
            "factorization_used": False,
            "specialized_quartic_term_counts": tuple(
                len(table) for table in specialized_terms
            ),
            "tail_formula": "log(D)/(3*4^steps)",
            "reference": (
                "Mueller--Stoll, Canonical Heights on Genus Two Jacobians, "
                "Section 14 and Proposition 14.1"
            ),
        }
    )
    return FiniteHeightCorrectionResult(ball, partial, tail, steps, diagnostics)


def normalized_archimedean_correction(
    divisor: Any,
    *,
    precision: int = 80,
    steps: int | None = None,
    target_bits: int | None = None,
    bounds: AutomaticHeightBounds | None = None,
    specialized_terms: tuple[tuple[tuple[int, int, int, int, int], ...], ...]
    | None = None,
) -> ArchimedeanHeightCorrectionResult:
    """Certify the real-place correction with bounded projective coordinates.

    This evaluates Flynn's duplication quartics on outward-rounded real
    intervals and divides every image by its maximum absolute coordinate.
    Thus the exact-coordinate growth of repeated rational duplication is
    replaced by a fixed four-ball state.  Stoll's global real-place bound,
    scaled by `4^-steps`, certifies the omitted tail.
    """
    capability = exact_divisor_capability(divisor)
    capability.require()
    jacobian = divisor.parent()
    f_value = jacobian.f()
    if (
        not jacobian.h().is_zero()
        or int(f_value.degree()) != 5
        or _integer_coefficients(f_value, 6) is None
    ):
        diagnostics = dict(capability.diagnostics)
        diagnostics["archimedean_correction"] = (
            "unsupported-outside-classical-integral-envelope"
        )
        raise Genus2HeightCapabilityError(
            "normalized certified real correction requires an integral "
            "classical quintic",
            diagnostics,
        )
    precision = int(precision)
    if precision < 16:
        raise ValueError("archimedean-correction precision must be at least 16 bits")
    if target_bits is not None:
        target_bits = int(target_bits)
        if target_bits < 1:
            raise ValueError("target height accuracy must be positive")
    if bounds is None:
        bounds = automatic_height_bounds(jacobian, precision=precision)
    if bounds.diagnostics.get("automatic_bound") != "certified":
        raise Genus2HeightCapabilityError(
            "normalized real correction requires model-bound automatic bounds",
            bounds.diagnostics,
        )

    field = IntervalBallField(precision)
    discriminant_bound = _mueller_stoll_discriminant_bound(f_value)
    finite_global = field.log_integer(discriminant_bound) / RealBall(
        3, precision_bits=precision
    )
    archimedean_global = RealBall(
        (bounds.correction_lower - finite_global).lower,
        bounds.correction_upper.upper,
        precision_bits=precision,
        rigorous=True,
        source="Stoll/Flynn global real-place correction bound",
    )
    if steps is None:
        steps = _scaled_tail_steps(
            archimedean_global,
            target_bits if target_bits is not None else precision,
        )
    else:
        steps = int(steps)
        if steps < 0:
            raise ValueError("archimedean-correction steps must be nonnegative")

    integer_coordinates = kummer_coordinates(divisor).coordinates()
    initial_scale = max(abs(value) for value in integer_coordinates)
    if initial_scale == 0:
        return ArchimedeanHeightCorrectionResult(
            _zero_ball(precision),
            _zero_ball(precision),
            _zero_ball(precision),
            0,
            {
                "archimedean_correction": "exact-zero-kummer-origin",
                "bounded_projective_state": True,
            },
        )
    dyadic_scale = 2**precision
    coordinates = cast(
        tuple[tuple[int, int], tuple[int, int], tuple[int, int], tuple[int, int]],
        tuple(
            (
                (value * dyadic_scale) // initial_scale,
                _ceil_div(value * dyadic_scale, initial_scale),
            )
            for value in integer_coordinates
        ),
    )
    specialized_terms = _validated_specialized_terms(jacobian, specialized_terms)

    partial = _zero_ball(precision, "empty-archimedean-correction-sum")
    maximum_state_width_bits = precision
    scale_enclosures: list[dict[str, str]] = []
    dyadic_scales: list[tuple[int, int]] = []
    recurrence_backend = "dynamic-python"
    if is_compiled(dyadic_kummer_height_recurrence):
        recurrence_backend = "native-integer-buffer"
        coefficients, exponents, term_counts, coefficient_bits = (
            _flatten_specialized_terms(specialized_terms)
        )
        packed_state = kernel_integer_buffer(
            dyadic_kummer_height_recurrence,
            [endpoint for value in coordinates for endpoint in value],
        )
        packed_coefficients = kernel_integer_buffer(
            dyadic_kummer_height_recurrence, coefficients
        )
        packed_exponents = kernel_uint64_buffer(
            dyadic_kummer_height_recurrence, exponents
        )
        packed_counts = kernel_uint64_buffer(
            dyadic_kummer_height_recurrence, term_counts
        )
        word_capacity = max(8, (precision + coefficient_bits + 191) // 64)
        packed_scratch = kernel_integer_zeros(
            dyadic_kummer_height_recurrence,
            _host_buffer_length(48),
            _host_buffer_length(word_capacity),
        )
        packed_output = kernel_integer_zeros(
            dyadic_kummer_height_recurrence,
            _host_buffer_length(10 * steps),
            _host_buffer_length(word_capacity),
        )
        status = dyadic_kummer_height_recurrence(
            packed_output,
            packed_state,
            packed_coefficients,
            packed_exponents,
            packed_counts,
            packed_scratch,
            dyadic_scale,
            steps,
        )
        if status == -1:
            raise RuntimeError("invalid packed dyadic Kummer recurrence plan")
        if status == -2:
            raise Genus2HeightResolutionError(
                "real Kummer interval iteration could not separate the "
                "projective image from zero; increase precision",
                {"precision_bits": precision, "recurrence_backend": recurrence_backend},
            )
        if status != steps:
            raise RuntimeError("incomplete packed dyadic Kummer recurrence")
        packed_values = integer_buffer_values(packed_output)
        for index in range(steps):
            offset = 10 * index
            image_scale_dyadic = (
                int(packed_values[offset]),
                int(packed_values[offset + 1]),
            )
            dyadic_scales.append(image_scale_dyadic)
            coordinate_values = cast(
                tuple[
                    tuple[int, int],
                    tuple[int, int],
                    tuple[int, int],
                    tuple[int, int],
                ],
                tuple(
                    (
                        int(packed_values[offset + 2 + 2 * coordinate]),
                        int(packed_values[offset + 3 + 2 * coordinate]),
                    )
                    for coordinate in range(4)
                ),
            )
            state_width_bits = min(
                precision - max(0, (value[1] - value[0]).bit_length())
                for value in coordinate_values
            )
            maximum_state_width_bits = min(maximum_state_width_bits, state_width_bits)
            scale_enclosures.append(
                {
                    "step": str(index),
                    "lower_dyadic_numerator": str(image_scale_dyadic[0]),
                    "upper_dyadic_numerator": str(image_scale_dyadic[1]),
                    "dyadic_exponent": str(-precision),
                }
            )
    else:
        for index in range(steps):
            raw = _specialized_duplication_dyadic(
                coordinates,
                specialized_terms,
                scale=dyadic_scale,
            )
            image_scale_dyadic = _dyadic_max_absolute(raw)
            if image_scale_dyadic[0] <= 0:
                raise Genus2HeightResolutionError(
                    "real Kummer interval iteration could not separate the "
                    "projective image from zero; increase precision",
                    {
                        "step": index,
                        "precision_bits": precision,
                        "image_scale_dyadic_numerators": image_scale_dyadic,
                    },
                )
            dyadic_scales.append(image_scale_dyadic)
            coordinates = cast(
                tuple[
                    tuple[int, int],
                    tuple[int, int],
                    tuple[int, int],
                    tuple[int, int],
                ],
                tuple(
                    _dyadic_divide_positive(value, image_scale_dyadic, dyadic_scale)
                    for value in raw
                ),
            )
            state_width_bits = min(
                precision - max(0, (value[1] - value[0]).bit_length())
                for value in coordinates
            )
            maximum_state_width_bits = min(maximum_state_width_bits, state_width_bits)
            scale_enclosures.append(
                {
                    "step": str(index),
                    "lower_dyadic_numerator": str(image_scale_dyadic[0]),
                    "upper_dyadic_numerator": str(image_scale_dyadic[1]),
                    "dyadic_exponent": str(-precision),
                }
            )

    # log(s0)/4+...+log(s3)/4^4 = log(s0^64*s1^16*s2^4*s3)/4^4.
    logarithm_block_size = 4
    for block_start in range(0, steps, logarithm_block_size):
        block_end = min(steps, block_start + logarithm_block_size)
        combined = (dyadic_scale, dyadic_scale)
        for index in range(block_start, block_end):
            exponent = 4 ** (block_end - index - 1)
            combined = _dyadic_multiply(
                combined,
                _dyadic_power(dyadic_scales[index], exponent, dyadic_scale),
                dyadic_scale,
            )
        combined_ball = RealBall.dyadic_endpoints(
            combined[0],
            -precision,
            combined[1],
            -precision,
            precision_bits=precision,
            source="four-step outward dyadic Kummer scale product",
        )
        weight = RealBall(4**block_end, precision_bits=precision)
        partial = partial - field.log(combined_ball) / weight

    divisor_scale = RealBall(4**steps, precision_bits=precision)
    tail = archimedean_global / divisor_scale
    ball = partial + tail
    return ArchimedeanHeightCorrectionResult(
        ball,
        partial,
        tail,
        steps,
        {
            "archimedean_correction": "certified",
            "bounded_projective_state": True,
            "coordinate_storage": "four outward-rounded real balls",
            "recurrence_backend": recurrence_backend,
            "specialized_quartic_term_counts": tuple(
                len(table) for table in specialized_terms
            ),
            "scale_logarithm_block_size": logarithm_block_size,
            "scale_logarithm_evaluations": (steps + logarithm_block_size - 1)
            // logarithm_block_size,
            "working_precision_bits": precision,
            "target_bits": target_bits,
            "minimum_state_width_bits": maximum_state_width_bits,
            "scale_enclosures": tuple(scale_enclosures),
            "tail_formula": "global_real_correction_bound/4^steps",
            "factorization_used": False,
            "references": (
                "Flynn, The group law on the Jacobian of a curve of genus 2, Appendix C",
                "Mueller--Stoll, Canonical Heights on Genus Two Jacobians, Sections 10 and 17",
            ),
        },
    )


class HeightContext:
    """Reusable exact doubling chains, Kummer points, logs, and model bounds."""

    def __init__(
        self, jacobian: Any, *, max_exact_coordinate_bits: int = 100000
    ) -> None:
        capability = exact_model_capability(jacobian)
        capability.require()
        max_exact_coordinate_bits = int(max_exact_coordinate_bits)
        if max_exact_coordinate_bits < 1024:
            raise ValueError("the exact-coordinate bit budget must be at least 1024")
        self._jacobian = jacobian
        self._max_exact_coordinate_bits = max_exact_coordinate_bits
        try:
            self._classical_duplication_terms = classical_duplication_specialized_terms(
                jacobian
            )
        except Exception:
            self._classical_duplication_terms = None
        try:
            l1_bound = classical_duplication_l1_bound(jacobian)
            self._duplication_overhead_bits_upper = 4 * len(str(l1_bound)) + 8
        except Exception:
            coefficient_bits_upper = max(
                _coefficient_size_bits_upper(jacobian.f(), 7),
                _coefficient_size_bits_upper(jacobian.h(), 4),
            )
            # Generalized/rational models clear coefficient denominators in
            # the direct quartics.  Counting both numerator and denominator is
            # essential: a tiny rational coefficient can otherwise create a
            # huge primitive integral Kummer output in one duplication.
            self._duplication_overhead_bits_upper = 16 * coefficient_bits_upper + 128
        self._chains: dict[Any, list[KummerCoordinates]] = {}
        self._kummer: dict[Any, Any] = {}
        self._fields: dict[int, IntervalBallField] = {}
        self._automatic_bounds: dict[int, AutomaticHeightBounds | None] = {}
        self._automatic_bound_errors: dict[int, dict[str, Any]] = {}
        self._local_corrections: dict[Any, dict[str, Any]] = {}
        self._canonical_height_entries = 0
        self._height_pairing_entries = 0
        self._chain_hits = 0
        self._chain_misses = 0
        self._doublings = 0
        self._kummer_hits = 0
        self._kummer_misses = 0
        self._local_correction_hits = 0
        self._local_correction_misses = 0
        self._finite_correction_hits = 0
        self._finite_correction_misses = 0
        self._archimedean_correction_hits = 0
        self._archimedean_correction_misses = 0
        self._canonical_height_hits = 0
        self._canonical_height_misses = 0
        self._height_pairing_hits = 0
        self._height_pairing_misses = 0

    @property
    def jacobian(self) -> Any:
        return self._jacobian

    @property
    def max_exact_coordinate_bits(self) -> int:
        return self._max_exact_coordinate_bits

    def _key(self, divisor: Any) -> Any:
        if divisor.parent() is not self.jacobian:
            raise ValueError("all height points must belong to the context Jacobian")
        # MumfordDivisor hashes its exact parent/u/v triple.  Keeping the exact
        # object as the cache key avoids repeatedly serializing large rational
        # coefficients on warm height and pairing calls.
        return divisor

    def field(self, precision: int) -> IntervalBallField:
        precision = int(precision)
        cached = self._fields.get(precision)
        if cached is None:
            cached = IntervalBallField(precision)
            self._fields[precision] = cached
        return cached

    def kummer(self, divisor: Any) -> Any:
        key = self._key(divisor)
        cached = self._kummer.get(key)
        if cached is not None:
            self._kummer_hits += 1
            return cached
        self._kummer_misses += 1
        answer = kummer_coordinates(divisor)
        self._kummer[key] = answer
        return answer

    def chain(self, divisor: Any, steps: int) -> tuple[KummerCoordinates, ...]:
        steps = int(steps)
        if steps < 0:
            raise ValueError("height doubling steps must be nonnegative")
        key = self._key(divisor)
        chain = self._chains.get(key)
        if chain is None:
            chain = [self.kummer(divisor)]
            self._chains[key] = chain
            self._chain_misses += 1
        else:
            self._chain_hits += 1
        while len(chain) <= steps:
            current_bits_upper = _coordinate_size_bits_upper(chain[-1])
            predicted_bits_upper = (
                4 * current_bits_upper + self._duplication_overhead_bits_upper
            )
            if predicted_bits_upper > self.max_exact_coordinate_bits:
                raise Genus2HeightResourceLimitError(
                    "exact Kummer coordinates exceed the configured bit budget; "
                    "use fewer steps or the bounded local-correction engines",
                    {
                        "requested_steps": steps,
                        "completed_steps": len(chain) - 1,
                        "resource_check_stage": "pre-duplication-estimate",
                        "current_coordinate_bits_upper": current_bits_upper,
                        "predicted_next_coordinate_bits_upper": predicted_bits_upper,
                        "max_exact_coordinate_bits": self.max_exact_coordinate_bits,
                        "fallbacks": (
                            "factorization_free_finite_correction",
                            "reduce exact doubling steps",
                        ),
                    },
                )
            next_point = chain[-1].duplicate()
            actual_bits_upper = _coordinate_size_bits_upper(next_point)
            if actual_bits_upper > self.max_exact_coordinate_bits:
                raise Genus2HeightResourceLimitError(
                    "exact Kummer duplication exceeded the configured bit budget; "
                    "use fewer steps or the bounded local-correction engines",
                    {
                        "requested_steps": steps,
                        "completed_steps": len(chain) - 1,
                        "resource_check_stage": "post-duplication-exact",
                        "actual_next_coordinate_bits_upper": actual_bits_upper,
                        "max_exact_coordinate_bits": self.max_exact_coordinate_bits,
                        "fallbacks": (
                            "factorization_free_finite_correction",
                            "reduce exact doubling steps",
                        ),
                    },
                )
            chain.append(next_point)
            self._doublings += 1
        return tuple(chain[: steps + 1])

    def automatic_bounds(self, precision: int) -> AutomaticHeightBounds | None:
        precision = int(precision)
        if precision in self._automatic_bounds:
            cached = self._automatic_bounds[precision]
            return None if cached is None else cached.copy()
        try:
            answer = automatic_height_bounds(self.jacobian, precision=precision)
            self._automatic_bound_errors[precision] = {}
        except Genus2HeightCapabilityError as error:
            answer = None
            self._automatic_bound_errors[precision] = dict(error.diagnostics)
        self._automatic_bounds[precision] = answer
        return None if answer is None else answer.copy()

    def finite_correction(
        self,
        divisor: Any,
        *,
        precision: int,
        steps: int,
    ) -> FiniteHeightCorrectionResult:
        """Return a certified finite correction."""
        _validated_context_specialized_terms(self)
        self._key(divisor)
        self._finite_correction_misses += 1
        return factorization_free_finite_correction(
            divisor,
            precision=int(precision),
            steps=int(steps),
            specialized_terms=self._classical_duplication_terms,
        )

    def archimedean_correction(
        self,
        divisor: Any,
        *,
        precision: int,
        steps: int,
        bounds: AutomaticHeightBounds,
        target_bits: int | None,
    ) -> ArchimedeanHeightCorrectionResult:
        """Return a certified normalized real-place correction."""
        _validated_context_specialized_terms(self)
        self._key(divisor)
        self._archimedean_correction_misses += 1
        return normalized_archimedean_correction(
            divisor,
            precision=int(precision),
            steps=int(steps),
            target_bits=target_bits,
            bounds=bounds,
            specialized_terms=self._classical_duplication_terms,
        )

    def diagnostics(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-height-context.v1",
            "archimedean_engine_capability": (
                "certified-normalized-real-ball-projective-iteration"
            ),
            "max_exact_coordinate_bits": self.max_exact_coordinate_bits,
            "duplication_overhead_bits_upper": self._duplication_overhead_bits_upper,
            "specialized_quartic_term_counts": (
                None
                if self._classical_duplication_terms is None
                else tuple(len(table) for table in self._classical_duplication_terms)
            ),
            "chain_cache_entries": len(self._chains),
            "chain_cache_hits": self._chain_hits,
            "chain_cache_misses": self._chain_misses,
            "direct_kummer_quartic_doublings": self._doublings,
            "kummer_cache_entries": len(self._kummer),
            "kummer_cache_hits": self._kummer_hits,
            "kummer_cache_misses": self._kummer_misses,
            "local_correction_cache_entries": len(self._local_corrections),
            "local_correction_cache_hits": self._local_correction_hits,
            "local_correction_cache_misses": self._local_correction_misses,
            "finite_correction_cache_entries": 0,
            "finite_correction_cache_hits": self._finite_correction_hits,
            "finite_correction_cache_misses": self._finite_correction_misses,
            "archimedean_correction_cache_entries": 0,
            "archimedean_correction_cache_hits": self._archimedean_correction_hits,
            "archimedean_correction_cache_misses": (
                self._archimedean_correction_misses
            ),
            "canonical_height_cache_entries": self._canonical_height_entries,
            "canonical_height_cache_hits": self._canonical_height_hits,
            "canonical_height_cache_misses": self._canonical_height_misses,
            "height_pairing_cache_entries": self._height_pairing_entries,
            "height_pairing_cache_hits": self._height_pairing_hits,
            "height_pairing_cache_misses": self._height_pairing_misses,
            "precision_fields": tuple(sorted(self._fields)),
            "automatic_bound_precisions": tuple(
                sorted(
                    precision
                    for precision, value in self._automatic_bounds.items()
                    if value is not None
                )
            ),
            "automatic_bound_proof_state": (
                "closure-local-structural-model-precision-theorem-sources"
            ),
            "automatic_bound_proof_source_capacity": 512,
            "automatic_bound_egress_registers_source": False,
            "automatic_bound_failures": {
                str(precision): dict(value)
                for precision, value in self._automatic_bound_errors.items()
                if value
            },
        }


class CanonicalHeightResult(_SealedRecord):
    """A canonical-height enclosure or explicitly numerical reference value."""

    def __init__(
        self,
        ball: RealBall,
        *,
        status: str,
        steps: int,
        provenance: dict[str, Any],
        bounds: AutomaticHeightBounds | None,
        diagnostics: dict[str, Any],
        _encoded_diagnostics: Any = None,
        _ball_encoder: Any = _ball_data,
    ) -> None:
        self._ball_data = _ball_encoder(ball)
        self._status = str(status)
        self._steps = int(steps)
        self._provenance = _freeze_data(provenance)
        self._bounds = None if bounds is None else bounds.copy()
        self._diagnostics = (
            _freeze_data(diagnostics)
            if _encoded_diagnostics is None
            else _EncodedFrozenDict(_encoded_diagnostics[1])
        )
        self._rigorous = bool(ball.rigorous)
        self._seal()

    ball = _closed_ball_property("_ball_data")

    @property
    def _ball(self) -> RealBall:
        return self.ball

    @property
    def status(self) -> str:
        return self._status

    @property
    def steps(self) -> int:
        return self._steps

    @property
    def provenance(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._provenance))

    @property
    def bounds(self) -> AutomaticHeightBounds | None:
        return None if self._bounds is None else self._bounds.copy()

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))

    @property
    def rigorous(self) -> bool:
        return self._rigorous

    def midpoint(self) -> Any:
        return self._ball.midpoint()

    def verify(
        self,
        divisor: Any,
        *,
        height_difference_bound: Any = None,
    ) -> bool:
        """Strictly replay this result from its exact divisor and parameters."""
        if divisor_provenance(divisor) != self.provenance:
            raise Genus2HeightResolutionError(
                "canonical-height replay divisor does not match provenance",
                {"expected": self.provenance, "actual": divisor_provenance(divisor)},
            )
        if (
            self._status == "conditional-supplied-bound"
            and height_difference_bound is None
        ):
            raise Genus2HeightResolutionError(
                "conditional replay requires the original supplied bound assumption",
                {"status": self._status},
            )
        context_data = self._diagnostics.get("context", {})
        replay_context = HeightContext(
            divisor.parent(),
            max_exact_coordinate_bits=int(
                context_data.get("max_exact_coordinate_bits", 100000)
            ),
        )
        torsion_order = None
        if (
            self._diagnostics.get("torsion_certificate")
            == "verified-annihilating-multiple"
        ):
            torsion_order = int(self._diagnostics["annihilating_multiple"])
        replay = canonical_height(
            divisor,
            steps=self._steps,
            precision=int(
                self._diagnostics.get(
                    "requested_precision_bits", self._ball.precision_bits
                )
            ),
            target_bits=self._diagnostics.get("target_bits"),
            algorithm=str(self._diagnostics.get("requested_algorithm", "auto")),
            height_difference_bound=height_difference_bound,
            torsion_order=torsion_order,
            context=replay_context,
        )
        if (
            replay.status != self._status
            or replay._rigorous != self._rigorous
            or not _same_ball(replay._ball, self._ball)
        ):
            raise Genus2HeightResolutionError(
                "canonical-height strict replay did not reproduce the record",
                {"stored": self.to_dict(), "replayed": replay.to_dict()},
            )
        return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-canonical-height.v1",
            "normalization": "Cassels-Flynn 2Theta Kummer canonical height",
            "pairing_convention": "<P,Q>=(hhat(P+Q)-hhat(P)-hhat(Q))/2",
            "status": self._status,
            "rigorous": self._rigorous,
            "steps": self._steps,
            "enclosure": self._ball.to_dict(),
            "divisor": self.provenance,
            "height_bounds": None if self._bounds is None else self._bounds.to_dict(),
            "diagnostics": self.diagnostics,
        }

    def __repr__(self) -> str:
        return (
            "CanonicalHeightResult("
            + repr(self.ball)
            + ", status="
            + repr(self.status)
            + ")"
        )


def _find_kummer_repeat(chain: tuple[KummerCoordinates, ...]) -> bool:
    seen: set[tuple[int, int, int, int]] = set()
    for point in chain:
        coordinates = point.coordinates()
        if coordinates == (0, 0, 0, 1):
            return True
        if coordinates in seen:
            # Equality on J/{+-1} gives 2^i P = +/- 2^j P and hence an exact
            # nonzero integer annihilator for P.
            return True
        seen.add(coordinates)
    return False


def _check_height_batch_cancel(cancel: Any, stage: str) -> None:
    """Stop a proof batch only at an atomic stage boundary."""
    if cancel is not None and bool(cancel()):
        raise Genus2HeightResolutionError(
            "the certified height batch was cancelled",
            {"cancelled": True, "stage": str(stage)},
        )


def _canonical_heights_uncached_local_batch(
    divisors: tuple[Any, ...],
    *,
    steps: int,
    precision: int,
    target_bits: int | None,
    algorithm: str,
    context: HeightContext,
    cancel: Any = None,
    _closed_dependencies: tuple[Any, ...] = (
        perf_counter,
        ArchimedeanHeightCorrectionResult,
        CanonicalHeightResult,
        FiniteHeightCorrectionResult,
        Genus2HeightCapabilityError,
        Genus2HeightResolutionError,
        Genus2HeightResourceLimitError,
        RealBall,
        _ceil_div,
        _check_height_batch_cancel,
        _dyadic_multiply,
        _dyadic_power,
        _enclosure_width_bits,
        _finite_correction_steps,
        _flatten_specialized_terms,
        _host_buffer_length,
        _integer_coefficients,
        _mueller_stoll_discriminant_bound,
        _scaled_tail_steps,
        _validated_context_specialized_terms,
        _zero_ball,
        divisor_provenance,
        dyadic_kummer_height_recurrence_batch,
        dyadic_log_interval_batch,
        exact_divisor_capability,
        exact_kummer_small_step_batch,
        integer_buffer_values,
        is_compiled,
        kernel_integer_buffer,
        kernel_integer_zeros,
        kernel_uint64_buffer,
        kummer_coordinates,
        modular_kummer_height_recurrence_batch,
    ),
) -> tuple[CanonicalHeightResult, ...]:
    """Compute one proof-atomic batch of previously uncached local heights.

    This private engine shares the exact model specialization, modular plan,
    dyadic plan, and exact logarithm plan across at most 64 points.  It does
    not publish cache entries: the closure-owned proof wrapper below validates
    every returned theorem payload and publishes the complete batch only
    after this function succeeds.
    """
    (
        perf_counter,
        ArchimedeanHeightCorrectionResult,
        CanonicalHeightResult,
        FiniteHeightCorrectionResult,
        Genus2HeightCapabilityError,
        Genus2HeightResolutionError,
        Genus2HeightResourceLimitError,
        RealBall,
        _ceil_div,
        _check_height_batch_cancel,
        _dyadic_multiply,
        _dyadic_power,
        _enclosure_width_bits,
        _finite_correction_steps,
        _flatten_specialized_terms,
        _host_buffer_length,
        _integer_coefficients,
        _mueller_stoll_discriminant_bound,
        _scaled_tail_steps,
        _validated_context_specialized_terms,
        _zero_ball,
        divisor_provenance,
        dyadic_kummer_height_recurrence_batch,
        dyadic_log_interval_batch,
        exact_divisor_capability,
        exact_kummer_small_step_batch,
        integer_buffer_values,
        is_compiled,
        kernel_integer_buffer,
        kernel_integer_zeros,
        kernel_uint64_buffer,
        kummer_coordinates,
        modular_kummer_height_recurrence_batch,
    ) = _closed_dependencies
    started = perf_counter()
    values = tuple(divisors)
    point_count = len(values)
    if point_count == 0:
        return ()
    if point_count > 64:
        raise Genus2HeightResourceLimitError(
            "a certified local-height batch supports at most 64 points",
            {"point_count": point_count, "maximum_point_count": 64},
        )
    normalized_steps = int(steps)
    normalized_precision = int(precision)
    normalized_target = None if target_bits is None else int(target_bits)
    normalized_algorithm = str(algorithm)
    if normalized_algorithm not in ("auto", "local"):
        raise Genus2HeightCapabilityError(
            "the batched engine only supports automatic or local heights",
            {"requested_algorithm": normalized_algorithm},
        )
    if normalized_steps < 0:
        raise ValueError("height doubling steps must be nonnegative")
    if normalized_precision < 16:
        raise ValueError("height precision must be at least 16 bits")
    if normalized_target is not None and normalized_target < 1:
        raise ValueError("target_bits must be positive")
    jacobian = values[0].parent()
    if context.jacobian is not jacobian:
        raise ValueError("the height context belongs to a different Jacobian")
    for divisor in values:
        if divisor.parent() is not jacobian:
            raise ValueError("all batched height points must lie on one Jacobian")
        exact_divisor_capability(divisor).require()

    _check_height_batch_cancel(cancel, "model-specialization")
    specialized_terms = cast(
        tuple[tuple[tuple[int, int, int, int, int], ...], ...],
        _validated_context_specialized_terms(context),
    )
    f_value = jacobian.f()
    if (
        not jacobian.h().is_zero()
        or int(f_value.degree()) != 5
        or _integer_coefficients(f_value, 6) is None
    ):
        raise Genus2HeightCapabilityError(
            "the batched local height engine requires an integral classical quintic",
            {"local_height_batch": "unsupported-model"},
        )
    discriminant_bound = _mueller_stoll_discriminant_bound(f_value)
    working_precision = max(
        normalized_precision,
        (
            normalized_target + 32
            if normalized_target is not None
            else normalized_precision
        ),
    )
    field = context.field(working_precision)
    bounds = context.automatic_bounds(working_precision)
    if bounds is None or bounds.diagnostics.get("automatic_bound") != "certified":
        raise Genus2HeightCapabilityError(
            "the batched local height engine requires certified automatic bounds",
            {} if bounds is None else bounds.diagnostics,
        )
    finite_global = field.log_integer(discriminant_bound) / RealBall(
        3, precision_bits=working_precision
    )
    archimedean_global = RealBall(
        (bounds.correction_lower - finite_global).lower,
        bounds.correction_upper.upper,
        precision_bits=working_precision,
        rigorous=True,
        source="Stoll/Flynn global real-place correction bound",
    )
    selected_steps = normalized_steps
    if normalized_target is not None:
        selected_steps = max(
            selected_steps,
            _finite_correction_steps(discriminant_bound, normalized_target + 2),
            _scaled_tail_steps(archimedean_global, normalized_target + 2),
        )
        guarded_precision = normalized_target + 4 * selected_steps + 48
        if working_precision < guarded_precision:
            working_precision = guarded_precision
            field = context.field(working_precision)
    if selected_steps > 1024 or point_count * selected_steps > 16384:
        raise Genus2HeightResourceLimitError(
            "the certified local-height batch exceeds its bounded recurrence plan",
            {
                "point_count": point_count,
                "selected_steps": selected_steps,
                "maximum_steps": 1024,
                "maximum_point_steps": 16384,
            },
        )
    prepared_at = perf_counter()

    # The context cache is an optimization, not a proof source.  Recompute the
    # exact Mumford-to-Kummer map from each live divisor so a caller-mutated
    # `_kummer` dictionary cannot steer a rigorous batch.
    initial_points = tuple(kummer_coordinates(divisor) for divisor in values)
    initial_coordinates = tuple(point.coordinates() for point in initial_points)
    initial_height_integers = tuple(
        point.naive_height_integer() for point in initial_points
    )
    coefficients, exponents, term_counts, coefficient_bits = _flatten_specialized_terms(
        specialized_terms
    )

    _check_height_batch_cancel(cancel, "modular-recurrence")
    modulus = discriminant_bound ** (selected_steps + 2)
    modular_output = kernel_integer_zeros(
        modular_kummer_height_recurrence_batch,
        _host_buffer_length(point_count * selected_steps),
        _host_buffer_length(max(2, (discriminant_bound.bit_length() + 63) // 64)),
    )
    modular_states = kernel_integer_buffer(
        modular_kummer_height_recurrence_batch,
        [coordinate for point in initial_coordinates for coordinate in point],
    )
    modular_coefficients = kernel_integer_buffer(
        modular_kummer_height_recurrence_batch, coefficients
    )
    modular_exponents = kernel_uint64_buffer(
        modular_kummer_height_recurrence_batch, exponents
    )
    modular_counts = kernel_uint64_buffer(
        modular_kummer_height_recurrence_batch, term_counts
    )
    modular_statuses = kernel_uint64_buffer(
        modular_kummer_height_recurrence_batch, [0] * point_count
    )
    modular_status = modular_kummer_height_recurrence_batch(
        modular_output,
        modular_states,
        modular_coefficients,
        modular_exponents,
        modular_counts,
        modular_statuses,
        discriminant_bound,
        modulus,
        point_count,
        selected_steps,
    )
    if modular_status == -1:
        raise RuntimeError("invalid packed modular Kummer batch plan")
    if modular_status == -2:
        raise ArithmeticError("a modular Kummer batch point lost all precision")
    if modular_status != point_count:
        raise RuntimeError("incomplete packed modular Kummer batch recurrence")
    modular_values = tuple(
        int(value) for value in integer_buffer_values(modular_output)
    )
    modular_rows = tuple(
        modular_values[index * selected_steps : (index + 1) * selected_steps]
        for index in range(point_count)
    )
    modular_at = perf_counter()

    _check_height_batch_cancel(cancel, "dyadic-recurrence")
    dyadic_scale = 2**working_precision
    dyadic_initial: list[int] = []
    for coordinates, initial_scale in zip(
        initial_coordinates, initial_height_integers, strict=True
    ):
        for coordinate in coordinates:
            dyadic_initial.append((coordinate * dyadic_scale) // initial_scale)
            dyadic_initial.append(_ceil_div(coordinate * dyadic_scale, initial_scale))
    dyadic_state = kernel_integer_buffer(
        dyadic_kummer_height_recurrence_batch, dyadic_initial
    )
    dyadic_coefficients = kernel_integer_buffer(
        dyadic_kummer_height_recurrence_batch, coefficients
    )
    dyadic_exponents = kernel_uint64_buffer(
        dyadic_kummer_height_recurrence_batch, exponents
    )
    dyadic_counts = kernel_uint64_buffer(
        dyadic_kummer_height_recurrence_batch, term_counts
    )
    dyadic_statuses = kernel_uint64_buffer(
        dyadic_kummer_height_recurrence_batch, [0] * point_count
    )
    word_capacity = max(8, (working_precision + coefficient_bits + 191) // 64)
    dyadic_scratch = kernel_integer_zeros(
        dyadic_kummer_height_recurrence_batch,
        _host_buffer_length(48 * point_count),
        _host_buffer_length(word_capacity),
    )
    dyadic_output = kernel_integer_zeros(
        dyadic_kummer_height_recurrence_batch,
        _host_buffer_length(10 * point_count * selected_steps),
        _host_buffer_length(word_capacity),
    )
    dyadic_status = dyadic_kummer_height_recurrence_batch(
        dyadic_output,
        dyadic_state,
        dyadic_coefficients,
        dyadic_exponents,
        dyadic_counts,
        dyadic_scratch,
        dyadic_statuses,
        dyadic_scale,
        point_count,
        selected_steps,
    )
    if dyadic_status == -1:
        raise RuntimeError("invalid packed dyadic Kummer batch plan")
    if dyadic_status == -2:
        raise Genus2HeightResolutionError(
            "a real Kummer batch point could not separate its projective image from zero; increase precision",
            {
                "precision_bits": working_precision,
                "recurrence_backend": "native-integer-buffer-batch",
            },
        )
    if dyadic_status != point_count:
        raise RuntimeError("incomplete packed dyadic Kummer batch recurrence")
    dyadic_values = tuple(int(value) for value in integer_buffer_values(dyadic_output))
    dyadic_at = perf_counter()

    logarithm_block_size = 4
    # The orbit itself needs dependency-growth guards, whereas its logarithms
    # are divided by at least 4^4 before entering the height.  Compute their
    # exact outward endpoints at twelve bits beyond the requested result,
    # rather than needlessly carrying the much larger orbit precision through
    # every atanh-series term.  The final enclosure-width check remains the
    # independent fail-closed proof that this budget reached `target_bits`.
    logarithm_precision = max(
        16,
        (normalized_target if normalized_target is not None else normalized_precision)
        + 12,
    )
    per_point_scales: list[list[tuple[int, int]]] = []
    per_point_scale_metadata: list[list[dict[str, str]]] = []
    per_point_minimum_width: list[int] = []
    logarithm_endpoints: list[int] = []
    logarithm_owners: list[tuple[int, int]] = []
    for point_index in range(point_count):
        scales: list[tuple[int, int]] = []
        metadata: list[dict[str, str]] = []
        minimum_width = working_precision
        for step_index in range(selected_steps):
            offset = (point_index * selected_steps + step_index) * 10
            scale_interval = (dyadic_values[offset], dyadic_values[offset + 1])
            scales.append(scale_interval)
            coordinate_intervals = tuple(
                (
                    dyadic_values[offset + 2 + 2 * coordinate],
                    dyadic_values[offset + 3 + 2 * coordinate],
                )
                for coordinate in range(4)
            )
            minimum_width = min(
                minimum_width,
                min(
                    working_precision - max(0, (upper - lower).bit_length())
                    for lower, upper in coordinate_intervals
                ),
            )
            metadata.append(
                {
                    "step": str(step_index),
                    "lower_dyadic_numerator": str(scale_interval[0]),
                    "upper_dyadic_numerator": str(scale_interval[1]),
                    "dyadic_exponent": str(-working_precision),
                }
            )
        per_point_scales.append(scales)
        per_point_scale_metadata.append(metadata)
        per_point_minimum_width.append(minimum_width)
        for block_start in range(0, selected_steps, logarithm_block_size):
            block_end = min(selected_steps, block_start + logarithm_block_size)
            combined = (dyadic_scale, dyadic_scale)
            for step_index in range(block_start, block_end):
                exponent = 4 ** (block_end - step_index - 1)
                combined = _dyadic_multiply(
                    combined,
                    _dyadic_power(scales[step_index], exponent, dyadic_scale),
                    dyadic_scale,
                )
            logarithm_endpoints.extend(combined)
            logarithm_owners.append((point_index, block_end))

    _check_height_batch_cancel(cancel, "exact-outward-logarithms")
    logarithm_input = kernel_integer_buffer(
        dyadic_log_interval_batch, logarithm_endpoints
    )
    logarithm_output = kernel_integer_zeros(
        dyadic_log_interval_batch,
        _host_buffer_length(len(logarithm_endpoints)),
        _host_buffer_length(max(8, (logarithm_precision + 191) // 64)),
    )
    if not dyadic_log_interval_batch(
        logarithm_output,
        logarithm_input,
        working_precision,
        logarithm_precision,
    ):
        raise Genus2HeightResolutionError(
            "the exact outward dyadic logarithm batch did not converge within its bounded series",
            {
                "precision_bits": working_precision,
                "logarithm_precision_bits": logarithm_precision,
                "interval_count": len(logarithm_owners),
            },
        )
    logarithm_values = tuple(
        int(value) for value in integer_buffer_values(logarithm_output)
    )
    archimedean_partials = [
        _zero_ball(working_precision, "empty-archimedean-correction-sum")
        for _point in values
    ]
    for logarithm_index, (point_index, block_end) in enumerate(logarithm_owners):
        log_ball = RealBall.dyadic_endpoints(
            logarithm_values[2 * logarithm_index],
            -logarithm_precision,
            logarithm_values[2 * logarithm_index + 1],
            -logarithm_precision,
            precision_bits=working_precision,
            source="exact atanh-series outward dyadic logarithm",
        )
        archimedean_partials[point_index] = archimedean_partials[
            point_index
        ] - log_ball / RealBall(4**block_end, precision_bits=working_precision)
    logarithm_at = perf_counter()

    _check_height_batch_cancel(cancel, "exact-small-step-oracle")
    oracle_steps = min(2, selected_steps)
    oracle_states = kernel_integer_buffer(
        exact_kummer_small_step_batch,
        [coordinate for point in initial_coordinates for coordinate in point],
    )
    oracle_coefficients = kernel_integer_buffer(
        exact_kummer_small_step_batch, coefficients
    )
    oracle_exponents = kernel_uint64_buffer(exact_kummer_small_step_batch, exponents)
    oracle_counts = kernel_uint64_buffer(exact_kummer_small_step_batch, term_counts)
    oracle_statuses = kernel_uint64_buffer(
        exact_kummer_small_step_batch, [0] * point_count
    )
    maximum_coordinate_bits = max(
        1,
        max(
            abs(coordinate).bit_length()
            for point in initial_coordinates
            for coordinate in point
        ),
    )
    oracle_capacity = max(
        16,
        (16 * maximum_coordinate_bits + 8 * coefficient_bits + 511) // 64,
    )
    oracle_output = kernel_integer_zeros(
        exact_kummer_small_step_batch,
        _host_buffer_length(7 * point_count * oracle_steps),
        _host_buffer_length(oracle_capacity),
    )
    oracle_status = exact_kummer_small_step_batch(
        oracle_output,
        oracle_states,
        oracle_coefficients,
        oracle_exponents,
        oracle_counts,
        oracle_statuses,
        point_count,
        oracle_steps,
    )
    if oracle_status != point_count:
        raise Genus2HeightResolutionError(
            "the exact small-step Kummer batch oracle failed",
            {"status": oracle_status, "oracle_steps": oracle_steps},
        )
    oracle_values = tuple(int(value) for value in integer_buffer_values(oracle_output))
    oracle_at = perf_counter()

    _check_height_batch_cancel(cancel, "proof-assembly")
    context._finite_correction_misses += point_count
    context._archimedean_correction_misses += point_count
    finite_tail = field.log_integer(discriminant_bound) / RealBall(
        3 * 4**selected_steps, precision_bits=working_precision
    )
    finite_tail_ball = RealBall(
        0,
        finite_tail.upper,
        precision_bits=working_precision,
        rigorous=True,
        source="Mueller--Stoll finite correction tail",
    )
    archimedean_tail = archimedean_global / RealBall(
        4**selected_steps, precision_bits=working_precision
    )
    stage_milliseconds = {
        "shared_preparation": str((prepared_at - started) * 1000),
        "modular_recurrence": str((modular_at - prepared_at) * 1000),
        "dyadic_recurrence": str((dyadic_at - modular_at) * 1000),
        "exact_outward_logarithms": str((logarithm_at - dyadic_at) * 1000),
        "exact_small_step_oracle": str((oracle_at - logarithm_at) * 1000),
    }
    recurrence_backend = (
        "native-integer-buffer-batch"
        if all(
            is_compiled(function)
            for function in (
                modular_kummer_height_recurrence_batch,
                dyadic_kummer_height_recurrence_batch,
                exact_kummer_small_step_batch,
                dyadic_log_interval_batch,
            )
        )
        else "dynamic-python-batch"
    )
    answers: list[CanonicalHeightResult] = []
    for point_index, divisor in enumerate(values):
        finite_partial = _zero_ball(working_precision, "empty-finite-correction-sum")
        for step_index, common in enumerate(modular_rows[point_index]):
            if common > 1:
                finite_partial = finite_partial + field.log_integer(common) / RealBall(
                    4 ** (step_index + 1), precision_bits=working_precision
                )
        finite_ball = RealBall(
            finite_partial.lower,
            (finite_partial + finite_tail).upper,
            precision_bits=working_precision,
            rigorous=True,
            source="Mueller--Stoll batched factorization-free finite correction",
        )
        finite = FiniteHeightCorrectionResult(
            finite_ball,
            finite_partial,
            finite_tail_ball,
            selected_steps,
            {
                "finite_correction": "certified",
                "discriminant_bound_D": str(discriminant_bound),
                "modulus_exponent": selected_steps + 2,
                "raw_duplication_gcds": tuple(
                    str(value) for value in modular_rows[point_index]
                ),
                "recurrence_backend": recurrence_backend,
                "batch_point_count": point_count,
                "factorization_used": False,
                "specialized_quartic_term_counts": tuple(
                    len(table) for table in specialized_terms
                ),
                "tail_formula": "log(D)/(3*4^steps)",
            },
        )
        archimedean_partial = archimedean_partials[point_index]
        archimedean = ArchimedeanHeightCorrectionResult(
            archimedean_partial + archimedean_tail,
            archimedean_partial,
            archimedean_tail,
            selected_steps,
            {
                "archimedean_correction": "certified",
                "bounded_projective_state": True,
                "coordinate_storage": "four outward-rounded dyadic intervals",
                "recurrence_backend": recurrence_backend,
                "batch_point_count": point_count,
                "specialized_quartic_term_counts": tuple(
                    len(table) for table in specialized_terms
                ),
                "scale_logarithm_block_size": logarithm_block_size,
                "scale_logarithm_evaluations": (
                    selected_steps + logarithm_block_size - 1
                )
                // logarithm_block_size,
                "scale_logarithm_engine": "exact-outward-atanh-integer-batch",
                "scale_logarithm_precision_bits": logarithm_precision,
                "working_precision_bits": working_precision,
                "target_bits": normalized_target,
                "minimum_state_width_bits": per_point_minimum_width[point_index],
                "scale_enclosures": tuple(per_point_scale_metadata[point_index]),
                "tail_formula": "global_real_correction_bound/4^steps",
                "factorization_used": False,
            },
        )
        oracle_scales: list[str] = []
        oracle_gcds: list[str] = []
        seen = {initial_coordinates[point_index]}
        torsion_step: int | None = None
        for step_index in range(oracle_steps):
            offset = (point_index * oracle_steps + step_index) * 7
            content = oracle_values[offset]
            source_height = oracle_values[offset + 1]
            raw_height = oracle_values[offset + 2]
            normalized = cast(
                tuple[int, int, int, int],
                tuple(
                    oracle_values[offset + 3 + coordinate] for coordinate in range(4)
                ),
            )
            exact_scale = str(raw_height) + "/" + str(source_height**4)
            scale_metadata = per_point_scale_metadata[point_index][step_index]
            scale_interval = RealBall.dyadic_endpoints(
                int(scale_metadata["lower_dyadic_numerator"]),
                int(scale_metadata["dyadic_exponent"]),
                int(scale_metadata["upper_dyadic_numerator"]),
                int(scale_metadata["dyadic_exponent"]),
                precision_bits=working_precision,
                source="exact small-step dyadic-scale oracle",
            )
            if not scale_interval.contains(exact_scale):
                raise Genus2HeightResolutionError(
                    "batched normalized real iteration failed its exact small-step oracle",
                    {
                        "point": point_index,
                        "step": step_index,
                        "exact_scale": exact_scale,
                    },
                )
            if content != modular_rows[point_index][step_index]:
                raise Genus2HeightResolutionError(
                    "batched modular finite correction failed its exact small-step oracle",
                    {
                        "point": point_index,
                        "step": step_index,
                        "exact_primitive_content": str(content),
                        "modular_content": str(modular_rows[point_index][step_index]),
                    },
                )
            oracle_scales.append(exact_scale)
            oracle_gcds.append(str(content))
            if normalized in seen:
                torsion_step = step_index + 1
                break
            seen.add(normalized)
        if torsion_step is not None:
            answers.append(
                CanonicalHeightResult(
                    _zero_ball(working_precision, "exact-kummer-cycle-torsion-height"),
                    status="exact-torsion-zero",
                    steps=torsion_step,
                    provenance=divisor_provenance(divisor),
                    bounds=None,
                    diagnostics={
                        "torsion_certificate": "repeated-exact-kummer-coordinate",
                        "requested_algorithm": normalized_algorithm,
                        "selected_algorithm": "exact-small-step-torsion-oracle",
                        "requested_precision_bits": normalized_precision,
                        "target_bits": normalized_target,
                        "batch_point_count": point_count,
                        "context": context.diagnostics(),
                    },
                )
            )
            continue
        initial_naive_height = field.log_integer(initial_height_integers[point_index])
        raw_ball = initial_naive_height - finite.ball - archimedean.ball
        local_approximation = (
            initial_naive_height - finite.partial_sum - archimedean.partial_sum
        )
        zero = _zero_ball(working_precision)
        ball = RealBall(
            zero.lower if raw_ball.lower < zero.lower else raw_ball.lower,
            raw_ball.upper,
            precision_bits=working_precision,
            rigorous=True,
            source="batched Mueller--Stoll certified local Kummer correction",
        )
        achieved_width_bits = _enclosure_width_bits(ball)
        if normalized_target is not None and achieved_width_bits < normalized_target:
            raise Genus2HeightResolutionError(
                "the certified batched local height did not reach target_bits",
                {
                    "point": point_index,
                    "target_bits": normalized_target,
                    "achieved_enclosure_width_bits": achieved_width_bits,
                    "working_precision_bits": working_precision,
                    "selected_steps": selected_steps,
                },
            )
        answers.append(
            CanonicalHeightResult(
                ball,
                status="certified-enclosure",
                steps=selected_steps,
                provenance=divisor_provenance(divisor),
                bounds=bounds,
                diagnostics={
                    "algorithm": "mueller-stoll-modular-local-kummer-batch",
                    "requested_algorithm": normalized_algorithm,
                    "selected_algorithm": "local",
                    "requested_precision_bits": normalized_precision,
                    "working_precision_bits": working_precision,
                    "target_bits": normalized_target,
                    "achieved_enclosure_width_bits": achieved_width_bits,
                    "enclosure_width_bits": achieved_width_bits,
                    "initial_naive_height_integer": str(
                        initial_height_integers[point_index]
                    ),
                    "terminal_limit_approximation": local_approximation.to_dict(),
                    "finite_correction": finite.to_dict(),
                    "archimedean_correction": archimedean.to_dict(),
                    "local_corrections": {
                        "status": "certified-partial-sums-and-tails",
                        "finite_partial": finite.partial_sum.to_dict(),
                        "finite_tail_interval": finite.tail_bound.to_dict(),
                        "archimedean_partial": archimedean.partial_sum.to_dict(),
                        "archimedean_tail_interval": archimedean.tail_bound.to_dict(),
                        "raw_duplication_gcds": finite.diagnostics[
                            "raw_duplication_gcds"
                        ],
                        "factorization_used": False,
                        "telescoping_identity": (
                            "h_K(P)-hhat(P)=mu_finite(P)+mu_infinity(P)"
                        ),
                    },
                    "exact_small_step_oracle": {
                        "steps": oracle_steps,
                        "scale_ratios": tuple(oracle_scales),
                        "finite_gcds": tuple(oracle_gcds),
                        "status": "passed",
                    },
                    "batch": {
                        "point_count": point_count,
                        "shared_model_specialization": True,
                        "atomic_publication": True,
                        "stage_milliseconds": stage_milliseconds,
                    },
                    "asymptotic_state": (
                        "point-major polynomial-size modular state and bounded dyadic balls"
                    ),
                    "context": context.diagnostics(),
                },
            )
        )
    _check_height_batch_cancel(cancel, "proof-assembly-complete")
    return tuple(answers)


def _local_correction_breakdown(
    context: HeightContext,
    chain: tuple[KummerCoordinates, ...],
    bounds: AutomaticHeightBounds | None,
    precision: int,
) -> dict[str, Any]:
    """Audit finite and real correction partial sums along an exact chain."""
    cache_key: Any = None
    if bounds is not None:
        cache_key = (
            chain[0],
            len(chain) - 1,
            precision,
            str(bounds.correction_lower.lower),
            str(bounds.correction_upper.upper),
        )
        cached = context._local_corrections.get(cache_key)
        if cached is not None:
            context._local_correction_hits += 1
            return dict(cached)
    context._local_correction_misses += 1
    jacobian = context.jacobian
    if bounds is not None and bounds.diagnostics.get("automatic_bound") != "certified":
        return {
            "status": "unavailable-for-undifferentiated-supplied-total-bound",
            "reason": (
                "a total |h_K-hhat| assumption does not separately bound "
                "finite and archimedean corrections"
            ),
        }
    if (
        bounds is None
        or not jacobian.h().is_zero()
        or int(jacobian.f().degree()) != 5
        or _integer_coefficients(jacobian.f(), 6) is None
    ):
        answer = {
            "status": "unavailable-outside-classical-integral-envelope",
        }
        if cache_key is not None:
            context._local_corrections[cache_key] = answer
        return answer
    field = context.field(precision)
    finite = _zero_ball(precision, "empty-finite-local-correction")
    archimedean = _zero_ball(precision, "empty-archimedean-local-correction")
    gcd_values: list[str] = []
    epsilon_data: list[dict[str, str]] = []
    for index in range(len(chain) - 1):
        raw_pairs = [
            _rational_pair(value)
            for value in chain[index + 1].raw_coordinates_before_normalization()
        ]
        if any(denominator != 1 for _numerator, denominator in raw_pairs):
            answer = {"status": "unavailable-nonintegral-raw-duplication"}
            if cache_key is not None:
                context._local_corrections[cache_key] = answer
            return answer
        raw = tuple(numerator for numerator, _denominator in raw_pairs)
        content = 0
        for value in raw:
            content = _gcd(content, value)
        raw_height = max(abs(value) for value in raw)
        source_height = chain[index].naive_height_integer()
        weight = RealBall(4 ** (index + 1), precision_bits=precision)
        finite_term = field.log_integer(content) / weight
        archimedean_term = (
            field.log_integer(source_height) * RealBall(4)
            - field.log_integer(raw_height)
        ) / weight
        finite = finite + finite_term
        archimedean = archimedean + archimedean_term
        gcd_values.append(str(content))
        epsilon_data.append(
            {
                "step": str(index),
                "raw_content": str(content),
                "source_height": str(source_height),
                "raw_height": str(raw_height),
            }
        )

    steps = len(chain) - 1
    discriminant_bound = _mueller_stoll_discriminant_bound(jacobian.f())
    finite_tail = field.log_integer(discriminant_bound) / RealBall(
        3 * 4**steps, precision_bits=precision
    )
    # Since total correction is finite+archimedean and the finite correction
    # lies in [0,log(D)/3], the real-place correction lies in
    # [total_lower-log(D)/3,total_upper]. Scale that interval for the tail.
    archimedean_tail_lower = (
        bounds.correction_lower
        - field.log_integer(discriminant_bound) / RealBall(3, precision_bits=precision)
    ) / RealBall(4**steps, precision_bits=precision)
    archimedean_tail_upper = bounds.correction_upper / RealBall(
        4**steps, precision_bits=precision
    )
    answer = {
        "status": "certified-partial-sums-and-tails",
        "finite_partial": finite.to_dict(),
        "finite_tail_interval": RealBall(
            0,
            finite_tail.upper,
            precision_bits=precision,
            rigorous=True,
            source="Mueller--Stoll finite correction tail",
        ).to_dict(),
        "archimedean_partial": archimedean.to_dict(),
        "archimedean_tail_interval": RealBall(
            archimedean_tail_lower.lower,
            archimedean_tail_upper.upper,
            precision_bits=precision,
            rigorous=True,
            source="Stoll root-partition and Flynn L1 archimedean tail",
        ).to_dict(),
        "raw_duplication_gcds": tuple(gcd_values),
        "step_data": tuple(epsilon_data),
        "factorization_used": False,
        "telescoping_identity": (
            "h_K(P)-4^-n*h_K(2^nP)=finite_partial+archimedean_partial"
        ),
    }
    if cache_key is not None:
        context._local_corrections[cache_key] = answer
    return answer


def canonical_height(
    divisor: Any,
    *,
    steps: int = 6,
    precision: int = 100,
    target_bits: int | None = None,
    algorithm: str = "auto",
    height_difference_bound: Any = None,
    torsion_order: Any = None,
    context: HeightContext | None = None,
) -> CanonicalHeightResult:
    """Compute a certified genus-2 canonical-height enclosure.

    For primitive integral classical quintics, `algorithm="auto"` uses the
    factorization-free finite correction and normalized real-ball Kummer
    iteration whenever a target accuracy is requested or a long explicit
    chain would be needed. This path has polynomial-size modular state and
    four bounded real balls rather than exponentially growing exact
    coordinates. Small bounded calls retain the cheaper exact oracle;
    `algorithm="exact"` selects it explicitly.

    `height_difference_bound`, when supplied, is treated as an unverified
    caller assumption about `|h_K-hhat|`; exact syntax is required, but syntax
    is not a proof certificate. The resulting enclosure is therefore marked
    conditional and non-rigorous. The default classical integral envelope
    derives a theorem-backed asymmetric bound automatically.
    """
    capability = exact_divisor_capability(divisor)
    capability.require()
    steps = int(steps)
    precision = int(precision)
    algorithm = str(algorithm)
    if algorithm not in ("auto", "local", "exact"):
        raise ValueError("height algorithm must be 'auto', 'local', or 'exact'")
    if steps < 0:
        raise ValueError("height doubling steps must be nonnegative")
    if precision < 16:
        raise ValueError("height precision must be at least 16 bits")
    if target_bits is not None:
        target_bits = int(target_bits)
        if target_bits < 1:
            raise ValueError("target_bits must be positive")
    working_precision = max(
        precision,
        (target_bits + 32) if target_bits is not None else precision,
    )
    if context is None:
        context = HeightContext(divisor.parent())
    elif context.jacobian is not divisor.parent():
        raise ValueError("the height context belongs to a different Jacobian")

    if torsion_order is not None:
        if isinstance(torsion_order, bool):
            raise TypeError("torsion_order must be a positive exact integer")
        order = int(torsion_order)
        if (
            order <= 0
            or not divisor.scalar_multiple(order, algorithm="reference").is_zero()
        ):
            raise Genus2HeightResolutionError(
                "the supplied torsion order does not annihilate the divisor",
                {"torsion_order": str(order)},
            )
        return CanonicalHeightResult(
            _zero_ball(working_precision, "verified-torsion-canonical-height"),
            status="exact-torsion-zero",
            steps=0,
            provenance=divisor_provenance(divisor),
            bounds=None,
            diagnostics={
                "torsion_certificate": "verified-annihilating-multiple",
                "annihilating_multiple": str(order),
                "requested_algorithm": algorithm,
                "selected_algorithm": "verified-torsion",
                "requested_precision_bits": precision,
                "target_bits": target_bits,
                "context": context.diagnostics(),
            },
        )

    field = context.field(working_precision)
    bounds = None
    if height_difference_bound is not None:
        absolute = _exact_ball(
            height_difference_bound,
            working_precision,
            "caller-supplied-unverified-absolute-height-difference-assumption",
        )
        bounds = AutomaticHeightBounds(
            -absolute,
            absolute,
            {
                "automatic_bound": "caller-supplied",
                "proof_status": "unverified-caller-assumption",
                "required_meaning": "assumed |h_K-hhat| bound",
            },
        )
    else:
        bounds = context.automatic_bounds(working_precision)

    use_local = (
        algorithm != "exact"
        and (algorithm == "local" or target_bits is not None or steps >= 9)
        and height_difference_bound is None
        and bounds is not None
        and bounds.diagnostics.get("automatic_bound") == "certified"
    )
    if algorithm == "local" and not use_local:
        diagnostics = {} if bounds is None else bounds.diagnostics
        raise Genus2HeightCapabilityError(
            "the local height engine requires a primitive integral classical quintic",
            diagnostics,
        )

    if use_local and bounds is not None:
        selected_steps = steps
        discriminant_bound = _mueller_stoll_discriminant_bound(divisor.parent().f())
        finite_global = field.log_integer(discriminant_bound) / RealBall(
            3, precision_bits=working_precision
        )
        archimedean_global = RealBall(
            (bounds.correction_lower - finite_global).lower,
            bounds.correction_upper.upper,
            precision_bits=working_precision,
            rigorous=True,
            source="Stoll/Flynn global real-place correction bound",
        )
        if target_bits is not None:
            selected_steps = max(
                selected_steps,
                _finite_correction_steps(discriminant_bound, target_bits + 2),
                _scaled_tail_steps(archimedean_global, target_bits + 2),
            )
            # Straight interval boxes deliberately favor a small, auditable
            # state over an opaque floating orbit.  Reserve enough guard bits
            # for dependency growth through the quartic map; without this,
            # a long iteration may honestly lose separation from the
            # projective origin even though the asymptotic tail is small.
            # The fixed-scale dyadic quartic kernel loses at most a few bits
            # per normalized step on the audited classical envelope.  Four
            # bits per step plus a 48-bit reserve is both conservative on the
            # exact/Magma fixtures and materially cheaper than the former
            # generic-box seven-bit reserve.
            guarded_precision = target_bits + 4 * selected_steps + 48
            if working_precision < guarded_precision:
                working_precision = guarded_precision
                field = context.field(working_precision)
                # The automatic endpoints are exact outward rational bounds.
                # Raising the orbit precision therefore does not require
                # repeating the root-separation proof: its already certified
                # endpoint remains valid, and its rounding width is divided
                # by `4^selected_steps` in the omitted tail.
        initial = context.kummer(divisor)
        initial_height_integer = initial.naive_height_integer()
        initial_naive_height = field.log_integer(initial_height_integer)
        finite = context.finite_correction(
            divisor,
            precision=working_precision,
            steps=selected_steps,
        )
        archimedean = context.archimedean_correction(
            divisor,
            precision=working_precision,
            steps=selected_steps,
            bounds=bounds,
            target_bits=target_bits,
        )
        raw_ball = initial_naive_height - finite.ball - archimedean.ball
        local_approximation = (
            initial_naive_height - finite.partial_sum - archimedean.partial_sum
        )
        zero = _zero_ball(working_precision)
        ball = RealBall(
            zero.lower if raw_ball.lower < zero.lower else raw_ball.lower,
            raw_ball.upper,
            precision_bits=working_precision,
            rigorous=True,
            source=(
                "Mueller--Stoll factorization-free finite correction plus "
                "normalized certified real Kummer correction"
            ),
        )
        achieved_width_bits = _enclosure_width_bits(ball)
        if target_bits is not None and achieved_width_bits < target_bits:
            raise Genus2HeightResolutionError(
                "the certified local height enclosure did not reach target_bits; "
                "increase precision",
                {
                    "target_bits": target_bits,
                    "achieved_enclosure_width_bits": achieved_width_bits,
                    "working_precision_bits": working_precision,
                    "selected_steps": selected_steps,
                },
            )

        oracle_steps = min(2, selected_steps)
        oracle_coordinates = context.kummer(divisor).coordinates()
        oracle_seen = {oracle_coordinates}
        scale_enclosures = archimedean.diagnostics["scale_enclosures"]
        finite_gcds = finite.diagnostics["raw_duplication_gcds"]
        oracle_scales: list[str] = []
        oracle_gcds: list[str] = []
        oracle_terms = cast(
            tuple[
                tuple[tuple[int, int, int, int, int], ...],
                tuple[tuple[int, int, int, int, int], ...],
                tuple[tuple[int, int, int, int, int], ...],
                tuple[tuple[int, int, int, int, int], ...],
            ],
            _validated_context_specialized_terms(context),
        )
        for index in range(oracle_steps):
            source_height = max(abs(value) for value in oracle_coordinates)
            raw_coordinates = _specialized_duplication_exact(
                oracle_coordinates,
                oracle_terms,
            )
            raw_height = max(abs(value) for value in raw_coordinates)
            scale_text = str(raw_height) + "/" + str(source_height**4)
            scale_metadata = scale_enclosures[index]
            scale_interval = RealBall.dyadic_endpoints(
                int(scale_metadata["lower_dyadic_numerator"]),
                int(scale_metadata["dyadic_exponent"]),
                int(scale_metadata["upper_dyadic_numerator"]),
                int(scale_metadata["dyadic_exponent"]),
                precision_bits=working_precision,
                source="exact small-step dyadic-scale oracle",
            )
            if not scale_interval.contains(scale_text):
                raise Genus2HeightResolutionError(
                    "normalized real iteration failed its exact small-step oracle",
                    {"step": index, "exact_scale": scale_text},
                )
            content = _common_content(raw_coordinates)
            if str(content) != finite_gcds[index]:
                raise Genus2HeightResolutionError(
                    "modular finite correction failed its exact small-step oracle",
                    {
                        "step": index,
                        "exact_primitive_content": str(content),
                        "modular_content": finite_gcds[index],
                    },
                )
            oracle_scales.append(scale_text)
            oracle_gcds.append(str(content))
            oracle_coordinates = cast(
                tuple[int, int, int, int],
                tuple(value // content for value in raw_coordinates),
            )
            for value in oracle_coordinates:
                if value != 0:
                    if value < 0:
                        oracle_coordinates = cast(
                            tuple[int, int, int, int],
                            tuple(-entry for entry in oracle_coordinates),
                        )
                    break
            if oracle_coordinates in oracle_seen:
                return CanonicalHeightResult(
                    _zero_ball(working_precision, "exact-kummer-cycle-torsion-height"),
                    status="exact-torsion-zero",
                    steps=index + 1,
                    provenance=divisor_provenance(divisor),
                    bounds=None,
                    diagnostics={
                        "torsion_certificate": "repeated-exact-kummer-coordinate",
                        "requested_algorithm": algorithm,
                        "selected_algorithm": "exact-small-step-torsion-oracle",
                        "requested_precision_bits": precision,
                        "target_bits": target_bits,
                        "context": context.diagnostics(),
                    },
                )
            oracle_seen.add(oracle_coordinates)
        answer = CanonicalHeightResult(
            ball,
            status="certified-enclosure",
            steps=selected_steps,
            provenance=divisor_provenance(divisor),
            bounds=bounds,
            diagnostics={
                "algorithm": "mueller-stoll-modular-local-kummer",
                "requested_algorithm": algorithm,
                "selected_algorithm": "local",
                "requested_precision_bits": precision,
                "working_precision_bits": working_precision,
                "target_bits": target_bits,
                "achieved_enclosure_width_bits": achieved_width_bits,
                "enclosure_width_bits": achieved_width_bits,
                "initial_naive_height_integer": str(initial_height_integer),
                "terminal_limit_approximation": local_approximation.to_dict(),
                "finite_correction": finite.to_dict(),
                "archimedean_correction": archimedean.to_dict(),
                "local_corrections": {
                    "status": "certified-partial-sums-and-tails",
                    "finite_partial": finite.partial_sum.to_dict(),
                    "finite_tail_interval": finite.tail_bound.to_dict(),
                    "archimedean_partial": archimedean.partial_sum.to_dict(),
                    "archimedean_tail_interval": archimedean.tail_bound.to_dict(),
                    "raw_duplication_gcds": finite.diagnostics["raw_duplication_gcds"],
                    "factorization_used": False,
                    "telescoping_identity": (
                        "h_K(P)-hhat(P)=mu_finite(P)+mu_infinity(P)"
                    ),
                },
                "exact_small_step_oracle": {
                    "steps": oracle_steps,
                    "scale_ratios": tuple(oracle_scales),
                    "finite_gcds": tuple(oracle_gcds),
                    "status": "passed",
                },
                "asymptotic_state": (
                    "polynomial-size modular finite state and four bounded real balls"
                ),
                "context": context.diagnostics(),
            },
        )
        return answer

    chain = context.chain(divisor, steps)
    if _find_kummer_repeat(chain):
        return CanonicalHeightResult(
            _zero_ball(working_precision, "exact-kummer-cycle-torsion-height"),
            status="exact-torsion-zero",
            steps=steps,
            provenance=divisor_provenance(divisor),
            bounds=None,
            diagnostics={
                "torsion_certificate": "repeated-exact-kummer-coordinate",
                "requested_algorithm": algorithm,
                "selected_algorithm": "exact",
                "requested_precision_bits": precision,
                "target_bits": target_bits,
                "context": context.diagnostics(),
            },
        )

    terminal = chain[steps]
    height_integer = terminal.naive_height_integer()
    naive_height = field.log_integer(height_integer)
    scale = RealBall(4**steps, precision_bits=working_precision)
    terminal_approximation = naive_height / scale

    if bounds is None:
        ball = RealBall(
            terminal_approximation.lower,
            terminal_approximation.upper,
            precision_bits=working_precision,
            rigorous=False,
            source=(
                "repeated-doubling-reference-without-global-height-difference-bound"
            ),
        )
        status = "numerical-reference"
    else:
        raw_lower = (naive_height - bounds.correction_upper) / scale
        raw_upper = (naive_height - bounds.correction_lower) / scale
        zero = _zero_ball(working_precision)
        lower = zero.lower if raw_lower.lower < zero.lower else raw_lower.lower
        conditional = bounds.diagnostics.get("automatic_bound") == "caller-supplied"
        ball = RealBall(
            lower,
            raw_upper.upper,
            precision_bits=working_precision,
            rigorous=not conditional,
            source=(
                "exact Kummer repeated doubling plus certified global "
                "naive/canonical height-difference bounds"
                if not conditional
                else "exact Kummer repeated doubling conditional on an "
                "unverified caller-supplied height-difference assumption"
            ),
        )
        status = "conditional-supplied-bound" if conditional else "certified-enclosure"

    return CanonicalHeightResult(
        ball,
        status=status,
        steps=steps,
        provenance=divisor_provenance(divisor),
        bounds=bounds,
        diagnostics={
            "terminal_naive_height_integer": str(height_integer),
            "terminal_kummer_coordinates": tuple(
                str(value) for value in terminal.coordinates()
            ),
            "scale": str(4**steps),
            "algorithm": "direct-flynn-kummer-quartic-limit",
            "requested_algorithm": algorithm,
            "selected_algorithm": "exact",
            "requested_precision_bits": precision,
            "working_precision_bits": working_precision,
            "target_bits": target_bits,
            "projective_normalization": (
                "primitive-integral-gcd-after-every-exact-duplication"
            ),
            "terminal_coordinate_decimal_digits": max(
                len(str(abs(value))) for value in terminal.coordinates()
            ),
            "terminal_coordinate_bits_upper": max(
                4 * len(str(abs(value))) for value in terminal.coordinates()
            ),
            "terminal_limit_approximation": terminal_approximation.to_dict(),
            "enclosure_width_bits": _enclosure_width_bits(ball),
            "accuracy_interpretation": (
                "the enclosure_width_bits value is theorem-backed"
                if ball.rigorous
                else "the displayed width is conditional/numerical, not a proof of accuracy"
            ),
            "asymptotic_exact_growth": (
                "coordinate bit size is expected to quadruple per exact step; "
                "HeightContext enforces a pre-duplication resource budget"
            ),
            "local_corrections": _local_correction_breakdown(
                context, chain, bounds, working_precision
            ),
            "context": context.diagnostics(),
        },
    )


class HeightPairingResult(_SealedRecord):
    """A symmetric Neron--Tate pairing matrix with proof state."""

    def __init__(
        self,
        matrix: tuple[tuple[RealBall, ...], ...],
        height_results: tuple[CanonicalHeightResult, ...],
        diagnostics: dict[str, Any],
        _encoded_diagnostics: Any = None,
        _ball_encoder: Any = _ball_data,
    ) -> None:
        self._matrix_data = tuple(
            tuple(_ball_encoder(entry) for entry in row) for row in matrix
        )
        self._height_results = tuple(height_results)
        self._diagnostics = (
            _freeze_data(diagnostics)
            if _encoded_diagnostics is None
            else _EncodedFrozenDict(_encoded_diagnostics[1])
        )
        self._rigorous = all(entry.rigorous for row in self._matrix for entry in row)
        self._seal()

    matrix = _closed_ball_matrix_property()

    @property
    def _matrix(self) -> tuple[tuple[RealBall, ...], ...]:
        return self.matrix

    @property
    def height_results(self) -> tuple[CanonicalHeightResult, ...]:
        return tuple(self._height_results)

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))

    @property
    def rigorous(self) -> bool:
        return self._rigorous

    def transform(self, basis_matrix: Any) -> HeightPairingResult:
        """Return `M^T H M` for an exact integral change-of-basis matrix."""
        size = len(self._matrix)
        rows = [list(row) for row in basis_matrix]
        if len(rows) != size or any(len(row) != size for row in rows):
            raise ValueError("a pairing basis transform must be square of full rank")
        integers: list[list[int]] = []
        for row in rows:
            values: list[int] = []
            for entry in row:
                if isinstance(entry, bool):
                    raise TypeError("a pairing basis transform must be integral")
                value = int(entry)
                if value != entry:
                    raise TypeError("a pairing basis transform must be integral")
                values.append(value)
            integers.append(values)
        precision = 100
        if size:
            precision = self._matrix[0][0].precision_bits
        transformed: list[list[RealBall]] = []
        for left in range(size):
            output_row: list[RealBall] = []
            for right in range(size):
                total = _zero_ball(precision)
                for first in range(size):
                    for second in range(size):
                        coefficient = integers[first][left] * integers[second][right]
                        if coefficient:
                            total = total + self._matrix[first][second] * RealBall(
                                coefficient, precision_bits=precision
                            )
                output_row.append(total)
            transformed.append(output_row)
        return HeightPairingResult(
            tuple(tuple(row) for row in transformed),
            self._height_results,
            {
                "algorithm": "exact-integral-M-transpose-H-M",
                "basis_matrix": tuple(tuple(row) for row in integers),
                "source_pairing": self.diagnostics,
                "steps": int(self._diagnostics.get("steps", 0)),
                "precision_bits": int(
                    self._diagnostics.get("precision_bits", precision)
                ),
                "target_bits": self._diagnostics.get("target_bits"),
                "requested_algorithm": str(
                    self._diagnostics.get("requested_algorithm", "auto")
                ),
                "context": _copy_data(self._diagnostics.get("context", {})),
            },
        )

    def verify(
        self,
        points: Any,
        *,
        height_difference_bound: Any = None,
    ) -> bool:
        """Strictly replay every height used to construct this pairing."""
        steps = int(self._diagnostics.get("steps", 0))
        precision = int(self._diagnostics.get("precision_bits", 100))
        context_data = self._diagnostics.get("context", {})
        point_values = tuple(points)
        if not point_values:
            replay_context = None
        else:
            replay_context = HeightContext(
                point_values[0].parent(),
                max_exact_coordinate_bits=int(
                    context_data.get("max_exact_coordinate_bits", 100000)
                ),
            )
        replay = height_pairing(
            point_values,
            steps=steps,
            precision=precision,
            target_bits=self._diagnostics.get("target_bits"),
            algorithm=str(self._diagnostics.get("requested_algorithm", "auto")),
            height_difference_bound=height_difference_bound,
            context=replay_context,
        )
        if self._diagnostics.get("algorithm") == "exact-integral-M-transpose-H-M":
            replay = replay.transform(self._diagnostics["basis_matrix"])
        if len(replay._matrix) != len(self._matrix):
            raise Genus2HeightResolutionError(
                "height-pairing strict replay changed matrix size",
                {"stored": self.to_dict(), "replayed": replay.to_dict()},
            )
        if replay._rigorous != self._rigorous:
            raise Genus2HeightResolutionError(
                "height-pairing strict replay changed the rigor state",
                {"stored": self.to_dict(), "replayed": replay.to_dict()},
            )
        for row in range(len(self._matrix)):
            for column in range(len(self._matrix)):
                if not _same_ball(
                    replay._matrix[row][column], self._matrix[row][column]
                ):
                    raise Genus2HeightResolutionError(
                        "height-pairing strict replay did not reproduce the record",
                        {"stored": self.to_dict(), "replayed": replay.to_dict()},
                    )
        return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-height-pairing.v1",
            "normalization": "Cassels-Flynn 2Theta principal-polarization pairing",
            "convention": "<P,Q>=(hhat(P+Q)-hhat(P)-hhat(Q))/2",
            "rigorous": self._rigorous,
            "matrix": tuple(
                tuple(entry.to_dict() for entry in row) for row in self._matrix
            ),
            "diagnostics": self.diagnostics,
        }

    __getitem__ = _closed_ball_matrix_getitem()

    def __len__(self) -> int:
        return len(self._matrix)

    def __repr__(self) -> str:
        return "HeightPairingResult(" + repr(self.matrix) + ")"


def height_pairing(
    points: Any,
    *,
    steps: int = 6,
    precision: int = 100,
    target_bits: int | None = None,
    algorithm: str = "auto",
    height_difference_bound: Any = None,
    context: HeightContext | None = None,
    cancel: Any = None,
) -> HeightPairingResult:
    """Return the symmetric canonical pairing on rational genus-2 divisors."""
    _check_height_batch_cancel(cancel, "pairing-entry")
    values = tuple(points)
    if not values:
        return HeightPairingResult((), (), {"algorithm": "empty-pairing"})
    jacobian = values[0].parent()
    for value in values:
        if value.parent() is not jacobian:
            raise ValueError("all pairing points must lie on the same Jacobian")
    if context is None:
        context = HeightContext(jacobian)
    elif context.jacobian is not jacobian:
        raise ValueError("the height context belongs to a different Jacobian")
    diagonal = tuple(
        canonical_height(
            value,
            steps=steps,
            precision=precision,
            target_bits=target_bits,
            algorithm=algorithm,
            height_difference_bound=height_difference_bound,
            context=context,
        )
        for value in values
    )
    _check_height_batch_cancel(cancel, "pairing-diagonal")
    two = RealBall(2, precision_bits=int(precision))
    matrix: list[list[RealBall]] = [
        [_zero_ball(int(precision)) for _right in values] for _left in values
    ]
    off_diagonal: list[dict[str, Any]] = []
    for left, _left_value in enumerate(values):
        matrix[left][left] = diagonal[left].ball
        for right in range(left + 1, len(values)):
            _check_height_batch_cancel(cancel, "pairing-off-diagonal")
            sum_height = canonical_height(
                values[left] + values[right],
                steps=steps,
                precision=precision,
                target_bits=target_bits,
                algorithm=algorithm,
                height_difference_bound=height_difference_bound,
                context=context,
            )
            entry = (sum_height.ball - diagonal[left].ball - diagonal[right].ball) / two
            matrix[left][right] = entry
            matrix[right][left] = entry
            off_diagonal.append(
                {
                    "left": left,
                    "right": right,
                    "sum_height": sum_height.to_dict(),
                }
            )
    answer = HeightPairingResult(
        tuple(tuple(row) for row in matrix),
        diagonal,
        {
            "algorithm": "quadratic-height-polarization",
            "steps": int(steps),
            "precision_bits": int(precision),
            "target_bits": target_bits,
            "requested_algorithm": str(algorithm),
            "off_diagonal_height_data": tuple(off_diagonal),
            "context": context.diagnostics(),
        },
    )
    return answer


def _install_height_proof_state(
    automatic_bounds_function: Any,
    normalized_archimedean_function: Any,
    canonical_height_function: Any,
    height_pairing_function: Any,
    canonical_height_batch_function: Any,
) -> tuple[Any, Any, Any, Any]:
    """Install non-exported proof registries and detached result caches.

    Python module-private names are a naming convention, not an authentication
    boundary.  The mutable registries and every decision that can preserve
    `rigorous=True` therefore live only in this closure.  Automatic bounds are
    authenticated structurally against a bounded set of theorem-source
    payloads keyed by the complete live model and precision; public copies do
    not consume proof-state capacity.  A missing source is safely rederived
    from the captured theorem implementation.  Cached height and pairing
    payloads contain only integer endpoint pairs and recursively primitive
    diagnostics, and a fresh sealed public record is reconstructed on every
    egress.
    """
    automatic_sources: list[tuple[Any, int, Any]] = []
    canonical_records: list[tuple[Any, Any, Any, Any, Any, Any, Any]] = []
    staged_canonical_records: list[tuple[Any, Any, Any, Any, Any, Any, Any]] = []
    active_pairing_contexts: list[Any] = []
    cancellation_callback_contexts: list[Any] = []
    pairing_records: list[tuple[Any, Any, Any, Any, Any, Any, Any]] = []
    maximum_records = 512

    automatic_bounds_type = AutomaticHeightBounds
    canonical_result_type = CanonicalHeightResult
    pairing_result_type = HeightPairingResult
    encoded_frozen_dict_type = _EncodedFrozenDict
    frozen_dict_type = _FrozenDict
    rational_pair_function = _rational_pair
    specialized_terms_function = classical_duplication_specialized_terms
    ball_from_data_function = _ball_from_data

    def encode_primitive(value: Any) -> Any:
        """Encode diagnostics without retaining caller-reachable containers."""
        if isinstance(value, encoded_frozen_dict_type):
            return (
                "dict",
                tuple(
                    (key, encode_primitive(decode_primitive(entry)))
                    for key, entry in value._encoded_items
                ),
            )
        if isinstance(value, frozen_dict_type):
            return (
                "dict",
                tuple((key, encode_primitive(entry)) for key, entry in value.items()),
            )
        if isinstance(value, dict):
            return (
                "dict",
                tuple((key, encode_primitive(entry)) for key, entry in value.items()),
            )
        if isinstance(value, (tuple, list)):
            return ("tuple", tuple(encode_primitive(entry) for entry in value))
        if value is None or isinstance(value, (bool, int, str)):
            return ("scalar", value)
        # Height diagnostics are specified to be JSON-like.  Reject an
        # unexpected mutable scalar rather than retaining it in proof state.
        raise TypeError("height proof diagnostics must contain primitive data")

    def decode_primitive(value: Any) -> Any:
        kind, payload = value
        if kind == "dict":
            return {key: decode_primitive(entry) for key, entry in payload}
        if kind == "tuple":
            return tuple(decode_primitive(entry) for entry in payload)
        return payload

    def replace_encoded_dictionary(value: Any, key: str, replacement: Any) -> Any:
        kind, items = value
        if kind != "dict":
            raise TypeError("encoded proof diagnostics must be a dictionary")
        encoded_replacement = encode_primitive(replacement)
        output = []
        found = False
        for stored_key, stored_value in items:
            if stored_key == key:
                output.append((stored_key, encoded_replacement))
                found = True
            else:
                output.append((stored_key, stored_value))
        if not found:
            output.append((key, encoded_replacement))
        return ("dict", tuple(output))

    def model_binding(jacobian: Any) -> tuple[Any, ...]:
        f_value = jacobian.f()
        h_value = jacobian.h()
        return (
            str(f_value.parent().base_ring()),
            int(jacobian.dimension()),
            max(int(f_value.degree()), 2 * int(h_value.degree())),
            tuple(rational_pair_function(value) for value in f_value.list()),
            tuple(rational_pair_function(value) for value in h_value.list()),
        )

    def point_binding(divisor: Any) -> Any:
        u_value, v_value = divisor.uv()
        return (
            tuple(rational_pair_function(value) for value in u_value.list()),
            tuple(rational_pair_function(value) for value in v_value.list()),
        )

    def validated_context_terms(context: Any) -> Any:
        expected = specialized_terms_function(context.jacobian)
        if context._classical_duplication_terms != expected:
            raise Genus2HeightCapabilityError(
                "cached Flynn tables do not match the exact Jacobian model",
                {"specialized_quartics": "rejected-mutated-height-context"},
            )
        return expected

    def detached_ball_data(data: Any) -> tuple[Any, Any, int, bool, Any]:
        return (
            (int(data[0][0]), int(data[0][1])),
            (int(data[1][0]), int(data[1][1])),
            int(data[2]),
            bool(data[3]),
            encode_primitive(decode_primitive(data[4])),
        )

    def bound_payload(bound: AutomaticHeightBounds) -> tuple[Any, Any, Any]:
        return (
            detached_ball_data(bound._correction_lower_data),
            detached_ball_data(bound._correction_upper_data),
            encode_primitive(bound._diagnostics),
        )

    def source_record(binding: Any, precision: int) -> Any:
        for record in reversed(automatic_sources):
            if record[0] == binding and record[1] == precision:
                return record
        return None

    def register_source(
        bound: AutomaticHeightBounds, jacobian: Any, precision: int
    ) -> Any:
        binding = model_binding(jacobian)
        payload = bound_payload(bound)
        diagnostics = decode_primitive(payload[2])
        if (
            diagnostics.get("automatic_bound") != "certified"
            or int(diagnostics.get("precision_bits", -1)) != precision
            or not payload[0][3]
            or not payload[1][3]
        ):
            raise Genus2HeightCapabilityError(
                "automatic height-bound theorem returned an invalid proof payload",
                {"automatic_bound": "rejected-invalid-theorem-payload"},
            )
        for index, record in enumerate(automatic_sources):
            if record[0] == binding and record[1] == precision:
                automatic_sources[index] = (binding, precision, payload)
                return payload
        automatic_sources.append((binding, precision, payload))
        if len(automatic_sources) > maximum_records:
            automatic_sources.pop(0)
        return payload

    def theorem_source(jacobian: Any, precision: int) -> Any:
        binding = model_binding(jacobian)
        record = source_record(binding, precision)
        if record is not None:
            return record[2]
        derived = automatic_bounds_function(jacobian, precision=precision)
        return register_source(derived, jacobian, precision)

    def bound_is_certified(bound: AutomaticHeightBounds, jacobian: Any) -> bool:
        if not isinstance(bound, automatic_bounds_type):
            return False
        try:
            payload = bound_payload(bound)
            diagnostics = decode_primitive(payload[2])
            precision = int(diagnostics.get("precision_bits", -1))
            if diagnostics.get("automatic_bound") != "certified" or precision < 16:
                return False
            return payload == theorem_source(jacobian, precision)
        except Exception:
            return False

    def restore_bound(payload: Any, jacobian: Any) -> AutomaticHeightBounds:
        candidate = automatic_bounds_type(
            ball_from_data_function(payload[0]),
            ball_from_data_function(payload[1]),
            decode_primitive(payload[2]),
        )
        if not bound_is_certified(candidate, jacobian):
            raise Genus2HeightCapabilityError(
                "cached automatic bounds no longer match their exact theorem source",
                {"automatic_bound": "rejected-proof-binding-mismatch"},
            )
        return candidate

    def wrapped_automatic_bounds(
        jacobian: Any, *, precision: int = 100
    ) -> AutomaticHeightBounds:
        answer = automatic_bounds_function(jacobian, precision=precision)
        register_source(answer, jacobian, int(precision))
        return answer

    def wrapped_normalized_archimedean_correction(
        divisor: Any,
        *,
        precision: int = 80,
        steps: int | None = None,
        target_bits: int | None = None,
        bounds: AutomaticHeightBounds | None = None,
        specialized_terms: Any = None,
    ) -> ArchimedeanHeightCorrectionResult:
        jacobian = divisor.parent()
        checked_bounds = bounds
        if checked_bounds is None:
            checked_bounds = wrapped_automatic_bounds(
                jacobian, precision=int(precision)
            )
        if not bound_is_certified(checked_bounds, jacobian):
            raise Genus2HeightCapabilityError(
                "normalized real correction requires model-bound automatic bounds",
                checked_bounds.diagnostics,
            )
        return normalized_archimedean_function(
            divisor,
            precision=precision,
            steps=steps,
            target_bits=target_bits,
            bounds=checked_bounds,
            specialized_terms=specialized_terms,
        )

    def canonical_payload(result: CanonicalHeightResult) -> tuple[Any, ...]:
        return (
            detached_ball_data(result._ball_data),
            str(result._status),
            int(result._steps),
            encode_primitive(result._provenance),
            None if result._bounds is None else bound_payload(result._bounds),
            encode_primitive(result._diagnostics),
        )

    def restore_canonical(
        payload: Any, jacobian: Any, context: HeightContext
    ) -> CanonicalHeightResult:
        encoded_diagnostics = replace_encoded_dictionary(
            payload[5], "context", context.diagnostics()
        )
        bounds = None
        if payload[4] is not None:
            bounds = restore_bound(payload[4], jacobian)
        return canonical_result_type(
            ball_from_data_function(payload[0]),
            status=payload[1],
            steps=payload[2],
            provenance=decode_primitive(payload[3]),
            bounds=bounds,
            diagnostics={},
            _encoded_diagnostics=encoded_diagnostics,
        )

    def cached_canonical(
        cache_context: HeightContext,
        divisor: Any,
        parameters: tuple[Any, ...],
        *,
        count_hit: bool,
    ) -> CanonicalHeightResult | None:
        expected_terms = validated_context_terms(cache_context)
        exact_model_binding = model_binding(divisor.parent())
        exact_point_binding = point_binding(divisor)
        for records, published in (
            (staged_canonical_records, False),
            (canonical_records, True),
        ):
            for record in reversed(records):
                if (
                    record[0] is cache_context
                    and record[2] == parameters
                    and (record[1] is divisor or record[1] == divisor)
                ):
                    if (
                        record[3] != exact_model_binding
                        or record[4] != exact_point_binding
                        or record[5] != expected_terms
                    ):
                        raise Genus2HeightCapabilityError(
                            "cached canonical height derivation does not match the exact request",
                            {
                                "canonical_height_cache": "rejected-proof-binding-mismatch",
                                "parameters": parameters,
                            },
                        )
                    if count_hit and published:
                        cache_context._canonical_height_hits += 1
                    return restore_canonical(record[6], divisor.parent(), cache_context)
        return None

    def canonical_record(
        cache_context: HeightContext,
        divisor: Any,
        parameters: tuple[Any, ...],
        answer: CanonicalHeightResult,
    ) -> tuple[Any, ...] | None:
        if not (
            answer.rigorous
            and answer.status == "certified-enclosure"
            and answer.diagnostics.get("selected_algorithm") == "local"
        ):
            return None
        expected_terms = validated_context_terms(cache_context)
        if answer._bounds is None or not bound_is_certified(
            answer._bounds, divisor.parent()
        ):
            raise Genus2HeightCapabilityError(
                "a rigorous local height result lost its automatic-bound proof",
                {"canonical_height_cache": "rejected-unproved-result-bound"},
            )
        return (
            cache_context,
            divisor,
            parameters,
            model_binding(divisor.parent()),
            point_binding(divisor),
            expected_terms,
            canonical_payload(answer),
        )

    def publish_canonical_records(records: tuple[Any, ...]) -> None:
        """Atomically publish already authenticated detached payloads."""
        canonical_records.extend(records)
        for record in records:
            record[0]._canonical_height_entries += 1
        while len(canonical_records) > maximum_records:
            removed = canonical_records.pop(0)
            removed[0]._canonical_height_entries = max(
                0, removed[0]._canonical_height_entries - 1
            )

    def commit_pairing_transaction(
        new_canonical_records: tuple[Any, ...],
        new_pairing_record: Any,
        canonical_misses: int,
    ) -> None:
        """Commit detached canonical and pairing records without user code."""
        next_canonical = canonical_records + list(new_canonical_records)
        removed_canonical = tuple(
            next_canonical[: max(0, len(next_canonical) - maximum_records)]
        )
        next_canonical = next_canonical[-maximum_records:]
        next_pairing = pairing_records + [new_pairing_record]
        removed_pairing = tuple(
            next_pairing[: max(0, len(next_pairing) - maximum_records)]
        )
        next_pairing = next_pairing[-maximum_records:]
        # Both replacement lists are fully allocated before either hidden
        # registry changes.  No callback, theorem derivation, or public object
        # access occurs between these two slice assignments.
        canonical_records[:] = next_canonical
        pairing_records[:] = next_pairing
        for record in new_canonical_records:
            record[0]._canonical_height_entries += 1
        new_pairing_record[0]._height_pairing_entries += 1
        for record in removed_canonical:
            record[0]._canonical_height_entries = max(
                0, record[0]._canonical_height_entries - 1
            )
        for record in removed_pairing:
            record[0]._height_pairing_entries = max(
                0, record[0]._height_pairing_entries - 1
            )
        new_pairing_record[0]._canonical_height_misses += canonical_misses
        new_pairing_record[0]._height_pairing_misses += 1

    def wrapped_canonical_height(
        divisor: Any,
        *,
        steps: int = 6,
        precision: int = 100,
        target_bits: int | None = None,
        algorithm: str = "auto",
        height_difference_bound: Any = None,
        torsion_order: Any = None,
        context: HeightContext | None = None,
    ) -> CanonicalHeightResult:
        normalized_steps = int(steps)
        normalized_precision = int(precision)
        normalized_target = None if target_bits is None else int(target_bits)
        normalized_algorithm = str(algorithm)
        parameters = (
            normalized_steps,
            normalized_precision,
            normalized_target,
            normalized_algorithm,
        )
        if context is not None and any(
            callback_context is context
            for callback_context in cancellation_callback_contexts
        ):
            raise Genus2HeightCapabilityError(
                "a cancellation callback cannot reenter canonical-height proof state "
                "on the active context",
                {"height_proof_transaction": "rejected-same-context-reentrancy"},
            )
        eligible = (
            context is not None
            and height_difference_bound is None
            and torsion_order is None
            and (
                normalized_algorithm == "local"
                or normalized_target is not None
                or normalized_steps >= 9
            )
        )
        if eligible:
            cache_context = cast(HeightContext, context)
            if cache_context.jacobian is not divisor.parent():
                raise ValueError("the height context belongs to a different Jacobian")
            cached = cached_canonical(
                cache_context, divisor, parameters, count_hit=True
            )
            if cached is not None:
                return cached
            cache_context._canonical_height_misses += 1
        if (
            context is not None
            and height_difference_bound is None
            and torsion_order is None
        ):
            cache_context = context
            working_precision = max(
                normalized_precision,
                (
                    normalized_target + 32
                    if normalized_target is not None
                    else normalized_precision
                ),
            )
            candidate_bounds = cache_context.automatic_bounds(working_precision)
            if candidate_bounds is not None and not bound_is_certified(
                candidate_bounds, divisor.parent()
            ):
                raise Genus2HeightCapabilityError(
                    "a rigorous height requires model-bound automatic bounds",
                    candidate_bounds.diagnostics,
                )
            if eligible and candidate_bounds is None:
                raise Genus2HeightCapabilityError(
                    "the local height engine requires model-bound automatic bounds",
                    {},
                )
        answer = canonical_height_function(
            divisor,
            steps=steps,
            precision=precision,
            target_bits=target_bits,
            algorithm=algorithm,
            height_difference_bound=height_difference_bound,
            torsion_order=torsion_order,
            context=context,
        )
        if eligible:
            cache_context = cast(HeightContext, context)
            record = canonical_record(cache_context, divisor, parameters, answer)
            if record is not None:
                if any(
                    active_context is cache_context
                    for active_context in active_pairing_contexts
                ):
                    staged_canonical_records.append(record)
                else:
                    publish_canonical_records((record,))
        return answer

    def pairing_payload(result: HeightPairingResult) -> tuple[Any, ...]:
        return (
            tuple(
                tuple(detached_ball_data(entry) for entry in row)
                for row in result._matrix_data
            ),
            tuple(canonical_payload(value) for value in result._height_results),
            encode_primitive(result._diagnostics),
        )

    def restore_pairing(
        payload: Any, jacobian: Any, context: HeightContext
    ) -> HeightPairingResult:
        encoded_diagnostics = replace_encoded_dictionary(
            payload[2], "context", context.diagnostics()
        )
        return pairing_result_type(
            tuple(
                tuple(ball_from_data_function(entry) for entry in row)
                for row in payload[0]
            ),
            tuple(restore_canonical(value, jacobian, context) for value in payload[1]),
            {},
            _encoded_diagnostics=encoded_diagnostics,
        )

    def wrapped_height_pairing(
        points: Any,
        *,
        steps: int = 6,
        precision: int = 100,
        target_bits: int | None = None,
        algorithm: str = "auto",
        height_difference_bound: Any = None,
        context: HeightContext | None = None,
        cancel: Any = None,
    ) -> HeightPairingResult:
        _check_height_batch_cancel(cancel, "pairing-proof-entry")
        values = tuple(points)
        parameters = (
            int(steps),
            int(precision),
            None if target_bits is None else int(target_bits),
            str(algorithm),
        )
        eligible = (
            bool(values)
            and context is not None
            and height_difference_bound is None
            and (
                parameters[3] == "local"
                or parameters[2] is not None
                or parameters[0] >= 9
            )
        )
        if context is not None and any(
            active_context is context for active_context in active_pairing_contexts
        ):
            raise Genus2HeightCapabilityError(
                "a height pairing cannot reenter proof state on its active context",
                {"height_proof_transaction": "rejected-same-context-reentrancy"},
            )
        if not eligible:
            return height_pairing_function(
                values,
                steps=steps,
                precision=precision,
                target_bits=target_bits,
                algorithm=algorithm,
                height_difference_bound=height_difference_bound,
                context=context,
                cancel=cancel,
            )

        cache_context = cast(HeightContext, context)
        jacobian = values[0].parent()
        if cache_context.jacobian is not jacobian:
            raise ValueError("the height context belongs to a different Jacobian")
        for value in values:
            if value.parent() is not jacobian:
                raise ValueError("all pairing points must lie on the same Jacobian")
        expected_terms = validated_context_terms(cache_context)
        exact_model_binding = model_binding(jacobian)
        point_bindings = tuple(point_binding(value) for value in values)
        for record in reversed(pairing_records):
            if (
                record[0] is cache_context
                and record[2] == parameters
                and record[1] == values
            ):
                if (
                    record[3] != exact_model_binding
                    or record[4] != point_bindings
                    or record[5] != expected_terms
                ):
                    raise Genus2HeightCapabilityError(
                        "cached height pairing derivation does not match the exact request",
                        {
                            "height_pairing_cache": "rejected-proof-binding-mismatch",
                            "ordered_basis_size": len(values),
                            "parameters": parameters,
                        },
                    )
                cache_context._height_pairing_hits += 1
                return restore_pairing(record[6], jacobian, cache_context)

        counter_snapshot = (
            cache_context._canonical_height_entries,
            cache_context._canonical_height_hits,
            cache_context._canonical_height_misses,
            cache_context._height_pairing_entries,
            cache_context._height_pairing_hits,
            cache_context._height_pairing_misses,
        )
        stage_start = len(staged_canonical_records)
        active_pairing_contexts.append(cache_context)
        transaction_cancel = cancel
        if cancel is not None:

            def guarded_transaction_cancel() -> bool:
                cancellation_callback_contexts.append(cache_context)
                try:
                    return bool(cancel())
                finally:
                    cancellation_callback_contexts.pop()

            transaction_cancel = guarded_transaction_cancel
        batch_misses = 0
        committed = False
        try:
            if parameters[3] != "exact":
                requested_heights: list[Any] = list(values)
                for left in range(len(values)):
                    for right in range(left + 1, len(values)):
                        requested_heights.append(values[left] + values[right])
                unique_heights: list[Any] = []
                for value in requested_heights:
                    if not any(value == stored for stored in unique_heights):
                        unique_heights.append(value)
                missing = tuple(
                    value
                    for value in unique_heights
                    if cached_canonical(
                        cache_context, value, parameters, count_hit=False
                    )
                    is None
                )
                if missing:
                    batch_answers = canonical_height_batch_function(
                        missing,
                        steps=parameters[0],
                        precision=parameters[1],
                        target_bits=parameters[2],
                        algorithm=parameters[3],
                        context=cache_context,
                        cancel=transaction_cancel,
                    )
                    batch_misses = len(missing)
                    for value, batch_answer in zip(missing, batch_answers, strict=True):
                        record = canonical_record(
                            cache_context, value, parameters, batch_answer
                        )
                        if record is not None:
                            staged_canonical_records.append(record)
                        elif batch_answer.status != "exact-torsion-zero":
                            raise Genus2HeightCapabilityError(
                                "a batched local height did not produce an authenticated proof payload",
                                {
                                    "status": batch_answer.status,
                                    "point": point_binding(value),
                                },
                            )
            answer = height_pairing_function(
                values,
                steps=steps,
                precision=precision,
                target_bits=target_bits,
                algorithm=algorithm,
                height_difference_bound=height_difference_bound,
                context=context,
                cancel=transaction_cancel,
            )
            if not answer.rigorous:
                return answer
            expected_terms = validated_context_terms(cache_context)
            pairing_record = (
                cache_context,
                values,
                parameters,
                model_binding(jacobian),
                tuple(point_binding(value) for value in values),
                expected_terms,
                pairing_payload(answer),
            )
            _check_height_batch_cancel(transaction_cancel, "pairing-proof-commit")
            commit_pairing_transaction(
                tuple(staged_canonical_records[stage_start:]),
                pairing_record,
                batch_misses,
            )
            committed = True
            return answer
        finally:
            active_pairing_contexts.pop()
            del staged_canonical_records[stage_start:]
            if not committed:
                (
                    cache_context._canonical_height_entries,
                    cache_context._canonical_height_hits,
                    cache_context._canonical_height_misses,
                    cache_context._height_pairing_entries,
                    cache_context._height_pairing_hits,
                    cache_context._height_pairing_misses,
                ) = counter_snapshot

    return (
        wrapped_automatic_bounds,
        wrapped_normalized_archimedean_correction,
        wrapped_canonical_height,
        wrapped_height_pairing,
    )


(
    automatic_height_bounds,
    normalized_archimedean_correction,
    canonical_height,
    height_pairing,
) = _install_height_proof_state(
    automatic_height_bounds,
    normalized_archimedean_correction,
    canonical_height,
    height_pairing,
    _canonical_heights_uncached_local_batch,
)
# The proof-grade batch function and its closed dependency tuple are retained
# only by `_install_height_proof_state`; module-private naming alone is not an
# authentication boundary in Sage/Python code.
del _canonical_heights_uncached_local_batch


def _interval_determinant(matrix: tuple[tuple[RealBall, ...], ...]) -> RealBall:
    size = len(matrix)
    if size == 0:
        return _one_ball(100, "rank-zero-regulator")
    precision = matrix[0][0].precision_bits
    states: dict[int, RealBall] = {0: _one_ball(precision)}

    def popcount(value: int) -> int:
        count = 0
        while value:
            count += value & 1
            value >>= 1
        return count

    for row in range(size):
        next_states: dict[int, RealBall] = {}
        for mask, coefficient in states.items():
            for column in range(size):
                bit = 1 << column
                if mask & bit:
                    continue
                inversions = row - popcount(mask & (bit - 1))
                term = coefficient * matrix[row][column]
                if inversions % 2:
                    term = -term
                new_mask = mask | bit
                previous = next_states.get(new_mask)
                next_states[new_mask] = term if previous is None else previous + term
        states = next_states
    return states[(1 << size) - 1]


class RegulatorResult(_SealedRecord):
    """The determinant of a computed canonical height pairing."""

    def __init__(
        self,
        ball: RealBall,
        pairing: HeightPairingResult,
        status: str,
        diagnostics: dict[str, Any],
        _ball_encoder: Any = _ball_data,
    ) -> None:
        self._ball_data = _ball_encoder(ball)
        self._pairing = pairing
        self._status = str(status)
        self._diagnostics = _freeze_data(diagnostics)
        self._rigorous = bool(ball.rigorous)
        self._seal()

    ball = _closed_ball_property("_ball_data")

    @property
    def _ball(self) -> RealBall:
        return self.ball

    @property
    def pairing(self) -> HeightPairingResult:
        return self._pairing

    @property
    def status(self) -> str:
        return self._status

    @property
    def diagnostics(self) -> dict[str, Any]:
        return cast(dict[str, Any], _copy_data(self._diagnostics))

    @property
    def rigorous(self) -> bool:
        return self._rigorous

    def transform_index(self, index: Any) -> RegulatorResult:
        """Scale for a subgroup basis of determinant/index `index`."""
        if isinstance(index, bool):
            raise TypeError("a subgroup index must be a positive exact integer")
        value = int(index)
        if value <= 0 or value != index:
            raise ValueError("a subgroup index must be a positive exact integer")
        scaled = self._ball * RealBall(
            value * value, precision_bits=self._ball.precision_bits
        )
        return RegulatorResult(
            scaled,
            self._pairing,
            self._status,
            {
                "algorithm": "regulator-index-square-scaling",
                "subgroup_index": str(value),
                "source_regulator": self.diagnostics,
            },
        )

    def verify(
        self,
        points: Any,
        *,
        height_difference_bound: Any = None,
    ) -> bool:
        """Strictly replay the pairing and determinant behind this regulator."""
        steps = int(self._pairing._diagnostics.get("steps", 0))
        precision = int(self._pairing._diagnostics.get("precision_bits", 100))
        context_data = self._pairing._diagnostics.get("context", {})
        point_values = tuple(points)
        if not point_values:
            replay_context = None
        else:
            replay_context = HeightContext(
                point_values[0].parent(),
                max_exact_coordinate_bits=int(
                    context_data.get("max_exact_coordinate_bits", 100000)
                ),
            )
        replay = regulator(
            point_values,
            steps=steps,
            precision=precision,
            target_bits=self._pairing._diagnostics.get("target_bits"),
            algorithm=str(
                self._pairing._diagnostics.get("requested_algorithm", "auto")
            ),
            height_difference_bound=height_difference_bound,
            context=replay_context,
        )
        if self._diagnostics.get("algorithm") == "regulator-index-square-scaling":
            replay = replay.transform_index(int(self._diagnostics["subgroup_index"]))
        if (
            replay._status != self._status
            or replay._rigorous != self._rigorous
            or not _same_ball(replay._ball, self._ball)
        ):
            raise Genus2HeightResolutionError(
                "regulator strict replay did not reproduce the record",
                {"stored": self.to_dict(), "replayed": replay.to_dict()},
            )
        return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.hyperelliptic.genus2-regulator.v1",
            "status": self._status,
            "rigorous": self._rigorous,
            "rank": len(self._pairing),
            "enclosure": self._ball.to_dict(),
            "pairing": self._pairing.to_dict(),
            "diagnostics": self.diagnostics,
        }

    def __repr__(self) -> str:
        return (
            "RegulatorResult(" + repr(self.ball) + ", status=" + repr(self.status) + ")"
        )


def regulator(
    points: Any,
    *,
    steps: int = 6,
    precision: int = 100,
    target_bits: int | None = None,
    algorithm: str = "auto",
    height_difference_bound: Any = None,
    context: HeightContext | None = None,
    cancel: Any = None,
) -> RegulatorResult:
    """Return the canonical regulator, rejecting certified degeneracy."""
    pairing = height_pairing(
        points,
        steps=steps,
        precision=precision,
        target_bits=target_bits,
        algorithm=algorithm,
        height_difference_bound=height_difference_bound,
        context=context,
        cancel=cancel,
    )
    determinant = _interval_determinant(pairing.matrix)
    if pairing.rigorous and determinant.contains_zero():
        raise Genus2HeightResolutionError(
            "the certified pairing enclosure does not prove independence; "
            "increase doubling steps within the exact bit budget or improve "
            "the theorem-backed automatic model bound",
            {
                "status": "unresolved-independence",
                "determinant": determinant.to_dict(),
                "pairing": pairing.to_dict(),
            },
        )
    if determinant.is_negative():
        raise Genus2HeightResolutionError(
            "the computed pairing is provably not positive semidefinite",
            {"determinant": determinant.to_dict(), "pairing": pairing.to_dict()},
        )
    conditional = any(
        result.status == "conditional-supplied-bound"
        for result in pairing.height_results
    )
    status = (
        "certified-positive"
        if pairing.rigorous
        else ("conditional-supplied-bound" if conditional else "numerical-reference")
    )
    return RegulatorResult(
        determinant,
        pairing,
        status,
        {
            "algorithm": "subset-dynamic-programming-interval-determinant",
            "pairing_rigorous": pairing.rigorous,
            "conditional_on_supplied_bound": conditional,
        },
    )


__all__ = [
    "ArchimedeanHeightCorrectionResult",
    "AutomaticHeightBounds",
    "CanonicalHeightResult",
    "FiniteHeightCorrectionResult",
    "Genus2HeightCapabilityError",
    "Genus2HeightResolutionError",
    "HeightContext",
    "HeightPairingResult",
    "RegulatorResult",
    "automatic_height_bounds",
    "canonical_height",
    "factorization_free_finite_correction",
    "height_pairing",
    "normalized_archimedean_correction",
    "regulator",
]
