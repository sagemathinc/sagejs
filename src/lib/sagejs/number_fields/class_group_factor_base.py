"""Exact bounds and compact factor bases for number-field class groups.

The transcendental bounds in this module are decided with rational interval
arithmetic.  No binary floating-point approximation is allowed to choose an
integer bound.  The BDF implementation follows Belabas--Diaz y Diaz--Friedman
as translated by Hecke's `FactorBaseBound.jl`; it replaces Hecke's floating
search with a monotone integer search whose strict inequality is certified by
exact rational enclosures.

Prime ideals are planned from compact splitting records before an HNF lattice
is constructed.  The resulting stream is ordered by ideal norm and skips a
rational-prime decomposition entirely when all residue degrees give norms
above the requested bound.
"""

from __future__ import annotations

from typing import Any, Iterator

import sagejs.runtime as runtime

_embeddings = __import__("sagejs.number_fields.embeddings", fromlist=["embeddings"])
_prime_ideals = __import__(
    "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
)

BOUND_SCHEMA = "sagejs.number-fields/factor-base-bound-v1"
PLAN_SCHEMA = "sagejs.number-fields/factor-base-plan-v1"
PRIME_RECORD_SCHEMA = "sagejs.number-fields/factor-base-prime-v1"

DEFAULT_MAX_BOUND = 1_000_000
DEFAULT_MAX_RATIONAL_PRIMES = 1_000_000
DEFAULT_MAX_PRIME_IDEALS = 1_000_000
DEFAULT_MAX_MEMORY_BYTES = 256 * 1024 * 1024
MAX_INTERVAL_BITS = 512

_pi_cache: dict[int, _Interval] = {}
_log_cache: dict[tuple[int, int, int], _Interval] = {}
_sqrt_cache: dict[tuple[int, int, int], _Interval] = {}
_gamma_cache: dict[int, _Interval] = {}
_catalan_cache: dict[int, _Interval] = {}
_bound_cache: list[tuple[Any, str, Any]] = []


def _gcd(left: int, right: int) -> int:
    a = abs(left)
    b = abs(right)
    while b:
        a, b = b, a % b
    return a


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


def _binomial(top: int, bottom: int) -> int:
    if bottom < 0 or bottom > top:
        return 0
    k = min(bottom, top - bottom)
    answer = 1
    for index in range(1, k + 1):
        answer = answer * (top - k + index) // index
    return answer


class _Rational:
    """One normalized exact rational used only by the interval engine."""

    def __init__(self, numerator: int, denominator: int = 1) -> None:
        if denominator == 0:
            raise ZeroDivisionError("a rational denominator cannot be zero")
        if denominator < 0:
            numerator = -numerator
            denominator = -denominator
        common = _gcd(numerator, denominator)
        self.numerator = numerator // common
        self.denominator = denominator // common

    def __add__(self, other: _Rational) -> _Rational:
        return _Rational(
            self.numerator * other.denominator + other.numerator * self.denominator,
            self.denominator * other.denominator,
        )

    def __sub__(self, other: _Rational) -> _Rational:
        return _Rational(
            self.numerator * other.denominator - other.numerator * self.denominator,
            self.denominator * other.denominator,
        )

    def __mul__(self, other: _Rational) -> _Rational:
        return _Rational(
            self.numerator * other.numerator,
            self.denominator * other.denominator,
        )

    def __truediv__(self, other: _Rational) -> _Rational:
        if other.numerator == 0:
            raise ZeroDivisionError("division by zero rational")
        return _Rational(
            self.numerator * other.denominator,
            self.denominator * other.numerator,
        )

    def __neg__(self) -> _Rational:
        return _Rational(-self.numerator, self.denominator)

    def __lt__(self, other: _Rational) -> bool:
        return self.numerator * other.denominator < other.numerator * self.denominator

    def __le__(self, other: _Rational) -> bool:
        return self.numerator * other.denominator <= other.numerator * self.denominator

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, _Rational)
            and self.numerator == other.numerator
            and self.denominator == other.denominator
        )

    def floor(self) -> int:
        return self.numerator // self.denominator

    def ceil(self) -> int:
        return -((-self.numerator) // self.denominator)

    def power(self, exponent: int) -> _Rational:
        if exponent < 0:
            return _Rational(
                self.denominator ** (-exponent),
                self.numerator ** (-exponent),
            )
        return _Rational(
            self.numerator**exponent,
            self.denominator**exponent,
        )

    def to_pair(self) -> list[int]:
        return [self.numerator, self.denominator]


ZERO = _Rational(0)
ONE = _Rational(1)
TWO = _Rational(2)


def _minimum(values: list[_Rational]) -> _Rational:
    answer = values[0]
    for value in values[1:]:
        if value < answer:
            answer = value
    return answer


def _maximum(values: list[_Rational]) -> _Rational:
    answer = values[0]
    for value in values[1:]:
        if answer < value:
            answer = value
    return answer


class _Interval:
    """A closed rational interval with outward-exact operations."""

    def __init__(self, lower: _Rational, upper: _Rational) -> None:
        if upper < lower:
            raise ValueError("an interval has reversed endpoints")
        self.lower = lower
        self.upper = upper

    @classmethod
    def exact(cls, value: _Rational) -> _Interval:
        return cls(value, value)

    def __add__(self, other: _Interval) -> _Interval:
        return _Interval(self.lower + other.lower, self.upper + other.upper)

    def __sub__(self, other: _Interval) -> _Interval:
        return _Interval(self.lower - other.upper, self.upper - other.lower)

    def __mul__(self, other: _Interval) -> _Interval:
        products = [
            self.lower * other.lower,
            self.lower * other.upper,
            self.upper * other.lower,
            self.upper * other.upper,
        ]
        return _Interval(_minimum(products), _maximum(products))

    def reciprocal(self) -> _Interval:
        if self.lower <= ZERO and ZERO <= self.upper:
            raise ZeroDivisionError("an interval containing zero is not invertible")
        return _Interval(ONE / self.upper, ONE / self.lower)

    def __truediv__(self, other: _Interval) -> _Interval:
        return self * other.reciprocal()

    def scale(self, value: int) -> _Interval:
        scalar = _Interval.exact(_Rational(value))
        return self * scalar

    def power(self, exponent: int) -> _Interval:
        if exponent < 0:
            return self.reciprocal().power(-exponent)
        if exponent == 0:
            return _Interval.exact(ONE)
        if self.lower >= ZERO:
            return _Interval(self.lower.power(exponent), self.upper.power(exponent))
        if self.upper <= ZERO:
            endpoints = [self.lower.power(exponent), self.upper.power(exponent)]
            return _Interval(_minimum(endpoints), _maximum(endpoints))
        if exponent % 2:
            return _Interval(self.lower.power(exponent), self.upper.power(exponent))
        maximum = max(
            abs(self.lower.numerator) * self.upper.denominator,
            abs(self.upper.numerator) * self.lower.denominator,
        )
        denominator = self.lower.denominator * self.upper.denominator
        return _Interval(ZERO, _Rational(maximum, denominator).power(exponent))

    def to_dict(self) -> dict[str, Any]:
        return {
            "lower": self.lower.to_pair(),
            "upper": self.upper.to_pair(),
        }

    def to_dyadic_dict(self, bits: int) -> dict[str, Any]:
        """Return a compact outward-rounded exact dyadic enclosure."""
        scale = 1 << bits
        lower = self.lower.numerator * scale // self.lower.denominator
        upper = -((-self.upper.numerator * scale) // self.upper.denominator)
        return {
            "scale_bits": bits,
            "lower_numerator": lower,
            "upper_numerator": upper,
        }


def _alternating_interval(
    partial: _Rational, next_term: _Rational, next_is_positive: bool
) -> _Interval:
    if next_is_positive:
        return _Interval(partial, partial + next_term)
    return _Interval(partial - next_term, partial)


def _atan_reciprocal_interval(denominator: int, terms: int) -> _Interval:
    total = ZERO
    denominator_squared = denominator * denominator
    power_denominator = denominator
    sign = 1
    for index in range(terms):
        term = _Rational(1, (2 * index + 1) * power_denominator)
        total = total + term if sign > 0 else total - term
        sign = -sign
        power_denominator *= denominator_squared
    next_term = _Rational(1, (2 * terms + 1) * power_denominator)
    return _alternating_interval(total, next_term, sign > 0)


def _pi_interval(bits: int) -> _Interval:
    cached = _pi_cache.get(bits)
    if cached is not None:
        return cached
    terms = max(8, bits // 4 + 4)
    answer = _atan_reciprocal_interval(5, terms).scale(16) - (
        _atan_reciprocal_interval(239, terms).scale(4)
    )
    _pi_cache[bits] = answer
    return answer


def _atanh_log_series(value: _Rational, bits: int) -> _Interval:
    if value < ZERO or value >= ONE:
        raise ValueError("the logarithm series needs 0 <= z < 1")
    if value == ZERO:
        return _Interval.exact(ZERO)
    total = ZERO
    square = value * value
    power = value
    target_denominator = 1 << bits
    for index in range(4096):
        total = total + power * _Rational(1, 2 * index + 1)
        next_power = power * square
        tail = next_power * _Rational(1, 2 * index + 3) / (ONE - square)
        if tail.numerator * target_denominator < tail.denominator:
            return _Interval(total * TWO, (total + tail) * TWO)
        power = next_power
    raise ArithmeticError("the exact logarithm series did not converge")


def _log_rational_interval(value: _Rational, bits: int) -> _Interval:
    if value <= ZERO:
        raise ValueError("a logarithm needs a positive rational")
    key = (value.numerator, value.denominator, bits)
    cached = _log_cache.get(key)
    if cached is not None:
        return cached
    numerator = value.numerator
    denominator = value.denominator
    exponent = numerator.bit_length() - denominator.bit_length()
    if exponent >= 0:
        while numerator < (denominator << exponent):
            exponent -= 1
        while numerator >= (denominator << (exponent + 1)):
            exponent += 1
    else:
        while (numerator << (-exponent)) < denominator:
            exponent -= 1
        while (numerator << (-(exponent + 1))) >= denominator:
            exponent += 1
    if exponent >= 0:
        normalized = _Rational(numerator, denominator << exponent)
    else:
        normalized = _Rational(numerator << (-exponent), denominator)
    z = (normalized - ONE) / (normalized + ONE)
    normalized_log = _atanh_log_series(z, bits + 8)
    if exponent == 0:
        _log_cache[key] = normalized_log
        return normalized_log
    log_two_key = (2, 1, bits)
    log_two = _log_cache.get(log_two_key)
    if log_two is None:
        log_two = _atanh_log_series(_Rational(1, 3), bits + 8)
        _log_cache[log_two_key] = log_two
    answer = normalized_log + log_two.scale(exponent)
    _log_cache[key] = answer
    return answer


def _log_interval(value: _Interval, bits: int) -> _Interval:
    """Enclose the logarithm of one positive rational interval."""
    if value.lower <= ZERO:
        raise ValueError("an interval logarithm needs positive endpoints")
    lower = _log_rational_interval(value.lower, bits)
    upper = _log_rational_interval(value.upper, bits)
    return _Interval(lower.lower, upper.upper)


def _sqrt_rational_interval(value: _Rational, bits: int) -> _Interval:
    if value < ZERO:
        raise ValueError("a square root needs a nonnegative rational")
    key = (value.numerator, value.denominator, bits)
    cached = _sqrt_cache.get(key)
    if cached is not None:
        return cached
    numerator_root = _isqrt(value.numerator)
    denominator_root = _isqrt(value.denominator)
    if (
        numerator_root * numerator_root == value.numerator
        and denominator_root * denominator_root == value.denominator
    ):
        answer = _Interval.exact(_Rational(numerator_root, denominator_root))
        _sqrt_cache[key] = answer
        return answer
    scale = 1 << bits
    scaled_square = value.numerator * scale * scale // value.denominator
    lower_integer = _isqrt(scaled_square)
    lower = _Rational(lower_integer, scale)
    upper = _Rational(lower_integer + 1, scale)
    answer = _Interval(lower, upper)
    _sqrt_cache[key] = answer
    return answer


def _bernoulli_numbers(limit: int) -> list[_Rational]:
    numbers = [ONE]
    for index in range(1, limit + 1):
        total = ZERO
        for lower_index in range(index):
            total = total + numbers[lower_index] * _Rational(
                _binomial(index + 1, lower_index)
            )
        numbers.append(-total / _Rational(index + 1))
    return numbers


def _euler_gamma_interval(bits: int) -> _Interval:
    cached = _gamma_cache.get(bits)
    if cached is not None:
        return cached
    sample = max(64, bits * 2)
    term_count = max(8, bits // 4)
    harmonic = ZERO
    for value in range(1, sample + 1):
        harmonic = harmonic + _Rational(1, value)
    log_sample = _log_rational_interval(_Rational(sample), bits + 16)
    bernoulli = _bernoulli_numbers(2 * term_count)
    correction = ZERO
    for index in range(1, term_count):
        correction = correction + bernoulli[2 * index] * _Rational(
            1, 2 * index * sample ** (2 * index)
        )
    center = (
        _Interval.exact(harmonic - _Rational(1, 2 * sample) + correction) - log_sample
    )
    next_term = bernoulli[2 * term_count] * _Rational(
        1, 2 * term_count * sample ** (2 * term_count)
    )
    shifted = center + _Interval.exact(next_term)
    answer = _Interval(
        _minimum([center.lower, shifted.lower]),
        _maximum([center.upper, shifted.upper]),
    )
    _gamma_cache[bits] = answer
    return answer


def _catalan_interval(bits: int) -> _Interval:
    cached = _catalan_cache.get(bits)
    if cached is not None:
        return cached
    total = ZERO
    sign = 1
    target_denominator = 1 << bits
    for index in range(4096):
        central = _binomial(2 * index, index)
        term = _Rational(
            (3 * index + 2) * (8**index),
            2 * (2 * index + 1) ** 3 * central**3,
        )
        total = total + term if sign > 0 else total - term
        sign = -sign
        next_index = index + 1
        next_central = _binomial(2 * next_index, next_index)
        next_term = _Rational(
            (3 * next_index + 2) * (8**next_index),
            2 * (2 * next_index + 1) ** 3 * next_central**3,
        )
        if next_term.numerator * target_denominator < next_term.denominator:
            answer = _alternating_interval(total, next_term, sign > 0)
            _catalan_cache[bits] = answer
            return answer
    raise ArithmeticError("the exact Catalan series did not converge")


def _same_integer(interval: _Interval, rounding: str) -> int | None:
    if rounding == "floor":
        lower = interval.lower.floor()
        upper = interval.upper.floor()
    elif rounding == "ceil":
        lower = interval.lower.ceil()
        upper = interval.upper.ceil()
    else:
        raise ValueError("unknown interval rounding mode")
    return lower if lower == upper else None


def _as_maximal_order(value: Any) -> Any:
    if hasattr(value, "number_field") and hasattr(value, "is_maximal"):
        if not value.is_maximal():
            raise ValueError("factor bases require a certified maximal order")
        return value
    maximal_order = getattr(value, "maximal_order", None)
    if not callable(maximal_order):
        raise TypeError("expected a number field or certified maximal order")
    order: Any = maximal_order()
    if not order.is_maximal():
        raise ValueError("factor bases require a certified maximal order")
    return order


def _field_metadata(value: Any) -> tuple[Any, Any, int, int, int, int]:
    order = _as_maximal_order(value)
    field = order.number_field()
    degree = int(order.degree())
    r1, r2 = _embeddings.exact_signature(field)
    discriminant = abs(int(order.discriminant()))
    if degree < 1 or r1 + 2 * r2 != degree or discriminant < 1:
        raise ArithmeticError("inconsistent exact number-field metadata")
    return order, field, degree, r1, r2, discriminant


def _cached_bound(order: Any, theorem: str) -> Any:
    for cached_order, cached_theorem, result in _bound_cache:
        if cached_order is order and cached_theorem == theorem:
            return result
    return None


def _store_bound(order: Any, theorem: str, result: Any) -> None:
    _bound_cache.append((order, theorem, result))
    if len(_bound_cache) > 64:
        del _bound_cache[0]


class FactorBaseBound:
    """An integer class-group generation bound with replay metadata."""

    def __init__(
        self,
        theorem: str,
        assumptions: tuple[str, ...],
        bound: int,
        degree: int,
        signature: tuple[int, int],
        discriminant: int,
        precision_bits: int,
        interval: _Interval | None,
        details: dict[str, Any] | None = None,
    ) -> None:
        if bound < 0:
            raise ValueError("a factor-base bound must be nonnegative")
        self.theorem = theorem
        self.assumptions = assumptions
        self.bound = bound
        self.degree = degree
        self.signature = signature
        self.discriminant = discriminant
        self.precision_bits = precision_bits
        self.interval = interval
        self.details = {} if details is None else dict(details)

    def __int__(self) -> int:
        return self.bound

    def to_dict(self) -> dict[str, Any]:
        interval_bits = max(32, min(256, self.precision_bits))
        return {
            "schema": BOUND_SCHEMA,
            "theorem": self.theorem,
            "assumptions": list(self.assumptions),
            "bound": self.bound,
            "degree": self.degree,
            "signature": list(self.signature),
            "discriminant": self.discriminant,
            "precision_bits": self.precision_bits,
            "interval": (
                None
                if self.interval is None
                else self.interval.to_dyadic_dict(interval_bits)
            ),
            "details": dict(self.details),
        }


def minkowski_bound(value: Any) -> FactorBaseBound:
    """Return the exact floor of the classical Minkowski class bound."""
    order = _as_maximal_order(value)
    cached = _cached_bound(order, "minkowski")
    if cached is not None:
        return cached
    _order, _field, degree, r1, r2, discriminant = _field_metadata(order)
    coefficient = _Rational((4**r2) * _factorial(degree), degree**degree)
    for bits in (64, 96, 128, 192, 256, 384, MAX_INTERVAL_BITS):
        interval = (
            _sqrt_rational_interval(_Rational(discriminant), bits)
            * _Interval.exact(coefficient)
            / _pi_interval(bits).power(r2)
        )
        bound = _same_integer(interval, "floor")
        if bound is not None:
            result = FactorBaseBound(
                "Minkowski",
                (),
                bound,
                degree,
                (r1, r2),
                discriminant,
                bits,
                interval,
                {
                    "formula": "floor((4/pi)^r2*n!/n^n*sqrt(abs(D)))",
                    "rounding": "floor-certified-rational-interval",
                },
            )
            _store_bound(order, "minkowski", result)
            return result
    raise ArithmeticError("Minkowski bound is too close to an integer to decide")


def bach_bound(value: Any) -> FactorBaseBound:
    """Return Bach's exact GRH bound, rounded upward by rational intervals."""
    order = _as_maximal_order(value)
    cached = _cached_bound(order, "bach")
    if cached is not None:
        return cached
    _order, _field, degree, r1, r2, discriminant = _field_metadata(order)
    constant = 6 if degree == 2 else 12
    if discriminant == 1:
        interval = _Interval.exact(ZERO)
        bound = 0
        bits = 0
    else:
        bound = None
        interval = _Interval.exact(ZERO)
        bits = 0
        for precision in (64, 96, 128, 192, 256, 384, MAX_INTERVAL_BITS):
            logarithm = _log_rational_interval(_Rational(discriminant), precision)
            interval = logarithm.power(2).scale(constant)
            bound = _same_integer(interval, "ceil")
            bits = precision
            if bound is not None:
                break
        if bound is None:
            raise ArithmeticError("Bach bound is too close to an integer to decide")
    result = FactorBaseBound(
        "Bach",
        ("GRH for the Dedekind zeta function",),
        bound,
        degree,
        (r1, r2),
        discriminant,
        bits,
        interval,
        {
            "formula": str(constant) + "*log(abs(D))^2",
            "rounding": "ceil-certified-rational-interval",
        },
    )
    _store_bound(order, "bach", result)
    return result


class _BDFEvaluator:
    """Cached compact local data for the exact BDF inequality."""

    def __init__(self, order: Any, max_bound: int) -> None:
        self.order = order
        self.max_bound = max_bound
        self.records: dict[int, tuple[tuple[int, int], ...]] = {}
        self.scanned_stop = 2

    def scan_to(self, stop: int) -> None:
        if stop <= self.scanned_stop:
            return
        if stop > self.max_bound + 1:
            raise ValueError("BDF search exceeded max_bound=" + str(self.max_bound))
        lower = self.scanned_stop
        while lower < stop:
            upper = min(stop, lower + 1_000_000)
            for record in _prime_ideals.splitting_records(self.order, lower, upper):
                factors = tuple(
                    (int(factor["e"]), int(factor["f"])) for factor in record["factors"]
                )
                self.records[int(record["prime"])] = factors
            lower = upper
        self.scanned_stop = stop

    def inequality(
        self,
        x_value: int,
        degree: int,
        r1: int,
        discriminant: int,
        bits: int,
    ) -> tuple[int, _Interval, _Interval]:
        if x_value < 2:
            raise ValueError("the BDF parameter must be at least 2")
        self.scan_to(x_value)
        log_x = _log_rational_interval(_Rational(x_value), bits + 12)
        total = _Interval.exact(ZERO)
        term_count = 0
        for prime in sorted(self.records):
            if prime >= x_value:
                break
            for _ramification, residue_degree in self.records[prime]:
                norm = prime**residue_degree
                if norm >= x_value:
                    continue
                log_norm = _log_rational_interval(_Rational(norm), bits + 12)
                power = norm
                exponent = 1
                while power < x_value:
                    decay = _sqrt_rational_interval(
                        _Rational(power), bits + 12
                    ).reciprocal()
                    taper = _Interval.exact(ONE) - (log_norm.scale(exponent) / log_x)
                    total = total + log_norm * decay * taper
                    term_count += 1
                    exponent += 1
                    power *= norm
        pi = _pi_interval(bits + 12)
        catalan = _catalan_interval(bits + 12)
        archimedean = (
            pi.power(2).scale(degree) / _Interval.exact(TWO) + catalan.scale(4 * r1)
        ) / log_x
        right_side = total.scale(2) - archimedean
        gamma = _euler_gamma_interval(bits + 12)
        log_eight_pi = _log_rational_interval(_Rational(8), bits + 12) + _log_interval(
            pi, bits + 12
        )
        left_side = (
            _log_rational_interval(_Rational(discriminant), bits + 12)
            - (gamma + log_eight_pi).scale(degree)
            - pi.scale(r1) / _Interval.exact(TWO)
        )
        return term_count, right_side, left_side


def bdf_bound(value: Any, *, max_bound: int = DEFAULT_MAX_BOUND) -> FactorBaseBound:
    """Return a rigorously rounded BDF GRH factor-base bound.

    The smallest integer `x >= 2` for which the published strict BDF
    inequality is certified is returned.  `max_bound` is an explicit work cap,
    not a mathematical truncation: exceeding it raises without a result.
    """
    if max_bound < 2:
        raise ValueError("max_bound must be at least 2")
    order = _as_maximal_order(value)
    cached = _cached_bound(order, "bdf")
    if cached is not None:
        if cached.bound > max_bound:
            raise ValueError("BDF search exceeded max_bound=" + str(max_bound))
        return cached
    order, _field, degree, r1, r2, discriminant = _field_metadata(order)
    evaluator = _BDFEvaluator(order, max_bound)
    evidence: dict[int, tuple[int, _Interval, _Interval, int]] = {}

    def decision(candidate: int) -> bool:
        for bits in (64, 96, 128, 192, 256, 384, MAX_INTERVAL_BITS):
            count, right_side, left_side = evaluator.inequality(
                candidate, degree, r1, discriminant, bits
            )
            if right_side.lower > left_side.upper:
                evidence[candidate] = (count, right_side, left_side, bits)
                return True
            if right_side.upper <= left_side.lower:
                evidence[candidate] = (count, right_side, left_side, bits)
                return False
        raise ArithmeticError(
            "BDF inequality is numerically inseparable at x=" + str(candidate)
        )

    lower = 1
    upper = 2
    while not decision(upper):
        lower = upper
        if upper >= max_bound:
            raise ValueError("BDF search exceeded max_bound=" + str(max_bound))
        upper = min(max_bound, 2 * upper)
    while upper - lower > 1:
        middle = (lower + upper) // 2
        if decision(middle):
            upper = middle
        else:
            lower = middle
    count, right_side, left_side, bits = evidence[upper]
    detail_bits = max(32, min(256, bits))
    result = FactorBaseBound(
        "Belabas--Diaz y Diaz--Friedman",
        ("GRH for the Dedekind zeta function",),
        upper,
        degree,
        (r1, r2),
        discriminant,
        bits,
        right_side - left_side,
        {
            "inequality": "BDF right side > discriminant/signature side",
            "strict_inequality": True,
            "prime_power_terms": count,
            "right_side": right_side.to_dyadic_dict(detail_bits),
            "left_side": left_side.to_dyadic_dict(detail_bits),
            "search": "smallest-certified-integer-monotone-bisection",
        },
    )
    _store_bound(order, "bdf", result)
    return result


def grh_bound(value: Any, *, max_bdf_bound: int = DEFAULT_MAX_BOUND) -> FactorBaseBound:
    """Return the smaller certified bound from Bach and BDF."""
    bach = bach_bound(value)
    bdf = bdf_bound(value, max_bound=max_bdf_bound)
    selected = bdf if bdf.bound < bach.bound else bach
    details = dict(selected.details)
    details["candidates"] = {
        "Bach": bach.bound,
        "Belabas--Diaz y Diaz--Friedman": bdf.bound,
    }
    return FactorBaseBound(
        selected.theorem,
        selected.assumptions,
        selected.bound,
        selected.degree,
        selected.signature,
        selected.discriminant,
        selected.precision_bits,
        selected.interval,
        details,
    )


def factor_base_bound_minkowski(value: Any) -> int:
    return minkowski_bound(value).bound


def factor_base_bound_bach(value: Any) -> int:
    return bach_bound(value).bound


def factor_base_bound_bdf(value: Any, *, max_bound: int = DEFAULT_MAX_BOUND) -> int:
    return bdf_bound(value, max_bound=max_bound).bound


def factor_base_bound_grh(value: Any, *, max_bdf_bound: int = DEFAULT_MAX_BOUND) -> int:
    return grh_bound(value, max_bdf_bound=max_bdf_bound).bound


def _encode_rows(rows: list[list[Any]]) -> tuple[tuple[tuple[int, int], ...], ...]:
    return tuple(
        tuple((int(value._numerator), int(value._denominator)) for value in row)
        for row in rows
    )


def _encode_element(value: Any) -> tuple[tuple[int, int], ...]:
    return tuple(
        (int(coefficient._numerator), int(coefficient._denominator))
        for coefficient in value.list()
    )


def _two_generator_data(prime_ideal: Any) -> dict[str, Any] | None:
    order = prime_ideal.ring()
    prime = int(prime_ideal.rational_prime())
    for element in prime_ideal.basis():
        if order.ideal(prime, element) == prime_ideal:
            return {
                "rational_prime": prime,
                "second_generator": [list(pair) for pair in _encode_element(element)],
            }
    return None


class FactorBasePrimeRecord:
    """Compact authenticated metadata for one indexed factor-base prime."""

    def __init__(
        self,
        index: int,
        prime_ideal: Any,
        *,
        second_generator: Any = None,
    ) -> None:
        if index < 0:
            raise ValueError("a factor-base index must be nonnegative")
        self.index = index
        self.prime_ideal = prime_ideal
        self.rational_prime = int(prime_ideal.rational_prime())
        self.ramification_index = int(prime_ideal.ramification_index())
        self.residue_degree = int(prime_ideal.residue_class_degree())
        self.norm = self.rational_prime**self.residue_degree
        if prime_ideal.norm() != runtime.bigint(self.norm):
            raise ArithmeticError("a factor-base prime has inconsistent exact norm")
        self.hnf_fingerprint = _encode_rows(prime_ideal._basis_rows)
        if second_generator is None:
            self.two_generator = _two_generator_data(prime_ideal)
        else:
            # The selective Dedekind--Kummer producer just constructed this
            # exact ideal as `(p, second_generator)`.  Reconstructing its HNF
            # here would duplicate the dominant materialization work.
            self.two_generator = {
                "rational_prime": self.rational_prime,
                "second_generator": [
                    list(pair) for pair in _encode_element(second_generator)
                ],
            }
        self.valuation_metadata = {
            "rational_prime_valuation": self.ramification_index,
            "ideal_norm_exponent": self.residue_degree,
            "residue_modulus_degree": self.residue_degree,
        }
        presentation = prime_ideal._require_residue_presentation()
        self.residue_modulus = tuple(int(value) for value in presentation["modulus"])
        self.automorphism_orbit = None

    def ideal(self) -> Any:
        return self.prime_ideal

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": PRIME_RECORD_SCHEMA,
            "index": self.index,
            "prime": self.rational_prime,
            "norm": self.norm,
            "e": self.ramification_index,
            "f": self.residue_degree,
            "hnf_fingerprint": [
                [list(entry) for entry in row] for row in self.hnf_fingerprint
            ],
            "two_generator": self.two_generator,
            "valuation_metadata": dict(self.valuation_metadata),
            "residue_modulus": list(self.residue_modulus),
            "automorphism_orbit": self.automorphism_orbit,
        }


def factor_base_prime_from_dict(
    order_value: Any, data: dict[str, Any]
) -> FactorBasePrimeRecord:
    """Authenticate and restore one canonical factor-base record."""
    if data.get("schema") != PRIME_RECORD_SCHEMA:
        raise ValueError("unsupported factor-base prime schema")
    order = _as_maximal_order(order_value)
    prime = _prime_ideals._normalize_prime(int(data["prime"]))
    residue_degree = int(data["f"])
    if residue_degree < 1 or residue_degree > order.degree():
        raise ValueError("factor-base residue degree is out of range")
    fingerprint = tuple(
        tuple((int(entry[0]), int(entry[1])) for entry in row)
        for row in data["hnf_fingerprint"]
    )
    selected = _selective_dedekind_kummer(order, prime, {residue_degree})
    if selected is None:
        decomposition = _prime_ideals.factor_rational_prime(order, prime)
        candidates = [
            (prime_ideal, None) for prime_ideal in decomposition.prime_ideals()
        ]
    else:
        candidates = selected
    for prime_ideal, _producer_generator in candidates:
        if _encode_rows(prime_ideal._basis_rows) == fingerprint:
            two_generator = data.get("two_generator")
            second_generator = None
            if two_generator is not None:
                if int(two_generator.get("rational_prime", 0)) != prime:
                    raise ValueError("two-generator metadata has the wrong prime")
                rows = _prime_ideals._decode_rows([two_generator["second_generator"]])
                second_generator = _prime_ideals._nf_element_from_row(
                    order.number_field(), rows[0]
                )
                if order.ideal(prime, second_generator) != prime_ideal:
                    raise ValueError(
                        "two-generator metadata does not reproduce the prime ideal"
                    )
            record = FactorBasePrimeRecord(
                int(data["index"]),
                prime_ideal,
                second_generator=second_generator,
            )
            if record.to_dict() != data:
                raise ValueError("factor-base prime metadata failed authentication")
            return record
    raise ValueError("factor-base fingerprint is not a prime above the stated p")


class FactorBasePlan:
    """Immutable preflight policy for one bounded factor-base construction."""

    def __init__(
        self,
        order: Any,
        bound_result: FactorBaseBound,
        max_bound: int,
        max_rational_primes: int,
        max_prime_ideals: int,
        max_memory_bytes: int,
    ) -> None:
        self.order = order
        self.bound_result = bound_result
        self.theorem = bound_result.theorem
        self.assumptions = bound_result.assumptions
        self.bound = bound_result.bound
        self.degree = bound_result.degree
        self.max_bound = max_bound
        self.max_rational_primes = max_rational_primes
        self.max_prime_ideals = max_prime_ideals
        self.max_memory_bytes = max_memory_bytes
        self._descriptor_cache: Any = None
        self._factor_base_cache: Any = None
        self._selected_prime_cache: dict[int, dict[int, list[tuple[Any, Any]]]] = {}
        self._record_cache: dict[tuple[int, int, int, int], Any] = {}
        maximum_degree = 0 if self.bound < 2 else self.bound.bit_length() - 1
        self.degree_filters = tuple(range(1, min(self.degree, maximum_degree) + 1))
        # There is one even prime and every other rational prime is odd.  This
        # elementary bound is exact enough for portable preflight policy and
        # halves the former all-integers estimate without a sieve allocation.
        self.estimated_rational_primes = 0 if self.bound < 2 else (self.bound + 1) // 2
        self.estimated_prime_ideals = self.degree * self.estimated_rational_primes
        bytes_per_record = 192 + 32 * self.degree * self.degree
        self.estimated_memory_bytes = self.estimated_prime_ideals * bytes_per_record
        failures = []
        if self.bound > self.max_bound:
            failures.append("bound")
        if self.estimated_rational_primes > self.max_rational_primes:
            failures.append("rational-primes")
        if self.estimated_prime_ideals > self.max_prime_ideals:
            failures.append("prime-ideals")
        if self.estimated_memory_bytes > self.max_memory_bytes:
            failures.append("memory")
        self.cap_failures = tuple(failures)
        self.fits_caps = not failures

    def require_feasible(self) -> None:
        if not self.fits_caps:
            raise ValueError(
                "factor-base plan exceeds caps: " + ", ".join(self.cap_failures)
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": PLAN_SCHEMA,
            "bound": self.bound_result.to_dict(),
            "degree_filters": list(self.degree_filters),
            "estimates": {
                "rational_primes_upper_bound": self.estimated_rational_primes,
                "prime_ideals_upper_bound": self.estimated_prime_ideals,
                "memory_bytes_upper_bound": self.estimated_memory_bytes,
            },
            "caps": {
                "max_bound": self.max_bound,
                "max_rational_primes": self.max_rational_primes,
                "max_prime_ideals": self.max_prime_ideals,
                "max_memory_bytes": self.max_memory_bytes,
            },
            "fits_caps": self.fits_caps,
            "cap_failures": list(self.cap_failures),
        }

    def progress(self) -> dict[str, Any]:
        """Return immutable planning/construction progress metadata."""
        descriptors = self._descriptor_cache
        factor_base = self._factor_base_cache
        rational_primes = None
        prime_ideals = None
        if descriptors is not None:
            rational_primes = len({descriptor[1] for descriptor in descriptors})
            prime_ideals = len(descriptors)
        return {
            "schema": "sagejs.number-fields/factor-base-progress-v1",
            "bound": self.bound,
            "splitting_scan_complete": descriptors is not None,
            "factor_base_complete": factor_base is not None,
            "eligible_rational_primes": rational_primes,
            "eligible_prime_ideals": prime_ideals,
            "materialized_prime_ideals": (
                len(factor_base) if factor_base is not None else len(self._record_cache)
            ),
        }


def factor_base_plan(
    value: Any,
    *,
    proof: bool = True,
    theorem: str = "auto",
    max_bound: int = DEFAULT_MAX_BOUND,
    max_rational_primes: int = DEFAULT_MAX_RATIONAL_PRIMES,
    max_prime_ideals: int = DEFAULT_MAX_PRIME_IDEALS,
    max_memory_bytes: int = DEFAULT_MAX_MEMORY_BYTES,
) -> FactorBasePlan:
    """Plan an unconditional or GRH-conditional class-group factor base."""
    order = _as_maximal_order(value)
    selected = theorem.lower()
    if selected == "auto":
        selected = "minkowski" if proof else "grh"
    if selected == "minkowski":
        bound_result = minkowski_bound(order)
    elif selected == "bach":
        bound_result = bach_bound(order)
    elif selected in ("bdf", "belabas-diaz-friedman"):
        bound_result = bdf_bound(order, max_bound=max_bound)
    elif selected == "grh":
        bound_result = grh_bound(order, max_bdf_bound=max_bound)
    else:
        raise ValueError("unknown factor-base theorem: " + theorem)
    if proof and bound_result.assumptions:
        raise ValueError("proof=True requires the unconditional Minkowski theorem")
    return FactorBasePlan(
        order,
        bound_result,
        max_bound,
        max_rational_primes,
        max_prime_ideals,
        max_memory_bytes,
    )


def _eligible_descriptors(plan: FactorBasePlan) -> list[tuple[int, int, int, int]]:
    """Return `(norm,p,f,occurrence)` descriptors without ideal lattices."""
    if plan._descriptor_cache is not None:
        return list(plan._descriptor_cache)
    if plan.bound < 2:
        plan._descriptor_cache = ()
        return []
    descriptors: list[tuple[int, int, int, int]] = []
    for splitting in _prime_ideals.splitting_records(plan.order, 2, plan.bound + 1):
        prime = int(splitting["prime"])
        occurrences: dict[int, int] = {}
        for factor in splitting["factors"]:
            residue_degree = int(factor["f"])
            occurrence = occurrences.get(residue_degree, 0)
            occurrences[residue_degree] = occurrence + 1
            norm = prime**residue_degree
            if norm <= plan.bound:
                descriptors.append((norm, prime, residue_degree, occurrence))
    descriptors.sort()
    plan._descriptor_cache = tuple(descriptors)
    return descriptors


def _selective_dedekind_kummer(
    order: Any,
    prime: int,
    residue_degrees: set[int],
) -> list[tuple[Any, Any]] | None:
    """Construct only requested Dedekind--Kummer prime ideals above `p`.

    This route is used only when the equation order is certified `p`-maximal.
    At index-dividing primes the caller falls back to the complete finite
    algebra decomposition and its independent product certificate.
    """
    field = order.number_field()
    maximal = _prime_ideals._maximal
    if not maximal.equation_order_is_p_maximal(field, prime):
        return None
    polynomial = maximal.integral_equation_polynomial(field)
    coefficients = tuple(int(value) for value in polynomial.list())
    modular_factors = _prime_ideals._om.factor_mod_prime(coefficients, prime)
    scale = runtime.integer_bigint(field._integral_equation_scale_cache)
    beta = field.gen() * scale
    selected: list[tuple[Any, Any]] = []
    for factor in modular_factors:
        residue_degree = len(factor.polynomial) - 1
        if residue_degree not in residue_degrees:
            continue
        second_generator = field.zero()
        for coefficient in reversed(factor.polynomial):
            second_generator = second_generator * beta + int(coefficient)
        ideal = order.ideal(prime, second_generator)
        prime_ideal = _prime_ideals._prime_from_ideal(
            ideal,
            prime,
            int(factor.multiplicity),
            residue_degree,
        )
        selected.append((prime_ideal, second_generator))
    selected.sort(key=lambda pair: _prime_ideals._prime_sort_key(pair[0]))
    return selected


def prime_ideal_norm_stream(plan: FactorBasePlan) -> Iterator[FactorBasePrimeRecord]:
    """Stream authenticated factor-base primes in deterministic norm order."""
    plan.require_feasible()
    if plan._factor_base_cache is not None:
        yield from plan._factor_base_cache
        return
    descriptors = _eligible_descriptors(plan)
    if len(descriptors) > plan.max_prime_ideals:
        raise ValueError("exact factor-base size exceeds max_prime_ideals")
    grouped = plan._selected_prime_cache
    for index, descriptor in enumerate(descriptors):
        cached_record = plan._record_cache.get(descriptor)
        if cached_record is not None:
            yield cached_record
            continue
        _norm, prime, residue_degree, occurrence = descriptor
        if prime not in grouped:
            requested_degrees = {
                candidate[2] for candidate in descriptors if candidate[1] == prime
            }
            selected = _selective_dedekind_kummer(plan.order, prime, requested_degrees)
            if selected is None:
                # `splitting_records` computes and caches the complete
                # decomposition at every index-dividing prime.  Reuse that
                # certified object instead of entering the public producer a
                # second time.
                decomposition = _prime_ideals._cache_get(plan.order, prime)
                if decomposition is None:
                    decomposition = _prime_ideals.factor_rational_prime(
                        plan.order, prime
                    )
                selected = [
                    (prime_ideal, None)
                    for prime_ideal in decomposition.prime_ideals()
                    if int(prime_ideal.residue_class_degree()) in requested_degrees
                ]
            by_degree: dict[int, list[tuple[Any, Any]]] = {}
            for prime_ideal, second_generator in selected:
                degree = int(prime_ideal.residue_class_degree())
                by_degree.setdefault(degree, []).append((prime_ideal, second_generator))
            grouped[prime] = by_degree
        candidates = grouped[prime].get(residue_degree, [])
        if occurrence >= len(candidates):
            raise ArithmeticError("compact splitting data disagrees with exact ideals")
        prime_ideal, second_generator = candidates[occurrence]
        record = FactorBasePrimeRecord(
            index,
            prime_ideal,
            second_generator=second_generator,
        )
        if record.norm != descriptor[0]:
            raise ArithmeticError("factor-base norm descriptor failed replay")
        plan._record_cache[descriptor] = record
        yield record


def build_factor_base(plan: FactorBasePlan) -> tuple[FactorBasePrimeRecord, ...]:
    """Materialize one planned compact factor base after cap validation."""
    if plan._factor_base_cache is not None:
        return plan._factor_base_cache
    records = tuple(prime_ideal_norm_stream(plan))
    estimated_record_bytes = 192 + 32 * plan.degree * plan.degree
    if len(records) * estimated_record_bytes > plan.max_memory_bytes:
        raise ValueError("exact factor-base records exceed max_memory_bytes")
    plan._factor_base_cache = records
    return records


__all__ = [
    "BOUND_SCHEMA",
    "PLAN_SCHEMA",
    "PRIME_RECORD_SCHEMA",
    "FactorBaseBound",
    "FactorBasePlan",
    "FactorBasePrimeRecord",
    "bach_bound",
    "bdf_bound",
    "build_factor_base",
    "factor_base_bound_bach",
    "factor_base_bound_bdf",
    "factor_base_bound_grh",
    "factor_base_bound_minkowski",
    "factor_base_plan",
    "factor_base_prime_from_dict",
    "grh_bound",
    "minkowski_bound",
    "prime_ideal_norm_stream",
]
