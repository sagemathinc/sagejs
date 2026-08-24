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
no PARI or Hecke code is loaded during execution.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from typing import Any, Callable, Iterable, Sequence

from mpmath import iv
from mpmath.libmp import to_rational as _mpf_to_rational

_interval_context: Any = iv
_MAXIMUM_SATURATION_REPLAY_WORK = 1_000_000
_MAXIMUM_SATURATION_REPLAY_DEGREE = 64
_MAXIMUM_SATURATION_REPLAY_RANK = 63
_MAXIMUM_SATURATION_REPLAY_PRIME = 65_537
_MAXIMUM_SATURATION_REPLAY_RESIDUES = 100_000
_MAXIMUM_SATURATION_REPLAY_INTEGER_BITS = 16_384
_MAXIMUM_SATURATION_REPLAY_PRECISION_STEPS = 32
_MAXIMUM_SATURATION_REPLAY_RECORDS = 4_096
_MAXIMUM_SATURATION_REPLAY_DEPTH = 64
_MAXIMUM_SATURATION_REPLAY_STRING = 1_000_000
_SHARED_ZETA_WORKSPACE_CACHE_LIMIT = 16
_SHARED_ZETA_WORKSPACE_SNAPSHOT_TOKEN = object()
_shared_zeta_workspace_snapshots: dict[str, Any] = {}
_bf_prime_power_plan_kernel_override: Any = None
_MAXIMUM_PACKED_BF_PLAN_TERMS = 1_000_000


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )


def _content_hash(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _json_clone(value: Any) -> Any:
    """Copy canonical JSON data without invoking the runtime JSON parser."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_json_clone(item) for item in value]
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise TypeError("canonical proof dictionaries require string keys")
        return {key: _json_clone(item) for key, item in value.items()}
    raise TypeError("a proof payload contains a non-JSON value")


class AnalyticCertificationError(ArithmeticError):
    """Raised when data requested as rigorous has no complete proof boundary."""


class AnalyticPrecisionError(AnalyticCertificationError):
    """Raised when interval precision cannot separate the required result."""


class AnalyticResourceError(RuntimeError):
    """Raised before a certified computation exceeds an explicit work cap."""


class UnitLatticeError(ArithmeticError):
    """Raised when purported relation dependencies do not replay exactly."""


class _ReplayResourceExceeded(RuntimeError):
    pass


class _SaturationReplayBudget:
    """Verifier-owned work and cancellation boundary for untrusted payloads."""

    def __init__(self, cancelled: Callable[[], Any] | None) -> None:
        self.remaining = _MAXIMUM_SATURATION_REPLAY_WORK
        self.cancelled = cancelled

    def consume(self, amount: int = 1) -> None:
        amount = int(amount)
        if callable(self.cancelled) and self.cancelled():
            raise _ReplayResourceExceeded("unit saturation replay was cancelled")
        if amount < 0 or amount > self.remaining:
            raise _ReplayResourceExceeded("unit saturation replay work exhausted")
        self.remaining -= amount


def _consume_replay_structure(
    value: Any,
    budget: _SaturationReplayBudget,
    depth: int = 0,
) -> None:
    """Bound an authenticated nested value before canonical serialization."""
    if depth > _MAXIMUM_SATURATION_REPLAY_DEPTH:
        raise _ReplayResourceExceeded("saturation payload nesting is too deep")
    budget.consume()
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, int):
        if abs(value).bit_length() > _MAXIMUM_SATURATION_REPLAY_INTEGER_BITS:
            raise _ReplayResourceExceeded("saturation payload integer is too large")
        return
    if isinstance(value, str):
        if len(value) > _MAXIMUM_SATURATION_REPLAY_STRING:
            raise _ReplayResourceExceeded("saturation payload string is too large")
        budget.consume((len(value) + 63) // 64)
        return
    if isinstance(value, list):
        budget.consume(len(value))
        for item in value:
            _consume_replay_structure(item, budget, depth + 1)
        return
    if isinstance(value, dict):
        budget.consume(2 * len(value))
        for key, item in value.items():
            if not isinstance(key, str):
                raise _ReplayResourceExceeded("saturation payload keys must be strings")
            _consume_replay_structure(key, budget, depth + 1)
            _consume_replay_structure(item, budget, depth + 1)
        return
    raise _ReplayResourceExceeded("saturation payload contains an unsupported value")


def _gcd(left: int, right: int) -> int:
    left = abs(int(left))
    right = abs(int(right))
    while right:
        left, right = right, left % right
    return left


def _exact_integer(value: Any, name: str) -> int:
    """Return an integer without accepting truncating scalar coercions."""
    if isinstance(value, bool):
        raise TypeError(name + " must be an exact integer")
    if isinstance(value, int):
        return value
    try:
        method = value.__index__
    except AttributeError:
        raise TypeError(name + " must be an exact integer") from None
    answer = method()
    if isinstance(answer, bool) or not isinstance(answer, int):
        raise TypeError(name + " __index__ returned a non-integer")
    return answer


def _canonical_decimal_integer(value: Any, name: str) -> int:
    """Decode an exact integer or the native boundary's canonical decimal."""
    if not isinstance(value, str):
        return _exact_integer(value, name)
    try:
        answer = int(value)
    except ValueError:
        raise ValueError(name + " is not a canonical decimal integer") from None
    if str(answer) != value:
        raise ValueError(name + " is not a canonical decimal integer")
    return answer


def _payload_integer(value: Any, name: str) -> int:
    """Decode a canonical JSON integer without Python's bool/int aliasing."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(name + " must be a canonical integer")
    return value


def _payload_boolean(value: Any, name: str) -> bool:
    """Decode a canonical JSON boolean without truth-value coercion."""
    if not isinstance(value, bool):
        raise TypeError(name + " must be a canonical boolean")
    return value


class RationalEndpoint:
    """A normalized exact rational used as an interval endpoint."""

    def __init__(self, numerator: int, denominator: int = 1) -> None:
        numerator = _exact_integer(numerator, "rational endpoint numerator")
        denominator = _exact_integer(denominator, "rational endpoint denominator")
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
        return RationalEndpoint(numerator, denominator)
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
    def dyadic_endpoints(
        cls,
        lower_mantissa: Any,
        lower_exponent: Any,
        upper_mantissa: Any,
        upper_exponent: Any,
        *,
        precision_bits: int = 53,
        rigorous: bool = True,
        source: str = "outward-dyadic-endpoints",
    ) -> RealBall:
        """Build a ball from exact `mantissa * 2^exponent` endpoints."""

        def endpoint(mantissa_value: Any, exponent_value: Any) -> RationalEndpoint:
            mantissa = _canonical_decimal_integer(
                mantissa_value, "dyadic endpoint mantissa"
            )
            exponent = _canonical_decimal_integer(
                exponent_value, "dyadic endpoint exponent"
            )
            if exponent >= 0:
                return RationalEndpoint(mantissa * (2**exponent))
            return RationalEndpoint(mantissa, 2 ** (-exponent))

        return cls(
            endpoint(lower_mantissa, lower_exponent),
            endpoint(upper_mantissa, upper_exponent),
            precision_bits=precision_bits,
            rigorous=rigorous,
            source=source,
        )

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
        # An intersection is a logical conjunction of two independently valid
        # enclosures, not an arithmetic operation rounded at the weaker input
        # precision.  Its exact endpoints therefore retain the strongest
        # precision reached by either refinement.
        precision = max(self.precision_bits, other.precision_bits)
        rigorous = self.rigorous and other.rigorous
        source = self.source + "; " + other.source
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


def _real_ball_linear_combination(
    terms: Sequence[tuple[RationalEndpoint, RealBall]],
    *,
    precision_bits: int,
    source: str,
) -> RealBall:
    """Add exact interval multiples with one final outward rounding.

    Repeated `RealBall` additions are individually rigorous, but each one
    rounds to the working dyadic scale and allocates another interval tree.
    A fixed analytic formula may instead combine its exact rational endpoints
    first and round outwards once.  Negative coefficients reverse the endpoint
    choice in the usual interval-linear-combination rule.
    """
    lower = RationalEndpoint(0)
    upper = RationalEndpoint(0)
    rigorous = True
    zero = RationalEndpoint(0)
    for coefficient, ball in terms:
        if not isinstance(coefficient, RationalEndpoint) or not isinstance(
            ball, RealBall
        ):
            raise TypeError("a real-ball linear term needs an exact coefficient")
        if coefficient < zero:
            lower += coefficient * ball.upper
            upper += coefficient * ball.lower
        else:
            lower += coefficient * ball.lower
            upper += coefficient * ball.upper
        rigorous = rigorous and ball.rigorous
    return RealBall._arithmetic_result(
        lower,
        upper,
        precision_bits=int(precision_bits),
        rigorous=rigorous,
        source=str(source),
    )


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


_SHARED_INTEGER_TRANSCENDENTAL_CACHE_LIMIT = 16_384
_BF_PACKED_LAYOUT_CACHE_LIMIT = 32
_INTEGER_LOG_SOURCE = "integer-log; exact outward binary rounding"
_INTEGER_SQRT_SOURCE = "integer-square-root; exact outward binary rounding"
_shared_integer_log_endpoints: dict[
    tuple[int, int], tuple[int, int, int, int, str]
] = {}
_shared_integer_sqrt_endpoints: dict[
    tuple[int, int], tuple[int, int, int, int, str]
] = {}
_shared_bf_packed_layouts: dict[Any, tuple[tuple[int, ...], tuple[int, ...]]] = {}


def _shared_integer_ball(
    cache: dict[tuple[int, int], tuple[int, int, int, int, str]],
    key: tuple[int, int],
) -> RealBall | None:
    """Return a fresh ball from one bounded field-independent endpoint cache."""
    cached = cache.get(key)
    if cached is None:
        return None
    lower_numerator, lower_denominator, upper_numerator, upper_denominator, source = (
        cached
    )
    return RealBall(
        RationalEndpoint(lower_numerator, lower_denominator),
        RationalEndpoint(upper_numerator, upper_denominator),
        precision_bits=key[0],
        rigorous=True,
        source=source,
    )


def _remember_shared_integer_ball(
    cache: dict[tuple[int, int], tuple[int, int, int, int, str]],
    key: tuple[int, int],
    ball: RealBall,
) -> None:
    """Retain bounded immutable endpoints, never a caller-mutable `RealBall`."""
    if key[0] > 1024 or key[1].bit_length() > 64:
        return
    if len(cache) >= _SHARED_INTEGER_TRANSCENDENTAL_CACHE_LIMIT:
        cache.clear()
    cache[key] = (
        ball.lower.numerator,
        ball.lower.denominator,
        ball.upper.numerator,
        ball.upper.denominator,
        ball.source,
    )


def _shared_integer_mantissas(
    cache: dict[tuple[int, int], tuple[int, int, int, int, str]],
    key: tuple[int, int],
) -> tuple[int, int] | None:
    """Return cached endpoints at the cache key's exact dyadic scale."""
    cached = cache.get(key)
    if cached is None:
        return None
    scale = 1 << key[0]
    lower_numerator, lower_denominator, upper_numerator, upper_denominator, _ = cached
    if scale % lower_denominator or scale % upper_denominator:
        return None
    return (
        lower_numerator * (scale // lower_denominator),
        upper_numerator * (scale // upper_denominator),
    )


def _remember_shared_integer_mantissas(
    cache: dict[tuple[int, int], tuple[int, int, int, int, str]],
    key: tuple[int, int],
    lower: int,
    upper: int,
    source: str,
) -> None:
    """Retain native dyadic endpoints without allocating interval objects."""
    if key[0] > 1024 or key[1].bit_length() > 64:
        return
    if len(cache) >= _SHARED_INTEGER_TRANSCENDENTAL_CACHE_LIMIT:
        cache.clear()
    scale = 1 << key[0]
    cache[key] = (int(lower), scale, int(upper), scale, source)


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
        self._bf_dyadic_kernel_calls = 0
        self._bf_dyadic_kernel_successes = 0
        self._bf_dyadic_kernel_fallbacks = 0
        self._bf_transcendental_kernel_calls = 0
        self._bf_transcendental_kernel_successes = 0
        self._bf_transcendental_kernel_fallbacks = 0
        self._bf_flint_transcendental_calls = 0
        self._bf_flint_transcendental_successes = 0
        self._bf_flint_transcendental_fallbacks = 0
        self._bf_packed_layout_cache_hits = 0

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
        key = (self.precision_bits, value)
        shared = _shared_integer_ball(_shared_integer_log_endpoints, key)
        if shared is not None:
            self._log_hits += 1
            self._integer_logs[value] = shared
            return shared
        raw = self.log(RealBall(value, precision_bits=self.precision_bits))
        result = RealBall(
            raw.lower,
            raw.upper,
            precision_bits=self.precision_bits,
            rigorous=True,
            source=_INTEGER_LOG_SOURCE,
        )
        self._integer_logs[value] = result
        _remember_shared_integer_ball(_shared_integer_log_endpoints, key, result)
        return result

    def sqrt_integer(self, value: int) -> RealBall:
        value = int(value)
        cached = self._integer_square_roots.get(value)
        if cached is not None:
            self._sqrt_hits += 1
            return cached
        key = (self.precision_bits, value)
        shared = _shared_integer_ball(_shared_integer_sqrt_endpoints, key)
        if shared is not None:
            self._sqrt_hits += 1
            self._integer_square_roots[value] = shared
            return shared
        raw = self.sqrt(RealBall(value, precision_bits=self.precision_bits))
        result = RealBall(
            raw.lower,
            raw.upper,
            precision_bits=self.precision_bits,
            rigorous=True,
            source=_INTEGER_SQRT_SOURCE,
        )
        self._integer_square_roots[value] = result
        _remember_shared_integer_ball(_shared_integer_sqrt_endpoints, key, result)
        return result

    def diagnostics(self) -> dict[str, int]:
        return {
            "log_evaluations": self._log_evaluations,
            "log_cache_hits": self._log_hits,
            "sqrt_evaluations": self._sqrt_evaluations,
            "sqrt_cache_hits": self._sqrt_hits,
            "bf_dyadic_kernel_calls": self._bf_dyadic_kernel_calls,
            "bf_dyadic_kernel_successes": self._bf_dyadic_kernel_successes,
            "bf_dyadic_kernel_fallbacks": self._bf_dyadic_kernel_fallbacks,
            "bf_transcendental_kernel_calls": self._bf_transcendental_kernel_calls,
            "bf_transcendental_kernel_successes": (
                self._bf_transcendental_kernel_successes
            ),
            "bf_transcendental_kernel_fallbacks": (
                self._bf_transcendental_kernel_fallbacks
            ),
            "bf_flint_transcendental_calls": self._bf_flint_transcendental_calls,
            "bf_flint_transcendental_successes": (
                self._bf_flint_transcendental_successes
            ),
            "bf_flint_transcendental_fallbacks": (
                self._bf_flint_transcendental_fallbacks
            ),
            "bf_packed_layout_cache_hits": self._bf_packed_layout_cache_hits,
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


def _bounded_prime_divisors(
    value: int,
    maximum_work: int,
    cancelled: Callable[[], Any] | None,
) -> tuple[tuple[int, ...], int, bool, int]:
    """Trial-divide within an exact work budget and return the residual cofactor."""
    remaining = abs(int(value))
    maximum_work = int(maximum_work)
    answer: list[int] = []
    divisor = 2
    work = 0
    while divisor * divisor <= remaining:
        if callable(cancelled) and cancelled():
            raise AnalyticResourceError("unit-index factorization was cancelled")
        division_work = max(1, (remaining.bit_length() + 63) // 64)
        if division_work > maximum_work - work:
            return tuple(answer), remaining, False, work
        work += division_work
        if remaining % divisor == 0:
            answer.append(divisor)
            while remaining % divisor == 0:
                if callable(cancelled) and cancelled():
                    raise AnalyticResourceError(
                        "unit-index factorization was cancelled"
                    )
                division_work = max(1, (remaining.bit_length() + 63) // 64)
                if division_work > maximum_work - work:
                    return tuple(answer), remaining, False, work
                work += division_work
                remaining //= divisor
        divisor = 3 if divisor == 2 else divisor + 2
    if remaining > 1:
        answer.append(remaining)
    return tuple(answer), 1, True, work


def _checked_power_at_most(
    base: int,
    exponent: int,
    limit: int,
    cancelled: Callable[[], Any] | None,
) -> int | None:
    """Return `base**exponent` only when it does not exceed `limit`."""
    base = int(base)
    exponent = int(exponent)
    limit = int(limit)
    if base < 0 or exponent < 0 or limit < 0:
        raise ValueError("checked powers require nonnegative inputs")
    if exponent == 0:
        return 1 if limit >= 1 else None
    if base == 0:
        return 0
    if base == 1:
        return 1 if limit >= 1 else None
    value = 1
    for _index in range(exponent):
        if callable(cancelled) and cancelled():
            raise AnalyticResourceError("unit p-saturation was cancelled")
        if value > limit // base:
            return None
        value *= base
    return value


def _coordinate_vectors(bound: int, length: int) -> Iterable[tuple[int, ...]]:
    if length == 0:
        yield ()
        return
    if bound == 0:
        yield (0,) * length
        return
    for prefix in _coordinate_vectors(bound, length - 1):
        for value in range(-bound, bound + 1):
            yield prefix + (value,)


def _residue_vectors(modulus: int, length: int) -> Iterable[tuple[int, ...]]:
    if length == 0:
        yield ()
        return
    for prefix in _residue_vectors(modulus, length - 1):
        for value in range(modulus):
            yield prefix + (value,)


def _ordinary_unit(unit: Any) -> Any:
    evaluator = getattr(unit, "evaluate", None)
    return evaluator() if callable(evaluator) else unit


def _unit_like(template: Any, field: Any, value: Any) -> Any:
    from_element = getattr(type(template), "from_element", None)
    if callable(from_element):
        return from_element(field, value)
    return value


def _element_payload(element: Any) -> list[list[int]]:
    coordinates = list(element.list())
    return [[int(value._numerator), int(value._denominator)] for value in coordinates]


def _saturation_field_order_identity(field: Any, order: Any) -> dict[str, Any]:
    if order.number_field() is not field:
        raise TypeError("the saturation order belongs to a different field")
    if not order.is_maximal():
        raise ValueError("unit saturation requires a certified maximal order")
    return {
        "field": {
            "defining_polynomial": [
                [int(value._numerator), int(value._denominator)]
                for value in field._defining_coefficients
            ],
            "degree": int(field.degree()),
            "variable": field.variable_name(),
        },
        "maximal_order_basis": [
            [[int(value._numerator), int(value._denominator)] for value in row]
            for row in order._basis_rows
        ],
        "discriminant": int(order.discriminant()),
    }


def _element_from_payload(field: Any, payload: Any) -> Any:
    if not isinstance(payload, list) or len(payload) != int(field.degree()):
        raise ValueError("a saturation element has the wrong coordinate length")
    base_module = __import__(
        "sagejs._baselib.number_fields", fromlist=["number_fields"]
    )
    rational_field = base_module._nf_global("QQ")
    coordinates = []
    for pair in payload:
        if not isinstance(pair, list) or len(pair) != 2:
            raise TypeError("a saturation coordinate must be [numerator, denominator]")
        numerator = _payload_integer(pair[0], "saturation coordinate numerator")
        denominator = _payload_integer(pair[1], "saturation coordinate denominator")
        if (
            abs(numerator).bit_length() > _MAXIMUM_SATURATION_REPLAY_INTEGER_BITS
            or denominator.bit_length() > _MAXIMUM_SATURATION_REPLAY_INTEGER_BITS
        ):
            raise _ReplayResourceExceeded(
                "saturation coordinate exceeds the verifier bit-length cap"
            )
        if denominator <= 0:
            raise ValueError("a saturation coordinate denominator must be positive")
        if _gcd(numerator, denominator) != 1:
            raise ValueError("a saturation coordinate must be reduced")
        coordinates.append(rational_field(numerator) / rational_field(denominator))
    return field._from_coefficients(coordinates)


def _exact_unit(field: Any, order: Any, value: Any) -> bool:
    try:
        embedding_module = __import__(
            "sagejs.number_fields.embeddings", fromlist=["embeddings"]
        )
        verified, _norm = embedding_module.exact_norm_is_unit(field, value)
        return bool(verified and value in order)
    except (TypeError, ValueError, ArithmeticError, ZeroDivisionError):
        return False


def _target_element(
    field: Any,
    units: Sequence[Any],
    torsion_elements: Sequence[Any],
    exponents: Sequence[int],
    torsion_exponent: int,
) -> Any:
    value = torsion_elements[torsion_exponent]
    for unit, exponent in zip(units, exponents, strict=True):
        value *= _ordinary_unit(unit) ** int(exponent)
    return value


def _normalized_root_replacement(
    field: Any,
    units: Sequence[Any],
    root: Any,
    prime: int,
    exponents: Sequence[int],
) -> tuple[tuple[Any, ...], int, int, tuple[int, ...], tuple[int, ...]]:
    replacement = next(
        index for index, exponent in enumerate(exponents) if exponent % prime
    )
    normalization_power = next(
        value
        for value in range(1, prime)
        if (int(exponents[replacement]) * value) % prime == 1
    )
    normalized = tuple(normalization_power * int(exponent) for exponent in exponents)
    quotients = list(value // prime for value in normalized)
    quotients[replacement] = (normalized[replacement] - 1) // prime
    adjusted_root = _unit_like(units[0], field, root) ** normalization_power
    for unit, quotient in zip(units, quotients, strict=True):
        adjusted_root *= unit ** (-quotient)
    answer = list(units)
    answer[replacement] = adjusted_root
    normalized_relation = tuple(
        normalized[index] - prime * quotients[index] for index in range(len(normalized))
    )
    if normalized_relation[replacement] != 1:
        raise ArithmeticError("p-root normalization did not produce lattice index p")
    return (
        tuple(answer),
        replacement,
        normalization_power,
        tuple(quotients),
        normalized_relation,
    )


class UnitPthRootCertificate:
    """Exact replay of one index-`p` enlargement of a unit lattice."""

    def __init__(
        self,
        prime: int,
        exponents: Sequence[int],
        torsion_exponent: int,
        root: Any,
        *,
        replacement_index: int,
        normalization_power: int,
        normalization_quotients: Sequence[int],
        normalized_exponents: Sequence[int],
        precision_history: Sequence[int],
    ) -> None:
        self.prime = int(prime)
        self.exponents = tuple(int(value) for value in exponents)
        self.torsion_exponent = int(torsion_exponent)
        self.root = root
        self.replacement_index = int(replacement_index)
        self.normalization_power = int(normalization_power)
        self.normalization_quotients = tuple(
            int(value) for value in normalization_quotients
        )
        self.normalized_exponents = tuple(int(value) for value in normalized_exponents)
        self.lattice_index_change = self.prime
        self.precision_history = tuple(int(value) for value in precision_history)
        if not self.precision_history or any(
            self.precision_history[index + 1] != 2 * self.precision_history[index]
            for index in range(len(self.precision_history) - 1)
        ):
            raise ValueError("p-th-root reconstruction precision must double")
        self.outcome = "enlarged"
        self.method = "exact-pth-root-identity"
        self.rigorous = True

    def replay(
        self,
        field: Any,
        order: Any,
        units: Sequence[Any],
        torsion_elements: Sequence[Any],
    ) -> tuple[Any, ...] | None:
        if (
            not _is_prime(self.prime)
            or len(self.exponents) != len(units)
            or not any(value % self.prime for value in self.exponents)
            or not 0 <= self.torsion_exponent < len(torsion_elements)
            or not _exact_unit(field, order, self.root)
        ):
            return None
        target = _target_element(
            field,
            units,
            torsion_elements,
            self.exponents,
            self.torsion_exponent,
        )
        if self.root**self.prime != target:
            return None
        try:
            replay = _normalized_root_replacement(
                field, units, self.root, self.prime, self.exponents
            )
        except (TypeError, ValueError, ArithmeticError, ZeroDivisionError):
            return None
        new_units, replacement, power, quotients, normalized = replay
        if (
            replacement != self.replacement_index
            or power != self.normalization_power
            or quotients != self.normalization_quotients
            or normalized != self.normalized_exponents
        ):
            return None
        return new_units

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.unit-pth-root-certificate.v1",
            "outcome": self.outcome,
            "method": self.method,
            "prime": self.prime,
            "exponents": list(self.exponents),
            "torsion_exponent": self.torsion_exponent,
            "root_coordinates": _element_payload(self.root),
            "replacement_index": self.replacement_index,
            "normalization_power": self.normalization_power,
            "normalization_quotients": list(self.normalization_quotients),
            "normalized_exponents": list(self.normalized_exponents),
            "lattice_index_change": self.lattice_index_change,
            "precision_history": list(self.precision_history),
            "rigorous": True,
        }


def _order_coordinates(order: Any, element: Any) -> tuple[int, ...]:
    field = order.number_field()
    degree = int(field.degree())
    base_module = __import__(
        "sagejs._baselib.number_fields", fromlist=["number_fields"]
    )
    power_coordinates = base_module._nf_coordinates(element, degree)
    row = base_module._nf_global("vector")(
        base_module._nf_global("QQ"), power_coordinates
    )
    relative = list(row * order.basis_matrix().inverse())
    answer = []
    for value in relative:
        if int(value._denominator) != 1:
            raise ArithmeticError("an integral unit has nonintegral order coordinates")
        answer.append(int(value._numerator))
    return tuple(answer)


def _modular_product(
    left: Sequence[int],
    right: Sequence[int],
    table: Sequence[Sequence[Sequence[Any]]],
    modulus: int,
) -> tuple[int, ...]:
    degree = len(left)
    answer = [0] * degree
    for left_index, left_value in enumerate(left):
        if left_value % modulus == 0:
            continue
        for right_index, right_value in enumerate(right):
            if right_value % modulus == 0:
                continue
            scalar = (left_value * right_value) % modulus
            for coordinate in range(degree):
                answer[coordinate] = (
                    answer[coordinate]
                    + scalar * int(table[left_index][right_index][coordinate])
                ) % modulus
    return tuple(answer)


def _modular_power(
    value: Sequence[int],
    exponent: int,
    one: Sequence[int],
    table: Sequence[Sequence[Sequence[Any]]],
    modulus: int,
) -> tuple[int, ...]:
    answer = tuple(int(item) % modulus for item in one)
    power = tuple(int(item) % modulus for item in value)
    remaining = int(exponent)
    while remaining:
        if remaining & 1:
            answer = _modular_product(answer, power, table, modulus)
        remaining //= 2
        if remaining:
            power = _modular_product(power, power, table, modulus)
    return answer


def _local_pth_power_obstruction(
    order: Any,
    target: Any,
    prime: int,
    rational_primes: Sequence[int],
    residue_candidate_cap: int,
    cancelled: Callable[[], Any] | None = None,
) -> int | None:
    if not rational_primes:
        return None
    maximal_order = __import__(
        "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
    )
    table = maximal_order._nf_order_multiplication_table(order)
    one = _order_coordinates(order, order.number_field().one())
    target_coordinates = _order_coordinates(order, target)
    degree = len(one)
    for modulus in rational_primes:
        modulus = int(modulus)
        if callable(cancelled) and cancelled():
            raise AnalyticResourceError("local p-th-power replay was cancelled")
        if modulus < 2 or modulus > residue_candidate_cap:
            continue
        residue_count = _checked_power_at_most(
            modulus, degree, residue_candidate_cap, cancelled
        )
        factors, _cofactor, factored, _work = _bounded_prime_divisors(
            modulus,
            min(residue_candidate_cap, _MAXIMUM_SATURATION_REPLAY_WORK),
            cancelled,
        )
        if residue_count is None or not factored or factors != (modulus,):
            continue
        pth_powers = set()
        for vector in _residue_vectors(modulus, degree):
            if callable(cancelled) and cancelled():
                raise AnalyticResourceError("local p-th-power replay was cancelled")
            pth_powers.add(_modular_power(vector, prime, one, table, modulus))
        reduced_target = tuple(value % modulus for value in target_coordinates)
        if reduced_target not in pth_powers:
            return modulus
    return None


class UnitLocalPthPowerObstruction:
    """Finite-quotient proof that no relevant global `p`-th root exists."""

    def __init__(
        self,
        prime: int,
        target_obstructions: Sequence[tuple[Sequence[int], int, int]],
        *,
        residue_candidate_cap: int,
        precision_history: Sequence[int],
    ) -> None:
        self.prime = int(prime)
        self.target_obstructions = tuple(
            (tuple(int(value) for value in exponents), int(torsion), int(modulus))
            for exponents, torsion, modulus in target_obstructions
        )
        self.residue_candidate_cap = int(residue_candidate_cap)
        self.precision_history = tuple(int(value) for value in precision_history)
        if not self.precision_history:
            raise ValueError("local obstruction evidence needs a decisive precision")
        self.outcome = "saturated"
        self.method = "exact-finite-order-quotient-pth-power-obstruction"
        self.rigorous = True

    def verify(
        self,
        field: Any,
        order: Any,
        units: Sequence[Any],
        torsion_elements: Sequence[Any],
        cancelled: Callable[[], Any] | None = None,
    ) -> bool:
        expected = []
        for exponents in _residue_vectors(self.prime, len(units)):
            if callable(cancelled) and cancelled():
                raise AnalyticResourceError("local p-th-power replay was cancelled")
            if any(exponents):
                for torsion in range(len(torsion_elements)):
                    expected.append((exponents, torsion))
        recorded = sorted(
            (exponents, torsion)
            for exponents, torsion, _modulus in self.target_obstructions
        )
        if expected != recorded:
            return False
        for exponents, torsion, modulus in self.target_obstructions:
            target = _target_element(field, units, torsion_elements, exponents, torsion)
            obstruction = _local_pth_power_obstruction(
                order,
                target,
                self.prime,
                (modulus,),
                self.residue_candidate_cap,
                cancelled,
            )
            if obstruction != modulus:
                return False
        return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.unit-local-pth-obstruction.v1",
            "outcome": self.outcome,
            "method": self.method,
            "prime": self.prime,
            "target_obstructions": [
                {
                    "exponents": list(exponents),
                    "torsion_exponent": torsion,
                    "rational_prime": modulus,
                }
                for exponents, torsion, modulus in self.target_obstructions
            ],
            "residue_candidate_cap": self.residue_candidate_cap,
            "precision_history": list(self.precision_history),
            "rigorous": True,
        }


def _bounded_exact_pth_root(
    field: Any,
    order: Any,
    units: Sequence[Any],
    torsion_elements: Sequence[Any],
    prime: int,
    coordinate_bound: int,
    cancelled: Callable[[], Any] | None,
) -> tuple[tuple[int, ...], int, Any] | None:
    basis = tuple(order.basis())
    for coordinates in _coordinate_vectors(coordinate_bound, len(basis)):
        if callable(cancelled) and cancelled():
            raise AnalyticResourceError("unit p-saturation was cancelled")
        root = field.zero()
        for coefficient, basis_element in zip(coordinates, basis, strict=True):
            if coefficient:
                root += coefficient * basis_element
        if root.is_zero() or not _exact_unit(field, order, root):
            continue
        power = root**prime
        for exponents in _residue_vectors(prime, len(units)):
            if not any(exponents):
                continue
            for torsion in range(len(torsion_elements)):
                if callable(cancelled) and cancelled():
                    raise AnalyticResourceError("unit p-saturation was cancelled")
                target = _target_element(
                    field, units, torsion_elements, exponents, torsion
                )
                if power == target:
                    return (tuple(exponents), torsion, root)
    return None


def _exact_local_obstruction(
    field: Any,
    order: Any,
    units: Sequence[Any],
    torsion_elements: Sequence[Any],
    prime: int,
    rational_primes: Sequence[int],
    residue_candidate_cap: int,
    precision_history: Sequence[int],
    cancelled: Callable[[], Any] | None,
) -> UnitLocalPthPowerObstruction | None:
    records: list[tuple[Sequence[int], int, int]] = []
    for exponents in _residue_vectors(prime, len(units)):
        if not any(exponents):
            continue
        for torsion in range(len(torsion_elements)):
            if callable(cancelled) and cancelled():
                raise AnalyticResourceError("unit p-saturation was cancelled")
            target = _target_element(field, units, torsion_elements, exponents, torsion)
            modulus = _local_pth_power_obstruction(
                order,
                target,
                prime,
                rational_primes,
                residue_candidate_cap,
                cancelled,
            )
            if modulus is None:
                return None
            records.append((exponents, torsion, modulus))
    return UnitLocalPthPowerObstruction(
        prime,
        records,
        residue_candidate_cap=residue_candidate_cap,
        precision_history=precision_history,
    )


class ExactUnitSaturationResult:
    """Fail-closed result of bounded exact unit `p`-saturation."""

    def __init__(
        self,
        field: Any,
        order: Any,
        initial_units: Sequence[Any],
        units: Sequence[Any],
        torsion_elements: Sequence[Any],
        *,
        initial_index_bound: int,
        remaining_index_bound: int,
        index_bound_is_rigorous: bool,
        global_index_certificate: Any,
        factorization_complete: bool,
        factorization_remaining: int,
        factorization_work: int,
        factorization_work_limit: int,
        required_primes: Sequence[int],
        unresolved_primes: Sequence[int],
        evidence: Sequence[Any],
        precision_history: Sequence[int],
        incomplete_reason: str | None,
        generation_verifier: Callable[..., Any] | None,
        workspace: ZetaLogResidueWorkspace | None = None,
    ) -> None:
        self.units = tuple(units)
        self.evidence = tuple(evidence)
        self.required_primes = tuple(int(value) for value in required_primes)
        self.unresolved_primes = tuple(int(value) for value in unresolved_primes)
        self.initial_index_bound = int(initial_index_bound)
        self.remaining_index_bound = int(remaining_index_bound)
        self.index_bound_is_rigorous = bool(index_bound_is_rigorous)
        self.global_index_certificate = global_index_certificate
        self.factorization_complete = bool(factorization_complete)
        self.factorization_remaining = int(factorization_remaining)
        self.factorization_work = int(factorization_work)
        self.factorization_work_limit = int(factorization_work_limit)
        self.precision_history = tuple(int(value) for value in precision_history)
        self.index_enlargement = self.initial_index_bound // self.remaining_index_bound
        self.complete = (
            self.index_bound_is_rigorous
            and self.factorization_complete
            and not self.unresolved_primes
        )
        self.saturated = self.complete
        self.rigorous = self.complete
        self.incomplete_reason = None if self.complete else incomplete_reason
        self.status = "rigorous" if self.complete else "incomplete"
        certificate_status = (
            None
            if global_index_certificate is None
            else global_index_certificate["proof_status"]
        )
        self.global_proof_status = certificate_status
        if self.complete and certificate_status == "exact-relations-conditional-grh":
            self.proof_status = "exact-unit-p-saturation-conditional-grh"
        elif self.complete:
            self.proof_status = "exact-unit-p-saturation-unconditional"
        else:
            self.proof_status = "bounded-unit-p-saturation-incomplete"
        self._field = field
        self._order = order
        self._initial_units = tuple(initial_units)
        self._generation_verifier = generation_verifier
        self._workspace = workspace

    def verify(self, *, workspace: ZetaLogResidueWorkspace | None = None) -> bool:
        """Replay in-process work when available; detached replay stays cold."""
        return verify_saturation_evidence(
            self._field,
            self._order,
            self._initial_units,
            self.to_dict(),
            generation_verifier=self._generation_verifier,
            workspace=self._workspace if workspace is None else workspace,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.exact-unit-p-saturation.v1",
            "initial_index_bound": self.initial_index_bound,
            "remaining_index_bound": self.remaining_index_bound,
            "index_bound_is_rigorous": self.index_bound_is_rigorous,
            "global_index_certificate": self.global_index_certificate,
            "factorization_complete": self.factorization_complete,
            "factorization_remaining": self.factorization_remaining,
            "factorization_work": self.factorization_work,
            "factorization_work_limit": self.factorization_work_limit,
            "index_enlargement": self.index_enlargement,
            "required_primes": list(self.required_primes),
            "unresolved_primes": list(self.unresolved_primes),
            "units": [_element_payload(_ordinary_unit(unit)) for unit in self.units],
            "evidence": [item.to_dict() for item in self.evidence],
            "precision_history": list(self.precision_history),
            "complete": self.complete,
            "saturated": self.saturated,
            "rigorous": self.rigorous,
            "status": self.status,
            "proof_status": self.proof_status,
            "global_proof_status": self.global_proof_status,
            "incomplete_reason": self.incomplete_reason,
        }


def _coerce_pth_root_candidate(candidate: Any) -> tuple[tuple[int, ...], int, Any]:
    if isinstance(candidate, dict):
        return (
            tuple(int(value) for value in candidate["exponents"]),
            int(candidate["torsion_exponent"]),
            candidate["root"],
        )
    if isinstance(candidate, (tuple, list)) and len(candidate) == 3:
        return (
            tuple(int(value) for value in candidate[0]),
            int(candidate[1]),
            candidate[2],
        )
    raise TypeError(
        "a p-th-root provider must return (exponents, torsion_exponent, root)"
    )


def saturate_unit_lattice(
    field: Any,
    order: Any,
    units: Sequence[Any],
    index_bound: Any,
    *,
    precision_bits: int = 64,
    maximum_precision_bits: int = 4096,
    coordinate_bound: int = 4,
    maximum_root_candidates: int = 100_000,
    maximum_target_classes: int = 10_000,
    maximum_saturation_work: int = 1_000_000,
    local_rational_primes: Sequence[int] = (2, 3, 5, 7, 11, 13),
    residue_candidate_cap: int = 100_000,
    torsion: Any = None,
    candidate_root_provider: Callable[..., Any] | None = None,
    recoverable_errors: tuple[type[BaseException], ...] = (AnalyticPrecisionError,),
    cancelled: Callable[[], Any] | None = None,
) -> ExactUnitSaturationResult:
    """Enlarge a unit lattice by exact bounded `p`-th roots.

    A positive step is accepted only after replaying
    `v^p = zeta * product(u_i^a_i)`, exact maximal-order membership, unit norm,
    and the index-`p` basis replacement.  Exhausting the coordinate box never
    proves a negative result.  A prime is declared saturated only through
    exact finite-quotient obstructions for every nonzero exponent class, or
    because exact enlargements exhaust a rigorous global index.

    Only a replayable `UnitSaturationIndexCertificate` authorizes a rigorous
    completion. Integer and bare `HRIndexValidationResult` inputs remain useful
    as search bounds but are always diagnostic-only.
    """
    index_certificate: UnitSaturationIndexCertificate | None = None
    analytic_workspace: ZetaLogResidueWorkspace | None = None
    global_index_certificate: Any = None
    generation_verifier: Callable[..., Any] | None = None
    if isinstance(index_bound, UnitSaturationIndexCertificate):
        initial_index = int(index_bound.index_bound)
        index_certificate = index_bound
        analytic_workspace = index_bound._workspace
    elif isinstance(index_bound, HRIndexValidationResult):
        initial_index = int(
            index_bound.unique_index
            if index_bound.unique_index is not None
            else index_bound.upper_index
        )
    else:
        initial_index = int(index_bound)
    rigorous_bound = False
    if initial_index < 1:
        raise ValueError("the saturation index bound must be positive")
    precision = int(precision_bits)
    maximum_precision = int(maximum_precision_bits)
    coordinate_bound = int(coordinate_bound)
    maximum_root_candidates = int(maximum_root_candidates)
    maximum_target_classes = int(maximum_target_classes)
    maximum_saturation_work = int(maximum_saturation_work)
    residue_candidate_cap = int(residue_candidate_cap)
    if precision < 16 or maximum_precision < precision:
        raise ValueError("saturation precision bounds are invalid")
    if (
        coordinate_bound < 0
        or maximum_root_candidates < 1
        or maximum_target_classes < 1
        or maximum_saturation_work < 1
    ):
        raise ValueError("saturation root-search bounds are invalid")
    if residue_candidate_cap < 2:
        raise ValueError("the residue candidate cap must be at least two")
    selected_units = tuple(units)
    rank = len(selected_units)
    required_primes, factorization_remaining, factorization_complete, factor_work = (
        _bounded_prime_divisors(initial_index, maximum_saturation_work, cancelled)
    )
    if not factorization_complete:
        return ExactUnitSaturationResult(
            field,
            order,
            units,
            selected_units,
            (),
            initial_index_bound=initial_index,
            remaining_index_bound=initial_index,
            index_bound_is_rigorous=False,
            global_index_certificate=None,
            factorization_complete=False,
            factorization_remaining=factorization_remaining,
            factorization_work=factor_work,
            factorization_work_limit=maximum_saturation_work,
            required_primes=required_primes,
            unresolved_primes=required_primes,
            evidence=(),
            precision_history=(precision,),
            incomplete_reason=(
                "unit-index factorization exhausted maximum_saturation_work"
            ),
            generation_verifier=None,
            workspace=analytic_workspace,
        )
    saturation_work_remaining = maximum_saturation_work - factor_work
    if index_certificate is not None:
        rigorous_bound = index_certificate.verify(field, order, units)
        global_index_certificate = index_certificate.to_dict()
        generation_verifier = index_certificate._generation_verifier
    if rank and any(
        not _exact_unit(field, order, _ordinary_unit(unit)) for unit in selected_units
    ):
        raise ValueError("every proposed free generator must be an exact integral unit")
    units_module = __import__("sagejs.number_fields.units", fromlist=["units"])
    canonical_torsion = units_module.roots_of_unity(field)
    if not bool(getattr(canonical_torsion, "complete", False)):
        raise AnalyticCertificationError("unit p-saturation needs complete torsion")
    torsion_verifier = getattr(canonical_torsion, "verify", None)
    if not callable(torsion_verifier) or not torsion_verifier():
        raise AnalyticCertificationError("roots-of-unity evidence failed replay")
    if torsion is not None:
        supplied_verifier = getattr(torsion, "verify", None)
        if (
            not bool(getattr(torsion, "complete", False))
            or not callable(supplied_verifier)
            or not supplied_verifier()
            or tuple(torsion.elements) != tuple(canonical_torsion.elements)
        ):
            raise AnalyticCertificationError(
                "supplied torsion does not match canonical roots of unity"
            )
    torsion_elements = tuple(canonical_torsion.elements)
    remaining_index = initial_index
    evidence: list[Any] = []
    unresolved: list[int] = []
    precision_history: list[int] = []
    incomplete_reason: str | None = None
    degree = int(field.degree())
    candidate_count = _checked_power_at_most(
        2 * coordinate_bound + 1,
        degree,
        min(maximum_root_candidates, maximum_saturation_work),
        cancelled,
    )
    residue_work = 0
    selected_local_primes: list[int] = []
    for modulus_value in local_rational_primes:
        modulus = int(modulus_value)
        if modulus < 2 or modulus > residue_candidate_cap:
            continue
        modulus_power = _checked_power_at_most(
            modulus,
            degree,
            min(residue_candidate_cap, maximum_saturation_work),
            cancelled,
        )
        modulus_factors, _cofactor, modulus_factored, modulus_factor_work = (
            _bounded_prime_divisors(
                modulus,
                saturation_work_remaining,
                cancelled,
            )
        )
        saturation_work_remaining -= modulus_factor_work
        if (
            modulus_power is not None
            and modulus_factored
            and modulus_factors == (modulus,)
        ):
            selected_local_primes.append(modulus)
            if residue_work > maximum_saturation_work - modulus_power:
                residue_work = maximum_saturation_work + 1
                break
            residue_work += modulus_power

    for prime in required_primes:
        torsion_count = len(torsion_elements)
        target_power_limit = min(
            maximum_target_classes // torsion_count + 1,
            saturation_work_remaining // torsion_count + 1,
        )
        prime_power = _checked_power_at_most(prime, rank, target_power_limit, cancelled)
        if prime_power is None or candidate_count is None:
            unresolved.append(prime)
            incomplete_reason = (
                "unit p-saturation preflight exceeds target or work caps"
            )
            continue
        target_count = (prime_power - 1) * torsion_count
        # Root search visits every target for every coordinate candidate. A
        # complete local obstruction constructs every target once and its
        # mandatory replay constructs/enumerates them again, so reserve a
        # conservative global upper bound before either phase starts.
        per_target_work = candidate_count + 3 + 2 * residue_work
        planned_work = (
            maximum_saturation_work + 1
            if per_target_work > 0
            and target_count > maximum_saturation_work // per_target_work
            else target_count * per_target_work
        )
        resolved = False
        while remaining_index % prime == 0:
            if callable(cancelled) and cancelled():
                raise AnalyticResourceError("unit p-saturation was cancelled")
            if planned_work > saturation_work_remaining:
                incomplete_reason = (
                    "unit p-saturation exhausted maximum_saturation_work"
                )
                break
            saturation_work_remaining -= planned_work
            attempt_precision = precision
            attempt_history: list[int] = []
            candidate: tuple[tuple[int, ...], int, Any] | None = None
            while attempt_precision <= maximum_precision:
                precision_history.append(attempt_precision)
                attempt_history.append(attempt_precision)
                try:
                    supplied = (
                        candidate_root_provider(
                            field,
                            order,
                            selected_units,
                            prime,
                            attempt_precision,
                        )
                        if callable(candidate_root_provider)
                        else None
                    )
                    if supplied is not None:
                        candidate = _coerce_pth_root_candidate(supplied)
                    elif candidate_count <= maximum_root_candidates:
                        candidate = _bounded_exact_pth_root(
                            field,
                            order,
                            selected_units,
                            torsion_elements,
                            prime,
                            coordinate_bound,
                            cancelled,
                        )
                    break
                except recoverable_errors:
                    attempt_precision *= 2
            if attempt_precision > maximum_precision:
                incomplete_reason = (
                    "p-th-root reconstruction exceeded maximum_precision_bits"
                )
                break
            if candidate is None:
                obstruction = _exact_local_obstruction(
                    field,
                    order,
                    selected_units,
                    torsion_elements,
                    prime,
                    selected_local_primes,
                    residue_candidate_cap,
                    attempt_history,
                    cancelled,
                )
                if obstruction is not None and obstruction.verify(
                    field, order, selected_units, torsion_elements
                ):
                    evidence.append(obstruction)
                    resolved = True
                else:
                    incomplete_reason = (
                        "bounded root search found no exact enlargement and no "
                        "complete local obstruction"
                    )
                break
            exponents, torsion_exponent, root = candidate
            if (
                len(exponents) != rank
                or not any(value % prime for value in exponents)
                or not 0 <= torsion_exponent < len(torsion_elements)
            ):
                raise AnalyticCertificationError(
                    "a p-th-root provider returned an invalid exponent class"
                )
            replacement = _normalized_root_replacement(
                field, selected_units, root, prime, exponents
            )
            new_units, replaced, power, quotients, normalized = replacement
            certificate = UnitPthRootCertificate(
                prime,
                exponents,
                torsion_exponent,
                root,
                replacement_index=replaced,
                normalization_power=power,
                normalization_quotients=quotients,
                normalized_exponents=normalized,
                precision_history=attempt_history,
            )
            replayed = certificate.replay(
                field, order, selected_units, torsion_elements
            )
            if replayed is None or any(
                _ordinary_unit(left) != _ordinary_unit(right)
                for left, right in zip(replayed, new_units, strict=True)
            ):
                raise AnalyticCertificationError(
                    "an exact p-th-root candidate failed certificate replay"
                )
            selected_units = tuple(replayed)
            remaining_index //= prime
            evidence.append(certificate)
            if remaining_index % prime != 0:
                resolved = True
        if not resolved:
            unresolved.append(prime)
    if not rigorous_bound:
        if incomplete_reason is None:
            incomplete_reason = "the supplied global index bound was not certified"
        unresolved = list(required_primes)
    return ExactUnitSaturationResult(
        field,
        order,
        units,
        selected_units,
        torsion_elements,
        initial_index_bound=initial_index,
        remaining_index_bound=remaining_index,
        index_bound_is_rigorous=rigorous_bound,
        global_index_certificate=global_index_certificate,
        factorization_complete=factorization_complete,
        factorization_remaining=factorization_remaining,
        factorization_work=factor_work,
        factorization_work_limit=maximum_saturation_work,
        required_primes=required_primes,
        unresolved_primes=unresolved,
        evidence=evidence,
        precision_history=precision_history or (precision,),
        incomplete_reason=incomplete_reason,
        generation_verifier=generation_verifier,
        workspace=analytic_workspace,
    )


def verify_saturation_evidence(
    field: Any,
    order: Any,
    initial_units: Sequence[Any],
    payload: Any,
    *,
    generation_verifier: Callable[..., Any] | None = None,
    cancelled: Callable[[], Any] | None = None,
    workspace: ZetaLogResidueWorkspace | None = None,
) -> bool:
    """Replay a canonical exact-unit-saturation payload from algebraic data.

    A caller may supply its live field-scoped analytic workspace. Serialized
    evidence never contains a workspace, so ordinary detached replay remains
    independent and cold by default.
    """
    try:
        expected_payload_keys = {
            "schema",
            "initial_index_bound",
            "remaining_index_bound",
            "index_bound_is_rigorous",
            "global_index_certificate",
            "factorization_complete",
            "factorization_remaining",
            "factorization_work",
            "factorization_work_limit",
            "index_enlargement",
            "required_primes",
            "unresolved_primes",
            "units",
            "evidence",
            "precision_history",
            "complete",
            "saturated",
            "rigorous",
            "status",
            "proof_status",
            "global_proof_status",
            "incomplete_reason",
        }
        if (
            not isinstance(payload, dict)
            or len(payload) != len(expected_payload_keys)
            or set(payload) != expected_payload_keys
            or payload.get("schema")
            != "sagejs.number-fields.exact-unit-p-saturation.v1"
        ):
            return False
        budget = _SaturationReplayBudget(cancelled)
        degree = int(field.degree())
        rank = len(initial_units)
        if not (
            1 <= degree <= _MAXIMUM_SATURATION_REPLAY_DEGREE
            and rank <= _MAXIMUM_SATURATION_REPLAY_RANK
        ):
            return False
        raw_evidence = payload["evidence"]
        if (
            not isinstance(raw_evidence, list)
            or len(raw_evidence) > _MAXIMUM_SATURATION_REPLAY_RECORDS
        ):
            return False
        budget.consume(len(raw_evidence))

        def bounded_integer(value: Any, name: str) -> int:
            answer = _payload_integer(value, name)
            bits = abs(answer).bit_length()
            if bits > _MAXIMUM_SATURATION_REPLAY_INTEGER_BITS:
                raise _ReplayResourceExceeded(name + " exceeds the bit-length cap")
            budget.consume(max(1, (bits + 63) // 64))
            return answer

        def bounded_integer_vector(
            value: Any, expected_length: int, name: str
        ) -> tuple[int, ...]:
            if not isinstance(value, list) or len(value) != expected_length:
                raise _ReplayResourceExceeded(name + " has the wrong width")
            budget.consume(expected_length)
            return tuple(bounded_integer(item, name + " entry") for item in value)

        for key, name in (
            ("index_bound_is_rigorous", "global index rigor"),
            ("complete", "saturation completeness"),
            ("saturated", "saturation state"),
            ("rigorous", "saturation rigor"),
        ):
            _payload_boolean(payload[key], name)
        initial_index = _payload_integer(
            payload["initial_index_bound"], "initial saturation index"
        )
        remaining_index = initial_index
        if initial_index < 1:
            return False
        factorization_work_limit = _payload_integer(
            payload["factorization_work_limit"], "factorization work limit"
        )
        if factorization_work_limit < 1:
            return False
        required, factorization_remaining, factorization_complete, factor_work = (
            _bounded_prime_divisors(
                initial_index,
                min(
                    factorization_work_limit,
                    budget.remaining,
                ),
                cancelled,
            )
        )
        budget.consume(factor_work)
        if (
            _payload_boolean(
                payload["factorization_complete"], "factorization completeness"
            )
            != factorization_complete
            or _payload_integer(
                payload["factorization_remaining"], "factorization cofactor"
            )
            != factorization_remaining
            or _payload_integer(payload["factorization_work"], "factorization work")
            != factor_work
        ):
            return False
        if (
            bounded_integer_vector(
                payload["required_primes"],
                len(required),
                "required saturation primes",
            )
            != required
        ):
            return False
        units_module = __import__("sagejs.number_fields.units", fromlist=["units"])
        torsion = units_module.roots_of_unity(field)
        if not torsion.complete or not torsion.verify():
            return False
        selected_torsion = tuple(torsion.elements)
        selected_units = tuple(initial_units)
        obstructed: set[int] = set()
        replayed_evidence: list[Any] = []
        evidence_precision_history: list[int] = []
        for record in raw_evidence:
            if not isinstance(record, dict):
                return False
            budget.consume()
            prime = bounded_integer(record["prime"], "saturation evidence prime")
            if (
                prime not in required
                or not _payload_boolean(record["rigorous"], "saturation evidence rigor")
                or prime > _MAXIMUM_SATURATION_REPLAY_PRIME
            ):
                return False
            outcome = record.get("outcome")
            if outcome == "enlarged":
                expected_root_keys = {
                    "schema",
                    "outcome",
                    "method",
                    "prime",
                    "exponents",
                    "torsion_exponent",
                    "root_coordinates",
                    "replacement_index",
                    "normalization_power",
                    "normalization_quotients",
                    "normalized_exponents",
                    "lattice_index_change",
                    "precision_history",
                    "rigorous",
                }
                if (
                    len(record) != len(expected_root_keys)
                    or set(record) != expected_root_keys
                    or record.get("schema")
                    != "sagejs.number-fields.unit-pth-root-certificate.v1"
                    or record.get("method") != "exact-pth-root-identity"
                    or _payload_integer(
                        record["lattice_index_change"], "lattice index change"
                    )
                    != prime
                    or remaining_index % prime
                ):
                    return False
                exponents = bounded_integer_vector(
                    record["exponents"], rank, "p-th-root exponents"
                )
                quotients = bounded_integer_vector(
                    record["normalization_quotients"],
                    rank,
                    "p-th-root normalization quotients",
                )
                normalized = bounded_integer_vector(
                    record["normalized_exponents"],
                    rank,
                    "p-th-root normalized exponents",
                )
                if any(
                    abs(value) > _MAXIMUM_SATURATION_REPLAY_WORK
                    for vector in (exponents, quotients, normalized)
                    for value in vector
                ):
                    return False
                raw_precision_history = record["precision_history"]
                if (
                    not isinstance(raw_precision_history, list)
                    or not 1
                    <= len(raw_precision_history)
                    <= _MAXIMUM_SATURATION_REPLAY_PRECISION_STEPS
                ):
                    return False
                precision_history = bounded_integer_vector(
                    raw_precision_history,
                    len(raw_precision_history),
                    "p-th-root precision history",
                )
                raw_root = record["root_coordinates"]
                if not isinstance(raw_root, list) or len(raw_root) != degree:
                    return False
                budget.consume(degree)
                for pair in raw_root:
                    if not isinstance(pair, list) or len(pair) != 2:
                        return False
                    bounded_integer(pair[0], "root coordinate numerator")
                    bounded_integer(pair[1], "root coordinate denominator")
                certificate = UnitPthRootCertificate(
                    prime,
                    exponents,
                    bounded_integer(record["torsion_exponent"], "torsion exponent"),
                    _element_from_payload(field, raw_root),
                    replacement_index=bounded_integer(
                        record["replacement_index"], "replacement index"
                    ),
                    normalization_power=bounded_integer(
                        record["normalization_power"], "normalization power"
                    ),
                    normalization_quotients=quotients,
                    normalized_exponents=normalized,
                    precision_history=precision_history,
                )
                if _canonical_json(certificate.to_dict()) != _canonical_json(record):
                    return False
                budget.consume()
                replayed = certificate.replay(
                    field, order, selected_units, selected_torsion
                )
                if replayed is None:
                    return False
                selected_units = replayed
                remaining_index //= prime
                replayed_evidence.append(certificate)
                evidence_precision_history.extend(certificate.precision_history)
            elif outcome == "saturated":
                expected_local_keys = {
                    "schema",
                    "outcome",
                    "method",
                    "prime",
                    "target_obstructions",
                    "residue_candidate_cap",
                    "precision_history",
                    "rigorous",
                }
                if (
                    len(record) != len(expected_local_keys)
                    or set(record) != expected_local_keys
                    or record.get("schema")
                    != "sagejs.number-fields.unit-local-pth-obstruction.v1"
                    or record.get("method")
                    != "exact-finite-order-quotient-pth-power-obstruction"
                ):
                    return False
                residue_cap = bounded_integer(
                    record["residue_candidate_cap"],
                    "local-obstruction residue cap",
                )
                if not 2 <= residue_cap <= _MAXIMUM_SATURATION_REPLAY_RESIDUES:
                    return False
                target_power = _checked_power_at_most(
                    prime,
                    rank,
                    budget.remaining // len(selected_torsion) + 1,
                    cancelled,
                )
                if target_power is None:
                    return False
                expected_target_count = (target_power - 1) * len(selected_torsion)
                raw_targets = record["target_obstructions"]
                if (
                    not isinstance(raw_targets, list)
                    or len(raw_targets) != expected_target_count
                ):
                    return False
                budget.consume(2 * expected_target_count)
                targets: list[tuple[tuple[int, ...], int, int]] = []
                modulus_costs: dict[int, tuple[int, int]] = {}
                for item in raw_targets:
                    if (
                        not isinstance(item, dict)
                        or len(item) != 3
                        or set(item)
                        != {"exponents", "torsion_exponent", "rational_prime"}
                    ):
                        return False
                    exponents = bounded_integer_vector(
                        item["exponents"], rank, "local-obstruction exponents"
                    )
                    if any(
                        abs(value) > _MAXIMUM_SATURATION_REPLAY_WORK
                        for value in exponents
                    ):
                        return False
                    torsion_exponent = bounded_integer(
                        item["torsion_exponent"], "local-obstruction torsion"
                    )
                    if not 0 <= torsion_exponent < len(selected_torsion):
                        return False
                    modulus = bounded_integer(
                        item["rational_prime"], "local-obstruction prime"
                    )
                    if not 2 <= modulus <= residue_cap:
                        return False
                    if modulus not in modulus_costs:
                        residue_count = _checked_power_at_most(
                            modulus,
                            degree,
                            min(residue_cap, budget.remaining),
                            cancelled,
                        )
                        if residue_count is None:
                            return False
                        factors, _cofactor, factored, factor_work = (
                            _bounded_prime_divisors(
                                modulus, budget.remaining, cancelled
                            )
                        )
                        budget.consume(factor_work)
                        if not factored or factors != (modulus,):
                            return False
                        modulus_costs[modulus] = (residue_count, factor_work)
                    residue_count, factor_work = modulus_costs[modulus]
                    budget.consume(residue_count + factor_work)
                    targets.append((exponents, torsion_exponent, modulus))
                raw_precision_history = record["precision_history"]
                if (
                    not isinstance(raw_precision_history, list)
                    or not 1
                    <= len(raw_precision_history)
                    <= _MAXIMUM_SATURATION_REPLAY_PRECISION_STEPS
                ):
                    return False
                precision_history = bounded_integer_vector(
                    raw_precision_history,
                    len(raw_precision_history),
                    "local-obstruction precision history",
                )
                certificate = UnitLocalPthPowerObstruction(
                    prime,
                    targets,
                    residue_candidate_cap=residue_cap,
                    precision_history=precision_history,
                )
                if _canonical_json(certificate.to_dict()) != _canonical_json(record):
                    return False
                if prime in obstructed or not certificate.verify(
                    field,
                    order,
                    selected_units,
                    selected_torsion,
                    cancelled,
                ):
                    return False
                obstructed.add(prime)
                replayed_evidence.append(certificate)
                evidence_precision_history.extend(certificate.precision_history)
            else:
                return False
        raw_final_units = payload["units"]
        if not isinstance(raw_final_units, list) or len(raw_final_units) != rank:
            return False
        for raw_unit in raw_final_units:
            if not isinstance(raw_unit, list) or len(raw_unit) != degree:
                return False
            budget.consume(degree)
            for pair in raw_unit:
                if not isinstance(pair, list) or len(pair) != 2:
                    return False
                bounded_integer(pair[0], "final unit coordinate numerator")
                bounded_integer(pair[1], "final unit coordinate denominator")
        final_payloads = [
            _element_payload(_ordinary_unit(unit)) for unit in selected_units
        ]
        if _canonical_json(final_payloads) != _canonical_json(raw_final_units):
            return False
        if (
            _payload_integer(
                payload["remaining_index_bound"], "remaining saturation index"
            )
            != remaining_index
        ):
            return False
        if (
            _payload_integer(payload["index_enlargement"], "index enlargement")
            != initial_index // remaining_index
        ):
            return False
        certificate_payload = payload["global_index_certificate"]
        rigorous_bound = False
        if certificate_payload is not None:
            _consume_replay_structure(certificate_payload, budget)
            certificate = UnitSaturationIndexCertificate.from_dict(certificate_payload)
            certificate._workspace = workspace
            rigorous_bound = (
                certificate.index_bound == initial_index
                and certificate.verify(
                    field,
                    order,
                    initial_units,
                    generation_verifier=generation_verifier,
                )
            )
        if (
            _payload_boolean(payload["index_bound_is_rigorous"], "global index rigor")
            != rigorous_bound
        ):
            return False
        resolved = {
            prime for prime in required if remaining_index % prime != 0
        } | obstructed
        unresolved = tuple(prime for prime in required if prime not in resolved)
        if not rigorous_bound:
            unresolved = required
        if (
            bounded_integer_vector(
                payload["unresolved_primes"],
                len(unresolved),
                "unresolved saturation primes",
            )
            != unresolved
        ):
            return False
        complete = rigorous_bound and factorization_complete and not unresolved
        raw_payload_precision = payload["precision_history"]
        if (
            not isinstance(raw_payload_precision, list)
            or not 1 <= len(raw_payload_precision) <= _MAXIMUM_SATURATION_REPLAY_RECORDS
        ):
            return False
        payload_precision_history = bounded_integer_vector(
            raw_payload_precision,
            len(raw_payload_precision),
            "saturation precision history",
        )
        if not payload_precision_history or any(
            value < 16 for value in payload_precision_history
        ):
            return False
        if complete and evidence_precision_history:
            if payload_precision_history != tuple(evidence_precision_history):
                return False
        expected_status = "rigorous" if complete else "incomplete"
        global_proof_status = (
            None if certificate_payload is None else certificate_payload["proof_status"]
        )
        if complete and global_proof_status == "exact-relations-conditional-grh":
            expected_proof_status = "exact-unit-p-saturation-conditional-grh"
        elif complete:
            expected_proof_status = "exact-unit-p-saturation-unconditional"
        else:
            expected_proof_status = "bounded-unit-p-saturation-incomplete"
        statuses_match = (
            _payload_boolean(payload["complete"], "saturation completeness") == complete
            and _payload_boolean(payload["saturated"], "saturation state") == complete
            and _payload_boolean(payload["rigorous"], "saturation rigor") == complete
            and payload["status"] == expected_status
            and payload["proof_status"] == expected_proof_status
            and payload["global_proof_status"] == global_proof_status
            and (not complete or payload["incomplete_reason"] is None)
        )
        incomplete_reason = payload["incomplete_reason"]
        if incomplete_reason is not None and not isinstance(incomplete_reason, str):
            return False
        reconstructed = ExactUnitSaturationResult(
            field,
            order,
            initial_units,
            selected_units,
            selected_torsion,
            initial_index_bound=initial_index,
            remaining_index_bound=remaining_index,
            index_bound_is_rigorous=rigorous_bound,
            global_index_certificate=certificate_payload,
            factorization_complete=factorization_complete,
            factorization_remaining=factorization_remaining,
            factorization_work=factor_work,
            factorization_work_limit=factorization_work_limit,
            required_primes=required,
            unresolved_primes=unresolved,
            evidence=replayed_evidence,
            precision_history=payload_precision_history,
            incomplete_reason=incomplete_reason,
            generation_verifier=generation_verifier,
            workspace=workspace,
        )
        return statuses_match and _canonical_json(
            reconstructed.to_dict()
        ) == _canonical_json(payload)
    except (
        KeyError,
        TypeError,
        ValueError,
        ArithmeticError,
        ZeroDivisionError,
        AnalyticResourceError,
        _ReplayResourceExceeded,
    ):
        return False


verify_saturation_record = verify_saturation_evidence


def _determinant_ball(
    rows: Sequence[Sequence[RealBall]],
    *,
    maximum_states: int,
    cancelled: Callable[[], Any] | None,
) -> RealBall:
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
        if callable(cancelled) and cancelled():
            raise AnalyticResourceError("regulator determinant was cancelled")
        next_states: dict[int, RealBall] = {}
        for mask, partial in states.items():
            if len(next_states) > maximum_states:
                raise AnalyticResourceError(
                    "regulator determinant exceeded its state cap"
                )
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
    maximum_determinant_states: int = 65_536,
    cancelled: Callable[[], Any] | None = None,
) -> RegulatorEnclosure:
    """Enclose the weighted-log determinant with precision escalation.

    Rows correspond to units.  Columns correspond to the `r1+r2`
    archimedean places, with complex logarithms already multiplied by two.
    The final product-formula column is omitted, matching Hecke and Sage's
    regulator convention.
    """
    unit_rank = int(unit_rank)
    maximum_states = int(maximum_determinant_states)
    if unit_rank < 0:
        raise ValueError("unit_rank must be nonnegative")
    if maximum_states < 1:
        raise ValueError("maximum_determinant_states must be positive")
    if _checked_power_at_most(2, unit_rank, maximum_states, cancelled) is None:
        raise AnalyticResourceError(
            "regulator determinant subset states exceed maximum_determinant_states"
        )
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
        determinant = _determinant_ball(
            rows,
            maximum_states=maximum_states,
            cancelled=cancelled,
        ).absolute_value()
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
    maximum_determinant_states: int = 65_536,
    cancelled: Callable[[], Any] | None = None,
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
        maximum_determinant_states=maximum_determinant_states,
        cancelled=cancelled,
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
    # Reuse Sage.js's canonical exact prime service.  Its retained sieve is
    # shared with maximal-order splitting, whereas spelling a bytearray sieve
    # here repeated the same prime enumeration inside every analytic workspace
    # and lowered poorly through the Python runtime.
    try:
        base_module = __import__(
            "sagejs._baselib.number_fields", fromlist=["number_fields"]
        )
        prime_range = base_module._nf_global("prime_range")
        return [int(value) for value in prime_range(int(bound))]
    except (AttributeError, ImportError):
        # Keep this mathematical module directly executable under ordinary
        # CPython, where Sage.js's baselib registry is intentionally absent.
        sieve = bytearray(b"\x01") * bound
        sieve[0:2] = b"\x00\x00"
        prime = 2
        while prime * prime < bound:
            if sieve[prime]:
                start = prime * prime
                sieve[start:bound:prime] = b"\x00" * (
                    ((bound - 1 - start) // prime) + 1
                )
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


def _packed_splitting_block(
    provider: Callable[[int, int], Iterable[Any]],
    start: int,
    stop: int,
    expected_primes: Sequence[int],
    degree: int,
) -> dict[int, tuple[tuple[int, int], ...]] | None:
    """Decode the maximal order's private packed splitting stream.

    The public splitting provider remains the authoritative fallback.  This
    hook only avoids expanding an already certified FLINT batch into nested
    record dictionaries which this analytic layer would immediately compact
    again.  Every interval, rational prime, packed shape, factor, and local
    degree identity is replayed here before the data enters the workspace.
    """
    order = getattr(provider, "__self__", None)
    hook = getattr(order, "_zeta_factor_degree_data", None)
    if not callable(hook):
        return None
    data: Any = hook(start, stop)
    if data is None:
        return None
    try:
        if data.get("completePrimeInterval") is not True:
            raise AnalyticCertificationError(
                "packed splitting data does not certify a complete prime interval"
            )
        if int(data["intervalStart"]) != start or int(data["intervalStop"]) != stop:
            raise AnalyticCertificationError(
                "packed splitting data describes a different prime interval"
            )
        if int(data["degree"]) != degree:
            raise AnalyticCertificationError(
                "packed splitting data has the wrong field degree"
            )
        primes = data["primes"]
        counts = data["factorCounts"]
        exponents = data["exponents"]
        degrees = data["degrees"]
        record_count = len(expected_primes)
        if len(primes) != record_count or len(counts) != record_count:
            raise AnalyticCertificationError(
                "packed splitting data has the wrong record count"
            )
        if len(exponents) != record_count * degree or len(degrees) != len(exponents):
            raise AnalyticCertificationError(
                "packed splitting factor arrays have the wrong shape"
            )
    except (KeyError, TypeError, ValueError, OverflowError) as error:
        raise AnalyticCertificationError("malformed packed splitting data") from error

    block: dict[int, tuple[tuple[int, int], ...]] = {}
    for row, expected_prime in enumerate(expected_primes):
        try:
            prime = int(primes[row])
            count = int(counts[row])
        except (TypeError, ValueError, OverflowError) as error:
            raise AnalyticCertificationError(
                "malformed packed splitting record"
            ) from error
        if prime != expected_prime:
            raise AnalyticCertificationError(
                "packed splitting data omitted or reordered a rational prime"
            )
        if count < 1 or count > degree:
            raise AnalyticCertificationError(
                "packed splitting data has an invalid factor count"
            )
        factors = []
        for index in range(count):
            offset = row * degree + index
            try:
                ramification = int(exponents[offset])
                residue_degree = int(degrees[offset])
            except (TypeError, ValueError, OverflowError) as error:
                raise AnalyticCertificationError(
                    "malformed packed splitting factor"
                ) from error
            if ramification < 1 or residue_degree < 1:
                raise AnalyticCertificationError(
                    "packed splitting data has a nonpositive factor"
                )
            factors.append((ramification, residue_degree))
        if sum(e * f for e, f in factors) != degree:
            raise AnalyticCertificationError(
                "packed splitting data violates the local degree identity"
            )
        block[prime] = tuple(factors)
    return block


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


def _real_ball_snapshot(ball: RealBall) -> tuple[Any, ...]:
    """Return an immutable exact snapshot of one cached analytic interval."""
    return (
        ball.lower.numerator,
        ball.lower.denominator,
        ball.upper.numerator,
        ball.upper.denominator,
        ball.precision_bits,
        ball.rigorous,
        ball.source,
    )


def _real_ball_from_snapshot(snapshot: tuple[Any, ...]) -> RealBall:
    """Reconstruct a fresh interval from a shared immutable snapshot."""
    (
        lower_numerator,
        lower_denominator,
        upper_numerator,
        upper_denominator,
        precision_bits,
        rigorous,
        source,
    ) = snapshot
    return RealBall(
        RationalEndpoint(lower_numerator, lower_denominator),
        RationalEndpoint(upper_numerator, upper_denominator),
        precision_bits=precision_bits,
        rigorous=rigorous,
        source=source,
    )


def _shared_zeta_workspace_key(
    discriminant: int,
    degree: int,
    splitting_provider: Callable[[int, int], Iterable[Any]],
) -> str | None:
    """Fingerprint an exact maximal-order splitting provider, ignoring names."""
    order = getattr(splitting_provider, "__self__", None)
    if order is None:
        return None
    try:
        field = order.number_field()
        coefficients = tuple(
            (int(value._numerator), int(value._denominator))
            for value in field._defining_coefficients
        )
        basis = tuple(
            tuple((int(value._numerator), int(value._denominator)) for value in row)
            for row in order._basis_rows
        )
        if int(field.degree()) != int(degree) or int(order.discriminant()) != int(
            discriminant
        ):
            return None
    except (AttributeError, TypeError, ValueError):
        return None
    body = {
        "schema": "sagejs.number-fields/shared-zeta-workspace-key-v1",
        "degree": int(degree),
        "discriminant": int(discriminant),
        "defining_polynomial": coefficients,
        "maximal_order_basis": basis,
    }
    return hashlib.sha256(_canonical_json(body).encode("utf-8")).hexdigest()


class _SharedZetaWorkspaceSnapshot:
    """Module-issued immutable cache entry, never serialized as proof data."""

    def __init__(self, token: object, key: str, payload: tuple[Any, ...]) -> None:
        if token is not _SHARED_ZETA_WORKSPACE_SNAPSHOT_TOKEN:
            raise TypeError("shared zeta snapshots are module-issued")
        self.key = str(key)
        self.payload = payload
        self.__dict__["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("shared zeta snapshots are immutable")
        self.__dict__[name] = value


def _build_bf_plan_readable(
    threshold: int,
    splitting: dict[int, tuple[tuple[int, int], ...]],
) -> _BFPrimePowerPlan:
    ninth = threshold // 9
    aggregated: dict[int, dict[int, dict[int, int]]] = {}
    raw_terms = 0

    def add(sign: int, scale: int, norm: int, exponent: int) -> None:
        nonlocal raw_terms
        raw_terms += 1
        by_norm = aggregated.get(scale)
        if by_norm is None:
            by_norm = {}
            aggregated[scale] = by_norm
        by_exponent = by_norm.get(norm)
        if by_exponent is None:
            by_exponent = {}
            by_norm[norm] = by_exponent
        by_exponent[exponent] = by_exponent.get(exponent, 0) + sign

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
    terms = []
    for scale in sorted(aggregated):
        by_norm = aggregated[scale]
        for norm in sorted(by_norm):
            by_exponent = by_norm[norm]
            for exponent in sorted(by_exponent):
                multiplicity = by_exponent[exponent]
                if multiplicity:
                    terms.append((multiplicity, scale, norm, exponent))
    return _BFPrimePowerPlan(threshold, terms, raw_terms)


def _build_bf_plan_kernel(
    threshold: int,
    splitting: dict[int, tuple[tuple[int, int], ...]],
) -> _BFPrimePowerPlan | None:
    """Build one exact plan through the compiled packed source, or decline."""
    try:
        kernel_module = __import__(
            "sagejs.number_fields.zeta_coefficient_kernel",
            fromlist=["assemble_bf_prime_power_plan_in_place"],
        )
        native_module = __import__("sagejs.native", fromlist=["native"])
        kernel = _bf_prime_power_plan_kernel_override
        if kernel is False:
            return None
        if kernel is None:
            kernel = getattr(
                kernel_module, "assemble_bf_prime_power_plan_in_place", None
            )
            is_compiled = getattr(native_module, "is_compiled", None)
            if (
                not callable(kernel)
                or not callable(is_compiled)
                or not is_compiled(kernel)
            ):
                return None
        elif not callable(kernel):
            return None

        primes = tuple(sorted(int(prime) for prime in splitting))
        if not primes:
            return _BFPrimePowerPlan(threshold, (), 0)
        first_factors = splitting[primes[0]]
        degree = sum(int(e) * int(f) for e, f in first_factors)
        if degree < 1 or degree > 64:
            return None
        counts: list[int] = []
        exponents: list[int] = []
        degrees: list[int] = []
        for prime in primes:
            factors = splitting[prime]
            if len(factors) < 1 or len(factors) > degree:
                return None
            if sum(int(e) * int(f) for e, f in factors) != degree:
                return None
            counts.append(len(factors))
            for e, f in factors:
                exponents.append(int(e))
                degrees.append(int(f))
            for _padding in range(degree - len(factors)):
                exponents.append(0)
                degrees.append(0)

        packed_primes = native_module.kernel_uint64_buffer(kernel, primes)
        packed_counts = native_module.kernel_uint64_buffer(kernel, counts)
        packed_exponents = native_module.kernel_uint64_buffer(kernel, exponents)
        packed_degrees = native_module.kernel_uint64_buffer(kernel, degrees)
        metadata = native_module.kernel_integer_zeros(kernel, 2, 1)
        workspace = native_module.kernel_integer_zeros(kernel, threshold, 1)
        scratch = native_module.kernel_integer_zeros(kernel, 1, 1)
        if not bool(
            kernel(
                metadata,
                scratch,
                workspace,
                packed_primes,
                packed_counts,
                packed_exponents,
                packed_degrees,
                degree,
                threshold,
                0,
            )
        ):
            return None
        metadata_values = native_module.integer_buffer_values(metadata)
        if len(metadata_values) != 2:
            return None
        runtime_module = __import__("sagejs.runtime", fromlist=["runtime"])
        term_count = runtime_module.number(metadata_values[0])
        raw_terms = runtime_module.number(metadata_values[1])
        if (
            term_count < 0
            or term_count > _MAXIMUM_PACKED_BF_PLAN_TERMS
            or raw_terms < term_count
        ):
            return None
        output = native_module.kernel_integer_zeros(kernel, 4 * term_count, 1)
        if not bool(
            kernel(
                metadata,
                output,
                workspace,
                packed_primes,
                packed_counts,
                packed_exponents,
                packed_degrees,
                degree,
                threshold,
                1,
            )
        ):
            return None
        repeated_metadata = native_module.integer_buffer_values(metadata)
        if (
            len(repeated_metadata) != 2
            or runtime_module.number(repeated_metadata[0]) != term_count
            or runtime_module.number(repeated_metadata[1]) != raw_terms
        ):
            return None
        flat = native_module.integer_buffer_values(output)
        if len(flat) != 4 * term_count:
            return None
        terms: list[tuple[int, int, int, int]] = []
        previous_key: tuple[int, int, int] | None = None
        for index in range(term_count):
            offset = 4 * index
            multiplicity = int(flat[offset])
            scale = int(flat[offset + 1])
            norm = int(flat[offset + 2])
            exponent = int(flat[offset + 3])
            cutoff = threshold if scale == 0 else threshold // 9
            key = (scale, norm, exponent)
            if (
                multiplicity == 0
                or scale not in (0, 1)
                or norm < 2
                or exponent < 1
                or norm**exponent >= cutoff
                or (previous_key is not None and key <= previous_key)
            ):
                return None
            previous_key = key
            terms.append((multiplicity, scale, norm, exponent))
        return _BFPrimePowerPlan(threshold, terms, raw_terms)
    except (
        AttributeError,
        ImportError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
    ):
        return None


def _build_bf_plan(
    threshold: int,
    splitting: dict[int, tuple[tuple[int, int], ...]],
) -> _BFPrimePowerPlan:
    packed = _build_bf_plan_kernel(threshold, splitting)
    return (
        packed if packed is not None else _build_bf_plan_readable(threshold, splitting)
    )


class ZetaLogResidueWorkspace:
    """Reusable exact analytic work for one field computation.

    Extending a cutoff asks the provider only for the uncovered tail, while
    every new block is checked for complete prime coverage and local degree
    identities. Default live engines may seed a new workspace from a bounded,
    module-issued immutable snapshot keyed by the exact defining polynomial
    and maximal-order basis; arbitrary providers and detached replay do not.
    Regulator entries remain local and are keyed by the exact algebraic unit
    coordinates and every precision/resource parameter. The workspace is
    absent from serialized certificates, whose replay remains independent.
    """

    def __init__(
        self,
        discriminant: int,
        degree: int,
        splitting_provider: Callable[[int, int], Iterable[Any]],
        *,
        share_across_isomorphic_fields: bool = False,
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
        self.prime_enumeration_cache_hits = 0
        self.regulator_calls = 0
        self.regulator_cache_hits = 0
        self.zeta_residue_calls = 0
        self.certificate_construction_calls = 0
        self.certificate_replay_calls = 0
        self.shared_workspace_cache_hits = 0
        self.splitting_nanoseconds = 0
        self.prime_enumeration_nanoseconds = 0
        self.threshold_nanoseconds = 0
        self.prime_power_plan_nanoseconds = 0
        self.finite_term_nanoseconds = 0
        self.regulator_nanoseconds = 0
        self.zeta_residue_nanoseconds = 0
        self.hr_validation_nanoseconds = 0
        self.certificate_construction_nanoseconds = 0
        self.certificate_replay_nanoseconds = 0
        self._records: dict[int, tuple[tuple[int, int], ...]] = {}
        self._plans: dict[int, _BFPrimePowerPlan] = {}
        self._primes: dict[int, tuple[int, ...]] = {}
        self._thresholds: dict[tuple[str, int], tuple[int, RealBall, int]] = {}
        self._finite_terms: dict[tuple[int, int], tuple[RealBall, dict[str, int]]] = {}
        self._regulators: dict[
            tuple[str, int, int, int, int, int], tuple[RegulatorEnclosure, str]
        ] = {}
        self._shared_cache_key = (
            _shared_zeta_workspace_key(discriminant, degree, splitting_provider)
            if share_across_isomorphic_fields
            else None
        )
        if self._shared_cache_key is not None:
            snapshot = _shared_zeta_workspace_snapshots.get(self._shared_cache_key)
            if (
                type(snapshot) is _SharedZetaWorkspaceSnapshot
                and snapshot.key == self._shared_cache_key
            ):
                self._restore_shared_snapshot(snapshot.payload)
                self.shared_workspace_cache_hits = 1
                # Refresh insertion order so this fixed-capacity dictionary is
                # a small LRU, not a process-lifetime proof-data archive.
                _shared_zeta_workspace_snapshots.pop(self._shared_cache_key)
                _shared_zeta_workspace_snapshots[self._shared_cache_key] = snapshot

    def _shared_snapshot(self) -> tuple[Any, ...]:
        return (
            self.covered_stop,
            tuple(sorted(self._records.items())),
            tuple(
                (threshold, plan.terms, plan.raw_terms)
                for threshold, plan in sorted(self._plans.items())
            ),
            tuple(sorted(self._primes.items())),
            tuple(
                (key, value[0], _real_ball_snapshot(value[1]), value[2])
                for key, value in sorted(self._thresholds.items())
            ),
            tuple(
                (
                    key,
                    _real_ball_snapshot(value[0]),
                    tuple(sorted(value[1].items())),
                )
                for key, value in sorted(self._finite_terms.items())
            ),
        )

    def _restore_shared_snapshot(self, snapshot: tuple[Any, ...]) -> None:
        (
            covered_stop,
            records,
            plans,
            primes,
            thresholds,
            finite_terms,
        ) = snapshot
        self.covered_stop = int(covered_stop)
        self._records = {int(prime): tuple(factors) for prime, factors in records}
        self._plans = {
            int(threshold): _BFPrimePowerPlan(threshold, terms, raw_terms)
            for threshold, terms, raw_terms in plans
        }
        self._primes = {int(bound): tuple(values) for bound, values in primes}
        self._thresholds = {
            tuple(key): (
                int(threshold),
                _real_ball_from_snapshot(ball),
                int(evaluations),
            )
            for key, threshold, ball, evaluations in thresholds
        }
        self._finite_terms = {
            tuple(key): (_real_ball_from_snapshot(ball), dict(diagnostics))
            for key, ball, diagnostics in finite_terms
        }

    def _publish_shared_snapshot(self) -> None:
        key = self._shared_cache_key
        if key is None:
            return
        snapshot = _SharedZetaWorkspaceSnapshot(
            _SHARED_ZETA_WORKSPACE_SNAPSHOT_TOKEN,
            key,
            self._shared_snapshot(),
        )
        _shared_zeta_workspace_snapshots.pop(key, None)
        if len(_shared_zeta_workspace_snapshots) >= _SHARED_ZETA_WORKSPACE_CACHE_LIMIT:
            oldest = next(iter(_shared_zeta_workspace_snapshots))
            _shared_zeta_workspace_snapshots.pop(oldest)
        _shared_zeta_workspace_snapshots[key] = snapshot

    def diagnostics(self) -> dict[str, int]:
        """Return non-proof cache counters and monotonic phase timings."""
        return {
            "provider_calls": self.provider_calls,
            "records_decoded": self.records_decoded,
            "splitting_cache_hits": self.splitting_cache_hits,
            "prime_enumeration_cache_hits": self.prime_enumeration_cache_hits,
            "prime_power_plan_cache_hits": self.plan_cache_hits,
            "threshold_cache_hits": self.threshold_cache_hits,
            "finite_term_cache_hits": self.finite_term_cache_hits,
            "regulator_calls": self.regulator_calls,
            "regulator_cache_hits": self.regulator_cache_hits,
            "zeta_residue_calls": self.zeta_residue_calls,
            "certificate_construction_calls": self.certificate_construction_calls,
            "certificate_replay_calls": self.certificate_replay_calls,
            "shared_workspace_cache_hits": self.shared_workspace_cache_hits,
            "splitting_nanoseconds": self.splitting_nanoseconds,
            "prime_enumeration_nanoseconds": self.prime_enumeration_nanoseconds,
            "threshold_nanoseconds": self.threshold_nanoseconds,
            "prime_power_plan_nanoseconds": self.prime_power_plan_nanoseconds,
            "finite_term_nanoseconds": self.finite_term_nanoseconds,
            "regulator_nanoseconds": self.regulator_nanoseconds,
            "zeta_residue_nanoseconds": self.zeta_residue_nanoseconds,
            "hr_validation_nanoseconds": self.hr_validation_nanoseconds,
            "certificate_construction_nanoseconds": (
                self.certificate_construction_nanoseconds
            ),
            "certificate_replay_nanoseconds": self.certificate_replay_nanoseconds,
        }

    def _record_certificate_construction(self, started: int) -> None:
        self.certificate_construction_calls += 1
        self.certificate_construction_nanoseconds += time.perf_counter_ns() - started

    def _record_certificate_replay(self, started: int) -> None:
        self.certificate_replay_calls += 1
        self.certificate_replay_nanoseconds += time.perf_counter_ns() - started

    def rational_primes_below(self, bound: int) -> list[int]:
        """Return a cached exact rational-prime table below `bound`."""
        started = time.perf_counter_ns()
        try:
            cached = self._primes.get(int(bound))
            if cached is not None:
                self.prime_enumeration_cache_hits += 1
                return list(cached)
            primes = tuple(_primes_below(int(bound)))
            self._primes[int(bound)] = primes
            return list(primes)
        finally:
            self.prime_enumeration_nanoseconds += time.perf_counter_ns() - started

    def regulator_from_factored_units(
        self,
        units: Sequence[Any],
        *,
        unit_rank: int,
        precision_bits: int = 100,
        absolute_tolerance_bits: int = 64,
        maximum_precision_bits: int = 4096,
        maximum_determinant_states: int = 65_536,
        cancelled: Callable[[], Any] | None = None,
    ) -> RegulatorEnclosure:
        """Reuse a regulator only for the same exact units and parameters."""
        started = time.perf_counter_ns()
        self.regulator_calls += 1
        try:
            if callable(cancelled) and cancelled():
                raise AnalyticResourceError("regulator computation was cancelled")
            unit_payload = [_element_payload(_ordinary_unit(unit)) for unit in units]
            key = (
                _canonical_json(unit_payload),
                int(unit_rank),
                int(precision_bits),
                int(absolute_tolerance_bits),
                int(maximum_precision_bits),
                int(maximum_determinant_states),
            )
            cached = self._regulators.get(key)
            if cached is not None:
                regulator, authenticated_payload = cached
                if _canonical_json(regulator.to_dict()) != authenticated_payload:
                    raise AnalyticCertificationError(
                        "a cached regulator enclosure was mutated"
                    )
                self.regulator_cache_hits += 1
                return regulator
            regulator = regulator_from_factored_units(
                units,
                unit_rank=unit_rank,
                precision_bits=precision_bits,
                absolute_tolerance_bits=absolute_tolerance_bits,
                maximum_precision_bits=maximum_precision_bits,
                maximum_determinant_states=maximum_determinant_states,
                cancelled=cancelled,
            )
            self._regulators[key] = (
                regulator,
                _canonical_json(regulator.to_dict()),
            )
            return regulator
        finally:
            self.regulator_nanoseconds += time.perf_counter_ns() - started

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
        started = time.perf_counter_ns()
        try:
            if not primes:
                return {}
            final = primes[-1] + 1
            if final <= self.covered_stop:
                self.splitting_cache_hits += 1
            while self.covered_stop < final:
                start = self.covered_stop
                stop = min(final, start + block_size)
                expected = [prime for prime in primes if start <= prime < stop]
                block = _packed_splitting_block(
                    self.splitting_provider,
                    start,
                    stop,
                    expected,
                    self.degree,
                )
                if block is None:
                    block = {}
                    self.provider_calls += 1
                    for raw_record in self.splitting_provider(start, stop):
                        prime, factors = _splitting_record(raw_record, self.degree)
                        if prime < start or prime >= stop:
                            raise ValueError(
                                "splitting provider returned a prime outside its block"
                            )
                        if prime in block or prime in self._records:
                            raise ValueError(
                                "splitting provider returned a duplicate prime"
                            )
                        block[prime] = factors
                        self.records_decoded += 1
                    missing = set(expected) - set(block)
                    if missing:
                        raise AnalyticCertificationError(
                            "splitting provider omitted rational prime "
                            + str(min(missing))
                        )
                    unexpected = set(block) - set(expected)
                    if unexpected:
                        raise ValueError(
                            "splitting provider returned a composite or out-of-range entry"
                        )
                else:
                    self.provider_calls += 1
                    self.records_decoded += len(block)
                self._records.update(block)
                self.covered_stop = stop
            return {prime: self._records[prime] for prime in primes}
        finally:
            self.splitting_nanoseconds += time.perf_counter_ns() - started

    def prime_power_plan(
        self,
        threshold: int,
        splitting: dict[int, tuple[tuple[int, int], ...]],
    ) -> _BFPrimePowerPlan:
        started = time.perf_counter_ns()
        try:
            cached = self._plans.get(threshold)
            if cached is not None:
                self.plan_cache_hits += 1
                return cached
            plan = _build_bf_plan(threshold, splitting)
            self._plans[threshold] = plan
            return plan
        finally:
            self.prime_power_plan_nanoseconds += time.perf_counter_ns() - started

    def threshold(
        self,
        target: RationalEndpoint,
        precision: int,
        maximum: int,
    ) -> tuple[int, RealBall, int]:
        started = time.perf_counter_ns()
        try:
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
        finally:
            self.threshold_nanoseconds += time.perf_counter_ns() - started

    def finite_term(
        self, plan: _BFPrimePowerPlan, precision: int
    ) -> tuple[RealBall, dict[str, int]]:
        started = time.perf_counter_ns()
        try:
            key = (plan.threshold, int(precision))
            cached = self._finite_terms.get(key)
            if cached is not None:
                self.finite_term_cache_hits += 1
                return cached[0], {
                    "log_evaluations": 0,
                    "log_cache_hits": 0,
                    "sqrt_evaluations": 0,
                    "sqrt_cache_hits": 0,
                    "bf_dyadic_kernel_calls": 0,
                    "bf_dyadic_kernel_successes": 0,
                    "bf_dyadic_kernel_fallbacks": 0,
                    "bf_transcendental_kernel_calls": 0,
                    "bf_transcendental_kernel_successes": 0,
                    "bf_transcendental_kernel_fallbacks": 0,
                    "bf_flint_transcendental_calls": 0,
                    "bf_flint_transcendental_successes": 0,
                    "bf_flint_transcendental_fallbacks": 0,
                    "bf_packed_layout_cache_hits": 0,
                }
            field = IntervalBallField(precision)
            result = (_bf_finite_term(plan, field), field.diagnostics())
            self._finite_terms[key] = result
            return result
        finally:
            self.finite_term_nanoseconds += time.perf_counter_ns() - started


class _BFErrorModel:
    """Precision-local constants for the explicit residue error bound."""

    def __init__(
        self, discriminant: int, degree: int, field: IntervalBallField
    ) -> None:
        self.degree = int(degree)
        self.field = field
        absolute_discriminant = abs(int(discriminant))
        self.log_discriminant = field.log_integer(absolute_discriminant)
        try:
            self.approximate_log_discriminant = math.log(absolute_discriminant)
        except (OverflowError, TypeError, ValueError):
            self.approximate_log_discriminant = float("nan")
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


def _bf_threshold_exact(
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


def _bf_approximate_bound(model: _BFErrorModel, threshold: int) -> float:
    """Return a non-authoritative scalar proposal for the BF cutoff search."""
    log_discriminant = float(model.approximate_log_discriminant)
    sqrt_threshold = math.sqrt(threshold)
    sqrt_log_discriminant = math.sqrt(log_discriminant)
    a1 = 2.324 * log_discriminant / (sqrt_threshold * math.log(3 * threshold))
    a2 = 1.0 + 3.88 / math.log(threshold // 9)
    a3 = 1.0 + 2.0 / sqrt_log_discriminant
    a4 = 4.26 * (model.degree - 1) / (sqrt_threshold * log_discriminant)
    return a1 * (a2 * (a3**2) + a4)


def _bf_threshold(
    model: _BFErrorModel,
    target: RationalEndpoint,
    maximum: int,
) -> tuple[int, RealBall]:
    """Locate the BF cutoff with a scalar proposal and exact certification.

    Binary floating point controls no proof decision here.  It proposes the
    same multiple-of-nine cutoff sought by the readable exact search.  The
    existing outward interval model must then prove that proposal succeeds
    and that its predecessor fails.  Any nonfinite value, disagreement, or
    exceptional arithmetic falls back to the complete exact search.
    """
    try:
        approximate_target = float(target)
        if not math.isfinite(approximate_target) or approximate_target <= 0:
            raise ValueError("the approximate BF target is not positive and finite")
        threshold = 72
        while _bf_approximate_bound(model, threshold) >= approximate_target:
            threshold *= 2
            threshold += (-threshold) % 9
            if threshold > maximum:
                return _bf_threshold_exact(model, target, maximum)
        lower = max(8, (threshold // 2) // 9)
        upper = threshold // 9
        while upper - lower > 1:
            middle = (lower + upper) // 2
            if _bf_approximate_bound(model, 9 * middle) < approximate_target:
                upper = middle
            else:
                lower = middle
        threshold = 9 * upper
        bound = model.bound(threshold)
        predecessor = model.bound(threshold - 9)
        if bound.upper < target and not predecessor.upper < target:
            return threshold, bound
    except (OverflowError, TypeError, ValueError, ZeroDivisionError):
        pass
    return _bf_threshold_exact(model, target, maximum)


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


def _bf_finite_term_scalar(
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
        precision, rigorous, _source = total._binary_state(summand)
        total = RealBall._arithmetic_result(
            total.lower + summand.lower,
            total.upper + summand.upper,
            precision_bits=precision,
            rigorous=rigorous,
            source=(
                "belabas-friedman-finite-prime-sum; "
                "exact outward integer transcendental rounding; "
                "outward-dyadic-arithmetic"
            ),
        )
    multiplier = RealBall(3, precision_bits=field.precision_bits) / (
        RealBall(2, precision_bits=field.precision_bits)
        * sqrt_threshold
        * field.log_integer(3 * threshold)
    )
    return multiplier * total


def _dyadic_mantissas(ball: RealBall, precision_bits: int) -> tuple[int, int]:
    """Return exact `2^-precision_bits` endpoint mantissas or fail closed."""
    if not ball.rigorous or ball.precision_bits != precision_bits:
        raise ValueError("the BF dyadic kernel requires one rigorous precision")
    scale = 1 << precision_bits
    if scale % ball.lower.denominator or scale % ball.upper.denominator:
        raise ValueError("a BF endpoint is not exactly representable at its precision")
    return (
        ball.lower.numerator * (scale // ball.lower.denominator),
        ball.upper.numerator * (scale // ball.upper.denominator),
    )


def _bf_populate_integer_transcendentals(
    values: Sequence[int],
    field: IntervalBallField,
    kernel_module: Any,
    native_module: Any,
) -> dict[int, tuple[int, int, int, int]] | None:
    """Return packed integer log/sqrt endpoints, computing only cache misses."""
    kernel = getattr(
        kernel_module, "assemble_bf_integer_transcendental_endpoints", None
    )
    if not callable(kernel):
        return None
    unique_values = tuple(sorted({int(value) for value in values}))
    if not unique_values:
        return {}
    answer: dict[int, tuple[int, int, int, int]] = {}
    missing_values: list[int] = []
    for value in unique_values:
        key = (field.precision_bits, value)
        logarithm = _shared_integer_mantissas(_shared_integer_log_endpoints, key)
        square_root = _shared_integer_mantissas(_shared_integer_sqrt_endpoints, key)
        if logarithm is None or square_root is None:
            missing_values.append(value)
            continue
        answer[value] = (
            logarithm[0],
            logarithm[1],
            square_root[0],
            square_root[1],
        )
        field._log_hits += 1
        field._sqrt_hits += 1
    if not missing_values:
        return answer

    field._bf_transcendental_kernel_calls += 1
    precision = field.precision_bits
    try:
        packed_values = native_module.kernel_integer_buffer(kernel, missing_values)
        word_capacity = max(8, (precision + 511) // 64)
        output = native_module.kernel_integer_zeros(
            kernel, 4 * len(missing_values), word_capacity
        )
        accepted = bool(kernel(output, packed_values, precision))
        if not accepted:
            field._bf_transcendental_kernel_fallbacks += 1
            return None
        endpoints = native_module.integer_buffer_values(output)
    except (OverflowError, RuntimeError, TypeError, ValueError):
        field._bf_transcendental_kernel_fallbacks += 1
        return None
    if len(endpoints) != 4 * len(missing_values):
        field._bf_transcendental_kernel_fallbacks += 1
        return None
    for index, value in enumerate(missing_values):
        offset = 4 * index
        logarithm_lower = int(endpoints[offset])
        logarithm_upper = int(endpoints[offset + 1])
        square_root_lower = int(endpoints[offset + 2])
        square_root_upper = int(endpoints[offset + 3])
        answer[value] = (
            logarithm_lower,
            logarithm_upper,
            square_root_lower,
            square_root_upper,
        )
        key = (precision, value)
        _remember_shared_integer_mantissas(
            _shared_integer_log_endpoints,
            key,
            logarithm_lower,
            logarithm_upper,
            _INTEGER_LOG_SOURCE,
        )
        _remember_shared_integer_mantissas(
            _shared_integer_sqrt_endpoints,
            key,
            square_root_lower,
            square_root_upper,
            _INTEGER_SQRT_SOURCE,
        )
    field._log_evaluations += len(missing_values)
    field._sqrt_evaluations += len(missing_values)
    field._bf_transcendental_kernel_successes += 1
    return answer


def _bf_flint_packed_layout(
    plan: _BFPrimePowerPlan,
    field: IntervalBallField,
    kernel_module: Any,
    native_module: Any,
) -> tuple[tuple[int, ...], tuple[int, ...]] | None:
    """Build a complete BF layout through packed Arb and exact kernels."""
    flint_kernel = getattr(
        kernel_module,
        "assemble_bf_integer_transcendental_endpoints_flint",
        None,
    )
    layout_kernel = getattr(kernel_module, "assemble_bf_dyadic_layout", None)
    if not callable(flint_kernel) or not callable(layout_kernel):
        return None
    is_compiled = getattr(native_module, "is_compiled", None)
    if (
        not callable(is_compiled)
        or not is_compiled(flint_kernel)
        or not is_compiled(layout_kernel)
    ):
        return None
    threshold = plan.threshold
    needed_values = [threshold, threshold // 9, 3 * threshold]
    needed_values.extend(term[2] for term in plan.terms)
    unique_values = tuple(sorted(set(needed_values)))
    value_to_index = {value: index for index, value in enumerate(unique_values)}
    value_indices = tuple(value_to_index[value] for value in needed_values)
    term_data = tuple(component for term in plan.terms for component in term)
    precision = field.precision_bits
    word_capacity = max(8, (precision + 511) // 64)
    field._bf_flint_transcendental_calls += 1
    try:
        packed_values = native_module.kernel_integer_buffer(flint_kernel, unique_values)
        raw_endpoints = native_module.kernel_integer_zeros(
            flint_kernel, 4 * len(unique_values), word_capacity
        )
        if not bool(flint_kernel(raw_endpoints, packed_values, precision)):
            raise ValueError("FLINT rejected the integer-ball batch")
        packed_indices = native_module.kernel_integer_buffer(
            layout_kernel, value_indices
        )
        packed_terms = native_module.kernel_integer_buffer(layout_kernel, term_data)
        packed_layout = native_module.kernel_integer_zeros(
            layout_kernel, 8 + 4 * len(plan.terms), word_capacity
        )
        if not bool(
            layout_kernel(
                packed_layout,
                raw_endpoints,
                packed_indices,
                packed_terms,
                len(plan.terms),
                precision,
            )
        ):
            raise ValueError("the exact BF layout kernel rejected its input")
        endpoint_values = tuple(
            int(value) for value in native_module.integer_buffer_values(packed_layout)
        )
        if len(endpoint_values) != 8 + 4 * len(plan.terms):
            raise ValueError("the exact BF layout has the wrong width")
    except (OverflowError, RuntimeError, TypeError, ValueError):
        field._bf_flint_transcendental_fallbacks += 1
        return None
    field._log_evaluations += len(unique_values)
    field._sqrt_evaluations += len(unique_values)
    field._bf_flint_transcendental_successes += 1
    return term_data, endpoint_values


def _bf_finite_term_kernel(
    plan: _BFPrimePowerPlan,
    field: IntervalBallField,
) -> RealBall | None:
    """Execute the exact packed dyadic replay, or select the scalar fallback."""
    try:
        kernel_module = __import__(
            "sagejs.number_fields.zeta_coefficient_kernel",
            fromlist=["assemble_bf_dyadic_finite_term"],
        )
        native_module = __import__(
            "sagejs.native",
            fromlist=[
                "integer_buffer_values",
                "kernel_integer_buffer",
                "kernel_integer_zeros",
            ],
        )
    except (ImportError, ModuleNotFoundError):
        field._bf_dyadic_kernel_fallbacks += 1
        return None

    kernel = getattr(kernel_module, "assemble_bf_dyadic_finite_term", None)
    if not callable(kernel):
        field._bf_dyadic_kernel_fallbacks += 1
        return None
    precision = field.precision_bits
    threshold = plan.threshold
    ninth = threshold // 9
    dyadic_scale = 1 << precision
    layout_key = (precision, threshold, plan.terms)
    cached_layout = _shared_bf_packed_layouts.get(layout_key)
    if cached_layout is not None:
        field._bf_packed_layout_cache_hits += 1
        term_data, endpoints = cached_layout
    else:
        packed_layout = _bf_flint_packed_layout(
            plan, field, kernel_module, native_module
        )
        if packed_layout is not None:
            term_data, endpoints = packed_layout
        else:
            needed_values = [threshold, ninth, 3 * threshold]
            needed_values.extend(term[2] for term in plan.terms)
            packed_transcendentals = _bf_populate_integer_transcendentals(
                needed_values,
                field,
                kernel_module,
                native_module,
            )

            def packed_ball(value: int, offset: int, source: str) -> RealBall:
                if packed_transcendentals is None:
                    return (
                        field.log_integer(value)
                        if offset == 0
                        else field.sqrt_integer(value)
                    )
                packed = packed_transcendentals[value]
                return RealBall(
                    RationalEndpoint(packed[offset], dyadic_scale),
                    RationalEndpoint(packed[offset + 1], dyadic_scale),
                    precision_bits=precision,
                    rigorous=True,
                    source=source,
                )

            sqrt_threshold_for_layout = packed_ball(threshold, 2, _INTEGER_SQRT_SOURCE)
            sqrt_ninth = packed_ball(ninth, 2, _INTEGER_SQRT_SOURCE)
            scales = (
                sqrt_threshold_for_layout
                * packed_ball(threshold, 0, _INTEGER_LOG_SOURCE),
                sqrt_ninth * packed_ball(ninth, 0, _INTEGER_LOG_SOURCE),
            )
            log_three_threshold_for_layout = packed_ball(
                3 * threshold, 0, _INTEGER_LOG_SOURCE
            )
            endpoint_list: list[int] = []
            for ball in scales:
                endpoint_list.extend(_dyadic_mantissas(ball, precision))
            endpoint_list.extend(
                _dyadic_mantissas(sqrt_threshold_for_layout, precision)
            )
            endpoint_list.extend(
                _dyadic_mantissas(log_three_threshold_for_layout, precision)
            )
            term_list: list[int] = []
            log_cache: dict[int, RealBall] = {}
            sqrt_cache: dict[int, RealBall] = {}
            for multiplicity, scale_index, norm, exponent in plan.terms:
                term_list.extend((multiplicity, scale_index, norm, exponent))
                if packed_transcendentals is None:
                    logarithm = log_cache.get(norm)
                    if logarithm is None:
                        logarithm = field.log_integer(norm)
                        log_cache[norm] = logarithm
                    endpoint_list.extend(_dyadic_mantissas(logarithm, precision))
                else:
                    logarithm_endpoints = packed_transcendentals[norm]
                    endpoint_list.extend(logarithm_endpoints[:2])
                if exponent % 2:
                    if packed_transcendentals is None:
                        root = sqrt_cache.get(norm)
                        if root is None:
                            root = field.sqrt_integer(norm)
                            sqrt_cache[norm] = root
                        endpoint_list.extend(_dyadic_mantissas(root, precision))
                    else:
                        root_endpoints = packed_transcendentals[norm]
                        endpoint_list.extend(root_endpoints[2:])
                else:
                    endpoint_list.extend((dyadic_scale, dyadic_scale))
            term_data = tuple(term_list)
            endpoints = tuple(endpoint_list)
        if len(_shared_bf_packed_layouts) >= _BF_PACKED_LAYOUT_CACHE_LIMIT:
            _shared_bf_packed_layouts.clear()
        _shared_bf_packed_layouts[layout_key] = (term_data, endpoints)

    sqrt_threshold = RealBall(
        RationalEndpoint(endpoints[4], dyadic_scale),
        RationalEndpoint(endpoints[5], dyadic_scale),
        precision_bits=precision,
        rigorous=True,
        source=_INTEGER_SQRT_SOURCE,
    )
    log_three_threshold = RealBall(
        RationalEndpoint(endpoints[6], dyadic_scale),
        RationalEndpoint(endpoints[7], dyadic_scale),
        precision_bits=precision,
        rigorous=True,
        source=_INTEGER_LOG_SOURCE,
    )

    field._bf_dyadic_kernel_calls += 1
    try:
        packed_terms = native_module.kernel_integer_buffer(kernel, term_data)
        packed_endpoints = native_module.kernel_integer_buffer(kernel, endpoints)
        word_capacity = max(8, (precision + 255) // 64)
        output = native_module.kernel_integer_zeros(kernel, 2, word_capacity)
        accepted = bool(
            kernel(
                output,
                packed_terms,
                packed_endpoints,
                len(plan.terms),
                precision,
            )
        )
        if not accepted:
            field._bf_dyadic_kernel_fallbacks += 1
            return None
        values = native_module.integer_buffer_values(output)
        lower_mantissa = int(values[0])
        upper_mantissa = int(values[1])
    except (OverflowError, RuntimeError, TypeError, ValueError):
        field._bf_dyadic_kernel_fallbacks += 1
        return None
    if upper_mantissa < lower_mantissa:
        field._bf_dyadic_kernel_fallbacks += 1
        return None

    denominator_source = (
        "exact-rational-endpoints; "
        + sqrt_threshold.source
        + "; "
        + log_three_threshold.source
    )
    multiplier_source = "exact-rational-endpoints; " + denominator_source
    total_source = (
        "belabas-friedman-finite-prime-sum; "
        "exact outward integer transcendental rounding; "
        "outward-dyadic-arithmetic"
        if plan.terms
        else "exact-rational-endpoints"
    )
    field._bf_dyadic_kernel_successes += 1
    return RealBall.dyadic_endpoints(
        lower_mantissa,
        -precision,
        upper_mantissa,
        -precision,
        precision_bits=precision,
        rigorous=True,
        source=multiplier_source + "; " + total_source,
    )


def _bf_finite_term(
    plan: _BFPrimePowerPlan,
    field: IntervalBallField,
) -> RealBall:
    try:
        accelerated = _bf_finite_term_kernel(plan, field)
    except (OverflowError, ValueError):
        field._bf_dyadic_kernel_fallbacks += 1
        accelerated = None
    if accelerated is not None:
        return accelerated
    return _bf_finite_term_scalar(plan, field)


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
    zeta_started = time.perf_counter_ns()
    initial_provider_calls = selected_workspace.provider_calls
    initial_splitting_hits = selected_workspace.splitting_cache_hits
    initial_prime_hits = selected_workspace.prime_enumeration_cache_hits
    initial_plan_hits = selected_workspace.plan_cache_hits
    initial_threshold_hits = selected_workspace.threshold_cache_hits
    initial_finite_hits = selected_workspace.finite_term_cache_hits
    initial_splitting_ns = selected_workspace.splitting_nanoseconds
    initial_prime_ns = selected_workspace.prime_enumeration_nanoseconds
    initial_plan_ns = selected_workspace.prime_power_plan_nanoseconds
    initial_threshold_ns = selected_workspace.threshold_nanoseconds
    initial_finite_ns = selected_workspace.finite_term_nanoseconds
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
        primes = selected_workspace.rational_primes_below(threshold)
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
                "prime_enumeration_cache_hits": (
                    selected_workspace.prime_enumeration_cache_hits - initial_prime_hits
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
                "splitting_nanoseconds": (
                    selected_workspace.splitting_nanoseconds - initial_splitting_ns
                ),
                "prime_enumeration_nanoseconds": (
                    selected_workspace.prime_enumeration_nanoseconds - initial_prime_ns
                ),
                "prime_power_plan_nanoseconds": (
                    selected_workspace.prime_power_plan_nanoseconds - initial_plan_ns
                ),
                "threshold_nanoseconds": (
                    selected_workspace.threshold_nanoseconds - initial_threshold_ns
                ),
                "finite_term_nanoseconds": (
                    selected_workspace.finite_term_nanoseconds - initial_finite_ns
                ),
                **interval_diagnostics,
            }
            selected_workspace.zeta_residue_calls += 1
            selected_workspace.zeta_residue_nanoseconds += (
                time.perf_counter_ns() - zeta_started
            )
            selected_workspace._publish_shared_snapshot()
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
    log_pi = field.log(field.pi())
    algebraic = _real_ball_linear_combination(
        (
            (RationalEndpoint(r1 + r2), log_two),
            (RationalEndpoint(r2), log_pi),
            (RationalEndpoint(-1), field.log_integer(roots_of_unity)),
            (RationalEndpoint(-1, 2), field.log_integer(abs(discriminant))),
            (RationalEndpoint(1), field.log_integer(class_number)),
            (RationalEndpoint(1), field.log(regulator_ball)),
        ),
        precision_bits=precision_bits,
        source="analytic class-number formula; one-step exact linear combination",
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


def _unit_index_proof_payload(
    regulator: RegulatorEnclosure,
    zeta: ZetaLogResidueEnclosure,
    index: HRIndexValidationResult,
) -> dict[str, Any]:
    zeta_payload = zeta.to_dict()
    # Cache counters depend on whether construction reused a workspace. They
    # are performance diagnostics, not mathematical evidence.
    zeta_payload.pop("diagnostics", None)
    return {
        "regulator": regulator.to_dict(),
        "zeta_log_residue": zeta_payload,
        "hr_index": index.to_dict(),
    }


def _compute_unit_index_proof(
    field: Any,
    order: Any,
    initial_units: Sequence[Any],
    configuration: dict[str, Any],
    *,
    workspace: ZetaLogResidueWorkspace | None = None,
) -> tuple[int, dict[str, Any]]:
    signature_module = __import__(
        "sagejs.number_fields.embeddings", fromlist=["embeddings"]
    )
    signature = tuple(int(value) for value in signature_module.exact_signature(field))
    configured_signature = tuple(
        _payload_integer(value, "global-index signature entry")
        for value in configuration["signature"]
    )
    if signature != configured_signature:
        raise AnalyticCertificationError(
            "the global index certificate signature does not match the field"
        )
    expected_rank = signature[0] + signature[1] - 1
    if len(initial_units) != expected_rank:
        raise AnalyticCertificationError(
            "the global index certificate has the wrong number of free units"
        )
    units_module = __import__("sagejs.number_fields.units", fromlist=["units"])
    torsion = units_module.roots_of_unity(field)
    if (
        not torsion.complete
        or not torsion.verify()
        or int(torsion.order)
        != _payload_integer(
            configuration["roots_of_unity"], "global-index torsion order"
        )
    ):
        raise AnalyticCertificationError(
            "the global index certificate has unverified torsion data"
        )
    regulator_configuration = configuration["regulator"]
    regulator_precision = _payload_integer(
        regulator_configuration["precision_bits"], "regulator precision"
    )
    regulator_tolerance = _payload_integer(
        regulator_configuration["absolute_tolerance_bits"],
        "regulator absolute tolerance",
    )
    regulator_maximum_precision = _payload_integer(
        regulator_configuration["maximum_precision_bits"],
        "maximum regulator precision",
    )
    regulator = (
        regulator_from_factored_units(
            initial_units,
            unit_rank=expected_rank,
            precision_bits=regulator_precision,
            absolute_tolerance_bits=regulator_tolerance,
            maximum_precision_bits=regulator_maximum_precision,
        )
        if workspace is None
        else workspace.regulator_from_factored_units(
            initial_units,
            unit_rank=expected_rank,
            precision_bits=regulator_precision,
            absolute_tolerance_bits=regulator_tolerance,
            maximum_precision_bits=regulator_maximum_precision,
        )
    )
    zeta_configuration = configuration["zeta"]
    zeta_absolute_error = zeta_configuration["absolute_error"]
    if (
        not isinstance(zeta_absolute_error, str)
        or str(_endpoint(zeta_absolute_error, rigorous=True)) != zeta_absolute_error
    ):
        raise TypeError("zeta absolute error must be a canonical rational string")
    limits_payload = zeta_configuration["limits"]
    limits = ZetaLogResidueLimits(
        maximum_prime_bound=_payload_integer(
            limits_payload["maximum_prime_bound"], "maximum zeta prime bound"
        ),
        maximum_degree=_payload_integer(
            limits_payload["maximum_degree"], "maximum zeta degree"
        ),
        splitting_block_size=_payload_integer(
            limits_payload["splitting_block_size"], "zeta splitting block size"
        ),
        maximum_precision_bits=_payload_integer(
            limits_payload["maximum_precision_bits"], "maximum zeta precision"
        ),
    )
    zeta = zeta_log_residue_bound(
        int(order.discriminant()),
        int(field.degree()),
        order.splitting_records,
        absolute_error=zeta_absolute_error,
        precision_bits=_payload_integer(
            zeta_configuration["precision_bits"], "zeta precision"
        ),
        limits=limits,
        workspace=workspace,
    )
    hr_started = time.perf_counter_ns()
    try:
        index = validate_hr_index(
            signature=(signature[0], signature[1]),
            discriminant=int(order.discriminant()),
            class_number=_payload_integer(
                configuration["class_number"], "global-index class number"
            ),
            roots_of_unity=_payload_integer(
                configuration["roots_of_unity"], "global-index torsion order"
            ),
            regulator=regulator,
            zeta_log_residue=zeta,
            precision_bits=_payload_integer(
                configuration["hr_precision_bits"], "hR validation precision"
            ),
        )
    finally:
        if workspace is not None:
            workspace.hr_validation_nanoseconds += time.perf_counter_ns() - hr_started
    if not index.rigorous or index.unique_index is None:
        raise AnalyticPrecisionError(
            "the replayed analytic proof does not isolate a unique global index"
        )
    return int(index.unique_index), _unit_index_proof_payload(regulator, zeta, index)


_LIVE_UNIT_INDEX_PARENT_TOKEN = object()


class UnitSaturationIndexCertificate:
    """Hash-bound analytic proof of the initial missing class/unit index."""

    def __init__(
        self,
        field_order_identity: dict[str, Any],
        initial_units: Sequence[Any],
        configuration: dict[str, Any],
        index_bound: int,
        analytic_proof: dict[str, Any],
        generation_evidence: Any,
        proof_status: str,
        generation_verifier: Callable[..., Any] | None = None,
        workspace: ZetaLogResidueWorkspace | None = None,
        _live_parent_token: Any = None,
    ) -> None:
        selected_index_bound = int(index_bound)
        selected_proof_status = str(proof_status)
        if selected_index_bound < 1:
            raise ValueError("a global index certificate needs a positive index")
        if selected_proof_status not in (
            "exact-unconditional",
            "exact-relations-conditional-grh",
        ):
            raise ValueError("a global index certificate needs an exact proof status")
        body: dict[str, Any] = {
            "schema": "sagejs.number-fields.unit-saturation-index-certificate.v1",
            "field_order_identity": field_order_identity,
            "initial_units": list(initial_units),
            "configuration": configuration,
            "index_bound": selected_index_bound,
            "analytic_proof": analytic_proof,
            "generation_evidence": generation_evidence,
            "proof_status": selected_proof_status,
        }
        # Retain the assembled body instead of walking this large exact-integer
        # tree a second time.  The canonical byte snapshot below is immutable,
        # and `_authenticated_body_matches()` detects changes to any retained
        # input before live or detached verification consumes it.  Public
        # accessors and `to_dict()` still return structural copies, so callers
        # cannot mutate a valid certificate through the supported API.
        self._body_json = _canonical_json(body)
        snapshot = body
        self._body_snapshot = snapshot
        self._field_order_identity = snapshot["field_order_identity"]
        self._initial_units = snapshot["initial_units"]
        self._configuration = snapshot["configuration"]
        self._index_bound = int(snapshot["index_bound"])
        self._analytic_proof = snapshot["analytic_proof"]
        self._generation_evidence = snapshot["generation_evidence"]
        self._proof_status = str(snapshot["proof_status"])
        self._content_sha256 = hashlib.sha256(
            self._body_json.encode("utf-8")
        ).hexdigest()
        self._generation_verifier = generation_verifier
        self._workspace = workspace
        self._live_parent_authority_available = bool(
            _live_parent_token is _LIVE_UNIT_INDEX_PARENT_TOKEN
        )

    def _authenticated_body_matches(self) -> bool:
        """Fail closed if any retained input changed after construction."""
        try:
            encoded = _canonical_json(self._body_snapshot)
            return bool(
                encoded == self._body_json
                and hashlib.sha256(encoded.encode("utf-8")).hexdigest()
                == self._content_sha256
            )
        except (TypeError, ValueError, ArithmeticError):
            return False

    def _trusted_parent_payload_view(self) -> dict[str, Any]:
        """Return a non-escaping view for one authenticated parent record.

        This private boundary deliberately avoids a second eager traversal of
        the certificate tree.  The parent must copy before exposing it; any
        accidental mutation of the shared nested values invalidates both
        authenticated bodies and therefore fails closed.
        """
        if not self._authenticated_body_matches():
            raise AnalyticCertificationError(
                "global unit-index certificate body changed after construction"
            )
        payload = dict(self._body_snapshot)
        payload["content_sha256"] = self._content_sha256
        return payload

    def _consume_live_parent_payload(self, token: Any) -> dict[str, Any] | None:
        """Transfer the just-built canonical body to its live parent once."""
        if (
            token is not _LIVE_UNIT_INDEX_PARENT_TOKEN
            or not self._live_parent_authority_available
        ):
            return None
        self._live_parent_authority_available = False
        payload = dict(self._body_snapshot)
        payload["content_sha256"] = self._content_sha256
        return payload

    @property
    def field_order_identity(self) -> dict[str, Any]:
        return _json_clone(self._field_order_identity)

    @property
    def initial_units(self) -> list[Any]:
        return _json_clone(self._initial_units)

    @property
    def configuration(self) -> dict[str, Any]:
        return _json_clone(self._configuration)

    @property
    def index_bound(self) -> int:
        return self._index_bound

    @property
    def analytic_proof(self) -> dict[str, Any]:
        return _json_clone(self._analytic_proof)

    @property
    def generation_evidence(self) -> Any:
        return _json_clone(self._generation_evidence)

    @property
    def proof_status(self) -> str:
        return self._proof_status

    def _body_dict(self) -> dict[str, Any]:
        return _json_clone(self._body_snapshot)

    def to_dict(self) -> dict[str, Any]:
        body = self._body_dict()
        body["content_sha256"] = self._content_sha256
        return body

    def workspace_diagnostics(self) -> dict[str, int] | None:
        """Describe live cache use, or `None` for a detached certificate."""
        return None if self._workspace is None else self._workspace.diagnostics()

    @classmethod
    def from_dict(cls, payload: Any) -> UnitSaturationIndexCertificate:
        expected_keys = {
            "schema",
            "field_order_identity",
            "initial_units",
            "configuration",
            "index_bound",
            "analytic_proof",
            "generation_evidence",
            "proof_status",
            "content_sha256",
        }
        if (
            not isinstance(payload, dict)
            or len(payload) != len(expected_keys)
            or set(payload) != expected_keys
        ):
            raise TypeError("a global index certificate payload must be a dictionary")
        body = dict(payload)
        expected_hash = body.pop("content_sha256", None)
        if (
            body.get("schema")
            != "sagejs.number-fields.unit-saturation-index-certificate.v1"
            or not isinstance(expected_hash, str)
            or _content_hash(body) != expected_hash
        ):
            raise AnalyticCertificationError(
                "global unit-index certificate hash mismatch"
            )
        answer = cls(
            body["field_order_identity"],
            body["initial_units"],
            body["configuration"],
            _payload_integer(body["index_bound"], "global saturation index"),
            body["analytic_proof"],
            body["generation_evidence"],
            body["proof_status"],
        )
        if _canonical_json(answer.to_dict()) != _canonical_json(payload):
            raise AnalyticCertificationError(
                "global unit-index certificate payload is not canonical"
            )
        return answer

    def verify(
        self,
        field: Any,
        order: Any,
        initial_units: Sequence[Any],
        generation_verifier: Callable[..., Any] | None = None,
    ) -> bool:
        replay_started = time.perf_counter_ns()
        try:
            if not self._authenticated_body_matches():
                return False
            hr_payload = self._analytic_proof["hr_index"]
            lower_index = _payload_integer(
                hr_payload["lower_index"], "authenticated hR lower index"
            )
            upper_index = _payload_integer(
                hr_payload["upper_index"], "authenticated hR upper index"
            )
            unique_index = _payload_integer(
                hr_payload["unique_index"], "authenticated hR unique index"
            )
            if (
                lower_index != upper_index
                or unique_index != lower_index
                or unique_index != self.index_bound
                or not _payload_boolean(
                    hr_payload["rigorous"], "authenticated hR rigor"
                )
                or not _payload_boolean(
                    self._analytic_proof["regulator"]["rigorous"],
                    "authenticated regulator rigor",
                )
                or not _payload_boolean(
                    self._analytic_proof["zeta_log_residue"]["rigorous"],
                    "authenticated zeta rigor",
                )
            ):
                return False
            if self._field_order_identity != _saturation_field_order_identity(
                field, order
            ):
                return False
            unit_payloads = [
                _element_payload(_ordinary_unit(unit)) for unit in initial_units
            ]
            if unit_payloads != self._initial_units:
                return False
            verifier = generation_verifier or self._generation_verifier
            if not callable(verifier) or not bool(
                verifier(
                    field,
                    order,
                    initial_units,
                    int(self._configuration["class_number"]),
                    _json_clone(self._generation_evidence),
                    self._proof_status,
                )
            ):
                return False
            index_bound, proof = _compute_unit_index_proof(
                field,
                order,
                initial_units,
                self._configuration,
                workspace=self._workspace,
            )
            return index_bound == self._index_bound and proof == self._analytic_proof
        except (TypeError, ValueError, ArithmeticError, ZeroDivisionError):
            return False
        finally:
            if self._workspace is not None:
                self._workspace._record_certificate_replay(replay_started)


def certify_unit_saturation_index(
    field: Any,
    order: Any,
    initial_units: Sequence[Any],
    *,
    class_number: int,
    roots_of_unity: int,
    precision_bits: int = 128,
    regulator_absolute_tolerance_bits: int = 64,
    maximum_precision_bits: int = 4096,
    zeta_absolute_error: Any = "0.125",
    zeta_limits: ZetaLogResidueLimits | None = None,
    workspace: ZetaLogResidueWorkspace | None = None,
    generation_evidence: Any = None,
    generation_verifier: Callable[..., Any] | None = None,
    proof_status: str = "",
    _precomputed_regulator: Any = None,
    _precomputed_zeta_log_residue: Any = None,
    _precomputed_index: Any = None,
    _live_parent_token: Any = None,
) -> UnitSaturationIndexCertificate:
    """Construct a replayable analytic index certificate for exact units.

    The private precomputed arguments are a live producer optimization.  They
    reuse the exact regulator, zeta enclosure, and `h*R` interval computed by
    the immediately preceding engine stage.  Serialized certificates retain
    no such authority: `verify()` always recomputes the analytic proof from
    the field, order, units, and configuration.
    """
    selected_limits = zeta_limits or ZetaLogResidueLimits(
        maximum_precision_bits=maximum_precision_bits
    )
    if generation_evidence is None or not callable(generation_verifier):
        raise AnalyticCertificationError(
            "a global index certificate needs replayable generation evidence"
        )
    if proof_status not in (
        "exact-unconditional",
        "exact-relations-conditional-grh",
    ):
        raise AnalyticCertificationError(
            "a global index certificate needs an exact proof status"
        )
    if not bool(
        generation_verifier(
            field,
            order,
            initial_units,
            int(class_number),
            generation_evidence,
            proof_status,
        )
    ):
        raise AnalyticCertificationError(
            "the factor-base and relation-generation evidence failed replay"
        )
    signature_module = __import__(
        "sagejs.number_fields.embeddings", fromlist=["embeddings"]
    )
    signature = tuple(int(value) for value in signature_module.exact_signature(field))
    configuration = {
        "signature": [signature[0], signature[1]],
        "class_number": int(class_number),
        "roots_of_unity": int(roots_of_unity),
        "hr_precision_bits": int(precision_bits),
        "regulator": {
            "precision_bits": int(precision_bits),
            "absolute_tolerance_bits": int(regulator_absolute_tolerance_bits),
            "maximum_precision_bits": int(maximum_precision_bits),
        },
        "zeta": {
            "absolute_error": str(_endpoint(zeta_absolute_error, rigorous=True)),
            "precision_bits": int(precision_bits),
            "limits": {
                "maximum_prime_bound": selected_limits.maximum_prime_bound,
                "maximum_degree": selected_limits.maximum_degree,
                "splitting_block_size": selected_limits.splitting_block_size,
                "maximum_precision_bits": selected_limits.maximum_precision_bits,
            },
        },
    }
    selected_workspace = workspace or ZetaLogResidueWorkspace(
        int(order.discriminant()), int(field.degree()), order.splitting_records
    )
    construction_started = time.perf_counter_ns()
    try:
        supplied_live_proof = (
            _precomputed_regulator,
            _precomputed_zeta_log_residue,
            _precomputed_index,
        )
        if any(value is not None for value in supplied_live_proof):
            if not all(value is not None for value in supplied_live_proof):
                raise AnalyticCertificationError(
                    "a precomputed analytic proof must supply all three components"
                )
            regulator = _precomputed_regulator
            zeta = _precomputed_zeta_log_residue
            index = _precomputed_index
            if (
                type(regulator) is not RegulatorEnclosure
                or type(zeta) is not ZetaLogResidueEnclosure
                or type(index) is not HRIndexValidationResult
                or regulator.unit_rank != len(initial_units)
                or not regulator.rigorous
                or not zeta.rigorous
                or zeta.discriminant != int(order.discriminant())
                or zeta.degree != int(field.degree())
                or not index.rigorous
                or index.unique_index is None
                or index.lower_index != index.upper_index
                or index.analytic_log_residue.to_dict() != zeta.ball.to_dict()
            ):
                raise AnalyticCertificationError(
                    "precomputed analytic proof components are inconsistent"
                )
            index_bound = int(index.unique_index)
            proof = _unit_index_proof_payload(regulator, zeta, index)
        else:
            index_bound, proof = _compute_unit_index_proof(
                field,
                order,
                initial_units,
                configuration,
                workspace=selected_workspace,
            )
    finally:
        selected_workspace._record_certificate_construction(construction_started)
    return UnitSaturationIndexCertificate(
        _saturation_field_order_identity(field, order),
        [_element_payload(_ordinary_unit(unit)) for unit in initial_units],
        configuration,
        index_bound,
        proof,
        generation_evidence,
        proof_status,
        generation_verifier,
        selected_workspace,
        _live_parent_token=_live_parent_token,
    )


__all__ = [
    "AnalyticCertificationError",
    "AnalyticPrecisionError",
    "AnalyticResourceError",
    "HRIndexValidationResult",
    "ExactUnitSaturationResult",
    "IntervalBallField",
    "RationalEndpoint",
    "RealBall",
    "RegulatorEnclosure",
    "UnitLatticeError",
    "UnitLatticeExtractionResult",
    "UnitLocalPthPowerObstruction",
    "UnitPthRootCertificate",
    "UnitSaturationEvidence",
    "UnitSaturationIndexCertificate",
    "UnitSaturationResult",
    "ZetaLogResidueEnclosure",
    "ZetaLogResidueLimits",
    "ZetaLogResidueWorkspace",
    "certified_regulator_enclosure",
    "certify_unit_saturation_index",
    "extract_unit_lattice",
    "regulator_from_factored_units",
    "saturate_unit_lattice",
    "validate_hr_index",
    "validate_unit_saturation",
    "verify_saturation_evidence",
    "verify_saturation_record",
    "zeta_log_residue_bound",
]
